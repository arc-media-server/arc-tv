# Shuffle Season and Mark Season as Watched (15 November)

**What changed.** A show's page has two buttons beside its season tabs, as the web's show page:

- **Shuffle Season** plays the season shown in a random order, through a play queue of its
  episodes on disk (so Next, Up Next and Back work as for any queue). It shows when the server
  keeps play queues and the season has more than one episode on disk.
- **Mark Season as Watched** marks every episode of the season shown; when they're all watched
  it reads **Mark Season as Unwatched** and does the opposite. It uses Arc's
  `PUT /api/v1/items/{show}/played` with `season_number` (the season in the profile's episode
  order, as the web sends it). The episode cards show the change at once; if Arc refuses, they go
  back and a note says so. The page then reloads, so "episodes left" and Play's next episode follow.

Both act on the season selected in the tabs: moving along the tabs changes it, then Right reaches
the buttons. Episodes not on disk are left out of both, as on the web.

**Decisions.** Matches the web (and Plex's season actions), so nothing goes to arc-media-server#80.
The title page's own shuffle helper was removed in favour of the shared one in `lib/playAll.ts`.

**Checked.** `npm run check` (types, webOS and Tizen builds, ES2016 syntax) passes. In desktop
Chromium against a scratch Arc with a two-season, three-episode test show, using only remote keys
(Down to the tabs, Right to Season 2 and on to the buttons, OK): Mark Season as Watched sent
`{"played":true,"season_number":2}`, Arc marked exactly Season 2's three episodes (Season 1
untouched), the cards showed ticks and the button turned to Unwatched; pressing it again unmarked
them. Shuffle Season started a queue of exactly Season 2's three episodes in a shuffled order and
the player opened on its first. Nothing has been run on a real TV.

**Logging.** None added: a refused change shows a note, and Arc logs the requests on its side.

**Limits.** Episodes outside the show's episode order (Arc's "unplaced") still aren't shown on the
TV; that is a separate item.
