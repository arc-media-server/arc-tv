# Star rating

The title page's existing ⋯ menu now offers **Rate…** for films,
shows and episodes. **Your Rating** reuses the existing centered overlay, menu rows and focus-following
scroller. Choices run from five stars to half a star, best first, matching Android #34. The current
choice is ticked and focused; an unrated title starts at five stars. **Clear Rating** appears only
when rated. Back closes the panel and returns to the opener.

`user_data.rating` is separate from a title's public `rating`. Saving uses
`PUT /api/v1/items/{id}/rating` with 1–10 half-star units; clearing sends zero. The shared title-change
store updates cards and details immediately and restores the prior state if saving fails, with
Android's “Couldn't save your rating. Try again.” message. There are no new product decisions or
settings. Card menus stay short and omit ratings, as Android does.

Checks: `npm run check` passed (webOS and Tizen builds, both bundles parse as ES2016);
`node scripts/test-star-rating.mjs` passed against an isolated HTTP stand-in (save, clear,
403 refusal, escaped item id and Bearer header). The real dev build was walked with remote keys
in Chromium against a scratch Arc seeded by `tools/testmedia`: save 4.5, reopen with current
rating focused, scroll to Clear Rating, clear, and Back returning focus all passed.
[Small screenshots](2026-11-17-star-rating/) show the real app and scratch movie.

Logging: no new console messages; failures use the existing API error/translated toast path. No
credentials, names or URLs are logged by this feature. Not tried on a TV; this does not certify
playback, audio or HDR on hardware. Main was checked at `a54e19b` and had no profile-rating action.
