# An Apple TV look for the TV app

**What changed (owner's requests, 31 October).**
- Home's cards show the title and a second line (S1 · E3 and the episode title, or the year), as
  the Android app and Plex do.
- The sidebar opens as a floating rounded panel over the page with smaller items, the profile and
  the time at the top (selecting the profile switches profile). Closed, it stays a column of icons.
- A title's menu (hold OK, or ⋯) is a floating list beside its opener, its top level with the
  card's, each choice's name on the left and icon on the right.
- Focus is a white outline, a slight lift and a dark shadow; the teal glow is gone.
- A title's page: full-screen artwork, the logo low on it, the Play button and round buttons on one
  line with the description and details beside them; the rows below scroll up over a dimmed copy
  of the artwork; an Information block (genre, released, run time, rating, studio, original
  language, starring, directed and written by) closes the page. From Beginning, Shuffle and Go to
  Show became round buttons, named under the row when focused.
- Settings (the gear at the foot of the sidebar): the profile's playback choices (Auto-Play, Skip
  Intros, preferred audio language) and subtitle choices (when to show, language, size, colour,
  background, position), saved to the profile through `PATCH /api/v1/me/prefs` so every app shares
  them; and This TV (the server, with a switch, and Sign Out). Choices open the same floating list
  as the title menu. Skip Intros now skips each intro and recap once, as the web player does.
- The player's controls follow tvOS: the title and episode at the bottom left, the buttons (web
  order) in a row of round glass buttons at the bottom right with the focused one named above
  them, then a thin white progress bar with elapsed and remaining time. Its subtitle, audio,
  speed and info lists are the floating list, opening above their button.

**Logging.** None added: saving a preference failing shows the usual error toast and the request
is in the server's log.

**Limits.** No frosted-glass blur (Chrome 53 has no backdrop-filter), so panels are near-opaque.
The Arc logo left the sidebar for the profile row. Checked in desktop Chrome only. The Android app
is to follow the same look (the owner will arrange it).
