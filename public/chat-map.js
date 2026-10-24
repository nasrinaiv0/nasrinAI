// Native Google Maps JavaScript renderer for Google Maps links in NasrinAI chat.
(() => {
  'use strict';
  const seen = new WeakSet();
  let mapsPromise = null;
  const clean = (v, max = 220) => String(v || '').trim().slice(0, max);
  function mapInfo(anchor) {
    try {
      const url = new URL(anchor.href);
      if (!['www.google.com', 'maps.google.com', 'google.com'].includes(url.hostname) || !url.pathname.startsWith('/maps')) return null;
      const p = url.searchParams;
      const isRoute = /\/maps\/dir\/?/.test(url.pathname) || (p.has('origin') && p.has('destination'));
      if (isRoute) {
        const parts = url.pathname.split('/').filter(Boolean);
        const origin = clean(p.get('origin') || decodeURIComponent(parts[2] || ''));
        const destination = clean(p.get('destination') || decodeURIComponent(parts[3] || ''));
        if (!origin || !destination) return null;
        const mode = ({ driving: 'DRIVING', walking: 'WALKING', bicycling: 'BICYCLING', transit: 'TRANSIT' })[p.get('travelmode')] || 'DRIVING';
        return { title: origin + ' → ' + destination, href: url.href, origin, destination, mode };
      }
      const query = clean(p.get('query') || p.get('q') || p.get('destination') || decodeURIComponent(url.pathname.replace(/^\/maps\/?/, '').replace(/^search\//, '').replace(/\+/g, ' ')));
      return query ? { title: query, href: url.href, query } : null;
    } catch { return null; }
  }
  function loadMaps() {
    if (window.google && window.google.maps && window.google.maps.Map) return Promise.resolve(window.google.maps);
    if (mapsPromise) return mapsPromise;
    mapsPromise = fetch('/public-config/maps', { credentials: 'same-origin' }).then(r => { if (!r.ok) throw new Error('Map configuration unavailable'); return r.json(); }).then(cfg => {
      const key = clean(cfg.googleMapsBrowserApiKey, 256);
      if (!key) throw new Error('Interactive maps are not configured yet.');
      return new Promise((resolve, reject) => {
        const callback = '__nasrinMapsReady';
        window[callback] = () => { delete window[callback]; resolve(window.google.maps); };
        const script = document.createElement('script');
        script.src = 'https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(key) + '&loading=async&callback=' + callback;
        script.async = true;
        script.onerror = () => { delete window[callback]; reject(new Error('Google Maps failed to load. Check the browser key and website referrer restrictions.')); };
        document.head.append(script);
      });
    }).catch(err => { mapsPromise = null; throw err; });
    return mapsPromise;
  }
  function enhance(root) {
    const anchors = [];
    if (root.matches && root.matches('a[href]')) anchors.push(root);
    anchors.push(...(root.querySelectorAll ? root.querySelectorAll('a[href]') : []));
    for (const anchor of anchors) {
      if (seen.has(anchor)) continue;
      seen.add(anchor);
      const info = mapInfo(anchor);
      if (!info || anchor.closest('.nasrin-chat-map')) continue;
      const card = document.createElement('section'); card.className = 'nasrin-chat-map';
      const heading = document.createElement('div'); heading.className = 'nasrin-chat-map-title'; heading.textContent = 'Map · ' + info.title;
      const canvas = document.createElement('div'); canvas.className = 'nasrin-chat-map-canvas'; canvas.setAttribute('role', 'application'); canvas.setAttribute('aria-label', 'Interactive Google map: ' + info.title);
      const status = document.createElement('div'); status.className = 'nasrin-chat-map-status'; status.textContent = 'Loading interactive map…';
      const footer = document.createElement('a'); footer.href = info.href; footer.target = '_blank'; footer.rel = 'noopener noreferrer'; footer.textContent = 'Open in Google Maps';
      card.append(heading, canvas, status, footer); anchor.insertAdjacentElement('afterend', card);
      loadMaps().then(maps => {
        const map = new maps.Map(canvas, { center: { lat: 7.07, lng: 125.6 }, zoom: 12, mapTypeControl: true, streetViewControl: false, fullscreenControl: true, gestureHandling: 'greedy' });
        if (info.origin && info.destination) {
          const renderer = new maps.DirectionsRenderer({ map });
          new maps.DirectionsService().route({ origin: info.origin, destination: info.destination, travelMode: maps.TravelMode[info.mode] || maps.TravelMode.DRIVING }).then(result => { renderer.setDirections(result); status.textContent = 'Route loaded · ' + info.mode.toLowerCase(); }).catch(() => { status.textContent = 'Could not calculate this route. Try opening Google Maps.'; });
        } else {
          new maps.Geocoder().geocode({ address: info.query }).then(({ results }) => {
            if (!results || !results[0]) throw new Error('Location not found');
            const place = results[0]; map.setCenter(place.geometry.location); map.setZoom(place.geometry.viewport ? 13 : 15);
            new maps.Marker({ map, position: place.geometry.location, title: info.title }); status.textContent = place.formatted_address || info.title;
          }).catch(() => { status.textContent = 'Could not locate this place. Check Maps API configuration.'; });
        }
      }).catch(err => { status.textContent = err.message || 'Interactive map unavailable.'; });
    }
  }
  function start() {
    const log = document.getElementById('log'); if (!log) return;
    enhance(log);
    new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(node => { if (node.nodeType === Node.ELEMENT_NODE) enhance(node); }))).observe(log, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
})();
