import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import vm from 'node:vm';

// public/cleaner.js runs in the browser; here it gets the same built-ins.
async function cleaner() {
  const src = await readFile(new URL('../public/cleaner.js', import.meta.url), 'utf8');
  const sandbox = { TextDecoder, TextEncoder, crypto: globalThis.crypto, Blob, DataView, Uint8Array, Uint32Array, ArrayBuffer, Date, Math, JSON, Number, String, Map, Set, Error, Object };
  sandbox.window = sandbox;
  vm.runInNewContext(src, sandbox);
  return sandbox.window.NasrinCleaner;
}
const inflate = async (u8) => new Uint8Array(inflateRawSync(u8));
const plain = (x) => JSON.parse(JSON.stringify(x));
const bytes = (s) => new TextEncoder().encode(s);

// A small ZIP (deflated entries) for hand-made .xlsx files.
function zipOf(files) {
  const parts = []; const central = []; let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const n = Buffer.from(name); const raw = Buffer.from(text); const data = deflateRawSync(raw);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(raw.length, 22); local.writeUInt16LE(n.length, 26);
    parts.push(local, n, data);
    const cd = Buffer.alloc(46); cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(8, 10); cd.writeUInt32LE(data.length, 20); cd.writeUInt32LE(raw.length, 24); cd.writeUInt16LE(n.length, 28); cd.writeUInt32LE(offset, 42);
    central.push(cd, n);
    offset += 30 + n.length + data.length;
  }
  const size = central.reduce((a, b) => a + b.length, 0);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10); end.writeUInt32LE(size, 12); end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...parts, ...central, end]));
}

const MESSY_CSV = [
  'Sales report  ,,,,',
  'Prepared by: Ana,,,,',
  ',,,,',
  ' Date ,Item,Amount, Qty ,Code',
  '03/15/2026, Coffee  ,"₱1,200.50",2,00123',
  '03/16/2026,Tea,₱80,1,00124',
  ',,,,',
  ' Date ,Item,Amount, Qty ,Code',
  '03/17/2026,Coffee,"₱1,200.50",2,00123',
  '03/17/2026,Coffee,"₱1,200.50",2,00123',
  'n/a,Cake,₱(15),three,00125',
  ''
].join('\r\n');

test('a messy CSV becomes a clean table and every value is accounted for', async () => {
  const C = await cleaner();
  const sheets = await C.read({ name: 'sales.csv', bytes: bytes(MESSY_CSV) }, inflate);
  const r = await C.clean(sheets);
  const s = r.sheets[0];
  // Title lines kept as notes; header found; spacing tidied; units in the header.
  assert.deepEqual(plain(s.notes), ['Sales report', 'Prepared by: Ana']);
  assert.deepEqual(plain(s.header), ['Date', 'Item', 'Amount (₱)', 'Qty', 'Code']);
  assert.equal(s.headerRow, 4);
  assert.deepEqual(plain(s.kinds), ['date', 'text', 'number', 'number', 'text']);
  // Empty rows and the repeated header row taken out; nothing else.
  assert.equal(s.counts.emptyRows, 2);
  assert.equal(s.counts.repeatedHeaders, 1);
  assert.equal(s.counts.rows, 5);
  const first = s.rows[0].cells.map((c) => c.v);
  assert.deepEqual(plain(first), ['2026-03-15', 'Coffee', 1200.5, 2, '00123']);   // IDs keep their leading zeros
  // Negative in brackets; values that do not fit stay as written and are listed.
  assert.equal(s.rows[4].cells[2].v, -15);
  assert.deepEqual(plain(s.review.map((x) => [x.row, x.column, x.value])), [[11, 'Date', 'n/a'], [11, 'Qty', 'three']]);
  // Same rows are listed, never removed.
  assert.deepEqual(plain(s.duplicates), [{ row: 10, sameAs: 9 }]);
  assert.ok(s.changes.some((c) => c.from === '₱1,200.50' && c.to === '1200.5'));
  // The proof: all 37 non-empty values of the original are accounted for.
  assert.equal(r.check.ok, true);
  assert.equal(r.check.values, 37);
  assert.equal(r.check.accounted, 37);
  assert.match(r.check.checksum, /^[0-9a-f]{12}$/);
  // Dashboard: totals for numbers, top values for categories, first and last dates.
  const amount = s.dashboard.numbers.find((n) => n.label === 'Amount (₱)');
  assert.equal(amount.sum, 1200.5 + 80 + 1200.5 + 1200.5 - 15);
  assert.deepEqual(plain(s.dashboard.categories[0].top[0]), { value: 'Coffee', count: 3 });
  assert.deepEqual(plain(s.dashboard.dates[0]), { label: 'Date', first: '2026-03-15', last: '2026-03-17', count: 4 });
});

