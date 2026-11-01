# The TV app catches up with the Android app

**What changed.** The starter app (Home rows, Details, a basic player) became the Android TV app's
set of screens, ported screen by screen from arc-android:

- A sidebar (Search, Home, libraries and Watchlist in the profile's order, Switch Profile).
- Home: immersive artwork and summary over one row at a time, rows from `resolveHomeRows` (the
  web's Edit Home layout), the Queue row last, reloaded when Home is shown again.
- Library tabs (Recommended, titles, Collections), sort and filter panels, the A–Z bar, a windowed
  grid fetched 60 at a time and remembered per library; Watchlist; Collection and Person pages.
- Search with shelves for movies, shows, people and episodes.
- Details with next-episode logic, seasons and episodes, cast, related rows, extras, and the More
  menu; hold OK on any card for the same menu (Watched, Watchlist, Play Next, Add to Queue, Media Info).
- The player: the web's controls and their order, audio/subtitle/version/quality/chapter/speed menus,
  playback info, subtitles drawn from WebVTT (style and remembered language from the profile),
  trickplay thumbnails, Up Next (10 s), the play queue, and a stop by the admin (403).

**Decisions.**
- Focus doesn't enlarge buttons: Spotlight treats an element scaled past its container as outside it
  and stops moving. Only cards and faces in padded rows grow.
- Enact's container decorator gives `spotlightRestrict` a default of `self-first` that wins over the
  config, so the panel trap passes `self-only` as a prop (menus let the focus escape before).
- A failed stream is retried once with more conversion, based on the method Arc chose, as Android
  does; asking again after a conversion fails is refused by Arc.
- `GET /items/{id}` leaves out an episode's season, number and show; the player keeps them from the
  card it was opened from.

**Checked.** In desktop Chrome against a scratch Arc with the test library: every screen above,
remote-key navigation, the player's menus, subtitles and Up Next. `npm run check` passes (types, both
TV bundles, ES2016 syntax). Nothing has been run on a real TV yet.

**Logging.** The player writes to the console (the TV's web inspector) when a stream fails and when
it asks Arc to convert more. Arc's own logs cover playback decisions and sessions.

**Limits.** Real-TV behaviour (focus speed on Chrome 53, each player's subtitle timing, the
capability tables) is still unverified; see the README's list.
