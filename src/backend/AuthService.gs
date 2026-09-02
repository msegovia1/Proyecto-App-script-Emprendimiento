// ===== AuthService.gs =====
// SGE v2.1.0 - Ficha integral del emprendedor
// Gestión de identidad, roles y control de acceso basado en permisos (RBAC)

var _usuarioActualCache = null;

/**
 * Obtiene el correo electrónico del usuario activo en la sesión.
 */
function emailActual_() {
  return String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
}

/**
 * Recupera el registro del usuario activo verificando que se encuentre habilitado con caché en memoria.
 */
function usuarioActual_() {
  if (_usuarioActualCache) return _usuarioActualCache;
  const email = emailActual_();
  exigir_(email, 'SIN_IDENTIDAD', 'No fue posible obtener el correo institucional.');
  const users = repoListar('USUARIOS', { filtro: { EMAIL: email }, incluirInactivos: true, limit: 10 });
  if (users.length) {
    exigir_(String(users[0].ACTIVO).toUpperCase() !== 'NO', 'SIN_ACCESO', 'Usuario deshabilitado en el sistema.');
    _usuarioActualCache = users[0];
    return _usuarioActualCache;
  }
  
  // Auto-aprovisionamiento simplificado: Cualquier funcionario municipal entra automáticamente como GESTOR
  const nuevoGestor = repoInsertar('USUARIOS', {
    ID_USUARIO: uuid_(),
    EMAIL: email,
    NOMBRE: email.split('@')[0].replace(/[._]/g, ' ').toUpperCase(),
    ROL: APP.ROLES.GESTOR,
    ACTIVO: 'SI',
    CREADO_EN: ahoraIso_(),
    CREADO_POR: 'ACCESO_MUNICIPAL_DIRECTO'
  }, { auditar: false });
  
  _usuarioActualCache = nuevoGestor;
  return _usuarioActualCache;
}

/**
 * Verifica si el usuario activo cuenta con un permiso específico o rol comodín (*).
 */
function exigirPermiso_(permiso) {
  const user = usuarioActual_();
  const allowed = PERMISOS_ROL[user.ROL] || [];
  exigir_(allowed.indexOf('*') >= 0 || allowed.indexOf(permiso) >= 0, 'PROHIBIDO', 'Su rol no permite esta acción.');
  return user;
}

/**
 * Comprueba de forma no bloqueante si el usuario activo posee un permiso.
 */
function puede_(permiso) {
  try {
    exigirPermiso_(permiso);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * API RPC: Retorna los datos de sesión, permisos y versión para el cliente.
 */
function apiSesion() {
  try {
    const user = usuarioActual_();
    return respuestaOk({
      usuario: user,
      permisos: PERMISOS_ROL[user.ROL] || [],
      version: APP.VERSION
    });
  } catch (error) {
    return manejarError_(error, 'apiSesion');
  }
}
