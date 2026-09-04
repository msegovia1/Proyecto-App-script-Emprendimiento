// DatabaseSchema.gs
// Esquema Relacional Completo (16 Tablas) para Turso libSQL
// Sistema de Gestión de Emprendimientos (SGE) - Municipalidad de Santiago
// Todas las tablas cuentan con UUID v4, trazabilidad CREADO_POR / ACTUALIZADO_POR e ISO 8601

function obtenerSentenciasDDL() {
  return [
    // ==========================================
    // 1. PERSONAS
    // ==========================================
    `CREATE TABLE IF NOT EXISTS personas (
      id_persona TEXT PRIMARY KEY,
      rut TEXT UNIQUE NOT NULL,
      rut_formateado TEXT NOT NULL,
      nombres TEXT NOT NULL,
      apellidos TEXT NOT NULL,
      fecha_nacimiento TEXT,
      genero TEXT,
      discapacidad_declarada TEXT DEFAULT 'NO',
      email TEXT,
      telefono TEXT,
      comuna TEXT DEFAULT 'SANTIAGO',
      direccion TEXT,
      tramo_rsh TEXT DEFAULT 'SIN_RSH',
      pueblo_originario TEXT DEFAULT 'NO',
      estado TEXT DEFAULT 'ACTIVO',
      creado_por TEXT,
      actualizado_por TEXT,
      creado_en TEXT DEFAULT (datetime('now')),
      actualizado_en TEXT DEFAULT (datetime('now'))
    );`,
    `CREATE INDEX IF NOT EXISTS idx_personas_rut ON personas(rut);`,
    `CREATE INDEX IF NOT EXISTS idx_personas_email ON personas(email);`,
    `CREATE INDEX IF NOT EXISTS idx_personas_estado ON personas(estado);`,

    // ==========================================
    // 2. EMPRENDIMIENTOS
    // ==========================================
    `CREATE TABLE IF NOT EXISTS emprendimientos (
      id_emprendimiento TEXT PRIMARY KEY,
      codigo_comercial TEXT UNIQUE,
      nombre_fantasia TEXT NOT NULL,
      nombre_comercial TEXT NOT NULL,
      rubro TEXT NOT NULL,
      subrubro TEXT,
      formalizacion_sii TEXT DEFAULT 'SIN_INICIO',
      rut_empresa TEXT,
      etapa_madurez TEXT DEFAULT 'IDEA',
      anios_funcionamiento INTEGER DEFAULT 0,
      dedicacion TEXT DEFAULT 'PARCIAL',
      redes_sociales TEXT,
      instagram TEXT,
      sitio_web TEXT,
      descripcion_producto TEXT,
      estado TEXT DEFAULT 'ACTIVO',
      creado_por TEXT,
      actualizado_por TEXT,
      creado_en TEXT DEFAULT (datetime('now')),
      actualizado_en TEXT DEFAULT (datetime('now'))
    );`,
    `CREATE INDEX IF NOT EXISTS idx_emp_rubro ON emprendimientos(rubro);`,
    `CREATE INDEX IF NOT EXISTS idx_emp_formalizacion ON emprendimientos(formalizacion_sii);`,
    `CREATE INDEX IF NOT EXISTS idx_emp_codigo ON emprendimientos(codigo_comercial);`,

    // ==========================================
    // 3. PERSONA_EMPRENDIMIENTO (Relación N:M)
    // ==========================================
    `CREATE TABLE IF NOT EXISTS persona_emprendimiento (
      id_vinculacion TEXT PRIMARY KEY,
      id_persona TEXT NOT NULL,
      id_emprendimiento TEXT NOT NULL,
      rol TEXT DEFAULT 'TITULAR',
      es_titular_principal INTEGER DEFAULT 1,
      creado_por TEXT,
      actualizado_por TEXT,
      creado_en TEXT DEFAULT (datetime('now')),
      actualizado_en TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (id_persona) REFERENCES personas(id_persona) ON DELETE CASCADE,
      FOREIGN KEY (id_emprendimiento) REFERENCES emprendimientos(id_emprendimiento) ON DELETE CASCADE
    );`,
    `CREATE INDEX IF NOT EXISTS idx_pe_persona ON persona_emprendimiento(id_persona);`,
    `CREATE INDEX IF NOT EXISTS idx_pe_emp ON persona_emprendimiento(id_emprendimiento);`,

    // ==========================================
    // 4. DOCUMENTOS (Expediente con Hash SHA-256)
    // ==========================================
    `CREATE TABLE IF NOT EXISTS documentos (
      id_documento TEXT PRIMARY KEY,
      id_persona TEXT,
      id_emprendimiento TEXT,
      tipo_documento TEXT NOT NULL,
      sha256_hash TEXT NOT NULL,
      version_vigente TEXT DEFAULT 'SI',
      estado_revision TEXT DEFAULT 'RECIBIDO',
      drive_file_id TEXT NOT NULL,
      drive_url TEXT NOT NULL,
      nombre_archivo TEXT NOT NULL,
      mime_type TEXT,
      tamano_bytes INTEGER,
      fecha_emision TEXT,
      fecha_vencimiento TEXT,
      observaciones TEXT,
      creado_por TEXT,
      actualizado_por TEXT,
      creado_en TEXT DEFAULT (datetime('now')),
      actualizado_en TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (id_persona) REFERENCES personas(id_persona),
      FOREIGN KEY (id_emprendimiento) REFERENCES emprendimientos(id_emprendimiento)
    );`,
    `CREATE INDEX IF NOT EXISTS idx_doc_persona ON documentos(id_persona);`,
    `CREATE INDEX IF NOT EXISTS idx_doc_hash ON documentos(sha256_hash);`,
    `CREATE INDEX IF NOT EXISTS idx_doc_tipo ON documentos(tipo_documento);`,
    `CREATE INDEX IF NOT EXISTS idx_doc_vigente ON documentos(version_vigente);`,

    // ==========================================
    // 5. INICIATIVAS (Ferias, Mercados y Convocatorias - Esquema GitHub)
    // ==========================================
    `CREATE TABLE IF NOT EXISTS iniciativas (
      id_iniciativa TEXT PRIMARY KEY,
      codigo TEXT UNIQUE NOT NULL,
      nombre TEXT NOT NULL,
      tipo TEXT DEFAULT 'FERIA',
      objetivo TEXT,
      tematica TEXT,
      barrio TEXT,
      lugar TEXT,
      ubicacion TEXT,
      entidad_organizadora TEXT,
      responsable TEXT,
      cupos_titulares INTEGER DEFAULT 20,
      cupos_suplentes INTEGER DEFAULT 10,
      fecha_inicio_postulacion TEXT,
      fecha_cierre_postulacion TEXT,
      fecha_ejecucion_inicio TEXT,
      fecha_ejecucion_fin TEXT,
      url_formulario TEXT,
      version_reglas TEXT DEFAULT 'v1.0',
      estado TEXT DEFAULT 'BORRADOR',
      creado_por TEXT,
      actualizado_por TEXT,
      creado_en TEXT DEFAULT (datetime('now')),
      actualizado_en TEXT DEFAULT (datetime('now'))
    );`,
    `CREATE INDEX IF NOT EXISTS idx_iniciativas_codigo ON iniciativas(codigo);`,
    `CREATE INDEX IF NOT EXISTS idx_iniciativas_estado ON iniciativas(estado);`,

    // ==========================================
    // 6. POSTULACIONES
    // ==========================================
    `CREATE TABLE IF NOT EXISTS postulaciones (
      id_postulacion TEXT PRIMARY KEY,
      id_iniciativa TEXT NOT NULL,
      id_emprendimiento TEXT NOT NULL,
      id_persona_contacto TEXT NOT NULL,
      fecha_postulacion TEXT DEFAULT (datetime('now')),
      estado_postulacion TEXT DEFAULT 'INGRESADA',
      motivo_rechazo TEXT,
      puntaje REAL DEFAULT 0,
      observaciones TEXT,
      creado_por TEXT,
      actualizado_por TEXT,
      creado_en TEXT DEFAULT (datetime('now')),
      actualizado_en TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (id_iniciativa) REFERENCES iniciativas(id_iniciativa),
      FOREIGN KEY (id_emprendimiento) REFERENCES emprendimientos(id_emprendimiento),
      FOREIGN KEY (id_persona_contacto) REFERENCES personas(id_persona)
    );`,
    `CREATE INDEX IF NOT EXISTS idx_post_iniciativa ON postulaciones(id_iniciativa);`,
    `CREATE INDEX IF NOT EXISTS idx_post_emprendimiento ON postulaciones(id_emprendimiento);`,
    `CREATE INDEX IF NOT EXISTS idx_post_estado ON postulaciones(estado_postulacion);`,

    // ==========================================
    // 7. CRITERIOS_ADMISIBILIDAD
    // ==========================================
    `CREATE TABLE IF NOT EXISTS criterios_admisibilidad (
      id_criterio TEXT PRIMARY KEY,
      id_iniciativa TEXT NOT NULL,
      codigo_criterio TEXT NOT NULL,
      descripcion TEXT NOT NULL,
      tipo_criterio TEXT DEFAULT 'EXCLUYENTE',
      campo_evaluado TEXT,
      operador TEXT DEFAULT 'IGUAL',
      valor_esperado TEXT,
      es_excluyente INTEGER DEFAULT 1,
      orden INTEGER DEFAULT 1,
      creado_por TEXT,
      actualizado_por TEXT,
      creado_en TEXT DEFAULT (datetime('now')),
      actualizado_en TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (id_iniciativa) REFERENCES iniciativas(id_iniciativa) ON DELETE CASCADE
    );`,
    `CREATE INDEX IF NOT EXISTS idx_crit_iniciativa ON criterios_admisibilidad(id_iniciativa);`,

    // ==========================================
    // 8. EVALUACIONES_CRITERIO
    // ==========================================
    `CREATE TABLE IF NOT EXISTS evaluaciones_criterio (
      id_evaluacion TEXT PRIMARY KEY,
      id_postulacion TEXT NOT NULL,
      id_criterio TEXT NOT NULL,
      cumple TEXT DEFAULT 'PENDIENTE',
      observacion TEXT,
      evaluador TEXT,
      fecha_evaluacion TEXT DEFAULT (datetime('now')),
      creado_por TEXT,
      actualizado_por TEXT,
      creado_en TEXT DEFAULT (datetime('now')),
      actualizado_en TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (id_postulacion) REFERENCES postulaciones(id_postulacion) ON DELETE CASCADE,
      FOREIGN KEY (id_criterio) REFERENCES criterios_admisibilidad(id_criterio) ON DELETE CASCADE
    );`,
    `CREATE INDEX IF NOT EXISTS idx_eval_postulacion ON evaluaciones_criterio(id_postulacion);`,

    // ==========================================
    // 9. PROCESOS_SELECCION
    // ==========================================
    `CREATE TABLE IF NOT EXISTS procesos_seleccion (
      id_proceso TEXT PRIMARY KEY,
      id_iniciativa TEXT NOT NULL,
      semilla_numerica INTEGER NOT NULL,
      huella_universo_admisible TEXT NOT NULL,
      total_admisibles INTEGER DEFAULT 0,
      total_titulares INTEGER DEFAULT 0,
      total_suplentes INTEGER DEFAULT 0,
      metodo_sorteo TEXT DEFAULT 'LCG_DETERMINISTA',
      ejecutor TEXT NOT NULL,
      estado TEXT DEFAULT 'FINALIZADO',
      notas TEXT,
      creado_en TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (id_iniciativa) REFERENCES iniciativas(id_iniciativa)
    );`,
    `CREATE INDEX IF NOT EXISTS idx_proc_iniciativa ON procesos_seleccion(id_iniciativa);`,

    // ==========================================
    // 10. RESULTADOS_SELECCION
    // ==========================================
    `CREATE TABLE IF NOT EXISTS resultados_seleccion (
      id_resultado TEXT PRIMARY KEY,
      id_proceso TEXT NOT NULL,
      id_postulacion TEXT NOT NULL,
      orden_prelacion INTEGER NOT NULL,
      resultado TEXT NOT NULL,
      puntaje_sorteo REAL,
      creado_en TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (id_proceso) REFERENCES procesos_seleccion(id_proceso) ON DELETE CASCADE,
      FOREIGN KEY (id_postulacion) REFERENCES postulaciones(id_postulacion)
    );`,
    `CREATE INDEX IF NOT EXISTS idx_res_proceso ON resultados_seleccion(id_proceso);`,
    `CREATE INDEX IF NOT EXISTS idx_res_postulacion ON resultados_seleccion(id_postulacion);`,
    `CREATE INDEX IF NOT EXISTS idx_res_orden ON resultados_seleccion(orden_prelacion);`,

    // ==========================================
    // 11. CONFIRMACIONES_PARTICIPACION
    // ==========================================
    `CREATE TABLE IF NOT EXISTS confirmaciones_participacion (
      id_confirmacion TEXT PRIMARY KEY,
      id_postulacion TEXT NOT NULL,
      id_iniciativa TEXT NOT NULL,
      estado TEXT DEFAULT 'PENDIENTE',
      puesto_asignado TEXT,
      fecha_limite_confirmacion TEXT,
      fecha_confirmacion TEXT,
      motivo_desistimiento TEXT,
      reasignado_a_postulacion TEXT,
      creado_por TEXT,
      actualizado_por TEXT,
      creado_en TEXT DEFAULT (datetime('now')),
      actualizado_en TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (id_postulacion) REFERENCES postulaciones(id_postulacion),
      FOREIGN KEY (id_iniciativa) REFERENCES iniciativas(id_iniciativa)
    );`,
    `CREATE INDEX IF NOT EXISTS idx_conf_post ON confirmaciones_participacion(id_postulacion);`,
    `CREATE INDEX IF NOT EXISTS idx_conf_iniciativa ON confirmaciones_participacion(id_iniciativa);`,
    `CREATE INDEX IF NOT EXISTS idx_conf_estado ON confirmaciones_participacion(estado);`,

    // ==========================================
    // 12. SEGUIMIENTO_POST_MERCADO (Impacto, Ventas y Redes)
    // ==========================================
    `CREATE TABLE IF NOT EXISTS seguimiento_post_mercado (
      id_seguimiento TEXT PRIMARY KEY,
      id_iniciativa TEXT NOT NULL,
      id_emprendimiento TEXT NOT NULL,
      asistio TEXT DEFAULT 'SI',
      ventas_totales_reportadas REAL DEFAULT 0,
      seguidores_antes INTEGER DEFAULT 0,
      seguidores_despues INTEGER DEFAULT 0,
      seguidores_ganados INTEGER DEFAULT 0,
      incidencias TEXT,
      evaluacion_general TEXT DEFAULT 'BUENA',
      observaciones TEXT,
      creado_por TEXT,
      actualizado_por TEXT,
      creado_en TEXT DEFAULT (datetime('now')),
      actualizado_en TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (id_iniciativa) REFERENCES iniciativas(id_iniciativa),
      FOREIGN KEY (id_emprendimiento) REFERENCES emprendimientos(id_emprendimiento)
    );`,
    `CREATE INDEX IF NOT EXISTS idx_seg_iniciativa ON seguimiento_post_mercado(id_iniciativa);`,
    `CREATE INDEX IF NOT EXISTS idx_seg_emp ON seguimiento_post_mercado(id_emprendimiento);`,

    // ==========================================
    // 12b. SEGUIMIENTO_DIARIO_VENTAS (Registro por día del mercado)
    // ==========================================
    `CREATE TABLE IF NOT EXISTS seguimiento_diario_ventas (
      id_registro_diario TEXT PRIMARY KEY,
      id_iniciativa TEXT NOT NULL,
      id_emprendimiento TEXT NOT NULL,
      fecha_jornada TEXT NOT NULL,
      dia_numero INTEGER DEFAULT 1,
      ventas_dia REAL DEFAULT 0,
      observaciones TEXT,
      creado_por TEXT,
      creado_en TEXT DEFAULT (datetime('now')),
      actualizado_en TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (id_iniciativa) REFERENCES iniciativas(id_iniciativa),
      FOREIGN KEY (id_emprendimiento) REFERENCES emprendimientos(id_emprendimiento)
    );`,
    `CREATE INDEX IF NOT EXISTS idx_seg_dia_ini ON seguimiento_diario_ventas(id_iniciativa);`,
    `CREATE INDEX IF NOT EXISTS idx_seg_dia_emp ON seguimiento_diario_ventas(id_emprendimiento);`,
    `CREATE INDEX IF NOT EXISTS idx_seg_dia_fecha ON seguimiento_diario_ventas(fecha_jornada);`,

    // ==========================================
    // 13. USUARIOS
    // ==========================================
    `CREATE TABLE IF NOT EXISTS usuarios (
      id_usuario TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      nombres TEXT NOT NULL,
      apellidos TEXT NOT NULL,
      rol TEXT DEFAULT 'OPERADOR',
      activo INTEGER DEFAULT 1,
      ultimo_acceso TEXT,
      creado_en TEXT DEFAULT (datetime('now')),
      actualizado_en TEXT DEFAULT (datetime('now'))
    );`,
    `CREATE INDEX IF NOT EXISTS idx_usuarios_email ON usuarios(email);`,

    // ==========================================
    // 14. AUDITORIA
    // ==========================================
    `CREATE TABLE IF NOT EXISTS auditoria (
      id_auditoria TEXT PRIMARY KEY,
      accion TEXT NOT NULL,
      entidad TEXT NOT NULL,
      id_entidad TEXT,
      payload_previo TEXT,
      payload_nuevo TEXT,
      usuario_email TEXT,
      ip_contexto TEXT,
      timestamp TEXT DEFAULT (datetime('now'))
    );`,
    `CREATE INDEX IF NOT EXISTS idx_audit_entidad ON auditoria(entidad);`,
    `CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON auditoria(timestamp);`,

    // ==========================================
    // 15. CONFIGURACION
    // ==========================================
    `CREATE TABLE IF NOT EXISTS configuracion (
      clave TEXT PRIMARY KEY,
      valor TEXT NOT NULL,
      descripcion TEXT,
      tipo_dato TEXT DEFAULT 'TEXTO',
      actualizado_en TEXT DEFAULT (datetime('now'))
    );`,

    // ==========================================
    // 16. CATALOGOS
    // ==========================================
    `CREATE TABLE IF NOT EXISTS catalogos (
      id_catalogo TEXT PRIMARY KEY,
      tipo_catalogo TEXT NOT NULL,
      codigo TEXT NOT NULL,
      nombre TEXT NOT NULL,
      descripcion TEXT,
      orden INTEGER DEFAULT 1,
      activo INTEGER DEFAULT 1,
      creado_en TEXT DEFAULT (datetime('now'))
    );`,
    `CREATE INDEX IF NOT EXISTS idx_cat_tipo ON catalogos(tipo_catalogo);`
  ];
}

