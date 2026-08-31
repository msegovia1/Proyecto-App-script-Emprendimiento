// ===== Repository.gs =====
// SGE v2.1.0 - Ficha integral del emprendedor
// Capa de persistencia y operaciones CRUD de alto rendimiento sobre Google Sheets

let _schemaHeadersCache = null;
let _dbInstance = null;
let _sheetCache = {};
let _repoTodosCache = {};

/**
 * Obtiene la instancia activa de Google Sheets con caché de ejecución y fallback seguro.
 */
function db_() {
  if (_dbInstance) return _dbInstance;
  const props = PropertiesService.getScriptProperties();
  const id = (props ? props.getProperty(APP.PROP_DB_ID) : null) || PREINSTALACION_DRIVE.DB_ID;
  exigir_(id, 'NO_INSTALADO', 'No se ha configurado la base de datos. Ejecute instalarSistema o vincularInstalacionDrive.');
  _dbInstance = SpreadsheetApp.openById(id);
  return _dbInstance;
}

/**
 * Obtiene la carpeta raíz en Drive con fallback seguro a Drive institucional.
 */
function carpetaRoot_() {
  const props = PropertiesService.getScriptProperties();
  const id = (props ? props.getProperty(APP.PROP_ROOT_FOLDER_ID) : null) || PREINSTALACION_DRIVE.ROOT_FOLDER_ID;
  exigir_(id, 'NO_INSTALADO', 'No existe carpeta documental configurada.');
  return DriveApp.getFolderById(id);
}

/**
 * Obtiene la hoja correspondiente a una tabla del esquema con caché en memoria.
 */
function hoja_(tabla) {
  exigir_(SCHEMA[tabla], 'TABLA_INVALIDA', 'Tabla no reconocida: ' + tabla);
  if (!_sheetCache[tabla]) {
    const sheet = db_().getSheetByName(tabla);
    exigir_(sheet, 'TABLA_FALTANTE', 'No existe la hoja ' + tabla);
    _sheetCache[tabla] = sheet;
  }
  return _sheetCache[tabla];
}

/**
 * Retorna los nombres de columna definidos en el esquema con caché en memoria.
 */
function encabezados_(tabla) {
  if (!_schemaHeadersCache) _schemaHeadersCache = {};
  if (!_schemaHeadersCache[tabla]) {
    exigir_(SCHEMA[tabla], 'TABLA_INVALIDA', 'Tabla no reconocida: ' + tabla);
    _schemaHeadersCache[tabla] = SCHEMA[tabla].slice();
  }
  return _schemaHeadersCache[tabla];
}

/**
 * Convierte un arreglo de valores de fila a un objeto JavaScript indexado por cabeceras.
 */
function filaAObjeto_(headers, row) {
  return headers.reduce(function(out, key, i) {
    out[key] = row[i];
    return out;
  }, {});
}

/**
 * Convierte un objeto JavaScript a un arreglo de valores según el orden de cabeceras.
 */
function objetoAFila_(headers, obj) {
  return headers.map(function(key) {
    const value = obj[key];
    if (value && typeof value === 'object' && !(value instanceof Date)) return JSON.stringify(value);
    return value == null ? '' : value;
  });
}

/**
 * Recupera todas las filas de una tabla aplicando caché en memoria por ejecución.
 */
function repoTodos(tabla, options) {
  options = options || {};
  if (!_repoTodosCache[tabla]) {
    const sheet = hoja_(tabla);
    const headers = encabezados_(tabla);
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      _repoTodosCache[tabla] = [];
    } else {
      _repoTodosCache[tabla] = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues()
        .map(function(row) { return filaAObjeto_(headers, row); });
    }
  }

  let rows = _repoTodosCache[tabla];
  if (options.filtro) {
    rows = rows.filter(function(item) {
      return Object.keys(options.filtro).every(function(key) {
        return String(item[key]) === String(options.filtro[key]);
      });
    });
  }
  if (options.incluirInactivos !== true) {
    rows = rows.filter(function(item) {
      return !Object.prototype.hasOwnProperty.call(item, 'ESTADO_REGISTRO') || item.ESTADO_REGISTRO !== 'INACTIVO';
    });
  }
  return rows;
}

/**
 * Recupera un subconjunto paginado de registros.
 */
function repoListar(tabla, options) {
  options = options || {};
  const rows = repoTodos(tabla, options);
  const offset = Math.max(0, Number(options.offset || 0));
  const limit = Math.min(APP.MAX_PAGE_SIZE, Math.max(1, Number(options.limit || APP.PAGE_SIZE)));
  return rows.slice(offset, offset + limit);
}

/**
 * Búsqueda instantánea en memoria por ID.
 */
