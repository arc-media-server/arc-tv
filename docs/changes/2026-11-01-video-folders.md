# Folders view for home videos

**What changed.** An Other videos library has a Folders tab (after Videos, as the web's order),
browsing it folder by folder as the web's VideoFolders: the folders in the current one, each with
a video's picture, a "Folder" tag and how many videos it holds, then its own videos. The path
shows above the grid ("Home Videos › Holidays 2024 › Spain"). Choosing a folder goes in; Back
goes up a folder and lands on the one it came out of, then Back leaves as usual.

**API.** `GET /libraries/{id}/folders?path=`. Its fields become part of the v1 contract in
arc-media-server#327 (the JSON is unchanged, so this works with servers before it too).

**Decisions.** Folders is a tab in the library (where the web has it) rather than replacing the
Videos grid. Cards gained an optional corner tag and caption line (`Card.tag`, `Card.sub`).

**Limits.** The folder you're in isn't remembered after leaving the library.

**Logging.** No new logging: a failed load shows on screen with Retry, and the server logs its
side.
