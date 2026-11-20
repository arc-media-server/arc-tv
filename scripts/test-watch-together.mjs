// Watch Together: the plain rules (codes, clock, drift, notes, refusals) and the room session
// against stand-ins for Arc and the TV's XHR (Android's WatchTogetherTest). No network, no TV.
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const compiled = mkdtempSync(join(tmpdir(), 'arc-together-test-'));
let passed = 0;
const test = async (name, fn) => {
  try { await fn(); passed++; } catch (e) { console.error(`FAIL ${name}`); throw e; }
};
try {
  execFileSync('node', ['node_modules/typescript/bin/tsc', '--ignoreConfig', 'src/lib/watch-together.ts', 'src/lib/room-session.ts',
    '--outDir', compiled, '--target', 'ES2020', '--module', 'ES2020', '--skipLibCheck', '--lib', 'ES2020,DOM'], { stdio: 'inherit' });
  writeFileSync(join(compiled, 'package.json'), '{"type":"module"}');
  // The app's imports leave out ".js" (Vite resolves them); Node needs it.
  for (const f of readdirSync(compiled).filter((n) => n.endsWith('.js'))) {
    const p = join(compiled, f);
    writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.\/[^']+)'/g, "from '$1.js'"));
  }
  const W = await import(pathToFileURL(join(compiled, 'watch-together.js')));
  const { RoomSession } = await import(pathToFileURL(join(compiled, 'room-session.js')));

  const room = (o = {}) => ({
    id: 'r1', revision: 1, generation: 1, state: 'paused', position_ms: 0, at_ms: 0, rate: 1, server_time_ms: 0,
    host_id: 'a', self_id: 'a', available: true, item_id: 'm1', item: { id: 'm1', title: 'Film', kind: 'movie' },
    participants: [{ id: 'a', name: 'Jo', available: true, ready: true, state: 'paused' }, { id: 'b', name: 'Sam', available: true, ready: false, state: 'waiting' }],
    ...o,
  });

  await test('codes', () => {
    assert.equal(W.normalizeCode('abcd 23-45'), 'ABCD2345');
    assert.equal(W.formatCode('abcd2345'), 'ABCD-2345');
    assert.equal(W.formatCode('ABC'), 'ABC');
    assert.equal(W.formatCode('ABCDE'), 'ABCD-E');
    let c = '';
    for (const k of ['a', '2', '-', 'x', 'backspace', 'B']) c = W.typeCode(c, k);
    assert.equal(c, 'A2B');
    assert.equal(W.typeCode('ABCD2345', '9'), 'ABCD2345');
    for (const k of ['0', '1', 'I', 'o']) assert.equal(W.typeCode('AB', k), 'AB');
    assert.equal(W.keyToCodeChar(50), '2');
    assert.equal(W.keyToCodeChar(101), '5');
    assert.equal(W.keyToCodeChar(75), 'K');
    assert.equal(W.keyToCodeChar(13), null);
    assert.equal(W.minutesLeft(1000 + 15 * 60000, 1000), 15);
    assert.equal(W.minutesLeft(1000 + 61000, 1000), 2);
    assert.equal(W.minutesLeft(1000 + 5000, 1000), 1);
    assert.equal(W.minutesLeft(1000, 2000), 0);
    for (const ch of W.CODE_ALPHABET) assert.equal(W.normalizeCode(ch), ch);
  });

  await test('clock offset takes the quickest round trip', () => {
    assert.equal(W.clockOffset([]), null);
    // Server 500 ms ahead; the second sample has a 40 ms round trip, the first 400 ms.
    const samples = [
      { c0: 1000, c3: 1400, s1: 1700, s2: 1700 },
      { c0: 2000, c3: 2040, s1: 2520, s2: 2520 },
    ];
    assert.equal(W.clockOffset(samples), 500);
  });

  await test('expected position', () => {
    assert.equal(W.expectedPosition({ state: 'paused', position_ms: 5000, at_ms: 0, rate: 1 }, 99999), 5000);
    assert.equal(W.expectedPosition({ state: 'waiting', position_ms: 5000, at_ms: 0, rate: 1 }, 99999), 5000);
    assert.equal(W.expectedPosition({ state: 'playing', position_ms: 5000, at_ms: 10000, rate: 1 }, 12500), 7500);
    assert.equal(W.expectedPosition({ state: 'playing', position_ms: 5000, at_ms: 10000, rate: 1 }, 9000), 5000);
    assert.equal(W.expectedPosition({ state: 'playing', position_ms: 0, at_ms: 0, rate: 0 }, 1000), 1000);
  });

  await test('drift corrections, with and without speed changes', () => {
    assert.deepEqual(W.correction(10400, 10000, true), { kind: 'none' });
    assert.deepEqual(W.correction(11000, 10000, true), { kind: 'rate', rate: 0.97 });
    assert.deepEqual(W.correction(9000, 10000, true), { kind: 'rate', rate: 1.03 });
    assert.deepEqual(W.correction(13000, 10000, true), { kind: 'rate', rate: 0.97 });
    assert.deepEqual(W.correction(13001, 10000, true), { kind: 'seek', to: 10000 });
    // Tizen's AVPlay: no smooth speed change, so small drift waits until it's worth a jump.
    assert.deepEqual(W.correction(11000, 10000, false), { kind: 'none' });
    assert.deepEqual(W.correction(5000, 10000, false), { kind: 'seek', to: 10000 });
    assert.equal(W.keepNudging(10300, 10000, true), true);
    assert.equal(W.keepNudging(10050, 10000, true), false);
    assert.equal(W.keepNudging(10300, 10000, false), false);
  });

  await test('heartbeats: buffering is never ready', () => {
    assert.deepEqual(W.heartbeatBody(3, { positionMS: 1234.6, state: 'waiting', ready: true }), { generation: 3, position_ms: 1235, state: 'waiting', ready: false });
    assert.deepEqual(W.heartbeatBody(3, { positionMS: -5, state: 'paused', ready: true }), { generation: 3, position_ms: 0, state: 'paused', ready: true });
  });

  await test('who the room waits for, and for how long', () => {
    const r = room({ state: 'waiting', wait_until_ms: 20000, participants: [
      { id: 'a', name: 'Jo', available: true, ready: false, state: 'waiting' },
      { id: 'b', name: 'Sam', available: true, ready: false, state: 'waiting' },
      { id: 'c', name: 'Kid', available: false, ready: false, state: 'paused' },
      { id: 'd', name: 'Al', available: true, ready: true, state: 'paused' },
    ] });
    assert.deepEqual(W.waitingFor(r), ['Sam']);
    assert.equal(W.waitSeconds(r, 12100), 8);
    assert.equal(W.waitSeconds(r, 25000), 0);
    assert.equal(W.waitSeconds(room(), 0), 0);
  });

  await test('notes only for other people', () => {
    const before = room();
    assert.equal(W.noticeFor(null, before), null);
    assert.equal(W.noticeFor(before, room({ revision: 2, state: 'playing', changed_by: 'a' })), null);
    assert.deepEqual(W.noticeFor(before, room({ revision: 2, state: 'playing', changed_by: 'b' })), { kind: 'played', name: 'Sam' });
    assert.deepEqual(W.noticeFor(room({ state: 'playing' }), room({ revision: 2, state: 'paused', changed_by: 'b' })), { kind: 'paused', name: 'Sam' });
    assert.deepEqual(W.noticeFor(before, room({ revision: 2, generation: 2, changed_by: 'b' })), { kind: 'moved', name: 'Sam' });
    assert.equal(W.noticeFor(before, room({ revision: 1, state: 'playing', changed_by: 'b' })), null, 'same revision: a snapshot');
    // Host handoff.
    const handed = room({ revision: 3, host_id: 'b', self_id: 'a' });
    assert.deepEqual(W.noticeFor(room({ self_id: 'a' }), handed), { kind: 'host', you: false, name: 'Sam' });
    assert.deepEqual(W.noticeFor(room({ host_id: 'b' }), room({ revision: 2, host_id: 'a' })), { kind: 'host', you: true, name: 'Jo' });
  });

  await test('lobby, status, hosting and following', () => {
    assert.equal(W.startedOnce(room()), false);
    assert.equal(W.startedOnce(room({ state: 'playing' })), true);
    assert.equal(W.startedOnce(room({ position_ms: 1000 })), true);
    assert.equal(W.statusOf({ available: false, ready: true, state: 'playing' }), 'unavailable');
    assert.equal(W.statusOf({ available: true, ready: true, state: 'playing' }), 'watching');
    assert.equal(W.statusOf({ available: true, ready: true, state: 'paused' }), 'ready');
    assert.equal(W.statusOf({ available: true, ready: false, state: 'waiting' }), 'loading');
    assert.equal(W.hosting(room()), true);
    assert.equal(W.hosting(room({ self_id: 'b' })), false);
    assert.equal(W.hostName(room({ self_id: 'b' })), 'Jo');
    assert.equal(W.hostName(room({ host_id: 'zz', host_name: 'Pat' })), 'Pat');
    assert.equal(W.following(room(), 'm1'), 'follow');
    assert.equal(W.following(room({ item_id: 'm2' }), 'm1'), 'elsewhere');
    assert.equal(W.following(room({ available: false, item_id: undefined, item: undefined }), 'm1'), 'unavailable');
  });

  await test('409: retry only what is still wanted', () => {
    assert.equal(W.retryAfterConflict('play', 1, room({ state: 'paused' })), true);
    assert.equal(W.retryAfterConflict('play', 1, room({ state: 'playing' })), false);
    assert.equal(W.retryAfterConflict('pause', 1, room({ state: 'waiting' })), true);
    assert.equal(W.retryAfterConflict('pause', 1, room({ state: 'paused' })), false);
    assert.equal(W.retryAfterConflict('seek', 1, room({ generation: 1 })), true);
    assert.equal(W.retryAfterConflict('seek', 1, room({ generation: 2 })), false, "someone else's seek wins");
    assert.equal(W.retryAfterConflict('change_item', 4, room({ generation: 5 })), false);
    assert.equal(W.retryAfterConflict('end', 1, room()), true);
    assert.equal(W.retryAfterConflict('end', 1, room({ state: 'ended' })), false);
    assert.equal(W.newer(room({ revision: 5 }), room({ revision: 4 })), false);
    assert.equal(W.newer(room({ revision: 5 }), room({ revision: 5 })), true);
    assert.equal(W.newer(room({ revision: 5 }), room({ id: 'other', revision: 1 })), true);
  });

  await test('reconnect backoff', () => {
    assert.equal(W.nextBackoff(2000), 4000);
    assert.equal(W.nextBackoff(20000), 30000);
    assert.equal(W.nextBackoff(0), 2000);
    assert.equal(W.retryDelay(4000, 429, '7'), 7000);
    assert.equal(W.retryDelay(4000, 429, 'soon'), 4000);
    assert.equal(W.retryDelay(4000, 429, '9999'), 4000);
    assert.equal(W.retryDelay(4000, 0, '7'), 4000);
  });

  // --- The session, against stand-ins ---

  class Refusal extends Error { constructor(status, body) { super(`HTTP ${status}`); this.status = status; this.body = body; } }
  class FakeXHR {
    constructor() { this.readyState = 0; this.status = 0; this.responseText = ''; this.aborted = false; this.headers = {}; }
    send() { this.sent = true; }
    abort() { this.aborted = true; }
    getResponseHeader(k) { return this.headers[k] ?? null; }
    accept() { this.status = 200; this.readyState = 3; this.onreadystatechange?.(); }
    push(text) { this.responseText += text; this.onprogress?.(); }
    finish(status = this.status) { this.status = status; this.readyState = 4; this.onreadystatechange?.(); }
  }
  const tick = () => new Promise((r) => setTimeout(r, 0));
  function harness(first = room(), answers = {}) {
    const calls = [];
    const streams = [];
    const logs = [];
    const events = { rooms: [], ends: [], conn: [] };
    const deps = {
      async call(method, path, body) {
        calls.push({ method, path, body });
        const a = answers[`${method} ${path.replace(/\?.*$/, '')}`];
        const v = typeof a === 'function' ? a(body, calls) : a;
        if (v instanceof Refusal) throw v;
        if (v === undefined && path.startsWith('/time')) return { server_received_ms: Date.now(), server_sent_ms: Date.now() };
        return v;
      },
      openStream() { const x = new FakeXHR(); streams.push(x); return x; },
      log: (level, message) => logs.push(message),
    };
    const s = new RoomSession(first, deps, (r) => events.rooms.push(r), (why) => events.ends.push(why), (c) => events.conn.push(c));
    return { s, calls, streams, logs, events };
  }

  await test('the lobby: a room this TV made stays fresh until it plays, even part-way through', () => {
    const deps = { call: async () => ({}), openStream: () => new FakeXHR(), log: () => {} };
    const made = new RoomSession(room({ position_ms: 61000 }), deps, () => {}, () => {}, () => {}, true);
    assert.equal(made.started, false);
    made.adopt(room({ revision: 2, position_ms: 61000 }));
    assert.equal(made.started, false);
    made.adopt(room({ revision: 3, state: 'waiting', position_ms: 61000 }));
    assert.equal(made.started, true);
    made.adopt(room({ revision: 4, state: 'paused', position_ms: 64000 }));
    assert.equal(made.started, true);
    // Joined part-way (paused later on): it has played; joined at the start: the lobby.
    assert.equal(new RoomSession(room({ position_ms: 61000 }), deps, () => {}, () => {}).started, true);
    assert.equal(new RoomSession(room(), deps, () => {}, () => {}).started, false);
    // Arc's own flag wins where it's sent: joined at 1:01 before anyone pressed Play.
    assert.equal(new RoomSession(room({ position_ms: 61000, started: false }), deps, () => {}, () => {}).started, false);
    assert.equal(W.startedOnce(room({ position_ms: 61000, started: false })), false);
    assert.equal(W.startedOnce(room({ started: true })), true);
    const joined = new RoomSession(room({ position_ms: 61000, started: false }), deps, () => {}, () => {});
    joined.adopt(room({ revision: 2, position_ms: 61000, started: true }));
    assert.equal(joined.started, true);
  });

  await test('a 409 adopts the newer room and sends a still-wanted command once', async () => {
    const newerRoom = room({ revision: 7, state: 'paused' });
    let n = 0;
    const h = harness(room(), { 'POST /r1/commands': (body) => (n++ === 0 ? new Refusal(409, { error: 'room changed', room: newerRoom }) : room({ revision: 8, state: 'playing' })) });
    await h.s.play();
    const sent = h.calls.filter((c) => c.path === '/r1/commands');
    assert.equal(sent.length, 2);
    assert.equal(sent[0].body.revision, 1);
    assert.equal(sent[1].body.revision, 7);
    assert.equal(h.s.room.revision, 8);
    assert.equal(h.logs.filter((l) => /409/.test(l)).length, 1);
  });

  await test("a 409 after someone else's seek drops this seek", async () => {
    const moved = room({ revision: 4, generation: 2, position_ms: 60000 });
    const h = harness(room(), { 'POST /r1/commands': new Refusal(409, { error: 'room changed', room: moved }) });
    await h.s.seek(30000);
    assert.equal(h.calls.filter((c) => c.path === '/r1/commands').length, 1);
    assert.equal(h.s.room.generation, 2);
    assert.equal(h.s.room.position_ms, 60000);
  });

  await test('older rooms are ignored; an ended room ends the session once', async () => {
    const h = harness(room({ revision: 5 }));
    h.s.adopt(room({ revision: 4, state: 'playing' }));
    assert.equal(h.s.room.revision, 5);
    assert.equal(h.events.rooms.length, 0);
    h.s.adopt(room({ revision: 6, state: 'ended' }));
    h.s.adopt(room({ revision: 7, state: 'ended' }));
    assert.deepEqual(h.events.ends, ['ended']);
    assert.equal(h.s.active, false);
  });

  await test('a 404 on a command ends the session as gone', async () => {
    const h = harness(room(), { 'POST /r1/commands': new Refusal(404) });
    await assert.rejects(h.s.pause());
    assert.deepEqual(h.events.ends, ['gone']);
  });

  await test('heartbeats carry the generation; a 409 adopts quietly', async () => {
    const h = harness(room({ generation: 3 }), { 'POST /r1/heartbeat': new Refusal(409, { room: room({ revision: 2, generation: 4 }) }) });
    h.s.setReporter(() => ({ positionMS: 5000, state: 'waiting', ready: true }));
    h.s.reportNow();
    await tick();
    const beat = h.calls.find((c) => c.path === '/r1/heartbeat');
    assert.deepEqual(beat.body, { generation: 3, position_ms: 5000, state: 'waiting', ready: false });
    assert.equal(h.s.room.generation, 4);
    assert.equal(h.logs.length, 0);
  });

  await test('the stream: rooms from SSE frames, split across reads', async () => {
    const h = harness();
    h.s.start();
    const x = h.streams[0];
    assert.ok(x.sent);
    x.accept();
    assert.deepEqual(h.events.conn, [true]);
    const frame = `id: 2\nevent: room\ndata: ${JSON.stringify(room({ revision: 2, state: 'playing' }))}\n\n`;
    x.push(frame.slice(0, 20));
    assert.equal(h.s.room.revision, 1);
    x.push(frame.slice(20));
    assert.equal(h.s.room.revision, 2);
    assert.equal(h.s.room.state, 'playing');
    h.s.stop();
    assert.ok(x.aborted);
  });

  await test('a dropped stream rechecks /current, then reconnects with backoff; logged once', async () => {
    const h = harness(room(), { 'GET /current': room({ revision: 3 }) });
    h.s.start();
    h.streams[0].accept();
    h.streams[0].finish(200);
    await tick();
    assert.ok(h.calls.some((c) => c.path === '/current'));
    assert.equal(h.s.room.revision, 3);
    assert.equal(h.streams.length, 1, 'waits before reconnecting');
    h.s.wake(); // the TV came back: reconnect now
    assert.equal(h.streams.length, 2);
    h.streams[1].finish(502);
    await tick();
    assert.equal(h.logs.filter((l) => /dropped/.test(l)).length, 1);
    h.s.stop();
  });

  await test('a dropped stream whose room is gone (404 /current) ends as gone', async () => {
    const h = harness(room(), { 'GET /current': new Refusal(404) });
    h.s.start();
    h.streams[0].accept();
    h.streams[0].finish(200);
    await tick();
    assert.deepEqual(h.events.ends, ['gone']);
  });

  await test('a stream 404 is gone; 401 is signed out', async () => {
    const a = harness();
    a.s.start();
    a.streams[0].finish(404);
    assert.deepEqual(a.events.ends, ['gone']);
    const b = harness();
    b.s.start();
    b.streams[0].finish(401);
    assert.deepEqual(b.events.ends, ['signedOut']);
  });

  await test('a 429 waits for Retry-After', async () => {
    const h = harness(room(), { 'GET /current': room() });
    h.s.start();
    const x = h.streams[0];
    x.headers['Retry-After'] = '1';
    x.finish(429);
    await tick();
    assert.equal(h.streams.length, 1);
    await new Promise((r) => setTimeout(r, 1100));
    assert.equal(h.streams.length, 2);
    h.s.stop();
  });

  await test('a new code adopts a 409 room and asks again', async () => {
    let n = 0;
    const h = harness(room({ revision: 2 }), { 'POST /r1/invite': (body) => (n++ === 0 ? new Refusal(409, { room: room({ revision: 5 }) }) : { room: room({ revision: 6 }), invite_code: 'ABCD2345', invite_expires_at_ms: 1 }) });
    const inv = await h.s.renew();
    assert.equal(inv.invite_code, 'ABCD2345');
    assert.deepEqual(h.calls.filter((c) => c.path === '/r1/invite').map((c) => c.body.revision), [2, 5]);
    assert.equal(h.s.room.revision, 6);
  });

  await test('clock sync uses /time with the send time', async () => {
    const h = harness(room(), { 'GET /time': () => ({ server_received_ms: Date.now() + 10000, server_sent_ms: Date.now() + 10000 }) });
    h.s.wake();
    await tick(); await tick(); await tick(); await tick();
    assert.ok(h.calls.some((c) => /^\/time\?client_sent_ms=\d+$/.test(c.path)));
    assert.ok(Math.abs(h.s.serverNow() - Date.now() - 10000) < 200);
    h.s.stop();
  });

  await test('invitations: who can be chosen', () => {
    const jo = { id: 'a', name: 'Jo', friend: false, can_watch: true };
    const kim = { id: 'k', name: 'Kim', friend: true, can_watch: true };
    const lee = { id: 'l', name: 'Lee', friend: true, can_watch: false };
    assert.equal(W.personDetail(jo), 'household');
    assert.equal(W.personDetail(kim), 'friend');
    assert.equal(W.personDetail(lee), 'cantWatch');
    let chosen = W.toggleChosen([], kim);
    assert.deepEqual(chosen, ['k']);
    chosen = W.toggleChosen(chosen, lee); // can't watch: never chosen
    assert.deepEqual(chosen, ['k']);
    chosen = W.toggleChosen(W.toggleChosen(chosen, jo), kim);
    assert.deepEqual(chosen, ['a']);
    // Inviting more from inside a room: those in it, or invited by name already, aren't offered.
    // Participants' ids are memberships, not profiles: Jo is in the room under another id.
    const r = room({ participants: [{ id: 'm9', name: 'Jo', available: true, ready: true, state: 'paused' }], invited: [{ name: 'Kim' }] });
    assert.deepEqual(W.offerable([jo, kim, lee], r).map((p) => p.id), ['l']);
    assert.equal(W.offerable([jo, kim], null).length, 2);
  });

  await test('invitations: a listed room\'s actions', () => {
    const listed = (o) => ({ id: 'r', state: 'paused', position_ms: 0, created_at_ms: 0, host_name: 'Jo', hosting: false, joined: false, item: { id: 'm1', title: 'Film', kind: 'movie' }, participants: [], invited: ['Sam'], ...o });
    assert.deepEqual(W.roomActions(listed({})), { main: 'join', other: 'decline' });
    assert.deepEqual(W.roomActions(listed({ hosting: true })), { main: 'join', other: 'cancel' });
    assert.deepEqual(W.roomActions(listed({ joined: true, hosting: true })), { main: 'return', other: 'cancel' });
    assert.deepEqual(W.roomPeople(listed({ participants: ['Jo'] })), { here: ['Jo'], invited: ['Sam'] });
    assert.deepEqual(W.roomPeople(listed({ participants: undefined, invited: undefined })), { here: [], invited: [] });
  });

  console.log(`watch together: ${passed} tests passed`);
} finally {
  rmSync(compiled, { recursive: true, force: true });
}
process.exit(0);
