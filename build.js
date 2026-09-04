import fs from 'node:fs';
import path from 'node:path';

console.log('Building Sistema de Gestión de Emprendimientos (SGE 2.1.0)...');

const requiredFiles = [
  'server.js',
  'src/frontend/Index.html',
  'src/frontend/Styles.html',
  'src/frontend/Scripts.html'
];

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) {
    console.error(`Missing required file: ${file}`);
    process.exit(1);
  }
}

console.log('Build validation passed successfully.');
