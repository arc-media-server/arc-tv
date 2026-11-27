# Send logs on LG and Samsung

Settings sends recent app events to the current Arc server on request. Detailed logging lasts two
hours. The journal keeps up to 3,000 fixed events in browser storage and clears on sign-out. A
runtime error can prompt for a report the next time the app starts. Reports contain only event codes,
timestamps and levels. Diagnostic POSTs refuse redirects.

Checks: privacy unit test, npm run check for webOS and Tizen, and a pinned Chromium Settings harness
against a scratch Arc server. Physical TVs and device crash persistence were outside this check.

Server dependency: [Arc Media Server #508](https://github.com/arc-media-server/arc-media-server/pull/508).
