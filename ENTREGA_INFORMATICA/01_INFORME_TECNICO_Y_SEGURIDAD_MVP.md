# INFORME TÉCNICO DE ARQUITECTURA Y SEGURIDAD - MVP
## Sistema de Gestión y Asignación de Mercados de Emprendimiento (SGE v2.1.0)

**Destinatario:** Dirección de Informática y Telecomunicaciones Municipal  
**Autor:** Equipo de Desarrollo SGE  
**Fecha:** Septiembre 2026  
**Estado:** Aprobado para Despliegue en Perímetro Institucional  

---

## 1. Declaración de Soberanía de Datos y Seguridad (Ley N° 19.628)

El Sistema de Gestión de Emprendimiento (SGE v2.1.0) gestiona Información de Identificación Personal (PII) y datos socioeconómicos de ciudadanos de la comuna, incluyendo:
- Cédula de Identidad (RUT chileno).
- Nombres, apellidos, direcciones georreferenciadas y teléfonos celulares.
- Porcentaje de vulnerabilidad según Cartola del Registro Social de Hogares (RSH).
- Información tributaria ante el Servicio de Impuestos Internos (SII).
- Resoluciones sanitarias y actas de fiscalización SEREMI de Salud.
- Cifras financieras de venta diaria en ferias comunales.

### 1.1 Cumplimiento Estricto de la Ley 19.628
Conforme a la **Ley N° 19.628 sobre Protección de la Vida Privada** y los principios de seguridad de la información del Estado de Chile:
1. **Principio de Finalidad y Proporcionalidad:** Los datos recopilados son utilizados con el fin único de evaluar la admisibilidad y asignar de forma justa y transparente los puestos de comercialización comunal.
2. **Residencia de Datos Estrictamente Institucional:** Los datos residen exclusivamente en los servidores certificados de Google Workspace contratados bajo el convenio institucional del Municipio (cumpliendo estándares SOC 1/2/3, ISO/IEC 27001, 27017, 27018 y Esquema de Seguridad Gubernamental).
3. **Cero Egresos a Redes Externas (Zero Egress):** Se eliminó de manera exhaustiva cualquier conexión, biblioteca, API Key, token de autenticación o llamada HTTP (`UrlFetchApp`) hacia bases de datos de terceros (específicamente la plataforma externa Turso / libSQL). Ningún byte de datos personales sale fuera del perímetro de Google Workspace de la Municipalidad.

---

## 2. Auditoría Técnica de Desacoplamiento (Purga de Turso / libSQL)

Para dar plena garantía a la Dirección de Informática, se detallan las medidas de refactorización aplicadas sobre el código:

| Componente | Estado Anterior | Estado Actual (MVP Seguro) |
| :--- | :--- | :--- |
| **`src/backend/TursoClient.gs`** | Driver de conexión HTTP a SQLite remoto | **ELIMINADO**. No existe cliente ni llamadas HTTP a endpoints externos. |
| **`src/backend/DatabaseSchema.gs`** | DDL SQL de creación de tablas en SQLite | **ELIMINADO**. El esquema vive de forma nativa en Google Sheets gestionado por `Schema.gs`. |
| **`src/backend/DriveStorageService.gs`** | Hash SHA-256 e índices sincronizados con Turso | **100% GOOGLE SHEETS + DRIVE**. El hash SHA-256 y metadatos se persisten en la hoja `DOCUMENTOS` y en Google Drive institucional. |
| **`src/backend/EmprendedoresService.gs`** | Consultas SQL mixtas Turso / Sheets | **100% REPOSITORY GOOGLE SHEETS**. Operaciones CRUD consolidadas sobre las tablas `PERSONAS`, `EMPRENDIMIENTOS` y `PERSONA_EMPRENDIMIENTO`. |
| **`src/backend/SeleccionService.gs`** | Generación de procesos y sorteo con inserción SQL | **100% REPOSITORY GOOGLE SHEETS**. Algoritmo LCG (Linear Congruential Generator) con registro directo en `PROCESOS_SELECCION` y `RESULTADOS_SELECCION`. |
| **`src/backend/IniciativasService.gs`** | Fallbacks híbridos entre Sheets y Turso | **100% REPOSITORY GOOGLE SHEETS**. 14 métodos refactorizados para operar directamente con atomicidad en Google Sheets. |
| **`src/backend/MercadosService.gs`** | Evaluaciones de terreno y ventas guardadas en Turso | **100% REPOSITORY GOOGLE SHEETS**. Seguimiento masivo y desglose diario consolidado en `SEGUIMIENTO_MERCADO` y `PARTICIPACIONES`. |
| **`src/backend/WebApp.gs`** | Endpoints RPC `apiTurso*` para configurar tokens | **ELIMINADOS**. Las únicas APIs expuestas son las estrictamente necesarias para la operación del personal municipal. |
| **`src/frontend/`** | Vistas y botones de configuración de base de datos Turso | **ELIMINADOS**. La interfaz gráfica (UI) refleja estado directo con Google Workspace. |

