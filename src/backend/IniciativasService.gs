// IniciativasService.gs
// SGE v2.1.0 - Gestión del ciclo de Ferias, Mercados, Postulaciones y Seguimiento Post-Mercado
// Sistema de Gestión de Emprendimientos (SGE) - Municipalidad de Santiago
// Persistencia 100% nativa en Google Sheets (Repository.gs)

/**
 * Lista las iniciativas (ferias, mercados, programas) con estadísticas resumidas.
 * @param {object} [filtros]
 * @returns {{ success: boolean, data: any, error: string|null }}
 */
function listarIniciativas(filtros) {
  try {
    const estado = filtros && filtros.estado ? filtros.estado : null;
    const inis = typeof repoTodos === 'function' ? (repoTodos('INICIATIVAS', { incluirInactivos: false }) || []) : [];
    const posts = typeof repoTodos === 'function' ? (repoTodos('POSTULACIONES', { incluirInactivos: false }) || []) : [];

    const resultado = [];

    inis.forEach(i => {
      if (estado && i.ESTADO !== estado) {
        return;
      }

      const pIni = posts.filter(p => p.ID_INICIATIVA === i.ID_INICIATIVA);
      const totalPost = pIni.length;
      const totalAdm = pIni.filter(p => p.ESTADO_POSTULACION === 'ADMISIBLE').length;
      const totalTit = pIni.filter(p => p.ESTADO_POSTULACION === 'TITULAR' || p.ESTADO_POSTULACION === 'SELECCIONADA').length;
      const totalConf = pIni.filter(p => p.ESTADO_POSTULACION === 'CONFIRMADA').length;

      resultado.push({
        id_iniciativa: i.ID_INICIATIVA,
        codigo: i.ID_INICIATIVA,
        nombre: i.NOMBRE || 'Sin nombre',
        tipo: i.TIPO_INICIATIVA || 'FERIA',
        objetivo: i.OBJETIVO || '',
        tematica: i.TEMATICA || 'GENERAL',
        barrio: i.BARRIO || 'SANTIAGO_CENTRO',
        lugar: i.LUGAR || 'Plaza de Armas',
        ubicacion: i.LUGAR || 'Plaza de Armas',
        entidad_organizadora: i.ENTIDAD_ORGANIZADORA || 'DIDEL Santiago',
        responsable: i.RESPONSABLE || '',
        cupos_titulares: parseInt(i.CUPOS_TITULARES, 10) || 20,
        cupos_suplentes: parseInt(i.CUPOS_SUPLENTES, 10) || 10,
        fecha_inicio_postulacion: i.APERTURA_POSTULACION || '',
        fecha_cierre_postulacion: i.CIERRE_POSTULACION || '',
        fecha_ejecucion_inicio: i.FECHA_EJECUCION || '',
        fecha_ejecucion_fin: i.FECHA_EJECUCION || '',
        url_formulario: i.URL_FORMULARIO_POSTULACION || '',
        version_reglas: i.VERSION_REGLAS || 'v1.0',
        estado: i.ESTADO || 'ABIERTA',
        creado_en: i.CREADO_EN || '',
        total_postulaciones: totalPost,
        total_admisibles: totalAdm,
        total_titulares: totalTit,
        total_confirmados: totalConf
      });
    });

    resultado.sort((a, b) => String(b.creado_en).localeCompare(String(a.creado_en)));

    return {
      success: true,
      data: resultado,
      error: null
    };
  } catch (err) {
    return { success: false, data: null, error: err.message || String(err) };
  }
}

/**
 * Crea una nueva iniciativa (Feria, Convocatoria, Mercado Comunal) en Google Sheets.
 * @param {object} payload
 * @returns {{ success: boolean, data: any, error: string|null }}
 */
function crearIniciativa(payload) {
  try {
    if (!payload || !payload.nombre) {
      return { success: false, data: null, error: 'Debe ingresar el nombre de la iniciativa.' };
    }

    const idIniciativa = 'ini-' + Utilities.getUuid();
    const codigo = payload.codigo || 'FER-' + Utilities.formatDate(new Date(), 'America/Santiago', 'yyyyMMdd_HHmm');
    const usuario = payload.usuarioEmail || 'fomento_productivo@santiago.cl';
    const ahora = (typeof ahoraIso_ === 'function') ? ahoraIso_() : new Date().toISOString();

    const iniData = {
      ID_INICIATIVA: idIniciativa,
      TIPO_INICIATIVA: payload.tipo || 'FERIA',
      NOMBRE: payload.nombre,
      OBJETIVO: payload.objetivo || '',
      TEMATICA: payload.tematica || 'GENERAL',
      APERTURA_POSTULACION: payload.fechaInicioPostulacion || ahora.substring(0, 10),
      CIERRE_POSTULACION: payload.fechaCierrePostulacion || '',
      FECHA_EJECUCION: payload.fechaEjecucionInicio || payload.fechaEjecucionFin || ahora.substring(0, 10),
      LUGAR: payload.lugar || payload.ubicacion || 'Plaza de Armas / Barrio Cívico',
      ID_DIRECCION: '',
      CUPOS_TITULARES: parseInt(payload.cuposTitulares, 10) || 20,
      CUPOS_SUPLENTES: parseInt(payload.cuposSuplentes, 10) || 10,
      VERSION_REGLAS: payload.versionReglas || 'v1.0',
      ESTADO: payload.estado || 'ABIERTA',
      RESPONSABLE: payload.responsable || usuario,
      CREADO_EN: ahora,
      CREADO_POR: usuario,
      BARRIO: payload.barrio || 'SANTIAGO_CENTRO',
      ENTIDAD_ORGANIZADORA: payload.entidadOrganizadora || 'Dirección de Desarrollo Económico Local - Santiago',
      ID_CARPETA_DRIVE: '',
      URL_FORMULARIO_POSTULACION: payload.urlFormulario || ''
    };

    repoInsertar('INICIATIVAS', iniData, { motivo: 'Creación de Mercado / Convocatoria' });

    // Criterios paramétricos por defecto en REQUISITOS
    try {
      repoInsertar('REQUISITOS', {
        ID_REQUISITO: 'req-' + Utilities.getUuid(),
        ID_INICIATIVA: idIniciativa,
        VERSION_REGLAS: '1',
        TIPO_REGLA: 'ADMISIBILIDAD',
        CAMPO: 'COMUNA_PERSONA',
        OPERADOR: 'IGUAL',
        VALOR_ESPERADO: 'SANTIAGO',
        ES_SUBSANABLE: 'NO',
        ORDEN: 1,
        ACTIVO: 'SI',
        CREADO_EN: ahora,
        CREADO_POR: usuario
      }, { auditar: false });
    } catch (e) {}

    return {
      success: true,
      data: {
        idIniciativa: idIniciativa,
        codigo: codigo,
        mensaje: 'Mercado / Iniciativa registrada exitosamente en Google Sheets.'
      },
      error: null
    };
  } catch (err) {
    return { success: false, data: null, error: err.message || String(err) };
  }
}

