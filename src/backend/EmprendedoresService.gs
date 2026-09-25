// EmprendedoresService.gs
// SGE v2.1.0 - Servicio de gestión de personas emprendedoras y emprendimientos
// Validaciones chilenas (Módulo 11, E.164) y persistencia relacional en Google Sheets (Repository.gs)

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
 * Realiza todas las validaciones chilenas antes de persistir en Google Sheets.
 * @param {object} payload
 * @returns {{ success: boolean, data: object|null, error: string|null }}
 */
function guardarFichaEmprendedor(payload) {
  try {
    if (!payload) {
      return { success: false, data: null, error: 'No se recibieron datos para guardar.' };
    }

    // 1. Validaciones chilenas estrictas
    const valRut = typeof validarRutChileno === 'function' ? validarRutChileno(payload.rut) : { success: true, data: { rutLimpio: String(payload.rut).replace(/[^0-9kK]/g, '').toUpperCase(), rutFormateado: payload.rut } };
    if (!valRut.success) {
      return { success: false, data: null, error: valRut.error };
    }

    let telefonoValidado = payload.telefono || '';
    if (telefonoValidado && typeof validarTelefonoChileno === 'function') {
      const valTel = validarTelefonoChileno(telefonoValidado);
      if (!valTel.success) {
        return { success: false, data: null, error: valTel.error };
      }
      telefonoValidado = valTel.data.telefonoE164;
    }

    let emailValidado = payload.email || '';
    if (emailValidado && typeof validarEmail === 'function') {
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
    const usuarioEmail = payload.usuarioEmail || 'sistema@santiago.cl';

    // Desglosar apellidos si vienen juntos
    const apellidosPartes = String(payload.apellidos).trim().split(/\s+/);
    const apePaterno = apellidosPartes[0] || '';
    const apeMaterno = apellidosPartes.slice(1).join(' ') || '';

    // 2. Buscar si la persona ya existe en Google Sheets (por idPersona o por RUT)
    let idPersona = payload.idPersona || '';
    let personaExistente = null;

    if (typeof repoTodos === 'function') {
      const personas = repoTodos('PERSONAS', { incluirInactivos: true }) || [];
      personaExistente = personas.find(p => {
        if (idPersona && p.ID_PERSONA === idPersona) return true;
        const rNorm = typeof normalizarRut === 'function' ? normalizarRut(p.RUT_NORMALIZADO || p.RUT) : (p.RUT_NORMALIZADO || p.RUT);
        return rNorm === rutLimpio;
      });
      if (personaExistente) {
        idPersona = personaExistente.ID_PERSONA;
      }
    }

    const ahora = (typeof ahoraIso_ === 'function') ? ahoraIso_() : new Date().toISOString();

    if (personaExistente) {
      // Actualizar persona
      repoActualizar('PERSONAS', idPersona, {
        RUT_NORMALIZADO: rutLimpio,
        NOMBRES: typeof sanitizarTexto === 'function' ? sanitizarTexto(payload.nombres) : payload.nombres,
        APELLIDO_PATERNO: typeof sanitizarTexto === 'function' ? sanitizarTexto(apePaterno) : apePaterno,
        APELLIDO_MATERNO: typeof sanitizarTexto === 'function' ? sanitizarTexto(apeMaterno) : apeMaterno,
        EMAIL_NORMALIZADO: emailValidado,
        TELEFONO_NORMALIZADO: telefonoValidado,
        COMUNA_RESIDENCIA: typeof normalizarComuna === 'function' ? normalizarComuna(payload.comuna) : (payload.comuna || 'SANTIAGO'),
        GENERO: payload.genero || 'NO_INFORMA',
        DISCAPACIDAD_DECLARADA: payload.discapacidad ? 'SI' : 'NO',
        ACTUALIZADO_EN: ahora,
        ACTUALIZADO_POR: usuarioEmail
      }, { motivo: 'Actualización de Ficha Integral' });
    } else {
      // Insertar persona
      idPersona = idPersona || ('per-' + generarUuid_());
      repoInsertar('PERSONAS', {
        ID_PERSONA: idPersona,
        RUT_NORMALIZADO: rutLimpio,
        NOMBRES: typeof sanitizarTexto === 'function' ? sanitizarTexto(payload.nombres) : payload.nombres,
        APELLIDO_PATERNO: typeof sanitizarTexto === 'function' ? sanitizarTexto(apePaterno) : apePaterno,
        APELLIDO_MATERNO: typeof sanitizarTexto === 'function' ? sanitizarTexto(apeMaterno) : apeMaterno,
        FECHA_NACIMIENTO: payload.fechaNacimiento || '',
        GENERO: payload.genero || 'NO_INFORMA',
        DISCAPACIDAD_DECLARADA: payload.discapacidad ? 'SI' : 'NO',
        TELEFONO_NORMALIZADO: telefonoValidado,
        EMAIL_NORMALIZADO: emailValidado,
        COMUNA_RESIDENCIA: typeof normalizarComuna === 'function' ? normalizarComuna(payload.comuna) : (payload.comuna || 'SANTIAGO'),
        ESTADO_REGISTRO: 'ACTIVO',
        CREADO_EN: ahora,
        CREADO_POR: usuarioEmail,
        ACTUALIZADO_EN: ahora,
        ACTUALIZADO_POR: usuarioEmail
      }, { motivo: 'Registro de nuevo emprendedor' });
    }

    // 3. Crear o actualizar Emprendimiento
    let idEmprendimiento = payload.idEmprendimiento || '';
    let empExistente = null;

    if (typeof repoTodos === 'function') {
      const rels = repoTodos('PERSONA_EMPRENDIMIENTO', { incluirInactivos: true }) || [];
      const userRel = rels.find(r => r.ID_PERSONA === idPersona && r.ESTADO_REGISTRO !== 'INACTIVO');
      if (userRel && !idEmprendimiento) {
        idEmprendimiento = userRel.ID_EMPRENDIMIENTO;
      }
      if (idEmprendimiento) {
        empExistente = repoBuscarPorId('EMPRENDIMIENTOS', idEmprendimiento);
      }
    }

    const subrubroCompuesto = (payload.subrubro && payload.especialidad)
      ? `${payload.subrubro} - ${payload.especialidad}`
      : (payload.subrubro || payload.especialidad || '');

    if (empExistente) {
      repoActualizar('EMPRENDIMIENTOS', idEmprendimiento, {
        NOMBRE_COMERCIAL: typeof sanitizarTexto === 'function' ? sanitizarTexto(payload.nombreComercial) : payload.nombreComercial,
        ID_RUBRO: typeof sanitizarTexto === 'function' ? sanitizarTexto(payload.rubro || 'OTRO') : (payload.rubro || 'OTRO'),
        ID_SUBRUBRO: typeof sanitizarTexto === 'function' ? sanitizarTexto(subrubroCompuesto) : subrubroCompuesto,
        DESCRIPCION: typeof sanitizarTexto === 'function' ? sanitizarTexto(payload.descripcion || payload.especialidad || '') : (payload.descripcion || ''),
        FORMALIZACION: typeof sanitizarTexto === 'function' ? sanitizarTexto(payload.formalizacionSii || 'SIN_INICIO') : (payload.formalizacionSii || 'SIN_INICIO'),
        ETAPA_ACTUAL: typeof sanitizarTexto === 'function' ? sanitizarTexto(payload.etapa || 'ARRANQUE') : (payload.etapa || 'ARRANQUE'),
        INSTAGRAM: typeof sanitizarTexto === 'function' ? sanitizarTexto(payload.instagram || '') : (payload.instagram || ''),
        ACTUALIZADO_EN: ahora,
        ACTUALIZADO_POR: usuarioEmail
      }, { motivo: 'Actualización de emprendimiento' });
    } else {
      idEmprendimiento = idEmprendimiento || ('emp-' + generarUuid_());
      repoInsertar('EMPRENDIMIENTOS', {
        ID_EMPRENDIMIENTO: idEmprendimiento,
        NOMBRE_COMERCIAL: typeof sanitizarTexto === 'function' ? sanitizarTexto(payload.nombreComercial) : payload.nombreComercial,
        DESCRIPCION: typeof sanitizarTexto === 'function' ? sanitizarTexto(payload.descripcion || payload.especialidad || '') : (payload.descripcion || ''),
        ID_RUBRO: typeof sanitizarTexto === 'function' ? sanitizarTexto(payload.rubro || 'OTRO') : (payload.rubro || 'OTRO'),
        ID_SUBRUBRO: typeof sanitizarTexto === 'function' ? sanitizarTexto(subrubroCompuesto) : subrubroCompuesto,
        FECHA_INICIO_ESTIMADA: '',
        FORMALIZACION: typeof sanitizarTexto === 'function' ? sanitizarTexto(payload.formalizacionSii || 'SIN_INICIO') : (payload.formalizacionSii || 'SIN_INICIO'),
        DEDICACION: 'PRINCIPAL',
        CANAL_VENTA: 'FERIAS',
        ETAPA_ACTUAL: typeof sanitizarTexto === 'function' ? sanitizarTexto(payload.etapa || 'ARRANQUE') : (payload.etapa || 'ARRANQUE'),
        TERRITORIO_OPERACION: 'SANTIAGO',
        ESTADO_EMPRENDIMIENTO: 'ACTIVO',
        CREADO_EN: ahora,
        CREADO_POR: usuarioEmail,
        ACTUALIZADO_EN: ahora,
        ACTUALIZADO_POR: usuarioEmail,
        INSTAGRAM: typeof sanitizarTexto === 'function' ? sanitizarTexto(payload.instagram || '') : (payload.instagram || ''),
        FACEBOOK: '',
        TIKTOK: '',
        SITIO_WEB: '',
        ORIGEN_ATENCION: 'DEMANDA'
      }, { motivo: 'Registro de nuevo emprendimiento' });

      // Crear vinculación oficial en PERSONA_EMPRENDIMIENTO
      repoInsertar('PERSONA_EMPRENDIMIENTO', {
        ID_RELACION: 'rel-' + generarUuid_(),
        ID_PERSONA: idPersona,
        ID_EMPRENDIMIENTO: idEmprendimiento,
        ROL: 'TITULAR',
        ES_PRINCIPAL: 'SI',
        DESDE: ahora.substring(0, 10),
        HASTA: '',
        ESTADO_REGISTRO: 'ACTIVO',
        CREADO_EN: ahora,
        CREADO_POR: usuarioEmail
      }, { motivo: 'Vinculación de titular y emprendimiento' });
    }

    return {
      success: true,
      data: {
        idPersona: idPersona,
        idEmprendimiento: idEmprendimiento,
        rutFormateado: rutFormateado,
        mensaje: personaExistente ? 'Ficha actualizada exitosamente en Google Sheets.' : 'Emprendedor registrado exitosamente en Google Sheets.'
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
 * Trae persona, emprendimientos, vinculaciones, documentos y postulaciones.
 * @param {string} rutOId
 * @returns {{ success: boolean, data: object|null, error: string|null }}
 */
function obtenerFichaIntegral(rutOId) {
  try {
    if (!rutOId) {
      return { success: false, data: null, error: 'Se requiere RUT o ID de la persona.' };
    }

    const rutLimpio = typeof normalizarRut === 'function' ? normalizarRut(rutOId) : String(rutOId).replace(/[^0-9kK]/g, '').toUpperCase();
    const personas = typeof repoTodos === 'function' ? (repoTodos('PERSONAS', { incluirInactivos: true }) || []) : [];
    const persona = personas.find(p => {
      const pRut = typeof normalizarRut === 'function' ? normalizarRut(p.RUT_NORMALIZADO || p.RUT) : (p.RUT_NORMALIZADO || p.RUT);
      return pRut === rutLimpio || p.ID_PERSONA === rutOId;
    });

    if (!persona) {
      return { success: false, data: null, error: 'No se encontró ninguna persona con los datos especificados.' };
    }

    const idPersona = persona.ID_PERSONA;
    const rels = typeof repoTodos === 'function' ? (repoTodos('PERSONA_EMPRENDIMIENTO', { incluirInactivos: true }) || []) : [];
    const userRels = rels.filter(r => r.ID_PERSONA === idPersona && r.ESTADO_REGISTRO !== 'INACTIVO');
    const emps = typeof repoTodos === 'function' ? (repoTodos('EMPRENDIMIENTOS', { incluirInactivos: true }) || []) : [];
    const userEmps = emps.filter(e => userRels.some(r => r.ID_EMPRENDIMIENTO === e.ID_EMPRENDIMIENTO));

    const docs = typeof repoTodos === 'function' ? (repoTodos('DOCUMENTOS', { incluirInactivos: true }) || []) : [];
    const userDocs = docs.filter(d => {
      if (d.ID_SUJETO === idPersona) return true;
      if (userEmps.some(e => e.ID_EMPRENDIMIENTO === d.ID_SUJETO)) return true;
      return false;
    });

    const posts = typeof repoTodos === 'function' ? (repoTodos('POSTULACIONES', { incluirInactivos: true }) || []) : [];
    const inis = typeof repoTodos === 'function' ? (repoTodos('INICIATIVAS', { incluirInactivos: true }) || []) : [];
    const userPosts = posts.filter(p => p.ID_PERSONA_CONTACTO === idPersona || userEmps.some(e => e.ID_EMPRENDIMIENTO === p.ID_EMPRENDIMIENTO));

    const rutFormateado = formatearRutChileno_(persona.RUT_NORMALIZADO || persona.RUT || rutLimpio);

    return {
      success: true,
      data: {
        persona: {
          id_persona: persona.ID_PERSONA,
          rut: persona.RUT_NORMALIZADO || persona.RUT || rutLimpio,
          rut_formateado: rutFormateado,
          nombres: persona.NOMBRES || '',
          apellidos: [persona.APELLIDO_PATERNO, persona.APELLIDO_MATERNO].filter(Boolean).join(' '),
          email: persona.EMAIL_NORMALIZADO || persona.EMAIL || '',
          telefono: persona.TELEFONO_NORMALIZADO || persona.TELEFONO || '',
          comuna: persona.COMUNA_RESIDENCIA || persona.COMUNA || 'SANTIAGO',
          tramo_rsh: persona.TRAMO_RSH || 'SIN_RSH',
          genero: persona.GENERO || 'NO_INFORMA',
          discapacidad_declarada: persona.DISCAPACIDAD_DECLARADA || 'NO'
        },
        emprendimientos: userEmps.map(e => ({
          id_emprendimiento: e.ID_EMPRENDIMIENTO,
          codigo_comercial: e.CODIGO_EMPRENDIMIENTO || '',
          nombre_comercial: e.NOMBRE_COMERCIAL || '',
          nombre_fantasia: e.NOMBRE_COMERCIAL || '',
          rubro: e.ID_RUBRO || 'OTRO',
          subrubro: e.ID_SUBRUBRO || '',
          formalizacion_sii: e.FORMALIZACION || 'SIN_INICIO',
          etapa_madurez: e.ETAPA_ACTUAL || 'ARRANQUE',
          instagram: e.INSTAGRAM || '',
          descripcion_producto: e.DESCRIPCION || ''
        })),
        documentos: userDocs.map(d => ({
          id_documento: d.ID_DOCUMENTO,
          tipo_documento: d.TIPO_DOCUMENTO,
          nombre_archivo: d.TIPO_DOCUMENTO,
          drive_file_id: d.ID_ARCHIVO_DRIVE,
          drive_url: d.ID_ARCHIVO_DRIVE ? `https://drive.google.com/file/d/${d.ID_ARCHIVO_DRIVE}/view` : '',
          estado_revision: d.ESTADO_REVISION || 'RECIBIDO',
          version_vigente: d.ES_VERSION_VIGENTE || 'SI',
          creado_en: d.CREADO_EN || ''
        })),
        postulaciones: userPosts.map(p => {
          const ini = inis.find(i => i.ID_INICIATIVA === p.ID_INICIATIVA);
          return {
            id_postulacion: p.ID_POSTULACION,
            id_iniciativa: p.ID_INICIATIVA,
            nombre_iniciativa: ini ? ini.NOMBRE : 'Iniciativa',
            codigo_iniciativa: ini ? (ini.CODIGO || ini.ID_INICIATIVA) : '',
            tipo_iniciativa: ini ? ini.TIPO_INICIATIVA : 'FERIA',
            estado_postulacion: p.ESTADO_POSTULACION || 'INGRESADA',
            fecha_postulacion: p.FECHA_POSTULACION || p.CREADO_EN || ''
          };
        })
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
    const termino = (filtros.termino || '').trim().toLowerCase();
    const terminoLimpio = typeof normalizarRut === 'function' ? normalizarRut(termino) : termino.replace(/[^0-9kK]/g, '').toUpperCase();
    const rubro = (filtros.rubro || '').trim();
    const limite = Math.min(parseInt(filtros.limite || filtros.limit, 10) || 50, 1000);

    const personas = typeof repoTodos === 'function' ? (repoTodos('PERSONAS', { incluirInactivos: false }) || []) : [];
    const emps = typeof repoTodos === 'function' ? (repoTodos('EMPRENDIMIENTOS', { incluirInactivos: false }) || []) : [];
    const rels = typeof repoTodos === 'function' ? (repoTodos('PERSONA_EMPRENDIMIENTO', { incluirInactivos: false }) || []) : [];

    const resList = [];

    personas.forEach(p => {
      const ape = [p.APELLIDO_PATERNO, p.APELLIDO_MATERNO].filter(Boolean).join(' ');
      const nombreCompleto = `${p.NOMBRES || ''} ${ape}`.trim();
      const pRutNorm = p.RUT_NORMALIZADO || p.RUT || '';
      const rutFmt = formatearRutChileno_(pRutNorm);

      // Buscar emprendimiento vinculado
      const rel = rels.find(r => r.ID_PERSONA === p.ID_PERSONA);
      const e = rel ? (emps.find(item => item.ID_EMPRENDIMIENTO === rel.ID_EMPRENDIMIENTO) || {}) : (emps.find(item => item.ID_EMPRENDIMIENTO === p.ID_PERSONA) || {});

      const empNombre = e.NOMBRE_COMERCIAL || 'Sin Emprendimiento';
      const empRubro = e.ID_RUBRO || 'OTRO';

      // Filtro de búsqueda
      if (termino) {
        const coincideRut = pRutNorm.toLowerCase().includes(terminoLimpio.toLowerCase()) || rutFmt.toLowerCase().includes(termino);
        const coincideNombre = nombreCompleto.toLowerCase().includes(termino);
        const coincideEmp = empNombre.toLowerCase().includes(termino);
        if (!coincideRut && !coincideNombre && !coincideEmp) {
          return;
        }
      }

      // Filtro de rubro
      if (rubro && empRubro !== rubro) {
        return;
      }

      resList.push({
        id_persona: p.ID_PERSONA,
        rut: pRutNorm,
        rut_formateado: rutFmt,
        nombres: p.NOMBRES || '',
        apellidos: ape,
        email: p.EMAIL_NORMALIZADO || p.EMAIL || '',
        telefono: p.TELEFONO_NORMALIZADO || p.TELEFONO || '',
        comuna: typeof normalizarComuna === 'function' ? normalizarComuna(p.COMUNA_RESIDENCIA || p.COMUNA || 'Santiago') : (p.COMUNA_RESIDENCIA || 'Santiago'),
        tramo_rsh: p.TRAMO_RSH || 'SIN_RSH',
        id_emprendimiento: e.ID_EMPRENDIMIENTO || '',
        codigo_comercial: e.CODIGO_EMPRENDIMIENTO || '',
        nombre_comercial: empNombre,
        nombre_fantasia: empNombre,
        rubro: empRubro,
        subrubro: e.ID_SUBRUBRO || '',
        formalizacion_sii: e.FORMALIZACION || 'SIN_INICIO',
        etapa_madurez: e.ETAPA_ACTUAL || 'ARRANQUE',
        instagram: e.INSTAGRAM || '',
        descripcion_producto: e.DESCRIPCION || '',
        rol: rel ? rel.ROL : 'TITULAR'
      });
    });

    return {
      success: true,
      data: resList.slice(0, limite),
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
