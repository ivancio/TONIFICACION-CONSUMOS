import { copyFile, mkdir } from 'node:fs/promises';

await mkdir('dist', { recursive: true });
await mkdir('dist/icons', { recursive: true });
await copyFile('index.html', 'dist/index.html');
await copyFile('manifest.webmanifest', 'dist/manifest.webmanifest');
await copyFile('icons/icon-192.png', 'dist/icons/icon-192.png');
await copyFile('icons/icon-512.png', 'dist/icons/icon-512.png');