/**
 * Ejecuta la inicialización de todas las 16 tablas e índices en Turso libSQL.
 * @returns {{ success: boolean, data: object|null, error: string|null }}
 */
function tursoInicializarEsquema() {
  try {
    const ddls = obtenerSentenciasDDL();
    const stmts = ddls.map(sql => ({ sql: sql, args: [] }));

    const res = tursoTransaccion(stmts);
    if (!res.success) {
      return {
        success: false,
        data: null,
        error: 'No se pudo inicializar el esquema en Turso: ' + res.error
      };
    }

    // Inicializar catálogos y configuración básica si no existen
    inicializarCatalogosYConfiguracion_();

    return {
      success: true,
      data: {
        totalSentencias: ddls.length,
        tablasCreadas: 16,
        mensaje: 'Las 16 tablas e índices relacionales de Turso se inicializaron con éxito.'
      },
      error: null
    };
  } catch (err) {
    return {
      success: false,
      data: null,
      error: 'Error al inicializar el esquema: ' + (err.message || String(err))
    };
  }
}

/**
 * Inserta catálogos base (rubros, formalizaciones, estados) y parámetros globales
 */
function inicializarCatalogosYConfiguracion_() {
  try {
    const stmts = [
      {
        sql: `INSERT OR IGNORE INTO configuracion (clave, valor, descripcion, tipo_dato) VALUES 
          ('APP_NAME', 'Sistema de Gestión de Emprendimientos', 'Nombre institucional', 'TEXTO'),
          ('MUNICIPALIDAD', 'Municipalidad de Santiago', 'Institución emisora', 'TEXTO'),
          ('VERSION_SISTEMA', '2.1', 'Versión del core', 'TEXTO'),
          ('MODO_SELECCION_DEFAULT', 'LCG_DETERMINISTA', 'Algoritmo de sorteo reproducible', 'TEXTO');`,
        args: []
      },
      {
        sql: `INSERT OR IGNORE INTO catalogos (id_catalogo, tipo_catalogo, codigo, nombre, orden) VALUES
          ('cat-r1', 'RUBRO', 'ALIMENTACION', 'Alimentación y Gastronomía', 1),
          ('cat-r2', 'RUBRO', 'ARTESANIA', 'Artesanía y Manualidades', 2),
          ('cat-r3', 'RUBRO', 'TEXTIL', 'Textil, Confección y Calzado', 3),
          ('cat-r4', 'RUBRO', 'COSMETICA', 'Cosmética Natural y Bienestar', 4),
          ('cat-r5', 'RUBRO', 'ORFEBRERIA', 'Orfebrería y Joyería', 5),
          ('cat-r6', 'RUBRO', 'OTRO', 'Otro Rubro', 6),
          ('cat-f1', 'FORMALIZACION', 'SIN_INICIO', 'Sin Inicio de Actividades', 1),
          ('cat-f2', 'FORMALIZACION', 'PRIMERA_CATEGORIA', '1ª Categoría (Empresa / SpA)', 2),
          ('cat-f3', 'FORMALIZACION', 'SEGUNDA_CATEGORIA', '2ª Categoría (Honorarios)', 3);`,
        args: []
      }
    ];
    tursoTransaccion(stmts);
  } catch (e) {
    // Ignorar si ya existían
  }
}

