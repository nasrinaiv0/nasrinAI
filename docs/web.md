# Nasrin and the internet

## Links people share

When a message contains a link (up to 2), the server opens the page, keeps
only its readable text (no scripts, menus or styles), and adds it to that
turn for the model, marked as data, not instructions. The page text is not
saved with the conversation. If a page cannot be opened, Nasrin is told why
and says so.

Safety rules (server-side request forgery): only `http`/`https` on the normal
ports, no passwords in links, and internal or private addresses are refused,
checked again at the moment of connecting and on every redirect (at most 3).
Pages are cut off at 8 seconds and 1.5 MB, and only text-like pages are read.
`LIMIT_GUEST_WEB_HOUR` / `LIMIT_USER_WEB_HOUR` cap how many reads and
searches one person can trigger per hour. `WEB_LINKS=false` turns it off.

## Web search

Questions that need fresh facts ("today", "latest", "weather", "news",
"price of…", "search the web…") are answered with OpenAI's web search tool
(Responses API, `tools: [{ type: "web_search" }]`), and the answer lists its
**Sources**. It uses `WEB_SEARCH_MODEL` (default `gpt-5.4-mini`). The model
must have a price in `config/model-prices.json` (or `MODEL_PRICES_JSON`):
without one the spend check cannot size the call and every search would be
skipped, so an unpriced setting falls back to the default with a start-up
warning. If the model does not support the tool, the log says
`web search failed` and Nasrin answers without the web. Set
`WEB_SEARCH_MODEL=` (empty) to turn search off.

If a question did not look current but the model's draft says it lacks
current facts ("check the web", "knowledge may be outdated", "can't check live
news"; `GAP` in `src/web/search.js`), Nasrin runs the web search instead and
the page replaces the draft. A search without source links is never shown;
the regular answer is used. The prompt also forbids mentioning a knowledge
cutoff or an inability to browse, and asks for a direct answer (no clarifying
questions first) on news and updates.

Questions about browsing itself ("can you browse the internet?") are answered
from the prompt without a search; with search on, the prompt tells the model
it can search and never to claim it cannot browse.

Cost: OpenAI charges per search call (`config/model-prices.json`,
`tools.web_search`) plus tokens. Each search is counted in the budget and only
runs if it fits (see [routing.md](routing.md)).