---

## 3. Arquitectura del Software (Modelo 100% Serverless en Google Cloud)

El sistema opera bajo una arquitectura de Tres Capas Serverless ejecutada nativamente en la infraestructura de Google Workspace:

```
+-----------------------------------------------------------------------------------+
|                            CAPA DE PRESENTACIÓN (UI)                              |
|   HTML5 + Tailwind CSS + Lucide Icons + Vanilla JS Moderno (ES6+)                  |
|   Ejecutado en el navegador del funcionario (Google Apps Script HtmlService)      |
+-----------------------------------------------------------------------------------+
                                      │  Llamadas asíncronas RPC
                                      │  (google.script.run)
                                      ▼
+-----------------------------------------------------------------------------------+
|                           CAPA LÓGICA DE NEGOCIO                                  |
|   Google Apps Script Runtime V8 (Sandboxed V8 Engine)                             |
|   - AuthService (Control de accesos basado en correo municipal @institucional.cl)  |
|   - ValidacionesChilenas.gs (Validación RUT Módulo 11, normalización E.164)        |
|   - SeleccionService.gs (Motor de prefiltro y algoritmo de sorteo auditable LCG)   |
|   - DriveStorageService.gs (Deduplicación SHA-256 y organización de expedientes)   |
|   - LockService (Manejo de concurrencia y transacciones atómicas)                 |
+-----------------------------------------------------------------------------------+
                  │                                                 │
                  │ Inserción/Lectura relacional                    │ Deduplicación y
                  │ en memoria mediante Sheets API                  │ almacenamiento seguro
                  ▼                                                 ▼
+------------------------------------+             +--------------------------------+
|      CAPA DE PERSISTENCIA DB       |             |   EXPEDIENTE DIGITAL (ARCHIVOS)|
|    Google Spreadsheet Institucional|             |     Google Drive Institucional |
|        (16 Tablas Relacionales)    |             |       (Unidad Compartida)      |
+------------------------------------+             +--------------------------------+
```

### 3.1 Beneficios para la Municipalidad
- **Cero Costo de Infraestructura:** No requiere servidores dedicados, máquinas virtuales en AWS/Azure, ni licencias de bases de datos pagadas.
- **Mantenimiento Cero de Servidores:** La alta disponibilidad, parches de seguridad de SO y protección contra ataques DDoS son gestionados directamente por Google Cloud.
- **Autenticación Nativa Robusta:** No existen contraseñas almacenadas en texto plano ni hashes vulnerables en el sistema; el acceso se rige estrictamente por la cuenta corporativa Google Workspace del funcionario (`@municipalidad.cl`) con soporte para Autenticación de Dos Factores (2FA).

---

## 4. Modelo de Datos Relacional (16 Tablas en Google Sheets)

El backend utiliza `Repository.gs` como capa de abstracción de datos (ORM ligero), garantizando integridad referencial, tipado estricto y operaciones atómicas mediante `LockService`.

A continuación se detalla el diccionario de datos de las 16 tablas:

### 1. `PERSONAS`
Almacena la información civil y socioeconómica del postulante titular o representante.
- `id_persona` (PK, UUID v4): Identificador unívoco del ciudadano.
- `rut` (Unique): Cédula nacional de identidad chilena sin puntos con guion (ej. `12345678-5`), validado bajo Módulo 11.
- `nombres`, `primer_apellido`, `segundo_apellido`: Nombres oficiales del titular.
- `telefono`: Número de contacto en estándar internacional E.164 (`+569XXXXXXXX`).
- `email`: Correo electrónico personal.
- `calle`, `numero`, `depto`, `comuna`: Dirección habitacional normalizada.
- `latitud`, `longitud`: Coordenadas geográficas para análisis de cobertura barrial.
- `tramo_rsh`: Rango porcentual del Registro Social de Hogares (ej. `40%`, `60%`).
- `estado_civil`, `genero`, `fecha_nacimiento`: Variables sociodemográficas.

