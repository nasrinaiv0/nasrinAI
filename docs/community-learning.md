# NasrinAI Community Learning System

## Current release: opt-in, redacted, review-gated examples

This release uses the existing improvement-consent and improvement-example tables. It does not fine-tune foundation models and does not treat a stored conversation as verified truth.

### How it works

1. Guest and signed-in Quick users can explicitly opt in through `/v1/improvement-consent`.
2. Only new, eligible Quick-tier turns after the current consent version is granted may contribute.
3. The capture path rejects common sensitive topics, secrets, and direct contact details; applies the existing external-provider redactor; and excludes attachments, coding, web-sourced answers, and tool/search-like requests.
4. A sample is stored as a time-limited `pending_review` example. It is never used as shared context until a reviewer approves it.
5. Approved examples are retrieved with bounded lexical matching and clearly marked as untrusted reference material in the prompt. They are not instructions and must not be treated as ground truth.
6. Withdrawal removes that subject's contributed examples; the existing retention job removes expired examples and examples without a current grant. Guest examples expire within 24 hours under the existing database policy.

### Privacy and operational limits

- Consent defaults to off. The previous `2026-10-10-preference-only` value is not accepted for collection.
- Platform-only: business tenant content is never collected or used as community learning.
- Sample capture is best-effort and must never fail an otherwise valid chat response; it performs a bounded storage operation after answer generation, so a database request may add a small amount of latency.
- Existing RLS and service-role-only database permissions remain in force.
- This is an MVP retrieval layer, not model training. Fine-tuning would require a separate reviewed dataset/export pipeline, evaluation gates, and explicit approval.
- The current retrieval is bounded lexical matching over the latest 100 approved examples. Embedding-backed retrieval using `nvidia/nemotron-3.5-embed-8b:free` is a follow-up step after validating the live OpenRouter embeddings endpoint and model availability.

## Requested OpenRouter model pool

These are capability roles, not promises that each free endpoint will always be available:

| Model | Intended role | Important constraint |
|---|---|---|
| `baseten/mammoth-1:free` | General Quick chat candidate | Verify live text capability and quota |
| `inception/mercury-decide:free` | Intent/decision candidate | Use the Decisions endpoint only if advertised; not assumed to be a chat-completion model |
| `nvidia/nemotron-3.5-embed-8b:free` | Semantic embeddings | Must use the embeddings endpoint; not a response-generation model |
| `nvidia/nemotron-3-ultra-550b-a55b:free` | Complex text reasoning candidate | Verify current context, latency, and free availability |
| `thinkingmachines/inkling:free` | Alternative reasoning/generation candidate | Verify current text capability and free availability |

Before routing these models in production, validate each model against OpenRouter's live capability catalog, free pricing/quota, and provider fallback behavior. Never route embeddings or structured decisions through ordinary chat completions.

## Validation

Run `npm test`. Tests cover opt-in enforcement, candidate filtering, review gating, platform scoping, withdrawal, and failure isolation. Apply no new database migration for this MVP: migrations 018–020 already define consent events, pending examples, review/deletion controls, and retention cleanup.
