# Play and Shuffle on collection pages (1 November)

A collection's page now has **Play** and **Shuffle** beside its name, as the web's collection page
(and Plex). The focus starts on Play.

- Both go through Arc's play queue (`POST /api/v1/play-queues` with the collection's titles), so
  the player plays on through the collection and Back works as for any queue. Arc puts a show's
  episodes in its place, as the web's `collectionQueue` does.
- Shuffle shuffles the titles, then asks Arc to shuffle what's still to come (the queue's
  `shuffle` operation), so a show's episodes are mixed in too. If a show comes first, one of its
  episodes is still the first thing played only by chance of order: the queue keeps its current
  entry where it is.
- The buttons show only when the server keeps play queues, as Shuffle on show pages.

Logging: none added; the queue requests are logged by the server, and a failure shows a note.
