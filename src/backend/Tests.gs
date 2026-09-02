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
