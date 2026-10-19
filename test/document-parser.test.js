import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAttachmentsWithOfficeParser } from '../src/ai/document-parser.js';
import { testConfig } from './helpers.js';

const limits = testConfig().ai.attachments;
const ole = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]);
const input = (name = 'legacy.doc', bytes = ole) => [{ name, data: bytes.toString('base64') }];

test('legacy Office files use officeparser as a fallback and expose extracted text', async () => {
  let options;
  const files = await parseAttachmentsWithOfficeParser(input(), limits, {
    parseOffice: async (bytes, config) => {
      assert.deepEqual(Buffer.from(bytes), ole);
      options = config;
      return { toText: () => '  Legacy contract text  ' };
    }
  });
  assert.equal(options.fileType, 'doc');
  assert.equal(options.extractAttachments, false);
  assert.equal(files.length, 1);
  assert.equal(files[0].unreadable, false);
  assert.match(files[0].text, /Legacy contract text/);
});

test('legacy parser failures stay explicitly unreadable and do not break chat', async () => {
  const files = await parseAttachmentsWithOfficeParser(input('old.xls'), limits, {
    parseOffice: async () => { throw new Error('malformed legacy file'); }
  });
  assert.equal(files.length, 1);
  assert.equal(files[0].unreadable, true);
  assert.match(files[0].text, /legacy Excel binary document/);
});

test('modern Office files retain the bounded built-in parser path', async () => {
  const bytes = Buffer.from('plain text');
  let called = false;
  const files = await parseAttachmentsWithOfficeParser(input('note.txt', bytes), limits, {
    parseOffice: async () => { called = true; return { toText: () => 'unexpected' }; }
  });
  assert.equal(called, false);
  assert.equal(files[0].text, 'plain text');
});
