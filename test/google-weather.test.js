import assert from 'node:assert/strict';
import test from 'node:test';
import { createGoogleWeatherTool } from '../src/weather/google-weather.js';

function response(data, status = 200) {
  return { ok: status >= 200 && status < 300, status, async json() { return data; } };
}
const caller = { tenantId: 'tenant-1', actor: { type: 'user', id: 'user-1' } };
const geocode = { status: 'OK', results: [{ formatted_address: 'Davao City, Philippines', geometry: { location: { lat: 7.07, lng: 125.6 } } }] };
const current = { currentTime: '2026-10-24T02:00:00Z', weatherCondition: { description: { text: 'Partly cloudy' } }, temperature: { degrees: 31.2, unit: 'CELSIUS' }, feelsLikeTemperature: { degrees: 35, unit: 'CELSIUS' }, relativeHumidity: 72, uvIndex: 8 };

test('Google Weather tool is not registered without a server key', async () => {
  const weather = createGoogleWeatherTool({ apiKey: '' });
  assert.equal(weather.available, false);
  assert.equal(weather.tool.name, 'google_weather_forecast');
  await assert.rejects(weather.tool.run({ location: 'Davao City', forecast_type: 'current' }, { tenantId: 't', actor: { type: 'user', id: 'u' } }), /not configured/);
});

test('fetches real current weather, normalizes output, and keeps the API key out of results', async () => {
  const urls = [];
  const weather = createGoogleWeatherTool({ apiKey: 'test-server-key', fetchImpl: async (url) => {
    urls.push(new URL(url));
    return String(url).startsWith('https://maps.googleapis.com/') ? response(geocode) : response(current);
  } });
  const result = await weather.tool.run({ location: 'Davao City, Philippines', forecast_type: 'current' }, { tenantId: 't', actor: { type: 'user', id: 'u' } });
  assert.equal(result.temperature, '31.2°C');
  assert.equal(result.location, 'Davao City, Philippines');
  assert.equal(result.source, 'Google Maps Platform Weather API');
  assert.equal(urls.length, 2);
  assert.equal(urls[1].hostname, 'weather.googleapis.com');
  assert.equal(urls[1].searchParams.get('location.latitude'), '7.07');
  assert.equal(JSON.stringify(result).includes('test-server-key'), false);
});

test('uses memory cache within the permitted TTL and logs unknown cost as null', async () => {
  let clock = 1000;
  let calls = 0;
  const usage = [];
  const weather = createGoogleWeatherTool({ apiKey: 'test-key', now: () => clock, usageLog: { async record(c, e) { usage.push({ c, e }); } }, fetchImpl: async (url) => {
    calls++;
    return String(url).startsWith('https://maps.googleapis.com/') ? response(geocode) : response(current);
  } });
  const ctx = { tenantId: 't', actor: { type: 'user', id: 'u' } };
  await weather.tool.run({ location: 'Davao', forecast_type: 'current' }, ctx);
  await weather.tool.run({ location: 'Davao', forecast_type: 'current' }, ctx);
  assert.equal(calls, 2);
  assert.equal(usage.length, 2);
  assert.equal(usage[0].c.tenantId, 't');
  assert.equal(usage[0].e.costUsd, null);
  assert.equal(usage[1].e.cacheHit, true);
  clock += 60 * 60_000 + 1;
  await weather.tool.run({ location: 'Davao', forecast_type: 'current' }, ctx);
  assert.equal(calls, 4);
});

test('maps geocoding and upstream failures to safe errors without logging response bodies', async () => {
  const logs = [];
  const weather = createGoogleWeatherTool({ apiKey: 'test-key', logger: { warn: (...args) => logs.push(args) }, fetchImpl: async (url) => {
    if (String(url).startsWith('https://maps.googleapis.com/')) return response({ status: 'ZERO_RESULTS', results: [] });
    return response({ message: 'private provider response' }, 403);
  } });
  await assert.rejects(weather.tool.run({ location: 'not a real place', forecast_type: 'current' }, { tenantId: 't', actor: { type: 'user', id: 'u' } }), /could not find that location/);
  assert.equal(JSON.stringify(logs).includes('private provider response'), false);
});
