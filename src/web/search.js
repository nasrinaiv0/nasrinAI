import { ProviderError } from '../ai/provider.js';

// Web search through OpenAI's Responses API built-in tool
// (tools: [{ type: "web_search" }]), which returns an answer with url_citation
// annotations. The model is a setting (WEB_SEARCH_MODEL); check on OpenAI's
// web-search guide that your model supports the tool.
export function createWebSearch({ apiKey, model, googleSearch = null, fetchImpl = fetch, timeoutMs = 12_000, baseUrl = 'https://openrouter.ai/api/v1' }) {
  return {
    model,
    async search({ system, messages, maxTokens = 1200, onText = null }) {
      // Route by the latest user intent, not assistant prose or old unrelated turns.
      // Keep the previous user turn only to resolve short follow-ups in context.
      const userMessages = (Array.isArray(messages) ? messages : []).filter((m) => m?.role === 'user');
      const queryText = userMessages.slice(-2).map((m) => String(m?.content || '')).join('\n');
      // Keep OpenRouter on the latency-sensitive primary path. Query Google only
      // after a primary failure, or when OpenRouter is not configured.
      const googleFallback = async () => {
        if (!googleSearch?.available || !queryText.trim()) return null;
        let items = [];
        try { items = await googleSearch.search(queryText); } catch { items = []; }
        if (!items.length) return null;
        items = items.slice(0, 5);
        const text = [
          'The primary live-search service is temporarily unavailable. These are real results returned by the configured fallback search provider:',
          ...items.map((item, index) => (index + 1) + '. ' + (item.title || item.displayLink || 'Search result') +
            (item.snippet ? '\\n' + item.snippet : '') + '\\n' + item.url)
        ].join('\\n\\n');
        return {
          text,
          citations: items.map((item) => ({ url: item.url, title: item.title || item.displayLink || 'Search result' })),
          searches: 1, inputTokens: 0, cachedTokens: 0, outputTokens: Math.ceil(text.length / 4)
        };
      };
      const deepResearch = /\b(research|in[- ]depth|comprehensive|compare|comparison|peer[- ]reviewed|academic papers?|systematic review|market analysis|industry report|multiple sources|cross[- ]check|verify claims|pros and cons|sources? and resources?|references?|bibliography|citations?|cite sources|provide sources|find sources)\b/i.test(queryText);
      const socialVideoIntent = /\b(?:trending|trend|viral|popular|top|latest|public)\b.{0,100}\b(?:tiktok|tik tok|facebook|instagram|youtube|reels?|shorts?)\b|\b(?:tiktok|tik tok|facebook|instagram|youtube)\b.{0,100}\b(?:trending|trends|viral|popular|top|public videos?|videos?|show|find|search|any videos?)\b/i.test(queryText);
      const searchContextSize = deepResearch || socialVideoIntent ? 'high' : 'medium';
      const researchInstructions = [
        'Search for evidence that directly answers the user question, not just pages that repeat its wording.',
        'Prefer primary and authoritative sources when available: official documentation, government or institutional data, original research, and direct company announcements.',
        'For material factual claims, cross-check with more than one credible source when feasible. Distinguish independent corroboration from sources that repeat the same report.',
        'Check publication or update dates for time-sensitive claims. Clearly flag uncertainty, disagreement, and gaps instead of guessing.',
        ...(socialVideoIntent ? [
          'SOCIAL VIDEO DISCOVERY MODE: the user wants actual videos and a useful list, not merely advice about where to browse. Search for multiple individual public video posts, using targeted searches for direct TikTok video URLs (https://www.tiktok.com/@creator/video/...), Facebook videos/Reels, or other requested platforms. Also check official trend pages for context, but do not substitute a trends landing page for individual videos.',
          'Return a numbered shortlist of up to five real, currently accessible individual videos. For each, include the post/video title or a brief accurate description, creator when verifiable, platform, region if the source specifies it, and direct canonical post URL. Include the post date only when verifiable. Put direct video links in the answer so the UI can embed supported TikTok and Facebook posts.',
          'Use multiple distinct videos and sources where available. Exclude search-result pages, generic trend reports, hashtag pages, unverifiable examples, and guessed URLs from the video list. Never fabricate creators, views, trend rank, dates, or URLs.',
          'If live search cannot verify individual video URLs, say that plainly, provide the official trend page as a separate fallback, and do not claim it is a list of trending videos. Do not end by asking whether the user wants the list; deliver the best verified list now.'
        ] : []),
        'Cite sources that directly support the nearby claims. Do not invent sources, dates, statistics, quotations, or consensus. For substantial research, aim for up to ten distinct credible source citations when available; do not pad with duplicates, search pages, or sources that do not support the answer.'
      ].join('\n');
      // If OpenRouter is not configured, use the official Google adapter directly.
      if (!apiKey) {
        const fallback = await googleFallback();
        if (fallback) return fallback;
        throw new ProviderError('unavailable', 'web search is not configured');
      }
      let resp;
      try {
        resp = await fetchImpl(baseUrl + '/responses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
          body: JSON.stringify({
            model,
            tools: [{ type: 'openrouter:web_search', parameters: { engine: 'auto', max_results: 10, max_total_results: deepResearch ? 20 : 10, search_context_size: searchContextSize } }],
            include: ['web_search_call.action.sources'],
            instructions: String(system || '') + '\n\nWeb research quality requirements:\n' + researchInstructions,
            input: (Array.isArray(messages) ? messages : []).map((m) => ({ role: m.role, content: m.content })),
            max_output_tokens: maxTokens,
            ...(onText ? { stream: true } : {})
          }),
          signal: AbortSignal.timeout(timeoutMs)
        });
      } catch (err) {
        const fallback = await googleFallback();
        if (fallback) return fallback;
        throw new ProviderError(err?.name === 'TimeoutError' ? 'timeout' : 'unavailable', 'web search could not be reached');
      }
      if (!resp.ok) {
        const s = resp.status;
        const fallback = await googleFallback();
        if (fallback) return fallback;
        throw new ProviderError(s === 429 ? 'busy' : s >= 500 ? 'unavailable' : 'config', `web search answered ${s}`, s);
      }
      const parseResult = (data) => {
        let text = '';
        const citations = [];
        for (const item of Array.isArray(data?.output) ? data.output : []) {
          if (item?.type !== 'message') continue;
          for (const c of Array.isArray(item.content) ? item.content : []) {
            if (c?.type !== 'output_text' || typeof c.text !== 'string') continue;
            text += c.text;
            for (const a of Array.isArray(c.annotations) ? c.annotations : []) {
              if (a?.type !== 'url_citation' || typeof a.url !== 'string') continue;
              let sourceUrl;
              try { sourceUrl = new URL(a.url); } catch { continue; }
              if (!['http:', 'https:'].includes(sourceUrl.protocol) || !sourceUrl.hostname || sourceUrl.username || sourceUrl.password) continue;
              const url = sourceUrl.href;
              if (!citations.some((x) => x.url === url)) {
                citations.push({ url, title: String(a.title || '').replace(/[\r\n\t]/g, ' ').slice(0, 120) });
              }
            }
          }
        }
        return { text, citations: citations.slice(0, deepResearch ? 10 : 6) };
      };

      if (onText && resp.body) {
        let text = '';
        let citations = [];
        let calls = 0;
        let usage = null;
        let buffer = '';
        const decoder = new TextDecoder();
        const handle = (line) => {
          if (!line.startsWith('data:')) return;
          const payload = line.slice(5).trim();
          if (!payload || payload === '[DONE]') return;
          let event; try { event = JSON.parse(payload); } catch { return; }
          const delta = event?.delta;
          if (event?.type === 'response.output_text.delta' && typeof delta === 'string') {
            text += delta;
          }
          if (event?.type === 'response.output_text.done' && typeof event?.text === 'string' && !text) {
            text = event.text;
          }
          if (event?.type === 'response.web_search_call.completed') calls += 1;
          const response = event?.response;
          if (response?.usage) usage = response.usage;
          if (response?.output) {
            const parsed = parseResult(response);
            if (parsed.text && parsed.text !== text) text = parsed.text;
            citations = mergeCitations(parsed.citations);
            calls = Math.max(calls, response.output.filter((i) => i?.type === 'web_search_call').length);
          }
        };
        try {
          for await (const chunk of resp.body) {
            buffer += decoder.decode(chunk, { stream: true });
            let i;
            while ((i = buffer.indexOf('\n')) >= 0) { handle(buffer.slice(0, i).trim()); buffer = buffer.slice(i + 1); }
          }
          if (buffer.trim()) handle(buffer.trim());
        } catch (err) {
          throw new ProviderError(err?.name === 'TimeoutError' ? 'timeout' : 'unavailable', 'web search stream could not be read');
        }
        text = stripUnverifiedUrls(text, citations, messages);
        if (onText && text) onText(text);
        return {
          text,
          citations,
          searches: Math.max(1, calls),
          inputTokens: Number(usage?.input_tokens) || 0,
          cachedTokens: Number(usage?.input_tokens_details?.cached_tokens) || 0,
          outputTokens: Number(usage?.output_tokens) || Math.ceil(text.length / 4)
        };
      }

      const data = await resp.json().catch(() => null);
      const parsed = parseResult(data);
      const citations = mergeCitations(parsed.citations);
      const text = stripUnverifiedUrls(parsed.text, citations, messages);
      const calls = (Array.isArray(data?.output) ? data.output : []).filter((i) => i?.type === 'web_search_call').length;
      return {
        text,
        citations,
        searches: Math.max(1, calls),
        inputTokens: Number(data?.usage?.input_tokens) || 0,
        cachedTokens: Number(data?.usage?.input_tokens_details?.cached_tokens) || 0,
        outputTokens: Number(data?.usage?.output_tokens) || 0
      };
    }
  };
}

