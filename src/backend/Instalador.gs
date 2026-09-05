// ===== Instalador.gs =====
// SGE v2.1.0 - Ficha integral del emprendedor
// Instalación del sistema, vinculación de hojas/carpetas, diagnóstico y formularios

function instalarSistema() {
  let db = null;
  try {
    db = SpreadsheetApp.getActiveSpreadsheet();
  } catch (ignored) {}

  if (!db) {
    db = SpreadsheetApp.create('SGE - Base de datos institucional');
  }
  
  return estructurarBaseDeDatos_(db);
}

function instalarEnHojaActiva() {
  const db = SpreadsheetApp.getActiveSpreadsheet();
  if (!db) {
    throw new Error('No hay una hoja de cálculo activa vinculada a este script. Utilice instalarSistema() para crear una nueva.');
  }
  return estructurarBaseDeDatos_(db);
}

function estructurarBaseDeDatos_(db) {
  db.setSpreadsheetTimeZone(APP.TIMEZONE);
  const existingSheets = db.getSheets();
  const existingNames = existingSheets.map(function(s) { return s.getName(); });

  Object.keys(SCHEMA).forEach(function(name, index) {
    let sheet;
    if (existingNames.indexOf(name) >= 0) {
      sheet = db.getSheetByName(name);
    } else if (index === 0 && existingSheets.length === 1 && existingNames[0] === 'Hoja 1' || existingNames[0] === 'Sheet1') {
      sheet = existingSheets[0].setName(name);
    } else {
      sheet = db.insertSheet(name);
    }

    const headers = SCHEMA[name];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setBackground('#215783').setFontColor('#ffffff').setFontWeight('bold');
    sheet.autoResizeColumns(1, headers.length);
  });

  const props = PropertiesService.getScriptProperties();
  let root = null;
  const rootId = props.getProperty(APP.PROP_ROOT_FOLDER_ID);
  if (rootId) {
    try { root = DriveApp.getFolderById(rootId); } catch (e) {}
  }
  if (!root) {
    root = DriveApp.createFolder('Sistema de Gestión de Emprendimientos');
    ['Expedientes_personas', 'Expedientes_emprendimientos', 'Iniciativas', 'Actas_seleccion', 'Exportaciones'].forEach(function(name) {
      root.createFolder(name);
    });
  }

  props.setProperties({
    SGE_DB_ID: db.getId(),
    SGE_ROOT_FOLDER_ID: root.getId()
  });

  cargarCatalogosIniciales_();
  cargarRolesIniciales_();
  const email = emailActual_();
  
  const existingUser = repoListar('USUARIOS', { filtro: { EMAIL: email }, incluirInactivos: true, limit: 5 });
  if (!existingUser.length) {
    repoInsertar('USUARIOS', {
      ID_USUARIO: uuid_(),
      EMAIL: email,
      NOMBRE: email,
      ROL: APP.ROLES.ADMIN,
      ACTIVO: 'SI',
      CREADO_EN: ahoraIso_(),
      CREADO_POR: email
    }, { auditar: false });
  }

  Logger.log('=====================================================');
  Logger.log('✅ INSTALACIÓN COMPLETADA CON ÉXITO');
  Logger.log('📊 Planilla de BD: ' + db.getUrl());
  Logger.log('📁 Carpeta Drive: ' + root.getUrl());
  Logger.log('👤 Usuario Administrador: ' + email);
  Logger.log('=====================================================');

  return respuestaOk({
    mensaje: 'Instalación completada exitosamente.',
    spreadsheetUrl: db.getUrl(),
    folderUrl: root.getUrl(),
    diagnostico: diagnosticarInstalacion()
  });
}

function vincularInstalacionDrive() {
  const props = PropertiesService.getScriptProperties();
  SpreadsheetApp.openById(PREINSTALACION_DRIVE.DB_ID);
  DriveApp.getFolderById(PREINSTALACION_DRIVE.ROOT_FOLDER_ID);
  props.setProperties({
    SGE_DB_ID: PREINSTALACION_DRIVE.DB_ID,
    SGE_ROOT_FOLDER_ID: PREINSTALACION_DRIVE.ROOT_FOLDER_ID
  });
  const diagnostic = diagnosticarInstalacion();
  exigir_(diagnostic.ok, 'INSTALACION_INCOMPLETA', diagnostic.faltantes.join(', '));
  const email = emailActual_();
  const current = repoListar('USUARIOS', { filtro: { EMAIL: email }, incluirInactivos: true, limit: 10 });
  if (!current.length) {
    repoInsertar('USUARIOS', {
      ID_USUARIO: uuid_(),
      EMAIL: email,
      NOMBRE: email,
      ROL: APP.ROLES.ADMIN,
      ACTIVO: 'SI',
      CREADO_EN: ahoraIso_(),
      CREADO_POR: email
    }, { auditar: false });
  }
  auditoriaRegistrar_('VINCULAR', 'SISTEMA', APP.VERSION, null, PREINSTALACION_DRIVE, 'Vinculación con recursos preinstalados en Drive');
  return respuestaOk({
    mensaje: 'Instalación de Drive vinculada correctamente.',
    spreadsheetUrl: SpreadsheetApp.openById(PREINSTALACION_DRIVE.DB_ID).getUrl(),
    folderUrl: DriveApp.getFolderById(PREINSTALACION_DRIVE.ROOT_FOLDER_ID).getUrl(),
    diagnostico: diagnosticarInstalacion()
  });
}

/**
 * Vincula una carpeta de una Unidad Compartida (Shared Drive) como la carpeta raíz documental del SGE.
 * Crea automáticamente las subcarpetas de expedientes, iniciativas, actas y fichas integrales.
 * 
 * @param {string} idCarpetaOUnidadCompartida ID de la carpeta en la Unidad Compartida
 */
function configurarCarpetaUnidadCompartida(idCarpetaOUnidadCompartida) {
  const rootId = (idCarpetaOUnidadCompartida || '').trim();
  if (!rootId) {
    throw new Error('Debe proporcionar el ID de la carpeta en la Unidad Compartida.');
  }

  const root = DriveApp.getFolderById(rootId);
  const subcarpetas = [
    'Expedientes_personas',
    'Expedientes_emprendimientos',
    'Fichas_integrales',
    'Iniciativas',
    'Actas_seleccion',
    'Exportaciones'
  ];

  subcarpetas.forEach(function(name) {
    carpetaHija_(root, name);
  });

  const props = PropertiesService.getScriptProperties();
  props.setProperty(APP.PROP_ROOT_FOLDER_ID, root.getId());

  Logger.log('=====================================================');
  Logger.log('✅ CARPETA RAÍZ VINCULADA EN UNIDAD COMPARTIDA');
  Logger.log('📁 Nombre: ' + root.getName());
  Logger.log('🔗 URL: ' + root.getUrl());
  Logger.log('🆔 ID: ' + root.getId());
  Logger.log('=====================================================');

  return respuestaOk({
    mensaje: 'Carpeta en Unidad Compartida configurada exitosamente.',
    nombreCarpeta: root.getName(),
    url: root.getUrl(),
    id: root.getId()
  });
}

/**
 * Permite configurar o migrar los identificadores de base de datos, Drive y formularios.
 */
function configurarPropiedadesSistema(dbId, rootFolderId, formUrl, formTemplateId) {
  const user = usuarioActual_();
  exigir_(user.ROL === APP.ROLES.ADMIN, 'PROHIBIDO', 'Solo un administrador puede configurar las propiedades del sistema.');
  const props = PropertiesService.getScriptProperties();
  const payload = {};
  if (dbId) payload[APP.PROP_DB_ID] = dbId.trim();
  if (rootFolderId) payload[APP.PROP_ROOT_FOLDER_ID] = rootFolderId.trim();
  if (formUrl) payload[APP.PROP_FORM_URL] = formUrl.trim();
  if (formTemplateId) payload[APP.PROP_FORM_MERCADO_TEMPLATE_ID] = formTemplateId.trim();
  props.setProperties(payload, false);
  limpiarCacheDatos_();
  limpiarCacheCatalogos_();
  auditoriaRegistrar_('CONFIGURAR', 'SISTEMA', APP.VERSION, null, payload, 'Configuración de propiedades del sistema');
  return respuestaOk(payload);
}

