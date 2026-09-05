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

function obtenerOCrearFormularioUnicoMercados_() {
  const props = PropertiesService.getScriptProperties();
  let id = props.getProperty(APP.PROP_FORM_MERCADO_UNICO_ID);
  let form = abrirFormularioSeguro_(id);
  
  // Si no está registrado, intentar plantilla existente en Mi Unidad
  if (!form) {
    const templateId = props.getProperty(APP.PROP_FORM_MERCADO_TEMPLATE_ID) || '1AxOgL7IYllsA00UpQsQ1wwC44EekhG9cG2ggvE1LpX8';
    form = abrirFormularioSeguro_(templateId);
    if (form) {
      props.setProperty(APP.PROP_FORM_MERCADO_UNICO_ID, form.getId());
    }
  }
  
  if (!form) {
    const carpeta = carpetaFormulariosPublicos_();
    const archivos = carpeta.getFilesByName('Postulación a Mercados y Convocatorias - Municipalidad de Santiago');
    if (archivos.hasNext()) {
      form = FormApp.openById(archivos.next().getId());
    }
  }
  
  if (!form) {
    form = FormApp.create('Postulación a Mercados y Convocatorias - Municipalidad de Santiago');
    form.setDescription('Formulario oficial para postular a ferias, mercados y convocatorias de emprendimiento de la Municipalidad de Santiago. Si ya está registrado en el SGE, ingrese su RUT y se mantendrán sus antecedentes actualizados.');
    form.setConfirmationMessage('Postulación recibida exitosamente. El equipo municipal de Fomento Productivo revisará los antecedentes según las bases de la convocatoria.');
    asegurarCamposBaseFormularioMercado_(form);
    
    try {
      DriveApp.getFileById(form.getId()).moveTo(carpetaFormulariosPublicos_());
    } catch (ignored) {}
    
    try {
      form.setDestination(FormApp.DestinationType.SPREADSHEET, db_().getId());
    } catch (ignored) {}
  }
  
  // Asegurar que el archivo del formulario resida en la carpeta protegida de "Mi Unidad"
  try {
    const formFile = DriveApp.getFileById(form.getId());
    const carpetaMiUnidad = carpetaFormulariosPublicos_();
    if (!formFile.getParents().hasNext() || formFile.getParents().next().getId() !== carpetaMiUnidad.getId()) {
      formFile.moveTo(carpetaMiUnidad);
    }
  } catch (ignored) {}
  
  habilitarRespuestasFormulario_(form);
  props.setProperty(APP.PROP_FORM_MERCADO_UNICO_ID, form.getId());
  props.setProperty(APP.PROP_FORM_MERCADO_UNICO_URL, form.getPublishedUrl());
  
  // Asegurar trigger único para este formulario maestro
  const triggers = ScriptApp.getProjectTriggers();
  const tieneTrigger = triggers.some(function(t) {
    return t.getHandlerFunction() === 'procesarPostulacionMercadoFormulario' &&
           t.getTriggerSourceId() === form.getId();
  });
  if (!tieneTrigger) {
    ScriptApp.newTrigger('procesarPostulacionMercadoFormulario').forForm(form).onFormSubmit().create();
  }
  
  return form;
}

function fijarOpcionesItemFormulario_(item, opciones) {
  if (!item) return;
  if (typeof item.setChoiceValues === 'function') {
    item.setChoiceValues(opciones);
  } else if (typeof item.asListItem === 'function') {
    item.asListItem().setChoiceValues(opciones);
  } else if (typeof item.asMultipleChoiceItem === 'function') {
    item.asMultipleChoiceItem().setChoiceValues(opciones);
  }
}

