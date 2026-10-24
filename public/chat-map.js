// Native Google Maps JavaScript renderer for Google Maps links and structured map results in NasrinAI chat.
(() => {
  'use strict';
  const seen = new WeakSet();
  let mapsPromise = null;
  const clean = (v, max = 220) => String(v ?? '').trim().slice(0, max);
  const validPoint = (p) => p && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng))
    && Math.abs(Number(p.lat)) <= 90 && Math.abs(Number(p.lng)) <= 180;
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
        return { type: 'directions', title: origin + ' → ' + destination, href: url.href, origin, destination, mode };
      }
      const query = clean(p.get('query') || p.get('q') || p.get('destination') || decodeURIComponent(url.pathname.replace(/^\/maps\/?/, '').replace(/^search\//, '').replace(/\+/g, ' ')));
      return query ? { type: 'map', title: query, href: url.href, query } : null;
    } catch { return null; }
  }
  function loadMaps() {
    if (window.google?.maps?.Map) return Promise.resolve(window.google.maps);
    if (mapsPromise) return mapsPromise;
    mapsPromise = fetch('/public-config/maps', { credentials: 'same-origin' }).then(r => {
      if (!r.ok) throw new Error('Map configuration unavailable');
      return r.json();
    }).then(cfg => {
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
  function makeCard(root, title, href) {
    const card = document.createElement('section');
    card.className = 'nasrin-chat-map';
    const heading = document.createElement('div');
    heading.className = 'nasrin-chat-map-title';
    heading.textContent = 'Map · ' + clean(title, 180);
    const canvas = document.createElement('div');
    canvas.className = 'nasrin-chat-map-canvas';
    canvas.setAttribute('role', 'application');
    canvas.setAttribute('aria-label', 'Interactive Google map: ' + clean(title, 180));
    const status = document.createElement('div');
    status.className = 'nasrin-chat-map-status';
    status.setAttribute('aria-live', 'polite');
    status.textContent = 'Loading interactive map…';
    const footer = document.createElement('a');
    footer.href = href;
    footer.target = '_blank';
    footer.rel = 'noopener noreferrer';
    footer.textContent = 'Open in Google Maps';
    card.append(heading, canvas, status, footer);
    root.appendChild(card);
    return { card, canvas, status };
  }
  function renderStructured(root, payload) {
    if (!root || !payload || !['map', 'places', 'directions'].includes(payload.type)) return false;
    const title = clean(payload.title || 'Google Maps', 180);
    const fallback = typeof payload.mapUrl === 'string' && /^https:\/\/www\.google\.com\/maps\//.test(payload.mapUrl)
      ? payload.mapUrl : 'https://www.google.com/maps';
    const { canvas, status } = makeCard(root, title, fallback);
    loadMaps().then(maps => {
      const places = Array.isArray(payload.places) ? payload.places.filter(p => validPoint(p.location)) : [];
      const center = validPoint(payload.center) ? { lat: Number(payload.center.lat), lng: Number(payload.center.lng) }
        : places.length ? { lat: Number(places[0].location.lat), lng: Number(places[0].location.lng) } : { lat: 7.07, lng: 125.6 };
      const map = new maps.Map(canvas, { center, zoom: places.length > 1 ? 12 : 14, mapTypeControl: true, streetViewControl: false, fullscreenControl: true, gestureHandling: 'greedy' });
      if (payload.type === 'directions' && payload.origin && payload.destination) {
        const renderer = new maps.DirectionsRenderer({ map });
        new maps.DirectionsService().route({
          origin: clean(payload.origin, 180), destination: clean(payload.destination, 180),
          travelMode: maps.TravelMode[({ DRIVE: 'DRIVING', WALK: 'WALKING', BICYCLE: 'BICYCLING', TRANSIT: 'TRANSIT' })[payload.travelMode] || 'DRIVING']
        }).then(result => {
          renderer.setDirections(result);
          const leg = result.routes?.[0]?.legs?.[0];
          status.textContent = [leg?.distance?.text, leg?.duration?.text].filter(Boolean).join(' · ') || 'Route loaded';
        }).catch(() => { status.textContent = 'Could not calculate this route. Try opening Google Maps.'; });
        return;
      }
      if (places.length) {
        const bounds = new maps.LatLngBounds();
        places.forEach((place, index) => {
          const position = { lat: Number(place.location.lat), lng: Number(place.location.lng) };
          bounds.extend(position);
          const marker = new maps.Marker({ map, position, title: clean(place.name || 'Place', 120), label: places.length <= 9 ? String(index + 1) : undefined });
          const rating = place.rating !== null && place.rating !== undefined && Number.isFinite(Number(place.rating)) ? '★ ' + Number(place.rating).toFixed(1) : '';\n          const details = [clean(place.name, 120), clean(place.address, 220), rating].filter(Boolean).join('\n');
          if (details) {
            const info = new maps.InfoWindow({ content: document.createTextNode(details) });
            marker.addListener('click', () => info.open({ map, anchor: marker }));
          }
        });
        if (places.length > 1) map.fitBounds(bounds);
        status.textContent = places.length + (places.length === 1 ? ' place shown' : ' places shown');
      } else if (validPoint(payload.center)) {
        const position = { lat: Number(payload.center.lat), lng: Number(payload.center.lng) };
        new maps.Marker({ map, position, title });
        status.textContent = title;
      } else if (payload.query) {
        new maps.Geocoder().geocode({ address: clean(payload.query, 180) }).then(({ results }) => {
          if (!results?.[0]) throw new Error('Location not found');
          const place = results[0];
          map.setCenter(place.geometry.location);
          map.setZoom(place.geometry.viewport ? 13 : 15);
          new maps.Marker({ map, position: place.geometry.location, title });
          status.textContent = place.formatted_address || title;
        }).catch(() => { status.textContent = 'Could not locate this place. Check Maps API configuration.'; });
      } else status.textContent = 'No coordinates were returned for this map.';
    }).catch(err => { status.textContent = err.message || 'Interactive map unavailable.'; });
    return true;
  }
  function enhance(root) {
    const anchors = [];
    if (root.matches?.('a[href]')) anchors.push(root);
    anchors.push(...(root.querySelectorAll ? root.querySelectorAll('a[href]') : []));
    for (const anchor of anchors) {
      if (seen.has(anchor)) continue;
      seen.add(anchor);
      const info = mapInfo(anchor);
      if (!info || anchor.closest('.nasrin-chat-map')) continue;
      const payload = info.type === 'directions'
        ? { type: 'directions', title: info.title, origin: info.origin, destination: info.destination, travelMode: ({ DRIVING: 'DRIVE', WALKING: 'WALK', BICYCLING: 'BICYCLE', TRANSIT: 'TRANSIT' })[info.mode], mapUrl: info.href }
        : { type: 'map', title: info.title, query: info.query, mapUrl: info.href };
      const card = document.createElement('div');
      anchor.insertAdjacentElement('afterend', card);
      renderStructured(card, payload);
    }
  }
  // Structured tool results can be rendered directly without sending users away
  // to a separate Maps page. Kept as a tiny public bridge for chat integrations.
  window.NasrinChatMaps = Object.freeze({
    render(root, payload) { return renderStructured(root, payload); },
    enhance
  });
  function start() {
    const log = document.getElementById('log');
    if (!log) return;
    enhance(log);
    new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(node => {
      if (node.nodeType === Node.ELEMENT_NODE) enhance(node);
    }))).observe(log, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
})();
