import { createHmac } from 'node:crypto';

const ACTOR_TYPES = new Set(['user', 'guest', 'service']);
const COUNTRY = /^[A-Z]{2}$/;

function cleanText(value, max) {
  if (typeof value !== 'string') return null;
  const text = value.trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max);
  return text || null;
}

// Vercel injects these headers at the edge. Do not accept browser-provided
// query/body location or GPS; without the platform marker, location is unknown.
export function regionFromTrustedHeaders(headers = {}) {
  if (!headers['x-vercel-id']) return { countryCode: null, region: null, city: null };
  const rawCountry = cleanText(headers['x-vercel-ip-country'], 2)?.toUpperCase() || null;
  return {
    countryCode: rawCountry && COUNTRY.test(rawCountry) ? rawCountry : null,
    region: cleanText(headers['x-vercel-ip-country-region'], 100),
    city: cleanText(headers['x-vercel-ip-city'], 100)
  };
}

export function createRegionalAnalytics({ url, serviceKey, hashSecret = serviceKey, fetchImpl = fetch, logger = { warn() {} }, platformTenantId }) {
  const enabled = Boolean(url && serviceKey && hashSecret);
  async function record({ req, caller }) {
    if (!enabled || !caller || caller.tenantId !== platformTenantId) return false;
    const actorType = caller.actor?.type;
    const actorId = caller.actor?.id;
    if (!ACTOR_TYPES.has(actorType) || typeof actorId !== 'string' || !actorId || actorId.length > 256) return false;

    const location = regionFromTrustedHeaders(req?.headers || {});
    // If edge geolocation is unavailable, don't store a misleading location.
    if (!location.countryCode && !location.region && !location.city) return false;
    const actorKeyHash = createHmac('sha256', hashSecret)
      .update(actorType + ':' + actorId)
      .digest('hex');

    try {
      const response = await fetchImpl(url + '/rest/v1/rpc/record_regional_analytics_event', {
        method: 'POST',
        headers: {
          apikey: serviceKey,
          Authorization: 'Bearer ' + serviceKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          p_event_type: 'session_start',
          p_actor_type: actorType,
          p_actor_key_hash: actorKeyHash,
          p_country_code: location.countryCode,
          p_region: location.region,
          p_city: location.city
        }),
        signal: AbortSignal.timeout(2500)
      });
      if (!response.ok) {
        logger.warn('regional analytics write failed', { status: response.status });
        return false;
      }
      return true;
    } catch (error) {
      logger.warn('regional analytics write failed', { error: error?.name || 'Error' });
      return false;
    }
  }
  return { enabled, record };
}
