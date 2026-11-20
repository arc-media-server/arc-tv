# README Home picture with Continue Watching as Backdrops

**20 November 2026**

## What changed

[`docs/screenshots/home.jpg`](screenshots/home.jpg) is retaken. The shared screenshot library now
sets the scratch server's default Home layout to show Continue Watching as Backdrops: each title's
backdrop with its clear logo (arc-media-server #491). The other README pictures don't show
Continue Watching, so they're unchanged. That includes watch-together.jpg, which shows Dune: Part
Two's page and the invitation list, not Home's rows.

No app code changed. The app already reads the profile's Home layout from `/me/prefs` (`home`) and
maps the `arc` style to Backdrops (`src/lib/home.ts`). After signing in as Jordan, Continue
Watching showed Backdrops with logos for Severance, Breaking Bad, Dune: Part Two and Oppenheimer.

## How it was taken

The same way as before (`2026-11-20-readme-layout.md`):

- the browser build (`npm run dev`) at 1920×1080, **not a TV**;
- pointed at `node tools/screenshots.mjs --serve` on `127.0.0.1:18299`, run from #491's branch
  because #491 hadn't merged yet (it changes only the library file, the script and its docs);
- signed in with a link code approved by `--approve`, then Jordan;
- with focus on Severance, the first card in Continue Watching.

I looked at the picture before keeping it.

On this sign-in, Home first put focus on the Watchlist row instead of Continue Watching. One press
of Up moved it back. The earlier walk landed on Continue Watching, so this may be a timing issue
with which row loads first. I didn't investigate it further.

## Checks

- `npm run check`: passed.
- Nothing was tried on a real LG or Samsung TV.

## Logging

Picture only; nothing logs differently.
