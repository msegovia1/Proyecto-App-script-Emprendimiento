// ===== WebApp.gs =====
// SGE v2.1.0 - Ficha integral del emprendedor
// Punto de entrada HTML5, resolución de plantillas y bootstrapping del frontend

/**
 * Punto de entrada HTTP GET para la aplicación web de Google Apps Script.
 */
function doGet() {
  const candidates = ['Index', 'src/frontend/Index', 'frontend/Index'];
  let template = null;
  for (let i = 0; i < candidates.length; i++) {
    try {
      template = HtmlService.createTemplateFromFile(candidates[i]);
      if (template) break;
    } catch (ignored) {}
  }
  if (!template) template = HtmlService.createTemplateFromFile('Index');
  template.appName = APP.NAME;
  template.version = APP.VERSION;
  return template.evaluate()
    .setTitle(APP.NAME)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

function include_(filename) {
  const candidates = [
    filename,
    'src/frontend/' + filename,
    'frontend/' + filename
  ];
  for (let i = 0; i < candidates.length; i++) {
    try {
      return HtmlService.createHtmlOutputFromFile(candidates[i]).getContent();
    } catch (ignored) {}
  }
  return '';
}

/**
 * API RPC: Inicializa la aplicación en el cliente con datos de usuario, permisos, catálogos y dashboard.
 */
function apiBootstrap() {
  try {
    const user = usuarioActual_();
    let dashboard = null;
    if (puede_('REPORTE_VER')) {
      const dbResp = apiDashboardIntegral(false);
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
