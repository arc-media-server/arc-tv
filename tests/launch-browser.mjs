// Optional focused browser check. Pass a local npm run dev URL and the Playwright package path.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium, expect } = require(process.env.ARC_PLAYWRIGHT_PACKAGE || '@playwright/test');
const origin = process.env.ARC_TV_PREVIEW || 'http://127.0.0.1:15192';
assert.match(origin, /^http:\/\/127\.0\.0\.1:\d+$/);
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const alex = { id: 'a', name: 'Alex', color: 'violet', has_pin: false, is_admin: true };
const jordan = { id: 'b', name: 'Jordan', color: 'amber', has_pin: false, is_admin: false };
let current = alex;
let profiles = [alex, jordan];
let signedIn = true;
const transitions = [];
const pageErrors = [];
context.on('page', (p) => p.on('pageerror', (e) => pageErrors.push(e.message)));
await context.addInitScript(() => {
  if (location.hostname !== '127.0.0.1') return;
  if (localStorage.getItem('launch.fixtureReady')) return;
  localStorage.setItem('launch.fixtureReady', '1');
  localStorage.setItem('arc.server', JSON.stringify({ url: location.origin, name: 'Fixture Arc', id: 'fixture' }));
  localStorage.setItem('arc.token', 'fixture-token');
});
await context.route('**/api/v1/**', async (route) => {
  const request = route.request();
  const path = new URL(request.url()).pathname.replace('/api/v1', '');
  if (path === '/auth/status') return route.fulfill({ json: { signed_in: signedIn, profile: current, profiles } });
  if (path === '/auth/profile') {
    assert.equal(request.headers().authorization, 'Bearer fixture-token');
    if (request.method() === 'DELETE') {
      transitions.push('leave');
      current = null;
      return route.fulfill({ status: 204 });
    }
    const { id, pin } = request.postDataJSON();
    transitions.push('choose:' + id);
    const profile = profiles.find((p) => p.id === id);
    if (!profile) return route.fulfill({ status: 404, json: { error: 'Profile missing' } });
    if (profile.has_pin && pin !== '1111') return route.fulfill({ status: 401, json: { needs: 'pin' } });
    current = profile;
    return route.fulfill({ json: profile });
  }
  if (path === '/auth/logout') {
    signedIn = false;
    return route.fulfill({ status: 204 });
  }
  if (path === '/events') return route.fulfill({ status: 200, contentType: 'text/event-stream', body: ': fixture\n\n' });
  if (path === '/watchlist') return route.fulfill({ json: [{ id: 'movie', kind: 'movie', title: 'Dune: Part Two' }] });
  const objects = ['/me/prefs', '/capabilities', '/identity', '/auth/link/start'];
  return route.fulfill({ json: objects.includes(path) ? {} : [] });
});

async function open() {
  const page = await context.newPage();
  page.setDefaultTimeout(6000);
  await page.goto(origin);
  return page;
}
async function press(page, locator) {
  await locator.focus();
  await page.keyboard.press('Enter');
}
const picker = (page) => page.getByRole('heading', { name: "Who's watching?" });
const browse = (page) => page.locator('.side-item').filter({ hasText: /^Settings$/ });
async function settings(page) {
  await press(page, browse(page));
  const toggle = page.getByRole('switch', { name: 'Sign in automatically' });
  await expect(toggle).toBeVisible();
  const lastSubtitle = page.locator('.settings-row').filter({ has: page.getByText('Position', { exact: true }) });
  await lastSubtitle.focus();
  await page.keyboard.press('ArrowDown');
  await expect(toggle).toBeFocused();
  await expect(toggle).toBeInViewport({ ratio: 0.9 });
  return toggle;
}
async function capture(page, name) {
  if (!process.env.ARC_SCREENSHOTS) return;
  mkdirSync(process.env.ARC_SCREENSHOTS, { recursive: true });
  await page.screenshot({ path: process.env.ARC_SCREENSHOTS + '/' + name + '.jpg', quality: 82 });
}

try {
  let page = await open();
  await expect(picker(page)).toBeVisible();
  assert.deepEqual(transitions, ['leave']);
  assert.equal(await page.evaluate(() => localStorage.getItem('arc.token')), 'fixture-token');
  await capture(page, 'picker');

  await press(page, page.locator('.profile').filter({ hasText: 'Jordan' }).locator('.profile-ring'));
  await expect(browse(page)).toBeVisible();
  await page.reload();
  await expect(browse(page)).toBeVisible();
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  assert.deepEqual(transitions, ['leave', 'choose:b']);

  let toggle = await settings(page);
  await press(page, toggle);
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await capture(page, 'automatic-sign-in');
  await page.close();

  current = alex;
  page = await open();
  await expect(browse(page)).toBeVisible();
  assert.deepEqual(transitions, ['leave', 'choose:b', 'choose:b']);
  await page.close();

  profiles = [alex, { ...jordan, has_pin: true }];
  current = profiles[1];
  page = await open();
  await expect(picker(page)).toBeVisible();
  assert.equal(transitions.at(-1), 'leave');
  await press(page, page.locator('.profile').filter({ hasText: 'Jordan' }).locator('.profile-ring'));
  await expect(page.getByRole('heading', { name: /PIN/ })).toBeVisible();
  for (let i = 0; i < 4; i++) await press(page, page.getByRole('button', { name: '1', exact: true }));
  toggle = await settings(page);
  await expect(toggle).toHaveAttribute('aria-disabled', 'true');
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await press(page, toggle);
  assert.equal(await page.evaluate(() => localStorage.getItem('arc.autoProfile')), 'b');
  await capture(page, 'pin-setting');
  await page.close();

  profiles = [alex];
  current = alex;
  page = await open();
  await expect(picker(page)).toBeVisible(); // deleted automatic profile takes precedence over singleton shortcut
  await press(page, page.getByRole('button', { name: 'Sign Out', exact: true }));
  await expect.poll(() => page.evaluate(() => localStorage.getItem('arc.autoProfile'))).toBeNull();

  signedIn = true;
  current = alex;
  await page.evaluate(() => localStorage.setItem('arc.token', 'fixture-token'));
  await page.close();
  page = await open();
  await expect(browse(page)).toBeVisible();
  assert.deepEqual(pageErrors, []);
  console.log('Passed: fresh picker, reload/resume, automatic switch, PIN, deleted profile, sign-out and singleton.');
} finally {
  await browser.close();
}
