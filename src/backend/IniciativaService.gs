// ===== IniciativaService.gs =====
// SGE v2.1.0 - Ficha integral del emprendedor
// Gestión de iniciativas, ferias, convocatorias, requisitos y motor de admisibilidad

function apiCrearIniciativa(data) {
  try {
    const user = exigirPermiso_('INICIATIVA_EDITAR');
    exigir_(data && data.NOMBRE && data.TIPO_INICIATIVA, 'DATOS_INCOMPLETOS', 'Nombre y tipo son obligatorios.');
    const value = normalizarIniciativa_(Object.assign({}, data, {
      ID_INICIATIVA: uuid_(),
      VERSION_REGLAS: data.VERSION_REGLAS || 1,
      ESTADO: data.ESTADO || 'BORRADOR',
      RESPONSABLE: data.RESPONSABLE || user.EMAIL,
      CREADO_EN: ahoraIso_(),
      CREADO_POR: user.EMAIL
    }));
    validarFechasIniciativa_(value);
    return respuestaOk(repoInsertar('INICIATIVAS', value));
  } catch (error) {
    return manejarError_(error, 'apiCrearIniciativa');
  }
}

function normalizarIniciativa_(data) {
  const value = Object.assign({}, data || {});
  ['NOMBRE', 'OBJETIVO', 'TEMATICA', 'LUGAR', 'RESPONSABLE'].forEach(function(k) {
    value[k] = normalizarTexto_(value[k]);
  });
  ['TIPO_INICIATIVA', 'ESTADO'].forEach(function(k) {
    value[k] = normalizarTexto_(value[k]).toUpperCase().replace(/\s+/g, '_');
  });
  value.CUPOS_TITULARES = Math.max(0, Number(value.CUPOS_TITULARES || 0));
  value.CUPOS_SUPLENTES = Math.max(0, Number(value.CUPOS_SUPLENTES || 0));
  return value;
}

function validarFechasIniciativa_(value) {
  if (value.APERTURA_POSTULACION && value.CIERRE_POSTULACION) {
    exigir_(new Date(value.APERTURA_POSTULACION) <= new Date(value.CIERRE_POSTULACION), 'FECHAS_INVALIDAS', 'La apertura no puede ser posterior al cierre.');
  }
}

function apiListarIniciativas(filtros) {
  try {
    usuarioActual_();
    filtros = filtros || {};
    const q = normalizarTexto_(filtros.q).toLowerCase();
    let rows = repoTodos('INICIATIVAS', { incluirInactivos: true });
    if (q) {
      rows = rows.filter(function(i) {
        return [i.NOMBRE, i.OBJETIVO, i.TEMATICA, i.LUGAR, i.TIPO_INICIATIVA].join(' ').toLowerCase().indexOf(q) >= 0;
      });
    }
    if (filtros.estado) rows = rows.filter(function(i) { return i.ESTADO === filtros.estado; });
    if (filtros.tipo) rows = rows.filter(function(i) { return i.TIPO_INICIATIVA === filtros.tipo; });
    rows.sort(function(a, b) {
      return String(b.FECHA_EJECUCION || b.CREADO_EN).localeCompare(String(a.FECHA_EJECUCION || a.CREADO_EN));
    });
    const total = rows.length, offset = Math.max(0, Number(filtros.offset || 0)), limit = Math.min(100, Math.max(10, Number(filtros.limit || 25)));
    return respuestaOk({ filas: rows.slice(offset, offset + limit), total: total, offset: offset, limit: limit });
  } catch (error) {
    return manejarError_(error, 'apiListarIniciativas');
  }
}

