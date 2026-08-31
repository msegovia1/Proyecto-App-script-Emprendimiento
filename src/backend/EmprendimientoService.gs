// ===== EmprendimientoService.gs =====
// SGE v2.1.0 - Ficha integral del emprendedor
// Gestión de emprendimientos, vinculación de representantes y evaluación de etapa

function crearEmprendimiento_(data) {
  const user = exigirPermiso_('EMPRENDIMIENTO_EDITAR');
  return conBloqueoSistema_(function() {
    const value = normalizarEmprendimiento_(data || {});
    exigir_(normalizarTexto_(value.NOMBRE_COMERCIAL), 'DATOS_INCOMPLETOS', 'El nombre comercial es obligatorio.');
    exigir_(!buscarDuplicadosEmprendimiento_(value).length, 'EMPRENDIMIENTO_DUPLICADO', 'Ya existe un emprendimiento activo con el mismo nombre y rubro. Revise su ficha antes de crear otro.');
    value.ID_EMPRENDIMIENTO = uuid_();
    value.ETAPA_ACTUAL = value.ETAPA_ACTUAL || 'ARRANQUE';
    value.ESTADO_EMPRENDIMIENTO = value.ESTADO_EMPRENDIMIENTO || 'ACTIVO';
    value.CREADO_EN = ahoraIso_();
    value.CREADO_POR = user.EMAIL;
    value.ACTUALIZADO_EN = value.CREADO_EN;
    value.ACTUALIZADO_POR = user.EMAIL;
    return repoInsertar('EMPRENDIMIENTOS', value);
  });
}

function buscarDuplicadosEmprendimiento_(data, excluirId) {
  const nombre = normalizarTexto_(data.NOMBRE_COMERCIAL).toLowerCase();
  const rubro = normalizarTexto_(data.ID_RUBRO).toUpperCase();
  return repoTodos('EMPRENDIMIENTOS', { incluirInactivos: true }).filter(function(e) {
    if (String(e.ID_EMPRENDIMIENTO) === String(excluirId || '') || e.ESTADO_EMPRENDIMIENTO === 'CERRADO') return false;
    return normalizarTexto_(e.NOMBRE_COMERCIAL).toLowerCase() === nombre && normalizarTexto_(e.ID_RUBRO).toUpperCase() === rubro;
  });
}

function normalizarEmprendimiento_(data) {
  const value = Object.assign({}, data || {});
  ['NOMBRE_COMERCIAL', 'DESCRIPCION', 'TERRITORIO_OPERACION', 'INSTAGRAM', 'FACEBOOK', 'TIKTOK', 'SITIO_WEB'].forEach(function(campo) {
    value[campo] = normalizarTexto_(value[campo]);
  });
  ['ID_RUBRO', 'ID_SUBRUBRO', 'FORMALIZACION', 'DEDICACION', 'CANAL_VENTA', 'ETAPA_ACTUAL', 'ESTADO_EMPRENDIMIENTO', 'ORIGEN_ATENCION'].forEach(function(campo) {
    value[campo] = normalizarTexto_(value[campo]).toUpperCase().replace(/\s+/g, '_');
  });
  return value;
}

