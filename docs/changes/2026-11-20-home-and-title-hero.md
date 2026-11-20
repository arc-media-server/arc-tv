# Home's hero and the title page's description, as Android and Apple TV

The owner noticed two places where LG/Samsung differed from the other TV apps:

- **The title page** put the description to the right of the buttons. Android's (owner,
  16 November) and the Apple TV app's put it under the logo, with the buttons below.
- **Home** had a carousel of up to six featured titles, with its own Play and More Info buttons,
  dots and a nine-second timer, kept apart from the rows below. Android's and the Apple TV app's
  hero instead describes whichever card has the focus, with Continue Watching (the first row) just
  under it.

## What changed

- **Title page (`Details.tsx`):** the logo comes first, then the description (three lines, with
  MORE when it's cut short, then the year, length and quality labels), then Play and the round
  buttons. Up from Play goes to the description when it can open; Down goes back to Play. Play
  still has the focus when the page opens.
- **Home (`Home.tsx`):**
  - The hero shows the focused card's artwork, logo (or name), details line and three lines of
    description. It has no buttons: OK on a card opens it and holding OK gives its actions, as on
    the other apps.
  - Focus starts on the first card of the first row, or on the first Watch Together room when
    there are rooms (Apple's top row).
  - The hero follows the focus after 200 ms. Moving quickly along a row doesn't load every
    backdrop on the way (old TVs).
  - The hero shares a block with the first row, so Up to that row brings the hero back into view.
    Further rows scroll up over the dimmed artwork, as before.
  - The hero is 540 px tall, so the first row's posters and their captions fit on screen
    (thumbnails have room to spare). Android's is 60% (648 px), but its posters are smaller.
  - The carousel's timer, dots, Left/Right handling and the `home.hero.view` and `home.hero.info`
    strings are removed. `RoomCards` takes `first` so a room can take the first focus.

## Decisions

- **Android and Apple TV are the model here**, not Plex: the owner already chose their Home and
  title page, so I didn't re-check Plex's TV apps for this.
- **The 200 ms delay** is mine; Android crossfades in 300 ms. Change `HERO_FOLLOW_MS` if it
  feels slow on a real TV.

## Checks

- `npm run check`: passed (TypeScript, the tests, both TV builds, the ES2016 old-TV check).
- **The walk:** the browser build in Playwright's Chromium, driven with the remote keys, against
  a scratch Arc (`AMS_LISTEN=127.0.0.1:8199 ams -data <scratch> -config none`). Its library had
  three generated movies with generated backdrops, logos and posters, and edited descriptions.
  - Home opened with the focus on the first card and the hero showing it. Right moved the hero to
    the next card.
  - Down scrolled to the next row, and the artwork dimmed. Up brought the hero back.
  - The first poster card measured 625–1071 px, inside the screen.
  - On the title page the logo, description and buttons stack (logo 431–631, description
    645–840, buttons from 858). Up from Play went to the description; Down returned to Play.
- **Not seen on a real LG or Samsung TV.** How quickly the hero follows the focus on webOS 4.5's
  Chrome 53 still needs a real TV.

## Logging

None: layout only, nothing new can fail.

Screenshots: `docs/changes/2026-11-20-home-and-title-hero/`.
