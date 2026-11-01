# Search finds collections and genres (1 November)

Search now shows the two kinds of result the web's Search already does, from the same
`GET /api/v1/search` answer:

- **Collections:** a row of collection posters after People; OK opens the collection.
- **Genres:** a row of glass pills ("Drama · Movies · 4"), last. OK opens that library on its
  titles, filtered to the genre, as the web's genre links. Back from there returns to Search with
  the results still showing, rather than going Home.

Details: the library's section carries the genre and where it came from (`fromSearch`); a library
opened on a genre doesn't change the sort and filters remembered for that library. A library's
selected tab is now its default focus, so arriving on the Titles tab doesn't switch to Recommended.

Logging: none added; Search's request was already logged by the server.