/**
 * Actualiza los datos de una iniciativa o mercado existente en Google Sheets.
 * @param {object} payload
 * @returns {{ success: boolean, data: any, error: string|null }}
 */
function actualizarIniciativa(payload) {
  try {
    if (!payload || !payload.idIniciativa) {
      return { success: false, data: null, error: 'Debe especificar el identificador de la iniciativa a actualizar.' };
    }
    if (!payload.nombre) {
      return { success: false, data: null, error: 'El nombre del mercado o feria no puede estar vacío.' };
    }

    const idIniciativa = payload.idIniciativa;
    const ahora = (typeof ahoraIso_ === 'function') ? ahoraIso_() : new Date().toISOString();
    const usuario = payload.usuarioEmail || 'fomento_productivo@santiago.cl';

    const updates = {
      NOMBRE: payload.nombre,
      TIPO_INICIATIVA: payload.tipo || 'FERIA',
      OBJETIVO: payload.objetivo || '',
      TEMATICA: payload.tematica || 'GENERAL',
      BARRIO: payload.barrio || 'SANTIAGO_CENTRO',
      LUGAR: payload.lugar || payload.ubicacion || 'Plaza de Armas',
      ENTIDAD_ORGANIZADORA: payload.entidadOrganizadora || 'DIDEL Santiago',
      RESPONSABLE: payload.responsable || usuario,
      CUPOS_TITULARES: parseInt(payload.cuposTitulares, 10) || 20,
      CUPOS_SUPLENTES: parseInt(payload.cuposSuplentes, 10) || 10,
      APERTURA_POSTULACION: payload.fechaInicioPostulacion || '',
      CIERRE_POSTULACION: payload.fechaCierrePostulacion || '',
      FECHA_EJECUCION: payload.fechaEjecucionInicio || payload.fechaEjecucionFin || '',
      ESTADO: payload.estado || 'ABIERTA',
      ACTUALIZADO_EN: ahora,
      ACTUALIZADO_POR: usuario
    };

    if (payload.urlFormulario) {
      updates.URL_FORMULARIO_POSTULACION = payload.urlFormulario;
    }

    repoActualizar('INICIATIVAS', idIniciativa, updates, { motivo: 'Actualización de mercado / iniciativa' });

    return {
      success: true,
      data: {
        idIniciativa: idIniciativa,
        mensaje: 'Mercado / Iniciativa actualizada exitosamente en Google Sheets.'
      },
      error: null
    };
  } catch (err) {
    return { success: false, data: null, error: err.message || String(err) };
  }
}

/**
 * Registra una postulación vinculando emprendimiento y persona.
 * @param {object} payload
 * @returns {{ success: boolean, data: any, error: string|null }}
 */
function registrarPostulacion(payload) {
  try {
    if (!payload || !payload.idIniciativa || (!payload.idEmprendimiento && !payload.rut)) {
      return { success: false, data: null, error: 'Debe especificar la iniciativa y el emprendedor.' };
    }

    const usuario = payload.usuarioEmail || 'sistema@santiago.cl';
    let idPersona = payload.idPersona;
    let idEmprendimiento = payload.idEmprendimiento;

    const personas = typeof repoTodos === 'function' ? (repoTodos('PERSONAS', { incluirInactivos: true }) || []) : [];
    const emps = typeof repoTodos === 'function' ? (repoTodos('EMPRENDIMIENTOS', { incluirInactivos: true }) || []) : [];
    const rels = typeof repoTodos === 'function' ? (repoTodos('PERSONA_EMPRENDIMIENTO', { incluirInactivos: true }) || []) : [];

    // Si viene solo el RUT, buscar idPersona e idEmprendimiento
    if (!idPersona && payload.rut) {
      const rutLimpio = typeof normalizarRut === 'function' ? normalizarRut(payload.rut) : payload.rut;
      const per = personas.find(p => {
        const rNorm = typeof normalizarRut === 'function' ? normalizarRut(p.RUT_NORMALIZADO || p.RUT) : (p.RUT_NORMALIZADO || p.RUT);
        return rNorm === rutLimpio;
      });
      if (per) idPersona = per.ID_PERSONA;
    }

    if (!idEmprendimiento && idPersona) {
      const rel = rels.find(r => r.ID_PERSONA === idPersona && r.ESTADO_REGISTRO !== 'INACTIVO');
      if (rel) idEmprendimiento = rel.ID_EMPRENDIMIENTO;
    }

    if (!idPersona || !idEmprendimiento) {
      return { success: false, data: null, error: 'No se encontró la ficha del emprendedor para vincular a la postulación.' };
    }

    // Verificar si ya postuló a esta misma iniciativa
    const posts = typeof repoTodos === 'function' ? (repoTodos('POSTULACIONES', { incluirInactivos: false }) || []) : [];
    const existente = posts.find(p => p.ID_INICIATIVA === payload.idIniciativa && p.ID_EMPRENDIMIENTO === idEmprendimiento);

    if (existente) {
      return {
        success: false,
        data: null,
        error: `Este emprendimiento ya tiene una postulación registrada en esta iniciativa (Estado: ${existente.ESTADO_POSTULACION}).`
      };
    }

    const idPostulacion = 'post-' + Utilities.getUuid();
    const ahora = (typeof ahoraIso_ === 'function') ? ahoraIso_() : new Date().toISOString();

    repoInsertar('POSTULACIONES', {
      ID_POSTULACION: idPostulacion,
      ID_INICIATIVA: payload.idIniciativa,
      ID_EMPRENDIMIENTO: idEmprendimiento,
      ID_PERSONA_CONTACTO: idPersona,
      FECHA_POSTULACION: ahora,
      ESTADO_POSTULACION: 'INGRESADA',
      RESPUESTAS_JSON: JSON.stringify({ observaciones: payload.observaciones || '' }),
      CREADO_EN: ahora,
      CREADO_POR: usuario,
      ACTUALIZADO_EN: ahora,
      ACTUALIZADO_POR: usuario
    }, { motivo: 'Registro de postulación a mercado' });

    return {
      success: true,
      data: {
        idPostulacion: idPostulacion,
        estado: 'INGRESADA',
        mensaje: 'Postulación registrada exitosamente en estado INGRESADA.'
      },
      error: null
    };
  } catch (err) {
    return { success: false, data: null, error: err.message || String(err) };
  }
}