/**
 * Diagnóstico rápido de conectividad con Spreadsheet, Drive y usuario activo.
 */
function diagnosticarConexion() {
  const resultado = {
    version: APP.VERSION,
    usuario: emailActual_() || 'sin_sesion',
    dbConectada: false,
    dbUrl: null,
    driveConectado: false,
    driveUrl: null,
    tablasFaltantes: [],
    tablasExistentes: 0,
    permisosOk: false,
    errores: []
  };
  try {
    const ss = db_();
    resultado.dbConectada = true;
    resultado.dbUrl = ss.getUrl();
    const sheetNames = ss.getSheets().map(function(s) { return s.getName(); });
    Object.keys(SCHEMA).forEach(function(tabla) {
      if (sheetNames.indexOf(tabla) >= 0) {
        resultado.tablasExistentes++;
      } else {
        resultado.tablasFaltantes.push(tabla);
      }
    });
  } catch (e) {
    resultado.errores.push('Error DB: ' + e.message);
  }
  try {
    const folder = carpetaRoot_();
    resultado.driveConectado = true;
    resultado.driveUrl = folder.getUrl();
  } catch (e) {
    resultado.errores.push('Error Drive: ' + e.message);
  }
  try {
    const user = usuarioActual_();
    resultado.permisosOk = !!user;
  } catch (e) {
    resultado.errores.push('Error Usuario: ' + e.message);
  }
  return respuestaOk(resultado);
}

function actualizarModulo2() {
  const user = usuarioActual_();
  exigir_(user.ROL === APP.ROLES.ADMIN, 'PROHIBIDO', 'Solo un administrador puede instalar actualizaciones del sistema.');
  const existentes = repoTodos('CATALOGOS', { incluirInactivos: true });
  const claves = existentes.reduce(function(out, item) { out[item.TIPO_CATALOGO + '|' + item.CODIGO] = true; return out; }, {});
  const filas = [];
  Object.keys(CATALOGOS_INICIALES).forEach(function(type) {
    CATALOGOS_INICIALES[type].forEach(function(code, index) {
      if (!claves[type + '|' + code]) filas.push([type, code, code.replace(/_/g, ' '), index + 1, 'SI', '']);
    });
  });
  if (filas.length) hoja_('CATALOGOS').getRange(hoja_('CATALOGOS').getLastRow() + 1, 1, filas.length, SCHEMA.CATALOGOS.length).setValues(filas);
  CacheService.getScriptCache().remove(APP.CACHE_CATALOGS);
  const version = repoBuscarPorId('CONFIGURACION', 'VERSION');
  if (version) repoActualizar('CONFIGURACION', 'VERSION', { VALOR: APP.VERSION, ACTUALIZADO_EN: ahoraIso_(), ACTUALIZADO_POR: user.EMAIL }, { motivo: 'Actualización Módulo 2' });
  else repoInsertar('CONFIGURACION', { CLAVE: 'VERSION', VALOR: APP.VERSION, DESCRIPCION: 'Versión instalada', ACTUALIZADO_EN: ahoraIso_(), ACTUALIZADO_POR: user.EMAIL });
  auditoriaRegistrar_('ACTUALIZAR_MODULO', 'SISTEMA', APP.VERSION, null, { catalogosAgregados: filas.length }, 'Instalación Módulo 2');
  return respuestaOk({ mensaje: 'Módulo 2 actualizado.', catalogosAgregados: filas.length, version: APP.VERSION });
}

function actualizarModulo3() {
  const user = usuarioActual_();
  exigir_(user.ROL === APP.ROLES.ADMIN, 'PROHIBIDO', 'Solo un administrador puede instalar actualizaciones del sistema.');
  const existentes = repoTodos('CATALOGOS', { incluirInactivos: true });
  const claves = existentes.reduce(function(out, item) { out[item.TIPO_CATALOGO + '|' + item.CODIGO] = true; return out; }, {});
  const filas = [];
  Object.keys(CATALOGOS_INICIALES).forEach(function(type) {
    CATALOGOS_INICIALES[type].forEach(function(code, index) { if (!claves[type + '|' + code]) filas.push([type, code, code.replace(/_/g, ' '), index + 1, 'SI', '']); });
  });
  if (filas.length) hoja_('CATALOGOS').getRange(hoja_('CATALOGOS').getLastRow() + 1, 1, filas.length, SCHEMA.CATALOGOS.length).setValues(filas);
  CacheService.getScriptCache().remove(APP.CACHE_CATALOGS);
  const version = repoBuscarPorId('CONFIGURACION', 'VERSION');
  if (version) repoActualizar('CONFIGURACION', 'VERSION', { VALOR: APP.VERSION, ACTUALIZADO_EN: ahoraIso_(), ACTUALIZADO_POR: user.EMAIL }, { motivo: 'Actualización Módulo 3' });
  else repoInsertar('CONFIGURACION', { CLAVE: 'VERSION', VALOR: APP.VERSION, DESCRIPCION: 'Versión instalada', ACTUALIZADO_EN: ahoraIso_(), ACTUALIZADO_POR: user.EMAIL });
  auditoriaRegistrar_('ACTUALIZAR_MODULO', 'SISTEMA', APP.VERSION, null, { catalogosAgregados: filas.length }, 'Instalación Módulo 3');
  return respuestaOk({ mensaje: 'Módulo 3 actualizado.', catalogosAgregados: filas.length, version: APP.VERSION });
}

function asegurarEstructuraV4_() {
  const ss = db_();
  Object.keys(SCHEMA).forEach(function(name) {
    let sheet = ss.getSheetByName(name);
    if (!sheet) sheet = ss.insertSheet(name);
    const expected = SCHEMA[name], current = sheet.getLastColumn() ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0] : [];
    expected.forEach(function(header) {
      if (current.indexOf(header) < 0) { const col = sheet.getLastColumn() + 1; sheet.getRange(1, col).setValue(header); current.push(header); }
    });
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, expected.length).setBackground('#215783').setFontColor('#ffffff').setFontWeight('bold');
    if (!sheet.getFilter() && sheet.getLastRow() >= 1 && expected.length) sheet.getRange(1, 1, Math.max(1, sheet.getLastRow()), expected.length).createFilter();
  });
}

