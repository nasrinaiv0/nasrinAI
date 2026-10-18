import { HttpError } from '../http/errors.js';

export const MAX_OCR_PDF_BYTES = 6 * 1024 * 1024;
const PDF_SIGNATURE = Buffer.from('%PDF-');

export function createOpenAIPdfOcr({ apiKey, model = 'gpt-4o-mini', fetchImpl = fetch, timeoutMs = 120_000 }) {
  return {
    available: Boolean(apiKey),
    async extract({ bytes, name = 'scanned-document.pdf' }) {
      if (!apiKey) throw new HttpError(503, 'ocr_unavailable', 'PDF text extraction is not available right now.');
      if (!Buffer.isBuffer(bytes) || bytes.length === 0) throw new HttpError(400, 'pdf_required', 'Choose a non-empty PDF file.');
      if (bytes.length > MAX_OCR_PDF_BYTES) throw new HttpError(413, 'pdf_too_large', 'Choose a PDF smaller than 6 MB for text extraction.');
      if (bytes.subarray(0, PDF_SIGNATURE.length).compare(PDF_SIGNATURE) !== 0 || !/\.pdf$/i.test(String(name))) {
        throw new HttpError(415, 'unsupported_document', 'Choose a valid PDF document.');
      }
      const fileName = String(name).split(/[\\/]/).pop().replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 120) || 'scanned-document.pdf';
      const payload = {
        model,
        input: [{
          role: 'user',
          content: [
            { type: 'input_file', filename: fileName, file_data: 'data:application/pdf;base64,' + bytes.toString('base64') },
            { type: 'input_text', text: 'Extract all readable text from this PDF, including scanned pages using visual OCR. Preserve reading order, headings, paragraphs, lists, and table structure as plain text. Do not summarize, infer missing words, or add commentary. If a page is unreadable, mark it as [unreadable page].' }
          ]
        }],
        max_output_tokens: 12000
      };
      let response;
      try {
        response = await fetchImpl('https://api.openai.com/v1/responses', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(timeoutMs)
        });
      } catch {
        throw new HttpError(502, 'ocr_upstream_unavailable', 'The PDF text extraction service could not be reached. Please try again.');
      }
      if (!response.ok) {
        const status = response.status;
        await response.body?.cancel?.().catch(() => {});
        if (status === 401 || status === 403) throw new HttpError(503, 'ocr_misconfigured', 'PDF text extraction is temporarily unavailable.');
        if (status === 413 || status === 415 || status === 422) throw new HttpError(400, 'pdf_not_supported', 'This PDF could not be read. Try a smaller or unprotected PDF.');
        if (status === 429) throw new HttpError(429, 'ocr_busy', 'PDF text extraction is busy right now. Please try again shortly.');
        throw new HttpError(502, 'ocr_failed', 'The PDF text extraction service could not finish this document.');
      }
      let result;
      try { result = await response.json(); } catch { throw new HttpError(502, 'invalid_ocr_response', 'The PDF extraction service returned an unreadable response.'); }
      const text = typeof result.output_text === 'string'
        ? result.output_text.trim()
        : (Array.isArray(result.output) ? result.output.flatMap((item) => Array.isArray(item.content) ? item.content : []).map((part) => part.text || '').join('\n').trim() : '');
      if (!text) throw new HttpError(422, 'empty_ocr', 'No readable text was found in this PDF.');
      return { text, characters: text.length, model };
    }
  };
}
