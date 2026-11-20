# Watch Together invitations on LG/Samsung

The second Watch Together PR for the TV app, after the room codes PR (arc-tv#27, which this is
based on). It follows arc-media-server's `docs/WATCH-TOGETHER-API.md` ("Invitations") and Android's
`ui/together/InvitePicker.kt`, `Together.kt` and Home row, with the same names and controls as
Android, the Apple TV app and the web.

- **Invite People…:** a title's More menu → Watch Together now opens Invite People… (Android's flow).
  - It lists who this profile may invite (`GET /people?item_id=`). Each person has a line under their
    name: "Friend" or "Profile on this server".
  - People who can't watch the title are shown dimmed with "Can't watch this title". They can be
    focused and read, but OK does nothing: everyone invited must be able to watch.
  - OK ticks or unticks a person. Done appears once someone is ticked and reads "Inviting…" while it
    sends.
  - Use a Code Instead starts a room with a code, as in the first PR.
  - Done makes the room (`POST /rooms`) with nobody in it yet. "Your Watch Together room for … is
    ready. It's on Home under Watch Together." follows, with Join Now (focused) and Not Now.
  - Messages: nobody to invite, the list didn't load (with Retry), too many rooms waiting (429), and
    the invitation failed.
- **Inviting more from inside the room:** the host's lobby and the player's Watch Together panel have
  Invite People…. It offers everyone not already in the room or invited, and sends
  `POST /{id}/people`. The lobby lists invited people as "Invited", as before.
- **Home's Watch Together row:** it comes first among the rows, under the hero, while there are rooms
  (`GET /rooms`), as on Android and the Apple TV app. It isn't used for the hero.
  - Each card shows the title's artwork, with "You're hosting" or "Hosted by Alex" under it.
    "Watching now" is tagged on the picture while the room plays.
  - OK opens the room's menu. It says who's hosting, who's here ("Sam is here") and who's invited
    ("Invited: Kim").
  - The menu's actions are Join, or Return for the room this TV is in (`POST /rooms/{id}/join`),
    and Decline, or Cancel for the room's maker (`POST /rooms/{id}/dismiss`).
- **The Watch Together page** shows the same rooms under Join with a Code, as Rooms (Android's
  TogetherPage).
- **Live:** Arc's personal `watch_together` hint on `/api/v1/events` re-reads the list.
  `watch_together` is now in `liveTopics` (as `liveTopics.together`), because `HintBatcher` drops
  topics it doesn't know. The list is also read when Home or the page is shown, and after this TV
  starts, joins or leaves a room.

## How it works

- **`src/lib/together.ts`:**
  - `refreshRooms` keeps one request in flight and runs once more if asked meanwhile. It fetches each
    room's title once, for the artwork, and keeps what's shown if the list fails.
  - The other calls are `invitePeople`, `inviteRoom`, `inviteMore`, `acceptRoom` and `dismissRoom`.
  - `acceptRoom` on the room this TV is already in simply reopens it. Otherwise it leaves any other
    room first (one at a time).
  - A room this profile made keeps its lobby when its maker joins, as one started with a code does.
  - The code that comes with an invited room is kept, so the host's lobby shows it and Get a New
    Code works.
