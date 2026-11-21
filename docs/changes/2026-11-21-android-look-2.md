# Home, library, Watchlist, Settings, sign-in and profiles in Android's look (LG/Samsung visual batch 2)

The rest of the screens now follow arc-android's `BrowseScreen.kt`, `SettingsScreen.kt`,
`SignInScreen.kt` and `ProfilesScreen.kt`. Built on the title page and player batch (#37), which
builds on #36.

- **Home:** the hero takes 60% of the screen, as Android's, so its details and Continue Watching
  sit about 100px lower, where Android's are.
- **Library top bar:** the heading is the library's name and the tabs read Recommended · Library ·
  Collections (Library replaces "Movies"/"Shows", which repeated the name).
- **Watchlist top bar:** "Watchlist" with All and Date Added pills on the right, as Android's (All,
  Movies, TV Shows; Date Added, Title, Release Date); no "3 titles".
- **Settings:** "Settings" centred at the top; the profile's large circle, name and server on the
  left; the list on the right. Playback follows Android's order: Auto-Play Next Episode, Skip
  Intros Automatically, Theme Music, Hide Spoilers, then Show Missing Episodes (#36), Preferred
  Audio Language.
- **Sign in:** the logo, "Sign in to Arc" and three numbered steps on the left, with Get a New Code
  and Use Another Server (outlined) under them; the code in four boxes on the right, "Waiting for
  you to enter the code…" with a spinner, and "Server: …". A code that runs out is replaced by a
  new one, with "That code ran out, so here's a new one.", as Android's.
- **Profiles:** a larger wordmark and a smaller "Who's watching?"; the focused profile gets a white
  ring round its circle and a bold white name (no box round both); Android's spacing; Sign Out is
  an outlined pill.

Pictures (browser build, shared screenshot library): `2026-11-21-android-look-2/`, one before and
one after per screen (home, library, watchlist, settings, signin, profiles).

## Decisions

- Get a New Code is always shown, as Android's, rather than only after the code runs out.
- The Watchlist's choices aren't remembered between visits, as Android's.

## Checks

- `npm run check`: types, both TV builds and the old-TV syntax check pass.
- Walked in the browser build with the remote keys: each screen, the Watchlist's All menu, the
  focused profile's ring and name, Sign Out to the sign-in screen.

## Limits

- No real TV tried.
- At 1920×1080 the lower Home row now starts where Android's does, so the first row's captions sit
  at the bottom edge until the focus moves down.

## Logging

Nothing new: layout changes only.