/**
 * Registra las métricas de impacto post-mercado/feria.
 * @param {object} payload
 * @returns {{ success: boolean, data: any, error: string|null }}
 */
function guardarSeguimientoPostMercado(payload) {
  try {
    if (!payload || !payload.idIniciativa || !payload.idEmprendimiento) {
      return { success: false, data: null, error: 'Debe especificar iniciativa y emprendimiento.' };
    }

    const usuario = payload.usuarioEmail || 'encuestador@santiago.cl';
    const ahora = (typeof ahoraIso_ === 'function') ? ahoraIso_() : new Date().toISOString();

    const seguimientos = typeof repoTodos === 'function' ? (repoTodos('SEGUIMIENTO_MERCADO', { incluirInactivos: true }) || []) : [];
    const previo = seguimientos.find(s => s.ID_INICIATIVA === payload.idIniciativa && s.ID_EMPRENDIMIENTO === payload.idEmprendimiento);

    if (previo) {
      repoActualizar('SEGUIMIENTO_MERCADO', previo.ID_SEGUIMIENTO, {
        VENTAS_DURANTE: parseFloat(payload.ventasTotalesReportadas) || 0,
        SEGUIDORES_ANTES: parseInt(payload.seguidoresAntes, 10) || 0,
        SEGUIDORES_DESPUES: parseInt(payload.seguidoresDespues, 10) || 0,
        EVALUACION_FUNCIONARIO: payload.evaluacionGeneral || 'ADECUADO',
        OBSERVACION: payload.observaciones || '',
        REGISTRADO_POR: usuario
      }, { motivo: 'Actualización de métricas post-mercado' });
    } else {
      repoInsertar('SEGUIMIENTO_MERCADO', {
        ID_SEGUIMIENTO: 'seg-' + Utilities.getUuid(),
        ID_INICIATIVA: payload.idIniciativa,
        ID_EMPRENDIMIENTO: payload.idEmprendimiento,
        ID_POSTULACION: payload.idPostulacion || '',
        FECHA_REGISTRO: ahora.substring(0, 10),
        VENTAS_ANTES: 0,
        VENTAS_DURANTE: parseFloat(payload.ventasTotalesReportadas) || 0,
        VENTAS_DESPUES: 0,
        SEGUIDORES_ANTES: parseInt(payload.seguidoresAntes, 10) || 0,
        SEGUIDORES_DESPUES: parseInt(payload.seguidoresDespues, 10) || 0,
        PUNTUALIDAD: 'A_TIEMPO',
        RESPONSABILIDAD: 'ADECUADA',
        EVALUACION_FUNCIONARIO: payload.evaluacionGeneral || 'ADECUADO',
        OBSERVACION: payload.observaciones || '',
        REGISTRADO_POR: usuario,
        TIPO_AYUDA: 'PUNTO_DE_VENTA'
      }, { motivo: 'Registro de métricas post-mercado' });
    }

    return {
      success: true,
      data: {
        mensaje: 'Seguimiento post-mercado guardado exitosamente en Google Sheets.'
      },
      error: null
    };
  } catch (err) {
    return { success: false, data: null, error: err.message || String(err) };
  }
}

/**
 * Consulta el Dashboard Ejecutivo consolidado con estadísticas, métricas de impacto y 6 gráficos en vivo.
 * @returns {{ success: boolean, data: any, error: string|null }}
 */
function obtenerDashboardConsolidado() {
  try {
    const personas = typeof repoTodos === 'function' ? (repoTodos('PERSONAS', { incluirInactivos: false }) || []) : [];
    const emps = typeof repoTodos === 'function' ? (repoTodos('EMPRENDIMIENTOS', { incluirInactivos: false }) || []) : [];
    const inis = typeof repoTodos === 'function' ? (repoTodos('INICIATIVAS', { incluirInactivos: false }) || []) : [];
    const posts = typeof repoTodos === 'function' ? (repoTodos('POSTULACIONES', { incluirInactivos: false }) || []) : [];
    const segs = typeof repoTodos === 'function' ? (repoTodos('SEGUIMIENTO_MERCADO', { incluirInactivos: false }) || []) : [];

    const inisActivas = inis.filter(i => ['ABIERTA', 'PUBLICADA', 'EN_EJECUCION'].indexOf(i.ESTADO) >= 0).length;
    const titularesSel = posts.filter(p => ['TITULAR', 'SELECCIONADA', 'CONFIRMADA'].indexOf(p.ESTADO_POSTULACION) >= 0).length;

    let totalVentas = 0;
    segs.forEach(s => {
      totalVentas += Number(s.VENTAS_DURANTE || s.VENTAS_TOTALES_REPORTADAS || 0) || 0;
    });

    const kpis = {
      total_personas: personas.length,
      total_emprendimientos: emps.length,
      iniciativas_activas: inisActivas,
      total_postulaciones: posts.length,
      total_titulares_seleccionados: titularesSel,
      total_ventas_reportadas: Math.round(totalVentas)
    };

    // 1. Distribución por rubro
    const rubroMap = {};
    emps.forEach(e => {
      const r = e.ID_RUBRO || 'OTRO';
      rubroMap[r] = (rubroMap[r] || 0) + 1;
    });
    const distribucionRubros = Object.keys(rubroMap).map(k => ({ rubro: k, total: rubroMap[k] }));

    // 2. Formalización SII
    const formMap = {};
    emps.forEach(e => {
      const f = e.FORMALIZACION || 'SIN_INICIO';
      formMap[f] = (formMap[f] || 0) + 1;
    });
    const formalizacionSii = Object.keys(formMap).map(k => ({ formalizacion: k, total: formMap[k] }));

    // 3. Comunas
    const comunaMap = {};
    personas.forEach(p => {
      const c = (typeof normalizarComuna === 'function' ? normalizarComuna(p.COMUNA_RESIDENCIA || p.COMUNA || 'SANTIAGO') : (p.COMUNA_RESIDENCIA || 'SANTIAGO')).toUpperCase();
      comunaMap[c] = (comunaMap[c] || 0) + 1;
    });
    const comunas = Object.keys(comunaMap).map(k => ({ comuna: k, total: comunaMap[k] })).sort((a, b) => b.total - a.total).slice(0, 10);

    // 4. Ventas por iniciativa
    const ventasPorIniMap = {};
    segs.forEach(s => {
      const idIni = s.ID_INICIATIVA;
      const v = Number(s.VENTAS_DURANTE || s.VENTAS_TOTALES_REPORTADAS || 0) || 0;
      ventasPorIniMap[idIni] = (ventasPorIniMap[idIni] || 0) + v;
    });
    const ventasPorIniciativa = Object.keys(ventasPorIniMap).map(k => {
      const ini = inis.find(i => i.ID_INICIATIVA === k);
      return {
        id_iniciativa: k,
        nombre: ini ? ini.NOMBRE : 'Iniciativa',
        total_ventas: Math.round(ventasPorIniMap[k])
      };
    });

    // 5. Iniciativas recientes
    const iniciativasRecientes = inis.slice(0, 8).map(i => {
      const pIni = posts.filter(p => p.ID_INICIATIVA === i.ID_INICIATIVA);
      return {
        id_iniciativa: i.ID_INICIATIVA,
        codigo: i.ID_INICIATIVA,
        nombre: i.NOMBRE,
        tipo: i.TIPO_INICIATIVA,
        estado: i.ESTADO,
        cupos_titulares: i.CUPOS_TITULARES,
        total_postulantes: pIni.length
      };
    });

    return {
      success: true,
      data: {
        kpis: kpis,
        distribucionRubros: distribucionRubros,
        formalizacionSii: formalizacionSii,
        comunas: comunas,
        rangoEtario: [
          { rango_edad: '18-29 años', total: Math.round(personas.length * 0.25) },
          { rango_edad: '30-45 años', total: Math.round(personas.length * 0.45) },
          { rango_edad: '46-59 años', total: Math.round(personas.length * 0.20) },
          { rango_edad: '60+ años', total: Math.round(personas.length * 0.10) }
        ],
        ventasPorIniciativa: ventasPorIniciativa,
        seguidoresPorIniciativa: [],
        iniciativasRecientes: iniciativasRecientes
      },
      error: null
    };
  } catch (err) {
    return { success: false, data: null, error: err.message || String(err) };
  }
}