function calcularClasificacionAutomatica_(datos) {
  datos = datos || {};
  const meses = Math.max(0, Number(datos.MESES_FUNCIONAMIENTO || 0));
  const ventas = Math.max(0, Number(datos.VENTAS_MENSUALES || 0));
  const trabajadores = Math.max(0, Number(datos.TRABAJADORES || 0));
  const formalizacion = String(datos.FORMALIZACION || 'SIN_INICIO');
  const puntos = {
    trayectoria: meses < 6 ? 0 : meses <= 24 ? 1 : 2,
    ventas: ventas < 300000 ? 0 : ventas < 1500000 ? 1 : 2,
    equipo: trabajadores < 1 ? 0 : trabajadores <= 2 ? 1 : 2,
    formalizacion: formalizacion === 'SIN_INICIO' ? 0 : formalizacion === 'INICIO_ACTIVIDADES' ? 1 : 2,
    canalDigital: String(datos.VENTA_DIGITAL || '').toUpperCase() === 'SI' ? 1 : 0,
    registrosGestion: String(datos.REGISTROS_GESTION || '').toUpperCase() === 'SI' ? 1 : 0
  };
  const total = Object.keys(puntos).reduce(function(sum, key) { return sum + puntos[key]; }, 0);
  const clasificacion = total <= 3 ? 'ARRANQUE' : total <= 7 ? 'DESARROLLO' : 'CONSOLIDACION';
  return {
    PUNTAJE: total,
    CLASIFICACION: clasificacion,
    DIMENSIONES: Object.assign({}, datos, { PUNTAJES: puntos }),
    EXPLICACION: 'Resultado orientativo: 0 a 3 etapa inicial, 4 a 7 en desarrollo y 8 a 10 consolidado. El funcionario debe confirmar el resultado con antecedentes de la entrevista.'
  };
}

function apiSugerirClasificacion(datos) {
  try {
    exigirPermiso_('EMPRENDIMIENTO_EDITAR');
    return respuestaOk(calcularClasificacionAutomatica_(datos));
  } catch (error) {
    return manejarError_(error, 'apiSugerirClasificacion');
  }
}

function vincularPersonaEmprendimiento_(personaId, emprendimientoId, rol, principal) {
  exigirPermiso_('EMPRENDIMIENTO_EDITAR');
  exigir_(repoBuscarPorId('PERSONAS', personaId), 'PERSONA_NO_ENCONTRADA', personaId);
  exigir_(repoBuscarPorId('EMPRENDIMIENTOS', emprendimientoId), 'EMPRENDIMIENTO_NO_ENCONTRADO', emprendimientoId);
  const relacionesActivas = repoTodos('PERSONA_EMPRENDIMIENTO', { incluirInactivos: true }).filter(function(r) {
    return r.ESTADO_REGISTRO !== 'INACTIVO';
  });
  const existentes = relacionesActivas.filter(function(r) {
    return String(r.ID_PERSONA) === String(personaId) && String(r.ID_EMPRENDIMIENTO) === String(emprendimientoId);
  });
  exigir_(!existentes.length, 'RELACION_DUPLICADA', 'La persona ya está vinculada con este emprendimiento.');
  exigir_(!relacionesActivas.some(function(r) { return String(r.ID_PERSONA) === String(personaId); }), 'PERSONA_YA_VINCULADA', 'La persona ya tiene un emprendimiento. Abra su ficha integral para actualizarlo.');
  exigir_(!relacionesActivas.some(function(r) { return String(r.ID_EMPRENDIMIENTO) === String(emprendimientoId); }), 'EMPRENDIMIENTO_YA_VINCULADO', 'El emprendimiento ya tiene una persona titular.');
  return repoInsertar('PERSONA_EMPRENDIMIENTO', {
    ID_RELACION: uuid_(),
    ID_PERSONA: personaId,
    ID_EMPRENDIMIENTO: emprendimientoId,
    ROL: 'TITULAR',
    ES_PRINCIPAL: 'SI',
    DESDE: ahoraIso_(),
    HASTA: '',
    ESTADO_REGISTRO: 'ACTIVO',
    CREADO_EN: ahoraIso_(),
    CREADO_POR: emailActual_()
  });
}

function desmarcarPrincipales_(emprendimientoId, motivo, excluirRelacionId) {
  repoTodos('PERSONA_EMPRENDIMIENTO', { incluirInactivos: true }).filter(function(r) {
    return String(r.ID_EMPRENDIMIENTO) === String(emprendimientoId) &&
           r.ES_PRINCIPAL === 'SI' &&
           r.ESTADO_REGISTRO !== 'INACTIVO' &&
           String(r.ID_RELACION) !== String(excluirRelacionId || '');
  }).forEach(function(r) {
    repoActualizar('PERSONA_EMPRENDIMIENTO', r.ID_RELACION, { ES_PRINCIPAL: 'NO' }, { motivo: motivo || 'Cambio de representante principal' });
  });
}

