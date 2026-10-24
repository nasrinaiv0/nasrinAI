// Google Maps Platform Weather API tool for contextual answers inside NasrinAI Chat.
// Weather responses are cached in process memory only and never written to Supabase telemetry.
// Google Weather API data must not power a standalone weather product.
const BASE = 'https://weather.googleapis.com/v1/';
const GEO = 'https://maps.googleapis.com/maps/api/geocode/json';
const MAX_LOCATION = 160;
const CACHE_LIMIT = 500;

function safeLocation(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, MAX_LOCATION);
}
function ttlFor(kind) {
  return kind === 'daily' ? 24 * 60 * 60_000 : 60 * 60_000;
}
function temp(value) {
  if (!value || !Number.isFinite(Number(value.degrees))) return null;
  const unit = value.unit === 'FAHRENHEIT' ? '°F' : '°C';
  return Math.round(Number(value.degrees) * 10) / 10 + unit;
}
function cleanWeather(kind, data, location) {
  if (kind === 'current') return {
    source: 'Google Maps Platform Weather API',
    location,
    type: 'current',
    observedAt: data.currentTime || null,
    condition: data.weatherCondition?.description?.text || data.weatherCondition?.type || 'Conditions unavailable',
    temperature: temp(data.temperature),
    feelsLike: temp(data.feelsLikeTemperature),
    humidityPercent: Number.isFinite(data.relativeHumidity) ? data.relativeHumidity : null,
    uvIndex: Number.isFinite(data.uvIndex) ? data.uvIndex : null,
    wind: data.wind?.speed?.value != null ? { speed: data.wind.speed.value, unit: data.wind.speed.unit || null, direction: data.wind.direction?.cardinal || null } : null,
    precipitationProbability: Number.isFinite(data.precipitation?.probability?.percent) ? data.precipitation.probability.percent : null
  };
  if (kind === 'hourly') return {
    source: 'Google Maps Platform Weather API',
    location,
    type: 'hourly',
    hours: (Array.isArray(data.forecastHours) ? data.forecastHours : []).slice(0, 24).map((h) => ({
      time: h.interval?.startTime || null,
      condition: h.weatherCondition?.description?.text || h.weatherCondition?.type || null,
      temperature: temp(h.temperature),
      precipitationProbability: Number.isFinite(h.precipitation?.probability?.percent) ? h.precipitation.probability.percent : null,
      windSpeed: h.wind?.speed?.value ?? null,
      windUnit: h.wind?.speed?.unit || null
    }))
  };
  return {
    source: 'Google Maps Platform Weather API',
    location,
    type: 'daily',
    days: (Array.isArray(data.forecastDays) ? data.forecastDays : []).slice(0, 10).map((d) => ({
      date: d.interval?.startTime || d.displayDate?.year && d.displayDate?.month && d.displayDate?.day
        ? (d.interval?.startTime || [d.displayDate.year, String(d.displayDate.month).padStart(2,'0'), String(d.displayDate.day).padStart(2,'0')].join('-'))
        : null,
      condition: d.daytimeForecast?.weatherCondition?.description?.text || d.daytimeForecast?.weatherCondition?.type || d.nighttimeForecast?.weatherCondition?.description?.text || null,
      high: temp(d.maxTemperature),
      low: temp(d.minTemperature),
      precipitationProbability: Number.isFinite(d.daytimeForecast?.precipitation?.probability?.percent) ? d.daytimeForecast.precipitation.probability.percent : null
    }))
  };
}

