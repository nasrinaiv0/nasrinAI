// Turns Nasrin's replies into tidy, readable blocks: headings, lists, steps,
// quotes, code and links. Only a small, safe subset of Markdown is understood,
// and everything is built with DOM nodes and textContent (never innerHTML), so
// nothing in a reply can run as code. Exposes window.NasrinFormat.
(() => {
  'use strict';

  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };

  // Code highlighting: a small tokenizer per language family. Tokens become
  // <span class="tok-…"> with textContent only; unknown languages stay plain.
  // Every pattern is linear (unclosed comments/strings run to the end), and
  // very long code is left plain.
  const KEYWORDS = {
    js: 'as async await break case catch class const continue debugger default delete do else enum export extends false finally for from function get if implements import in instanceof interface let new null of private protected public readonly return set static super switch this throw true try type typeof undefined var void while with yield',
    py: 'and as assert async await break case class continue def del elif else except False finally for from global if import in is lambda match None nonlocal not or pass raise return self True try while with yield',
    sh: 'case cd do done echo elif else esac exit export fi for function if in local read return set shift source sudo then unset until while',
    sql: 'add all alter and as asc begin between by case check commit constraint create cross declare default delete desc distinct drop else end exists false foreign from full function grant group having if in index inner insert into is join key language left like limit not null offset on or order outer primary references returning returns revoke right rollback select set table then to transaction trigger true union unique update using values view when where with',
    go: 'break case chan const continue default defer else fallthrough false for func go goto if import interface map nil package range return select struct switch true type var',
    rs: 'as async await break const continue crate dyn else enum extern false fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait true type unsafe use where while',
    c: 'abstract auto bool boolean break case catch char class const continue default delete do double else enum extends extern false final finally float for fun func goto if implements import inline int interface internal let long namespace new null nullptr object override package private protected public return short signed sizeof static struct super switch this throw throws true try typedef typename union unsigned using val var virtual void volatile when while',
    css: '', json: 'true false null', yaml: 'true false null yes no', html: ''
  };
  const LANG = { js: 'js', javascript: 'js', jsx: 'js', mjs: 'js', cjs: 'js', ts: 'js', typescript: 'js', tsx: 'js', node: 'js',
    py: 'py', python: 'py', python3: 'py', sh: 'sh', bash: 'sh', shell: 'sh', zsh: 'sh', console: 'sh', terminal: 'sh', powershell: 'sh', ps1: 'sh',
    sql: 'sql', postgres: 'sql', postgresql: 'sql', plpgsql: 'sql', mysql: 'sql', sqlite: 'sql', go: 'go', golang: 'go', rs: 'rs', rust: 'rs',
    c: 'c', h: 'c', cpp: 'c', 'c++': 'c', cc: 'c', cs: 'c', csharp: 'c', java: 'c', kotlin: 'c', kt: 'c', swift: 'c', php: 'c', dart: 'c', scala: 'c',
    css: 'css', scss: 'css', less: 'css', json: 'json', jsonc: 'json', yaml: 'yaml', yml: 'yaml', toml: 'yaml', ini: 'yaml', env: 'yaml', dockerfile: 'sh',
    html: 'html', xml: 'html', svg: 'html', vue: 'html', diff: 'diff', patch: 'diff' };
  const COMMENT = {
    js: '\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?(?:\\*\\/|$)', c: '\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?(?:\\*\\/|$)', go: '\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?(?:\\*\\/|$)',
    rs: '\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?(?:\\*\\/|$)', css: '\\/\\*[\\s\\S]*?(?:\\*\\/|$)', json: '\\/\\/[^\\n]*',
    py: '#[^\\n]*', sh: '#[^\\n]*', yaml: '#[^\\n]*', sql: '--[^\\n]*|\\/\\*[\\s\\S]*?(?:\\*\\/|$)', html: '<!--[\\s\\S]*?(?:-->|$)'
  };
  const STRING = '"(?:[^"\\\\\\n]|\\\\.)*"?|\'(?:[^\'\\\\\\n]|\\\\.)*\'?';
  const STRINGS = { js: '`(?:[^`\\\\]|\\\\[\\s\\S])*`?|' + STRING, py: '"""[\\s\\S]*?(?:"""|$)|\'\'\'[\\s\\S]*?(?:\'\'\'|$)|' + STRING, go: '`[^`]*`?|' + STRING };
  const PATTERNS = {};
  function pattern(lang) {
    if (PATTERNS[lang]) return PATTERNS[lang];
    const parts = [
      '(' + COMMENT[lang] + ')',
      '(' + (STRINGS[lang] || STRING) + ')',
      lang === 'html' ? '(<\\/?[A-Za-z][\\w:-]*|\\/?>)' : '(\\b(?:0x[0-9a-fA-F_]+|\\d[\\d_]*(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)\\b)',
      lang === 'css' ? '(#[0-9a-fA-F]{3,8}\\b|[@.]?-?[A-Za-z_][\\w-]*)' : '([A-Za-z_$][\\w$]*)'
    ];
    PATTERNS[lang] = { re: new RegExp(parts.join('|'), 'g'), words: new Set(KEYWORDS[lang].split(' ').filter(Boolean)) };
    return PATTERNS[lang];
  }
  function highlight(codeEl, source, rawLang) {
    const lang = LANG[String(rawLang || '').toLowerCase()];
    if (!lang || source.length > 30000) { codeEl.textContent = source; return; }
    if (lang === 'diff') {
      for (const line of source.split('\n')) {
        const cls = /^(\+\+\+|---)\s/.test(line) || /^@@/.test(line) ? 'tok-meta' : line.startsWith('+') ? 'tok-add' : line.startsWith('-') ? 'tok-del' : '';
        codeEl.appendChild(cls ? el('span', 'tok-line ' + cls, line) : document.createTextNode(line));
        codeEl.appendChild(document.createTextNode('\n'));
      }
      return;
    }
    const { re, words } = pattern(lang);
    re.lastIndex = 0;
    let last = 0; let m;
    while ((m = re.exec(source))) {
      if (!m[0]) { re.lastIndex++; continue; }
      if (m.index > last) codeEl.appendChild(document.createTextNode(source.slice(last, m.index)));
      let cls = '';
      if (m[1]) cls = 'tok-c';
      else if (m[2]) cls = lang === 'json' && /^\s*:/.test(source.slice(re.lastIndex, re.lastIndex + 4)) ? 'tok-p' : 'tok-s';
      else if (m[3]) cls = lang === 'html' ? 'tok-k' : 'tok-n';
      else if (lang === 'css') cls = /^#/.test(m[4]) ? 'tok-n' : /^[@.]/.test(m[4]) ? 'tok-k' : /^\s*:/.test(source.slice(re.lastIndex, re.lastIndex + 2)) ? 'tok-p' : '';
      else if (words.has(lang === 'sql' ? m[4].toLowerCase() : m[4])) cls = 'tok-k';
      else if (source[re.lastIndex] === '(') cls = 'tok-f';
      else if (/^[A-Z][a-z]/.test(m[4]) && lang !== 'sh') cls = 'tok-t';
      codeEl.appendChild(cls ? el('span', cls, m[0]) : document.createTextNode(m[0]));
      last = re.lastIndex;
    }
    if (last < source.length) codeEl.appendChild(document.createTextNode(source.slice(last)));
  }

  // Math: a bounded LaTeX subset turned into MathML (built with DOM nodes, no
  // scripts). Anything outside the subset or past the size limits falls back
  // to the original text in a code span, so nothing is lost or invented.
  const MATHML = 'http://www.w3.org/1998/Math/MathML';
  const GREEK = { alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ', vartheta: 'ϑ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ', upsilon: 'υ', phi: 'φ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
    Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Upsilon: 'Υ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω', infty: '∞', partial: '∂', nabla: '∇', hbar: 'ℏ', ell: 'ℓ', emptyset: '∅' };
  const OPS = { times: '×', cdot: '⋅', div: '÷', pm: '±', mp: '∓', le: '≤', leq: '≤', ge: '≥', geq: '≥', ne: '≠', neq: '≠', approx: '≈', equiv: '≡', sim: '∼', simeq: '≃', propto: '∝',
    to: '→', rightarrow: '→', leftarrow: '←', Rightarrow: '⇒', Leftarrow: '⇐', leftrightarrow: '↔', Leftrightarrow: '⇔', implies: '⟹', iff: '⟺', mapsto: '↦',
    in: '∈', notin: '∉', ni: '∋', subset: '⊂', subseteq: '⊆', supset: '⊃', supseteq: '⊇', cup: '∪', cap: '∩', setminus: '∖', forall: '∀', exists: '∃', neg: '¬', land: '∧', lor: '∨', wedge: '∧', vee: '∨',
    sum: '∑', prod: '∏', int: '∫', iint: '∬', oint: '∮', cdots: '⋯', ldots: '…', dots: '…', circ: '∘', degree: '°', ast: '∗', star: '⋆', perp: '⊥', parallel: '∥', angle: '∠',
    langle: '⟨', rangle: '⟩', lfloor: '⌊', rfloor: '⌋', lceil: '⌈', rceil: '⌉', vert: '|', mid: '∣', '{': '{', '}': '}', '%': '%', '$': '$', '#': '#', '&': '&', '_': '_' };
  const FUNCS = new Set(['sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh', 'log', 'ln', 'lg', 'exp', 'lim', 'max', 'min', 'sup', 'inf', 'det', 'gcd', 'deg', 'arg', 'mod', 'Pr']);
  const SPACES = { ',': '0.17em', ':': '0.22em', ';': '0.28em', ' ': '0.25em', quad: '1em', qquad: '2em', '!': '0' };
  function mathNode(tex, display) {
    const src = String(tex).trim();
    if (!src || src.length > 600) return null;
    let i = 0; let count = 0;
    const mk = (tag, text) => {
      if (++count > 500) throw new Error('too big');
      const n = document.createElementNS(MATHML, tag);
      if (text !== undefined) n.textContent = text;
      return n;
    };
    const row = (nodes) => { if (nodes.length === 1) return nodes[0]; const r = mk('mrow'); for (const n of nodes) r.appendChild(n); return r; };
    const braced = () => {
      while (src[i] === ' ') i++;
      if (src[i] === '{') { i++; const nodes = list('}', 1); i++; return row(nodes); }
      return atom(1) || mk('mrow');
    };
    const textArg = () => {
      while (src[i] === ' ') i++;
      if (src[i] !== '{') throw new Error('text arg');
      const end = src.indexOf('}', i);
      if (end < 0) throw new Error('unclosed');
      const t = src.slice(i + 1, end); i = end + 1; return t;
    };
    function atom(depth) {
      if (depth > 24) throw new Error('too deep');
      while (src[i] === ' ' || src[i] === '\n') i++;
      if (i >= src.length) return null;
      const ch = src[i];
      if (ch === '{') { i++; const nodes = list('}', depth + 1); i++; return row(nodes); }
      if (ch === '\\') {
        const m = /^\\([A-Za-z]+|.)/.exec(src.slice(i));
        if (!m) throw new Error('bad command');
        i += m[0].length;
        const name = m[1];
        if (name === 'frac' || name === 'dfrac' || name === 'tfrac') { const f = mk('mfrac'); f.append(braced(), braced()); return f; }
        if (name === 'binom') { const r = mk('mrow'); const f = mk('mfrac'); f.setAttribute('linethickness', '0'); f.append(braced(), braced()); r.append(mk('mo', '('), f, mk('mo', ')')); return r; }
        if (name === 'sqrt') {
          if (src[i] === '[') { const end = src.indexOf(']', i); if (end < 0) throw new Error('root'); const idx = src.slice(i + 1, end); i = end + 1; const r = mk('mroot'); r.append(braced(), mk('mn', idx)); return r; }
          const s = mk('msqrt'); s.appendChild(braced()); return s;
        }
        if (name === 'text' || name === 'textrm' || name === 'mbox' || name === 'operatorname') return mk(name === 'operatorname' ? 'mi' : 'mtext', textArg());
        if (name === 'mathbf' || name === 'mathrm' || name === 'mathit' || name === 'mathbb' || name === 'mathcal' || name === 'boldsymbol') {
          const n = braced(); n.setAttribute('mathvariant', { mathbf: 'bold', boldsymbol: 'bold', mathrm: 'normal', mathit: 'italic', mathbb: 'double-struck', mathcal: 'script' }[name]); return n;
        }
        if (name === 'hat' || name === 'bar' || name === 'vec' || name === 'tilde' || name === 'dot' || name === 'overline') {
          const o = mk('mover'); o.setAttribute('accent', 'true'); o.append(braced(), mk('mo', { hat: '^', bar: '¯', vec: '→', tilde: '~', dot: '˙', overline: '¯' }[name])); return o;
        }
        if (name === 'left' || name === 'right' || name === 'big' || name === 'Big' || name === 'bigg' || name === 'Bigg') {
          while (src[i] === ' ') i++;
          if (src[i] === '.') { i++; return mk('mrow'); }
          return atom(depth + 1);
        }
        if (name === '\\') return mk('mspace');
        if (name in SPACES) { const s = mk('mspace'); s.setAttribute('width', SPACES[name]); return s; }
        if (name in GREEK) return mk('mi', GREEK[name]);
        if (name in OPS) return mk('mo', OPS[name]);
        if (FUNCS.has(name)) { const f = mk('mi', name); f.setAttribute('mathvariant', 'normal'); return f; }
        throw new Error('unknown command');
      }
      if (ch === '}' || ch === '^' || ch === '_') throw new Error('unexpected');
      if (/[0-9.]/.test(ch)) { const m = /^[0-9]*\.?[0-9]+|^[0-9]+/.exec(src.slice(i)); if (m) { i += m[0].length; return mk('mn', m[0]); } }
      i++;
      if (/[A-Za-z]/.test(ch)) return mk('mi', ch);
      if (ch === '&') return mk('mspace');
      return mk('mo', ch === '-' ? '−' : ch === '*' ? '∗' : ch === "'" ? '′' : ch);
    }
    function list(close, depth) {
      const out = [];
      for (;;) {
        while (src[i] === ' ' || src[i] === '\n') i++;
        if (i >= src.length) { if (close) throw new Error('unclosed group'); return out; }
        if (close && src[i] === close) return out;
        let base = atom(depth);
        if (!base) return out;
        let sub = null; let sup = null;
        for (let k = 0; k < 2; k++) {
          while (src[i] === ' ') i++;
          if (src[i] === '_' && !sub) { i++; sub = braced(); } else if (src[i] === '^' && !sup) { i++; sup = braced(); }
        }
        if (sub || sup) {
          const big = base.tagName && /^(∑|∏|lim)$/.test(base.textContent) && display;
          const n = mk(sub && sup ? (big ? 'munderover' : 'msubsup') : sub ? (big ? 'munder' : 'msub') : (big ? 'mover' : 'msup'));
          n.appendChild(base); if (sub) n.appendChild(sub); if (sup) n.appendChild(sup);
          base = n;
        }
        out.push(base);
      }
    }
    try {
      const math = mk('math');
      math.setAttribute('display', display ? 'block' : 'inline');
      math.setAttribute('alttext', src.slice(0, 300));
      const semantics = row(list('', 0));
      math.appendChild(semantics);
      return math;
    } catch { return null; }
  }
  function math(parent, tex, display) {
    const node = mathNode(tex, display);
    if (node) parent.appendChild(node);
    else parent.appendChild(el('code', 'math-fallback', tex));
    return parent;
  }
  const MATHY = /[\\^_=]|^[A-Za-z]$/;

  // Inline formatting and safe links. Known legal links use concise labels and first-party routes.
  const knownLegalLink = (label, rawUrl) => {
    const name = String(label || '').replace(/[*_]/g, '').trim().toLowerCase();
    const url = String(rawUrl || '').toLowerCase();
    if (/terms/.test(name) || /terms/.test(url)) return { href: '/legal.html?doc=terms', label: 'Terms of Service' };
    if (/privacy/.test(name) || /privacy/.test(url)) return { href: '/legal.html?doc=privacy', label: 'Privacy Notice' };
    return null;
  };

  function inline(parent, text) {
    // Prefer longer tokens first so strong/emphasis/strike never partially
    // consume a link or inline-code span. Raw HTML is intentionally not parsed.
    const re = /(\\\([^\n]{1,400}?\\\)|\$(?![\s$])[^$\n]{0,400}?[^\s\\$]\$(?!\d)|\[[^\]\n]+\]\(https?:\/\/[^)\s]+\)|\*\*\*[^*\n]+\*\*\*|\*\*[^*\n]+\*\*|~~[^~\n]+~~|\*[^*\n]+\*|_[^_\n]+_|\x60[^\x60\n]+\x60|https?:\/\/[^\s<>()"']+[^\s<>()"'.,;:!?])/g;
    let last = 0; let m;
    while ((m = re.exec(text))) {
      if (m.index > last) parent.appendChild(document.createTextNode(text.slice(last, m.index)));
      const t = m[0];
      if (t.startsWith('\\(')) math(parent, t.slice(2, -2), false);
      else if (t.startsWith('$')) {
        const tex = t.slice(1, -1);
        if (MATHY.test(tex)) math(parent, tex, false);
        else { parent.appendChild(document.createTextNode('$')); inline(parent, tex); parent.appendChild(document.createTextNode('$')); }
      } else if (t.startsWith('[')) {
        const md = /^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/.exec(t);
        if (!md) parent.appendChild(document.createTextNode(t));
        else {
          const legal = knownLegalLink(md[1], md[2]);
          const href = legal ? legal.href : md[2];
          const label = legal ? legal.label : md[1];
          let valid = false;
          try { valid = ['http:', 'https:'].includes(new URL(href, location.origin).protocol); } catch { valid = false; }
          if (valid) {
            const a = el('a', 'assistant-link', label);
            a.href = href;
            a.rel = 'noopener noreferrer nofollow';
            if (/^https?:\/\//i.test(href) && new URL(href).origin !== location.origin) a.target = '_blank';
            parent.appendChild(a);
          } else parent.appendChild(document.createTextNode(label));
        }
      } else if (t.startsWith('***')) {
        const strong = el('strong');
        strong.appendChild(el('em', '', t.slice(3, -3)));
        parent.appendChild(strong);
      } else if (t.startsWith('**')) parent.appendChild(el('strong', '', t.slice(2, -2)));
      else if (t.startsWith('~~')) parent.appendChild(el('del', '', t.slice(2, -2)));
      else if (t.startsWith('*') || t.startsWith('_')) parent.appendChild(el('em', '', t.slice(1, -1)));
      else if (t.startsWith('\x60')) parent.appendChild(el('code', '', t.slice(1, -1)));
      else {
        let valid = false;
        try { valid = ['http:', 'https:'].includes(new URL(t).protocol); } catch { valid = false; }
        if (valid) {
          const legal = knownLegalLink('', t);
          const a = el('a', 'assistant-link', legal ? legal.label : t.replace(/^https?:\/\/(www\.)?/, '').slice(0, 60) + (t.length > 68 ? '…' : ''));
          a.href = legal ? legal.href : t;
          a.rel = 'noopener noreferrer nofollow';
          if (!legal) a.target = '_blank';
          parent.appendChild(a);
        } else parent.appendChild(document.createTextNode(t));
      }
      last = m.index + t.length;
    }
    if (last < text.length) parent.appendChild(document.createTextNode(text.slice(last)));
    return parent;
  }

  // Status icons: outline line icons drawn here (the page loads nothing from
  // other sites). Each row of a [[checks]] block and each status emoji at the
  // start of a line gets one: done, failed, warning, secured, info, action.
  const SVG = 'http://www.w3.org/2000/svg';
  const ICONS = {
    ok: ['M12 3a9 9 0 1 1 0 18a9 9 0 1 1 0-18z', 'm8.5 12.4 2.4 2.4 4.6-4.9'],
    fail: ['M12 3a9 9 0 1 1 0 18a9 9 0 1 1 0-18z', 'm9.2 9.2 5.6 5.6M14.8 9.2l-5.6 5.6'],
    warn: ['M10.3 4.3 2.6 18a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0z', 'M12 9.5v4M12 17v.01'],
    secure: ['M12 3 5 6v5.6c0 4.3 2.9 8.2 7 9.4 4.1-1.2 7-5.1 7-9.4V6z', 'm9.2 12.1 2 2 3.8-4'],
    info: ['M12 3a9 9 0 1 1 0 18a9 9 0 1 1 0-18z', 'M12 11v5.5M12 7.6v.01'],
    key: ['M7.5 11.5a4 4 0 1 1 0 8a4 4 0 1 1 0-8z', 'm10.4 12.6 8.6-8.6M16.5 6.5l2.2 2.2M14 9l2.2 2.2']
  };
  const STATUS = { ok: 'ok', done: 'ok', pass: 'ok', passed: 'ok', success: 'ok', fail: 'fail', failed: 'fail', error: 'fail', x: 'fail',
    warn: 'warn', warning: 'warn', risk: 'warn', secure: 'secure', secured: 'secure', shield: 'secure', blocked: 'secure',
    info: 'info', note: 'info', todo: 'key', action: 'key', key: 'key' };
  const EMOJI = { '✅': 'ok', '✔️': 'ok', '✔': 'ok', '❌': 'fail', '✖️': 'fail', '⚠️': 'warn', '⚠': 'warn', '🛡️': 'secure', '🛡': 'secure', '🔒': 'secure', 'ℹ️': 'info', '🔑': 'key', '👉': 'key' };
  function icon(kind) {
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('class', 'st-ico st-' + kind);
    for (const d of ICONS[kind]) { const path = document.createElementNS(SVG, 'path'); path.setAttribute('d', d); svg.appendChild(path); }
    return svg;
  }
  const LABEL = { ok: 'Done', fail: 'Failed', warn: 'Warning', secure: 'Secured', info: 'Note', key: 'Action needed' };
  const EMOJI_LEAD = new RegExp('^(' + Object.keys(EMOJI).map((e) => e.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\\s*');
  // A line that starts with a status emoji: the emoji becomes the icon.
  function leadIcon(parent, text) {
    const m = EMOJI_LEAD.exec(text);
    if (!m) return inline(parent, text);
    const kind = EMOJI[m[1]];
    parent.classList.add('st-line');
    const ico = icon(kind);
    ico.setAttribute('role', 'img');
    ico.setAttribute('aria-label', LABEL[kind]);
    ico.removeAttribute('aria-hidden');
    parent.appendChild(ico);
    return inline(parent, text.slice(m[0].length));
  }
  // [[checks title="Tests"]] then rows "status | item | badge" (badge optional).
  const CHECKS_OPEN = /^\[\[checks(?:\s+title\s*=\s*"([^"\n]{0,80})")?\s*\]\]$/i;
  function checksBlock(title, rows) {
    const card = el('div', 'checks');
    if (title) card.appendChild(inline(el('p', 'checks-title'), title));
    const list = el('ul', 'checks-list');
    for (const row of rows.slice(0, 30)) {
      const parts = row.split('|').map((x) => x.trim());
      const kind = STATUS[(parts[0] || '').toLowerCase()];
      const item = kind ? parts[1] || '' : parts[0];
      const badge = kind ? parts[2] || '' : parts[1] || '';
      const k = kind || 'info';
      const li = el('li', 'check st-row-' + k);
      const ico = icon(k);
      ico.setAttribute('role', 'img');
      ico.setAttribute('aria-label', LABEL[k]);
      ico.removeAttribute('aria-hidden');
      li.append(ico, inline(el('span', 'check-text'), item));
      if (badge) li.appendChild(el('span', 'check-badge st-badge-' + k, badge.slice(0, 40)));
      list.appendChild(li);
    }
    card.appendChild(list);
    return card;
  }

  // Tables: at most 8 columns and 50 rows, cell text only (inline formatting).
  const TABLE_SEP = /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?$/;
  const MAX_COLS = 8;
  const MAX_ROWS = 50;
  const cells = (row) => row.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());

  const LONG_CODE = 28;
  const CALLOUT = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*(.*)$/i;
  const CALLOUT_ICON = { note: 'info', tip: 'ok', important: 'key', warning: 'warn', caution: 'fail' };
  const CALLOUT_LABEL = { note: 'Note', tip: 'Tip', important: 'Important', warning: 'Warning', caution: 'Caution' };
  // A bullet item: "[ ] task" / "[x] done" become read-only checkboxes.
  function listItem(text) {
    const task = /^\[([ xX])\]\s+(.+)$/.exec(text);
    if (!task) return leadIcon(el('li'), text);
    const li = el('li', 'task-item' + (task[1].toLowerCase() === 'x' ? ' is-complete' : ''));
    const box = el('input', 'task-checkbox');
    box.type = 'checkbox';
    box.checked = task[1].toLowerCase() === 'x';
    box.disabled = true;
    box.setAttribute('aria-label', (box.checked ? 'Completed: ' : 'Not completed: ') + task[2].slice(0, 100));
    li.append(box, inline(el('span', 'task-text'), task[2]));
    return li;
  }

  // Returns { node, blocks } where blocks are the top-level elements (for the
  // reveal animation) and steps are numbered items people can tick off.
  function render(text) {
    // Fail safely if the optional Generative UI enhancer did not initialize
    // (for example, a stale mobile asset or a tier-specific render path).
    // Never expose internal [[ui]] protocol envelopes as ordinary assistant text.
    text = String(text ?? '').replace(/\[\[\s*ui\s*\]\]\s*([\s\S]{1,12000}?)\s*\[\[\s*\/ui\s*\]\]/gi, (whole, rawPayload) => {
      let payload = null;
      try { payload = JSON.parse(String(rawPayload).trim()); } catch { /* safe generic fallback below */ }
      if (payload && typeof payload === 'object' && !Array.isArray(payload) && payload.type === 'search' && typeof payload.query === 'string' && payload.query.trim()) {
        return 'Web search requested: ' + payload.query.trim().slice(0, 240) + '.';
      }
      return 'An interactive response could not be displayed. Please try again.';
    });
    // Normalize provider-escaped line breaks, even when JSON/provider layers double-escape them.
    // This runs at the final UI rendering boundary, before paragraph/list parsing.
    const normalized = String(text ?? '')
      .replace(/\\{1,}r\\{1,}n/g, '\n')
      .replace(/\\{1,}n[ \t]*\\{1,}n/g, '\n\n')
      .replace(/\\{1,}n/g, '\n')
      .replace(/\\{1,}r/g, '\n');
    text = normalized;
    const frag = document.createDocumentFragment();
    const blocks = [];
    const add = (n) => { frag.appendChild(n); blocks.push(n); return n; };
    const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
    let para = []; let list = null; let listKind = '';
    let sub = null; let subHost = null; let subKind = '';

    const flushPara = () => {
      if (!para.length) return;
      add(leadIcon(el('p'), para.join(' ')));
      para = [];
    };
    const endList = () => { list = null; listKind = ''; sub = null; subHost = null; subKind = ''; };

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      const line = raw.trim();

      // ``` code block ```
      if (line.startsWith('```')) {
        flushPara(); endList();
        const lang = line.slice(3).trim().slice(0, 20);
        const code = [];
        i++;
        while (i < lines.length && !lines[i].trim().startsWith('```')) code.push(lines[i++]);
        const wrap = add(el('div', 'code-block'));
        const head = el('div', 'code-head');
        head.appendChild(el('span', 'code-lang', lang || 'code'));
        const copy = el('button', 'code-copy', 'Copy');
        copy.type = 'button';
        copy.dataset.copy = code.join('\n');
        head.appendChild(copy);
        const pre = el('pre');
        const codeEl = el('code', lang ? 'lang-' + lang.toLowerCase().replace(/[^a-z0-9+#-]/g, '') : '');
        highlight(codeEl, code.join('\n'), lang);
        pre.appendChild(codeEl);
        wrap.append(head, pre);
        // Long code starts folded; the button in app.js opens it.
        if (code.length > LONG_CODE) {
          wrap.className += ' is-long';
          const more = el('button', 'code-expand', 'Show all ' + code.length + ' lines');
          more.type = 'button';
          more.setAttribute('aria-expanded', 'false');
          wrap.appendChild(more);
        }
        continue;
      }

      // $$ … $$ or \[ … \] display math (one line or several).
      const mathOpen = /^(\$\$|\\\[)/.exec(line);
      if (mathOpen) {
        const close = mathOpen[1] === '$$' ? '$$' : '\\]';
        flushPara(); endList();
        let body = line.slice(2);
        if (body.trim().endsWith(close) && body.trim().length >= close.length) body = body.trim().slice(0, -close.length);
        else {
          const rows = [body];
          let j = i + 1;
          while (j < lines.length && j - i <= 40 && !lines[j].trim().endsWith(close)) rows.push(lines[j++]);
          if (j < lines.length && lines[j].trim().endsWith(close)) { rows.push(lines[j].trim().slice(0, -close.length)); i = j; body = rows.join('\n'); }
          else { para.push(line); continue; }
        }
        add(math(el('div', 'math-block'), body, true));
        continue;
      }
      if (!line) { flushPara(); endList(); continue; }

      // [[checks title="..."]] status rows [[/checks]]
      const open = CHECKS_OPEN.exec(line);
      if (open) {
        flushPara(); endList();
        const rows = [];
        i++;
        while (i < lines.length && !/^\[\[\/checks\]\]$/i.test(lines[i].trim())) { if (lines[i].trim()) rows.push(lines[i].trim()); i++; }
        add(checksBlock(open[1] || '', rows));
        continue;
      }

      // Horizontal rules create breathing room between long answer sections.
      if (/^(?:-{3,}|_{3,}|\*{3,})$/.test(line)) {
        flushPara(); endList();
        add(el('hr', 'answer-divider'));
        continue;
      }

      // | a | b | table: a header row, a --- separator row, then body rows.
      if (line.includes('|') && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1].trim())) {
        flushPara(); endList();
        const head = cells(line).slice(0, MAX_COLS);
        const body = [];
        i += 2;
        while (i < lines.length && lines[i].trim().includes('|') && lines[i].trim()) {
          if (body.length < MAX_ROWS) body.push(cells(lines[i].trim()).slice(0, MAX_COLS));
          i++;
        }
        i--;
        const wrap = add(el('div', 'table-wrap'));
        wrap.setAttribute('role', 'region');
        wrap.setAttribute('aria-label', 'Table');
        wrap.setAttribute('tabindex', '0');
        const table = el('table');
        const thead = el('thead');
        const hr = el('tr');
        for (const c of head) hr.appendChild(inline(el('th'), c));
        thead.appendChild(hr);
        const tbody = el('tbody');
        for (const r of body) {
          const tr = el('tr');
          for (let k = 0; k < head.length; k++) tr.appendChild(inline(el('td'), r[k] || ''));
          tbody.appendChild(tr);
        }
        table.append(thead, tbody);
        wrap.appendChild(table);
        continue;
      }

      let m = /^(#{1,6})\s+(.+)$/.exec(line);
      if (m) { flushPara(); endList(); add(leadIcon(el(m[1].length <= 2 ? 'h3' : 'h4'), m[2].replace(/\s*#+\s*$/, ''))); continue; }

      // An indented item nests under the item above it (one level deep).
      const indent = /^[ \t]*/.exec(raw)[0].replace(/\t/g, '  ').length;
      m = indent >= 2 && list && list.lastElementChild ? /^(?:([-*•])|(\d{1,3})[.)])\s+(.+)$/.exec(line) : null;
      if (m) {
        const kind = m[1] ? 'ul' : 'ol';
        const host = list.lastElementChild;
        if (!sub || subHost !== host || subKind !== kind) {
          sub = el(kind, 'sub-list');
          if (kind === 'ol' && m[2] !== '1') sub.start = Number(m[2]);
          host.appendChild(sub); subHost = host; subKind = kind;
        }
        sub.appendChild(listItem(m[3]));
        continue;
      }

      m = /^(\d{1,3})[.)]\s+(.+)$/.exec(line);
      if (m) {
        flushPara();
        if (listKind !== 'ol') {
          list = add(el('ol', 'steps'));
          if (m[1] !== '1') list.start = Number(m[1]);
          listKind = 'ol';
        }
        const li = el('li', 'step');
        const tick = el('button', 'step-tick');
        tick.type = 'button';
        tick.setAttribute('aria-pressed', 'false');
        tick.setAttribute('aria-label', 'Mark step done');
        const body = inline(el('div', 'step-text'), m[2]);
        li.append(tick, body);
        list.appendChild(li);
        continue;
      }

      m = /^[-*•]\s+(.+)$/.exec(line);
      if (m) {
        flushPara();
        if (listKind !== 'ul') { list = add(el('ul')); listKind = 'ul'; }
        list.appendChild(listItem(m[1]));
        continue;
      }

      // > quotes: consecutive lines form one quote; "> [!NOTE]" (TIP,
      // IMPORTANT, WARNING, CAUTION) starts a callout box instead.
      m = /^>\s?(.*)$/.exec(line);
      if (m) {
        flushPara(); endList();
        const rows = [m[1]];
        while (i + 1 < lines.length && /^>/.test(lines[i + 1].trim())) rows.push(lines[++i].trim().replace(/^>\s?/, ''));
        const callout = CALLOUT.exec(rows[0].trim());
        const paras = [];
        let cur = [];
        for (const r of callout ? rows.slice(1) : rows) {
          if (r.trim()) cur.push(r.trim()); else if (cur.length) { paras.push(cur.join(' ')); cur = []; }
        }
        if (cur.length) paras.push(cur.join(' '));
        if (callout) {
          const type = callout[1].toLowerCase();
          const box = add(el('div', 'callout callout-' + type));
          box.setAttribute('role', 'note');
          const title = el('p', 'callout-title');
          title.append(icon(CALLOUT_ICON[type]), document.createTextNode(callout[2].trim() || CALLOUT_LABEL[type]));
          box.appendChild(title);
          for (const p of paras) box.appendChild(inline(el('p'), p));
        } else if (paras.length <= 1) add(inline(el('blockquote'), paras[0] || ''));
        else { const q = add(el('blockquote')); for (const p of paras) q.appendChild(inline(el('p'), p)); }
        continue;
      }

      // A wrapped line that continues a list item.
      if (list && /^\s{2,}\S/.test(raw) && list.lastElementChild) {
        const target = list.lastElementChild.querySelector('.step-text') || list.lastElementChild;
        target.appendChild(document.createTextNode(' '));
        inline(target, line);
        continue;
      }
      endList();
      para.push(line);
    }
    flushPara();
    return { node: frag, blocks };
  }

  // Plain words for copying and reading aloud: no Markdown symbols.
  function plain(text) {
    return String(text)
      .replace(/^\[\[checks(?:\s+title\s*=\s*"([^"\n]*)")?\s*\]\]$/gim, (_, t) => t || '')
      .replace(/^\[\[\/checks\]\]$/gim, '')
      .replace(/^(ok|done|pass|passed|success|fail|failed|error|x|warn|warning|risk|secure|secured|shield|blocked|info|note|todo|action|key)\s*\|\s*([^|\n]*?)\s*(?:\|\s*([^|\n]*))?$/gim, (_, k, item, badge) => '• ' + item + (badge ? ' — ' + badge : ''))
      .replace(/^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$\n?/gm, '')
      .replace(/^\|(.*)\|\s*$/gm, (row, inner) => inner.split('|').map((c) => c.trim()).join(' · '))
      .replace(/```[\s\S]*?```/g, (b) => b.replace(/```[^\n]*\n?/g, ''))
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/^>\s?\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*/gim, (_, k) => k[0].toUpperCase() + k.slice(1).toLowerCase() + ': ')
      .replace(/^\s*(\$\$|\\\[|\\\])\s*$/gm, '')
      .replace(/\$\$([^$]+)\$\$/g, '$1')
      .replace(/\\\(([^\n]*?)\\\)/g, '$1')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/^[-*•]\s+/gm, '• ')
      .replace(/^>\s?/gm, '')
      .trim();
  }

  // External URLs are collected into the collapsed Sources & Resources control.
  // Code is masked first so examples and snippets never become accidental citations.
  const SOURCES_BLOCK = /\n*\*\*Sources\*\*\n((?:- \[[^\]\n]*\]\(<[^>\s]+>\)[ \t]*(?:\n|$))+)\s*$/;
  function sources(text) {
    const raw = String(text || '');
    const code = [];
    const mask = (value, pattern) => value.replace(pattern, (match) => {
      const token = '\uE000NASRINCODE' + code.length + '\uE001';
      code.push(match);
      return token;
    });
    let visible = mask(raw, /\x60\x60\x60[\s\S]*?\x60\x60\x60|\x60[^\x60\n]*\x60/g);
    const block = SOURCES_BLOCK.exec(visible);
    if (block) visible = visible.slice(0, block.index).trim();
    const links = [];
    const addLink = (title, rawUrl) => {
      let u;
      try { u = new URL(rawUrl, location.origin); } catch { return { ok: false, internal: false }; }
      if (!['https:', 'http:'].includes(u.protocol) || !u.hostname || u.username || u.password) {
        return { ok: false, internal: false };
      }
      const internal = u.hostname === 'nasrinai.com' || u.hostname.endsWith('.nasrinai.com')
        || u.hostname === new URL(location.origin).hostname;
      if (internal) return { ok: true, internal: true };
      const host = u.hostname.replace(/^www\./, '');
      if (!links.some((item) => item.url === u.href)) {
        links.push({ title: String(title || '').trim() || host, url: u.href, host });
      }
      return { ok: true, internal: false };
    };
    if (block) {
      for (const [, title, url] of block[1].matchAll(/- \[([^\]\n]*)\]\(<([^>\s]+)>\)/g)) {
        const result = addLink(title, url);
        if (!result.ok) return { text: raw, links: [] };
      }
    }
    // Same-site navigation stays inline; external destinations move into Resources.
    visible = visible.replace(/\[([^\]\n]+)\]\((?:<(https?:\/\/[^>\s]+)>|(https?:\/\/[^)\s]+))\)/g, (match, title, angled, plain) => {
      const result = addLink(title, angled || plain);
      return result.ok && !result.internal ? title : match;
    });
    // Bare external URLs move into Resources too. URLs inside code are masked.
    visible = visible.replace(/https?:\/\/[^\s<>()"']+[^\s<>()"'.,;:!?]/g, (url) => {
      const cleaned = url.replace(/[)\]}]+$/, '');
      const result = addLink('', cleaned);
      return result.ok && !result.internal ? '' : url;
    });
    visible = visible.replace(/[ \t]{2,}/g, ' ').replace(/ +([,.;:!?])/g, '$1').replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    visible = visible.replace(/\uE000NASRINCODE(\d+)\uE001/g, (_, n) => code[Number(n)] || '');
    return { text: visible, links: links.slice(0, 20) };
  }
  window.NasrinFormat = { render, plain, sources, highlight, mathNode };
})();
