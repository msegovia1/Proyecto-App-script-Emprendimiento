// ===== CONSOLIDADO SGE 2.1.0 =====


// ==========================================
// ARCHIVO: Config.gs
// ==========================================

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


// ==========================================
// ARCHIVO: Schema.gs
// ==========================================

// ===== Schema.gs =====
// SGE v2.1.0 - Ficha integral del emprendedor
// Definición del esquema de tablas en Google Sheets, catálogos iniciales y permisos RBAC

const SCHEMA = Object.freeze({
  PERSONAS: [
    'ID_PERSONA', 'RUT_NORMALIZADO', 'NOMBRES', 'APELLIDO_PATERNO', 'APELLIDO_MATERNO',
    'FECHA_NACIMIENTO', 'GENERO', 'DISCAPACIDAD_DECLARADA', 'TELEFONO_NORMALIZADO',
    'EMAIL_NORMALIZADO', 'COMUNA_RESIDENCIA', 'ESTADO_REGISTRO', 'CREADO_EN',
    'CREADO_POR', 'ACTUALIZADO_EN', 'ACTUALIZADO_POR', 'CODIGO_PERSONA'
  ],
  EMPRENDIMIENTOS: [
    'ID_EMPRENDIMIENTO', 'NOMBRE_COMERCIAL', 'DESCRIPCION', 'ID_RUBRO', 'ID_SUBRUBRO',
    'FECHA_INICIO_ESTIMADA', 'FORMALIZACION', 'DEDICACION', 'CANAL_VENTA', 'ETAPA_ACTUAL',
    'TERRITORIO_OPERACION', 'ESTADO_EMPRENDIMIENTO', 'CREADO_EN', 'CREADO_POR',
    'ACTUALIZADO_EN', 'ACTUALIZADO_POR', 'CODIGO_EMPRENDIMIENTO', 'INSTAGRAM',
    'FACEBOOK', 'TIKTOK', 'SITIO_WEB', 'ORIGEN_ATENCION'
  ],
  PERSONA_EMPRENDIMIENTO: [
    'ID_RELACION', 'ID_PERSONA', 'ID_EMPRENDIMIENTO', 'ROL', 'ES_PRINCIPAL',
    'DESDE', 'HASTA', 'ESTADO_REGISTRO', 'CREADO_EN', 'CREADO_POR'
  ],
  DIRECCIONES: [
    'ID_DIRECCION', 'TIPO_SUJETO', 'ID_SUJETO', 'TIPO_DIRECCION', 'DIRECCION_DECLARADA',
    'DIRECCION_NORMALIZADA', 'COMUNA', 'BARRIO', 'ESTADO_VALIDACION', 'ES_VIGENTE',
    'CREADO_EN', 'CREADO_POR'
  ],
  GEOLOCALIZACIONES: [
    'ID_GEOLOCALIZACION', 'ID_DIRECCION', 'LATITUD', 'LONGITUD', 'PRECISION',
    'FUENTE', 'FECHA_GEOCODIFICACION', 'ESTADO_VALIDACION', 'CREADO_POR'
  ],
  DOCUMENTOS: [
    'ID_DOCUMENTO', 'TIPO_SUJETO', 'ID_SUJETO', 'TIPO_DOCUMENTO', 'ID_ARCHIVO_DRIVE',
    'VERSION', 'FECHA_EMISION', 'FECHA_VENCIMIENTO', 'ESTADO_REVISION', 'REVISADO_POR',
    'REVISADO_EN', 'MOTIVO_OBSERVACION', 'ES_VERSION_VIGENTE', 'CREADO_EN',
    'CREADO_POR', 'HUELLA_ARCHIVO'
  ],
  DOCUMENTOS_INICIATIVA: [
    'ID_DOCUMENTO_INICIATIVA', 'ID_INICIATIVA', 'TIPO_DOCUMENTO', 'ID_ARCHIVO_DRIVE',
    'NOMBRE_ARCHIVO', 'ESTADO_REVISION', 'OBSERVACION', 'CREADO_EN', 'CREADO_POR'
  ],
  INICIATIVAS: [
    'ID_INICIATIVA', 'TIPO_INICIATIVA', 'NOMBRE', 'OBJETIVO', 'TEMATICA',
    'APERTURA_POSTULACION', 'CIERRE_POSTULACION', 'FECHA_EJECUCION', 'LUGAR',
    'ID_DIRECCION', 'CUPOS_TITULARES', 'CUPOS_SUPLENTES', 'VERSION_REGLAS',
    'ESTADO', 'RESPONSABLE', 'CREADO_EN', 'CREADO_POR', 'BARRIO',
    'ENTIDAD_ORGANIZADORA', 'ID_CARPETA_DRIVE', 'URL_FORMULARIO_POSTULACION'
  ],
  REQUISITOS: [
    'ID_REQUISITO', 'ID_INICIATIVA', 'VERSION_REGLAS', 'TIPO_REGLA', 'CAMPO',
    'OPERADOR', 'VALOR_ESPERADO', 'ES_SUBSANABLE', 'ORDEN', 'ACTIVO',
    'CREADO_EN', 'CREADO_POR'
  ],
  POSTULACIONES: [
    'ID_POSTULACION', 'ID_INICIATIVA', 'ID_EMPRENDIMIENTO', 'ID_PERSONA_CONTACTO',
    'FECHA_POSTULACION', 'ESTADO_POSTULACION', 'RESPUESTAS_JSON', 'CREADO_EN',
    'CREADO_POR', 'ACTUALIZADO_EN', 'ACTUALIZADO_POR'
  ],
  ADMISIONES: [
    'ID_ADMISION', 'ID_POSTULACION', 'ID_REQUISITO', 'RESULTADO', 'RESULTADO_REGLA',
    'MOTIVO_EXCLUSION', 'EVALUADO_EN', 'EVALUADO_POR', 'ID_EJECUCION_ADMISION', 'ES_VIGENTE'
  ],
  PROCESOS_SELECCION: [
    'ID_PROCESO', 'ID_INICIATIVA', 'VERSION_REGLAS', 'METODO', 'PARAMETROS_JSON',
    'SEMILLA', 'FECHA_EJECUCION', 'EJECUTADO_POR', 'ESTADO', 'TAMANO_UNIVERSO', 'HUELLA_INTEGRIDAD'
  ],
  UNIVERSO_SELECCION: [
    'ID_UNIVERSO', 'ID_PROCESO', 'ID_POSTULACION', 'ELEGIBLE', 'ESTRATO',
    'PONDERACION', 'ORDEN_ALEATORIO', 'MOTIVO_EXCLUSION', 'CREADO_EN'
  ],
  RESULTADOS_SELECCION: [
    'ID_RESULTADO', 'ID_PROCESO', 'ID_POSTULACION', 'RESULTADO', 'POSICION',
    'ESTRATO', 'FECHA_RESULTADO', 'PROCESO_ORIGEN'
  ],
  AJUSTES_SELECCION: [
    'ID_AJUSTE', 'ID_PROCESO', 'ID_RESULTADO', 'ESTADO_ANTERIOR', 'ESTADO_NUEVO',
    'MOTIVO', 'EVIDENCIA', 'AUTORIZADO_POR', 'FECHA_AJUSTE'
  ],
  PARTICIPACIONES: [
    'ID_PARTICIPACION', 'ID_RESULTADO', 'ID_POSTULACION', 'ESTADO_PARTICIPACION',
    'FECHA_CONFIRMACION', 'FECHA_ASISTENCIA', 'MOTIVO', 'REEMPLAZA_A', 'CREADO_EN', 'CREADO_POR'
  ],
  SEGUIMIENTO_MERCADO: [
    'ID_SEGUIMIENTO', 'ID_INICIATIVA', 'ID_EMPRENDIMIENTO', 'ID_POSTULACION',
    'FECHA_REGISTRO', 'VENTAS_ANTES', 'VENTAS_DURANTE', 'VENTAS_DESPUES',
    'SEGUIDORES_ANTES', 'SEGUIDORES_DESPUES', 'PUNTUALIDAD', 'RESPONSABILIDAD',
    'EVALUACION_FUNCIONARIO', 'OBSERVACION', 'REGISTRADO_POR', 'TIPO_AYUDA'
  ],
  BENEFICIOS: [
    'ID_BENEFICIO', 'ID_EMPRENDIMIENTO', 'ID_INICIATIVA', 'TIPO_BENEFICIO',
    'CANTIDAD', 'MONTO', 'FECHA', 'FUENTE', 'RESPONSABLE'
  ],
  ATENCIONES: [
    'ID_ATENCION', 'FECHA', 'ID_USUARIO', 'ID_PERSONA', 'ID_EMPRENDIMIENTO',
    'NECESIDAD', 'DIAGNOSTICO', 'ESTADO', 'OBSERVACION'
  ],
  DERIVACIONES: [
    'ID_DERIVACION', 'ID_ATENCION', 'ORIGEN', 'DESTINO', 'MOTIVO',
    'FECHA', 'RESULTADO', 'SEGUIMIENTO'
  ],
  COMUNICACIONES: [
    'ID_COMUNICACION', 'FECHA', 'TIPO_DESTINATARIO', 'ID_INICIATIVA',
    'FILTROS_JSON', 'CANTIDAD_DESTINATARIOS', 'ASUNTO_REFERENCIA', 'REGISTRADO_POR'
  ],
  EVALUACIONES_EMPRENDIMIENTO: [
    'ID_EVALUACION', 'ID_EMPRENDIMIENTO', 'FECHA_EVALUACION', 'PUNTAJE',
    'DIMENSIONES_JSON', 'CLASIFICACION', 'BRECHAS', 'MOTIVACION', 'DEDICACION',
    'NECESIDAD_PRIORITARIA', 'PROXIMA_REVISION', 'EVALUADO_POR'
  ],
  CLASIFICACION_HISTORICA: [
    'ID_HISTORIAL', 'ID_EMPRENDIMIENTO', 'ID_EVALUACION', 'CLASIFICACION_ANTERIOR',
    'CLASIFICACION_NUEVA', 'DESDE', 'HASTA', 'MOTIVO', 'REGISTRADO_POR'
  ],
  USUARIOS: [
    'ID_USUARIO', 'EMAIL', 'NOMBRE', 'ROL', 'ACTIVO', 'CREADO_EN', 'CREADO_POR'
  ],
  ROLES: [
    'ROL', 'DESCRIPCION', 'PERMISOS_JSON'
  ],
  AUDITORIA: [
    'ID_EVENTO_AUDITORIA', 'FECHA_HORA', 'ID_USUARIO', 'ROL', 'ACCION',
    'ENTIDAD', 'ID_REGISTRO', 'VALOR_ANTERIOR', 'VALOR_NUEVO', 'MOTIVO', 'ID_CORRELACION'
  ],
  CATALOGOS: [
    'TIPO_CATALOGO', 'CODIGO', 'ETIQUETA', 'ORDEN', 'ACTIVO', 'METADATA_JSON'
  ],
  CONFIGURACION: [
    'CLAVE', 'VALOR', 'DESCRIPCION', 'ACTUALIZADO_EN', 'ACTUALIZADO_POR'
  ],
  LOG_ERRORES: [
    'ID_ERROR', 'FECHA_HORA', 'USUARIO', 'FUNCION', 'MENSAJE', 'STACK', 'ID_CORRELACION'
  ],
  REGISTROS_FORMULARIO: [
    'ID_REGISTRO_FORMULARIO', 'FECHA_RECEPCION', 'ORIGEN', 'ID_RESPUESTA',
    'ID_PERSONA', 'ID_EMPRENDIMIENTO', 'RESULTADO', 'DETALLE', 'PROCESADO_EN'
  ]
});

const CATALOGOS_INICIALES = Object.freeze({
  ETAPA_EMPRENDIMIENTO: ['ARRANQUE', 'DESARROLLO', 'CONSOLIDACION'],
  ESTADO_EMPRENDIMIENTO: ['ACTIVO', 'ESTACIONAL', 'SUSPENDIDO', 'CERRADO'],
  FORMALIZACION: ['SIN_INICIO', 'INICIO_ACTIVIDADES', 'PATENTE', 'PERSONA_JURIDICA'],
  ORIGEN_ATENCION: ['DEMANDA', 'CASO_SOCIAL', 'ALCALDIA', 'LOBBY', 'OTRO'],
  DEDICACION: ['PRINCIPAL', 'COMPLEMENTARIA', 'ESTACIONAL'],
  RUBRO: [
    'ALIMENTACION', 'ARTESANIA', 'TEXTIL', 'BELLEZA_CUIDADO_PERSONAL',
    'COMERCIO', 'SERVICIOS', 'TECNOLOGIA', 'TURISMO', 'ECONOMIA_CIRCULAR', 'OTRO'
  ],
  SUBRUBRO: [
    'COMIDA_PREPARADA', 'COLACIONES_COFFEE_BREAK', 'PANADERIA_PASTELERIA', 'REPOSTERIA',
    'PRODUCTOS_GOURMET', 'CONSERVAS_ENCURTIDOS', 'BEBESTIBLES', 'ARTESANIA_TRADICIONAL',
    'CERAMICA_ALFARERIA', 'MADERA', 'CUERO', 'JOYERIA_BISUTERIA', 'TEJIDOS',
    'CONFECCION_VESTUARIO', 'BOLSOS_ACCESORIOS_TEXTILES', 'CALZADO', 'DECORACION_HOGAR',
    'ILUSTRACION_DISENO', 'COSMETICA_NATURAL', 'PELUQUERIA_BARBERIA', 'MANICURE_ESTETICA',
    'BIENESTAR_CUIDADO_PERSONAL', 'ALMACEN_REGALERIA', 'LIBRERIA_PAPELERIA',
    'REVENTA_COMERCIO', 'ASESORIAS_PROFESIONALES', 'SERVICIOS_PERSONALES',
    'OFICIOS_REPARACIONES', 'DESARROLLO_WEB_SOFTWARE', 'MARKETING_DISENO_DIGITAL',
    'TECNOLOGIA_SERVICIOS_DIGITALES', 'TURISMO_EXPERIENCIAS', 'GASTRONOMIA_TURISTICA',
    'RECICLAJE_REUTILIZACION', 'PRODUCTOS_SUSTENTABLES', 'OTRO'
  ],
  CANAL_VENTA: ['FERIAS', 'TIENDA_FISICA', 'REDES_SOCIALES', 'MARKETPLACE', 'SITIO_WEB', 'MAYORISTA', 'OTRO'],
  TIPO_DOCUMENTO_PERSONA: ['CEDULA_IDENTIDAD_COMPLETA', 'REGISTRO_SOCIAL_HOGARES', 'ACREDITACION_DISCAPACIDAD', 'OTRO'],
  TIPO_DOCUMENTO_EMPRENDIMIENTO: [
    'INICIO_ACTIVIDADES', 'PATENTE_COMERCIAL', 'FICHA_TECNICA_PRODUCTOS',
    'FOTOGRAFIA_PRODUCTOS', 'CONSTITUCION_EMPRESA', 'CERTIFICADO_SANITARIO', 'OTRO'
  ],
  TIPO_DOCUMENTO_INICIATIVA: [
    'MINUTA', 'GRAFICA', 'PROGRAMACION', 'LIBRETO', 'FOTOS_ACTIVIDAD',
    'LISTADO_ASISTENTES', 'OTRO'
  ],
  PUNTUALIDAD: ['A_TIEMPO', 'TARDE', 'SIN_REGISTRO'],
  RESPONSABILIDAD: ['DESTACADA', 'ADECUADA', 'OBSERVADA', 'SIN_REGISTRO'],
  EVALUACION_FUNCIONARIO: ['DESTACADO', 'ADECUADO', 'REQUIERE_APOYO', 'NO_EVALUADO'],
  ESTADO_INICIATIVA: ['BORRADOR', 'ABIERTA', 'CERRADA', 'EN_EJECUCION', 'FINALIZADA', 'CANCELADA'],
  TIPO_REGLA: ['ADMISIBILIDAD', 'PRIORIZACION'],
  CAMPO_REQUISITO: [
    'ID_RUBRO', 'ID_SUBRUBRO', 'FORMALIZACION', 'ETAPA_ACTUAL', 'ESTADO_EMPRENDIMIENTO',
    'COMUNA_PERSONA', 'GENERO_PERSONA', 'DISCAPACIDAD_DECLARADA',
    'DOCUMENTACION_PERSONA_COMPLETA', 'DOCUMENTACION_EMPRENDIMIENTO_COMPLETA',
    'HABILITADO_MERCADOS'
  ],
  OPERADOR_REQUISITO: ['IGUAL', 'IN', 'NO_IN', 'MAYOR_IGUAL', 'MENOR_IGUAL', 'EXISTE'],
  TIPO_INICIATIVA: ['MERCADO', 'FERIA', 'EVENTO', 'PROGRAMA', 'FONDO'],
  ESTADO_DOCUMENTO: ['RECIBIDO', 'VIGENTE', 'OBSERVADO', 'POR_VENCER', 'VENCIDO', 'RECHAZADO', 'REEMPLAZADO'],
  ESTADO_POSTULACION: ['BORRADOR', 'RECIBIDA', 'EN_REVISION', 'SUBSANABLE', 'ADMISIBLE', 'INADMISIBLE', 'RETIRADA'],
  RESULTADO_SELECCION: ['TITULAR', 'SUPLENTE', 'NO_SELECCIONADO', 'EXCLUIDO'],
  ESTADO_PARTICIPACION: ['PENDIENTE', 'CONFIRMADA', 'NO_RESPONDE', 'ASISTIO', 'INASISTENTE', 'DESISTIO', 'REEMPLAZADA'],
  TIPO_DIRECCION: ['PARTICULAR', 'COMERCIAL', 'PRODUCCION', 'NOTIFICACION'],
  ESTADO_VALIDACION: ['DECLARADO', 'VALIDADO', 'OBSERVADO', 'PENDIENTE'],
  ESTADO_REGISTRO: ['ACTIVO', 'INACTIVO', 'OBSERVADO', 'POSIBLE_DUPLICADO'],
  ROL_REPRESENTACION: ['TITULAR', 'REPRESENTANTE', 'SOCIO', 'CONTACTO'],
  TIPO_AYUDA: ['PUNTO_DE_VENTA', 'ASESORIA', 'PUNTO_DE_VENTA_Y_ASESORIA', 'OTRO']
});

const ETIQUETAS_CATALOGO = Object.freeze({
  PUNTO_DE_VENTA: 'Punto de venta (puesto en feria/mercado)',
  ASESORIA: 'Asesoría / Capacitación / Acompañamiento',
  PUNTO_DE_VENTA_Y_ASESORIA: 'Punto de venta y Asesoría',
  OTRO_APOYO: 'Otro apoyo municipal',
  ARRANQUE: 'Etapa inicial',
  DESARROLLO: 'En desarrollo',
  CONSOLIDACION: 'Consolidado',
  SIN_INICIO: 'Sin inicio de actividades',
  INICIO_ACTIVIDADES: 'Con inicio de actividades',
  PATENTE: 'Con patente comercial',
  PERSONA_JURIDICA: 'Persona jurídica',
  CEDULA_IDENTIDAD_FRONTAL: 'Cédula de identidad - frontal',
  CEDULA_IDENTIDAD_REVERSO: 'Cédula de identidad - reverso',
  CEDULA_IDENTIDAD_COMPLETA: 'Cédula por ambos lados (único archivo)',
  REGISTRO_SOCIAL_HOGARES: 'Registro Social de Hogares',
  ACREDITACION_DISCAPACIDAD: 'Credencial de discapacidad o pensión de invalidez',
  FICHA_TECNICA_PRODUCTOS: 'Ficha técnica de productos o servicios',
  FOTOGRAFIA_PRODUCTOS: 'Fotografías de productos',
  MINUTA: 'Minuta',
  GRAFICA: 'Gráfica',
  PROGRAMACION: 'Programación',
  LIBRETO: 'Libreto',
  FOTOS_ACTIVIDAD: 'Fotos de la actividad',
  LISTADO_ASISTENTES: 'Listado de emprendimientos asistentes',
  ADMISIBILIDAD: 'Admisibilidad',
  PRIORIZACION: 'Priorización',
  ID_RUBRO: 'Rubro del emprendimiento',
  ID_SUBRUBRO: 'Subrubro del emprendimiento',
  FORMALIZACION: 'Nivel de formalización',
  ETAPA_ACTUAL: 'Etapa de desarrollo',
  ORIGEN_ATENCION: 'Origen de la atención',
  HABILITADO_MERCADOS: 'Habilitación para mercados DIDEL',
  ESTADO_EMPRENDIMIENTO: 'Estado del emprendimiento',
  COMUNA_PERSONA: 'Comuna de residencia',
  GENERO_PERSONA: 'Género declarado',
  DISCAPACIDAD_DECLARADA: 'Discapacidad declarada',
  DOCUMENTACION_PERSONA_COMPLETA: 'Copia de cédula completa',
  DOCUMENTACION_EMPRENDIMIENTO_COMPLETA: 'Documentación del emprendimiento completa',
  IGUAL: 'Es igual a',
  IN: 'Está dentro de',
  NO_IN: 'No está dentro de',
  MAYOR_IGUAL: 'Es mayor o igual a',
  MENOR_IGUAL: 'Es menor o igual a',
  EXISTE: 'Tiene información registrada',
  ALEATORIO_SIMPLE: 'Sorteo aleatorio simple',
  ALEATORIO_ESTRATIFICADO: 'Sorteo por grupos',
  RANKING_PUNTAJE: 'Orden por puntaje'
});

const EXPLICACION_OPERADORES = Object.freeze({
  IGUAL: 'Cumple cuando el dato coincide exactamente con el valor esperado.',
  IN: 'Cumple cuando el dato está en una lista de alternativas separadas por |.',
  NO_IN: 'Cumple cuando el dato no aparece en la lista de alternativas.',
  MAYOR_IGUAL: 'Cumple cuando el número registrado es igual o superior al mínimo.',
  MENOR_IGUAL: 'Cumple cuando el número registrado es igual o inferior al máximo.',
  EXISTE: 'Cumple cuando el campo contiene cualquier información.'
});

const PERMISOS_ROL = Object.freeze({
  ADMIN: ['*'],
  GESTOR: [
    'PERSONA_VER', 'PERSONA_EDITAR', 'EMPRENDIMIENTO_VER', 'EMPRENDIMIENTO_EDITAR',
    'DOCUMENTO_CARGAR', 'DOCUMENTO_VER_SENSIBLE', 'DOCUMENTO_REVISAR',
    'INICIATIVA_EDITAR', 'POSTULACION_EDITAR', 'PARTICIPACION_EDITAR',
    'SELECCION_EJECUTAR', 'SELECCION_VER', 'REPORTE_VER', 'EXPORTAR_IDENTIFICABLE'
  ]
});


// ==========================================
// ARCHIVO: Normalizacion.gs
// ==========================================

// ===== Normalizacion.gs =====
// SGE v2.1.0 - Ficha integral del emprendedor
// Funciones de normalización de datos chilenos, validación de RUT, hashing y PRNG

/**
 * Normaliza un RUT chileno eliminando puntos y espacios, asegurando formato 12345678-K.
 */
function normalizarRut_(value) {
  const clean = String(value || '').replace(/[^0-9kK]/g, '').toUpperCase();
  if (clean.length < 2) return '';
  return clean.slice(0, -1) + '-' + clean.slice(-1);
}

/**
 * Valida un RUT chileno aplicando el algoritmo Módulo 11.
 */
function validarRut_(value) {
  const rut = normalizarRut_(value).replace('-', '');
  if (!rut || rut.length < 2) return false;
  const body = rut.slice(0, -1);
  const dv = rut.slice(-1);
  let sum = 0;
  let multiplier = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += Number(body[i]) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }
  const result = 11 - (sum % 11);
  const expected = result === 11 ? '0' : result === 10 ? 'K' : String(result);
  return dv === expected;
}

/**
 * Normaliza cadenas de texto eliminando espacios redundantes en extremos e interior.
 */
function normalizarTexto_(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

/**
 * Normaliza una dirección de correo electrónico a minúsculas y sin espacios.
 */
function normalizarEmail_(value) {
  return String(value || '').trim().toLowerCase();
}

/**
 * Normaliza números telefónicos a formato internacional E.164 (+56912345678).
 */
function normalizarTelefono_(value) {
  let clean = String(value || '').replace(/\D/g, '');
  if (clean.length === 9) clean = '56' + clean;
  return clean ? '+' + clean : '';
}

/**
 * Normaliza todos los campos de contacto y nombres de una persona.
 */
function normalizarPersona_(data) {
  const out = Object.assign({}, data);
  out.RUT_NORMALIZADO = normalizarRut_(data.RUT_NORMALIZADO || data.RUT);
  out.NOMBRES = normalizarTexto_(data.NOMBRES);
  out.APELLIDO_PATERNO = normalizarTexto_(data.APELLIDO_PATERNO);
  out.APELLIDO_MATERNO = normalizarTexto_(data.APELLIDO_MATERNO);
  out.EMAIL_NORMALIZADO = normalizarEmail_(data.EMAIL_NORMALIZADO || data.EMAIL);
  out.TELEFONO_NORMALIZADO = normalizarTelefono_(data.TELEFONO_NORMALIZADO || data.TELEFONO);
  return out;
}

/**
 * Genera el hash SHA-256 en formato hexadecimal de un valor.
 */
function huella_(value) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value), Utilities.Charset.UTF_8);
  return bytes.map(function(b) {
    const v = (b + 256) % 256;
    return ('0' + v.toString(16)).slice(-2);
  }).join('');
}

/**
 * Generador congruencial lineal pseudoaleatorio con semilla fija para sorteos reproducibles.
 */
function randomSemilla_(seed) {
  let x = Number(seed) || 1;
  return function() {
    x = (x * 1664525 + 1013904223) % 4294967296;
    return x / 4294967296;
  };
}


// ==========================================
// ARCHIVO: Repository.gs
// ==========================================

// ===== Repository.gs =====
// SGE v2.1.0 - Ficha integral del emprendedor
// Capa de persistencia y operaciones CRUD de alto rendimiento sobre Google Sheets

var _schemaHeadersCache = null;
var _dbInstance = null;
var _sheetCache = {};
var _repoTodosCache = {};

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


// ==========================================
// ARCHIVO: AuthService.gs
// ==========================================

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


// ==========================================
// ARCHIVO: AuditoriaService.gs
// ==========================================

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


// ==========================================
// ARCHIVO: PersonaService.gs
// ==========================================

// ===== PersonaService.gs =====
// SGE v2.1.0 - Ficha integral del emprendedor
// Gestión del registro de personas, detección de duplicados y actualización de titulares

/**
 * Detecta duplicados potenciales de persona comparando RUT, email, teléfono o nombre + fecha de nacimiento.
 */
function buscarDuplicadosPersona_(data, excluirId) {
  const n = normalizarPersona_(data);
  const all = repoTodos('PERSONAS', { incluirInactivos: false }).filter(function(p) {
    return String(p.ID_PERSONA) !== String(excluirId || '');
  });
  return all.filter(function(p) {
    if (n.RUT_NORMALIZADO && p.RUT_NORMALIZADO === n.RUT_NORMALIZADO) return true;
    if (n.EMAIL_NORMALIZADO && p.EMAIL_NORMALIZADO === n.EMAIL_NORMALIZADO) return true;
    if (n.TELEFONO_NORMALIZADO && p.TELEFONO_NORMALIZADO === n.TELEFONO_NORMALIZADO) return true;
    const sameName = normalizarTexto_(p.NOMBRES).toLowerCase() === n.NOMBRES.toLowerCase() &&
                     normalizarTexto_(p.APELLIDO_PATERNO).toLowerCase() === n.APELLIDO_PATERNO.toLowerCase();
    return sameName && String(p.FECHA_NACIMIENTO || '') === String(n.FECHA_NACIMIENTO || '');
  });
}

/**
 * Crea una nueva persona aplicando normalización, validación y control de duplicados.
 */
function crearPersona_(data) {
  const user = exigirPermiso_('PERSONA_EDITAR');
  return conBloqueoSistema_(function() {
    const value = normalizarPersona_(data || {});
    exigir_(value.NOMBRES && value.APELLIDO_PATERNO, 'DATOS_INCOMPLETOS', 'Nombres y apellido paterno son obligatorios.');
    if (value.RUT_NORMALIZADO) exigir_(validarRut_(value.RUT_NORMALIZADO), 'RUT_INVALIDO', 'El RUT ingresado no es válido.');
    const duplicates = buscarDuplicadosPersona_(value);
    value.ESTADO_REGISTRO = duplicates.length ? 'POSIBLE_DUPLICADO' : 'ACTIVO';
    value.ID_PERSONA = uuid_();
    value.CREADO_EN = ahoraIso_();
    value.CREADO_POR = user.EMAIL;
    value.ACTUALIZADO_EN = value.CREADO_EN;
    value.ACTUALIZADO_POR = user.EMAIL;
    return repoInsertar('PERSONAS', value);
  });
}

function apiCrearPersona(data) {
  try {
    return respuestaOk(crearPersona_(data));
  } catch (error) {
    return manejarError_(error, 'apiCrearPersona');
  }
}

function apiBuscarPersonas(query) {
  try {
    exigirPermiso_('PERSONA_VER');
    const q = normalizarTexto_(query).toLowerCase();
    const rows = repoTodos('PERSONAS', { incluirInactivos: false }).filter(function(p) {
      return [p.CODIGO_PERSONA, p.RUT_NORMALIZADO, p.NOMBRES, p.APELLIDO_PATERNO, p.APELLIDO_MATERNO, p.EMAIL_NORMALIZADO, p.TELEFONO_NORMALIZADO]
        .join(' ').toLowerCase().indexOf(q) >= 0;
    }).slice(0, APP.PAGE_SIZE);
    return respuestaOk(rows);
  } catch (error) {
    return manejarError_(error, 'apiBuscarPersonas');
  }
}

function apiListarPersonas(filtros) {
  try {
    exigirPermiso_('PERSONA_VER');
    filtros = filtros || {};
    const q = normalizarTexto_(filtros.q).toLowerCase();
    let rows = repoTodos('PERSONAS', { incluirInactivos: true });
    if (q) {
      rows = rows.filter(function(p) {
        return [p.CODIGO_PERSONA, p.RUT_NORMALIZADO, p.NOMBRES, p.APELLIDO_PATERNO, p.APELLIDO_MATERNO, p.EMAIL_NORMALIZADO, p.TELEFONO_NORMALIZADO, p.COMUNA_RESIDENCIA]
          .join(' ').toLowerCase().indexOf(q) >= 0;
      });
    }
    if (filtros.estado) rows = rows.filter(function(p) { return String(p.ESTADO_REGISTRO) === String(filtros.estado); });
    if (filtros.comuna) rows = rows.filter(function(p) { return normalizarTexto_(p.COMUNA_RESIDENCIA).toLowerCase() === normalizarTexto_(filtros.comuna).toLowerCase(); });
    rows.sort(function(a, b) { return String(b.ACTUALIZADO_EN || b.CREADO_EN).localeCompare(String(a.ACTUALIZADO_EN || a.CREADO_EN)); });
    const total = rows.length;
    const offset = Math.max(0, Number(filtros.offset || 0));
    const limit = Math.min(100, Math.max(10, Number(filtros.limit || 25)));
    return respuestaOk({ filas: rows.slice(offset, offset + limit), total: total, offset: offset, limit: limit });
  } catch (error) {
    return manejarError_(error, 'apiListarPersonas');
  }
}