test('dates that could be day/month or month/day are left as written; mixed currencies stay text', async () => {
  const C = await cleaner();
  const csv = 'When,Price\n03/04/2026,$5\n05/06/2026,€7\n';
  const s = (await C.clean(await C.read({ name: 'x.csv', bytes: bytes(csv) }, inflate))).sheets[0];
  assert.deepEqual(plain(s.kinds), ['text', 'text']);
  assert.match(s.kindNotes[0], /day\/month or month\/day/);
  assert.equal(s.rows[0].cells[0].v, '03/04/2026');
  assert.equal(s.rows[1].cells[1].v, '€7');
  // Day-first when a day is over 12.
  const s2 = (await C.clean(await C.read({ name: 'y.csv', bytes: bytes('When,N\n25/12/2026,1\n03/01/2026,2\n') }, inflate))).sheets[0];
  assert.deepEqual(plain(s2.rows.map((r) => r.cells[0].v)), ['2026-12-25', '2026-01-03']);
});

test('numbers: leading zeros, long digit strings, percents and currency', async () => {
  const C = await cleaner();
  assert.equal(C.parseNumber('00123'), null);
  assert.equal(C.parseNumber('639171234567890123'), null);
  assert.equal(C.parseNumber('12%').n, 0.12);
  assert.equal(C.parseNumber('-₱1,000').n, -1000);
  assert.equal(C.parseNumber('1,23'), null);
  assert.equal(C.parseDate('31/02/2026').a, 31);
});

test('an .xlsx with shared strings, a date style, empty columns and two sheets', async () => {
  const C = await cleaner();
  const xlsx = zipOf({
    'xl/workbook.xml': '<workbook><sheets><sheet name="Jan &amp; Feb" sheetId="1" r:id="rId1"/><sheet name="Empty" sheetId="2" r:id="rId2"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>',
    'xl/sharedStrings.xml': '<sst><si><t>Name</t></si><si><t>Joined</t></si><si><r><t>Ana </t></r><r><t>Cruz</t></r></si><si><t>Ben</t></si></sst>',
    'xl/styles.xml': '<styleSheet><cellXfs><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>',
    'xl/worksheets/sheet1.xml': '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="s"><v>2</v></c><c r="C2" s="1"><v>46096</v></c></row><row r="3"><c r="A3" t="s"><v>3</v></c><c r="C3" s="1"><v>46097</v></c></row></sheetData></worksheet>',
    'xl/worksheets/sheet2.xml': '<worksheet><sheetData/></worksheet>'
  });
  const r = await C.clean(await C.read({ name: 'staff.xlsx', bytes: xlsx }, inflate));
  assert.equal(r.sheets.length, 1);   // the empty sheet has nothing to clean
  const s = r.sheets[0];
  assert.equal(s.name, 'Jan & Feb');
  assert.equal(s.counts.emptyCols, 1);
  assert.deepEqual(plain(s.header), ['Name', 'Joined']);
  assert.deepEqual(plain(s.rows.map((x) => x.cells.map((c) => c.v))), [['Ana Cruz', '2026-03-15'], ['Ben', '2026-03-16']]);
  assert.equal(r.check.ok, true);
});

test('the cleaned workbook opens again with the same values (round trip)', async () => {
  const C = await cleaner();
  const r = await C.clean(await C.read({ name: 'sales.csv', bytes: bytes(MESSY_CSV) }, inflate));
  const blob = C.workbook(r, 'sales.csv');
  const back = await C.read({ name: 'sales-clean.xlsx', bytes: new Uint8Array(await blob.arrayBuffer()) }, inflate);
  assert.deepEqual(plain(back.map((s) => s.name)), ['sales', 'Summary', 'Changes']);
  const grid = back[0].grid;
  assert.deepEqual(plain(grid[0]), ['Date', 'Item', 'Amount (₱)', 'Qty', 'Code']);
  assert.deepEqual(plain(grid[1]), ['2026-03-15', 'Coffee', '1200.5', '2', '00123']);
  assert.equal(grid.length, 6);
  const xml = Buffer.from(await blob.arrayBuffer()).toString('latin1');
  assert.doesNotMatch(xml, /<f>/);   // text is never turned into a formula
});

test('text that looks like a formula stays text; too-big files are refused, never cut short', async () => {
  const C = await cleaner();
  const r = await C.clean(await C.read({ name: 'f.csv', bytes: bytes('A,B\n=HYPERLINK("http://x"),1\n') }, inflate));
  const xml = Buffer.from(await C.workbook(r).arrayBuffer()).toString('utf8');
  assert.match(xml, /t="inlineStr"><is><t xml:space="preserve">=HYPERLINK\(&quot;http:\/\/x&quot;\)<\/t>/);
  await assert.rejects(C.read({ name: 'big.csv', bytes: new Uint8Array(C.LIMITS.bytes + 1) }, inflate), /larger than 15 MB/);
  await assert.rejects(C.read({ name: 'old.xls', bytes: new Uint8Array([0xd0, 0xcf, 0x11, 0xe0]) }, inflate), /old Excel file/);
  const many = 'a,b,c\n'.repeat(C.LIMITS.cells / 3 + 10);
  await assert.rejects(C.read({ name: 'many.csv', bytes: bytes(many) }, inflate), /more than 300,000 cells/);
});
