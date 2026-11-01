import { cpSync, mkdirSync, rmSync } from 'node:fs';

/** Copies a platform's build and its packaging files (appinfo.json, config.xml, icons) to out/<platform>/app. */
export function stage(platform) {
  const dir = `out/${platform}/app`;
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  cpSync(`dist/${platform}`, dir, { recursive: true });
  cpSync(`platforms/${platform}`, dir, { recursive: true });
  return dir;
}
