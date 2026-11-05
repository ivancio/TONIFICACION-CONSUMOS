import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('La app tiene manifiesto e iconos instalables', async () => {
  const manifest = JSON.parse(await readFile('manifest.webmanifest', 'utf8'));
  const html = await readFile('index.html', 'utf8');
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.display, 'standalone');
  assert.match(html, /rel="manifest" href="\/manifest\.webmanifest"/);
  for (const size of [192, 512]) {
    const icon = manifest.icons.find(item => item.sizes === `${size}x${size}`);
    assert.ok(icon, `Falta el icono ${size}x${size}`);
    const png = await readFile(`icons/icon-${size}.png`);
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(png.readUInt32BE(16), size);
    assert.equal(png.readUInt32BE(20), size);
  }
});
