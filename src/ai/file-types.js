// Downloads match what was made: documents (plans, lists, letters, reports)
// are PDFs; .html and other web/code files are for coding work only. When the
// model still hands a plain document over as .html, it becomes a .pdf here
// (owner request 2026-10-12: a meal plan arrived as an .html file).

const WEB_FILE = /\[\[file name="([^"\]\n]{1,120})\.(html?|xhtml)"\]\]\n?([\s\S]*?)\[\[\/file\]\]/gi;
// The person asked for web or code work: their .html stays .html.
const WANTS_WEB = /\b(html?|web ?page|website|web ?site|landing page|homepage|css|javascript|js|typescript|react|vue|frontend|front-end|code|coding|program|script|snippet|app|widget|template|email template|embed)\b/i;

const decode = (s) => s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n) % 0x110000));

// Simple HTML → the reply format the PDF maker reads (## headings, - bullets, **bold**).
export function htmlToDoc(html) {
  const out = String(html)
    .replace(/<(head|script|style|noscript|svg|iframe|form)[\s\S]*?<\/\1>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/gi, (_, t) => `\n\n## ${t}\n\n`)
    .replace(/<h[3-6][^>]*>([\s\S]*?)<\/h[3-6]>/gi, (_, t) => `\n\n### ${t}\n\n`)
    .replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_, __, t) => `**${t.trim()}**`)
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<\/(td|th)>\s*(?=<(td|th)\b)/gi, ' · ')
    .replace(/<(br|\/p|\/div|\/tr|\/ul|\/ol|\/table|\/section|\/article)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '');
  return decode(out).replace(/[ \t\r\f\v]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

// reply: the model's text. asked: what the person wrote in this chat (recent turns).
export function documentFiles(reply, asked = '') {
  if (!reply || !reply.includes('[[file') || WANTS_WEB.test(asked)) return reply;
  return reply.replace(WEB_FILE, (_, name, __, body) => {
    const doc = htmlToDoc(body);
    return doc ? `[[file name="${name}.pdf"]]\n${doc}\n[[/file]]` : _;
  });
}
