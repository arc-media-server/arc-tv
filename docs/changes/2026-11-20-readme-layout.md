# The README in the other apps' layout, with pictures from the shared library

**20 November 2026**

## What changed

`README.md` now follows arc-kodi's and arc-android's layout, adapted for LG and Samsung:

- Arc's stacked logo, centred, as a `<picture>`: the white SVG in dark mode, the black in light.
  Both are copied unchanged from arc-media-server's `docs/brand/` into `docs/brand/` (the white
  one is the same file as `src/assets/brand/arc-logo-stacked-white.svg`).
- A tagline and badges: status alpha, licence AGPL-3.0, LG webOS 4.5+, Samsung Tizen 5.5+,
  TypeScript/React.
- A large Home picture, then "What is Arc for LG and Samsung TVs?" in plain words for a Plex user,
  with the alpha note (not in the TV stores yet).
- A two-column table: Dune: Part Two's page, Breaking Bad's page, the Movies library, search,
  Watch Together (inviting people from the ⋯ menu) and Settings, with TMDB's credit under it.
- "What it does" tightened into the other READMEs' emoji-bold style and brought up to date
  (Watch Together, Subtitle Timing, picture subtitles, Hide Spoilers, Show Missing Episodes,
  playlists, Filters, Theme Music, Rate…).
- A second row: signing in with a code, and Who's watching.
- "Installing" (LG `.ipk` with Developer Mode and ares-cli; Samsung `.wgt` with Tizen Studio and
  sdb; what's needed; signing in), "Playback" (each TV's own player, direct play first, then
  repackaged, then converted, and the one automatic step down), "For developers" (Layout, the
  Chrome 53 note, Develop, still to check on real TVs) and "Licence".

## The pictures

Nine JPEGs in [`docs/screenshots/`](screenshots/), 1920×1080:
[home](screenshots/home.jpg), [film](screenshots/film.jpg), [show](screenshots/show.jpg),
[library](screenshots/library.jpg), [search](screenshots/search.jpg),
[watch-together](screenshots/watch-together.jpg), [settings](screenshots/settings.jpg),
[sign-in](screenshots/sign-in.jpg) and [profiles](screenshots/profiles.jpg).

They come from **the browser build (`npm run dev`, `src/platform/browser.ts`), not a TV**, pointed
at Arc's shared screenshot library (arc-media-server `docs/SCREENSHOTS.md`): `node
tools/screenshots.mjs --serve` from arc-media-server's `web/` started a throwaway Arc on
`127.0.0.1:18299` with titles matched on TMDB. The app showed its link code, `node
tools/screenshots.mjs --approve <code>` approved it, and Playwright's Chromium picked Jordan and
moved through the screens with the remote's keys only (arrows, Enter, Escape for Back; typing
"Dune" into search). Nothing was hand-written: every title, picture and description is the
library's. Each picture was looked at before it was kept.

Choices: the show page is photographed at its top (focus on Resume), because opening it from
Continue Watching scrolls to the episode and cuts the show's logo in half; the library picture is
the Movies tab (the grid with Sort, Filters and the A–Z bar) rather than Recommended.

## Checks

- `npm run check`: passed (types, Watch Together and Subtitle Timing tests, both TV builds, the
  old-TV syntax check).
- The README read through against the app: every feature named was found in the code or seen in
  the walk.
- Nothing was tried on a real LG or Samsung TV.

## Logging

Documentation and pictures only; nothing logs differently.
