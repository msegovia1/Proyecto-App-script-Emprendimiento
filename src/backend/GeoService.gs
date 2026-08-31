// ===== GeoService.gs =====
// SGE v2.1.0 - Ficha integral del emprendedor
// Direcciones, derivaciones y georreferenciación con Google Maps

function apiRegistrarDerivacion(data) {
  try {
    const user = exigirPermiso_('PERSONA_EDITAR');
    exigir_(data && data.ID_ATENCION && data.DESTINO && data.MOTIVO, 'DATOS_INCOMPLETOS', 'Atención, destino y motivo son obligatorios.');
    return respuestaOk(repoInsertar('DERIVACIONES', Object.assign({}, data, {
      ID_DERIVACION: uuid_(),
      ORIGEN: data.ORIGEN || 'SGE',
      FECHA: ahoraIso_(),
      RESULTADO: data.RESULTADO || 'PENDIENTE',
      SEGUIMIENTO: data.SEGUIMIENTO || '',
      CREADO_POR: user.EMAIL
    })));
  } catch (error) {
    return manejarError_(error, 'apiRegistrarDerivacion');
  }
}

function apiRegistrarDireccion(data) {
  try {
    const user = exigirPermiso_('EMPRENDIMIENTO_EDITAR');
    exigir_(data && data.ID_SUJETO && data.DIRECCION_DECLARADA, 'DATOS_INCOMPLETOS', 'Sujeto y dirección son obligatorios.');
    const value = Object.assign({}, data, {
      ID_DIRECCION: uuid_(),
      DIRECCION_NORMALIZADA: normalizarTexto_(data.DIRECCION_DECLARADA),
      ESTADO_VALIDACION: 'DECLARADO',
      ES_VIGENTE: 'SI',
      CREADO_EN: ahoraIso_(),
      CREADO_POR: user.EMAIL
    });
    return respuestaOk(repoInsertar('DIRECCIONES', value));
  } catch (error) {
    return manejarError_(error, 'apiRegistrarDireccion');
  }
}

function apiGeocodificarDireccion(idDireccion) {
  try {
    const user = exigirPermiso_('EMPRENDIMIENTO_EDITAR');
    const address = repoBuscarPorId('DIRECCIONES', idDireccion);
    exigir_(address, 'NO_ENCONTRADO', idDireccion);
    const query = [address.DIRECCION_NORMALIZADA, address.COMUNA, 'Chile'].filter(Boolean).join(', ');
    const results = Maps.newGeocoder().setRegion('cl').geocode(query);
    exigir_(results.status === 'OK' && results.results.length, 'GEOCODIFICACION_FALLIDA', query);
    const loc = results.results[0].geometry.location;
    const geo = repoInsertar('GEOLOCALIZACIONES', {
      ID_GEOLOCALIZACION: uuid_(),
      ID_DIRECCION: idDireccion,
      LATITUD: loc.lat,
      LONGITUD: loc.lng,
      PRECISION: results.results[0].geometry.location_type || 'NO_DEFINIDA',
      FUENTE: 'GOOGLE_MAPS',
      FECHA_GEOCODIFICACION: ahoraIso_(),
      ESTADO_VALIDACION: 'AUTOMATICA',
      CREADO_POR: user.EMAIL
    });
    repoActualizar('DIRECCIONES', idDireccion, { ESTADO_VALIDACION: 'PENDIENTE' }, { motivo: 'Geocodificación automática pendiente de confirmación' });
    return respuestaOk(geo);
  } catch (error) {
    return manejarError_(error, 'apiGeocodificarDireccion');
  }
}
