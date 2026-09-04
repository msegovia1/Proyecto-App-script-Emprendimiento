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

/**
 * API RPC: Valida un RUT chileno en tiempo real con algoritmo Módulo 11.
 */
function apiValidarRut(rut) {
  return validarRutChileno(rut);
}

/**
 * API RPC: Configura las credenciales de Turso en las propiedades del script.
 */
function apiTursoConfigurar(url, token) {
  try {
    usuarioActual_();
    return tursoConfigurarCredenciales(url, token);
  } catch (error) {
    return { success: false, data: null, error: error.message };
  }
}

/**
 * API RPC: Prueba la conexión directa a Turso con SELECT 1.
 */
function apiTursoProbar() {
  try {
    return tursoTestConexion();
  } catch (error) {
    return { success: false, data: null, error: error.message };
  }
}

/**
 * API RPC: Inicializa el esquema DDL relacional en Turso.
 */
function apiTursoInicializar() {
  try {
    usuarioActual_();
    return tursoInicializarEsquema();
  } catch (error) {
    return { success: false, data: null, error: error.message };
  }
}

/**
 * API RPC: Guarda o actualiza un emprendedor y su negocio con validaciones chilenas.
 */
function apiFichaGuardar(payload) {
  try {
    const user = usuarioActual_();
    if (payload) payload.usuarioEmail = user.EMAIL;
    return guardarFichaEmprendedor(payload);
  } catch (error) {
    return { success: false, data: null, error: error.message };
  }
}

/**
 * API RPC: Consulta la ficha integral de un emprendedor por RUT o ID.
 */
function apiFichaDetalle(rutOId) {
  try {
    return obtenerFichaIntegral(rutOId);
  } catch (error) {
    return { success: false, data: null, error: error.message };
  }
}

/**
 * API RPC: Lista emprendedores con filtros de búsqueda y rubro.
 */
function apiFichasListar(filtros) {
  try {
    return listarFichasEmprendedores(filtros || {});
  } catch (error) {
    return { success: false, data: null, error: error.message };
  }
}

/**
 * API RPC: Sube un archivo a Google Drive y registra en Turso.
 */
function apiExpedienteCargar(params) {
  try {
    const user = usuarioActual_();
    if (params) params.usuarioEmail = user.EMAIL;
    return cargarDocumentoExpediente(params);
  } catch (error) {
    return { success: false, data: null, error: error.message };
  }
}

/**
 * API RPC: Lista iniciativas y ferias comunales.
 */
function apiIniciativasListar(filtros) {
  try {
    return listarIniciativas(filtros);
  } catch (error) {
    return { success: false, data: null, error: error.message };
  }
}

/**
 * API RPC: Crea una nueva iniciativa/feria.
 */
function apiIniciativaCrear(payload) {
  try {
    const user = usuarioActual_();
    if (payload) payload.usuarioEmail = user.EMAIL;
    return crearIniciativa(payload);
  } catch (error) {
    return { success: false, data: null, error: error.message };
  }
}

/**
 * API RPC: Actualiza una iniciativa o mercado existente.
 */
function apiIniciativaActualizar(payload) {
  try {
    const user = usuarioActual_();
    if (payload) payload.usuarioEmail = user.EMAIL;
    return actualizarIniciativa(payload);
  } catch (error) {
    return { success: false, data: null, error: error.message };
  }
}

/**
 * API RPC: Registra una postulación.
 */
function apiPostulacionRegistrar(payload) {
  try {
    const user = usuarioActual_();
    if (payload) payload.usuarioEmail = user.EMAIL;
    return registrarPostulacion(payload);
  } catch (error) {
    return { success: false, data: null, error: error.message };
  }
}

/**
 * API RPC: Evalúa admisibilidad contra criterios paramétricos.
 */
function apiAdmisibilidadEvaluar(idIniciativa) {
  try {
    const user = usuarioActual_();
    return evaluarAdmisibilidadIniciativa(idIniciativa, user.EMAIL);
  } catch (error) {
    return { success: false, data: null, error: error.message };
  }
}

/**
 * API RPC: Ejecuta el sorteo pseudoaleatorio determinista LCG con semilla.
 */
