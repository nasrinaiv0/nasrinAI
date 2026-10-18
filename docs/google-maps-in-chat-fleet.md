# Google Maps in NasrinAI Chat — Interactive Maps and Fleet Operations

**Status:** Implementation specification; not a claim that these features are already live.
**Date:** 2026-10-18
**Target:** `nasrinai.com` chat UI, mobile Safari first-class.
**Principles:** Premium monochrome UI with restrained orange accent; privacy-first location; no hardcoded secrets; no fake map, traffic, ETA, schedule, or dispatch data.

## Product outcome

Users can ask NasrinAI for a location, route, directions, nearby destination, or fleet plan and get an **interactive Google Map embedded in the chat**. The user can pan/zoom, select route stops, toggle traffic, edit the route, and continue changing the map conversationally without being kicked to another tab. An explicit Open in Google Maps action is a secondary option, not the primary experience.

## 1. Capability tiers

### A. Interactive map (Google Maps JavaScript API)
- Responsive embedded map with pan, zoom, keyboard accessibility, touch gestures, map/satellite/terrain options where supported.
- Markers for user-approved origin, destinations, waypoints, and fleet vehicles.
- Map controls: locate me, traffic on/off, route alternatives, clear stops, fit all markers, fullscreen/expand on supported devices.
- Accessible list equivalent for all map pins and routes; the map must not be the only way to read results.
- Load the Maps JS library only when the user opens a map. Show skeleton/loading, retry, and a clear unavailable state.
- Respect CSP, script integrity/provider requirements, mobile viewport, reduced-motion, dark/light appearance, and cleanup when a message is removed or re-rendered.
- Use the supported Google Maps JavaScript API and Google attribution; never scrape Google Maps pages or use unofficial tiles.

### B. Location consent and privacy
- Do not request browser geolocation on page load or merely because the user mentions a map.
- Request location only after the user taps **Use my location** or explicitly asks to use current location in a supported map action.
- Explain why location is needed, handle denied/unsupported/timeout states, and offer manual location entry.
- Use coordinates in memory for the active task; do not persist exact coordinates to chat history or user profile unless the user explicitly asks to save a location.
- Do not send location to an AI provider unless needed for the user-requested task and permitted by the active privacy/provider policy.
- Do not claim device GPS accuracy or current location until browser permission resolves successfully.
- Prevent prompt-injection from place names, address fields, map results, and user-provided route data.

### C. Directions and traffic
- Routes API: origin, destination, intermediate stops, alternatives, route polyline, distance, duration, step-by-step directions, and traffic-aware duration where supported.
- Traffic layer on the map, refreshed according to Google's service behavior; display a clear timestamp or “traffic data unavailable” status where applicable.
- User can choose driving, walking, bicycling, transit, or two-wheeler where the API and region support it. Warn that some modes/routes can be incomplete in some regions.
- Route Matrix for multiple origin/destination combinations, bounded by service limits and request budgets.
- Display real provider-returned route results only. If Google API fails, do not synthesize a duration or call it live traffic; offer retry or open a Google Maps Directions URL.
- Provide per-user request throttling, server-side input validation, bounded waypoints, timeouts, provider error normalization, and safe logging without raw coordinates or API secrets.

### D. Fleet schedule and route optimization
- Fleet workspace can be opened from the map in chat and contains:
  - Vehicles: ID/name, start/end depot, capacity, vehicle dimensions/restrictions when supported, shift start/end, break rules, allowed tasks.
  - Stops/tasks: pickup/delivery, address/coordinates, service duration, load, priority, time windows, pickup-delivery dependency, task status.
  - Optimization objective: minimize travel time/distance/cost, improve on-time delivery, balance work, or minimize vehicles, subject to supported Google API capabilities.
  - Schedule: vehicle assignment, ordered stops, arrival/leave estimates, total route distance/time, warnings for unassigned tasks, shift/time-window conflicts.
  - Re-optimize after a new stop, cancellation, traffic delay, vehicle availability change, or dispatcher request.
- Use Google Route Optimization API for multi-vehicle assignment and time-window/capacity constraints. Do not emulate fleet optimization by merely sorting stop addresses.
- Persist fleet/vehicle/task/schedule records only for signed-in users/tenants, with strict tenant isolation, RLS, audit history, and explicit save controls.
- Preview a proposed plan before saving. Require explicit confirmation before any write/dispatch action.
- Fleet schedule is a planning artifact unless a separate driver-tracking/dispatch system is connected. Never show imaginary live vehicle locations or statuses.
- If using Fleet Engine, implement the relevant Fleet Engine product model and authenticated driver app/tracking flow; only then can live fleet tracking be claimed.
- Keep user-controlled optimization runs within rate/cost budgets and support asynchronous long-running operations if required.

## 2. Google Cloud configuration (Vercel only; no hardcoded defaults)

Add and document these environment variables, all optional until the feature is enabled:
- `GOOGLE_MAPS_BROWSER_API_KEY`: browser key, HTTP-referrer restricted to the exact NasrinAI production/staging origins and restricted to only required browser APIs.
- `GOOGLE_MAPS_SERVER_API_KEY`: server-only key, never returned to the browser, restricted to required APIs and server restrictions where feasible.
- `GOOGLE_MAPS_FEATURE_ENABLED`: explicit feature switch; default off when absent.
- `GOOGLE_MAPS_ROUTE_OPTIMIZATION_ENABLED`: separate switch for fleet optimization.
- Use the existing Google OAuth client ID/secret only for Google OAuth. Do not use the OAuth client secret as a Maps API key.
- Keep secrets in Vercel project environment variables; no source-code defaults, no example secret values in production, no client-side exposure of server key.
- Browser key is not a server secret but must be restricted. The server key must never be included in HTML, JSON configuration, logs, errors, source maps, or chat.
- Required APIs (enable only as needed): Maps JavaScript API, Routes API, and Route Optimization API for fleet scheduling. Traffic layer availability and supported fields depend on API and region.
- Confirm Google Cloud billing, quotas, API restrictions, budget alerts, and production/staging key separation before enabling.

