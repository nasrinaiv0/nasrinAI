// Smart paste rule for the message box (docs/nasrinai-slash-commands-attachments-composer-upgrade.md, section 4).
// Text pasted in one paste event of up to 2,000 characters stays editable in
// the box; 2,001 or more becomes a plain-text file attachment. Characters are
// counted as Unicode code points, so an emoji counts as one.
(function () {
  const LIMIT = 2000;

  function count(text) {
    let n = 0;
    for (const _ of String(text || '')) n += 1; // eslint-disable-line no-unused-vars
    return n;
  }

  // True when this paste should become a file.
  function shouldAttach(text) {
    return count(text) > LIMIT;
  }

  // "pasted-text.txt", then "pasted-text-2.txt", ... never reusing a name already attached.
  function fileName(taken) {
    const used = new Set((taken || []).map((n) => String(n).toLowerCase()));
    if (!used.has('pasted-text.txt')) return 'pasted-text.txt';
    for (let i = 2; ; i += 1) {
      const name = 'pasted-text-' + i + '.txt';
      if (!used.has(name)) return name;
    }
  }

  window.NasrinPaste = { LIMIT, count, shouldAttach, fileName };
})();
