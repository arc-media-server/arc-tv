# Arc TV app: notes for AI agents

The LG webOS / Samsung Tizen client for Arc Media Server (one web app with Enact Spotlight,
packaged as .ipk and .wgt, each TV's own player). Read `README.md`.

**Shared rules:** arc-media-server's `docs/AGENT-RULES.md` applies here (workflow, decisions, Arc's
design, API, logging). Read it at the start of a session: `../arc-media-server/docs/AGENT-RULES.md`
when the server is checked out beside this one, otherwise from GitHub. The essentials:

- Pull requests only: never push to main, never force push. Commits end with the Co-Authored-By
  trailer only, no session links. A change note per change in `docs/changes/`.
- Never point tests at the owner's server, data or keys. Never mark real-device checks done
  without evidence. Never commit signing material (Samsung certificates, LG seller details).
- Only `/api/v1`; if it lacks something, an additive server PR, linked.

## This app

- **Checks before a PR:** `npm run check` (types, both TV builds, the old-TV syntax check); walk
  changed screens in the browser build with the remote keys (`npm run dev`, README).
- Keep the bundle loadable on Chrome 53 (LG webOS 4.5, the owner's C9) from `file://`: no CSS grid
  or flex `gap`.
- Shared code in `src/`; anything that differs between TVs behind `src/platform/types.ts`.
- Spotlight (Enact) handles focus; import its pieces by name (the packages are CommonJS).
- All UI text through `t()` and `src/locales/en.json`.
