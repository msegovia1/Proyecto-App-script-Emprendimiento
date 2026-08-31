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
