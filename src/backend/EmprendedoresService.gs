// EmprendedoresService.gs
// Servicio de gestión de personas emprendedoras, emprendimientos y expedientes
// Conecta validaciones chilenas, Turso (libSQL) y Google Drive
// Sistema de Gestión de Emprendimientos (SGE) - Municipalidad de Santiago

/**
 * Genera un UUID v4 seguro o pseudo-aleatorio.
 * @returns {string}
 */
function generarUuid_() {
  if (typeof Utilities !== 'undefined' && Utilities.getUuid) {
    return Utilities.getUuid();
  }
  return 'id-' + Math.random().toString(36).substring(2, 11) + '-' + Date.now().toString(36);
}

/**
 * Registra o actualiza una persona emprendedora junto con su emprendimiento.
 * Realiza todas las validaciones chilenas antes de persistir en Turso.
 * @param {object} payload
 * @returns {{ success: boolean, data: object|null, error: string|null }}
 */
function guardarFichaEmprendedor(payload) {
  try {
    if (!payload) {
      return { success: false, data: null, error: 'No se recibieron datos para guardar.' };
    }

    // 1. Validaciones chilenas estrictas
    const valRut = validarRutChileno(payload.rut);
    if (!valRut.success) {
      return { success: false, data: null, error: valRut.error };
    }

    let telefonoValidado = payload.telefono || '';
    if (telefonoValidado) {
      const valTel = validarTelefonoChileno(telefonoValidado);
      if (!valTel.success) {
        return { success: false, data: null, error: valTel.error };
      }
      telefonoValidado = valTel.data.telefonoE164;
    }

    let emailValidado = payload.email || '';
    if (emailValidado) {
      const valMail = validarEmail(emailValidado);
      if (!valMail.success) {
        return { success: false, data: null, error: valMail.error };
      }
      emailValidado = valMail.data;
    }

    if (!payload.nombres || !payload.apellidos) {
      return { success: false, data: null, error: 'Nombres y apellidos son requeridos.' };
    }

    if (!payload.nombreComercial) {
      return { success: false, data: null, error: 'El nombre comercial del emprendimiento es requerido.' };
    }

    const rutLimpio = valRut.data.rutLimpio;
    const rutFormateado = valRut.data.rutFormateado;

    // 2. Verificar si la persona ya existe en Turso (por idPersona o por RUT)
    let idPersona = payload.idPersona || '';
    if (!idPersona) {
      const checkPersona = tursoEjecutar('SELECT id_persona FROM personas WHERE rut = ? LIMIT 1', [rutLimpio]);
      if (checkPersona.success && checkPersona.data.rows && checkPersona.data.rows.length > 0) {
        idPersona = checkPersona.data.rows[0].id_persona;
      }
    }

    const stmts = [];

    if (idPersona) {
      // Actualizar datos de persona (permitiendo corrección de RUT si fue modificado)
      stmts.push({
        sql: `UPDATE personas SET 
                rut = ?, rut_formateado = ?, nombres = ?, apellidos = ?, email = ?, telefono = ?, comuna = ?, 
                direccion = ?, genero = ?, tramo_rsh = ?, pueblo_originario = ?, 
                discapacidad_declarada = ?, actualizado_en = datetime('now'), actualizado_por = ?
              WHERE id_persona = ?`,
        args: [
          rutLimpio,
          rutFormateado,
          sanitizarTexto(payload.nombres),
          sanitizarTexto(payload.apellidos),
          emailValidado,
          telefonoValidado,
          sanitizarTexto(payload.comuna || 'SANTIAGO'),
          sanitizarTexto(payload.direccion || ''),
          sanitizarTexto(payload.genero || 'NO_INFORMA'),
          sanitizarTexto(payload.tramoRsh || 'SIN_RSH'),
          payload.puebloOriginario ? 'SI' : 'NO',
          payload.discapacidad ? 'SI' : 'NO',
          payload.usuarioEmail || 'sistema@santiago.cl',
          idPersona
        ]
      });
    } else {
      idPersona = 'per-' + generarUuid_();
      stmts.push({
        sql: `INSERT INTO personas (
                id_persona, rut, rut_formateado, nombres, apellidos, email, 
                telefono, comuna, direccion, genero, tramo_rsh, pueblo_originario, discapacidad_declarada, creado_por, actualizado_por
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          idPersona,
          rutLimpio,
          rutFormateado,
          sanitizarTexto(payload.nombres),
          sanitizarTexto(payload.apellidos),
          emailValidado,
          telefonoValidado,
          sanitizarTexto(payload.comuna || 'SANTIAGO'),
          sanitizarTexto(payload.direccion || ''),
          sanitizarTexto(payload.genero || 'NO_INFORMA'),
          sanitizarTexto(payload.tramoRsh || 'SIN_RSH'),
          payload.puebloOriginario ? 'SI' : 'NO',
          payload.discapacidad ? 'SI' : 'NO',
          payload.usuarioEmail || 'sistema@santiago.cl',
          payload.usuarioEmail || 'sistema@santiago.cl'
        ]
      });
    }

    // 3. Crear o actualizar Emprendimiento
    let idEmprendimiento = payload.idEmprendimiento || '';
    if (!idEmprendimiento && idPersona) {
      // Buscar si la persona ya posee un emprendimiento vinculado para no duplicar al editar
      const checkVinc = tursoEjecutar(
        `SELECT id_emprendimiento FROM persona_emprendimiento WHERE id_persona = ? ORDER BY es_titular_principal DESC LIMIT 1;`,
        [idPersona]
      );
      if (checkVinc.success && checkVinc.data.rows && checkVinc.data.rows.length > 0) {
        idEmprendimiento = checkVinc.data.rows[0].id_emprendimiento;
      } else {
        const checkVinc2 = tursoEjecutar(
          `SELECT id_emprendimiento FROM vinculaciones WHERE id_persona = ? LIMIT 1;`,
          [idPersona]
        );
        if (checkVinc2.success && checkVinc2.data.rows && checkVinc2.data.rows.length > 0) {
          idEmprendimiento = checkVinc2.data.rows[0].id_emprendimiento;
        }
      }
    }

    const subrubroCompuesto = (payload.subrubro && payload.especialidad)
      ? `${payload.subrubro} - ${payload.especialidad}`
      : (payload.subrubro || payload.especialidad || '');

    if (idEmprendimiento) {
      stmts.push({
        sql: `UPDATE emprendimientos SET 
                nombre_fantasia = ?, nombre_comercial = ?, rubro = ?, subrubro = ?, descripcion_producto = ?,
                formalizacion_sii = ?, rut_empresa = ?, etapa_madurez = ?,
                instagram = ?, actualizado_en = datetime('now'), actualizado_por = ?
              WHERE id_emprendimiento = ?`,
        args: [
          sanitizarTexto(payload.nombreComercial),
          sanitizarTexto(payload.nombreComercial),
          sanitizarTexto(payload.rubro || 'OTRO'),
          sanitizarTexto(subrubroCompuesto),
          sanitizarTexto(payload.descripcion || payload.especialidad || ''),
          sanitizarTexto(payload.formalizacionSii || 'SIN_INICIO'),
          sanitizarTexto(payload.rutEmpresa || ''),
          sanitizarTexto(payload.etapa || 'IDEA'),
          sanitizarTexto(payload.instagram || ''),
          payload.usuarioEmail || 'sistema@santiago.cl',
          idEmprendimiento
        ]
      });
    } else {
      idEmprendimiento = 'emp-' + generarUuid_();
      stmts.push({
        sql: `INSERT INTO emprendimientos (
                id_emprendimiento, nombre_fantasia, nombre_comercial, rubro, subrubro, descripcion_producto,
                formalizacion_sii, rut_empresa, etapa_madurez, instagram, creado_por, actualizado_por
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          idEmprendimiento,
          sanitizarTexto(payload.nombreComercial),
          sanitizarTexto(payload.nombreComercial),
          sanitizarTexto(payload.rubro || 'OTRO'),
          sanitizarTexto(subrubroCompuesto),
          sanitizarTexto(payload.descripcion || payload.especialidad || ''),
          sanitizarTexto(payload.formalizacionSii || 'SIN_INICIO'),
          sanitizarTexto(payload.rutEmpresa || ''),
          sanitizarTexto(payload.etapa || 'IDEA'),
          sanitizarTexto(payload.instagram || ''),
          payload.usuarioEmail || 'sistema@santiago.cl',
          payload.usuarioEmail || 'sistema@santiago.cl'
        ]
      });

      // Crear vinculación en persona_emprendimiento y en vinculaciones
      const idVinculacion = 'vinc-' + generarUuid_();
      stmts.push({
        sql: `INSERT INTO persona_emprendimiento (id_vinculacion, id_persona, id_emprendimiento, rol, es_titular_principal, creado_por)
              VALUES (?, ?, ?, 'TITULAR', 1, ?)`,
        args: [idVinculacion, idPersona, idEmprendimiento, payload.usuarioEmail || 'sistema@santiago.cl']
      });
      stmts.push({
        sql: `INSERT OR IGNORE INTO vinculaciones (id_vinculacion, id_persona, id_emprendimiento, rol, es_contacto_principal)
              VALUES (?, ?, ?, 'TITULAR', 1);`,
        args: [idVinculacion, idPersona, idEmprendimiento]
      });
    }

    // 4. Registro en Auditoría
    const idAudit = 'aud-' + generarUuid_();
    stmts.push({
      sql: `INSERT INTO auditoria (id_auditoria, usuario_email, accion, entidad, id_entidad, payload_nuevo)
            VALUES (?, ?, ?, 'FICHA_INTEGRAL', ?, ?)`,
      args: [
        idAudit,
        payload.usuarioEmail || 'sistema@santiago.cl',
        existePersona ? 'ACTUALIZAR' : 'CREAR',
        idPersona,
        JSON.stringify({ rut: rutLimpio, emprendimiento: payload.nombreComercial })
      ]
    });

    // 5. Ejecutar transacción en Turso
    const tx = tursoTransaccion(stmts);
    if (!tx.success) {
      return { success: false, data: null, error: 'Error guardando en Turso: ' + tx.error };
    }

    return {
      success: true,
      data: {
        idPersona: idPersona,
        idEmprendimiento: idEmprendimiento,
        rutFormateado: rutFormateado,
        mensaje: existePersona ? 'Ficha actualizada exitosamente.' : 'Emprendedor registrado exitosamente.'
      },
      error: null
    };
  } catch (err) {
    return {
      success: false,
      data: null,
      error: 'Error al procesar la ficha: ' + (err.message || String(err))
    };
  }
}

