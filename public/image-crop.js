// Client-side screenshot/photo cropping. Works on the image bytes already in the chat tray;
// the original attachment is never modified unless the user chooses "Use crop".
(() => {
  'use strict';

  function cropImage({ src, name, onCrop }) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'image-crop-overlay';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-label', 'Crop image');
      const panel = document.createElement('section');
      panel.className = 'image-crop-panel';
      const heading = document.createElement('h2');
      heading.className = 'image-crop-title';
      heading.textContent = 'Crop image';
      const help = document.createElement('p');
      help.className = 'image-crop-help';
      help.textContent = 'Drag across the image to select the area you want to extract.';
      const stage = document.createElement('div');
      stage.className = 'image-crop-stage';
      const image = document.createElement('img');
      image.className = 'image-crop-source';
      image.alt = 'Image to crop: ' + name;
      image.draggable = false;
      const selection = document.createElement('div');
      selection.className = 'image-crop-selection';
      selection.hidden = true;
      stage.append(image, selection);
      const actions = document.createElement('div');
      actions.className = 'image-crop-actions';
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'image-crop-cancel';
      cancel.textContent = 'Cancel';
      const use = document.createElement('button');
      use.type = 'button';
      use.className = 'image-crop-use';
      use.textContent = 'Use crop';
      use.disabled = true;
      actions.append(cancel, use);
      panel.append(heading, help, stage, actions);
      overlay.append(panel);
      document.body.append(overlay);

      let start = null;
      let end = null;
      let finished = false;
      const close = (result) => {
        if (finished) return;
        finished = true;
        overlay.remove();
        document.removeEventListener('keydown', keydown);
        resolve(result);
      };
      const keydown = (event) => { if (event.key === 'Escape') close(null); };
      document.addEventListener('keydown', keydown);
      cancel.addEventListener('click', () => close(null));
      overlay.addEventListener('click', (event) => { if (event.target === overlay) close(null); });

      const point = (event) => {
        const rect = image.getBoundingClientRect();
        return {
          x: Math.max(0, Math.min(rect.width, event.clientX - rect.left)),
          y: Math.max(0, Math.min(rect.height, event.clientY - rect.top))
        };
      };
      const drawSelection = () => {
        if (!start || !end) return;
        const x = Math.min(start.x, end.x), y = Math.min(start.y, end.y);
        const w = Math.abs(end.x - start.x), h = Math.abs(end.y - start.y);
        selection.hidden = false;
        selection.style.left = x + 'px';
        selection.style.top = y + 'px';
        selection.style.width = w + 'px';
        selection.style.height = h + 'px';
        use.disabled = w < 8 || h < 8;
      };
      stage.addEventListener('pointerdown', (event) => {
        if (event.button !== undefined && event.button !== 0) return;
        event.preventDefault();
        stage.setPointerCapture?.(event.pointerId);
        start = point(event);
        end = start;
        drawSelection();
      });
      stage.addEventListener('pointermove', (event) => {
        if (!start) return;
        end = point(event);
        drawSelection();
      });
      const finishDrag = (event) => {
        if (!start) return;
        end = point(event);
        drawSelection();
        start = start;
      };
      stage.addEventListener('pointerup', finishDrag);
      stage.addEventListener('pointercancel', finishDrag);

      use.addEventListener('click', async () => {
        if (!start || !end || use.disabled || !image.naturalWidth) return;
        use.disabled = true;
        use.textContent = 'Cropping…';
        try {
          const rect = image.getBoundingClientRect();
          const scaleX = image.naturalWidth / rect.width;
          const scaleY = image.naturalHeight / rect.height;
          const left = Math.min(start.x, end.x), top = Math.min(start.y, end.y);
          const width = Math.abs(end.x - start.x), height = Math.abs(end.y - start.y);
          const sx = Math.max(0, Math.floor(left * scaleX));
          const sy = Math.max(0, Math.floor(top * scaleY));
          const sw = Math.min(image.naturalWidth - sx, Math.ceil(width * scaleX));
          const sh = Math.min(image.naturalHeight - sy, Math.ceil(height * scaleY));
          if (sw < 1 || sh < 1) throw new Error('Select a larger area.');
          const canvas = document.createElement('canvas');
          canvas.width = sw;
          canvas.height = sh;
          const context = canvas.getContext('2d');
          if (!context) throw new Error('Image cropping is not available in this browser.');
          context.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);
          const blob = await new Promise((resolveBlob, rejectBlob) =>
            canvas.toBlob((value) => value ? resolveBlob(value) : rejectBlob(new Error('Could not export the cropped image.')), 'image/png'));
          close(blob);
          if (blob && typeof onCrop === 'function') onCrop(blob);
        } catch (error) {
          help.textContent = error?.message || 'Could not crop this image. Try another selection.';
          use.disabled = false;
          use.textContent = 'Use crop';
        }
      });
      image.onload = () => { stage.classList.add('ready'); };
      image.onerror = () => { help.textContent = 'This image could not be opened for cropping.'; use.disabled = true; };
      image.src = src;
      cancel.focus();
    });
  }

  window.NasrinImageCrop = Object.freeze({ cropImage });
})();
