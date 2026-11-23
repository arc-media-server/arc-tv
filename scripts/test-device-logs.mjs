import assert from 'node:assert/strict';

const values = new Map();
globalThis.localStorage = {
  getItem: key => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, value),
};
const secret = 'https://private.test/cast?token=secret-fixture&pin=1234';
const event = { time_ms: Date.now(), level: 'warn', event: 'request_failed', authorization: secret };
values.set('arc.deviceLogs', JSON.stringify({ entries: [event, { ...event, event: secret }] }));
const logs = await import('../src/lib/device-logs.ts');
logs.recordDeviceEvent('debug', 'playback_requested');
assert.equal(logs.deviceLogPayload().entries.length, 1);
assert.equal(JSON.stringify(logs.deviceLogPayload()).includes('secret-fixture'), false);
logs.setDetailedLogging(true);
logs.recordDeviceEvent('debug', 'playback_requested');
assert.equal(logs.deviceLogPayload().entries.at(-1).event, 'playback_requested');
logs.clearDeviceLogs();
assert.deepEqual(logs.deviceLogPayload().entries, []);
