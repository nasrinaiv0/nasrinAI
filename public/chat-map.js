// Enhances Google Maps links in assistant messages with an inline, interactive map.
(() => {
  'use strict';
  const seen = new WeakSet();
  const mapUrl = (anchor) => {
    try {
      const url = new URL(anchor.href);
      if (!['www.google.com', 'maps.google.com', 'google.com'].includes(url.hostname)) return null;
      if (!url.pathname.startsWith('/maps')) return null;
      const query = url.searchParams.get('query') || url.searchParams.get('q') || '';
      const path = decodeURIComponent(url.pathname + url.search);
      const place = query || path.replace(/^\/maps\/?/, '').replace(/\+/g, ' ').slice(0, 220);
      if (!place || place.length > 240) return null;
      return { place, href: url.href };
    } catch { return null; }
  };
  function enhance(root) {
    for (const anchor of root.querySelectorAll?.('a[href]') || []) {
      if (seen.has(anchor)) continue;
      seen.add(anchor);
      const info = mapUrl(anchor);
      if (!info) continue;
      const card = document.createElement('section');
      card.className = 'nasrin-chat-map';
      const heading = document.createElement('div');
      heading.className = 'nasrin-chat-map-title';
      heading.textContent = 'Map · ' + info.place.slice(0, 100);
      const frame = document.createElement('iframe');
      frame.title = 'Interactive Google Map: ' + info.place.slice(0, 100);
      frame.loading = 'lazy';
      frame.referrerPolicy = 'no-referrer';
      frame.allowFullscreen = true;
      frame.src = 'https://maps.google.com/maps?q=' + encodeURIComponent(info.place) + '&z=13&output=embed';
      const footer = document.createElement('a');
      footer.href = info.href;
      footer.target = '_blank';
      footer.rel = 'noopener noreferrer';
      footer.textContent = 'Open in Google Maps';
      card.append(heading, frame, footer);
      anchor.insertAdjacentElement('afterend', card);
    }
  }
  const start = () => {
    const log = document.getElementById('log');
    if (!log) return;
    enhance(log);
    new MutationObserver((records) => records.forEach((record) => {
      for (const node of record.addedNodes) if (node.nodeType === Node.ELEMENT_NODE) {
        if (node.matches?.('.msg-body.rich, a[href]')) enhance(node);
        else enhance(node);
      }
    })).observe(log, { childList: true, subtree: true });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
