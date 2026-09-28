====================================================================
SCRIPTS DEL SISTEMA SGE v2.1.0 (GOOGLE APPS SCRIPT V8)
====================================================================

Esta carpeta contiene UNICAMENTE el codigo fuente y scripts ejecutables
del sistema, sin documentacion ni archivos de configuracion externa.

ESTRUCTURA DISPONIBLE:

1. Estructura Modular (para despliegue con Google Clasp o VS Code):
   - appsscript.json : Manifiesto con permisos OAuth y runtime V8.
   - backend/        : 23 archivos .gs (Logica de negocio, Sheets y Drive).
   - frontend/       : 3 archivos .html (Index.html, Scripts.html, Styles.html).

2. Estructura Plana (para copiar directamente en script.google.com):
   - PLANO_APPS_SCRIPT/ : Los 27 archivos juntos en un solo directorio,
     listos para agregarse directamente en el editor web de Google Apps Script.

====================================================================
