// Google Maps tools for NasrinAI Chat. All billable REST calls stay server-side.
const BASE = 'https://maps.googleapis.com/maps/api';
const text = (v, max = 180) => String(v ?? '').trim().slice(0, max);
const finite = (v) => Number.isFinite(Number(v)) && Number(v) >= -90 && Number(v) <= 90;
const safePlace = (p) => ({
  name: text(p.displayName?.text || p.name || p.formattedAddress || 'Place', 120),
  address: text(p.formattedAddress || p.vicinity || '', 220),
  location: p.location && Number.isFinite(p.location.latitude) && Number.isFinite(p.location.longitude)
    ? { lat: p.location.latitude, lng: p.location.longitude } : null,
  googleMapsUri: typeof p.googleMapsUri === 'string' ? p.googleMapsUri : null,
  rating: Number.isFinite(p.rating) ? p.rating : null,
  types: Array.isArray(p.types) ? p.types.slice(0, 5) : []
});
export function createGoogleMapsTools({ apiKey = '', fetchImpl = fetch, logger = null } = {}) {
  const available = Boolean(String(apiKey).trim());
  async function request(url, options = {}) {
    const res = await fetchImpl(url, { ...options, signal: AbortSignal.timeout(9000) });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      logger?.warn?.('Google Maps request failed', { status: res.status });
      throw new Error('Google Maps could not complete that request. Check the location and try again.');
    }
    return data;
  }
  const tool = {
    name: 'google_maps_explore',
    description: 'Search places, show an interactive map location, or calculate a driving/walking/bicycling route. Use for requests involving maps, nearby places, restaurants, shops, hotels, directions, or distances. Ask for a location if missing. Return map-ready coordinates and Google Maps links for the chat UI.',
    risk: 'read',
    who: ['guest', 'user', 'service'],
    timeoutMs: 12000,
    parameters: {
      properties: {
        action: { type: 'string', enum: ['map', 'places', 'directions'] },
        location: { type: 'string', maxLength: 180, description: 'City, address, or place name.' },
        query: { type: 'string', maxLength: 120, description: 'Place type or search phrase, e.g. coffee shops.' },
        destination: { type: 'string', maxLength: 180, description: 'Destination for directions.' },
        travel_mode: { type: 'string', enum: ['DRIVE', 'WALK', 'BICYCLE', 'TRANSIT'] }
      },
      required: ['action', 'location']
    },
    async run(args) {
      if (!available) throw new Error('Google Maps is not configured yet.');
      const location = text(args.location);
      if (!location) throw new Error('Please provide a city, address, or place.');
      if (args.action === 'map') {
        const geo = await request(`${BASE}/geocode/json?address=${encodeURIComponent(location)}&key=${encodeURIComponent(apiKey)}`);
        const hit = geo?.status === 'OK' && geo.results?.[0];
        if (!hit) throw new Error('I could not find that location. Try a more specific address or city.');
        const loc = hit.geometry.location;
        return { type: 'map', title: text(hit.formatted_address, 180), center: { lat: loc.lat, lng: loc.lng }, mapUrl: `https://www.google.com/maps/search/?api=1&query=${loc.lat},${loc.lng}`, embedUrl: `https://maps.google.com/maps?q=${loc.lat},${loc.lng}&z=13&output=embed`, places: [] };
      }
      if (args.action === 'places') {
        const query = text(args.query, 120);
        if (!query) throw new Error('Please specify what places to find.');
        const data = await request('https://places.googleapis.com/v1/places:searchText', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.location,places.googleMapsUri,places.rating,places.types' },
          body: JSON.stringify({ textQuery: query + ' in ' + location, maxResultCount: 8 })
        });
        const places = (data.places || []).map(safePlace);
        return { type: 'places', title: query + ' near ' + location, places, center: places.find(p => p.location)?.location || null, mapUrl: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(query + ' in ' + location) };
      }
      if (args.action === 'directions') {
        const destination = text(args.destination);
        if (!destination) throw new Error('Please provide a destination for directions.');
        const mode = args.travel_mode || 'DRIVE';
        const data = await request('https://routes.googleapis.com/directions/v2:computeRoutes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration,routes.description,routes.polyline.encodedPolyline,routes.legs.startLocation,routes.legs.endLocation' },
          body: JSON.stringify({ origin: { address: location }, destination: { address: destination }, travelMode: mode, computeAlternativeRoutes: false, languageCode: 'en' })
        });
        const route = data.routes?.[0];
        if (!route) throw new Error('No route was found between those locations.');
        return { type: 'directions', title: location + ' → ' + destination, origin: location, destination, travelMode: mode, distanceMeters: route.distanceMeters, duration: route.duration, polyline: route.polyline?.encodedPolyline || null, mapUrl: 'https://www.google.com/maps/dir/?api=1&origin=' + encodeURIComponent(location) + '&destination=' + encodeURIComponent(destination) + '&travelmode=' + ({ DRIVE: 'driving', WALK: 'walking', BICYCLE: 'bicycling', TRANSIT: 'transit' }[mode]) };
      }
      throw new Error('Unsupported map action.');
    }
  };
  return { available, tool };
}
