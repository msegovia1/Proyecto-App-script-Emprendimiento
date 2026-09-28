// ===== ReportesService.gs =====
// SGE v2.1.0 - Ficha integral del emprendedor
// Métricas, paneles de control, catálogos en caché y exportación de datos

function catalogos_() {
  const cache = CacheService.getScriptCache();
  const stored = cache.get(APP.CACHE_CATALOGS);
  if (stored) {
    try { return JSON.parse(stored); } catch (e) {}
  }
  const grouped = {};
  repoTodos('CATALOGOS', { incluirInactivos: true }).filter(function(c) {
    return c.ACTIVO === 'SI';
  }).forEach(function(c) {
    (grouped[c.TIPO_CATALOGO] = grouped[c.TIPO_CATALOGO] || []).push(c);
  });
  Object.keys(CATALOGOS_INICIALES).forEach(function(type) {
    grouped[type] = grouped[type] || [];
    const existentes = grouped[type].map(function(c) { return c.CODIGO; });
    CATALOGOS_INICIALES[type].forEach(function(code, index) {
      if (existentes.indexOf(code) < 0) {
        grouped[type].push({
          TIPO_CATALOGO: type,
          CODIGO: code,
          ETIQUETA: ETIQUETAS_CATALOGO[code] || code.replace(/_/g, ' '),
          ORDEN: index + 1,
          ACTIVO: 'SI',
          METADATA_JSON: EXPLICACION_OPERADORES[code] ? JSON.stringify({ explicacion: EXPLICACION_OPERADORES[code] }) : ''
        });
      }
    });
    grouped[type].sort(function(a, b) { return Number(a.ORDEN || 0) - Number(b.ORDEN || 0); });
  });
  try {
    cache.put(APP.CACHE_CATALOGS, JSON.stringify(grouped), 21600); // 6 horas TTL
  } catch (ignored) {}
  return grouped;
}

