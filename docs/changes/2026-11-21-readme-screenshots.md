# README pictures retaken in the Android look

The README's pictures now show the screens from the two Android-look batches (#37, #38). They were
taken from main in the browser build at 1920×1080, against the shared screenshot library.

- Retaken: `home`, `film`, `show`, `library`, `search`, plus `settings`, `sign-in` and `profiles`, which
  #38 also changed.
- Kept: `watch-together`, since neither batch changed it.
- The library picture now shows the Movies library on its Recommended tab, so its alt text
  says that.

## Checks

- Looked at each picture; nothing was broken. No code changed, so `npm run check` wasn't run again.

## Limits

- Home's first-row captions sit at the bottom edge, as noted in #38.
- The sign-in picture shows the browser build's `localhost:5173/link` address, as the old one did.

## Logging

Nothing: pictures and the README only.
