// Single byte-range support for media playback. Safari (iPhone and Mac) will
// not play a <video> whose server ignores Range requests, so file responses
// that feed a <video> element must answer them with 206 Partial Content.
//
// Returns one of:
//   { type: 'none' }           no usable Range header: send the whole file (200)
//   { type: 'range', start, end }   inclusive byte positions to send (206)
//   { type: 'unsatisfiable' }  the range lies outside the file (416)
// Multiple ranges and malformed headers are ignored, which the HTTP spec allows.
export function parseByteRange(header, size) {
  const length = Number(size);
  if (header == null || header === '' || !Number.isInteger(length) || length < 1) return { type: 'none' };
  const match = /^bytes=(\d{0,15})-(\d{0,15})$/.exec(String(header).trim());
  if (!match || (match[1] === '' && match[2] === '')) return { type: 'none' };
  if (match[1] === '') {
    // Suffix form: the last N bytes.
    const suffix = Number(match[2]);
    if (suffix === 0) return { type: 'unsatisfiable' };
    return { type: 'range', start: Math.max(0, length - suffix), end: length - 1 };
  }
  const start = Number(match[1]);
  const requestedEnd = match[2] === '' ? length - 1 : Number(match[2]);
  if (match[2] !== '' && requestedEnd < start) return { type: 'none' };
  if (start >= length) return { type: 'unsatisfiable' };
  return { type: 'range', start, end: Math.min(requestedEnd, length - 1) };
}
