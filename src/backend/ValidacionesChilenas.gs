// ValidacionesChilenas.gs
// Módulo de validación de datos para el contexto nacional chileno
// Sistema de Gestión de Emprendimientos (SGE)

/**
 * Limpia y normaliza un RUT quitando puntos, guiones y espacios, convirtiendo a mayúsculas.
 * Ejemplo: " 19.876.543-k " -> "19876543K"
 * @param {string} rut
 * @returns {string}
 */
function normalizarRut(rut) {
  if (!rut || typeof rut !== 'string') return '';
  return rut.replace(/[^0-9kK]/g, '').toUpperCase();
}

/**
 * Valida un RUT chileno usando el algoritmo Módulo 11.
 * Retorna { success: true, data: { rutLimpio, rutFormateado, cuerpo, dv }, error: null }
 * o { success: false, data: null, error: string }
 * @param {string} rutCompleto
 * @returns {{ success: boolean, data: object|null, error: string|null }}
 */
function validarRutChileno(rutCompleto) {
  try {
    const rutLimpio = normalizarRut(rutCompleto);

    if (!rutLimpio || rutLimpio.length < 8 || rutLimpio.length > 9) {
      return {
        success: false,
        data: null,
        error: 'El RUT debe tener entre 7 y 8 dígitos más el dígito verificador.'
      };
    }

    const cuerpo = rutLimpio.slice(0, -1);
    const dv = rutLimpio.slice(-1);

    // Validar que el cuerpo sean solo dígitos
    if (!/^\d+$/.test(cuerpo)) {
      return {
        success: false,
        data: null,
        error: 'El cuerpo del RUT solo debe contener números.'
      };
    }

    // Cálculo del Dígito Verificador mediante Módulo 11
    let suma = 0;
    let multiplo = 2;

    for (let i = cuerpo.length - 1; i >= 0; i--) {
      suma += parseInt(cuerpo.charAt(i), 10) * multiplo;
      multiplo = multiplo === 7 ? 2 : multiplo + 1;
    }

    const resto = suma % 11;
    const dvEsperadoCalculado = 11 - resto;

    let dvEsperado = '';
    if (dvEsperadoCalculado === 11) {
      dvEsperado = '0';
    } else if (dvEsperadoCalculado === 10) {
      dvEsperado = 'K';
    } else {
      dvEsperado = dvEsperadoCalculado.toString();
    }

    if (dv !== dvEsperado) {
      return {
        success: false,
        data: null,
        error: `El dígito verificador ingresado (${dv}) no coincide con el calculado (${dvEsperado}).`
      };
    }

    // Formatear: ej. 12.345.678-9
    const cuerpoFormateado = cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    const rutFormateado = `${cuerpoFormateado}-${dv}`;

    return {
      success: true,
      data: {
        rutLimpio: `${cuerpo}${dv}`,
        rutFormateado: rutFormateado,
        cuerpo: parseInt(cuerpo, 10),
        dv: dv
      },
      error: null
    };
  } catch (err) {
    return {
      success: false,
      data: null,
      error: 'Error al procesar el RUT: ' + (err.message || String(err))
    };
  }
}

/**
 * Valida y normaliza un teléfono celular chileno a formato E.164 (+569XXXXXXXX).
 * Acepta: "+56912345678", "912345678", "12345678"
 * @param {string} telefono
 * @returns {{ success: boolean, data: object|null, error: string|null }}
 */
function validarTelefonoChileno(telefono) {
  try {
    if (!telefono || typeof telefono !== 'string') {
      return { success: false, data: null, error: 'El teléfono es requerido.' };
    }

    // Eliminar espacios, guiones y paréntesis
    let limpio = telefono.replace(/[\s\-\(\)\.]/g, '');

    // Si comienza con +569
    if (/^\+569\d{8}$/.test(limpio)) {
      return { success: true, data: { telefonoE164: limpio, telefonoNacional: limpio.replace('+56', '') }, error: null };
    }

    // Si comienza con 569
    if (/^569\d{8}$/.test(limpio)) {
      return { success: true, data: { telefonoE164: '+' + limpio, telefonoNacional: limpio.slice(2) }, error: null };
    }

    // Si comienza con 9 y tiene 9 dígitos
    if (/^9\d{8}$/.test(limpio)) {
      return { success: true, data: { telefonoE164: '+56' + limpio, telefonoNacional: limpio }, error: null };
    }

    // Si solo tiene 8 dígitos (sin el 9)
    if (/^\d{8}$/.test(limpio)) {
      return { success: true, data: { telefonoE164: '+569' + limpio, telefonoNacional: '9' + limpio }, error: null };
    }

    return {
      success: false,
      data: null,
      error: 'El teléfono debe ser un número móvil chileno válido de 9 dígitos (ej: 912345678 o +56912345678).'
    };
  } catch (err) {
    return {
      success: false,
      data: null,
      error: 'Error al validar teléfono: ' + (err.message || String(err))
    };
  }
}

/**
 * Valida formato estándar de correo electrónico.
 * @param {string} email
 * @returns {{ success: boolean, data: string|null, error: string|null }}
 */
function validarEmail(email) {
  if (!email || typeof email !== 'string') {
    return { success: false, data: null, error: 'El correo electrónico es requerido.' };
  }
  const clean = email.trim().toLowerCase();
  const regex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!regex.test(clean)) {
    return { success: false, data: null, error: 'El formato del correo electrónico no es válido.' };
  }
  return { success: true, data: clean, error: null };
}

/**
 * Sanitiza texto general para evitar inyecciones o caracteres extraños.
 * @param {string} texto
 * @param {number} maxLen
 * @returns {string}
 */
function sanitizarTexto(texto, maxLen = 255) {
  if (texto === null || texto === undefined) return '';
  const str = String(texto).trim();
  return str.slice(0, maxLen);
}