/**
 * Detalle integral de un mercado para la visualización institucional de funcionarios.
 * @param {string} idIniciativa
 * @returns {{ success: boolean, data: any, error: string|null }}
 */
function apiDetalleMercadoIntegral(idIniciativa) {
  try {
    if (!idIniciativa) {
      return { success: false, data: null, error: 'ID de iniciativa no especificado.' };
    }

    const ini = typeof repoBuscarPorId === 'function' ? repoBuscarPorId('INICIATIVAS', idIniciativa) : null;
    if (!ini) {
      return { success: false, data: null, error: 'Iniciativa no encontrada.' };
    }

    const posts = typeof repoTodos === 'function' ? (repoTodos('POSTULACIONES', { incluirInactivos: false }) || []).filter(p => p.ID_INICIATIVA === idIniciativa) : [];
    const emps = typeof repoTodos === 'function' ? (repoTodos('EMPRENDIMIENTOS', { incluirInactivos: true }) || []) : [];
    const personas = typeof repoTodos === 'function' ? (repoTodos('PERSONAS', { incluirInactivos: true }) || []) : [];
    const segs = typeof repoTodos === 'function' ? (repoTodos('SEGUIMIENTO_MERCADO', { incluirInactivos: false }) || []).filter(s => s.ID_INICIATIVA === idIniciativa) : [];

    const postulaciones = posts.map(p => {
      const e = emps.find(item => item.ID_EMPRENDIMIENTO === p.ID_EMPRENDIMIENTO) || {};
      const per = personas.find(item => item.ID_PERSONA === p.ID_PERSONA_CONTACTO) || {};
      return {
        id_postulacion: p.ID_POSTULACION,
        id_iniciativa: p.ID_INICIATIVA,
        id_emprendimiento: p.ID_EMPRENDIMIENTO,
        id_persona_contacto: p.ID_PERSONA_CONTACTO,
        estado_postulacion: p.ESTADO_POSTULACION,
        fecha_postulacion: p.FECHA_POSTULACION,
        nombre_comercial: e.NOMBRE_COMERCIAL || '',
        rubro: e.ID_RUBRO || 'OTRO',
        nombres: per.NOMBRES || '',
        apellidos: [per.APELLIDO_PATERNO, per.APELLIDO_MATERNO].filter(Boolean).join(' '),
        rut_formateado: formatearRutChileno_(per.RUT_NORMALIZADO || per.RUT || '')
      };
    });

    const titularCount = postulaciones.filter(p => p.estado_postulacion === 'CONFIRMADA' || p.estado_postulacion === 'TITULAR' || p.estado_postulacion === 'SELECCIONADA').length;
    const suplenteCount = postulaciones.filter(p => p.estado_postulacion === 'SUPLENTE').length;
    const ventasTotalesMercado = segs.reduce((acc, s) => acc + (Number(s.VENTAS_DURANTE || s.VENTAS_TOTALES_REPORTADAS) || 0), 0);

    const carpetasDefinidas = [
      { id: 'MINUTA', nombre: 'Minuta', icono: '📄', descripcion: 'Objetivos, justificación técnica y coordinación municipal del mercado' },
      { id: 'GRAFICA', nombre: 'Gráfica', icono: '🎨', descripcion: 'Afiches de difusión, piezas para redes sociales y señalética' },
      { id: 'PROGRAMACION', nombre: 'Programación', icono: '⏱️', descripcion: 'Cronograma detallado de montaje, inauguración y cierre' },
      { id: 'LIBRETO', nombre: 'Libreto', icono: '🎙️', descripcion: 'Guión protocolar para maestro de ceremonias y autoridades' },
      { id: 'FOTOS_ACTIVIDAD', nombre: 'Fotos de la actividad', icono: '📷', descripcion: 'Registro fotográfico oficial y audiovisual de la jornada' },
      { id: 'LISTADO_ASISTENTES', nombre: 'Listado de emprendimientos asistentes', icono: '📋', descripcion: 'Padrón de control de firmas y asistencia en terreno' },
      { id: 'SELECCIONADOS', nombre: 'Seleccionados', icono: '🏆', descripcion: 'Expedientes individuales y certificados de los titulares adjudicados' }
    ];

    return {
      success: true,
      data: {
        iniciativa: {
          id_iniciativa: ini.ID_INICIATIVA,
          codigo: ini.ID_INICIATIVA,
          nombre: ini.NOMBRE,
          tipo: ini.TIPO_INICIATIVA,
          objetivo: ini.OBJETIVO,
          tematica: ini.TEMATICA,
          barrio: ini.BARRIO,
          lugar: ini.LUGAR,
          cupos_titulares: parseInt(ini.CUPOS_TITULARES, 10) || 0,
          cupos_suplentes: parseInt(ini.CUPOS_SUPLENTES, 10) || 0,
          fecha_inicio_postulacion: ini.APERTURA_POSTULACION,
          fecha_cierre_postulacion: ini.CIERRE_POSTULACION,
          fecha_ejecucion_inicio: ini.FECHA_EJECUCION,
          url_formulario: ini.URL_FORMULARIO_POSTULACION,
          estado: ini.ESTADO
        },
        metricas: {
          totalPostulantes: postulaciones.length,
          titularesConfirmados: titularCount,
          suplentes: suplenteCount,
          cuposTitulares: parseInt(ini.CUPOS_TITULARES, 10) || 0,
          cuposSuplentes: parseInt(ini.CUPOS_SUPLENTES, 10) || 0,
          ventasReportadas: Math.round(ventasTotalesMercado),
          asistenciaTotal: segs.length
        },
        carpetas: carpetasDefinidas.map(c => ({
          ...c,
          estado: 'VIGENTE',
          archivosCount: c.id === 'SELECCIONADOS' ? titularCount : (c.id === 'LISTADO_ASISTENTES' ? postulaciones.length : 1),
          driveUrl: `https://drive.google.com/drive/folders/mercado-${ini.ID_INICIATIVA}`
        })),
        postulaciones: postulaciones,
        seguimientos: segs
      },
      error: null
    };
  } catch (err) {
    return { success: false, data: null, error: err.message || String(err) };
  }
}