function repoBuscarPorId(tabla, id) {
  if (id == null || id === '') return null;
  const targetIdStr = String(id);
  const rows = repoTodos(tabla, { incluirInactivos: true });
  const idKey = encabezados_(tabla)[0];
  return rows.find(function(row) {
    return String(row[idKey]) === targetIdStr;
  }) || null;
}

/**
 * Inserta un nuevo registro con soporte transaccional e invalidación automática de caché.
 */
function repoInsertar(tabla, obj, options) {
  options = options || {};
  const headers = encabezados_(tabla);
  const idField = headers[0];
  const value = Object.assign({}, obj);
  const lock = LockService.getScriptLock();
  const alreadyLocked = lock.hasLock();
  if (!alreadyLocked) lock.waitLock(30000);
  try {
    const sheet = hoja_(tabla);
    if (!value[idField]) value[idField] = uuid_();
    if (tabla === 'PERSONAS' && !value.CODIGO_PERSONA) {
      value.CODIGO_PERSONA = siguienteCodigoVisibleBloqueado_(sheet, headers, 'CODIGO_PERSONA', 'PER');
    }
    if (tabla === 'EMPRENDIMIENTOS' && !value.CODIGO_EMPRENDIMIENTO) {
      value.CODIGO_EMPRENDIMIENTO = siguienteCodigoVisibleBloqueado_(sheet, headers, 'CODIGO_EMPRENDIMIENTO', 'EMP');
    }
    sheet.appendRow(objetoAFila_(headers, value));
    SpreadsheetApp.flush();
    delete _repoTodosCache[tabla];
  } finally {
    if (!alreadyLocked) lock.releaseLock();
  }
  if (options.auditar !== false) {
    auditoriaRegistrar_('CREAR', tabla, value[idField], null, value, options.motivo || 'Creación');
  }
  if (['AUDITORIA', 'LOG_ERRORES'].indexOf(tabla) < 0) {
    limpiarCacheDatos_();
  }
  if (tabla === 'CATALOGOS') {
    limpiarCacheCatalogos_();
  }
  return value;
}

/**
 * Actualiza un registro existente preservando auditoría, consistencia e invalidando caché.
 */
function repoActualizar(tabla, id, changes, options) {
  options = options || {};
  const headers = encabezados_(tabla);
  const idField = headers[0];
  const lock = LockService.getScriptLock();
  const alreadyLocked = lock.hasLock();
  if (!alreadyLocked) lock.waitLock(30000);
  let before, after;
  try {
    const sheet = hoja_(tabla);
    const count = Math.max(0, sheet.getLastRow() - 1);
    const idColumn = count ? sheet.getRange(2, 1, count, 1).getValues() : [];
    let rowNumber = -1;
    idColumn.some(function(row, index) {
      if (String(row[0]) === String(id)) {
        rowNumber = index + 2;
        return true;
      }
      return false;
    });
    exigir_(rowNumber > 0, 'NO_ENCONTRADO', tabla + ': ' + id);
    before = filaAObjeto_(headers, sheet.getRange(rowNumber, 1, 1, headers.length).getValues()[0]);
    after = Object.assign({}, before, changes);
    after[idField] = before[idField];
    sheet.getRange(rowNumber, 1, 1, headers.length).setValues([objetoAFila_(headers, after)]);
    SpreadsheetApp.flush();
    delete _repoTodosCache[tabla];
  } finally {
    if (!alreadyLocked) lock.releaseLock();
  }
  if (options.auditar !== false) {
    auditoriaRegistrar_('MODIFICAR', tabla, id, before, after, options.motivo || 'Actualización');
  }
  if (['AUDITORIA', 'LOG_ERRORES'].indexOf(tabla) < 0) {
    limpiarCacheDatos_();
  }
  if (tabla === 'CATALOGOS') {
    limpiarCacheCatalogos_();
  }
  return after;
}

/**
 * Desactiva lógicamente un registro asignando estado INACTIVO.
 */
function repoDesactivar(tabla, id, motivo) {
  exigir_(encabezados_(tabla).indexOf('ESTADO_REGISTRO') >= 0, 'NO_DESACTIVABLE', 'La tabla no admite eliminación lógica.');
  return repoActualizar(tabla, id, {
    ESTADO_REGISTRO: 'INACTIVO',
    ACTUALIZADO_EN: ahoraIso_(),
    ACTUALIZADO_POR: emailActual_()
  }, { motivo: motivo || 'Desactivación lógica' });
}

/**
 * Cuenta la cantidad de registros en una hoja aplicando filtros opcionales.
 */
function repoContar(tabla, filtro) {
  return repoTodos(tabla, { filtro: filtro, incluirInactivos: true }).length;
}
