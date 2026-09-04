# CONTEXTO DEL SISTEMA DE GESTIÓN DE EMPRENDIMIENTOS (SGE v2.1.0)
## Subdirección de Desarrollo Económico Local - Ilustre Municipalidad de Santiago

---

### 1. PROPÓSITO Y VISIÓN GENERAL
El **Sistema de Gestión de Emprendimientos (SGE v2.1.0)** es una solución integral desarrollada sobre el ecosistema **Google Workspace** (Google Apps Script, Google Sheets, Google Drive y Google Forms) para digitalizar, ordenar y automatizar la relación entre el municipio y los emprendedores de la comuna de Santiago, Chile.

El sistema unifica en una **Ficha Integral** la información del ciudadano (persona natural) y de su unidad económica (emprendimiento), gestiona el ciclo completo de convocatorias a ferias y mercados comunales, automatiza la evaluación de admisibilidad y la selección aleatoria con trazabilidad matemática, y administra un repositorio documental seguro.

---

### 2. ARQUITECTURA TECNOLÓGICA Y STACK
* **Backend**: Google Apps Script (JavaScript moderno ES6+, entorno modular `.gs` sin empaquetadores externos).
* **Frontend**: Aplicación Web de una sola página (SPA) servida mediante `HtmlService` de Apps Script, interfaz responsiva en HTML5, CSS corporativo y JavaScript nativo reactivo (con debouncing de 300ms para filtros en vivo).
* **Base de Datos Relacional**: Google Sheets estructurada como motor transaccional con 16 tablas normalizadas.
* **Almacenamiento Documental**: Google Drive organizado jerárquicamente:
  - **Base de Datos y Expedientes**: Alojados en una **Unidad Compartida (Shared Drive)** de la subdirección.
  - **Formularios de Convocatorias**: Alojados en la carpeta `SGE - Formularios Convocatorias` en **Mi Unidad** de la cuenta administradora para evitar las restricciones de subida de archivos que Google Forms impone a las Unidades Compartidas.
* **Control de Versiones y Despliegue**: Repositorio en GitHub (`msegovia1/Proyecto-App-script-Emprendimiento`), sincronizado mediante extensión oficial y desplegado como Aplicación Web institucional (*"Ejecutar como: Administrador"*, *"Acceso: Cualquier usuario de la organización"*).
* **Modelo de Seguridad y Roles (RBAC Simplificado)**:
  - `ADMIN`: Administrador general (`msegovia@munistgo.cl`) con acceso comodín `['*']` a configuración, esquemas y mantenimiento.
  - `GESTOR`: Auto-aprovisionado automáticamente para cualquier funcionario con correo institucional `@munistgo.cl` que abra la Web App, con permisos operacionales completos para crear/editar fichas, ferias, documentos y selecciones.

---

### 3. ESTRUCTURA DE LA BASE DE DATOS (16 TABLAS EN GOOGLE SHEETS)
Todas las tablas cuentan con claves primarias `ID_*` tipo UUID v4, marcas de tiempo `ISO 8601` (`YYYY-MM-DDTHH:mm:ssZ`) y trazabilidad de usuario (`CREADO_POR`, `ACTUALIZADO_POR`):

