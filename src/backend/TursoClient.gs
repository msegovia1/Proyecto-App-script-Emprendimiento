// TursoClient.gs
// Cliente HTTP puro para Turso (libSQL/SQLite) mediante HTTP Pipeline API v2
// Compatible con Google Apps Script (UrlFetchApp) y Node.js (fetch)

/**
 * Obtiene la configuración de Turso desde las Propiedades del Script (Apps Script)
 * o de variables de entorno / fallback para desarrollo.
 * @returns {{ url: string, token: string }}
 */
function tursoObtenerConfig_() {
  let url = '';
  let token = '';

  // 1. Intentar desde PropertiesService de Google Apps Script
  try {
    if (typeof PropertiesService !== 'undefined' && PropertiesService.getScriptProperties) {
      const props = PropertiesService.getScriptProperties();
      url = props.getProperty('TURSO_DATABASE_URL') || '';
      token = props.getProperty('TURSO_AUTH_TOKEN') || '';
    }
  } catch (e) {
    // Ignorar si no está disponible
  }

  // 2. Intentar desde process.env (entorno local Node)
  if (!url && typeof process !== 'undefined' && process.env) {
    url = process.env.TURSO_DATABASE_URL || '';
    token = process.env.TURSO_AUTH_TOKEN || '';
  }

  // 3. Fallback configurado por el usuario
  if (!url) {
    url = 'https://baseemprendimiento-msegovia1.aws-us-west-2.turso.io';
    token = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODg1MzAxMjAsImlkIjoiMDFhMDZjYjEtZTQwMS03MWJmLTllMDgtMWM2MDBkZTljODJhIiwia2lkIjoiQkpqOVJMZDlhSk5rX3NRb1RjVVljOG5GQVMwN3RWYjZxcUYxQWZmNWJIayIsInJpZCI6ImFkMzg2ODg3LTlhMzYtNGVmYy04Y2M5LTFiZDQ1OWFiMWM4OCJ9.iX2G_XRS-pVOom0-QWsAfzoEJbQgH4sxjWOgmW1HcbXJJehrl6bz1NuYVaJcvqVP0gEGggsNNiqiu3uQ-aaeDw';
  }

  // Normalizar URL (debe ser https:// y sin trailing slash)
  if (url.startsWith('libsql://')) {
    url = url.replace('libsql://', 'https://');
  }
  url = url.replace(/\/+$/, '');

  return { url: url, token: token };
}

/**
 * Guarda o actualiza las credenciales de Turso en las Propiedades del Script de GAS.
 * @param {string} url - Ej: "https://mi-base-usuario.turso.io"
 * @param {string} token - Token generado en la consola de Turso
 * @returns {{ success: boolean, data: any, error: string|null }}
 */
function tursoConfigurarCredenciales(url, token) {
  try {
    if (!url || !token) {
      return { success: false, data: null, error: 'Debe ingresar la URL y el Token de autenticación de Turso.' };
    }

    let cleanUrl = url.trim();
    if (cleanUrl.startsWith('libsql://')) {
      cleanUrl = cleanUrl.replace('libsql://', 'https://');
    }
    cleanUrl = cleanUrl.replace(/\/+$/, '');

    if (typeof PropertiesService !== 'undefined' && PropertiesService.getScriptProperties) {
      const props = PropertiesService.getScriptProperties();
      props.setProperty('TURSO_DATABASE_URL', cleanUrl);
      props.setProperty('TURSO_AUTH_TOKEN', token.trim());
    }

    // Probar conexión de inmediato
    return tursoTestConexion(cleanUrl, token.trim());
  } catch (err) {
    return {
      success: false,
      data: null,
      error: 'Error guardando credenciales de Turso: ' + (err.message || String(err))
    };
  }
}

/**
 * Convierte valores de JS al formato de valor de la API Pipeline de Turso.
 * @param {any} val
 * @returns {object}
 */
function tursoFormatearValorArg_(val) {
  if (val === null || val === undefined) {
    return { type: 'null' };
  }
  if (typeof val === 'number') {
    if (Number.isInteger(val)) {
      return { type: 'integer', value: String(val) };
    }
    return { type: 'float', value: val };
  }
  if (typeof val === 'boolean') {
    return { type: 'integer', value: val ? '1' : '0' };
  }
  if (typeof val === 'object') {
    return { type: 'text', value: JSON.stringify(val) };
  }
  return { type: 'text', value: String(val) };
}