function apiObtenerIniciativa(id) {
  try {
    usuarioActual_();
    const iniciativa = repoBuscarPorId('INICIATIVAS', id);
    exigir_(iniciativa, 'NO_ENCONTRADO', 'Iniciativa no encontrada.');
    const requisitos = repoTodos('REQUISITOS', { incluirInactivos: true }).filter(function(r) {
      return String(r.ID_INICIATIVA) === String(id) &&
             String(r.VERSION_REGLAS) === String(iniciativa.VERSION_REGLAS) &&
             r.ACTIVO === 'SI';
    }).sort(function(a, b) { return Number(a.ORDEN) - Number(b.ORDEN); });
    const mapas = mapasPostulaciones_();
    const postulaciones = repoTodos('POSTULACIONES', { incluirInactivos: true }).filter(function(p) {
      return String(p.ID_INICIATIVA) === String(id);
    }).map(function(p) { return enriquecerPostulacion_(p, mapas); });
    return respuestaOk({ iniciativa: iniciativa, requisitos: requisitos, postulaciones: postulaciones });
  } catch (error) {
    return manejarError_(error, 'apiObtenerIniciativa');
  }
}

function apiActualizarIniciativa(id, data) {
  try {
    const user = exigirPermiso_('INICIATIVA_EDITAR');
    const actual = repoBuscarPorId('INICIATIVAS', id);
    exigir_(actual, 'NO_ENCONTRADO', 'Iniciativa no encontrada.');
    const value = normalizarIniciativa_(Object.assign({}, actual, data || {}));
    exigir_(value.NOMBRE && value.TIPO_INICIATIVA, 'DATOS_INCOMPLETOS', 'Nombre y tipo son obligatorios.');
    validarFechasIniciativa_(value);
    return respuestaOk(repoActualizar('INICIATIVAS', id, value, { motivo: 'Actualización de iniciativa por ' + user.EMAIL }));
  } catch (error) {
    return manejarError_(error, 'apiActualizarIniciativa');
  }
}

function apiCambiarEstadoIniciativa(id, estado, motivo) {
  try {
    exigirPermiso_('INICIATIVA_EDITAR');
    exigir_(CATALOGOS_INICIALES.ESTADO_INICIATIVA.indexOf(estado) >= 0, 'ESTADO_INVALIDO', estado);
    motivo = normalizarTexto_(motivo) || ('Cambio de estado a ' + estado);
    const actual = repoBuscarPorId('INICIATIVAS', id);
    exigir_(actual, 'NO_ENCONTRADO', 'Iniciativa no encontrada.');
    const aperturaFutura = estado === 'ABIERTA' && actual.APERTURA_POSTULACION && new Date(actual.APERTURA_POSTULACION) > new Date();
    const result = repoActualizar('INICIATIVAS', id, { ESTADO: estado }, { motivo: motivo });
    return respuestaOk({
      iniciativa: result,
      advertencia: aperturaFutura ? 'La iniciativa fue abierta antes de la fecha programada. La excepción quedó auditada.' : ''
    });
  } catch (error) {
    return manejarError_(error, 'apiCambiarEstadoIniciativa');
  }
}

function apiAgregarRequisito(data) {
  try {
    const user = exigirPermiso_('INICIATIVA_EDITAR');
    exigir_(data && data.ID_INICIATIVA && data.TIPO_REGLA && data.CAMPO && data.OPERADOR, 'DATOS_INCOMPLETOS', 'Iniciativa, tipo, campo y operador son obligatorios.');
    exigir_(CATALOGOS_INICIALES.CAMPO_REQUISITO.indexOf(data.CAMPO) >= 0, 'CAMPO_INVALIDO', data.CAMPO);
    exigir_(CATALOGOS_INICIALES.OPERADOR_REQUISITO.indexOf(data.OPERADOR) >= 0, 'OPERADOR_INVALIDO', data.OPERADOR);
    const iniciativa = repoBuscarPorId('INICIATIVAS', data.ID_INICIATIVA);
    exigir_(iniciativa, 'NO_ENCONTRADO', 'Iniciativa no encontrada.');
    let agregado = null;
    const versionada = crearNuevaVersionReglas_(iniciativa, function(reglas) {
      agregado = Object.assign({}, data, {
        ES_SUBSANABLE: data.ES_SUBSANABLE === 'SI' ? 'SI' : 'NO',
        ORDEN: Number(data.ORDEN || 1),
        ACTIVO: 'SI'
      });
      return reglas.concat([agregado]);
    }, 'Agregar requisito', user);
    return respuestaOk(versionada.reglas[versionada.reglas.length - 1]);
  } catch (error) {
    return manejarError_(error, 'apiAgregarRequisito');
  }
}

