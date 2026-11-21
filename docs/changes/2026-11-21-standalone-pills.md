# Standalone library and season pills

Implements arc-tv #40 and its Recently Added comment, using the owner's confirmed
arc-media-server #499 values (Android dp doubled at 1920×1080).

- Library and season tabs have no holder background: 72px tall, 32px side padding,
  28px medium text, white at 10%; selected at 18%, focused white/black at ×1.04.
- Title/Filters and Watchlist header pills use the same text and focus values.
  Existing gaps remain. Title-page Play/Resume and circular actions use 88px,
  white at 16%, focus ×1.06/×1.10, with 36px/44px icons; More stays circular.
- Recently Added season captions read “Season 2”, with the new episode count in
  the corner badge. Series batches read “4 new episodes”; episodes keep “S1 · E4”.
  Existing added_at card keys keep repeated batches separate. Series badges still
  show unwatched totals; only season badges use the batch count.

## Checks and pictures

`npm run check` passed once: types, 25 Watch Together tests, 7 subtitle timing
checks, 6 episode-number checks, both TV builds and both old-TV syntax checks.
Focused pinned-Chromium browser walk passed Library, show, film, Home and Watchlist:
remote arrows/Enter, Filters and season-menu Back, computed tab sizes, grouped
captions/counts and separate repeated batches. No page errors.

[Pictures](2026-11-21-standalone-pills/): one before/after JPEG pair per screen.
These are actual browser-rendered app components with offline API fixtures using
shared-library titles, **not provider-matched library or hardware captures**.
Provider credentials were unavailable, so artwork is the app's placeholder.
The Home capture moves down to Recently Added to reveal its captions; the existing
first-row caption clipping is outside this change. Artwork/details from TMDB in
normal use; titles belong to their owners, no media is included.

No real LG/Samsung TV, packaged install, physical remote, old-TV rendering or
playback was tried. CSS keeps Chrome 53-compatible flex/margins (no grid/gap).
No new logging: these are presentation changes; existing API failures are unchanged.