- **Pure helpers** in `src/lib/watch-together.ts`, unit-tested: `personDetail`, `toggleChosen`
  (people who can't watch are never chosen), `offerable`, `roomActions` and `roomPeople`.
  - `offerable` matches by name, because a participant's id is their device's membership, not
    their profile. Two-client testing found this: the first version offered Sam again while Sam was
    in the room.
- **UI:**
  - `src/components/InvitePicker.tsx` (the picker and the "room is ready" popover);
  - `src/components/RoomsRow.tsx` (the cards and the room menu);
  - `PopoverItem` gained `dim`;
  - a card's tag can carry its own icon.
- **Focus:** popovers over the lobby (Invite People… and the host's Leave question) give the focus
  back to the button that opened them. Before, it fell to the page, because the popover's own
  return skipped past the lobby.

## Decisions

- **Plex:** Plex's Watch Together invited friends by name, and the invited person found it in their
  Plex app and joined, which Arc matches. Plex has said the feature is being retired from its newer
  apps. I couldn't confirm how it looked in Plex's LG and Samsung apps, so no parity claim there.
- **Watch Together in the title menu opens Invite People… first, with Use a Code Instead in it:**
  this is Android's flow. The first PR started a code room directly; codes are now one choice away.
- **The Home row comes first, under the hero, while there are rooms:** Android and the Apple TV app
  put it there. The alternative, after Continue Watching, would hide invitations below the fold.
  Room cards don't feed the hero (the hero is for titles to watch, and an invitation needs its menu).
- **Done makes the room without joining it, then asks Join Now / Not Now:** the server's model (an
  invited room has nobody in it yet), as Android and the web.
- **People who can't watch are focusable but not choosable:** the TV's focus has to be able to land
  on them to read why, and a remote can't hover.
- **Invited rooms keep their code for the host:** Android drops it; keeping it lets the host share a
  code too without a new one. It's easy to drop if the owner prefers.

## Checks

- `npm run check`: passed (TypeScript, `test:watch-together` with 25 tests, both TV builds, the
  ES2016 old-TV check).
- `scripts/test-live-updates.mjs` (not in `check`; run with `node --experimental-transform-types`)
  passed, with a new case showing `HintBatcher` keeps `watch_together`.
- **Three clients against a scratch Arc:**
  - **Setup:**
    - the server built from arc-media-server#487's branch, run with
      `AMS_LISTEN=127.0.0.1:8199 ams -data <scratch> -config none`;
    - `tools/testmedia` plus the generated test film;
    - scratch profiles Alex (admin), Sam, Kim, and Pip, whose access is limited to TV Shows so
      that Pip can't watch films;
    - three Playwright Chromium pages of the browser build, driven with arrows, Enter and Escape
      (Back).
  - **Results:**
    - **The picker:** it lists Sam and Kim as "Profile on this server" and Pip dimmed as "Can't
      watch this title". OK on Pip does nothing. OK on Sam ticks Sam and shows Done.
    - **Done:** it made the room, with "…is ready" and Join Now focused. Not Now closed it.
    - **Home rows:** Alex's row showed both rooms ("You're hosting"). Sam's showed both ("Hosted by
      Alex"). Kim's showed only the room Kim was invited to.
    - **Kim's Decline:** Kim's menu read "Hosted by Alex / Invited: Sam, Kim". Decline removed the
      card.
    - **Alex's Cancel:** Alex's menu read "You're hosting / Invited: Sam". After Cancel, Sam's row
      lost the room within seconds without Sam doing anything (the `watch_together` hint).
    - **Joining:** Sam joined from the row and saw "Waiting for Alex to start…". Alex's row menu
      then read "Sam is here". Alex joined from the row as host, with Start focused and Invite
      People… beside it.
    - **Inviting more:** Invite People… in the lobby offered only Kim and Pip (dimmed). Inviting Kim
      listed "Kim · Invited" in the lobby, put the room on Kim's Home row, and returned the focus to
      Invite People….
    - **Back:** with the picker over the lobby, Back closed only the picker.
  - **Bugs found and fixed here:**
    - the in-room picker offered people already in the room;
    - the focus fell to the page after a popover over the lobby closed.
- **Not tried:**
  - the 429 "rooms waiting" message (only by reading);
  - friends from another server (no second server);
  - Return from the row while in the room.
- **Still needing a real TV:** the picker and row with real LG and Samsung remotes, the Magic
  Remote's pointer, and how the hint arrives after a TV wakes.
- No owner server, media, settings or keys were used. No LG or Samsung TV was available, so nothing
  here is claimed for real hardware.

## Logging

- Each event is logged once, with the HTTP status at most ("Arc: watch together: …"):
  - info: made a room for N invited, invited N more, joined a room from the list, declined or
    cancelled a room, and the rooms list didn't load;
  - warnings: who to invite didn't load, inviting failed, inviting more failed, joining a room
    failed, and declining failed.
- Names, titles, room ids, codes and tokens are never logged; counts only.

Screenshots: `docs/changes/2026-11-20-watch-together-invitations/`. They show the invite picker,
someone chosen with Pip dimmed, the room ready, Sam's Home row, Kim's room menu, Alex's room menu,
inviting more, the lobby with Kim invited, and Kim's Home row.
