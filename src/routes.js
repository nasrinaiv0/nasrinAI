import { randomUUID, timingSafeEqual } from 'node:crypto';
import { REALTIME_VOICES_LIST } from './realtime.js';
import { buildProfessionalSearch, buildProfessionalResearchInput, presentProfessionalSearch } from './professional-intelligence.js';
import { createLinkedInIntegration } from './linkedin/index.js';
import { GEMINI_REALTIME_VOICES } from './gemini-realtime.js';
import { issueGuestToken, newGuestId } from './auth/guest.js';
import { publicConversation, publicMessage } from './conversations.js';
import { HttpError } from './http/errors.js';
import { createElevenLabs } from './elevenlabs.js';
import { encryptElevenLabsCredential, decryptElevenLabsCredential } from './elevenlabs-credentials.js';
import { authRoutes } from './auth/routes.js';
import { paymentRoutes } from './payments/routes.js';
import { manilaDayStart, manilaWeekStart, userWeeklyTokenLimit } from './limits.js';
import { publicCatalog } from './ai/professions.js';
import { realtimeCostPerMinute } from './ai/pricing.js';
import { createNotices, WHENS } from './notices.js';

const IMPROVEMENT_CONSENT_VERSION = '2026-10-10-preference-only';

// The public API. Each route is either explicitly public or requires a caller.
// The address of this NasrinAI app as the browser sees it (used to build the install code).
function appOriginOf(req) {
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim().toLowerCase();
  const proto = String(req.headers['x-forwarded-proto'¶»§q«^