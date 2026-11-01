# Arc TV app: notes for AI agents

The LG webOS / Samsung Tizen client for Arc Media Server. Arc's own repository holds the product
rules (`CLAUDE.md` there): they apply here too, in particular pull requests only, change notes,
logging decisions on Arc's #80, all UI text through `t()`, and never marking real-device checks done
without evidence.

- Talk to Arc only through `/api/v1` (`docs/api-v1-contract.txt` in Arc). If the app needs something
  the API lacks, add it to Arc in its own PR.
- Shared code goes in `src/`; anything that differs between TVs goes behind `src/platform/types.ts`.
- Keep the bundle loadable on Chrome 53 (LG webOS 4.5, the owner's C9) from `file://`; no CSS grid or flex `gap`: run `npm run check` before every PR.
- Spotlight (from Enact) handles focus; import its pieces by name (the packages are CommonJS).
- Never commit signing material (Samsung certificates, LG seller details).
