// The messy-file cleaner: a spreadsheet (.xlsx) or CSV/TSV file in, clean
// tables, a small dashboard and a cleaned workbook out, with nothing lost.
//
// - Runs in the browser only: the file is never sent anywhere and no AI model
//   touches the data. Every step is a plain rule (below), so the same file
//   always gives the same result.
// - Nothing is dropped: spacing is tidied, empty rows/columns are removed,
//   numbers and dates are written one way, and every other value is kept as
//   written. A check then proves that every non-empty value of the original
//   is accounted for (as a title note, a header, a repeated header row or a
//   cell) and that every converted value turns back into its original.
// - Rows that look the same are listed, never deleted.
// - Too big a file is refused with a plain message, never cut short.
//
// Exposes window.NasrinCleaner = { read, clean, workbook, LIMITS }.
(() => {
  const LIMITS = { bytes: 15 * 1024 * 1024, cells: 300000, sheets: 8, unpacked: 64 * 1024 * 1024 };
  const fail = (message) => Object.assign(new Error(message), { code: 'clean_refused' });

  // ---------- reading: text files ----------

  function decodeText(bytes) {
    let text = new TextDecoder('utf-8').decode(bytes);
    // Not UTF-8 (many replacement marks): read it as Windows-1252 instead.
    if ((text.match(/�/g) || []).length > 3) text = new TextDecoder('windows-1252').decode(bytes);
    return text.replace(/^﻿/, '');
  }

  // CSV, semicolon, tab or pipe separated: the separator that splits the first
  // lines most consistently. Quoted cells may hold separators and new lines.
  function parseDelimited(text) {
    const s = String(text).replace(/\r\n?/g, '\n');
    const sample = s.split('\n').slice(0, 20).filter((l) => l.trim());
    let sep = ',';
    let best = -1;
    for (const c of [',', ';', '\t', '|']) {
      const counts = sample.map((l) => l.replace(/"[^"]*"/g, '').split(c).length - 1);
      const lines = counts.filter((n) => n > 0).length;
      const same = counts.filter((n) => n === counts[0]).length;
      const score = counts[0] > 0 ? lines * 2 + same : 0;
      if (score > best) { best = score; sep = c; }
    }
    const rows = [];
    let row = [];
    let cell = '';
    let quoted = false;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (quoted) {
        if (ch === '"' && s[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') quoted = false; else cell += ch;
      } else if (ch === '"' && !cell.trim()) { quoted = true; cell = ''; }
      else if (ch === sep) { row.push(cell); cell = ''; }
      else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += ch;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }

  // ---------- reading: .xlsx (a ZIP of XML files) ----------

  async function unzip(bytes, inflate) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let end = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { end = i; break; }
    if (end < 0) throw fail('This file could not be opened as a spreadsheet.');
    const count = dv.getUint16(end + 10, true);
    let p = dv.getUint32(end + 16, true);
    const entries = new Map();
    for (let n = 0; n < count && n < 5000; n++) {
      if (p + 46 > bytes.length || dv.getUint32(p, true) !== 0x02014b50) break;
      const method = dv.getUint16(p + 10, true);
      const size = dv.getUint32(p + 20, true);
      const compSize = dv.getUint32(p + 24, true);
      const nameLen = dv.getUint16(p + 28, true);
      const extraLen = dv.getUint16(p + 30, true);
      const commentLen = dv.getUint16(p + 32, true);
      const local = dv.getUint32(p + 42, true);
      const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLen));
      entries.set(name, { method, size, compSize, local });
      p += 46 + nameLen + extraLen + commentLen;
    }
    let unpacked = 0;
    const read = async (name) => {
      const e = entries.get(name);
      if (!e) return '';
      unpacked += e.size;
      if (unpacked > LIMITS.unpacked || e.local + 30 > bytes.length) throw fail('This spreadsheet is too large to clean here.');
      const start = e.local + 30 + dv.getUint16(e.local + 26, true) + dv.getUint16(e.local + 28, true);
      const raw = bytes.subarray(start, start + e.compSize);
      let out;
      if (e.method === 0) out = raw;
      else if (e.method === 8) out = await inflate(raw);
      else throw fail('This spreadsheet uses a format that cannot be opened here.');
      return new TextDecoder('utf-8').decode(out);
    };
    return { has: (name) => entries.has(name), read };
  }

  const decodeXml = (s) => String(s)
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
    .replace(/_x([0-9A-F]{4})_/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  const textOf = (xml) => decodeXml([...String(xml).matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(''));
  const attr = (tag, name) => { const m = new RegExp('\\b' + name + '="([^"]*)"').exec(tag); return m ? decodeXml(m[1]) : null; };
  const colIndex = (ref) => [...(/^[A-Z]+/.exec(ref) || [''])[0]].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

  // Built-in Excel number formats that show a date.
  const DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);
  const isDateCode = (code) => /[dy]/i.test(String(code).replace(/"[^"]*"|\[[^\]]*\]|\\./g, ''));
  const serialDate = (serial, base1904) => {
    const days = Math.floor(serial) + (base1904 ? 1462 : 0);
    if (days < 1 || days > 2958465) return null;
    const ms = Date.UTC(1899, 11, 30) + days * 86400000;
    return new Date(ms).toISOString().slice(0, 10);
  };

  async function readXlsx(bytes, inflate) {
    const zip = await unzip(bytes, inflate);
    if (!zip.has('xl/workbook.xml')) throw fail('This file could not be opened as a spreadsheet.');
    const shared = [...(await zip.read('xl/sharedStrings.xml')).matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]));
    const book = await zip.read('xl/workbook.xml');
    const base1904 = /<workbookPr\b[^>]*\bdate1904="(1|true)"/.test(book);
    const rels = new Map([...(await zip.read('xl/_rels/workbook.xml.rels')).matchAll(/<Relationship\b[^>]*>/g)].map((m) => [attr(m[0], 'Id'), attr(m[0], 'Target')]));
    const styles = await zip.read('xl/styles.xml');
    const custom = new Map([...styles.matchAll(/<numFmt\b[^>]*>/g)].map((m) => [Number(attr(m[0], 'numFmtId')), attr(m[0], 'formatCode') || '']));
    const xfs = ((/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(styles) || [])[1] || '');
    const dateStyle = [...xfs.matchAll(/<xf\b[^>]*>/g)].map((m) => { const id = Number(attr(m[0], 'numFmtId') || 0); return DATE_FORMATS.has(id) || (custom.has(id) && isDateCode(custom.get(id))); });
    const sheets = [];
    let cells = 0;
    for (const m of book.matchAll(/<sheet\b[^>]*>/g)) {
      if (sheets.length >= LIMITS.sheets) throw fail(`This workbook has more than ${LIMITS.sheets} sheets. Split it, then try again.`);
      const target = rels.get(attr(m[0], 'r:id')) || '';
      const path = target.startsWith('/') ? target.slice(1) : 'xl/' + target.replace(/^\.\//, '');
      const xml = await zip.read(path);
      const grid = [];
      for (const row of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>|<row\b([^>]*)\/>/g)) {
        const r = Number(attr('<x ' + (row[1] || row[3] || '') + '>', 'r')) || grid.length + 1;
        const line = [];
        for (const c of (row[2] || '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
          const tag = '<c ' + c[1] + '>';
          const ref = attr(tag, 'r');
          const col = ref ? colIndex(ref) : line.length;
          if (col < 0) continue;
          const type = attr(tag, 't');
          const body = c[2] || '';
          const v = (/<v>([\s\S]*?)<\/v>/.exec(body) || [])[1];
          let value = '';
          if (type === 's') value = shared[Number(v)] ?? '';
          else if (type === 'inlineStr') value = textOf(body);
          else if (type === 'b') value = v === '1' ? 'TRUE' : 'FALSE';
          else if (type === 'str' || type === 'e') value = decodeXml(v ?? '');
          else if (v !== undefined) {
            const num = Number(v);
            const s = Number(attr(tag, 's') || 0);
            value = dateStyle[s] && Number.isFinite(num) && Number.isInteger(num) ? (serialDate(num, base1904) || decodeXml(v)) : decodeXml(v);
          }
          if (value === '') continue;
          while (line.length < col) line.push('');
          line[col] = value;
          if (++cells > LIMITS.cells) throw fail(`This file has more than ${LIMITS.cells.toLocaleString('en-US')} filled cells. Split it, then try again.`);
        }
        while (grid.length < r - 1) grid.push([]);
        grid[r - 1] = line;
      }
      sheets.push({ name: attr(m[0], 'name') || 'Sheet ' + (sheets.length + 1), grid });
    }
    return sheets;
  }

  // file: { name, bytes: Uint8Array }. inflate(Uint8Array) -> Promise<Uint8Array>.
  async function read(file, inflate) {
    const bytes = file.bytes;
    if (bytes.length > LIMITS.bytes) throw fail('This file is larger than 15 MB. Split it, then try again.');
    if (bytes[0] === 0xd0 && bytes[1] === 0xcf) throw fail('This is an old Excel file (.xls). Save it as .xlsx or .csv, then try again.');
    if (bytes[0] === 0x50 && bytes[1] === 0x4b) return readXlsx(bytes, inflate);
    const grid = parseDelimited(decodeText(bytes));
    if (grid.reduce((n, r) => n + r.length, 0) > LIMITS.cells) throw fail(`This file has more than ${LIMITS.cells.toLocaleString('en-US')} cells. Split it, then try again.`);
    return [{ name: String(file.name || 'Data').replace(/\.[^.]+$/, '').slice(0, 31) || 'Data', grid }];
  }

  // ---------- cleaning rules ----------

  const tidy = (v) => String(v ?? '').replace(/[   ​﻿]/g, ' ').replace(/\s+/g, ' ').trim();
  const CURRENCY = /^(?:[₱$€£¥₩₹]|PHP|USD|EUR|GBP)\s?/i;

  // A number as written in a file: 1,234.50  -12  (12)  ₱1,200  12%  -> { n, unit, pct }.
  // Not numbers: leading zeros (IDs, ZIP codes), more than 15 digits (phone or account numbers).
  function parseNumber(v) {
    let s = v;
    let neg = false;
    let unit = '';
    if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1).trim(); }
    if (/^-/.test(s)) { neg = !neg; s = s.slice(1).trim(); }
    const cur = CURRENCY.exec(s);
    if (cur) { unit = cur[0].trim().toUpperCase(); s = s.slice(cur[0].length); }
    if (/^\(.*\)$/.test(s) && !neg) { neg = true; s = s.slice(1, -1).trim(); }
    if (/^-/.test(s) && !neg) { neg = true; s = s.slice(1); }
    let pct = false;
    if (/%$/.test(s)) { pct = true; s = s.slice(0, -1).trim(); }
    if (!/^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/.test(s)) return null;
    const digits = s.replace(/,/g, '');
    if (/^0\d/.test(digits) || digits.replace('.', '').length > 15) return null;
    if (pct && unit) return null;
    const n = Number(digits) * (neg ? -1 : 1);
    return { n: pct ? Number((n / 100).toPrecision(15)) : n, unit, pct, canon: (neg ? '-' : '') + digits };
  }

  const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const iso = (y, m, d) => {
    const t = Date.UTC(y, m - 1, d);
    const dt = new Date(t);
    if (y < 1000 || y > 9999 || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
    return dt.toISOString().slice(0, 10);
  };
  // A date: { iso } or, for 03/04/2026, { a: 3, b: 4, y } (which is the day is decided per column).
  function parseDate(v) {
    let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(v);
    if (m) { const d = iso(+m[1], +m[2], +m[3]); return d ? { iso: d } : null; }
    m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(v);
    if (m) return { a: +m[1], b: +m[2], y: +m[3] };
    m = /^(\d{1,2})[ -]([A-Za-z]{3,9})\.?[ ,-]*(\d{4})$/.exec(v);
    if (m) { const mo = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()) + 1; const d = mo ? iso(+m[3], mo, +m[1]) : null; return d ? { iso: d } : null; }
    m = /^([A-Za-z]{3,9})\.? (\d{1,2}),? (\d{4})$/.exec(v);
    if (m) { const mo = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) + 1; const d = mo ? iso(+m[3], mo, +m[2]) : null; return d ? { iso: d } : null; }
    return null;
  }

  const isNumberish = (v) => parseNumber(v) !== null || parseDate(v) !== null;

  // One sheet: grid of raw values -> cleaned table and what was done.
  function cleanSheet(name, grid) {
    const t = grid.map((r) => (r || []).map(tidy));
    const width = t.reduce((n, r) => Math.max(n, r.length), 0);
    const rowsKept = [];
    let emptyRows = 0;
    t.forEach((r, i) => { if (r.some(Boolean)) rowsKept.push(i); else if (i < t.length) emptyRows++; });
    const colsKept = [];
    for (let c = 0; c < width; c++) if (rowsKept.some((i) => t[i][c])) colsKept.push(c);
    const emptyCols = width - colsKept.length;
    const rows = rowsKept.map((i) => ({ src: i + 1, cells: colsKept.map((c) => t[i][c] || '') }));
    const W = colsKept.length;

    // The header: the first of the top rows that is mostly filled with words.
    let headerAt = -1;
    const widest = rows.slice(0, 50).reduce((n, r) => Math.max(n, r.cells.filter(Boolean).length), 0);
    for (let k = 0; k < Math.min(10, rows.length); k++) {
      const filled = rows[k].cells.filter(Boolean);
      const words = filled.filter((v) => !isNumberish(v));
      if (filled.length >= Math.max(2, Math.ceil(widest * 0.6)) && words.length >= Math.ceil(filled.length * 0.6)) { headerAt = k; break; }
    }
    const notes = headerAt > 0 ? rows.slice(0, headerAt) : [];
    const headerRow = headerAt >= 0 ? rows[headerAt] : null;
    const seen = new Map();
    const header = colsKept.map((_, k) => {
      const raw = headerRow ? headerRow.cells[k] : '';
      let label = raw || 'Column ' + (k + 1);
      const key = label.toLowerCase();
      const n = (seen.get(key) || 0) + 1;
      seen.set(key, n);
      if (n > 1) label += ' (' + n + ')';
      return { label, raw };
    });
    let body = rows.slice(headerAt + 1);
    const repeated = [];
    if (headerRow) {
      body = body.filter((r) => {
        const same = r.cells.every((v, k) => v === headerRow.cells[k]);
        if (same) repeated.push(r);
        return !same;
      });
    }

    // Each column: number, date or text, by what most of its values are.
    const changes = [];
    const review = [];
    const kinds = header.map((h, k) => {
      const vals = body.map((r) => r.cells[k]).filter(Boolean);
      if (!vals.length) return { kind: 'text' };
      const nums = vals.map(parseNumber);
      const okNums = nums.filter(Boolean);
      if (okNums.length >= Math.max(1, vals.length * 0.8)) {
        const units = new Set(okNums.map((x) => x.unit));
        if (units.size <= 1) return { kind: 'number', unit: [...units][0] || '' };
      }
      const dates = vals.map(parseDate);
      const okDates = dates.filter(Boolean);
      if (okDates.length >= Math.max(1, vals.length * 0.8)) {
        const pairs = okDates.filter((d) => !d.iso);
        const dayFirst = pairs.some((d) => d.a > 12);
        const monthFirst = pairs.some((d) => d.b > 12);
        if (dayFirst && monthFirst) return { kind: 'text', note: 'mixed date orders' };
        if (pairs.length && !dayFirst && !monthFirst) return { kind: 'text', note: 'dates like 03/04/2026 could be day/month or month/day, so they were left as written' };
        return { kind: 'date', dayFirst };
      }
      return { kind: 'text' };
    });
    header.forEach((h, k) => { if (kinds[k].kind === 'number' && kinds[k].unit) h.label += ' (' + kinds[k].unit + ')'; });

    // The values, each with what it was. Values that do not fit their column
    // stay exactly as written and are listed for a look.
    const table = body.map((r) => ({
      src: r.src,
      cells: r.cells.map((v, k) => {
        if (!v) return { v: '', t: 'blank', from: '' };
        const kind = kinds[k];
        if (kind.kind === 'number') {
          const p = parseNumber(v);
          if (p) {
            const cell = { v: p.n, t: p.pct ? 'percent' : 'number', from: v };
            if (String(p.n) !== v) changes.push({ sheet: name, row: r.src, column: header[k].label, from: v, to: p.pct ? p.canon + '%' : String(p.n) });
            return cell;
          }
          review.push({ sheet: name, row: r.src, column: header[k].label, value: v });
        } else if (kind.kind === 'date') {
          const d = parseDate(v);
          const out = d && (d.iso || (kind.dayFirst ? iso(d.y, d.b, d.a) : iso(d.y, d.a, d.b)));
          if (out) {
            if (out !== v) changes.push({ sheet: name, row: r.src, column: header[k].label, from: v, to: out });
            return { v: out, t: 'date', from: v };
          }
          review.push({ sheet: name, row: r.src, column: header[k].label, value: v });
        }
        return { v, t: 'text', from: v };
      })
    }));

    // Rows that look the same: listed, never removed.
    const firstAt = new Map();
    const duplicates = [];
    for (const r of table) {
      const key = JSON.stringify(r.cells.map((c) => c.v));
      if (firstAt.has(key)) duplicates.push({ row: r.src, sameAs: firstAt.get(key) });
      else firstAt.set(key, r.src);
    }

    // The proof: every non-empty value of the original sheet is accounted for,
    // and every converted value turns back into its original.
    const source = [];
    for (const r of t) for (const v of r) if (v) source.push(v);
    const accounted = [];
    for (const r of notes) for (const v of r.cells) if (v) accounted.push(v);
    for (const h of header) if (h.raw) accounted.push(h.raw);
    for (const r of repeated) for (const v of r.cells) if (v) accounted.push(v);
    let roundTrip = true;
    for (const r of table) {
      for (const c of r.cells) {
        if (!c.from) continue;
        accounted.push(c.from);
        if (c.t === 'number' || c.t === 'percent') { const p = parseNumber(c.from); if (!p || p.n !== c.v) roundTrip = false; }
        if (c.t === 'text' && c.v !== c.from) roundTrip = false;
      }
    }
    const tally = (list) => { const m = new Map(); for (const v of list) m.set(v, (m.get(v) || 0) + 1); return m; };
    const a = tally(source);
    const b = tally(accounted);
    const sameValues = a.size === b.size && [...a].every(([v, n]) => b.get(v) === n);

    return {
      name, header: header.map((h) => h.label), kinds: kinds.map((k) => k.kind), kindNotes: kinds.map((k) => k.note || ''),
      rows: table, notes: notes.map((r) => r.cells.filter(Boolean).join(' · ')),
      headerRow: headerRow ? headerRow.src : null,
      counts: { sourceRows: t.length, rows: table.length, columns: W, emptyRows, emptyCols, repeatedHeaders: repeated.length, changed: changes.length, review: review.length, duplicates: duplicates.length },
      changes, review, duplicates,
      check: { values: source.length, accounted: accounted.length, ok: sameValues && roundTrip && source.length === accounted.length, source }
    };
  }

  // The dashboard: totals for number columns, top values for category columns,
  // first and last dates.
  function dashboard(sheet) {
    const out = { numbers: [], categories: [], dates: [] };
    sheet.header.forEach((label, k) => {
      const cells = sheet.rows.map((r) => r.cells[k]).filter((c) => c.t !== 'blank');
      if (sheet.kinds[k] === 'number') {
        const ns = cells.filter((c) => c.t === 'number' || c.t === 'percent').map((c) => c.v);
        if (!ns.length) return;
        const sum = ns.reduce((x, y) => x + y, 0);
        out.numbers.push({ label, count: ns.length, sum, avg: sum / ns.length, min: Math.min(...ns), max: Math.max(...ns), percent: cells.every((c) => c.t === 'percent') });
      } else if (sheet.kinds[k] === 'date') {
        const ds = cells.filter((c) => c.t === 'date').map((c) => c.v).sort();
        if (ds.length) out.dates.push({ label, first: ds[0], last: ds.at(-1), count: ds.length });
      } else {
        const counts = new Map();
        for (const c of cells) counts.set(c.v, (counts.get(c.v) || 0) + 1);
        if (counts.size >= 2 && counts.size <= 20 && cells.length >= 5 && counts.size < cells.length) {
          out.categories.push({ label, top: [...counts].sort((x, y) => y[1] - x[1]).slice(0, 5).map(([value, count]) => ({ value, count })), distinct: counts.size });
        }
      }
    });
    out.numbers = out.numbers.slice(0, 4);
    out.categories = out.categories.slice(0, 2);
    out.dates = out.dates.slice(0, 2);
    return out;
  }

  async function sha256(text) {
    const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('');
  }

  // sheets from read() -> { sheets: [cleaned + dashboard], check }
  async function clean(sheets) {
    const out = sheets.map((s) => cleanSheet(s.name, s.grid)).filter((s) => s.check.values > 0);
    if (!out.length) throw fail('This file has no data to clean.');
    for (const s of out) s.dashboard = dashboard(s);
    const all = out.flatMap((s) => s.check.source).sort();
    for (const s of out) delete s.check.source;
    return {
      sheets: out,
      check: {
        ok: out.every((s) => s.check.ok),
        values: out.reduce((n, s) => n + s.check.values, 0),
        accounted: out.reduce((n, s) => n + s.check.accounted, 0),
        checksum: (await sha256(all.join('\u0000'))).slice(0, 12)
      }
    };
  }

  // ---------- the cleaned workbook (.xlsx) ----------

  const xml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
  const colName = (n) => { let s = ''; for (let i = n + 1; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s; return s; };
  const excelDate = (isoDate) => (Date.UTC(+isoDate.slice(0, 4), +isoDate.slice(5, 7) - 1, +isoDate.slice(8, 10)) - Date.UTC(1899, 11, 30)) / 86400000;

  // Rows of plain values or { v, t } cells. Text is always text (never a formula).
  function sheetXml(rows, { header = true } = {}) {
    const widths = [];
    const data = rows.map((r, ri) => `<row r="${ri + 1}">` + r.map((cell, ci) => {
      const c = cell && typeof cell === 'object' ? cell : { v: cell ?? '', t: typeof cell === 'number' ? 'number' : 'text' };
      if (c.t === 'blank' || c.v === '' || c.v === null || c.v === undefined) return '';
      const ref = colName(ci) + (ri + 1);
      widths[ci] = Math.min(60, Math.max(widths[ci] || 8, String(c.t === 'percent' ? c.v * 100 + '%' : c.v).length + 2));
      const bold = header && ri === 0 ? 1 : 0;
      if (c.t === 'number') return `<c r="${ref}"${bold ? ' s="1"' : ''}><v>${c.v}</v></c>`;
      if (c.t === 'percent') return `<c r="${ref}" s="3"><v>${c.v}</v></c>`;
      if (c.t === 'date') return `<c r="${ref}" s="2"><v>${excelDate(c.v)}</v></c>`;
      return `<c r="${ref}" t="inlineStr"${bold ? ' s="1"' : ''}><is><t xml:space="preserve">${xml(c.v)}</t></is></c>`;
    }).join('') + '</row>').join('');
    const cols = widths.length ? '<cols>' + widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w || 8}" customWidth="1"/>`).join('') + '</cols>' : '';
    const freeze = header && rows.length > 1 ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' : '';
    const filter = header && rows.length > 1 && rows[0].length ? `<autoFilter ref="A1:${colName(rows[0].length - 1)}${rows.length}"/>` : '';
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${freeze}${cols}<sheetData>${data}</sheetData>${filter}</worksheet>`;
  }

  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

  // A ZIP with stored (uncompressed) entries.
  function zip(files) {
    const enc = new TextEncoder();
    const parts = [];
    const central = [];
    let offset = 0;
    for (const [name, text] of files) {
      const nameB = enc.encode(name);
      const data = enc.encode(text);
      const crc = crc32(data);
      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true);
      local.setUint32(14, crc, true); local.setUint32(18, data.length, true); local.setUint32(22, data.length, true); local.setUint16(26, nameB.length, true);
      parts.push(new Uint8Array(local.buffer), nameB, data);
      const cd = new DataView(new ArrayBuffer(46));
      cd.setUint32(0, 0x02014b50, true); cd.setUint16(4, 20, true); cd.setUint16(6, 20, true); cd.setUint16(8, 0x0800, true);
      cd.setUint32(16, crc, true); cd.setUint32(20, data.length, true); cd.setUint32(24, data.length, true); cd.setUint16(28, nameB.length, true); cd.setUint32(42, offset, true);
      central.push(new Uint8Array(cd.buffer), nameB);
      offset += 30 + nameB.length + data.length;
    }
    const cdSize = central.reduce((n, p) => n + p.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
    return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  // result from clean() -> Blob: one tab per cleaned sheet, then Summary and Changes.
  function workbook(result, fileName = 'file') {
    const tabs = [];
    const used = new Set();
    const tabName = (n) => { let s = String(n).replace(/[\[\]*?:/\\]/g, ' ').trim().slice(0, 28) || 'Sheet'; let k = 1; let out = s; while (used.has(out.toLowerCase())) out = s.slice(0, 26) + ' ' + (++k); used.add(out.toLowerCase()); return out; };
    for (const s of result.sheets) tabs.push({ name: tabName(s.name), xml: sheetXml([s.header, ...s.rows.map((r) => r.cells)]) });
    const summary = [['What', 'Detail'], ['File', fileName],
      ['Check', result.check.ok ? `All ${result.check.values} values accounted for` : 'Not verified: compare with the original before using it'],
      ['Checksum (original values)', result.check.checksum]];
    for (const s of result.sheets) {
      const c = s.counts;
      summary.push(['', ''], ['Sheet', s.name], ['Rows of data', c.rows], ['Columns', c.columns],
        ['Header row (original row number)', s.headerRow ?? 'none found; columns were numbered'],
        ['Empty rows removed', c.emptyRows], ['Empty columns removed', c.emptyCols], ['Repeated header rows removed', c.repeatedHeaders],
        ['Values written in one format', c.changed], ['Values to look at (kept as written)', c.review], ['Rows that look the same (kept)', c.duplicates]);
      for (const n of s.notes) summary.push(['Note from the file', n]);
      s.header.forEach((h, k) => { if (s.kindNotes[k]) summary.push(['Column ' + h, s.kindNotes[k]]); });
      for (const d of s.duplicates.slice(0, 500)) summary.push(['Same as row ' + d.sameAs, 'Row ' + d.row]);
      for (const r of s.review.slice(0, 500)) summary.push(['Look at row ' + r.row + ', ' + r.column, r.value]);
    }
    tabs.push({ name: tabName('Summary'), xml: sheetXml(summary) });
    const changes = [['Sheet', 'Row', 'Column', 'Original', 'Cleaned']];
    for (const s of result.sheets) for (const c of s.changes) changes.push([c.sheet, c.row, c.column, c.from, c.to]);
    tabs.push({ name: tabName('Changes'), xml: sheetXml(changes) });
    const styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
      + '<numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy-mm-dd"/></numFmts>'
      + '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>'
      + '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>'
      + '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
      + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
      + '<cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>'
      + '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="10" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs>'
      + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
    const files = [
      ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
        + tabs.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') + '</Types>'],
      ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
      ['xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'
        + tabs.map((t, i) => `<sheet name="${xml(t.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') + '</sheets></workbook>'],
      ['xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + tabs.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')
        + `<Relationship Id="rId${tabs.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
      ['xl/styles.xml', styles],
      ...tabs.map((t, i) => [`xl/worksheets/sheet${i + 1}.xml`, t.xml])
    ];
    return zip(files);
  }

  window.NasrinCleaner = { read, clean, workbook, LIMITS, parseNumber, parseDate };
})();
