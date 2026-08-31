// ===== AuthService.gs =====
// SGE v2.1.0 - Ficha integral del emprendedor
// Gestión de identidad, roles y control de acceso basado en permisos (RBAC)

/**
 * Obtiene el correo electrónico del usuario activo en la sesión.
 */
function emailActual_() {
  return String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
}

/**
 * Recupera el registro del usuario activo verificando que se encuentre habilitado.
 */
function usuarioActual_() {
  const email = emailActual_();
  exigir_(email, 'SIN_IDENTIDAD', 'No fue posible obtener el correo institucional.');
  const users = repoListar('USUARIOS', { filtro: { EMAIL: email }, incluirInactivos: true, limit: 10 });
  exigir_(users.length && String(users[0].ACTIVO).toUpperCase() !== 'NO', 'SIN_ACCESO', 'Usuario no autorizado.');
  return users[0];
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
