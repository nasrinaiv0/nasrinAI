# Coding

A code editor for a signed-in person's own code files, with Nasrin's help.
Open it from the chats button → **Code**. No migration: code files are
Library items (`.js`, `.py`, `.html`, … kept as plain text; never `.env`,
`.pem`, `.key`).

## How it works

- **Editor**: plain textarea (monospace, Tab adds two spaces; Escape then Tab
  leaves the editor; Ctrl/Cmd+S saves). Saving (`PUT /v1/library/:id`)
  stores the text as a new item and deletes the old one (rows are never
  edited in place); name and project stay.
- **Ask**: Explain, Review, Find bugs, Refactor, Write tests, or a free
  question; selected lines narrow it. The page sends `code_file_id` (and
  `code_lines`) with a normal chat message; the server reads the saved file
  itself (owner-checked), hides lines that look like secrets
  (`maskSecrets`, reusing `src/knowledge/secrets.js`), numbers the lines,
  fences them safely, caps them at 24,000 characters and adds them to that
  one message as data. The code is not saved with the chat.
- The Software Developer professional (Web Developer for HTML/CSS/JSX-like
  files) answers unless the person chose other professionals.
- The system prompt requires production-grade work and evidence-based reporting. For connected GitHub repositories, `github_run_command` runs one command in an isolated Vercel Sandbox microVM; the server never executes repository code directly. See `docs/github.md` for limits and security boundaries.
- A file in a project gets that project's instructions too.

Files: `src/coding.js`, `src/library.js` (code extensions, `replace`),
`src/chat.js` (`code_file_id`), `public/app.js` (Coding section).