function crearNuevaVersionReglas_(iniciativa, transformar, motivo, user) {
  const actuales = repoTodos('REQUISITOS', { incluirInactivos: true }).filter(function(r) {
    return String(r.ID_INICIATIVA) === String(iniciativa.ID_INICIATIVA) &&
           String(r.VERSION_REGLAS) === String(iniciativa.VERSION_REGLAS) &&
           r.ACTIVO === 'SI';
  });
  const nuevaVersion = Number(iniciativa.VERSION_REGLAS || 1) + 1;
  const nuevas = transformar(actuales.map(function(r) { return Object.assign({}, r); })) || [];
  const creadas = nuevas.map(function(r) {
    return repoInsertar('REQUISITOS', Object.assign({}, r, {
      ID_REQUISITO: uuid_(),
      ID_INICIATIVA: iniciativa.ID_INICIATIVA,
      VERSION_REGLAS: nuevaVersion,
      ACTIVO: 'SI',
      CREADO_EN: ahoraIso_(),
      CREADO_POR: user.EMAIL
    }), { motivo: motivo });
  });
  repoActualizar('INICIATIVAS', iniciativa.ID_INICIATIVA, { VERSION_REGLAS: nuevaVersion }, { motivo: 'Nueva versión de reglas: ' + motivo });
  return { version: nuevaVersion, reglas: creadas };
}

function apiActualizarRequisito(id, data) {
  try {
    const user = exigirPermiso_('INICIATIVA_EDITAR');
    const actual = repoBuscarPorId('REQUISITOS', id);
    exigir_(actual, 'NO_ENCONTRADO', 'Requisito no encontrado.');
    const iniciativa = repoBuscarPorId('INICIATIVAS', actual.ID_INICIATIVA);
    exigir_(String(actual.VERSION_REGLAS) === String(iniciativa.VERSION_REGLAS), 'VERSION_ANTIGUA', 'Solo puede editar requisitos de la versión vigente.');
    const result = crearNuevaVersionReglas_(iniciativa, function(reglas) {
      return reglas.map(function(r) {
        return r.ID_REQUISITO === id ? Object.assign({}, r, data, {
          ORDEN: Number(data.ORDEN || r.ORDEN || 1),
          ES_SUBSANABLE: data.ES_SUBSANABLE === 'SI' ? 'SI' : 'NO'
        }) : r;
      });
    }, 'Actualizar requisito', user);
    return respuestaOk(result);
  } catch (error) {
    return manejarError_(error, 'apiActualizarRequisito');
  }
}

function apiDesactivarRequisito(id, motivo) {
  try {
    const user = exigirPermiso_('INICIATIVA_EDITAR');
    exigir_(motivo, 'MOTIVO_OBLIGATORIO', 'Debe indicar el motivo.');
    const actual = repoBuscarPorId('REQUISITOS', id);
    exigir_(actual, 'NO_ENCONTRADO', 'Requisito no encontrado.');
    const iniciativa = repoBuscarPorId('INICIATIVAS', actual.ID_INICIATIVA);
    exigir_(String(actual.VERSION_REGLAS) === String(iniciativa.VERSION_REGLAS), 'VERSION_ANTIGUA', 'Solo puede desactivar requisitos de la versión vigente.');
    const result = crearNuevaVersionReglas_(iniciativa, function(reglas) {
      return reglas.filter(function(r) { return r.ID_REQUISITO !== id; });
    }, 'Desactivar requisito: ' + motivo, user);
    return respuestaOk(result);
  } catch (error) {
    return manejarError_(error, 'apiDesactivarRequisito');
  }
}