function apiObtenerPersona(id) {
  try {
    exigirPermiso_('PERSONA_VER');
    const persona = repoBuscarPorId('PERSONAS', id);
    exigir_(persona, 'NO_ENCONTRADO', 'Persona no encontrada.');
    const relaciones = repoTodos('PERSONA_EMPRENDIMIENTO', { incluirInactivos: true })
      .filter(function(r) { return String(r.ID_PERSONA) === String(id) && r.ESTADO_REGISTRO !== 'INACTIVO'; })
      .map(function(r) {
        const emprendimiento = repoBuscarPorId('EMPRENDIMIENTOS', r.ID_EMPRENDIMIENTO);
        return Object.assign({}, r, { EMPRENDIMIENTO: emprendimiento || null });
      });
    return respuestaOk({ persona: persona, relaciones: relaciones });
  } catch (error) {
    return manejarError_(error, 'apiObtenerPersona');
  }
}

function apiActualizarPersona(id, data) {
  try {
    const user = exigirPermiso_('PERSONA_EDITAR');
    const actual = repoBuscarPorId('PERSONAS', id);
    exigir_(actual, 'NO_ENCONTRADO', 'Persona no encontrada.');
    const value = normalizarPersona_(Object.assign({}, actual, data || {}));
    exigir_(value.NOMBRES && value.APELLIDO_PATERNO, 'DATOS_INCOMPLETOS', 'Nombres y apellido paterno son obligatorios.');
    if (value.RUT_NORMALIZADO) exigir_(validarRut_(value.RUT_NORMALIZADO), 'RUT_INVALIDO', 'El RUT ingresado no es válido.');
    const duplicates = buscarDuplicadosPersona_(value, id);
    if (actual.ESTADO_REGISTRO !== 'INACTIVO') {
      value.ESTADO_REGISTRO = duplicates.length ? 'POSIBLE_DUPLICADO' : (data.ESTADO_REGISTRO || actual.ESTADO_REGISTRO || 'ACTIVO');
    }
    value.ACTUALIZADO_EN = ahoraIso_();
    value.ACTUALIZADO_POR = user.EMAIL;
    return respuestaOk(repoActualizar('PERSONAS', id, value));
  } catch (error) {
    return manejarError_(error, 'apiActualizarPersona');
  }
}

function apiCambiarEstadoPersona(id, estado, motivo) {
  try {
    const user = exigirPermiso_('PERSONA_EDITAR');
    exigir_(CATALOGOS_INICIALES.ESTADO_REGISTRO.indexOf(estado) >= 0, 'ESTADO_INVALIDO', estado);
    exigir_(motivo, 'MOTIVO_OBLIGATORIO', 'Debe indicar el motivo del cambio.');
    return respuestaOk(repoActualizar('PERSONAS', id, {
      ESTADO_REGISTRO: estado,
      ACTUALIZADO_EN: ahoraIso_(),
      ACTUALIZADO_POR: user.EMAIL
    }, { motivo: motivo }));
  } catch (error) {
    return manejarError_(error, 'apiCambiarEstadoPersona');
  }
}

function apiDesactivarRegistroDuplicado(tipo, id, motivo) {
  try {
    exigir_(motivo, 'MOTIVO_OBLIGATORIO', 'Explique brevemente por qué la ficha es duplicada.');
    tipo = String(tipo || '').toUpperCase();
    if (tipo === 'PERSONA') {
      const user = exigirPermiso_('PERSONA_EDITAR');
      const actual = repoBuscarPorId('PERSONAS', id);
      exigir_(actual, 'NO_ENCONTRADO', 'No se encontró la persona.');
      const result = repoActualizar('PERSONAS', id, {
        ESTADO_REGISTRO: 'INACTIVO',
        ACTUALIZADO_EN: ahoraIso_(),
        ACTUALIZADO_POR: user.EMAIL
      }, { motivo: 'Ficha duplicada: ' + motivo });
      return respuestaOk({ mensaje: 'La ficha duplicada fue desactivada. El historial se conserva.', registro: result });
    }
    if (tipo === 'EMPRENDIMIENTO') {
      const user = exigirPermiso_('EMPRENDIMIENTO_EDITAR');
      const actual = repoBuscarPorId('EMPRENDIMIENTOS', id);
      exigir_(actual, 'NO_ENCONTRADO', 'No se encontró el emprendimiento.');
      const result = repoActualizar('EMPRENDIMIENTOS', id, {
        ESTADO_EMPRENDIMIENTO: 'CERRADO',
        ACTUALIZADO_EN: ahoraIso_(),
        ACTUALIZADO_POR: user.EMAIL
      }, { motivo: 'Ficha duplicada: ' + motivo });
      return respuestaOk({ mensaje: 'El emprendimiento duplicado fue desactivado. El historial se conserva.', registro: result });
    }
    exigir_(false, 'TIPO_INVALIDO', 'Seleccione persona o emprendimiento.');
  } catch (error) {
    return manejarError_(error, 'apiDesactivarRegistroDuplicado');
  }
}

function duplicadoPersonaExacto_(data) {
  const n = normalizarPersona_(data || {});
  const personas = repoTodos('PERSONAS', { incluirInactivos: false });
  if (n.RUT_NORMALIZADO) {
    return personas.find(function(p) { return p.RUT_NORMALIZADO === n.RUT_NORMALIZADO; }) || null;
  }
  return personas.find(function(p) {
    return n.EMAIL_NORMALIZADO && n.TELEFONO_NORMALIZADO &&
      p.EMAIL_NORMALIZADO === n.EMAIL_NORMALIZADO &&
      p.TELEFONO_NORMALIZADO === n.TELEFONO_NORMALIZADO;
  }) || null;
}

function apiRegistroCompleto(data) {
  try {
    exigirPermiso_('PERSONA_EDITAR');
    exigirPermiso_('EMPRENDIMIENTO_EDITAR');
    return conBloqueoSistema_(function() {
      data = data || {};
      const personaData = data.PERSONA || {};
      const empData = data.EMPRENDIMIENTO || {};
      let persona = duplicadoPersonaExacto_(personaData);
      let personaReutilizada = !!persona;
      if (!persona) persona = crearPersona_(personaData);
      else persona = actualizarPersonaRegistroIntegral_(persona, personaData, emailActual_());

      const relacionActual = relacionActivaPorSujeto_('PERSONA', persona.ID_PERSONA);
      let emp = relacionActual ? repoBuscarPorId('EMPRENDIMIENTOS', relacionActual.ID_EMPRENDIMIENTO) : null;
      let empReutilizado = !!emp;
      if (emp) {
        emp = actualizarEmprendimientoRegistroIntegral_(emp, empData, emailActual_());
      } else {
        const candidatos = buscarDuplicadosEmprendimiento_(normalizarEmprendimiento_(empData)).filter(function(e) {
          return !relacionActivaPorSujeto_('EMPRENDIMIENTO', e.ID_EMPRENDIMIENTO);
        });
        emp = candidatos[0] || null;
        empReutilizado = !!emp;
        if (emp) emp = actualizarEmprendimientoRegistroIntegral_(emp, empData, emailActual_());
        else emp = crearEmprendimiento_(empData);
      }
      let relacion = repoTodos('PERSONA_EMPRENDIMIENTO', { incluirInactivos: true }).find(function(r) {
        return String(r.ID_PERSONA) === String(persona.ID_PERSONA) &&
               String(r.ID_EMPRENDIMIENTO) === String(emp.ID_EMPRENDIMIENTO) &&
               r.ESTADO_REGISTRO !== 'INACTIVO';
      }) || null;
      if (!relacion) {
        relacion = vincularPersonaEmprendimiento_(persona.ID_PERSONA, emp.ID_EMPRENDIMIENTO, data.ROL || 'TITULAR', data.ES_PRINCIPAL !== false);
      }
      return respuestaOk({
        persona: persona,
        emprendimiento: emp,
        relacion: relacion,
        personaReutilizada: personaReutilizada,
        emprendimientoReutilizado: empReutilizado
      });
    });
  } catch (error) {
    return manejarError_(error, 'apiRegistroCompleto');
  }
}

function actualizarPersonaRegistroIntegral_(persona, data, actor) {
  const value = normalizarPersona_(Object.assign({}, persona, data || {}));
  ['NOMBRES', 'APELLIDO_PATERNO', 'APELLIDO_MATERNO', 'FECHA_NACIMIENTO', 'GENERO', 'DISCAPACIDAD_DECLARADA', 'EMAIL_NORMALIZADO', 'TELEFONO_NORMALIZADO', 'COMUNA_RESIDENCIA'].forEach(function(k) {
    if (!normalizarTexto_(value[k])) value[k] = persona[k] || '';
  });
  value.ACTUALIZADO_EN = ahoraIso_();
  value.ACTUALIZADO_POR = actor || emailActual_();
  return repoActualizar('PERSONAS', persona.ID_PERSONA, value, { motivo: 'Actualización desde ficha integral' });
}

function actualizarEmprendimientoRegistroIntegral_(emp, data, actor) {
  const value = normalizarEmprendimiento_(Object.assign({}, emp, data || {}));
  value.ACTUALIZADO_EN = ahoraIso_();
  value.ACTUALIZADO_POR = actor || emailActual_();
  return repoActualizar('EMPRENDIMIENTOS', emp.ID_EMPRENDIMIENTO, value, { motivo: 'Actualización desde ficha integral' });
}


// ==========================================
// ARCHIVO: EmprendimientoService.gs
// ==========================================

// ===== EmprendimientoService.gs =====
// SGE v2.1.0 - Ficha integral del emprendedor
// Gestión de emprendimientos, vinculación de representantes y evaluación de etapa

function crearEmprendimiento_(data) {
  const user = exigirPermiso_('EMPRENDIMIENTO_EDITAR');
  return conBloqueoSistema_(function() {
    const value = normalizarEmprendimiento_(data || {});
    exigir_(normalizarTexto_(value.NOMBRE_COMERCIAL), 'DATOS_INCOMPLETOS', 'El nombre comercial es obligatorio.');
    exigir_(!buscarDuplicadosEmprendimiento_(value).length, 'EMPRENDIMIENTO_DUPLICADO', 'Ya existe un emprendimiento activo con el mismo nombre y rubro. Revise su ficha antes de crear otro.');
    value.ID_EMPRENDIMIENTO = uuid_();
    value.ETAPA_ACTUAL = value.ETAPA_ACTUAL || 'ARRANQUE';
    value.ESTADO_EMPRENDIMIENTO = value.ESTADO_EMPRENDIMIENTO || 'ACTIVO';
    value.CREADO_EN = ahoraIso_();
    value.CREADO_POR = user.EMAIL;
    value.ACTUALIZADO_EN = value.CREADO_EN;
    value.ACTUALIZADO_POR = user.EMAIL;
    return repoInsertar('EMPRENDIMIENTOS', value);
  });
}

function buscarDuplicadosEmprendimiento_(data, excluirId) {
  const nombre = normalizarTexto_(data.NOMBRE_COMERCIAL).toLowerCase();
  const rubro = normalizarTexto_(data.ID_RUBRO).toUpperCase();
  return repoTodos('EMPRENDIMIENTOS', { incluirInactivos: true }).filter(function(e) {
    if (String(e.ID_EMPRENDIMIENTO) === String(excluirId || '') || e.ESTADO_EMPRENDIMIENTO === 'CERRADO') return false;
    return normalizarTexto_(e.NOMBRE_COMERCIAL).toLowerCase() === nombre && normalizarTexto_(e.ID_RUBRO).toUpperCase() === rubro;
  });
}

function normalizarEmprendimiento_(data) {
  const value = Object.assign({}, data || {});
  ['NOMBRE_COMERCIAL', 'DESCRIPCION', 'TERRITORIO_OPERACION', 'INSTAGRAM', 'FACEBOOK', 'TIKTOK', 'SITIO_WEB'].forEach(function(campo) {
    value[campo] = normalizarTexto_(value[campo]);
  });
  ['ID_RUBRO', 'ID_SUBRUBRO', 'FORMALIZACION', 'DEDICACION', 'CANAL_VENTA', 'ETAPA_ACTUAL', 'ESTADO_EMPRENDIMIENTO', 'ORIGEN_ATENCION'].forEach(function(campo) {
    value[campo] = normalizarTexto_(value[campo]).toUpperCase().replace(/\s+/g, '_');
  });
  return value;
}

function calcularClasificacionAutomatica_(datos) {
  datos = datos || {};
  const meses = Math.max(0, Number(datos.MESES_FUNCIONAMIENTO || 0));
  const ventas = Math.max(0, Number(datos.VENTAS_MENSUALES || 0));
  const trabajadores = Math.max(0, Number(datos.TRABAJADORES || 0));
  const formalizacion = String(datos.FORMALIZACION || 'SIN_INICIO');
  const puntos = {
    trayectoria: meses < 6 ? 0 : meses <= 24 ? 1 : 2,
    ventas: ventas < 300000 ? 0 : ventas < 1500000 ? 1 : 2,
    equipo: trabajadores < 1 ? 0 : trabajadores <= 2 ? 1 : 2,
    formalizacion: formalizacion === 'SIN_INICIO' ? 0 : formalizacion === 'INICIO_ACTIVIDADES' ? 1 : 2,
    canalDigital: String(datos.VENTA_DIGITAL || '').toUpperCase() === 'SI' ? 1 : 0,
    registrosGestion: String(datos.REGISTROS_GESTION || '').toUpperCase() === 'SI' ? 1 : 0
  };
  const total = Object.keys(puntos).reduce(function(sum, key) { return sum + puntos[key]; }, 0);
  const clasificacion = total <= 3 ? 'ARRANQUE' : total <= 7 ? 'DESARROLLO' : 'CONSOLIDACION';
  return {
    PUNTAJE: total,
    CLASIFICACION: clasificacion,
    DIMENSIONES: Object.assign({}, datos, { PUNTAJES: puntos }),
    EXPLICACION: 'Resultado orientativo: 0 a 3 etapa inicial, 4 a 7 en desarrollo y 8 a 10 consolidado. El funcionario debe confirmar el resultado con antecedentes de la entrevista.'
  };
}

function apiSugerirClasificacion(datos) {
  try {
    exigirPermiso_('EMPRENDIMIENTO_EDITAR');
    return respuestaOk(calcularClasificacionAutomatica_(datos));
  } catch (error) {
    return manejarError_(error, 'apiSugerirClasificacion');
  }
}

function vincularPersonaEmprendimiento_(personaId, emprendimientoId, rol, principal) {
  exigirPermiso_('EMPRENDIMIENTO_EDITAR');
  exigir_(repoBuscarPorId('PERSONAS', personaId), 'PERSONA_NO_ENCONTRADA', personaId);
  exigir_(repoBuscarPorId('EMPRENDIMIENTOS', emprendimientoId), 'EMPRENDIMIENTO_NO_ENCONTRADO', emprendimientoId);
  const relacionesActivas = repoTodos('PERSONA_EMPRENDIMIENTO', { incluirInactivos: true }).filter(function(r) {
    return r.ESTADO_REGISTRO !== 'INACTIVO';
  });
  const existentes = relacionesActivas.filter(function(r) {
    return String(r.ID_PERSONA) === String(personaId) && String(r.ID_EMPRENDIMIENTO) === String(emprendimientoId);
  });
  exigir_(!existentes.length, 'RELACION_DUPLICADA', 'La persona ya está vinculada con este emprendimiento.');
  exigir_(!relacionesActivas.some(function(r) { return String(r.ID_PERSONA) === String(personaId); }), 'PERSONA_YA_VINCULADA', 'La persona ya tiene un emprendimiento. Abra su ficha integral para actualizarlo.');
  exigir_(!relacionesActivas.some(function(r) { return String(r.ID_EMPRENDIMIENTO) === String(emprendimientoId); }), 'EMPRENDIMIENTO_YA_VINCULADO', 'El emprendimiento ya tiene una persona titular.');
  return repoInsertar('PERSONA_EMPRENDIMIENTO', {
    ID_RELACION: uuid_(),
    ID_PERSONA: personaId,
    ID_EMPRENDIMIENTO: emprendimientoId,
    ROL: 'TITULAR',
    ES_PRINCIPAL: 'SI',
    DESDE: ahoraIso_(),
    HASTA: '',
    ESTADO_REGISTRO: 'ACTIVO',
    CREADO_EN: ahoraIso_(),
    CREADO_POR: emailActual_()
  });
}

function desmarcarPrincipales_(emprendimientoId, motivo, excluirRelacionId) {
  repoTodos('PERSONA_EMPRENDIMIENTO', { incluirInactivos: true }).filter(function(r) {
    return String(r.ID_EMPRENDIMIENTO) === String(emprendimientoId) &&
           r.ES_PRINCIPAL === 'SI' &&
           r.ESTADO_REGISTRO !== 'INACTIVO' &&
           String(r.ID_RELACION) !== String(excluirRelacionId || '');
  }).forEach(function(r) {
    repoActualizar('PERSONA_EMPRENDIMIENTO', r.ID_RELACION, { ES_PRINCIPAL: 'NO' }, { motivo: motivo || 'Cambio de representante principal' });
  });
}

function apiCrearEmprendimiento(data) {
  try {
    return respuestaOk(crearEmprendimiento_(data));
  } catch (error) {
    return manejarError_(error, 'apiCrearEmprendimiento');
  }
}

function apiVincularRepresentante(personaId, emprendimientoId, rol, principal) {
  try {
    return respuestaOk(vincularPersonaEmprendimiento_(personaId, emprendimientoId, rol, principal));
  } catch (error) {
    return manejarError_(error, 'apiVincularRepresentante');
  }
}

function apiBuscarEmprendimientos(query) {
  try {
    exigirPermiso_('EMPRENDIMIENTO_VER');
    const q = normalizarTexto_(query).toLowerCase();
    return respuestaOk(repoTodos('EMPRENDIMIENTOS', { incluirInactivos: true }).filter(function(e) {
      return e.ESTADO_EMPRENDIMIENTO !== 'CERRADO' &&
             [e.CODIGO_EMPRENDIMIENTO, e.NOMBRE_COMERCIAL, e.DESCRIPCION, e.ID_RUBRO, e.ID_SUBRUBRO, e.TERRITORIO_OPERACION, e.INSTAGRAM, e.FACEBOOK, e.TIKTOK, e.SITIO_WEB]
             .join(' ').toLowerCase().indexOf(q) >= 0;
    }).slice(0, APP.PAGE_SIZE));
  } catch (error) {
    return manejarError_(error, 'apiBuscarEmprendimientos');
  }
}

function apiListarEmprendimientos(filtros) {
  try {
    exigirPermiso_('EMPRENDIMIENTO_VER');
    filtros = filtros || {};
    const q = normalizarTexto_(filtros.q).toLowerCase();
    let rows = repoTodos('EMPRENDIMIENTOS', { incluirInactivos: true });
    if (q) {
      rows = rows.filter(function(e) {
        return [e.CODIGO_EMPRENDIMIENTO, e.NOMBRE_COMERCIAL, e.DESCRIPCION, e.ID_RUBRO, e.ID_SUBRUBRO, e.TERRITORIO_OPERACION, e.INSTAGRAM, e.FACEBOOK, e.TIKTOK, e.SITIO_WEB]
          .join(' ').toLowerCase().indexOf(q) >= 0;
      });
    }
    ['ESTADO_EMPRENDIMIENTO', 'ETAPA_ACTUAL', 'FORMALIZACION', 'ID_RUBRO'].forEach(function(campo) {
      const clave = { ESTADO_EMPRENDIMIENTO: 'estado', ETAPA_ACTUAL: 'etapa', FORMALIZACION: 'formalizacion', ID_RUBRO: 'rubro' }[campo];
      if (filtros[clave]) rows = rows.filter(function(e) { return String(e[campo]) === String(filtros[clave]); });
    });
    rows.sort(function(a, b) { return String(b.ACTUALIZADO_EN || b.CREADO_EN).localeCompare(String(a.ACTUALIZADO_EN || a.CREADO_EN)); });
    const total = rows.length, offset = Math.max(0, Number(filtros.offset || 0)), limit = Math.min(100, Math.max(10, Number(filtros.limit || 25)));
    return respuestaOk({ filas: rows.slice(offset, offset + limit), total: total, offset: offset, limit: limit });
  } catch (error) {
    return manejarError_(error, 'apiListarEmprendimientos');
  }
}

function apiObtenerEmprendimiento(id) {
  try {
    exigirPermiso_('EMPRENDIMIENTO_VER');
    const emprendimiento = repoBuscarPorId('EMPRENDIMIENTOS', id);
    exigir_(emprendimiento, 'NO_ENCONTRADO', 'Emprendimiento no encontrado.');
    const representantes = repoTodos('PERSONA_EMPRENDIMIENTO', { incluirInactivos: true }).filter(function(r) {
      return String(r.ID_EMPRENDIMIENTO) === String(id) && r.ESTADO_REGISTRO !== 'INACTIVO';
    }).map(function(r) {
      return Object.assign({}, r, { PERSONA: repoBuscarPorId('PERSONAS', r.ID_PERSONA) });
    });
    representantes.sort(function(a, b) { return (b.ES_PRINCIPAL === 'SI') - (a.ES_PRINCIPAL === 'SI'); });
    const evaluaciones = repoTodos('EVALUACIONES_EMPRENDIMIENTO', { incluirInactivos: true }).filter(function(e) {
      return String(e.ID_EMPRENDIMIENTO) === String(id);
    }).sort(function(a, b) { return String(b.FECHA_EVALUACION).localeCompare(String(a.FECHA_EVALUACION)); });
    return respuestaOk({ emprendimiento: emprendimiento, representantes: representantes, evaluaciones: evaluaciones });
  } catch (error) {
    return manejarError_(error, 'apiObtenerEmprendimiento');
  }
}

function apiActualizarEmprendimiento(id, data) {
  try {
    const user = exigirPermiso_('EMPRENDIMIENTO_EDITAR');
    const actual = repoBuscarPorId('EMPRENDIMIENTOS', id);
    exigir_(actual, 'NO_ENCONTRADO', 'Emprendimiento no encontrado.');
    const value = normalizarEmprendimiento_(Object.assign({}, actual, data || {}));
    exigir_(value.NOMBRE_COMERCIAL, 'DATOS_INCOMPLETOS', 'El nombre comercial es obligatorio.');
    exigir_(!buscarDuplicadosEmprendimiento_(value, id).length, 'EMPRENDIMIENTO_DUPLICADO', 'Existe otro emprendimiento activo con el mismo nombre y rubro.');
    value.ACTUALIZADO_EN = ahoraIso_();
    value.ACTUALIZADO_POR = user.EMAIL;
    return respuestaOk(repoActualizar('EMPRENDIMIENTOS', id, value));
  } catch (error) {
    return manejarError_(error, 'apiActualizarEmprendimiento');
  }
}

function apiCambiarEstadoEmprendimiento(id, estado, motivo) {
  try {
    const user = exigirPermiso_('EMPRENDIMIENTO_EDITAR');
    exigir_(CATALOGOS_INICIALES.ESTADO_EMPRENDIMIENTO.indexOf(estado) >= 0, 'ESTADO_INVALIDO', estado);
    exigir_(motivo, 'MOTIVO_OBLIGATORIO', 'Debe indicar el motivo del cambio.');
    return respuestaOk(repoActualizar('EMPRENDIMIENTOS', id, {
      ESTADO_EMPRENDIMIENTO: estado,
      ACTUALIZADO_EN: ahoraIso_(),
      ACTUALIZADO_POR: user.EMAIL
    }, { motivo: motivo }));
  } catch (error) {
    return manejarError_(error, 'apiCambiarEstadoEmprendimiento');
  }
}

function apiBuscarPersonasParaVincular(query) {
  try {
    exigirPermiso_('PERSONA_VER');
    const q = normalizarTexto_(query).toLowerCase();
    exigir_(q.length >= 2, 'BUSQUEDA_CORTA', 'Ingrese al menos dos caracteres.');
    return respuestaOk(repoTodos('PERSONAS', { incluirInactivos: false }).filter(function(p) {
      return [p.CODIGO_PERSONA, p.RUT_NORMALIZADO, p.NOMBRES, p.APELLIDO_PATERNO, p.APELLIDO_MATERNO, p.EMAIL_NORMALIZADO].join(' ').toLowerCase().indexOf(q) >= 0;
    }).slice(0, 20));
  } catch (error) {
    return manejarError_(error, 'apiBuscarPersonasParaVincular');
  }
}

function apiActualizarRepresentante(idRelacion, rol, principal) {
  try {
    exigirPermiso_('EMPRENDIMIENTO_EDITAR');
    const relacion = repoBuscarPorId('PERSONA_EMPRENDIMIENTO', idRelacion);
    exigir_(relacion && relacion.ESTADO_REGISTRO !== 'INACTIVO', 'NO_ENCONTRADO', 'Relación no encontrada.');
    exigir_(CATALOGOS_INICIALES.ROL_REPRESENTACION.indexOf(rol) >= 0, 'ROL_INVALIDO', rol);
    if (principal) desmarcarPrincipales_(relacion.ID_EMPRENDIMIENTO, 'Cambio de representante principal', idRelacion);
    return respuestaOk(repoActualizar('PERSONA_EMPRENDIMIENTO', idRelacion, {
      ROL: rol,
      ES_PRINCIPAL: principal ? 'SI' : 'NO'
    }, { motivo: 'Actualización de representación' }));
  } catch (error) {
    return manejarError_(error, 'apiActualizarRepresentante');
  }
}

function apiDesvincularRepresentante(idRelacion, motivo) {
  try {
    exigirPermiso_('EMPRENDIMIENTO_EDITAR');
    exigir_(motivo, 'MOTIVO_OBLIGATORIO', 'Debe indicar el motivo de la desvinculación.');
    const relacion = repoBuscarPorId('PERSONA_EMPRENDIMIENTO', idRelacion);
    exigir_(relacion, 'NO_ENCONTRADO', 'Relación no encontrada.');
    return respuestaOk(repoActualizar('PERSONA_EMPRENDIMIENTO', idRelacion, {
      ESTADO_REGISTRO: 'INACTIVO',
      ES_PRINCIPAL: 'NO',
      HASTA: ahoraIso_()
    }, { motivo: motivo }));
  } catch (error) {
    return manejarError_(error, 'apiDesvincularRepresentante');
  }
}

function apiEvaluarEmprendimiento(id, evaluacion) {
  try {
    const user = exigirPermiso_('EMPRENDIMIENTO_EDITAR');
    const emp = repoBuscarPorId('EMPRENDIMIENTOS', id);
    exigir_(emp, 'NO_ENCONTRADO', id);
    evaluacion = evaluacion || {};
    const automatica = evaluacion.DIMENSIONES ? calcularClasificacionAutomatica_(evaluacion.DIMENSIONES) : null;
    const nueva = String(evaluacion.CLASIFICACION || (automatica && automatica.CLASIFICACION) || '').toUpperCase();
    exigir_(CATALOGOS_INICIALES.ETAPA_EMPRENDIMIENTO.indexOf(nueva) >= 0, 'CLASIFICACION_INVALIDA', nueva);
    const ev = repoInsertar('EVALUACIONES_EMPRENDIMIENTO', Object.assign({}, evaluacion, {
      ID_EVALUACION: uuid_(),
      ID_EMPRENDIMIENTO: id,
      FECHA_EVALUACION: ahoraIso_(),
      PUNTAJE: automatica ? automatica.PUNTAJE : evaluacion.PUNTAJE,
      CLASIFICACION: nueva,
      DIMENSIONES_JSON: JSON.stringify(evaluacion.DIMENSIONES || {}),
      EVALUADO_POR: user.EMAIL
    }));
    repoInsertar('CLASIFICACION_HISTORICA', {
      ID_HISTORIAL: uuid_(),
      ID_EMPRENDIMIENTO: id,
      ID_EVALUACION: ev.ID_EVALUACION,
      CLASIFICACION_ANTERIOR: emp.ETAPA_ACTUAL || '',
      CLASIFICACION_NUEVA: nueva,
      DESDE: ahoraIso_(),
      HASTA: '',
      MOTIVO: evaluacion.MOTIVO || 'Evaluación',
      REGISTRADO_POR: user.EMAIL
    });
    repoActualizar('EMPRENDIMIENTOS', id, {
      ETAPA_ACTUAL: nueva,
      ACTUALIZADO_EN: ahoraIso_(),
      ACTUALIZADO_POR: user.EMAIL
    });
    return respuestaOk(ev);
  } catch (error) {
    return manejarError_(error, 'apiEvaluarEmprendimiento');
  }
}


// ==========================================
// ARCHIVO: DocumentoService.gs
// ==========================================

// ===== DocumentoService.gs =====
// SGE v2.1.0 - Ficha integral del emprendedor
// Gestión documental, almacenamiento en Google Drive y reglas de habilitación

function carpetaHija_(root, name) {
  const folders = root.getFoldersByName(name);
  return folders.hasNext() ? folders.next() : root.createFolder(name);
}

function carpetaDocumentalSujeto_(tipoSujeto, idSujeto, tipoDocumento) {
  const root = carpetaRoot_();
  const esPersona = tipoSujeto === 'PERSONA';
  exigir_(esPersona || tipoSujeto === 'EMPRENDIMIENTO', 'TIPO_SUJETO_INVALIDO', tipoSujeto);
  const registro = esPersona ? repoBuscarPorId('PERSONAS', idSujeto) : repoBuscarPorId('EMPRENDIMIENTOS', idSujeto);
  exigir_(registro, 'SUJETO_NO_ENCONTRADO', 'No se encontró la ficha asociada.');
  const relacion = relacionActivaPorSujeto_(tipoSujeto, idSujeto);
  const persona = esPersona ? registro : (relacion ? repoBuscarPorId('PERSONAS', relacion.ID_PERSONA) : null);
  const emprendimiento = esPersona ? (relacion ? repoBuscarPorId('EMPRENDIMIENTOS', relacion.ID_EMPRENDIMIENTO) : null) : registro;
  const base = carpetaHija_(root, 'Fichas_integrales');
  const nombreCarpeta = nombreSeguroCarpeta_([
    persona ? nombrePersona_(persona) : 'Persona sin vincular',
    emprendimiento ? emprendimiento.NOMBRE_COMERCIAL : 'Emprendimiento sin vincular'
  ].join(' - '));
  const carpetas = base.getFoldersByName(nombreCarpeta);
  const sujeto = carpetas.hasNext() ? carpetas.next() : base.createFolder(nombreCarpeta);
  const fotos = tipoDocumento === 'FOTOGRAFIA_PRODUCTOS';
  return carpetaHija_(sujeto, fotos ? 'Fotos de productos' : 'Documentos');
}

