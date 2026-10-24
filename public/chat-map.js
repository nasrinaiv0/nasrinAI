// Render interactive Google Maps inline when an assistant response contains a Maps link.
(() => {
  'use strict';
  const seen = new WeakSet();
  function mapInfo(anchor) {
    try {
      const url = new URL(anchor.href);
      if (!['www.google.com', 'maps.google.com', 'google.com'].includes(url.hostname) || !url.pathname.startsWith('/maps')) return null;
      const p = url.searchParams;
      const isDirections = /\/maps\/dir\/?/.test(url.pathname) || (p.has('origin') && p.has('destination'));
      if (isDirections) {
        const origin = p.get('origin') || '';
        const destination = p.get('destination') || '';
        if (!origin || !destination) return null;
        const mode = ({ driving: 'driving', walking: 'walking', bicycling: 'bicycling', transit: 'transit' })[p.get('travelmode')] || 'driving';
        return { title: origin + ' → ' + destination, href: url.href, embed: 'https://maps.google.com/maps?output=embed&saddr=' + encodeURIComponent(origin) + '&daddr=' + encodeURIComponent(destination) + '&dirflg=' + ({ driving: 'd', walking: 'w', bicycling: 'b', transit: 'r' }[mode]) };
      }
      const query = p.get('query') || p.get('q') || p.get('destination') || '';
      const path = decodeURIComponent(url.pathname).replace(/^\/maps\/?/, '').replace(/^search\//, '').replace(/\+/g, ' ');
      const place = (query || path).slice(0, 220);
      if (!place || place.length > 240) return null;
      return { title: place, href: url.href, embed: 'https://maps.google.com/maps?q=' + encodeURIComponent(place) + '&z=13&output=embed' };
    } catch { return null; }
  }
  function enhance(root) {
    const anchors = [];
    if (root.matches?.('a[href]')) anchors.push(root);
    anchors.push(...(root.querySelectorAll?.('a[href]') || []));
    for (const anchor of anchors) {
      if (seen.has(anchor)) continue;
      seen.add(anchor);
      const info = mapInfo(anchor);
      if (!info || anchor.closest('.nasrin-chat-map')) continue;
      const card = document.createElement('section');
      card.className = 'nasrin-chat-map';
      const heading = document.createElement('div');
      heading.className = 'nasrin-chat-map-title';
      heading.textContent = 'Interactive map · ' + info.title.slice(0, 120);
      const frame = document.createElement('iframe');
      frame.title = 'Interactive Google Map: ' + info.title.slice(0, 140);
      frame.loading = 'lazy';
      frame.referrerPolicy = 'no-referrer';
      frame.allowFullscreen = true;
      frame.src = info.embed;
      const footer = document.createElement('a');
      footer.href = info.href;
      footer.target = '_blank';
      footer.rel = 'noopener noreferrer';
      footer.textContent = 'Open in Google Maps';
      card.append(heading, frame, footer);
      anchor.insertAdjacentElement('afterend', card);
    }
  }
  function start() {
    const log = document.getElementById('log');
    if (!log) return;
    enhance(log);
    new MutationObserver((records) => {
      for (const record of records) for (const node of record.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) enhance(node);
      }
    }).observe(log, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
