// DriveStorageService.gs
// Servicio de gestión documental digital con Google Drive y Turso libSQL
// Incluye cálculo de Hash SHA-256 para evitar duplicidad de bytes y versionamiento automático

/**
 * Calcula el Hash SHA-256 de los bytes de un archivo.
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
      folderId = PropertiesService.getScriptProperties().getProperty('DRIVE_ROOT_FOLDER_ID') || '';
    }
  } catch (e) {}

  if (folderId) {
    try {
      return DriveApp.getFolderById(folderId);
    } catch (e) {}
  }

  const nombreCarpeta = 'SGE_Municipalidad_Santiago';
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
  const anioActual = new Date().getFullYear().toString();
  const carpetaAnio = driveObtenerOCrearSubcarpeta_(raiz, anioActual);
  const carpetaExpedientes = driveObtenerOCrearSubcarpeta_(carpetaAnio, 'Expedientes');
  
  const rutNormalizado = normalizarRut(rutLimpio) || 'SIN_RUT';
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

  // Buscar si ya existe una carpeta para este RUT (con nombre sin formato "111111111", formateado o completo)
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
    // Si la carpeta existe pero solo tiene el RUT o le faltaban los nombres, renombrarla automáticamente
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
 * Carga un documento en Drive y lo registra en Turso.
 * Realiza deduplicación mediante SHA-256 y versionamiento automático (REEMPLAZADO -> VIGENTE).
 * @param {object} params
 * @param {string} params.rut - RUT del emprendedor
 * @param {string} params.tipoDocumento - Ej: "CEDULA_IDENTIDAD", "RSH", "INICIO_ACTIVIDADES_SII"
 * @param {object} params.archivo - { name, mimeType, base64 } o Blob
 * @param {string} [params.usuarioEmail]
 * @returns {{ success: boolean, data: object|null, error: string|null }}
 */
