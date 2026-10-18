import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOpenAIPdfOcr, MAX_OCR_PDF_BYTES } from '../src/ai/pdf-ocr.js';

const pdf = Buffer.from('%PDF-1.7\nminimal test document');

test('PDF OCR submits a PDF as a Responses API file input and returns extracted text', async () => {
  let request;
  const ocr = createOpenAIPdfOcr({ apiKey: 'test-key', fetchImpl: async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ output_text: 'Scanned invoice\nTotal: $12.00' }), { status: 200 });
  }});
  const result = await ocr.extract({ bytes: pdf, name: 'invoice.pdf' });
  assert.equal(result.text, 'Scanned invoice\nTotal: $12.00');
  assert.equal(request.url, 'https://api.openai.com/v1/responses');
  assert.equal(request.options.headers.Authorization, 'Bearer test-key');
  const body = JSON.parse(request.options.body);
  assert.equal(body.model, 'gpt-4o-mini');
  assert.match(body.input[0].content[0].file_data, /^data:application\/pdf;base64,/);
  assert.match(body.input[0].content[1].text, /visual OCR/);
});

test('PDF OCR rejects missing key, oversized and invalid files without calling provider', async () => {
  await assert.rejects(() => createOpenAIPdfOcr({ apiKey: '' }).extract({ bytes: pdf, name: 'x.pdf' }), (e) => e.code === 'ocr_unavailable');
  let called = false;
  const ocr = createOpenAIPdfOcr({ apiKey: 'test-key', fetchImpl: async () => { called = true; } });
  await assert.rejects(() => ocr.extract({ bytes: Buffer.alloc(MAX_OCR_PDF_BYTES + 1), name: 'x.pdf' }), (e) => e.status === 413);
  await assert.rejects(() => ocr.extract({ bytes: Buffer.from('not a pdf'), name: 'x.pdf' }), (e) => e.status === 415);
  await assert.rejects(() => ocr.extract({ bytes: pdf, name: 'x.txt' }), (e) => e.status === 415);
  assert.equal(called, false);
});

test('PDF OCR hides provider errors and rejects empty extraction', async () => {
  const failed = createOpenAIPdfOcr({ apiKey: 'test-key', fetchImpl: async () => new Response('private details', { status: 429 }) });
  await assert.rejects(() => failed.extract({ bytes: pdf, name: 'x.pdf' }), (e) => e.code === 'ocr_busy' && !e.message.includes('private details'));
  const empty = createOpenAIPdfOcr({ apiKey: 'test-key', fetchImpl: async () => new Response(JSON.stringify({ output_text: ' ' }), { status: 200 }) });
  await assert.rejects(() => empty.extract({ bytes: pdf, name: 'x.pdf' }), (e) => e.code === 'empty_ocr');
});
