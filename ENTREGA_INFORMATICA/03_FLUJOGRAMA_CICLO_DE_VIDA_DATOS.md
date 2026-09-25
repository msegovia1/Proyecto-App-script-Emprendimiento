# FLUJOGRAMA DEL CICLO DE VIDA Y PROCESAMIENTO DE DATOS
## Arquitectura de Datos, Normalización y Seguridad (SGE v2.1.0)

> **Documento:** Ciclo de Vida y Flujo de Datos  
> **Destinatario:** Dirección de Informática y Telecomunicaciones  
> **Herramienta de Diagramación:** Mermaid GFM Compliant  

---

## 1. Visión Global de la Canalización de Datos (Data Pipeline)

El ciclo de vida de los datos en el SGE comprende **5 etapas controladas**, diseñadas para garantizar la integridad referencial, la no redundancia de archivos y la inmutabilidad de las auditorías:

```mermaid
flowchart LR
    D1["1. Captura e Ingesta"] --> D2["2. Limpieza y Normalización"]
    D2 --> D3["3. Almacenamiento Relacional (Sheets)"]
    D3 --> D4["4. Expediente Digital (Drive + SHA256)"]
    D4 --> D5["5. Pistas de Auditoría y Métricas"]
```

---

## 2. Diagrama de Flujo del Procesamiento de Datos

El siguiente diagrama detalla cómo viaja la información desde que el ciudadano o funcionario ingresa un dato hasta su consolidación en el almacenamiento institucional:

```mermaid
flowchart TD
    subgraph INGESTA ["1. CANAL DE ENTRADA"]
        F_CIT["Formulario Ciudadano (Google Forms)"]
        F_ADM["Ventanilla Única / Web App SGE (Funcionario)"]
    end

    subgraph PIPELINE ["2. MOTOR DE VALIDACIÓN Y NORMALIZACIÓN (ValidacionesChilenas.gs)"]
        V1["Recepción de Payload JSON"]
        V2{"Validación RUT Módulo 11"}
        V3["Normalización Telefónica E.164 (+569...)"]
        V4["Sanitización de Cadenas (Trim, Uppercase, XSS Protection)"]
        V5["Validación de Formato de Correo Electrónico"]
        ERR_RUT["Rechazo Inmediato:<br/>RUT Inválido"]
    end

    subgraph STORAGE_DB ["3. BASE DE DATOS RELACIONAL NATIVA (Google Sheets - Repository.gs)"]
        LOCK["Adquisición de Bloqueo Transaccional (LockService)"]
        T_PERS["Tabla PERSONAS<br/>(Datos sociodemográficos, RSH)"]
        T_EMP["Tabla EMPRENDIMIENTOS<br/>(Rubro, SII, Sanitaria)"]
        T_REL["Tabla PERSONA_EMPRENDIMIENTO<br/>(Asociación N:M)"]
        T_POST["Tabla POSTULACIONES<br/>(Iniciativa, Estado, Score)"]
        T_PROC["Tabla PROCESOS_SELECCION<br/>(Semilla LCG, Fecha, Cupos)"]
        T_RES["Tabla RESULTADOS_SELECCION<br/>(Titulares y Lista Espera)"]
        T_PART["Tabla PARTICIPACIONES<br/>(Asistencia, Ventas Totales)"]
        T_SEG["Tabla SEGUIMIENTO_MERCADO<br/>(Desglose ventas por día)"]
        UNLOCK["Liberación de Bloqueo Transaccional"]
    end

    subgraph DRIVE_STORAGE ["4. EXPEDIENTE DIGITAL Y DEDUPLICACIÓN (DriveStorageService.gs)"]
        DOC_IN["Recepción de Archivo Binario (Blob)"]
        DOC_HASH["Cálculo Criptográfico de Hash SHA-256"]
        DOC_DUP{"¿Hash SHA-256 ya existe<br/>en DOCUMENTOS?"}
        DOC_MOVE["Mover a Carpeta Canónica:<br/>01_Expedientes/[Año]/[RUT - Nombre]/"]
        DOC_REUSE["Reutilizar Enlace Existente<br/>(Cero Duplicación de Almacenamiento)"]
        T_DOC["Tabla DOCUMENTOS<br/>(ID, Nombre, Mime, SHA256, URL Drive)"]
    end

    subgraph AUDIT ["5. GOBERNANZA Y AUDITORÍA INMUTABLE"]
        LOG["Módulo AuditoriaService.gs"]
        T_AUD["Tabla AUDITORIA (Append-Only Log)<br/>- Timestamp ISO-8601<br/>- Funcionario ejecutor<br/>- Acción y Entidad afectada<br/>- Diferencial de cambios (Diff JSON)"]
    end

    %% Conexiones Ingesta -> Pipeline
    F_CIT --> V1
    F_ADM --> V1
    V1 --> V2
    V2 -- "Inválido" --> ERR_RUT
    V2 -- "Válido" --> V3
    V3 --> V4
    V4 --> V5

    %% Conexiones Pipeline -> DB
    V5 --> LOCK
    LOCK --> T_PERS
    LOCK --> T_EMP
    LOCK --> T_REL
    LOCK --> T_POST
    T_POST --> UNLOCK

    %% Conexiones Procesos de Negocio
    T_POST --> T_PROC
    T_PROC --> T_RES
    T_RES --> T_PART
    T_PART --> T_SEG

    %% Conexiones Archivos -> Drive
    V1 -. "Adjuntos (PDF, JPG, PNG)" .-> DOC_IN
    DOC_IN --> DOC_HASH
    DOC_HASH --> DOC_DUP
    DOC_DUP -- "Nuevo Archivo" --> DOC_MOVE
    DOC_DUP -- "Archivo Idéntico Detectado" --> DOC_REUSE
    DOC_MOVE --> T_DOC
    DOC_REUSE --> T_DOC

    %% Conexiones a Auditoría
    UNLOCK -. "Registro de Operación" .-> LOG
    DOC_MOVE -. "Registro de Archivo" .-> LOG
    T_PROC -. "Registro de Sorteo LCG" .-> LOG
    T_RES -. "Cambio de Estado Cupo" .-> LOG
    LOG --> T_AUD
```

