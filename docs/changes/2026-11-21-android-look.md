# Title pages and player in Android's look (LG/Samsung visual batch 1)

The title pages and the player's controls now follow arc-android's `ui/details/DetailsScreen.kt`
and `ui/player/PlayerOsdView.kt`. Built on #36 (season menu), which should merge first.

- **Film page header:** the logo, text and buttons sit at the bottom of the first screen, 80px up
  from the bottom (Android's 40dp).
- **Credits beside the buttons:** "Starring" (first three actors) and "Directed By" (first three
  directors) on the right, level with the buttons, on films and shows (Android shows it on both).
- **Above the overview:** the age rating in an outlined box, then up to three genres ("15 Drama").
- **Below the overview:** the year, the running time (films) or episodes left (shows), the ★ score,
  then on films the full quality badges, as Android: resolution (filled), SDR/HDR10/HDR10+/DV/HLG,
  audio codec and channels in a split badge ("AAC | 2.0"), Atmos, and the number of versions.
  Before, only "AAC Stereo" showed.
- **Episode cards:** a small "S1 · E3" label over the title ("Special 3" for season 0), from
  `episodeCode` (#35), instead of "S1 · E3 · Title" in the title line.
- **Player controls:**
  - The show's name is the large title, with "S1 · E3 · Episode title" small above it; a film shows
    its name only. When playback starts from somewhere that leaves out the episode's place (a
    search result), the player takes the show's name and the episode's number from the show's
    seasons.
  - Three round buttons on the right: Playback (Speed, Quality, Version when there's more than one,
    Playback info; Watch Together in a room), Audio and Subtitles. Play, Next and the 10-second
    buttons are gone: OK on the timeline plays or pauses, and the remote's keys play, pause and
    seek, as before.
  - The time played (with a play or pause mark) sits under the playhead; the time left is at the
    right end.
  - Info, Chapters (more than one chapter), Cast (when the title has actors) and Episodes (an
    episode, its season) tabs under the timeline. Focusing a tab opens its card in place of the
    title and timeline; Up from the card, or Back, closes it. Info has the picture, title, details,
    overview, badges, how it plays and Restart; Episodes plays the chosen episode (for everyone in a
    room); Chapters seeks. The controls stay up while a tab is open.

Pictures (browser build, shared screenshot library): `2026-11-21-android-look/` has
`film-before/after.jpg` (Dune: Part Two), `show-before/after.jpg` and `show-episodes-after.jpg`
(The Last of Us) and `player-before/after.jpg` (The Last of Us S1 · E1).

## Decisions

- Credits show on show pages too, as Android, though the request named the film page.
- The episode label sits above the title rather than in the title line. #35's wording ("S1 · E4 ·
  Pilot" in episode lists) still holds for the player and Up Next.
- A Chapters tab, as Android's, rather than a Chapters button; the Playback menu doesn't repeat it.
- Cast tiles in the player don't open the person's page: that would leave playback running under
  another screen. Easy to add if wanted.

## Checks

- `npm run check`: types, both TV builds and the old-TV syntax check pass.
- Walked in the browser build with the remote keys: film page, show page (header and episode
  labels), the player's buttons, Playback menu, Info and Episodes tabs, Up and Back closing a tab.

## Limits

- No real TV tried. Playwright's Chromium can't decode H.264, so no video played; the player
  pictures show the controls over a black, loading screen.
- The test library's episodes have one audio track and no subtitles, so only Playback shows among
  the round buttons there, and they have no actor credits, so no Cast tab.

## Logging

Nothing new: these are layout changes, and the episode list fetch fails quietly (the tab is left
out).