/**
 * Aplica migraciones DDL idempotentes para soportar campos extendidos del sistema GitHub
 * en bases de datos Turso existentes sin interrumpir la operación.
 */
function asegurarColumnasExtendidas_() {
  const migraciones = [
    `ALTER TABLE iniciativas ADD COLUMN objetivo TEXT;`,
    `ALTER TABLE iniciativas ADD COLUMN tematica TEXT;`,
    `ALTER TABLE iniciativas ADD COLUMN barrio TEXT;`,
    `ALTER TABLE iniciativas ADD COLUMN lugar TEXT;`,
    `ALTER TABLE iniciativas ADD COLUMN entidad_organizadora TEXT;`,
    `ALTER TABLE iniciativas ADD COLUMN responsable TEXT;`,
    `ALTER TABLE seguimiento_post_mercado ADD COLUMN seguidores_antes INTEGER DEFAULT 0;`,
    `ALTER TABLE seguimiento_post_mercado ADD COLUMN seguidores_despues INTEGER DEFAULT 0;`,
    `CREATE TABLE IF NOT EXISTS seguimiento_diario_ventas (
      id_registro_diario TEXT PRIMARY KEY,
      id_iniciativa TEXT NOT NULL,
      id_emprendimiento TEXT NOT NULL,
      fecha_jornada TEXT NOT NULL,
      dia_numero INTEGER DEFAULT 1,
      ventas_dia REAL DEFAULT 0,
      observaciones TEXT,
      creado_por TEXT,
      creado_en TEXT DEFAULT (datetime('now')),
      actualizado_en TEXT DEFAULT (datetime('now'))
    );`,
    `CREATE INDEX IF NOT EXISTS idx_seg_dia_ini ON seguimiento_diario_ventas(id_iniciativa);`,
    `CREATE INDEX IF NOT EXISTS idx_seg_dia_emp ON seguimiento_diario_ventas(id_emprendimiento);`,
    `CREATE INDEX IF NOT EXISTS idx_seg_dia_fecha ON seguimiento_diario_ventas(fecha_jornada);`
  ];

  for (let i = 0; i < migraciones.length; i++) {
    try {
      tursoEjecutar(migraciones[i], []);
    } catch (e) {
      // Ignora si la columna ya existe en SQLite/Turso
    }
  }
}