---

## 3. Flujo Específico de Deduplicación y Gestión Documental (SHA-256)

El almacenamiento municipal en Google Drive se optimiza mediante el cálculo de un hash criptográfico sobre cada archivo cargado, evitando que un mismo documento (como una misma resolución sanitaria o cartola RSH subida varias veces) consuma espacio redundante:

```mermaid
sequenceDiagram
    autonumber
    actor Usuario as Ciudadano / Funcionario
    participant Front as Frontend (Web App / Forms)
    participant Svc as DriveStorageService.gs
    participant Drive as Google Drive Institucional
    participant Sheet as Tabla DOCUMENTOS (Sheets)

    Usuario->>Front: Sube archivo (ej. Resolucion_Sanitaria_2026.pdf)
    Front->>Svc: Envía archivo como Base64 / Blob binario
    Note over Svc: Calcula SHA-256 Hash<br/>Utilities.computeDigest(SHA_256, bytes)
    Svc->>Sheet: Consulta si sha256_hash ya existe para este emprendimiento
    
    alt Hash ya existe (Archivo idéntico ya subido previamente)
        Sheet-->>Svc: Retorna registro existente (drive_file_id, drive_url)
        Note over Svc: Omite subida a Drive<br/>(Ahorro de cuota y ancho de banda)
        Svc-->>Front: Retorna documento ya indexado
    else Hash no existe (Archivo nuevo)
        Svc->>Drive: Crea/obtiene carpeta: 01_Expedientes/[Año]/[RUT - Nombre]
        Svc->>Drive: Guarda archivo con nombre canónico
        Drive-->>Svc: Retorna File ID y URL Permanente
        Svc->>Sheet: Inserta nuevo registro en DOCUMENTOS con sha256_hash
        Svc-->>Front: Retorna confirmación de carga exitosa
    end
```

---

## 4. Diagrama Entidad-Relación (ERD) del Modelo de Datos

Las 16 tablas operan de forma relacional bajo claves primarias de tipo UUID v4:

