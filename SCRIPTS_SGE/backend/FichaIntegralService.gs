// ===== FichaIntegralService.gs =====
// SGE v2.1.0 - Ficha integral del emprendedor
// Servicio 360° de ficha integral: persona + emprendimiento + expediente + trayectoria + migración v2.1

function resolverFichaIntegral_(referencia) {
  let persona = repoBuscarPorId('PERSONAS', referencia);
  let emprendimiento = null;
  let relacion = null;
  if (persona) {
    relacion = relacionActivaPorSujeto_('PERSONA', persona.ID_PERSONA);
    emprendimiento = relacion ? repoBuscarPorId('EMPRENDIMIENTOS', relacion.ID_EMPRENDIMIENTO) : null;
  } else {
    emprendimiento = repoBuscarPorId('EMPRENDIMIENTOS', referencia);
    if (emprendimiento) {
      relacion = relacionActivaPorSujeto_('EMPRENDIMIENTO', emprendimiento.ID_EMPRENDIMIENTO);
      persona = relacion ? repoBuscarPorId('PERSONAS', relacion.ID_PERSONA) : null;
    }
  }
  exigir_(persona || emprendimiento, 'NO_ENCONTRADO', 'No se encontró la ficha integral solicitada.');
  return { persona: persona, emprendimiento: emprendimiento, relacion: relacion };
}

function documentosFichaIntegral_(personaId, emprendimientoId) {
  const puedeVerSensible = puede_('DOCUMENTO_VER_SENSIBLE');
  return repoTodos('DOCUMENTOS', { incluirInactivos: true }).filter(function(d) {
    return (d.TIPO_SUJETO === 'PERSONA' && String(d.ID_SUJETO) === String(personaId || '')) ||
           (d.TIPO_SUJETO === 'EMPRENDIMIENTO' && String(d.ID_SUJETO) === String(emprendimientoId || ''));
  }).map(function(d) {
    const visible = Object.assign({}, d, {
      ESTADO_EFECTIVO: estadoDocumentoEfectivo_(d),
      ORIGEN_ARCHIVO: String(d.CREADO_POR || '').indexOf('FORMULARIO') >= 0 ? 'Formulario' : 'Funcionario'
    });
    if (!puedeVerSensible) visible.ID_ARCHIVO_DRIVE = '';
    return visible;
  }).sort(function(a, b) {
    if ((a.ES_VERSION_VIGENTE === 'SI') !== (b.ES_VERSION_VIGENTE === 'SI')) {
      return a.ES_VERSION_VIGENTE === 'SI' ? -1 : 1;
    }
    return String(b.CREADO_EN).localeCompare(String(a.CREADO_EN));
  });
}

function resumenFichaIntegral_(persona, emp, documentos) {
  const docsPersona = documentos.filter(function(d) { return d.TIPO_SUJETO === 'PERSONA'; });
  const docsEmp = documentos.filter(function(d) { return d.TIPO_SUJETO === 'EMPRENDIMIENTO'; });
  const base = persona ? resumenDocumental_('PERSONA', persona.ID_PERSONA, docsPersona) : { COMPLETO: 'NO', FALTANTES: ['PERSONA_TITULAR'], VIGENTES: 0, TOTAL_VERSIONES: 0 };
  const inicio = docsEmp.some(function(d) {
    return documentoUtilizable_(d) && ['INICIO_ACTIVIDADES', 'PATENTE_COMERCIAL'].indexOf(d.TIPO_DOCUMENTO) >= 0;
  });
  const mercado = !emp
    ? { HABILITADO: 'NO', MOTIVO: 'Falta registrar el emprendimiento.' }
    : base.COMPLETO !== 'SI'
    ? { HABILITADO: 'NO', MOTIVO: 'Falta completar cédula por ambos lados y Registro Social de Hogares.' }
    : inicio
    ? { HABILITADO: 'SI', MOTIVO: 'Documentación base e inicio de actividades recibidos. No requiere revisión previa.' }
    : { HABILITADO: 'NO', MOTIVO: 'Falta cargar el certificado de inicio de actividades.' };
  const actuales = documentos.filter(function(d) { return d.ES_VERSION_VIGENTE === 'SI'; });
  return {
    REGISTRO_BASE_COMPLETO: base.COMPLETO,
    HABILITADO_MERCADOS: mercado.HABILITADO,
    MOTIVO_HABILITACION: mercado.MOTIVO,
    FALTANTES_BASE: base.FALTANTES,
    DOCUMENTOS_ACTUALES: actuales.length,
    DOCUMENTOS_OBSERVADOS: actuales.filter(function(d) {
      return ['OBSERVADO', 'RECHAZADO', 'VENCIDO'].indexOf(d.ESTADO_EFECTIVO) >= 0;
    }).length,
    TOTAL_VERSIONES: documentos.length
  };
}

