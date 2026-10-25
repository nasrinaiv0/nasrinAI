## Phase 3–5 priority follow-up — OpenRouter search and billing (2026-10-25)

- Production logs showed repeated HTTP 400 failures for the Responses API web-search route configured with `openrouter/auto`. Route the default and that specific Auto setting to `nvidia/nemotron-3-super-120b-a12b:free`, which OpenRouter currently documents as supporting the Responses API and tool calling. Explicit non-Auto model overrides remain supported.
- Replace the Owner Command Center's legacy `/api/v1/activity` request with the documented OpenRouter Analytics API. Query available metric identifiers, use bounded 7/30-day windows, keep provider-reported spend separate from Supabase cost records, and treat credits metadata as optional.
- Add regression tests for search model selection and billing analytics response shape, auth header, date bounds, and credits-endpoint failure isolation.
- **Security/cost:** no provider secrets or prompt/completion content are added to logs. The search model is free-tier; the feature still depends on OpenRouter's web-search tool/engine availability and is not a promise of zero cost for the web-search service itself.
- **Validation:** pending CI and preview/production smoke tests on the final revision. Do not claim live search or billing fixed until those checks pass.

## Phase 3–5 audit snapshot (2026-10-25)

- Record read-only production evidence for the active Vercel commit, Supabase migration-label drift, OpenRouter telemetry grants/RLS, the Auth leaked-password-protection warning, and a historical Connect redirect rejection.
- Explicitly retain Phase 3–5 as open: the telemetry policy change is defense in depth, and migration reconciliation, Auth configuration, provider live smoke tests, spend/idempotency checks, and end-to-end release tests remain outstanding.
- **Validation:** evidence is based on read-only Vercel/Supabase inspection and source review. No production migration, Auth setting, or paid provider generation was executed.

## Phase 3 — explicit OpenRouter telemetry access boundary (2026-10-25)

- Add migration `066_openrouter_logs_explicit_deny_policy.sql` with an explicit restrictive `USING (false)` / `WITH CHECK (false)` policy for `anon` and `authenticated` on `public.openrouter_logs`; revoke browser/public privileges and preserve server-side `service_role` select/insert.
- Add `db/tests/066_openrouter_logs_explicit_deny_policy.test.sql` to verify RLS, deny-policy shape, browser-role privileges, and service-role access.
- **Validation:** migration and SQL regression test added to the feature branch. They have not been run against CI or production, and the migration has not been applied to production. Do not merge/apply until database tests and Documentation Gate pass. This defense-in-depth change does not reconcile historical migration drift.

## Phase 3 transcription discovery CI fix (2026-10-25)

- Fix task-filtered model discovery: transcription returns text, so catalog discovery accepts text-output models while requiring explicit audio input.
- Keep modality checks strict and cover audio-input/text-output eligibility in regression tests.
- **Validation:** rerun CI and Documentation Gate; do not merge unless required checks pass.

## Phase 3 modality fixture correction (2026-10-25)

- Update the transcription adapter fixture to model audio input and text output accurately; preserve strict runtime modality validation instead of relaxing capability gates to satisfy an outdated fixture.
- **Validation:** CI and Documentation Gate must pass on the latest PR head.

## Phase 3 adapter CI follow-up (2026-10-25)

- Preserve supported OpenRouter catalog modality aliases for speech and transcription while keeping them on their dedicated endpoints.
- Correct the rerank adapter regression fixture to assert the requested `topN` bound.
- **Validation:** rerun CI and Documentation Gate on the updated PR head; no merge until both pass.

## feat/phase-3-openrouter-capability-adapters (2026-10-25)

- Add validated provider adapters for OpenRouter image generation, TTS, transcription, embeddings, structured decisions, and reranking; keep specialized capabilities out of generic chat routes.
- Validate model IDs, audio and image payload bounds, embedding vector shape, transcription output, reranking indices/scores, and provider errors. Image responses must contain supported base64 data; adapter deliberately does not fetch arbitrary provider-returned URLs.
- Correct catalog output/input modality matching for speech, transcription, and embeddings. Add bounded embedding validation and a dedicated `/rerank` request/response path.
- Add regression tests for adapter normalization, invalid payloads, malformed responses, required client methods, and SSRF-safe image handling.
- **Validation:** CI must pass on the final PR head. These are adapter implementations and mocked contract tests; live credentials, model-specific endpoint support, cost settlement, and deployed end-to-end provider smoke tests remain release gates. Unsupported or unverified routes must stay disabled.

## feat/openrouter-clean-tier-routing-v2 (2026-10-25)

