# SGE v2.1.0 - Dossier de Entrega a Dirección de Informática
## Sistema de Gestión y Asignación de Mercados de Emprendimiento Municipal

> **Fecha:** Septiembre 2026  
> **Versión:** 2.1.0 (MVP 100% Nativo Google Workspace)  
> **Clasificación de Seguridad:** Confidencial - Uso Interno Municipal  
> **Cumplimiento Normativo:** Ley N° 19.628 sobre Protección de la Vida Privada (Chile)  

---

### Resumen Ejecutivo de Entrega

El presente dossier acompaña la entrega formal del código fuente, arquitectura técnica y modelos de operación del **Sistema de Gestión de Emprendimiento (SGE)**, diseñado para la administración integral, prefiltro, admisibilidad, selección transparente y auditoría de ferias y mercados comunales.

A requerimiento expreso del equipo municipal y las directrices de seguridad de la Dirección de Informática:
1. **Desacoplamiento Total de Servicios Externos:** Se ha eliminado el 100% de dependencias, controladores, llamadas de red (`UrlFetchApp`) y credenciales hacia bases de datos de terceros (Turso / libSQL).
2. **Soberanía y Residencia de Datos 100% Institucional:** Todos los datos personales de los ciudadanos (RUT, puntaje RSH, direcciones, teléfonos, facturación y registros sanitarios) residen y se procesan **exclusivamente dentro del tenant institucional de Google Workspace** (Google Sheets relacional y Google Drive institucional).
3. **Cero Fuga de Datos:** No existe tráfico de egreso hacia internet fuera del perímetro seguro de Google Workspace. No se utilizan tokens JWT externos, endpoints de SQLite en la nube ni bases intermedias.
4. **Producto Mínimo Viable (MVP) Operativo:** El sistema se encuentra 100% operativo bajo el motor de ejecución **Google Apps Script V8**, consumiendo un modelo relacional normalizado de **16 tablas en Google Sheets** respaldado por `LockService` para concurrencia atómica.

---

### Índice de Documentos del Dossier

| Documento | Descripción |
| :--- | :--- |
| **[01_INFORME_TECNICO_Y_SEGURIDAD_MVP.md](./01_INFORME_TECNICO_Y_SEGURIDAD_MVP.md)** | Certificación de seguridad, cumplimiento de la Ley 19.628, arquitectura de software, stack tecnológico y modelo relacional de 16 tablas. |
| **[02_FLUJOGRAMA_PROCESO_FUNCIONARIOS.md](./02_FLUJOGRAMA_PROCESO_FUNCIONARIOS.md)** | Flujogramas detallados (Mermaid) del flujo operativo de los funcionarios municipales: desde la convocatoria hasta el seguimiento de ventas en terreno. |
| **[03_FLUJOGRAMA_CICLO_DE_VIDA_DATOS.md](./03_FLUJOGRAMA_CICLO_DE_VIDA_DATOS.md)** | Diagramas de flujo y arquitectura de datos (Mermaid): canalización de ingesta, normalización, almacenamiento relacional, deduplicación SHA-256 en Drive y pistas de auditoría. |
| **[04_MANUAL_DESPLIEGUE_Y_PERMISOS.md](./04_MANUAL_DESPLIEGUE_Y_PERMISOS.md)** | Guía técnica de instalación paso a paso, estructura de Unidades Compartidas en Google Drive, configuración de manifiesto `appsscript.json`, scopes OAuth y publicación de la Web App. |

---

### Verificación Rápida de Integridad del Código

Para verificar que el repositorio entregado no posee ninguna dependencia ni referencia externa a Turso o libSQL, el equipo de Informática puede ejecutar el siguiente comando en PowerShell desde la raíz del proyecto:

```powershell
Get-ChildItem -Recurse -File | Select-String -Pattern "turso|libsql" -CaseSensitive:$false
```
*Resultado esperado:* **0 coincidencias** (salida vacía).
