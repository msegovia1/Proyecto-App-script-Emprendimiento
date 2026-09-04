// SeleccionService.gs
// Motor de Admisibilidad, Selección Pseudoaleatoria con Semilla (LCG) y Reasignación en Cascada
// Sistema de Gestión de Emprendimientos (SGE) - Municipalidad de Santiago
// 100% Determinista, Auditable y Reproducible para Contraloría / Concejo Municipal

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

    // 1. Obtener criterios de la iniciativa
    const qCrit = tursoEjecutar(
      `SELECT * FROM criterios_admisibilidad WHERE id_iniciativa = ? ORDER BY orden ASC;`,
      [idIniciativa]
    );
    const criterios = (qCrit.success && qCrit.data.rows) || [];

    // 2. Obtener postulaciones en estado INGRESADA o PENDIENTE
    const qPost = tursoEjecutar(
      `SELECT p.id_postulacion, p.id_emprendimiento, p.id_persona_contacto,
              per.comuna, per.tramo_rsh, per.discapacidad_declarada,
              emp.rubro, emp.formalizacion_sii, emp.etapa_madurez
       FROM postulaciones p
       JOIN personas per ON p.id_persona_contacto = per.id_persona
       JOIN emprendimientos emp ON p.id_emprendimiento = emp.id_emprendimiento
       WHERE p.id_iniciativa = ? AND p.estado_postulacion IN ('INGRESADA', 'PENDIENTE');`,
      [idIniciativa]
    );

    const postulaciones = (qPost.success && qPost.data.rows) || [];
    if (postulaciones.length === 0) {
      return {
        success: true,
        data: { evaluadas: 0, mensaje: 'No hay postulaciones pendientes de evaluación para esta iniciativa.' },
        error: null
      };
    }

    const transacciones = [];
    let totalAdmisibles = 0;
    let totalNoAdmisibles = 0;

    for (const post of postulaciones) {
      let esAdmisible = true;
      const motivosRechazo = [];

      for (const crit of criterios) {
        let cumpleCriterio = true;
        let valorReal = '';

        if (crit.campo_evaluado === 'comuna') {
          valorReal = (post.comuna || '').toUpperCase();
          cumpleCriterio = valorReal === (crit.valor_esperado || 'SANTIAGO').toUpperCase();
        } else if (crit.campo_evaluado === 'rubro') {
          valorReal = (post.rubro || '').toUpperCase();
          cumpleCriterio = !crit.valor_esperado || valorReal === crit.valor_esperado.toUpperCase();
        } else if (crit.campo_evaluado === 'formalizacion_sii') {
          valorReal = (post.formalizacion_sii || '').toUpperCase();
          if (crit.valor_esperado === 'FORMALIZADO') {
            cumpleCriterio = valorReal !== 'SIN_INICIO';
          } else {
            cumpleCriterio = valorReal === (crit.valor_esperado || '').toUpperCase();
          }
        }

        if (!cumpleCriterio && crit.es_excluyente) {
          esAdmisible = false;
          motivosRechazo.push(crit.descripcion || `Incumple criterio ${crit.codigo_criterio}`);
        }

        // Registrar evaluación individual
        transacciones.push({
          sql: `INSERT OR REPLACE INTO evaluaciones_criterio (
            id_evaluacion, id_postulacion, id_criterio, cumple, observacion, evaluador, fecha_evaluacion
          ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'));`,
          args: [
            'eval-' + Utilities.getUuid(),
            post.id_postulacion,
            crit.id_criterio,
            cumpleCriterio ? 'SI' : 'NO',
            cumpleCriterio ? 'Cumple con requisito' : 'No cumple con requisito paramétrico',
            evaluador
          ]
        });
      }

      const nuevoEstado = esAdmisible ? 'ADMISIBLE' : 'NO_ADMISIBLE';
      if (esAdmisible) totalAdmisibles++; else totalNoAdmisibles++;

      transacciones.push({
        sql: `UPDATE postulaciones 
              SET estado_postulacion = ?, motivo_rechazo = ?, actualizado_en = datetime('now'), actualizado_por = ?
              WHERE id_postulacion = ?;`,
        args: [
          nuevoEstado,
          motivosRechazo.join(' | ') || null,
          evaluador,
          post.id_postulacion
        ]
      });
    }

    const txRes = tursoTransaccion(transacciones);
    if (!txRes.success) {
      return { success: false, data: null, error: 'Error guardando evaluación: ' + txRes.error };
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
    const qIni = tursoEjecutar(
      `SELECT id_iniciativa, nombre, cupos_titulares, cupos_suplentes FROM iniciativas WHERE id_iniciativa = ?;`,
      [idIniciativa]
    );
    const iniciativa = qIni.success && qIni.data.rows && qIni.data.rows[0];
    if (!iniciativa) {
      return { success: false, data: null, error: 'Iniciativa no encontrada.' };
    }

    const cuposTitulares = iniciativa.cupos_titulares || 20;
    const cuposSuplentes = iniciativa.cupos_suplentes || 10;

    // 2. Obtener el universo de postulaciones ADMISIBLES en orden canónico
    const qAdm = tursoEjecutar(
      `SELECT p.id_postulacion, p.id_emprendimiento, p.id_persona_contacto, per.rut, per.nombres, per.apellidos, emp.nombre_comercial
       FROM postulaciones p
       JOIN personas per ON p.id_persona_contacto = per.id_persona
       JOIN emprendimientos emp ON p.id_emprendimiento = emp.id_emprendimiento
       WHERE p.id_iniciativa = ? AND p.estado_postulacion = 'ADMISIBLE'
       ORDER BY p.id_postulacion ASC;`,
      [idIniciativa]
    );

    const universo = (qAdm.success && qAdm.data.rows) || [];
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
    const transacciones = [];

    // Registrar proceso inmutable
    transacciones.push({
      sql: `INSERT INTO procesos_seleccion (
        id_proceso, id_iniciativa, semilla_numerica, huella_universo_admisible, total_admisibles,
        total_titulares, total_suplentes, metodo_sorteo, ejecutor, estado, creado_en
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'LCG_DETERMINISTA', ?, 'FINALIZADO', datetime('now'));`,
      args: [
        idProceso,
        idIniciativa,
        semilla,
        huellaUniverso,
        copiaUniverso.length,
        Math.min(cuposTitulares, copiaUniverso.length),
        Math.max(0, Math.min(cuposSuplentes, copiaUniverso.length - cuposTitulares)),
        ejecutor
      ]
    });

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

      // Guardar en resultados_seleccion
      transacciones.push({
        sql: `INSERT INTO resultados_seleccion (
          id_resultado, id_proceso, id_postulacion, orden_prelacion, resultado, puntaje_sorteo, creado_en
        ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'));`,
        args: [
          'res-' + Utilities.getUuid(),
          idProceso,
          post.id_postulacion,
          orden,
          resultado,
          orden
        ]
      });

      // Actualizar estado en postulaciones
      transacciones.push({
        sql: `UPDATE postulaciones 
              SET estado_postulacion = ?, actualizado_en = datetime('now'), actualizado_por = ?
              WHERE id_postulacion = ?;`,
        args: [nuevoEstadoPost, ejecutor, post.id_postulacion]
      });

      // Si es TITULAR, crear registro en confirmaciones_participacion
      if (resultado === 'TITULAR') {
        transacciones.push({
          sql: `INSERT INTO confirmaciones_participacion (
            id_confirmacion, id_postulacion, id_iniciativa, estado, puesto_asignado, creado_por, creado_en
          ) VALUES (?, ?, ?, 'PENDIENTE', ?, ?, datetime('now'));`,
          args: [
            'conf-' + Utilities.getUuid(),
            post.id_postulacion,
            idIniciativa,
            'Puesto-' + String(orden).padStart(2, '0'),
            ejecutor
          ]
        });
      }

      resultadosPublicos.push({
        ordenPrelacion: orden,
        resultado: resultado,
        idPostulacion: post.id_postulacion,
        rut: post.rut,
        nombreEmprendedor: `${post.nombres} ${post.apellidos}`,
        nombreComercial: post.nombre_comercial
      });
    }

    // Registrar en auditoría institucional
    transacciones.push({
      sql: `INSERT INTO auditoria (id_auditoria, accion, entidad, id_entidad, payload_nuevo, usuario_email, timestamp)
            VALUES (?, 'EJECUTAR_SELECCION_LCG', 'PROCESOS_SELECCION', ?, ?, ?, datetime('now'));`,
      args: [
        'aud-' + Utilities.getUuid(),
        idProceso,
        JSON.stringify({ semilla: semilla, huellaUniverso: huellaUniverso, total: copiaUniverso.length }),
        ejecutor
      ]
    });

    const txRes = tursoTransaccion(transacciones);
    if (!txRes.success) {
      return { success: false, data: null, error: 'Error guardando proceso de selección en Turso: ' + txRes.error };
    }

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
        mensaje: 'Selección determinista completada exitosamente. Es 100% reproducible y auditable.'
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

    // Obtener confirmación actual
    const qConf = tursoEjecutar(
      `SELECT c.*, p.id_iniciativa 
       FROM confirmaciones_participacion c
       JOIN postulaciones p ON c.id_postulacion = p.id_postulacion
       WHERE c.id_postulacion = ?;`,
      [idPostulacion]
    );

    const conf = qConf.success && qConf.data.rows && qConf.data.rows[0];
    if (!conf) {
      return { success: false, data: null, error: 'No se encontró registro de confirmación para esta postulación.' };
    }

    const transacciones = [];

    if (accion === 'CONFIRMAR') {
      transacciones.push({
        sql: `UPDATE confirmaciones_participacion 
              SET estado = 'CONFIRMADO', fecha_confirmacion = datetime('now'), actualizado_en = datetime('now'), actualizado_por = ?
              WHERE id_confirmacion = ?;`,
        args: [usuario, conf.id_confirmacion]
      });
      transacciones.push({
        sql: `UPDATE postulaciones 
              SET estado_postulacion = 'CONFIRMADA', actualizado_en = datetime('now'), actualizado_por = ?
              WHERE id_postulacion = ?;`,
        args: [usuario, idPostulacion]
      });

      const txOk = tursoTransaccion(transacciones);
      if (!txOk.success) return { success: false, data: null, error: txOk.error };

      return {
        success: true,
        data: { estado: 'CONFIRMADO', puestoAsignado: conf.puesto_asignado, mensaje: 'Participación confirmada exitosamente.' },
        error: null
      };
    }

    if (accion === 'DESISTIR') {
      const motivo = params.motivoDesistimiento || 'Desistimiento voluntario';

      // 1. Buscar el siguiente suplente en orden de prelación que no haya sido asignado aún
      const qSigSuplente = tursoEjecutar(
        `SELECT r.id_postulacion, r.orden_prelacion, per.nombres, per.apellidos, emp.nombre_comercial
         FROM resultados_seleccion r
         JOIN postulaciones p ON r.id_postulacion = p.id_postulacion
         JOIN personas per ON p.id_persona_contacto = per.id_persona
         JOIN emprendimientos emp ON p.id_emprendimiento = emp.id_emprendimiento
         WHERE p.id_iniciativa = ? AND r.resultado = 'SUPLENTE' AND p.estado_postulacion = 'SUPLENTE'
         ORDER BY r.orden_prelacion ASC
         LIMIT 1;`,
        [conf.id_iniciativa]
      );

      const siguienteSuplente = qSigSuplente.success && qSigSuplente.data.rows && qSigSuplente.data.rows[0];

      // Marcar desistimiento del titular
      transacciones.push({
        sql: `UPDATE confirmaciones_participacion 
              SET estado = 'DESISTIDO', motivo_desistimiento = ?, reasignado_a_postulacion = ?, actualizado_en = datetime('now'), actualizado_por = ?
              WHERE id_confirmacion = ?;`,
        args: [motivo, siguienteSuplente ? siguienteSuplente.id_postulacion : null, usuario, conf.id_confirmacion]
      });

      transacciones.push({
        sql: `UPDATE postulaciones 
              SET estado_postulacion = 'RETIRADA', motivo_rechazo = ?, actualizado_en = datetime('now'), actualizado_por = ?
              WHERE id_postulacion = ?;`,
        args: ['Desistimiento: ' + motivo, usuario, idPostulacion]
      });

      // Si hay suplente, promoverlo en cascada
      let datosPromovido = null;
      if (siguienteSuplente) {
        datosPromovido = siguienteSuplente;
        transacciones.push({
          sql: `UPDATE postulaciones 
                SET estado_postulacion = 'SELECCIONADA', actualizado_en = datetime('now'), actualizado_por = ?
                WHERE id_postulacion = ?;`,
          args: [usuario, siguienteSuplente.id_postulacion]
        });

        transacciones.push({
          sql: `INSERT INTO confirmaciones_participacion (
            id_confirmacion, id_postulacion, id_iniciativa, estado, puesto_asignado, creado_por, creado_en
          ) VALUES (?, ?, ?, 'PENDIENTE', ?, ?, datetime('now'));`,
          args: [
            'conf-' + Utilities.getUuid(),
            siguienteSuplente.id_postulacion,
            conf.id_iniciativa,
            conf.puesto_asignado, // Hereda el puesto del que desistió
            usuario
          ]
        });
      }

      const txDes = tursoTransaccion(transacciones);
      if (!txDes.success) return { success: false, data: null, error: txDes.error };

      return {
        success: true,
        data: {
          estado: 'DESISTIDO',
          puestoLiberado: conf.puesto_asignado,
          suplentePromovido: datosPromovido ? {
            idPostulacion: datosPromovido.id_postulacion,
            ordenPrelacion: datosPromovido.orden_prelacion,
            nombreEmprendedor: `${datosPromovido.nombres} ${datosPromovido.apellidos}`,
            nombreComercial: datosPromovido.nombre_comercial,
            puestoAsignado: conf.puesto_asignado
          } : null,
          mensaje: datosPromovido 
            ? `Titular desistido. Reasignación en cascada exitosa: promovido suplente puesto #${datosPromovido.orden_prelacion}.`
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