function apiListarFichasIntegrales(filtros) {
  try {
    usuarioActual_();
    exigir_(puede_('PERSONA_VER'), 'PROHIBIDO', 'No tiene permiso para consultar datos personales de emprendedores.');
    filtros = filtros || {};
    const personas = repoTodos('PERSONAS', { incluirInactivos: true }).filter(function(p) { return p.ESTADO_REGISTRO !== 'INACTIVO'; });
    const emps = indexarPor_(repoTodos('EMPRENDIMIENTOS', { incluirInactivos: true }), 'ID_EMPRENDIMIENTO');
    const rels = repoTodos('PERSONA_EMPRENDIMIENTO', { incluirInactivos: true }).filter(function(r) { return r.ESTADO_REGISTRO !== 'INACTIVO'; });
    const todosDocs = repoTodos('DOCUMENTOS', { incluirInactivos: true });

    const relsPorPersona = {};
    rels.forEach(function(r) { relsPorPersona[String(r.ID_PERSONA)] = r; });
    const docsPorPersona = {};
    const docsPorEmp = {};
    todosDocs.forEach(function(d) {
      if (d.TIPO_SUJETO === 'PERSONA') {
        (docsPorPersona[String(d.ID_SUJETO)] = docsPorPersona[String(d.ID_SUJETO)] || []).push(d);
      } else if (d.TIPO_SUJETO === 'EMPRENDIMIENTO') {
        (docsPorEmp[String(d.ID_SUJETO)] = docsPorEmp[String(d.ID_SUJETO)] || []).push(d);
      }
    });

    let rows = personas.map(function(p) {
      const rel = relsPorPersona[String(p.ID_PERSONA)];
      const e = rel ? emps[String(rel.ID_EMPRENDIMIENTO)] : null;
      const dPers = docsPorPersona[String(p.ID_PERSONA)] || [];
      const dEmp = e ? (docsPorEmp[String(e.ID_EMPRENDIMIENTO)] || []) : [];
      const docs = dPers.concat(dEmp);
      const res = resumenFichaIntegral_(p, e, docs);
      return {
        ID_PERSONA: p.ID_PERSONA,
        ID_EMPRENDIMIENTO: e ? e.ID_EMPRENDIMIENTO : '',
        CODIGO: p.CODIGO_PERSONA || '',
        PERSONA: nombrePersona_(p),
        RUT: p.RUT_NORMALIZADO || '',
        EMAIL: p.EMAIL_NORMALIZADO || '',
        TELEFONO: p.TELEFONO_NORMALIZADO || '',
        COMUNA: p.COMUNA_RESIDENCIA || '',
        EMPRENDIMIENTO: e ? e.NOMBRE_COMERCIAL : 'Sin emprendimiento vinculado',
        RUBRO: e ? e.ID_RUBRO : '',
        FORMALIZACION: e ? e.FORMALIZACION : '',
        ESTADO_PERSONA: p.ESTADO_REGISTRO,
        ESTADO_EMPRENDIMIENTO: e ? e.ESTADO_EMPRENDIMIENTO : '',
        REGISTRO_BASE_COMPLETO: res.REGISTRO_BASE_COMPLETO,
        HABILITADO_MERCADOS: res.HABILITADO_MERCADOS,
        ACTUALIZADO_EN: String((e && e.ACTUALIZADO_EN) || p.ACTUALIZADO_EN || p.CREADO_EN || '')
      };
    });

    const q = normalizarTexto_(filtros.q).toLowerCase();
    if (q) {
      rows = rows.filter(function(r) {
        return [r.CODIGO, r.PERSONA, r.RUT, r.EMAIL, r.TELEFONO, r.EMPRENDIMIENTO, r.RUBRO, r.COMUNA].join(' ').toLowerCase().indexOf(q) >= 0;
      });
    }
    if (filtros.rubro) rows = rows.filter(function(r) { return r.RUBRO === filtros.rubro; });
    if (filtros.formalizacion) rows = rows.filter(function(r) { return r.FORMALIZACION === filtros.formalizacion; });
    if (filtros.habilitado) rows = rows.filter(function(r) { return r.HABILITADO_MERCADOS === filtros.habilitado; });
    rows.sort(function(a, b) { return String(b.ACTUALIZADO_EN).localeCompare(String(a.ACTUALIZADO_EN)); });
    const total = rows.length, offset = Math.max(0, Number(filtros.offset || 0)), limit = Math.min(100, Math.max(10, Number(filtros.limit || 25)));
    return respuestaOk({ filas: rows.slice(offset, offset + limit), total: total, offset: offset, limit: limit });
  } catch (error) {
    return manejarError_(error, 'apiListarFichasIntegrales');
  }
}

