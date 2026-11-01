# Playlists

**What changed.** The sidebar has a Playlists entry after the libraries. It lists the profile's
playlists in the library grid, each card a two-by-two mosaic of its titles' posters (as the web's
PlaylistCover) with its title count. A playlist's page shows its name, count and length, Play and
Shuffle, and its titles in order; a title opens its page.

**How it plays.** Play starts a play queue from the playlist (`POST /play-queues {playlist_id}`,
which Arc snapshots). Shuffle starts one from the titles in a random order and then shuffles what
follows the first (so a show's episodes are mixed too). The Play/Shuffle logic the collection page
had is now shared in `src/lib/playAll.ts` and both pages use it. The buttons show only when the
server has play queues.

**Decisions.** Playlists are made and edited on the web; the TV only shows and plays them (Plex's
TV apps are the same). The entry is always in the sidebar, with a note pointing to the web when
there are none, so it's findable. Choosing a title opens its page rather than playing from there.

**Limits.** No editing playlists on the TV. Smart playlists show whatever the server returns for
them.

**Logging.** No new logging: failures show on screen (a retry, or a toast when playing can't
start) and the server logs its side.
