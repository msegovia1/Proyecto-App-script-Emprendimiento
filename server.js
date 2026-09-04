// server.js
// Express Server for Sistema de Gestión de Emprendimientos (SGE 2.1.0)
// Municipalidad de Santiago

import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEngine } from './src/server/engine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 } // 15MB
});

// Initialize backend engine
const engine = createEngine();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Health Check
app.get(['/health', '/api/health'], (req, res) => {
  res.json({ status: 'ok', version: '2.1.0-FICHA-INTEGRAL', timestamp: new Date().toISOString() });
});

// Bridge client script injected into frontend
const gasBridgeScript = `
<script id="gas-bridge-runtime">
  (function() {
    window.google = window.google || {};
    window.google.script = window.google.script || {};

    function createGASRunner(successFn, failureFn) {
      return new Proxy({}, {
        get: function(target, prop) {
          if (prop === 'withSuccessHandler') {
            return function(fn) { return createGASRunner(fn, failureFn); };
          }
          if (prop === 'withFailureHandler') {
            return function(fn) { return createGASRunner(successFn, fn); };
          }
          return async function() {
            var args = Array.prototype.slice.call(arguments);
            try {
              var res;
              // If single argument is a form or contains files
              if (args.length === 1 && (args[0] instanceof HTMLFormElement || (args[0] && args[0].nodeName === 'FORM'))) {
                var formData = new FormData(args[0]);
                formData.append('__method', prop);
                res = await fetch('/api/form-upload', {
                  method: 'POST',
                  body: formData
                });
              } else {
                res = await fetch('/api/rpc', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ method: prop, args: args })
                });
              }

              var json = await res.json();
              if (successFn) successFn(json);
              return json;
            } catch (err) {
              if (failureFn) failureFn(err);
              else console.error('RPC Error [' + prop + ']:', err);
              throw err;
            }
          };
        }
      });
    }

    window.google.script.run = createGASRunner(null, null);
  })();
</script>
`;

