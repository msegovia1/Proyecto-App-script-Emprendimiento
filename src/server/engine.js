// src/server/engine.js
// SGE 2.1.0 Node.js Execution Engine
// Bridges Google Apps Script services with Node.js Express server

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

// In-memory Database Store
export const dbStore = {};
let _seqPersona = 100;
let _seqEmp = 100;

// Set up GAS execution environment
export function createEngine() {
  const context = {
    console,
    Date,
    Math,
    JSON,
    String,
    Number,
    Array,
    Object,
    RegExp,
    Error,
    Promise,
    setTimeout,
    clearTimeout
  };

  // Utilities mock
  context.Utilities = {
    formatDate: function(date, tz, fmt) {
      const d = date ? new Date(date) : new Date();
      const pad = (n) => (n < 10 ? '0' : '') + n;
      const y = d.getFullYear(), m = pad(d.getMonth() + 1), day = pad(d.getDate());
      const h = pad(d.getHours()), min = pad(d.getMinutes()), s = pad(d.getSeconds());
      if (fmt === 'yyyy-MM-dd') return `${y}-${m}-${day}`;
      if (fmt === 'yyyyMMdd_HHmmss') return `${y}${m}${day}_${h}${min}${s}`;
      if (fmt === 'yyyyMMdd_HHmm') return `${y}${m}${day}_${h}${min}`;
      return d.toISOString();
    },
    getUuid: function() {
      return crypto.randomUUID();
    },
    computeDigest: function(algo, str) {
      return Array.from(crypto.createHash('sha256').update(String(str)).digest());
    },
    Charset: { UTF_8: 'UTF_8' },
    DigestAlgorithm: { SHA_256: 'SHA_256' }
  };

  // Session mock
  let currentUserEmail = 'admin@santiago.cl';
  context.Session = {
    getActiveUser: function() {
      return {
        getEmail: function() { return currentUserEmail; }
      };
    },
    setUserEmail: function(email) {
      currentUserEmail = email;
    }
  };

  // PropertiesService mock
  const propsStore = {
    SGE_FORM_REGISTRO_URL: 'https://docs.google.com/forms/d/e/sge-registro-demo/viewform'
  };
  context.PropertiesService = {
    getScriptProperties: function() {
      return {
        getProperty: function(k) { return propsStore[k] || null; },
        setProperty: function(k, v) { propsStore[k] = String(v); },
        setProperties: function(obj) { Object.assign(propsStore, obj); },
        getProperties: function() { return Object.assign({}, propsStore); }
      };
    }
  };

  // CacheService mock
  const cacheStore = new Map();
  context.CacheService = {
    getScriptCache: function() {
      return {
        get: function(k) { return cacheStore.get(k) || null; },
        put: function(k, v, ttl) { cacheStore.set(k, String(v)); },
        remove: function(k) { cacheStore.delete(k); }
      };
    }
  };

  // LockService mock
  context.LockService = {
    getScriptLock: function() {
      return {
        hasLock: function() { return true; },
        waitLock: function() {},
        releaseLock: function() {}
      };
    }
  };

  // UrlFetchApp mock for Node.js (executes real HTTP requests synchronously using curl)
  context.UrlFetchApp = {
    fetch: function(url, options = {}) {
      const method = (options.method || 'GET').toUpperCase();
      const headers = options.headers || {};
      const payload = options.payload || '';

      const curlArgs = ['-s', '-i', '-X', method, url];
      if (options.contentType) {
        curlArgs.push('-H', `Content-Type: ${options.contentType}`);
      }
      for (const [k, v] of Object.entries(headers)) {
        curlArgs.push('-H', `${k}: ${v}`);
      }
      if (payload) {
        curlArgs.push('--data-raw', typeof payload === 'string' ? payload : JSON.stringify(payload));
      }

      try {
        const res = spawnSync('curl', curlArgs, { encoding: 'utf-8', timeout: 15000 });
        if (res.error) throw res.error;

        const raw = res.stdout || '';
        const parts = raw.split(/\r?\n\r?\n/);
        const headerPart = parts[0] || '';
        const bodyPart = parts.slice(1).join('\n\n');

        const statusMatch = headerPart.match(/HTTP\/[\d\.]+\s+(\d+)/);
        const statusCode = statusMatch ? parseInt(statusMatch[1], 10) : 200;

        return {
          getResponseCode: () => statusCode,
          getContentText: () => bodyPart,
          getBlob: () => ({
            getBytes: () => Buffer.from(bodyPart, 'utf-8'),
            getContentType: () => 'application/json'
          })
        };
      } catch (err) {
        throw new Error('Error en UrlFetchApp: ' + err.message);
      }
    }
  };

  // Mock Drive files in-memory
  const driveFiles = new Map();
  function makeMockFolder(id, name) {
    return {
      getId: () => id || 'root-folder',
      getName: () => name || 'Carpeta SGE Institucional',
      getUrl: () => 'https://drive.google.com/drive/folders/' + (id || 'root-folder'),
      getFoldersByName: (subName) => {
        let consumed = false;
        const sub = makeMockFolder(`${id || 'root'}-${subName}`, subName);
        return {
          hasNext: () => !consumed,
          next: () => { consumed = true; return sub; }
        };
      },
      createFolder: (subName) => makeMockFolder(`${id || 'root'}-${subName}`, subName),
      createFile: (blob) => {
        const fileId = 'file-' + crypto.randomUUID();
        const doc = {
          id: fileId,
          name: typeof blob.getName === 'function' ? blob.getName() : 'documento.pdf',
          size: typeof blob.getBytes === 'function' ? blob.getBytes().length : 1024,
          mimeType: typeof blob.getContentType === 'function' ? blob.getContentType() : 'application/pdf',
          bytes: typeof blob.getBytes === 'function' ? blob.getBytes() : Buffer.from([])
        };
        driveFiles.set(fileId, doc);
        return context.DriveApp.getFileById(fileId);
      }
    };
  }

  context.DriveApp = {
    getFolderById: function(id) {
      return makeMockFolder(id, 'Carpeta SGE');
    },
    getFileById: function(id) {
      const existing = driveFiles.get(id) || {
        id: id || 'doc-sample',
        name: 'documento_adjunto.pdf',
        size: 2048,
        mimeType: 'application/pdf'
      };
      return {
        getId: function() { return existing.id; },
        getName: function() { return existing.name; },
        getUrl: function() { return `/api/documents/${existing.id}/view`; },
        setDescription: function(d) {},
        setTrashed: function(t) {},
        makeCopy: function(name) {
          const copyId = existing.id + '-copy';
          driveFiles.set(copyId, { ...existing, id: copyId, name });
          return context.DriveApp.getFileById(copyId);
        }
      };
    }
  };

  context.carpetaRoot_ = function() {
    return context.DriveApp.getFolderById('root-folder');
  };

  context.Logger = console;

  // In-memory table operations
  function initTable(tabla) {
    if (!dbStore[tabla]) dbStore[tabla] = [];
  }

  context.encabezados_ = function(tabla) {
    return (context.SCHEMA && context.SCHEMA[tabla] ? context.SCHEMA[tabla] : []).slice();
  };

  context.repoTodos = function(tabla, options) {
    initTable(tabla);
    options = options || {};
    let rows = dbStore[tabla].slice();
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
  };

  context.repoListar = function(tabla, options) {
    options = options || {};
    const rows = context.repoTodos(tabla, options);
    const offset = Math.max(0, Number(options.offset || 0));
    const maxPage = (context.APP && context.APP.MAX_PAGE_SIZE) || 200;
    const defaultPage = (context.APP && context.APP.PAGE_SIZE) || 50;
    const limit = Math.min(maxPage, Math.max(1, Number(options.limit || defaultPage)));
    return rows.slice(offset, offset + limit);
  };

  context.repoBuscarPorId = function(tabla, id) {
    if (id == null || id === '') return null;
    const targetIdStr = String(id);
    const rows = context.repoTodos(tabla, { incluirInactivos: true });
    const headers = context.encabezados_(tabla);
    const idKey = headers[0] || 'ID';
    for (let i = 0; i < rows.length; i++) {
      if (String(rows[i][idKey]) === targetIdStr) return rows[i];
    }
    return null;
  };

  context.repoInsertar = function(tabla, obj, options) {
    initTable(tabla);
    options = options || {};
    const headers = context.encabezados_(tabla);
    const idField = headers[0] || 'ID';
    const value = Object.assign({}, obj);
    if (!value[idField]) value[idField] = context.uuid_ ? context.uuid_() : context.Utilities.getUuid();
    if (tabla === 'PERSONAS' && !value.CODIGO_PERSONA) {
      value.CODIGO_PERSONA = 'PER-' + ('0000' + _seqPersona++).slice(-4);
    }
    if (tabla === 'EMPRENDIMIENTOS' && !value.CODIGO_EMPRENDIMIENTO) {
      value.CODIGO_EMPRENDIMIENTO = 'EMP-' + ('0000' + _seqEmp++).slice(-4);
    }
    dbStore[tabla].push(value);
    if (options.auditar !== false && typeof context.auditoriaRegistrar_ === 'function') {
      context.auditoriaRegistrar_('CREAR', tabla, value[idField], null, value, options.motivo || 'Creación');
    }
    return value;
  };

  context.repoActualizar = function(tabla, id, changes, options) {
    initTable(tabla);
    options = options || {};
    const headers = context.encabezados_(tabla);
    const idField = headers[0] || 'ID';
    const targetIdStr = String(id);
    const list = dbStore[tabla];
    let idx = -1;
    for (let i = 0; i < list.length; i++) {
      if (String(list[i][idField]) === targetIdStr) {
        idx = i;
        break;
      }
    }
    if (idx < 0) throw new Error('NO_ENCONTRADO: ' + tabla + ': ' + id);
    const before = Object.assign({}, list[idx]);
    const after = Object.assign({}, before, changes);
    after[idField] = before[idField];
    list[idx] = after;
    if (options.auditar !== false && typeof context.auditoriaRegistrar_ === 'function') {
      context.auditoriaRegistrar_('MODIFICAR', tabla, id, before, after, options.motivo || 'Actualización');
    }
    return after;
  };

  context.repoDesactivar = function(tabla, id, motivo) {
    return context.repoActualizar(tabla, id, {
      ESTADO_REGISTRO: 'INACTIVO',
      ACTUALIZADO_EN: context.ahoraIso_ ? context.ahoraIso_() : new Date().toISOString(),
      ACTUALIZADO_POR: context.emailActual_ ? context.emailActual_() : 'admin@santiago.cl'
    }, { motivo: motivo || 'Desactivación lógica' });
  };

  context.repoContar = function(tabla, filtro) {
    return context.repoTodos(tabla, { filtro: filtro, incluirInactivos: true }).length;
  };

  context.exigir_ = function(cond, code, msg) {
    if (!cond) throw new Error(code + ': ' + msg);
  };

  context.indexarPor_ = function(list, key) {
    const out = {};
    (list || []).forEach(function(item) {
      if (item && item[key] != null) out[String(item[key])] = item;
    });
    return out;
  };

  context.agruparPor_ = function(list, key) {
    const out = {};
    (list || []).forEach(function(item) {
      if (item && item[key] != null) {
        const k = String(item[key]);
        if (!out[k]) out[k] = [];
        out[k].push(item);
      }
    });
    return out;
  };

  context.limpiarCacheDatos_ = function() {};
  context.limpiarCacheCatalogos_ = function() {};

  // Load and execute all backend GS files
  const files = [
    'Config.gs',
    'Schema.gs',
    'Normalizacion.gs',
    'ValidacionesChilenas.gs',
    'TursoClient.gs',
    'DatabaseSchema.gs',
    'DriveStorageService.gs',
    'EmprendedoresService.gs',
    'AuthService.gs',
    'AuditoriaService.gs',
    'PersonaService.gs',
    'EmprendimientoService.gs',
    'DocumentoService.gs',
    'IniciativasService.gs',
    'IniciativaService.gs',
    'SeleccionService.gs',
    'ParticipacionService.gs',
    'GeoService.gs',
    'ReportesService.gs',
    'MercadosService.gs',
    'FichaIntegralService.gs',
    'WebApp.gs'
  ];

  let scriptBundle = '';
  for (const f of files) {
    const filePath = path.join(process.cwd(), 'src', 'backend', f);
    if (fs.existsSync(filePath)) {
      let content = fs.readFileSync(filePath, 'utf-8');
      content = content.replace(/^const /gm, 'var ');
      scriptBundle += `\n// ===== ${f} =====\n` + content + '\n';
    }
  }

  // Evaluate in context
  const evalFn = new Function('ctx', `
    with (ctx) {
      ${scriptBundle}

      const exported = {};
      const candidateKeys = [
        'APP', 'SCHEMA', 'CATALOGOS_INICIALES', 'PERMISOS_ROL',
        'apiBootstrap', 'apiSesion', 'apiListar', 'apiDashboard', 'apiDashboardIntegral',
        'apiListarFichasIntegrales', 'apiObtenerFichaIntegral', 'apiActualizarFichaIntegral',
        'apiPrepararCarpetaFichaIntegral', 'apiBuscarPersonas', 'apiListarPersonas',
        'apiObtenerPersona', 'apiCrearPersona', 'apiActualizarPersona', 'apiCambiarEstadoPersona',
        'apiRegistroCompleto', 'apiBuscarEmprendimientos', 'apiListarEmprendimientos',
        'apiObtenerEmprendimiento', 'apiCrearEmprendimiento', 'apiActualizarEmprendimiento',
        'apiCambiarEstadoEmprendimiento', 'apiSugerirClasificacion', 'apiVincularRepresentante',
        'apiActualizarRepresentante', 'apiDesvincularRepresentante', 'apiListarIniciativas',
        'apiObtenerIniciativa', 'apiCrearIniciativa', 'apiActualizarIniciativa',
        'apiCambiarEstadoIniciativa', 'apiAgregarRequisito', 'apiActualizarRequisito',
        'apiDesactivarRequisito', 'apiCrearPostulacion', 'apiCrearPostulacionesMasivas',
        'apiListarPostulaciones', 'apiObtenerPostulacion', 'apiEvaluarAdmisibilidadAutomatica',
        'apiEvaluarAdmisibilidadMasiva', 'apiRetirarPostulacion', 'apiListarCandidatosIniciativa',
        'apiOpcionesSeleccion', 'apiListarProcesosSeleccion', 'apiEjecutarSeleccion',
        'apiAjustarResultado', 'apiConfirmarParticipacion', 'apiBandejaConfirmados',
        'apiReemplazarParticipante', 'apiCrearSeleccionManual', 'apiCandidatosSeleccionManual',
        'apiListarDocumentosSujeto', 'apiRevisarDocumento', 'apiObtenerUrlDocumento',
        'apiCargarDocumentoFormulario', 'apiCargarDocumentoMercado', 'apiListarDocumentosMercado',
        'apiObtenerUrlDocumentoMercado', 'apiCrearMercadoIntegral', 'apiPrepararCarpetaMercado',
        'apiCandidatosPostulacionesMercado', 'apiRegistrarSeleccionManualPostulaciones',
        'apiRegistrarSeguimientoMercado', 'apiListarSeguimientoMercado', 'apiDashboardMercado',
        'apiDestinatariosComunicacion', 'apiRegistrarComunicacion', 'apiAuditoria',
        'apiAuditoriaLegible', 'apiExportar', 'apiValidarRut', 'apiTursoConfigurar',
        'apiTursoProbar', 'apiTursoInicializar', 'apiFichaGuardar', 'apiFichaDetalle',
        'apiFichasListar', 'apiExpedienteCargar', 'apiIniciativasListar', 'apiIniciativaCrear', 'apiIniciativaActualizar',
        'apiPostulacionRegistrar', 'apiAdmisibilidadEvaluar', 'apiSeleccionEjecutar',
        'apiConfirmacionGestionar', 'apiSeguimientoPostMercadoGuardar', 'apiDashboardConsolidado',
        'apiDetalleMercadoIntegral', 'apiListarPostulacionesMercado', 'apiActualizarEstadoPostulacionesMasivo',
        'apiListarEmprendedoresDisponibles', 'apiIncorporarEmprendedoresAMercadoMasivo',
        'apiListarParticipantesSeguimiento', 'apiGuardarSeguimientoMasivo',
        'apiListarDocumentosEmprendedor', 'obtenerDocumentosEmprendedor',
        'apiObtenerResumenVentasPorDia', 'obtenerResumenVentasPorDia',
        'obtenerPostulacionesMercado', 'actualizarEstadoPostulacionesMasivo',
        'obtenerEmprendedoresDisponibles', 'incorporarEmprendedoresAMercadoMasivo',
        'obtenerParticipantesSeguimiento', 'guardarSeguimientoMasivo',
        'tursoEjecutar',
        'tursoConfigurarCredenciales', 'tursoTestConexion', 'tursoInicializarEsquema',
        'listarIniciativas', 'crearIniciativa', 'actualizarIniciativa', 'registrarPostulacion', 'evaluarAdmisibilidadIniciativa',
        'ejecutarSeleccionTransparente', 'gestionarConfirmacionTitular', 'guardarSeguimientoPostMercado',
        'obtenerDashboardConsolidado'
      ];

      for (const k of candidateKeys) {
        try {
          if (eval('typeof ' + k) !== 'undefined') {
            exported[k] = eval(k);
          }
        } catch (e) {}
      }

      return exported;
    }
  `);

  const methods = evalFn(context);

  // Initialize Admin User in DB
  const adminEmail = 'admin@santiago.cl';
  context.repoInsertar('USUARIOS', {
    ID_USUARIO: 'usr-admin-01',
    EMAIL: adminEmail,
    NOMBRE: 'ADMINISTRADOR MUNICIPAL',
    ROL: 'ADMIN',
    ACTIVO: 'SI',
    CREADO_EN: new Date().toISOString(),
    CREADO_POR: 'SISTEMA_INICIAL'
  }, { auditar: false });

  // Seed sample rich dataset so the app displays immediately with data
  seedInitialData(context);

  return {
    methods,
    context,
    dbStore,
    execute: function(methodName, args) {
      if (typeof methods[methodName] === 'function') {
        return methods[methodName].apply(null, args || []);
      }
      // Check if context has it directly
      if (typeof context[methodName] === 'function') {
        return context[methodName].apply(null, args || []);
      }
      return {
        ok: false,
        data: null,
        error: { code: 'METODO_NO_ENCONTRADO', message: `El método RPC '${methodName}' no está disponible.` },
        meta: {}
      };
    }
  };
}