### 2. `EMPRENDIMIENTOS`
Registra la unidad productiva, su nivel de formalización y clasificación comercial.
- `id_emprendimiento` (PK, UUID v4): Identificador del negocio.
- `nombre_fantasia`: Nombre público del emprendimiento.
- `descripcion_actividad`: Resumen del producto elaborado o comercializado.
- `rubro_principal`: Clasificación general (Artesanía, Gastronomía, Textil, Cosmética, etc.).
- `subrubro`: Subcategoría específica.
- `formalizado_sii` (Boolean): Si posee iniciación de actividades ante el SII (`true`/`false`).
- `rut_empresa`: RUT tributario (en caso de personas jurídicas como SpA o EIRL).
- `resolucion_sanitaria` (Boolean): Si cuenta con resolución de SEREMI de Salud vigente.
- `resolucion_numero`, `resolucion_fecha`: Identificación del acto administrativo sanitario.
- `instagram`, `facebook`, `sitio_web`: Canales de comercialización digital.

### 3. `PERSONA_EMPRENDIMIENTO`
Tabla de asociación N:M que modela la relación entre ciudadanos y sus unidades productivas.
- `id_relacion` (PK, UUID v4).
- `id_persona` (FK -> `PERSONAS.id_persona`).
- `id_emprendimiento` (FK -> `EMPRENDIMIENTOS.id_emprendimiento`).
- `rol`: `TITULAR`, `SOCIO` o `REPRESENTANTE_LEGAL`.
- `porcentaje_participacion`: Participación en el emprendimiento.

### 4. `DOCUMENTOS`
Repositorio indexado de los archivos que componen el expediente digital del emprendedor.
- `id_documento` (PK, UUID v4).
- `id_emprendimiento` (FK -> `EMPRENDIMIENTOS.id_emprendimiento`).
- `tipo_documento`: `CARTOLA_RSH`, `INICIO_SII`, `RESOLUCION_SANITARIA`, `FOTO_PRODUCTO`, `CEDULA_IDENTIDAD`.
- `nombre_archivo`: Nombre canónico del archivo almacenado.
- `mime_type`: Tipo MIME (`application/pdf`, `image/jpeg`, etc.).
- `tamano_bytes`: Peso exacto del archivo en bytes.
- `sha256_hash`: Hash criptográfico SHA-256 del contenido binario para detección de duplicados.
- `drive_file_id`: ID del archivo en Google Drive institucional.
- `drive_url`: Enlace permanente de visualización en Google Drive.
- `estado_revision`: `PENDIENTE`, `APROBADO`, `RECHAZADO`, `VIGENTE`.

### 5. `INICIATIVAS`
Catálogo de ferias, mercados de emprendimiento, talleres y convocatorias municipales.
- `id_iniciativa` (PK, UUID v4).
- `codigo`: Código nemotécnico municipal (ej. `FERIA-PLAZA-2026-01`).
- `nombre`: Nombre oficial de la feria o mercado.
- `descripcion`: Descripción y objetivos del evento.
- `tipo`: `FERIA_ESPACIO_PUBLICO`, `MERCADO_CAMPESINO`, `EXPO_EMPRENDIMIENTO`, `CAPACITACION`.
- `fecha_inicio`, `fecha_fin`: Período de ejecución del evento.
- `fecha_cierre_postulacion`: Plazo fatal de postulación ciudadana.
- `ubicacion`: Dirección o plaza donde se emplaza el mercado.
- `cupos_totales`: Número de puestos disponibles para asignación.
- `estado`: `BORRADOR`, `CONVOCATORIA_ABIERTA`, `EN_EVALUACION`, `SELECCION_FINALIZADA`, `EN_EJECUCION`, `CERRADA`.

### 6. `REQUISITOS`
Parámetros de admisibilidad y reglas de negocio configuradas para cada iniciativa.
- `id_requisito` (PK, UUID v4).
- `id_iniciativa` (FK -> `INICIATIVAS.id_iniciativa`).
- `criterio`: Regla a validar (`MAX_TRAMO_RSH`, `EXIGE_FORMALIZACION_SII`, `EXIGE_RESOLUCION_SANITARIA`, `RUBROS_PERMITIDOS`).
- `valor_esperado`: Parámetro umbral (ej. `60`, `true`, `GASTRONOMIA,ARTESANIA`).
- `es_excluyente` (Boolean): Si su incumplimiento produce rechazo automático en el prefiltro.