function sincronizarMercadosEnFormularioUnico_() {
  const form = obtenerOCrearFormularioUnicoMercados_();
  if (!form) return null;
  
  const items = form.getItems();
  let selectorItem = null;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const t = (it.getTitle() || '').toLowerCase();
    if (t.indexOf('mercado') >= 0 || t.indexOf('convocatoria') >= 0 || t.indexOf('feria') >= 0) {
      if (it.getType() === FormApp.ItemType.LIST || it.getType() === FormApp.ItemType.MULTIPLE_CHOICE) {
        selectorItem = it;
        break;
      }
    }
  }
  
  if (!selectorItem) {
    selectorItem = form.addListItem();
    selectorItem.setTitle('Mercado o Convocatoria a la que postula').setRequired(true);
    try { form.moveItem(selectorItem.getIndex(), 0); } catch (ignored) {}
  }
  
  // 1. Obtener iniciativas abiertas desde Turso
  let abiertas = [];
  try {
    if (typeof tursoEjecutar === 'function') {
      const qTurso = tursoEjecutar("SELECT id_iniciativa, nombre FROM iniciativas WHERE estado IN ('ABIERTA', 'PUBLICADA', 'EN_EVALUACION');");
      if (qTurso && qTurso.success && qTurso.data && Array.isArray(qTurso.data.rows)) {
        abiertas = qTurso.data.rows.map(function(r) {
          return { ID_INICIATIVA: r.id_iniciativa, NOMBRE: r.nombre };
        });
      }
    }
  } catch (e) {
    Logger.log('Aviso consulta Turso en sincronización: ' + e.message);
  }
  
  // 2. Si Turso no retornó o no está activo, usar Google Sheets como respaldo
  if (abiertas.length === 0) {
    try {
      const iniciativas = repoTodos('INICIATIVAS', { incluirInactivos: false });
      abiertas = iniciativas.filter(function(i) {
        return i.ESTADO === 'ABIERTA';
      }).map(function(i) {
        return { ID_INICIATIVA: i.ID_INICIATIVA, NOMBRE: i.NOMBRE };
      });
    } catch (e) {}
  }
  
  const formUrl = form.getPublishedUrl();
  const props = PropertiesService.getScriptProperties();
  props.setProperty(APP.PROP_FORM_MERCADO_UNICO_URL, formUrl);
  
  if (abiertas.length > 0) {
    const opciones = abiertas.map(function(i) {
      return i.NOMBRE + ' [ID: ' + i.ID_INICIATIVA + ']';
    });
    fijarOpcionesItemFormulario_(selectorItem, opciones);
    habilitarRespuestasFormulario_(form);
    
    // Actualizar URL del formulario en Turso y en Sheets
    abiertas.forEach(function(i) {
      try {
        if (typeof tursoEjecutar === 'function') {
          tursoEjecutar("UPDATE iniciativas SET url_formulario = ? WHERE id_iniciativa = ?;", [formUrl, i.ID_INICIATIVA]);
        }
      } catch (ignored) {}
      try {
        repoActualizar('INICIATIVAS', i.ID_INICIATIVA, { URL_FORMULARIO_POSTULACION: formUrl }, { motivo: 'Vinculación a Formulario Único Oficial' });
      } catch (ignored) {}
    });
  } else {
    fijarOpcionesItemFormulario_(selectorItem, ['No hay convocatorias abiertas en este momento']);
  }
  
  const carpetaPublica = carpetaFormulariosPublicos_();
  return {
    formId: form.getId(),
    formUrl: formUrl,
    editUrl: form.getEditUrl(),
    carpetaDriveUrl: carpetaPublica ? carpetaPublica.getUrl() : '',
    carpetaDriveId: carpetaPublica ? carpetaPublica.getId() : '',
    totalAbiertas: abiertas.length,
    mercados: abiertas.map(function(i) { return i.NOMBRE; })
  };
}