/**
 * Parsea una celda recibida desde la API Pipeline de Turso a tipo nativo de JS.
 * @param {object} cell - Ej: { type: "text", value: "Juan" } o { type: "integer", value: "42" }
 * @returns {any}
 */
function tursoParsearCelda_(cell) {
  if (!cell || cell.type === 'null') return null;
  if (cell.type === 'integer') {
    const num = Number(cell.value);
    return Number.isSafeInteger(num) ? num : cell.value;
  }
  if (cell.type === 'float') {
    return Number(cell.value);
  }
  if (cell.type === 'text') {
    return cell.value;
  }
  if (cell.type === 'blob') {
    return cell.base64 || cell.value;
  }
  return cell.value;
}

/**
 * Transforma la respuesta tabular de libSQL a un arreglo de objetos JavaScript legibles.
 * @param {object} result - Objeto result de la API de Turso { cols: [...], rows: [...] }
 * @returns {Array<object>}
 */
function tursoRowsToObjects_(result) {
  if (!result || !result.cols || !result.rows) return [];
  const colNames = result.cols.map(c => c.name);
  return result.rows.map(row => {
    const obj = {};
    row.forEach((cell, idx) => {
      const colName = colNames[idx];
      obj[colName] = tursoParsearCelda_(cell);
    });
    return obj;
  });
}

/**
 * Ejecuta una petición HTTP contra la API Pipeline v2 de Turso.
 * @param {Array<object>} requests - Lista de operaciones (execute, close, etc.)
 * @param {string} [overrideUrl]
 * @param {string} [overrideToken]
 * @returns {object} Respuesta JSON deserializada de Turso
 */
function tursoHttpPipeline_(requests, overrideUrl, overrideToken) {
  const config = tursoObtenerConfig_();
  const url = overrideUrl || config.url;
  const token = overrideToken || config.token;

  if (!url || !token) {
    throw new Error('Faltan credenciales de Turso. Configure TURSO_DATABASE_URL y TURSO_AUTH_TOKEN.');
  }

  const endpoint = `${url}/v2/pipeline`;
  const payload = JSON.stringify({ requests: requests });

  // Si estamos en Google Apps Script
  if (typeof UrlFetchApp !== 'undefined' && UrlFetchApp.fetch) {
    const options = {
      method: 'post',
      contentType: 'application/json',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      payload: payload,
      muteHttpExceptions: true
    };

    const response = UrlFetchApp.fetch(endpoint, options);
    const code = response.getResponseCode();
    const text = response.getContentText();

    let json;
    try {
      json = JSON.parse(text);
    } catch (e) {
      throw new Error(`Respuesta inválida de Turso (HTTP ${code}): ${text.slice(0, 300)}`);
    }

    if (code >= 400) {
      const msg = (json && (json.error || json.message)) || text;
      throw new Error(`Error Turso (HTTP ${code}): ${msg}`);
    }

    return json;
  }

  // Fallback para Node.js si se ejecuta en servidor Express
  if (typeof fetch !== 'undefined') {
    // Usamos XMLHttpRequest síncrono o petición Node en entornos síncronos de GAS simulados
    // En el simulador de Node, engine.js se ejecuta síncronamente, por lo que usamos el motor local
    throw new Error('UrlFetchApp no está disponible en este entorno.');
  }

  throw new Error('No hay cliente HTTP disponible (UrlFetchApp no encontrado).');
}

/**
 * Ejecuta una sentencia SQL simple o parametrizada en Turso.
 * Retorna { success: true, data: { rows: [...], rowsAffected: number, lastInsertRowid: string|null }, error: null }
 * @param {string} sql - Sentencia SQL, ej: "SELECT * FROM personas WHERE id = ?"
 * @param {Array<any>} [args] - Parámetros posicionales
 * @returns {{ success: boolean, data: object|null, error: string|null }}
 */