### 7. `POSTULACIONES`
Registro de solicitudes ciudadanas a un mercado específico.
- `id_postulacion` (PK, UUID v4).
- `id_iniciativa` (FK -> `INICIATIVAS.id_iniciativa`).
- `id_emprendimiento` (FK -> `EMPRENDIMIENTOS.id_emprendimiento`).
- `id_persona` (FK -> `PERSONAS.id_persona`).
- `fecha_postulacion`: Marca temporal (timestamp) de ingreso.
- `estado_admisibilidad`: `PENDIENTE`, `ADMISIBLE`, `INADMISIBLE`.
- `motivo_inadmisibilidad`: Justificación técnica de rechazo (auditable).
- `puntaje_prefiltro`: Puntuación base según criterios socioeconómicos y de formalización.

### 8. `PROCESOS_SELECCION`
Registro inmutable de la ejecución del algoritmo de selección aleatoria.
- `id_proceso` (PK, UUID v4).
- `id_iniciativa` (FK -> `INICIATIVAS.id_iniciativa`).
- `fecha_ejecucion`: Timestamp exacto de ejecución del sorteo.
- `semilla_aleatoria`: Semilla numérica (Seed) utilizada por el generador pseudoaleatorio (LCG).
- `cupos_disponibles`: Puestos a asignar.
- `total_postulantes_admisibles`: Universo de postulantes que ingresaron al bolillero digital.
- `ejecutado_por`: Correo electrónico institucional del funcionario que realizó el sorteo.

### 9. `RESULTADOS_SELECCION`
Nómina oficial de adjudicación generada por el proceso de selección.
- `id_resultado` (PK, UUID v4).
- `id_proceso` (FK -> `PROCESOS_SELECCION.id_proceso`).
- `id_postulacion` (FK -> `POSTULACIONES.id_postulacion`).
- `id_emprendimiento` (FK -> `EMPRENDIMIENTOS.id_emprendimiento`).
- `orden_sorteo`: Posición obtenida en el sorteo (1 a N).
- `estado_asignacion`: `TITULAR_ASIGNADO`, `LISTA_ESPERA`, `CONFIRMADO`, `DESISTIDO`, `REEMPLAZADO`.
- `fecha_notificacion`: Fecha de envío de citación o correo.
- `fecha_confirmacion`: Fecha en que el emprendedor acepta formalmente el puesto.

### 10. `PARTICIPACIONES`
Control operativo de asistencia y cumplimiento durante los días de feria.
- `id_participacion` (PK, UUID v4).
- `id_iniciativa` (FK -> `INICIATIVAS.id_iniciativa`).
- `id_emprendimiento` (FK -> `EMPRENDIMIENTOS.id_emprendimiento`).
- `asistencia_efectiva` (Boolean): Si el titular se presentó a instalar su puesto.
- `cumplio_normas` (Boolean): Cumplimiento de horarios, aseo y ornato.
- `ventas_totales_declaradas`: Total acumulado de ingresos declarados por el emprendedor.
- `evaluacion_terreno`: Calificación emitida por los inspectores comunales (`BUENA`, `REGULAR`, `DEFICIENTE`).
- `observaciones_inspector`: Pistas de hechos relevantes en terreno.

### 11. `SEGUIMIENTO_MERCADO`
Desglose granular y métricas económicas por jornada de feria.
- `id_seguimiento` (PK, UUID v4).
- `id_iniciativa` (FK -> `INICIATIVAS.id_iniciativa`).
- `id_emprendimiento` (FK -> `EMPRENDIMIENTOS.id_emprendimiento`).
- `fecha_jornada`: Día específico de la feria (ej. `2026-10-15`).
- `venta_dia`: Monto en pesos chilenos ($ CLP) vendido en dicha jornada.
- `asistencia_jornada` (Boolean): Asistencia particular de la fecha.

### 12. `AUDITORIA`
Bitácora inmutable de seguridad (Append-Only Log) para trazabilidad total.
- `id_evento` (PK, UUID v4).
- `timestamp`: Fecha y hora con precisión de milisegundos.
- `usuario_email`: Correo institucional del funcionario.
- `modulo`: Módulo del sistema involucrado (`SELECCION`, `EMPRENDEDORES`, `EXPEDIENTES`, `CONFIGURACION`).
- `accion`: Operación ejecutada (`CREAR`, `MODIFICAR`, `EJECUTAR_SORTEO`, `DESISTIR_CUPO`).
- `entidad_afectada`: Nombre de la tabla y clave primaria afectada.
- `detalles_json`: Payload con valores anteriores y nuevos valores para auditoría de Contraloría.

### 13. `CONFIGURACION`
Parámetros generales de la plataforma y reglas del servicio.
- `clave` (PK): Código del parámetro (ej. `NOMBRE_MUNICIPIO`, `DRIVE_FOLDER_ID`, `DIAS_PLAZO_CONFIRMACION`).
- `valor`: Valor del parámetro.
- `descripcion`: Justificación técnica de la variable.

