// Remakes the TV packages' icons and splash from Arc's logo files (arc-media-server docs/brand,
// copied unchanged into src/assets/brand). Run after the brand files change:
//
//   node scripts/make-logos.mjs
//
// The SVGs are drawn by Chromium (Playwright's, which this needs installed: `npm i -D playwright`
// or a global install), as they are: nothing is redrawn or restyled.
//
//   platforms/webos/icon.png       80x80     arc-icon-square.svg
//   platforms/webos/largeIcon.png  130x130   arc-icon-square.svg
//   platforms/tizen/icon.png       512x512   arc-icon-square.svg
//   platforms/webos/splash.png     1920x1080 arc-logo-stacked-white.svg, 320 px tall, centred on
//                                            #0b0d12 (appinfo.json's bgColor)

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const BRAND = 'src/assets/brand';
const BG = '#0b0d12';
/** The stacked logo's height on the splash, and on the app's own loading screen (styles.css). */
const SPLASH_LOGO = 320;

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  console.error('make-logos: needs Playwright (npm i -D playwright, then npx playwright install chromium)');
  process.exit(1);
}

const svg = (name) => readFileSync(`${BRAND}/${name}`, 'utf8');
const page = (body, bg) =>
  `<!doctype html><html><head><style>html,body{margin:0;padding:0;background:${bg};overflow:hidden}` +
  `svg{display:block}</style></head><body>${body}</body></html>`;

/** The square icon, scaled to fill the whole `size`. */
function icon(size) {
  return page(svg('arc-icon-square.svg').replace('<svg ', `<svg width="${size}" height="${size}" `), '#000');
}

/** The stacked logo centred on the app's background. */
function splash(w, h) {
  // The stacked logo's viewBox is 65.42 x 69.16.
  const lw = (SPLASH_LOGO * 65.42) / 69.16;
  const logo = svg('arc-logo-stacked-white.svg').replace('<svg ', `<svg width="${lw}" height="${SPLASH_LOGO}" `);
  return page(`<div style="width:${w}px;height:${h}px;display:flex;align-items:center;justify-content:center">${logo}</div>`, BG);
}

const jobs = [
  { out: 'platforms/webos/icon.png', w: 80, h: 80, html: icon(80) },
  { out: 'platforms/webos/largeIcon.png', w: 130, h: 130, html: icon(130) },
  { out: 'platforms/tizen/icon.png', w: 512, h: 512, html: icon(512) },
  { out: 'platforms/webos/splash.png', w: 1920, h: 1080, html: splash(1920, 1080) },
];

const browser = await chromium.launch();
try {
  for (const job of jobs) {
    const p = await browser.newPage({ viewport: { width: job.w, height: job.h }, deviceScaleFactor: 1 });
    await p.setContent(job.html);
    await p.screenshot({ path: job.out, omitBackground: false });
    await p.close();
    console.log(`make-logos: ${job.out} (${job.w}x${job.h})`);
  }
} finally {
  await browser.close();
}
