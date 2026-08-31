// ===== WebApp.gs =====
// SGE v2.1.0 - Ficha integral del emprendedor
// Punto de entrada HTML5, resolución de plantillas y bootstrapping del frontend

/**
 * Punto de entrada HTTP GET para la aplicación web de Google Apps Script.
 */
function doGet() {
  let template;
  try {
    template = HtmlService.createTemplateFromFile('Index');
  } catch (e) {
    template = HtmlService.createTemplateFromFile('frontend/Index');
  }
  template.appName = APP.NAME;
  template.version = APP.VERSION;
  return template.evaluate()
    .setTitle(APP.NAME)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

/**
 * Función auxiliar para incluir archivos HTML parciales (Styles, Scripts, etc.) en plantillas.
 */
function include_(filename) {
  try {
    return HtmlService.createHtmlOutputFromFile(filename).getContent();
  } catch (e) {
    try {
      return HtmlService.createHtmlOutputFromFile('frontend/' + filename).getContent();
    } catch (e2) {
      throw e;
    }
  }
}

/**
 * API RPC: Inicializa la aplicación en el cliente con datos de usuario, permisos, catálogos y dashboard.
 */
function apiBootstrap() {
  try {
    const user = usuarioActual_();
    let dashboard = null;
    if (puede_('REPORTE_VER')) {
      const dbResp = apiDashboard();
      if (dbResp.ok) dashboard = dbResp.data;
    }
    const props = PropertiesService.getScriptProperties();
    const formUrl = props ? props.getProperty(APP.PROP_FORM_URL) || '' : '';
    return respuestaOk({
      app: { name: APP.NAME, version: APP.VERSION },
      usuario: user,
      permisos: PERMISOS_ROL[user.ROL] || [],
      catalogos: catalogos_(),
      dashboard: dashboard,
      formularioRegistroUrl: formUrl,
      explicacionOperadores: EXPLICACION_OPERADORES
    });
  } catch (error) {
    return manejarError_(error, 'apiBootstrap');
  }
}

/**
 * API RPC genérica para listar entidades permitidas.
 */
function apiListar(tabla, filtros) {
  try {
    usuarioActual_();
    const permitidas = ['INICIATIVAS', 'POSTULACIONES', 'PARTICIPACIONES', 'BENEFICIOS', 'ATENCIONES'];
    exigir_(permitidas.indexOf(tabla) >= 0, 'TABLA_NO_PUBLICADA', tabla);
    return respuestaOk(repoListar(tabla, { filtro: filtros || {}, limit: APP.PAGE_SIZE }));
  } catch (error) {
    return manejarError_(error, 'apiListar');
  }
}