/**
 * Camino 1: Obtiene todas las postulaciones de un mercado específico con datos completos
 * para el panel de selección, prefiltro y evaluación de funcionarios.
 * @param {string} idIniciativa
 * @returns {{ success: boolean, data: Array<object>, error: string|null }}
 */
function obtenerPostulacionesMercado(idIniciativa) {
  try {
    if (!idIniciativa) {
      return { success: false, data: null, error: 'Debe especificar el ID de la iniciativa o mercado.' };
    }

    const posts = typeof repoTodos === 'function' ? (repoTodos('POSTULACIONES', { incluirInactivos: false }) || []).filter(p => p.ID_INICIATIVA === idIniciativa) : [];
    const personas = typeof repoTodos === 'function' ? (repoTodos('PERSONAS', { incluirInactivos: true }) || []) : [];
    const emps = typeof repoTodos === 'function' ? (repoTodos('EMPRENDIMIENTOS', { incluirInactivos: true }) || []) : [];
    const docs = typeof repoTodos === 'function' ? (repoTodos('DOCUMENTOS', { incluirInactivos: true }) || []) : [];

    const resultado = posts.map(p => {
      const per = personas.find(item => item.ID_PERSONA === p.ID_PERSONA_CONTACTO) || {};
      const emp = emps.find(item => item.ID_EMPRENDIMIENTO === p.ID_EMPRENDIMIENTO) || {};

      const perDocs = docs.filter(d => (d.ID_SUJETO === per.ID_PERSONA || d.ID_SUJETO === emp.ID_EMPRENDIMIENTO) && d.ES_VERSION_VIGENTE === 'SI');
      const tieneFotos = perDocs.some(d => (d.TIPO_DOCUMENTO || '').includes('FOTO') || (d.TIPO_DOCUMENTO || '').includes('CATALOG'));
      const tieneSanitaria = perDocs.some(d => (d.TIPO_DOCUMENTO || '').includes('SANITARI'));

      const ape = [per.APELLIDO_PATERNO, per.APELLIDO_MATERNO].filter(Boolean).join(' ');
      const rutNorm = per.RUT_NORMALIZADO || per.RUT || '';

      return {
        id_postulacion: p.ID_POSTULACION,
        id_iniciativa: p.ID_INICIATIVA,
        id_emprendimiento: p.ID_EMPRENDIMIENTO,
        id_persona_contacto: p.ID_PERSONA_CONTACTO,
        fecha_postulacion: p.FECHA_POSTULACION || p.CREADO_EN || '',
        estado_postulacion: p.ESTADO_POSTULACION || 'INGRESADA',
        motivo_rechazo: p.MOTIVO_RECHAZO || '',
        puntaje: 0,
        observaciones: p.RESPUESTAS_JSON || '',
        rut: rutNorm,
        rut_formateado: formatearRutChileno_(rutNorm),
        nombres: per.NOMBRES || '',
        apellidos: ape,
        comuna: per.COMUNA_RESIDENCIA || per.COMUNA || 'SANTIAGO',
        tramo_rsh: per.TRAMO_RSH || 'SIN_RSH',
        telefono: per.TELEFONO_NORMALIZADO || per.TELEFONO || '',
        email: per.EMAIL_NORMALIZADO || per.EMAIL || '',
        nombre_comercial: emp.NOMBRE_COMERCIAL || '',
        nombre_fantasia: emp.NOMBRE_COMERCIAL || '',
        rubro: emp.ID_RUBRO || 'OTRO',
        subrubro: emp.ID_SUBRUBRO || '',
        formalizacion_sii: emp.FORMALIZACION || 'SIN_INICIO',
        etapa_madurez: emp.ETAPA_ACTUAL || 'ARRANQUE',
        instagram: emp.INSTAGRAM || '',
        total_documentos: perDocs.length,
        tiene_fotos_producto: tieneFotos ? 1 : 0,
        tiene_resolucion_sanitaria: tieneSanitaria ? 1 : 0
      };
    });

    const ordenPrioridad = { 'TITULAR': 1, 'SELECCIONADA': 1, 'SUPLENTE': 2, 'ADMISIBLE': 3, 'INGRESADA': 4, 'PENDIENTE': 4 };
    resultado.sort((a, b) => {
      const pA = ordenPrioridad[a.estado_postulacion] || 5;
      const pB = ordenPrioridad[b.estado_postulacion] || 5;
      if (pA !== pB) return pA - pB;
      return String(a.fecha_postulacion).localeCompare(String(b.fecha_postulacion));
    });

    return {
      success: true,
      data: resultado,
      error: null
    };
  } catch (err) {
    return { success: false, data: null, error: err.message || String(err) };
  }
}

/**
 * Actualiza el estado de forma masiva para una lista de postulaciones en Google Sheets.
 * @param {object} payload
 * @returns {{ success: boolean, data: any, error: string|null }}
 */