function actualizarFichasYDocumentos() {
  try {
    const user = usuarioActual_();
    exigir_(user.ROL === APP.ROLES.ADMIN, 'PROHIBIDO', 'Solo un administrador puede instalar esta actualización.');
    const respaldo = crearRespaldoActualizacion_();
    asegurarEstructuraV4_();
    const existentes = repoTodos('CATALOGOS', { incluirInactivos: true }).reduce(function(out, x) { out[x.TIPO_CATALOGO + '|' + x.CODIGO] = true; return out; }, {});
    const nuevas = [];
    Object.keys(CATALOGOS_INICIALES).forEach(function(tipo) {
      CATALOGOS_INICIALES[tipo].forEach(function(codigo, orden) {
        if (!existentes[tipo + '|' + codigo]) nuevas.push([tipo, codigo, ETIQUETAS_CATALOGO[codigo] || codigo.replace(/_/g, ' '), orden + 1, 'SI', '']);
      });
    });
    if (nuevas.length) hoja_('CATALOGOS').getRange(hoja_('CATALOGOS').getLastRow() + 1, 1, nuevas.length, SCHEMA.CATALOGOS.length).setValues(nuevas);
    const etiquetasCorregidas = sincronizarEtiquetasCatalogos_();
    CacheService.getScriptCache().remove(APP.CACHE_CATALOGS);
    limpiarCacheDatos_();
    const config = repoBuscarPorId('CONFIGURACION', 'VERSION');
    const cambios = { VALOR: APP.VERSION, ACTUALIZADO_EN: ahoraIso_(), ACTUALIZADO_POR: user.EMAIL };
    if (config) repoActualizar('CONFIGURACION', 'VERSION', cambios, { motivo: 'Actualización fichas y documentos 1.6' });
    else repoInsertar('CONFIGURACION', Object.assign({ CLAVE: 'VERSION', DESCRIPCION: 'Versión instalada' }, cambios));
    auditoriaRegistrar_('ACTUALIZAR_MODULO', 'SISTEMA', APP.VERSION, null, { respaldoId: respaldo.id, catalogosAgregados: nuevas.length, etiquetasCorregidas: etiquetasCorregidas }, 'Fichas, origen de atención y requisitos documentales');
    return respuestaOk({ mensaje: 'Actualización aplicada. No se eliminó información existente.', respaldo: respaldo, catalogosAgregados: nuevas.length, etiquetasCorregidas: etiquetasCorregidas, version: APP.VERSION });
  } catch (error) { return manejarError_(error, 'actualizarFichasYDocumentos'); }
}

function sincronizarEtiquetasCatalogos_() {
  const sheet = hoja_('CATALOGOS'), last = sheet.getLastRow();
  if (last < 2) return 0;
  const values = sheet.getRange(2, 1, last - 1, 3).getValues();
  let cambios = 0;
  values.forEach(function(row, i) {
    const etiqueta = ETIQUETAS_CATALOGO[String(row[1])];
    if (etiqueta && String(row[2]) !== String(etiqueta)) {
      sheet.getRange(i + 2, 3).setValue(etiqueta);
      cambios++;
    }
  });
  return cambios;
}

function completarCodigosVisibles_() {
  [['PERSONAS', 'CODIGO_PERSONA', 'PER'], ['EMPRENDIMIENTOS', 'CODIGO_EMPRENDIMIENTO', 'EMP']].forEach(function(config) {
    const tabla = config[0], field = config[1], prefix = config[2], sheet = hoja_(tabla), headers = encabezados_(tabla), col = headers.indexOf(field) + 1, last = sheet.getLastRow();
    if (last < 2) return;
    const values = sheet.getRange(2, col, last - 1, 1).getDisplayValues();
    let max = 0;
    values.forEach(function(r) {
      const m = String(r[0] || '').match(new RegExp('^' + prefix + '-(\\d+)$'));
      if (m) max = Math.max(max, Number(m[1]));
    });
    const output = values.map(function(r) {
      if (r[0]) return [r[0]];
      max++;
      return [prefix + '-' + String(max).padStart(6, '0')];
    });
    sheet.getRange(2, col, output.length, 1).setValues(output);
  });
}

function migrarAdmisionesVigentes_() {
  const sheet = hoja_('ADMISIONES'), headers = encabezados_('ADMISIONES'), last = sheet.getLastRow();
  if (last < 2) return 0;
  const rows = sheet.getRange(2, 1, last - 1, headers.length).getValues().map(function(r, i) {
    return { row: i + 2, data: filaAObjeto_(headers, r) };
  });
  const groups = {};
  rows.forEach(function(x) {
    (groups[String(x.data.ID_POSTULACION)] = groups[String(x.data.ID_POSTULACION)] || []).push(x);
  });
  const colExec = headers.indexOf('ID_EJECUCION_ADMISION') + 1, colCurrent = headers.indexOf('ES_VIGENTE') + 1;
  let changed = 0;
  Object.keys(groups).forEach(function(postId) {
    const group = groups[postId].sort(function(a, b) { return String(a.data.EVALUADO_EN).localeCompare(String(b.data.EVALUADO_EN)); });
    if (group.some(function(x) { return x.data.ES_VIGENTE === 'SI'; })) return;
    const latest = group[group.length - 1], latestTime = new Date(latest.data.EVALUADO_EN).getTime(), execution = 'MIG-' + uuid_().slice(0, 8);
    group.forEach(function(x) {
      const time = new Date(x.data.EVALUADO_EN).getTime();
      const current = !isNaN(time) && !isNaN(latestTime) && latestTime - time <= 60000;
      sheet.getRange(x.row, colExec).setValue(current ? execution : (x.data.ID_EJECUCION_ADMISION || ''));
      sheet.getRange(x.row, colCurrent).setValue(current ? 'SI' : 'NO');
      changed++;
    });
  });
  return changed;
}

function actualizarCatalogosYEtiquetas_() {
  const sheet = hoja_('CATALOGOS'), headers = encabezados_('CATALOGOS');
  let rows = repoTodos('CATALOGOS', { incluirInactivos: true }), keys = {};
  rows.forEach(function(r) { keys[r.TIPO_CATALOGO + '|' + r.CODIGO] = true; });
  Object.keys(CATALOGOS_INICIALES).forEach(function(type) {
    CATALOGOS_INICIALES[type].forEach(function(code, index) {
      if (!keys[type + '|' + code]) {
        repoInsertar('CATALOGOS', {
          TIPO_CATALOGO: type,
          CODIGO: code,
          ETIQUETA: ETIQUETAS_CATALOGO[code] || code.replace(/_/g, ' '),
          ORDEN: index + 1,
          ACTIVO: 'SI',
          METADATA_JSON: EXPLICACION_OPERADORES[code] || ''
        }, { auditar: false });
      }
    });
  });
  rows = repoTodos('CATALOGOS', { incluirInactivos: true });
  const values = rows.map(function(r) {
    r.ETIQUETA = ETIQUETAS_CATALOGO[r.CODIGO] || r.ETIQUETA || r.CODIGO.replace(/_/g, ' ');
    if (EXPLICACION_OPERADORES[r.CODIGO]) r.METADATA_JSON = JSON.stringify({ explicacion: EXPLICACION_OPERADORES[r.CODIGO] });
    return objetoAFila_(headers, r);
  });
  if (values.length) sheet.getRange(2, 1, values.length, headers.length).setValues(values);
  CacheService.getScriptCache().remove(APP.CACHE_CATALOGS);
}

