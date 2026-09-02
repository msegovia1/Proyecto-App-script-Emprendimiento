// ===== SeleccionService.gs =====
// SGE v2.1.0 - Ficha integral del emprendedor
// Motor de selección reproducible con semilla pseudoaleatoria y auditoría de adjudicación

function ordenarConSemilla_(items, seed) {
  const random = randomSemilla_(seed);
  return items.map(function(item) {
    return { item: item, order: random() };
  }).sort(function(a, b) {
    return a.order - b.order;
  });
}

function apiOpcionesSeleccion() {
  try {
    usuarioActual_();
    exigir_(puede_('SELECCION_EJECUTAR') || puede_('SELECCION_VER'), 'PROHIBIDO', 'No tiene permiso para consultar selecciones.');
    const iniciativas = repoTodos('INICIATIVAS', { incluirInactivos: true }).filter(function(i) {
      return ['CANCELADA', 'BORRADOR'].indexOf(i.ESTADO) < 0;
    }).sort(function(a, b) {
      return String(b.FECHA_EJECUCION || b.CREADO_EN).localeCompare(String(a.FECHA_EJECUCION || a.CREADO_EN));
    });
    const procesos = repoTodos('PROCESOS_SELECCION', { incluirInactivos: true });
    const posts = repoTodos('POSTULACIONES', { incluirInactivos: true });
    const postsAdmisiblesPorIni = {};
    posts.forEach(function(p) {
      if (p.ESTADO_POSTULACION === 'ADMISIBLE') {
        postsAdmisiblesPorIni[String(p.ID_INICIATIVA)] = (postsAdmisiblesPorIni[String(p.ID_INICIATIVA)] || 0) + 1;
      }
    });
    const procPorIni = {};
    procesos.forEach(function(p) {
      if (p.ESTADO === 'EJECUTADO') {
        procPorIni[String(p.ID_INICIATIVA)] = (procPorIni[String(p.ID_INICIATIVA)] || 0) + 1;
      }
    });
    return respuestaOk(iniciativas.map(function(i) {
      return {
        ID_INICIATIVA: i.ID_INICIATIVA,
        NOMBRE: i.NOMBRE,
        FECHA_EJECUCION: i.FECHA_EJECUCION,
        ESTADO: i.ESTADO,
        CUPOS_TITULARES: i.CUPOS_TITULARES,
        CUPOS_SUPLENTES: i.CUPOS_SUPLENTES,
        POSTULACIONES_ADMISIBLES: postsAdmisiblesPorIni[String(i.ID_INICIATIVA)] || 0,
        SELECCIONES_EJECUTADAS: procPorIni[String(i.ID_INICIATIVA)] || 0
      };
    }));
  } catch (error) {
    return manejarError_(error, 'apiOpcionesSeleccion');
  }
}

function apiListarProcesosSeleccion(iniciativaId) {
  try {
    usuarioActual_();
    exigir_(puede_('SELECCION_EJECUTAR') || puede_('SELECCION_VER'), 'PROHIBIDO', 'No tiene permiso para consultar selecciones.');
    const mapas = mapasPostulaciones_();
    const postsMap = indexarPor_(repoTodos('POSTULACIONES', { incluirInactivos: true }), 'ID_POSTULACION');
    const procesos = repoTodos('PROCESOS_SELECCION', { incluirInactivos: true }).filter(function(p) {
      return !iniciativaId || String(p.ID_INICIATIVA) === String(iniciativaId);
    }).sort(function(a, b) {
      return String(b.FECHA_EJECUCION).localeCompare(String(a.FECHA_EJECUCION));
    });
    const resultados = repoTodos('RESULTADOS_SELECCION', { incluirInactivos: true });
    return respuestaOk(procesos.map(function(p) {
      const detalle = resultados.filter(function(r) {
        return String(r.ID_PROCESO) === String(p.ID_PROCESO);
      }).sort(function(a, b) {
        return Number(a.POSICION) - Number(b.POSICION);
      }).map(function(r) {
        const base = postsMap[String(r.ID_POSTULACION)];
        return Object.assign({}, r, enriquecerPostulacion_(base || {}, mapas));
      });
      return Object.assign({}, p, {
        NOMBRE_INICIATIVA: mapas.iniciativas[String(p.ID_INICIATIVA)] ? mapas.iniciativas[String(p.ID_INICIATIVA)].NOMBRE : '',
        RESULTADOS: detalle
      });
    }));
  } catch (error) {
    return manejarError_(error, 'apiListarProcesosSeleccion');
  }
}

