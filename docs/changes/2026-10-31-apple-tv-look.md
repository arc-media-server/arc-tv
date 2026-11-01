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

**Home hero (owner's pick, 31 October).** Home opens on a full-screen hero, as the Apple TV app's:
the first two titles of each row with artwork (one per title, at most six) take turns, each with
its logo, details, labels and description, a Play button (Resume or Play S1 · E3 as the title page
says; View for a show) and a round More Info button. Right from the last button and Left from the
first move between titles (Left on the first title goes on to the sidebar), the next one comes by
itself every nine seconds while the hero is in view, and dots show which is shown. The rows peek in
below and scroll up over a dimmed copy of the artwork, as on a title's page; Home's rows no longer
change the backdrop as the focus moves. The hero's backdrop and round button are shared with the
title page (`HeroBackdrop`, `RoundButton` in `components/Backdrop.tsx`).

**Search and libraries (owner's pick, 1 November).** Search's field is a glass pill with a
magnifier (white when focused), with a large magnifier and a line of help below it until something
is typed. Movies and shows now come together as Top Results (alternating, each in Arc's best-first
order) on wide artwork cards with the title's logo, then People and Episodes as before. A library's
tabs sit in a glass segmented control (the current one lighter, the focused one white); Sort and
Filters are glass buttons whose lists are the floating list, opening under the button and staying
there as choices change the button's label (`Popover` takes the opener's box for this). Filters'
pages (genre, decade, quality) change inside one list, so Back and closing return to the Filters
button.
