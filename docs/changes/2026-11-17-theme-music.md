# Theme Music

Film and show pages play their `theme_url` once per visit when the profile's `theme_music` preference is on (the default). The existing Playback Settings rows now include **Theme Music**, after Skip Intros Automatically, using the same wording and position as Android #38.

The tune uses an authenticated binary fetch and a local Blob URL: the native audio element never receives the profile token. Only Arc's item-theme route is accepted, including the server's `?v=` cache version. Missing, unsupported or failed themes leave the page silent. Episodes do not start themes.

## Decisions

Follow Android/Plex's page-theme behavior: no loop, volume 0.25, fading by 0.02 every 60 ms. Leaving the title, opening playback or backgrounding the app cancels pending starts and fades/releases the audio. Returning from playback does not replay the tune. A reused title-page instance gets a fresh visit for its new item id and rejects the previous item's loaded state.

The existing profile-hint invalidation refreshes the preference; unrelated preference hints keep the tune playing. Turning Theme Music off stops it. This uses the shared live-update event without importing live-update code, so local Settings and page behavior stand on their own. No new UI or player controls were needed.

## Checks and limits

Fresh verification on 18 November: required check and focused theme test each run once. One
browser walkthrough checked the switch via remote Enter, authenticated playback at volume 0.25,
once-per-visit behaviour, unrelated preference invalidation and Back fade/release.

- `npm run check`: types, webOS/Tizen builds and Chrome 53 syntax checks passed. No CSS layout changes.
- `npm run test:theme-music`: eligible types, preference off, cache-version links, refused external/non-theme links, fade endpoints, authenticated binary delivery against a stand-in server twice, and unavailable-theme failure passed.
- Actual browser dev build against an isolated scratch Arc with generated `tools/testmedia`: Settings toggled and persisted, focus remained on Theme Music; an eligible title fetched its theme with Bearer authorization, played once and reached volume 0.25. An unrelated live preference hint kept it playing.
- Genuine screenshots: [Settings and title](2026-11-17-theme-music/). They show the actual browser build, not a TV.
- Not tried on a TV; physical audio output and codec support are unverified. The binary fetch buffers the theme before playback. Browser audio autoplay restrictions may leave a tune silent.

## Logging

No new logs. Missing themes, unsupported media, cancelled starts and autoplay rejection are expected silent outcomes; no tokens, URLs, names or request bodies are logged.
