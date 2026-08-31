// ===== AuditoriaService.gs =====
// SGE v2.1.0 - Ficha integral del emprendedor
// Registro inmutable de eventos, auditoría forense y captura centralizada de errores

/**
 * Registra un evento en la tabla inmutable de auditoría con correlación.
 */
function auditoriaRegistrar_(accion, entidad, idRegistro, anterior, nuevo, motivo, correlacion) {
  try {
    const email = emailActual_() || 'sistema';
    let rol = 'SISTEMA';
    if (entidad !== 'USUARIOS' || repoContar('USUARIOS') > 0) {
      try {
        rol = usuarioActual_().ROL;
      } catch (ignored) {}
    }
    repoInsertar('AUDITORIA', {
      ID_EVENTO_AUDITORIA: uuid_(),
      FECHA_HORA: ahoraIso_(),
      ID_USUARIO: email,
      ROL: rol,
      ACCION: accion,
      ENTIDAD: entidad,
      ID_REGISTRO: idRegistro,
      VALOR_ANTERIOR: anterior ? JSON.stringify(anterior) : '',
      VALOR_NUEVO: nuevo ? JSON.stringify(nuevo) : '',
      MOTIVO: motivo || '',
      ID_CORRELACION: correlacion || uuid_()
    }, { auditar: false });
  } catch (error) {
    console.error('Auditoría no registrada: ' + error.message);
  }
}

/**
 * Captura excepciones, registra en LOG_ERRORES y genera un código de respuesta amigable.
 */
function manejarError_(error, funcion) {
  const correlation = uuid_();
  const rawMessage = String((error && error.message) || error || 'Ocurrió un error inesperado.');
  const parsed = rawMessage.match(/^([A-Z0-9_]+):\s*(.*)$/);
  const code = parsed ? parsed[1] : 'ERROR';
  const friendlyMessage = parsed ? parsed[2] : rawMessage;
  try {
    repoInsertar('LOG_ERRORES', {
      ID_ERROR: uuid_(),
      FECHA_HORA: ahoraIso_(),
      USUARIO: emailActual_() || 'desconocido',
      FUNCION: funcion,
      MENSAJE: rawMessage,
      STACK: (error && error.stack) || '',
      ID_CORRELACION: correlation
    }, { auditar: false });
  } catch (ignored) {
    console.error(error);
  }
  return respuestaError(code, friendlyMessage, { correlationId: correlation });
}

/**
 * API RPC: Consulta eventos crudos de auditoría con filtrado.
 */
function apiAuditoria(filtros) {
  try {
    exigirPermiso_('AUDITORIA_VER');
    return respuestaOk(repoListar('AUDITORIA', { filtro: filtros || {}, incluirInactivos: true, limit: 200 }));
  } catch (error) {
    return manejarError_(error, 'apiAuditoria');
  }
}

/**
 * API RPC: Consulta eventos de auditoría enriquecidos con nombres legibles de personas e iniciativas.
 */
function apiAuditoriaLegible(filtros) {
  try {
    exigirPermiso_('AUDITORIA_VER');
    filtros = filtros || {};
    const personas = indexarPor_(repoTodos('PERSONAS', { incluirInactivos: true }), 'ID_PERSONA');
    const emps = indexarPor_(repoTodos('EMPRENDIMIENTOS', { incluirInactivos: true }), 'ID_EMPRENDIMIENTO');
    const iniciativas = indexarPor_(repoTodos('INICIATIVAS', { incluirInactivos: true }), 'ID_INICIATIVA');
    const posts = indexarPor_(repoTodos('POSTULACIONES', { incluirInactivos: true }), 'ID_POSTULACION');
    const labelsAccion = {
      CREAR: 'Creación',
      MODIFICAR: 'Actualización',
      ACCEDER_DOCUMENTO: 'Consulta de documento',
      EXPORTAR: 'Exportación',
      INSTALAR: 'Instalación',
      ACTUALIZAR_MODULO: 'Actualización del sistema',
      VINCULAR: 'Vinculación',
      CONFIGURAR: 'Configuración'
    };
    let rows = repoTodos('AUDITORIA', { incluirInactivos: true }).map(function(a) {
      let registro = a.ID_REGISTRO;
      if (a.ENTIDAD === 'PERSONAS' && personas[String(a.ID_REGISTRO)]) {
        registro = nombrePersona_(personas[String(a.ID_REGISTRO)]) + ' (' + (personas[String(a.ID_REGISTRO)].CODIGO_PERSONA || '') + ')';
      }
      if (a.ENTIDAD === 'EMPRENDIMIENTOS' && emps[String(a.ID_REGISTRO)]) {
        registro = emps[String(a.ID_REGISTRO)].NOMBRE_COMERCIAL;
      }
      if (a.ENTIDAD === 'INICIATIVAS' && iniciativas[String(a.ID_REGISTRO)]) {
        registro = iniciativas[String(a.ID_REGISTRO)].NOMBRE;
      }
      if (a.ENTIDAD === 'POSTULACIONES' && posts[String(a.ID_REGISTRO)]) {
        const p = posts[String(a.ID_REGISTRO)];
        const e = emps[String(p.ID_EMPRENDIMIENTO)];
        const i = iniciativas[String(p.ID_INICIATIVA)];
        registro = (e ? e.NOMBRE_COMERCIAL : 'Postulación') + ' - ' + (i ? i.NOMBRE : 'Iniciativa');
      }
      return {
        FECHA: a.FECHA_HORA,
        USUARIO: a.ID_USUARIO,
        ACCION: labelsAccion[a.ACCION] || String(a.ACCION || '').replace(/_/g, ' '),
        SECCION: String(a.ENTIDAD || '').replace(/_/g, ' '),
        REGISTRO: registro,
        MOTIVO: a.MOTIVO || 'Sin observación',
        ID_EVENTO: a.ID_EVENTO_AUDITORIA,
        DETALLE_ANTERIOR: a.VALOR_ANTERIOR,
        DETALLE_NUEVO: a.VALOR_NUEVO
      };
    });
    if (filtros.seccion) {
      rows = rows.filter(function(r) { return r.SECCION === String(filtros.seccion).replace(/_/g, ' '); });
    }
    if (filtros.q) {
      const q = normalizarTexto_(filtros.q).toLowerCase();
      rows = rows.filter(function(r) {
        return [r.USUARIO, r.ACCION, r.SECCION, r.REGISTRO, r.MOTIVO].join(' ').toLowerCase().indexOf(q) >= 0;
      });
    }
    rows.sort(function(a, b) { return String(b.FECHA).localeCompare(String(a.FECHA)); });
    return respuestaOk(rows.slice(0, 200));
  } catch (error) {
    return manejarError_(error, 'apiAuditoriaLegible');
  }
}
