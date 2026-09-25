# MANUAL DE DESPLIEGUE, PERMISOS Y PUESTA EN PRODUCCIÓN
## Sistema de Gestión y Asignación de Mercados de Emprendimiento (SGE v2.1.0)

> **Documento:** Guía de Instalación y Administración  
> **Destinatario:** Administradores de Google Workspace / Informática Municipal  
> **Versión del Sistema:** 2.1.0 MVP  

---

## 1. Requisitos Previos

Para implementar el sistema en el entorno productivo institucional de la Municipalidad, el administrador de Informática requiere:
1. Una cuenta administradora de Google Workspace (`@municipalidad.cl`) o cuenta de servicio con permisos de creación de Unidades Compartidas.
2. Acceso a la consola de Google Apps Script (`script.google.com`).
3. Herramienta de sincronización opcional: Google Clasp (`@google/clasp`) si se desea desplegar desde línea de comandos vía Git.

---

## 2. Arquitectura de Almacenamiento en Google Drive

Se recomienda alojar el sistema dentro de una **Unidad Compartida (Shared Drive)** institucional (por ejemplo: `DIDEL - Fomento Productivo`), estructurada de la siguiente forma:

```
[Unidad Compartida: DIDEL - Fomento Productivo]
│
├── 📁 00_Sistema_SGE/
│   ├── 📄 SGE_Base_Datos_Produccion (Google Spreadsheet con las 16 tablas)
│   └── 💻 SGE_Motor_Backend (Proyecto Google Apps Script vinculado o standalone)
│
├── 📁 01_Expedientes/
│   └── 📁 2026/
│       ├── 📁 12345678-5 - Juan Perez (Carpeta canónica por emprendedor)
│       │   ├── 📄 RSH_12345678-5.pdf
│       │   ├── 📄 Resolucion_Sanitaria.pdf
│       │   └── 🖼️ Foto_Muestra_01.jpg
│       └── 📁 98765432-1 - Maria Soto/
│
├── 📁 02_Convocatorias_Mercados/
│   ├── 📁 FERIA-PLAZA-2026-01/
│   └── 📁 MERCADO-CAMPESINO-2026-02/
│
└── 📁 03_Reportes_Consolidados/
    └── 📊 Reportes_Ventas_y_Asistencia.xlsx
```

> **Importante para el Flujo Híbrido:** Si se habilita un Formulario de Google público para que los ciudadanos postulen sin requerir iniciar sesión obligatoria, el formulario se crea en la unidad personal del encargado de convocatorias, y el script de fondo (`DriveStorageService.gs`) traslada de forma inmediata y automática los archivos adjuntos a la carpeta institucional del expediente en la Unidad Compartida.

---

## 3. Instalación de la Base de Datos Relacional (`Instalador.gs`)

El proyecto incluye el módulo `Instalador.gs`, el cual automatiza la creación de la base de datos completa:

1. Cree un nuevo archivo de **Google Sheets** en blanco titulado `SGE_Base_Datos_Produccion`.
2. Copie el ID de la hoja de cálculo de la URL:
   `https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/edit`
3. En el archivo `src/backend/Config.gs`, ingrese el ID obtenido:
   ```javascript
   var CONFIG = {
     SPREADSHEET_ID: '{SPREADSHEET_ID}',
     ROOT_FOLDER_ID: '{DRIVE_FOLDER_ID}',
     // ...
   };
   ```
4. En el editor de Google Apps Script, seleccione y ejecute la función:
   `instalarSistemaCompleto()`
5. El instalador creará de forma atómica:
   - Las **16 hojas relacionales** con sus nombres normalizados.
   - La fila de encabezados oficial con tipos de datos.
   - Reglas de validación de datos en celdas (ej. listas desplegables de estados: `ADMISIBLE`, `INADMISIBLE`, `CONFIRMADO`).
   - Los registros iniciales de la tabla `CONFIGURACION`.

---

## 4. Configuración del Manifiesto (`appsscript.json`)

Para garantizar que el sistema opere exclusivamente con los privilegios mínimos necesarios (Principio de Menor Privilegio) y bajo el motor V8, el archivo `appsscript.json` debe contener estrictamente los siguientes scopes:

```json
{
  "timeZone": "America/Santiago",
  "dependencies": {},
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "webapp": {
    "executeAs": "USER_ACCESSING",
    "access": "DOMAIN"
  },
  "oauthScopes": [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/script.send_mail"
  ]
}
```

### Justificación de Privilegios OAuth para Informática:
- `spreadsheets`: Lectura y escritura en la base de datos relacional de 16 tablas.
- `drive`: Creación y organización de las carpetas de expedientes de los ciudadanos en la Unidad Compartida y cálculo de hashes SHA-256.
- `userinfo.email`: Identificación automática del funcionario que realiza cada acción para alimentar la tabla inmutable `AUDITORIA`.
- `script.send_mail`: Notificación institucional a los postulantes adjudicados y alertas de lista de espera.

---

## 5. Publicación de la Aplicación Web (Web App)

1. En el editor de Apps Script, presione el botón azul **"Implementar" (Deploy)** -> **"Nueva implementación"**.
2. Seleccione el tipo: **"Aplicación web"**.
3. Configure los parámetros de seguridad:
   - **Descripción:** `SGE v2.1.0 Producción Municipal`
   - **Ejecutar como:** `Usuario que accede a la aplicación web` (Recomendado para trazabilidad por funcionario) o `Yo` (con cuenta de servicio institucional).
   - **Quién tiene acceso:** `Cualquier usuario de la organización [Municipalidad]` (Garantiza que nadie ajeno al municipio pueda abrir la consola de administración).
4. Presione **"Implementar"**.
5. Copie la URL generada (`https://script.google.com/a/macros/municipalidad.cl/s/.../exec`) y agréguela al portal de intranet municipal o accesos directos de los funcionarios.

---

## 6. Mantenimiento, Cuotas y Respaldos

### 6.1 Límites de Cuotas de Google Workspace
- **Google Sheets:** Admite hasta 10 millones de celdas. Para un padrón comunal de 5.000 emprendedores con 16 tablas, el consumo de celdas representa menos del 1.5% del límite total de la planilla.
- **Llamadas a Drive / Sheets API:** Manejadas mediante caché en memoria y consultas vectorizadas en `Repository.gs` para evitar bloqueos por cuota por minuto.

### 6.2 Estrategia de Respaldo Recomendada para Informática
- **Historial de Versiones:** Mantener activada la función nativa de Google Sheets (no requiere intervención).
- **Respaldo Automático Semanal:** Se puede programar un activador de tiempo (`Trigger`) en Apps Script que ejecute una copia fría semanal de la planilla en una carpeta restringida `04_Respaldos/`:
  ```javascript
  function backupSemanal() {
    var idOriginal = CONFIG.SPREADSHEET_ID;
    var fecha = Utilities.formatDate(new Date(), "America/Santiago", "yyyy-MM-dd");
    DriveApp.getFileById(idOriginal).makeCopy("SGE_Backup_" + fecha, DriveApp.getFolderById(CONFIG.BACKUP_FOLDER_ID));
  }
  ```

---

## 7. Contacto y Soporte para Informática

Para dudas de arquitectura, extensión de funcionalidades o auditorías de código:
- **Repositorio Git:** `main` (Limpio y certificado, sin dependencias externas).
- **Pila:** Google Apps Script V8 / Google Sheets / Google Drive / Tailwind CSS.