- Add a normalized OpenRouter model registry from the owner-provided model inventory, including capability, input/output modality, endpoint family, and explicit tier assignments.
- Keep source-inferred model IDs ineligible until the live OpenRouter catalog verifies them; do not route image/video/audio/transcription/embedding/reranking/decision tasks through chat completions by assumption.
- Add tests for model ID uniqueness, tier eligibility, inferred-ID gating, and same-capability fallback requirements.
- Document OpenRouter as the provider billing source of truth while retaining server-side tier entitlement, privacy, capability, and output validation.
- **Validation:** automated tests and documentation gate must pass on the final PR head. The registry is not proof that each provider-specific adapter is integrated; unsupported specialized routes must remain disabled until request/response schemas and provider smoke tests are verified.

## feat/chat-embedded-maps-rich-cards (2026-10-24)

- Add a registered `map` Generative UI widget that embeds Google Maps directly in the chat for a known place or route.
- Build iframe and external navigation URLs only from bounded plain-text origin/destination/query fields; never accept a model-supplied iframe URL. Add accessible titles, lazy loading, responsive mobile styles, and an explicit Open in Google Maps action.
- Extend the system prompt with map-widget selection rules and prohibit inventing current location, route distance, ETA, traffic, ratings, or opening hours. A map embed is not presented as proof that live route details were verified.
- Add regression checks for map-widget guidance, registered rendering, fixed Google hostnames, and refusal to load arbitrary iframe URLs.
- **Validation:** pending CI on the pull request. Google Maps embed behavior, CSP compatibility, iPhone Safari interaction, and real route display must be smoke-tested in the deployed preview before merge. This phase does not add Routes API-backed ETAs or traffic data.

## Owner session bootstrap diagnostics (2026-10-24)

- Add privacy-safe server-side rejection reason logs for the Owner Command Center bootstrap so production failures can be distinguished (origin/host, allowlist/IP, rate limit, token verification, email allowlist, or audit write).
- Do not log access tokens, cookies, raw client IP addresses, or email addresses. Preserve the generic 404 response and strict email + IP checks.
- Add an HTTP regression test verifying an IP-allowlist rejection is logged with a safe reason and without sensitive values.
- **Validation:** CI must pass on this PR head before merge. After deployment, inspect the production runtime logs for `owner session bootstrap rejected` and use the reason field to correct the configuration or request path.

## Owner Command Center tile visibility bootstrap (2026-10-24)

- Trigger the owner-session bootstrap immediately after a signed-in session is established so the hidden-by-default Owner Command Center tile can become visible after server verification.
- Keep the tile hidden unless `owner.nasrinai.com/v1/owner/session` returns HTTP 204; the server remains responsible for verifying both the allowlisted email and client IP. Sign-out continues to hide the tile, and clicking it still triggers fresh verification before navigation.
- Add a regression test covering the sign-in lifecycle bootstrap trigger.
- **Validation:** CI passed on the initial code commit (run 6475). The Documentation Gate failed because this required file was not updated in the PR; this entry corrects that omission. Re-run CI and the documentation gate on the updated PR head before merge. Live production verification remains required.

## OpenRouter completed video status recovery (2026-10-24)

- Normalize nested OpenRouter video status responses and preserve the original provider operation ID when the completed response omits its own identifier.
- Recognize nested `video` status envelopes and add regression tests for completed jobs whose status payload has no top-level ID.
- **Validation:** CI must pass on this follow-up PR; a fresh production OpenRouter video generation is still required to verify MP4 retrieval and inline playback end to end.

## fix/video-inline-chat-preview — show completed OpenRouter videos in chat (2026-10-24)

- Render a native inline MP4 player in the assistant message when the video job reaches `completed`, while retaining a Download MP4 link.
- Serve the authenticated, owner-checked video content endpoint with `Content-Disposition: inline` so browsers can play it in the chat instead of forcing a download.
- Validate the download URL shape before assigning it to the player; show a fallback message if preview loading fails.
- **Validation:** CI required; verify a fresh OpenRouter video end-to-end after deployment. Existing historical jobs may need a status poll to finalize and expose their content URL.

## fix/video-job-stall-diagnostics — stalled video jobs and stage telemetry (2026-10-24)

- Add structured timing logs for provider job creation, status polling, job age, and MP4 download, including provider/model/tier and a stage label without logging prompts or credentials.
- Add a configurable maximum processing age (VIDEO_JOB_TIMEOUT_MS, default 10 minutes; accepted range 60 seconds to 1 hour) so jobs do not remain in progress forever.
- Persist a safe failure when the provider result cannot be downloaded; expose transient provider polling warnings to chat and back off repeated status requests.
- Avoid automatically creating a second provider job when a status check fails.
- **Validation:** GitHub CI test suite passed on the PR head; documentation gate initially failed because this entry was missing and is now being added. Live OpenRouter generation and production Vercel logs remain unverified.

## fix/video-missing-frame-rates — video models rejected for missing frame-rate list (2026-10-24)