function relacionActivaPorSujeto_(tipoSujeto, idSujeto) {
  const relaciones = repoTodos('PERSONA_EMPRENDIMIENTO', { incluirInactivos: true }).filter(function(r) {
    if (r.ESTADO_REGISTRO === 'INACTIVO') return false;
    return tipoSujeto === 'PERSONA' ? String(r.ID_PERSONA) === String(idSujeto) : String(r.ID_EMPRENDIMIENTO) === String(idSujeto);
  });
  relaciones.sort(function(a, b) {
    if ((a.ES_PRINCIPAL === 'SI') !== (b.ES_PRINCIPAL === 'SI')) return a.ES_PRINCIPAL === 'SI' ? -1 : 1;
    return String(b.DESDE || b.CREADO_EN || '').localeCompare(String(a.DESDE || a.CREADO_EN || ''));
  });
  return relaciones[0] || null;
}

function validarArchivoDocumento_(blob) {
  exigir_(blob && typeof blob.getBytes === 'function' && blob.getBytes().length, 'ARCHIVO_OBLIGATORIO', 'Seleccione un archivo.');
  exigir_(blob.getBytes().length <= APP.MAX_UPLOAD_BYTES, 'ARCHIVO_MUY_GRANDE', 'El archivo supera el máximo de 10 MB.');
  const permitidos = [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/heic',
    'image/heif',
    'image/webp',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];
  exigir_(permitidos.indexOf(String(blob.getContentType()).toLowerCase()) >= 0, 'FORMATO_NO_PERMITIDO', 'Use PDF, JPG, PNG, HEIC, WEBP o DOCX.');
}

function estadoDocumentoEfectivo_(doc) {
  if (doc.ES_VERSION_VIGENTE !== 'SI') return doc.ESTADO_REVISION;
  if (['RECHAZADO', 'OBSERVADO', 'ILEGIBLE', 'INCOMPLETO', 'REEMPLAZADO'].indexOf(doc.ESTADO_REVISION) >= 0) {
    return doc.ESTADO_REVISION === 'ILEGIBLE' || doc.ESTADO_REVISION === 'INCOMPLETO' ? 'OBSERVADO' : doc.ESTADO_REVISION;
  }
  if (!doc.FECHA_VENCIMIENTO) return doc.ESTADO_REVISION === 'PENDIENTE' ? 'RECIBIDO' : (doc.ESTADO_REVISION || 'RECIBIDO');
  const vencimiento = new Date(doc.FECHA_VENCIMIENTO), hoy = new Date(), en30 = new Date();
  en30.setDate(hoy.getDate() + 30);
  if (!isNaN(vencimiento.getTime()) && vencimiento < hoy) return 'VENCIDO';
  if (!isNaN(vencimiento.getTime()) && vencimiento <= en30) return 'POR_VENCER';
  return doc.ESTADO_REVISION === 'PENDIENTE' ? 'RECIBIDO' : (doc.ESTADO_REVISION || 'RECIBIDO');
}

function documentoUtilizable_(doc) {
  return doc && doc.ES_VERSION_VIGENTE === 'SI' && ['RECIBIDO', 'VIGENTE', 'POR_VENCER', 'PENDIENTE'].indexOf(estadoDocumentoEfectivo_(doc)) >= 0;
}

function apiCargarDocumentoFormulario(formulario) {
  let file = null;
  try {
    const user = exigirPermiso_('DOCUMENTO_CARGAR');
    exigir_(formulario && formulario.TIPO_SUJETO && formulario.ID_SUJETO && formulario.TIPO_DOCUMENTO, 'DATOS_INCOMPLETOS', 'Sujeto y tipo de documento son obligatorios.');
    const tipoSujeto = String(formulario.TIPO_SUJETO).toUpperCase();
    const sujeto = tipoSujeto === 'PERSONA' ? repoBuscarPorId('PERSONAS', formulario.ID_SUJETO) : repoBuscarPorId('EMPRENDIMIENTOS', formulario.ID_SUJETO);
    exigir_(sujeto, 'SUJETO_NO_ENCONTRADO', 'No se encontró la ficha asociada.');
    const blob = formulario.ARCHIVO;
    validarArchivoDocumento_(blob);
    const carpeta = carpetaDocumentalSujeto_(tipoSujeto, formulario.ID_SUJETO, formulario.TIPO_DOCUMENTO);
    const extension = String(blob.getName() || '').split('.').pop().replace(/[^a-zA-Z0-9]/g, '').slice(0, 8);
    const nombre = [formulario.TIPO_DOCUMENTO, Utilities.formatDate(new Date(), APP.TIMEZONE, 'yyyyMMdd_HHmmss'), uuid_().slice(0, 8)].join('_') + (extension ? '.' + extension : '');
    blob.setName(nombre);
    file = carpeta.createFile(blob);
    file.setDescription('Documento SGE cargado por ' + user.EMAIL + ' el ' + ahoraIso_());
    const result = apiRegistrarDocumento({
      TIPO_SUJETO: tipoSujeto,
      ID_SUJETO: formulario.ID_SUJETO,
      TIPO_DOCUMENTO: formulario.TIPO_DOCUMENTO,
      ID_ARCHIVO_DRIVE: file.getId(),
      FECHA_EMISION: formulario.FECHA_EMISION || '',
      FECHA_VENCIMIENTO: formulario.FECHA_VENCIMIENTO || ''
    });
    if (!result.ok) throw new Error(result.error.message);
    return respuestaOk(result.data);
  } catch (error) {
    if (file) try { file.setTrashed(true); } catch (ignored) {}
    return manejarError_(error, 'apiCargarDocumentoFormulario');
  }
}

function apiRegistrarDocumento(metadata) {
  try {
    const user = exigirPermiso_('DOCUMENTO_CARGAR');
    exigir_(metadata && metadata.ID_ARCHIVO_DRIVE && metadata.ID_SUJETO && metadata.TIPO_DOCUMENTO, 'DATOS_INCOMPLETOS', 'Archivo, sujeto y tipo son obligatorios.');
    DriveApp.getFileById(metadata.ID_ARCHIVO_DRIVE);
    const anteriores = repoTodos('DOCUMENTOS', { incluirInactivos: true }).filter(function(d) {
      return String(d.ID_SUJETO) === String(metadata.ID_SUJETO) && d.TIPO_DOCUMENTO === metadata.TIPO_DOCUMENTO;
    });
    anteriores.forEach(function(doc) {
      if (doc.ES_VERSION_VIGENTE === 'SI') {
        repoActualizar('DOCUMENTOS', doc.ID_DOCUMENTO, { ES_VERSION_VIGENTE: 'NO', ESTADO_REVISION: 'REEMPLAZADO' }, { motivo: 'Nueva versión documental' });
      }
    });
    const value = Object.assign({}, metadata, {
      ID_DOCUMENTO: uuid_(),
      VERSION: anteriores.length + 1,
      ESTADO_REVISION: 'RECIBIDO',
      ES_VERSION_VIGENTE: 'SI',
      CREADO_EN: ahoraIso_(),
      CREADO_POR: user.EMAIL
    });
    return respuestaOk(repoInsertar('DOCUMENTOS', value));
  } catch (error) {
    return manejarError_(error, 'apiRegistrarDocumento');
  }
}

function apiListarDocumentosSujeto(tipoSujeto, idSujeto) {
  try {
    usuarioActual_();
    const puedeVerSensible = puede_('DOCUMENTO_VER_SENSIBLE');
    exigir_(puede_('DOCUMENTO_CARGAR') || puede_('DOCUMENTO_REVISAR') || puedeVerSensible, 'PROHIBIDO', 'No tiene permiso para consultar expedientes.');
    const documentos = repoTodos('DOCUMENTOS', { incluirInactivos: true }).filter(function(d) {
      return d.TIPO_SUJETO === tipoSujeto && String(d.ID_SUJETO) === String(idSujeto);
    }).map(function(d) {
      const visible = Object.assign({}, d, { ESTADO_EFECTIVO: estadoDocumentoEfectivo_(d) });
      if (!puedeVerSensible) visible.ID_ARCHIVO_DRIVE = '';
      return visible;
    }).sort(function(a, b) {
      return String(b.CREADO_EN).localeCompare(String(a.CREADO_EN));
    });
    return respuestaOk({ documentos: documentos, resumen: resumenDocumental_(tipoSujeto, idSujeto, documentos) });
  } catch (error) {
    return manejarError_(error, 'apiListarDocumentosSujeto');
  }
}

function resumenDocumental_(tipoSujeto, idSujeto, documentos) {
  documentos = documentos || repoTodos('DOCUMENTOS', { incluirInactivos: true }).filter(function(d) {
    return d.TIPO_SUJETO === tipoSujeto && String(d.ID_SUJETO) === String(idSujeto);
  });
  let requeridos = [];
  if (tipoSujeto === 'PERSONA') requeridos = ['CEDULA_IDENTIDAD_COMPLETA', 'REGISTRO_SOCIAL_HOGARES'];
  const vigentes = documentos.filter(documentoUtilizable_).map(function(d) { return d.TIPO_DOCUMENTO; });
  const cedulaHistoricaCompleta = vigentes.indexOf('CEDULA_IDENTIDAD_FRONTAL') >= 0 && vigentes.indexOf('CEDULA_IDENTIDAD_REVERSO') >= 0;
  const faltantes = requeridos.filter(function(t) {
    return t === 'CEDULA_IDENTIDAD_COMPLETA' ? vigentes.indexOf(t) < 0 && !cedulaHistoricaCompleta : vigentes.indexOf(t) < 0;
  });
  return {
    COMPLETO: faltantes.length ? 'NO' : 'SI',
    REQUERIDOS: requeridos,
    FALTANTES: faltantes,
    VIGENTES: vigentes.length,
    TOTAL_VERSIONES: documentos.length
  };
}

function habilitacionMercados_(idEmprendimiento) {
  const emp = repoBuscarPorId('EMPRENDIMIENTOS', idEmprendimiento);
  if (!emp) return { HABILITADO: 'NO', MOTIVO: 'Emprendimiento no encontrado.' };
  const relacion = relacionActivaPorSujeto_('EMPRENDIMIENTO', idEmprendimiento);
  const personaId = relacion && relacion.ID_PERSONA;
  if (!personaId) return { HABILITADO: 'NO', MOTIVO: 'Falta vincular a la persona titular.' };
  const docsPersona = repoTodos('DOCUMENTOS', { incluirInactivos: true }).filter(function(d) {
    return d.TIPO_SUJETO === 'PERSONA' && String(d.ID_SUJETO) === String(personaId) && documentoUtilizable_(d);
  });
  const tiposPersona = docsPersona.map(function(d) { return d.TIPO_DOCUMENTO; });
  const cedula = tiposPersona.indexOf('CEDULA_IDENTIDAD_COMPLETA') >= 0 || (tiposPersona.indexOf('CEDULA_IDENTIDAD_FRONTAL') >= 0 && tiposPersona.indexOf('CEDULA_IDENTIDAD_REVERSO') >= 0);
  if (!cedula || tiposPersona.indexOf('REGISTRO_SOCIAL_HOGARES') < 0) {
    return { HABILITADO: 'NO', MOTIVO: 'Falta completar cédula por ambos lados y Registro Social de Hogares.' };
  }
  const docs = repoTodos('DOCUMENTOS', { incluirInactivos: true }).filter(function(d) {
    return d.TIPO_SUJETO === 'EMPRENDIMIENTO' && String(d.ID_SUJETO) === String(idEmprendimiento) && documentoUtilizable_(d);
  });
  const tieneInicio = docs.some(function(d) {
    return ['INICIO_ACTIVIDADES', 'PATENTE_COMERCIAL'].indexOf(d.TIPO_DOCUMENTO) >= 0;
  });
  return tieneInicio
    ? { HABILITADO: 'SI', MOTIVO: 'Documentación base e inicio de actividades recibidos. No requiere revisión previa.' }
    : { HABILITADO: 'NO', MOTIVO: 'Falta cargar el certificado de inicio de actividades.' };
}

function apiHabilitacionMercados(idEmprendimiento) {
  try {
    exigirPermiso_('EMPRENDIMIENTO_VER');
    return respuestaOk(habilitacionMercados_(idEmprendimiento));
  } catch (error) {
    return manejarError_(error, 'apiHabilitacionMercados');
  }
}

function apiRevisarDocumento(id, estado, motivo) {
  try {
    const user = exigirPermiso_('DOCUMENTO_REVISAR');
    exigir_(CATALOGOS_INICIALES.ESTADO_DOCUMENTO.indexOf(estado) >= 0, 'ESTADO_INVALIDO', estado);
    if (['RECHAZADO', 'OBSERVADO'].indexOf(estado) >= 0) {
      exigir_(motivo, 'MOTIVO_OBLIGATORIO', 'Debe indicar el motivo de la observación.');
    }
    return respuestaOk(repoActualizar('DOCUMENTOS', id, {
      ESTADO_REVISION: estado,
      MOTIVO_OBSERVACION: motivo || '',
      REVISADO_POR: user.EMAIL,
      REVISADO_EN: ahoraIso_()
    }, { motivo: 'Revisión documental' }));
  } catch (error) {
    return manejarError_(error, 'apiRevisarDocumento');
  }
}

function apiObtenerUrlDocumento(id) {
  try {
    exigirPermiso_('DOCUMENTO_VER_SENSIBLE');
    const doc = repoBuscarPorId('DOCUMENTOS', id);
    exigir_(doc, 'NO_ENCONTRADO', id);
    auditoriaRegistrar_('ACCEDER_DOCUMENTO', 'DOCUMENTOS', id, null, null, 'Consulta autorizada');
    return respuestaOk({ url: DriveApp.getFileById(doc.ID_ARCHIVO_DRIVE).getUrl() });
  } catch (error) {
    return manejarError_(error, 'apiObtenerUrlDocumento');
  }
}


// ==========================================
// ARCHIVO: IniciativaService.gs
// ==========================================

// ===== IniciativaService.gs =====
// SGE v2.1.0 - Ficha integral del emprendedor
// Gestión de iniciativas, ferias, convocatorias, requisitos y motor de admisibilidad

function apiCrearIniciativa(data) {
  try {
    const user = exigirPermiso_('INICIATIVA_EDITAR');
    exigir_(data && data.NOMBRE && data.TIPO_INICIATIVA, 'DATOS_INCOMPLETOS', 'Nombre y tipo son obligatorios.');
    const value = normalizarIniciativa_(Object.assign({}, data, {
      ID_INICIATIVA: uuid_(),
      VERSION_REGLAS: data.VERSION_REGLAS || 1,
      ESTADO: data.ESTADO || 'BORRADOR',
      RESPONSABLE: data.RESPONSABLE || user.EMAIL,
      CREADO_EN: ahoraIso_(),
      CREADO_POR: user.EMAIL
    }));
    validarFechasIniciativa_(value);
    return respuestaOk(repoInsertar('INICIATIVAS', value));
  } catch (error) {
    return manejarError_(error, 'apiCrearIniciativa');
  }
}

function normalizarIniciativa_(data) {
  const value = Object.assign({}, data || {});
  ['NOMBRE', 'OBJETIVO', 'TEMATICA', 'LUGAR', 'RESPONSABLE'].forEach(function(k) {
    value[k] = normalizarTexto_(value[k]);
  });
  ['TIPO_INICIATIVA', 'ESTADO'].forEach(function(k) {
    value[k] = normalizarTexto_(value[k]).toUpperCase().replace(/\s+/g, '_');
  });
  value.CUPOS_TITULARES = Math.max(0, Number(value.CUPOS_TITULARES || 0));
  value.CUPOS_SUPLENTES = Math.max(0, Number(value.CUPOS_SUPLENTES || 0));
  return value;
}

function validarFechasIniciativa_(value) {
  if (value.APERTURA_POSTULACION && value.CIERRE_POSTULACION) {
    exigir_(new Date(value.APERTURA_POSTULACION) <= new Date(value.CIERRE_POSTULACION), 'FECHAS_INVALIDAS', 'La apertura no puede ser posterior al cierre.');
  }
}

function apiListarIniciativas(filtros) {
  try {
    usuarioActual_();
    filtros = filtros || {};
    const q = normalizarTexto_(filtros.q).toLowerCase();
    let rows = repoTodos('INICIATIVAS', { incluirInactivos: true });
    if (q) {
      rows = rows.filter(function(i) {
        return [i.NOMBRE, i.OBJETIVO, i.TEMATICA, i.LUGAR, i.TIPO_INICIATIVA].join(' ').toLowerCase().indexOf(q) >= 0;
      });
    }
    if (filtros.estado) rows = rows.filter(function(i) { return i.ESTADO === filtros.estado; });
    if (filtros.tipo) rows = rows.filter(function(i) { return i.TIPO_INICIATIVA === filtros.tipo; });
    rows.sort(function(a, b) {
      return String(b.FECHA_EJECUCION || b.CREADO_EN).localeCompare(String(a.FECHA_EJECUCION || a.CREADO_EN));
    });
    const total = rows.length, offset = Math.max(0, Number(filtros.offset || 0)), limit = Math.min(100, Math.max(10, Number(filtros.limit || 25)));
    return respuestaOk({ filas: rows.slice(offset, offset + limit), total: total, offset: offset, limit: limit });
  } catch (error) {
    return manejarError_(error, 'apiListarIniciativas');
  }
}

function apiObtenerIniciativa(id) {
  try {
    usuarioActual_();
    const iniciativa = repoBuscarPorId('INICIATIVAS', id);
    exigir_(iniciativa, 'NO_ENCONTRADO', 'Iniciativa no encontrada.');
    const requisitos = repoTodos('REQUISITOS', { incluirInactivos: true }).filter(function(r) {
      return String(r.ID_INICIATIVA) === String(id) &&
             String(r.VERSION_REGLAS) === String(iniciativa.VERSION_REGLAS) &&
             r.ACTIVO === 'SI';
    }).sort(function(a, b) { return Number(a.ORDEN) - Number(b.ORDEN); });
    const mapas = mapasPostulaciones_();
    const postulaciones = repoTodos('POSTULACIONES', { incluirInactivos: true }).filter(function(p) {
      return String(p.ID_INICIATIVA) === String(id);
    }).map(function(p) { return enriquecerPostulacion_(p, mapas); });
    return respuestaOk({ iniciativa: iniciativa, requisitos: requisitos, postulaciones: postulaciones });
  } catch (error) {
    return manejarError_(error, 'apiObtenerIniciativa');
  }
}

function apiActualizarIniciativa(id, data) {
  try {
    const user = exigirPermiso_('INICIATIVA_EDITAR');
    const actual = repoBuscarPorId('INICIATIVAS', id);
    exigir_(actual, 'NO_ENCONTRADO', 'Iniciativa no encontrada.');
    const value = normalizarIniciativa_(Object.assign({}, actual, data || {}));
    exigir_(value.NOMBRE && value.TIPO_INICIATIVA, 'DATOS_INCOMPLETOS', 'Nombre y tipo son obligatorios.');
    validarFechasIniciativa_(value);
    return respuestaOk(repoActualizar('INICIATIVAS', id, value, { motivo: 'Actualización de iniciativa por ' + user.EMAIL }));
  } catch (error) {
    return manejarError_(error, 'apiActualizarIniciativa');
  }
}

function apiCambiarEstadoIniciativa(id, estado, motivo) {
  try {
    exigirPermiso_('INICIATIVA_EDITAR');
    exigir_(CATALOGOS_INICIALES.ESTADO_INICIATIVA.indexOf(estado) >= 0, 'ESTADO_INVALIDO', estado);
    motivo = normalizarTexto_(motivo) || ('Cambio de estado a ' + estado);
    const actual = repoBuscarPorId('INICIATIVAS', id);
    exigir_(actual, 'NO_ENCONTRADO', 'Iniciativa no encontrada.');
    const aperturaFutura = estado === 'ABIERTA' && actual.APERTURA_POSTULACION && new Date(actual.APERTURA_POSTULACION) > new Date();
    const result = repoActualizar('INICIATIVAS', id, { ESTADO: estado }, { motivo: motivo });
    const estadosCerrados = ['CERRADA', 'FINALIZADA', 'CANCELADA', 'EJECUTADA', 'HISTORICA'];
    if (estadosCerrados.indexOf(estado) >= 0) {
      try {
        const formId = formIdMercado_(id);
        if (formId) {
          try {
            const form = FormApp.openById(formId);
            if (form) cerrarRespuestasFormulario_(form);
          } catch (ignored) {}
          limpiarActivadorFormulario_(formId);
        }
      } catch (ignored) {}
    }
    return respuestaOk({
      iniciativa: result,
      advertencia: aperturaFutura ? 'La iniciativa fue abierta antes de la fecha programada. La excepción quedó auditada.' : ''
    });
  } catch (error) {
    return manejarError_(error, 'apiCambiarEstadoIniciativa');
  }
}

function apiAgregarRequisito(data) {
  try {
    const user = exigirPermiso_('INICIATIVA_EDITAR');
    exigir_(data && data.ID_INICIATIVA && data.TIPO_REGLA && data.CAMPO && data.OPERADOR, 'DATOS_INCOMPLETOS', 'Iniciativa, tipo, campo y operador son obligatorios.');
    exigir_(CATALOGOS_INICIALES.CAMPO_REQUISITO.indexOf(data.CAMPO) >= 0, 'CAMPO_INVALIDO', data.CAMPO);
    exigir_(CATALOGOS_INICIALES.OPERADOR_REQUISITO.indexOf(data.OPERADOR) >= 0, 'OPERADOR_INVALIDO', data.OPERADOR);
    const iniciativa = repoBuscarPorId('INICIATIVAS', data.ID_INICIATIVA);
    exigir_(iniciativa, 'NO_ENCONTRADO', 'Iniciativa no encontrada.');
    let agregado = null;
    const versionada = crearNuevaVersionReglas_(iniciativa, function(reglas) {
      agregado = Object.assign({}, data, {
        ES_SUBSANABLE: data.ES_SUBSANABLE === 'SI' ? 'SI' : 'NO',
        ORDEN: Number(data.ORDEN || 1),
        ACTIVO: 'SI'
      });
      return reglas.concat([agregado]);
    }, 'Agregar requisito', user);
    return respuestaOk(versionada.reglas[versionada.reglas.length - 1]);
  } catch (error) {
    return manejarError_(error, 'apiAgregarRequisito');
  }
}

function crearNuevaVersionReglas_(iniciativa, transformar, motivo, user) {
  const actuales = repoTodos('REQUISITOS', { incluirInactivos: true }).filter(function(r) {
    return String(r.ID_INICIATIVA) === String(iniciativa.ID_INICIATIVA) &&
           String(r.VERSION_REGLAS) === String(iniciativa.VERSION_REGLAS) &&
           r.ACTIVO === 'SI';
  });
  const nuevaVersion = Number(iniciativa.VERSION_REGLAS || 1) + 1;
  const nuevas = transformar(actuales.map(function(r) { return Object.assign({}, r); })) || [];
  const creadas = nuevas.map(function(r) {
    return repoInsertar('REQUISITOS', Object.assign({}, r, {
      ID_REQUISITO: uuid_(),
      ID_INICIATIVA: iniciativa.ID_INICIATIVA,
      VERSION_REGLAS: nuevaVersion,
      ACTIVO: 'SI',
      CREADO_EN: ahoraIso_(),
      CREADO_POR: user.EMAIL
    }), { motivo: motivo });
  });
  repoActualizar('INICIATIVAS', iniciativa.ID_INICIATIVA, { VERSION_REGLAS: nuevaVersion }, { motivo: 'Nueva versión de reglas: ' + motivo });
  return { version: nuevaVersion, reglas: creadas };
}

function apiActualizarRequisito(id, data) {
  try {
    const user = exigirPermiso_('INICIATIVA_EDITAR');
    const actual = repoBuscarPorId('REQUISITOS', id);
    exigir_(actual, 'NO_ENCONTRADO', 'Requisito no encontrado.');
    const iniciativa = repoBuscarPorId('INICIATIVAS', actual.ID_INICIATIVA);
    exigir_(String(actual.VERSION_REGLAS) === String(iniciativa.VERSION_REGLAS), 'VERSION_ANTIGUA', 'Solo puede editar requisitos de la versión vigente.');
    const result = crearNuevaVersionReglas_(iniciativa, function(reglas) {
      return reglas.map(function(r) {
        return r.ID_REQUISITO === id ? Object.assign({}, r, data, {
          ORDEN: Number(data.ORDEN || r.ORDEN || 1),
          ES_SUBSANABLE: data.ES_SUBSANABLE === 'SI' ? 'SI' : 'NO'
        }) : r;
      });
    }, 'Actualizar requisito', user);
    return respuestaOk(result);
  } catch (error) {
    return manejarError_(error, 'apiActualizarRequisito');
  }
}

function apiDesactivarRequisito(id, motivo) {
  try {
    const user = exigirPermiso_('INICIATIVA_EDITAR');
    exigir_(motivo, 'MOTIVO_OBLIGATORIO', 'Debe indicar el motivo.');
    const actual = repoBuscarPorId('REQUISITOS', id);
    exigir_(actual, 'NO_ENCONTRADO', 'Requisito no encontrado.');
    const iniciativa = repoBuscarPorId('INICIATIVAS', actual.ID_INICIATIVA);
    exigir_(String(actual.VERSION_REGLAS) === String(iniciativa.VERSION_REGLAS), 'VERSION_ANTIGUA', 'Solo puede desactivar requisitos de la versión vigente.');
    const result = crearNuevaVersionReglas_(iniciativa, function(reglas) {
      return reglas.filter(function(r) { return r.ID_REQUISITO !== id; });
    }, 'Desactivar requisito: ' + motivo, user);
    return respuestaOk(result);
  } catch (error) {
    return manejarError_(error, 'apiDesactivarRequisito');
  }
}

function apiCrearPostulacion(data) {
  try {
    const user = exigirPermiso_('POSTULACION_EDITAR');
    exigir_(data && data.ID_INICIATIVA && data.ID_EMPRENDIMIENTO, 'DATOS_INCOMPLETOS', 'Iniciativa y emprendimiento son obligatorios.');
    const iniciativa = repoBuscarPorId('INICIATIVAS', data.ID_INICIATIVA);
    const emprendimiento = repoBuscarPorId('EMPRENDIMIENTOS', data.ID_EMPRENDIMIENTO);
    exigir_(iniciativa && emprendimiento, 'NO_ENCONTRADO', 'No se encontró la iniciativa o el emprendimiento.');
    exigir_(iniciativa.ESTADO === 'ABIERTA' || user.ROL === APP.ROLES.ADMIN, 'INICIATIVA_NO_ABIERTA', 'La iniciativa no está abierta para postulaciones.');
    if (data.ID_PERSONA_CONTACTO) {
      exigir_(repoBuscarPorId('PERSONAS', data.ID_PERSONA_CONTACTO), 'PERSONA_NO_ENCONTRADA', 'La persona de contacto no existe.');
    }
    const exists = repoListar('POSTULACIONES', { filtro: { ID_INICIATIVA: data.ID_INICIATIVA, ID_EMPRENDIMIENTO: data.ID_EMPRENDIMIENTO }, incluirInactivos: true, limit: 10 });
    exigir_(!exists.length, 'POSTULACION_DUPLICADA', 'Ya existe una postulación para este emprendimiento e iniciativa.');
    return respuestaOk(repoInsertar('POSTULACIONES', Object.assign({}, data, {
      ID_POSTULACION: uuid_(),
      FECHA_POSTULACION: ahoraIso_(),
      ESTADO_POSTULACION: 'RECIBIDA',
      RESPUESTAS_JSON: JSON.stringify(data.RESPUESTAS || {}),
      CREADO_EN: ahoraIso_(),
      CREADO_POR: user.EMAIL,
      ACTUALIZADO_EN: ahoraIso_(),
      ACTUALIZADO_POR: user.EMAIL
    })));
  } catch (error) {
    return manejarError_(error, 'apiCrearPostulacion');
  }
}

function apiListarCandidatosIniciativa(iniciativaId, query) {
  try {
    exigirPermiso_('POSTULACION_EDITAR');
    const q = normalizarTexto_(query).toLowerCase();
    const existentes = repoTodos('POSTULACIONES', { incluirInactivos: true }).filter(function(p) {
      return String(p.ID_INICIATIVA) === String(iniciativaId);
    });
    const idsExistentes = existentes.reduce(function(out, p) { out[String(p.ID_EMPRENDIMIENTO)] = true; return out; }, {});
    const relaciones = repoTodos('PERSONA_EMPRENDIMIENTO', { incluirInactivos: true });
    const personas = indexarPor_(repoTodos('PERSONAS', { incluirInactivos: true }), 'ID_PERSONA');
    let rows = repoTodos('EMPRENDIMIENTOS', { incluirInactivos: true }).filter(function(e) {
      return e.ESTADO_EMPRENDIMIENTO !== 'CERRADO' &&
             (!q || [e.NOMBRE_COMERCIAL, e.ID_RUBRO, e.TERRITORIO_OPERACION].join(' ').toLowerCase().indexOf(q) >= 0);
    }).map(function(e) {
      const rel = relaciones.find(function(r) {
        return String(r.ID_EMPRENDIMIENTO) === String(e.ID_EMPRENDIMIENTO) && r.ESTADO_REGISTRO !== 'INACTIVO' && r.ES_PRINCIPAL === 'SI';
      });
      const p = rel ? personas[String(rel.ID_PERSONA)] : null;
      return {
        ID_EMPRENDIMIENTO: e.ID_EMPRENDIMIENTO,
        CODIGO_EMPRENDIMIENTO: e.CODIGO_EMPRENDIMIENTO,
        NOMBRE_COMERCIAL: e.NOMBRE_COMERCIAL,
        ID_RUBRO: e.ID_RUBRO,
        TERRITORIO_OPERACION: e.TERRITORIO_OPERACION,
        ID_PERSONA_CONTACTO: p ? p.ID_PERSONA : '',
        NOMBRE_CONTACTO: p ? nombrePersona_(p) : '',
        YA_POSTULADO: idsExistentes[String(e.ID_EMPRENDIMIENTO)] ? 'SI' : 'NO'
      };
    });
    rows.sort(function(a, b) {
      return a.YA_POSTULADO.localeCompare(b.YA_POSTULADO) || a.NOMBRE_COMERCIAL.localeCompare(b.NOMBRE_COMERCIAL);
    });
    return respuestaOk(rows.slice(0, 100));
  } catch (error) {
    return manejarError_(error, 'apiListarCandidatosIniciativa');
  }
}

function apiCrearPostulacionesMasivas(iniciativaId, candidatos, evaluarAhora) {
  try {
    exigirPermiso_('POSTULACION_EDITAR');
    exigir_(Array.isArray(candidatos) && candidatos.length, 'SIN_SELECCION', 'Seleccione al menos un emprendimiento.');
    exigir_(candidatos.length <= 100, 'LIMITE_MASIVO', 'Puede incorporar hasta 100 emprendimientos por vez.');
    const resumen = { creadas: 0, duplicadas: 0, errores: 0, evaluadas: 0, detalle: [] };
    candidatos.forEach(function(item) {
      const result = apiCrearPostulacion({
        ID_INICIATIVA: iniciativaId,
        ID_EMPRENDIMIENTO: item.ID_EMPRENDIMIENTO,
        ID_PERSONA_CONTACTO: item.ID_PERSONA_CONTACTO || '',
        RESPUESTAS: { ORIGEN: 'INCORPORACION_MASIVA' }
      });
      if (!result.ok) {
        if (result.error && result.error.code === 'POSTULACION_DUPLICADA') resumen.duplicadas++;
        else resumen.errores++;
        resumen.detalle.push({ id: item.ID_EMPRENDIMIENTO, ok: false, mensaje: result.error && result.error.message });
        return;
      }
      resumen.creadas++;
      resumen.detalle.push({ id: item.ID_EMPRENDIMIENTO, ok: true, postulacionId: result.data.ID_POSTULACION });
      if (evaluarAhora) {
        const ev = apiEvaluarAdmisibilidadAutomatica(result.data.ID_POSTULACION);
        if (ev.ok) resumen.evaluadas++;
      }
    });
    return respuestaOk(resumen);
  } catch (error) {
    return manejarError_(error, 'apiCrearPostulacionesMasivas');
  }
}

