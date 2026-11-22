# Home's first row fits on screen; library tabs spaced apart

**What changed:**
- **Library tabs** (Recommended, Library, Collections) have their 20px gap back. The rule was
  `.tab + .tab`, but Spotlight puts a hidden marker element after each focusable, so two tabs are
  never next to each other and the rule never matched. It's now `.tab ~ .tab`.
- **Home's first row** always fits. The hero had a fixed 648px height, so a tall first row
  (Continue Watching's large backdrop cards, or posters) ran past the bottom of the 1080px screen
  and cut off the line under each title. The hero and the first row now fill the screen together:
  the hero takes whatever height the row leaves, and its text sits just above the row.

**Checks:** `npm run check` passes (types, both TV builds, the old-TV syntax check). I walked it
in the browser build (Playwright, 1920×1080) against a scratch Arc with the generated test media:
- Continue Watching first: captions end at 1048px (before: 1086px, off screen).
- Recently Added posters first: captions end at 1048px.
- Down twice then Up twice returns to the same place.
- Tabs measured 20px apart.

Screenshots are in [2026-11-22-home-and-tabs-fit/](2026-11-22-home-and-tabs-fit/). Not tried on
a real LG or Samsung TV; flexbox and `~` both work on Chrome 53.

**Logging:** none needed (layout only).
