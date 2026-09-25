// DriveStorageService.gs
// SGE v2.1.0 - Servicio de gestión documental digital en Google Drive y Google Sheets
// Almacenamiento organizado en Unidad Compartida / Mi Unidad, deduplicación SHA-256 y versionamiento

/**
 * Calcula el Hash SHA-256 de los bytes de un archivo para deduplicación exacta.
 * @param {Array<number>} bytes
 * @returns {string} Hexadecimal en minúsculas
 */
function calcularSha256Bytes_(bytes) {
  try {
    if (typeof Utilities !== 'undefined' && Utilities.computeDigest) {
      const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes);
      return digest.map(function(byte) {
        const v = (byte < 0 ? byte + 256 : byte).toString(16);
        return v.length === 1 ? '0' + v : v;
      }).join('');
    }
  } catch (e) {}

  // Fallback si corre en entorno Node.js
  try {
    if (typeof crypto !== 'undefined' && crypto.createHash) {
      return crypto.createHash('sha256').update(Buffer.from(bytes)).digest('hex');
    }
  } catch (e) {}

  return 'sha256_' + Date.now().toString(16);
}

/**
 * Obtiene o crea la carpeta raíz del sistema SGE en Google Drive.
 * @returns {GoogleAppsScript.Drive.Folder}
 */
function driveObtenerCarpetaRaiz_() {
  if (typeof DriveApp === 'undefined') {
    throw new Error('DriveApp no está disponible en este entorno.');
  }

  let folderId = '';
  try {
    if (typeof PropertiesService !== 'undefined' && PropertiesService.getScriptProperties) {
      const props = PropertiesService.getScriptProperties();
      folderId = props.getProperty('DRIVE_ROOT_FOLDER_ID') || 
                 props.getProperty('SGE_ROOT_FOLDER_ID') || '';
    }
    if (!folderId && typeof PREINSTALACION_DRIVE !== 'undefined' && PREINSTALACION_DRIVE.ROOT_FOLDER_ID) {
      folderId = PREINSTALACION_DRIVE.ROOT_FOLDER_ID;
    }
  } catch (e) {}

  if (folderId) {
    try {
      return DriveApp.getFolderById(folderId);
    } catch (e) {}
  }

  const nombreCarpeta = 'DIDEL - Sistema de Gestión de Emprendimientos';
  const folders = DriveApp.getFoldersByName(nombreCarpeta);
  if (folders.hasNext()) {
    return folders.next();
  }
  return DriveApp.createFolder(nombreCarpeta);
}

function driveObtenerOCrearSubcarpeta_(padre, nombre) {
  const existentes = padre.getFoldersByName(nombre);
  if (existentes.hasNext()) {
    return existentes.next();
  }
  return padre.createFolder(nombre);
}

function formatearRutChileno_(rut) {
  if (!rut) return '';
  const limpio = String(rut).replace(/[^0-9kK]/g, '').toUpperCase();
  if (limpio.length < 2) return limpio;
  const cuerpo = limpio.slice(0, -1);
  const dv = limpio.slice(-1);
  return cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + '-' + dv;
}

function driveObtenerCarpetaEmprendedor_(rutLimpio, infoExtra) {
  const raiz = driveObtenerCarpetaRaiz_();
  let carpetaExpedientesRaiz = null;
  const foldersRaiz = raiz.getFolders();
  while (foldersRaiz.hasNext()) {
    const f = foldersRaiz.next();
    const fName = f.getName().trim();
    if (fName === '01_Expedientes' || fName === 'Expedientes') {
      carpetaExpedientesRaiz = f;
      break;
    }
  }
  if (!carpetaExpedientesRaiz) {
    carpetaExpedientesRaiz = driveObtenerOCrearSubcarpeta_(raiz, '01_Expedientes');
  }

  const anioActual = new Date().getFullYear().toString();
  const carpetaExpedientes = driveObtenerOCrearSubcarpeta_(carpetaExpedientesRaiz, anioActual);
  
  const rutNormalizado = (typeof normalizarRut === 'function' ? normalizarRut(rutLimpio) : rutLimpio) || 'SIN_RUT';
  const info = infoExtra || {};
  const rutFmt = info.rutFormateado || formatearRutChileno_(rutNormalizado) || rutNormalizado;
  const nomPersona = (info.nombrePersona || '').trim();
  const nomEmp = (info.nombreEmprendimiento || '').trim();

  // Armar nombre institucional descriptivo:
  // Ej: "11.111.111-1 - Francisca Paz Morales Ríos - Cerámicas y Diseños Yungay"
  const partes = [rutFmt];
  if (nomPersona) partes.push(nomPersona);
  if (nomEmp && nomEmp.toLowerCase() !== nomPersona.toLowerCase()) partes.push(nomEmp);
  const nombreObjetivo = partes.join(' - ');

  // Buscar si ya existe una carpeta para este RUT
  const folders = carpetaExpedientes.getFolders();
  let carpetaEncontrada = null;

  while (folders.hasNext()) {
    const f = folders.next();
    const fName = f.getName().trim();
    if (fName === rutNormalizado || 
        fName.startsWith(rutFmt) || 
        fName.startsWith(rutNormalizado) ||
        (fName.indexOf(rutNormalizado) >= 0 && (nomPersona || nomEmp))) {
      carpetaEncontrada = f;
      break;
    }
  }

  if (carpetaEncontrada) {
    if (carpetaEncontrada.getName() !== nombreObjetivo && (nomPersona || nomEmp)) {
      try {
        carpetaEncontrada.setName(nombreObjetivo);
      } catch (errRename) {
        Logger.log('Aviso al renombrar carpeta de expediente: ' + errRename.message);
      }
    }
    return carpetaEncontrada;
  }

  return carpetaExpedientes.createFolder(nombreObjetivo);
}

