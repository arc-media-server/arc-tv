# Watch Together on LG/Samsung (room codes)

Watch Together comes to the TV app, following arc-media-server's `docs/WATCH-TOGETHER-API.md` and
Android's `ui/together/` (the web's `WatchTogether.tsx` and the Apple TV app's `ArcTV/Together/`
for the same names and controls). This PR covers rooms with codes. Invitations by name and the
Home row come in the next PR.

- **Starting:** Watch Together is in a title's More menu (title page, cards and episode menus),
  after Add to Playlist, when Arc offers it to the profile (`/capabilities`). A show resolves the
  episode Play would start: part-way through, otherwise the next unwatched. The room starts from
  the title's resume point.
- **Lobby, over the paused player:**
  - the title and who's here, with Host, "(you)" and each person's status;
  - for the host, the code as `XXXX-XXXX` with its minutes left, and Get a New Code;
  - Start for the host; "Waiting for Alex to start…" for everyone else;
  - Leave.
  - Back leaves. The host is asked first, because hosting passes to someone else.
- **Join with a Code:** a Watch Together page in the sidebar, after Playlists, where Android puts
  it. Eight slots and an on-screen keypad of the code's letters and digits, used with arrows and
  OK.
  - The remote's number keys type digits directly; on Tizen the 0–9 keys are now registered.
  - Delete or Backspace removes the last character.
  - A wrong or expired code gets one generic message ("That code didn't work. It may have run
    out: ask the host for a new one."). Too many tries gets a "wait" message. Joining opens the
    player on the room's lobby.
- **Recovery:** on launch and after a profile switch, `GET /current` puts this TV back in its room.
- **In the player:**
  - The room's controls (play/pause, ±10 s, the scrubber and marker skips) send room commands,
    and everyone follows.
  - Notes near the top of the picture show:
    - "Paused by Sam", "Played by Sam" and "Sam moved the room" (3 s);
    - "Waiting for Sam… 8s" with the server's countdown;
    - "You're now the host" or "Sam is now the host";
    - "This title isn't available to you";
    - "Reconnecting to Watch Together…";
    - "You're no longer in the Watch Together room".
- **Back and Stop in the player** open the room panel instead of closing the player. It has
  Close, Get a New Code (host), Leave and End for Everyone (host). A Watch Together button sits
  among the player's controls.
- **Ending and leaving:**
  - Leave plays on alone.
  - The host's End for Everyone shows the others "The host ended Watch Together" with Continue
    Alone (focused) or Close.
  - A room that has gone away (404) leaves the viewer playing alone with a note.
- **Personal playback:** audio, subtitles, quality and conversion stay each viewer's own. A
  conversion that is busy or fails doesn't end the room: the failure pane offers Leave Watch
  Together. The speed control is hidden in a room.
- **No automatic moves:** pre-roll, auto-skip of intros and autoplay are off inside a room. Only
  the host gets Up Next, and choosing it moves the whole room (`change_item`). Everyone else
  follows the room to the next title. This follows Android.

## How it works

- **Pure logic** lives in `src/lib/watch-together.ts`:
  - code formatting and typing;
  - the clock offset from `/time` samples (lowest round trip);
  - the expected position;
  - the drift decision: under 500 ms nothing; 0.5–3 s a 0.97×/1.03× speed nudge until within
    100 ms, as Android and the web; over 3 s a seek;
  - heartbeat bodies;
  - the 409 retry rules;
  - reconnect backoff (2 s to 30 s, and a 429's Retry-After);
  - display helpers.
- **The room session** is `src/lib/room-session.ts`:
  - **The stream:** one authenticated XHR for `/{id}/events`, through the `SseParser` from
    `live-hints.ts`. There's no EventSource and no token in the URL. It has a 15 s idle
    watchdog and rotates at 256 KiB.
    - 404 leaves the room; 401 signs out.
    - Any other drop rechecks `/current` and then reopens with backoff.
  - **Clock:** three `/time` samples every minute, and again after the TV wakes. A wake is a
    heartbeat gap over 10 s, or the page becoming visible again.
  - **Heartbeats:** every 2 s and on buffering changes, with the generation loaded.
  - **Commands:** each carries the last revision. On a 409 the session adopts the returned room
    and resends only if the action still makes sense:
    - Play only if the room is paused;
    - Pause only if it isn't;
    - a seek or title change only if no one else has moved the room meanwhile.
  - Room updates are applied to the player directly and never sent back as commands.
  - A held Right or Left adds to one pending seek and sends one command 0.9 s after the last
    press.
- **Wiring:** `src/lib/together.ts` holds the app-wide room state. App opens the player when a
  room is started, joined or recovered, and moves it when the room's title changes. The player's
  follow loop applies the drift decision every 500 ms.
- **Tizen:** AVPlay has no smooth speed change, so Samsung TVs rely on seeking only. Drift up to
  3 s is left alone, and beyond that the player seeks. webOS and the browser build use
  `NativePlayer.setSpeed`.

### Server gap: `started` (additive server PR)

Two-client testing found that a room made from a resume point skipped the lobby, for the host and
for everyone who joined. All the apps guess "the room has started" as "not paused, or past 0:00",
and a room created at 1:01 is paused at 1:01 before anyone has pressed Play. Only the server knows
the difference, so arc-media-server#487 adds `started` to the room (additive, always
sent).

This app uses `started` when Arc sends it. Older servers fall back to the old guess, plus a local
rule: a room this TV made stays in the lobby until it first plays. The host's lobby therefore
works either way. On an older server, guests joining a room started part-way still skip the
lobby.

## Decisions

- **Plex:** Plex's Watch Together (support.plex.tv "Watch Together" and its FAQ) has a ready
  lobby, shared play/pause/seek, and each person's own stream, audio and subtitles. Plex invites
  friends rather than using codes, and says the feature is being retired from its newer apps. I
  couldn't confirm how it behaved on Plex's LG and Samsung apps, so no parity claim there. Arc
  keeps the shared behaviour above and adds codes, which work without a friend list. Invitations
  are in the next PR.
- **Back in the player opens the room panel instead of leaving:** the room stays until you choose
  Leave. Android leaves the room when the player closes. This TV behaviour is what the handoff
  asked for, and it makes a stray Back harmless.
- **Join with a Code sits in the sidebar after Playlists, as on Android:** Apple TV puts it in
  Settings. A sidebar page is easier to find with a remote.
- **The keypad shows only the code's alphabet:** it has no 0, 1, I or O, as Arc never uses them.
  The remote's 0 and 1 keys do nothing rather than type a wrong character.
- **Leave from the lobby closes the player. Leaving mid-film plays on alone:** this matches
  Android.
- **Auto-skip of intros is off in a room:** one viewer's preference would otherwise move everyone.
  The Skip button still works, as a room seek.
- **No speed control in a room:** the room has one rate (1×).

## Checks

- `npm run check`: passed. That covers TypeScript, the new `test:watch-together` unit tests
  (23 passed), both TV builds and the old-TV (ES2016) syntax check.
- **Two clients against a scratch Arc:**
  - **Setup:** the companion server branch, `AMS_LISTEN=127.0.0.1:8199 ams -data <scratch>
    -config none`, the `tools/testmedia` library plus a generated 5-minute VP9 test film with a
    burnt-in timecode, and two scratch profiles.
  - **Clients:** two Playwright Chromium pages of the browser build (`npm run dev` with
    `ARC_URL`), driven with remote keys (arrows, Enter, Escape as Back, Space as play/pause).
  - **Harness:**
    - The dev page (:5173) and the stream links (:8199) are on different origins, so the
      harness fetched cast links from Node.
    - Mouse clicks put Spotlight into pointer mode, so the harness switched it back to 5-way
      after them.
  - **Results:**
    - **Starting:** the title menu's Watch Together opens the host's lobby with Start focused.
    - **Code entry:**
      - arrows + OK typed a letter, and Backspace deleted it while staying on the page;
      - a wrong code gave the generic message;
      - the right code typed with keys joined the room;
      - the guest's lobby shows "Waiting for Alex to start…" with Leave focused, and the host's
        lobby lists both people as Ready.
    - **Start:** both played within about 0.1 s.
    - **Pause and play:** Sam's pause paused both TVs, and Alex saw "Paused by Sam". Alex's play
      resumed both.
    - **Seeking:** three quick Right presses on Sam's TV sent one command, and both landed 30 s
      on.
    - **Drift:** a +2 s drift forced on Sam's TV was eased back at 0.97×. A +8 s jump was sought
      back to within 0.7 s.
    - **Waiting barrier:** Sam's stream was slowed and Alex jumped a minute on. Alex saw
      "Waiting for Sam… 9s" with both paused, then both carried on together.
    - **Host leaving:** Back opens the panel and Back again closes it, while the room stays.
      The host's Leave asks first (Stay focused). After leaving, Alex plays on alone and Sam
      sees "You're now the host".
    - **End for Everyone:** the other TV shows the ended pane, and Continue Alone keeps playing.
    - **Arc restarted:** "Reconnecting to Watch Together…" appeared within 1 s. When Arc came
      back without the room, the viewer got "You're no longer in the Watch Together room" and
      carried on alone.
    - **Bugs found and fixed here:**
      - Back in the lobby was taken by the player before the lobby;
      - the guest's player opened twice when two room updates came close together;
      - a held Right only counted once while the controls were showing;
      - the lobby was skipped for a room made from a resume point (the server gap above).
- **Not tried, and still needing a real TV:**
  - AVPlay seeking accuracy and how often Samsung needs a seek;
  - `setSpeed` smoothness on webOS;
  - sleep and wake (the clock resync and reconnect);
  - number-key entry on real LG and Samsung remotes (including the Tizen key registration);
  - Magic Remote pointer use of the keypad;
  - WAN jitter.
- No owner server, media, settings or keys were used. No LG or Samsung TV was available, so
  nothing here is claimed for real hardware.

## Logging

- Each event is logged once, with the HTTP status at most:
  - "Arc: watch together: …" for started a room, joined with a code (or refused), back in this
    profile's room, left the room, the room ended, no longer in the room, and signed out;
  - the room stream dropped (reconnecting) and reconnected, once per outage;
  - a 409 conflict, once per conflict;
  - a failed start, new code or End, as warnings.
- Codes, tokens, URLs, titles and names are never logged. Heartbeats, clock samples and follow
  corrections are not logged.

Screenshots: `docs/changes/2026-11-20-watch-together/`.
