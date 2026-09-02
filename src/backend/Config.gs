// ===== Config.gs =====
// SGE v2.1.0 - Ficha integral del emprendedor
// Configuración global y funciones auxiliares base del sistema

const APP = Object.freeze({
  NAME: 'Sistema de Gestión de Emprendimientos',
  VERSION: '2.1.0-FICHA-INTEGRAL',
  TIMEZONE: 'America/Santiago',
  PROP_DB_ID: 'SGE_DB_ID',
  PROP_ROOT_FOLDER_ID: 'SGE_ROOT_FOLDER_ID',
  CACHE_CATALOGS: 'SGE_CATALOGS_V4',
  CACHE_DASHBOARD: 'SGE_DASHBOARD_V4',
  PROP_FORM_ID: 'SGE_FORM_REGISTRO_ID',
  PROP_FORM_URL: 'SGE_FORM_REGISTRO_URL',
  PROP_FORM_MERCADO_TEMPLATE_ID: 'SGE_FORM_MERCADO_TEMPLATE_ID',
  PROP_FORM_MERCADO_UNICO_ID: 'SGE_FORM_MERCADO_UNICO_ID',
  PROP_FORM_MERCADO_UNICO_URL: 'SGE_FORM_MERCADO_UNICO_URL',
  MAX_UPLOAD_BYTES: 10 * 1024 * 1024, // 10 MB
  PAGE_SIZE: 50,
  MAX_PAGE_SIZE: 200,
  ROLES: Object.freeze({
    ADMIN: 'ADMIN',
    COORDINADOR: 'COORDINADOR',
    GESTOR: 'GESTOR',
    REVISOR: 'REVISOR',
    ANALISTA: 'ANALISTA',
    AUDITOR: 'AUDITOR'
  })
});

// Recursos preinstalados en Drive institucional.
// Estos identificadores actúan como fallback si PropertiesService aún no ha sido configurado.
const PREINSTALACION_DRIVE = Object.freeze({
  DB_ID: '14-aP9u5qeh3nabo0ol7LAYHBklqhw-LMLCZlJS7SKVo',
  ROOT_FOLDER_ID: '185iI1JSNalw00CuVL39EzNPA40KafstO'
});

/**
 * Genera una respuesta estándar exitosa para el cliente.
 */
function respuestaOk(data, meta) {
  return {
    ok: true,
    data: data == null ? null : serializarParaCliente_(data),
    error: null,
    meta: serializarParaCliente_(meta || {})
  };
}

/**
 * Serializa tipos de datos no primitivos (Date, objetos) para envío seguro al cliente.
 */
function serializarParaCliente_(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, APP.TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX");
  }
  if (Array.isArray(value)) {
    return value.map(serializarParaCliente_);
  }
  if (value && typeof value === 'object') {
    return Object.keys(value).reduce(function(out, key) {
      out[key] = serializarParaCliente_(value[key]);
      return out;
    }, {});
  }
  return value;
}

/**
 * Genera una respuesta de error estandarizada para el cliente.
 */
function respuestaError(code, message, details) {
  return {
    ok: false,
    data: null,
    error: {
      code: code,
      message: message,
      details: details || null
    },
    meta: {}
  };
}

/**
 * Retorna la marca de tiempo actual en formato ISO 8601 con zona horaria de Santiago.
 */
function ahoraIso_() {
  return Utilities.formatDate(new Date(), APP.TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX");
}

/**
 * Genera un identificador único universal (UUID v4).
 */
function uuid_() {
  return Utilities.getUuid();
}

/**
 * Invalida la caché del dashboard.
 */
function limpiarCacheDatos_() {
  try {
    CacheService.getScriptCache().remove(APP.CACHE_DASHBOARD);
  } catch (ignored) {}
}

/**
 * Invalida la caché de catálogos.
 */
function limpiarCacheCatalogos_() {
  try {
    CacheService.getScriptCache().remove(APP.CACHE_CATALOGS);
  } catch (ignored) {}
}

/**
 * Ejecuta una operación con bloqueo exclusivo a nivel de script para prevenir condiciones de carrera.
 */
function conBloqueoSistema_(callback) {
  const lock = LockService.getScriptLock();
  const already = lock.hasLock();
  if (!already) lock.waitLock(30000);
  try {
    return callback();
  } finally {
    if (!already) lock.releaseLock();
  }
}

/**
 * Genera el siguiente código correlativo secuencial visible (ej. PER-000008, EMP-000012).
 */
function siguienteCodigoVisibleBloqueado_(sheet, headers, field, prefix) {
  const column = headers.indexOf(field) + 1;
  if (!column) return '';
  const lastRow = sheet.getLastRow();
  const values = lastRow < 2 ? [] : sheet.getRange(2, column, lastRow - 1, 1).getDisplayValues();
  let max = 0;
  values.forEach(function(row) {
    const match = String(row[0] || '').match(new RegExp('^' + prefix + '-(\\d+)$'));
    if (match) max = Math.max(max, Number(match[1]));
  });
  return prefix + '-' + String(max + 1).padStart(6, '0');
}

/**
 * Formatea el nombre completo de una persona.
 */
function nombrePersona_(p) {
  return [p && p.NOMBRES, p && p.APELLIDO_PATERNO, p && p.APELLIDO_MATERNO].filter(Boolean).join(' ') || 'Persona sin nombre';
}

/**
 * Genera un nombre seguro para directorios en Drive sin caracteres conflictivos.
 */
function nombreSeguroCarpeta_(value) {
  return normalizarTexto_(value).replace(/[\\/:*?"<>|#%{}~]/g, '-').slice(0, 120) || 'Sin nombre';
}

/**
 * Valida una condición obligatoria; si falla, lanza un error con código identificador.
 */
function exigir_(condition, code, message) {
  if (!condition) throw new Error(code + ': ' + message);
}
