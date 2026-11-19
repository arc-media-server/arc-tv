# Hide Spoilers on LG/Samsung

The existing profile Hide Spoilers preference is now available in Settings and applied to
unstarted, unwatched episodes. Stills and descriptions are concealed; episode titles and actions
stay available. Watched or resumed episodes are shown normally; movies and series are unchanged.

Shared presentation logic covers generic cards (Home, libraries, search, queues and playlists),
show episode lists, title descriptions, Home hero, library summaries/backgrounds and Up Next.
Uses series artwork when known, otherwise a plain placeholder; the original episode still is
not fetched as a fallback. Does not alter API items or playback identity. Series pages supply
the parent's artwork when the seasons response has no series-image fields.

Protection is conservative while preferences load or cannot be fetched. Successful local saves
and live profile invalidation update existing screens. An old in-flight preference read cannot
overwrite a newer read. The Settings toggle only changes after a successful server save, with
failure/retry feedback. Protected backgrounds skip old artwork crossfades.

## Decisions

Uses Arc's existing hide_spoilers API and web/Kodi rule: hide until started or watched. Plex's
[official Mobile settings](https://support.plex.tv/articles/205671068-settings-plex-mobile/)
documents hiding thumbnails/summaries for unwatched or all shows; this implements Arc's boolean
profile rule, without claiming identical TV options. Safe series art/placeholders replace stills
rather than introducing a blur effect or layout. No server change or new dependency.

## Checks

- Baseline main `ead7f74`; independent `codex/tv-hide-spoilers` branch (does not include unmerged
  Show Missing Episodes PR #25).
- `npm run check`: passed once (types, webOS, Tizen, old-TV syntax). Development typechecks caught
  optional-item/art-path typing and were resolved before the required passing check.
- `node tests/spoilers.mjs`: passed (unstarted/watched/resumed/off/movie/series rule, immutable
  source and safe/missing/parent artwork fallbacks).
- Focused pinned-Chromium regression: passed for cards/summary/background/show episodes, no raw
  still fetch while protected or while preferences load, no-art fallback, watched/resumed reveal,
  live preference changes, authenticated Settings save/refusal/retry. The first fixture used the
  wrong Settings export; corrected the fixture and reran. Repeated only Settings after adding
  its bounded failure log, and only Details for the screenshot's focus/scroll position.
- [Actual browser screenshot](2026-11-18-hide-spoilers/protected-episode.jpg). Test fixture uses
  generated metadata and a tiny image, not owner artwork.
- Browser helper: `ARC_PLAYWRIGHT_PACKAGE=<existing @playwright/test> node tests/spoilers-browser.mjs`;
  optional ARC_CASE=settings/details and ARC_SCREENSHOTS. Temporary entry/Vite/browser cleaned up.
- No physical TV/C9 engine/remote, real playback/Up Next transition or owner-server acceptance.
  Up Next and Home hero use the same tested guard, but were not driven through real playback.
  No broad server tests, production access or new tools.

## Logging

One fixed warning when a spoiler-preference save fails, plus the error toast. No per-item logs,
credential-bearing URLs, metadata bodies or tokens. Existing ordinary setting save behavior
outside this preference is unchanged; this task does not broaden into a general settings audit.
