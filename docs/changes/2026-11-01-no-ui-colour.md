# No UI colour: white and black instead of teal

The owner dropped a UI accent colour across Arc's apps (1 November, arc-media-server#80).
Focus was already white; now the progress bars, timeline, spinner, sign-in code, text-field focus
and "on" round buttons are white, chosen buttons are a lighter glass (so they still differ from
the focused one), and the unwatched badge is white with black text. Arc's teal stays in the logo.

Checks: `npm run check` (typecheck, webOS and Tizen builds, bundle parses as ES2016). Not looked
at on a TV.

Logging: none (colours only).