// Seed initial realistic data for Municipalidad de Santiago
function seedInitialData(ctx) {
  // Check if already seeded
  if (ctx.repoTodos('PERSONAS', { incluirInactivos: true }).length > 0) return;

  const hoyIso = new Date().toISOString();

  // 1. Personas
  const personas = [
    {
      ID_PERSONA: 'per-0001',
      CODIGO_PERSONA: 'PER-0001',
      RUT_NORMALIZADO: '15423891-4',
      NOMBRES: 'MARÍA JOSÉ',
      APELLIDO_PATERNO: 'GONZÁLEZ',
      APELLIDO_MATERNO: 'CONTRERAS',
      FECHA_NACIMIENTO: '1988-05-14',
      GENERO: 'MUJER',
      DISCAPACIDAD_DECLARADA: 'NO',
      TELEFONO_NORMALIZADO: '+56987654321',
      EMAIL_NORMALIZADO: 'mariajose.artesanias@gmail.com',
      COMUNA_RESIDENCIA: 'Santiago',
      ESTADO_REGISTRO: 'ACTIVO',
      CREADO_EN: hoyIso,
      CREADO_POR: 'admin@santiago.cl'
    },
    {
      ID_PERSONA: 'per-0002',
      CODIGO_PERSONA: 'PER-0002',
      RUT_NORMALIZADO: '16789012-K',
      NOMBRES: 'CARLOS ANDRÉS',
      APELLIDO_PATERNO: 'SILVA',
      APELLIDO_MATERNO: 'MORALES',
      FECHA_NACIMIENTO: '1984-11-22',
      GENERO: 'HOMBRE',
      DISCAPACIDAD_DECLARADA: 'NO',
      TELEFONO_NORMALIZADO: '+56976543210',
      EMAIL_NORMALIZADO: 'carlos.delicias@gmail.com',
      COMUNA_RESIDENCIA: 'Santiago',
      ESTADO_REGISTRO: 'ACTIVO',
      CREADO_EN: hoyIso,
      CREADO_POR: 'admin@santiago.cl'
    },
    {
      ID_PERSONA: 'per-0003',
      CODIGO_PERSONA: 'PER-0003',
      RUT_NORMALIZADO: '14321987-2',
      NOMBRES: 'VALENTINA ROCÍO',
      APELLIDO_PATERNO: 'ROJAS',
      APELLIDO_MATERNO: 'PAVEZ',
      FECHA_NACIMIENTO: '1992-03-08',
      GENERO: 'MUJER',
      DISCAPACIDAD_DECLARADA: 'NO',
      TELEFONO_NORMALIZADO: '+56965432109',
      EMAIL_NORMALIZADO: 'vale.textiles@hotmail.com',
      COMUNA_RESIDENCIA: 'Santiago',
      ESTADO_REGISTRO: 'ACTIVO',
      CREADO_EN: hoyIso,
      CREADO_POR: 'admin@santiago.cl'
    },
    {
      ID_PERSONA: 'per-0004',
      CODIGO_PERSONA: 'PER-0004',
      RUT_NORMALIZADO: '17892345-8',
      NOMBRES: 'SEBASTIÁN IGNACIO',
      APELLIDO_PATERNO: 'MUÑOZ',
      APELLIDO_MATERNO: 'CASTILLO',
      FECHA_NACIMIENTO: '1995-09-17',
      GENERO: 'HOMBRE',
      DISCAPACIDAD_DECLARADA: 'NO',
      TELEFONO_NORMALIZADO: '+56954321098',
      EMAIL_NORMALIZADO: 'seba.ceramicas@gmail.com',
      COMUNA_RESIDENCIA: 'Santiago',
      ESTADO_REGISTRO: 'ACTIVO',
      CREADO_EN: hoyIso,
      CREADO_POR: 'admin@santiago.cl'
    }
  ];

  personas.forEach(p => ctx.repoInsertar('PERSONAS', p, { auditar: false }));

  // 2. Emprendimientos
  const emprendimientos = [
    {
      ID_EMPRENDIMIENTO: 'emp-0001',
      CODIGO_EMPRENDIMIENTO: 'EMP-0001',
      NOMBRE_COMERCIAL: 'Joyas y Telares Santiago',
      DESCRIPCION: 'Diseño exclusivo de joyería en plata con aplicaciones en telar tradicional chileno.',
      ID_RUBRO: 'ARTESANIA',
      ID_SUBRUBRO: 'JOYERIA_BISUTERIA',
      FECHA_INICIO_ESTIMADA: '2022-01-15',
      FORMALIZACION: 'PERSONA_NATURAL_1RA',
      DEDICACION: 'EXCLUSIVA',
      CANAL_VENTA: 'FERIAS_MERCADOS',
      ETAPA_ACTUAL: 'CONSOLIDACION',
      TERRITORIO_OPERACION: 'Barrio Lastarria / Centro',
      ESTADO_EMPRENDIMIENTO: 'ACTIVO',
      INSTAGRAM: '@joyasytelares.stgo',
      CREADO_EN: hoyIso,
      CREADO_POR: 'admin@santiago.cl'
    },
    {
      ID_EMPRENDIMIENTO: 'emp-0002',
      CODIGO_EMPRENDIMIENTO: 'EMP-0002',
      NOMBRE_COMERCIAL: 'Pastelería Tradicional El Barrio',
      DESCRIPCION: 'Repostería casera, empolvados, chilenitos y tortas artesanales con identidad barrial.',
      ID_RUBRO: 'ALIMENTACION',
      ID_SUBRUBRO: 'REPOSTERIA',
      FECHA_INICIO_ESTIMADA: '2021-06-01',
      FORMALIZACION: 'PERSONA_JURIDICA',
      DEDICACION: 'EXCLUSIVA',
      CANAL_VENTA: 'LOCAL_COMERCIAL',
      ETAPA_ACTUAL: 'CONSOLIDACION',
      TERRITORIO_OPERACION: 'Barrio Yungay',
      ESTADO_EMPRENDIMIENTO: 'ACTIVO',
      INSTAGRAM: '@pasteleria.elbarrio',
      CREADO_EN: hoyIso,
      CREADO_POR: 'admin@santiago.cl'
    },
    {
      ID_EMPRENDIMIENTO: 'emp-0003',
      CODIGO_EMPRENDIMIENTO: 'EMP-0003',
      NOMBRE_COMERCIAL: 'Diseño Textil Sustentable Vale',
      DESCRIPCION: 'Prendas y bolsos confeccionados a partir de reutilización textil y algodón orgánico.',
      ID_RUBRO: 'TEXTIL',
      ID_SUBRUBRO: 'BOLSOS_ACCESORIOS_TEXTILES',
      FECHA_INICIO_ESTIMADA: '2023-03-10',
      FORMALIZACION: 'SIN_INICIO',
      DEDICACION: 'PARCIAL',
      CANAL_VENTA: 'ONLINE',
      ETAPA_ACTUAL: 'CRECIMIENTO',
      TERRITORIO_OPERACION: 'Santiago Centro',
      ESTADO_EMPRENDIMIENTO: 'ACTIVO',
      INSTAGRAM: '@valetextilsustentable',
      CREADO_EN: hoyIso,
      CREADO_POR: 'admin@santiago.cl'
    },
    {
      ID_EMPRENDIMIENTO: 'emp-0004',
      CODIGO_EMPRENDIMIENTO: 'EMP-0004',
      NOMBRE_COMERCIAL: 'Taller Cerámicas del Parque',
      DESCRIPCION: 'Objetos utilitarios y decorativos modelados a mano en gres y loza esmaltada.',
      ID_RUBRO: 'ARTESANIA',
      ID_SUBRUBRO: 'CERAMICA_ALFARERIA',
      FECHA_INICIO_ESTIMADA: '2023-08-01',
      FORMALIZACION: 'PERSONA_NATURAL_2DA',
      DEDICACION: 'PARCIAL',
      CANAL_VENTA: 'FERIAS_MERCADOS',
      ETAPA_ACTUAL: 'ARRANQUE',
      TERRITORIO_OPERACION: 'Barrio Parque Forestal',
      ESTADO_EMPRENDIMIENTO: 'ACTIVO',
      INSTAGRAM: '@taller.ceramicas.parque',
      CREADO_EN: hoyIso,
      CREADO_POR: 'admin@santiago.cl'
    }
  ];

  emprendimientos.forEach(e => ctx.repoInsertar('EMPRENDIMIENTOS', e, { auditar: false }));

  // 3. Relaciones Persona-Emprendimiento
  const relaciones = [
    {
      ID_RELACION: 'rel-0001',
      ID_PERSONA: 'per-0001',
      ID_EMPRENDIMIENTO: 'emp-0001',
      ROL: 'TITULAR',
      ES_PRINCIPAL: 'SI',
      DESDE: '2022-01-15',
      ESTADO_REGISTRO: 'ACTIVO',
      CREADO_EN: hoyIso,
      CREADO_POR: 'admin@santiago.cl'
    },
    {
      ID_RELACION: 'rel-0002',
      ID_PERSONA: 'per-0002',
      ID_EMPRENDIMIENTO: 'emp-0002',
      ROL: 'TITULAR',
      ES_PRINCIPAL: 'SI',
      DESDE: '2021-06-01',
      ESTADO_REGISTRO: 'ACTIVO',
      CREADO_EN: hoyIso,
      CREADO_POR: 'admin@santiago.cl'
    },
    {
      ID_RELACION: 'rel-0003',
      ID_PERSONA: 'per-0003',
      ID_EMPRENDIMIENTO: 'emp-0003',
      ROL: 'TITULAR',
      ES_PRINCIPAL: 'SI',
      DESDE: '2023-03-10',
      ESTADO_REGISTRO: 'ACTIVO',
      CREADO_EN: hoyIso,
      CREADO_POR: 'admin@santiago.cl'
    },
    {
      ID_RELACION: 'rel-0004',
      ID_PERSONA: 'per-0004',
      ID_EMPRENDIMIENTO: 'emp-0004',
      ROL: 'TITULAR',
      ES_PRINCIPAL: 'SI',
      DESDE: '2023-08-01',
      ESTADO_REGISTRO: 'ACTIVO',
      CREADO_EN: hoyIso,
      CREADO_POR: 'admin@santiago.cl'
    }
  ];

  relaciones.forEach(r => ctx.repoInsertar('PERSONA_EMPRENDIMIENTO', r, { auditar: false }));

  // 4. Documentos Base
  const documentos = [
    {
      ID_DOCUMENTO: 'doc-0001',
      TIPO_SUJETO: 'PERSONA',
      ID_SUJETO: 'per-0001',
      TIPO_DOCUMENTO: 'CEDULA_IDENTIDAD_COMPLETA',
      ID_ARCHIVO_DRIVE: 'drive-doc-0001',
      VERSION: 1,
      FECHA_EMISION: '2022-01-01',
      FECHA_VENCIMIENTO: '2029-05-14',
      ESTADO_REVISION: 'RECIBIDO',
      ES_VERSION_VIGENTE: 'SI',
      CREADO_EN: hoyIso,
      CREADO_POR: 'admin@santiago.cl'
    },
    {
      ID_DOCUMENTO: 'doc-0002',
      TIPO_SUJETO: 'PERSONA',
      ID_SUJETO: 'per-0001',
      TIPO_DOCUMENTO: 'REGISTRO_SOCIAL_HOGARES',
      ID_ARCHIVO_DRIVE: 'drive-doc-0002',
      VERSION: 1,
      FECHA_EMISION: '2024-01-10',
      FECHA_VENCIMIENTO: '2025-01-10',
      ESTADO_REVISION: 'RECIBIDO',
      ES_VERSION_VIGENTE: 'SI',
      CREADO_EN: hoyIso,
      CREADO_POR: 'admin@santiago.cl'
    },
    {
      ID_DOCUMENTO: 'doc-0003',
      TIPO_SUJETO: 'EMPRENDIMIENTO',
      ID_SUJETO: 'emp-0001',
      TIPO_DOCUMENTO: 'INICIO_ACTIVIDADES',
      ID_ARCHIVO_DRIVE: 'drive-doc-0003',
      VERSION: 1,
      FECHA_EMISION: '2022-02-01',
      FECHA_VENCIMIENTO: '',
      ESTADO_REVISION: 'RECIBIDO',
      ES_VERSION_VIGENTE: 'SI',
      CREADO_EN: hoyIso,
      CREADO_POR: 'admin@santiago.cl'
    },
    {
      ID_DOCUMENTO: 'doc-0004',
      TIPO_SUJETO: 'PERSONA',
      ID_SUJETO: 'per-0002',
      TIPO_DOCUMENTO: 'CEDULA_IDENTIDAD_COMPLETA',
      ID_ARCHIVO_DRIVE: 'drive-doc-0004',
      VERSION: 1,
      FECHA_EMISION: '2020-03-15',
      FECHA_VENCIMIENTO: '2028-11-22',
      ESTADO_REVISION: 'RECIBIDO',
      ES_VERSION_VIGENTE: 'SI',
      CREADO_EN: hoyIso,
      CREADO_POR: 'admin@santiago.cl'
    },
    {
      ID_DOCUMENTO: 'doc-0005',
      TIPO_SUJETO: 'PERSONA',
      ID_SUJETO: 'per-0002',
      TIPO_DOCUMENTO: 'REGISTRO_SOCIAL_HOGARES',
      ID_ARCHIVO_DRIVE: 'drive-doc-0005',
      VERSION: 1,
      FECHA_EMISION: '2024-02-01',
      FECHA_VENCIMIENTO: '2025-02-01',
      ESTADO_REVISION: 'RECIBIDO',
      ES_VERSION_VIGENTE: 'SI',
      CREADO_EN: hoyIso,
      CREADO_POR: 'admin@santiago.cl'
    },
    {
      ID_DOCUMENTO: 'doc-0006',
      TIPO_SUJETO: 'EMPRENDIMIENTO',
      ID_SUJETO: 'emp-0002',
      TIPO_DOCUMENTO: 'INICIO_ACTIVIDADES',
      ID_ARCHIVO_DRIVE: 'drive-doc-0006',
      VERSION: 1,
      FECHA_EMISION: '2021-07-01',
      FECHA_VENCIMIENTO: '',
      ESTADO_REVISION: 'RECIBIDO',
      ES_VERSION_VIGENTE: 'SI',
      CREADO_EN: hoyIso,
      CREADO_POR: 'admin@santiago.cl'
    }
  ];

  documentos.forEach(d => ctx.repoInsertar('DOCUMENTOS', d, { auditar: false }));

  // 5. Iniciativas / Mercados
  const iniciativas = [
    {
      ID_INICIATIVA: 'ini-0001',
      TIPO_INICIATIVA: 'MERCADO',
      NOMBRE: 'Mercado Navideño Plaza de Armas 2026',
      OBJETIVO: 'Impulsar ventas de emprendimientos artesanales y gastronómicos locales en fiestas de fin de año.',
      TEMATICA: 'Navidad y Artesanías',
      APERTURA_POSTULACION: '2026-11-01',
      CIERRE_POSTULACION: '2026-11-20',
      FECHA_EJECUCION: '2026-12-10',
      LUGAR: 'Plaza de Armas de Santiago',
      BARRIO: 'Casco Histórico',
      CUPOS_TITULARES: 25,
      CUPOS_SUPLENTES: 10,
      ESTADO: 'ABIERTA',
      RESPONSABLE: 'Coordinación Fomento Productivo',
      ENTIDAD_ORGANIZADORA: 'Subdirección de Desarrollo Económico Local',
      CREADO_EN: hoyIso,
      CREADO_POR: 'admin@santiago.cl'
    },
    {
      ID_INICIATIVA: 'ini-0002',
      TIPO_INICIATIVA: 'FERIA',
      NOMBRE: 'Feria de Diseño y Oficios Barrio Lastarria',
      OBJETIVO: 'Espacio de difusión para creadores de moda, accesorios y artesanía de autor.',
      TEMATICA: 'Diseño de Autor',
      APERTURA_POSTULACION: '2026-08-01',
      CIERRE_POSTULACION: '2026-08-25',
      FECHA_EJECUCION: '2026-09-15',
      LUGAR: 'Paseo Lastarria / Villavicencio',
      BARRIO: 'Barrio Lastarria',
      CUPOS_TITULARES: 18,
      CUPOS_SUPLENTES: 6,
      ESTADO: 'EN_EJECUCION',
      RESPONSABLE: 'Gestión Territorial',
      ENTIDAD_ORGANIZADORA: 'Municipalidad de Santiago',
      CREADO_EN: hoyIso,
      CREADO_POR: 'admin@santiago.cl'
    },
    {
      ID_INICIATIVA: 'ini-0003',
      TIPO_INICIATIVA: 'FERIA',
      NOMBRE: 'Expo Gastronomía Tradicional Yungay',
      OBJETIVO: 'Visibilizar la repostería y comida patrimonial de la comuna.',
      TEMATICA: 'Gastronomía y Dulces Típicos',
      APERTURA_POSTULACION: '2026-07-01',
      CIERRE_POSTULACION: '2026-07-20',
      FECHA_EJECUCION: '2026-08-05',
      LUGAR: 'Plaza Yungay',
      BARRIO: 'Barrio Yungay',
      CUPOS_TITULARES: 15,
      CUPOS_SUPLENTES: 5,
      ESTADO: 'FINALIZADA',
      RESPONSABLE: 'Fomento Productivo',
      ENTIDAD_ORGANIZADORA: 'Municipalidad de Santiago',
      CREADO_EN: hoyIso,
      CREADO_POR: 'admin@santiago.cl'
    }
  ];

  iniciativas.forEach(i => ctx.repoInsertar('INICIATIVAS', i, { auditar: false }));

  // 6. Postulaciones
  const postulaciones = [
    {
      ID_POSTULACION: 'post-0001',
      ID_INICIATIVA: 'ini-0001',
      ID_EMPRENDIMIENTO: 'emp-0001',
      ID_PERSONA_CONTACTO: 'per-0001',
      FECHA_POSTULACION: hoyIso,
      ESTADO_POSTULACION: 'ADMISIBLE',
      CREADO_EN: hoyIso,
      CREADO_POR: 'admin@santiago.cl'
    },
    {
      ID_POSTULACION: 'post-0002',
      ID_INICIATIVA: 'ini-0001',
      ID_EMPRENDIMIENTO: 'emp-0002',
      ID_PERSONA_CONTACTO: 'per-0002',
      FECHA_POSTULACION: hoyIso,
      ESTADO_POSTULACION: 'ADMISIBLE',
      CREADO_EN: hoyIso,
      CREADO_POR: 'admin@santiago.cl'
    },
    {
      ID_POSTULACION: 'post-0003',
      ID_INICIATIVA: 'ini-0002',
      ID_EMPRENDIMIENTO: 'emp-0001',
      ID_PERSONA_CONTACTO: 'per-0001',
      FECHA_POSTULACION: hoyIso,
      ESTADO_POSTULACION: 'SELECCIONADO',
      CREADO_EN: hoyIso,
      CREADO_POR: 'admin@santiago.cl'
    },
    {
      ID_POSTULACION: 'post-0004',
      ID_INICIATIVA: 'ini-0002',
      ID_EMPRENDIMIENTO: 'emp-0003',
      ID_PERSONA_CONTACTO: 'per-0003',
      FECHA_POSTULACION: hoyIso,
      ESTADO_POSTULACION: 'EVALUACION_PENDIENTE',
      CREADO_EN: hoyIso,
      CREADO_POR: 'admin@santiago.cl'
    },
    {
      ID_POSTULACION: 'post-0005',
      ID_INICIATIVA: 'ini-0003',
      ID_EMPRENDIMIENTO: 'emp-0002',
      ID_PERSONA_CONTACTO: 'per-0002',
      FECHA_POSTULACION: '2026-07-10T12:00:00Z',
      ESTADO_POSTULACION: 'FINALIZADA',
      CREADO_EN: hoyIso,
      CREADO_POR: 'admin@santiago.cl'
    }
  ];

  postulaciones.forEach(p => ctx.repoInsertar('POSTULACIONES', p, { auditar: false }));

  // 7. Seguimiento Mercado
  ctx.repoInsertar('SEGUIMIENTO_MERCADO', {
    ID_SEGUIMIENTO: 'seg-0001',
    ID_INICIATIVA: 'ini-0003',
    ID_EMPRENDIMIENTO: 'emp-0002',
    ID_POSTULACION: 'post-0005',
    FECHA_REGISTRO: '2026-08-06',
    VENTAS_ANTES: 250000,
    VENTAS_DURANTE: 780000,
    VENTAS_DESPUES: 380000,
    SEGUIDORES_ANTES: 1200,
    SEGUIDORES_DESPUES: 1650,
    PUNTUALIDAD: 'EXCELENTE',
    RESPONSABILIDAD: 'EXCELENTE',
    EVALUACION_FUNCIONARIO: 'Emprendimiento con gran recepción y alta calidad gastronómica.',
    OBSERVACION: 'Participación destacada sin incidentes.',
    REGISTRADO_POR: 'admin@santiago.cl'
  }, { auditar: false });

  // 8. Eventos de Auditoría iniciales
  ctx.repoInsertar('AUDITORIA', {
    ID_EVENTO_AUDITORIA: 'aud-0001',
    FECHA_HORA: hoyIso,
    ID_USUARIO: 'admin@santiago.cl',
    ROL: 'ADMIN',
    ACCION: 'INSTALAR',
    ENTIDAD: 'SISTEMA',
    ID_REGISTRO: 'SGE-2.1.0',
    MOTIVO: 'Inicialización de la plataforma SGE 2.1.0 Ficha Integral',
    ID_CORRELACION: crypto.randomUUID()
  }, { auditar: false });
}
