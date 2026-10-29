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
        script.src = 'https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(key) + '&loading=async&libraries=places&callback=' + callback;
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
    heading.textContent = clean(title, 180);
    const canvas = document.createElement('div');
    canvas.className = 'nasrin-chat-map-canvas';
    canvas.setAttribute('role', 'application');
    canvas.setAttribute('aria-label', 'Map for ' + clean(title, 180));
    const status = document.createElement('div');
    status.className = 'nasrin-chat-map-status';
    status.setAttribute('aria-live', 'polite');
    status.textContent = 'Loading map and nearby businesses…';
    const businesses = document.createElement('div');
    businesses.className = 'nasrin-chat-map-businesses';
    businesses.setAttribute('aria-label', 'Nearby businesses');
    card.append(heading, canvas, status, businesses);
    root.appendChild(card);
    return { card, canvas, status, businesses, href };
  }
  function mapsLink(place) {
    if (place.url && /^https:\/\//.test(place.url)) return place.url;
    return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(place.name || place.vicinity || 'business');
  }
  function renderBusinessCards(container, places) {
    container.replaceChildren();
    places.slice(0, 5).forEach(place => {
      const card = document.createElement('a');
      card.className = 'nasrin-chat-business';
      card.href = mapsLink(place);
      card.target = '_blank';
      card.rel = 'noopener noreferrer';
      const photo = place.photos?.[0];
      if (photo && typeof photo.getUrl === 'function') {
        const image = document.createElement('img');
        image.className = 'nasrin-chat-business-photo';
        image.src = photo.getUrl({ maxWidth: 480, maxHeight: 320 });
        image.alt = '';
        image.loading = 'lazy';
        card.appendChild(image);
      } else {
        const placeholder = document.createElement('div');
        placeholder.className = 'nasrin-chat-business-photo nasrin-chat-business-photo--empty';
        placeholder.setAttribute('aria-hidden', 'true');
        placeholder.textContent = '⌖';
        card.appendChild(placeholder);
      }
      const details = document.createElement('div');
      details.className = 'nasrin-chat-business-details';
      const name = document.createElement('div');
      name.className = 'nasrin-chat-business-name';
      name.textContent = clean(place.name || 'Nearby business', 120);
      details.appendChild(name);
      const meta = [];
      if (place.rating !== null && place.rating !== undefined && Number.isFinite(Number(place.rating))) {
        meta.push('★ ' + Number(place.rating).toFixed(1) + (place.user_ratings_total ? ' (' + Number(place.user_ratings_total).toLocaleString() + ')' : ''));
      }
      const category = Array.isArray(place.types) ? place.types.find(type => !['point_of_interest','establishment','food','store','premise'].includes(type)) : '';
      if (category) meta.push(category.replace(/_/g, ' '));
      if (meta.length) {
        const line = document.createElement('div');
        line.className = 'nasrin-chat-business-meta';
        line.textContent = meta.join(' · ');
        details.appendChild(line);
      }
      const address = document.createElement('div');
      address.className = 'nasrin-chat-business-address';
      address.textContent = clean(place.vicinity || place.formatted_address || '', 180);
      if (address.textContent) details.appendChild(address);
      if (place.opening_hours && typeof place.opening_hours.open_now === 'boolean') {
        const open = document.createElement('div');
        open.className = 'nasrin-chat-business-open ' + (place.opening_hours.open_now ? 'is-open' : 'is-closed');
        open.textContent = place.opening_hours.open_now ? 'Open now' : 'Closed now';
        details.appendChild(open);
      }
      card.appendChild(details);
      container.appendChild(card);
    });
  }
  function nearbyBusinesses(maps, map, center, container, status) {
    if (!center || !maps.places?.PlacesService) {
      status.textContent = 'Nearby business details are unavailable right now.';
      return;
    }
    const service = new maps.places.PlacesService(map);
    service.nearbySearch({ location: center, radius: 1400, rankBy: maps.places.RankBy?.PROMINENCE }, (results, code) => {
      if (code !== maps.places.PlacesServiceStatus.OK || !Array.isArray(results) || !results.length) {
        status.textContent = code === 'REQUEST_DENIED'
          ? 'Enable Google Places API for this Maps key to show nearby businesses.'
          : 'No nearby businesses were found for this location.';
        return;
      }
      renderBusinessCards(container, results);
      status.textContent = 'Nearby businesses · ' + Math.min(results.length, 5) + ' shown';
    });
  }
  function renderStructured(root, payload) {
    if (!root || !payload || !['map', 'places', 'directions'].includes(payload.type)) return false;
    const title = clean(payload.title || 'Nearby places', 180);
    const { canvas, status, businesses } = makeCard(root, title, payload.mapUrl || 'https://www.google.com/maps');
    loadMaps().then(maps => {
      const places = Array.isArray(payload.places) ? payload.places.filter(p => validPoint(p.location)) : [];
      const center = validPoint(payload.center) ? { lat: Number(payload.center.lat), lng: Number(payload.center.lng) }
        : places.length ? { lat: Number(places[0].location.lat), lng: Number(places[0].location.lng) } : null;
      const map = new maps.Map(canvas, { center: center || { lat: 7.07, lng: 125.6 }, zoom: places.length > 1 ? 13 : 14, mapTypeControl: false, streetViewControl: false, fullscreenControl: true, gestureHandling: 'cooperative' });
      if (payload.type === 'directions' && payload.origin && payload.destination) {
        new maps.DirectionsService().route({
          origin: clean(payload.origin, 180), destination: clean(payload.destination, 180),
          travelMode: maps.TravelMode[({ DRIVE: 'DRIVING', WALK: 'WALKING', BICYCLE: 'BICYCLING', TRANSIT: 'TRANSIT' })[payload.travelMode] || 'DRIVING']
        }).then(result => {
          new maps.DirectionsRenderer({ map, preserveViewport: false }).setDirections(result);
          const leg = result.routes?.[0]?.legs?.[0];
          const end = leg?.end_location;
          status.textContent = [leg?.distance?.text, leg?.duration?.text].filter(Boolean).join(' · ') || 'Route loaded';
          if (end) nearbyBusinesses(maps, map, end, businesses, status);
          else locateAndFind(maps, map, payload.destination, businesses, status);
        }).catch(() => locateAndFind(maps, map, payload.destination, businesses, status));
        return;
      }
      if (places.length) {
        const bounds = new maps.LatLngBounds();
        places.forEach((place, index) => {
          const position = { lat: Number(place.location.lat), lng: Number(place.location.lng) };
          bounds.extend(position);
          new maps.Marker({ map, position, title: clean(place.name || 'Place', 120), label: places.length <= 9 ? String(index + 1) : undefined });
        });
        if (places.length > 1) map.fitBounds(bounds);
        renderBusinessCards(businesses, places);
        status.textContent = 'Places near this location';
        if (center) nearbyBusinesses(maps, map, center, businesses, status);
      } else if (center) {
        new maps.Marker({ map, position: center, title });
        nearbyBusinesses(maps, map, center, businesses, status);
      } else if (payload.query) locateAndFind(maps, map, payload.query, businesses, status);
      else status.textContent = 'No coordinates were returned for this location.';
    }).catch(err => {
      status.textContent = err.message || 'Map and nearby businesses are unavailable.';
    });
    return true;
  }
  function locateAndFind(maps, map, query, businesses, status) {
    new maps.Geocoder().geocode({ address: clean(query, 180) }).then(({ results }) => {
      const place = results?.[0];
      if (!place) throw new Error('Location not found');
      map.setCenter(place.geometry.location);
      map.setZoom(14);
      new maps.Marker({ map, position: place.geometry.location, title: clean(query, 120) });
      nearbyBusinesses(maps, map, place.geometry.location, businesses, status);
    }).catch(() => {
      status.textContent = 'Could not locate this place. Check Maps and Places API configuration.';
    });
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