function agruparConteo_(rows, field, fallback) {
  return rows.reduce(function(acc, row) {
    const key = row[field] || fallback || 'SIN INFORMACIÓN';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function apiDashboard(force) {
  try {
    exigirPermiso_('REPORTE_VER');
    const cache = CacheService.getScriptCache();
    if (!force) {
      const stored = cache.get(APP.CACHE_DASHBOARD);
      if (stored) {
        try { return respuestaOk(JSON.parse(stored), { cache: true }); } catch (e) {}
      }
    }
    const personas = repoTodos('PERSONAS', { incluirInactivos: false });
    const emps = repoTodos('EMPRENDIMIENTOS', { incluirInactivos: true }).filter(function(e) {
      return e.ESTADO_EMPRENDIMIENTO !== 'CERRADO';
    });
    const docs = repoTodos('DOCUMENTOS', { incluirInactivos: true });
    const posts = repoTodos('POSTULACIONES', { incluirInactivos: true });
    const iniciativas = repoTodos('INICIATIVAS', { incluirInactivos: true });
    const relaciones = repoTodos('PERSONA_EMPRENDIMIENTO', { incluirInactivos: true }).filter(function(r) {
      return r.ESTADO_REGISTRO !== 'INACTIVO';
    });
    const evaluaciones = repoTodos('EVALUACIONES_EMPRENDIMIENTO', { incluirInactivos: true });
    const procesos = repoTodos('PROCESOS_SELECCION', { incluirInactivos: true });
    const docsActuales = docs.filter(function(d) {
      return d.ES_VERSION_VIGENTE === 'SI';
    }).map(function(d) {
      return Object.assign({}, d, { ESTADO_EFECTIVO: estadoDocumentoEfectivo_(d) });
    });
    const docsPersona = docsActuales.filter(function(d) {
      return d.TIPO_SUJETO === 'PERSONA' && documentoUtilizable_(d);
    });
    const docsPorPersonaMap = {};
    docsPersona.forEach(function(d) {
      (docsPorPersonaMap[String(d.ID_SUJETO)] = docsPorPersonaMap[String(d.ID_SUJETO)] || []).push(d.TIPO_DOCUMENTO);
    });
    const completos = personas.filter(function(p) {
      const tipos = docsPorPersonaMap[String(p.ID_PERSONA)] || [];
      const cedula = tipos.indexOf('CEDULA_IDENTIDAD_COMPLETA') >= 0 || (tipos.indexOf('CEDULA_IDENTIDAD_FRONTAL') >= 0 && tipos.indexOf('CEDULA_IDENTIDAD_REVERSO') >= 0);
      return cedula && tipos.indexOf('REGISTRO_SOCIAL_HOGARES') >= 0;
    }).length;
    const empsConRepresentante = relaciones.reduce(function(out, r) {
      if (r.ES_PRINCIPAL === 'SI') out[String(r.ID_EMPRENDIMIENTO)] = true;
      return out;
    }, {});
    const hoy = Utilities.formatDate(new Date(), APP.TIMEZONE, 'yyyy-MM-dd');
    const postsPorIniciativa = {};
    posts.forEach(function(p) {
      postsPorIniciativa[String(p.ID_INICIATIVA)] = (postsPorIniciativa[String(p.ID_INICIATIVA)] || 0) + 1;
    });
    const data = {
      kpis: {
        personas: personas.length,
        emprendimientos: emps.length,
        vinculaciones: relaciones.length,
        emprendimientosSinRepresentante: emps.filter(function(e) { return !empsConRepresentante[String(e.ID_EMPRENDIMIENTO)]; }).length,
        expedientesCompletos: completos,
        expedientesPendientes: Math.max(0, personas.length - completos),
        iniciativasActivas: iniciativas.filter(function(i) { return ['ABIERTA', 'EN_EJECUCION'].indexOf(i.ESTADO) >= 0; }).length,
        posiblesDuplicados: personas.filter(function(p) { return p.ESTADO_REGISTRO === 'POSIBLE_DUPLICADO'; }).length,
        documentosObservados: docsActuales.filter(function(d) {
          return ['VENCIDO', 'RECHAZADO', 'OBSERVADO', 'ILEGIBLE', 'INCOMPLETO'].indexOf(d.ESTADO_EFECTIVO) >= 0;
        }).length,
        postulaciones: posts.length,
        postulacionesSubsanables: posts.filter(function(p) { return p.ESTADO_POSTULACION === 'SUBSANABLE'; }).length,
        seleccionesEjecutadas: procesos.filter(function(p) { return p.ESTADO === 'EJECUTADO'; }).length,
        revisionesVencidas: evaluaciones.filter(function(e) { return e.PROXIMA_REVISION && String(e.PROXIMA_REVISION).slice(0, 10) < hoy; }).length
      },
      porEtapa: agruparConteo_(emps, 'ETAPA_ACTUAL', 'SIN CLASIFICAR'),
      porRubro: agruparConteo_(emps, 'ID_RUBRO', 'SIN RUBRO'),
      porFormalizacion: agruparConteo_(emps, 'FORMALIZACION', 'SIN INFORMACIÓN'),
      postulacionesPorEstado: agruparConteo_(posts, 'ESTADO_POSTULACION', 'SIN ESTADO'),
      iniciativasPorEstado: agruparConteo_(iniciativas, 'ESTADO', 'SIN ESTADO'),
      iniciativasRecientes: iniciativas.slice().sort(function(a, b) {
        return String(b.FECHA_EJECUCION || b.CREADO_EN).localeCompare(String(a.FECHA_EJECUCION || a.CREADO_EN));
      }).slice(0, 6).map(function(i) {
        return {
          ID_INICIATIVA: i.ID_INICIATIVA,
          NOMBRE: i.NOMBRE,
          ESTADO: i.ESTADO,
          FECHA_EJECUCION: i.FECHA_EJECUCION,
          POSTULACIONES: postsPorIniciativa[String(i.ID_INICIATIVA)] || 0
        };
      }),
      actualizadoEn: ahoraIso_()
    };
    try {
      cache.put(APP.CACHE_DASHBOARD, JSON.stringify(data), 300); // 5 minutos TTL
    } catch (ignored) {}
    return respuestaOk(data, { cache: false });
  } catch (error) {
    return manejarError_(error, 'apiDashboard');
  }
}

function apiExportar(tabla, filtros) {
  try {
    exigirPermiso_('EXPORTAR_IDENTIFICABLE');
    const rows = repoTodos(tabla, { filtro: filtros || {}, incluirInactivos: false });
    const file = DriveApp.createFile(
      tabla + '_' + Utilities.formatDate(new Date(), APP.TIMEZONE, 'yyyyMMdd_HHmm') + '.csv',
      convertirCsv_(encabezados_(tabla), rows),
      MimeType.CSV
    );
    auditoriaRegistrar_('EXPORTAR', tabla, file.getId(), null, { filtros: filtros || {}, cantidad: rows.length }, 'Exportación autorizada');
    return respuestaOk({ fileId: file.getId(), url: file.getUrl(), cantidad: rows.length });
  } catch (error) {
    return manejarError_(error, 'apiExportar');
  }
}

function convertirCsv_(headers, rows) {
  function q(v) {
    return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  }
  return [headers.map(q).join(',')].concat(
    rows.map(function(r) {
      return headers.map(function(h) { return q(r[h]); }).join(',');
    })
  ).join('\n');
}
