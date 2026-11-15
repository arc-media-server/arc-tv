# Arc for LG and Samsung TVs

The [Arc Media Server](https://github.com/arc-media-server/arc-media-server) app for LG webOS and
Samsung Tizen TVs. One web app, built for the TV (a 10-foot UI driven by the remote), packaged twice:
an `.ipk` for LG and a `.wgt` for Samsung. It talks to Arc only through `/api/v1`, like the Android
app, and plays video with each TV's own player (LG's media pipeline behind `<video>`, Samsung's
AVPlay), so files the TV can decode play as they are.

## What it does

The screens and behaviour follow the Android TV app (arc-android), which follows Plex:

- **Find the server:** lists Arc servers on the TV's network (`GET /api/v1/discover` on each address
  of the TV's /24, port 8099), or takes an address.
- **Sign in with a code:** shows a code to enter in Arc's *Link a Device*; no typing passwords.
- **Who's watching:** profiles, with an on-screen PIN pad; Switch Profile (or Sign Out) in the sidebar.
- **Sidebar:** Search, Home, the libraries and the Watchlist in the profile's order.
- **Home:** full-screen artwork and a summary of whatever has focus over one row at a time; rows as
  arranged on the web (Continue Watching or Up Next, the seasonal row, each library's Recently Added
  and custom rows, collections, playlists) with the Queue row last.
- **Library:** Recommended, the titles (sort, filters, A–Z bar, a windowed grid loaded in pages) and
  Collections; Collection and Person pages.
- **Search:** movies, shows, people and episodes as you type.
- **Details:** movie and show pages with the next episode to play, seasons and episodes, cast,
  related rows and extras; Watched, Watchlist and a More menu (Play Next, Add to Queue, Media Info).
  Holding OK on any card opens the same menu.
- **Player:** direct play, remux or conversion as Arc decides from the TV's capabilities, falling
  back once to more conversion if the TV fails; resume and progress; the web's controls in its
  order (play, next, back/forward 10 s; audio, subtitles, version, quality, chapters, speed, info);
  subtitles drawn by the app from WebVTT with the profile's style and language choices, and picture
  subtitles (PGS, VobSub) burned into the video by Arc; timeline
  thumbnails; skip intro/recap/credits; Up Next with a countdown; the play queue.

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
each package carries only its own code. The oldest supported TVs, LG's 2019 sets (webOS 4.5, e.g. the
C9), run a Chrome 53 engine, so the bundle targets Chrome 53, includes core-js and an
AbortController polyfill for missing built-ins, and is one classic script (TVs load
packaged apps from `file://`, where module scripts are refused). `npm run check` type-checks, builds
both TV bundles and fails if either uses newer syntax.

## Develop

```sh
npm install
npm run dev                 # desktop Chrome at http://localhost:5173, proxying /api to Arc on :8099
ARC_URL=http://192.168.1.10:8099 npm run dev   # or another Arc
npm run check               # types, both TV builds, and the old-TV syntax check
```

In the browser, arrow keys and Enter move like the remote, holding Enter (or a right-click) is a long
press, Escape or Backspace is Back, and Space is play/pause. Most UI work happens here; check layout and keys in the TV simulators, and playback on a
real TV (the emulators have no real decoders).

## Run on an LG TV (webOS)

1. Create a free account at LG's developer site, install the **Developer Mode** app on the TV from
   the LG Content Store, sign in there and turn Dev Mode on (the session runs out after a while;
   extend it in the same app).
2. `npm i -g @webos-tools/cli` (or the optional copy this repo installs, via `npx`), then
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
- Subtitle timing and size on each TV's player; picture subtitles (burned in by Arc).
- Focus, scrolling and artwork speed on the C9's Chrome 53 engine.

## Licence

AGPL-3.0-only, copyright The Arc Media Server Authors.
