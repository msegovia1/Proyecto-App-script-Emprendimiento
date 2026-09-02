// ===== ParticipacionService.gs =====
// SGE v2.1.0 - Ficha integral del emprendedor
// Registro de asistencia, confirmaciones, beneficios y atenciones

function apiRegistrarParticipacion(data) {
  try {
    const user = exigirPermiso_('PARTICIPACION_EDITAR');
    exigir_(data && data.ID_POSTULACION, 'DATOS_INCOMPLETOS', 'La postulación es obligatoria.');
    return respuestaOk(repoInsertar('PARTICIPACIONES', Object.assign({}, data, {
      ID_PARTICIPACION: uuid_(),
      ESTADO_PARTICIPACION: data.ESTADO_PARTICIPACION || 'PENDIENTE',
      CREADO_EN: ahoraIso_(),
      CREADO_POR: user.EMAIL
    })));
  } catch (error) {
    return manejarError_(error, 'apiRegistrarParticipacion');
  }
}

function apiRegistrarBeneficio(data) {
  try {
    const user = exigirPermiso_('PARTICIPACION_EDITAR');
    exigir_(data && data.ID_EMPRENDIMIENTO && data.ID_INICIATIVA && data.TIPO_BENEFICIO, 'DATOS_INCOMPLETOS', 'Emprendimiento, iniciativa y beneficio son obligatorios.');
    return respuestaOk(repoInsertar('BENEFICIOS', Object.assign({}, data, {
      ID_BENEFICIO: uuid_(),
      FECHA: data.FECHA || ahoraIso_(),
      RESPONSABLE: user.EMAIL
    })));
  } catch (error) {
    return manejarError_(error, 'apiRegistrarBeneficio');
  }
}

function apiRegistrarAtencion(data) {
  try {
    const user = exigirPermiso_('PERSONA_EDITAR');
    return respuestaOk(repoInsertar('ATENCIONES', Object.assign({}, data, {
      ID_ATENCION: uuid_(),
      FECHA: ahoraIso_(),
      ID_USUARIO: user.EMAIL,
      ESTADO: data.ESTADO || 'ABIERTA'
    })));
  } catch (error) {
    return manejarError_(error, 'apiRegistrarAtencion');
  }
}

function apiCandidatosSeleccionManual(iniciativaId, filtros) {
  try {
    exigirPermiso_('SELECCION_EJECUTAR');
    filtros = filtros || {};
    const iniciativa = repoBuscarPorId('INICIATIVAS', iniciativaId);
    exigir_(iniciativa, 'NO_ENCONTRADO', 'Seleccione una iniciativa o mercado.');
    const q = normalizarTexto_(filtros.q).toLowerCase();
    const personas = indexarPor_(repoTodos('PERSONAS', { incluirInactivos: true }), 'ID_PERSONA');
    const relaciones = repoTodos('PERSONA_EMPRENDIMIENTO', { incluirInactivos: true });
    const relsPorEmp = {};
    relaciones.forEach(function(x) {
      if (x.ES_PRINCIPAL === 'SI' && x.ESTADO_REGISTRO !== 'INACTIVO') {
        relsPorEmp[String(x.ID_EMPRENDIMIENTO)] = x;
      }
    });
    let rows = repoTodos('EMPRENDIMIENTOS', { incluirInactivos: true }).filter(function(e) {
      return e.ESTADO_EMPRENDIMIENTO === 'ACTIVO';
    });
    ['rubro', 'etapa', 'formalizacion', 'territorio'].forEach(function(k) {
      if (filtros[k]) {
        const f = { rubro: 'ID_RUBRO', etapa: 'ETAPA_ACTUAL', formalizacion: 'FORMALIZACION', territorio: 'TERRITORIO_OPERACION' }[k];
        rows = rows.filter(function(e) { return String(e[f]) === String(filtros[k]); });
      }
    });
    if (filtros.documentacion === 'COMPLETA') {
      rows = rows.filter(function(e) {
        return docs.some(function(d) {
          return String(d.ID_EMPRENDIMIENTO) === String(e.ID_EMPRENDIMIENTO) && d.ESTADO_REVISION === 'APROBADO';
        });
      });
    }
    if (q) {
      rows = rows.filter(function(e) {
        const r = relsPorEmp[String(e.ID_EMPRENDIMIENTO)];
        const p = r && personas[String(r.ID_PERSONA)];
        return [
          e.CODIGO_EMPRENDIMIENTO, e.NOMBRE_COMERCIAL, e.ID_RUBRO, e.TERRITORIO_OPERACION,
          p && p.CODIGO_PERSONA, p && p.RUT_NORMALIZADO, p && p.NOMBRES, p && p.EMAIL_NORMALIZADO, p && p.TELEFONO_NORMALIZADO
        ].join(' ').toLowerCase().indexOf(q) >= 0;
      });
    }
    return respuestaOk(rows.slice(0, 200).map(function(e) {
      const r = relsPorEmp[String(e.ID_EMPRENDIMIENTO)];
      const p = r && personas[String(r.ID_PERSONA)];
      return {
        ID_EMPRENDIMIENTO: e.ID_EMPRENDIMIENTO,
        CODIGO: e.CODIGO_EMPRENDIMIENTO,
        NOMBRE: e.NOMBRE_COMERCIAL,
        RUBRO: e.ID_RUBRO,
        ETAPA: e.ETAPA_ACTUAL,
        FORMALIZACION: e.FORMALIZACION,
        TERRITORIO: e.TERRITORIO_OPERACION,
        ID_PERSONA: p && p.ID_PERSONA,
        PERSONA: p && nombrePersona_(p),
        CORREO: p && p.EMAIL_NORMALIZADO,
        TELEFONO: p && p.TELEFONO_NORMALIZADO
      };
    }));
  } catch (error) {
    return manejarError_(error, 'apiCandidatosSeleccionManual');
  }
}