function tursoEjecutar(sql, args = []) {
  try {
    if (!sql || typeof sql !== 'string') {
      return { success: false, data: null, error: 'Se requiere una sentencia SQL válida.' };
    }

    const formattedArgs = (args || []).map(tursoFormatearValorArg_);

    const requests = [
      {
        type: 'execute',
        stmt: {
          sql: sql,
          args: formattedArgs
        }
      },
      { type: 'close' }
    ];

    const response = tursoHttpPipeline_(requests);
    const firstResult = response.results && response.results[0];

    if (!firstResult) {
      return { success: false, data: null, error: 'No se obtuvo resultado de la consulta en Turso.' };
    }

    if (firstResult.type === 'error') {
      return {
        success: false,
        data: null,
        error: `Error SQL [${firstResult.error?.code || 'ERROR'}]: ${firstResult.error?.message || 'Error desconocido'}`
      };
    }

    const execResponse = firstResult.response?.result;
    const rows = tursoRowsToObjects_(execResponse);

    return {
      success: true,
      data: {
        rows: rows,
        rowsAffected: execResponse?.affected_row_count || 0,
        lastInsertRowid: execResponse?.last_insert_rowid || null
      },
      error: null
    };
  } catch (err) {
    return {
      success: false,
      data: null,
      error: 'Error al consultar Turso: ' + (err.message || String(err))
    };
  }
}

/**
 * Ejecuta múltiples sentencias SQL dentro de una transacción atómica.
 * Si alguna falla, se cancela la transacción.
 * @param {Array<{ sql: string, args: Array<any> }>} stmts
 * @returns {{ success: boolean, data: Array<object>|null, error: string|null }}
 */
function tursoTransaccion(stmts) {
  try {
    if (!Array.isArray(stmts) || stmts.length === 0) {
      return { success: false, data: null, error: 'Se requiere una lista de sentencias SQL.' };
    }

    const requests = [];
    requests.push({ type: 'execute', stmt: { sql: 'BEGIN' } });

    stmts.forEach(s => {
      requests.push({
        type: 'execute',
        stmt: {
          sql: s.sql,
          args: (s.args || []).map(tursoFormatearValorArg_)
        }
      });
    });

    requests.push({ type: 'execute', stmt: { sql: 'COMMIT' } });
    requests.push({ type: 'close' });

    const response = tursoHttpPipeline_(requests);

    // Revisar si algún resultado falló
    const results = response.results || [];
    for (let i = 0; i < results.length; i++) {
      if (results[i].type === 'error') {
        // Intentar rollback en error
        try {
          tursoHttpPipeline_([{ type: 'execute', stmt: { sql: 'ROLLBACK' } }, { type: 'close' }]);
        } catch (ignored) {}

        return {
          success: false,
          data: null,
          error: `Error en transacción (paso ${i}): ${results[i].error?.message || 'Fallo de ejecución'}`
        };
      }
    }

    const dataOutputs = [];
    // Omitir BEGIN (index 0) y COMMIT/close al final
    for (let i = 1; i <= stmts.length; i++) {
      const res = results[i]?.response?.result;
      dataOutputs.push({
        rows: tursoRowsToObjects_(res),
        rowsAffected: res?.affected_row_count || 0,
        lastInsertRowid: res?.last_insert_rowid || null
      });
    }

    return {
      success: true,
      data: dataOutputs,
      error: null
    };
  } catch (err) {
    return {
      success: false,
      data: null,
      error: 'Error en transacción de Turso: ' + (err.message || String(err))
    };
  }
}

/**
 * Prueba la conexión enviando una consulta ligera "SELECT 1 AS conectado".
 * @param {string} [overrideUrl]
 * @param {string} [overrideToken]
 * @returns {{ success: boolean, data: object|null, error: string|null }}
 */
function tursoTestConexion(overrideUrl, overrideToken) {
  try {
    const requests = [
      { type: 'execute', stmt: { sql: "SELECT 1 AS conectado, datetime('now') AS fecha_servidor;" } },
      { type: 'close' }
    ];

    const response = tursoHttpPipeline_(requests, overrideUrl, overrideToken);
    const result = response.results && response.results[0];

    if (result && result.type === 'ok') {
      const rows = tursoRowsToObjects_(result.response?.result);
      return {
        success: true,
        data: {
          conectado: true,
          mensaje: 'Conexión a Turso establecida exitosamente.',
          detalle: rows[0] || null
        },
        error: null
      };
    }

    return {
      success: false,
      data: null,
      error: result?.error?.message || 'No fue posible validar la conexión con Turso.'
    };
  } catch (err) {
    return {
      success: false,
      data: null,
      error: 'Fallo al conectar con Turso: ' + (err.message || String(err))
    };
  }
}