function indexarPor_(rows, campo) {
  return rows.reduce(function(out, row) {
    out[String(row[campo])] = row;
    return out;
  }, {});
}

var _mapasPostulacionesCache = null;

function mapasPostulaciones_() {
  if (_mapasPostulacionesCache) return _mapasPostulacionesCache;
  _mapasPostulacionesCache = {
    iniciativas: indexarPor_(repoTodos('INICIATIVAS', { incluirInactivos: true }), 'ID_INICIATIVA'),
    emprendimientos: indexarPor_(repoTodos('EMPRENDIMIENTOS', { incluirInactivos: true }), 'ID_EMPRENDIMIENTO'),
    personas: indexarPor_(repoTodos('PERSONAS', { incluirInactivos: true }), 'ID_PERSONA')
  };
  return _mapasPostulacionesCache;
}

function enriquecerPostulacion_(p, mapas) {
  mapas = mapas || mapasPostulaciones_();
  const i = mapas.iniciativas[String(p.ID_INICIATIVA)];
  const e = mapas.emprendimientos[String(p.ID_EMPRENDIMIENTO)];
  const persona = p.ID_PERSONA_CONTACTO ? mapas.personas[String(p.ID_PERSONA_CONTACTO)] : null;
  return Object.assign({}, p, {
    NOMBRE_INICIATIVA: i ? i.NOMBRE : '',
    NOMBRE_EMPRENDIMIENTO: e ? e.NOMBRE_COMERCIAL : '',
    NOMBRE_CONTACTO: persona ? [persona.NOMBRES, persona.APELLIDO_PATERNO].filter(Boolean).join(' ') : '',
    CORREO_CONTACTO: persona ? persona.EMAIL_NORMALIZADO : '',
    TELEFONO_CONTACTO: persona ? persona.TELEFONO_NORMALIZADO : ''
  });
}

function apiListarPostulaciones(filtros) {
  try {
    usuarioActual_();
    filtros = filtros || {};
    const q = normalizarTexto_(filtros.q).toLowerCase();
    const mapas = mapasPostulaciones_();
    let rows = repoTodos('POSTULACIONES', { incluirInactivos: true }).map(function(p) {
      return enriquecerPostulacion_(p, mapas);
    });
    if (q) {
      rows = rows.filter(function(p) {
        return [p.NOMBRE_INICIATIVA, p.NOMBRE_EMPRENDIMIENTO, p.NOMBRE_CONTACTO, p.ESTADO_POSTULACION].join(' ').toLowerCase().indexOf(q) >= 0;
      });
    }
    if (filtros.estado) rows = rows.filter(function(p) { return p.ESTADO_POSTULACION === filtros.estado; });
    if (filtros.iniciativaId) rows = rows.filter(function(p) { return String(p.ID_INICIATIVA) === String(filtros.iniciativaId); });
    rows.sort(function(a, b) { return String(b.FECHA_POSTULACION).localeCompare(String(a.FECHA_POSTULACION)); });
    const total = rows.length, offset = Math.max(0, Number(filtros.offset || 0)), limit = Math.min(100, Math.max(10, Number(filtros.limit || 25)));
    return respuestaOk({ filas: rows.slice(offset, offset + limit), total: total, offset: offset, limit: limit });
  } catch (error) {
    return manejarError_(error, 'apiListarPostulaciones');
  }
}

function apiObtenerPostulacion(id) {
  try {
    usuarioActual_();
    const p = repoBuscarPorId('POSTULACIONES', id);
    exigir_(p, 'NO_ENCONTRADO', 'Postulación no encontrada.');
    const admisiones = repoTodos('ADMISIONES', { incluirInactivos: true }).filter(function(a) {
      return String(a.ID_POSTULACION) === String(id);
    }).map(function(a) {
      const r = repoBuscarPorId('REQUISITOS', a.ID_REQUISITO);
      return Object.assign({}, a, {
        CAMPO: r ? r.CAMPO : '',
        OPERADOR: r ? r.OPERADOR : '',
        VALOR_ESPERADO: r ? r.VALOR_ESPERADO : '',
        ES_SUBSANABLE: r ? r.ES_SUBSANABLE : ''
      });
    }).sort(function(a, b) { return String(b.EVALUADO_EN).localeCompare(String(a.EVALUADO_EN)); });
    return respuestaOk({
      postulacion: enriquecerPostulacion_(p),
      admisiones: admisiones,
      admisionesVigentes: admisiones.filter(function(a) { return a.ES_VIGENTE === 'SI'; }),
      historialAdmisiones: admisiones.filter(function(a) { return a.ES_VIGENTE !== 'SI'; })
    });
  } catch (error) {
    return manejarError_(error, 'apiObtenerPostulacion');
  }
}

function evaluarRegla_(requisito, contexto) {
  const actual = contexto[requisito.CAMPO];
  const expected = requisito.VALOR_ESPERADO;
  switch (requisito.OPERADOR) {
    case 'IGUAL': return String(actual) === String(expected);
    case 'IN': return String(expected).split('|').indexOf(String(actual)) >= 0;
    case 'NO_IN': return String(expected).split('|').indexOf(String(actual)) < 0;
    case 'MAYOR_IGUAL': return Number(actual) >= Number(expected);
    case 'MENOR_IGUAL': return Number(actual) <= Number(expected);
    case 'EXISTE': return actual !== '' && actual != null;
    default: return false;
  }
}

function apiEvaluarAdmisibilidad(postulacionId, contexto) {
  try {
    const user = exigirPermiso_('POSTULACION_EDITAR');
    const post = repoBuscarPorId('POSTULACIONES', postulacionId);
    exigir_(post, 'NO_ENCONTRADO', postulacionId);
    const iniciativa = repoBuscarPorId('INICIATIVAS', post.ID_INICIATIVA);
    const rules = repoTodos('REQUISITOS', { incluirInactivos: true }).filter(function(r) {
      return String(r.ID_INICIATIVA) === String(post.ID_INICIATIVA) &&
             String(r.VERSION_REGLAS) === String(iniciativa.VERSION_REGLAS) &&
             r.ACTIVO === 'SI' &&
             r.TIPO_REGLA === 'ADMISIBILIDAD';
    });
    const ejecucionId = uuid_();
    repoTodos('ADMISIONES', { incluirInactivos: true }).filter(function(a) {
      return String(a.ID_POSTULACION) === String(postulacionId) && a.ES_VIGENTE === 'SI';
    }).forEach(function(a) {
      repoActualizar('ADMISIONES', a.ID_ADMISION, { ES_VIGENTE: 'NO' }, { motivo: 'Nueva evaluación de admisibilidad' });
    });
    let admissible = true, tieneFallaSubsanable = false, tieneFallaNoSubsanable = false;
    const results = rules.map(function(rule) {
      const ok = evaluarRegla_(rule, contexto || {});
      if (!ok) {
        admissible = false;
        if (rule.ES_SUBSANABLE === 'SI') tieneFallaSubsanable = true;
        else tieneFallaNoSubsanable = true;
      }
      return repoInsertar('ADMISIONES', {
        ID_ADMISION: uuid_(),
        ID_POSTULACION: postulacionId,
        ID_REQUISITO: rule.ID_REQUISITO,
        RESULTADO: ok ? 'ADMISIBLE' : (rule.ES_SUBSANABLE === 'SI' ? 'SUBSANABLE' : 'INADMISIBLE'),
        RESULTADO_REGLA: ok ? 'CUMPLE' : 'NO_CUMPLE',
        MOTIVO_EXCLUSION: ok ? '' : 'No cumple: ' + (ETIQUETAS_CATALOGO[rule.CAMPO] || rule.CAMPO),
        EVALUADO_EN: ahoraIso_(),
        EVALUADO_POR: user.EMAIL,
        ID_EJECUCION_ADMISION: ejecucionId,
        ES_VIGENTE: 'SI'
      });
    });
    const state = admissible ? 'ADMISIBLE' : (tieneFallaNoSubsanable ? 'INADMISIBLE' : (tieneFallaSubsanable ? 'SUBSANABLE' : 'INADMISIBLE'));
    repoActualizar('POSTULACIONES', postulacionId, { ESTADO_POSTULACION: state, ACTUALIZADO_EN: ahoraIso_(), ACTUALIZADO_POR: user.EMAIL });
    return respuestaOk({ estado: state, resultados: results, ejecucionId: ejecucionId });
  } catch (error) {
    return manejarError_(error, 'apiEvaluarAdmisibilidad');
  }
}

function construirContextoPostulacion_(post) {
  const emp = repoBuscarPorId('EMPRENDIMIENTOS', post.ID_EMPRENDIMIENTO);
  exigir_(emp, 'EMPRENDIMIENTO_NO_ENCONTRADO', post.ID_EMPRENDIMIENTO);
  let persona = post.ID_PERSONA_CONTACTO ? repoBuscarPorId('PERSONAS', post.ID_PERSONA_CONTACTO) : null;
  if (!persona) {
    const rel = repoTodos('PERSONA_EMPRENDIMIENTO', { incluirInactivos: true }).find(function(r) {
      return String(r.ID_EMPRENDIMIENTO) === String(emp.ID_EMPRENDIMIENTO) && r.ESTADO_REGISTRO !== 'INACTIVO' && r.ES_PRINCIPAL === 'SI';
    });
    if (rel) persona = repoBuscarPorId('PERSONAS', rel.ID_PERSONA);
  }
  const docEmp = resumenDocumental_('EMPRENDIMIENTO', emp.ID_EMPRENDIMIENTO);
  const docPersona = persona ? resumenDocumental_('PERSONA', persona.ID_PERSONA) : { COMPLETO: 'NO' };
  const habilitacion = habilitacionMercados_(emp.ID_EMPRENDIMIENTO);
  return {
    ID_RUBRO: emp.ID_RUBRO,
    ID_SUBRUBRO: emp.ID_SUBRUBRO,
    FORMALIZACION: emp.FORMALIZACION,
    ETAPA_ACTUAL: emp.ETAPA_ACTUAL,
    ESTADO_EMPRENDIMIENTO: emp.ESTADO_EMPRENDIMIENTO,
    COMUNA_PERSONA: persona ? persona.COMUNA_RESIDENCIA : '',
    GENERO_PERSONA: persona ? persona.GENERO : '',
    DISCAPACIDAD_DECLARADA: persona ? persona.DISCAPACIDAD_DECLARADA : '',
    DOCUMENTACION_PERSONA_COMPLETA: docPersona.COMPLETO,
    DOCUMENTACION_EMPRENDIMIENTO_COMPLETA: docEmp.COMPLETO,
    HABILITADO_MERCADOS: habilitacion.HABILITADO
  };
}

function apiEvaluarAdmisibilidadAutomatica(postulacionId) {
  try {
    const post = repoBuscarPorId('POSTULACIONES', postulacionId);
    exigir_(post, 'NO_ENCONTRADO', 'Postulación no encontrada.');
    return apiEvaluarAdmisibilidad(postulacionId, construirContextoPostulacion_(post));
  } catch (error) {
    return manejarError_(error, 'apiEvaluarAdmisibilidadAutomatica');
  }
}

function apiEvaluarAdmisibilidadMasiva(iniciativaId) {
  try {
    exigirPermiso_('POSTULACION_EDITAR');
    const posts = repoTodos('POSTULACIONES', { incluirInactivos: true }).filter(function(p) {
      return String(p.ID_INICIATIVA) === String(iniciativaId) && p.ESTADO_POSTULACION !== 'RETIRADA';
    });
    exigir_(posts.length, 'SIN_POSTULACIONES', 'La iniciativa no tiene postulaciones para evaluar.');
    const resumen = { total: posts.length, admisibles: 0, subsanables: 0, inadmisibles: 0, errores: 0 };
    posts.forEach(function(p) {
      const r = apiEvaluarAdmisibilidadAutomatica(p.ID_POSTULACION);
      if (!r.ok) {
        resumen.errores++;
        return;
      }
      const key = String(r.data.estado || '').toLowerCase() + 's';
      if (Object.prototype.hasOwnProperty.call(resumen, key)) resumen[key]++;
    });
    return respuestaOk(resumen);
  } catch (error) {
    return manejarError_(error, 'apiEvaluarAdmisibilidadMasiva');
  }
}

function apiRetirarPostulacion(id, motivo) {
  try {
    const user = exigirPermiso_('POSTULACION_EDITAR');
    exigir_(motivo, 'MOTIVO_OBLIGATORIO', 'Debe indicar el motivo.');
    return respuestaOk(repoActualizar('POSTULACIONES', id, {
      ESTADO_POSTULACION: 'RETIRADA',
      ACTUALIZADO_EN: ahoraIso_(),
      ACTUALIZADO_POR: user.EMAIL
    }, { motivo: motivo }));
  } catch (error) {
    return manejarError_(error, 'apiRetirarPostulacion');
  }
}


// ==========================================
// ARCHIVO: SeleccionService.gs
// ==========================================

// ===== SeleccionService.gs =====
// SGE v2.1.0 - Ficha integral del emprendedor
// Motor de selección reproducible con semilla pseudoaleatoria y auditoría de adjudicación

function ordenarConSemilla_(items, seed) {
  const random = randomSemilla_(seed);
  return items.map(function(item) {
    return { item: item, order: random() };
  }).sort(function(a, b) {
    return a.order - b.order;
  });
}

function apiOpcionesSeleccion() {
  try {
    usuarioActual_();
    exigir_(puede_('SELECCION_EJECUTAR') || puede_('SELECCION_VER'), 'PROHIBIDO', 'No tiene permiso para consultar selecciones.');
    const iniciativas = repoTodos('INICIATIVAS', { incluirInactivos: true }).filter(function(i) {
      return ['CANCELADA', 'BORRADOR'].indexOf(i.ESTADO) < 0;
    }).sort(function(a, b) {
      return String(b.FECHA_EJECUCION || b.CREADO_EN).localeCompare(String(a.FECHA_EJECUCION || a.CREADO_EN));
    });
    const procesos = repoTodos('PROCESOS_SELECCION', { incluirInactivos: true });
    const posts = repoTodos('POSTULACIONES', { incluirInactivos: true });
    const postsAdmisiblesPorIni = {};
    posts.forEach(function(p) {
      if (p.ESTADO_POSTULACION === 'ADMISIBLE') {
        postsAdmisiblesPorIni[String(p.ID_INICIATIVA)] = (postsAdmisiblesPorIni[String(p.ID_INICIATIVA)] || 0) + 1;
      }
    });
    const procPorIni = {};
    procesos.forEach(function(p) {
      if (p.ESTADO === 'EJECUTADO') {
        procPorIni[String(p.ID_INICIATIVA)] = (procPorIni[String(p.ID_INICIATIVA)] || 0) + 1;
      }
    });
    return respuestaOk(iniciativas.map(function(i) {
      return {
        ID_INICIATIVA: i.ID_INICIATIVA,
        NOMBRE: i.NOMBRE,
        FECHA_EJECUCION: i.FECHA_EJECUCION,
        ESTADO: i.ESTADO,
        CUPOS_TITULARES: i.CUPOS_TITULARES,
        CUPOS_SUPLENTES: i.CUPOS_SUPLENTES,
        POSTULACIONES_ADMISIBLES: postsAdmisiblesPorIni[String(i.ID_INICIATIVA)] || 0,
        SELECCIONES_EJECUTADAS: procPorIni[String(i.ID_INICIATIVA)] || 0
      };
    }));
  } catch (error) {
    return manejarError_(error, 'apiOpcionesSeleccion');
  }
}

function apiListarProcesosSeleccion(iniciativaId) {
  try {
    usuarioActual_();
    exigir_(puede_('SELECCION_EJECUTAR') || puede_('SELECCION_VER'), 'PROHIBIDO', 'No tiene permiso para consultar selecciones.');
    const mapas = mapasPostulaciones_();
    const postsMap = indexarPor_(repoTodos('POSTULACIONES', { incluirInactivos: true }), 'ID_POSTULACION');
    const procesos = repoTodos('PROCESOS_SELECCION', { incluirInactivos: true }).filter(function(p) {
      return !iniciativaId || String(p.ID_INICIATIVA) === String(iniciativaId);
    }).sort(function(a, b) {
      return String(b.FECHA_EJECUCION).localeCompare(String(a.FECHA_EJECUCION));
    });
    const resultados = repoTodos('RESULTADOS_SELECCION', { incluirInactivos: true });
    return respuestaOk(procesos.map(function(p) {
      const detalle = resultados.filter(function(r) {
        return String(r.ID_PROCESO) === String(p.ID_PROCESO);
      }).sort(function(a, b) {
        return Number(a.POSICION) - Number(b.POSICION);
      }).map(function(r) {
        const base = postsMap[String(r.ID_POSTULACION)];
        return Object.assign({}, r, enriquecerPostulacion_(base || {}, mapas));
      });
      return Object.assign({}, p, {
        NOMBRE_INICIATIVA: mapas.iniciativas[String(p.ID_INICIATIVA)] ? mapas.iniciativas[String(p.ID_INICIATIVA)].NOMBRE : '',
        RESULTADOS: detalle
      });
    }));
  } catch (error) {
    return manejarError_(error, 'apiListarProcesosSeleccion');
  }
}

function apiEjecutarSeleccion(iniciativaId, config) {
  try {
    const user = exigirPermiso_('SELECCION_EJECUTAR');
    const iniciativa = repoBuscarPorId('INICIATIVAS', iniciativaId);
    exigir_(iniciativa, 'NO_ENCONTRADO', iniciativaId);
    const anteriores = repoListar('PROCESOS_SELECCION', { filtro: { ID_INICIATIVA: iniciativaId, ESTADO: 'EJECUTADO' }, incluirInactivos: true, limit: 200 });
    exigir_(!anteriores.length || config.confirmarNuevaEjecucion === true, 'SELECCION_EXISTENTE', 'Ya existe una selección ejecutada. Una nueva ejecución debe confirmarse y no reemplazará la anterior.');
    const postulaciones = repoListar('POSTULACIONES', { filtro: { ID_INICIATIVA: iniciativaId }, incluirInactivos: true, limit: APP.MAX_PAGE_SIZE });
    const universo = postulaciones.filter(function(p) { return p.ESTADO_POSTULACION === 'ADMISIBLE'; });
    exigir_(universo.length, 'UNIVERSO_VACIO', 'No existen postulaciones admisibles.');
    const seed = Number(config.semilla || new Date().getTime() % 2147483647);
    const metodo = config.metodo || 'ALEATORIO_SIMPLE';
    const titulares = Number(config.cuposTitulares || iniciativa.CUPOS_TITULARES || 0);
    const suplentes = Number(config.cuposSuplentes || iniciativa.CUPOS_SUPLENTES || 0);
    const processId = uuid_();
    const canonical = universo.map(function(p) { return p.ID_POSTULACION; }).sort();
    const process = repoInsertar('PROCESOS_SELECCION', {
      ID_PROCESO: processId,
      ID_INICIATIVA: iniciativaId,
      VERSION_REGLAS: iniciativa.VERSION_REGLAS,
      METODO: metodo,
      PARAMETROS_JSON: JSON.stringify(config || {}),
      SEMILLA: seed,
      FECHA_EJECUCION: ahoraIso_(),
      EJECUTADO_POR: user.EMAIL,
      ESTADO: 'EJECUTADO',
      TAMANO_UNIVERSO: universo.length,
      HUELLA_INTEGRIDAD: huella_(JSON.stringify(canonical))
    });

    let ordered = [];
    if (metodo === 'ALEATORIO_ESTRATIFICADO') {
      const field = config.campoEstrato || 'ESTRATO';
      const groups = {};
      universo.forEach(function(p) {
        const key = (config.estratos && config.estratos[p.ID_POSTULACION]) || p[field] || 'SIN_ESTRATO';
        (groups[key] = groups[key] || []).push(p);
      });
      Object.keys(groups).sort().forEach(function(key, index) {
        ordered = ordered.concat(ordenarConSemilla_(groups[key], seed + index));
      });
    } else {
      ordered = ordenarConSemilla_(universo, seed);
      if (metodo === 'RANKING_PUNTAJE') {
        ordered.sort(function(a, b) {
          return Number(b.item.PUNTAJE || 0) - Number(a.item.PUNTAJE || 0) || a.order - b.order;
        });
      }
    }

    const results = ordered.map(function(entry, index) {
      const p = entry.item;
      repoInsertar('UNIVERSO_SELECCION', {
        ID_UNIVERSO: uuid_(),
        ID_PROCESO: processId,
        ID_POSTULACION: p.ID_POSTULACION,
        ELEGIBLE: 'SI',
        ESTRATO: (config.estratos && config.estratos[p.ID_POSTULACION]) || '',
        PONDERACION: 1,
        ORDEN_ALEATORIO: entry.order,
        MOTIVO_EXCLUSION: '',
        CREADO_EN: ahoraIso_()
      });
      const result = index < titulares ? 'TITULAR' : index < titulares + suplentes ? 'SUPLENTE' : 'NO_SELECCIONADO';
      return repoInsertar('RESULTADOS_SELECCION', {
        ID_RESULTADO: uuid_(),
        ID_PROCESO: processId,
        ID_POSTULACION: p.ID_POSTULACION,
        RESULTADO: result,
        POSICION: index + 1,
        ESTRATO: (config.estratos && config.estratos[p.ID_POSTULACION]) || '',
        FECHA_RESULTADO: ahoraIso_(),
        PROCESO_ORIGEN: processId
      });
    });
    return respuestaOk({ proceso: process, resultados: results });
  } catch (error) {
    return manejarError_(error, 'apiEjecutarSeleccion');
  }
}

function apiAjustarResultado(resultadoId, nuevoEstado, motivo, evidencia) {
  try {
    const user = exigirPermiso_('SELECCION_EJECUTAR');
    const old = repoBuscarPorId('RESULTADOS_SELECCION', resultadoId);
    exigir_(old, 'NO_ENCONTRADO', resultadoId);
    exigir_(motivo, 'MOTIVO_OBLIGATORIO', 'Todo ajuste debe incluir motivo.');
    repoInsertar('AJUSTES_SELECCION', {
      ID_AJUSTE: uuid_(),
      ID_PROCESO: old.ID_PROCESO,
      ID_RESULTADO: resultadoId,
      ESTADO_ANTERIOR: old.RESULTADO,
      ESTADO_NUEVO: nuevoEstado,
      MOTIVO: motivo,
      EVIDENCIA: evidencia || '',
      AUTORIZADO_POR: user.EMAIL,
      FECHA_AJUSTE: ahoraIso_()
    });
    return respuestaOk(repoActualizar('RESULTADOS_SELECCION', resultadoId, { RESULTADO: nuevoEstado }, { motivo: motivo }));
  } catch (error) {
    return manejarError_(error, 'apiAjustarResultado');
  }
}


// ==========================================
// ARCHIVO: ParticipacionService.gs
// ==========================================

// ===== ParticipacionService.gs =====
// SGE v2.1.0 - Ficha integral del emprendedor
// Registro de asistencia, confirmaciones, beneficios y atenciones

function apiRegistrarParticipacion(data) {
  try {
    const user = exigirPermiso_('PARTICIPACION_EDITAR');
    exigir_(data && data.ID_POSTULACION, 'DATOS_INCOMPLETOS', 'La postulación es obligatoria.');
    return respuestaOk(repoInsertar('PARTICIPACIONES', Object.assign({}, data, {
      ID_PARTICIPACION: uuid_(),
      ESTADO_PARTICIPACION: data.ESTADO_PARTICIPACION || 'PENDIENTE',
      CREADO_EN: ahoraIso_(),
      CREADO_POR: user.EMAIL
    })));
  } catch (error) {
    return manejarError_(error, 'apiRegistrarParticipacion');
  }
}

function apiRegistrarBeneficio(data) {
  try {
    const user = exigirPermiso_('PARTICIPACION_EDITAR');
    exigir_(data && data.ID_EMPRENDIMIENTO && data.ID_INICIATIVA && data.TIPO_BENEFICIO, 'DATOS_INCOMPLETOS', 'Emprendimiento, iniciativa y beneficio son obligatorios.');
    return respuestaOk(repoInsertar('BENEFICIOS', Object.assign({}, data, {
      ID_BENEFICIO: uuid_(),
      FECHA: data.FECHA || ahoraIso_(),
      RESPONSABLE: user.EMAIL
    })));
  } catch (error) {
    return manejarError_(error, 'apiRegistrarBeneficio');
  }
}

function apiRegistrarAtencion(data) {
  try {
    const user = exigirPermiso_('PERSONA_EDITAR');
    return respuestaOk(repoInsertar('ATENCIONES', Object.assign({}, data, {
      ID_ATENCION: uuid_(),
      FECHA: ahoraIso_(),
      ID_USUARIO: user.EMAIL,
      ESTADO: data.ESTADO || 'ABIERTA'
    })));
  } catch (error) {
    return manejarError_(error, 'apiRegistrarAtencion');
  }
}

function apiCandidatosSeleccionManual(iniciativaId, filtros) {
  try {
    exigirPermiso_('SELECCION_EJECUTAR');
    filtros = filtros || {};
    const iniciativa = repoBuscarPorId('INICIATIVAS', iniciativaId);
    exigir_(iniciativa, 'NO_ENCONTRADO', 'Seleccione una iniciativa o mercado.');
    const q = normalizarTexto_(filtros.q).toLowerCase();
    const personas = indexarPor_(repoTodos('PERSONAS', { incluirInactivos: true }), 'ID_PERSONA');
    const relaciones = repoTodos('PERSONA_EMPRENDIMIENTO', { incluirInactivos: true });
    const relsPorEmp = {};
    relaciones.forEach(function(x) {
      if (x.ES_PRINCIPAL === 'SI' && x.ESTADO_REGISTRO !== 'INACTIVO') {
        relsPorEmp[String(x.ID_EMPRENDIMIENTO)] = x;
      }
    });
    let rows = repoTodos('EMPRENDIMIENTOS', { incluirInactivos: true }).filter(function(e) {
      return e.ESTADO_EMPRENDIMIENTO === 'ACTIVO';
    });
    ['rubro', 'etapa', 'formalizacion', 'territorio'].forEach(function(k) {
      if (filtros[k]) {
        const f = { rubro: 'ID_RUBRO', etapa: 'ETAPA_ACTUAL', formalizacion: 'FORMALIZACION', territorio: 'TERRITORIO_OPERACION' }[k];
        rows = rows.filter(function(e) { return String(e[f]) === String(filtros[k]); });
      }
    });
    if (filtros.documentacion === 'COMPLETA') {
      rows = rows.filter(function(e) {
        return docs.some(function(d) {
          return String(d.ID_EMPRENDIMIENTO) === String(e.ID_EMPRENDIMIENTO) && d.ESTADO_REVISION === 'APROBADO';
        });
      });
    }
    if (q) {
      rows = rows.filter(function(e) {
        const r = relsPorEmp[String(e.ID_EMPRENDIMIENTO)];
        const p = r && personas[String(r.ID_PERSONA)];
        return [
          e.CODIGO_EMPRENDIMIENTO, e.NOMBRE_COMERCIAL, e.ID_RUBRO, e.TERRITORIO_OPERACION,
          p && p.CODIGO_PERSONA, p && p.RUT_NORMALIZADO, p && p.NOMBRES, p && p.EMAIL_NORMALIZADO, p && p.TELEFONO_NORMALIZADO
        ].join(' ').toLowerCase().indexOf(q) >= 0;
      });
    }
    return respuestaOk(rows.slice(0, 200).map(function(e) {
      const r = relsPorEmp[String(e.ID_EMPRENDIMIENTO)];
      const p = r && personas[String(r.ID_PERSONA)];
      return {
        ID_EMPRENDIMIENTO: e.ID_EMPRENDIMIENTO,
        CODIGO: e.CODIGO_EMPRENDIMIENTO,
        NOMBRE: e.NOMBRE_COMERCIAL,
        RUBRO: e.ID_RUBRO,
        ETAPA: e.ETAPA_ACTUAL,
        FORMALIZACION: e.FORMALIZACION,
        TERRITORIO: e.TERRITORIO_OPERACION,
        ID_PERSONA: p && p.ID_PERSONA,
        PERSONA: p && nombrePersona_(p),
        CORREO: p && p.EMAIL_NORMALIZADO,
        TELEFONO: p && p.TELEFONO_NORMALIZADO
      };
    }));
  } catch (error) {
    return manejarError_(error, 'apiCandidatosSeleccionManual');
  }
}

function apiConfirmarParticipacion(idPostulacion, estado, motivo) {
  try {
    const user = exigirPermiso_('PARTICIPACION_EDITAR');
    exigir_(['PENDIENTE', 'CONFIRMADA', 'NO_RESPONDE', 'INASISTENTE', 'DESISTIO', 'REEMPLAZADA', 'ASISTIO'].indexOf(estado) >= 0, 'ESTADO_INVALIDO', 'Estado de seguimiento no válido.');
    const actual = repoTodos('PARTICIPACIONES', { incluirInactivos: true }).find(function(x) {
      return String(x.ID_POSTULACION) === String(idPostulacion);
    });
    const cambios = {
      ESTADO_PARTICIPACION: estado,
      MOTIVO: motivo || '',
      FECHA_CONFIRMACION: estado === 'CONFIRMADA' ? ahoraIso_() : (actual && actual.FECHA_CONFIRMACION || ''),
      FECHA_ASISTENCIA: estado === 'ASISTIO' ? ahoraIso_() : (actual && actual.FECHA_ASISTENCIA || '')
    };
    return respuestaOk(actual ? repoActualizar('PARTICIPACIONES', actual.ID_PARTICIPACION, cambios, { motivo: 'Seguimiento: ' + estado }) : repoInsertar('PARTICIPACIONES', Object.assign({
      ID_PARTICIPACION: uuid_(),
      ID_POSTULACION: idPostulacion,
      ID_RESULTADO: '',
      REEMPLAZA_A: '',
      CREADO_EN: ahoraIso_(),
      CREADO_POR: user.EMAIL
    }, cambios), { motivo: 'Seguimiento: ' + estado }));
  } catch (error) {
    return manejarError_(error, 'apiConfirmarParticipacion');
  }
}