export function createGoogleWeatherTool({ apiKey = '', fetchImpl = fetch, usageLog = null, logger = null, now = () => Date.now(), timeoutMs = 7000 } = {}) {
  const cache = new Map();
  const available = Boolean(String(apiKey).trim());
  async function request(url, signal) {
    const response = await fetchImpl(url, { method: 'GET', headers: { Accept: 'application/json' }, signal });
    if (!response.ok) {
      const status = response.status;
      const err = new Error(status === 429 ? 'Weather service is rate limited' : status === 403 ? 'Weather API access is not enabled or is forbidden' : 'Weather service request failed');
      err.status = status;
      throw err;
    }
    return response.json();
  }
  async function geocode(location, signal) {
    const url = new URL(GEO);
    url.searchParams.set('address', location);
    url.searchParams.set('key', apiKey);
    const data = await request(url, signal);
    if (data.status !== 'OK' || !Array.isArray(data.results) || !data.results[0]?.geometry?.location) {
      const err = new Error(data.status === 'ZERO_RESULTS' ? 'I could not find that location. Try a city and country.' : 'Location lookup failed. Check Google Geocoding API access for this key.');
      err.code = 'location_lookup_failed';
      throw err;
    }
    const result = data.results[0];
    return { point: result.geometry.location, label: String(result.formatted_address || location).slice(0, 180) };
  }
  async function weatherCall(kind, point, signal, days = 5) {
    const path = kind === 'current' ? 'currentConditions:lookup' : kind === 'hourly' ? 'forecast/hours:lookup' : 'forecast/days:lookup';
    const url = new URL(BASE + path);
    url.searchParams.set('key', apiKey);
    url.searchParams.set('location.latitude', String(point.lat));
    url.searchParams.set('location.longitude', String(point.lng));
    if (kind === 'hourly') url.searchParams.set('hours', '24');
    if (kind === 'daily') url.searchParams.set('days', String(Math.max(1, Math.min(10, Number(days) || 5))));
    return request(url, signal);
  }
  async function run(args) {
    if (!available) throw new Error('Google Weather is not configured on this server.');
    const location = safeLocation(args.location);
    if (!location || location.length < 2) throw new Error('Provide a city or location, such as Davao City, Philippines.');
    const kind = ['current', 'hourly', 'daily'].includes(args.forecast_type) ? args.forecast_type : 'current';
    const days = kind === 'daily' ? Math.max(1, Math.min(10, Number(args.days) || 5)) : 5;
    const started = now();
    const cacheKey = [kind, location.toLowerCase(), days].join(':');
    const hit = cache.get(cacheKey);
    if (hit && hit.expiresAt > now()) {
      if (usageLog && args.__caller) await usageLog.record(args.__caller, { provider: 'google-weather', model: kind, outcome: 'ok', latencyMs: now() - started, costUsd: null, task: 'weather', cacheHit: true });
      return hit.value;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let outcome = 'error';
    try {
      const place = await geocode(location, controller.signal);
      const raw = await weatherCall(kind, place.point, controller.signal, days);
      const value = cleanWeather(kind, raw, place.label);
      if (!(kind === 'hourly' && value.hours.length === 0) && !(kind === 'daily' && value.days.length === 0)) {
        if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value);
        cache.set(cacheKey, { value, expiresAt: now() + ttlFor(kind) });
      }
      outcome = 'ok';
      return value;
    } catch (err) {
      if (logger) logger.warn('Google Weather request failed', { kind, status: err.status || null, code: err.code || null });
      if (err.name === 'AbortError') throw new Error('Weather lookup timed out. Please try again.');
      throw err;
    } finally {
      clearTimeout(timer);
      // No location query, coordinates, API key, request/response body, or forecast values in usage logs.
      if (usageLog && args.__caller) await usageLog.record(args.__caller, { provider: 'google-weather', model: kind, outcome, latencyMs: now() - started, costUsd: null, task: 'weather', cacheHit: false }).catch(() => {});
    }
  }
  const tool = {
    name: 'google_weather_forecast',
    description: 'Get real current conditions or forecast data from Google Maps Platform Weather API. Use when the user asks about current weather, rain, hourly weather, or a multi-day forecast. Always state the location and that weather data is from Google. This tool is for contextual weather answers inside NasrinAI, not a standalone weather product.',
    risk: 'read',
    who: ['guest', 'user', 'service'],
    parameters: {
      properties: {
        location: { type: 'string', minLength: 2, maxLength: MAX_LOCATION, description: 'City or location, preferably including country.' },
        forecast_type: { type: 'string', enum: ['current', 'hourly', 'daily'], description: 'current for now, hourly for next 24 hours, daily for next 1-10 days.' },
        days: { type: 'integer', minimum: 1, maximum: 10, description: 'Number of days for a daily forecast, up to 10.' }
      },
      required: ['location', 'forecast_type']
    },
    async run(args, ctx) { return run({ ...args, __caller: ctx ? { tenantId: ctx.tenantId, actor: ctx.actor } : null }); }
  };
  // Tool registry context does not expose the full caller to tool code. Attach a safe
  // telemetry adapter externally rather than inventing an actor identity.
  return { tool, available, clearCache: () => cache.clear() };
}
