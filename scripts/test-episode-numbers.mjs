// Episode numbers as every Arc app writes them (AGENT-RULES "Episode numbers"): "S1 · E4", "Special 3",
// and "S1 · E4 · Pilot" where the episode is the subject. No network, no TV.
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, readdirSync, readFileSync, copyFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const compiled = mkdtempSync(join(tmpdir(), 'arc-episode-numbers-test-'));
let passed = 0;
const test = (name, fn) => {
  try { fn(); passed++; } catch (e) { console.error(`FAIL ${name}`); throw e; }
};
try {
  execFileSync('node', ['node_modules/typescript/bin/tsc', '--ignoreConfig', 'src/lib/format.ts', '--outDir', compiled,
    '--rootDir', 'src', '--target', 'ES2020', '--module', 'ES2020', '--moduleResolution', 'bundler', '--resolveJsonModule',
    '--skipLibCheck', '--lib', 'ES2020,DOM'], { stdio: 'inherit' });
  writeFileSync(join(compiled, 'package.json'), '{"type":"module"}');
  mkdirSync(join(compiled, 'locales'), { recursive: true });
  copyFileSync('src/locales/en.json', join(compiled, 'locales', 'en.json'));
  // The app's imports leave out ".js" (Vite resolves them) and import JSON plainly; Node needs both spelled out.
  const fix = (dir) => {
    for (const f of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, f.name);
      if (f.isDirectory()) fix(p);
      else if (f.name.endsWith('.js')) {
        writeFileSync(p, readFileSync(p, 'utf8')
          .replace(/from '(\.\.?\/[^']+\.json)';/g, "from '$1' with { type: 'json' };")
          .replace(/from '(\.\.?\/[^']+?)(?<!\.json)'/g, "from '$1.js'"));
      }
    }
  };
  fix(compiled);
  const F = await import(pathToFileURL(join(compiled, 'lib', 'format.js')));
  const ep = (season_number, episode_number, title = 'Pilot') => ({ id: 'e', kind: 'episode', title, season_number, episode_number });

  test('S1 · E4: no leading zeros, a middle dot with a space either side', () => {
    assert.equal(F.episodeCode(ep(1, 4)), 'S1 · E4');
    assert.equal(F.episodeCode(ep(10, 12)), 'S10 · E12');
  });
  test('a special is "Special 3"; a season without an episode number is named', () => {
    assert.equal(F.episodeCode(ep(0, 3)), 'Special 3');
    assert.equal(F.episodeCode(ep(2, undefined)), 'Season 2');
    assert.equal(F.episodeCode(ep(0, undefined)), 'Specials');
  });
  test('no number when Arc gives none, or the episode is outside the order (0 and 0)', () => {
    assert.equal(F.episodeCode(ep(undefined, undefined)), '');
    assert.equal(F.episodeCode(ep(0, 0)), '');
  });
  test('where the episode is the subject, its title follows', () => {
    assert.equal(F.episodeHeading(ep(1, 4)), 'S1 · E4 · Pilot');
    assert.equal(F.episodeHeading(ep(0, 3, 'Minisode')), 'Special 3 · Minisode');
    assert.equal(F.episodeHeading(ep(1, undefined)), 'Pilot');
    assert.equal(F.episodeHeading(ep(0, 0)), 'Pilot');
  });
  test('the details line uses the same number', () => {
    assert.equal(F.detailsLine({ ...ep(1, 4), year: 2008 }), 'S1 · E4 · 2008');
    assert.equal(F.detailsLine({ ...ep(undefined, undefined), year: 2008 }), '2008');
  });
  test('the catalogue has no other episode format', () => {
    const en = JSON.parse(readFileSync('src/locales/en.json', 'utf8'));
    for (const [k, v] of Object.entries(en)) {
      assert.ok(!/[•]|S\{\{[^}]+\}\}\s*[-,x]|\bE\{\{[^}]+\}\}\s*[-,]|Episode \{\{/.test(v), `${k}: ${v}`);
    }
  });
  console.log(`episode numbers: ${passed} passed`);
} finally {
  rmSync(compiled, { recursive: true, force: true });
}