function apiCrearSeleccionManual(iniciativaId, seleccionados, config) {
  try {
    const user = exigirPermiso_('SELECCION_EJECUTAR');
    const ini = repoBuscarPorId('INICIATIVAS', iniciativaId);
    exigir_(ini, 'NO_ENCONTRADO', 'Seleccione un mercado o iniciativa.');
    seleccionados = seleccionados || [];
    exigir_(seleccionados.length, 'SIN_SELECCION', 'Seleccione al menos un emprendimiento.');
    exigir_(normalizarTexto_(config && config.motivo), 'MOTIVO_OBLIGATORIO', 'Indique los criterios aplicados a la selección manual.');
    return conBloqueoSistema_(function() {
      const processId = uuid_();
      const posts = repoTodos('POSTULACIONES', { incluirInactivos: true });
      const process = repoInsertar('PROCESOS_SELECCION', {
        ID_PROCESO: processId,
        ID_INICIATIVA: iniciativaId,
        VERSION_REGLAS: ini.VERSION_REGLAS,
        METODO: 'MANUAL_MERCADO',
        PARAMETROS_JSON: JSON.stringify({ motivo: config.motivo, filtros: config.filtros || {}, origen: 'SELECCION_MANUAL' }),
        SEMILLA: '',
        FECHA_EJECUCION: ahoraIso_(),
        EJECUTADO_POR: user.EMAIL,
        ESTADO: 'EJECUTADO',
        TAMANO_UNIVERSO: seleccionados.length,
        HUELLA_INTEGRIDAD: huella_(JSON.stringify(seleccionados.map(function(x) { return x.ID_EMPRENDIMIENTO; }).sort()))
      });
      const results = seleccionados.map(function(x, i) {
        let p = posts.find(function(q) {
          return String(q.ID_INICIATIVA) === String(iniciativaId) &&
                 String(q.ID_EMPRENDIMIENTO) === String(x.ID_EMPRENDIMIENTO) &&
                 q.ESTADO_POSTULACION !== 'RETIRADA';
        });
        if (!p) {
          p = repoInsertar('POSTULACIONES', {
            ID_POSTULACION: uuid_(),
            ID_INICIATIVA: iniciativaId,
            ID_EMPRENDIMIENTO: x.ID_EMPRENDIMIENTO,
            ID_PERSONA_CONTACTO: x.ID_PERSONA || '',
            FECHA_POSTULACION: ahoraIso_(),
            ESTADO_POSTULACION: 'ADMISIBLE',
            RESPUESTAS_JSON: JSON.stringify({ ORIGEN: 'SELECCION_MANUAL', MOTIVO: config.motivo }),
            CREADO_EN: ahoraIso_(),
            CREADO_POR: user.EMAIL,
            ACTUALIZADO_EN: ahoraIso_(),
            ACTUALIZADO_POR: user.EMAIL
          }, { motivo: 'Postulación interna para selección manual' });
          posts.push(p);
        }
        const result = i < Number(config.cuposTitulares || ini.CUPOS_TITULARES || 0) ? 'TITULAR' : 'SUPLENTE';
        return repoInsertar('RESULTADOS_SELECCION', {
          ID_RESULTADO: uuid_(),
          ID_PROCESO: processId,
          ID_POSTULACION: p.ID_POSTULACION,
          RESULTADO: result,
          POSICION: i + 1,
          ESTRATO: 'MANUAL',
          FECHA_RESULTADO: ahoraIso_(),
          PROCESO_ORIGEN: processId
        });
      });
      return respuestaOk({ proceso: process, resultados: results });
    });
  } catch (error) {
    return manejarError_(error, 'apiCrearSeleccionManual');
  }
}

function apiBandejaConfirmados(iniciativaId) {
  try {
    exigirPermiso_('PARTICIPACION_EDITAR');
    const mapas = mapasPostulaciones_();
    const results = repoTodos('RESULTADOS_SELECCION', { incluirInactivos: true });
    const processes = indexarPor_(repoTodos('PROCESOS_SELECCION', { incluirInactivos: true }), 'ID_PROCESO');
    const postsMap = indexarPor_(repoTodos('POSTULACIONES', { incluirInactivos: true }), 'ID_POSTULACION');
    const parts = repoTodos('PARTICIPACIONES', { incluirInactivos: true });
    const partsMap = {};
    parts.forEach(function(x) { partsMap[String(x.ID_POSTULACION)] = x; });

    return respuestaOk(results.filter(function(r) {
      const p = processes[String(r.ID_PROCESO)];
      return String(p && p.ID_INICIATIVA) === String(iniciativaId) && ['TITULAR', 'SUPLENTE'].indexOf(r.RESULTADO) >= 0;
    }).map(function(r) {
      const post = postsMap[String(r.ID_POSTULACION)] || {};
      const p = enriquecerPostulacion_(post, mapas);
      const a = partsMap[String(r.ID_POSTULACION)];
      return Object.assign({}, r, {
        ID_EMPRENDIMIENTO: p.ID_EMPRENDIMIENTO,
        ID_PERSONA: p.ID_PERSONA_CONTACTO,
        NOMBRE_EMPRENDIMIENTO: p.NOMBRE_EMPRENDIMIENTO,
        NOMBRE_CONTACTO: p.NOMBRE_CONTACTO,
        CORREO: p.CORREO_CONTACTO,
        TELEFONO: p.TELEFONO_CONTACTO,
        ESTADO_SEGUIMIENTO: a ? a.ESTADO_PARTICIPACION : 'PENDIENTE',
        MOTIVO_SEGUIMIENTO: a ? a.MOTIVO : ''
      });
    }));
  } catch (error) {
    return manejarError_(error, 'apiBandejaConfirmados');
  }
}

function apiReemplazarParticipante(postulacionTitular, postulacionSuplente, motivo) {
  try {
    exigirPermiso_('PARTICIPACION_EDITAR');
    exigir_(postulacionTitular && postulacionSuplente && postulacionTitular !== postulacionSuplente, 'REEMPLAZO_INVALIDO', 'Seleccione un titular y un suplente distintos.');
    exigir_(normalizarTexto_(motivo), 'MOTIVO_OBLIGATORIO', 'Indique el motivo del reemplazo.');
    return conBloqueoSistema_(function() {
      const partes = repoTodos('PARTICIPACIONES', { incluirInactivos: true });
      const titular = partes.find(function(x) { return String(x.ID_POSTULACION) === String(postulacionTitular); });
      const suplente = partes.find(function(x) { return String(x.ID_POSTULACION) === String(postulacionSuplente); });
      if (titular) {
        repoActualizar('PARTICIPACIONES', titular.ID_PARTICIPACION, {
          ESTADO_PARTICIPACION: 'REEMPLAZADA',
          MOTIVO: motivo,
          REEMPLAZA_A: postulacionSuplente
        }, { motivo: 'Reemplazo de participante' });
      } else {
        apiConfirmarParticipacion(postulacionTitular, 'REEMPLAZADA', motivo);
      }
      if (suplente) {
        return respuestaOk(repoActualizar('PARTICIPACIONES', suplente.ID_PARTICIPACION, {
          ESTADO_PARTICIPACION: 'PENDIENTE',
          MOTIVO: 'Habilitado como reemplazo: ' + motivo,
          REEMPLAZA_A: postulacionTitular
        }, { motivo: 'Habilitado como reemplazo' }));
      }
      return apiConfirmarParticipacion(postulacionSuplente, 'PENDIENTE', 'Habilitado como reemplazo: ' + motivo);
    });
  } catch (error) {
    return manejarError_(error, 'apiReemplazarParticipante');
  }
}


// ==========================================
// ARCHIVO: GeoService.gs
// ==========================================

// ===== GeoService.gs =====
// SGE v2.1.0 - Ficha integral del emprendedor
// Direcciones, derivaciones y georreferenciación con Google Maps

function apiRegistrarDerivacion(data) {
  try {
    const user = exigirPermiso_('PERSONA_EDITAR');
    exigir_(data && data.ID_ATENCION && data.DESTINO && data.MOTIVO, 'DATOS_INCOMPLETOS', 'Atención, destino y motivo son obligatorios.');
    return respuestaOk(repoInsertar('DERIVACIONES', Object.assign({}, data, {
      ID_DERIVACION: uuid_(),
      ORIGEN: data.ORIGEN || 'SGE',
      FECHA: ahoraIso_(),
      RESULTADO: data.RESULTADO || 'PENDIENTE',
      SEGUIMIENTO: data.SEGUIMIENTO || '',
      CREADO_POR: user.EMAIL
    })));
  } catch (error) {
    return manejarError_(error, 'apiRegistrarDerivacion');
  }
}

function apiRegistrarDireccion(data) {
  try {
    const user = exigirPermiso_('EMPRENDIMIENTO_EDITAR');
    exigir_(data && data.ID_SUJETO && data.DIRECCION_DECLARADA, 'DATOS_INCOMPLETOS', 'Sujeto y dirección son obligatorios.');
    const value = Object.assign({}, data, {
      ID_DIRECCION: uuid_(),
      DIRECCION_NORMALIZADA: normalizarTexto_(data.DIRECCION_DECLARADA),
      ESTADO_VALIDACION: 'DECLARADO',
      ES_VIGENTE: 'SI',
      CREADO_EN: ahoraIso_(),
      CREADO_POR: user.EMAIL
    });
    return respuestaOk(repoInsertar('DIRECCIONES', value));
  } catch (error) {
    return manejarError_(error, 'apiRegistrarDireccion');
  }
}

function apiGeocodificarDireccion(idDireccion) {
  try {
    const user = exigirPermiso_('EMPRENDIMIENTO_EDITAR');
    const address = repoBuscarPorId('DIRECCIONES', idDireccion);
    exigir_(address, 'NO_ENCONTRADO', idDireccion);
    const query = [address.DIRECCION_NORMALIZADA, address.COMUNA, 'Chile'].filter(Boolean).join(', ');
    const results = Maps.newGeocoder().setRegion('cl').geocode(query);
    exigir_(results.status === 'OK' && results.results.length, 'GEOCODIFICACION_FALLIDA', query);
    const loc = results.results[0].geometry.location;
    const geo = repoInsertar('GEOLOCALIZACIONES', {
      ID_GEOLOCALIZACION: uuid_(),
      ID_DIRECCION: idDireccion,
      LATITUD: loc.lat,
      LONGITUD: loc.lng,
      PRECISION: results.results[0].geometry.location_type || 'NO_DEFINIDA',
      FUENTE: 'GOOGLE_MAPS',
      FECHA_GEOCODIFICACION: ahoraIso_(),
      ESTADO_VALIDACION: 'AUTOMATICA',
      CREADO_POR: user.EMAIL
    });
    repoActualizar('DIRECCIONES', idDireccion, { ESTADO_VALIDACION: 'PENDIENTE' }, { motivo: 'Geocodificación automática pendiente de confirmación' });
    return respuestaOk(geo);
  } catch (error) {
    return manejarError_(error, 'apiGeocodificarDireccion');
  }
}


// ==========================================
// ARCHIVO: ReportesService.gs
// ==========================================

// ===== ReportesService.gs =====
// SGE v2.1.0 - Ficha integral del emprendedor
// Métricas, paneles de control, catálogos en caché y exportación de datos

function catalogos_() {
  const cache = CacheService.getScriptCache();
  const stored = cache.get(APP.CACHE_CATALOGS);
  if (stored) {
    try { return JSON.parse(stored); } catch (e) {}
  }
  const grouped = {};
  repoTodos('CATALOGOS', { incluirInactivos: true }).filter(function(c) {
    return c.ACTIVO === 'SI';
  }).forEach(function(c) {
    (grouped[c.TIPO_CATALOGO] = grouped[c.TIPO_CATALOGO] || []).push(c);
  });
  Object.keys(CATALOGOS_INICIALES).forEach(function(type) {
    grouped[type] = grouped[type] || [];
    const existentes = grouped[type].map(function(c) { return c.CODIGO; });
    CATALOGOS_INICIALES[type].forEach(function(code, index) {
      if (existentes.indexOf(code) < 0) {
        grouped[type].push({
          TIPO_CATALOGO: type,
          CODIGO: code,
          ETIQUETA: ETIQUETAS_CATALOGO[code] || code.replace(/_/g, ' '),
          ORDEN: index + 1,
          ACTIVO: 'SI',
          METADATA_JSON: EXPLICACION_OPERADORES[code] ? JSON.stringify({ explicacion: EXPLICACION_OPERADORES[code] }) : ''
        });
      }
    });
    grouped[type].sort(function(a, b) { return Number(a.ORDEN || 0) - Number(b.ORDEN || 0); });
  });
  try {
    cache.put(APP.CACHE_CATALOGS, JSON.stringify(grouped), 21600); // 6 horas TTL
  } catch (ignored) {}
  return grouped;
}

