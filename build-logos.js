// build-logos.js
// Genera los logos oficiales vectoriales (SVG) y rasterizados (PNG)
// basados exactamente en centrado-color.png y horizontal-color.png de la Ilustre Municipalidad de Santiago

import fs from 'node:fs';
import { execSync } from 'node:child_process';

const GOLD = '#F5B800';
const GREY = '#6A6E73';
const NAVY = '#0A316C';

// SVG del Escudo Oficial de Santiago con Corona, León Rampante con Espada y 8 Veneras
function generarEscudoSVG(x, y, scale = 1) {
  return `
  <g id="escudo-oficial" transform="translate(${x}, ${y}) scale(${scale})">
    <!-- 1. CORONA REAL MUNICIPAL -->
    <!-- Base arqueada de la corona -->
    <path d="M 38,98 Q 140,118 242,98 L 246,80 Q 140,100 34,80 Z" fill="${GOLD}" />
    <!-- 5 Ranuras / Joyas rectangulares en la diadema -->
    <g fill="#FFFFFF">
      <rect x="58" y="85" width="18" height="6.5" rx="1.5" transform="rotate(-3 67 88)" />
      <rect x="94" y="89" width="19" height="6.5" rx="1.5" transform="rotate(-1.5 103 92)" />
      <rect x="130" y="90" width="20" height="6.5" rx="1.5" />
      <rect x="167" y="89" width="19" height="6.5" rx="1.5" transform="rotate(1.5 176 92)" />
      <rect x="204" y="85" width="18" height="6.5" rx="1.5" transform="rotate(3 213 88)" />
    </g>

    <!-- Puntas con Perlas esféricas intermedias -->
    <g fill="${GOLD}">
      <!-- Punta 1 -->
      <path d="M 68,80 L 73,46 L 79,80 Z" />
      <circle cx="73" cy="43" r="6" />
      <!-- Punta 2 -->
      <path d="M 112,83 L 118,42 L 124,83 Z" />
      <circle cx="118" cy="39" r="6.5" />
      <!-- Punta 3 -->
      <path d="M 156,83 L 162,42 L 168,83 Z" />
      <circle cx="162" cy="39" r="6.5" />
      <!-- Punta 4 -->
      <path d="M 201,80 L 207,46 L 213,80 Z" />
      <circle cx="207" cy="43" r="6" />

      <!-- Florones de hojas de acanto / tréboles -->
      <!-- Florón Lateral Izquierdo -->
      <path d="M 36,80 C 33,65 24,58 35,46 C 45,54 44,65 49,80 Z" />
      <circle cx="33" cy="46" r="6" />

      <!-- Florón 1 (Izquierda) -->
      <g transform="translate(94, 60)">
        <path d="M 0,20 C -15,10 -25,-5 -8,-16 C -1,-22 8,-12 0,0 C 8,-12 17,-22 24,-16 C 41,-5 31,10 16,20 Z" />
        <circle cx="-7" cy="-14" r="7.5" />
        <circle cx="8" cy="-22" r="8.5" />
        <circle cx="23" cy="-14" r="7.5" />
      </g>

      <!-- Florón Central (Principal, más alto) -->
      <g transform="translate(140, 52)">
        <path d="M 0,28 C -18,15 -30,-5 -10,-19 C -2,-26 10,-15 0,0 C 10,-15 22,-26 30,-19 C 50,-5 38,15 20,28 Z" />
        <circle cx="-10" cy="-17" r="9" />
        <circle cx="10" cy="-28" r="10.5" />
        <circle cx="30" cy="-17" r="9" />
      </g>

      <!-- Florón 3 (Derecha) -->
      <g transform="translate(186, 60)">
        <path d="M 0,20 C -15,10 -25,-5 -8,-16 C -1,-22 8,-12 0,0 C 8,-12 17,-22 24,-16 C 41,-5 31,10 16,20 Z" />
        <circle cx="-7" cy="-14" r="7.5" />
        <circle cx="8" cy="-22" r="8.5" />
        <circle cx="23" cy="-14" r="7.5" />
      </g>

      <!-- Florón Lateral Derecho -->
      <path d="M 244,80 C 247,65 256,58 245,46 C 235,54 236,65 231,80 Z" />
      <circle cx="247" cy="46" r="6" />
    </g>

    <!-- 2. ESCUDO HERÁLDICO -->
    <!-- Contorno Exterior Bordura Gris Carbón -->
    <path d="M 40,108 
             L 240,108 
             Q 240,118 240,225 
             C 240,295 190,345 140,378 
             C 90,345 40,295 40,225 
             Q 40,118 40,108 Z" 
          fill="${GREY}" />

    <!-- Campo Interior Blanco -->
    <path d="M 68,136 
             L 212,136 
             Q 212,146 212,220 
             C 212,274 175,314 140,340 
             C 105,314 68,274 68,220 
             Q 68,146 68,136 Z" 
          fill="#FFFFFF" />

    <!-- 8 CONCHAS DE SANTIAGO (VENERAS BLANCAS EN LA BORDURA) -->
    ${[
      // 3 superiores
      { cx: 80, cy: 122, rot: 0, s: 0.95 },
      { cx: 140, cy: 122, rot: 0, s: 1.0 },
      { cx: 200, cy: 122, rot: 0, s: 0.95 },
      // 2 laterales
      { cx: 54, cy: 200, rot: -90, s: 0.95 },
      { cx: 226, cy: 200, rot: 90, s: 0.95 },
      // 2 inferiores curvas
      { cx: 70, cy: 285, rot: -135, s: 0.95 },
      { cx: 210, cy: 285, rot: 135, s: 0.95 },
      // 1 punta inferior
      { cx: 140, cy: 360, rot: 180, s: 0.95 }
    ].map(v => `
      <g transform="translate(${v.cx}, ${v.cy}) rotate(${v.rot}) scale(${v.s})">
        <!-- Venera estilizada -->
        <path d="M -12,-6 Q 0,-14 12,-6 C 14,-2 13,8 8,11 L 10,13 L -10,13 L -8,11 C -13,8 -14,-2 -12,-6 Z" fill="#FFFFFF" />
        <!-- Rayos de la venera -->
        <path d="M -7,8 L -8,-2 M -3,10 L -3,-5 M 0,10 L 0,-6 M 3,10 L 3,-5 M 7,8 L 8,-2" stroke="${GREY}" stroke-width="1.2" stroke-linecap="round" />
      </g>
    `).join('')}

    <!-- 3. LEÓN RAMPANTE CON ESPADA (SILUETA HERÁLDICA OFICIAL EN GRIS CARBÓN) -->
    <g id="leon" fill="${GREY}">
      <!-- Espada alzada -->
      <path d="M 80,140 L 85,138 L 126,200 L 122,203 Z" />
      <!-- Hoja espada -->
      <polygon points="76,145 84,136 122,198 116,203" fill="${GREY}" />
      <!-- Punta espada aguda -->
      <polygon points="74,142 78,134 84,138" fill="${GREY}" />
      <!-- Cruz / Gavilanes y empuñadura -->
      <rect x="110" y="196" width="22" height="4" rx="1.5" transform="rotate(35 121 198)" fill="${GREY}" />
      <circle cx="129" cy="210" r="3.5" fill="${GREY}" />

      <!-- Cabeza del León -->
      <circle cx="146" cy="180" r="14" />
      <!-- Orejas -->
      <path d="M 148,168 C 144,160 152,158 156,166 Z" />
      <path d="M 154,170 C 152,163 159,162 161,168 Z" />
      <!-- Hocico y Fauces abiertas -->
      <path d="M 142,174 L 126,170 C 124,176 130,180 138,181 L 128,186 C 132,192 142,190 144,184 Z" />
      <!-- Lengua feroz -->
      <path d="M 132,181 C 124,181 122,185 126,187 C 132,187 134,183 132,181 Z" fill="${GREY}" />

      <!-- Melena con mechones afilados hacia atrás -->
      <path d="M 148,172 C 162,170 170,182 165,195 C 172,190 176,202 168,212 C 174,212 173,222 164,228 C 158,222 154,215 152,204 Z" />

      <!-- Brazo derecho alzado (que sostiene la espada) -->
      <path d="M 142,194 C 134,196 120,204 122,212 C 128,212 136,205 144,204 Z" />
      <!-- Garras delanteras derechas -->
      <path d="M 119,204 C 114,202 115,208 122,210 Z" />

      <!-- Brazo izquierdo extendido hacia adelante -->
      <path d="M 140,210 C 126,215 108,218 106,226 C 114,228 126,224 138,220 Z" />
      <!-- Garras delanteras izquierdas -->
      <path d="M 104,222 C 98,222 99,228 106,228 M 103,225 C 97,227 100,232 107,230" stroke="${GREY}" stroke-width="2" stroke-linecap="round" />

      <!-- Tronco y lomo del león -->
      <path d="M 152,204 C 156,225 154,248 148,270 C 140,268 138,245 138,224 C 138,214 146,204 152,204 Z" />

      <!-- Cola levantada en 'S' elegante y penacho frondoso -->
      <path d="M 152,268 C 170,266 186,245 180,222 C 175,200 156,192 160,180 C 164,170 175,172 178,182 C 176,170 188,172 186,186 C 188,198 180,215 184,232 C 190,256 168,280 148,272 Z" />
      <!-- Penacho de la cola -->
      <path d="M 166,174 C 160,165 174,158 178,168 C 182,158 194,164 186,174 C 195,178 186,188 176,182 Z" />

      <!-- Pata trasera derecha (apoyada) -->
      <path d="M 150,268 C 162,274 166,295 160,314 C 156,316 148,312 152,300 C 154,288 148,278 146,270 Z" />
      <!-- Garra pata trasera derecha -->
      <path d="M 160,314 C 166,316 164,322 156,322 L 148,320 Z" />

      <!-- Pata trasera izquierda (avanzada en marcha) -->
      <path d="M 144,270 C 136,280 120,296 116,308 C 122,310 130,302 136,292 C 142,284 146,276 148,270 Z" />
      <!-- Garra pata trasera izquierda -->
      <path d="M 116,308 C 108,310 110,316 118,316 L 126,312 Z" />
    </g>
  </g>
  `;
}