function apiEjecutarSeleccion(iniciativaId, config) {
  try {
    const user = exigirPermiso_('SELECCION_EJECUTAR');
    const iniciativa = repoBuscarPorId('INICIATIVAS', iniciativaId);
    exigir_(iniciativa, 'NO_ENCONTRADO', iniciativaId);
    const anteriores = repoListar('PROCESOS_SELECCION', { filtro: { ID_INICIATIVA: iniciativaId, ESTADO: 'EJECUTADO' }, incluirInactivos: true, limit: 200 });
    exigir_(!anteriores.length || config.confirmarNuevaEjecucion === true, 'SELECCION_EXISTENTE', 'Ya existe una selección ejecutada. Una nueva ejecución debe confirmarse y no reemplazará la anterior.');
    const postulaciones = repoListar('POSTULACIONES', { filtro: { ID_INICIATIVA: iniciativaId }, incluirInactivos: true, limit: APP.MAX_PAGE_SIZE });
    const universo = postulaciones.filter(function(p) { return p.ESTADO_POSTULACION === 'ADMISIBLE'; });
    exigir_(universo.length, 'UNIVERSO_VACIO', 'No existen postulaciones admisibles.');
    const seed = Number(config.semilla || new Date().getTime() % 2147483647);
    const metodo = config.metodo || 'ALEATORIO_SIMPLE';
    const titulares = Number(config.cuposTitulares || iniciativa.CUPOS_TITULARES || 0);
    const suplentes = Number(config.cuposSuplentes || iniciativa.CUPOS_SUPLENTES || 0);
    const processId = uuid_();
    const canonical = universo.map(function(p) { return p.ID_POSTULACION; }).sort();
    const process = repoInsertar('PROCESOS_SELECCION', {
      ID_PROCESO: processId,
      ID_INICIATIVA: iniciativaId,
      VERSION_REGLAS: iniciativa.VERSION_REGLAS,
      METODO: metodo,
      PARAMETROS_JSON: JSON.stringify(config || {}),
      SEMILLA: seed,
      FECHA_EJECUCION: ahoraIso_(),
      EJECUTADO_POR: user.EMAIL,
      ESTADO: 'EJECUTADO',
      TAMANO_UNIVERSO: universo.length,
      HUELLA_INTEGRIDAD: huella_(JSON.stringify(canonical))
    });

    let ordered = [];
    if (metodo === 'ALEATORIO_ESTRATIFICADO') {
      const field = config.campoEstrato || 'ESTRATO';
      const groups = {};
      universo.forEach(function(p) {
        const key = (config.estratos && config.estratos[p.ID_POSTULACION]) || p[field] || 'SIN_ESTRATO';
        (groups[key] = groups[key] || []).push(p);
      });
      Object.keys(groups).sort().forEach(function(key, index) {
        ordered = ordered.concat(ordenarConSemilla_(groups[key], seed + index));
      });
    } else {
      ordered = ordenarConSemilla_(universo, seed);
      if (metodo === 'RANKING_PUNTAJE') {
        ordered.sort(function(a, b) {
          return Number(b.item.PUNTAJE || 0) - Number(a.item.PUNTAJE || 0) || a.order - b.order;
        });
      }
    }

    const results = ordered.map(function(entry, index) {
      const p = entry.item;
      repoInsertar('UNIVERSO_SELECCION', {
        ID_UNIVERSO: uuid_(),
        ID_PROCESO: processId,
        ID_POSTULACION: p.ID_POSTULACION,
        ELEGIBLE: 'SI',
        ESTRATO: (config.estratos && config.estratos[p.ID_POSTULACION]) || '',
        PONDERACION: 1,
        ORDEN_ALEATORIO: entry.order,
        MOTIVO_EXCLUSION: '',
        CREADO_EN: ahoraIso_()
      });
      const result = index < titulares ? 'TITULAR' : index < titulares + suplentes ? 'SUPLENTE' : 'NO_SELECCIONADO';
      return repoInsertar('RESULTADOS_SELECCION', {
        ID_RESULTADO: uuid_(),
        ID_PROCESO: processId,
        ID_POSTULACION: p.ID_POSTULACION,
        RESULTADO: result,
        POSICION: index + 1,
        ESTRATO: (config.estratos && config.estratos[p.ID_POSTULACION]) || '',
        FECHA_RESULTADO: ahoraIso_(),
        PROCESO_ORIGEN: processId
      });
    });
    return respuestaOk({ proceso: process, resultados: results });
  } catch (error) {
    return manejarError_(error, 'apiEjecutarSeleccion');
  }
}

function apiAjustarResultado(resultadoId, nuevoEstado, motivo, evidencia) {
  try {
    const user = exigirPermiso_('SELECCION_EJECUTAR');
    const old = repoBuscarPorId('RESULTADOS_SELECCION', resultadoId);
    exigir_(old, 'NO_ENCONTRADO', resultadoId);
    exigir_(motivo, 'MOTIVO_OBLIGATORIO', 'Todo ajuste debe incluir motivo.');
    repoInsertar('AJUSTES_SELECCION', {
      ID_AJUSTE: uuid_(),
      ID_PROCESO: old.ID_PROCESO,
      ID_RESULTADO: resultadoId,
      ESTADO_ANTERIOR: old.RESULTADO,
      ESTADO_NUEVO: nuevoEstado,
      MOTIVO: motivo,
      EVIDENCIA: evidencia || '',
      AUTORIZADO_POR: user.EMAIL,
      FECHA_AJUSTE: ahoraIso_()
    });
    return respuestaOk(repoActualizar('RESULTADOS_SELECCION', resultadoId, { RESULTADO: nuevoEstado }, { motivo: motivo }));
  } catch (error) {
    return manejarError_(error, 'apiAjustarResultado');
  }
}
