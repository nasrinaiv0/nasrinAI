import assert from 'node:assert/strict';
import test from 'node:test';
import { createGoogleMapsTools } from '../src/maps/google-maps.js';

const json = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
test('Google Maps tool is unavailable without a server key', () => {
  const maps = createGoogleMapsTools({ apiKey: '' });
  assert.equal(maps.available, false);
  assert.equal(maps.tool.name, 'google_maps_explore');
  assert.rejects(maps.tool.run({ action: 'map', location: 'Davao City' }), /not configured/);
});
test('map action returns coordinates and a safe embed URL', async () => {
  const maps = createGoogleMapsTools({ apiKey: 'server-secret', fetchImpl: async (url) => {
    assert.match(String(url), /geocode\/json/);
    assert.ok(String(url).includes('key=server-secret'));
    return json({ status: 'OK', results: [{ formatted_address: 'Davao City, Philippines', geometry: { location: { lat: 7.07, lng: 125.6 } } }] });
  } });
  const result = await maps.tool.run({ action: 'map', location: 'Davao City' });
  assert.equal(result.center.lat, 7.07);
  assert.match(result.embedUrl, /output=embed/);
  assert.equal(JSON.stringify(result).includes('server-secret'), false);
});
test('places action uses field mask and normalizes provider results', async () => {
  const maps = createGoogleMapsTools({ apiKey: 'secret', fetchImpl: async (url, options) => {
    assert.match(String(url), /places:searchText/);
    assert.match(options.headers['X-Goog-FieldMask'], /places.location/);
    assert.equal(JSON.parse(options.body).textQuery, 'coffee shops in Davao City');
    return json({ places: [{ displayName: { text: 'Coffee Spot' }, formattedAddress: 'Davao City', location: { latitude: 7, longitude: 125 }, rating: 4.5, googleMapsUri: 'https://maps.google.com/?q=coffee' }] });
  } });
  const result = await maps.tool.run({ action: 'places', location: 'Davao City', query: 'coffee shops' });
  assert.equal(result.places[0].name, 'Coffee Spot');
  assert.equal(result.places[0].location.lat, 7);
});
test('directions action returns route distance and directions URL', async () => {
  const maps = createGoogleMapsTools({ apiKey: 'secret', fetchImpl: async (url, options) => {
    assert.match(String(url), /directions\/v2:computeRoutes/);
    assert.equal(JSON.parse(options.body).travelMode, 'DRIVE');
    return json({ routes: [{ distanceMeters: 12000, duration: '1200s', polyline: { encodedPolyline: 'abc' } }] });
  } });
  const result = await maps.tool.run({ action: 'directions', location: 'Matina Aplaya, Davao City', destination: 'Davao Airport' });
  assert.equal(result.distanceMeters, 12000);
  assert.match(result.mapUrl, /google.com\/maps\/dir/);
});
test('provider failures are sanitized', async () => {
  const maps = createGoogleMapsTools({ apiKey: 'secret', fetchImpl: async () => json({ error: 'private provider response' }, 403) });
  await assert.rejects(maps.tool.run({ action: 'map', location: 'Davao City' }), /could not complete that request/);
});