```mermaid
erDiagram
    PERSONAS ||--o{ PERSONA_EMPRENDIMIENTO : "posee"
    EMPRENDIMIENTOS ||--o{ PERSONA_EMPRENDIMIENTO : "es operado por"
    EMPRENDIMIENTOS ||--o{ DOCUMENTOS : "respalda expediente"
    
    INICIATIVAS ||--o{ REQUISITOS : "establece"
    INICIATIVAS ||--o{ POSTULACIONES : "recibe"
    EMPRENDIMIENTOS ||--o{ POSTULACIONES : "postula a"
    
    INICIATIVAS ||--o{ PROCESOS_SELECCION : "ejecuta"
    PROCESOS_SELECCION ||--o{ RESULTADOS_SELECCION : "dictamina"
    POSTULACIONES ||--|| RESULTADOS_SELECCION : "resuelve"
    
    INICIATIVAS ||--o{ PARTICIPACIONES : "supervisa"
    EMPRENDIMIENTOS ||--o{ PARTICIPACIONES : "participa en"
    
    INICIATIVAS ||--o{ SEGUIMIENTO_MERCADO : "desglosa"
    EMPRENDIMIENTOS ||--o{ SEGUIMIENTO_MERCADO : "declara ventas en"
    
    INICIATIVAS ||--o{ SECTOR_VIRTUAL : "zonifica"
    EMPRENDIMIENTOS ||--o| SECTOR_VIRTUAL : "ocupa stand en"

    PERSONAS {
        string id_persona PK
        string rut UK
        string nombres
        string primer_apellido
        string telefono
        string email
        string tramo_rsh
    }

    EMPRENDIMIENTOS {
        string id_emprendimiento PK
        string nombre_fantasia
        string rubro_principal
        boolean formalizado_sii
        boolean resolucion_sanitaria
    }

    DOCUMENTOS {
        string id_documento PK
        string id_emprendimiento FK
        string tipo_documento
        string sha256_hash
        string drive_file_id
        string drive_url
    }

    INICIATIVAS {
        string id_iniciativa PK
        string codigo UK
        string nombre
        date fecha_inicio
        date fecha_fin
        int cupos_totales
        string estado
    }

    POSTULACIONES {
        string id_postulacion PK
        string id_iniciativa FK
        string id_emprendimiento FK
        string estado_admisibilidad
        string motivo_inadmisibilidad
    }

    PROCESOS_SELECCION {
        string id_proceso PK
        string id_iniciativa FK
        string semilla_aleatoria
        timestamp fecha_ejecucion
        string ejecutado_por
    }

    RESULTADOS_SELECCION {
        string id_resultado PK
        string id_proceso FK
        string id_postulacion FK
        int orden_sorteo
        string estado_asignacion
    }

    PARTICIPACIONES {
        string id_participacion PK
        string id_iniciativa FK
        string id_emprendimiento FK
        boolean asistencia_efectiva
        float ventas_totales_declaradas
        string evaluacion_terreno
    }

    SEGUIMIENTO_MERCADO {
        string id_seguimiento PK
        string id_iniciativa FK
        string id_emprendimiento FK
        date fecha_jornada
        float venta_dia
    }

    AUDITORIA {
        string id_evento PK
        timestamp timestamp
        string usuario_email
        string modulo
        string accion
        string entidad_afectada
        string detalles_json
    }
```

---

## 5. Garantías de Seguridad y Resguardo contra Pérdida de Datos

1. **Versionado de Archivos en Google Drive:**
   Toda modificación en un archivo o sustitución de cartola mantiene el historial de revisiones nativo de Google Drive, impidiendo el borrado accidental por parte de usuarios.
2. **Historial de Versiones en Google Sheets:**
   La base de datos cuenta con la funcionalidad nativa de Google Workspace para restaurar instantáneamente el libro a cualquier minuto exacto del tiempo en caso de error operacional humano.
3. **Bloqueo de Modificación en Tablas de Auditoría y Sorteo:**
   Las tablas `AUDITORIA`, `PROCESOS_SELECCION` y `RESULTADOS_SELECCION` son protegidas programáticamente: una vez insertado un sorteo, sus registros no admiten `UPDATE` ni `DELETE`, preservando la prueba documental para fiscalizaciones.
