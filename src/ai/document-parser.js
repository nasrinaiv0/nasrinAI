import { OfficeParser } from 'officeparser';
import { parseAttachments } from '../attachments.js';

const MAX_LEGACY_OFFICE_BYTES = 8 * 1024 * 1024;
const LEGACY_EXTENSION = /\.(doc|xls|ppt)$/i;

// Keep the existing signature-sniffing, ZIP limits and Office XML parser as the
// first line of defense. The async Office parser is only a bounded fallback for
// legacy OLE files that the existing pipeline correctly refuses to read.
export async function parseAttachmentsWithOfficeParser(list, limits, { parseOffice = OfficeParser.parseOffice } = {}) {
  const files = parseAttachments(list, limits);
  return Promise.all(files.map(async (file) => {
    if (!file.unreadable || !LEGACY_EXTENSION.test(file.name)) return file;

    const bytes = Buffer.from(file.data, 'base64');
    if (!bytes.length || bytes.length > MAX_LEGACY_OFFICE_BYTES) return file;
    const extension = file.name.toLowerCase().match(LEGACY_EXTENSION)?.[1];
    if (!extension) return file;

    try {
      const ast = await parseOffice(new Uint8Array(bytes), {
        fileType: extension,
        extractAttachments: false,
        ocr: false,
        includeRawContent: false
      });
      const extracted = typeof ast?.toText === 'function'
        ? ast.toText()
        : (typeof ast?.to === 'function' ? await ast.to('text') : '');
      const text = typeof extracted === 'string' ? extracted : extracted?.value;
      if (typeof text !== 'string' || !text.trim()) return file;

      const maxChars = limits.maxTextChars;
      const body = text.trim();
      return {
        ...file,
        unreadable: false,
        text: '[Legacy ' + extension.toUpperCase() + ' Office document, extracted to text by officeparser]\n' +
          (body.length > maxChars ? body.slice(0, maxChars) + '\n[… cut here: the file is longer]' : body)
      };
    } catch {
      // A third-party parser failure must not break chat or imply extraction succeeded.
      return file;
    }
  }));
}
