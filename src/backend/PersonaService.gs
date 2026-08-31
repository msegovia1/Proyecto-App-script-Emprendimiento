// ===== PersonaService.gs =====
// SGE v2.1.0 - Ficha integral del emprendedor
// Gestión del registro de personas, detección de duplicados y actualización de titulares

/**
 * Detecta duplicados potenciales de persona comparando RUT, email, teléfono o nombre + fecha de nacimiento.
 */
function buscarDuplicadosPersona_(data, excluirId) {
  const n = normalizarPersona_(data);
  const all = repoTodos('PERSONAS', { incluirInactivos: false }).filter(function(p) {
    return String(p.ID_PERSONA) !== String(excluirId || '');
  });
  return all.filter(function(p) {
    if (n.RUT_NORMALIZADO && p.RUT_NORMALIZADO === n.RUT_NORMALIZADO) return true;
    if (n.EMAIL_NORMALIZADO && p.EMAIL_NORMALIZADO === n.EMAIL_NORMALIZADO) return true;
    if (n.TELEFONO_NORMALIZADO && p.TELEFONO_NORMALIZADO === n.TELEFONO_NORMALIZADO) return true;
    const sameName = normalizarTexto_(p.NOMBRES).toLowerCase() === n.NOMBRES.toLowerCase() &&
                     normalizarTexto_(p.APELLIDO_PATERNO).toLowerCase() === n.APELLIDO_PATERNO.toLowerCase();
    return sameName && String(p.FECHA_NACIMIENTO || '') === String(n.FECHA_NACIMIENTO || '');
  });
}

/**
 * Crea una nueva persona aplicando normalización, validación y control de duplicados.
 */
function crearPersona_(data) {
  const user = exigirPermiso_('PERSONA_EDITAR');
  return conBloqueoSistema_(function() {
    const value = normalizarPersona_(data || {});
    exigir_(value.NOMBRES && value.APELLIDO_PATERNO, 'DATOS_INCOMPLETOS', 'Nombres y apellido paterno son obligatorios.');
    if (value.RUT_NORMALIZADO) exigir_(validarRut_(value.RUT_NORMALIZADO), 'RUT_INVALIDO', 'El RUT ingresado no es válido.');
    const duplicates = buscarDuplicadosPersona_(value);
    value.ESTADO_REGISTRO = duplicates.length ? 'POSIBLE_DUPLICADO' : 'ACTIVO';
    value.ID_PERSONA = uuid_();
    value.CREADO_EN = ahoraIso_();
    value.CREADO_POR = user.EMAIL;
    value.ACTUALIZADO_EN = value.CREADO_EN;
    value.ACTUALIZADO_POR = user.EMAIL;
    return repoInsertar('PERSONAS', value);
  });
}

function apiCrearPersona(data) {
  try {
    return respuestaOk(crearPersona_(data));
  } catch (error) {
    return manejarError_(error, 'apiCrearPersona');
  }
}

function apiBuscarPersonas(query) {
  try {
    exigirPermiso_('PERSONA_VER');
    const q = normalizarTexto_(query).toLowerCase();
    const rows = repoTodos('PERSONAS', { incluirInactivos: false }).filter(function(p) {
      return [p.CODIGO_PERSONA, p.RUT_NORMALIZADO, p.NOMBRES, p.APELLIDO_PATERNO, p.APELLIDO_MATERNO, p.EMAIL_NORMALIZADO, p.TELEFONO_NORMALIZADO]
        .join(' ').toLowerCase().indexOf(q) >= 0;
    }).slice(0, APP.PAGE_SIZE);
    return respuestaOk(rows);
  } catch (error) {
    return manejarError_(error, 'apiBuscarPersonas');
  }
}

function apiListarPersonas(filtros) {
  try {
    exigirPermiso_('PERSONA_VER');
    filtros = filtros || {};
    const q = normalizarTexto_(filtros.q).toLowerCase();
    let rows = repoTodos('PERSONAS', { incluirInactivos: true });
    if (q) {
      rows = rows.filter(function(p) {
        return [p.CODIGO_PERSONA, p.RUT_NORMALIZADO, p.NOMBRES, p.APELLIDO_PATERNO, p.APELLIDO_MATERNO, p.EMAIL_NORMALIZADO, p.TELEFONO_NORMALIZADO, p.COMUNA_RESIDENCIA]
          .join(' ').toLowerCase().indexOf(q) >= 0;
      });
    }
    if (filtros.estado) rows = rows.filter(function(p) { return String(p.ESTADO_REGISTRO) === String(filtros.estado); });
    if (filtros.comuna) rows = rows.filter(function(p) { return normalizarTexto_(p.COMUNA_RESIDENCIA).toLowerCase() === normalizarTexto_(filtros.comuna).toLowerCase(); });
    rows.sort(function(a, b) { return String(b.ACTUALIZADO_EN || b.CREADO_EN).localeCompare(String(a.ACTUALIZADO_EN || a.CREADO_EN)); });
    const total = rows.length;
    const offset = Math.max(0, Number(filtros.offset || 0));
    const limit = Math.min(100, Math.max(10, Number(filtros.limit || 25)));
    return respuestaOk({ filas: rows.slice(offset, offset + limit), total: total, offset: offset, limit: limit });
  } catch (error) {
    return manejarError_(error, 'apiListarPersonas');
  }
}

