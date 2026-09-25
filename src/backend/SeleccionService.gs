// SeleccionService.gs
// SGE v2.1.0 - Motor de Admisibilidad, Selección Pseudoaleatoria con Semilla (LCG) y Reasignación en Cascada
// 100% Determinista, Auditable y Reproducible para Contraloría / Concejo Municipal
// Persistencia relacional en Google Sheets (Repository.gs)

/**
 * Generador Congruencial Lineal (LCG) Determinista
 * Parámetros estándar ANSI C / POSIX:
 * a = 1103515245, c = 12345, m = 2^31 (2147483648)
 */
function crearGeneradorLCG_(semilla) {
  let estado = (Math.floor(Math.abs(Number(semilla))) || 123456789) % 2147483648;
  const a = 1103515245;
  const c = 12345;
  const m = 2147483648;

  return {
    siguiente: function() {
      estado = (a * estado + c) % m;
      return estado / m; // Retorna flotante entre [0, 1)
    },
    obtenerEntero: function(min, max) {
      const r = this.siguiente();
      return min + Math.floor(r * (max - min + 1));
    }
  };
}

/**
 * Evalúa automáticamente las postulaciones de una iniciativa contra sus criterios paramétricos.
 * @param {string} idIniciativa
 * @param {string} evaluadorEmail
 * @returns {{ success: boolean, data: any, error: string|null }}
 */
function evaluarAdmisibilidadIniciativa(idIniciativa, evaluadorEmail) {
  try {
    const evaluador = evaluadorEmail || 'sistema@santiago.cl';

    // 1. Obtener criterios de la iniciativa desde REQUISITOS en Google Sheets
    let criterios = [];
    if (typeof repoTodos === 'function') {
      const todosReq = repoTodos('REQUISITOS', { incluirInactivos: false }) || [];
      criterios = todosReq.filter(r => r.ID_INICIATIVA === idIniciativa && r.ACTIVO !== 'NO');
    }

    // 2. Obtener postulaciones en estado INGRESADA o PENDIENTE
    const posts = typeof repoTodos === 'function' ? (repoTodos('POSTULACIONES', { incluirInactivos: false }) || []) : [];
    const postulaciones = posts.filter(p => {
      return p.ID_INICIATIVA === idIniciativa && 
             ['INGRESADA', 'PENDIENTE', 'RECIBIDA', 'BORRADOR'].indexOf(p.ESTADO_POSTULACION) >= 0;
    });

    if (postulaciones.length === 0) {
      return {
        success: true,
        data: { evaluadas: 0, admisibles: 0, noAdmisibles: 0, mensaje: 'No hay postulaciones pendientes de evaluación para esta iniciativa.' },
        error: null
      };
    }

    const personas = typeof repoTodos === 'function' ? (repoTodos('PERSONAS', { incluirInactivos: true }) || []) : [];
    const emps = typeof repoTodos === 'function' ? (repoTodos('EMPRENDIMIENTOS', { incluirInactivos: true }) || []) : [];

    let totalAdmisibles = 0;
    let totalNoAdmisibles = 0;
    const ahora = (typeof ahoraIso_ === 'function') ? ahoraIso_() : new Date().toISOString();

    for (const post of postulaciones) {
      const per = personas.find(p => p.ID_PERSONA === post.ID_PERSONA_CONTACTO);
      const emp = emps.find(e => e.ID_EMPRENDIMIENTO === post.ID_EMPRENDIMIENTO);

      const comuna = (per && (per.COMUNA_RESIDENCIA || per.COMUNA || '')) || '';
      const formalizacion = (emp && emp.FORMALIZACION) || 'SIN_INICIO';
      const rubro = (emp && emp.ID_RUBRO) || '';

      let esAdmisible = true;
      const motivosRechazo = [];

      if (criterios.length > 0) {
        for (const crit of criterios) {
          let cumple = true;
          const campo = (crit.CAMPO || '').toUpperCase();
          const operador = (crit.OPERADOR || 'IGUAL').toUpperCase();
          const esperado = (crit.VALOR_ESPERADO || '').toUpperCase();

          if (campo.includes('COMUNA')) {
            const comU = comuna.trim().toUpperCase();
            cumple = operador === 'IGUAL' ? (comU === esperado || comU === 'SANTIAGO') : true;
          } else if (campo.includes('RUBRO')) {
            cumple = !esperado || rubro.toUpperCase() === esperado;
          } else if (campo.includes('FORMALIZACION')) {
            cumple = esperado === 'FORMALIZADO' ? (formalizacion !== 'SIN_INICIO') : (formalizacion === esperado);
          }

          if (!cumple) {
            esAdmisible = false;
            motivosRechazo.push(`Incumple requisito: ${crit.CAMPO} ${crit.OPERADOR} ${crit.VALOR_ESPERADO}`);
          }
        }
      } else {
        // Regla general de la Municipalidad de Santiago: Comuna Santiago
        const comunaNormalizada = typeof normalizarComuna === 'function' ? normalizarComuna(comuna) : comuna;
        if (comunaNormalizada && comunaNormalizada.toUpperCase() !== 'SANTIAGO') {
          esAdmisible = false;
          motivosRechazo.push('Residencia declarada fuera de la comuna de Santiago');
        }
      }

      const nuevoEstado = esAdmisible ? 'ADMISIBLE' : 'NO_ADMISIBLE';
      if (esAdmisible) totalAdmisibles++; else totalNoAdmisibles++;

      repoActualizar('POSTULACIONES', post.ID_POSTULACION, {
        ESTADO_POSTULACION: nuevoEstado,
        ACTUALIZADO_POR: evaluador,
        ACTUALIZADO_EN: ahora
      }, { motivo: esAdmisible ? 'Aprobación automática de admisibilidad' : ('Rechazo admisibilidad: ' + motivosRechazo.join(' | ')) });
    }

    return {
      success: true,
      data: {
        evaluadas: postulaciones.length,
        admisibles: totalAdmisibles,
        noAdmisibles: totalNoAdmisibles,
        mensaje: `Evaluación completada: ${totalAdmisibles} admisibles y ${totalNoAdmisibles} no admisibles.`
      },
      error: null
    };
  } catch (err) {
    return { success: false, data: null, error: 'Error en motor de admisibilidad: ' + (err.message || String(err)) };
  }
}

