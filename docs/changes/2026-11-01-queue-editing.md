# Arrange the play queue from Home (1 November)

Holding OK on a card in Home's **Queue** row now offers **Move Earlier**, **Move Later** and
**Remove from Queue**, the TV's version of the web player's queue list (move up, move down,
remove).

- Moves and removals go to Arc as the queue's `reorder` and `remove` operations with the latest
  revision (a queue changed elsewhere is read again and the edit made on it, as other queue edits).
- The title playing now (the row's first card) can't be moved or removed, as Arc requires; a
  card can't move in front of it either. Each choice shows only where it can do something.
- A removed card leaves the row and the focus stays on the row.
- Card menus now get where the card is (`CardPlace`: Continue Watching row, queue entry).

Logging: none added; the server logs queue edits, and a refused edit shows a note.
