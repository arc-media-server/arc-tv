# More library filters: watch status, HDR, video and audio formats, channels

The web and Android TV Filters can narrow a library by watch status and by what the files are.
The LG/Samsung app only had Unwatched, Genre, Decade and Quality. It now has the rest, from the
same answers (`GET /api/v1/libraries/{id}/facets` and the `/items` filter parameters), laid out
like Android's.

## What changed

**New rows in a library's Filters list,** each showing what it's set to and opening its own list
(Any, then the choices; choosing goes back to Filters):
- **Watch Status:** Watched or Not Started (`watch_state` `played` / `unstarted`). It and
  "Only things I haven't watched" exclude each other, as Arc requires: choosing one turns the
  other off.
- **HDR:** Dolby Vision, HDR10+, HLG, HDR10, SDR, or "Not known yet" (`dynamic_range`).
- **Video Format** and **Audio Format:** HEVC, H.264, AV1…, Dolby Digital, Dolby Digital Plus,
  DTS…, with the names the app already uses in Media Info (`video_codec`, `audio_codec`).
- **Audio Channels:** 7.1, 5.1, Stereo…, most first (`audio_channels`).

**When the new rows show:** the four media rows show only when the library has more than one
value, or one is already chosen (the web's rule). A value already chosen stays in its list even if
the library no longer has it, so it can be seen and changed.

**Other changes:**
- Coming back to Filters puts the focus on the row you just used, and opening a list puts it on the
  current choice (before, both went to the top). This applies to Genre, Decade and Quality too.
- Clear Filters clears every filter and keeps the sort; the count beside Filters counts the new ones.
- "1 titles" now reads "1 title" (library, Watchlist, collections, playlists).

## Decisions

- Same rows, order and rules as Android TV (arc-android#43's library filters), so the two TV apps
  match. Watch Status is always offered; the media filters only when they'd narrow something.

## Checks

- `npm run check`: types, webOS and Tizen builds, ES2016 syntax check, all pass.
- In desktop Chromium (the browser build) against a scratch Arc with four generated films (H.264
  stereo, HEVC 5.1, HEVC HDR10 E-AC-3 5.1, H.264 7.1), driven with the remote keys:
  - Filters lists all nine rows; HDR offers SDR and HDR10;
  - HDR10 leaves Interstellar ("1 title"), and focus returns to "HDR: HDR10" (`filters.jpg`);
  - reopening HDR lands on HDR10 (`hdr-list.jpg`); Audio Channels lists 7.1, 5.1, Stereo (`channels-list.jpg`);
  - adding 7.1 shows "Nothing matches. Try fewer filters." and "Filters (2)" (`two-filters.jpg`).
- Not tried on an LG or Samsung TV or their simulators.

## Logging

None added: the facets and titles requests are logged by Arc, and failures already show the
library's error and Try Again.
