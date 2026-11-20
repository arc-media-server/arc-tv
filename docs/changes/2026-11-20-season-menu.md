# A season menu, and Show Missing Episodes as a setting

**20 November 2026**

## What changed

The owner (20 November): Show Missing Episodes belongs in Arc's settings, not beside the season
tabs; Shuffle Season and Mark Season as Watched belong in a menu for the season.

- **Season menu:** OK on a season's tab (or holding OK, as on cards) opens a menu titled with the
  season: **Shuffle Season** (more than one episode on disk and the server keeps play queues) and
  **Mark Season as Watched** / **Unwatched**. They act exactly as the buttons did. Not in This
  Order and a season of only missing episodes have no menu. Back closes it. It's drawn outside
  the scrolling page, as the cards' menus are, so it opens beside the tab.
- **Show Missing Episodes** is a row in Settings (Playback, after Theme Music), Off by default. It
  is the profile's `show_missing_episodes` preference (arc-media-server PR, branch
  `claude/show-missing-episodes-pref`), so it follows the profile. A show's page asks for
  `/seasons?missing=1` when it's on. The page's own Show/Hide button is gone; on an Arc without
  the preference it reads as off.
- `savePrefs` now applies a choice at once, so a page read straight after Settings (Back to a
  show) sees it before the server answers.
- The page reloads when the profile's preferences change elsewhere.

## Decisions

- **OK opens the menu**, as on Android and in Kodi (Apple TV uses its context menu). Focusing a
  tab already selects it, so OK had nothing else to do. Holding OK also opens it, as on cards.
- **A profile setting, not a per-show toggle:** no app had it as a setting before; Android and Kodi
  have a per-show item in the season menu, the web a button. Moving those onto the setting is for
  the owner to confirm.

## Pictures

From the browser build against the shared screenshot library, signed in as Jordan, with the
remote's keys (not a TV):

- [season-menu.jpg](2026-11-20-season-menu/season-menu.jpg): The Last of Us, Season 1's menu.
- [settings.jpg](2026-11-20-season-menu/settings.jpg): Show Missing Episodes, On.
- [missing-episodes.jpg](2026-11-20-season-menu/missing-episodes.jpg): Season 2's episodes, Not on
  disk, after a reload with the setting on.

## Checks

- `npm run check`: passed (types, Watch Together 25, Subtitle Timing 7, both TV builds, old-TV
  syntax).
- `tests/missing-episodes.mjs` (updated; `ARC_CHROMIUM` can now name the browser): passed: setting
  off and on, OK and hold-OK open the menu, Back closes it, Mark Season as Unwatched sends
  `{"played":false,"season_number":2}`, no menu for a missing-only season, missing cards guarded.
- Walked in the browser build: Mark Season as Watched cleared "9 episodes left" and Unwatched
  brought it back; Shuffle Season opened the player on a shuffled S1 · E7; Show Missing Episodes
  turned on, survived a reload, and listed Season 2 and Specials.

## Limits

- The README's Breaking Bad picture still shows the old buttons; it needs retaking.
- Nothing tried on a real LG or Samsung TV.

## Logging

Nothing new: a refused season change shows a note, as before.
