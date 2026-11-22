# Watch Together leaves the sidebar

## What changed

- The sidebar no longer has a Watch Together entry or page.
- With Watch Together on, choosing the profile at the top of the sidebar opens a small menu:
  Switch Profile and Join Watch Together. Without it, the profile still switches at once.
- Join Watch Together opens a dialog with the code slots and keypad (unchanged). A code that
  works closes it and the player opens on the room's lobby, as before.
- Rooms are still started from a title's menu and shown on Home's Watch Together row.

## Why

The web keeps Join Watch Together in its profile menu, and Apple TV, Roku and Kodi show rooms on
Home and start them from a title. The sidebar stays a list of places to browse (owner,
22 November). arc-android makes the same change.

## Decisions

- **Join Watch Together under the profile**, as the web's profile menu. The cost is one extra
  press for Switch Profile while Watch Together is on.

## Checks

- `npm run check`: types, both TV builds and the old-TV syntax check pass.
- Walked in the browser build with the remote keys against a small fixture server (Watch
  Together on): Left, Up to the profile, OK opens the menu; Join Watch Together opens the
  dialog with the focus on the keypad's A; Back closes it. Screenshots: `sidebar.jpg`,
  `profile-menu.jpg`, `join.jpg` (the fixture serves no rows, hence the row message behind).
- Not tried on a real LG or Samsung TV, or with a real room.

## Logging

None added: joining already logs its failures.
