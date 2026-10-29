# MCP connections

NasrinAI can use tools on remote **MCP (Model Context Protocol) servers** in chat. NasrinAI is the MCP client; the owner chooses the servers.

## Set up (Vercel → Settings → Environment Variables)

```
MCP_SERVERS=[{"name":"docs","url":"https://mcp.example.com/mcp","token_env":"MCP_DOCS_TOKEN"}]
MCP_DOCS_TOKEN=<the server's bearer token, if it needs one>
```

| Field | Required | Meaning |
|---|---|---|
| `name` | yes | 2–21 lowercase letters, digits or `_`; how Nasrin refers to the server |
| `url` | yes | The server's Streamable HTTP endpoint (`https://` only) |
| `token_env` | no | Name of another env var (starting `MCP_`) holding a bearer token |
| `access` | no | `owner` (default: only Owner Command Center emails) or `users` (every signed-in person) |
| `read_only` | no | Tool names to treat as read-only even if the server does not mark them |

Up to 10 servers. A bad entry is skipped with a startup warning; the site keeps working. Redeploy after changing.

## How it works (`src/mcp/index.js`)

- Transport: Streamable HTTP JSON-RPC (`initialize` → `notifications/initialized` → `tools/list` / `tools/call`), JSON or SSE responses, `Mcp-Session-Id` reused and renewed once when expired, protocol `2025-06-18`.
- Calls go through the connector transport (`src/connectors/request.js`): https only, public addresses checked at connect time, no redirects, 256 KB, 12 s.
- Chat tools (signed-in users with access only; never guests):
  - `mcp_list_tools` (read): tools per server with read-only flag and inputs.
  - `mcp_read_tool` (read): runs only tools marked `readOnlyHint` or listed in `read_only`.
  - `mcp_run_tool` (write): any other tool; the person taps **Confirm** first.
- Arguments are a JSON object (`arguments_json`, ≤ 3,000 chars); required inputs are checked before calling. Results are capped at 6,000 characters, marked untrusted, and treated as data, never instructions. Non-text content is not passed on.
- Tokens never reach the model, the browser or logs. Tool usage is recorded like other tools (name, outcome, time; no arguments or results).
- Chat offers the MCP tools when a message mentions "MCP" or a configured server name (or other tool cues).

Privacy Notice 2026-10-29 covers connected tool servers.
