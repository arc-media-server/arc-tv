# Play Version… on title pages (1 November)

A movie or episode page with more than one version on disk now has **Play Version…** in its ⋯
menu, as Plex does. It lists each version by edition (else resolution) with its HDR, codec and
size, and playing one starts from where the title was left, with that file
(`POST /api/v1/items/{id}/playback` with `file_id`, as the player's Version menu already sends).

- Show pages don't offer it (a show's versions are per episode; the episode's page does).
- Files Arc can't find (`missing`) and later parts of multi-part files aren't listed.
- `PlayOptions.fileId` carries the choice to the player, which asks for it on its first load.

Logging: none added; the playback request is logged by the server as before.