/**
 * Carga un documento en Google Drive y lo registra en la base de datos de Google Sheets.
 * Realiza deduplicación mediante SHA-256 y versionamiento automático (REEMPLAZADO -> VIGENTE).
 * @param {object} params
 * @param {string} params.rut - RUT del emprendedor
 * @param {string} params.tipoDocumento - Ej: "CEDULA_IDENTIDAD", "RSH", "INICIO_ACTIVIDADES"
 * @param {object} params.archivo - { name, mimeType, base64 } o Blob
 * @param {string} [params.usuarioEmail]
 * @returns {{ success: boolean, data: object|null, error: string|null }}
 */
function cargarDocumentoExpediente(params) {
  try {
    if (!params || !params.archivo) {
      return { success: false, data: null, error: 'Debe adjuntar el archivo a subir.' };
    }

    const rutLimpio = typeof normalizarRut === 'function' ? normalizarRut(params.rut) : String(params.rut || '').replace(/[^0-9kK]/g, '').toUpperCase();
    const tipo = (params.tipoDocumento || 'OTRO').toUpperCase().replace(/[^A-Z0-9_]/g, '_');
    const usuario = params.usuarioEmail || 'sistema@santiago.cl';

    // 1. Obtener bytes y nombre original
    let bytes = [];
    let mimeType = 'application/pdf';
    let originalName = 'documento.pdf';
    let blob = params.archivo;

    if (typeof blob.getBytes === 'function') {
      bytes = blob.getBytes();
      originalName = blob.getName ? blob.getName() : 'documento.pdf';
      mimeType = blob.getContentType ? blob.getContentType() : 'application/pdf';
    } else if (blob.base64) {
      bytes = Utilities.base64Decode(blob.base64);
      originalName = blob.name || 'documento.pdf';
      mimeType = blob.mimeType || 'application/pdf';
      blob = Utilities.newBlob(bytes, mimeType, originalName);
    } else {
      return { success: false, data: null, error: 'Formato de archivo binario no válido.' };
    }

    // 2. Calcular huella SHA-256
    const sha256 = calcularSha256Bytes_(bytes);

    // 3. Buscar persona y emprendimiento en Google Sheets
    let idPersona = '';
    let nombrePersona = params.nombrePersona || '';
    let rutFormateado = params.rutFormateado || formatearRutChileno_(rutLimpio);
    let nombreEmprendimiento = params.nombreEmprendimiento || '';
    let idEmprendimiento = '';

    if (typeof repoTodos === 'function') {
      const personas = repoTodos('PERSONAS', { incluirInactivos: true }) || [];
      const per = personas.find(p => {
        const pRut = typeof normalizarRut === 'function' ? normalizarRut(p.RUT_NORMALIZADO || p.RUT) : (p.RUT_NORMALIZADO || p.RUT);
        return pRut === rutLimpio || p.ID_PERSONA === params.rut;
      });
      if (per) {
        idPersona = per.ID_PERSONA;
        if (!nombrePersona) {
          nombrePersona = [per.NOMBRES, per.APELLIDO_PATERNO, per.APELLIDO_MATERNO].filter(Boolean).join(' ').trim();
        }
        rutFormateado = per.RUT_NORMALIZADO ? formatearRutChileno_(per.RUT_NORMALIZADO) : rutFormateado;

        // Buscar emprendimiento vinculado
        const rels = repoTodos('PERSONA_EMPRENDIMIENTO', { incluirInactivos: true }) || [];
        const rel = rels.find(r => r.ID_PERSONA === idPersona && r.ESTADO_REGISTRO !== 'INACTIVO');
        if (rel) {
          idEmprendimiento = rel.ID_EMPRENDIMIENTO;
          const emps = repoTodos('EMPRENDIMIENTOS', { incluirInactivos: true }) || [];
          const emp = emps.find(e => e.ID_EMPRENDIMIENTO === idEmprendimiento);
          if (emp && !nombreEmprendimiento) {
            nombreEmprendimiento = emp.NOMBRE_COMERCIAL || '';
          }
        }
      }
    }

    // 4. Chequeo de duplicidad de bytes exacta en Google Sheets (HUELLA_ARCHIVO)
    if (typeof repoTodos === 'function') {
      const docsExistentes = repoTodos('DOCUMENTOS', { incluirInactivos: true }) || [];
      const docDuplicado = docsExistentes.find(d => {
        return (d.HUELLA_ARCHIVO === sha256) && (!idPersona || d.ID_SUJETO === idPersona || d.ID_SUJETO === idEmprendimiento);
      });

      if (docDuplicado && docDuplicado.ID_ARCHIVO_DRIVE) {
        let driveUrl = '';
        try {
          driveUrl = DriveApp.getFileById(docDuplicado.ID_ARCHIVO_DRIVE).getUrl();
        } catch (e) {}

        return {
          success: true,
          data: {
            idDocumento: docDuplicado.ID_DOCUMENTO,
            driveUrl: driveUrl,
            sha256Hash: sha256,
            reutilizado: true,
            mensaje: 'El archivo subido es idéntico a uno ya existente (mismo hash SHA-256). Se reutilizó el expediente digital sin duplicar espacio en Drive.'
          },
          error: null
        };
      }
    }

    // 5. Subir a Google Drive
    const carpeta = driveObtenerCarpetaEmprendedor_(rutLimpio, {
      rutFormateado: rutFormateado,
      nombrePersona: nombrePersona,
      nombreEmprendimiento: nombreEmprendimiento
    });
    const extension = originalName.lastIndexOf('.') >= 0 ? originalName.slice(originalName.lastIndexOf('.')) : '.pdf';
    const timestamp = Utilities.formatDate(new Date(), 'America/Santiago', 'yyyyMMdd_HHmmss');
    const nuevoNombre = `${tipo}_${rutLimpio || 'EXP'}_${timestamp}${extension}`;

    blob.setName(nuevoNombre);
    const driveFile = carpeta.createFile(blob);

    try {
      driveFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (e) {}

    const fileId = driveFile.getId();
    const fileUrl = driveFile.getUrl();

    // 6. Versionamiento y registro en Google Sheets (DOCUMENTOS)
    const idDocumentoNuevo = 'doc-' + Utilities.getUuid();
    const idSujeto = idPersona || idEmprendimiento || rutLimpio;
    const tipoSujeto = idPersona ? 'PERSONA' : 'EMPRENDIMIENTO';

    if (typeof repoTodos === 'function') {
      const docsPrevios = repoTodos('DOCUMENTOS', { incluirInactivos: true }) || [];
      docsPrevios.forEach(doc => {
        if (doc.ID_SUJETO === idSujeto && doc.TIPO_DOCUMENTO === tipo && doc.ES_VERSION_VIGENTE === 'SI') {
          try {
            repoActualizar('DOCUMENTOS', doc.ID_DOCUMENTO, {
              ES_VERSION_VIGENTE: 'NO',
              ESTADO_REVISION: 'REEMPLAZADO',
              ACTUALIZADO_EN: ahoraIso_(),
              ACTUALIZADO_POR: usuario
            }, { auditar: false });
          } catch (e) {}
        }
      });

      repoInsertar('DOCUMENTOS', {
        ID_DOCUMENTO: idDocumentoNuevo,
        TIPO_SUJETO: tipoSujeto,
        ID_SUJETO: idSujeto,
        TIPO_DOCUMENTO: tipo,
        ID_ARCHIVO_DRIVE: fileId,
        VERSION: 1,
        FECHA_EMISION: '',
        FECHA_VENCIMIENTO: '',
        ESTADO_REVISION: 'RECIBIDO',
        REVISADO_POR: '',
        REVISADO_EN: '',
        MOTIVO_OBSERVACION: '',
        ES_VERSION_VIGENTE: 'SI',
        CREADO_EN: ahoraIso_(),
        CREADO_POR: usuario,
        HUELLA_ARCHIVO: sha256
      }, { motivo: 'Carga de expediente documental' });

      // Registrar en Auditoría
      try {
        repoInsertar('AUDITORIA', {
          ID_EVENTO_AUDITORIA: 'aud-' + Utilities.getUuid(),
          FECHA_HORA: ahoraIso_(),
          ID_USUARIO: usuario,
          ROL: 'OPERADOR',
          ACCION: 'SUBIR_DOCUMENTO',
          ENTIDAD: 'DOCUMENTOS',
          ID_REGISTRO: idDocumentoNuevo,
          VALOR_ANTERIOR: '',
          VALOR_NUEVO: JSON.stringify({ tipo: tipo, rut: rutLimpio, sha256: sha256, driveId: fileId }),
          MOTIVO: 'Recepción de documento para expediente',
          ID_CORRELACION: ''
        }, { auditar: false });
      } catch (e) {}
    }

    return {
      success: true,
      data: {
        idDocumento: idDocumentoNuevo,
        driveUrl: fileUrl,
        driveFileId: fileId,
        nombreArchivo: nuevoNombre,
        sha256Hash: sha256,
        versionVigente: 'SI',
        estadoRevision: 'RECIBIDO',
        reutilizado: false,
        mensaje: 'Documento almacenado exitosamente en Google Drive y registrado con versión vigente en Google Sheets.'
      },
      error: null
    };
  } catch (err) {
    return {
      success: false,
      data: null,
      error: 'Error al procesar expediente documental: ' + (err.message || String(err))
    };
  }
}

/**
 * Consulta y retorna el expediente completo de documentos registrados para un emprendedor.
 * Permite al funcionario auditar la documentación y fotos en terreno.
 * @param {string} identificador - RUT, id_persona o id_emprendimiento
 * @returns {{ success: boolean, data: Array<object>, error: string|null }}
 */
function obtenerDocumentosEmprendedor(identificador) {
  try {
    if (!identificador) {
      return { success: false, data: [], error: 'Identificador de emprendedor no proporcionado.' };
    }

    const rutLimpio = typeof normalizarRut === 'function' ? normalizarRut(identificador) : String(identificador).replace(/[^0-9kK]/g, '').toUpperCase();
    const personas = typeof repoTodos === 'function' ? (repoTodos('PERSONAS', { incluirInactivos: true }) || []) : [];
    const per = personas.find(p => {
      const pRut = typeof normalizarRut === 'function' ? normalizarRut(p.RUT_NORMALIZADO || p.RUT) : (p.RUT_NORMALIZADO || p.RUT);
      return pRut === rutLimpio || p.ID_PERSONA === identificador;
    });

    const emps = typeof repoTodos === 'function' ? (repoTodos('EMPRENDIMIENTOS', { incluirInactivos: true }) || []) : [];
    const rels = typeof repoTodos === 'function' ? (repoTodos('PERSONA_EMPRENDIMIENTO', { incluirInactivos: true }) || []) : [];
    
    let idPersona = per ? per.ID_PERSONA : null;
    let idEmprendimiento = null;

    if (idPersona) {
      const rel = rels.find(r => r.ID_PERSONA === idPersona && r.ESTADO_REGISTRO !== 'INACTIVO');
      if (rel) idEmprendimiento = rel.ID_EMPRENDIMIENTO;
    } else {
      const empDirecto = emps.find(e => e.ID_EMPRENDIMIENTO === identificador);
      if (empDirecto) {
        idEmprendimiento = empDirecto.ID_EMPRENDIMIENTO;
        const rel = rels.find(r => r.ID_EMPRENDIMIENTO === idEmprendimiento && r.ESTADO_REGISTRO !== 'INACTIVO');
        if (rel) idPersona = rel.ID_PERSONA;
      }
    }

    const docs = typeof repoTodos === 'function' ? (repoTodos('DOCUMENTOS', { incluirInactivos: true }) || []) : [];
    const docsFiltrados = docs.filter(d => {
      if (idPersona && d.ID_SUJETO === idPersona) return true;
      if (idEmprendimiento && d.ID_SUJETO === idEmprendimiento) return true;
      if (rutLimpio && d.ID_SUJETO === rutLimpio) return true;
      return false;
    });

    // Mapear al formato que espera la vista
    const resultado = docsFiltrados.map(d => {
      let urlDrive = '';
      let nombreArchivo = d.TIPO_DOCUMENTO || 'documento.pdf';
      let mimeType = 'application/pdf';

      if (d.ID_ARCHIVO_DRIVE && typeof DriveApp !== 'undefined') {
        try {
          const file = DriveApp.getFileById(d.ID_ARCHIVO_DRIVE);
          urlDrive = file.getUrl();
          nombreArchivo = file.getName();
          mimeType = file.getMimeType();
        } catch (e) {
          urlDrive = `https://drive.google.com/file/d/${d.ID_ARCHIVO_DRIVE}/view`;
        }
      }

      return {
        id_documento: d.ID_DOCUMENTO,
        tipo_documento: d.TIPO_DOCUMENTO,
        version_vigente: d.ES_VERSION_VIGENTE || 'SI',
        estado_revision: d.ESTADO_REVISION || 'RECIBIDO',
        drive_file_id: d.ID_ARCHIVO_DRIVE,
        drive_url: urlDrive,
        nombre_archivo: nombreArchivo,
        mime_type: mimeType,
        tamano_bytes: 0,
        fecha_emision: d.FECHA_EMISION || '',
        fecha_vencimiento: d.FECHA_VENCIMIENTO || '',
        observaciones: d.MOTIVO_OBSERVACION || '',
        creado_en: d.CREADO_EN || ahoraIso_()
      };
    });

    // Ordenar: primero vigentes, luego por fecha más reciente
    resultado.sort((a, b) => {
      if (a.version_vigente !== b.version_vigente) {
        return a.version_vigente === 'SI' ? -1 : 1;
      }
      return String(b.creado_en).localeCompare(String(a.creado_en));
    });

    return {
      success: true,
      data: resultado,
      error: null
    };
  } catch (err) {
    return { success: false, data: [], error: err.message || String(err) };
  }
}

/**
 * Normaliza y renombra todas las carpetas existentes en Drive/Expedientes para que lleven el formato institucional:
 * "RUT_FORMATEADO - Nombre Persona - Nombre Emprendimiento"
 * @returns {{ success: boolean, renombradas: Array, error: string|null }}
 */
function driveNormalizarNombresCarpetasExistentes() {
  try {
    const raiz = driveObtenerCarpetaRaiz_();
    const anioActual = new Date().getFullYear().toString();
    const carpetaAnio = driveObtenerOCrearSubcarpeta_(raiz, anioActual);
    const carpetaExpedientes = driveObtenerOCrearSubcarpeta_(carpetaAnio, 'Expedientes');
    const folders = carpetaExpedientes.getFolders();
    const renombradas = [];

    const personas = typeof repoTodos === 'function' ? (repoTodos('PERSONAS', { incluirInactivos: false }) || []) : [];
    const emps = typeof repoTodos === 'function' ? (repoTodos('EMPRENDIMIENTOS', { incluirInactivos: false }) || []) : [];
    const rels = typeof repoTodos === 'function' ? (repoTodos('PERSONA_EMPRENDIMIENTO', { incluirInactivos: false }) || []) : [];

    while (folders.hasNext()) {
      const folder = folders.next();
      const currentName = folder.getName().trim();
      const matchRut = currentName.match(/(\d{7,8}[0-9kK]?)/);
      if (matchRut) {
        const rutLimpio = typeof normalizarRut === 'function' ? normalizarRut(matchRut[1]) : matchRut[1];
        const per = personas.find(p => {
          const r = typeof normalizarRut === 'function' ? normalizarRut(p.RUT_NORMALIZADO || p.RUT) : (p.RUT_NORMALIZADO || p.RUT);
          return r === rutLimpio;
        });

        if (per) {
          const rutFmt = formatearRutChileno_(rutLimpio);
          const nomPersona = [per.NOMBRES, per.APELLIDO_PATERNO, per.APELLIDO_MATERNO].filter(Boolean).join(' ').trim();
          let nomEmp = '';
          const rel = rels.find(r => r.ID_PERSONA === per.ID_PERSONA);
          if (rel) {
            const emp = emps.find(e => e.ID_EMPRENDIMIENTO === rel.ID_EMPRENDIMIENTO);
            if (emp) nomEmp = (emp.NOMBRE_COMERCIAL || '').trim();
          }

          const partes = [rutFmt];
          if (nomPersona) partes.push(nomPersona);
          if (nomEmp && nomEmp.toLowerCase() !== nomPersona.toLowerCase()) partes.push(nomEmp);
          const nuevoNombre = partes.join(' - ');

          if (currentName !== nuevoNombre) {
            folder.setName(nuevoNombre);
            renombradas.push({ antes: currentName, despues: nuevoNombre });
          }
        }
      }
    }
    return { success: true, renombradas: renombradas, error: null };
  } catch (e) {
    return { success: false, renombradas: [], error: e.message || String(e) };
  }
}
