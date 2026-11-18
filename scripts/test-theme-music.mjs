// Theme music: pure decisions plus authenticated binary delivery against a stand-in Arc.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const compiled = mkdtempSync(join(tmpdir(), 'arc-theme-test-'));
try {
  execFileSync('node', ['node_modules/typescript/bin/tsc', '--ignoreConfig', 'src/api.ts', 'src/lib/themeMusicLogic.ts',
    '--outDir', compiled, '--target', 'ES2020', '--module', 'ES2020', '--skipLibCheck'], { stdio: 'inherit' });
  writeFileSync(join(compiled, 'package.json'), '{"type":"module"}');
  const { themePath, fadeStep } = await import(pathToFileURL(join(compiled, 'lib/themeMusicLogic.js')));
  const { configure, apiBlob } = await import(pathToFileURL(join(compiled, 'api.js')));
  const movie = { id: 'abc', kind: 'movie', theme_url: '/api/items/abc/theme' };
  assert.equal(themePath(movie, true), movie.theme_url);
  assert.equal(themePath(movie, false), null);
  assert.equal(themePath({ ...movie, theme_url: movie.theme_url + '?v=123' }, true), movie.theme_url + '?v=123');
  assert.equal(themePath({ ...movie, kind: 'series' }, true), movie.theme_url);
  assert.equal(themePath({ ...movie, kind: 'episode' }, true), null);
  for (const theme_url of ['', '/api/items/abc/stream', 'https://other.invalid/api/items/abc/theme', '/api/items/abc/theme?token=bad']) {
    assert.equal(themePath({ ...movie, theme_url }, true), null);
  }
  let volume = 0;
  for (let i = 0; i < 13; i++) volume = fadeStep(volume, 0.25);
  assert.equal(volume, 0.25);
  for (let i = 0; i < 13; i++) volume = fadeStep(volume, 0);
  assert.equal(volume, 0);
  const seen = [];
  const server = createServer((req, res) => {
    seen.push({ path: req.url, auth: req.headers.authorization });
    res.setHeader('Content-Type', 'audio/mpeg');
    if (req.url === '/api/v1/items/def/theme') { res.writeHead(404); res.end(); }
    else res.end('test theme bytes');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    configure({ server: 'http://127.0.0.1:' + server.address().port, token: 'scratch-only' });
    for (let i = 0; i < 2; i++) {
      const blob = await apiBlob(themePath(movie, true));
      assert.equal(await blob.text(), 'test theme bytes');
    }
    await assert.rejects(apiBlob('/api/items/def/theme'), { status: 404 });
    assert.deepEqual(seen.slice(0, 2), Array(2).fill({ path: '/api/v1/items/abc/theme', auth: 'Bearer scratch-only' }));
    console.log('Theme music: eligibility, fades, authenticated delivery twice and unavailable tune passed');
  } finally { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
} finally { rmSync(compiled, { recursive: true, force: true }); }
