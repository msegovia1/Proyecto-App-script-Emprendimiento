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