/**
 * Obtiene la ficha completa de un emprendedor buscando por su RUT o ID.
 * Trae persona, emprendimientos, vinculaciones y documentos registrados.
 * @param {string} rutOId
 * @returns {{ success: boolean, data: object|null, error: string|null }}
 */
function obtenerFichaIntegral(rutOId) {
  try {
    if (!rutOId) {
      return { success: false, data: null, error: 'Se requiere RUT o ID de la persona.' };
    }

    const rutLimpio = normalizarRut(rutOId);

    // Buscar persona
    const qPersona = tursoEjecutar(
      'SELECT * FROM personas WHERE rut = ? OR id_persona = ? LIMIT 1',
      [rutLimpio, rutOId]
    );

    if (!qPersona.success || !qPersona.data.rows || qPersona.data.rows.length === 0) {
      if (typeof repoTodos === 'function') {
        const personas = repoTodos('PERSONAS') || [];
        const personaLocal = personas.find(p => p.RUT === rutOId || p.ID_PERSONA === rutOId || normalizarRut(p.RUT) === rutLimpio);
        if (personaLocal) {
          const vincs = repoTodos('VINCULACIONES') || [];
          const emps = repoTodos('EMPRENDIMIENTOS') || [];
          const docs = repoTodos('DOCUMENTOS') || [];
          const userVincs = vincs.filter(v => v.ID_PERSONA === personaLocal.ID_PERSONA);
          const userEmps = emps.filter(e => userVincs.some(v => v.ID_EMPRENDIMIENTO === e.ID_EMPRENDIMIENTO));
          const userDocs = docs.filter(d => d.ID_SUJETO === personaLocal.ID_PERSONA);

          return {
            success: true,
            data: {
              persona: {
                id_persona: personaLocal.ID_PERSONA,
                rut: personaLocal.RUT,
                rut_formateado: personaLocal.RUT,
                nombres: personaLocal.NOMBRES,
                apellidos: personaLocal.APELLIDOS,
                email: personaLocal.EMAIL,
                telefono: personaLocal.TELEFONO,
                comuna: personaLocal.COMUNA || 'SANTIAGO',
                tramo_rsh: personaLocal.TRAMO_RSH
              },
              emprendimientos: userEmps.map(e => ({
                id_emprendimiento: e.ID_EMPRENDIMIENTO,
                nombre_comercial: e.NOMBRE_COMERCIAL,
                rubro: e.ID_RUBRO,
                formalizacion_sii: e.FORMALIZACION_SII,
                instagram: e.INSTAGRAM
              })),
              documentos: userDocs.map(d => ({
                id_documento: d.ID_DOCUMENTO,
                tipo_documento: d.TIPO_DOCUMENTO,
                nombre_archivo: d.NOMBRE_ORIGINAL,
                drive_url: d.DRIVE_URL
              })),
              postulaciones: []
            },
            error: null
          };
        }
      }
      return { success: false, data: null, error: 'No se encontró ninguna persona con los datos especificados.' };
    }

    const persona = qPersona.data.rows[0];
    const idPersona = persona.id_persona;

    // Buscar emprendimientos vinculados
    const qEmps = tursoEjecutar(
      `SELECT e.*, v.rol, v.es_contacto_principal 
       FROM emprendimientos e
       INNER JOIN vinculaciones v ON v.id_emprendimiento = e.id_emprendimiento
       WHERE v.id_persona = ? AND e.activo = 1`,
      [idPersona]
    );

    // Buscar documentos en expediente
    const qDocs = tursoEjecutar(
      `SELECT * FROM documentos 
       WHERE (id_persona = ? OR id_emprendimiento IN (
         SELECT id_emprendimiento FROM vinculaciones WHERE id_persona = ?
       ))
       ORDER BY creado_en DESC`,
      [idPersona, idPersona]
    );

    // Buscar postulaciones históricas
    const qPosts = tursoEjecutar(
      `SELECT p.*, i.nombre AS nombre_iniciativa, i.codigo AS codigo_iniciativa, i.tipo AS tipo_iniciativa
       FROM postulaciones p
       INNER JOIN iniciativas i ON i.id_iniciativa = p.id_iniciativa
       WHERE p.id_persona_contacto = ?
       ORDER BY p.fecha_postulacion DESC`,
      [idPersona]
    );

    return {
      success: true,
      data: {
        persona: persona,
        emprendimientos: (qEmps.success && qEmps.data.rows) || [],
        documentos: (qDocs.success && qDocs.data.rows) || [],
        postulaciones: (qPosts.success && qPosts.data.rows) || []
      },
      error: null
    };
  } catch (err) {
    return {
      success: false,
      data: null,
      error: 'Error al consultar la ficha: ' + (err.message || String(err))
    };
  }
}

