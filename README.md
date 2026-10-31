# Arc for LG and Samsung TVs

The [Arc Media Server](https://github.com/arc-media-server/arc-media-server) app for LG webOS and
Samsung Tizen TVs. One web app, built for the TV (a 10-foot UI driven by the remote), packaged twice:
an `.ipk` for LG and a `.wgt` for Samsung. It talks to Arc only through `/api/v1`, like the Android
app, and plays video with each TV's own player (LG's media pipeline behind `<video>`, Samsung's
AVPlay), so files the TV can decode play as they are.

## What's in this first slice

- **Find the server:** lists Arc servers on the TV's network (`GET /api/v1/discover` on each address
  of the TV's /24, port 8099), or takes an address.
- **Sign in with a code:** shows a code to enter in Arc's *Link a Device*; no typing passwords.
- **Who's watching:** profiles, with an on-screen PIN pad.
- **Home:** Continue Watching with Up Next, then each library's recommended rows.
- **Details:** movie, show (seasons and episodes in the profile's episode order) and episode pages.
- **Player:** direct play, remux or conversion as Arc decides from the TV's capabilities, falling
  back direct → remux → convert if the TV fails; resume, progress, skip intro/recap, Up Next at the
  credits; seek with left/right and the remote's media keys.

## Layout

```
src/                  shared app: screens, focus navigation (Enact Spotlight), API client, text
src/platform/
  types.ts            what the app needs from a TV
  webos.ts            LG: <video> player, Back key 461, Luna calls (model, network, version)
  tizen.ts            Samsung: AVPlay player, Back key 10009, media keys, webapis
  browser.ts          desktop Chrome stand-in with hls.js, for quick UI work
src/locales/en.json   all UI text (through t())
platforms/webos/      appinfo.json, icons, splash  -> npm run package:webos -> .ipk
platforms/tizen/      config.xml, icon             -> npm run package:tizen -> .wgt
scripts/              packaging and the bundle check
```

The build picks the platform file at compile time (`vite build --mode webos|tizen|browser`), so
each package carries only its own code. TVs from 2019–2020 run Chrome 68–69 engines, so the bundle
targets Chrome 68, includes core-js for missing built-ins, and is one classic script (TVs load
packaged apps from `file://`, where module scripts are refused). `npm run check` type-checks, builds
both TV bundles and fails if either uses newer syntax.

## Develop

```sh
npm install
npm run dev                 # desktop Chrome at http://localhost:5173, proxying /api to Arc on :8099
ARC_URL=http://192.168.1.10:8099 npm run dev   # or another Arc
npm run check               # types, both TV builds, and the old-TV syntax check
```

In the browser, arrow keys and Enter move like the remote, Escape or Backspace is Back, and Space is
play/pause. Most UI work happens here; check layout and keys in the TV simulators, and playback on a
real TV (the emulators have no real decoders).

## Run on an LG TV (webOS)

1. Create a free account at LG's developer site, install the **Developer Mode** app on the TV from
   the LG Content Store, sign in there and turn Dev Mode on (the session runs out after a while;
   extend it in the same app).
2. `npm i -g @webos-tools/cli` (or use the copy in devDependencies via `npx`), then
   `ares-setup-device` to add the TV with the passphrase the Developer Mode app shows.
3. `npm run package:webos`, then
   `ares-install -d <tv> out/webos/org.arcmediaserver.tv_0.1.0_all.ipk` and
   `ares-launch -d <tv> org.arcmediaserver.tv`. `ares-inspect -d <tv> org.arcmediaserver.tv --open`
   opens DevTools against the TV.

## Run on a Samsung TV (Tizen)

1. Install Tizen Studio with the TV extensions and the Samsung Certificate Extension.
2. On the TV, open Apps, type 12345 on the remote, turn Developer mode on and enter your PC's IP;
   restart the TV.
3. In Tizen Studio's Certificate Manager, create a Samsung certificate profile that includes the
   TV's device ID (connect the TV in Device Manager first). Certificates never go in git.
4. `TIZEN_PROFILE=<profile name> npm run package:tizen`, then
   `sdb connect <tv ip>` and `tizen install -n out/tizen/Arc.wgt -t <device>`.

## Still to check on real TVs

Kept as a list until each is shown on a real set (Arc's rule: no device claims without evidence):

- Cross-origin calls from the packaged app to Arc (webOS file origin; Tizen `<access>` rules).
- The capability tables in `webos.ts` and `tizen.ts` per model year: MKV direct play, HEVC 10-bit,
  HDR10/HLG/HDR10+, AV1, DTS, and Dolby Vision on LG (left off until tested).
- AVPlay start/seek behaviour with Arc's converted (HLS, fMP4) streams.
- Which webOS ACG groups (`requiredACG` in appinfo.json) the model-name and network-status Luna
  calls need on newer webOS; without them the app still works but can't find servers itself.
- Subtitles: not shown yet; text tracks as WebVTT drawn by the app are next.

## Licence

AGPL-3.0-only, copyright The Arc Media Server Authors.
