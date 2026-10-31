// Makes out/webos/*.ipk with LG's webOS CLI (`npm i -g @webos-tools/cli`), which provides
// ares-package. Without it, the staged app folder is left for packaging by hand.
import { spawnSync } from 'node:child_process';
import { stage } from './stage.mjs';

const dir = stage('webos');
const run = spawnSync('ares-package', [dir, '-o', 'out/webos', '--no-minify'], { stdio: 'inherit', shell: process.platform === 'win32' });
if (run.error || run.status !== 0) {
  console.error(`\nares-package didn't run. Install LG's CLI with: npm i -g @webos-tools/cli\nThe app is staged in ${dir}.`);
  process.exit(1);
}
console.log('\nInstall on a TV in Developer Mode: ares-install -d <tv> out/webos/org.arcmediaserver.tv_0.1.0_all.ipk');