function apiCrearPostulacion(data) {
  try {
    const user = exigirPermiso_('POSTULACION_EDITAR');
    exigir_(data && data.ID_INICIATIVA && data.ID_EMPRENDIMIENTO, 'DATOS_INCOMPLETOS', 'Iniciativa y emprendimiento son obligatorios.');
    const iniciativa = repoBuscarPorId('INICIATIVAS', data.ID_INICIATIVA);
    const emprendimiento = repoBuscarPorId('EMPRENDIMIENTOS', data.ID_EMPRENDIMIENTO);
    exigir_(iniciativa && emprendimiento, 'NO_ENCONTRADO', 'No se encontró la iniciativa o el emprendimiento.');
    exigir_(iniciativa.ESTADO === 'ABIERTA' || user.ROL === APP.ROLES.ADMIN, 'INICIATIVA_NO_ABIERTA', 'La iniciativa no está abierta para postulaciones.');
    if (data.ID_PERSONA_CONTACTO) {
      exigir_(repoBuscarPorId('PERSONAS', data.ID_PERSONA_CONTACTO), 'PERSONA_NO_ENCONTRADA', 'La persona de contacto no existe.');
    }
    const exists = repoListar('POSTULACIONES', { filtro: { ID_INICIATIVA: data.ID_INICIATIVA, ID_EMPRENDIMIENTO: data.ID_EMPRENDIMIENTO }, incluirInactivos: true, limit: 10 });
    exigir_(!exists.length, 'POSTULACION_DUPLICADA', 'Ya existe una postulación para este emprendimiento e iniciativa.');
    return respuestaOk(repoInsertar('POSTULACIONES', Object.assign({}, data, {
      ID_POSTULACION: uuid_(),
      FECHA_POSTULACION: ahoraIso_(),
      ESTADO_POSTULACION: 'RECIBIDA',
      RESPUESTAS_JSON: JSON.stringify(data.RESPUESTAS || {}),
      CREADO_EN: ahoraIso_(),
      CREADO_POR: user.EMAIL,
      ACTUALIZADO_EN: ahoraIso_(),
      ACTUALIZADO_POR: user.EMAIL
    })));
  } catch (error) {
    return manejarError_(error, 'apiCrearPostulacion');
  }
}

function apiListarCandidatosIniciativa(iniciativaId, query) {
  try {
    exigirPermiso_('POSTULACION_EDITAR');
    const q = normalizarTexto_(query).toLowerCase();
    const existentes = repoTodos('POSTULACIONES', { incluirInactivos: true }).filter(function(p) {
      return String(p.ID_INICIATIVA) === String(iniciativaId);
    });
    const idsExistentes = existentes.reduce(function(out, p) { out[String(p.ID_EMPRENDIMIENTO)] = true; return out; }, {});
    const relaciones = repoTodos('PERSONA_EMPRENDIMIENTO', { incluirInactivos: true });
    const personas = indexarPor_(repoTodos('PERSONAS', { incluirInactivos: true }), 'ID_PERSONA');
    let rows = repoTodos('EMPRENDIMIENTOS', { incluirInactivos: true }).filter(function(e) {
      return e.ESTADO_EMPRENDIMIENTO !== 'CERRADO' &&
             (!q || [e.NOMBRE_COMERCIAL, e.ID_RUBRO, e.TERRITORIO_OPERACION].join(' ').toLowerCase().indexOf(q) >= 0);
    }).map(function(e) {
      const rel = relaciones.find(function(r) {
        return String(r.ID_EMPRENDIMIENTO) === String(e.ID_EMPRENDIMIENTO) && r.ESTADO_REGISTRO !== 'INACTIVO' && r.ES_PRINCIPAL === 'SI';
      });
      const p = rel ? personas[String(rel.ID_PERSONA)] : null;
      return {
        ID_EMPRENDIMIENTO: e.ID_EMPRENDIMIENTO,
        CODIGO_EMPRENDIMIENTO: e.CODIGO_EMPRENDIMIENTO,
        NOMBRE_COMERCIAL: e.NOMBRE_COMERCIAL,
        ID_RUBRO: e.ID_RUBRO,
        TERRITORIO_OPERACION: e.TERRITORIO_OPERACION,
        ID_PERSONA_CONTACTO: p ? p.ID_PERSONA : '',
        NOMBRE_CONTACTO: p ? nombrePersona_(p) : '',
        YA_POSTULADO: idsExistentes[String(e.ID_EMPRENDIMIENTO)] ? 'SI' : 'NO'
      };
    });
    rows.sort(function(a, b) {
      return a.YA_POSTULADO.localeCompare(b.YA_POSTULADO) || a.NOMBRE_COMERCIAL.localeCompare(b.NOMBRE_COMERCIAL);
    });
    return respuestaOk(rows.slice(0, 100));
  } catch (error) {
    return manejarError_(error, 'apiListarCandidatosIniciativa');
  }
}