// Strip links that were authored by the model but not present in trusted search citations
// or explicitly supplied by the user. Web-search streaming is buffered until annotations
// arrive so a guessed URL is never briefly shown as a clickable link.
function stripUnverifiedUrls(text, citations, messages) {
  const allowed = new Set();
  const add = (raw) => {
    try {
      const url = new URL(raw);
      if (['http:', 'https:'].includes(url.protocol) && url.hostname && !url.username && !url.password) allowed.add(url.href);
    } catch {}
  };
  for (const source of Array.isArray(citations) ? citations : []) add(source?.url || '');
  for (const message of Array.isArray(messages) ? messages : []) {
    if (message?.role !== 'user') continue;
    for (const match of String(message.content || '').matchAll(/https?:\/\/[^\s<>"'\x60)\]]+/gi)) {
      add(match[0].replace(/[.,!?;:]+$/, ''));
    }
  }
  const isTrusted = (raw) => {
    try {
      const url = new URL(raw);
      return ['http:', 'https:'].includes(url.protocol) && Boolean(url.hostname) &&
        !url.username && !url.password && allowed.has(url.href);
    } catch { return false; }
  };
  let safe = String(text || '').replace(/\[([^\]]{0,500})\]\((https?:\/\/[^)\s]+)(?:\s+[^)]*)?\)/gi,
    (whole, label, url) => isTrusted(url) ? whole : label + ' (unverified link omitted)');
  safe = safe.replace(/https?:\/\/[^\s<>"'\x60)\]]+/gi, (raw) => {
    const clean = raw.replace(/[.,!?;:]+$/, '');
    return isTrusted(clean) ? raw : '[unverified link omitted]';
  });
  return safe;
}

