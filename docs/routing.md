# Smart routing: the cheapest model that can do the job

Each message goes to the **cheapest model that can answer it well**. Strong
models are used when the message needs them, never just because they exist.
The user still sees one assistant, Nasrin.

```
message ─▶ can code answer it? ──yes──▶ answer (no model, no cost)
              │ no
              ▼
           what does it need? (task, level 1–5, private data?)
              ▼
           cheapest candidate at that level that is allowed:
             • within the tier's range (Quick 1–2, Pro 1–3, Max 1–4, Ultra 1–5)
             • private data never goes to a service that trains on it
             • the model is compatible with task, privacy, tools, and attachments
              ▼
           call ─▶ answer empty or cut off? ─▶ one level up (bounded)
              │      model down? ─▶ next candidate at the same level, or the same
              │                     model once more after 1.5 s (bounded by MAX_RETRIES)
              ▼
           answer + telemetry (task, level, model, tokens, cost; no text)
```

## Levels and models

| Level | Meant for | Default candidates (cheapest first) |
| --- | --- | --- |
| 0 | Arithmetic, percentages, email-format checks | Code, no model |
| 1 | Chat, translation, short writing, simple support | own model (auto/local), `gemini-3.1-flash-lite`, `gpt-5.4-nano` |
| 2 | Simple code, analysis, longer writing | `gpt-5.4-nano` (low reasoning) |
| 3 | Debugging, careful technical work | `gpt-5.4` (medium) |
| 4 | Architecture, security design, big refactors | `gpt-5.4` (high) |
| 5 | Whole-system redesigns, long-horizon planning | `gpt-5.4` (high) |

**Coding specialist lane:** Claude is not part of the general levels. **Max** uses Claude Sonnet 5.5 for coding/debugging. **Ultra** uses Sonnet 5.5 for levels 2-3 and upgrades to Claude Opus 5.5 only for levels 4-5. If Anthropic is unavailable or fails, routing falls back to the normal same-level provider pool. This is a hard tier/task gate, so `ROUTE_LEVEL_n` overrides cannot expose Claude to Quick/Pro or to non-coding work.

Model ids were checked against OpenAI's and Google's model pages on
2026-10-05. `gpt-5` and `gpt-5-mini` are marked deprecated there, so they
are no longer defaults. Change any level with `ROUTE_LEVEL_n`; ids appear
nowhere else in the code.

The tier a person picks sets **how high** routing may go, not where it starts.
"hi" on Ultra is still answered by a level-1 model.

## Provider billing and usage limits

Provider accounts are the source of truth for model operating costs. NasrinAI does
not gate model, image, speech, realtime voice, or video requests using local
per-model price snapshots or estimated USD reservations. If a provider response
includes an actual billable cost, usage telemetry records it; otherwise cost is
unknown (`null`), not a guessed amount or zero.

Keep provider-side billing alerts and spend caps enabled for every configured
provider. Provider dashboards and invoices may update asynchronously and are
authoritative for final charges.

Application safeguards remain separate from money: authenticated ownership and
plan checks, token allowances/reservations, hourly caller/IP abuse limits,
per-plan image-generation quotas, supported model/media capabilities, video
duration and quality restrictions, and the account-scoped realtime daily/token
allowances. These controls limit access and exposure but are not an exact USD
spending cap.

### Media and realtime

- Web search remains subject to caller/IP limits and the normal token allowance.
- Generated speech remains limited per caller and IP; provider billing applies.
- Video remains asynchronous and restricted to eligible plans and supported provider capabilities. If a provider does not return a final cost, NasrinAI leaves the cost unknown and does not invent a fallback estimate.
- Realtime voice keeps its shared daily allowance across sessions/devices, resetting at Manila midnight: Quick 5 minutes, Pro 15, Max 20, Ultra 30. It also reserves `REALTIME_TOKEN_RESERVE_PER_MINUTE` token-quota units per started minute against the applicable paid actor allowance and business-tenant ceiling. These are conservative quota units, not provider-reported token counts. Sessions can be shortened or refused by plan, token, or abuse controls. Provider account controls govern actual USD spend.

## Saving tokens

- History sent per level: 6k characters at level 1, up to 32k at level 5.
- Reply allowance per level: 700 tokens at level 1, up to 3,200 at level 5.
- The system prompt is the same first block every time, so providers that
  cache prompts can reuse it; cached tokens are recorded.