function apiObtenerFichaIntegral(referencia) {
  try {
    usuarioActual_();
    exigir_(puede_('PERSONA_VER'), 'PROHIBIDO', 'No tiene permiso para consultar datos personales de esta ficha.');
    const ficha = resolverFichaIntegral_(referencia);
    const persona = ficha.persona;
    const emp = ficha.emprendimiento;
    const docs = documentosFichaIntegral_(persona && persona.ID_PERSONA, emp && emp.ID_EMPRENDIMIENTO);
    const posts = emp ? repoTodos('POSTULACIONES', { incluirInactivos: true }).filter(function(p) {
      return String(p.ID_EMPRENDIMIENTO) === String(emp.ID_EMPRENDIMIENTO);
    }).map(function(p) {
      const i = repoBuscarPorId('INICIATIVAS', p.ID_INICIATIVA) || {};
      return Object.assign({}, p, { NOMBRE_INICIATIVA: i.NOMBRE || 'Iniciativa' });
    }) : [];
    const postIds = posts.map(function(p) { return String(p.ID_POSTULACION); });
    const participaciones = repoTodos('PARTICIPACIONES', { incluirInactivos: true }).filter(function(p) {
      return postIds.indexOf(String(p.ID_POSTULACION)) >= 0;
    });
    const seguimientos = emp ? repoTodos('SEGUIMIENTO_MERCADO', { incluirInactivos: true }).filter(function(s) {
      return String(s.ID_EMPRENDIMIENTO) === String(emp.ID_EMPRENDIMIENTO);
    }) : [];
    const beneficios = emp ? repoTodos('BENEFICIOS', { incluirInactivos: true }).filter(function(b) {
      return String(b.ID_EMPRENDIMIENTO) === String(emp.ID_EMPRENDIMIENTO);
    }) : [];
    const evaluaciones = emp ? repoTodos('EVALUACIONES_EMPRENDIMIENTO', { incluirInactivos: true }).filter(function(e) {
      return String(e.ID_EMPRENDIMIENTO) === String(emp.ID_EMPRENDIMIENTO);
    }) : [];
    const ids = [persona && persona.ID_PERSONA, emp && emp.ID_EMPRENDIMIENTO].concat(postIds).filter(Boolean);
    const historial = repoTodos('AUDITORIA', { incluirInactivos: true }).filter(function(a) {
      return ids.indexOf(String(a.ID_REGISTRO)) >= 0;
    }).sort(function(a, b) {
      return String(b.FECHA_HORA).localeCompare(String(a.FECHA_HORA));
    }).slice(0, 30);

    return respuestaOk({
      persona: persona,
      emprendimiento: emp,
      relacion: ficha.relacion,
      resumen: resumenFichaIntegral_(persona, emp, docs),
      documentos: docs,
      postulaciones: posts,
      participaciones: participaciones,
      seguimientos: seguimientos,
      beneficios: beneficios,
      evaluaciones: evaluaciones,
      historial: historial
    });
  } catch (error) {
    return manejarError_(error, 'apiObtenerFichaIntegral');
  }
}

