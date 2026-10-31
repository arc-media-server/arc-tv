// Makes out/tizen/Arc.wgt with the Tizen Studio CLI (`tizen`), signed with the certificate
// profile named by TIZEN_PROFILE (made in Tizen Studio's Certificate Manager; never in git).
import { spawnSync } from 'node:child_process';
import { stage } from './stage.mjs';

const dir = stage('tizen');
const profile = process.env.TIZEN_PROFILE;
if (!profile) {
  console.error(`Set TIZEN_PROFILE to your Samsung certificate profile's name. The app is staged in ${dir}.`);
  process.exit(1);
}
const run = spawnSync('tizen', ['package', '-t', 'wgt', '-s', profile, '-o', 'out/tizen', '--', dir], { stdio: 'inherit', shell: process.platform === 'win32' });
if (run.error || run.status !== 0) {
  console.error(`\nThe tizen CLI didn't run. It comes with Tizen Studio (tools/ide/bin). The app is staged in ${dir}.`);
  process.exit(1);
}
console.log('\nInstall on a TV in Developer Mode: tizen install -n out/tizen/Arc.wgt -t <tv>');
