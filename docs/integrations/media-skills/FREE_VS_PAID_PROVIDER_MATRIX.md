# Media Skills — Free vs Paid Provider Matrix

**Checked:** 2026-10-27. Pricing/terms are volatile; verify again before enabling a provider.  
**Status:** Research guide, not a promise of free generation or approval to call APIs.

## Core distinction

Open-source skill instructions are not the same as a free generation service. Classify cost across (1) skill/license, (2) runtime/compute, (3) hosted model/API, (4) storage/egress, and (5) commercial license obligations. Never label a workflow “free” unless all required components and usage assumptions are documented.

## Initial matrix

| Capability/source | What may be free | Potential charges / constraints | Current decision |
|---|---|---|---|
| Higgsfield Skills | Skill instructions under repository license, subject to its terms | Higgsfield API is separate from consumer plans; API calls use prepaid units/balance; model and concurrency pricing can change | Provider-specific candidate only; require API budget and billing confirmation |
| ComfyUI local | Open-source workflow software may run locally | GPU/hardware, power, storage, custom nodes and model-specific licenses; model downloads can be large | Candidate for local execution only after model/license/hardware audit |
| Comfy Cloud | Official pricing page advertises 5 free GPU runs for new users at time checked | Paid usage/credits and plan restrictions after free allowance; exact terms can change | Do not assume free beyond stated new-user allowance; add hard budget limits |
| Remotion | Official pricing page advertises free license for individuals and companies up to 3 people, subject to terms | Company license for ineligible orgs; automator offering listed at $0.01/render with $100/month minimum on pricing page checked | Check eligibility before using in a commercial multi-user video product |
| FFmpeg | Software can be used without per-render API billing | Build configuration and linked libraries can affect LGPL/GPL obligations; compute/storage costs remain | Candidate after build/license review |
| Provider-independent storyboards, briefs, editing plans and QA checklists | Can run using existing NasrinAI text capability if available | Existing model inference cost, token usage and storage still apply | Best first capability tier |
| Higgsfield / Veo / Runway / Seedance provider skills | Skill text may be open source | Hosted generations generally require account, credits or API entitlement; prices, terms, retention and outputs vary | Reference-only until each official provider is verified |
| iart motion packs | Some instructions/scripts may be open source | Rendering runtime, browser/AE/FFmpeg dependencies, hosted transcription, fonts/assets and provider costs vary | Per-pack review; not a single cost class |
| Voice/avatar/talking-head workflows | Planning templates may be free | Identity/voice services, consent, compute, usage credits and sensitive-data processing | Defer until consent, data and billing controls pass |

## Official verification sources

- Higgsfield API terms: https://open.higgsfield.ai/terms-of-service
- Higgsfield API pricing: https://open.higgsfield.ai/pricing
- Comfy Cloud pricing: https://comfy.org/pricing/
- Remotion license/pricing: https://www.remotion.dev/docs/license/pricing
- Generative Media Skills source and license: https://github.com/calesthio/generative-media-skills

The official Higgsfield API terms page checked for this review states that API service is separate from consumer offerings and usage draws from a separate prepaid API balance. This means a consumer subscription must not be treated as API entitlement. The Comfy Cloud page checked advertises five free real-GPU runs for new users; this is a limited offer, not unlimited free generation. Remotion's pricing page describes eligibility conditions for its free license and separate terms for automated video products.

## Required fields before enabling any provider

- Official product/API/pricing/terms URLs and checked date.
- Free trial eligibility, credit limits, expiration, per-model limitations and geography/account restrictions.
- API entitlement and whether consumer subscription includes API use.
- Unit pricing, billing events, maximum cost per job, retries/fan-out behavior and failed-job charges.
- Rate/concurrency quotas, queue behavior and timeout limits.
- Input/output retention, training use, data-processing agreement and deletion behavior.
- Output rights, attribution, commercial use, watermarking and prohibited use.
- Required environment-variable names only; no secret values in docs.
- Preflight estimate, idempotency, per-user daily/weekly budget, owner alerts and emergency kill switch.

## Safe default

Provider-independent planning and QA can be piloted first. Every live provider call must be opt-in, server-side, budgeted, logged without secrets, and disabled if price/terms verification is stale. Never promise that a generated media workflow is free solely because its skill repository is MIT-licensed.
