# Chat: streaming, Stop, Retry, Edit, Regenerate

## Streaming

`POST /v1/chat` with `"stream": true` answers as NDJSON (`application/x-ndjson`),
one JSON object per line:

| Event | Meaning |
|---|---|
| `start` | `conversation_id`, `user_message_id` (the message is saved) |
| `delta` | `text`: the next whole sentence(s), already cleaned |
| `reset` | a model attempt failed and another is tried: drop the text so far |
| `done` | the normal final reply (same shape as the non-streamed answer) |
| `error` | `code`, `message`: something failed after the stream started |

Only OpenAI (SSE, `stream_options.include_usage`) and the fake provider
stream; others answer in one piece. Replies with tool calls are not streamed.
Text is passed through `keepIdentity`, `cleanPiece` and the length cap a
sentence at a time (`liveText` in `src/chat.js`), so the screen never shows
text the final reply would not. Errors before `start` are normal JSON errors.
Whether Vercel delivers the stream in pieces cannot be verified from the
repository; the page also works when the whole answer arrives at once.

## Stop

Closing the request (the Stop button) aborts the model call. The part
already written is saved as the reply, and usage is estimated and counted,
so stopping cannot be used to get around limits.

## Regenerate, Retry, Edit

- `"regenerate": true` answers the last user message again; answers after it
  are deleted. Retry after an error uses the same path when the message was
  saved, otherwise it resends.
- `"edit_message_id"` must be the last user message: it and everything after
  it are deleted and the new text is answered.
- Picture turns cannot be regenerated or edited this way (use the picture's
  own Regenerate). Attachments are not resent.

## Read aloud

Each reply has one round **play/stop** button, the same size as the other reply actions:

- idle: a play icon, labelled "Play reply aloud";
- loading or reading: a stop icon, labelled "Stop reading aloud".

Tapping it while loading or reading stops, and no second voice request is made. It works for natural voices (Web Audio) and the device voice (`speechSynthesis`). The automatic "Read replies aloud" setting presses the same button. Test: `test/play-stop-audio.test.js`.

## Malformed archive metadata

Supported archive/document parsers must treat truncated archives, malformed manifest paths, and other invalid archive metadata as unreadable or skip the invalid entry. ZIP parsing must reject buffers too short to contain an end-of-central-directory record before reading fixed offsets. User-supplied files must not cause an unhandled parser exception or take down a chat request. Regression tests belong in `test/attachments.test.js`; parsing stays bounded and never executes archive contents.


ZIP archive validation is intentionally limited to classic single-disk ZIP files. The parser rejects inconsistent entry counts, central-directory bounds, truncated directory records, unsupported ZIP64 sentinel values, local-header mismatches, and entry payloads that extend into the central directory. Extracted data must match its declared uncompressed size and stay within existing per-entry and per-file limits.

## Sending with the keyboard

- **Desktop** (mouse and keyboard, `(hover: hover) and (pointer: fine)`): **Enter** sends; **Shift+Enter** starts a new line.
- **Phones and tablets** (touch): Enter starts a new line; the Send button sends (owner's 2026-10-07 rule).
- Typing with an input method (IME, e.g. Japanese or Chinese) never sends early (`isComposing`, key code 229).
- Enter never stops or interrupts a reply that is being written; the text stays in the box.

Test: `test/desktop-enter.test.js`.

## Reply formatting

Replies use a small, safe subset of Markdown that `public/format.js` turns into DOM nodes with `textContent` (never `innerHTML`):

- headings, paragraphs, bullet lists, numbered steps (tickable) and quotes;
- `**bold**`, `` `code` `` and links;
- code blocks with a **Copy** button that copies the exact code;
- tables.

**Tables:** a header row, a `---` separator row, then body rows. They render inside a box that scrolls sideways on phones, so the page never does. The box is keyboard-focusable and labelled. At most 8 columns and 50 rows; cells allow inline formatting only. A line with pipes but no separator row stays text. `plain()` (copy and read-aloud) turns rows into `a · b` lines.

The system prompt (`src/ai/prompt.js`) asks for:

- the direct answer first, then short paragraphs;
- every piece of code, command, configuration or data to copy in a fenced block with its language;
- tables only for comparisons (at most 6 columns);
- depth matched to the person: simple or in depth on request;
- Markdown only, never HTML.

Tests: `test/reply-format.test.js` runs `format.js` against a small fake DOM that fails on any `innerHTML` use.



## Read-aloud control

Each assistant reply has one icon-only read-aloud control. It toggles between Play and Stop in the same button, with no visible button background in its idle, hover, pressed, or playing states. Accessible labels and a title identify the current action; no separate Stop control is shown.


## Instant small-talk replies

In smart routing, plain greetings and brief acknowledgements from the NasrinAI platform chat use deterministic local replies after normal request validation, limits, message persistence, history loading, and policy checks. They do not call an AI provider. Requests with attachments, voice, professional selection, project context, personal context, or regeneration/edit operations continue through the normal path.


## Greeting shortcut ordering

The local small-talk shortcut must run only after the per-turn `extra` context array is initialized and populated. This prevents a temporal-dead-zone `ReferenceError` when a greeting reaches the shortcut. Regression tests must cover a plain greeting and verify it returns a local logic response without calling the model provider.


## Composer controls render immediately

The model-tier selector and Professional AI mode control must both be present in the initial HTML without `hidden`. Their initial labels are Quick and Automatic. Model/professional catalogs may hydrate asynchronously and update available choices, but loading or API failures must not hide either control. The server remains authoritative for tier access and professional availability; a visible control is not an access grant.


## Excel workbook export

When creating an `.xlsx` deliverable, the assistant may return up to 8 named worksheet blocks inside one file block. Each worksheet uses `[[sheet name="Cleaned Data"]]`, comma-separated or tab-separated rows, and `[[/sheet]]`. The browser builds a real workbook with separate tabs, safe formulas, frozen header rows, and filters. This is not in-place editing of the uploaded workbook and does not create native Excel pivot tables or chart objects. Those capabilities must not be claimed until separately implemented and tested.
