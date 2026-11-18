// The actual API module against an isolated HTTP stand-in. Run: node --experimental-transform-types --test tests/preroll.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import * as api from '../src/api.ts';
globalThis.window = globalThis;

test('pre-roll route, authorization, order, empty list, failure and 3-second deadline', async () => {
  const requests = [];
  let mode = 'clips';
  const server = http.createServer((req, res) => {
    requests.push({ path: req.url, authorization: req.headers.authorization });
    res.setHeader('Content-Type', 'application/json');
    if (mode === 'late') return;
    if (mode === 'failed') { res.writeHead(500); res.end('{}'); return; }
    res.end(JSON.stringify(mode === 'empty' ? [] : [{ url: '/api/preroll/0', unknown: true }, { url: '/api/preroll/1' }]));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  api.configure({ server: `http://127.0.0.1:${server.address().port}`, token: 'fixture' });
  try {
    assert.deepEqual((await api.preroll('film 1')).map(c => c.url), ['/api/preroll/0', '/api/preroll/1']);
    assert.deepEqual(requests[0], { path: '/api/v1/items/film%201/preroll', authorization: 'Bearer fixture' });
    mode = 'empty'; assert.deepEqual(await api.preroll('episode'), []);
    mode = 'failed'; await assert.rejects(api.preroll('film'), { status: 500 });
    mode = 'late'; const start = Date.now();
    await assert.rejects(api.preroll('film'));
    assert.ok(Date.now() - start >= 2900 && Date.now() - start < 4500);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