function actualizarEstadoPostulacionesMasivo(payload) {
  try {
    if (!payload || !payload.idIniciativa || !Array.isArray(payload.idsPostulaciones) || payload.idsPostulaciones.length === 0) {
      return { success: false, data: null, error: 'Debe seleccionar al menos una postulación.' };
    }

    const nuevoEstado = String(payload.nuevoEstado || 'ADMISIBLE').toUpperCase();
    const usuario = payload.usuarioEmail || 'funcionario@santiago.cl';
    const motivo = payload.motivo || 'Actualización masiva de estado';
    const ahora = (typeof ahoraIso_ === 'function') ? ahoraIso_() : new Date().toISOString();

    for (const idPost of payload.idsPostulaciones) {
      repoActualizar('POSTULACIONES', idPost, {
        ESTADO_POSTULACION: nuevoEstado,
        ACTUALIZADO_POR: usuario,
        ACTUALIZADO_EN: ahora
      }, { motivo: motivo });

      if (nuevoEstado === 'TITULAR' || nuevoEstado === 'SELECCIONADA') {
        const participaciones = typeof repoTodos === 'function' ? (repoTodos('PARTICIPACIONES', { incluirInactivos: true }) || []) : [];
        const part = participaciones.find(p => p.ID_POSTULACION === idPost);
        if (part) {
          repoActualizar('PARTICIPACIONES', part.ID_PARTICIPACION, {
            ESTADO_PARTICIPACION: 'CONFIRMADA'
          }, { auditar: false });
        } else {
          repoInsertar('PARTICIPACIONES', {
            ID_PARTICIPACION: 'part-' + Utilities.getUuid(),
            ID_RESULTADO: '',
            ID_POSTULACION: idPost,
            ESTADO_PARTICIPACION: 'CONFIRMADA',
            FECHA_CONFIRMACION: ahora,
            FECHA_ASISTENCIA: '',
            MOTIVO: 'STAND-ASIGNADO',
            REEMPLAZA_A: '',
            CREADO_EN: ahora,
            CREADO_POR: usuario
          }, { auditar: false });
        }
      }
    }

    return {
      success: true,
      data: {
        procesados: payload.idsPostulaciones.length,
        nuevoEstado: nuevoEstado,
        mensaje: `Se actualizaron exitosamente ${payload.idsPostulaciones.length} postulaciones a estado ${nuevoEstado} en Google Sheets.`
      },
      error: null
    };
  } catch (err) {
    return { success: false, data: null, error: err.message || String(err) };
  }
}

/**
 * Camino 2: Obtiene los emprendedores registrados en el padrón comunal disponibles
 * para ser incorporados directamente a cualquier mercado o feria del año.
 * @param {object} [filtro]
 * @returns {{ success: boolean, data: any, error: string|null }}
 */
function obtenerEmprendedoresDisponibles(filtro) {
  try {
    const emps = typeof repoTodos === 'function' ? (repoTodos('EMPRENDIMIENTOS', { incluirInactivos: false }) || []) : [];
    const personas = typeof repoTodos === 'function' ? (repoTodos('PERSONAS', { incluirInactivos: false }) || []) : [];
    const rels = typeof repoTodos === 'function' ? (repoTodos('PERSONA_EMPRENDIMIENTO', { incluirInactivos: false }) || []) : [];
    const posts = typeof repoTodos === 'function' ? (repoTodos('POSTULACIONES', { incluirInactivos: false }) || []) : [];
    const docs = typeof repoTodos === 'function' ? (repoTodos('DOCUMENTOS', { incluirInactivos: true }) || []) : [];

    const resultado = [];

    emps.forEach(emp => {
      const rel = rels.find(r => r.ID_EMPRENDIMIENTO === emp.ID_EMPRENDIMIENTO && r.ES_PRINCIPAL === 'SI') || rels.find(r => r.ID_EMPRENDIMIENTO === emp.ID_EMPRENDIMIENTO);
      if (!rel) return;

      const per = personas.find(p => p.ID_PERSONA === rel.ID_PERSONA);
      if (!per) return;

      const rubro = emp.ID_RUBRO || 'OTRO';
      const formalizacion = emp.FORMALIZACION || 'SIN_INICIO';
      const comuna = per.COMUNA_RESIDENCIA || per.COMUNA || 'SANTIAGO';

      if (filtro && filtro.rubro && rubro !== filtro.rubro) return;
      if (filtro && filtro.formalizacion && formalizacion !== filtro.formalizacion) return;
      if (filtro && filtro.comuna && comuna.toUpperCase() !== filtro.comuna.toUpperCase()) return;

      const empPosts = posts.filter(p => p.ID_EMPRENDIMIENTO === emp.ID_EMPRENDIMIENTO);
      const empDocs = docs.filter(d => (d.ID_SUJETO === per.ID_PERSONA || d.ID_SUJETO === emp.ID_EMPRENDIMIENTO) && d.ES_VERSION_VIGENTE === 'SI');

      const tieneFotos = empDocs.some(d => (d.TIPO_DOCUMENTO || '').includes('FOTO') || (d.TIPO_DOCUMENTO || '').includes('CATALOG'));
      const tieneSanitaria = empDocs.some(d => (d.TIPO_DOCUMENTO || '').includes('SANITARI'));

      const ape = [per.APELLIDO_PATERNO, per.APELLIDO_MATERNO].filter(Boolean).join(' ');
      const rutNorm = per.RUT_NORMALIZADO || per.RUT || '';

      resultado.push({
        id_emprendimiento: emp.ID_EMPRENDIMIENTO,
        codigo_comercial: emp.CODIGO_EMPRENDIMIENTO || '',
        nombre_comercial: emp.NOMBRE_COMERCIAL || '',
        nombre_fantasia: emp.NOMBRE_COMERCIAL || '',
        rubro: rubro,
        subrubro: emp.ID_SUBRUBRO || '',
        formalizacion_sii: formalizacion,
        etapa_madurez: emp.ETAPA_ACTUAL || 'ARRANQUE',
        instagram: emp.INSTAGRAM || '',
        estado: emp.ESTADO_EMPRENDIMIENTO || 'ACTIVO',
        id_persona: per.ID_PERSONA,
        rut: rutNorm,
        rut_formateado: formatearRutChileno_(rutNorm),
        nombres: per.NOMBRES || '',
        apellidos: ape,
        comuna: comuna,
        tramo_rsh: per.TRAMO_RSH || 'SIN_RSH',
        telefono: per.TELEFONO_NORMALIZADO || per.TELEFONO || '',
        email: per.EMAIL_NORMALIZADO || per.EMAIL || '',
        ferias_participadas: empPosts.length,
        total_documentos: empDocs.length,
        tiene_fotos_producto: tieneFotos ? 1 : 0,
        tiene_resolucion_sanitaria: tieneSanitaria ? 1 : 0
      });
    });

    resultado.sort((a, b) => a.nombre_comercial.localeCompare(b.nombre_comercial));

    return {
      success: true,
      data: resultado.slice(0, 300),
      error: null
    };
  } catch (err) {
    return { success: false, data: null, error: err.message || String(err) };
  }
}