1. **`PERSONAS`**: Ciudadano emprendedor (RUT normalizado con dígito verificador Módulo 11, nombres, apellidos, fecha de nacimiento, género, discapacidad declarada, contacto, comuna, estado).
2. **`EMPRENDIMIENTOS`**: Unidad productiva (código comercial, nombre de fantasía, rubro, subrubro, formalización SII, etapa de madurez, redes sociales, sitio web).
3. **`PERSONA_EMPRENDIMIENTO`**: Tabla relacional N:M que conecta personas con emprendimientos (roles: Titular, Socio; marca de titular principal).
4. **`DOCUMENTOS`**: Expediente documental digital (cédula de identidad, Registro Social de Hogares, inicio de actividades, acreditación de discapacidad, ficha técnica). Incluye hash SHA-256 para evitar duplicidad de bytes, versión vigente (`SI`/`NO`) y estado de revisión (`RECIBIDO`, `APROBADO`, `OBSERVADO`, `REEMPLAZADO`).
5. **`INICIATIVAS`**: Ferias, mercados, convocatorias o programas comunales (nombre, tipo, cupos titulares, cupos suplentes, fechas de postulación y ejecución, URL de formulario, versión de reglas).
6. **`POSTULACIONES`**: Registro de postulación a una iniciativa específica vinculando emprendimiento y persona de contacto, con estado de postulación (`INGRESADA`, `ADMISIBLE`, `NO_ADMISIBLE`, `SELECCIONADA`, `SUPLENTE`, `CONFIRMADA`, `RECHAZADA`, `RETIRADA`).
7. **`CRITERIOS_ADMISIBILIDAD`**: Reglas paramétricas por iniciativa (edad mínima, comuna exclusiva, formalización requerida, rubro permitido, etc.).
8. **`EVALUACIONES_CRITERIO`**: Detalle del cumplimiento de cada postulación contra cada criterio (cumple, no cumple, observación, evaluador).
9. **`PROCESOS_SELECCION`**: Registro inmutable de cada ejecución de selección (semilla numérica, huella criptográfica del universo admisible, método de sorteo, ejecutor).
10. **`RESULTADOS_SELECCION`**: Orden de mérito resultante del proceso aleatorio (orden de prelación 1..N, resultado: `TITULAR`, `SUPLENTE`, `EXCLUIDO`).
11. **`CONFIRMACIONES_PARTICIPACION`**: Flujo de confirmación de asistencia, desistimiento y reasignación en cascada de suplentes.
12. **`SEGUIMIENTO_POST_MERCADO`**: Métricas de impacto post-feria (ventas totales reportadas, nuevos clientes, seguidores ganados, incidencias).
13. **`USUARIOS`**: Padrón de funcionarios habilitados, correos institucionales, nombres y roles.
14. **`AUDITORIA`**: Bitácora inmutable de todas las mutaciones críticas en el sistema (acción, entidad, ID, payload previo, payload nuevo, usuario, IP/contexto).
15. **`CONFIGURACION`**: Parámetros globales del sistema clave-valor (versión, IDs de carpetas Drive, IDs de plantillas, límites).
16. **`CATALOGOS`**: Listas controladas maestras (rubros, subrubros, formalizaciones, géneros, tipos de iniciativa, etapas, estados).

---

### 4. MÓDULOS DE NEGOCIO Y FUNCIONALIDADES CLAVE

#### A. Ficha Integral y Gestión de Duplicados
* Normalización automática de RUTs chilenos (remoción de puntos, cálculo y validación estricta de dígito verificador Módulo 11).
* Búsqueda reactiva instantánea por RUT, nombre de persona o nombre comercial de emprendimiento.
* Prevención de duplicados exactos y fonéticos: si un emprendedor vuelve a postular o registrarse, el sistema actualiza su ficha sin duplicar registros.

#### B. Gestión Documental Digital
* Carga de archivos conectada con Google Drive.
* Cálculo de huella digital (SHA-256): si el usuario sube el mismo archivo ya existente, se reutiliza sin duplicar espacio en Drive.
* Versionamiento: cuando se sube un documento actualizado, la versión anterior pasa automáticamente a `REEMPLAZADO` y la nueva queda como `VIGENTE`.

#### C. Ciclo de Ferias, Mercados y Convocatorias
* Creación de eventos con definición de cupos (titulares y suplentes).
* Generación automatizada de formularios de postulación abiertos y públicos (`setRequireLogin(false)`).
* Apertura y cierre programado o manual de convocatorias.

#### D. Motor de Admisibilidad y Selección Transparente
* Evaluación automática de postulaciones contra los criterios del evento.
* **Selección Pseudoaleatoria con Semilla (Seed-based)**:
  - Genera una lista canónica ordenada de postulantes admisibles.
  - Aplica un generador congruencial lineal determinista basado en una semilla numérica.
  - La selección es 100% reproducible y auditable: con la misma semilla y el mismo universo, el orden de salida es exactamente idéntico, garantizando transparencia pública ante concejos municipales o auditorías de Contraloría.
* Generación de orden de prelación para titulares y lista de espera para suplentes.
* Asignación y confirmación de puestos con llamado automático al siguiente suplente si un titular desiste.

