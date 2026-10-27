// Regression fix: the Photos & files item in the + menu must open the native file picker.
(() => {
  'use strict';
  const pickFiles = document.getElementById('pickFiles');
  const fileInput = document.getElementById('fileInput');
  if (!pickFiles || !fileInput) return;

  pickFiles.addEventListener('click', () => {
    const menu = document.getElementById('plusMenu');
    const attach = document.getElementById('attach');
    if (menu) menu.hidden = true;
    attach?.setAttribute('aria-expanded', 'false');
    // Keep this call synchronous in the click gesture for iOS Safari.
    fileInput.click();
  });
})();
