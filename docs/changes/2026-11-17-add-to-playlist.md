# Add to Playlist from the TV

Playlists already showed and played on LG/Samsung, but titles could only be added to them on the
web. The web's and Android TV's title and card menus have **Add to Playlist…**; this app now has it
too, laid out like Android's.

## What changed

- **Where:** in a title's ⋯ menu and every card's menu (hold OK), after Play Next and Add to Queue.
  It's offered for films, episodes and shows, which is what a playlist can hold.
- **The list:** titled Add to Playlist, saying what's being added ("Add “Dune” to:", or "Add every
  episode of “Severance” to:" for a show), then the profile's playlists with how many titles each
  holds. Smart playlists aren't listed, since they fill themselves (as on the web).
- **Choosing one** adds the title (`POST /api/v1/playlists/{id}/items`, in the v1 contract), closes
  the list, puts the focus back on the ⋯ or card, and shows "Added “Dune” to Weekend Picks", or that
  it couldn't, the same kind of note Play Next shows.
- **No playlists to add to:** the list says to make one on the web first, with Close. If the
  playlists don't load, it offers Try Again.

**Fixed on the way:** a menu whose items arrive after it opens (Play Next and Add to Queue appear
once the server says it keeps queues) could run off the bottom of the screen, because its height
was measured only as it opened. Menus are now measured whenever their contents change and move up to
fit.

## Decisions

- **Existing playlists only:** the web's picker can also make a new playlist by name. Typing a name
  with a remote is slow, so, as Android TV does, the TV adds to existing playlists and points to the
  web to make one.

## Checks

- `npm run check`: types, webOS and Tizen builds, ES2016 syntax check, all pass.
- In desktop Chromium (the browser build) against a scratch Arc with two ordinary playlists and one
  smart one, driven with the remote keys from Dune's ⋯:
  - the menu fits on screen with Add to Playlist… after Add to Queue (`more-menu.jpg`);
  - the list shows Movie Night and Weekend Picks with their counts, not the smart playlist, with
    the focus on the first (`picker.jpg`);
  - choosing Weekend Picks shows "Added “Dune” to Weekend Picks" and the focus returns to ⋯
    (`added.jpg`); the server's list then counts 1 title in Weekend Picks.
- Not driven: the no-playlists and failed-to-load states, and the card menu (the same component).
  Not tried on an LG or Samsung TV.

## Logging

None added: Arc logs the playlist requests, and the app shows a note when adding fails.
