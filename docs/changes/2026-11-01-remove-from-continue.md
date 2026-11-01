# Remove from Continue Watching (1 November)

Holding OK on a card in Home's Continue Watching row now offers **Remove from Continue
Watching** in its menu, as the web's card ⋯ menu does. It calls `DELETE /api/v1/home/continue/{id}`,
which takes the title out of Continue Watching (and Up Next) without marking it watched.

- The card leaves the row at once; if Arc refuses, it comes back and a note says so.
- The choice shows only on that row's cards (the web offers it the same way), so it can't be
  confused with Mark as Watched elsewhere.

Logging: none added on the TV; the server logs the request's failure at its boundary, and the
app shows a note.