function apiCrearPostulacionesMasivas(iniciativaId, candidatos, evaluarAhora) {
  try {
    exigirPermiso_('POSTULACION_EDITAR');
    exigir_(Array.isArray(candidatos) && candidatos.length, 'SIN_SELECCION', 'Seleccione al menos un emprendimiento.');
    exigir_(candidatos.length <= 100, 'LIMITE_MASIVO', 'Puede incorporar hasta 100 emprendimientos por vez.');
    const resumen = { creadas: 0, duplicadas: 0, errores: 0, evaluadas: 0, detalle: [] };
    candidatos.forEach(function(item) {
      const result = apiCrearPostulacion({
        ID_INICIATIVA: iniciativaId,
        ID_EMPRENDIMIENTO: item.ID_EMPRENDIMIENTO,
        ID_PERSONA_CONTACTO: item.ID_PERSONA_CONTACTO || '',
        RESPUESTAS: { ORIGEN: 'INCORPORACION_MASIVA' }
      });
      if (!result.ok) {
        if (result.error && result.error.code === 'POSTULACION_DUPLICADA') resumen.duplicadas++;
        else resumen.errores++;
        resumen.detalle.push({ id: item.ID_EMPRENDIMIENTO, ok: false, mensaje: result.error && result.error.message });
        return;
      }
      resumen.creadas++;
      resumen.detalle.push({ id: item.ID_EMPRENDIMIENTO, ok: true, postulacionId: result.data.ID_POSTULACION });
      if (evaluarAhora) {
        const ev = apiEvaluarAdmisibilidadAutomatica(result.data.ID_POSTULACION);
        if (ev.ok) resumen.evaluadas++;
      }
    });
    return respuestaOk(resumen);
  } catch (error) {
    return manejarError_(error, 'apiCrearPostulacionesMasivas');
  }
}

function indexarPor_(rows, campo) {
  return rows.reduce(function(out, row) {
    out[String(row[campo])] = row;
    return out;
  }, {});
}

function mapasPostulaciones_() {
  return {
    iniciativas: indexarPor_(repoTodos('INICIATIVAS', { incluirInactivos: true }), 'ID_INICIATIVA'),
    emprendimientos: indexarPor_(repoTodos('EMPRENDIMIENTOS', { incluirInactivos: true }), 'ID_EMPRENDIMIENTO'),
    personas: indexarPor_(repoTodos('PERSONAS', { incluirInactivos: true }), 'ID_PERSONA')
  };
}