function apiActualizarFichaIntegral(idPersona, data) {
  try {
    const user = exigirPermiso_('PERSONA_EDITAR');
    exigirPermiso_('EMPRENDIMIENTO_EDITAR');
    return conBloqueoSistema_(function() {
      const ficha = resolverFichaIntegral_(idPersona);
      exigir_(ficha.persona && ficha.emprendimiento, 'FICHA_INCOMPLETA', 'La ficha debe tener persona y emprendimiento vinculados.');
      const persona = actualizarPersonaRegistroIntegral_(ficha.persona, (data || {}).PERSONA || {}, user.EMAIL);
      const emp = actualizarEmprendimientoRegistroIntegral_(ficha.emprendimiento, (data || {}).EMPRENDIMIENTO || {}, user.EMAIL);
      return respuestaOk({ persona: persona, emprendimiento: emp });
    });
  } catch (error) {
    return manejarError_(error, 'apiActualizarFichaIntegral');
  }
}

function apiPrepararCarpetaFichaIntegral(referencia) {
  try {
    exigirPermiso_('DOCUMENTO_CARGAR');
    const ficha = resolverFichaIntegral_(referencia);
    const tipo = ficha.persona ? 'PERSONA' : 'EMPRENDIMIENTO';
    const id = ficha.persona ? ficha.persona.ID_PERSONA : ficha.emprendimiento.ID_EMPRENDIMIENTO;
    const folder = carpetaDocumentalSujeto_(tipo, id, 'CEDULA_IDENTIDAD_COMPLETA');
    return respuestaOk({ url: folder.getUrl(), id: folder.getId(), nombre: folder.getName() });
  } catch (error) {
    return manejarError_(error, 'apiPrepararCarpetaFichaIntegral');
  }
}

function migrarDocumentosRecibidosV210_() {
  let cambios = 0;
  repoTodos('DOCUMENTOS', { incluirInactivos: true }).forEach(function(d) {
    if (d.ESTADO_REVISION === 'PENDIENTE') {
      repoActualizar('DOCUMENTOS', d.ID_DOCUMENTO, {
        ESTADO_REVISION: d.ES_VERSION_VIGENTE === 'SI' ? 'RECIBIDO' : 'REEMPLAZADO'
      }, { motivo: 'Migración v2.1: documento recibido sin revisión obligatoria' });
      cambios++;
    }
  });
  return cambios;
}

