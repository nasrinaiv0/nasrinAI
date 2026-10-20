import { randomUUID } from 'node:crypto';
import { PLATFORM_TENANT_ID } from '../tenants.js';
import { mapKey, mapTenant, mapConversation, mapMessage, mapConnector, mapChannel } from './shape.js';

// The same interface as the Supabase store, kept in memory. Used by tests and
// local development only; the server refuses it in production.
const projectOut = ({ tasks, at, tenantId, userId, ...p }) => p;
const nccContactOut = ({ at, tenantId, userId, tags, ...c }) => ({ ...c, tags: [...tags] });
const nccDealOut = ({ at, tenantId, userId, ...d }) => ({ ...d });
const nccOut = ({ at, tenantId, userId, ...x }) => ({ ...x });

export function createMemoryStore({ now = () => Date.now() } = {}) {
  const tenants = new Map();
  const providerCredentials = new Map();
  const keys = new Map();
  const counters = new Map();
  const usage = [];
  const reservations = new Map();
  const spendReservations = new Map();
  const realtimeVoiceReservations = new Map();
  const conversations = new Map();
  const messages = [];
  const planPeriods = [];
  const images = new Map();
  const videos = new Map();
  const videoStudioAudioAssets = new Map();
  const videoStudioTimelineItems = new Map();
  const marketingCache = new Map();
  const sentFiles = new Map();   // photos and files sent in chat (migration 014)
  const acceptances = [];
  const improvementConsentEvents = [];
  const improvementExamples = [];
  const improvementExampleDeletions = [];
  let improvementConsentSequence = 0;
  const ¶»§q«^