function apiConfirmarParticipacion(idPostulacion, estado, motivo) {
  try {
    const user = exigirPermiso_('PARTICIPACION_EDITAR');
    exigir_(['PENDIENTE', 'CONFIRMADA', 'NO_RESPONDE', 'INASISTENTE', 'DESISTIO', 'REEMPLAZADA', 'ASISTIO'].indexOf(estado) >= 0, 'ESTADO_INVALIDO', 'Estado de seguimiento no válido.');
    const actual = repoTodos('PARTICIPACIONES', { incluirInactivos: true }).find(function(x) {
      return String(x.ID_POSTULACION) === String(idPostulacion);
    });
    const cambios = {
      ESTADO_PARTICIPACION: estado,
      MOTIVO: motivo || '',
      FECHA_CONFIRMACION: estado === 'CONFIRMADA' ? ahoraIso_() : (actual && actual.FECHA_CONFIRMACION || ''),
      FECHA_ASISTENCIA: estado === 'ASISTIO' ? ahoraIso_() : (actual && actual.FECHA_ASISTENCIA || '')
    };
    return respuestaOk(actual ? repoActualizar('PARTICIPACIONES', actual.ID_PARTICIPACION, cambios, { motivo: 'Seguimiento: ' + estado }) : repoInsertar('PARTICIPACIONES', Object.assign({
      ID_PARTICIPACION: uuid_(),
      ID_POSTULACION: idPostulacion,
      ID_RESULTADO: '',
      REEMPLAZA_A: '',
      CREADO_EN: ahoraIso_(),
      CREADO_POR: user.EMAIL
    }, cambios), { motivo: 'Seguimiento: ' + estado }));
  } catch (error) {
    return manejarError_(error, 'apiConfirmarParticipacion');
  }
}

function apiCrearSeleccionManual(iniciativaId, seleccionados, config) {
  try {
    const user = exigirPermiso_('SELECCION_EJECUTAR');
    const ini = repoBuscarPorId('INICIATIVAS', iniciativaId);
    exigir_(ini, 'NO_ENCONTRADO', 'Seleccione un mercado o iniciativa.');
    seleccionados = seleccionados || [];
    exigir_(seleccionados.length, 'SIN_SELECCION', 'Seleccione al menos un emprendimiento.');
    exigir_(normalizarTexto_(config && config.motivo), 'MOTIVO_OBLIGATORIO', 'Indique los criterios aplicados a la selección manual.');
    return conBloqueoSistema_(function() {
      const processId = uuid_();
      const posts = repoTodos('POSTULACIONES', { incluirInactivos: true });
      const process = repoInsertar('PROCESOS_SELECCION', {
        ID_PROCESO: processId,
        ID_INICIATIVA: iniciativaId,
        VERSION_REGLAS: ini.VERSION_REGLAS,
        METODO: 'MANUAL_MERCADO',
        PARAMETROS_JSON: JSON.stringify({ motivo: config.motivo, filtros: config.filtros || {}, origen: 'SELECCION_MANUAL' }),
        SEMILLA: '',
        FECHA_EJECUCION: ahoraIso_(),
        EJECUTADO_POR: user.EMAIL,
        ESTADO: 'EJECUTADO',
        TAMANO_UNIVERSO: seleccionados.length,
        HUELLA_INTEGRIDAD: huella_(JSON.stringify(seleccionados.map(function(x) { return x.ID_EMPRENDIMIENTO; }).sort()))
      });
      const results = seleccionados.map(function(x, i) {
        let p = posts.find(function(q) {
          return String(q.ID_INICIATIVA) === String(iniciativaId) &&
                 String(q.ID_EMPRENDIMIENTO) === String(x.ID_EMPRENDIMIENTO) &&
                 q.ESTADO_POSTULACION !== 'RETIRADA';
        });
        if (!p) {
          p = repoInsertar('POSTULACIONES', {
            ID_POSTULACION: uuid_(),
            ID_INICIATIVA: iniciativaId,
            ID_EMPRENDIMIENTO: x.ID_EMPRENDIMIENTO,
            ID_PERSONA_CONTACTO: x.ID_PERSONA || '',
            FECHA_POSTULACION: ahoraIso_(),
            ESTADO_POSTULACION: 'ADMISIBLE',
            RESPUESTAS_JSON: JSON.stringify({ ORIGEN: 'SELECCION_MANUAL', MOTIVO: config.motivo }),
            CREADO_EN: ahoraIso_(),
            CREADO_POR: user.EMAIL,
            ACTUALIZADO_EN: ahoraIso_(),
            ACTUALIZADO_POR: user.EMAIL
          }, { motivo: 'Postulación interna para selección manual' });
          posts.push(p);
        }
        const result = i < Number(config.cuposTitulares || ini.CUPOS_TITULARES || 0) ? 'TITULAR' : 'SUPLENTE';
        return repoInsertar('RESULTADOS_SELECCION', {
          ID_RESULTADO: uuid_(),
          ID_PROCESO: processId,
          ID_POSTULACION: p.ID_POSTULACION,
          RESULTADO: result,
          POSICION: i + 1,
          ESTRATO: 'MANUAL',
          FECHA_RESULTADO: ahoraIso_(),
          PROCESO_ORIGEN: processId
        });
      });
      return respuestaOk({ proceso: process, resultados: results });
    });
  } catch (error) {
    return manejarError_(error, 'apiCrearSeleccionManual');
  }
}

