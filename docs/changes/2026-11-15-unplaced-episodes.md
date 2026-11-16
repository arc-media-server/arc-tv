# Not in This Order: episodes the show's order leaves out (15 November)

**What changed.** When a show is shown in an episode order that doesn't include some of the
episodes on disk (a custom order, or a provider's order missing a file), those episodes used to
vanish from the TV's show page. Arc sends them separately (`unplaced` in
`GET /api/v1/series/{id}/seasons`), and the web, and now Roku (arc-roku#12), show them. The TV now
does too, so nothing silently disappears (Arc's rule):

- A last tab after the seasons, **Not in This Order**, holds them, with a line explaining why:
  "You have these episodes, but <order name> doesn't include them. They're still here so nothing
  goes missing." (the web's wording).
- Their cards have no episode number, since the order gives them none. The player and Up Next
  card no longer show "S0 · E0" for them either (`episodeCode` returns nothing for Arc's 0/0).
- Play, Resume, Shuffle and the next episode still follow the order: only the seasons count.
- Opening the page from one of these episodes (a card elsewhere) lands on that tab.
- A show whose episodes are all outside the order now shows that tab instead of "No episodes".

**Decisions.** The server chat asked to match Roku: a tab after the seasons, no episode numbers,
Play/Resume/Up Next follow the order. The TV player has no Episodes list, so there was nothing to
add there. No UI colour for the tab (the web's is amber), following the owner's white/black choice.

**Checked.** `npm run check` (types, webOS and Tizen builds, ES2016 syntax) passes. In desktop
Chromium against a scratch Arc with a two-season test show displayed in a custom order ("My Cut")
with S2E3 removed from it: the tabs read Season 1, Season 2, Not in This Order; Play still reads
Play S1 · E1; the tab shows the note with the order's name and the one card without a number;
OK on it plays that episode, and the player's heading shows no episode code. Landing on the tab
from a card elsewhere wasn't driven. Nothing has been run on a real TV.

**Logging.** None added: these come from the same request as the seasons, which Arc logs.
