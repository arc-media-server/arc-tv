// Subtitle timing: steps and limits, reset, per file and track, which tracks can move, how the
// value reads, and which cue shows once moved (Android's SubtitleTimingTest). No network, no TV.
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const compiled = mkdtempSync(join(tmpdir(), 'arc-subtitle-timing-test-'));
let passed = 0;
const test = (name, fn) => {
  try { fn(); passed++; } catch (e) { console.error(`FAIL ${name}`); throw e; }
};
try {
  execFileSync('node', ['node_modules/typescript/bin/tsc', '--ignoreConfig', 'src/lib/subtitle-timing.ts', 'src/lib/cues.ts',
    '--outDir', compiled, '--target', 'ES2020', '--module', 'ES2020', '--skipLibCheck', '--lib', 'ES2020,DOM'], { stdio: 'inherit' });
  writeFileSync(join(compiled, 'package.json'), '{"type":"module"}');
  // The app's imports leave out ".js" (Vite resolves them); Node needs it.
  const fix = (dir) => {
    for (const f of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, f.name);
      if (f.isDirectory()) fix(p);
      else if (f.name.endsWith('.js')) writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.\.?\/[^']+)'/g, "from '$1.js'"));
    }
  };
  fix(compiled);
  const libDir = readdirSync(compiled).includes('subtitle-timing.js') ? compiled : join(compiled, 'lib');
  const T = await import(pathToFileURL(join(libDir, 'subtitle-timing.js')));
  const S = await import(pathToFileURL(join(libDir, 'cues.js')));

  test('steps of half a second, up to ten seconds either way', () => {
    assert.equal(T.STEP_MS, 500);
    assert.equal(T.shifted(0, T.STEP_MS), 500);
    assert.equal(T.shifted(-500, -500), -1000);
    assert.equal(T.shifted(10_000, 500), 10_000);
    assert.equal(T.shifted(-9_800, -500), -10_000);
    let v = 0;
    for (let i = 0; i < 30; i++) v = T.shifted(v, 500);
    assert.equal(v, 10_000);
  });
  test('reset goes back to zero', () => {
    assert.equal(T.shifted(3_500, null), 0);
    assert.equal(T.shifted(-10_000, null), 0);
  });
  test('later shows earlier cues at a point in the file', () => {
    assert.equal(T.cueTime(61_500, 1_500), 60_000);
    assert.equal(T.cueTime(61_500, -500), 62_000);
  });
  test('timing is kept per file and track, none without text subtitles', () => {
    const offsets = { [T.timingKey(7, 's1')]: 1_500 };
    assert.equal(T.offsetFor(offsets, 7, { id: 's1' }), 1_500);
    assert.equal(T.offsetFor(offsets, 7, { id: 's2' }), 0);
    assert.equal(T.offsetFor(offsets, 8, { id: 's1' }), 0);
    assert.equal(T.offsetFor(offsets, 7, null), 0);
    assert.equal(T.offsetFor(offsets, undefined, { id: 's1' }), 0);
    assert.equal(T.offsetFor({ [T.timingKey(7, 'p1')]: 500 }, 7, { id: 'p1', image: true }), 0);
  });
  test('only text subtitles can move (ASS/SSA too: the app draws them from WebVTT)', () => {
    assert.equal(T.adjustable({ id: 'a', codec: 'subrip' }), true);
    assert.equal(T.adjustable({ id: 'a', codec: 'ass' }), true);
    assert.equal(T.adjustable({ id: 'a', codec: 'hdmv_pgs_subtitle', image: true }), false);
    assert.equal(T.adjustable(null), false);
  });
  test('values read +1.5s / −0.5s / 0.0s (arc-media-server#479)', () => {
    assert.equal(T.timingSeconds(1_500), '+1.5');
    assert.equal(T.timingSeconds(-500), '−0.5');
    assert.equal(T.timingSeconds(0), '0.0');
    assert.equal(T.timingSeconds(-10_000), '−10.0');
    assert.deepEqual([1, -1, 0].map(T.timingWay), ['later', 'earlier', 'zero']);
  });
  test('the moved lookup shows the right cue', () => {
    const cues = S.parseVTT('WEBVTT\n\n00:00:10.000 --> 00:00:12.000\nOne\n\n00:00:13.000 --> 00:00:15.000\nTwo\n');
    const at = (pos, off) => S.activeCues(cues, T.cueTime(pos, off)).map((c) => c.text.trim());
    assert.deepEqual(at(10_500, 0), ['One']);
    // Later by 1.5s: "One" now shows from 11.5s to 13.5s.
    assert.deepEqual(at(10_500, 1_500), []);
    assert.deepEqual(at(12_000, 1_500), ['One']);
    assert.deepEqual(at(13_400, 1_500), ['One']);
    // Earlier by 1s: "Two" now shows from 12s.
    assert.deepEqual(at(12_200, -1_000), ['Two']);
    assert.deepEqual(at(10_500, -1_000), ['One']);
  });
  console.log(`subtitle timing: ${passed} tests passed`);
} finally {
  rmSync(compiled, { recursive: true, force: true });
}
