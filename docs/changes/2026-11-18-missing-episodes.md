# Show Missing Episodes on LG/Samsung

Show/Hide Missing Episodes sits beside the existing season actions. It uses the existing
`GET /api/v1/series/{id}/seasons?missing=1` API, with authentication through the normal client.
Provider-only episodes remain focusable for reading, are dimmed and labelled Not on disk,
and cannot play or open card actions. Watched/Shuffle actions still count only on-disk files.
Missing-only seasons and shows with no on-disk episodes retain the visibility control.

The choice is off by default and local to the open show; refresh/return retains it. Season
selection uses a stable season key so inserted missing-only seasons do not change the selected
season. Missing cards have stable fallback keys (they have no item ID). Stale replies are ignored;
a failed toggle keeps the last successful view and displays the existing toast.

## Decisions

Reuses this app's existing season action buttons, rather than adding a settings page/menu.
Follows Arc Android/Kodi's local show choice. Plex/PM4K's equivalent missing-provider control
could not be confirmed in the bounded comparison; no Plex parity claim. Provider coverage and
ordering come from Arc; this does not scan media or fetch providers directly. No server change.

## Checks

- Latest fetched main `ead7f74`, clean isolated `codex/tv-missing-episodes` worktree.
- `npm run check`: passed once (TypeScript, webOS, Tizen, old-TV syntax).
- Focused actual Details/Spotlight browser regression in pinned Chromium passed: default hidden,
  show/hide, focus and selected season retention after inserting missing seasons, multiple
  provider-only cards, missing-only/empty seasons, OK/context guards, API authentication, failed
  toggle/retry, and late response rejection. No unexpected page errors or mutation requests.
- Initial walk reached the final empty-state assertion but used the wrong fixture text selector;
  corrected the selector, strengthened the late-response case and reran only this browser test.
- Screenshot: [actual browser view](2026-11-18-missing-episodes/missing-episode.jpg).
- Reproduction: with existing dependencies and pinned browser available, set
  `ARC_PLAYWRIGHT_PACKAGE` to an installed `@playwright/test`, then
  `node tests/missing-episodes.mjs`. Optional `ARC_SCREENSHOTS` saves a JPEG. The test cleans up
  its Vite process and temporary entry files.
- No physical LG/Samsung, C9 engine, remote or decoder acceptance; no owner server/data or
  production keys accessed. No server suite or unrelated checks. Existing dependencies reused.

## Logging

No new per-item/request logging. Existing API failure handling and the bounded error toast
cover this user action; no credentials, URLs or provider bodies are added to logs.