function crearFormularioMercadoDesdePlantilla_(idIniciativa, reemplazar) {
  const iniciativa = repoBuscarPorId('INICIATIVAS', idIniciativa);
  exigir_(iniciativa, 'NO_ENCONTRADO', 'Mercado no encontrado.');
  
  if (iniciativa.ESTADO === 'BORRADOR') {
    repoActualizar('INICIATIVAS', idIniciativa, { ESTADO: 'ABIERTA' }, { motivo: 'Apertura automática al generar enlace de postulación' });
  }
  
  const sync = sincronizarMercadosEnFormularioUnico_();
  const formUrl = sync.formUrl;
  
  repoActualizar('INICIATIVAS', idIniciativa, {
    URL_FORMULARIO_POSTULACION: formUrl
  }, { motivo: 'Asignación de Formulario Único Oficial de Postulaciones' });
  
  return {
    url: formUrl,
    editUrl: sync.editUrl,
    id: sync.formId,
    documentosConfigurados: true,
    faltantes: [],
    formularioAnteriorCerrado: '',
    plantillaRecuperadaDesde: 'FORMULARIO_UNICO_MUNICIPAL',
    mensaje: 'Mercado sincronizado exitosamente en el Formulario Único Oficial.'
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
      let idIniciativa = '';
      const selected = answers['Mercado o Convocatoria a la que postula'] ||
                       answers['Mercado o Convocatoria'] ||
                       answers['Convocatoria'] ||
                       answers['Feria o Mercado'];
      if (selected) {
        const match = String(selected).match(/\[ID:\s*([A-Za-z0-9_-]+)\]/);
        if (match && match[1]) {
          idIniciativa = match[1];
        } else {
          const todas = repoTodos('INICIATIVAS', { incluirInactivos: true });
          const matchName = todas.find(function(i) {
            return selected.indexOf(i.NOMBRE) >= 0 || String(i.NOMBRE).trim() === String(selected).trim();
          });
          if (matchName) idIniciativa = matchName.ID_INICIATIVA;
        }
      }
      if (!idIniciativa) {
        const formId = e && e.source && e.source.getId ? e.source.getId() : '';
        const map = JSON.parse(PropertiesService.getScriptProperties().getProperty('SGE_FORM_MERCADO_MAP') || '{}');
        idIniciativa = map[formId];
      }
      exigir_(idIniciativa, 'FORMULARIO_NO_CONFIGURADO', 'No se pudo identificar el mercado o convocatoria vinculado a la postulación.');
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

      // === SINCRONIZACIÓN CON TURSO (Base de Datos Relacional) ===
      try {
        if (typeof tursoEjecutar === 'function') {
          // 1. Guardar o actualizar Ficha en Turso con validaciones chilenas
          const tursoPayload = {
            rut: personaData.RUT,
            nombres: personaData.NOMBRES,
            apellidos: ((personaData.APELLIDO_PATERNO || '') + ' ' + (personaData.APELLIDO_MATERNO || '')).trim(),
            email: personaData.EMAIL || '',
            telefono: personaData.TELEFONO || '',
            comuna: personaData.COMUNA_RESIDENCIA || 'SANTIAGO',
            nombreComercial: empData.NOMBRE_COMERCIAL,
            rubro: empData.ID_RUBRO,
            subrubro: empData.ID_SUBRUBRO || '',
            formalizacionSii: empData.FORMALIZACION || 'SIN_INICIO',
            instagram: empData.INSTAGRAM || '',
            descripcionProducto: empData.DESCRIPCION || '',
            usuarioEmail: 'FORMULARIO_MERCADO'
          };
          
          if (typeof guardarFichaEmprendedor === 'function') {
            const tursoFicha = guardarFichaEmprendedor(tursoPayload);
            if (tursoFicha && tursoFicha.success && tursoFicha.data) {
              const idPerTurso = tursoFicha.data.idPersona;
              const idEmpTurso = tursoFicha.data.idEmprendimiento;

              // 2. Insertar o actualizar Postulación en Turso
              const qCheckPost = tursoEjecutar(
                "SELECT id_postulacion FROM postulaciones WHERE id_iniciativa = ? AND id_emprendimiento = ? LIMIT 1;",
                [idIniciativa, idEmpTurso]
              );
              if (qCheckPost && qCheckPost.success && qCheckPost.data && qCheckPost.data.rows && qCheckPost.data.rows.length > 0) {
                tursoEjecutar(
                  "UPDATE postulaciones SET id_persona_contacto = ?, estado_postulacion = 'INGRESADA', actualizado_en = datetime('now') WHERE id_postulacion = ?;",
                  [idPerTurso, qCheckPost.data.rows[0].id_postulacion]
                );
              } else {
                tursoEjecutar(
                  `INSERT INTO postulaciones (
                    id_postulacion, id_iniciativa, id_emprendimiento, id_persona_contacto,
                    fecha_postulacion, estado_postulacion, observaciones, creado_por, creado_en
                  ) VALUES (?, ?, ?, ?, datetime('now'), 'INGRESADA', ?, 'FORMULARIO_MERCADO', datetime('now'));`,
                  ['post-' + Utilities.getUuid(), idIniciativa, idEmpTurso, idPerTurso, 'Postulación recibida desde Formulario Oficial de Google']
                );
              }

              // 3. Procesar documentos cargados: mover a carpetas organizadas y registrar en Turso
              if (typeof DOCUMENTOS_FORMULARIO_REGISTRO !== 'undefined') {
                DOCUMENTOS_FORMULARIO_REGISTRO.forEach(function(config) {
                  const rawAns = respuestaDocumentoFormulario_(answers, config);
                  const fileIds = idsArchivosRespuestaFormulario_(rawAns);
                  fileIds.forEach(function(fid) {
                    try {
                      const fDrive = DriveApp.getFileById(fid);
                      if (typeof cargarDocumentoExpediente === 'function') {
                        cargarDocumentoExpediente({
                          rut: personaData.RUT,
                          tipoDocumento: config.tipoDocumento || 'OTRO',
                          archivo: fDrive.getBlob(),
                          usuarioEmail: 'FORMULARIO_MERCADO'
                        });
                      }
                    } catch (errDoc) {
                      Logger.log('Aviso al procesar documento para Turso: ' + errDoc.message);
                    }
                  });
                });
              }
            }
          }
        }
      } catch (errTurso) {
        Logger.log('Error general al sincronizar postulación con Turso: ' + errTurso.message);
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