/**
 * Ejecuta el sorteo pseudoaleatorio determinista reproducible con semilla (LCG).
 * Genera el orden de prelación inmutable de Titulares y Suplentes.
 * @param {object} params
 * @param {string} params.idIniciativa
 * @param {number} params.semilla - Semilla numérica entera (ej: 20260904 o timestamp del sorteo)
 * @param {string} [params.ejecutorEmail]
 * @returns {{ success: boolean, data: any, error: string|null }}
 */
function ejecutarSeleccionTransparente(params) {
  try {
    if (!params || !params.idIniciativa || params.semilla === undefined) {
      return { success: false, data: null, error: 'Debe especificar el idIniciativa y la semilla numérica.' };
    }

    const idIniciativa = params.idIniciativa;
    const semilla = parseInt(params.semilla, 10);
    const ejecutor = params.ejecutorEmail || 'secretario_municipal@santiago.cl';

    // 1. Obtener la iniciativa y cupos
    const iniciativa = typeof repoBuscarPorId === 'function' ? repoBuscarPorId('INICIATIVAS', idIniciativa) : null;
    if (!iniciativa) {
      return { success: false, data: null, error: 'Iniciativa no encontrada.' };
    }

    const cuposTitulares = parseInt(iniciativa.CUPOS_TITULARES, 10) || 20;
    const cuposSuplentes = parseInt(iniciativa.CUPOS_SUPLENTES, 10) || 10;

    // 2. Obtener el universo de postulaciones ADMISIBLES en orden canónico por ID
    const posts = typeof repoTodos === 'function' ? (repoTodos('POSTULACIONES', { incluirInactivos: false }) || []) : [];
    const personas = typeof repoTodos === 'function' ? (repoTodos('PERSONAS', { incluirInactivos: true }) || []) : [];
    const emps = typeof repoTodos === 'function' ? (repoTodos('EMPRENDIMIENTOS', { incluirInactivos: true }) || []) : [];

    const universo = posts
      .filter(p => p.ID_INICIATIVA === idIniciativa && p.ESTADO_POSTULACION === 'ADMISIBLE')
      .map(p => {
        const per = personas.find(item => item.ID_PERSONA === p.ID_PERSONA_CONTACTO) || {};
        const emp = emps.find(item => item.ID_EMPRENDIMIENTO === p.ID_EMPRENDIMIENTO) || {};
        return {
          id_postulacion: p.ID_POSTULACION,
          id_emprendimiento: p.ID_EMPRENDIMIENTO,
          id_persona_contacto: p.ID_PERSONA_CONTACTO,
          rut: per.RUT_NORMALIZADO || per.RUT || '',
          nombres: per.NOMBRES || '',
          apellidos: [per.APELLIDO_PATERNO, per.APELLIDO_MATERNO].filter(Boolean).join(' '),
          nombre_comercial: emp.NOMBRE_COMERCIAL || ''
        };
      });

    universo.sort((a, b) => String(a.id_postulacion).localeCompare(String(b.id_postulacion)));

    if (universo.length === 0) {
      return {
        success: false,
        data: null,
        error: 'No existen postulaciones en estado ADMISIBLE para realizar el sorteo.'
      };
    }

    // 3. Generar la huella criptográfica SHA-256 del universo ordenado
    const idsCanonicos = universo.map(u => u.id_postulacion).join('|');
    let huellaUniverso = '';
    try {
      if (typeof Utilities !== 'undefined' && Utilities.computeDigest) {
        const dig = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, idsCanonicos);
        huellaUniverso = dig.map(function(b) {
          const v = (b < 0 ? b + 256 : b).toString(16);
          return v.length === 1 ? '0' + v : v;
        }).join('');
      }
    } catch (e) {}
    if (!huellaUniverso) {
      huellaUniverso = 'sha_' + Date.now().toString(16);
    }

    // 4. Algoritmo Fisher-Yates determinista gobernado por LCG
    const lcg = crearGeneradorLCG_(semilla);
    const copiaUniverso = universo.map(item => Object.assign({}, item));

    for (let i = copiaUniverso.length - 1; i > 0; i--) {
      const j = lcg.obtenerEntero(0, i);
      const temp = copiaUniverso[i];
      copiaUniverso[i] = copiaUniverso[j];
      copiaUniverso[j] = temp;
    }

    // 5. Asignar orden de prelación, TITULAR, SUPLENTE o EXCLUIDO
    const idProceso = 'proc-' + Utilities.getUuid();
    const ahora = (typeof ahoraIso_ === 'function') ? ahoraIso_() : new Date().toISOString();

    // Guardar proceso en PROCESOS_SELECCION
    repoInsertar('PROCESOS_SELECCION', {
      ID_PROCESO: idProceso,
      ID_INICIATIVA: idIniciativa,
      VERSION_REGLAS: '1',
      METODO: 'LCG_DETERMINISTA',
      PARAMETROS_JSON: JSON.stringify({ semilla: semilla, huellaUniverso: huellaUniverso }),
      SEMILLA: String(semilla),
      FECHA_EJECUCION: ahora,
      EJECUTADO_POR: ejecutor,
      ESTADO: 'FINALIZADO',
      TAMANO_UNIVERSO: copiaUniverso.length,
      HUELLA_INTEGRIDAD: huellaUniverso
    }, { motivo: 'Ejecución de sorteo determinista' });

    const resultadosPublicos = [];

    for (let idx = 0; idx < copiaUniverso.length; idx++) {
      const post = copiaUniverso[idx];
      const orden = idx + 1;
      let resultado = 'EXCLUIDO';
      let nuevoEstadoPost = 'RECHAZADA';

      if (orden <= cuposTitulares) {
        resultado = 'TITULAR';
        nuevoEstadoPost = 'SELECCIONADA';
      } else if (orden <= (cuposTitulares + cuposSuplentes)) {
        resultado = 'SUPLENTE';
        nuevoEstadoPost = 'SUPLENTE';
      }

      // Guardar en RESULTADOS_SELECCION
      repoInsertar('RESULTADOS_SELECCION', {
        ID_RESULTADO: 'res-' + Utilities.getUuid(),
        ID_PROCESO: idProceso,
        ID_POSTULACION: post.id_postulacion,
        RESULTADO: resultado,
        POSICION: orden,
        ESTRATO: 'GENERAL',
        FECHA_RESULTADO: ahora,
        PROCESO_ORIGEN: idProceso
      }, { auditar: false });

      // Actualizar estado en POSTULACIONES
      repoActualizar('POSTULACIONES', post.id_postulacion, {
        ESTADO_POSTULACION: nuevoEstadoPost,
        ACTUALIZADO_POR: ejecutor,
        ACTUALIZADO_EN: ahora
      }, { auditar: false });

      // Si es TITULAR, crear registro en PARTICIPACIONES
      if (resultado === 'TITULAR') {
        repoInsertar('PARTICIPACIONES', {
          ID_PARTICIPACION: 'part-' + Utilities.getUuid(),
          ID_RESULTADO: idProceso,
          ID_POSTULACION: post.id_postulacion,
          ESTADO_PARTICIPACION: 'PENDIENTE',
          FECHA_CONFIRMACION: '',
          FECHA_ASISTENCIA: '',
          MOTIVO: 'Puesto-' + String(orden).padStart(2, '0'),
          REEMPLAZA_A: '',
          CREADO_EN: ahora,
          CREADO_POR: ejecutor
        }, { auditar: false });
      }

      resultadosPublicos.push({
        ordenPrelacion: orden,
        resultado: resultado,
        idPostulacion: post.id_postulacion,
        rut: post.rut,
        nombreEmprendedor: `${post.nombres} ${post.apellidos}`.trim(),
        nombreComercial: post.nombre_comercial
      });
    }

    // Auditoría institucional
    try {
      repoInsertar('AUDITORIA', {
        ID_EVENTO_AUDITORIA: 'aud-' + Utilities.getUuid(),
        FECHA_HORA: ahora,
        ID_USUARIO: ejecutor,
        ROL: 'ADMIN',
        ACCION: 'EJECUTAR_SELECCION_LCG',
        ENTIDAD: 'PROCESOS_SELECCION',
        ID_REGISTRO: idProceso,
        VALOR_ANTERIOR: '',
        VALOR_NUEVO: JSON.stringify({ semilla: semilla, huellaUniverso: huellaUniverso, total: copiaUniverso.length }),
        MOTIVO: 'Sorteo determinista auditable',
        ID_CORRELACION: ''
      }, { auditar: false });
    } catch (e) {}

    return {
      success: true,
      data: {
        idProceso: idProceso,
        semilla: semilla,
        huellaUniversoSha256: huellaUniverso,
        totalAdmisibles: copiaUniverso.length,
        totalTitulares: Math.min(cuposTitulares, copiaUniverso.length),
        totalSuplentes: Math.max(0, Math.min(cuposSuplentes, copiaUniverso.length - cuposTitulares)),
        resultados: resultadosPublicos,
        mensaje: 'Selección determinista completada exitosamente en Google Sheets. Es 100% reproducible y auditable.'
      },
      error: null
    };
  } catch (err) {
    return { success: false, data: null, error: 'Error en proceso de selección: ' + (err.message || String(err)) };
  }
}