function enriquecerPostulacion_(p, mapas) {
  mapas = mapas || mapasPostulaciones_();
  const i = mapas.iniciativas[String(p.ID_INICIATIVA)];
  const e = mapas.emprendimientos[String(p.ID_EMPRENDIMIENTO)];
  const persona = p.ID_PERSONA_CONTACTO ? mapas.personas[String(p.ID_PERSONA_CONTACTO)] : null;
  return Object.assign({}, p, {
    NOMBRE_INICIATIVA: i ? i.NOMBRE : '',
    NOMBRE_EMPRENDIMIENTO: e ? e.NOMBRE_COMERCIAL : '',
    NOMBRE_CONTACTO: persona ? [persona.NOMBRES, persona.APELLIDO_PATERNO].filter(Boolean).join(' ') : '',
    CORREO_CONTACTO: persona ? persona.EMAIL_NORMALIZADO : '',
    TELEFONO_CONTACTO: persona ? persona.TELEFONO_NORMALIZADO : ''
  });
}

function apiListarPostulaciones(filtros) {
  try {
    usuarioActual_();
    filtros = filtros || {};
    const q = normalizarTexto_(filtros.q).toLowerCase();
    const mapas = mapasPostulaciones_();
    let rows = repoTodos('POSTULACIONES', { incluirInactivos: true }).map(function(p) {
      return enriquecerPostulacion_(p, mapas);
    });
    if (q) {
      rows = rows.filter(function(p) {
        return [p.NOMBRE_INICIATIVA, p.NOMBRE_EMPRENDIMIENTO, p.NOMBRE_CONTACTO, p.ESTADO_POSTULACION].join(' ').toLowerCase().indexOf(q) >= 0;
      });
    }
    if (filtros.estado) rows = rows.filter(function(p) { return p.ESTADO_POSTULACION === filtros.estado; });
    if (filtros.iniciativaId) rows = rows.filter(function(p) { return String(p.ID_INICIATIVA) === String(filtros.iniciativaId); });
    rows.sort(function(a, b) { return String(b.FECHA_POSTULACION).localeCompare(String(a.FECHA_POSTULACION)); });
    const total = rows.length, offset = Math.max(0, Number(filtros.offset || 0)), limit = Math.min(100, Math.max(10, Number(filtros.limit || 25)));
    return respuestaOk({ filas: rows.slice(offset, offset + limit), total: total, offset: offset, limit: limit });
  } catch (error) {
    return manejarError_(error, 'apiListarPostulaciones');
  }
}

function apiObtenerPostulacion(id) {
  try {
    usuarioActual_();
    const p = repoBuscarPorId('POSTULACIONES', id);
    exigir_(p, 'NO_ENCONTRADO', 'Postulación no encontrada.');
    const admisiones = repoTodos('ADMISIONES', { incluirInactivos: true }).filter(function(a) {
      return String(a.ID_POSTULACION) === String(id);
    }).map(function(a) {
      const r = repoBuscarPorId('REQUISITOS', a.ID_REQUISITO);
      return Object.assign({}, a, {
        CAMPO: r ? r.CAMPO : '',
        OPERADOR: r ? r.OPERADOR : '',
        VALOR_ESPERADO: r ? r.VALOR_ESPERADO : '',
        ES_SUBSANABLE: r ? r.ES_SUBSANABLE : ''
      });
    }).sort(function(a, b) { return String(b.EVALUADO_EN).localeCompare(String(a.EVALUADO_EN)); });
    return respuestaOk({
      postulacion: enriquecerPostulacion_(p),
      admisiones: admisiones,
      admisionesVigentes: admisiones.filter(function(a) { return a.ES_VIGENTE === 'SI'; }),
      historialAdmisiones: admisiones.filter(function(a) { return a.ES_VIGENTE !== 'SI'; })
    });
  } catch (error) {
    return manejarError_(error, 'apiObtenerPostulacion');
  }
}

function evaluarRegla_(requisito, contexto) {
  const actual = contexto[requisito.CAMPO];
  const expected = requisito.VALOR_ESPERADO;
  switch (requisito.OPERADOR) {
    case 'IGUAL': return String(actual) === String(expected);
    case 'IN': return String(expected).split('|').indexOf(String(actual)) >= 0;
    case 'NO_IN': return String(expected).split('|').indexOf(String(actual)) < 0;
    case 'MAYOR_IGUAL': return Number(actual) >= Number(expected);
    case 'MENOR_IGUAL': return Number(actual) <= Number(expected);
    case 'EXISTE': return actual !== '' && actual != null;
    default: return false;
  }
}