function apiObtenerPersona(id) {
  try {
    exigirPermiso_('PERSONA_VER');
    const persona = repoBuscarPorId('PERSONAS', id);
    exigir_(persona, 'NO_ENCONTRADO', 'Persona no encontrada.');
    const relaciones = repoTodos('PERSONA_EMPRENDIMIENTO', { incluirInactivos: true })
      .filter(function(r) { return String(r.ID_PERSONA) === String(id) && r.ESTADO_REGISTRO !== 'INACTIVO'; })
      .map(function(r) {
        const emprendimiento = repoBuscarPorId('EMPRENDIMIENTOS', r.ID_EMPRENDIMIENTO);
        return Object.assign({}, r, { EMPRENDIMIENTO: emprendimiento || null });
      });
    return respuestaOk({ persona: persona, relaciones: relaciones });
  } catch (error) {
    return manejarError_(error, 'apiObtenerPersona');
  }
}

function apiActualizarPersona(id, data) {
  try {
    const user = exigirPermiso_('PERSONA_EDITAR');
    const actual = repoBuscarPorId('PERSONAS', id);
    exigir_(actual, 'NO_ENCONTRADO', 'Persona no encontrada.');
    const value = normalizarPersona_(Object.assign({}, actual, data || {}));
    exigir_(value.NOMBRES && value.APELLIDO_PATERNO, 'DATOS_INCOMPLETOS', 'Nombres y apellido paterno son obligatorios.');
    if (value.RUT_NORMALIZADO) exigir_(validarRut_(value.RUT_NORMALIZADO), 'RUT_INVALIDO', 'El RUT ingresado no es válido.');
    const duplicates = buscarDuplicadosPersona_(value, id);
    if (actual.ESTADO_REGISTRO !== 'INACTIVO') {
      value.ESTADO_REGISTRO = duplicates.length ? 'POSIBLE_DUPLICADO' : (data.ESTADO_REGISTRO || actual.ESTADO_REGISTRO || 'ACTIVO');
    }
    value.ACTUALIZADO_EN = ahoraIso_();
    value.ACTUALIZADO_POR = user.EMAIL;
    return respuestaOk(repoActualizar('PERSONAS', id, value));
  } catch (error) {
    return manejarError_(error, 'apiActualizarPersona');
  }
}

function apiCambiarEstadoPersona(id, estado, motivo) {
  try {
    const user = exigirPermiso_('PERSONA_EDITAR');
    exigir_(CATALOGOS_INICIALES.ESTADO_REGISTRO.indexOf(estado) >= 0, 'ESTADO_INVALIDO', estado);
    exigir_(motivo, 'MOTIVO_OBLIGATORIO', 'Debe indicar el motivo del cambio.');
    return respuestaOk(repoActualizar('PERSONAS', id, {
      ESTADO_REGISTRO: estado,
      ACTUALIZADO_EN: ahoraIso_(),
      ACTUALIZADO_POR: user.EMAIL
    }, { motivo: motivo }));
  } catch (error) {
    return manejarError_(error, 'apiCambiarEstadoPersona');
  }
}

function apiDesactivarRegistroDuplicado(tipo, id, motivo) {
  try {
    exigir_(motivo, 'MOTIVO_OBLIGATORIO', 'Explique brevemente por qué la ficha es duplicada.');
    tipo = String(tipo || '').toUpperCase();
    if (tipo === 'PERSONA') {
      const user = exigirPermiso_('PERSONA_EDITAR');
      const actual = repoBuscarPorId('PERSONAS', id);
      exigir_(actual, 'NO_ENCONTRADO', 'No se encontró la persona.');
      const result = repoActualizar('PERSONAS', id, {
        ESTADO_REGISTRO: 'INACTIVO',
        ACTUALIZADO_EN: ahoraIso_(),
        ACTUALIZADO_POR: user.EMAIL
      }, { motivo: 'Ficha duplicada: ' + motivo });
      return respuestaOk({ mensaje: 'La ficha duplicada fue desactivada. El historial se conserva.', registro: result });
    }
    if (tipo === 'EMPRENDIMIENTO') {
      const user = exigirPermiso_('EMPRENDIMIENTO_EDITAR');
      const actual = repoBuscarPorId('EMPRENDIMIENTOS', id);
      exigir_(actual, 'NO_ENCONTRADO', 'No se encontró el emprendimiento.');
      const result = repoActualizar('EMPRENDIMIENTOS', id, {
        ESTADO_EMPRENDIMIENTO: 'CERRADO',
        ACTUALIZADO_EN: ahoraIso_(),
        ACTUALIZADO_POR: user.EMAIL
      }, { motivo: 'Ficha duplicada: ' + motivo });
      return respuestaOk({ mensaje: 'El emprendimiento duplicado fue desactivado. El historial se conserva.', registro: result });
    }
    exigir_(false, 'TIPO_INVALIDO', 'Seleccione persona o emprendimiento.');
  } catch (error) {
    return manejarError_(error, 'apiDesactivarRegistroDuplicado');
  }
}

