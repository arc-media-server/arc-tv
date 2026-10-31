import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// One app, three builds: `webos` and `tizen` are packaged for the TVs, `browser` (and `npm run
// dev`) is desktop Chrome with arrow keys standing in for the remote. The mode picks which file
// in src/platform/ the app imports as '@platform', so each package carries only its own code.
const platforms = ['webos', 'tizen', 'browser'];

// TVs load packaged apps from file://, where Chrome refuses module scripts, so the bundle is one
// classic script. These attributes would make it a module (or a CORS fetch) again.
function classicScript(platform: string): Plugin {
  return {
    name: 'arc-classic-script',
    // Only the build: the dev server needs its module scripts.
    apply: 'build',
    enforce: 'post',
    transformIndexHtml(html) {
      // Samsung's TV APIs (AVPlay, network, product info) come from a script the TV provides.
      const webapis = platform === 'tizen' ? '<script src="$WEBAPIS/webapis/webapis.js"></script>' : '';
      return html
        .replace('<!--tizen-webapis-->', webapis)
        .replace(/ type="module"/g, '')
        .replace(/ crossorigin/g, '')
        .replace(/<script src="\.\/app\.js"/, '<script defer src="./app.js"');
    },
  };
}

export default defineConfig(({ mode }) => {
  const platform = platforms.includes(mode) ? mode : 'browser';
  return {
    base: './',
    plugins: [react(), classicScript(platform)],
    define: { __PLATFORM__: JSON.stringify(platform) },
    resolve: {
      alias: { '@platform': fileURLToPath(new URL(`./src/platform/${platform}.ts`, import.meta.url)) },
    },
    build: {
      outDir: `dist/${platform}`,
      emptyOutDir: true,
      // The oldest TV in use: LG's 2019 sets (webOS 4.5, e.g. the C9) run Chrome 53. Samsung's 2019
      // sets (Tizen 5.0) are newer, about Chrome 63.
      target: 'chrome53',
      cssTarget: 'chrome53',
      modulePreload: false,
      assetsInlineLimit: 0,
      chunkSizeWarningLimit: 2000,
      rolldownOptions: { output: { format: 'iife', entryFileNames: 'app.js', assetFileNames: 'assets/[name][extname]' } },
    },
    server: {
      // `npm run dev` proxies /api to a local Arc, so the browser build needs no CORS at all.
      proxy: { '/api': process.env.ARC_URL ?? 'http://127.0.0.1:8099' },
    },
  };
});