- **Root cause of "No available video model supports this duration and quality…" (owner screenshot 7:47 PM):** the live OpenRouter `/videos/models` catalog (checked 2026-10-24, 30 models) lists no `supported_frame_rates` for any model, and the route code skipped every model without one. So every request failed regardless of length or quality.
- A missing frame-rate list now means "provider default": the route returns `fps: null`, nothing is stored or forced, and `fps` is not sent to the provider. When a model does advertise frame rates, behavior is unchanged (requested rate, else 30, else the first).
- Unset (null/undefined) parameters are no longer sent in the OpenRouter video request body.
- **Validation:** new tests built from the live catalog shape in `test/openrouter.test.js` (route, and a mocked end-to-end create that asserts no `fps` is posted) and `test/videos-plan.test.js` (written first, failing before the change). `npm test` and `npm run check:secrets` results are in the PR. **No real video was generated**; the live create call, credits and output are still unverified.
- Not changed: the route picks the first catalog model that fits, so the model (and its price) is whichever OpenRouter lists first. Owner: set `OPENROUTER_VIDEO_PRO_MODEL`, `OPENROUTER_VIDEO_MAX_MODEL` and `OPENROUTER_VIDEO_ULTRA_MODEL` in Vercel to choose models and cost.

## fix/video-rate-limit — hourly video limit message and counting (2026-10-24)

- Chat video creation reused the sign-in rate limiter, so hitting the hourly video limit showed "Too many sign-in attempts. Please wait a while and try again." It now uses a dedicated `video` limiter with its own bucket and the message "You have reached the hourly video limit. Please try again later."
- The limit is now counted only when a video is actually started (after plan, length and model-capability checks, and not on cache hits). Before, every request that passed the plan check used a slot, so failed attempts could use up the whole hour.
- `VIDEO_PER_HOUR` is unchanged (default 1, allowed 1–10). **Owner:** set `VIDEO_PER_HOUR` in Vercel if one video per hour is too low.
- Not changed (same wrong sign-in message, different endpoints): the Video Studio render/export and ElevenLabs audio limits in `src/routes.js`. Left for a separate change.
- **Validation:** new tests in `test/videos-plan.test.js` (written first and failing before the change); `npm test` 1023 pass, 0 fail, 1 skipped; `npm run check:secrets` clean. No real video was generated.

## fix/video-generation-flow — chat video creation and "photos into video" (2026-10-24)

- **Automatic tier:** the default "Automatic" selection (and no selection) now uses the video tier of the account's plan instead of failing with "Video generation requires selecting Pro, Max or Ultra" / "Select Ultra for Ultra video options". It never goes above the plan; explicit tier choices keep their entitlement checks.
- **Clip length:** the OpenRouter video route now resolves a requested length to one the model actually advertises (an exact match on any model wins; otherwise the nearest, longer before shorter, never above the provider maximum). The resolved length is what is created and stored, and the chat shows it. Previously any length not listed exactly (for example 2 seconds) failed with "No available video model supports this duration and quality".
- **Chat flow:** removed the native resolution and FPS dialogs ("Choose 30 or 60 FPS") that blocked mobile browsers; the browser no longer forces quality or FPS (the server chooses from the plan and the model's advertised options). The clip length is read from the message ("2 sec video of…"), default 8 seconds. The "ready" notification no longer says every video is Ultra.
- **Intent:** "edit this into video", "make a video from these photos", "put these images into a reel" and "make a slideshow from these pictures" now route to video instead of ordinary chat (which answered that it cannot create video). Image deliverables (thumbnail, logo, poster…) still route to image creation.
- **Photos:** video generation starts from a description and has no image-input path, so a video request with photos attached now offers Video Studio (photo timeline, trim, titles, audio, MP4 export) instead of silently ignoring the photos.
- **Removed:** the pre-send "weekly video-seconds allowance" confirm dialog; the allowance notice is now shown in the "I'm creating your video" message. Owner: tell me if you want an in-page Confirm step back.
- **Validation:** new regression tests in `test/openrouter.test.js`, `test/videos-plan.test.js`, `test/creative-intent.test.js` and `test/app-video-send.test.js` (written first and failing before the change). Real video generation against the live OpenRouter catalog and credits has **not** been run from this change; the audit's live video smoke test is still open (`docs/audit/NASRINAI_AUDIT_STATUS_2026-10-24.md`).

## PR #586 — Fix structured UI fallback tests (2026-10-24)

- Correct the base renderer's structured UI envelope regex so it matches literal `[[ui]]` and `[[/ui]]` delimiters instead of escaped-backslash patterns.
- This restores the readable search-request fallback and safe generic fallback for malformed payloads when the optional UI enhancer is unavailable.
- **Validation:** The latest CI run showed 2 failures in `test/reply-format.test.js` (tests 688 and 689). Re-run the test suite and Documentation Gate after this fix; results are not yet verified.