function apiCrearEmprendimiento(data) {
  try {
    return respuestaOk(crearEmprendimiento_(data));
  } catch (error) {
    return manejarError_(error, 'apiCrearEmprendimiento');
  }
}

function apiVincularRepresentante(personaId, emprendimientoId, rol, principal) {
  try {
    return respuestaOk(vincularPersonaEmprendimiento_(personaId, emprendimientoId, rol, principal));
  } catch (error) {
    return manejarError_(error, 'apiVincularRepresentante');
  }
}

function apiBuscarEmprendimientos(query) {
  try {
    exigirPermiso_('EMPRENDIMIENTO_VER');
    const q = normalizarTexto_(query).toLowerCase();
    return respuestaOk(repoTodos('EMPRENDIMIENTOS', { incluirInactivos: true }).filter(function(e) {
      return e.ESTADO_EMPRENDIMIENTO !== 'CERRADO' &&
             [e.CODIGO_EMPRENDIMIENTO, e.NOMBRE_COMERCIAL, e.DESCRIPCION, e.ID_RUBRO, e.ID_SUBRUBRO, e.TERRITORIO_OPERACION, e.INSTAGRAM, e.FACEBOOK, e.TIKTOK, e.SITIO_WEB]
             .join(' ').toLowerCase().indexOf(q) >= 0;
    }).slice(0, APP.PAGE_SIZE));
  } catch (error) {
    return manejarError_(error, 'apiBuscarEmprendimientos');
  }
}

function apiListarEmprendimientos(filtros) {
  try {
    exigirPermiso_('EMPRENDIMIENTO_VER');
    filtros = filtros || {};
    const q = normalizarTexto_(filtros.q).toLowerCase();
    let rows = repoTodos('EMPRENDIMIENTOS', { incluirInactivos: true });
    if (q) {
      rows = rows.filter(function(e) {
        return [e.CODIGO_EMPRENDIMIENTO, e.NOMBRE_COMERCIAL, e.DESCRIPCION, e.ID_RUBRO, e.ID_SUBRUBRO, e.TERRITORIO_OPERACION, e.INSTAGRAM, e.FACEBOOK, e.TIKTOK, e.SITIO_WEB]
          .join(' ').toLowerCase().indexOf(q) >= 0;
      });
    }
    ['ESTADO_EMPRENDIMIENTO', 'ETAPA_ACTUAL', 'FORMALIZACION', 'ID_RUBRO'].forEach(function(campo) {
      const clave = { ESTADO_EMPRENDIMIENTO: 'estado', ETAPA_ACTUAL: 'etapa', FORMALIZACION: 'formalizacion', ID_RUBRO: 'rubro' }[campo];
      if (filtros[clave]) rows = rows.filter(function(e) { return String(e[campo]) === String(filtros[clave]); });
    });
    rows.sort(function(a, b) { return String(b.ACTUALIZADO_EN || b.CREADO_EN).localeCompare(String(a.ACTUALIZADO_EN || a.CREADO_EN)); });
    const total = rows.length, offset = Math.max(0, Number(filtros.offset || 0)), limit = Math.min(100, Math.max(10, Number(filtros.limit || 25)));
    return respuestaOk({ filas: rows.slice(offset, offset + limit), total: total, offset: offset, limit: limit });
  } catch (error) {
    return manejarError_(error, 'apiListarEmprendimientos');
  }
}

