# Google Weather API in NasrinAI Chat

## Configuration

Set `GOOGLE_WEATHER_API_KEY` in Vercel for the relevant environments (Production and Preview as needed). Compatible server-side aliases `GOOGLE_MAPS_PLATFORM_API_KEY` and `GOOGLE_MAPS_API_KEY` are also accepted. Do not use a browser-restricted key such as `GOOGLE_MAPS_BROWSER_API_KEY`. Keep the key server-side; do not prefix it with `NEXT_PUBLIC_`, `VITE_`, or any browser-public naming. Restrict the key to the required Google Maps Platform APIs and set billing quotas/alerts.

The adapter uses Google Geocoding API to resolve the user-provided city/location and Google Maps Platform Weather API for current conditions, hourly forecasts, and daily forecasts. Both services must be enabled for the key. The tool is not registered if no key is configured.

## Product and terms constraints

Weather is exposed only as a contextual read tool inside general-purpose NasrinAI Chat. Do not add a standalone weather dashboard, weather-only landing page, weather alerts product, or weather-model recreation using Google Weather API data. Review current Google Maps Platform terms before expanding this use case.

Google Weather API content is held only in a bounded in-process cache: current conditions and hourly forecast for at most one hour; daily forecast for at most 24 hours. Cache entries are not written to Supabase. Cache is per server process and may be evicted sooner. Do not persist raw provider payloads, coordinates derived by geocoding, or weather responses in telemetry. Chat conversation retention follows the existing chat product policy; reassess terms before changing that retention behavior.

## Usage, cost, and errors

Tool execution is covered by existing tool usage telemetry. The adapter emits a separate `google-weather` usage event with endpoint category, latency, success/failure, and cache-hit metadata; it deliberately records cost as unknown (`NULL`) rather than claiming zero. Exact cost reconciliation must come from Google Cloud billing/SKU reports. Logs omit the location query, coordinates, API key, response body, and forecast values.

A 403 commonly indicates that Weather API or Geocoding API is not enabled for the key, billing is unavailable, or key restrictions reject the request. A 429 indicates quota/rate limiting. User-facing errors are sanitized. The chat tool is read-only and available to guest, signed-in, and service callers, subject to existing tool registry rate limits and policies.

## Validation

Run `npm test` and `npm run check:secrets`. Tests use mocked Google responses and do not verify live credentials, enabled APIs, Google billing, or production deployment.