// Render App
app.get('/', (req, res) => {
  try {
    const indexPath = path.join(__dirname, 'src', 'frontend', 'Index.html');
    const stylesPath = path.join(__dirname, 'src', 'frontend', 'Styles.html');
    const scriptsPath = path.join(__dirname, 'src', 'frontend', 'Scripts.html');

    let html = fs.readFileSync(indexPath, 'utf-8');
    const styles = fs.readFileSync(stylesPath, 'utf-8');
    const scripts = fs.readFileSync(scriptsPath, 'utf-8');

    // Replace Apps Script template directives safely using functional replacers
    html = html.replace(/<\?=\s*appName\s*\?>/g, () => 'Sistema de Gestión de Emprendimientos');
    html = html.replace(/<\?=\s*version\s*\?>/g, () => 'v2.1.0-FICHA-INTEGRAL');
    html = html.replace(/<\?!*=?\s*include_\(['"]Styles['"]\)\s*\?>/gi, () => styles);
    html = html.replace(/<\?!*=?\s*include_\(['"]Scripts['"]\)\s*\?>/gi, () => gasBridgeScript + '\n' + scripts);

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    console.error('Error rendering index:', err);
    res.status(500).send('Error cargando la aplicación: ' + err.message);
  }
});

// RPC API Endpoint
app.post('/api/rpc', (req, res) => {
  const { method, args } = req.body || {};
  if (!method) {
    return res.status(400).json({ ok: false, error: { code: 'PARAMETRO_REQUERIDO', message: 'Se requiere especificar "method"' } });
  }

  try {
    const result = engine.execute(method, args || []);
    res.json(result);
  } catch (err) {
    console.error(`Error executing RPC '${method}':`, err);
    res.status(500).json({
      ok: false,
      data: null,
      error: { code: 'SERVER_ERROR', message: err.message || 'Error interno del servidor' },
      meta: {}
    });
  }
});

// Form & Document Upload Endpoint
app.post('/api/form-upload', upload.any(), (req, res) => {
  try {
    const method = req.body.__method || 'apiCargarDocumentoFormulario';
    const formObj = { ...req.body };
    delete formObj.__method;

    // Convert uploaded file to Google Apps Script Blob interface
    if (req.files && req.files.length > 0) {
      const f = req.files[0];
      formObj.ARCHIVO = {
        getName: () => f.originalname || 'documento_cargado.pdf',
        getBytes: () => f.buffer,
        getContentType: () => f.mimetype || 'application/pdf',
        setName: (newName) => { f.originalname = newName; }
      };
    }

    const result = engine.execute(method, [formObj]);
    res.json(result);
  } catch (err) {
    console.error('Error handling form-upload:', err);
    res.status(500).json({
      ok: false,
      data: null,
      error: { code: 'UPLOAD_ERROR', message: err.message },
      meta: {}
    });
  }
});

// Document Preview / Download
app.get('/api/documents/:id/view', (req, res) => {
  const docId = req.params.id;
  const doc = engine.context.repoBuscarPorId('DOCUMENTOS', docId);

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="utf-8">
      <title>Visor de Documento · SGE</title>
      <style>
        body { font-family: system-ui, -apple-system, sans-serif; background: #0f2942; color: #f8fafc; margin: 0; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
        .card { background: #1e3a5f; padding: 32px; border-radius: 12px; max-width: 540px; text-align: center; box-shadow: 0 10px 25px rgba(0,0,0,0.3); }
        .badge { display: inline-block; padding: 4px 12px; border-radius: 999px; background: #2563eb; color: #fff; font-size: 13px; font-weight: 600; margin-bottom: 16px; }
        h1 { font-size: 20px; margin: 0 0 12px; }
        p { color: #94a3b8; font-size: 14px; line-height: 1.6; }
        .details { text-align: left; background: #132b47; padding: 16px; border-radius: 8px; margin: 20px 0; font-family: monospace; font-size: 12px; color: #cbd5e1; }
        .btn { display: inline-block; background: #2563eb; color: white; text-decoration: none; padding: 10px 20px; border-radius: 6px; font-weight: 600; font-size: 14px; transition: 0.2s; }
        .btn:hover { background: #1d4ed8; }
      </style>
    </head>
    <body>
      <div class="card">
        <span class="badge">Expediente Digital SGE</span>
        <h1>${doc ? doc.TIPO_DOCUMENTO : 'Documento Institucional'}</h1>
        <p>Documento oficial almacenado y verificado en la plataforma municipal.</p>
        <div class="details">
          <div><strong>ID:</strong> ${docId}</div>
          <div><strong>Tipo:</strong> ${doc ? doc.TIPO_DOCUMENTO : 'DOCUMENTO_ADJUNTO'}</div>
          <div><strong>Estado:</strong> ${doc ? (doc.ESTADO_REVISION || 'VIGENTE') : 'RECIBIDO'}</div>
          <div><strong>Fecha Emisión:</strong> ${doc ? (doc.FECHA_EMISION || 'S/I') : 'N/A'}</div>
          <div><strong>Vigente:</strong> ${doc ? doc.ES_VERSION_VIGENTE : 'SI'}</div>
        </div>
        <a href="javascript:window.close()" class="btn">Cerrar Visor</a>
      </div>
    </body>
    </html>
  `);
});

// CSV Export Endpoint
app.get('/api/export/:tabla', (req, res) => {
  const tabla = req.params.tabla;
  try {
    const csvResult = engine.execute('apiExportar', [tabla]);
    if (csvResult.ok && csvResult.data) {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${tabla}_${new Date().toISOString().slice(0, 10)}.csv"`);
      return res.send(csvResult.data.csv || csvResult.data);
    }
    res.status(400).send('Error exportando tabla: ' + (csvResult.error?.message || 'Error desconocido'));
  } catch (err) {
    res.status(500).send('Error exportando: ' + err.message);
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`=======================================================`);
  console.log(`🏛️  Sistema de Gestión de Emprendimientos (SGE 2.1.0)`);
  console.log(`🌐 Servidor iniciado en http://0.0.0.0:${PORT}`);
  console.log(`=======================================================`);
});
