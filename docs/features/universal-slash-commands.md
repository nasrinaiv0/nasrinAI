# Universal slash commands

## Behavior

NasrinAI supports an execute-first command convention: a leading slash command names the task, optional text after it supplies direction, and the assistant uses available conversation context, attachments, and tools rather than asking about optional preferences. It should infer safe defaults and return the result. It asks only when an essential input is genuinely unavailable or a safety, permission, plan, or irreversible-action boundary requires it.

The command registry lives in `public/creative-intent.js` and is intentionally dependency-free. The chat system prompt defines the same execute-first behavior for text commands. The registry is a routing hint, not an authorization boundary; server-side access checks, plan checks, spending limits, privacy protections, and action-confirmation rules remain authoritative.

## Supported commands

| Command | Capability | Behavior |
|---|---|---|
| `/clone [direction]` | Image | Uses an attached reference image and directly generates a style/composition clone. Requires an attached image. |
| `/blur [direction]` | Image | Blurs the attached image background while preserving the main subject. Requires an attached image. |
| `/remove-background [direction]` | Image | Requests background removal for an attached image. Requires an attached image. |
| `/upscale [direction]` | Image | Requests image enhancement/upscaling for an attached image. Requires an attached image. |
| `/image [description]` | Image | Generates an image directly with sensible defaults; an omitted description uses NasrinAI's minimal monochrome visual identity. |
| `/video [description]` | Video | Starts the existing video workflow with a sensible default if no description is supplied. Existing plan restrictions apply. |
| `/rewrite`, `/translate`, `/summarize`, `/shorten`, `/expand`, `/proofread`, `/explain` | Chat | Applies the named text task to the supplied content or relevant conversation context. |
| `/debug`, `/review`, `/research`, `/compare`, `/plan`, `/brainstorm`, `/email`, `/code`, `/analyze`, `/automate` | Chat | Performs the named task using existing capabilities and available context. |
| `/search`, `/browse`, `/remember`, `/recall`, `/library`, `/file`, `/document`, `/connect` | Chat | Routes the request through normal NasrinAI intent, tools, memory, and authorization rules. |

Append optional directions after the command, for example `/clone cinematic black and white` or `/blur background only`. Command matching is case-insensitive. Unknown slash commands fall through to normal chat and do not gain privileges.

## Execution and safety

- Image/video commands use the existing media endpoints, not a claim made by a text model.
- Explicit media shortcuts skip the optional brief-question and confirmation sheet, but retain server-side plan, legal, ownership, budget, provider, and safety enforcement.
- Commands requiring a reference image stop with a concise instruction to attach one if no image is available. They do not silently invent a reference.
- Text commands remain normal chat turns, so existing server tools and policy checks remain in force.
- This initial version has no slash autocomplete menu; commands can be typed directly. Unknown commands remain ordinary chat input.
- Do not add a command to the registry unless its target capability exists and its execution path is tested.

## Validation

Regression coverage is in `test/shortcuts.test.js` and `test/creative-intent.test.js`. Run `npm test` and `npm run check:secrets` before merge. Do not treat a passing test result as observed until the CI output confirms it.