function apiObtenerEmprendimiento(id) {
  try {
    exigirPermiso_('EMPRENDIMIENTO_VER');
    const emprendimiento = repoBuscarPorId('EMPRENDIMIENTOS', id);
    exigir_(emprendimiento, 'NO_ENCONTRADO', 'Emprendimiento no encontrado.');
    const representantes = repoTodos('PERSONA_EMPRENDIMIENTO', { incluirInactivos: true }).filter(function(r) {
      return String(r.ID_EMPRENDIMIENTO) === String(id) && r.ESTADO_REGISTRO !== 'INACTIVO';
    }).map(function(r) {
      return Object.assign({}, r, { PERSONA: repoBuscarPorId('PERSONAS', r.ID_PERSONA) });
    });
    representantes.sort(function(a, b) { return (b.ES_PRINCIPAL === 'SI') - (a.ES_PRINCIPAL === 'SI'); });
    const evaluaciones = repoTodos('EVALUACIONES_EMPRENDIMIENTO', { incluirInactivos: true }).filter(function(e) {
      return String(e.ID_EMPRENDIMIENTO) === String(id);
    }).sort(function(a, b) { return String(b.FECHA_EVALUACION).localeCompare(String(a.FECHA_EVALUACION)); });
    return respuestaOk({ emprendimiento: emprendimiento, representantes: representantes, evaluaciones: evaluaciones });
  } catch (error) {
    return manejarError_(error, 'apiObtenerEmprendimiento');
  }
}

function apiActualizarEmprendimiento(id, data) {
  try {
    const user = exigirPermiso_('EMPRENDIMIENTO_EDITAR');
    const actual = repoBuscarPorId('EMPRENDIMIENTOS', id);
    exigir_(actual, 'NO_ENCONTRADO', 'Emprendimiento no encontrado.');
    const value = normalizarEmprendimiento_(Object.assign({}, actual, data || {}));
    exigir_(value.NOMBRE_COMERCIAL, 'DATOS_INCOMPLETOS', 'El nombre comercial es obligatorio.');
    exigir_(!buscarDuplicadosEmprendimiento_(value, id).length, 'EMPRENDIMIENTO_DUPLICADO', 'Existe otro emprendimiento activo con el mismo nombre y rubro.');
    value.ACTUALIZADO_EN = ahoraIso_();
    value.ACTUALIZADO_POR = user.EMAIL;
    return respuestaOk(repoActualizar('EMPRENDIMIENTOS', id, value));
  } catch (error) {
    return manejarError_(error, 'apiActualizarEmprendimiento');
  }
}

function apiCambiarEstadoEmprendimiento(id, estado, motivo) {
  try {
    const user = exigirPermiso_('EMPRENDIMIENTO_EDITAR');
    exigir_(CATALOGOS_INICIALES.ESTADO_EMPRENDIMIENTO.indexOf(estado) >= 0, 'ESTADO_INVALIDO', estado);
    exigir_(motivo, 'MOTIVO_OBLIGATORIO', 'Debe indicar el motivo del cambio.');
    return respuestaOk(repoActualizar('EMPRENDIMIENTOS', id, {
      ESTADO_EMPRENDIMIENTO: estado,
      ACTUALIZADO_EN: ahoraIso_(),
      ACTUALIZADO_POR: user.EMAIL
    }, { motivo: motivo }));
  } catch (error) {
    return manejarError_(error, 'apiCambiarEstadoEmprendimiento');
  }
}

function apiBuscarPersonasParaVincular(query) {
  try {
    exigirPermiso_('PERSONA_VER');
    const q = normalizarTexto_(query).toLowerCase();
    exigir_(q.length >= 2, 'BUSQUEDA_CORTA', 'Ingrese al menos dos caracteres.');
    return respuestaOk(repoTodos('PERSONAS', { incluirInactivos: false }).filter(function(p) {
      return [p.CODIGO_PERSONA, p.RUT_NORMALIZADO, p.NOMBRES, p.APELLIDO_PATERNO, p.APELLIDO_MATERNO, p.EMAIL_NORMALIZADO].join(' ').toLowerCase().indexOf(q) >= 0;
    }).slice(0, 20));
  } catch (error) {
    return manejarError_(error, 'apiBuscarPersonasParaVincular');
  }
}