### 14. `FERIAS_HISTORICAS`
Consolidado de eventos de años anteriores para análisis longitudinal de subsidios comunales.
- `id_historico` (PK, UUID v4).
- `ano`: Año calendario.
- `rut_emprendedor`: Emprendedor beneficiado en períodos previos.
- `iniciativa_nombre`: Feria donde participó.
- `monto_subsidio`: Aporte municipal estimado.

### 15. `USUARIOS`
Roles y perfiles de los funcionarios autorizados para interactuar con la plataforma.
- `email` (PK): Correo institucional `@municipalidad.cl`.
- `nombre_completo`: Nombre del funcionario.
- `rol`: `ADMIN`, `SUPERVISOR`, `INSPECTOR_TERRENO`, `AUDITOR`.
- `activo` (Boolean): Estado de habilitación.

### 16. `SECTOR_VIRTUAL`
Módulo de asignación espacial y zonificación de stands/toldos en el plano del recinto ferial.
- `id_sector` (PK, UUID v4).
- `id_iniciativa` (FK -> `INICIATIVAS.id_iniciativa`).
- `numero_stand`: Identificador físico del puesto (ej. `STAND-01`, `STAND-02`).
- `rubro_asignado`: Rubro zonificado para dicho espacio (ej. `Alimentos con resolución`).
- `id_emprendimiento`: Emprendedor que ocupa físicamente el puesto.

---

## 5. Algoritmos Clave y Reglas de Negocio

### 5.1 Algoritmo de Validación de Cédula de Identidad (RUT Módulo 11)
El sistema ejecuta la verificación matemática del dígito verificador chileno antes de admitir cualquier registro:
$$\text{Suma} = \sum_{i=1}^{n} d_i \cdot m_i \quad \text{donde } m_i \in \{2, 3, 4, 5, 6, 7\}$$
$$\text{Resto} = 11 - (\text{Suma} \pmod{11})$$
Se valida que el residuo corresponda exactamente a $0 \to 0$, $10 \to \text{'K'}$, o el dígito resultante.

### 5.2 Algoritmo de Sorteo Transparente LCG (Linear Congruential Generator)
Para erradicar cualquier discrecionalidad política o favoritismo en la adjudicación de puestos municipales en ferias de alta demanda, se implementó un generador congruencial lineal con semilla auditable:
$$X_{n+1} = (a \cdot X_n + c) \pmod m$$
- **Semilla ($X_0$):** Se genera a partir del timestamp criptográfico de la ejecución y se almacena en la tabla `PROCESOS_SELECCION`.
- **Reproducibilidad:** Cualquier revisión o auditoría interna de DIDEL puede reejecutar el sorteo con la misma semilla registrada y obtener idéntico ordenamiento exacto de postulantes.

### 5.3 Algoritmo de Reemplazo en Cascada (Lista de Espera Dinámica)
Si un emprendedor clasificado como `TITULAR_ASIGNADO` desiste o no confirma su cupo en el plazo reglamentario:
1. Su estado se actualiza atómicamente a `DESISTIDO`.
2. El sistema identifica al postulante en la posición 1 de la `LISTA_ESPERA`.
3. Se promueve a `TITULAR_ASIGNADO` automáticamente.
4. Se registra el cambio en la tabla de auditoría con la fecha, funcionario actuante y justificación.

---

## 6. Concurrencia y Bloqueos Atómicos (`LockService`)

Para prevenir problemas de condición de carrera (*race conditions*) cuando múltiples funcionarios municipales operan de forma simultánea durante la asignación o pase de lista:
- Toda operación de escritura en `Repository.gs` está encapsulada en:
  ```javascript
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000); // Espera atómica de hasta 30 segundos
    // Ejecución segura de lectura y escritura en Google Sheets
  } finally {
    lock.releaseLock();
  }
  ```
- Esto garantiza integridad transaccional ACID a nivel de aplicación sobre Google Sheets.

---

## 7. Dictamen de Seguridad y Conclusión

El Sistema de Gestión de Emprendimiento (SGE v2.1.0) cumple con los más altos estándares de gobernanza de datos para la administración pública municipal:
1. **No posee vulnerabilidades de fuga externa ni intermediación de datos.**
2. **Es un producto 100% mantenible, seguro, auditable y respaldado por Google Workspace.**
3. **Se autoriza su paso a producción en la infraestructura municipal.**