function cargarDocumentoExpediente(params) {
  try {
    if (!params || !params.archivo) {
      return { success: false, data: null, error: 'Debe adjuntar el archivo a subir.' };
    }

    const rutLimpio = normalizarRut(params.rut);
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
    const tamanoBytes = bytes.length;

    // 3. Buscar persona y emprendimiento en Turso
    const qPersona = tursoEjecutar(
      `SELECT id_persona, rut_formateado, nombres, apellidos FROM personas WHERE rut = ? OR rut_formateado = ? LIMIT 1;`,
      [rutLimpio, params.rut]
    );
    const persona = qPersona.success && qPersona.data.rows && qPersona.data.rows[0];
    const idPersona = persona ? persona.id_persona : null;

    let nombrePersona = params.nombrePersona || '';
    if (!nombrePersona && persona) {
      nombrePersona = [persona.nombres, persona.apellidos].filter(Boolean).join(' ').trim();
    }
    let rutFormateado = (persona && persona.rut_formateado) || (params.rutFormateado || '');
    if (!rutFormateado) {
      rutFormateado = formatearRutChileno_(rutLimpio) || rutLimpio;
    }

    let nombreEmprendimiento = params.nombreEmprendimiento || '';
    if (!nombreEmprendimiento && idPersona) {
      const qEmp = tursoEjecutar(
        `SELECT e.nombre_comercial, e.nombre_fantasia 
         FROM emprendimientos e
         JOIN persona_emprendimiento pe ON pe.id_emprendimiento = e.id_emprendimiento
         WHERE pe.id_persona = ?
         LIMIT 1;`,
        [idPersona]
      );
      if (qEmp.success && qEmp.data.rows && qEmp.data.rows[0]) {
        nombreEmprendimiento = qEmp.data.rows[0].nombre_comercial || qEmp.data.rows[0].nombre_fantasia || '';
      }
    }

    // 4. Chequeo de duplicidad de bytes exacta en Turso
    const qDuplicado = tursoEjecutar(
      `SELECT id_documento, drive_url, drive_file_id, nombre_archivo, version_vigente 
       FROM documentos 
       WHERE sha256_hash = ? AND (id_persona = ? OR ? IS NULL)
       LIMIT 1;`,
      [sha256, idPersona, idPersona]
    );

    if (qDuplicado.success && qDuplicado.data.rows && qDuplicado.data.rows.length > 0) {
      const docExistente = qDuplicado.data.rows[0];
      return {
        success: true,
        data: {
          idDocumento: docExistente.id_documento,
          driveUrl: docExistente.drive_url,
          sha256Hash: sha256,
          reutilizado: true,
          mensaje: 'El archivo subido es idéntico a uno ya existente (mismo hash SHA-256). Se reutilizó el expediente digital sin duplicar espacio en Drive.'
        },
        error: null
      };
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

    // 6. Versionamiento: marcar documentos previos del mismo tipo como 'REEMPLAZADO' y version_vigente = 'NO'
    const idDocumentoNuevo = 'doc-' + Utilities.getUuid();
    const transacciones = [];

    if (idPersona) {
      transacciones.push({
        sql: `UPDATE documentos 
              SET version_vigente = 'NO', estado_revision = 'REEMPLAZADO', actualizado_en = datetime('now'), actualizado_por = ?
              WHERE id_persona = ? AND tipo_documento = ? AND version_vigente = 'SI';`,
        args: [usuario, idPersona, tipo]
      });
    }

    // 7. Insertar nuevo documento como 'VIGENTE' y 'RECIBIDO'
    transacciones.push({
      sql: `INSERT INTO documentos (
        id_documento, id_persona, tipo_documento, sha256_hash, version_vigente, estado_revision,
        drive_file_id, drive_url, nombre_archivo, mime_type, tamano_bytes, creado_por, actualizado_por, creado_en, actualizado_en
      ) VALUES (?, ?, ?, ?, 'SI', 'RECIBIDO', ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'));`,
      args: [
        idDocumentoNuevo,
        idPersona,
        tipo,
        sha256,
        fileId,
        fileUrl,
        nuevoNombre,
        mimeType,
        tamanoBytes,
        usuario,
        usuario
      ]
    });

    // 8. Registrar en auditoría
    transacciones.push({
      sql: `INSERT INTO auditoria (id_auditoria, accion, entidad, id_entidad, payload_nuevo, usuario_email, timestamp)
            VALUES (?, 'SUBIR_DOCUMENTO', 'DOCUMENTOS', ?, ?, ?, datetime('now'));`,
      args: [
        'aud-' + Utilities.getUuid(),
        idDocumentoNuevo,
        JSON.stringify({ tipo: tipo, rut: rutLimpio, sha256: sha256, driveId: fileId }),
        usuario
      ]
    });

    const txRes = tursoTransaccion(transacciones);
    if (!txRes.success) {
      return {
        success: false,
        data: null,
        error: 'El archivo se guardó en Drive pero falló el registro en Turso: ' + txRes.error
      };
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
        mensaje: 'Documento almacenado exitosamente en Google Drive y registrado con versión vigente en Turso.'
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
 * Consulta y retorna el expediente completo de documentos registrados para un emprendedor,
 * permitiendo al funcionario evaluar la calidad de los productos y verificar la documentación.
 * @param {string} identificador - RUT, id_persona o id_emprendimiento
 * @returns {{ success: boolean, data: Array<object>, error: string|null }}
 */
function obtenerDocumentosEmprendedor(identificador) {
  try {
    if (!identificador) {
      return { success: false, data: [], error: 'Identificador de emprendedor no proporcionado.' };
    }

    const rutLimpio = normalizarRut(identificador);

    const sql = `
      SELECT d.id_documento, d.tipo_documento, d.version_vigente, d.estado_revision,
             d.drive_file_id, d.drive_url, d.nombre_archivo, d.mime_type, d.tamano_bytes,
             d.fecha_emision, d.fecha_vencimiento, d.observaciones, d.creado_en,
             p.id_persona, p.rut, p.rut_formateado, p.nombres, p.apellidos,
             emp.id_emprendimiento, emp.nombre_comercial, emp.rubro, emp.subrubro
      FROM documentos d
      LEFT JOIN personas p ON d.id_persona = p.id_persona
      LEFT JOIN persona_emprendimiento pe ON p.id_persona = pe.id_persona
      LEFT JOIN emprendimientos emp ON (pe.id_emprendimiento = emp.id_emprendimiento OR d.id_emprendimiento = emp.id_emprendimiento)
      WHERE d.id_persona = ?
         OR d.id_emprendimiento = ?
         OR p.rut = ?
         OR p.rut_formateado = ?
         OR emp.id_emprendimiento = ?
      ORDER BY 
        CASE WHEN d.version_vigente = 'SI' THEN 1 ELSE 2 END,
        d.creado_en DESC;
    `;

    const res = tursoEjecutar(sql, [identificador, identificador, rutLimpio, identificador, identificador]);
    if (!res.success) {
      return { success: false, data: [], error: res.error };
    }

    return {
      success: true,
      data: res.data.rows || [],
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

    while (folders.hasNext()) {
      const folder = folders.next();
      const currentName = folder.getName().trim();
      // Extraer secuencia numérica del RUT
      const matchRut = currentName.match(/(\d{7,8}[0-9kK]?)/);
      if (matchRut) {
        const rutLimpio = normalizarRut(matchRut[1]);
        const qPersona = tursoEjecutar(
          `SELECT p.rut_formateado, p.nombres, p.apellidos, e.nombre_comercial, e.nombre_fantasia
           FROM personas p
           LEFT JOIN persona_emprendimiento pe ON pe.id_persona = p.id_persona
           LEFT JOIN emprendimientos e ON e.id_emprendimiento = pe.id_emprendimiento
           WHERE p.rut = ? OR p.rut_formateado = ?
           LIMIT 1;`,
          [rutLimpio, rutLimpio]
        );

        if (qPersona.success && qPersona.data.rows && qPersona.data.rows.length > 0) {
          const row = qPersona.data.rows[0];
          const rutFmt = row.rut_formateado || formatearRutChileno_(rutLimpio);
          const nomPersona = [row.nombres, row.apellidos].filter(Boolean).join(' ').trim();
          const nomEmp = (row.nombre_comercial || row.nombre_fantasia || '').trim();

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