- The same first, public, simple question is answered from memory for
  `RESPONSE_CACHE_MINUTES` (never with contact details, files or history).

## Watching it

Run [migration 003](../db/migrations/003_routing.sql), then in the Supabase
SQL Editor:

```sql
select * from public.routing_daily order by day desc, cost_usd desc;
```

It shows calls, successes, escalations, cache hits, tokens, cost and cost per
successful answer by day, level, task and model. If one task category
fails or escalates often at a level, move it up; if a cheap model handles a
category well, keep it there. The 90 / 7 / 2.5 / 0.5 % split is a goal to
watch, not a rule to force.

## Cost simulation

`node scripts/simulate-routing.js` runs a synthetic workload (1,000 simple,
100 moderate, 25 complex, 5 extreme messages) through the real classifier,
ranges and prices with assumed token sizes. The token sizes are guesses;
compare them with `routing_daily` once there is real traffic.

## Turning it off

`ROUTING=fixed` goes back to one model per tier (`TIER_*`).


## Multi-provider routing baseline (2026-10-09)

NasrinAI is capability-first and provider-agnostic. The routing order is:

1. classify intent/task complexity
2. constrain by the caller's Quick/Pro/Max/Ultra tier range
3. apply privacy and provider-policy constraints
4. choose the cheapest capable configured candidate
5. fail over or escalate within bounded limits
6. validate the result and record telemetry/cost

Current candidate family:

- General Level 1: Gemini 3.1 Flash-Lite, GPT-6 Luna
- General Level 2: GPT-6 Luna
- General Level 3: GPT-5.6 Terra
- General Level 4: GPT-6.1 Sol
- General Level 5: GPT-6 Astra
- Max coding/debugging: Claude Sonnet 5.5
- Ultra coding/debugging: Claude Sonnet 5.5 at levels 2-3; Claude Opus 5.5 at levels 4-5

The exact general candidates remain configuration-driven through `ROUTE_LEVEL_1` through `ROUTE_LEVEL_5`. Claude is a separate capability route, not a general fallback.

Privacy is a routing constraint, not a pricing optimization. Sensitive content must not be routed to a provider whose configured policy indicates training on submitted data. Tool-dependent requests are kept off the current Anthropic adapter until its tool-format bridge is explicitly enabled.

Image and video are separate capability routes. Image generation keeps its own tier/budget controls. Video remains asynchronous and is available only on Max and Ultra plans and uses Gemini Veo 3.1 Standard by default for final quality; Veo 3.1 Fast is the lower-cost operator choice. OpenAI's Sora 2 API is not a production option because OpenAI removed the Sora 2 API/Videos API on September 24, 2026.

Provider-side billing dashboards and invoices are authoritative for actual costs. Do not add per-model USD prices to runtime routing policy; model availability is governed by explicit route configuration, capabilities, privacy policy, plan, token quotas and abuse controls. Keep `config/model-prices.json` out of production runtime imports.


## OpenRouter chat model pools

With `OPENROUTER_API_KEY` configured, the requested DeepSeek V4/V4.1 Flash, GLM 5.3 Flash, MiMo V2.6 Flash/Pro, GPT-6 Luna/Luna Pro, Claude Haiku 5.5, Qwen3.8 Flash/27B, and Ling 3.1 Flash models are active default candidates for paid tiers. Task-aware ordering and existing capability, privacy, tier, and quota checks still apply. Provider-reported usage and billing remain authoritative.

Quick/guest remains Nemotron-first and is limited to those Nemotron models plus `openai/gpt-6-luna` as an emergency OpenRouter fallback. It cannot fall through to Luna Pro, MiMo Pro, or other paid-tier candidates, including with a `ROUTE_LEVEL_n` override. Catalog presence is not proof of account-level availability; authenticated live smoke tests are required before each endpoint can be called verified.


## Live OpenRouter model discovery

When OpenRouter is configured, paid-tier routing supplements the maintained shortlist
with models discovered from OpenRouter's live `/models?output_modalities=all`
catalog. Discovery is capability-filtered: general routes require text output,
vision requests require image input, tool-using requests require advertised tool
support, and specialized Decisions, image, video, audio, embedding, reranking, and
PDF tasks are not treated as ordinary chat routes. Quick/guest remain on the
explicit Nemotron-first and emergency allowlist.

Live discovery means a model is eligible to be attempted; it does **not** mark the
model as live-tested or guarantee account access, provider uptime, or quota. Catalog
failures do not interrupt configured static routes.