## 3. Architecture
- Dedicated `src/maps/` module for input validation, Routes API client, Route Matrix, optimization API, normalized errors, limits, and provider mocks.
- Routes should use the existing authenticated caller/tenant model and enforce rate limits before provider calls.
- Browser configuration endpoint returns only the restricted browser key when the feature is enabled; never expose the server key.
- Chat tool layer exposes structured actions such as:
  - `maps_show_map`
  - `maps_route`
  - `maps_route_matrix`
  - `maps_optimize_fleet`
  - `maps_save_fleet_plan` (write-confirmation required)
  - `maps_update_fleet_task` (write-confirmation required)
- Tool output uses a validated structured payload (map center, markers, route polyline/summary, traffic state, task IDs). The UI must treat all provider/user strings as text, never executable HTML.
- Render a first-party map message card inside the chat message renderer; keep state isolated per message/conversation. Support reopening the map, changing traffic, editing stops, and regenerating routes without duplicating event handlers.
- Use browser geolocation only in direct user gesture callbacks, and return coordinates to the backend only for the active requested action.
- Map controls are real functional controls; never show a traffic switch if the API is not configured, or a fleet schedule button if the optimization API is disabled.

## 4. Security, cost, and reliability
- Never trust client-supplied tenant/user IDs. Resolve caller identity on the server.
- Validate coordinates, addresses, stop counts, vehicle counts, time zones, dates, numeric capacities, IDs, and maximum body size.
- Protect against SSRF: API requests go only to fixed Google API hosts, no user-controlled URL fetches.
- Do not log precise coordinates, full addresses, OAuth tokens, API keys, or user content. Use coarse, redacted diagnostics.
- All saved fleet resources use tenant-aware database queries and RLS; no public fleet data. Add migration and RLS audit before persistence ships.
- Writes (save, update, delete, dispatch) require explicit user confirmation through the existing server confirmation mechanism. The model cannot self-confirm.
- Apply quotas, backoff for 429/5xx, timeout and cancellation, bounded retries, idempotency where applicable, and usage telemetry that avoids location details.
- Use mock fetches for tests; never hit billable Google APIs in unit tests.
- Feature-off mode must preserve all current chat and plugin behavior and must not load Google scripts.

## 5. UX acceptance criteria
- On mobile Safari and desktop, user asks “show me the map” and sees an actual interactive map inside the chat.
- “Use my location” requests permission only after the tap; denied permission has a manual-entry fallback.
- “Show traffic” turns on the actual provider traffic layer; if unavailable, clearly reports that instead of faking it.
- “Route from A to B via C” draws a real provider route and shows real returned distance/duration.
- “Plan 12 deliveries across 3 vans, 9–5, 15-minute service per stop” asks for missing constraints, submits a validated optimization request, shows the real assigned schedule and any unassigned tasks.
- User can edit stops and request re-optimization; map and schedule remain consistent.
- Saving a fleet plan asks for confirmation and is tenant-isolated. No dispatch is claimed unless an actual dispatch connector exists.
- Loading, empty, permission denied, quota exhausted, invalid address, unsupported region, provider timeout, and API-not-configured states are all designed and tested.
- All controls work with keyboard and touch, respect reduced motion, and have accessible labels.

## 6. Tests required before merge
- Unit tests for coordinate/address validation, request bounds, traffic-aware route mapping, alternative routes, time windows, capacities, breaks, shift constraints, unassigned stops, and provider error mapping.
- Security tests for unauthenticated calls, tenant-crossing attempts, malformed IDs, oversized bodies, secret leakage, SSRF attempts, and confirmation replay.
- UI tests for map loading, failed loading, mobile layout, permission accept/deny, traffic toggle, map unmount/remount, route updates, stop editing, and accessibility.
- Regression tests: existing Google OAuth, Gmail/Calendar, Maps Directions URL, plugin independence, chat message rendering, CSP, and settings remain unchanged.
- Run `npm test`, secret scan, relevant browser tests, and deployment preview checks. No claim of live traffic or fleet optimization until tested with a correctly configured Google Cloud project.

## 7. Rollout order
1. Restricted Vercel variables, Google Cloud API setup, budget/quota limits, CSP, and status/health checks.
2. Interactive in-chat map and consent-driven geolocation.
3. Real route and traffic APIs with route summary and alternatives.
4. Route Matrix and stop editing.
5. Fleet model/schema with RLS and audit trail.
6. Route Optimization API with preview, save-confirmation, and re-optimization.
7. Optional Fleet Engine/driver tracking integration as a separately scoped release.
8. Gradual production enablement and monitoring; keep feature disabled until required credentials and tests pass.

## Sources
- Maps JS traffic layer: https://developers.google.com/maps/documentation/javascript/trafficlayer
- Maps JS Routes library: https://developers.google.com/maps/documentation/javascript/routes/overview
- Routes API traffic-aware routing: https://developers.google.com/maps/documentation/javascript/routes/traffic-options
- Route Matrix: https://developers.google.com/maps/documentation/javascript/routes/route-matrix-class-overview
- Route Optimization API: https://developers.google.com/maps/documentation/route-optimization/overview
- Fleet Engine + route optimization: https://developers.google.com/maps/documentation/mobility/services/capabilities/route-optimization-fleet-engine
