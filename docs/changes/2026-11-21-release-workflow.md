# Releases from a one-click build

**What:** a new `.github/workflows/build.yml` (arc-media-server#488). Actions → Build → Run
workflow on `main` runs `npm run check`, packages the LG `.ipk` (LG's `ares-package`) and the
Samsung app folder as an unsigned zip, writes `SHA256SUMS.txt`, and publishes a pre-release
`tv-build-<run>` with GitHub's generated notes. A `v*` tag makes a normal release.

**Versions:** `package.json`'s major.minor plus the run number (`0.1.57`), or the tag's version,
stamped into `appinfo.json` and `config.xml` in the run only, so each build installs over the
last and the release name matches the app.

**Decisions:**
- Only a manual run on `main` or a `v*` tag releases; `[build]` pushes and manual runs on other
  branches keep a run artifact only, so agents can't publish. Nothing runs on pull requests.
- Samsung signing needs a Samsung author certificate and Tizen Studio's CLI, which CI doesn't have
  yet, so the release carries the unsigned app and says so. Adding signing from repository
  secrets is a later step; signing material never goes in git.
- `contents: write` only on the release job; a newer run never cancels one that's publishing.

**Checks:** `npm run check` passed locally; the version stamping, `ares-package` (version 0.1.7
`.ipk`) and the Tizen staging ran locally; the workflow parses as YAML. `actionlint` wasn't run
(not installed here). The workflow hasn't run on GitHub: the owner does the first release.

**Logging:** nothing new in the app.