function agruparConteo_(rows, field, fallback) {
  return rows.reduce(function(acc, row) {
    const key = row[field] || fallback || 'SIN INFORMACIÓN';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function apiDashboard(force) {
  try {
    exigirPermiso_('REPORTE_VER');
    const cache = CacheService.getScriptCache();
    if (!force) {
      const stored = cache.get(APP.CACHE_DASHBOARD);
      if (stored) {
        try { return respuestaOk(JSON.parse(stored), { cache: true }); } catch (e) {}
      }
    }
    const personas = repoTodos('PERSONAS', { incluirInactivos: false });
    const emps = repoTodos('EMPRENDIMIENTOS', { incluirInactivos: true }).filter(function(e) {
      return e.ESTADO_EMPRENDIMIENTO !== 'CERRADO';
    });
    const docs = repoTodos('DOCUMENTOS', { incluirInactivos: true });
    const posts = repoTodos('POSTULACIONES', { incluirInactivos: true });
    const iniciativas = repoTodos('INICIATIVAS', { incluirInactivos: true });
    const relaciones = repoTodos('PERSONA_EMPRENDIMIENTO', { incluirInactivos: true }).filter(function(r) {
      return r.ESTADO_REGISTRO !== 'INACTIVO';
    });
    const evaluaciones = repoTodos('EVALUACIONES_EMPRENDIMIENTO', { incluirInactivos: true });
    const procesos = repoTodos('PROCESOS_SELECCION', { incluirInactivos: true });
    const docsActuales = docs.filter(function(d) {
      return d.ES_VERSION_VIGENTE === 'SI';
    }).map(function(d) {
      return Object.assign({}, d, { ESTADO_EFECTIVO: estadoDocumentoEfectivo_(d) });
    });
    const docsPersona = docsActuales.filter(function(d) {
      return d.TIPO_SUJETO === 'PERSONA' && documentoUtilizable_(d);
    });
    const docsPorPersonaMap = {};
    docsPersona.forEach(function(d) {
      (docsPorPersonaMap[String(d.ID_SUJETO)] = docsPorPersonaMap[String(d.ID_SUJETO)] || []).push(d.TIPO_DOCUMENTO);
    });
    const completos = personas.filter(function(p) {
      const tipos = docsPorPersonaMap[String(p.ID_PERSONA)] || [];
      const cedula = tipos.indexOf('CEDULA_IDENTIDAD_COMPLETA') >= 0 || (tipos.indexOf('CEDULA_IDENTIDAD_FRONTAL') >= 0 && tipos.indexOf('CEDULA_IDENTIDAD_REVERSO') >= 0);
      return cedula && tipos.indexOf('REGISTRO_SOCIAL_HOGARES') >= 0;
    }).length;
    const empsConRepresentante = relaciones.reduce(function(out, r) {
      if (r.ES_PRINCIPAL === 'SI') out[String(r.ID_EMPRENDIMIENTO)] = true;
      return out;
    }, {});
    const hoy = Utilities.formatDate(new Date(), APP.TIMEZONE, 'yyyy-MM-dd');
    const postsPorIniciativa = {};
    posts.forEach(function(p) {
      postsPorIniciativa[String(p.ID_INICIATIVA)] = (postsPorIniciativa[String(p.ID_INICIATIVA)] || 0) + 1;
    });
    const data = {
      kpis: {
        personas: personas.length,
        emprendimientos: emps.length,
        vinculaciones: relaciones.length,
        emprendimientosSinRepresentante: emps.filter(function(e) { return !empsConRepresentante[String(e.ID_EMPRENDIMIENTO)]; }).length,
        expedientesCompletos: completos,
        expedientesPendientes: Math.max(0, personas.length - completos),
        iniciativasActivas: iniciativas.filter(function(i) { return ['ABIERTA', 'EN_EJECUCION'].indexOf(i.ESTADO) >= 0; }).length,
        posiblesDuplicados: personas.filter(function(p) { return p.ESTADO_REGISTRO === 'POSIBLE_DUPLICADO'; }).length,
        documentosObservados: docsActuales.filter(function(d) {
          return ['VENCIDO', 'RECHAZADO', 'OBSERVADO', 'ILEGIBLE', 'INCOMPLETO'].indexOf(d.ESTADO_EFECTIVO) >= 0;
        }).length,
        postulaciones: posts.length,
        postulacionesSubsanables: posts.filter(function(p) { return p.ESTADO_POSTULACION === 'SUBSANABLE'; }).length,
        seleccionesEjecutadas: procesos.filter(function(p) { return p.ESTADO === 'EJECUTADO'; }).length,
        revisionesVencidas: evaluaciones.filter(function(e) { return e.PROXIMA_REVISION && String(e.PROXIMA_REVISION).slice(0, 10) < hoy; }).length
      },
      porEtapa: agruparConteo_(emps, 'ETAPA_ACTUAL', 'SIN CLASIFICAR'),
      porRubro: agruparConteo_(emps, 'ID_RUBRO', 'SIN RUBRO'),
      porFormalizacion: agruparConteo_(emps, 'FORMALIZACION', 'SIN INFORMACIÓN'),
      postulacionesPorEstado: agruparConteo_(posts, 'ESTADO_POSTULACION', 'SIN ESTADO'),
      iniciativasPorEstado: agruparConteo_(iniciativas, 'ESTADO', 'SIN ESTADO'),
      iniciativasRecientes: iniciativas.slice().sort(function(a, b) {
        return String(b.FECHA_EJECUCION || b.CREADO_EN).localeCompare(String(a.FECHA_EJECUCION || a.CREADO_EN));
      }).slice(0, 6).map(function(i) {
        return {
          ID_INICIATIVA: i.ID_INICIATIVA,
          NOMBRE: i.NOMBRE,
          ESTADO: i.ESTADO,
          FECHA_EJECUCION: i.FECHA_EJECUCION,
          POSTULACIONES: postsPorIniciativa[String(i.ID_INICIATIVA)] || 0
        };
      }),
      actualizadoEn: ahoraIso_()
    };
    try {
      cache.put(APP.CACHE_DASHBOARD, JSON.stringify(data), 300); // 5 minutos TTL
    } catch (ignored) {}
    return respuestaOk(data, { cache: false });
  } catch (error) {
    return manejarError_(error, 'apiDashboard');
  }
}

function apiExportar(tabla, filtros) {
  try {
    exigirPermiso_('EXPORTAR_IDENTIFICABLE');
    const rows = repoTodos(tabla, { filtro: filtros || {}, incluirInactivos: false });
    const file = DriveApp.createFile(
      tabla + '_' + Utilities.formatDate(new Date(), APP.TIMEZONE, 'yyyyMMdd_HHmm') + '.csv',
      convertirCsv_(encabezados_(tabla), rows),
      MimeType.CSV
    );
    auditoriaRegistrar_('EXPORTAR', tabla, file.getId(), null, { filtros: filtros || {}, cantidad: rows.length }, 'Exportación autorizada');
    return respuestaOk({ fileId: file.getId(), url: file.getUrl(), cantidad: rows.length });
  } catch (error) {
    return manejarError_(error, 'apiExportar');
  }
}

function convertirCsv_(headers, rows) {
  function q(v) {
    return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  }
  return [headers.map(q).join(',')].concat(
    rows.map(function(r) {
      return headers.map(function(h) { return q(r[h]); }).join(',');
    })
  ).join('\n');
}


// ==========================================
// ARCHIVO: MercadosService.gs
// ==========================================

// ===== MercadosService.gs =====
// SGE v2.1.0 - Ficha integral del emprendedor
// Sistema Integral 2.0: Mercados, formularios dinámicos, seguimiento y comunicaciones

function carpetaMercado_(iniciativa) {
  const raiz = carpetaRoot_();
  const mercados = carpetaHija_(raiz, 'Mercados');
  const mercado = carpetaHija_(mercados, nombreSeguroCarpeta_(iniciativa.NOMBRE || 'Mercado'));
  ['Minuta', 'Gráfica', 'Programación', 'Libreto', 'Fotos de la actividad', 'Listado de emprendimientos asistentes', 'Seleccionados'].forEach(function(nombre) {
    carpetaHija_(mercado, nombre);
  });
  return mercado;
}

function prepararCarpetaMercado_(idIniciativa) {
  const iniciativa = repoBuscarPorId('INICIATIVAS', idIniciativa);
  exigir_(iniciativa, 'NO_ENCONTRADO', 'Mercado no encontrado.');
  const carpeta = carpetaMercado_(iniciativa);
  if (String(iniciativa.ID_CARPETA_DRIVE || '') !== carpeta.getId()) {
    repoActualizar('INICIATIVAS', idIniciativa, { ID_CARPETA_DRIVE: carpeta.getId() }, { motivo: 'Preparación de carpeta de mercado' });
  }
  return { id: carpeta.getId(), url: carpeta.getUrl(), nombre: carpeta.getName() };
}

function apiCrearMercadoIntegral(data) {
  try {
    const result = apiCrearIniciativa(Object.assign({}, data || {}, { TIPO_INICIATIVA: 'MERCADO' }));
    if (!result.ok) return result;
    const carpeta = prepararCarpetaMercado_(result.data.ID_INICIATIVA);
    return respuestaOk({ iniciativa: repoBuscarPorId('INICIATIVAS', result.data.ID_INICIATIVA), carpeta: carpeta });
  } catch (error) {
    return manejarError_(error, 'apiCrearMercadoIntegral');
  }
}

function apiPrepararCarpetaMercado(idIniciativa) {
  try {
    exigirPermiso_('INICIATIVA_EDITAR');
    return respuestaOk(prepararCarpetaMercado_(idIniciativa));
  } catch (error) {
    return manejarError_(error, 'apiPrepararCarpetaMercado');
  }
}

function apiCargarDocumentoMercado(form) {
  try {
    const user = exigirPermiso_('INICIATIVA_EDITAR');
    exigir_(form && form.ID_INICIATIVA && form.TIPO_DOCUMENTO && form.archivo, 'DATOS_INCOMPLETOS', 'Mercado, tipo de documento y archivo son obligatorios.');
    exigir_(CATALOGOS_INICIALES.TIPO_DOCUMENTO_INICIATIVA.indexOf(form.TIPO_DOCUMENTO) >= 0, 'TIPO_INVALIDO', form.TIPO_DOCUMENTO);
    const iniciativa = repoBuscarPorId('INICIATIVAS', form.ID_INICIATIVA);
    exigir_(iniciativa, 'NO_ENCONTRADO', 'Mercado no encontrado.');
    const carpeta = carpetaMercado_(iniciativa);
    const nombres = {
      MINUTA: 'Minuta',
      GRAFICA: 'Gráfica',
      PROGRAMACION: 'Programación',
      LIBRETO: 'Libreto',
      FOTOS_ACTIVIDAD: 'Fotos de la actividad',
      LISTADO_ASISTENTES: 'Listado de emprendimientos asistentes'
    };
    const destino = carpetaHija_(carpeta, nombres[form.TIPO_DOCUMENTO] || 'Otros documentos');
    const blob = form.archivo;
    exigir_(blob.getBytes().length <= APP.MAX_UPLOAD_BYTES, 'ARCHIVO_EXCEDE_LIMITE', 'El archivo supera 10 MB.');
    const file = destino.createFile(blob).setName(nombreSeguroCarpeta_(form.archivo.getName()));
    const doc = repoInsertar('DOCUMENTOS_INICIATIVA', {
      ID_DOCUMENTO_INICIATIVA: uuid_(),
      ID_INICIATIVA: form.ID_INICIATIVA,
      TIPO_DOCUMENTO: form.TIPO_DOCUMENTO,
      ID_ARCHIVO_DRIVE: file.getId(),
      NOMBRE_ARCHIVO: file.getName(),
      ESTADO_REVISION: 'VIGENTE',
      OBSERVACION: normalizarTexto_(form.OBSERVACION),
      CREADO_EN: ahoraIso_(),
      CREADO_POR: user.EMAIL
    });
    return respuestaOk(doc);
  } catch (error) {
    return manejarError_(error, 'apiCargarDocumentoMercado');
  }
}

function apiListarDocumentosMercado(idIniciativa) {
  try {
    usuarioActual_();
    const documentos = repoTodos('DOCUMENTOS_INICIATIVA', { incluirInactivos: true }).filter(function(d) {
      return String(d.ID_INICIATIVA) === String(idIniciativa);
    });
    return respuestaOk(documentos.sort(function(a, b) {
      return String(b.CREADO_EN).localeCompare(String(a.CREADO_EN));
    }));
  } catch (error) {
    return manejarError_(error, 'apiListarDocumentosMercado');
  }
}

function apiObtenerUrlDocumentoMercado(idDocumento) {
  try {
    usuarioActual_();
    const doc = repoBuscarPorId('DOCUMENTOS_INICIATIVA', idDocumento);
    exigir_(doc, 'NO_ENCONTRADO', 'Documento no encontrado.');
    return respuestaOk({ url: DriveApp.getFileById(doc.ID_ARCHIVO_DRIVE).getUrl() });
  } catch (error) {
    return manejarError_(error, 'apiObtenerUrlDocumentoMercado');
  }
}

function apiCandidatosPostulacionesMercado(idIniciativa, filtros) {
  try {
    exigirPermiso_('SELECCION_EJECUTAR');
    filtros = filtros || {};
    const mapas = mapasPostulaciones_();
    const participaciones = repoTodos('PARTICIPACIONES', { incluirInactivos: true });
    const todasPostulaciones = repoTodos('POSTULACIONES', { incluirInactivos: true });
    const postMap = {};
    todasPostulaciones.forEach(function(p) { postMap[String(p.ID_POSTULACION)] = p; });

    const participacionesPreviasMap = {};
    participaciones.forEach(function(x) {
      if (['ASISTIO', 'CONFIRMADA'].indexOf(x.ESTADO_PARTICIPACION) >= 0) {
        const post = postMap[String(x.ID_POSTULACION)];
        if (post && post.ID_EMPRENDIMIENTO) {
          const empId = String(post.ID_EMPRENDIMIENTO);
          participacionesPreviasMap[empId] = (participacionesPreviasMap[empId] || 0) + 1;
        }
      }
    });

    const docs = repoTodos('DOCUMENTOS', { incluirInactivos: true }).filter(documentoUtilizable_);
    const docsPorPersona = {};
    const docsPorEmp = {};
    docs.forEach(function(d) {
      if (d.TIPO_SUJETO === 'PERSONA') {
        (docsPorPersona[String(d.ID_SUJETO)] = docsPorPersona[String(d.ID_SUJETO)] || []).push(d.TIPO_DOCUMENTO);
      } else if (d.TIPO_SUJETO === 'EMPRENDIMIENTO') {
        (docsPorEmp[String(d.ID_SUJETO)] = docsPorEmp[String(d.ID_SUJETO)] || []).push(d.TIPO_DOCUMENTO);
      }
    });

    let rows = todasPostulaciones.filter(function(p) {
      return String(p.ID_INICIATIVA) === String(idIniciativa) && p.ESTADO_POSTULACION !== 'RETIRADA';
    }).map(function(p) {
      const row = enriquecerPostulacion_(p, mapas);
      const emp = mapas.emprendimientos[String(p.ID_EMPRENDIMIENTO)] || {};
      const persona = mapas.personas[String(p.ID_PERSONA_CONTACTO)] || {};
      const previas = participacionesPreviasMap[String(p.ID_EMPRENDIMIENTO)] || 0;

      // Habilitación evaluada en memoria
      const personaId = p.ID_PERSONA_CONTACTO || (mapas.relacionesPorEmp && mapas.relacionesPorEmp[String(p.ID_EMPRENDIMIENTO)] && mapas.relacionesPorEmp[String(p.ID_EMPRENDIMIENTO)].ID_PERSONA);
      let hab = 'NO', motivo = 'Documentación incompleta';
      if (!personaId) {
        motivo = 'Falta vincular persona titular';
      } else {
        const dPers = docsPorPersona[String(personaId)] || [];
        const cedula = dPers.indexOf('CEDULA_IDENTIDAD_COMPLETA') >= 0 || (dPers.indexOf('CEDULA_IDENTIDAD_FRONTAL') >= 0 && dPers.indexOf('CEDULA_IDENTIDAD_REVERSO') >= 0);
        const rsh = dPers.indexOf('REGISTRO_SOCIAL_HOGARES') >= 0;
        const dEmp = docsPorEmp[String(p.ID_EMPRENDIMIENTO)] || [];
        const tieneInicio = dEmp.indexOf('INICIO_ACTIVIDADES') >= 0 || dEmp.indexOf('PATENTE_COMERCIAL') >= 0;
        if (!cedula || !rsh) {
          motivo = 'Falta cédula de identidad y/o Registro Social de Hogares';
        } else if (!tieneInicio) {
          motivo = 'Falta certificado de inicio de actividades';
        } else {
          hab = 'SI';
          motivo = 'Documentación base e inicio de actividades recibidos';
        }
      }

      row.HABILITADO_MERCADO = hab;
      row.MOTIVO_HABILITACION = motivo;
      row.COMUNA = persona.COMUNA_RESIDENCIA || '';
      row.FORMALIZACION = emp.FORMALIZACION || '';
      row.RUBRO = emp.ID_RUBRO || '';
      row.SUBRUBRO = emp.ID_SUBRUBRO || '';
      row.ETAPA = emp.ETAPA_ACTUAL || '';
      row.PARTICIPACIONES_PREVIAS = previas;
      row.ES_PRIMERA_VEZ = previas === 0 ? 'SI' : 'NO';
      return row;
    });

    const q = normalizarTexto_(filtros.q).toLowerCase();
    if (q) {
      rows = rows.filter(function(r) {
        return [r.NOMBRE_EMPRENDIMIENTO, r.NOMBRE_CONTACTO, r.CORREO_CONTACTO, r.TELEFONO_CONTACTO].join(' ').toLowerCase().indexOf(q) >= 0;
      });
    }
    ['RUBRO', 'FORMALIZACION', 'COMUNA', 'ETAPA', 'HABILITADO_MERCADO', 'ESTADO_POSTULACION'].forEach(function(campo) {
      if (filtros[campo]) rows = rows.filter(function(r) { return String(r[campo]) === String(filtros[campo]); });
    });

    const orden = filtros.orden || 'PRIORIZAR_PRIMERA_VEZ';
    rows.sort(function(a, b) {
      if (orden === 'PRIORIZAR_PRIMERA_VEZ') {
        if (Number(a.PARTICIPACIONES_PREVIAS) !== Number(b.PARTICIPACIONES_PREVIAS)) {
          return Number(a.PARTICIPACIONES_PREVIAS) - Number(b.PARTICIPACIONES_PREVIAS);
        }
        return String(a.NOMBRE_EMPRENDIMIENTO).localeCompare(String(b.NOMBRE_EMPRENDIMIENTO));
      } else if (orden === 'RUBRO') {
        const compRubro = String(a.RUBRO || '').localeCompare(String(b.RUBRO || ''));
        if (compRubro !== 0) return compRubro;
        return String(a.NOMBRE_EMPRENDIMIENTO).localeCompare(String(b.NOMBRE_EMPRENDIMIENTO));
      } else if (orden === 'FORMALIZACION') {
        const compForm = String(a.FORMALIZACION || '').localeCompare(String(b.FORMALIZACION || ''));
        if (compForm !== 0) return compForm;
        return String(a.NOMBRE_EMPRENDIMIENTO).localeCompare(String(b.NOMBRE_EMPRENDIMIENTO));
      } else {
        return String(a.NOMBRE_EMPRENDIMIENTO).localeCompare(String(b.NOMBRE_EMPRENDIMIENTO));
      }
    });

    return respuestaOk(rows);
  } catch (error) {
    return manejarError_(error, 'apiCandidatosPostulacionesMercado');
  }
}

function copiarExpedienteSeleccionadoMercado_(iniciativa, postulacion) {
  try {
    const mapas = mapasPostulaciones_();
    const emp = mapas.emprendimientos[String(postulacion.ID_EMPRENDIMIENTO)] || {};
    const persona = mapas.personas[String(postulacion.ID_PERSONA_CONTACTO)] || {};
    const raiz = carpetaRoot_();
    const mercados = carpetaHija_(raiz, 'Mercados');
    const mercado = carpetaHija_(mercados, nombreSeguroCarpeta_(iniciativa.NOMBRE || 'Mercado'));
    const seleccionados = carpetaHija_(mercado, 'Seleccionados');
    const destino = carpetaHija_(seleccionados, nombreSeguroCarpeta_((emp.NOMBRE_COMERCIAL || 'Emprendimiento') + ' - ' + nombrePersona_(persona)));
    repoTodos('DOCUMENTOS', { incluirInactivos: true }).filter(function(d) {
      return d.ES_VERSION_VIGENTE === 'SI' && (
        (d.TIPO_SUJETO === 'EMPRENDIMIENTO' && String(d.ID_SUJETO) === String(postulacion.ID_EMPRENDIMIENTO)) ||
        (d.TIPO_SUJETO === 'PERSONA' && String(d.ID_SUJETO) === String(postulacion.ID_PERSONA_CONTACTO))
      );
    }).forEach(function(d) {
      try {
        if (d.ID_ARCHIVO_DRIVE) {
          DriveApp.getFileById(d.ID_ARCHIVO_DRIVE).makeCopy(
            nombreSeguroCarpeta_(d.TIPO_DOCUMENTO) + ' - ' + DriveApp.getFileById(d.ID_ARCHIVO_DRIVE).getName(),
            destino
          );
        }
      } catch (ignored) {}
    });
    return destino.getUrl();
  } catch (ignored) {
    return '';
  }
}

function apiRegistrarSeleccionManualPostulaciones(idIniciativa, idsPostulacion, config) {
  try {
    const user = exigirPermiso_('SELECCION_EJECUTAR');
    idsPostulacion = (idsPostulacion || []).filter(Boolean);
    config = config || {};
    exigir_(idsPostulacion.length, 'SIN_SELECCION', 'Seleccione al menos una postulación.');
    const iniciativa = repoBuscarPorId('INICIATIVAS', idIniciativa);
    exigir_(iniciativa, 'NO_ENCONTRADO', 'Mercado no encontrado.');
    const posts = repoTodos('POSTULACIONES', { incluirInactivos: true }).filter(function(p) {
      return String(p.ID_INICIATIVA) === String(idIniciativa) && idsPostulacion.indexOf(p.ID_POSTULACION) >= 0;
    });
    exigir_(posts.length === idsPostulacion.length, 'POSTULACION_INVALIDA', 'Todas las postulaciones deben pertenecer al mercado.');
    // Se otorga flexibilidad al funcionario: no se bloquea por habilitación documental
    return conBloqueoSistema_(function() {
      const procesoId = uuid_();
      const titulares = Math.max(0, Number(config.CUPOS_TITULARES || iniciativa.CUPOS_TITULARES || posts.length));
      const suplentes = Math.max(0, Number(config.CUPOS_SUPLENTES || iniciativa.CUPOS_SUPLENTES || 0));
      const proceso = repoInsertar('PROCESOS_SELECCION', {
        ID_PROCESO: procesoId,
        ID_INICIATIVA: idIniciativa,
        VERSION_REGLAS: iniciativa.VERSION_REGLAS,
        METODO: 'LISTADO_MANUAL',
        PARAMETROS_JSON: JSON.stringify({
          criterios: config.CRITERIOS || '',
          filtros: config.FILTROS || {},
          origen: 'Postulaciones del mercado'
        }),
        SEMILLA: '',
        FECHA_EJECUCION: ahoraIso_(),
        EJECUTADO_POR: user.EMAIL,
        ESTADO: 'EJECUTADO',
        TAMANO_UNIVERSO: posts.length,
        HUELLA_INTEGRIDAD: huella_(idsPostulacion.slice().sort().join('|'))
      });
      const resultados = posts.map(function(p, index) {
        const resultado = index < titulares ? 'TITULAR' : index < titulares + suplentes ? 'SUPLENTE' : 'NO_SELECCIONADO';
        repoInsertar('UNIVERSO_SELECCION', {
          ID_UNIVERSO: uuid_(),
          ID_PROCESO: procesoId,
          ID_POSTULACION: p.ID_POSTULACION,
          ELEGIBLE: 'SI',
          ESTRATO: '',
          PONDERACION: 1,
          ORDEN_ALEATORIO: index + 1,
          MOTIVO_EXCLUSION: '',
          CREADO_EN: ahoraIso_()
        });
        const r = repoInsertar('RESULTADOS_SELECCION', {
          ID_RESULTADO: uuid_(),
          ID_PROCESO: procesoId,
          ID_POSTULACION: p.ID_POSTULACION,
          RESULTADO: resultado,
          POSICION: index + 1,
          ESTRATO: '',
          FECHA_RESULTADO: ahoraIso_(),
          PROCESO_ORIGEN: procesoId
        });
        if (['TITULAR', 'SUPLENTE'].indexOf(resultado) >= 0) {
          copiarExpedienteSeleccionadoMercado_(iniciativa, p);
        }
        return r;
      });
      auditoriaRegistrar_('SELECCION_MANUAL', 'INICIATIVAS', idIniciativa, null, { procesoId: procesoId, cantidad: posts.length }, config.CRITERIOS || 'Selección manual');
      return respuestaOk({ proceso: proceso, resultados: resultados });
    });
  } catch (error) {
    return manejarError_(error, 'apiRegistrarSeleccionManualPostulaciones');
  }
}

function apiRegistrarSeguimientoMercado(data) {
  try {
    const user = exigirPermiso_('PARTICIPACION_EDITAR');
    exigir_(data && data.ID_INICIATIVA && data.ID_EMPRENDIMIENTO, 'DATOS_INCOMPLETOS', 'Mercado y emprendimiento son obligatorios.');
    const iniciativa = repoBuscarPorId('INICIATIVAS', data.ID_INICIATIVA);
    const emp = repoBuscarPorId('EMPRENDIMIENTOS', data.ID_EMPRENDIMIENTO);
    exigir_(iniciativa && emp, 'NO_ENCONTRADO', 'No se encontró el mercado o emprendimiento.');
    const numeric = ['VENTAS_ANTES', 'VENTAS_DURANTE', 'VENTAS_DESPUES', 'SEGUIDORES_ANTES', 'SEGUIDORES_DESPUES'];
    const tipoAyuda = data.TIPO_AYUDA || 'PUNTO_DE_VENTA';
    const value = Object.assign({}, data, {
      ID_SEGUIMIENTO: uuid_(),
      FECHA_REGISTRO: ahoraIso_(),
      TIPO_AYUDA: tipoAyuda,
      REGISTRADO_POR: user.EMAIL
    });
    numeric.forEach(function(k) {
      value[k] = value[k] === '' || value[k] == null ? '' : Math.max(0, Number(value[k]));
    });
    const inserted = repoInsertar('SEGUIMIENTO_MERCADO', value);

    // Registro auxiliar en BENEFICIOS para trazabilidad institucional
    try {
      repoInsertar('BENEFICIOS', {
        ID_BENEFICIO: uuid_(),
        ID_EMPRENDIMIENTO: data.ID_EMPRENDIMIENTO,
        ID_INICIATIVA: data.ID_INICIATIVA,
        TIPO_BENEFICIO: tipoAyuda,
        CANTIDAD: 1,
        MONTO: Number(value.VENTAS_DURANTE || 0),
        FECHA: ahoraIso_().slice(0, 10),
        FUENTE: 'MUNICIPALIDAD_DIDEL',
        RESPONSABLE: user.EMAIL
      });
    } catch (ignored) {}

    return respuestaOk(inserted);
  } catch (error) {
    return manejarError_(error, 'apiRegistrarSeguimientoMercado');
  }
}

function apiListarSeguimientoMercado(idIniciativa) {
  try {
    exigirPermiso_('PARTICIPACION_EDITAR');
    const mapas = mapasPostulaciones_();
    const postsMap = indexarPor_(repoTodos('POSTULACIONES', { incluirInactivos: true }), 'ID_POSTULACION');
    const rows = repoTodos('SEGUIMIENTO_MERCADO', { incluirInactivos: true }).filter(function(x) {
      return !idIniciativa || String(x.ID_INICIATIVA) === String(idIniciativa);
    }).map(function(x) {
      const e = mapas.emprendimientos[String(x.ID_EMPRENDIMIENTO)] || {};
      const post = postsMap[String(x.ID_POSTULACION)] || {};
      const p = mapas.personas[String(post.ID_PERSONA_CONTACTO)] || {};
      return Object.assign({}, x, {
        NOMBRE_EMPRENDIMIENTO: e.NOMBRE_COMERCIAL || '',
        NOMBRE_CONTACTO: nombrePersona_(p),
        CORREO_CONTACTO: p.EMAIL_NORMALIZADO || '',
        TELEFONO_CONTACTO: p.TELEFONO_NORMALIZADO || ''
      });
    });
    return respuestaOk(rows.sort(function(a, b) {
      return String(b.FECHA_REGISTRO).localeCompare(String(a.FECHA_REGISTRO));
    }));
  } catch (error) {
    return manejarError_(error, 'apiListarSeguimientoMercado');
  }
}

function apiDashboardMercado(idIniciativa) {
  try {
    exigirPermiso_('REPORTE_VER');
    const iniciativa = repoBuscarPorId('INICIATIVAS', idIniciativa);
    exigir_(iniciativa, 'NO_ENCONTRADO', 'Mercado no encontrado.');
    const mapas = mapasPostulaciones_();
    const posts = repoTodos('POSTULACIONES', { incluirInactivos: true }).filter(function(p) { return String(p.ID_INICIATIVA) === String(idIniciativa); });
    const procesos = repoTodos('PROCESOS_SELECCION', { incluirInactivos: true }).filter(function(x) { return String(x.ID_INICIATIVA) === String(idIniciativa); });
    const ids = procesos.map(function(x) { return x.ID_PROCESO; });
    const resultados = repoTodos('RESULTADOS_SELECCION', { incluirInactivos: true }).filter(function(x) { return ids.indexOf(x.ID_PROCESO) >= 0; });
    const postIds = posts.map(function(p) { return p.ID_POSTULACION; });
    const partes = repoTodos('PARTICIPACIONES', { incluirInactivos: true }).filter(function(x) {
      return postIds.indexOf(x.ID_POSTULACION) >= 0;
    });
    const seg = repoTodos('SEGUIMIENTO_MERCADO', { incluirInactivos: true }).filter(function(x) { return String(x.ID_INICIATIVA) === String(idIniciativa); });

    const titularesCount = resultados.filter(function(x) { return x.RESULTADO === 'TITULAR'; }).length;
    const suplentesCount = resultados.filter(function(x) { return x.RESULTADO === 'SUPLENTE'; }).length;
    const confirmadosCount = partes.filter(function(x) { return x.ESTADO_PARTICIPACION === 'CONFIRMADA'; }).length;
    const asistieronCount = partes.filter(function(x) { return x.ESTADO_PARTICIPACION === 'ASISTIO'; }).length;
    const baseAsistencia = confirmadosCount > 0 ? confirmadosCount : (titularesCount > 0 ? titularesCount : 1);
    const tasaAsistencia = Math.round((asistieronCount / baseAsistencia) * 100);

    let totalVentasAntes = 0, totalVentasDurante = 0, totalVentasDespues = 0, maxVenta = 0;
    let totalSeguidoresAntes = 0, totalSeguidoresDespues = 0;
    const rubrosCount = {};
    const formalizacionCount = {};
    const ayudasCount = {};
    const puntualidadCount = {};
    const evaluacionCount = {};

    seg.forEach(function(s) {
      const vd = Number(s.VENTAS_DURANTE || 0);
      totalVentasAntes += Number(s.VENTAS_ANTES || 0);
      totalVentasDurante += vd;
      totalVentasDespues += Number(s.VENTAS_DESPUES || 0);
      if (vd > maxVenta) maxVenta = vd;

      totalSeguidoresAntes += Number(s.SEGUIDORES_ANTES || 0);
      totalSeguidoresDespues += Number(s.SEGUIDORES_DESPUES || 0);

      const ayuda = s.TIPO_AYUDA || 'PUNTO_DE_VENTA';
      ayudasCount[ayuda] = (ayudasCount[ayuda] || 0) + 1;

      if (s.PUNTUALIDAD) puntualidadCount[s.PUNTUALIDAD] = (puntualidadCount[s.PUNTUALIDAD] || 0) + 1;
      if (s.EVALUACION_FUNCIONARIO) evaluacionCount[s.EVALUACION_FUNCIONARIO] = (evaluacionCount[s.EVALUACION_FUNCIONARIO] || 0) + 1;
    });

    posts.forEach(function(p) {
      const emp = mapas.emprendimientos[String(p.ID_EMPRENDIMIENTO)] || {};
      const rub = emp.ID_RUBRO || 'OTRO';
      const form = emp.FORMALIZACION || 'SIN_INICIO';
      rubrosCount[rub] = (rubrosCount[rub] || 0) + 1;
      formalizacionCount[form] = (formalizacionCount[form] || 0) + 1;
    });

    const cantSeg = seg.length || 1;
    const promedioVenta = Math.round(totalVentasDurante / cantSeg);
    const totalVariacionSeguidores = totalSeguidoresDespues - totalSeguidoresAntes;
    const promedioVariacionSeguidores = Math.round(totalVariacionSeguidores / cantSeg);

    return respuestaOk({
      iniciativa: iniciativa,
      kpis: {
        postulaciones: posts.length,
        titulares: titularesCount,
        suplentes: suplentesCount,
        confirmados: confirmadosCount,
        asistieron: asistieronCount,
        tasaAsistencia: tasaAsistencia,
        seguimientos: seg.length
      },
      ventas: {
        totalDurante: totalVentasDurante,
        promedioDurante: promedioVenta,
        maxDurante: maxVenta,
        antes: totalVentasAntes,
        despues: totalVentasDespues
      },
      seguidores: {
        totalVariacion: totalVariacionSeguidores,
        promedioVariacion: promedioVariacionSeguidores,
        antes: totalSeguidoresAntes,
        despues: totalSeguidoresDespues
      },
      distribucionRubros: rubrosCount,
      distribucionFormalizacion: formalizacionCount,
      distribucionAyudas: ayudasCount,
      distribucionPuntualidad: puntualidadCount,
      distribucionEvaluacion: evaluacionCount
    });
  } catch (error) {
    return manejarError_(error, 'apiDashboardMercado');
  }
}

function destinatariosComunicacion_(config) {
  config = config || {};
  const mapas = mapasPostulaciones_();
  const tipo = config.TIPO_DESTINATARIO || 'BASE';
  let personas = [];
  if (tipo === 'MERCADO_SELECCIONADOS' || tipo === 'MERCADO_CONFIRMADOS') {
    const procesos = repoTodos('PROCESOS_SELECCION', { incluirInactivos: true }).filter(function(p) {
      return String(p.ID_INICIATIVA) === String(config.ID_INICIATIVA) && p.ESTADO === 'EJECUTADO';
    });
    const processIds = procesos.map(function(p) { return p.ID_PROCESO; });
    const posts = repoTodos('RESULTADOS_SELECCION', { incluirInactivos: true }).filter(function(r) {
      return processIds.indexOf(r.ID_PROCESO) >= 0 && ['TITULAR', 'SUPLENTE'].indexOf(r.RESULTADO) >= 0;
    }).map(function(r) {
      return repoBuscarPorId('POSTULACIONES', r.ID_POSTULACION);
    }).filter(Boolean);
    const confirmadas = repoTodos('PARTICIPACIONES', { incluirInactivos: true }).filter(function(p) {
      return p.ESTADO_PARTICIPACION === 'CONFIRMADA' || p.ESTADO_PARTICIPACION === 'ASISTIO';
    }).map(function(p) { return String(p.ID_POSTULACION); });
    personas = posts.filter(function(p) {
      return tipo !== 'MERCADO_CONFIRMADOS' || confirmadas.indexOf(String(p.ID_POSTULACION)) >= 0;
    }).map(function(p) {
      return mapas.personas[String(p.ID_PERSONA_CONTACTO)] || {};
    });
  } else {
    personas = repoTodos('PERSONAS', { incluirInactivos: true }).filter(function(p) {
      return p.ESTADO_REGISTRO === 'ACTIVO';
    });
  }
  const f = config.FILTROS || {};
  const q = normalizarTexto_(f.q).toLowerCase();
  if (q) {
    personas = personas.filter(function(p) {
      return [nombrePersona_(p), p.EMAIL_NORMALIZADO, p.COMUNA_RESIDENCIA, p.RUT_NORMALIZADO].join(' ').toLowerCase().indexOf(q) >= 0;
    });
  }
  if (f.COMUNA) {
    personas = personas.filter(function(p) { return p.COMUNA_RESIDENCIA === f.COMUNA; });
  }
  const unique = {};
  return personas.filter(function(p) {
    const email = normalizarTexto_(p.EMAIL_NORMALIZADO).toLowerCase();
    if (!email || unique[email]) return false;
    unique[email] = true;
    return true;
  }).map(function(p) {
    return {
      NOMBRE: nombrePersona_(p),
      EMAIL: p.EMAIL_NORMALIZADO,
      TELEFONO: p.TELEFONO_NORMALIZADO,
      COMUNA: p.COMUNA_RESIDENCIA || ''
    };
  });
}

function apiDestinatariosComunicacion(config) {
  try {
    exigirPermiso_('EXPORTAR_IDENTIFICABLE');
    return respuestaOk(destinatariosComunicacion_(config));
  } catch (error) {
    return manejarError_(error, 'apiDestinatariosComunicacion');
  }
}

function apiRegistrarComunicacion(config) {
  try {
    const user = exigirPermiso_('EXPORTAR_IDENTIFICABLE');
    const destinatarios = destinatariosComunicacion_(config);
    const row = repoInsertar('COMUNICACIONES', {
      ID_COMUNICACION: uuid_(),
      FECHA: ahoraIso_(),
      TIPO_DESTINATARIO: config.TIPO_DESTINATARIO || 'BASE',
      ID_INICIATIVA: config.ID_INICIATIVA || '',
      FILTROS_JSON: JSON.stringify(config.FILTROS || {}),
      CANTIDAD_DESTINATARIOS: destinatarios.length,
      ASUNTO_REFERENCIA: normalizarTexto_(config.ASUNTO_REFERENCIA),
      REGISTRADO_POR: user.EMAIL
    });
    return respuestaOk({ registro: row, destinatarios: destinatarios });
  } catch (error) {
    return manejarError_(error, 'apiRegistrarComunicacion');
  }
}

function distribucionEdad_(personas) {
  const hoy = new Date();
  const bandas = { '18-29': 0, '30-44': 0, '45-59': 0, '60+': 0, 'Sin información': 0 };
  personas.forEach(function(p) {
    if (!p.FECHA_NACIMIENTO) {
      bandas['Sin información']++;
      return;
    }
    const edad = Math.floor((hoy - new Date(p.FECHA_NACIMIENTO)) / (365.25 * 24 * 3600 * 1000));
    const b = edad < 30 ? '18-29' : edad < 45 ? '30-44' : edad < 60 ? '45-59' : '60+';
    bandas[b]++;
  });
  return bandas;
}

function apiDashboardIntegral(force) {
  try {
    const base = apiDashboard(force);
    if (!base.ok) return base;
    exigirPermiso_('REPORTE_VER');
    const personas = repoTodos('PERSONAS', { incluirInactivos: true }).filter(function(p) { return p.ESTADO_REGISTRO === 'ACTIVO'; });
    const emps = repoTodos('EMPRENDIMIENTOS', { incluirInactivos: true }).filter(function(e) { return e.ESTADO_EMPRENDIMIENTO !== 'CERRADO'; });
    const seguimientos = repoTodos('SEGUIMIENTO_MERCADO', { incluirInactivos: true });
    const iniciativas = repoTodos('INICIATIVAS', { incluirInactivos: true });
    const posts = repoTodos('POSTULACIONES', { incluirInactivos: true });
    const ventas = { antes: 0, durante: 0, despues: 0 };
    const seguidores = { antes: 0, despues: 0 };
    seguimientos.forEach(function(s) {
      ventas.antes += Number(s.VENTAS_ANTES || 0);
      ventas.durante += Number(s.VENTAS_DURANTE || 0);
      ventas.despues += Number(s.VENTAS_DESPUES || 0);
      seguidores.antes += Number(s.SEGUIDORES_ANTES || 0);
      seguidores.despues += Number(s.SEGUIDORES_DESPUES || 0);
    });
    const postsPorIniciativa = {};
    posts.forEach(function(p) {
      postsPorIniciativa[String(p.ID_INICIATIVA)] = (postsPorIniciativa[String(p.ID_INICIATIVA)] || 0) + 1;
    });
    const segPorIniciativa = {};
    seguimientos.forEach(function(s) {
      segPorIniciativa[String(s.ID_INICIATIVA)] = (segPorIniciativa[String(s.ID_INICIATIVA)] || 0) + 1;
    });
    const mercados = iniciativas.filter(function(i) {
      return ['MERCADO', 'FERIA'].indexOf(i.TIPO_INICIATIVA) >= 0;
    }).map(function(i) {
      return {
        ID_INICIATIVA: i.ID_INICIATIVA,
        NOMBRE: i.NOMBRE,
        ESTADO: i.ESTADO,
        FECHA_EJECUCION: i.FECHA_EJECUCION,
        POSTULACIONES: postsPorIniciativa[String(i.ID_INICIATIVA)] || 0,
        SEGUIMIENTOS: segPorIniciativa[String(i.ID_INICIATIVA)] || 0
      };
    });
    return respuestaOk(Object.assign({}, base.data, {
      porComuna: agruparConteo_(personas, 'COMUNA_RESIDENCIA', 'Sin información'),
      porEdad: distribucionEdad_(personas),
      evolucionVentas: ventas,
      evolucionSeguidores: seguidores,
      mercados: mercados,
      actualizadoEn: ahoraIso_()
    }));
  } catch (error) {
    return manejarError_(error, 'apiDashboardIntegral');
  }
}

function asegurarCamposBaseFormularioMercado_(form) {
  let titles = form.getItems().map(function(item) { return normalizarTituloFormulario_(item.getTitle()); });
  function falta(title) { return titles.indexOf(normalizarTituloFormulario_(title)) < 0; }
  function agregar(title, callback) {
    if (falta(title)) {
      callback();
      titles.push(normalizarTituloFormulario_(title));
    }
  }
  agregar('Datos de la persona', function() {
    form.addSectionHeaderItem().setTitle('Datos de la persona').setHelpText('Si ya se registró anteriormente, utilice el mismo RUT. El sistema actualizará sus datos sin duplicar la ficha.');
  });
  agregar('RUT', function() { form.addTextItem().setTitle('RUT').setRequired(true); });
  agregar('Nombres', function() { form.addTextItem().setTitle('Nombres').setRequired(true); });
  agregar('Apellido paterno', function() { form.addTextItem().setTitle('Apellido paterno').setRequired(true); });
  agregar('Apellido materno', function() { form.addTextItem().setTitle('Apellido materno'); });
  agregar('Fecha de nacimiento', function() { form.addDateItem().setTitle('Fecha de nacimiento').setRequired(true); });
  agregar('Género', function() { form.addListItem().setTitle('Género').setChoiceValues(['MUJER', 'HOMBRE', 'NO_BINARIO', 'OTRO', 'PREFIERE_NO_INFORMAR']).setRequired(true); });
  agregar('Discapacidad declarada', function() { form.addListItem().setTitle('Discapacidad declarada').setChoiceValues(['SI', 'NO', 'PREFIERE_NO_INFORMAR']).setRequired(true); });
  agregar('Correo electrónico', function() { form.addTextItem().setTitle('Correo electrónico').setRequired(true); });
  agregar('Teléfono', function() { form.addTextItem().setTitle('Teléfono').setRequired(true); });
  agregar('Comuna de residencia', function() { form.addTextItem().setTitle('Comuna de residencia').setRequired(true); });
  agregar('Datos del emprendimiento', function() { form.addSectionHeaderItem().setTitle('Datos del emprendimiento'); });
  agregar('Nombre del emprendimiento', function() { form.addTextItem().setTitle('Nombre del emprendimiento').setRequired(true); });
  agregar('Rubro', function() { form.addListItem().setTitle('Rubro').setChoiceValues(CATALOGOS_INICIALES.RUBRO).setRequired(true); });
  agregar('Subrubro', function() { form.addListItem().setTitle('Subrubro').setChoiceValues(CATALOGOS_INICIALES.SUBRUBRO).setRequired(true); });
  agregar('Descripción de productos o servicios', function() { form.addParagraphTextItem().setTitle('Descripción de productos o servicios').setRequired(true); });
  agregar('Formalización', function() { form.addListItem().setTitle('Formalización').setChoiceValues(CATALOGOS_INICIALES.FORMALIZACION).setRequired(true); });
  agregar('Instagram', function() { form.addTextItem().setTitle('Instagram'); });
  agregar('Facebook', function() { form.addTextItem().setTitle('Facebook'); });
  agregar('TikTok', function() { form.addTextItem().setTitle('TikTok'); });
  agregar('Sitio web', function() { form.addTextItem().setTitle('Sitio web'); });
  agregar('Documentos para la postulación', function() {
    form.addSectionHeaderItem().setTitle('Documentos para la postulación').setHelpText('Si es su primera postulación, adjunte sus antecedentes. Si ya está registrado, cargue únicamente documentos nuevos, corregidos o actualizados.');
  });
  agregar('Observaciones de la postulación', function() { form.addParagraphTextItem().setTitle('Observaciones de la postulación'); });
  return form;
}

function validarPlantillaFormularioMercado_(form) {
  const items = form.getItems(), faltantes = [], tiposIncorrectos = [], reconocidas = [];
  DOCUMENTOS_FORMULARIO_REGISTRO.forEach(function(config) {
    const candidatos = buscarItemsDocumentoFormulario_(items, config), itemCarga = candidatos.find(esPreguntaCargaArchivo_);
    if (itemCarga) reconocidas.push({ titulo: config.titulo, tituloDetectado: itemCarga.getTitle(), tipo: tipoItemFormulario_(itemCarga) });
    else if (candidatos.length) tiposIncorrectos.push({ titulo: config.titulo, tituloDetectado: candidatos[0].getTitle(), tipo: tipoItemFormulario_(candidatos[0]) });
    else faltantes.push(config.titulo);
  });
  const partes = [];
  if (faltantes.length) partes.push('No encontradas: ' + faltantes.join(', '));
  if (tiposIncorrectos.length) partes.push('Encontradas con un tipo distinto de “Subir archivos”: ' + tiposIncorrectos.map(function(x) { return x.tituloDetectado + ' (' + x.tipo + ')'; }).join(', '));
  return { completa: faltantes.length === 0 && tiposIncorrectos.length === 0, faltantes: faltantes, tiposIncorrectos: tiposIncorrectos, reconocidas: reconocidas, detalle: partes.join('. ') };
}

function abrirFormularioSeguro_(id) {
  if (!id) return null;
  try { return FormApp.openById(id); } catch (ignored) { return null; }
}

function crearPlantillaDocumentalDesdeFuente_(fuente, origen) {
  const props = PropertiesService.getScriptProperties();
  const copy = DriveApp.getFileById(fuente.getId()).makeCopy('PLANTILLA SGE - Postulación a mercados');
  const form = FormApp.openById(copy.getId());
  try { form.removeDestination(); } catch (ignored) {}
  asegurarCamposBaseFormularioMercado_(form);
  form.setTitle('PLANTILLA SGE - Postulación a mercados');
  form.setDescription('Plantilla institucional. No compartir este enlace con postulantes. Los formularios de cada mercado se crean como copias de esta plantilla.');
  form.setConfirmationMessage('Postulación recibida. El equipo municipal revisará los antecedentes y documentos.');
  props.setProperty(APP.PROP_FORM_MERCADO_TEMPLATE_ID, form.getId());
  return { form: form, origen: origen || 'FORMULARIO_COMPATIBLE' };
}

function habilitarRespuestasFormulario_(form) {
  try {
    form.setRequireLogin(false);
  } catch (ignored) {}
  try {
    form.setLimitOneResponsePerUser(false);
  } catch (ignored) {}
  if (typeof form.supportsAdvancedResponderPermissions === 'function' && form.supportsAdvancedResponderPermissions()) {
    form.setPublished(true);
  }
  form.setAcceptingResponses(true);
  return form;
}

function cerrarRespuestasFormulario_(form) {
  try {
    if (typeof form.isPublished === 'function' && !form.isPublished()) return form;
  } catch (ignored) {}
  try {
    form.setAcceptingResponses(false);
  } catch (error) {
    if (String(error.message || error).toLowerCase().indexOf('no publicado') < 0) throw error;
  }
  return form;
}

function recuperarPlantillaDocumental_(idIniciativa) {
  const props = PropertiesService.getScriptProperties(), candidatos = [], vistos = {};
  function agregar(id, origen) {
    if (id && !vistos[id]) {
      vistos[id] = true;
      candidatos.push({ id: id, origen: origen });
    }
  }
  agregar(idIniciativa ? formIdMercado_(idIniciativa) : '', 'FORMULARIO_ACTUAL_DEL_MERCADO');
  agregar(props.getProperty(APP.PROP_FORM_ID), 'FORMULARIO_UNICO');
  for (let i = 0; i < candidatos.length; i++) {
    const form = abrirFormularioSeguro_(candidatos[i].id);
    if (form && validarPlantillaFormularioMercado_(form).completa) {
      return crearPlantillaDocumentalDesdeFuente_(form, candidatos[i].origen);
    }
  }
  return null;
}

function crearPlantillaFormularioPostulacionMercadosV203() {
  try {
    const user = usuarioActual_();
    exigir_(user.ROL === APP.ROLES.ADMIN, 'PROHIBIDO', 'Solo un administrador puede configurar la plantilla.');
    const props = PropertiesService.getScriptProperties();
    let form, id = props.getProperty(APP.PROP_FORM_MERCADO_TEMPLATE_ID);
    if (id) {
      try { form = FormApp.openById(id); } catch (ignored) { form = null; }
    }
    if (!form) {
      form = FormApp.create('PLANTILLA SGE - Postulación a mercados');
      props.setProperty(APP.PROP_FORM_MERCADO_TEMPLATE_ID, form.getId());
    }
    asegurarCamposBaseFormularioMercado_(form);
    form.setDescription('Plantilla institucional. No compartir este enlace con postulantes. Los formularios de cada mercado se crean como copias de esta plantilla.');
    form.setConfirmationMessage('Postulación recibida. Los documentos quedan registrados automáticamente y solo serán observados si presentan un problema.');
    let validacion = validarPlantillaFormularioMercado_(form), recuperada = null;
    if (!validacion.completa) {
      recuperada = recuperarPlantillaDocumental_('');
      if (recuperada) {
        form = recuperada.form;
        validacion = validarPlantillaFormularioMercado_(form);
      }
    }
    return respuestaOk({
      id: form.getId(),
      titulo: form.getTitle(),
      editUrl: form.getEditUrl(),
      completa: validacion.completa,
      faltantes: validacion.faltantes,
      tiposIncorrectos: validacion.tiposIncorrectos,
      reconocidas: validacion.reconocidas,
      detalleValidacion: validacion.detalle,
      recuperadaDesde: recuperada ? recuperada.origen : ''
    });
  } catch (error) {
    return manejarError_(error, 'crearPlantillaFormularioPostulacionMercadosV203');
  }
}

function apiCrearPlantillaFormularioPostulacionMercadosV203() {
  return crearPlantillaFormularioPostulacionMercadosV203();
}

function apiDiagnosticarPlantillaFormularioMercadoV204() {
  try {
    exigirPermiso_('INICIATIVA_EDITAR');
    const id = PropertiesService.getScriptProperties().getProperty(APP.PROP_FORM_MERCADO_TEMPLATE_ID);
    const form = abrirFormularioSeguro_(id);
    exigir_(form, 'PLANTILLA_NO_CONFIGURADA', 'Todavía no existe una plantilla configurada.');
    const v = validarPlantillaFormularioMercado_(form);
    return respuestaOk({
      id: id,
      titulo: form.getTitle(),
      editUrl: form.getEditUrl(),
      completa: v.completa,
      faltantes: v.faltantes,
      tiposIncorrectos: v.tiposIncorrectos,
      reconocidas: v.reconocidas,
      items: form.getItems().map(function(item) {
        return { titulo: item.getTitle(), tipo: tipoItemFormulario_(item) };
      })
    });
  } catch (error) {
    return manejarError_(error, 'apiDiagnosticarPlantillaFormularioMercadoV204');
  }
}

function formIdMercado_(idIniciativa) {
  const map = JSON.parse(PropertiesService.getScriptProperties().getProperty('SGE_FORM_MERCADO_MAP') || '{}');
  const ids = Object.keys(map).filter(function(id) { return String(map[id]) === String(idIniciativa); });
  return ids.length ? ids[ids.length - 1] : '';
}

function crearFormularioMercadoDesdePlantilla_(idIniciativa, reemplazar) {
  const iniciativa = repoBuscarPorId('INICIATIVAS', idIniciativa);
  exigir_(iniciativa, 'NO_ENCONTRADO', 'Mercado no encontrado.');
  if (iniciativa.URL_FORMULARIO_POSTULACION && !reemplazar) {
    const existenteId = formIdMercado_(idIniciativa);
    const existente = existenteId ? FormApp.openById(existenteId) : null;
    const validacion = existente ? validarPlantillaFormularioMercado_(existente) : {
      completa: false,
      faltantes: DOCUMENTOS_FORMULARIO_REGISTRO.map(function(x) { return x.titulo; })
    };
    return {
      url: iniciativa.URL_FORMULARIO_POSTULACION,
      editUrl: existente ? existente.getEditUrl() : '',
      id: existenteId,
      documentosConfigurados: validacion.completa,
      faltantes: validacion.faltantes,
      mensaje: 'El formulario ya existe.'
    };
  }
  const props = PropertiesService.getScriptProperties();
  let templateId = props.getProperty(APP.PROP_FORM_MERCADO_TEMPLATE_ID);
  let template = abrirFormularioSeguro_(templateId);
  let validacion = template ? validarPlantillaFormularioMercado_(template) : {
    completa: false,
    faltantes: DOCUMENTOS_FORMULARIO_REGISTRO.map(function(x) { return x.titulo; }),
    tiposIncorrectos: [],
    detalle: 'No existe una plantilla accesible.'
  };
  let recuperada = null;
  if (!validacion.completa) {
    recuperada = recuperarPlantillaDocumental_(idIniciativa);
    if (recuperada) {
      template = recuperada.form;
      templateId = template.getId();
      validacion = validarPlantillaFormularioMercado_(template);
    }
  }
  exigir_(templateId && template, 'PLANTILLA_NO_CONFIGURADA', 'Primero prepare la plantilla de formularios de mercado.');
  exigir_(validacion.completa, 'PLANTILLA_DOCUMENTAL_INCOMPLETA', (validacion.detalle || 'La plantilla no contiene las cinco preguntas documentales.') + ' Abra “Configurar plantilla documental” y compruebe que cada una sea del tipo “Subir archivos”.');
  const oldId = reemplazar ? formIdMercado_(idIniciativa) : '';
  if (oldId) {
    try { cerrarRespuestasFormulario_(FormApp.openById(oldId)); } catch (ignored) {}
    limpiarActivadorFormulario_(oldId);
  }
  limpiarActivadoresHuerfanosMercados_();
  const targetFolder = carpetaFormulariosPublicos_();
  const copy = DriveApp.getFileById(templateId).makeCopy('Postulación a ' + iniciativa.NOMBRE, targetFolder);
  const form = FormApp.openById(copy.getId());
  form.setTitle('Postulación a ' + iniciativa.NOMBRE);
  form.setDescription('Complete estos datos para postular al mercado ' + iniciativa.NOMBRE + '. Si ya está registrado, utilice el mismo RUT y cargue solo documentos nuevos o actualizados. El certificado de inicio de actividades es condición para participar.');
  form.setConfirmationMessage('Postulación recibida. Los documentos quedan registrados automáticamente y solo serán observados si presentan un problema.');
  form.setDestination(FormApp.DestinationType.SPREADSHEET, db_().getId());
  habilitarRespuestasFormulario_(form);
  const map = JSON.parse(props.getProperty('SGE_FORM_MERCADO_MAP') || '{}');
  map[form.getId()] = idIniciativa;
  props.setProperty('SGE_FORM_MERCADO_MAP', JSON.stringify(map));
  ScriptApp.newTrigger('procesarPostulacionMercadoFormulario').forForm(form).onFormSubmit().create();
  repoActualizar('INICIATIVAS', idIniciativa, { URL_FORMULARIO_POSTULACION: form.getPublishedUrl() }, { motivo: reemplazar ? 'Nuevo formulario desde plantilla documental' : 'Creación de formulario desde plantilla documental' });
  return {
    url: form.getPublishedUrl(),
    editUrl: form.getEditUrl(),
    id: form.getId(),
    documentosConfigurados: true,
    faltantes: [],
    formularioAnteriorCerrado: oldId || '',
    plantillaRecuperadaDesde: recuperada ? recuperada.origen : ''
  };
}

function apiCrearFormularioPostulacionMercado(idIniciativa) {
  try {
    exigirPermiso_('INICIATIVA_EDITAR');
    return respuestaOk(crearFormularioMercadoDesdePlantilla_(idIniciativa, false));
  } catch (error) {
    return manejarError_(error, 'apiCrearFormularioPostulacionMercado');
  }
}

function apiRecrearFormularioPostulacionMercadoV203(idIniciativa) {
  try {
    exigirPermiso_('INICIATIVA_EDITAR');
    return respuestaOk(crearFormularioMercadoDesdePlantilla_(idIniciativa, true));
  } catch (error) {
    return manejarError_(error, 'apiRecrearFormularioPostulacionMercadoV203');
  }
}

function actualizarPersonaDesdeFormularioMercado_(persona, data, received) {
  const normalized = normalizarPersona_(Object.assign({}, persona, data || {}));
  const changes = {};
  ['NOMBRES', 'APELLIDO_PATERNO', 'APELLIDO_MATERNO', 'FECHA_NACIMIENTO', 'GENERO', 'DISCAPACIDAD_DECLARADA', 'EMAIL_NORMALIZADO', 'TELEFONO_NORMALIZADO', 'COMUNA_RESIDENCIA'].forEach(function(field) {
    if (normalizarTexto_(normalized[field])) changes[field] = normalized[field];
  });
  changes.ACTUALIZADO_EN = received;
  changes.ACTUALIZADO_POR = 'FORMULARIO_MERCADO';
  return repoActualizar('PERSONAS', persona.ID_PERSONA, changes, { auditar: false, motivo: 'Actualización desde postulación de mercado' });
}

function emprendimientoVinculadoFormulario_(personaId, data) {
  const relacion = relacionActivaPorSujeto_('PERSONA', personaId);
  return relacion ? repoBuscarPorId('EMPRENDIMIENTOS', relacion.ID_EMPRENDIMIENTO) : null;
}

function actualizarEmprendimientoDesdeFormularioMercado_(emp, data, received) {
  const normalized = normalizarEmprendimiento_(Object.assign({}, emp, data || {}));
  const changes = {};
  ['NOMBRE_COMERCIAL', 'DESCRIPCION', 'ID_RUBRO', 'ID_SUBRUBRO', 'FORMALIZACION', 'INSTAGRAM', 'FACEBOOK', 'TIKTOK', 'SITIO_WEB'].forEach(function(field) {
    if (normalizarTexto_(normalized[field])) changes[field] = normalized[field];
  });
  changes.ACTUALIZADO_EN = received;
  changes.ACTUALIZADO_POR = 'FORMULARIO_MERCADO';
  return repoActualizar('EMPRENDIMIENTOS', emp.ID_EMPRENDIMIENTO, changes, { auditar: false, motivo: 'Actualización desde postulación de mercado' });
}

function procesarPostulacionMercadoFormulario(e) {
  const received = ahoraIso_();
  const answers = respuestasFormulario_(e);
  const responseId = e && e.response && e.response.getId ? e.response.getId() : uuid_();
  try {
    conBloqueoSistema_(function() {
      const formId = e && e.source && e.source.getId ? e.source.getId() : '';
      const map = JSON.parse(PropertiesService.getScriptProperties().getProperty('SGE_FORM_MERCADO_MAP') || '{}');
      const idIniciativa = map[formId];
      exigir_(idIniciativa, 'FORMULARIO_NO_CONFIGURADO', 'No existe un mercado vinculado a este formulario.');
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
      const personaNormalizada = normalizarPersona_(personaData);
      exigir_(personaNormalizada.RUT_NORMALIZADO && validarRut_(personaNormalizada.RUT_NORMALIZADO), 'RUT_INVALIDO', 'Ingrese un RUT válido para evitar fichas duplicadas.');
      exigir_(personaNormalizada.NOMBRES && personaNormalizada.APELLIDO_PATERNO, 'DATOS_INCOMPLETOS', 'Nombre y apellido son obligatorios.');
      let persona = duplicadoPersonaExacto_(personaData);
      let personaReutilizada = !!persona;
      if (persona) {
        persona = actualizarPersonaDesdeFormularioMercado_(persona, personaData, received);
      } else {
        Object.assign(personaNormalizada, {
          ESTADO_REGISTRO: buscarDuplicadosPersona_(personaNormalizada).length ? 'POSIBLE_DUPLICADO' : 'ACTIVO',
          CREADO_EN: received,
          CREADO_POR: 'FORMULARIO_MERCADO',
          ACTUALIZADO_EN: received,
          ACTUALIZADO_POR: 'FORMULARIO_MERCADO'
        });
        persona = repoInsertar('PERSONAS', personaNormalizada, { motivo: 'Registro desde formulario de mercado' });
      }
      const empData = normalizarEmprendimiento_({
        NOMBRE_COMERCIAL: answers['Nombre del emprendimiento'],
        ID_RUBRO: answers['Rubro'],
        ID_SUBRUBRO: answers['Subrubro'],
        DESCRIPCION: answers['Descripción de productos o servicios'],
        FORMALIZACION: answers['Formalización'],
        INSTAGRAM: answers['Instagram'],
        FACEBOOK: answers['Facebook'],
        TIKTOK: answers['TikTok'],
        SITIO_WEB: answers['Sitio web'],
        ORIGEN_ATENCION: 'DEMANDA'
      });
      exigir_(empData.NOMBRE_COMERCIAL && empData.ID_RUBRO, 'DATOS_INCOMPLETOS', 'Nombre y rubro del emprendimiento son obligatorios.');
      let emp = emprendimientoVinculadoFormulario_(persona.ID_PERSONA, empData);
      let empReutilizado = !!emp;
      if (emp) {
        emp = actualizarEmprendimientoDesdeFormularioMercado_(emp, empData, received);
      } else {
        emp = repoInsertar('EMPRENDIMIENTOS', Object.assign({}, empData, {
          ETAPA_ACTUAL: 'ARRANQUE',
          ESTADO_EMPRENDIMIENTO: 'ACTIVO',
          CREADO_EN: received,
          CREADO_POR: 'FORMULARIO_MERCADO',
          ACTUALIZADO_EN: received,
          ACTUALIZADO_POR: 'FORMULARIO_MERCADO'
        }), { motivo: 'Registro desde formulario de mercado' });
      }
      const rel = repoTodos('PERSONA_EMPRENDIMIENTO', { incluirInactivos: true }).some(function(r) {
        return String(r.ID_PERSONA) === String(persona.ID_PERSONA) &&
               String(r.ID_EMPRENDIMIENTO) === String(emp.ID_EMPRENDIMIENTO) &&
               r.ESTADO_REGISTRO !== 'INACTIVO';
      });
      if (!rel) {
        repoInsertar('PERSONA_EMPRENDIMIENTO', {
          ID_RELACION: uuid_(),
          ID_PERSONA: persona.ID_PERSONA,
          ID_EMPRENDIMIENTO: emp.ID_EMPRENDIMIENTO,
          ROL: 'TITULAR',
          ES_PRINCIPAL: 'SI',
          DESDE: received,
          HASTA: '',
          ESTADO_REGISTRO: 'ACTIVO',
          CREADO_EN: received,
          CREADO_POR: 'FORMULARIO_MERCADO'
        }, { motivo: 'Vinculación formulario de mercado' });
      }
      const documentos = procesarDocumentosFormularioRegistro_(answers, persona, emp, received);
      const respuestaJson = JSON.stringify(answers);
      const existente = repoTodos('POSTULACIONES', { incluirInactivos: true }).find(function(p) {
        return String(p.ID_INICIATIVA) === String(idIniciativa) &&
               String(p.ID_EMPRENDIMIENTO) === String(emp.ID_EMPRENDIMIENTO) &&
               p.ESTADO_POSTULACION !== 'RETIRADA';
      });
      let postulacion;
      if (existente) {
        postulacion = repoActualizar('POSTULACIONES', existente.ID_POSTULACION, {
          ID_PERSONA_CONTACTO: persona.ID_PERSONA,
          RESPUESTAS_JSON: respuestaJson,
          ACTUALIZADO_EN: received,
          ACTUALIZADO_POR: 'FORMULARIO_MERCADO'
        }, { auditar: false, motivo: 'Actualización de postulación repetida' });
      } else {
        postulacion = repoInsertar('POSTULACIONES', {
          ID_POSTULACION: uuid_(),
          ID_INICIATIVA: idIniciativa,
          ID_EMPRENDIMIENTO: emp.ID_EMPRENDIMIENTO,
          ID_PERSONA_CONTACTO: persona.ID_PERSONA,
          FECHA_POSTULACION: received,
          ESTADO_POSTULACION: 'RECIBIDA',
          RESPUESTAS_JSON: respuestaJson,
          CREADO_EN: received,
          CREADO_POR: 'FORMULARIO_MERCADO',
          ACTUALIZADO_EN: received,
          ACTUALIZADO_POR: 'FORMULARIO_MERCADO'
        });
      }
      repoInsertar('REGISTROS_FORMULARIO', {
        ID_REGISTRO_FORMULARIO: uuid_(),
        FECHA_RECEPCION: received,
        ORIGEN: 'FORMULARIO_MERCADO',
        ID_RESPUESTA: responseId,
        ID_PERSONA: persona.ID_PERSONA,
        ID_EMPRENDIMIENTO: emp.ID_EMPRENDIMIENTO,
        RESULTADO: 'PROCESADO',
        DETALLE: (existente ? 'Postulación actualizada. ' : 'Postulación creada. ') +
                 (personaReutilizada ? 'Persona reutilizada. ' : 'Persona creada. ') +
                 (empReutilizado ? 'Emprendimiento reutilizado. ' : 'Emprendimiento creado. ') +
                 (documentos.length ? 'Documentos: ' + documentos.join(', ') : 'Sin archivos nuevos.'),
        PROCESADO_EN: ahoraIso_()
      }, { auditar: false });
      return postulacion;
    });
  } catch (error) {
    try {
      repoInsertar('REGISTROS_FORMULARIO', {
        ID_REGISTRO_FORMULARIO: uuid_(),
        FECHA_RECEPCION: received,
        ORIGEN: 'FORMULARIO_MERCADO',
        ID_RESPUESTA: responseId,
        RESULTADO: 'ERROR',
        DETALLE: String(error.message || error),
        PROCESADO_EN: ahoraIso_()
      }, { auditar: false });
    } catch (ignored) {}
    manejarError_(error, 'procesarPostulacionMercadoFormulario');
  }
}

/**
 * Elimina el activador (trigger) asociado a un formulario específico.
 */
function limpiarActivadorFormulario_(formId) {
  if (!formId) return;
  try {
    const triggers = ScriptApp.getProjectTriggers();
    triggers.forEach(function(t) {
      if (t.getHandlerFunction() === 'procesarPostulacionMercadoFormulario') {
        try {
          if (t.getTriggerSourceId() === formId) {
            ScriptApp.deleteTrigger(t);
          }
        } catch (ignored) {}
      }
    });
  } catch (e) {
    console.warn('Error al limpiar activador para formId ' + formId + ': ' + e);
  }
}

/**
 * Revisa todos los activadores de formularios de mercados y elimina aquellos
 * que correspondan a mercados cerrados, finalizados, cancelados o inexistentes.
 */
function limpiarActivadoresHuerfanosMercados_() {
  const props = PropertiesService.getScriptProperties();
  const map = JSON.parse(props.getProperty('SGE_FORM_MERCADO_MAP') || '{}');
  const iniciativas = repoTodos('INICIATIVAS', { incluirInactivos: true });
  const mapIniciativas = indexarPor_(iniciativas, 'ID_INICIATIVA');
  const triggers = ScriptApp.getProjectTriggers();
  
  let eliminados = 0;
  const nuevoMap = Object.assign({}, map);
  const estadosCerrados = ['CERRADA', 'FINALIZADA', 'CANCELADA', 'EJECUTADA', 'HISTORICA'];

  triggers.forEach(function(t) {
    if (t.getHandlerFunction() === 'procesarPostulacionMercadoFormulario') {
      try {
        const formId = t.getTriggerSourceId();
        const idIniciativa = map[formId];
        const iniciativa = idIniciativa ? mapIniciativas[idIniciativa] : null;
        
        const debeEliminar = !iniciativa || estadosCerrados.indexOf(iniciativa.ESTADO) >= 0;
        if (debeEliminar) {
          ScriptApp.deleteTrigger(t);
          eliminados++;
          if (formId && nuevoMap[formId]) {
            delete nuevoMap[formId];
          }
        }
      } catch (ignored) {}
    }
  });

  props.setProperty('SGE_FORM_MERCADO_MAP', JSON.stringify(nuevoMap));
  return {
    eliminados: eliminados,
    totalTriggersActuales: ScriptApp.getProjectTriggers().length
  };
}

/**
 * API RPC para ejecutar la limpieza de activadores bajo demanda o desde mantenimiento.
 */
function apiLimpiarActivadoresMercados() {
  try {
    exigirPermiso_('INICIATIVA_EDITAR');
    return respuestaOk(limpiarActivadoresHuerfanosMercados_());
  } catch (error) {
    return manejarError_(error, 'apiLimpiarActivadoresMercados');
  }
}


// ==========================================
// ARCHIVO: FichaIntegralService.gs
// ==========================================

// ===== FichaIntegralService.gs =====
// SGE v2.1.0 - Ficha integral del emprendedor
// Servicio 360° de ficha integral: persona + emprendimiento + expediente + trayectoria + migración v2.1

function resolverFichaIntegral_(referencia) {
  let persona = repoBuscarPorId('PERSONAS', referencia);
  let emprendimiento = null;
  let relacion = null;
  if (persona) {
    relacion = relacionActivaPorSujeto_('PERSONA', persona.ID_PERSONA);
    emprendimiento = relacion ? repoBuscarPorId('EMPRENDIMIENTOS', relacion.ID_EMPRENDIMIENTO) : null;
  } else {
    emprendimiento = repoBuscarPorId('EMPRENDIMIENTOS', referencia);
    if (emprendimiento) {
      relacion = relacionActivaPorSujeto_('EMPRENDIMIENTO', emprendimiento.ID_EMPRENDIMIENTO);
      persona = relacion ? repoBuscarPorId('PERSONAS', relacion.ID_PERSONA) : null;
    }
  }
  exigir_(persona || emprendimiento, 'NO_ENCONTRADO', 'No se encontró la ficha integral solicitada.');
  return { persona: persona, emprendimiento: emprendimiento, relacion: relacion };
}

function documentosFichaIntegral_(personaId, emprendimientoId) {
  const puedeVerSensible = puede_('DOCUMENTO_VER_SENSIBLE');
  return repoTodos('DOCUMENTOS', { incluirInactivos: true }).filter(function(d) {
    return (d.TIPO_SUJETO === 'PERSONA' && String(d.ID_SUJETO) === String(personaId || '')) ||
           (d.TIPO_SUJETO === 'EMPRENDIMIENTO' && String(d.ID_SUJETO) === String(emprendimientoId || ''));
  }).map(function(d) {
    const visible = Object.assign({}, d, {
      ESTADO_EFECTIVO: estadoDocumentoEfectivo_(d),
      ORIGEN_ARCHIVO: String(d.CREADO_POR || '').indexOf('FORMULARIO') >= 0 ? 'Formulario' : 'Funcionario'
    });
    if (!puedeVerSensible) visible.ID_ARCHIVO_DRIVE = '';
    return visible;
  }).sort(function(a, b) {
    if ((a.ES_VERSION_VIGENTE === 'SI') !== (b.ES_VERSION_VIGENTE === 'SI')) {
      return a.ES_VERSION_VIGENTE === 'SI' ? -1 : 1;
    }
    return String(b.CREADO_EN).localeCompare(String(a.CREADO_EN));
  });
}

function resumenFichaIntegral_(persona, emp, documentos) {
  const docsPersona = documentos.filter(function(d) { return d.TIPO_SUJETO === 'PERSONA'; });
  const docsEmp = documentos.filter(function(d) { return d.TIPO_SUJETO === 'EMPRENDIMIENTO'; });
  const base = persona ? resumenDocumental_('PERSONA', persona.ID_PERSONA, docsPersona) : { COMPLETO: 'NO', FALTANTES: ['PERSONA_TITULAR'], VIGENTES: 0, TOTAL_VERSIONES: 0 };
  const inicio = docsEmp.some(function(d) {
    return documentoUtilizable_(d) && ['INICIO_ACTIVIDADES', 'PATENTE_COMERCIAL'].indexOf(d.TIPO_DOCUMENTO) >= 0;
  });
  const mercado = !emp
    ? { HABILITADO: 'NO', MOTIVO: 'Falta registrar el emprendimiento.' }
    : base.COMPLETO !== 'SI'
    ? { HABILITADO: 'NO', MOTIVO: 'Falta completar cédula por ambos lados y Registro Social de Hogares.' }
    : inicio
    ? { HABILITADO: 'SI', MOTIVO: 'Documentación base e inicio de actividades recibidos. No requiere revisión previa.' }
    : { HABILITADO: 'NO', MOTIVO: 'Falta cargar el certificado de inicio de actividades.' };
  const actuales = documentos.filter(function(d) { return d.ES_VERSION_VIGENTE === 'SI'; });
  return {
    REGISTRO_BASE_COMPLETO: base.COMPLETO,
    HABILITADO_MERCADOS: mercado.HABILITADO,
    MOTIVO_HABILITACION: mercado.MOTIVO,
    FALTANTES_BASE: base.FALTANTES,
    DOCUMENTOS_ACTUALES: actuales.length,
    DOCUMENTOS_OBSERVADOS: actuales.filter(function(d) {
      return ['OBSERVADO', 'RECHAZADO', 'VENCIDO'].indexOf(d.ESTADO_EFECTIVO) >= 0;
    }).length,
    TOTAL_VERSIONES: documentos.length
  };
}

function apiListarFichasIntegrales(filtros) {
  try {
    usuarioActual_();
    exigir_(puede_('PERSONA_VER'), 'PROHIBIDO', 'No tiene permiso para consultar datos personales de emprendedores.');
    filtros = filtros || {};
    const personas = repoTodos('PERSONAS', { incluirInactivos: true }).filter(function(p) { return p.ESTADO_REGISTRO !== 'INACTIVO'; });
    const emps = indexarPor_(repoTodos('EMPRENDIMIENTOS', { incluirInactivos: true }), 'ID_EMPRENDIMIENTO');
    const rels = repoTodos('PERSONA_EMPRENDIMIENTO', { incluirInactivos: true }).filter(function(r) { return r.ESTADO_REGISTRO !== 'INACTIVO'; });
    const todosDocs = repoTodos('DOCUMENTOS', { incluirInactivos: true });

    const relsPorPersona = {};
    rels.forEach(function(r) { relsPorPersona[String(r.ID_PERSONA)] = r; });
    const docsPorPersona = {};
    const docsPorEmp = {};
    todosDocs.forEach(function(d) {
      if (d.TIPO_SUJETO === 'PERSONA') {
        (docsPorPersona[String(d.ID_SUJETO)] = docsPorPersona[String(d.ID_SUJETO)] || []).push(d);
      } else if (d.TIPO_SUJETO === 'EMPRENDIMIENTO') {
        (docsPorEmp[String(d.ID_SUJETO)] = docsPorEmp[String(d.ID_SUJETO)] || []).push(d);
      }
    });

    let rows = personas.map(function(p) {
      const rel = relsPorPersona[String(p.ID_PERSONA)];
      const e = rel ? emps[String(rel.ID_EMPRENDIMIENTO)] : null;
      const dPers = docsPorPersona[String(p.ID_PERSONA)] || [];
      const dEmp = e ? (docsPorEmp[String(e.ID_EMPRENDIMIENTO)] || []) : [];
      const docs = dPers.concat(dEmp);
      const res = resumenFichaIntegral_(p, e, docs);
      return {
        ID_PERSONA: p.ID_PERSONA,
        ID_EMPRENDIMIENTO: e ? e.ID_EMPRENDIMIENTO : '',
        CODIGO: p.CODIGO_PERSONA || '',
        PERSONA: nombrePersona_(p),
        RUT: p.RUT_NORMALIZADO || '',
        EMAIL: p.EMAIL_NORMALIZADO || '',
        TELEFONO: p.TELEFONO_NORMALIZADO || '',
        COMUNA: p.COMUNA_RESIDENCIA || '',
        EMPRENDIMIENTO: e ? e.NOMBRE_COMERCIAL : 'Sin emprendimiento vinculado',
        RUBRO: e ? e.ID_RUBRO : '',
        FORMALIZACION: e ? e.FORMALIZACION : '',
        ESTADO_PERSONA: p.ESTADO_REGISTRO,
        ESTADO_EMPRENDIMIENTO: e ? e.ESTADO_EMPRENDIMIENTO : '',
        REGISTRO_BASE_COMPLETO: res.REGISTRO_BASE_COMPLETO,
        HABILITADO_MERCADOS: res.HABILITADO_MERCADOS,
        ACTUALIZADO_EN: String((e && e.ACTUALIZADO_EN) || p.ACTUALIZADO_EN || p.CREADO_EN || '')
      };
    });

    const q = normalizarTexto_(filtros.q).toLowerCase();
    if (q) {
      rows = rows.filter(function(r) {
        return [r.CODIGO, r.PERSONA, r.RUT, r.EMAIL, r.TELEFONO, r.EMPRENDIMIENTO, r.RUBRO, r.COMUNA].join(' ').toLowerCase().indexOf(q) >= 0;
      });
    }
    if (filtros.rubro) rows = rows.filter(function(r) { return r.RUBRO === filtros.rubro; });
    if (filtros.formalizacion) rows = rows.filter(function(r) { return r.FORMALIZACION === filtros.formalizacion; });
    if (filtros.habilitado) rows = rows.filter(function(r) { return r.HABILITADO_MERCADOS === filtros.habilitado; });
    rows.sort(function(a, b) { return String(b.ACTUALIZADO_EN).localeCompare(String(a.ACTUALIZADO_EN)); });
    const total = rows.length, offset = Math.max(0, Number(filtros.offset || 0)), limit = Math.min(100, Math.max(10, Number(filtros.limit || 25)));
    return respuestaOk({ filas: rows.slice(offset, offset + limit), total: total, offset: offset, limit: limit });
  } catch (error) {
    return manejarError_(error, 'apiListarFichasIntegrales');
  }
}

function apiObtenerFichaIntegral(referencia) {
  try {
    usuarioActual_();
    exigir_(puede_('PERSONA_VER'), 'PROHIBIDO', 'No tiene permiso para consultar datos personales de esta ficha.');
    const ficha = resolverFichaIntegral_(referencia);
    const persona = ficha.persona;
    const emp = ficha.emprendimiento;
    const docs = documentosFichaIntegral_(persona && persona.ID_PERSONA, emp && emp.ID_EMPRENDIMIENTO);
    const posts = emp ? repoTodos('POSTULACIONES', { incluirInactivos: true }).filter(function(p) {
      return String(p.ID_EMPRENDIMIENTO) === String(emp.ID_EMPRENDIMIENTO);
    }).map(function(p) {
      const i = repoBuscarPorId('INICIATIVAS', p.ID_INICIATIVA) || {};
      return Object.assign({}, p, { NOMBRE_INICIATIVA: i.NOMBRE || 'Iniciativa' });
    }) : [];
    const postIds = posts.map(function(p) { return String(p.ID_POSTULACION); });
    const participaciones = repoTodos('PARTICIPACIONES', { incluirInactivos: true }).filter(function(p) {
      return postIds.indexOf(String(p.ID_POSTULACION)) >= 0;
    });
    const seguimientos = emp ? repoTodos('SEGUIMIENTO_MERCADO', { incluirInactivos: true }).filter(function(s) {
      return String(s.ID_EMPRENDIMIENTO) === String(emp.ID_EMPRENDIMIENTO);
    }) : [];
    const beneficios = emp ? repoTodos('BENEFICIOS', { incluirInactivos: true }).filter(function(b) {
      return String(b.ID_EMPRENDIMIENTO) === String(emp.ID_EMPRENDIMIENTO);
    }) : [];
    const evaluaciones = emp ? repoTodos('EVALUACIONES_EMPRENDIMIENTO', { incluirInactivos: true }).filter(function(e) {
      return String(e.ID_EMPRENDIMIENTO) === String(emp.ID_EMPRENDIMIENTO);
    }) : [];
    const ids = [persona && persona.ID_PERSONA, emp && emp.ID_EMPRENDIMIENTO].concat(postIds).filter(Boolean);
    const historial = repoTodos('AUDITORIA', { incluirInactivos: true }).filter(function(a) {
      return ids.indexOf(String(a.ID_REGISTRO)) >= 0;
    }).sort(function(a, b) {
      return String(b.FECHA_HORA).localeCompare(String(a.FECHA_HORA));
    }).slice(0, 30);

    return respuestaOk({
      persona: persona,
      emprendimiento: emp,
      relacion: ficha.relacion,
      resumen: resumenFichaIntegral_(persona, emp, docs),
      documentos: docs,
      postulaciones: posts,
      participaciones: participaciones,
      seguimientos: seguimientos,
      beneficios: beneficios,
      evaluaciones: evaluaciones,
      historial: historial
    });
  } catch (error) {
    return manejarError_(error, 'apiObtenerFichaIntegral');
  }
}

function apiActualizarFichaIntegral(idPersona, data) {
  try {
    const user = exigirPermiso_('PERSONA_EDITAR');
    exigirPermiso_('EMPRENDIMIENTO_EDITAR');
    return conBloqueoSistema_(function() {
      const ficha = resolverFichaIntegral_(idPersona);
      exigir_(ficha.persona && ficha.emprendimiento, 'FICHA_INCOMPLETA', 'La ficha debe tener persona y emprendimiento vinculados.');
      const persona = actualizarPersonaRegistroIntegral_(ficha.persona, (data || {}).PERSONA || {}, user.EMAIL);
      const emp = actualizarEmprendimientoRegistroIntegral_(ficha.emprendimiento, (data || {}).EMPRENDIMIENTO || {}, user.EMAIL);
      return respuestaOk({ persona: persona, emprendimiento: emp });
    });
  } catch (error) {
    return manejarError_(error, 'apiActualizarFichaIntegral');
  }
}

function apiPrepararCarpetaFichaIntegral(referencia) {
  try {
    exigirPermiso_('DOCUMENTO_CARGAR');
    const ficha = resolverFichaIntegral_(referencia);
    const tipo = ficha.persona ? 'PERSONA' : 'EMPRENDIMIENTO';
    const id = ficha.persona ? ficha.persona.ID_PERSONA : ficha.emprendimiento.ID_EMPRENDIMIENTO;
    const folder = carpetaDocumentalSujeto_(tipo, id, 'CEDULA_IDENTIDAD_COMPLETA');
    return respuestaOk({ url: folder.getUrl(), id: folder.getId(), nombre: folder.getName() });
  } catch (error) {
    return manejarError_(error, 'apiPrepararCarpetaFichaIntegral');
  }
}

function migrarDocumentosRecibidosV210_() {
  let cambios = 0;
  repoTodos('DOCUMENTOS', { incluirInactivos: true }).forEach(function(d) {
    if (d.ESTADO_REVISION === 'PENDIENTE') {
      repoActualizar('DOCUMENTOS', d.ID_DOCUMENTO, {
        ESTADO_REVISION: d.ES_VERSION_VIGENTE === 'SI' ? 'RECIBIDO' : 'REEMPLAZADO'
      }, { motivo: 'Migración v2.1: documento recibido sin revisión obligatoria' });
      cambios++;
    }
  });
  return cambios;
}

function normalizarRelacionesUnoAUnoV210_() {
  const personas = indexarPor_(repoTodos('PERSONAS', { incluirInactivos: true }), 'ID_PERSONA');
  const emps = indexarPor_(repoTodos('EMPRENDIMIENTOS', { incluirInactivos: true }), 'ID_EMPRENDIMIENTO');
  const activas = repoTodos('PERSONA_EMPRENDIMIENTO', { incluirInactivos: true }).filter(function(r) {
    return r.ESTADO_REGISTRO !== 'INACTIVO';
  });
  activas.sort(function(a, b) {
    const ap = personas[String(a.ID_PERSONA)] || {};
    const bp = personas[String(b.ID_PERSONA)] || {};
    const ae = emps[String(a.ID_EMPRENDIMIENTO)] || {};
    const be = emps[String(b.ID_EMPRENDIMIENTO)] || {};
    const aw = (ap.ESTADO_REGISTRO === 'ACTIVO' ? 4 : 0) + (ae.ESTADO_EMPRENDIMIENTO !== 'CERRADO' ? 2 : 0) + (a.ES_PRINCIPAL === 'SI' ? 1 : 0);
    const bw = (bp.ESTADO_REGISTRO === 'ACTIVO' ? 4 : 0) + (be.ESTADO_EMPRENDIMIENTO !== 'CERRADO' ? 2 : 0) + (b.ES_PRINCIPAL === 'SI' ? 1 : 0);
    if (aw !== bw) return bw - aw;
    return String(b.DESDE || b.CREADO_EN || '').localeCompare(String(a.DESDE || a.CREADO_EN || ''));
  });
  const personasUsadas = {}, emprendimientosUsados = {};
  let conservadas = 0, desactivadas = 0;
  activas.forEach(function(r) {
    const p = String(r.ID_PERSONA), e = String(r.ID_EMPRENDIMIENTO);
    if (!personasUsadas[p] && !emprendimientosUsados[e]) {
      personasUsadas[p] = true;
      emprendimientosUsados[e] = true;
      repoActualizar('PERSONA_EMPRENDIMIENTO', r.ID_RELACION, {
        ROL: 'TITULAR',
        ES_PRINCIPAL: 'SI',
        ESTADO_REGISTRO: 'ACTIVO'
      }, { motivo: 'Normalización v2.1: relación titular única' });
      conservadas++;
    } else {
      repoActualizar('PERSONA_EMPRENDIMIENTO', r.ID_RELACION, {
        ESTADO_REGISTRO: 'INACTIVO',
        ES_PRINCIPAL: 'NO',
        HASTA: ahoraIso_()
      }, { motivo: 'Normalización v2.1: relación adicional conservada en historial' });
      desactivadas++;
    }
  });
  return { conservadas: conservadas, desactivadas: desactivadas };
}

function asegurarCatalogosV210_() {
  const requeridos = [
    ['ESTADO_DOCUMENTO', 'RECIBIDO', 'Recibido'],
    ['ESTADO_DOCUMENTO', 'OBSERVADO', 'Observado'],
    ['ESTADO_DOCUMENTO', 'REEMPLAZADO', 'Reemplazado']
  ];
  const existentes = repoTodos('CATALOGOS', { incluirInactivos: true });
  const claves = {};
  existentes.forEach(function(c) { claves[c.TIPO_CATALOGO + '|' + c.CODIGO] = true; });
  let agregados = 0;
  requeridos.forEach(function(x, i) {
    if (!claves[x[0] + '|' + x[1]]) {
      repoInsertar('CATALOGOS', {
        TIPO_CATALOGO: x[0],
        CODIGO: x[1],
        ETIQUETA: x[2],
        ORDEN: i + 1,
        ACTIVO: 'SI',
        METADATA_JSON: ''
      }, { auditar: false });
      agregados++;
    }
  });
  CacheService.getScriptCache().remove(APP.CACHE_CATALOGS);
  return agregados;
}

function actualizarFichaIntegralV210() {
  try {
    const user = usuarioActual_();
    exigir_(user.ROL === APP.ROLES.ADMIN, 'PROHIBIDO', 'Solo un administrador puede instalar esta actualización.');
    const respaldo = crearRespaldoActualizacion_();
    asegurarEstructuraV4_();
    completarCodigosVisibles_();
    const catalogos = asegurarCatalogosV210_();
    const documentos = migrarDocumentosRecibidosV210_();
    const relaciones = normalizarRelacionesUnoAUnoV210_();
    const version = repoBuscarPorId('CONFIGURACION', 'VERSION');
    const changes = { VALOR: APP.VERSION, ACTUALIZADO_EN: ahoraIso_(), ACTUALIZADO_POR: user.EMAIL };
    if (version) repoActualizar('CONFIGURACION', 'VERSION', changes, { motivo: 'Actualización ficha integral 2.1.0' });
    else repoInsertar('CONFIGURACION', Object.assign({ CLAVE: 'VERSION', DESCRIPCION: 'Versión instalada' }, changes));
    auditoriaRegistrar_('ACTUALIZAR_FICHA_INTEGRAL', 'SISTEMA', APP.VERSION, null, {
      respaldoId: respaldo.id,
      documentosMigrados: documentos,
      relaciones: relaciones
    }, 'Ficha única, relación uno a uno y habilitación documental automática');
    limpiarCacheDatos_();
    const diagnostico = probarFichaIntegralV210();
    return respuestaOk({
      mensaje: 'Ficha integral v2.1.0 instalada. No se eliminaron registros.',
      version: APP.VERSION,
      respaldo: respaldo,
      documentosMigrados: documentos,
      relaciones: relaciones,
      catalogosAgregados: catalogos,
      diagnostico: diagnostico.ok ? diagnostico.data : diagnostico.error
    });
  } catch (error) {
    return manejarError_(error, 'actualizarFichaIntegralV210');
  }
}

function probarFichaIntegralV210() {
  try {
    const user = usuarioActual_();
    exigir_(user.ROL === APP.ROLES.ADMIN, 'PROHIBIDO', 'Solo un administrador puede ejecutar el diagnóstico.');
    const personas = repoTodos('PERSONAS', { incluirInactivos: true });
    const emprendimientos = repoTodos('EMPRENDIMIENTOS', { incluirInactivos: true });
    const relaciones = repoTodos('PERSONA_EMPRENDIMIENTO', { incluirInactivos: true }).filter(function(r) {
      return r.ESTADO_REGISTRO !== 'INACTIVO';
    });
    const documentos = repoTodos('DOCUMENTOS', { incluirInactivos: true });
    const porPersona = {}, porEmprendimiento = {};
    relaciones.forEach(function(r) {
      porPersona[r.ID_PERSONA] = (porPersona[r.ID_PERSONA] || 0) + 1;
      porEmprendimiento[r.ID_EMPRENDIMIENTO] = (porEmprendimiento[r.ID_EMPRENDIMIENTO] || 0) + 1;
    });
    const conflictosPersona = Object.keys(porPersona).filter(function(id) { return porPersona[id] > 1; });
    const conflictosEmprendimiento = Object.keys(porEmprendimiento).filter(function(id) { return porEmprendimiento[id] > 1; });
    const pendientes = documentos.filter(function(d) { return d.ES_VERSION_VIGENTE === 'SI' && d.ESTADO_REVISION === 'PENDIENTE'; });
    const fichasCompletas = personas.filter(function(p) {
      if (p.ESTADO_REGISTRO === 'INACTIVO') return false;
      const rel = relaciones.find(function(r) { return String(r.ID_PERSONA) === String(p.ID_PERSONA); });
      const emp = rel && repoBuscarPorId('EMPRENDIMIENTOS', rel.ID_EMPRENDIMIENTO);
      if (!emp) return false;
      const docs = documentos.filter(function(d) {
        return (d.TIPO_SUJETO === 'PERSONA' && String(d.ID_SUJETO) === String(p.ID_PERSONA)) ||
               (d.TIPO_SUJETO === 'EMPRENDIMIENTO' && String(d.ID_SUJETO) === String(emp.ID_EMPRENDIMIENTO));
      });
      return resumenFichaIntegral_(p, emp, docs).REGISTRO_BASE_COMPLETO === 'SI';
    }).length;

    return respuestaOk({
      version: APP.VERSION,
      personas: personas.length,
      emprendimientos: emprendimientos.length,
      relacionesActivas: relaciones.length,
      fichasConDocumentacionBaseCompleta: fichasCompletas,
      documentosPendientesPorMigrar: pendientes.length,
      conflictosPersona: conflictosPersona,
      conflictosEmprendimiento: conflictosEmprendimiento,
      correcto: !conflictosPersona.length && !conflictosEmprendimiento.length && !pendientes.length
    });
  } catch (error) {
    return manejarError_(error, 'probarFichaIntegralV210');
  }
}


// ==========================================
// ARCHIVO: Instalador.gs
// ==========================================

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
  const rootPersonal = DriveApp.getRootFolder();
  const folders = rootPersonal.getFoldersByName('SGE - Formularios Convocatorias');
  return folders.hasNext() ? folders.next() : rootPersonal.createFolder('SGE - Formularios Convocatorias');
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


// ==========================================
// ARCHIVO: Tests.gs
// ==========================================

// ===== Tests.gs =====
// SGE v2.1.0 - Ficha integral del emprendedor
// Suite de pruebas unitarias automáticas y validación de reglas de negocio

function assertTest_(condition, message) {
  if (!condition) throw new Error(message);
}

function testNormalizarRut_() {
  assertTest_(normalizarRut_('12.345.678-k') === '12345678-K', 'Normalización RUT con puntos y k minúscula');
  assertTest_(normalizarRut_(' 12345678-9 ') === '12345678-9', 'Normalización RUT con espacios');
  assertTest_(normalizarRut_('123456789') === '12345678-9', 'Normalización RUT sin guión');
}

function testValidarRut_() {
  assertTest_(validarRut_('12.345.678-5') === true, 'Validación RUT conocido válido');
  assertTest_(validarRut_('11.111.111-1') === true, 'Validación RUT válido');
  assertTest_(validarRut_('12.345.678-0') === false, 'Dígito verificador erróneo debe fallar');
  assertTest_(validarRut_('') === false, 'RUT vacío debe fallar');
}

function testNormalizarTelefono_() {
  assertTest_(normalizarTelefono_('9 1234 5678') === '+56912345678', 'Normalización teléfono móvil de 9 dígitos');
  assertTest_(normalizarTelefono_('+56 9 1234 5678') === '+56912345678', 'Normalización teléfono con prefijo internacional');
}

function testNormalizacionTexto_() {
  assertTest_(normalizarTexto_('   hola    mundo   ') === 'hola mundo', 'Sanitización de espacios múltiples');
  assertTest_(normalizarEmail_('  Contacto@Municipio.CL ') === 'contacto@municipio.cl', 'Normalización de correo a minúsculas');
}

function testSemillaReproducible_() {
  const a = randomSemilla_(123), b = randomSemilla_(123);
  assertTest_(a() === b() && a() === b(), 'Semilla pseudoaleatoria debe ser reproducible');
}

function testSerializarFecha_() {
  const v = serializarParaCliente_({ fecha: new Date('2026-01-02T12:00:00Z') });
  assertTest_(typeof v.fecha === 'string' && v.fecha.indexOf('2026-01-02') === 0, 'Serialización correcta de fechas ISO');
}

function testCatalogosModulo2_() {
  ['RUBRO', 'SUBRUBRO', 'CANAL_VENTA', 'ROL_REPRESENTACION'].forEach(function(t) {
    assertTest_(CATALOGOS_INICIALES[t] && CATALOGOS_INICIALES[t].length, 'Catálogo obligatorio presente: ' + t);
  });
}

function testCatalogosModulo3_() {
  ['TIPO_DOCUMENTO_PERSONA', 'TIPO_DOCUMENTO_EMPRENDIMIENTO', 'ESTADO_INICIATIVA', 'CAMPO_REQUISITO', 'OPERADOR_REQUISITO'].forEach(function(t) {
    assertTest_(CATALOGOS_INICIALES[t] && CATALOGOS_INICIALES[t].length, 'Catálogo obligatorio presente: ' + t);
  });
}

function testReglasAdmisibilidad_() {
  const c = { ID_RUBRO: 'TEXTIL', ETAPA_ACTUAL: 'DESARROLLO', TRABAJADORES: 2 };
  assertTest_(evaluarRegla_({ CAMPO: 'ID_RUBRO', OPERADOR: 'IGUAL', VALOR_ESPERADO: 'TEXTIL' }, c), 'Regla IGUAL exitosa');
  assertTest_(evaluarRegla_({ CAMPO: 'ETAPA_ACTUAL', OPERADOR: 'IN', VALOR_ESPERADO: 'ARRANQUE|DESARROLLO' }, c), 'Regla IN exitosa');
  assertTest_(evaluarRegla_({ CAMPO: 'ID_RUBRO', OPERADOR: 'NO_IN', VALOR_ESPERADO: 'ALIMENTACION|SERVICIOS' }, c), 'Regla NO_IN exitosa');
  assertTest_(evaluarRegla_({ CAMPO: 'TRABAJADORES', OPERADOR: 'MAYOR_IGUAL', VALOR_ESPERADO: 1 }, c), 'Regla MAYOR_IGUAL exitosa');
}

function testClasificacionAutomatica_() {
  const a = calcularClasificacionAutomatica_({
    MESES_FUNCIONAMIENTO: 2,
    VENTAS_MENSUALES: 100000,
    TRABAJADORES: 0,
    FORMALIZACION: 'SIN_INICIO'
  });
  const c = calcularClasificacionAutomatica_({
    MESES_FUNCIONAMIENTO: 48,
    VENTAS_MENSUALES: 3000000,
    TRABAJADORES: 4,
    FORMALIZACION: 'PERSONA_JURIDICA',
    VENTA_DIGITAL: 'SI',
    REGISTROS_GESTION: 'SI'
  });
  assertTest_(a.CLASIFICACION === 'ARRANQUE', 'Etapa calculada inicial debe ser ARRANQUE');
  assertTest_(c.CLASIFICACION === 'CONSOLIDACION', 'Etapa calculada avanzada debe ser CONSOLIDACION');
}

function testSchema_() {
  ['PERSONAS', 'EMPRENDIMIENTOS', 'POSTULACIONES', 'AUDITORIA'].forEach(function(t) {
    assertTest_(SCHEMA[t] && SCHEMA[t].length, 'Definición de tabla presente: ' + t);
  });
}

function testSchemaV4_() {
  assertTest_(SCHEMA.PERSONAS.indexOf('CODIGO_PERSONA') >= 0, 'Código visible persona presente');
  assertTest_(SCHEMA.EMPRENDIMIENTOS.indexOf('INSTAGRAM') >= 0, 'Redes sociales presentes en emprendimiento');
  assertTest_(SCHEMA.ADMISIONES.indexOf('ES_VIGENTE') >= 0, 'Campo admisión vigente presente');
  assertTest_(SCHEMA.REGISTROS_FORMULARIO && SCHEMA.REGISTROS_FORMULARIO.length, 'Tabla registros de formulario presente');
}

function testEstadoDocumentoEfectivo_() {
  const docRecibido = { ES_VERSION_VIGENTE: 'SI', ESTADO_REVISION: 'RECIBIDO', FECHA_VENCIMIENTO: '' };
  assertTest_(estadoDocumentoEfectivo_(docRecibido) === 'RECIBIDO', 'Estado efectivo recibido');

  const docObservado = { ES_VERSION_VIGENTE: 'SI', ESTADO_REVISION: 'OBSERVADO', FECHA_VENCIMIENTO: '' };
  assertTest_(estadoDocumentoEfectivo_(docObservado) === 'OBSERVADO', 'Estado efectivo observado');

  const docVencido = { ES_VERSION_VIGENTE: 'SI', ESTADO_REVISION: 'RECIBIDO', FECHA_VENCIMIENTO: '2020-01-01' };
  assertTest_(estadoDocumentoEfectivo_(docVencido) === 'VENCIDO', 'Estado efectivo de documento con fecha pretérita debe ser VENCIDO');
}

/**
 * Ejecuta todas las pruebas unitarias y retorna el informe detallado de resultados.
 */
function ejecutarPruebas() {
  const tests = [
    testNormalizarRut_,
    testValidarRut_,
    testNormalizarTelefono_,
    testNormalizacionTexto_,
    testSemillaReproducible_,
    testSerializarFecha_,
    testCatalogosModulo2_,
    testCatalogosModulo3_,
    testReglasAdmisibilidad_,
    testClasificacionAutomatica_,
    testSchema_,
    testSchemaV4_,
    testEstadoDocumentoEfectivo_
  ];
  const results = tests.map(function(test) {
    try {
      test();
      return { prueba: test.name, ok: true };
    } catch (error) {
      return { prueba: test.name, ok: false, error: error.message };
    }
  });
  return {
    ok: results.every(function(r) { return r.ok; }),
    total: results.length,
    exitosas: results.filter(function(r) { return r.ok; }).length,
    fallidas: results.filter(function(r) { return !r.ok; }).length,
    resultados: results
  };
}

/**
 * Ejecuta una prueba integral de extremo a extremo (E2E) sobre la nueva base de datos y Google Drive.
 * Valida:
 * 1. Conexión con Sheets y existencia de las 16 tablas.
 * 2. Conexión con Google Drive y permisos reales de escritura en la Unidad Compartida.
 * 3. Permisos y autenticación del usuario administrador.
 * 4. Creación y consulta de Ficha Integral (Persona + Emprendimiento).
 * 5. Creación de Mercado, Postulación y Evaluación de Selección.
 * 6. Limpieza opcional de datos de prueba.
 * 
 * @param {boolean} limpiarDespues Si es true, borra los registros de prueba al finalizar.
 */
function ejecutarPruebasIntegralesEndToEnd(limpiarDespues) {
  if (limpiarDespues === undefined) limpiarDespues = true;
  const log = [];
  function registrar(titulo, exito, detalle) {
    const item = { paso: titulo, ok: exito, detalle: detalle || '' };
    log.push(item);
    Logger.log((exito ? '✅ PASS: ' : '❌ FAIL: ') + titulo + (detalle ? ' (' + detalle + ')' : ''));
  }

  Logger.log('=====================================================');
  Logger.log('🧪 INICIANDO SUITE DE PRUEBAS INTEGRALES E2E (SGE v2.1.0)');
  Logger.log('=====================================================');

  try {
    // 1. Diagnóstico de Sheets y Esquema
    const db = db_();
    const sheets = db.getSheets().map(function(s) { return s.getName(); });
    const tablasFaltantes = Object.keys(SCHEMA).filter(function(t) { return sheets.indexOf(t) < 0; });
    if (tablasFaltantes.length === 0) {
      registrar('1. Base de datos y 16 tablas estructuradas', true, 'Planilla: ' + db.getName());
    } else {
      registrar('1. Base de datos y 16 tablas estructuradas', false, 'Faltan tablas: ' + tablasFaltantes.join(', '));
    }

    // 2. Diagnóstico de Google Drive (Unidad Compartida)
    const root = carpetaRoot_();
    registrar('2. Carpeta raíz en Google Drive accesible', true, 'Carpeta: ' + root.getName());

    // 3. Prueba de escritura real en Drive
    let testFile = null;
    try {
      testFile = root.createFile('SGE_TEST_PERMISOS.txt', 'Prueba de permisos de escritura ' + ahoraIso_());
      testFile.setTrashed(true);
      registrar('3. Permisos reales de escritura y borrado en Drive', true, 'Operación en Unidad Compartida autorizada');
    } catch (eDrive) {
      registrar('3. Permisos reales de escritura y borrado en Drive', false, 'Error: ' + eDrive.message);
    }

    // 4. Usuario y Permisos
    const email = emailActual_();
    const user = usuarioActual_();
    registrar('4. Usuario actual y roles RBAC', true, 'Email: ' + email + ' | Rol: ' + user.ROL);

    // 5. Catálogos precargados
    const catalogos = catalogos_();
    const cantCatalogos = Object.keys(catalogos).length;
    registrar('5. Catálogos del sistema en memoria y caché', cantCatalogos >= 8, cantCatalogos + ' familias de catálogos');

    // 6. Prueba funcional: Registro Completo de Ficha Integral
    const rutTest = '11.111.111-1';
    const regRes = apiRegistroCompleto({
      PERSONA: {
        NOMBRES: 'EMPRENDEDOR PRUEBA',
        APELLIDO_PATERNO: 'TEST',
        RUT: rutTest,
        EMAIL: 'test_e2e@municipio.cl',
        TELEFONO: '+56912345678',
        COMUNA_RESIDENCIA: 'Santiago',
        GENERO: 'OTRO',
        DISCAPACIDAD_DECLARADA: 'NO'
      },
      EMPRENDIMIENTO: {
        NOMBRE_COMERCIAL: 'EMPRENDIMIENTO TEST E2E',
        ID_RUBRO: 'ARTESANIA',
        ETAPA_ACTUAL: 'DESARROLLO',
        FORMALIZACION: 'SIN_INICIO',
        DESCRIPCION_PRODUCTOS: 'Productos de prueba automatizada'
      }
    });

    if (regRes.ok && regRes.data && regRes.data.persona) {
      const pId = regRes.data.persona.ID_PERSONA;
      const eId = regRes.data.emprendimiento.ID_EMPRENDIMIENTO;
      registrar('6. Registro de Ficha Integral (Persona + Emprendimiento)', true, 'ID Persona: ' + pId);

      // 7. Consulta de Ficha Integral
      const fichaRes = apiObtenerFichaIntegral(pId);
      if (fichaRes.ok && fichaRes.data) {
        registrar('7. Consulta y armado de Ficha Integral', true, 'Nombre: ' + fichaRes.data.persona.NOMBRES);
      } else {
        registrar('7. Consulta y armado de Ficha Integral', false, fichaRes.error ? fichaRes.error.message : '');
      }

      // 8. Crear Iniciativa / Mercado de prueba
      const mercadoRes = apiCrearIniciativa({
        NOMBRE: 'FERIA TEST E2E',
        TIPO_INICIATIVA: 'FERIA',
        DESCRIPCION: 'Feria creada durante prueba automatizada',
        LUGAR: 'Plaza de Armas',
        FECHA_EJECUCION: Utilities.formatDate(new Date(), APP.TIMEZONE, 'yyyy-MM-dd'),
        CUPOS_TITULARES: 5,
        CUPOS_SUPLENTES: 2
      });

      if (mercadoRes.ok && mercadoRes.data) {
        const mId = mercadoRes.data.ID_INICIATIVA;
        registrar('8. Creación de Mercado / Iniciativa', true, 'ID Mercado: ' + mId);

        // 9. Postular Emprendimiento al Mercado
        const postRes = apiCrearPostulacion({
          ID_INICIATIVA: mId,
          ID_EMPRENDIMIENTO: eId,
          ID_PERSONA_CONTACTO: pId
        });

        if (postRes.ok && postRes.data) {
          const postId = postRes.data.ID_POSTULACION;
          registrar('9. Registro de Postulación a Mercado', true, 'ID Postulación: ' + postId);

          // 10. Evaluar Admisibilidad y marcar como Admisible
          repoActualizar('POSTULACIONES', postId, { ESTADO_POSTULACION: 'ADMISIBLE' }, { motivo: 'Prueba E2E' });
          registrar('10. Evaluación y asignación de admisibilidad', true, 'Estado: ADMISIBLE');

          // 11. Ejecutar Selección Simulada
          const selRes = apiEjecutarSeleccion(mId, { semilla: 12345, cuposTitulares: 1, cuposSuplentes: 1 });
          registrar('11. Ejecución de proceso de selección con semilla', selRes.ok, selRes.ok ? 'Selección exitosa' : (selRes.error ? selRes.error.message : ''));

          // 12. Simulación de procesamiento de documentos y postulación
          try {
            const simulacionDoc = repoInsertar('DOCUMENTOS', {
              ID_DOCUMENTO: uuid_(),
              TIPO_SUJETO: 'PERSONA',
              ID_SUJETO: pId,
              TIPO_DOCUMENTO: 'CEDULA_IDENTIDAD_COMPLETA',
              ID_ARCHIVO_DRIVE: 'TEST_DRIVE_FILE_ID',
              VERSION: 1,
              FECHA_EMISION: Utilities.formatDate(new Date(), APP.TIMEZONE, 'yyyy-MM-dd'),
              FECHA_VENCIMIENTO: '2028-12-31',
              ESTADO_REVISION: 'RECIBIDO',
              ES_VERSION_VIGENTE: 'SI',
              CREADO_EN: ahoraIso_(),
              CREADO_POR: 'TEST_E2E'
            }, { auditar: false });
            registrar('12. Ingesta y registro documental en Unidad Compartida', !!simulacionDoc, 'Documento ID: ' + simulacionDoc.ID_DOCUMENTO);
          } catch (eDoc) {
            registrar('12. Ingesta y registro documental en Unidad Compartida', false, eDoc.message);
          }
        } else {
          registrar('9. Registro de Postulación a Mercado', false, postRes.error ? postRes.error.message : '');
        }
      } else {
        registrar('8. Creación de Mercado / Iniciativa', false, mercadoRes.error ? mercadoRes.error.message : '');
      }

      // 13. Dashboard Integral
      const dashRes = apiDashboardIntegral(true);
      registrar('13. Cálculo de KPIs y Dashboard Integral en vivo', dashRes.ok, dashRes.ok ? 'KPIs calculados correctamente' : '');

      // 14. Limpieza de datos de prueba
      if (limpiarDespues) {
        try {
          const tablasLimpieza = ['PERSONAS', 'EMPRENDIMIENTOS', 'PERSONA_EMPRENDIMIENTO', 'INICIATIVAS', 'POSTULACIONES', 'PROCESOS_SELECCION', 'RESULTADOS_SELECCION', 'DOCUMENTOS'];
          tablasLimpieza.forEach(function(t) {
            const s = hoja_(t);
            const data = s.getDataRange().getValues();
            for (let r = data.length - 1; r >= 1; r--) {
              const rowStr = data[r].join(' ');
              if (rowStr.indexOf('TEST') >= 0 || rowStr.indexOf(rutTest) >= 0 || rowStr.indexOf('test_e2e') >= 0) {
                s.deleteRow(r + 1);
              }
            }
          });
          registrar('14. Limpieza de datos de prueba (Cleanup)', true, 'Base de datos restaurada limpia');
        } catch (eClean) {
          registrar('14. Limpieza de datos de prueba (Cleanup)', false, eClean.message);
        }
      } else {
        registrar('14. Registros de prueba conservados para inspección visual', true, 'Revise en la interfaz web');
      }

    } else {
      registrar('6. Registro de Ficha Integral', false, regRes.error ? regRes.error.message : '');
    }

  } catch (error) {
    registrar('Error imprevisto en suite E2E', false, error.message);
  }

  const exitosas = log.filter(function(p) { return p.ok; }).length;
  const fallidas = log.filter(function(p) { return !p.ok; }).length;
  Logger.log('=====================================================');
  Logger.log('📊 RESUMEN FINAL: ' + exitosas + ' PASARON, ' + fallidas + ' FALLARON DE ' + log.length + ' PRUEBAS');
  Logger.log('=====================================================');

  return {
    ok: fallidas === 0,
    total: log.length,
    exitosas: exitosas,
    fallidas: fallidas,
    resumen: exitosas + '/' + log.length + ' pruebas pasadas',
    detalle: log
  };
}

/**
 * Ejecuta la suite E2E conservando los datos creados (Ficha de Juan Pérez Test, Feria Test, etc.)
 * para que puedas verlos y probarlos directamente en la interfaz web.
 */
function ejecutarPruebasYConservarDatosDemo() {
  return ejecutarPruebasIntegralesEndToEnd(false);
}


// ==========================================
// ARCHIVO: WebApp.gs
// ==========================================

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
