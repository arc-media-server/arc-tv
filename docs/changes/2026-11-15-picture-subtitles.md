# Picture subtitles (PGS, VobSub) are burned in (15 November)

**What changed.** Picture subtitle tracks, the kind Blu-ray and DVD rips often carry (PGS, VobSub),
now show on the TV. Before, the player hid them, so a file with only picture subtitles offered no
Subtitles button at all. They are drawn into the video by Arc, as the web player does:

- The Subtitles menu lists picture tracks with the text ones, marked "Burned in".
- Choosing one restarts the stream where it is, asking Arc to convert it with that track drawn in
  (`burn_subtitle` on `POST /api/v1/items/{id}/playback`, already part of v1). Choosing Off or a
  text track goes back to a stream without it. Seeking past what's converted, a new audio track
  and a new quality keep the burned-in track; another version (file) drops it, since its tracks differ.
- Subtitles turning on by themselves (the profile's language and subtitle mode, or a forced track)
  now consider picture tracks too, preferring a text track in the same language, as the web's
  `chooseSubtitle`. When a picture track is chosen at the start, the app asks Arc once more for the
  burned-in stream before playing (the web does the same).
- Picture tracks in a separate file beside the video aren't offered: Arc only burns in tracks
  inside the file.
- If Arc refuses the burn-in (it can't convert, or the track isn't usable), the title plays
  without subtitles and a note says so, rather than failing.

**Decisions.** Same behaviour as the web player rather than a TV-only choice, so nothing goes to
arc-media-server#80. Burning in means conversion, which is heavier for the server than direct play;
this is the same trade the web and Plex make for picture subtitles on players that can't draw them.

**Checked.** `npm run check` (types, webOS and Tizen builds, ES2016 syntax) passes. In desktop
Chromium, against a scratch Arc with a test MKV carrying a PGS track (hand-made, a white box every
10 seconds): the menu shows the track as "Burned in"; with the profile's subtitle language set, the
app asks again with `burn_subtitle` and Arc answers `transcode` with "picture subtitles shown"; a
frame from the converted segments has the box drawn in; Off asks for a stream without it and
choosing the track again asks for it; a refused burn-in (simulated 400) plays on without it and
shows the note. The desktop build couldn't play Arc's converted streams in that setup at all (the
stream link points at Arc's own address and the dev page is another origin), so the picture
itself was checked from the segments, not on screen. Nothing has been run on a real TV.

**Logging.** The player writes one console warning (the TV's web inspector) when Arc refuses a
burn-in, with the HTTP status. Arc logs each playback decision, including "picture subtitles shown".

**Limits.** How each TV's player handles the restart, and how the converted picture looks there, is
still to check on real TVs (README list). ASS/SSA styling is a separate item.
