# Episode numbers written the same way as every Arc app

**20 November 2026**

## What changed

The owner's rule for every Arc app (arc-media-server `docs/AGENT-RULES.md`, "Episode numbers",
#493): **S1 · E4**, no leading zeros, "·" the only separator; a special is "Special 3"; on a card
the number stands alone under the show's name; where the episode is the subject, its title follows,
"S1 · E4 · Pilot"; buttons read "Play S1 · E4" and "Resume S1 · E4".

The app already wrote "S1 · E4" and its buttons already matched. These places changed:

- **Specials:** season 0 now reads "Special 3" (new `details.special`), and a season-0 item without
  an episode number reads "Specials" rather than "Season 0". `episodeCode()` in `src/lib/format.ts`
  is the one place that writes the number.
- **One place for "number · title":** `episodeHeading()` in `src/lib/format.ts` gives "S1 · E4 ·
  Pilot", or just the title when the episode has no number. Home's summary line and an episode's own
  page use it in place of building the text themselves.
- **Cards:** 16:9 episode cards no longer add the episode title after the number ("S1 · E3 ·
  …And the Bag's in the River" under the show's name is now "S1 · E3"). The cards have no separate
  line for the episode title, so there's nothing to keep.
- **Episode lists** (a show's page): the "EPISODE 4" kicker and the title line become one line,
  "S1 · E4 · Cancer Man". Episodes outside the episode order still show only their title.
  `details.episodeN` and the `.episode-kicker` style are gone.
- **Player:** the large line is now "S1 · E4 · Pilot", with the show's name above it (it was the
  episode title, with "Breaking Bad · S1 · E4" above). **Up Next** likewise: "S1 · E5 · Gray
  Matter", with the show's name under it.
- `detailsLine()` (not used by any screen yet) built its own "S1 · E0" when an episode had no number;
  it now uses `episodeCode()`.

The app has no "Start watching" button and no play queue list (the queue is Home's Queue row, which
is cards), so neither needed anything.

## Pictures

From the browser build (`npm run dev`), **not a TV**, against the shared screenshot library
(`node tools/screenshots.mjs --serve` from arc-media-server main, c49f7a6), signed in with a link
code as Jordan, driven with the remote's keys:

- [episode-list.jpg](2026-11-20-episode-numbers/episode-list.jpg): Breaking Bad's Season 1, with
  "Resume S1 · E3" and "S1 · E1 · Pilot", "S1 · E2 · Cat's in the Bag…".
- [player.jpg](2026-11-20-episode-numbers/player.jpg): the player's title line, "S1 · E3 ·
  …And the Bag's in the River".

None of the README's pictures change: Home's cards already read "S1 · E2" and its summary already
read "S1 · E2 · Half Loop"; Breaking Bad's picture stops above the episode list; the others show no
episode numbers.

## Limits

- The show's name above the player's title line only appears when the item that starts playback
  carries `series_title` (from Home, Continue Watching, the queue). Started from a show's episode
  list, Arc's season list doesn't include it, so the line is empty. Before this change that line
  read just "S1 · E3" in that case. Not changed here.
- Up Next wasn't seen: Playwright's Chromium has no H.264 decoder, so the test files don't play in
  the browser build. Its text is covered by the same `episodeHeading()` as the player.
- The screenshot library has no specials, so "Special 3" was checked by the new test only.
- Nothing was tried on a real LG or Samsung TV.

## Checks

- `npm run check`: passed (types, Watch Together 25, Subtitle Timing 7, the new episode number
  test 6, both TV builds, the old-TV syntax check).
- `scripts/test-episode-numbers.mjs` (now part of `npm run check`): "S1 · E4", "S10 · E12",
  "Special 3", "Season 2", "Specials", no number for 0 and 0, "S1 · E4 · Pilot", "Special 3 ·
  Minisode", and no other episode format in `src/locales/en.json`.
- Walked Home, Breaking Bad's page and the player in the browser build with the remote's keys.

## Logging

Text only; nothing logs differently.