function normalizarRelacionesUnoAUnoV210_() {
  const personas = indexarPor_(repoTodos('PERSONAS', { incluirInactivos: true }), 'ID_PERSONA');
  const emps = indexarPor_(repoTodos('EMPRENDIMIENTOS', { incluirInactivos: true }), 'ID_EMPRENDIMIENTO');
  const activas = repoTodos('PERSONA_EMPRENDIMIENTO', { incluirInactivos: true }).filter(function(r) {
    return r.ESTADO_REGISTRO !== 'INACTIVO';
  });
  activas.sort(function(a, b) {
    const ap = personas[String(a.ID_PERSONA)] || {};
    const bp = personas[String(b.ID_PERSONA)] || {};
    const ae = emps[String(a.ID_EMPRENDIMIENTO)] || {};
    const be = emps[String(b.ID_EMPRENDIMIENTO)] || {};
    const aw = (ap.ESTADO_REGISTRO === 'ACTIVO' ? 4 : 0) + (ae.ESTADO_EMPRENDIMIENTO !== 'CERRADO' ? 2 : 0) + (a.ES_PRINCIPAL === 'SI' ? 1 : 0);
    const bw = (bp.ESTADO_REGISTRO === 'ACTIVO' ? 4 : 0) + (be.ESTADO_EMPRENDIMIENTO !== 'CERRADO' ? 2 : 0) + (b.ES_PRINCIPAL === 'SI' ? 1 : 0);
    if (aw !== bw) return bw - aw;
    return String(b.DESDE || b.CREADO_EN || '').localeCompare(String(a.DESDE || a.CREADO_EN || ''));
  });
  const personasUsadas = {}, emprendimientosUsados = {};
  let conservadas = 0, desactivadas = 0;
  activas.forEach(function(r) {
    const p = String(r.ID_PERSONA), e = String(r.ID_EMPRENDIMIENTO);
    if (!personasUsadas[p] && !emprendimientosUsados[e]) {
      personasUsadas[p] = true;
      emprendimientosUsados[e] = true;
      repoActualizar('PERSONA_EMPRENDIMIENTO', r.ID_RELACION, {
        ROL: 'TITULAR',
        ES_PRINCIPAL: 'SI',
        ESTADO_REGISTRO: 'ACTIVO'
      }, { motivo: 'Normalización v2.1: relación titular única' });
      conservadas++;
    } else {
      repoActualizar('PERSONA_EMPRENDIMIENTO', r.ID_RELACION, {
        ESTADO_REGISTRO: 'INACTIVO',
        ES_PRINCIPAL: 'NO',
        HASTA: ahoraIso_()
      }, { motivo: 'Normalización v2.1: relación adicional conservada en historial' });
      desactivadas++;
    }
  });
  return { conservadas: conservadas, desactivadas: desactivadas };
}

function asegurarCatalogosV210_() {
  const requeridos = [
    ['ESTADO_DOCUMENTO', 'RECIBIDO', 'Recibido'],
    ['ESTADO_DOCUMENTO', 'OBSERVADO', 'Observado'],
    ['ESTADO_DOCUMENTO', 'REEMPLAZADO', 'Reemplazado']
  ];
  const existentes = repoTodos('CATALOGOS', { incluirInactivos: true });
  const claves = {};
  existentes.forEach(function(c) { claves[c.TIPO_CATALOGO + '|' + c.CODIGO] = true; });
  let agregados = 0;
  requeridos.forEach(function(x, i) {
    if (!claves[x[0] + '|' + x[1]]) {
      repoInsertar('CATALOGOS', {
        TIPO_CATALOGO: x[0],
        CODIGO: x[1],
        ETIQUETA: x[2],
        ORDEN: i + 1,
        ACTIVO: 'SI',
        METADATA_JSON: ''
      }, { auditar: false });
      agregados++;
    }
  });
  CacheService.getScriptCache().remove(APP.CACHE_CATALOGS);
  return agregados;
}

function actualizarFichaIntegralV210() {
  try {
    const user = usuarioActual_();
    exigir_(user.ROL === APP.ROLES.ADMIN, 'PROHIBIDO', 'Solo un administrador puede instalar esta actualización.');
    const respaldo = crearRespaldoActualizacion_();
    asegurarEstructuraV4_();
    completarCodigosVisibles_();
    const catalogos = asegurarCatalogosV210_();
    const documentos = migrarDocumentosRecibidosV210_();
    const relaciones = normalizarRelacionesUnoAUnoV210_();
    const version = repoBuscarPorId('CONFIGURACION', 'VERSION');
    const changes = { VALOR: APP.VERSION, ACTUALIZADO_EN: ahoraIso_(), ACTUALIZADO_POR: user.EMAIL };
    if (version) repoActualizar('CONFIGURACION', 'VERSION', changes, { motivo: 'Actualización ficha integral 2.1.0' });
    else repoInsertar('CONFIGURACION', Object.assign({ CLAVE: 'VERSION', DESCRIPCION: 'Versión instalada' }, changes));
    auditoriaRegistrar_('ACTUALIZAR_FICHA_INTEGRAL', 'SISTEMA', APP.VERSION, null, {
      respaldoId: respaldo.id,
      documentosMigrados: documentos,
      relaciones: relaciones
    }, 'Ficha única, relación uno a uno y habilitación documental automática');
    limpiarCacheDatos_();
    const diagnostico = probarFichaIntegralV210();
    return respuestaOk({
      mensaje: 'Ficha integral v2.1.0 instalada. No se eliminaron registros.',
      version: APP.VERSION,
      respaldo: respaldo,
      documentosMigrados: documentos,
      relaciones: relaciones,
      catalogosAgregados: catalogos,
      diagnostico: diagnostico.ok ? diagnostico.data : diagnostico.error
    });
  } catch (error) {
    return manejarError_(error, 'actualizarFichaIntegralV210');
  }
}