/**
 * Lista personas y emprendimientos con filtros de búsqueda y paginación.
 * @param {object} filtros
 * @param {string} [filtros.termino] - Búsqueda por RUT, nombre o nombre comercial
 * @param {string} [filtros.rubro]
 * @param {number} [filtros.limite]
 * @returns {{ success: boolean, data: Array<object>|null, error: string|null }}
 */
function listarFichasEmprendedores(filtros = {}) {
  try {
    const termino = (filtros.termino || '').trim();
    const rubro = (filtros.rubro || '').trim();
    const limite = Math.min(parseInt(filtros.limite, 10) || 50, 100);

    let sql = `
      SELECT 
        p.id_persona, p.rut, p.rut_formateado, p.nombres, p.apellidos, 
        p.email, p.telefono, p.comuna, p.tramo_rsh,
        e.id_emprendimiento, e.nombre_comercial, e.rubro, e.subrubro, e.formalizacion_sii,
        v.rol
      FROM personas p
      LEFT JOIN vinculaciones v ON v.id_persona = p.id_persona
      LEFT JOIN emprendimientos e ON e.id_emprendimiento = v.id_emprendimiento
      WHERE p.activo = 1
    `;
    const args = [];

    if (termino) {
      const terminoLimpio = normalizarRut(termino);
      sql += ` AND (p.rut LIKE ? OR p.nombres LIKE ? OR p.apellidos LIKE ? OR e.nombre_comercial LIKE ?)`;
      const likeTerm = `%${termino}%`;
      const likeRut = `%${terminoLimpio || termino}%`;
      args.push(likeRut, likeTerm, likeTerm, likeTerm);
    }

    if (rubro) {
      sql += ` AND e.rubro = ?`;
      args.push(rubro);
    }

    sql += ` ORDER BY p.actualizado_en DESC LIMIT ?`;
    args.push(limite);

    const query = tursoEjecutar(sql, args);
    if (!query.success) {
      // Si aún no se configuran credenciales en Turso, fallback elegante al repositorio local
      if (typeof repoTodos === 'function') {
        const personas = repoTodos('PERSONAS', { incluirInactivos: false }) || [];
        const emps = repoTodos('EMPRENDIMIENTOS', { incluirInactivos: false }) || [];
        const vincs = repoTodos('VINCULACIONES', { incluirInactivos: false }) || [];
        
        const resList = personas.map(p => {
          const v = vincs.find(item => item.ID_PERSONA === p.ID_PERSONA);
          const e = v ? emps.find(item => item.ID_EMPRENDIMIENTO === v.ID_EMPRENDIMIENTO) : (emps[0] || {});
          return {
            id_persona: p.ID_PERSONA,
            rut: p.RUT,
            rut_formateado: p.RUT,
            nombres: p.NOMBRES,
            apellidos: p.APELLIDOS,
            email: p.EMAIL,
            telefono: p.TELEFONO,
            comuna: p.COMUNA || 'SANTIAGO',
            tramo_rsh: p.TRAMO_RSH,
            id_emprendimiento: e.ID_EMPRENDIMIENTO || '',
            nombre_comercial: e.NOMBRE_COMERCIAL || 'Sin Emprendimiento',
            rubro: e.ID_RUBRO || 'OTRO',
            subrubro: e.ID_SUBRUBRO || '',
            formalizacion_sii: e.FORMALIZACION_SII || 'SIN_INICIO',
            rol: v ? v.ROL : 'TITULAR'
          };
        });

        return {
          success: true,
          data: resList,
          error: null
        };
      }
      return { success: false, data: null, error: query.error };
    }

    return {
      success: true,
      data: query.data.rows || [],
      error: null
    };
  } catch (err) {
    return {
      success: false,
      data: null,
      error: 'Error al listar fichas: ' + (err.message || String(err))
    };
  }
}

