# SmartChat: Knowledge-Isolated Answers and Capability-Based Routing

## Status and intent

This document defines the required production behavior for website-embedded SmartChat. The existing codebase has a knowledge-only tenant mode (migration 011), full-text retrieval, fixed replies for greetings/off-topic messages, and tests in `test/knowledge-only.test.js`. This specification does not claim those controls are enabled for the live portfolio tenant or that the current production widget is healthy.

## Non-negotiable behavior

1. **Business knowledge is the source of truth.** For a tenant configured as knowledge-only, all factual answers about the business must be supported by records belonging to that tenant and visible to the current visitor. Never use founder knowledge, other tenants' records, unrelated platform knowledge, web pages, general memory, or provider priors to fill gaps.
2. **Evidence before answer.** Retrieve relevant knowledge before deciding how to answer. If no sufficient evidence is found, return the configured safe fallback or ask a clarifying question. Do not guess prices, policies, availability, service details, or promises.
3. **Provider use is capability-driven, not a default.** Simple greetings, exact FAQ answers, and safe deterministic responses should avoid a model call. A provider may be selected only when an enabled capability genuinely requires interpretation, synthesis, drafting, or planning. A provider must not be used to invent missing business facts.
4. **Tools execute actions; models do not.** Sending an email, booking, modifying a record, or triggering an automation requires an explicitly configured integration, server-side authorization, tenant-scoped permissions, argument validation, and a confirmed tool result. Ask for confirmation before consequential external actions when required by policy. Never say an action succeeded unless the tool confirms success.
5. **Keep action payloads grounded.** For a provider-assisted task, pass only the minimum necessary visitor request and tenant-authorized evidence. Treat retrieved documents and visitor input as untrusted data, not instructions. Reject requests to cross tenant boundaries or expose credentials.
6. **No provider available.** If a requested task genuinely requires a provider or integration and none is available, explain that the capability is unavailable. Do not silently switch to unrelated general answers.
7. **Security and abuse controls remain active.** Keep guest session validation, origin-bound publishable keys, tenant isolation, rate limiting, and request-size limits. Knowledge-only mode must not disable these controls.
8. **Failures must be diagnosable.** Return safe public error messages while logging structured, redacted error codes for session creation, chat, knowledge lookup, knowledge writes, authorization, and rate limiting. Never log API secrets, bearer tokens, or full sensitive visitor content.

## Routing policy

- **Deterministic/no provider:** greetings, thanks, exact rule-based responses, and FAQ retrieval where the response can be returned faithfully from stored content.
- **Knowledge-grounded synthesis:** a model may paraphrase or combine retrieved tenant facts only if that tenant explicitly enables provider-assisted answers. The model instructions must require evidence-only claims, and a post-check should reject or replace unsupported factual claims where feasible. If strict knowledge-only mode is enabled, prefer deterministic extraction/templates; if model synthesis is used, it must remain constrained to retrieved evidence.
- **Authorized action path:** classify an action intent, check the integration is installed and enabled for this tenant, validate required fields and permissions, ask for confirmation where needed, execute through the server-side tool, then report the verified result.
- **Unsupported/out-of-scope:** return a tenant-configured refusal/fallback without a provider call.
- **Ambiguous intent or weak retrieval:** ask a short clarification or return the safe fallback. Do not broaden the search into global or other-tenant knowledge.

## Production configuration checks

Before enabling this behavior for the portfolio tenant:

1. Verify migrations 009 (knowledge) and 011 (knowledge-only) are applied in the correct production database.
2. Verify the exact tenant ID for the portfolio widget and confirm its tenant setting. Do not select tenants by a guessed display name if more than one match exists.
3. Confirm approved visitor-visible knowledge records exist for that tenant and are retrievable through the same caller path used by the widget.
4. Confirm the portfolio's server-side secret is a valid original secret value, belongs to the intended tenant, is active, and has the required `knowledge` scope. Never expose or log the secret.
5. Confirm the publishable widget key is origin-locked to the exact deployed website origin (for example `https://nasrinai.site` only if that is the actual configured origin).
6. Investigate the observed `POST /v1/knowledge` HTTP 403 separately from guest-session and chat errors. A successful `/api/save` response does not mean the knowledge write succeeded.
7. Test the live flow without repeated retries: create one guest session, ask one known FAQ, ask one unknown/out-of-scope question, and verify an authorized action only in a safe test integration.

## Required tests / acceptance criteria

- Known FAQ returns only facts present in that tenant's visitor-visible documents.
- An unsupported price/policy/service question gets a safe fallback and no provider call in strict knowledge-only mode.
- A request for unrelated general knowledge is declined in strict knowledge-only mode.
- A malicious instruction embedded in a document cannot change routing, reveal secrets, or access another tenant.
- No records from another tenant, founder knowledge, global memory, or web retrieval are included in strict knowledge-only prompts.
- Greeting/thanks deterministic replies do not invoke a provider.
- Provider-backed action planning cannot execute an action without the configured integration, permissions, validated arguments, and required confirmation.
- The response says an email/booking/update succeeded only after the tool confirms success.
- Missing provider/integration produces a truthful unavailable response, not a fabricated completion.
- Session creation, chat, and knowledge write failures preserve distinct error codes and redacted logs; 403 and 429 responses are not collapsed into misleading generic errors.
- Rate limits and origin validation continue to work.
- Run the full existing test suite and add focused regression tests. Do not claim production fixed until a live end-to-end test passes.

## Current known symptoms to investigate

- Portfolio save endpoint `POST /api/save` returned HTTP 200, while its server-to-server call to `https://www.nasrinai.com/v1/knowledge` returned HTTP 403.
- SmartChat has displayed session-ended and too-many-requests errors.
- Widget “Online” status only reflects widget/availability UI; it is not proof that guest session creation, knowledge retrieval, or chat works.

Do not rotate production secrets or weaken authorization/rate limits as a workaround. Diagnose the actual 403/429 cause first.