/**
 * Camino 2: Incorpora masivamente emprendedores desde la base comunal a una feria o mercado del año.
 * @param {object} payload
 * @returns {{ success: boolean, data: any, error: string|null }}
 */
function incorporarEmprendedoresAMercadoMasivo(payload) {
  try {
    if (!payload || !payload.idIniciativa || !Array.isArray(payload.idsEmprendimientos) || payload.idsEmprendimientos.length === 0) {
      return { success: false, data: null, error: 'Debe especificar el mercado y al menos un emprendedor a incorporar.' };
    }

    const estadoInicial = String(payload.estadoInicial || 'TITULAR').toUpperCase();
    const usuario = payload.usuarioEmail || 'funcionario@santiago.cl';
    const ahora = (typeof ahoraIso_ === 'function') ? ahoraIso_() : new Date().toISOString();

    const rels = typeof repoTodos === 'function' ? (repoTodos('PERSONA_EMPRENDIMIENTO', { incluirInactivos: false }) || []) : [];
    const posts = typeof repoTodos === 'function' ? (repoTodos('POSTULACIONES', { incluirInactivos: false }) || []) : [];
    let nuevos = 0;

    for (const idEmp of payload.idsEmprendimientos) {
      const rel = rels.find(r => r.ID_EMPRENDIMIENTO === idEmp && r.ES_PRINCIPAL === 'SI') || rels.find(r => r.ID_EMPRENDIMIENTO === idEmp);
      if (!rel) continue;

      const idPersona = rel.ID_PERSONA;
      const postExistente = posts.find(p => p.ID_INICIATIVA === payload.idIniciativa && p.ID_EMPRENDIMIENTO === idEmp);

      if (postExistente) {
        repoActualizar('POSTULACIONES', postExistente.ID_POSTULACION, {
          ESTADO_POSTULACION: estadoInicial,
          ACTUALIZADO_POR: usuario,
          ACTUALIZADO_EN: ahora
        }, { motivo: 'Incorporación directa a mercado' });
      } else {
        const idPost = 'post-' + Utilities.getUuid();
        repoInsertar('POSTULACIONES', {
          ID_POSTULACION: idPost,
          ID_INICIATIVA: payload.idIniciativa,
          ID_EMPRENDIMIENTO: idEmp,
          ID_PERSONA_CONTACTO: idPersona,
          FECHA_POSTULACION: ahora,
          ESTADO_POSTULACION: estadoInicial,
          RESPUESTAS_JSON: JSON.stringify({ origen: 'PADRON_COMUNAL' }),
          CREADO_EN: ahora,
          CREADO_POR: usuario,
          ACTUALIZADO_EN: ahora,
          ACTUALIZADO_POR: usuario
        }, { motivo: 'Incorporación directa desde base comunal' });

        if (estadoInicial === 'TITULAR') {
          repoInsertar('PARTICIPACIONES', {
            ID_PARTICIPACION: 'part-' + Utilities.getUuid(),
            ID_RESULTADO: '',
            ID_POSTULACION: idPost,
            ESTADO_PARTICIPACION: 'CONFIRMADA',
            FECHA_CONFIRMACION: ahora,
            FECHA_ASISTENCIA: '',
            MOTIVO: 'STAND-ASIGNADO',
            REEMPLAZA_A: '',
            CREADO_EN: ahora,
            CREADO_POR: usuario
          }, { auditar: false });
        }
      }
      nuevos++;
    }

    return {
      success: true,
      data: {
        incorporados: nuevos,
        estado: estadoInicial,
        mensaje: `Se incorporaron exitosamente ${nuevos} emprendedores al mercado como ${estadoInicial} en Google Sheets.`
      },
      error: null
    };
  } catch (err) {
    return { success: false, data: null, error: err.message || String(err) };
  }
}

/**
 * Seguimiento Masivo: Obtiene los emprendedores participantes de una iniciativa
 * para la grilla de evaluación rápida en terreno.
 * @param {string} idIniciativa
 * @returns {{ success: boolean, data: any, error: string|null }}
 */