function apiSeleccionEjecutar(params) {
  try {
    const user = usuarioActual_();
    if (params) params.ejecutorEmail = user.EMAIL;
    return ejecutarSeleccionTransparente(params);
  } catch (error) {
    return { success: false, data: null, error: error.message };
  }
}

/**
 * API RPC: Gestiona confirmación o desistimiento con reasignación en cascada.
 */
function apiConfirmacionGestionar(params) {
  try {
    const user = usuarioActual_();
    if (params) params.usuarioEmail = user.EMAIL;
    return gestionarConfirmacionTitular(params);
  } catch (error) {
    return { success: false, data: null, error: error.message };
  }
}

/**
 * API RPC: Guarda métricas de seguimiento post-mercado.
 */
function apiSeguimientoPostMercadoGuardar(payload) {
  try {
    const user = usuarioActual_();
    if (payload) payload.usuarioEmail = user.EMAIL;
    return guardarSeguimientoPostMercado(payload);
  } catch (error) {
    return { success: false, data: null, error: error.message };
  }
}

/**
 * API RPC: Obtiene el Dashboard Ejecutivo consolidado con métricas en vivo.
 */
function apiDashboardConsolidado() {
  try {
    return obtenerDashboardConsolidado();
  } catch (error) {
    return { success: false, data: null, error: error.message };
  }
}

/**
 * API RPC: Obtiene las postulaciones de un mercado para selección por funcionarios (Camino 1).
 */
function apiListarPostulacionesMercado(idIniciativa) {
  try {
    return obtenerPostulacionesMercado(idIniciativa);
  } catch (error) {
    return { success: false, data: null, error: error.message };
  }
}

/**
 * API RPC: Actualiza masivamente el estado de postulaciones (Titular, Suplente, Rechazada, Admisible).
 */
function apiActualizarEstadoPostulacionesMasivo(payload) {
  try {
    const user = usuarioActual_();
    if (payload) payload.usuarioEmail = user.EMAIL;
    return actualizarEstadoPostulacionesMasivo(payload);
  } catch (error) {
    return { success: false, data: null, error: error.message };
  }
}

/**
 * API RPC: Obtiene los emprendedores registrados en el padrón comunal disponibles para ferias (Camino 2).
 */
function apiListarEmprendedoresDisponibles(filtro) {
  try {
    return obtenerEmprendedoresDisponibles(filtro);
  } catch (error) {
    return { success: false, data: null, error: error.message };
  }
}

/**
 * API RPC: Incorpora masivamente emprendedores de la base comunal a una feria del año.
 */
function apiIncorporarEmprendedoresAMercadoMasivo(payload) {
  try {
    const user = usuarioActual_();
    if (payload) payload.usuarioEmail = user.EMAIL;
    return incorporarEmprendedoresAMercadoMasivo(payload);
  } catch (error) {
    return { success: false, data: null, error: error.message };
  }
}

/**
 * API RPC: Obtiene participantes para evaluación de seguimiento masivo en terreno.
 */
function apiListarParticipantesSeguimiento(idIniciativa) {
  try {
    return obtenerParticipantesSeguimiento(idIniciativa);
  } catch (error) {
    return { success: false, data: null, error: error.message };
  }
}

/**
 * API RPC: Guarda masivamente el seguimiento e impacto post-mercado.
 */
function apiGuardarSeguimientoMasivo(payload) {
  try {
    const user = usuarioActual_();
    if (payload) payload.usuarioEmail = user.EMAIL;
    return guardarSeguimientoMasivo(payload);
  } catch (error) {
    return { success: false, data: null, error: error.message };
  }
}

/**
 * API RPC: Obtiene el listado de documentos digitales y fotos de un emprendedor para revisión de funcionarios.
 */
function apiListarDocumentosEmprendedor(identificador) {
  try {
    return obtenerDocumentosEmprendedor(identificador);
  } catch (error) {
    return { success: false, data: [], error: error.message };
  }
}

/**
 * API RPC: Obtiene el resumen comparativo de ventas por jornada/día de una feria.
 */
function apiObtenerResumenVentasPorDia(idIniciativa) {
  try {
    return obtenerResumenVentasPorDia(idIniciativa);
  } catch (error) {
    return { success: false, data: null, error: error.message };
  }
}



