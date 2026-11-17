// Star rating: half stars and the real API client against a scratch HTTP server.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
async function load(path) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  return import('data:text/javascript;base64,' + Buffer.from(stripTypeScriptTypes(source, { mode: 'transform' })).toString('base64'));
}
const { stars, ratingChoices } = await load('../src/lib/ratings.ts');
assert.equal(stars(9), '★★★★½');
assert.equal(stars(1), '½');
assert.equal(stars(0), '');
assert.deepEqual(ratingChoices, [10,9,8,7,6,5,4,3,2,1]);
const requests = [];
const server = createServer(async (req, res) => {
  let body = '';
  for await (const chunk of req) body += chunk;
  requests.push([req.method, req.url, JSON.parse(body), req.headers.authorization]);
  if (requests.length === 3) { res.writeHead(403); res.end('{"error":"denied"}'); }
  else { res.writeHead(204); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
globalThis.window = globalThis;
try {
  const { api, configure } = await load('../src/api.ts');
  configure({ server: `http://127.0.0.1:${server.address().port}`, token: 'scratch' });
  for (const rating of [9, 0]) await api('/items/a%2Fb/rating', { method: 'PUT', body: { rating } });
  await assert.rejects(api('/items/a%2Fb/rating', { method: 'PUT', body: { rating: 1 } }), /denied/);
  assert.deepEqual(requests.map(r => r.slice(0,3)), [9,0,1].map(rating => ['PUT', '/api/v1/items/a%2Fb/rating', { rating }]));
  assert.ok(requests.every(r => r[3] === 'Bearer scratch'));
  console.log('Star rating checks passed');
} finally { await new Promise(resolve => server.close(resolve)); }