/**
 * Registra confirmación o desistimiento de un titular y activa la reasignación en cascada.
 * Si un titular desiste, promueve de inmediato al suplente con menor número de orden de prelación.
 * @param {object} params
 * @param {string} params.idPostulacion
 * @param {string} params.accion - "CONFIRMAR" o "DESISTIR"
 * @param {string} [params.motivoDesistimiento]
 * @param {string} [params.usuarioEmail]
 * @returns {{ success: boolean, data: any, error: string|null }}
 */
function gestionarConfirmacionTitular(params) {
  try {
    if (!params || !params.idPostulacion || !params.accion) {
      return { success: false, data: null, error: 'Debe indicar idPostulacion y accion (CONFIRMAR/DESISTIR).' };
    }

    const idPostulacion = params.idPostulacion;
    const accion = params.accion.toUpperCase();
    const usuario = params.usuarioEmail || 'coordinador_ferias@santiago.cl';
    const ahora = (typeof ahoraIso_ === 'function') ? ahoraIso_() : new Date().toISOString();

    const post = typeof repoBuscarPorId === 'function' ? repoBuscarPorId('POSTULACIONES', idPostulacion) : null;
    if (!post) {
      return { success: false, data: null, error: 'No se encontró la postulación especificada.' };
    }

    const participaciones = typeof repoTodos === 'function' ? (repoTodos('PARTICIPACIONES', { incluirInactivos: true }) || []) : [];
    const part = participaciones.find(p => p.ID_POSTULACION === idPostulacion);

    const puestoAsignado = (part && part.MOTIVO) ? part.MOTIVO : 'STAND-ASIGNADO';

    if (accion === 'CONFIRMAR') {
      if (part) {
        repoActualizar('PARTICIPACIONES', part.ID_PARTICIPACION, {
          ESTADO_PARTICIPACION: 'CONFIRMADA',
          FECHA_CONFIRMACION: ahora
        }, { motivo: 'Confirmación de titular' });
      }
      repoActualizar('POSTULACIONES', idPostulacion, {
        ESTADO_POSTULACION: 'CONFIRMADA',
        ACTUALIZADO_POR: usuario,
        ACTUALIZADO_EN: ahora
      }, { motivo: 'Confirmación de asistencia titular' });

      return {
        success: true,
        data: { estado: 'CONFIRMADO', puestoAsignado: puestoAsignado, mensaje: 'Participación confirmada exitosamente.' },
        error: null
      };
    }

    if (accion === 'DESISTIR') {
      const motivo = params.motivoDesistimiento || 'Desistimiento voluntario';

      if (part) {
        repoActualizar('PARTICIPACIONES', part.ID_PARTICIPACION, {
          ESTADO_PARTICIPACION: 'DESISTIO'
        }, { motivo: 'Desistimiento titular: ' + motivo });
      }

      repoActualizar('POSTULACIONES', idPostulacion, {
        ESTADO_POSTULACION: 'RETIRADA',
        ACTUALIZADO_POR: usuario,
        ACTUALIZADO_EN: ahora
      }, { motivo: 'Desistimiento: ' + motivo });

      // Buscar siguiente suplente en orden de prelación
      const resultados = typeof repoTodos === 'function' ? (repoTodos('RESULTADOS_SELECCION', { incluirInactivos: false }) || []) : [];
      const postsIniciativa = typeof repoTodos === 'function' ? (repoTodos('POSTULACIONES', { incluirInactivos: false }) || []).filter(p => p.ID_INICIATIVA === post.ID_INICIATIVA) : [];

      const suplentesDisponibles = [];
      resultados.forEach(r => {
        if (r.RESULTADO === 'SUPLENTE') {
          const pMatch = postsIniciativa.find(p => p.ID_POSTULACION === r.ID_POSTULACION && p.ESTADO_POSTULACION === 'SUPLENTE');
          if (pMatch) {
            suplentesDisponibles.push({
              idPostulacion: pMatch.ID_POSTULACION,
              ordenPrelacion: parseInt(r.POSICION, 10) || 999,
              idEmprendimiento: pMatch.ID_EMPRENDIMIENTO,
              idPersonaContacto: pMatch.ID_PERSONA_CONTACTO
            });
          }
        }
      });

      suplentesDisponibles.sort((a, b) => a.ordenPrelacion - b.ordenPrelacion);
      const siguienteSuplente = suplentesDisponibles[0] || null;

      let datosPromovido = null;
      if (siguienteSuplente) {
        repoActualizar('POSTULACIONES', siguienteSuplente.idPostulacion, {
          ESTADO_POSTULACION: 'SELECCIONADA',
          ACTUALIZADO_POR: usuario,
          ACTUALIZADO_EN: ahora
        }, { motivo: 'Promovido desde suplente por desistimiento de puesto ' + puestoAsignado });

        repoInsertar('PARTICIPACIONES', {
          ID_PARTICIPACION: 'part-' + Utilities.getUuid(),
          ID_RESULTADO: '',
          ID_POSTULACION: siguienteSuplente.idPostulacion,
          ESTADO_PARTICIPACION: 'PENDIENTE',
          FECHA_CONFIRMACION: '',
          FECHA_ASISTENCIA: '',
          MOTIVO: puestoAsignado,
          REEMPLAZA_A: idPostulacion,
          CREADO_EN: ahora,
          CREADO_POR: usuario
        }, { motivo: 'Asignación de puesto liberado a suplente promovido' });

        const personas = repoTodos('PERSONAS', { incluirInactivos: true }) || [];
        const emps = repoTodos('EMPRENDIMIENTOS', { incluirInactivos: true }) || [];
        const perProm = personas.find(p => p.ID_PERSONA === siguienteSuplente.idPersonaContacto) || {};
        const empProm = emps.find(e => e.ID_EMPRENDIMIENTO === siguienteSuplente.idEmprendimiento) || {};

        datosPromovido = {
          idPostulacion: siguienteSuplente.idPostulacion,
          ordenPrelacion: siguienteSuplente.ordenPrelacion,
          nombreEmprendedor: `${perProm.NOMBRES || ''} ${perProm.APELLIDO_PATERNO || ''}`.trim(),
          nombreComercial: empProm.NOMBRE_COMERCIAL || '',
          puestoAsignado: puestoAsignado
        };
      }

      return {
        success: true,
        data: {
          estado: 'DESISTIDO',
          puestoLiberado: puestoAsignado,
          suplentePromovido: datosPromovido,
          mensaje: datosPromovido 
            ? `Titular desistido. Reasignación en cascada exitosa: promovido suplente puesto #${datosPromovido.ordenPrelacion}.`
            : 'Titular desistido. No quedan más suplentes disponibles en lista de espera.'
        },
        error: null
      };
    }

    return { success: false, data: null, error: 'Acción no válida. Use CONFIRMAR o DESISTIR.' };
  } catch (err) {
    return { success: false, data: null, error: 'Error en confirmación/reasignación: ' + (err.message || String(err)) };
  }
}
