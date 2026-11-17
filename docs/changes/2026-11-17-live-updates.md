# Live updates — 17 November 2026

## What changed and why

Main at `c29636c251fd7fc3e5e7e98d693671332594da2e` had no events subscription. One authenticated `/api/v1/events` stream now follows the foreground profile. This ports Android #37's `LiveUpdates.kt` / `LiveHints.kt`, the server's `docs/EVENTS-API.md`, and the web's `lib/live-updates.ts` behavior.

Hints collect for 1.5 seconds and then flush at most every five seconds, even during a continuous scan. The initial resync is skipped; reconnection or foreground return catches up. Complete SSE frames retain their cursor; `Last-Event-ID` and Bearer authentication travel only in headers. Unknown/malformed hints are ignored. Profile/server/sign-out changes dispose of the old subscription. Hidden documents close immediately and clear pending work.

Home/sidebar/Watchlist/Playlists, title details and profile preferences refresh only for their matching topics. Hidden screens retain one dirty bit. Library grids and search defer live refresh until the user leaves; the mounted player is never reloaded. Title menus and Settings choices defer refresh while open. Profile hints invalidate the preference cache and dispatch `arc-prefs-invalidated`, which an independent theme-music change can consume without coupling these PRs.

## Decisions and limits

Progressive XHR works on Chrome 53, which lacks fetch streaming readers. The response rotates at 256 KiB, resumes by cursor and detects stalled streams after 45 seconds. Refusals retry from five seconds to one minute; 429's bounded Retry-After is honored. These are best-effort hints; normal navigation refresh remains in place. No admin API is inferred from a hint.

There is no new layout, control or user-facing wording. The screenshots show the existing Home card before/after a catalog hint using synthetic fixture data: [screenshots](2026-11-17-live-updates/). They come from the repository's Vite browser build, 960×540 JPEG, without recreating UI in a separate page.

Not tried on a TV. Playback/audio/HDR, TV-specific visibility delivery, reverse proxies and sustained device use remain unverified.

## Checks and evidence

- `npm run check`: passed (typecheck, webOS/Tizen builds and both bundles parse as ES2016; Chrome 53 target). No CSS changes.
- `node --experimental-transform-types scripts/test-live-updates.mjs` (Node 24): passed. Fragmented CRLF/multiline frames, cursor preservation, targeted topics, unknown/malformed hints, continuous-scan 1.5 s / 5 s batching and cancellation are covered. The actual HTTP transport runs against a stand-in twice; each run proves delivery while the stream stays open, closing in background, cursor resume and immediate catch-up, and cancellation of pending refreshes.
- `node scripts/test-live-updates-browser.mjs`: passed against a local stand-in in system Chromium through the repository dev build. One authenticated stream, opening resync skipped, a catalog hint quietly changes the visible Home title, exactly one row request per batch. Before/after screenshots committed above. First cold run needed a longer dev-module startup wait; the completed run passed.
- `git diff --check`: passed.

## Logging

One static warning at the first failed connection in an outage; reconnect success resets that suppression. No per-event/heartbeat/progress logs. No tokens, passwords, codes, item names, user identifiers or URLs are logged. Quiet screen-refresh failures retain the current content; normal API screens remain responsible for actionable loading errors.

Merge live updates before theme music so profile preference changes can reach that feature. This PR is independent of ratings, pre-roll and theme-music PRs.
