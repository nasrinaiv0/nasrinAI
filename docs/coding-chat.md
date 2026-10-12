# Coding chat

A dedicated chat for building software, always inside a project.

## Opening it

- **Code** in the phone menu (under Library) and in the desktop rail.
- The **Start coding** starter, NasrinAI Space → **Coding**, and a project's
  **Code** action open it too.

People must be signed in (projects belong to an account). A window asks them
to **choose a project or create one** first; done projects are not listed.

## In the coding chat

- Top bar: the menu stays on the left; on the right a **project button**
  (tap to switch project or start a fresh coding chat in the same one) and
  **×** to leave. New chat, Your chats and Settings are hidden meanwhile.
- The Professional AI pill becomes **Code experts**: every message asks the
  Technology group (`mode: 'group', groups: ['technology']`); the server picks
  the experts a message needs (at most 3).
- Each message carries `coding: true`. The server then adds `CODING_RULE` and
  `CODING_CHAT_RULE` (`src/coding.js`) to the system prompt, keeps code files
  as their real type (`.html`, `.js`, … are not turned into PDFs), and skips the
  answer cache.
- The coding chat survives a reload (`nasrin.coding` on the device, cleared
  when signed out or when Projects are off). New chat, opening another chat
  or signing out leaves it.

No new data is stored: coding chats are ordinary project chats.