function apiActualizarRepresentante(idRelacion, rol, principal) {
  try {
    exigirPermiso_('EMPRENDIMIENTO_EDITAR');
    const relacion = repoBuscarPorId('PERSONA_EMPRENDIMIENTO', idRelacion);
    exigir_(relacion && relacion.ESTADO_REGISTRO !== 'INACTIVO', 'NO_ENCONTRADO', 'Relación no encontrada.');
    exigir_(CATALOGOS_INICIALES.ROL_REPRESENTACION.indexOf(rol) >= 0, 'ROL_INVALIDO', rol);
    if (principal) desmarcarPrincipales_(relacion.ID_EMPRENDIMIENTO, 'Cambio de representante principal', idRelacion);
    return respuestaOk(repoActualizar('PERSONA_EMPRENDIMIENTO', idRelacion, {
      ROL: rol,
      ES_PRINCIPAL: principal ? 'SI' : 'NO'
    }, { motivo: 'Actualización de representación' }));
  } catch (error) {
    return manejarError_(error, 'apiActualizarRepresentante');
  }
}

function apiDesvincularRepresentante(idRelacion, motivo) {
  try {
    exigirPermiso_('EMPRENDIMIENTO_EDITAR');
    exigir_(motivo, 'MOTIVO_OBLIGATORIO', 'Debe indicar el motivo de la desvinculación.');
    const relacion = repoBuscarPorId('PERSONA_EMPRENDIMIENTO', idRelacion);
    exigir_(relacion, 'NO_ENCONTRADO', 'Relación no encontrada.');
    return respuestaOk(repoActualizar('PERSONA_EMPRENDIMIENTO', idRelacion, {
      ESTADO_REGISTRO: 'INACTIVO',
      ES_PRINCIPAL: 'NO',
      HASTA: ahoraIso_()
    }, { motivo: motivo }));
  } catch (error) {
    return manejarError_(error, 'apiDesvincularRepresentante');
  }
}

function apiEvaluarEmprendimiento(id, evaluacion) {
  try {
    const user = exigirPermiso_('EMPRENDIMIENTO_EDITAR');
    const emp = repoBuscarPorId('EMPRENDIMIENTOS', id);
    exigir_(emp, 'NO_ENCONTRADO', id);
    evaluacion = evaluacion || {};
    const automatica = evaluacion.DIMENSIONES ? calcularClasificacionAutomatica_(evaluacion.DIMENSIONES) : null;
    const nueva = String(evaluacion.CLASIFICACION || (automatica && automatica.CLASIFICACION) || '').toUpperCase();
    exigir_(CATALOGOS_INICIALES.ETAPA_EMPRENDIMIENTO.indexOf(nueva) >= 0, 'CLASIFICACION_INVALIDA', nueva);
    const ev = repoInsertar('EVALUACIONES_EMPRENDIMIENTO', Object.assign({}, evaluacion, {
      ID_EVALUACION: uuid_(),
      ID_EMPRENDIMIENTO: id,
      FECHA_EVALUACION: ahoraIso_(),
      PUNTAJE: automatica ? automatica.PUNTAJE : evaluacion.PUNTAJE,
      CLASIFICACION: nueva,
      DIMENSIONES_JSON: JSON.stringify(evaluacion.DIMENSIONES || {}),
      EVALUADO_POR: user.EMAIL
    }));
    repoInsertar('CLASIFICACION_HISTORICA', {
      ID_HISTORIAL: uuid_(),
      ID_EMPRENDIMIENTO: id,
      ID_EVALUACION: ev.ID_EVALUACION,
      CLASIFICACION_ANTERIOR: emp.ETAPA_ACTUAL || '',
      CLASIFICACION_NUEVA: nueva,
      DESDE: ahoraIso_(),
      HASTA: '',
      MOTIVO: evaluacion.MOTIVO || 'Evaluación',
      REGISTRADO_POR: user.EMAIL
    });
    repoActualizar('EMPRENDIMIENTOS', id, {
      ETAPA_ACTUAL: nueva,
      ACTUALIZADO_EN: ahoraIso_(),
      ACTUALIZADO_POR: user.EMAIL
    });
    return respuestaOk(ev);
  } catch (error) {
    return manejarError_(error, 'apiEvaluarEmprendimiento');
  }
}
