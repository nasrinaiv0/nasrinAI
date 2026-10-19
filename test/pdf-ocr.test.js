import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOpenAIPdfOcr, countPdfPages, MAX_OCR_PDF_BYTES, MAX_OCR_PDF_PAGES } from '../src/ai/pdf-ocr.js';

const pdf = Buffer.from('%PDF-1.7\nminimal test document');

test('PDF OCR submits a PDF as a Responses API file input and returns extracted text', async () => {
  let request;
  const ocr = createOpenAIPdfOcr({ apiKey: 'test-key', getPageCount: async () => 1, fetchImpl: async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ output_text: '[Page 1]\nScanned invoice\nTotal: $12.00' }), { status: 200 });
  }});
  const result = await ocr.extract({ bytes: pdf, name: 'invoice.pdf' });
  assert.equal(result.text, '[Page 1]\nScanned invoice\nTotal: $12.00');
  assert.equal(result.pages, 1);
  assert.equal(request.url, 'https://api.openai.com/v1/responses');
  assert.equal(request.options.headers.Authorization, 'Bearer test-key');
  const body = JSON.parse(request.options.body);
  assert.equal(body.model, 'gpt-4o-mini');
  assert.match(body.input[0].content[0].file_data, /^data:application\/pdf;base64,/);
  assert.match(body.input[0].content[1].text, /visual OCR/);
  assert.match(body.input[0].content[1].text, /\[Page 1\]/);
  assert.match(body.input[0].content[1].text, /document order/);
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
  const failed = createOpenAIPdfOcr({ apiKey: 'test-key', getPageCount: async () => 1, fetchImpl: async () => new Response('private details', { status: 429 }) });
  await assert.rejects(() => failed.extract({ bytes: pdf, name: 'x.pdf' }), (e) => e.code === 'ocr_busy' && !e.message.includes('private details'));
  const empty = createOpenAIPdfOcr({ apiKey: 'test-key', getPageCount: async () => 1, fetchImpl: async () => new Response(JSON.stringify({ output_text: ' ' }), { status: 200 }) });
  await assert.rejects(() => empty.extract({ bytes: pdf, name: 'x.pdf' }), (e) => e.code === 'empty_ocr');
});

test('PDF OCR rejects responses without page markers or with pages out of order', async () => {
  for (const output_text of ['Text without page markers', '[Page 2]\\nsecond\\n[Page 1]\\nfirst']) {
    const service = createOpenAIPdfOcr({ apiKey: 'test-key', getPageCount: async () => 1, fetchImpl: async () => new Response(JSON.stringify({ output_text }), { status: 200 }) });
    await assert.rejects(() => service.extract({ bytes: pdf, name: 'invoice.pdf' }), (e) => e.code === 'invalid_ocr_order');
  }
});

test('PDF OCR rejects missing page numbers instead of returning a partial extraction', async () => {
  const service = createOpenAIPdfOcr({
    apiKey: 'test-key',
    fetchImpl: async () => new Response(JSON.stringify({ output_text: '[Page 1]\\nfirst page\\n[Page 3]\\nthird page' }), { status: 200 })
  });
  await assert.rejects(() => service.extract({ bytes: pdf, name: 'invoice.pdf' }), (e) => e.code === 'invalid_ocr_order');
});

test('PDF OCR rejects a PDF signature embedded after a non-PDF prefix', async () => {
  const service = createOpenAIPdfOcr({ apiKey: 'test-key', fetchImpl: async () => { throw new Error('must not call upstream'); } });
  const prefixed = Buffer.concat([Buffer.from('not-a-pdf\n'), pdf]);
  await assert.rejects(() => service.extract({ bytes: prefixed, name: 'invoice.pdf' }), (e) => e.status === 415 && e.code === 'unsupported_document');
});


function blankPdf(pageCount = 1) {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [' + Array.from({ length: pageCount }, (_, i) => (i + 3) + ' 0 R').join(' ') + '] /Count ' + pageCount + ' >>',
    ...Array.from({ length: pageCount }, () => '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> >>')
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += (i + 1) + ' 0 obj\n' + objects[i] + '\nendobj\n';
  }
  const xrefOffset = Buffer.byteLength(pdf, 'latin1');
  pdf += 'xref\n0 ' + (objects.length + 1) + '\n0000000000 65535 f \n';
  for (const offset of offsets.slice(1)) pdf += String(offset).padStart(10, '0') + ' 00000 n \n';
  pdf += 'trailer\n<< /Size ' + (objects.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xrefOffset + '\n%%EOF';
  return Buffer.from(pdf, 'latin1');
}

test('PDF.js counts actual PDF pages and refuses malformed PDF structure', async () => {
  assert.equal(await countPdfPages(blankPdf(3)), 3);
  await assert.rejects(() => countPdfPages(Buffer.from('%PDF-1.7\nnot a document')), (error) => error.code === 'invalid_pdf_structure');
});

test('PDF OCR rejects a partial extraction when the actual PDF has more pages', async () => {
  const service = createOpenAIPdfOcr({
    apiKey: 'test-key',
    getPageCount: async () => 2,
    fetchImpl: async () => new Response(JSON.stringify({ output_text: '[Page 1]\nOnly first page' }), { status: 200 })
  });
  await assert.rejects(() => service.extract({ bytes: pdf, name: 'two-pages.pdf' }), (error) => error.code === 'invalid_ocr_order');
});

test('PDF OCR refuses documents above its page safety limit before calling the provider', async () => {
  let called = false;
  const service = createOpenAIPdfOcr({
    apiKey: 'test-key',
    getPageCount: async () => MAX_OCR_PDF_PAGES + 1,
    fetchImpl: async () => { called = true; }
  });
  await assert.rejects(() => service.extract({ bytes: pdf, name: 'too-many-pages.pdf' }), (error) => error.code === 'pdf_too_many_pages');
  assert.equal(called, false);
});
