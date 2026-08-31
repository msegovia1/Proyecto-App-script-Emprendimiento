# SGE 2.1.0 — Ficha Integral del Emprendedor (Sistema Optimizado)

Actualización acumulativa y optimizada que estructura el sistema en: **1 persona → 1 emprendimiento → 1 ficha integral → 1 registro documental**.

La actualización crea un respaldo antes de modificar la base. No elimina personas, emprendimientos, documentos, postulaciones ni historial. Cuando existen relaciones adicionales, conserva una relación titular activa y deja las demás inactivas y auditadas.

---

## Métodos de Despliegue

### Opción A: Despliegue Directo (Consolidado - 2 Archivos)
Ideal para despliegues rápidos mediante la consola web de Google Apps Script:

1. Abra el proyecto en [script.google.com](https://script.google.com).
2. Reemplace todo el contenido de `Código.gs` por el archivo `Code.gs` de la raíz de este paquete.
3. Reemplace todo el contenido de `Index.html` por el archivo `Index.html` de la raíz de este paquete.
4. Guarde con **Ctrl + S** (o **Cmd + S** en macOS).
5. Seleccione la función **`actualizarFichaIntegralV210`** y pulse **Ejecutar** una sola vez.
6. Autorice los permisos y espere el mensaje de confirmación en el registro.
7. Publique la aplicación web: **Implementar → Administrar implementaciones → Editar (icono lápiz) → Versión: Nueva versión → Implementar**.
8. Abra el enlace de la aplicación web y recargue con **Ctrl + Shift + R**. Compruebe que el pie del menú muestra `v2.1.0-FICHA-INTEGRAL`.

### Opción B: Despliegue Modular para Equipos (Google Clasp / Git)
Ideal para desarrollo en equipo y versionamiento con Git utilizando la estructura modular en `src/`:

```
SGE_2.0_Sistema_Integral/
├── src/
│   ├── backend/
│   │   ├── Config.gs
│   │   ├── Schema.gs
│   │   ├── Normalizacion.gs
│   │   ├── Repository.gs
│   │   ├── AuthService.gs
│   │   ├── AuditoriaService.gs
│   │   ├── PersonaService.gs
│   │   ├── EmprendimientoService.gs
│   │   ├── DocumentoService.gs
│   │   ├── IniciativaService.gs
│   │   ├── SeleccionService.gs
│   │   ├── ParticipacionService.gs
│   │   ├── GeoService.gs
│   │   ├── ReportesService.gs
│   │   ├── MercadosService.gs
│   │   ├── FichaIntegralService.gs
│   │   ├── Instalador.gs
│   │   ├── Tests.gs
│   │   └── WebApp.gs
│   └── frontend/
│       ├── Index.html
│       ├── Styles.html
│       └── Scripts.html
├── Code.gs
├── Index.html
└── INSTALAR.md
```

Para desplegar con `clasp`:
```bash
clasp push
```

---

## Mejoras y Optimizaciones Implementadas en v2.1.0

1. **Búsqueda $O(1)$ por Clave Primaria (`repoBuscarPorId`)**:
   - En lugar de descargar y procesar todas las columnas de la hoja completa en memoria, escanea únicamente la columna 1 (`ID_*`) para localizar la fila exacta, extrayendo exclusivamente el registro objetivo.
2. **Caché en Memoria y `CacheService` con TTL**:
   - Catálogos cacheados con TTL de 6 horas mediante `CacheService.getScriptCache()`.
   - Invalidador de caché automático ante inserciones y modificaciones.
   - En memoria `_schemaHeadersCache` que previene el re-análisis recurrente de cabeceras.
3. **Resiliencia y Fallback de Entorno**:
   - Fallback automático hacia `PREINSTALACION_DRIVE` cuando `PropertiesService` esté sin inicializar.
   - Función `diagnosticarConexion()` para validar el estado de Sheets, Drive y usuario activo.
   - Función `configurarPropiedadesSistema(dbId, rootFolderId, formUrl, formTemplateId)` para parametrizar recursos sin tocar código.
4. **Capa Frontend Desacoplada y Accesible**:
   - Estructura limpia de SPA con estados visuales semánticos (`aria-live`, etiquetas de color y contraste, diseño responsive).
5. **Suite de Pruebas Unitarias Ampliada (`ejecutarPruebas`)**:
   - Validación de RUT (Módulo 11 con verificador K y números de 7 y 8 dígitos).
   - Normalización de números telefónicos internacionales (+569).
   - Generador de números pseudoaleatorios con semilla reproducible.
   - Reglas del motor de admisibilidad y clasificación automática.
   - Estados de vencimiento documental efectivo.

---

## Funciones de Diagnóstico y Administración en Apps Script

| Función | Propósito | Tipo |
|---|---|---|
| `actualizarFichaIntegralV210()` | Actualiza estructura, migra documentos y normaliza relaciones 1 a 1 | Modificación (Crea respaldo automático) |
| `probarFichaIntegralV210()` | Revisa consistencia de relaciones 1 a 1 y documentos pendientes | Solo Lectura |
| `diagnosticarConexion()` | Comprueba acceso a Spreadsheet, Drive institucional y permisos del usuario | Solo Lectura |
| `ejecutarPruebas()` | Ejecuta la batería completa de tests unitarios de reglas de negocio | Solo Lectura |
| `configurarPropiedadesSistema(...)` | Actualiza los IDs de Sheets y Drive en Script Properties | Configuración |

---

## Reglas de Habilitación Documental Automática

Un documento cargado por un funcionario o recibido mediante Google Forms queda en estado **`RECIBIDO`** y habilita de inmediato sin requerir aprobación manual previa:

- **Expediente Persona Completo**: Cédula por ambos lados en un archivo único + Registro Social de Hogares.
- **Habilitación para Mercados**: Expediente persona completo + Certificado de inicio de actividades del emprendimiento.
- **Revisión Excepcional**: Un funcionario con rol `REVISOR` o `ADMIN` puede marcar un documento como `OBSERVADO` o `RECHAZADO` indicando el motivo, lo cual inhabilita automáticamente la postulación hasta su subsanación.
