// Classifies what a message needs before model routing.
// The classifier is deliberately deterministic: it does not make a model call.
// It should be conservative for easy questions and aggressive enough to give
// complex work a stronger reasoning model.
//
// Returns { task, level, reasons }.
// 1 = fast/simple, 2 = moderate, 3 = complex, 4 = hard, 5 = extreme.

const has = (re, s) => re.test(s);

const CODE = /\`\`\`|\b(function|class|const|let|var|def|import|export|return|select\s+.+\s+from|insert into|update\s+.+set|regex|stack ?trace|exception|traceback|typeerror|referenceerror|syntaxerror|null pointer|segfault|compile|npm|pnpm|yarn|pip|sql|api endpoint|json schema|typescript|javascript|python|java|c\+\+|rust|golang|kotlin|swift|react|node\.js|supabase|vercel|cloudflare|ci|github actions|build pipeline|test suite|workflow run|pull request|deployment)\b/i;
const DEBUG = /\b(bug|debug|error|fail(?:s|ed|ure|ures|ing)?|broken|crash(es|ing)?|doesn'?t work|not working|exception|stack ?trace|why does .* (fail|break)|regression|incident|ci (?:failed|failing|failure)|test suite failed|build failed|workflow failed)\b/i;
const ANALYSIS = /\b(analy[sz]e|compare|comparison|trade-?offs?|pros and cons|evaluate|step[- ]by[- ]step|explain (why|how)|prove|derive|optimi[sz]e|strategy|forecast|benchmark|interpret|assess|review)\b/i;
const RESEARCH = /\b(research|investigate|literature|sources?|citations?|evidence|study|survey|market research|find out|look up|verify|fact[- ]check)\b/i;
const VIDEO_DISCOVERY = /\b(?:youtube|latest video|newest video|trending videos?|videos?\s+(?:of|from|by|about|on)|watch\s+(?:the\s+)?(?:latest|newest|top)|show\s+me\s+(?:the\s+)?videos?|find\s+videos?)\b/i;
const PLANNING = /\b(plan|roadmap|implementation plan|action plan|strategy|timeline|milestones?|requirements?|specification|spec|project plan|how should i build|how do i build)\b/i;
const DECISION = /\b(should i|which (one|is better)|recommend|recommendation|best|choose|pick|worth it|buy|versus|vs\.?|alternative|option)\b/i;
const HARD = /\b(architecture|architect|system design|design (a|the) (system|platform|service|database)|scalab(le|ility)|distributed|security (model|architecture|review)|threat model|refactor|migration plan|database (design|schema|redesign)|authentication (flow|architecture)|multi-?tenant|orchestrat|zero trust|disaster recovery|high availability|performance engineering)\b/i;
const EXTREME = /\b(entire (codebase|repository|system)|whole (codebase|system|platform)|end-to-end (design|architecture|implementation)|long-horizon|long-term roadmap|multi-?system|from scratch.*(platform|system)|full[- ]stack (application|platform)|production[- ]grade.*(system|platform)|formal proof)\b/i;
const DEEPER = /\b(think (hard|deeply|carefully)|reason (through|about)|be (very )?thorough|in depth|in-depth|deep (dive|analysis)|detailed analysis|deeply)\b/i;
const CURRENT = /\b(latest|today|tonight|yesterday|this week|right now|currently|current|news|breaking|weather|forecast|score|price|exchange rate|stock|availability)\b/i;
const DATA = /\b(dataset|data set|csv|spreadsheet|excel|statistics?|statistical|sql query|metrics?|dashboard|table|trend|correlation|regression|anomaly)\b/i;
const CREATIVE = /\b(design|brainstorm|ideas?|concept|brand|logo|story|script|campaign|creative|visual|ui|ux|copy)\b/i;
const TRANSLATE = /\b(translate|translation|in (english|tagalog|filipino|bisaya|cebuano|spanish|japanese|korean|chinese|french))\b/i;
const WRITE = /\b(write|draft|rewrite|summari[sz]e|reply to|email|message|caption|post|description|resume|proposal|report)\b/i;
const SIMPLE = /^(hi|hello|hey|thanks?|thank you|ok(ay)?|good (morning|afternoon|evening|night)|salamat|kumusta|maayong|who are you|what can you do)[.!?]*$/i;
const CONTINUATION = /^(?:(?:yes|sure|okay|ok)[, ]+(?:please[, ]+)?(?:continue|go on|keep going|proceed|carry on)|continue|go on|keep going|proceed|do it|yes|yes please|sure|finish|finish it|complete it|carry on|please continue|fix it|try again|same|that one)[.!?]*$/i;

export function classify({ message, history = [], attachments = [] }) {
  const text = String(message || '').trim();
  const len = text.length;
  // Short follow-ups inherit the last user task so routing does not treat
  // "continue", "yes", or "fix it" as a brand-new unrelated chat.
  const priorUserText = [...history].reverse().find((item) => item?.role === 'user' && typeof item.content === 'string')?.content?.trim() || '';
  const continuation = CONTINUATION.test(text) && priorUserText.length > 0;
  const signalText = continuation ? `${priorUserText}\n${text}` : text;
  const signalLength = signalText.length;
  const reasons = [];
  let task = 'chat';
  let level = 1;

  const raise = (to, why) => {
    if (to > level) {
      level = Math.min(5, to);
      reasons.push(why);
    }
  };

  if (has(SIMPLE, text) && len < 80) {
    reasons.push('greeting or small talk');
  } else {
    if (has(TRANSLATE, signalText)) task = 'translate';
    else if (has(WRITE, signalText)) task = 'writing';

    if (has(DEBUG, signalText)) {
      task = 'debugging';
      raise(3, 'troubleshooting or failure investigation');
    }
    if (has(CODE, signalText)) {
      task = has(DEBUG, signalText) ? 'debugging' : 'coding';
      raise(has(DEBUG, signalText) ? 3 : 2, has(DEBUG, signalText) ? 'debugging code' : 'code');
    }
    if (continuation) reasons.push('continuation inherits previous user task');

    if (has(VIDEO_DISCOVERY, signalText)) {
      if (task === 'chat') task = 'research';
      raise(2, 'video discovery or media lookup');
    }

    if (has(RESEARCH, signalText) || has(CURRENT, signalText)) {
      if (task === 'chat') task = 'research';
      raise(3, has(CURRENT, signalText) ? 'current or changing information' : 'research or verification');
    }

    if (has(DATA, signalText)) {
      if (task === 'chat') task = 'data_analysis';
      raise(3, 'data or statistical work');
    }

    if (has(ANALYSIS, signalText)) {
      if (task === 'chat') task = 'analysis';
      raise(2, 'analysis');
    }

    if (has(PLANNING, signalText)) {
      if (task === 'chat') task = 'planning';
      raise(2, 'planning');
    }

    if (has(DECISION, signalText)) {
      if (task === 'chat') task = 'decision';
      raise(2, 'decision support');
    }

    if (has(CREATIVE, signalText) && task === 'chat') {
      task = 'creative';
      raise(2, 'creative work');
    }

    if (has(HARD, signalText)) {
      if (/\b(refactor|migration)\b/i.test(text) && /\b(codebase|authentication system|source code|repository)\b/i.test(text)) task = 'coding';
      else if (task === 'chat' || task === 'analysis' || task === 'planning') task = 'design';
      raise(4, 'architecture, security, or system design');
    }

    if (has(EXTREME, signalText)) raise(5, 'whole-system scope');
    if (signalLength > 1500) raise(Math.min(level + 1, 3), 'long request');
    if (signalLength > 6000) raise(Math.min(level + 1, 4), 'very long request');
    if (attachments.some((a) => a.kind === 'pdf')) raise(2, 'PDF to read');
    if (attachments.some((a) => a.kind === 'image')) raise(2, 'visual input');
    if (attachments.some((a) => /csv|spreadsheet|excel/i.test(String(a.name || '')))) raise(3, 'structured data attachment');
    if (has(DEEPER, signalText)) raise(Math.min(level + 1, 5), 'asked for deeper reasoning');
    if (history.length > 12 && level >= 2) raise(Math.min(level + 1, 4), 'long technical conversation');
  }

  return { task, level, reasons };
}