// LOGO 1: CENTRADO EXACTO (1:1 Aspect Ratio)
function generarCentradoSVG() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500" width="100%" height="100%">
  <rect width="500" height="500" fill="#FFFFFF" />

  <!-- Escudo y Corona Central -->
  ${generarEscudoSVG(110, 15, 1.0)}

  <!-- Tipografía Oficial: STGO -->
  <g id="wordmark-stgo" transform="translate(250, 424)" text-anchor="middle">
    <text font-family="'Montserrat', 'Arial Black', 'Trebuchet MS', sans-serif" 
          font-size="88" 
          font-weight="900" 
          letter-spacing="-1.5" 
          fill="${NAVY}">STGO</text>
  </g>

  <!-- Subtítulo Oficial: ILUSTRE MUNICIPALIDAD -->
  <g id="wordmark-subtitulo" transform="translate(250, 464)" text-anchor="middle">
    <text font-family="'Montserrat', 'Helvetica Neue', Arial, sans-serif" 
          font-size="20.5" 
          font-weight="800" 
          letter-spacing="5.2" 
          fill="${GREY}">ILUSTRE MUNICIPALIDAD</text>
  </g>
</svg>`;
}

// LOGO 2: HORIZONTAL EXACTO (Proporción Rectangular)
function generarHorizontalSVG() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 620 260" width="100%" height="100%">
  <rect width="620" height="260" fill="#FFFFFF" />

  <!-- Escudo a la Izquierda -->
  ${generarEscudoSVG(10, 8, 0.62)}

  <!-- Bloque de Texto a la Derecha -->
  <!-- STGO -->
  <g id="wordmark-stgo-horiz" transform="translate(195, 152)">
    <text font-family="'Montserrat', 'Arial Black', 'Trebuchet MS', sans-serif" 
          font-size="116" 
          font-weight="900" 
          letter-spacing="-2" 
          fill="${NAVY}">STGO</text>
  </g>

  <!-- ILUSTRE MUNICIPALIDAD -->
  <g id="wordmark-subtitulo-horiz" transform="translate(198, 206)">
    <text font-family="'Montserrat', 'Helvetica Neue', Arial, sans-serif" 
          font-size="24.5" 
          font-weight="800" 
          letter-spacing="5.8" 
          fill="${GREY}">ILUSTRE MUNICIPALIDAD</text>
  </g>
</svg>`;
}

