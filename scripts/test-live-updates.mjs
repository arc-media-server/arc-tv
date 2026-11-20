// Live updates: logic and actual authenticated HTTP streaming against a stand-in, twice.
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { SseParser, HintBatcher, LiveUpdates, touches } from '../src/lib/live-hints.ts';
const events = [];
const parser = new SseParser((e) => events.push(e));
parser.feed(': heartbeat\r\nid: one\r\nevent: invali'); parser.feed('date\r\ndata: {"topic":\r\ndata: "profile"}\r\n\r\n');
assert.deepEqual(events, [{ event: 'invalidate', id: 'one', data: '{"topic":\n"profile"}' }]);
assert.equal(touches(new Set(['resync']), ['catalog']), true);
assert.equal(touches(new Set(['profile']), ['catalog']), false);
// A fake clock checks the real 1.5s/5s algorithm, including continuous scans and stop.
const real = { now: Date.now, setTimeout, clearTimeout };
let now = 0, key = 0; const timers = new Map(), flushes = [];
Date.now = () => now;
globalThis.setTimeout = (fn, wait) => { timers.set(++key, { fn, at: now + wait }); return key; };
globalThis.clearTimeout = (id) => timers.delete(id);
const tick = (to) => { while (true) { const entry = [...timers].sort((a, b) => a[1].at - b[1].at)[0]; if (!entry || entry[1].at > to) break; timers.delete(entry[0]); now = entry[1].at; entry[1].fn(); } now = to; };
const batch = new HintBatcher((topics) => flushes.push([now, [...topics]]));
for (let i = 0; i < 10000; i += 500) { tick(i); batch.add('catalog'); batch.add('unknown'); }
tick(12000);
assert.deepEqual(flushes, [[1500, ['catalog']], [6500, ['catalog']], [11500, ['catalog']]]);
batch.add('profile'); batch.stop(); tick(20000); assert.equal(flushes.length, 3);
// Watch Together's rooms hint is a known topic, so Home's row hears about room changes.
batch.add('watch_together'); tick(40000); assert.deepEqual(flushes[3], [21500, ['watch_together']]);
assert.ok(touches(new Set(['watch_together']), ['watch_together']));
Date.now = real.now; globalThis.setTimeout = real.setTimeout; globalThis.clearTimeout = real.clearTimeout;
console.log('SSE fragments/CRLF/IDs, targeted topics, scan batching, unknown hints and stop passed');
// This HTTP-backed XHR double feeds progressive chunks through the production transport.
// Browser production checks separately verify the Chrome 53 bundle.
class HttpXHR {
  readyState = 0; status = 0; responseText = ''; headers = {}; responseHeaders = {};
  open(method, url) { this.method = method; this.url = url; }
  setRequestHeader(key, value) { this.headers[key] = value; }
  getResponseHeader(key) { return this.responseHeaders[key.toLowerCase()] || null; }
  send() {
    this.req = request(this.url, { method: this.method, headers: this.headers }, (res) => {
      this.responseHeaders = res.headers; this.status = res.statusCode; this.readyState = 2; this.onreadystatechange?.();
      res.setEncoding('utf8');
      res.on('data', (chunk) => { this.responseText += chunk; this.readyState = 3; this.onprogress?.(); });
      res.on('end', () => { this.readyState = 4; this.onreadystatechange?.(); });
    });
    this.req.on('error', () => this.onerror?.()); this.req.end();
  }
  abort() { this.req?.destroy(); }
}
const seen = []; let open = 0;
const server = createServer((req, res) => {
  assert.equal(req.url, '/api/v1/events'); assert.equal(req.headers.authorization, 'Bearer fixture-token');
  assert.equal(req.headers.accept, 'text/event-stream');
  seen.push(req.headers['last-event-id'] || ''); open++;
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  res.write('id: start\nevent: resync\ndata: {}\n\n');
  const timer = setTimeout(() => { res.write('id: last\nevent: invalidate\ndata: {"topic":'); setTimeout(() => res.write('"profile"}\n\n'), 10); }, 70);
  req.on('close', () => { open--; clearTimeout(timer); });
});
await new Promise((resolve) => server.listen(18410, '127.0.0.1', resolve));
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
try {
  for (let run = 0; run < 2; run++) {
    const changes = [];
    const stream = new LiveUpdates('http://127.0.0.1:18410/api/v1/events', 'fixture-token', (t) => changes.push([...t]), () => new HttpXHR());
    stream.start(); await pause(50); assert.deepEqual(changes, [], 'opening resync skipped');
    await pause(1700); assert.deepEqual(changes, [['profile']], 'hint delivered before stream EOF'); assert.equal(open, 1);
    stream.stop(); await pause(50); assert.equal(open, 0, 'background cancels stream');
    stream.start(); await pause(50); assert.deepEqual(changes[1], ['resync'], 'resume immediately catches up');
    stream.stop(); await pause(50); assert.equal(open, 0);
    const count = changes.length; await pause(1600); assert.equal(changes.length, count, 'stop clears pending work');
    console.log(`HTTP stand-in run ${run + 1}: streamed, background closed, resumed with catch-up, stopped cleanly`);
  }
  assert.deepEqual(seen, ['', 'last', '', 'last']);
} finally { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
