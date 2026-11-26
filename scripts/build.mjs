import { copyFile, mkdir } from 'node:fs/promises';

await mkdir('dist', { recursive: true });
await mkdir('dist/icons', { recursive: true });
await copyFile('index.html', 'dist/index.html');
await copyFile('manifest.webmanifest', 'dist/manifest.webmanifest');
await copyFile('icons/icon-192.png', 'dist/icons/icon-192.png');
await copyFile('icons/icon-512.png', 'dist/icons/icon-512.png');

// Lector de capturas de KERAjet (OCR): se sirve desde la propia app, sin depender de internet externo
await mkdir('dist/ocr', { recursive: true });
const ocr = [
  ['node_modules/tesseract.js/dist/tesseract.min.js', 'tesseract.min.js'],
  ['node_modules/tesseract.js/dist/worker.min.js', 'worker.min.js'],
  ['node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js'],
  ['node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js', 'tesseract-core-lstm.wasm.js'],
  ['node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', 'eng.traineddata.gz'],
];
for (const [from, to] of ocr) await copyFile(from, `dist/ocr/${to}`);
