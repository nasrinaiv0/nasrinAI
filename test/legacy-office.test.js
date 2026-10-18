import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAttachments } from '../src/attachments.js';

const limits = { maxCount: 4, maxTotalBytes: 2 * 1024 * 1024, maxTextChars: 30000 };
const b64 = (bytes) => Buffer.from(bytes).toString('base64');
function oleFixture(text) {
  const bytes = Buffer.alloc(1024, 0);
  Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]).copy(bytes, 0);
  Buffer.from(text, 'latin1').copy(bytes, 512);
  return bytes;
}

test('legacy .doc/.xls/.ppt files recover readable strings and label extraction as best-effort', () => {
  for (const [name, label] of [
    ['legacy.doc', 'Legacy Word document'],
    ['legacy.xls', 'Legacy Excel workbook'],
    ['legacy.ppt', 'Legacy PowerPoint presentation']
  ]) {
    const file = parseAttachments([{ name, data: b64(oleFixture('Quarterly Sales Report Customer Revenue Total 1250')) }], limits)[0];
    assert.equal(file.kind, 'text');
    assert.equal(file.unreadable, undefined);
    assert.match(file.text, new RegExp(label));
    assert.match(file.text, /Quarterly Sales Report/);
    assert.match(file.text, /best-effort/i);
  }
});

test('legacy Office extraction rejects mismatched extensions and empty binary content safely', () => {
  const bytes = oleFixture('');
  for (const name of ['legacy.bin', 'legacy.doc']) {
    const file = parseAttachments([{ name, data: b64(bytes) }], limits)[0];
    assert.equal(file.kind, 'text');
    assert.equal(file.unreadable, true);
  }
});
