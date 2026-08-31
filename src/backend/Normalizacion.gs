// ===== Normalizacion.gs =====
// SGE v2.1.0 - Ficha integral del emprendedor
// Funciones de normalización de datos chilenos, validación de RUT, hashing y PRNG

/**
 * Normaliza un RUT chileno eliminando puntos y espacios, asegurando formato 12345678-K.
 */
function normalizarRut_(value) {
  const clean = String(value || '').replace(/[^0-9kK]/g, '').toUpperCase();
  if (clean.length < 2) return '';
  return clean.slice(0, -1) + '-' + clean.slice(-1);
}

/**
 * Valida un RUT chileno aplicando el algoritmo Módulo 11.
 */
function validarRut_(value) {
  const rut = normalizarRut_(value).replace('-', '');
  if (!rut || rut.length < 2) return false;
  const body = rut.slice(0, -1);
  const dv = rut.slice(-1);
  let sum = 0;
  let multiplier = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += Number(body[i]) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }
  const result = 11 - (sum % 11);
  const expected = result === 11 ? '0' : result === 10 ? 'K' : String(result);
  return dv === expected;
}

/**
 * Normaliza cadenas de texto eliminando espacios redundantes en extremos e interior.
 */
function normalizarTexto_(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

/**
 * Normaliza una dirección de correo electrónico a minúsculas y sin espacios.
 */
function normalizarEmail_(value) {
  return String(value || '').trim().toLowerCase();
}

/**
 * Normaliza números telefónicos a formato internacional E.164 (+56912345678).
 */
function normalizarTelefono_(value) {
  let clean = String(value || '').replace(/\D/g, '');
  if (clean.length === 9) clean = '56' + clean;
  return clean ? '+' + clean : '';
}

/**
 * Normaliza todos los campos de contacto y nombres de una persona.
 */
function normalizarPersona_(data) {
  const out = Object.assign({}, data);
  out.RUT_NORMALIZADO = normalizarRut_(data.RUT_NORMALIZADO || data.RUT);
  out.NOMBRES = normalizarTexto_(data.NOMBRES);
  out.APELLIDO_PATERNO = normalizarTexto_(data.APELLIDO_PATERNO);
  out.APELLIDO_MATERNO = normalizarTexto_(data.APELLIDO_MATERNO);
  out.EMAIL_NORMALIZADO = normalizarEmail_(data.EMAIL_NORMALIZADO || data.EMAIL);
  out.TELEFONO_NORMALIZADO = normalizarTelefono_(data.TELEFONO_NORMALIZADO || data.TELEFONO);
  return out;
}

/**
 * Genera el hash SHA-256 en formato hexadecimal de un valor.
 */
function huella_(value) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value), Utilities.Charset.UTF_8);
  return bytes.map(function(b) {
    const v = (b + 256) % 256;
    return ('0' + v.toString(16)).slice(-2);
  }).join('');
}

/**
 * Generador congruencial lineal pseudoaleatorio con semilla fija para sorteos reproducibles.
 */
function randomSemilla_(seed) {
  let x = Number(seed) || 1;
  return function() {
    x = (x * 1664525 + 1013904223) % 4294967296;
    return x / 4294967296;
  };
}