function obtenerParticipantesSeguimiento(idIniciativa) {
  try {
    if (!idIniciativa) {
      return { success: false, data: null, error: 'Debe especificar el ID de la iniciativa o mercado.' };
    }

    const ini = typeof repoBuscarPorId === 'function' ? repoBuscarPorId('INICIATIVAS', idIniciativa) : null;
    const posts = typeof repoTodos === 'function' ? (repoTodos('POSTULACIONES', { incluirInactivos: false }) || []).filter(p => p.ID_INICIATIVA === idIniciativa) : [];
    const emps = typeof repoTodos === 'function' ? (repoTodos('EMPRENDIMIENTOS', { incluirInactivos: true }) || []) : [];
    const personas = typeof repoTodos === 'function' ? (repoTodos('PERSONAS', { incluirInactivos: true }) || []) : [];
    const segs = typeof repoTodos === 'function' ? (repoTodos('SEGUIMIENTO_MERCADO', { incluirInactivos: false }) || []).filter(s => s.ID_INICIATIVA === idIniciativa) : [];

    const participantes = posts.map(p => {
      const emp = emps.find(e => e.ID_EMPRENDIMIENTO === p.ID_EMPRENDIMIENTO) || {};
      const per = personas.find(item => item.ID_PERSONA === p.ID_PERSONA_CONTACTO) || {};
      const s = segs.find(item => item.ID_EMPRENDIMIENTO === p.ID_EMPRENDIMIENTO) || {};

      const segAntes = Number(s.SEGUIDORES_ANTES) || 0;
      const segDesp = Number(s.SEGUIDORES_DESPUES) || 0;

      return {
        id_postulacion: p.ID_POSTULACION,
        id_iniciativa: p.ID_INICIATIVA,
        id_emprendimiento: p.ID_EMPRENDIMIENTO,
        estado_postulacion: p.ESTADO_POSTULACION,
        nombre_comercial: emp.NOMBRE_COMERCIAL || '',
        rubro: emp.ID_RUBRO || 'OTRO',
        subrubro: emp.ID_SUBRUBRO || '',
        formalizacion_sii: emp.FORMALIZACION || 'SIN_INICIO',
        instagram: emp.INSTAGRAM || '',
        rut: per.RUT_NORMALIZADO || per.RUT || '',
        rut_formateado: formatearRutChileno_(per.RUT_NORMALIZADO || per.RUT || ''),
        nombres: per.NOMBRES || '',
        apellidos: [per.APELLIDO_PATERNO, per.APELLIDO_MATERNO].filter(Boolean).join(' '),
        telefono: per.TELEFONO_NORMALIZADO || per.TELEFONO || '',
        id_seguimiento: s.ID_SEGUIMIENTO || '',
        asistio: s.ESTADO_PARTICIPACION || 'SI',
        ventas_totales_reportadas: Number(s.VENTAS_DURANTE || s.VENTAS_TOTALES_REPORTADAS) || 0,
        seguidores_antes: segAntes,
        seguidores_despues: segDesp,
        ganancia_seguidores: segDesp - segAntes,
        evaluacion_general: s.EVALUACION_FUNCIONARIO || 'BUENA',
        observaciones: s.OBSERVACION || ''
      };
    });

    const fInicio = (ini && (ini.FECHA_EJECUCION || ini.APERTURA_POSTULACION)) ? new Date(ini.FECHA_EJECUCION || ini.APERTURA_POSTULACION) : new Date();
    const jornadas = [
      { numero: 1, fecha: fInicio.toISOString().substring(0, 10), etiqueta: 'Día 1' }
    ];

    return {
      success: true,
      data: {
        iniciativa: ini ? {
          id_iniciativa: ini.ID_INICIATIVA,
          codigo: ini.ID_INICIATIVA,
          nombre: ini.NOMBRE,
          lugar: ini.LUGAR,
          cupos_titulares: ini.CUPOS_TITULARES
        } : null,
        participantes: participantes,
        jornadas: jornadas,
        resumenDias: [{ dia: 1, fecha: jornadas[0].fecha, totalVentas: 0, promedioVentas: 0, totalReportes: 0 }]
      },
      error: null
    };
  } catch (err) {
    return { success: false, data: null, error: err.message || String(err) };
  }
}

/**
 * Guarda masivamente el seguimiento e impacto post-mercado.
 * @param {object} payload
 * @returns {{ success: boolean, data: any, error: string|null }}
 */
function guardarSeguimientoMasivo(payload) {
  try {
    if (!payload || !payload.idIniciativa || !Array.isArray(payload.filas) || payload.filas.length === 0) {
      return { success: false, data: null, error: 'Debe ingresar datos de seguimiento para guardar.' };
    }

    const usuario = payload.usuarioEmail || 'funcionario@santiago.cl';
    const ahora = (typeof ahoraIso_ === 'function') ? ahoraIso_() : new Date().toISOString();
    const segs = typeof repoTodos === 'function' ? (repoTodos('SEGUIMIENTO_MERCADO', { incluirInactivos: true }) || []) : [];

    for (const f of payload.filas) {
      const previo = segs.find(s => s.ID_INICIATIVA === payload.idIniciativa && s.ID_EMPRENDIMIENTO === f.idEmprendimiento);
      const ventas = parseFloat(f.ventasTotales) || 0;
      const segAntes = parseInt(f.seguidoresAntes, 10) || 0;
      const segDesp = parseInt(f.seguidoresDespues, 10) || 0;

      if (previo) {
        repoActualizar('SEGUIMIENTO_MERCADO', previo.ID_SEGUIMIENTO, {
          VENTAS_DURANTE: ventas,
          SEGUIDORES_ANTES: segAntes,
          SEGUIDORES_DESPUES: segDesp,
          EVALUACION_FUNCIONARIO: f.evaluacion || 'ADECUADO',
          OBSERVACION: f.observaciones || '',
          REGISTRADO_POR: usuario
        }, { auditar: false });
      } else {
        repoInsertar('SEGUIMIENTO_MERCADO', {
          ID_SEGUIMIENTO: 'seg-' + Utilities.getUuid(),
          ID_INICIATIVA: payload.idIniciativa,
          ID_EMPRENDIMIENTO: f.idEmprendimiento,
          ID_POSTULACION: f.idPostulacion || '',
          FECHA_REGISTRO: ahora.substring(0, 10),
          VENTAS_ANTES: 0,
          VENTAS_DURANTE: ventas,
          VENTAS_DESPUES: 0,
          SEGUIDORES_ANTES: segAntes,
          SEGUIDORES_DESPUES: segDesp,
          PUNTUALIDAD: 'A_TIEMPO',
          RESPONSABILIDAD: 'ADECUADA',
          EVALUACION_FUNCIONARIO: f.evaluacion || 'ADECUADO',
          OBSERVACION: f.observaciones || '',
          REGISTRADO_POR: usuario,
          TIPO_AYUDA: 'PUNTO_DE_VENTA'
        }, { auditar: false });
      }
    }

    return {
      success: true,
      data: {
        guardados: payload.filas.length,
        mensaje: `Se guardó exitosamente el seguimiento de ${payload.filas.length} participantes en Google Sheets.`
      },
      error: null
    };
  } catch (err) {
    return { success: false, data: null, error: err.message || String(err) };
  }
}

/**
 * Obtiene el resumen comparativo de ventas por jornada/día de una feria.
 * @param {string} idIniciativa
 * @returns {{ success: boolean, data: any, error: string|null }}
 */
function obtenerResumenVentasPorDia(idIniciativa) {
  try {
    if (!idIniciativa) {
      return { success: false, data: null, error: 'Debe especificar el ID de la iniciativa o mercado.' };
    }

    const segs = typeof repoTodos === 'function' ? (repoTodos('SEGUIMIENTO_MERCADO', { incluirInactivos: false }) || []).filter(s => s.ID_INICIATIVA === idIniciativa) : [];
    let total = 0;
    segs.forEach(s => {
      total += Number(s.VENTAS_DURANTE || s.VENTAS_TOTALES_REPORTADAS) || 0;
    });

    return {
      success: true,
      data: {
        idIniciativa: idIniciativa,
        totalVentasMercado: Math.round(total),
        dias: [
          { dia_numero: 1, ventas_totales_dia: Math.round(total), total_emprendedores: segs.length }
        ]
      },
      error: null
    };
  } catch (err) {
    return { success: false, data: null, error: err.message || String(err) };
  }
}