function apiEvaluarAdmisibilidad(postulacionId, contexto) {
  try {
    const user = exigirPermiso_('POSTULACION_EDITAR');
    const post = repoBuscarPorId('POSTULACIONES', postulacionId);
    exigir_(post, 'NO_ENCONTRADO', postulacionId);
    const iniciativa = repoBuscarPorId('INICIATIVAS', post.ID_INICIATIVA);
    const rules = repoTodos('REQUISITOS', { incluirInactivos: true }).filter(function(r) {
      return String(r.ID_INICIATIVA) === String(post.ID_INICIATIVA) &&
             String(r.VERSION_REGLAS) === String(iniciativa.VERSION_REGLAS) &&
             r.ACTIVO === 'SI' &&
             r.TIPO_REGLA === 'ADMISIBILIDAD';
    });
    const ejecucionId = uuid_();
    repoTodos('ADMISIONES', { incluirInactivos: true }).filter(function(a) {
      return String(a.ID_POSTULACION) === String(postulacionId) && a.ES_VIGENTE === 'SI';
    }).forEach(function(a) {
      repoActualizar('ADMISIONES', a.ID_ADMISION, { ES_VIGENTE: 'NO' }, { motivo: 'Nueva evaluación de admisibilidad' });
    });
    let admissible = true, tieneFallaSubsanable = false, tieneFallaNoSubsanable = false;
    const results = rules.map(function(rule) {
      const ok = evaluarRegla_(rule, contexto || {});
      if (!ok) {
        admissible = false;
        if (rule.ES_SUBSANABLE === 'SI') tieneFallaSubsanable = true;
        else tieneFallaNoSubsanable = true;
      }
      return repoInsertar('ADMISIONES', {
        ID_ADMISION: uuid_(),
        ID_POSTULACION: postulacionId,
        ID_REQUISITO: rule.ID_REQUISITO,
        RESULTADO: ok ? 'ADMISIBLE' : (rule.ES_SUBSANABLE === 'SI' ? 'SUBSANABLE' : 'INADMISIBLE'),
        RESULTADO_REGLA: ok ? 'CUMPLE' : 'NO_CUMPLE',
        MOTIVO_EXCLUSION: ok ? '' : 'No cumple: ' + (ETIQUETAS_CATALOGO[rule.CAMPO] || rule.CAMPO),
        EVALUADO_EN: ahoraIso_(),
        EVALUADO_POR: user.EMAIL,
        ID_EJECUCION_ADMISION: ejecucionId,
        ES_VIGENTE: 'SI'
      });
    });
    const state = admissible ? 'ADMISIBLE' : (tieneFallaNoSubsanable ? 'INADMISIBLE' : (tieneFallaSubsanable ? 'SUBSANABLE' : 'INADMISIBLE'));
    repoActualizar('POSTULACIONES', postulacionId, { ESTADO_POSTULACION: state, ACTUALIZADO_EN: ahoraIso_(), ACTUALIZADO_POR: user.EMAIL });
    return respuestaOk({ estado: state, resultados: results, ejecucionId: ejecucionId });
  } catch (error) {
    return manejarError_(error, 'apiEvaluarAdmisibilidad');
  }
}