function apiBandejaConfirmados(iniciativaId) {
  try {
    exigirPermiso_('PARTICIPACION_EDITAR');
    const mapas = mapasPostulaciones_();
    const results = repoTodos('RESULTADOS_SELECCION', { incluirInactivos: true });
    const processes = indexarPor_(repoTodos('PROCESOS_SELECCION', { incluirInactivos: true }), 'ID_PROCESO');
    const postsMap = indexarPor_(repoTodos('POSTULACIONES', { incluirInactivos: true }), 'ID_POSTULACION');
    const parts = repoTodos('PARTICIPACIONES', { incluirInactivos: true });
    const partsMap = {};
    parts.forEach(function(x) { partsMap[String(x.ID_POSTULACION)] = x; });

    return respuestaOk(results.filter(function(r) {
      const p = processes[String(r.ID_PROCESO)];
      return String(p && p.ID_INICIATIVA) === String(iniciativaId) && ['TITULAR', 'SUPLENTE'].indexOf(r.RESULTADO) >= 0;
    }).map(function(r) {
      const post = postsMap[String(r.ID_POSTULACION)] || {};
      const p = enriquecerPostulacion_(post, mapas);
      const a = partsMap[String(r.ID_POSTULACION)];
      return Object.assign({}, r, {
        ID_EMPRENDIMIENTO: p.ID_EMPRENDIMIENTO,
        ID_PERSONA: p.ID_PERSONA_CONTACTO,
        NOMBRE_EMPRENDIMIENTO: p.NOMBRE_EMPRENDIMIENTO,
        NOMBRE_CONTACTO: p.NOMBRE_CONTACTO,
        CORREO: p.CORREO_CONTACTO,
        TELEFONO: p.TELEFONO_CONTACTO,
        ESTADO_SEGUIMIENTO: a ? a.ESTADO_PARTICIPACION : 'PENDIENTE',
        MOTIVO_SEGUIMIENTO: a ? a.MOTIVO : ''
      });
    }));
  } catch (error) {
    return manejarError_(error, 'apiBandejaConfirmados');
  }
}

function apiReemplazarParticipante(postulacionTitular, postulacionSuplente, motivo) {
  try {
    exigirPermiso_('PARTICIPACION_EDITAR');
    exigir_(postulacionTitular && postulacionSuplente && postulacionTitular !== postulacionSuplente, 'REEMPLAZO_INVALIDO', 'Seleccione un titular y un suplente distintos.');
    exigir_(normalizarTexto_(motivo), 'MOTIVO_OBLIGATORIO', 'Indique el motivo del reemplazo.');
    return conBloqueoSistema_(function() {
      const partes = repoTodos('PARTICIPACIONES', { incluirInactivos: true });
      const titular = partes.find(function(x) { return String(x.ID_POSTULACION) === String(postulacionTitular); });
      const suplente = partes.find(function(x) { return String(x.ID_POSTULACION) === String(postulacionSuplente); });
      if (titular) {
        repoActualizar('PARTICIPACIONES', titular.ID_PARTICIPACION, {
          ESTADO_PARTICIPACION: 'REEMPLAZADA',
          MOTIVO: motivo,
          REEMPLAZA_A: postulacionSuplente
        }, { motivo: 'Reemplazo de participante' });
      } else {
        apiConfirmarParticipacion(postulacionTitular, 'REEMPLAZADA', motivo);
      }
      if (suplente) {
        return respuestaOk(repoActualizar('PARTICIPACIONES', suplente.ID_PARTICIPACION, {
          ESTADO_PARTICIPACION: 'PENDIENTE',
          MOTIVO: 'Habilitado como reemplazo: ' + motivo,
          REEMPLAZA_A: postulacionTitular
        }, { motivo: 'Habilitado como reemplazo' }));
      }
      return apiConfirmarParticipacion(postulacionSuplente, 'PENDIENTE', 'Habilitado como reemplazo: ' + motivo);
    });
  } catch (error) {
    return manejarError_(error, 'apiReemplazarParticipante');
  }
}
