// Citation formats for one source (docs/citations.md). The details come from
// POST /v1/cite (the source's own publication tags, or Crossref for a DOI);
// this file only arranges them, it never adds or guesses a fact. A missing
// date is written "n.d." (or left out where a style does so); missing parts
// are left out.
//
// format(citation, style) -> [{ t, i? }]  text parts (i: italic), built into
//                                         nodes by the page, never HTML.
// plain(parts) -> string, html(parts) -> escaped HTML (for pasting into Word).
// Exposes window.NasrinCite = { STYLES, format, plain, html }.
(() => {
  const STYLES = [
    { id: 'apa', label: 'APA 7' },
    { id: 'mla', label: 'MLA 9' },
    { id: 'chicago', label: 'Chicago' },
    { id: 'harvard', label: 'Harvard' },
    { id: 'ieee', label: 'IEEE' },
    { id: 'vancouver', label: 'Vancouver' },
    { id: 'bibtex', label: 'BibTeX' }
  ];
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const MLA_MONTHS = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'June', 'July', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.'];
  const IEEE_MONTHS = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'Jun.', 'Jul.', 'Aug.', 'Sep.', 'Oct.', 'Nov.', 'Dec.'];

  const initials = (given, { dots = true, space = true } = {}) => String(given || '').split(/\s+/).filter(Boolean)
    .map((w) => w.split('-').map((p) => p[0].toUpperCase() + (dots ? '.' : '')).join('-')).join(space ? ' ' : '');
  const isWeb = (c) => c.type === 'webpage' || c.type === 'article';
  const isBook = (c) => c.type === 'book';
  const end = (s) => (/[.?!]$/.test(s) ? s : s + '.');
  const doiUrl = (c) => (c.doi ? 'https://doi.org/' + c.doi : c.url || '');
  const day = (iso) => { const [y, m, d] = String(iso).split('-').map(Number); return { y, m, d }; };

  function list(names, { last = ', & ', two = ' & ', sep = ', ' } = {}) {
    if (names.length <= 1) return names.join('');
    if (names.length === 2) return names[0] + two + names[1];
    return names.slice(0, -1).join(sep) + last + names.at(-1);
  }

  // ---------- the styles ----------

  function apa(c) {
    const names = c.authors.map((a) => (a.literal ? a.literal : a.family + (a.given ? ', ' + initials(a.given) : '')));
    let who = names.length > 20 ? names.slice(0, 19).join(', ') + ', . . . ' + names.at(-1) : list(names, { last: ', & ', two: ', & ' });
    const p = c.published;
    const when = !p ? 'n.d.' : isWeb(c) && p.month ? `${p.year}, ${MONTHS[p.month - 1]}${p.day ? ' ' + p.day : ''}` : String(p.year);
    const parts = [];
    if (who) parts.push({ t: end(who) + ' (' + when + '). ' });
    if (isBook(c)) {
      parts.push({ t: end(c.title), i: true });
      if (!who) parts.push({ t: ' (' + when + ').' });
      if (c.publisher) parts.push({ t: ' ' + end(c.publisher) });
    } else if (c.container && !isWeb(c)) {
      parts.push({ t: end(c.title) + (who ? '' : ' (' + when + ').') + ' ' });
      parts.push({ t: c.container, i: true });
      if (c.volume) { parts.push({ t: ', ' }); parts.push({ t: c.volume, i: true }); }
      if (c.issue) parts.push({ t: '(' + c.issue + ')' });
      if (c.pages) parts.push({ t: ', ' + c.pages });
      parts.push({ t: '.' });
    } else {
      parts.push({ t: end(c.title), i: true });
      if (!who) parts.push({ t: ' (' + when + ').' });
      if (c.container && c.container !== who) parts.push({ t: ' ' + end(c.container) });
    }
    const link = doiUrl(c);
    if (link) parts.push({ t: ' ' + link });
    return parts;
  }

  function mla(c) {
    const a = c.authors;
    const first = a[0] ? (a[0].literal || a[0].family + (a[0].given ? ', ' + a[0].given : '')) : '';
    const who = a.length >= 3 ? first + ', et al' : a.length === 2 ? first + ', and ' + (a[1].literal || [a[1].given, a[1].family].filter(Boolean).join(' ')) : first;
    const parts = [];
    if (who) parts.push({ t: end(who) + ' ' });
    const p = c.published;
    const date = p ? [p.day, p.month ? MLA_MONTHS[p.month - 1] : '', p.year].filter(Boolean).join(' ') : '';
    if (isBook(c)) {
      parts.push({ t: end(c.title), i: true });
      parts.push({ t: [c.publisher, p ? String(p.year) : ''].filter(Boolean).map((x, i) => (i ? ', ' : ' ') + x).join('') + '.' });
    } else {
      parts.push({ t: '“' + end(c.title) + '” ' });
      const bits = [];
      if (c.container) bits.push({ t: c.container, i: true });
      if (c.volume) bits.push({ t: 'vol. ' + c.volume });
      if (c.issue) bits.push({ t: 'no. ' + c.issue });
      if (date) bits.push({ t: isWeb(c) ? date : String(p.year) });
      if (c.pages) bits.push({ t: (c.pages.includes('–') ? 'pp. ' : 'p. ') + c.pages });
      const link = c.doi ? 'https://doi.org/' + c.doi : (c.url || '').replace(/^https?:\/\//, '');
      if (link) bits.push({ t: link });
      bits.forEach((b, i) => parts.push(i ? { t: ', ' } : { t: '' }, b));
      parts.push({ t: '.' });
    }
    if (isWeb(c) && c.accessed) { const { y, m, d } = day(c.accessed); parts.push({ t: ` Accessed ${d} ${MLA_MONTHS[m - 1]} ${y}.` }); }
    return parts.filter((x) => x.t);
  }

  function chicago(c) {
    const a = c.authors;
    const full = (x, i) => x.literal || (i === 0 ? x.family + (x.given ? ', ' + x.given : '') : [x.given, x.family].filter(Boolean).join(' '));
    const names = a.length > 10 ? a.slice(0, 7).map(full).concat('et al.') : a.map(full);
    const who = a.length > 10 ? names.join(', ') : list(names, { last: ', and ', two: names[0] && a[0] && !a[0].literal ? ', and ' : ' and ' });
    const p = c.published;
    const parts = [];
    parts.push({ t: (who ? end(who) + ' ' : '') + (p ? p.year : 'n.d.') + '. ' });
    if (isBook(c)) {
      parts.push({ t: end(c.title), i: true });
      if (c.publisher) parts.push({ t: ' ' + end(c.publisher) });
    } else {
      parts.push({ t: '“' + end(c.title) + '” ' });
      if (c.container) parts.push({ t: c.container, i: true });
      if (c.volume) parts.push({ t: ' ' + c.volume + (c.issue ? ' (' + c.issue + ')' : '') });
      if (c.pages) parts.push({ t: ': ' + c.pages });
      if (c.container || c.volume || c.pages) parts.push({ t: '.' });
      if (isWeb(c) && c.accessed) { const { y, m, d } = day(c.accessed); parts.push({ t: ` Accessed ${MONTHS[m - 1]} ${d}, ${y}.` }); }
    }
    const link = doiUrl(c);
    if (link) parts.push({ t: ' ' + end(link) });
    return parts;
  }

  function harvard(c) {
    const names = c.authors.map((a) => a.literal || a.family + (a.given ? ', ' + initials(a.given, { space: false }) : ''));
    const who = list(names, { last: ' and ', two: ' and ' });
    const p = c.published;
    const parts = [{ t: (who ? who + ' ' : '') + '(' + (p ? p.year : 'no date') + ') ' }];
    if (isBook(c)) {
      parts.push({ t: c.title, i: true });
      parts.push({ t: '.' + (c.publisher ? ' ' + end(c.publisher) : '') });
    } else if (c.container && !isWeb(c)) {
      parts.push({ t: '‘' + c.title + '’, ' });
      parts.push({ t: c.container, i: true });
      if (c.volume) parts.push({ t: ', ' + c.volume + (c.issue ? '(' + c.issue + ')' : '') });
      if (c.pages) parts.push({ t: ', pp. ' + c.pages });
      parts.push({ t: '.' });
    } else {
      parts.push({ t: c.title, i: true });
      parts.push({ t: '.' });
    }
    if (c.doi) parts.push({ t: ' doi: ' + c.doi + '.' });
    else if (c.url) {
      let at = ' Available at: ' + c.url;
      if (c.accessed) { const { y, m, d } = day(c.accessed); at += ` (Accessed: ${d} ${MONTHS[m - 1]} ${y})`; }
      parts.push({ t: at + '.' });
    }
    return parts;
  }

  function ieee(c) {
    const names = c.authors.map((a) => a.literal || [initials(a.given), a.family].filter(Boolean).join(' '));
    const who = names.length > 6 ? names[0] + ' et al.' : list(names, { last: ', and ', two: ' and ' });
    const p = c.published;
    const parts = [];
    if (who) parts.push({ t: who + ', ' });
    if (isBook(c)) {
      parts.push({ t: c.title, i: true });
      parts.push({ t: '.' + (c.publisher ? ' ' + c.publisher + ',' : '') + (p ? ' ' + p.year : '') + '.' });
      return parts;
    }
    parts.push({ t: '“' + c.title + ',” ' });
    if (c.container && !isWeb(c)) {
      parts.push({ t: c.container, i: true });
      const bits = [c.volume ? 'vol. ' + c.volume : '', c.issue ? 'no. ' + c.issue : '', c.pages ? (c.pages.includes('–') ? 'pp. ' : 'p. ') + c.pages : '', p ? (p.month ? IEEE_MONTHS[p.month - 1] + ' ' : '') + p.year : ''].filter(Boolean);
      parts.push({ t: (bits.length ? ', ' + bits.join(', ') : '') + (c.doi ? ', doi: ' + c.doi : '') + '.' });
    } else {
      if (c.container) parts.push({ t: c.container + '. ' });
      parts.push({ t: '[Online]. Available: ' + (c.url || doiUrl(c)) });
      if (c.accessed) { const { y, m, d } = day(c.accessed); parts.push({ t: ` (accessed ${IEEE_MONTHS[m - 1]} ${d}, ${y}).` }); }
    }
    return parts;
  }

  function vancouver(c) {
    const names = c.authors.map((a) => a.literal || a.family + (a.given ? ' ' + initials(a.given, { dots: false, space: false }) : ''));
    const who = names.length > 6 ? names.slice(0, 6).join(', ') + ', et al' : names.join(', ');
    const p = c.published;
    const parts = [];
    if (who) parts.push({ t: end(who) + ' ' });
    parts.push({ t: end(c.title) + ' ' });
    if (isBook(c)) {
      parts.push({ t: (c.publisher ? c.publisher + '; ' : '') + (p ? p.year : '') + '.' });
    } else if (c.container && !isWeb(c)) {
      parts.push({ t: c.container + '. ' + (p ? p.year : '') + (c.volume ? ';' + c.volume : '') + (c.issue ? '(' + c.issue + ')' : '') + (c.pages ? ':' + c.pages.replace('–', '-') : '') + '.' });
      if (c.doi) parts.push({ t: ' doi:' + c.doi });
    } else {
      parts.push({ t: '[Internet]. ' + (c.container ? c.container + '; ' : '') + (p ? p.year : '[date unknown]') + (c.accessed ? ' [cited ' + c.accessed + ']' : '') + '. Available from: ' + (c.url || doiUrl(c)) });
    }
    return parts;
  }

  function bibtex(c) {
    const kind = isBook(c) ? 'book' : c.type === 'chapter' ? 'incollection' : c.type === 'paper-conference' ? 'inproceedings' : c.type === 'thesis' ? 'phdthesis' : c.container && !isWeb(c) ? 'article' : 'misc';
    const esc = (s) => String(s).replace(/[{}\\]/g, '');
    const firstFamily = (c.authors[0] && (c.authors[0].family || c.authors[0].literal) || 'source').normalize('NFKD').replace(/[^A-Za-z]/g, '').toLowerCase() || 'source';
    const word = (c.title.normalize('NFKD').match(/[A-Za-z]{4,}/) || ['ref'])[0].toLowerCase();
    const key = firstFamily + (c.published ? c.published.year : '') + word;
    const fields = [
      ['author', c.authors.map((a) => (a.literal ? '{' + esc(a.literal) + '}' : esc(a.family) + (a.given ? ', ' + esc(a.given) : ''))).join(' and ')],
      ['title', '{' + esc(c.title) + '}'],
      [kind === 'article' ? 'journal' : kind === 'inproceedings' || kind === 'incollection' ? 'booktitle' : kind === 'misc' ? 'howpublished' : '', esc(c.container || '')],
      ['publisher', kind === 'book' || kind === 'incollection' ? esc(c.publisher || '') : ''],
      ['year', c.published ? String(c.published.year) : ''],
      ['volume', esc(c.volume || '')], ['number', esc(c.issue || '')], ['pages', String(c.pages || '').replace('–', '--')],
      ['doi', c.doi || ''], ['url', c.doi ? '' : c.url || ''], ['urldate', c.doi ? '' : c.accessed || '']
    ].filter(([k, v]) => k && v);
    return [{ t: `@${kind}{${key},\n` + fields.map(([k, v]) => `  ${k} = {${v}}`).join(',\n') + '\n}' }];
  }

  const BY = { apa, mla, chicago, harvard, ieee, vancouver, bibtex };
  function format(citation, style) {
    const c = { authors: [], ...citation, title: String(citation?.title || '').trim() };
    return (BY[style] || apa)(c).filter((x) => x && x.t);
  }
  const plain = (parts) => parts.map((p) => p.t).join('').replace(/ {2,}/g, ' ').trim();
  const escape = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const html = (parts) => parts.map((p) => (p.i ? '<i>' + escape(p.t) + '</i>' : escape(p.t))).join('');

  window.NasrinCite = { STYLES, format, plain, html };
})();