function construirContextoPostulacion_(post) {
  const emp = repoBuscarPorId('EMPRENDIMIENTOS', post.ID_EMPRENDIMIENTO);
  exigir_(emp, 'EMPRENDIMIENTO_NO_ENCONTRADO', post.ID_EMPRENDIMIENTO);
  let persona = post.ID_PERSONA_CONTACTO ? repoBuscarPorId('PERSONAS', post.ID_PERSONA_CONTACTO) : null;
  if (!persona) {
    const rel = repoTodos('PERSONA_EMPRENDIMIENTO', { incluirInactivos: true }).find(function(r) {
      return String(r.ID_EMPRENDIMIENTO) === String(emp.ID_EMPRENDIMIENTO) && r.ESTADO_REGISTRO !== 'INACTIVO' && r.ES_PRINCIPAL === 'SI';
    });
    if (rel) persona = repoBuscarPorId('PERSONAS', rel.ID_PERSONA);
  }
  const docEmp = resumenDocumental_('EMPRENDIMIENTO', emp.ID_EMPRENDIMIENTO);
  const docPersona = persona ? resumenDocumental_('PERSONA', persona.ID_PERSONA) : { COMPLETO: 'NO' };
  const habilitacion = habilitacionMercados_(emp.ID_EMPRENDIMIENTO);
  return {
    ID_RUBRO: emp.ID_RUBRO,
    ID_SUBRUBRO: emp.ID_SUBRUBRO,
    FORMALIZACION: emp.FORMALIZACION,
    ETAPA_ACTUAL: emp.ETAPA_ACTUAL,
    ESTADO_EMPRENDIMIENTO: emp.ESTADO_EMPRENDIMIENTO,
    COMUNA_PERSONA: persona ? persona.COMUNA_RESIDENCIA : '',
    GENERO_PERSONA: persona ? persona.GENERO : '',
    DISCAPACIDAD_DECLARADA: persona ? persona.DISCAPACIDAD_DECLARADA : '',
    DOCUMENTACION_PERSONA_COMPLETA: docPersona.COMPLETO,
    DOCUMENTACION_EMPRENDIMIENTO_COMPLETA: docEmp.COMPLETO,
    HABILITADO_MERCADOS: habilitacion.HABILITADO
  };
}

function apiEvaluarAdmisibilidadAutomatica(postulacionId) {
  try {
    const post = repoBuscarPorId('POSTULACIONES', postulacionId);
    exigir_(post, 'NO_ENCONTRADO', 'Postulación no encontrada.');
    return apiEvaluarAdmisibilidad(postulacionId, construirContextoPostulacion_(post));
  } catch (error) {
    return manejarError_(error, 'apiEvaluarAdmisibilidadAutomatica');
  }
}

function apiEvaluarAdmisibilidadMasiva(iniciativaId) {
  try {
    exigirPermiso_('POSTULACION_EDITAR');
    const posts = repoTodos('POSTULACIONES', { incluirInactivos: true }).filter(function(p) {
      return String(p.ID_INICIATIVA) === String(iniciativaId) && p.ESTADO_POSTULACION !== 'RETIRADA';
    });
    exigir_(posts.length, 'SIN_POSTULACIONES', 'La iniciativa no tiene postulaciones para evaluar.');
    const resumen = { total: posts.length, admisibles: 0, subsanables: 0, inadmisibles: 0, errores: 0 };
    posts.forEach(function(p) {
      const r = apiEvaluarAdmisibilidadAutomatica(p.ID_POSTULACION);
      if (!r.ok) {
        resumen.errores++;
        return;
      }
      const key = String(r.data.estado || '').toLowerCase() + 's';
      if (Object.prototype.hasOwnProperty.call(resumen, key)) resumen[key]++;
    });
    return respuestaOk(resumen);
  } catch (error) {
    return manejarError_(error, 'apiEvaluarAdmisibilidadMasiva');
  }
}

function apiRetirarPostulacion(id, motivo) {
  try {
    const user = exigirPermiso_('POSTULACION_EDITAR');
    exigir_(motivo, 'MOTIVO_OBLIGATORIO', 'Debe indicar el motivo.');
    return respuestaOk(repoActualizar('POSTULACIONES', id, {
      ESTADO_POSTULACION: 'RETIRADA',
      ACTUALIZADO_EN: ahoraIso_(),
      ACTUALIZADO_POR: user.EMAIL
    }, { motivo: motivo }));
  } catch (error) {
    return manejarError_(error, 'apiRetirarPostulacion');
  }
}
