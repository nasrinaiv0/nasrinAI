# Claude Master Plan Summary

## Update: Normal-chat summarization

### Goal
Make summarization a first-class task in ordinary NasrinAI chat, without requiring a special mode or slash command.

### Required behavior
- Recognize natural-language requests such as “summarize this,” “give me the key points,” “summarize this conversation,” and /summarize.
- Summarize source content that is actually available: user-pasted text, supported attachment extracts, current conversation history, or results returned by authorized tools.
- Start with the central takeaway, then include key points and decisions/action items when useful.
- Preserve important names, dates, numbers, qualifications, and uncertainty; do not invent missing details.
- For “summarize this chat/conversation,” summarize relevant visible/retrieved conversation history, not only the latest turn.
- For long source material, prioritize the requested scope and make the result concise and scannable. If a downloadable summary is requested, use the existing file-block/file-generation workflow.
- For Gmail, Google Calendar, and Google Drive, only summarize private account data after the corresponding authorized integration tool has actually retrieved the relevant data. A connection alone is not proof that content was fetched.
- If source content is unavailable and no authorized tool can retrieve it, state that limitation plainly and ask for the source; never pretend to have read it.
- Respect memory settings: do not search or claim to summarize saved chats when Memory is off; use only excerpts actually supplied by the authorized history retrieval path.

### Implementation notes
- Added summarization guidance to the shared system prompt used by normal chat.
- Keep this behavior compatible with existing /summarize command guidance, attachments, web results, voice mode, and file output.
- Do not create a separate model or a new database table just for summarization.

### Validation checklist
- [ ] Summarizes pasted paragraphs and long documents accurately.
- [ ] Summarizes the current conversation when explicitly requested.
- [ ] Preserves facts and flags missing context rather than hallucinating.
- [ ] Does not claim Gmail/Calendar/Drive access unless tool results are present.
- [ ] Respects Memory-off and guest restrictions for past-chat summaries.
- [ ] Existing chat, attachment, file-output, and prompt tests pass.
- [ ] Full CI and security checks pass before merge/deploy.