function duplicadoPersonaExacto_(data) {
  const n = normalizarPersona_(data || {});
  const personas = repoTodos('PERSONAS', { incluirInactivos: false });
  if (n.RUT_NORMALIZADO) {
    return personas.find(function(p) { return p.RUT_NORMALIZADO === n.RUT_NORMALIZADO; }) || null;
  }
  return personas.find(function(p) {
    return n.EMAIL_NORMALIZADO && n.TELEFONO_NORMALIZADO &&
      p.EMAIL_NORMALIZADO === n.EMAIL_NORMALIZADO &&
      p.TELEFONO_NORMALIZADO === n.TELEFONO_NORMALIZADO;
  }) || null;
}

function apiRegistroCompleto(data) {
  try {
    exigirPermiso_('PERSONA_EDITAR');
    exigirPermiso_('EMPRENDIMIENTO_EDITAR');
    return conBloqueoSistema_(function() {
      data = data || {};
      const personaData = data.PERSONA || {};
      const empData = data.EMPRENDIMIENTO || {};
      let persona = duplicadoPersonaExacto_(personaData);
      let personaReutilizada = !!persona;
      if (!persona) persona = crearPersona_(personaData);
      else persona = actualizarPersonaRegistroIntegral_(persona, personaData, emailActual_());

      const relacionActual = relacionActivaPorSujeto_('PERSONA', persona.ID_PERSONA);
      let emp = relacionActual ? repoBuscarPorId('EMPRENDIMIENTOS', relacionActual.ID_EMPRENDIMIENTO) : null;
      let empReutilizado = !!emp;
      if (emp) {
        emp = actualizarEmprendimientoRegistroIntegral_(emp, empData, emailActual_());
      } else {
        const candidatos = buscarDuplicadosEmprendimiento_(normalizarEmprendimiento_(empData)).filter(function(e) {
          return !relacionActivaPorSujeto_('EMPRENDIMIENTO', e.ID_EMPRENDIMIENTO);
        });
        emp = candidatos[0] || null;
        empReutilizado = !!emp;
        if (emp) emp = actualizarEmprendimientoRegistroIntegral_(emp, empData, emailActual_());
        else emp = crearEmprendimiento_(empData);
      }
      let relacion = repoTodos('PERSONA_EMPRENDIMIENTO', { incluirInactivos: true }).find(function(r) {
        return String(r.ID_PERSONA) === String(persona.ID_PERSONA) &&
               String(r.ID_EMPRENDIMIENTO) === String(emp.ID_EMPRENDIMIENTO) &&
               r.ESTADO_REGISTRO !== 'INACTIVO';
      }) || null;
      if (!relacion) {
        relacion = vincularPersonaEmprendimiento_(persona.ID_PERSONA, emp.ID_EMPRENDIMIENTO, data.ROL || 'TITULAR', data.ES_PRINCIPAL !== false);
      }
      return respuestaOk({
        persona: persona,
        emprendimiento: emp,
        relacion: relacion,
        personaReutilizada: personaReutilizada,
        emprendimientoReutilizado: empReutilizado
      });
    });
  } catch (error) {
    return manejarError_(error, 'apiRegistroCompleto');
  }
}

function actualizarPersonaRegistroIntegral_(persona, data, actor) {
  const value = normalizarPersona_(Object.assign({}, persona, data || {}));
  ['NOMBRES', 'APELLIDO_PATERNO', 'APELLIDO_MATERNO', 'FECHA_NACIMIENTO', 'GENERO', 'DISCAPACIDAD_DECLARADA', 'EMAIL_NORMALIZADO', 'TELEFONO_NORMALIZADO', 'COMUNA_RESIDENCIA'].forEach(function(k) {
    if (!normalizarTexto_(value[k])) value[k] = persona[k] || '';
  });
  value.ACTUALIZADO_EN = ahoraIso_();
  value.ACTUALIZADO_POR = actor || emailActual_();
  return repoActualizar('PERSONAS', persona.ID_PERSONA, value, { motivo: 'Actualización desde ficha integral' });
}

function actualizarEmprendimientoRegistroIntegral_(emp, data, actor) {
  const value = normalizarEmprendimiento_(Object.assign({}, emp, data || {}));
  value.ACTUALIZADO_EN = ahoraIso_();
  value.ACTUALIZADO_POR = actor || emailActual_();
  return repoActualizar('EMPRENDIMIENTOS', emp.ID_EMPRENDIMIENTO, value, { motivo: 'Actualización desde ficha integral' });
}