/**
 * Carga un documento físico en Google Drive y lo registra en la tabla 'documentos' de Turso.
 * @param {object} params
 * @param {string} params.idPersona
 * @param {string} params.rut
 * @param {string} params.tipoDocumento
 * @param {GoogleAppsScript.Base.Blob|object} params.archivo
 * @param {string} [params.fechaEmision]
 * @param {string} [params.fechaVencimiento]
 * @param {string} [params.observaciones]
 * @param {string} [params.usuarioEmail]
 * @returns {{ success: boolean, data: object|null, error: string|null }}
 */
function cargarDocumentoExpediente(params) {
  try {
    if (!params || !params.archivo || !params.tipoDocumento) {
      return { success: false, data: null, error: 'Se requiere archivo y tipo de documento.' };
    }

    // 1. Guardar en Google Drive
    const resDrive = driveGuardarDocumento({
      rut: params.rut,
      tipoDocumento: params.tipoDocumento,
      archivo: params.archivo
    });

    if (!resDrive.success) {
      return { success: false, data: null, error: resDrive.error };
    }

    const driveInfo = resDrive.data;
    const idDoc = 'doc-' + generarUuid_();

    // 2. Registrar en Turso
    const sql = `
      INSERT INTO documentos (
        id_documento, id_persona, id_emprendimiento, tipo_documento,
        drive_file_id, drive_url, nombre_archivo, mime_type, tamano_bytes,
        fecha_emision, fecha_vencimiento, estado_revision, observaciones,
        es_version_vigente, subido_por
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'RECIBIDO', ?, 1, ?)
    `;

    const args = [
      idDoc,
      params.idPersona || null,
      params.idEmprendimiento || null,
      params.tipoDocumento,
      driveInfo.fileId,
      driveInfo.fileUrl,
      driveInfo.fileName,
      driveInfo.mimeType,
      driveInfo.sizeBytes,
      params.fechaEmision || null,
      params.fechaVencimiento || null,
      params.observaciones || '',
      params.usuarioEmail || 'sistema@santiago.cl'
    ];

    const q = tursoEjecutar(sql, args);
    if (!q.success) {
      return { success: false, data: null, error: 'Error al registrar documento en base de datos: ' + q.error };
    }

    return {
      success: true,
      data: {
        idDocumento: idDoc,
        driveUrl: driveInfo.fileUrl,
        nombreArchivo: driveInfo.fileName,
        tipoDocumento: params.tipoDocumento,
        mensaje: 'Documento almacenado exitosamente en Google Drive y registrado en Turso.'
      },
      error: null
    };
  } catch (err) {
    return {
      success: false,
      data: null,
      error: 'Error al cargar documento: ' + (err.message || String(err))
    };
  }
}