function columnaLetra_(tabla, campo) {
  let n = encabezados_(tabla).indexOf(campo) + 1, s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function actualizarPanelOperativoSheets() {
  const ss = db_();
  let sheet = ss.getSheetByName('PANEL_OPERATIVO');
  if (!sheet) sheet = ss.insertSheet('PANEL_OPERATIVO', 0);
  sheet.clear();
  sheet.setHiddenGridlines(true);
  const formUrl = PropertiesService.getScriptProperties().getProperty(APP.PROP_FORM_URL) || '';
  const personas = repoTodos('PERSONAS', { incluirInactivos: true });
  const emprendimientos = repoTodos('EMPRENDIMIENTOS', { incluirInactivos: true });
  const iniciativas = repoTodos('INICIATIVAS', { incluirInactivos: true });
  const postulaciones = repoTodos('POSTULACIONES', { incluirInactivos: true });
  const documentos = repoTodos('DOCUMENTOS', { incluirInactivos: true });
  const rows = [
    ['SGE - PANEL OPERATIVO', 'Respaldo de consulta cuando la aplicación web no esté disponible', '', ''],
    ['Actualizado', ahoraIso_(), 'Los datos se calculan directamente desde las hojas maestras.', ''],
    ['Indicador', 'Valor', 'Uso recomendado', 'Ir a'],
    ['Personas activas', personas.filter(function(x) { return x.ESTADO_REGISTRO === 'ACTIVO'; }).length, 'Consulta general de personas', 'Abrir PERSONAS'],
    ['Posibles duplicados', personas.filter(function(x) { return x.ESTADO_REGISTRO === 'POSIBLE_DUPLICADO'; }).length, 'Revisar antes de crear otra ficha', 'Revisar personas'],
    ['Emprendimientos activos', emprendimientos.filter(function(x) { return x.ESTADO_EMPRENDIMIENTO === 'ACTIVO'; }).length, 'Consulta de emprendimientos vigentes', 'Abrir EMPRENDIMIENTOS'],
    ['Iniciativas abiertas', iniciativas.filter(function(x) { return x.ESTADO === 'ABIERTA'; }).length, 'Procesos que reciben postulaciones', 'Abrir INICIATIVAS'],
    ['Postulaciones subsanables', postulaciones.filter(function(x) { return x.ESTADO_POSTULACION === 'SUBSANABLE'; }).length, 'Casos que requieren completar antecedentes', 'Abrir POSTULACIONES'],
    ['Documentos pendientes', documentos.filter(function(x) { return x.ESTADO_REVISION === 'PENDIENTE'; }).length, 'Archivos por revisar', 'Abrir DOCUMENTOS'],
    ['Formulario único', formUrl ? 'Disponible' : 'Pendiente de creación', 'Registro conectado de persona y emprendimiento', formUrl ? 'Abrir formulario' : 'Ejecute crearFormularioUnicoRegistro']
  ];
  sheet.getRange(1, 1, rows.length, 4).setValues(rows);
  const destinos = [
    { row: 4, text: 'Abrir PERSONAS', url: ss.getUrl() + '#gid=' + hoja_('PERSONAS').getSheetId() },
    { row: 5, text: 'Revisar personas', url: ss.getUrl() + '#gid=' + hoja_('PERSONAS').getSheetId() },
    { row: 6, text: 'Abrir EMPRENDIMIENTOS', url: ss.getUrl() + '#gid=' + hoja_('EMPRENDIMIENTOS').getSheetId() },
    { row: 7, text: 'Abrir INICIATIVAS', url: ss.getUrl() + '#gid=' + hoja_('INICIATIVAS').getSheetId() },
    { row: 8, text: 'Abrir POSTULACIONES', url: ss.getUrl() + '#gid=' + hoja_('POSTULACIONES').getSheetId() },
    { row: 9, text: 'Abrir DOCUMENTOS', url: ss.getUrl() + '#gid=' + hoja_('DOCUMENTOS').getSheetId() }
  ];
  if (formUrl) destinos.push({ row: 10, text: 'Abrir formulario', url: formUrl });
  destinos.forEach(function(destino) {
    const enlace = SpreadsheetApp.newRichTextValue().setText(destino.text).setLinkUrl(destino.url).build();
    sheet.getRange(destino.row, 4).setRichTextValue(enlace).setFontColor('#075985').setFontWeight('bold');
  });
  sheet.getRange('A1:D1').merge().setBackground('#163f63').setFontColor('#fff').setFontSize(18).setFontWeight('bold');
  sheet.getRange('A3:D3').setBackground('#215783').setFontColor('#fff').setFontWeight('bold');
  sheet.setFrozenRows(3);
  sheet.setColumnWidths(1, 4, 210);
  sheet.setColumnWidth(3, 360);
  sheet.getRange(4, 2, rows.length - 3, 1).setFontSize(14).setFontWeight('bold');
  sheet.getRange(1, 1, rows.length, 4).setVerticalAlignment('middle').setWrap(true);
  sheet.setRowHeights(1, rows.length, 32);
  return respuestaOk({ mensaje: 'Panel operativo actualizado.', url: ss.getUrl() + '#gid=' + sheet.getSheetId() });
}

function instalarMenuSheets_() {
  const triggers = ScriptApp.getProjectTriggers();
  if (!triggers.some(function(t) { return t.getHandlerFunction() === 'alAbrirBaseSGE'; })) {
    ScriptApp.newTrigger('alAbrirBaseSGE').forSpreadsheet(db_()).onOpen().create();
  }
}

function alAbrirBaseSGE() {
  SpreadsheetApp.getUi().createMenu('SGE')
    .addItem('Actualizar panel operativo', 'menuActualizarPanelSGE')
    .addItem('Crear o abrir formulario único', 'menuFormularioRegistroSGE')
    .addItem('Actualizar formulario: edad, género y documentos', 'menuActualizarFormularioRegistroV202')
    .addItem('Preparar plantilla de formularios de mercado', 'menuPlantillaFormularioMercadosV203')
    .addSeparator()
    .addItem('Diagnosticar sistema', 'menuDiagnosticoSGE')
    .addToUi();
}

function menuActualizarPanelSGE() { const r = actualizarPanelOperativoSheets(); SpreadsheetApp.getUi().alert(r.ok ? r.data.mensaje : r.error.message); }
function menuFormularioRegistroSGE() { const r = crearFormularioUnicoRegistro(); SpreadsheetApp.getUi().alert(r.ok ? 'Formulario disponible: ' + r.data.url : r.error.message); }
function menuActualizarFormularioRegistroV202() { const r = actualizarFormularioRegistroCiudadanoV202(); SpreadsheetApp.getUi().alert(r.ok ? 'Formulario actualizado. Abra la edición para agregar las preguntas de carga de archivos: ' + r.data.editUrl : r.error.message); }
function menuPlantillaFormularioMercadosV203() { const r = crearPlantillaFormularioPostulacionMercadosV203(); SpreadsheetApp.getUi().alert(r.ok ? (r.data.completa ? 'Plantilla documental completa.' : 'Plantilla disponible, pero todavía faltan cargas de archivos: ' + (r.data.detalleValidacion || r.data.faltantes.join(', '))) + '\n\nEdición: ' + r.data.editUrl : r.error.message); }
function menuDiagnosticoSGE() { SpreadsheetApp.getUi().alert(JSON.stringify(diagnosticarInstalacion(), null, 2)); }

function crearFormularioUnicoRegistro() {
  try {
    const user = usuarioActual_();
    exigir_(user.ROL === APP.ROLES.ADMIN, 'PROHIBIDO', 'Solo un administrador puede configurar el formulario.');
    const props = PropertiesService.getScriptProperties();
    let form, id = props.getProperty(APP.PROP_FORM_ID);
    if (id) { try { form = FormApp.openById(id); } catch (ignored) { form = null; } }
    if (!form) {
      form = FormApp.create('Registro único de emprendedores - Municipalidad de Santiago');
      form.setDescription('Complete una sola vez los datos de la persona y de su emprendimiento. La información será revisada por el equipo municipal.');
      form.addSectionHeaderItem().setTitle('Datos de la persona');
      form.addTextItem().setTitle('RUT').setRequired(true);
      form.addTextItem().setTitle('Nombres').setRequired(true);
      form.addTextItem().setTitle('Apellido paterno').setRequired(true);
      form.addTextItem().setTitle('Apellido materno');
      form.addDateItem().setTitle('Fecha de nacimiento');
      form.addListItem().setTitle('Género').setChoiceValues(['MUJER', 'HOMBRE', 'NO_BINARIO', 'OTRO', 'PREFIERE_NO_INFORMAR']);
      form.addListItem().setTitle('Discapacidad declarada').setChoiceValues(['SI', 'NO', 'PREFIERE_NO_INFORMAR']);
      form.addTextItem().setTitle('Correo electrónico').setRequired(true);
      form.addTextItem().setTitle('Teléfono').setRequired(true);
      form.addTextItem().setTitle('Comuna de residencia').setRequired(true);
      form.addSectionHeaderItem().setTitle('Datos del emprendimiento');
      form.addTextItem().setTitle('Nombre del emprendimiento').setRequired(true);
      form.addListItem().setTitle('Rubro').setChoiceValues(CATALOGOS_INICIALES.RUBRO).setRequired(true);
      form.addParagraphTextItem().setTitle('Descripción de productos o servicios').setRequired(true);
      form.addListItem().setTitle('Formalización').setChoiceValues(CATALOGOS_INICIALES.FORMALIZACION).setRequired(true);
      form.addTextItem().setTitle('Instagram');
      form.addTextItem().setTitle('Facebook');
      form.addTextItem().setTitle('TikTok');
      form.addTextItem().setTitle('Sitio web');
      form.setConfirmationMessage('Registro recibido correctamente. El equipo municipal revisará los antecedentes.');
      form.setDestination(FormApp.DestinationType.SPREADSHEET, db_().getId());
      props.setProperty(APP.PROP_FORM_ID, form.getId());
    }
    asegurarCamposFormularioRegistro_(form);
    try {
      DriveApp.getFileById(form.getId()).moveTo(carpetaFormulariosPublicos_());
    } catch (ignored) {}
    const triggers = ScriptApp.getProjectTriggers();
    if (!triggers.some(function(t) { return t.getHandlerFunction() === 'procesarRegistroFormulario'; })) {
      ScriptApp.newTrigger('procesarRegistroFormulario').forForm(form).onFormSubmit().create();
    }
    const url = form.getPublishedUrl();
    props.setProperty(APP.PROP_FORM_URL, url);
    actualizarPanelOperativoSheets();
    return respuestaOk({ id: form.getId(), url: url, editUrl: form.getEditUrl() });
  } catch (error) { return manejarError_(error, 'crearFormularioUnicoRegistro'); }
}

function carpetaFormulariosPublicos_() {
  const props = PropertiesService.getScriptProperties();
  const customId = props.getProperty('DRIVE_MI_UNIDAD_FORM_FOLDER_ID');
  if (customId) {
    try {
      return DriveApp.getFolderById(customId);
    } catch (e) {}
  }
  const rootPersonal = DriveApp.getRootFolder();
  const folders = rootPersonal.getFoldersByName('SGE - Formularios Convocatorias');
  const folder = folders.hasNext() ? folders.next() : rootPersonal.createFolder('SGE - Formularios Convocatorias');
  try {
    props.setProperty('DRIVE_MI_UNIDAD_FORM_FOLDER_ID', folder.getId());
  } catch (e) {}
  return folder;
}

/**
 * Traslada los formularios de Google a "Mi Unidad" en la carpeta "SGE - Formularios Convocatorias"
 * para que Google Forms permita agregar y utilizar preguntas de "Carga de archivos" sin error.
 */
function migrarFormulariosAMiUnidad() {
  const carpetaDestino = carpetaFormulariosPublicos_();
  const props = PropertiesService.getScriptProperties();
  const ids = [
    props.getProperty(APP.PROP_FORM_ID),
    props.getProperty(APP.PROP_FORM_MERCADO_TEMPLATE_ID)
  ].filter(Boolean);

  const map = JSON.parse(props.getProperty('SGE_FORM_MERCADO_MAP') || '{}');
  Object.keys(map).forEach(function(formId) {
    if (ids.indexOf(formId) < 0) ids.push(formId);
  });

  const movidos = [];
  ids.forEach(function(id) {
    try {
      const file = DriveApp.getFileById(id);
      file.moveTo(carpetaDestino);
      movidos.push(file.getName());
    } catch (e) {
      Logger.log('No se pudo mover ' + id + ': ' + e.message);
    }
  });

  Logger.log('=====================================================');
  Logger.log('✅ FORMULARIOS MOVIDOS A MI UNIDAD:');
  Logger.log('📁 Carpeta: ' + carpetaDestino.getName() + ' (' + carpetaDestino.getUrl() + ')');
  Logger.log('📋 Archivos: ' + (movidos.join(', ') || 'Ninguno'));
  Logger.log('=====================================================');

  return respuestaOk({
    mensaje: 'Formularios movidos a Mi Unidad. Ahora admiten carga de archivos sin restricciones.',
    carpetaUrl: carpetaDestino.getUrl(),
    formulariosMovidos: movidos
  });
}

function asegurarCamposFormularioRegistro_(form) {
  const titles = form.getItems().map(function(item) { return item.getTitle(); });
  if (titles.indexOf('Fecha de nacimiento') < 0) form.addDateItem().setTitle('Fecha de nacimiento');
  if (titles.indexOf('Género') < 0) form.addListItem().setTitle('Género').setChoiceValues(['MUJER', 'HOMBRE', 'NO_BINARIO', 'OTRO', 'PREFIERE_NO_INFORMAR']);
  if (titles.indexOf('Discapacidad declarada') < 0) form.addListItem().setTitle('Discapacidad declarada').setChoiceValues(['SI', 'NO', 'PREFIERE_NO_INFORMAR']);
  if (titles.indexOf('Documentos para revisión (opcional)') < 0) {
    form.addSectionHeaderItem().setTitle('Documentos para revisión (opcional)').setHelpText('Si el equipo activa cargas de archivos, suba cada documento en la pregunta respectiva. Los documentos serán revisados antes de quedar vigentes.');
  }
}

function actualizarFormularioRegistroCiudadanoV202() {
  try {
    const user = usuarioActual_();
    exigir_(user.ROL === APP.ROLES.ADMIN, 'PROHIBIDO', 'Solo un administrador puede actualizar el formulario ciudadano.');
    const form = crearFormularioUnicoRegistro();
    if (!form.ok) return form;
    limpiarCacheDatos_();
    auditoriaRegistrar_('ACTUALIZAR_FORMULARIO_CIUDADANO', 'SISTEMA', APP.VERSION, null, { formularioId: form.data.id }, 'Se aseguraron fecha de nacimiento, género, discapacidad y sección documental.');
    return respuestaOk({ mensaje: 'Formulario ciudadano actualizado sin eliminar respuestas.', url: form.data.url, editUrl: form.data.editUrl });
  } catch (error) { return manejarError_(error, 'actualizarFormularioRegistroCiudadanoV202'); }
}

function actualizarFormulariosMercadoV203() {
  try {
    const user = usuarioActual_();
    exigir_(user.ROL === APP.ROLES.ADMIN, 'PROHIBIDO', 'Solo un administrador puede instalar esta actualización.');
    const respaldo = crearRespaldoActualizacion_();
    asegurarEstructuraV4_();
    instalarMenuSheets_();
    const plantilla = crearPlantillaFormularioPostulacionMercadosV203();
    const version = repoBuscarPorId('CONFIGURACION', 'VERSION'), changes = { VALOR: APP.VERSION, ACTUALIZADO_EN: ahoraIso_(), ACTUALIZADO_POR: user.EMAIL };
    if (version) repoActualizar('CONFIGURACION', 'VERSION', changes, { motivo: 'Actualización formularios de mercado 2.0.3' });
    else repoInsertar('CONFIGURACION', Object.assign({ CLAVE: 'VERSION', DESCRIPCION: 'Versión instalada' }, changes));
    auditoriaRegistrar_('ACTUALIZAR_FORMULARIOS_MERCADO', 'SISTEMA', APP.VERSION, null, { respaldoId: respaldo.id, plantillaId: plantilla.ok ? plantilla.data.id : '' }, 'Formularios de mercado como puerta de entrada y control de duplicados.');
    limpiarCacheDatos_();
    return respuestaOk({ mensaje: 'Actualización 2.0.3 instalada sin eliminar datos.', version: APP.VERSION, respaldo: respaldo, plantilla: plantilla.ok ? plantilla.data : null });
  } catch (error) { return manejarError_(error, 'actualizarFormulariosMercadoV203'); }
}

function actualizarFormulariosMercadoV204() {
  try {
    const user = usuarioActual_();
    exigir_(user.ROL === APP.ROLES.ADMIN, 'PROHIBIDO', 'Solo un administrador puede instalar esta actualización.');
    const respaldo = crearRespaldoActualizacion_();
    asegurarEstructuraV4_();
    instalarMenuSheets_();
    const plantilla = crearPlantillaFormularioPostulacionMercadosV203();
    const version = repoBuscarPorId('CONFIGURACION', 'VERSION'), changes = { VALOR: APP.VERSION, ACTUALIZADO_EN: ahoraIso_(), ACTUALIZADO_POR: user.EMAIL };
    if (version) repoActualizar('CONFIGURACION', 'VERSION', changes, { motivo: 'Corrección de plantilla documental 2.0.4' });
    else repoInsertar('CONFIGURACION', Object.assign({ CLAVE: 'VERSION', DESCRIPCION: 'Versión instalada' }, changes));
    auditoriaRegistrar_('ACTUALIZAR_PLANTILLA_DOCUMENTAL', 'SISTEMA', APP.VERSION, null, { respaldoId: respaldo.id, plantillaId: plantilla.ok ? plantilla.data.id : '' }, 'Detección tolerante y recuperación de cargas documentales.');
    limpiarCacheDatos_();
    return respuestaOk({ mensaje: 'Actualización 2.0.4 instalada sin eliminar datos.', version: APP.VERSION, respaldo: respaldo, plantilla: plantilla.ok ? plantilla.data : null });
  } catch (error) { return manejarError_(error, 'actualizarFormulariosMercadoV204'); }
}

function actualizarFormulariosMercadoV205() {
  try {
    const user = usuarioActual_();
    exigir_(user.ROL === APP.ROLES.ADMIN, 'PROHIBIDO', 'Solo un administrador puede instalar esta actualización.');
    const respaldo = crearRespaldoActualizacion_();
    asegurarEstructuraV4_();
    instalarMenuSheets_();
    const plantilla = crearPlantillaFormularioPostulacionMercadosV203();
    const version = repoBuscarPorId('CONFIGURACION', 'VERSION'), changes = { VALOR: APP.VERSION, ACTUALIZADO_EN: ahoraIso_(), ACTUALIZADO_POR: user.EMAIL };
    if (version) repoActualizar('CONFIGURACION', 'VERSION', changes, { motivo: 'Publicación compatible de formularios 2.0.5' });
    else repoInsertar('CONFIGURACION', Object.assign({ CLAVE: 'VERSION', DESCRIPCION: 'Versión instalada' }, changes));
    auditoriaRegistrar_('ACTUALIZAR_PUBLICACION_FORMULARIOS', 'SISTEMA', APP.VERSION, null, { respaldoId: respaldo.id, plantillaId: plantilla.ok ? plantilla.data.id : '' }, 'Compatibilidad con el estado publicado de Google Forms.');
    limpiarCacheDatos_();
    return respuestaOk({ mensaje: 'Actualización 2.0.5 instalada sin eliminar datos.', version: APP.VERSION, respaldo: respaldo, plantilla: plantilla.ok ? plantilla.data : null });
  } catch (error) { return manejarError_(error, 'actualizarFormulariosMercadoV205'); }
}

const DOCUMENTOS_FORMULARIO_REGISTRO = Object.freeze([
  { titulo: 'Cédula por ambos lados (único archivo)', aliases: ['Cédula de identidad por ambos lados (único archivo)', 'Cedula por ambos lados unico archivo'], tipoSujeto: 'PERSONA', tipoDocumento: 'CEDULA_IDENTIDAD_COMPLETA' },
  { titulo: 'Registro Social de Hogares', tipoSujeto: 'PERSONA', tipoDocumento: 'REGISTRO_SOCIAL_HOGARES' },
  { titulo: 'Credencial de discapacidad o pensión de invalidez', tipoSujeto: 'PERSONA', tipoDocumento: 'ACREDITACION_DISCAPACIDAD' },
  { titulo: 'Certificado inicio de actividades', aliases: ['Certificado de inicio de actividades'], tipoSujeto: 'EMPRENDIMIENTO', tipoDocumento: 'INICIO_ACTIVIDADES' },
  { titulo: 'Ficha técnica de productos o servicios', tipoSujeto: 'EMPRENDIMIENTO', tipoDocumento: 'FICHA_TECNICA_PRODUCTOS' }
]);

function normalizarTituloFormulario_(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function tipoItemFormulario_(item) {
  try { return String(item.getType()); } catch (ignored) { return 'DESCONOCIDO'; }
}

function esPreguntaCargaArchivo_(item) {
  const tipo = tipoItemFormulario_(item);
  return tipo === 'FILE_UPLOAD' || tipo === String(FormApp.ItemType.FILE_UPLOAD);
}

function titulosDocumentoAceptados_(config) {
  return [config.titulo].concat(config.aliases || []).map(normalizarTituloFormulario_);
}

function buscarItemsDocumentoFormulario_(items, config) {
  const aceptados = titulosDocumentoAceptados_(config);
  return items.filter(function(item) { return aceptados.indexOf(normalizarTituloFormulario_(item.getTitle())) >= 0; });
}

function respuestaDocumentoFormulario_(answers, config) {
  const keys = Object.keys(answers || {}), aceptados = titulosDocumentoAceptados_(config);
  const key = keys.find(function(k) { return aceptados.indexOf(normalizarTituloFormulario_(k)) >= 0; });
  return key === undefined ? null : answers[key];
}

function idsArchivosRespuestaFormulario_(respuesta) {
  const values = Array.isArray(respuesta) ? respuesta : [respuesta];
  const ids = [];
  values.filter(function(v) { return v !== null && v !== undefined && String(v).trim(); }).forEach(function(value) {
    String(value).split(/[\s,;]+/).forEach(function(part) {
      const matches = part.match(/[-\w]{20,}/g) || [];
      matches.forEach(function(id) { if (ids.indexOf(id) < 0) ids.push(id); });
    });
  });
  return ids;
}

function huellaArchivo_(file) {
  const bytes = file.getBlob().getBytes();
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes);
  return digest.map(function(b) {
    const v = (b + 256) % 256;
    return ('0' + v.toString(16)).slice(-2);
  }).join('');
}

function registrarDocumentoFormularioPublico_(tipoSujeto, idSujeto, tipoDocumento, idArchivo, creadoEn) {
  const origen = DriveApp.getFileById(idArchivo);
  validarArchivoDocumento_(origen.getBlob());
  const huella = huellaArchivo_(origen);
  const carpeta = carpetaDocumentalSujeto_(tipoSujeto, idSujeto, tipoDocumento);
  const anteriores = repoTodos('DOCUMENTOS', { incluirInactivos: true }).filter(function(d) {
    return String(d.ID_SUJETO) === String(idSujeto) && d.TIPO_DOCUMENTO === tipoDocumento;
  });
  const repetido = anteriores.find(function(d) { return d.HUELLA_ARCHIVO && String(d.HUELLA_ARCHIVO) === huella; });
  if (repetido) return { documento: repetido, reutilizado: true };
  anteriores.filter(function(d) { return d.ES_VERSION_VIGENTE === 'SI'; }).forEach(function(d) {
    repoActualizar('DOCUMENTOS', d.ID_DOCUMENTO, { ES_VERSION_VIGENTE: 'NO', ESTADO_REVISION: 'REEMPLAZADO' }, { motivo: 'Nueva versión desde formulario ciudadano' });
  });
  const ext = String(origen.getName() || '').split('.').pop().replace(/[^a-zA-Z0-9]/g, '').slice(0, 8);
  const nombre = [tipoDocumento, Utilities.formatDate(new Date(), APP.TIMEZONE, 'yyyyMMdd_HHmmss'), uuid_().slice(0, 8)].join('_') + (ext ? '.' + ext : '');
  const copia = origen.makeCopy(nombre, carpeta);
  copia.setDescription('Documento SGE recibido mediante formulario ciudadano el ' + creadoEn);
  const documento = repoInsertar('DOCUMENTOS', {
    ID_DOCUMENTO: uuid_(),
    TIPO_SUJETO: tipoSujeto,
    ID_SUJETO: idSujeto,
    TIPO_DOCUMENTO: tipoDocumento,
    ID_ARCHIVO_DRIVE: copia.getId(),
    VERSION: anteriores.length + 1,
    FECHA_EMISION: '',
    FECHA_VENCIMIENTO: '',
    ESTADO_REVISION: 'RECIBIDO',
    REVISADO_POR: '',
    REVISADO_EN: '',
    MOTIVO_OBSERVACION: '',
    ES_VERSION_VIGENTE: 'SI',
    CREADO_EN: creadoEn,
    CREADO_POR: 'FORMULARIO_PUBLICO',
    HUELLA_ARCHIVO: huella
  }, { auditar: false });
  return { documento: documento, reutilizado: false };
}

function procesarDocumentosFormularioRegistro_(answers, persona, emp, recibido) {
  const resultado = [];
  DOCUMENTOS_FORMULARIO_REGISTRO.forEach(function(config) {
    const ids = idsArchivosRespuestaFormulario_(respuestaDocumentoFormulario_(answers, config));
    ids.forEach(function(id) {
      try {
        const guardado = registrarDocumentoFormularioPublico_(
          config.tipoSujeto,
          config.tipoSujeto === 'PERSONA' ? persona.ID_PERSONA : emp.ID_EMPRENDIMIENTO,
          config.tipoDocumento,
          id,
          recibido
        );
        resultado.push(config.tipoDocumento + (guardado.reutilizado ? ' (ya registrado)' : ''));
      } catch (error) {
        resultado.push(config.tipoDocumento + ' (no procesado: ' + error.message + ')');
      }
    });
  });
  return resultado;
}

function respuestasFormulario_(e) {
  const out = {};
  (e && e.response ? e.response.getItemResponses() : []).forEach(function(r) {
    out[r.getItem().getTitle()] = r.getResponse();
  });
  return out;
}

function procesarRegistroFormulario(e) {
  const received = ahoraIso_(), answers = respuestasFormulario_(e), responseId = e && e.response && e.response.getId ? e.response.getId() : uuid_();
  try {
    conBloqueoSistema_(function() {
      const personaData = {
        RUT: answers['RUT'],
        NOMBRES: answers['Nombres'],
        APELLIDO_PATERNO: answers['Apellido paterno'],
        APELLIDO_MATERNO: answers['Apellido materno'],
        FECHA_NACIMIENTO: answers['Fecha de nacimiento'],
        GENERO: answers['Género'],
        DISCAPACIDAD_DECLARADA: answers['Discapacidad declarada'],
        EMAIL: answers['Correo electrónico'],
        TELEFONO: answers['Teléfono'],
        COMUNA_RESIDENCIA: answers['Comuna de residencia']
      };
      let persona = duplicadoPersonaExacto_(personaData);
      if (!persona) {
        const value = normalizarPersona_(personaData);
        exigir_(value.NOMBRES && value.APELLIDO_PATERNO, 'DATOS_INCOMPLETOS', 'Nombre y apellido son obligatorios.');
        exigir_(!value.RUT_NORMALIZADO || validarRut_(value.RUT_NORMALIZADO), 'RUT_INVALIDO', 'El RUT ingresado no es válido.');
        value.ESTADO_REGISTRO = buscarDuplicadosPersona_(value).length ? 'POSIBLE_DUPLICADO' : 'ACTIVO';
        value.CREADO_EN = received;
        value.CREADO_POR = 'FORMULARIO_UNICO';
        value.ACTUALIZADO_EN = received;
        value.ACTUALIZADO_POR = 'FORMULARIO_UNICO';
        persona = repoInsertar('PERSONAS', value, { motivo: 'Registro desde formulario único' });
      } else {
        persona = actualizarPersonaRegistroIntegral_(persona, personaData, 'FORMULARIO_UNICO');
      }
      const empData = normalizarEmprendimiento_({
        NOMBRE_COMERCIAL: answers['Nombre del emprendimiento'] || answers['Nombre comercial'],
        ID_RUBRO: answers['Rubro'],
        DESCRIPCION: answers['Descripción de productos o servicios'],
        FORMALIZACION: answers['Formalización'],
        INSTAGRAM: answers['Instagram'],
        FACEBOOK: answers['Facebook'],
        TIKTOK: answers['TikTok'],
        SITIO_WEB: answers['Sitio web']
      });
      const relacionPrevia = relacionActivaPorSujeto_('PERSONA', persona.ID_PERSONA);
      let emp = relacionPrevia && repoBuscarPorId('EMPRENDIMIENTOS', relacionPrevia.ID_EMPRENDIMIENTO);
      if (emp) {
        emp = actualizarEmprendimientoRegistroIntegral_(emp, empData, 'FORMULARIO_UNICO');
      } else {
        const candidato = buscarDuplicadosEmprendimiento_(empData).find(function(e) { return !relacionActivaPorSujeto_('EMPRENDIMIENTO', e.ID_EMPRENDIMIENTO); });
        emp = candidato
          ? actualizarEmprendimientoRegistroIntegral_(candidato, empData, 'FORMULARIO_UNICO')
          : repoInsertar('EMPRENDIMIENTOS', Object.assign({}, empData, {
            ETAPA_ACTUAL: 'ARRANQUE',
            ESTADO_EMPRENDIMIENTO: 'ACTIVO',
            CREADO_EN: received,
            CREADO_POR: 'FORMULARIO_UNICO',
            ACTUALIZADO_EN: received,
            ACTUALIZADO_POR: 'FORMULARIO_UNICO'
          }), { motivo: 'Registro desde formulario único' });
      }
      const exists = repoTodos('PERSONA_EMPRENDIMIENTO', { incluirInactivos: true }).some(function(r) {
        return String(r.ID_PERSONA) === String(persona.ID_PERSONA) && String(r.ID_EMPRENDIMIENTO) === String(emp.ID_EMPRENDIMIENTO) && r.ESTADO_REGISTRO !== 'INACTIVO';
      });
      if (!exists) {
        repoInsertar('PERSONA_EMPRENDIMIENTO', {
          ID_PERSONA: persona.ID_PERSONA,
          ID_EMPRENDIMIENTO: emp.ID_EMPRENDIMIENTO,
          ROL: 'TITULAR',
          ES_PRINCIPAL: 'SI',
          DESDE: received,
          HASTA: '',
          ESTADO_REGISTRO: 'ACTIVO',
          CREADO_EN: received,
          CREADO_POR: 'FORMULARIO_UNICO'
        }, { motivo: 'Vinculación automática desde formulario único' });
      }
      const documentos = procesarDocumentosFormularioRegistro_(answers, persona, emp, recibido);
      repoInsertar('REGISTROS_FORMULARIO', {
        FECHA_RECEPCION: received,
        ORIGEN: 'GOOGLE_FORMS',
        ID_RESPUESTA: responseId,
        ID_PERSONA: persona.ID_PERSONA,
        ID_EMPRENDIMIENTO: emp.ID_EMPRENDIMIENTO,
        RESULTADO: 'PROCESADO',
        DETALLE: 'Persona y emprendimiento vinculados' + (documentos.length ? '. Documentos recibidos: ' + documentos.join(', ') : ''),
        PROCESADO_EN: ahoraIso_()
      }, { auditar: false });
    });
  } catch (error) {
    repoInsertar('REGISTROS_FORMULARIO', {
      FECHA_RECEPCION: received,
      ORIGEN: 'GOOGLE_FORMS',
      ID_RESPUESTA: responseId,
      RESULTADO: 'ERROR',
      DETALLE: String(error.message || error),
      PROCESADO_EN: ahoraIso_()
    }, { auditar: false });
    manejarError_(error, 'procesarRegistroFormulario');
  }
}

function crearRespaldoActualizacion_() {
  const props = PropertiesService.getScriptProperties();
  const root = carpetaRoot_();
  const backups = carpetaHija_(root, 'Respaldos_sistema');
  const dbId = (props ? props.getProperty(APP.PROP_DB_ID) : null) || PREINSTALACION_DRIVE.DB_ID;
  const name = 'RESPALDO_SGE_ANTES_' + APP.VERSION.replace(/[^A-Z0-9._-]/gi, '_') + '_' + Utilities.formatDate(new Date(), APP.TIMEZONE, 'yyyyMMdd_HHmmss');
  const copy = DriveApp.getFileById(dbId).makeCopy(name, backups);
  return { id: copy.getId(), url: copy.getUrl(), nombre: name };
}

function actualizarMejorasIntegrales() {
  const user = usuarioActual_();
  exigir_(user.ROL === APP.ROLES.ADMIN, 'PROHIBIDO', 'Solo un administrador puede instalar actualizaciones.');
  const respaldo = crearRespaldoActualizacion_();
  asegurarEstructuraV4_();
  completarCodigosVisibles_();
  actualizarCatalogosYEtiquetas_();
  const admisiones = migrarAdmisionesVigentes_();
  instalarMenuSheets_();
  const form = crearFormularioUnicoRegistro();
  actualizarPanelOperativoSheets();
  const version = repoBuscarPorId('CONFIGURACION', 'VERSION');
  if (version) repoActualizar('CONFIGURACION', 'VERSION', { VALOR: APP.VERSION, ACTUALIZADO_EN: ahoraIso_(), ACTUALIZADO_POR: user.EMAIL }, { motivo: 'Actualización integral 1.4.0' });
  else repoInsertar('CONFIGURACION', { CLAVE: 'VERSION', VALOR: APP.VERSION, DESCRIPCION: 'Versión instalada', ACTUALIZADO_EN: ahoraIso_(), ACTUALIZADO_POR: user.EMAIL });
  auditoriaRegistrar_('ACTUALIZAR_MODULO', 'SISTEMA', APP.VERSION, null, { respaldoId: respaldo.id, admisionesMigradas: admisiones, formulario: form.ok ? 'CONFIGURADO' : 'PENDIENTE' }, 'Actualización integral previa a nuevos módulos');
  return respuestaOk({
    mensaje: 'Mejoras integrales instaladas.',
    version: APP.VERSION,
    respaldo: respaldo,
    admisionesMigradas: admisiones,
    formulario: form.ok ? form.data : null,
    formularioError: form.ok ? '' : form.error.message,
    diagnostico: diagnosticarInstalacion()
  });
}

function cargarCatalogosIniciales_() {
  const sheet = hoja_('CATALOGOS');
  if (sheet.getLastRow() > 1) return;
  const rows = [];
  Object.keys(CATALOGOS_INICIALES).forEach(function(type) {
    CATALOGOS_INICIALES[type].forEach(function(code, index) {
      rows.push([type, code, ETIQUETAS_CATALOGO[code] || code.replace(/_/g, ' '), index + 1, 'SI', EXPLICACION_OPERADORES[code] ? JSON.stringify({ explicacion: EXPLICACION_OPERADORES[code] }) : '']);
    });
  });
  if (rows.length) sheet.getRange(2, 1, rows.length, SCHEMA.CATALOGOS.length).setValues(rows);
}

function cargarRolesIniciales_() {
  const sheet = hoja_('ROLES');
  if (sheet.getLastRow() > 1) return;
  const descripciones = {
    ADMIN: 'Control total de la aplicación y administración de usuarios',
    COORDINADOR: 'Gestión de iniciativas, procesos de selección y reportería',
    GESTOR: 'Atención a personas, gestión de emprendimientos y postulaciones',
    REVISOR: 'Revisión y validación de expedientes documentales sensibles',
    ANALISTA: 'Análisis agregado de estadísticas y reportes sin datos identificables',
    AUDITOR: 'Consulta de auditoría y trazabilidad histórica del sistema'
  };
  const rows = Object.keys(PERMISOS_ROL).map(function(rol) {
    return [rol, descripciones[rol] || rol, JSON.stringify(PERMISOS_ROL[rol])];
  });
  sheet.getRange(2, 1, rows.length, SCHEMA.ROLES.length).setValues(rows);
}

function diagnosticarInstalacion() {
  const diagnostic = { ok: true, faltantes: [], tablas: {}, rootFolder: false, catalogos: 0, roles: 0 };
  try {
    const ss = db_();
    Object.keys(SCHEMA).forEach(function(name) {
      const sheet = ss.getSheetByName(name);
      diagnostic.tablas[name] = !!sheet;
      if (!sheet) { diagnostic.ok = false; diagnostic.faltantes.push('Hoja faltante: ' + name); }
    });
  } catch (e) {
    diagnostic.ok = false;
    diagnostic.faltantes.push('Base de datos no accesible: ' + e.message);
  }
  try {
    const folder = carpetaRoot_();
    diagnostic.rootFolder = !!folder;
  } catch (e) {
    diagnostic.ok = false;
    diagnostic.faltantes.push('Carpeta raíz no accesible: ' + e.message);
  }
  try { diagnostic.catalogos = repoContar('CATALOGOS'); } catch (ignored) {}
  try { diagnostic.roles = repoContar('ROLES'); } catch (ignored) {}
  return diagnostic;
}

function cargarDatosDemo() {
  const user = usuarioActual_();
  exigir_(user.ROL === APP.ROLES.ADMIN, 'PROHIBIDO', 'Solo un administrador puede cargar datos de demostración.');
  const persona = crearPersona_({
    RUT: '11.111.111-1',
    NOMBRES: 'María Elena',
    APELLIDO_PATERNO: 'González',
    APELLIDO_MATERNO: 'Tapia',
    FECHA_NACIMIENTO: '1985-05-12',
    GENERO: 'MUJER',
    DISCAPACIDAD_DECLARADA: 'NO',
    TELEFONO: '912345678',
    EMAIL: 'maria.gonzalez@demo.cl',
    COMUNA_RESIDENCIA: 'Santiago'
  });
  const emp = crearEmprendimiento_({
    NOMBRE_COMERCIAL: 'Cerámicas El Barrio',
    DESCRIPCION: 'Taller artesanal de piezas cerámicas utilitarias y decorativas.',
    ID_RUBRO: 'ARTESANIA',
    ID_SUBRUBRO: 'CERAMICA_ALFARERIA',
    FECHA_INICIO_ESTIMADA: '2023-03-01',
    FORMALIZACION: 'INICIO_ACTIVIDADES',
    DEDICACION: 'PRINCIPAL',
    CANAL_VENTA: 'FERIAS',
    ETAPA_ACTUAL: 'DESARROLLO',
    TERRITORIO_OPERACION: 'Barrio Yungay',
    INSTAGRAM: 'ceramicas_elbarrio',
    ORIGEN_ATENCION: 'DEMANDA'
  });
  vincularPersonaEmprendimiento_(persona.ID_PERSONA, emp.ID_EMPRENDIMIENTO, 'TITULAR', true);
  return respuestaOk({ mensaje: 'Datos de demostración cargados exitosamente.', persona: persona, emprendimiento: emp });
}
