# Subtitle Timing in the player on LG/Samsung

The web, Android TV, Kodi and Apple TV players can move subtitles earlier or later; LG/Samsung
couldn't. It was this app's last ❌ on the parity table (arc-media-server#476). This copies Android's
version (arc-android #32, and #47 for how values are written), with the web's words.

- **Where:** with a text subtitle on, the player's Subtitles menu ends with **Timing** and its value
  ("+1.5s"). Choosing it opens Subtitle Timing.
- **The Subtitle Timing menu:**
  - at the top, "Timing: +1.5s (later)", "Timing: −0.5s (earlier)" or "Timing: 0.0s";
  - then Show 0.5s Earlier, Show 0.5s Later and Reset Subtitle Timing;
  - each press shows at once and the menu stays open, so a line can be matched by eye;
  - Back closes it and puts the focus back on the Subtitles button.
- **Rules** (as the web's and Android's):
  - half a second a step, up to 10 seconds either way;
  - kept per file and track for this playback only: never saved to the profile or the TV's
    storage. Another track or version starts at 0.0s; going back to one finds its timing as it was
    (the web's and Android's behaviour). A new title starts with none;
  - the video never restarts or reloads.
- **ASS/SSA subtitles can move too, unlike Android:** this app draws every text subtitle itself
  from Arc's WebVTT (`GET /items/{id}/subtitles/{track}/vtt`). Arc's subtitle reader treats ASS
  and SSA as text tracks and converts them with ffmpeg to WebVTT (arc-media-server
  `internal/subtitles/subtitles.go`, `textCodecs` and `extract`), so here they show as plain lines
  and move like any other. Android draws ASS with libass, which keeps its own timing.
- **Picture subtitles** (PGS, VobSub) are burned into the video by Arc, so they can't move. With one
  on, the Subtitles menu has no Timing row and says so instead, in Android's words: "Timing can be
  adjusted for text subtitles. Picture subtitles are part of the converted video."

## How it works

- `src/lib/subtitle-timing.ts` (pure, no imports): `STEP_MS`, `MAX_MS`, `timingKey` (file and
  track), `shifted` (a nudge within the limits, or Reset), `adjustable` (text tracks only),
  `offsetFor`, `cueTime` and `timingSeconds`/`timingWay` for the words.
- The player already matched cues to the file's time with `activeCues(cues, pos)`. It now asks for
  `activeCues(cues, cueTime(pos, offset))`: "later" shows a cue at its file time plus the offset.
  Nothing is fetched again.
- `parseVTT` and `activeCues` moved unchanged from `src/lib/subtitles.ts` into `src/lib/cues.ts`
  (re-exported from `subtitles.ts`), so the tests can load them without the app's i18n and React.
- The Subtitles button now has a Spotlight id (`player-subtitles`), so the Timing menu opens over
  it rather than over the Subtitles menu's row that opened it.

## Decisions

- **Picture tracks: the line, not just a hidden row.** The Subtitles menu already has room for a
  line under its title (Quality uses it), and Android and the web both explain why. Hiding the row
  alone would leave the viewer wondering where Timing went.
- **At ±10s (or 0.0s for Reset) the choices stay, dimmed, and do nothing.** The web disables them;
  Android keeps them and ignores the press. Dimmed keeps the focus on its row (a TV's focus can't
  jump off a removed item) while showing the limit, as the invite picker's dimmed people do.
- **The menu's title is "Subtitle Timing"; the row is "Timing".** The row sits inside Subtitles, so
  "Timing" is enough there; on its own the menu needs the full name, which is the feature's name in
  every app. Android titles its menu "Timing"; easy to change if the owner prefers.
- **Plex:** some Plex players offer a subtitle offset in the playback settings. I couldn't confirm
  whether Plex's LG and Samsung apps do, or with what steps, so no parity claim there. This follows
  Arc's own apps (the web's 0.5 s steps, ±10 s, per playback), which is what the parity table asks.

## Checks

- `npm run check`: passed (TypeScript, `test:watch-together`, the new `test:subtitle-timing` with
  7 tests, both TV builds, the ES2016 old-TV check).
- New `scripts/test-subtitle-timing.mjs` (in `check`, the repo's plain Node test pattern): steps
  and limits, Reset, the shifted lookup, per file and track (and none for picture tracks), which
  tracks can move, and how values read (+1.5 / −0.5 with U+2212 / 0.0).
- **The walk** (WALK_RESULTS)
- **Not tried on a real LG or Samsung TV.** None was available, so how the menu feels with real
  remotes (and the Magic Remote's pointer) and how the lines sit against speech on the TV's own
  player still need one.

## Logging

- Each change at debug only: "Arc: subtitle timing now 1500 ms". Nothing at info: it's a viewer's
  choice, not an outcome. No titles, tracks or URLs are logged.

Screenshots: `docs/changes/2026-11-20-subtitle-timing/`.