// Guardar archivos
const centradoSvg = generarCentradoSVG();
const horizontalSvg = generarHorizontalSVG();

fs.writeFileSync('./public/stgo-centrado.svg', centradoSvg);
fs.writeFileSync('./public/stgo-horizontal.svg', horizontalSvg);
fs.writeFileSync('./public/centrado-color.svg', centradoSvg);
fs.writeFileSync('./public/horizontal-color.svg', horizontalSvg);

console.log('SVGs generados exitosamente.');

// Convertir con rsvg-convert a PNG de alta resolución idéntico a centrado-color.png y horizontal-color.png
try {
  execSync('rsvg-convert -w 800 -h 800 ./public/stgo-centrado.svg -o ./public/stgo-centrado.png');
  execSync('rsvg-convert -w 800 -h 800 ./public/centrado-color.svg -o ./public/centrado-color.png');
  execSync('rsvg-convert -w 960 -h 400 ./public/stgo-horizontal.svg -o ./public/stgo-horizontal.png');
  execSync('rsvg-convert -w 960 -h 400 ./public/horizontal-color.svg -o ./public/horizontal-color.png');
  // También copiamos a raíz por si se solicita directamente
  fs.copyFileSync('./public/centrado-color.png', './centrado-color.png');
  fs.copyFileSync('./public/horizontal-color.png', './horizontal-color.png');
  console.log('PNGs generados exitosamente con rsvg-convert.');
} catch (e) {
  console.error('Error generando PNG:', e.message);
}