#### E. Dashboard y Rendimiento Optimizado
* Panel ejecutivo con métricas de cobertura, ferias activas, postulaciones recibidas, tasa de admisibilidad, ventas históricas y formalización.
* Rendimiento optimizado: lecturas por lotes (`getValues()`), almacenamiento en memoria caché (`CacheService`) e indexación mediante tablas Hash/Mapas en $O(1)$ para evitar el problema de consultas $O(N \times M)$ o $N+1$.

---

### 5. ORGANIZACIÓN DEL CÓDIGO FUENTE
```text
SGE_2.0_Sistema_Integral/
├── appsscript.json            # Manifiesto de Apps Script (permisos OAuth, timezone America/Santiago)
└── src/
    ├── backend/
    │   ├── Config.gs          # Constantes globales, nombres de tablas, tiempos de caché
    │   ├── Schema.gs          # Definición de encabezados de las 16 tablas y catálogo de permisos
    │   ├── Repository.gs      # Capa de persistencia en Sheets (CRUD, búsquedas, batch, caché)
    │   ├── AuthService.gs     # Autenticación, auto-aprovisionamiento y RBAC
    │   ├── NormalizacionService.gs # Módulo 11 de RUT, saneamiento de strings, teléfonos
    │   ├── GeoService.gs      # Validación de direcciones y comunas
    │   ├── PersonaService.gs  # Lógica de ciudadanos emprendedores
    │   ├── EmprendimientoService.gs # Lógica de unidades productivas
    │   ├── FichaIntegralService.gs  # Agregador 360° Persona + Negocio + Historial
    │   ├── DocumentoService.gs# Repositorio documental, Drive y huellas SHA-256
    │   ├── IniciativaService.gs # Ferias, convocatorias y postulaciones
    │   ├── MercadosService.gs # Integración Google Forms, apertura pública y respuesta
    │   ├── SeleccionService.gs# Algoritmo de selección aleatoria con semilla
    │   ├── ParticipacionService.gs # Confirmaciones, bajas y reemplazos
    │   ├── ReportesService.gs # Dashboard y métricas analíticas
    │   ├── AuditoriaService.gs# Registro de bitácora
    │   ├── Instalador.gs      # Inicializador de base de datos y migración de carpetas
    │   ├── Tests.gs           # Suite E2E automatizada (14 pruebas de integración)
    │   └── WebApp.gs          # Enrutador HTTP (doGet, doOptions, RPC)
    └── frontend/
        ├── Index.html         # Maqueta base SPA y menú de navegación
        ├── Styles.html        # Estilos CSS corporativos (azul municipal #215783)
        └── Scripts.html       # Controlador JS frontend, enrutamiento interno, modales y renderers
```

---

### 6. OBJETIVOS Y CASOS DE USO CON GOOGLE AI STUDIO / GEMINI
1. **Asistente Inteligente para el Emprendedor**: Integrar capacidades conversacionales para que el emprendedor consulte requisitos de ferias, el estado de su postulación o reciba recomendaciones para formalizarse o mejorar sus ventas.
2. **Evaluación Inteligente de Documentos (Gemini Multimodal)**: Analizar fotos de cédulas de identidad, inicio de actividades del SII o fichas técnicas de productos, validando vigencia, legibilidad y consistencia de datos de forma automatizada.
3. **Análisis Predictivo y Recomendación de Ferias**: Sugerir a qué ferias debería postular cada emprendimiento según su rubro, estacionalidad y comportamiento comercial anterior.
4. **Desarrollo del Nuevo Módulo de Capacitaciones**: Extender el sistema para gestionar cursos, talleres, asistencia, notas, relatorías y certificaciones conectadas a la misma Ficha Integral del Emprendedor.

---

### 7. REGLAS TÉCNICAS MANDATORIAS PARA EL MODELO
* En Google Apps Script no existe soporte nativo de Node.js ni empaquetadores como Webpack (el entorno de ejecución es JavaScript en el motor V8 de Apps Script).
* Las variables globales de nivel superior deben definirse con `var` para evitar errores `SyntaxError: Identifier already declared` entre múltiples archivos `.gs`.
* Mantener operaciones de Sheets en lote (`Range.getValues()` y `Range.setValues()`) en lugar de lecturas celda por celda para no superar el límite de tiempo de ejecución de 6 minutos de Apps Script.
* El huso horario oficial es `America/Santiago` (Chile).
