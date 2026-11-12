# Recently Added: a card's key includes when it was added

The server now groups Recently Added episodes into 24-hour batches per show
(arc-media-server#446), so the same show or season can appear twice in the row (three episodes
of Season 2 on Monday, four more on Wednesday). Cards were keyed by type, show and season only,
so the two shared a React key, which can mix up focus and artwork.

`RecentCard` gains `added_at` (already in the server's response) and the card key includes it.
Older servers that don't send it give the same key as before.

Checks: `npm run check` (type-check, webOS and Tizen builds, bundle check) passed. No logging
change.
