# Customer Location for NasrinAI

**Status:** Foundation / implementation requirements. This document does not claim the full UI or location-aware chat pipeline is already shipped.

## Goal

Allow customers to explicitly share their current device location with NasrinAI for the active request, so the assistant can answer nearby-place, route, and location-specific questions without requiring the customer to type coordinates.

## Permission and behavior

- Never request geolocation automatically on page load, sign-in, or ordinary chat startup.
- Ask only after the customer activates a clear **Use my location** control or explicitly confirms a location-dependent action.
- Use the browser Geolocation API on the web; use native location permission APIs for future iOS/Android clients.
- Explain the purpose before requesting permission. Provide manual city/address/landmark entry when permission is denied, unavailable, or times out.
- Respect browser and OS permission decisions; do not try to bypass denied permission.
- Use precise coordinates only for the active task. Do not persist them in conversation history, memories, analytics, or customer profiles by default.
- Do not send coordinates to a model/provider unless the active request requires it. Prefer a server-side, privacy-aware location tool and return only relevant results to the model.
- Never describe IP-derived estimates as precise GPS.
- All location-based actions must work without location permission, using manual input as a fallback.

## Current change

The site-level Permissions-Policy previously set geolocation=(), which blocks even a customer-approved browser geolocation request. This foundation changes it to geolocation=(self) in both the Node response headers and Vercel's static response headers. This permits the first-party page to request location; it does **not** grant permission by itself. The browser prompt and explicit user action remain required.

## Required follow-up before calling the feature complete

1. Add a real, accessible **Use my location** composer/map control and connect it to navigator.geolocation.getCurrentPosition from the direct click handler.
2. Show requesting, success, denied, unsupported, timeout, and retry states. Never silently fall back to IP geolocation.
3. Pass location as short-lived request context separate from the user-visible message, and ensure server logs, saved messages, memories, and analytics exclude exact coordinates.
4. Add server-side validation and a location-aware tool flow. Do not trust model-generated URLs or arbitrary client-supplied user/tenant IDs.
5. Add unit/browser tests for grant/deny, timeout, unsupported browsers, repeated clicks, manual fallback, and verifying coordinates are not persisted or logged.
6. Verify iOS Safari and desktop browsers over HTTPS. Keep the feature disabled unless the complete consent-to-result path is ready.

## Acceptance criteria

- No permission prompt before a customer action.
- Browser permission remains the authority; denial never blocks normal chat.
- No exact coordinates in saved chat content, profile memory, or routine logs.
- Clear manual-location fallback and understandable errors.
- Tests cover both permission outcomes and confirm unrelated chat/auth/plugin behavior is unchanged.