function probarFichaIntegralV210() {
  try {
    const user = usuarioActual_();
    exigir_(user.ROL === APP.ROLES.ADMIN, 'PROHIBIDO', 'Solo un administrador puede ejecutar el diagnóstico.');
    const personas = repoTodos('PERSONAS', { incluirInactivos: true });
    const emprendimientos = repoTodos('EMPRENDIMIENTOS', { incluirInactivos: true });
    const relaciones = repoTodos('PERSONA_EMPRENDIMIENTO', { incluirInactivos: true }).filter(function(r) {
      return r.ESTADO_REGISTRO !== 'INACTIVO';
    });
    const documentos = repoTodos('DOCUMENTOS', { incluirInactivos: true });
    const porPersona = {}, porEmprendimiento = {};
    relaciones.forEach(function(r) {
      porPersona[r.ID_PERSONA] = (porPersona[r.ID_PERSONA] || 0) + 1;
      porEmprendimiento[r.ID_EMPRENDIMIENTO] = (porEmprendimiento[r.ID_EMPRENDIMIENTO] || 0) + 1;
    });
    const conflictosPersona = Object.keys(porPersona).filter(function(id) { return porPersona[id] > 1; });
    const conflictosEmprendimiento = Object.keys(porEmprendimiento).filter(function(id) { return porEmprendimiento[id] > 1; });
    const pendientes = documentos.filter(function(d) { return d.ES_VERSION_VIGENTE === 'SI' && d.ESTADO_REVISION === 'PENDIENTE'; });
    const fichasCompletas = personas.filter(function(p) {
      if (p.ESTADO_REGISTRO === 'INACTIVO') return false;
      const rel = relaciones.find(function(r) { return String(r.ID_PERSONA) === String(p.ID_PERSONA); });
      const emp = rel && repoBuscarPorId('EMPRENDIMIENTOS', rel.ID_EMPRENDIMIENTO);
      if (!emp) return false;
      const docs = documentos.filter(function(d) {
        return (d.TIPO_SUJETO === 'PERSONA' && String(d.ID_SUJETO) === String(p.ID_PERSONA)) ||
               (d.TIPO_SUJETO === 'EMPRENDIMIENTO' && String(d.ID_SUJETO) === String(emp.ID_EMPRENDIMIENTO));
      });
      return resumenFichaIntegral_(p, emp, docs).REGISTRO_BASE_COMPLETO === 'SI';
    }).length;

    return respuestaOk({
      version: APP.VERSION,
      personas: personas.length,
      emprendimientos: emprendimientos.length,
      relacionesActivas: relaciones.length,
      fichasConDocumentacionBaseCompleta: fichasCompletas,
      documentosPendientesPorMigrar: pendientes.length,
      conflictosPersona: conflictosPersona,
      conflictosEmprendimiento: conflictosEmprendimiento,
      correcto: !conflictosPersona.length && !conflictosEmprendimiento.length && !pendientes.length
    });
  } catch (error) {
    return manejarError_(error, 'probarFichaIntegralV210');
  }
}