// Messages that need fresh information from the web.
const FRESH = /\b(latest|today|tonight|yesterday|this week|right now|currently|current|news|breaking|weather|forecast|score|who won|stock price|exchange rate|price of|(latest|new|recent|any) updates?|updates? (on|about|regarding)|recent(ly)?|developments?|status of|ongoing|so far|this (month|year)|last (night|week|month)|upcoming|how much is .* (now|today)|search (the )?(web|internet|online)|look (it )?up|google|research|find sources|provide sources|cite sources|with citations|source links|browse (the )?(web|internet)|search (for|online)|on the internet|(check|search|use) the internet|headlines?|what'?s happening|happening (now|today)|20(2[6-9]|3\d))\b/i;
// A draft answer that admits it lacks current facts: chat searches instead of
// showing it (only when the person did not already get a web search).
export const GAP = /\b(check the (web|internet)|search the (web|internet)|browse the (web|internet)|live (news|data|information|updates|results)|real[- ]time (news|data|information|updates)|knowledge (may be |might be |is )?(outdated|out of date|limited)|knowledge cut-?off|my cut-?off|training (data|cut-?off)|as of my (last|latest) (update|training|knowledge)|built-in knowledge|(don['’]?t|do not) have (access to )?(current|live|recent|real-time|up-to-date)|(can['’]?t|cannot|can ?not|unable to|not able to) (check|access|browse|search|verify) (the )?(web|internet|live|current|latest|recent|news|online))\b/i;

// "Can you browse the internet?" asks about NasrinAI itself: answered from the
// prompt, without spending a search.
const CAPABILITY = /^\s*(can|could|do|are|will) (you|nasrin(ai)?) (be able to |able to )?(browse|search|access|use|check|go on|surf)\b[^.!]*\b(internet|web|online)\b[^.!]*\??\s*$/i;
// Broaden automatic discovery beyond explicitly time-sensitive phrasing. These patterns
// target requests where current, source-backed coverage is usually useful, while
// keeping ordinary timeless explanations (for example, "Explain photosynthesis") local.
const PUBLIC_ENTITY_QUESTION = /\b(?:[Ww]hat|[Ww]ho|[Ww]here|[Ww]hen)\s+(?:is|are|was|were)\s+(?:the\s+)?[A-Z][\w.-]+(?:\s+[A-Z][\w.-]+){0,4}/;
const WEB_RESEARCH_INTENT = /\b(?:who is|who was|reviews? of|user reviews|pros and cons of|alternatives to|official documentation for|official docs for|academic papers? on|peer[- ]reviewed|market research|industry report|statistics for|data on|compare .{1,100}\b(?:products?|models?|services?|tools?|providers?|platforms?|companies|options?|solutions?)\b|best .{1,80}\b(?:apps?|tools?|services?|products?|platforms?|models?|providers?|places?|restaurants?|laptops?|phones?|software)\b)\b/i;
// Social trends/public-video requests need live retrieval even without "today",
// "current", or "search the web", preventing generic invented trend lists.
const SOCIAL_DISCOVERY_INTENT = /\b(?:trending|trend|viral|popular|top|public|latest|new)\b.{0,100}\b(?:tiktok|tik tok|facebook|instagram|youtube|reels?|shorts?)\b|\b(?:tiktok|tik tok|facebook|instagram|youtube)\b.{0,100}\b(?:trending|trends|viral|popular|top|public videos?|videos? now|videos?|show|find|search|any videos?|what is happening)\b|\b(?:show|find|search|any|public)\b.{0,60}\bvideos?\b.{0,60}\b(?:from|on|in)\b.{0,30}\b(?:tiktok|tik tok|facebook|instagram|youtube)\b/i;
export const needsWeb = (text) => {
  const value = String(text || '');
  return !CAPABILITY.test(value) && (FRESH.test(value) || WEB_RESEARCH_INTENT.test(value) || PUBLIC_ENTITY_QUESTION.test(value) || SOCIAL_DISCOVERY_INTENT.test(value));
};
