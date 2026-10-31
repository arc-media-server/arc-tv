// Checks the TV bundles only use JavaScript that 2019–2020 TVs (Chrome 68) understand: it must
// parse as ES2019 (Chrome 66+ syntax; built-ins come from core-js), and must be a classic script (TVs load packaged apps from file://).
import { readFileSync, existsSync } from 'node:fs';
import { parse } from 'acorn';

let failed = false;
for (const platform of ['webos', 'tizen']) {
  const js = `dist/${platform}/app.js`;
  const html = `dist/${platform}/index.html`;
  if (!existsSync(js)) {
    console.error(`${js} is missing: run npm run build:${platform}`);
    failed = true;
    continue;
  }
  try {
    parse(readFileSync(js, 'utf8'), { ecmaVersion: 2019, sourceType: 'script' });
    console.log(`${js}: parses as ES2019`);
  } catch (e) {
    console.error(`${js}: not ES2019 (${e.message})`);
    failed = true;
  }
  if (/type="module"/.test(readFileSync(html, 'utf8'))) {
    console.error(`${html}: loads a module script, which file:// refuses`);
    failed = true;
  }
}
process.exit(failed ? 1 : 0);
