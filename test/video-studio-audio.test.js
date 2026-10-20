import test from 'node:test';
import assert from 'node:assert/strict';
import { createElevenLabs } from '../src/elevenlabs.js';
import { PLATFORM_TENANT_ID } from '../src/tenants.js';
import { buildTestApp, serve, bearer, postJson, USER_TOKEN } from './helpers.js';

const OTHER_TOKEN = 'other.header.signature';
process.env.ELEVENLABS_CREDENTIALS_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('hex');
const TEST_ELEVENLABS_KEY = 'sk_test_' + 'x'.repeat(32);

function fakeElevenLabs() {
  return createElevenLabs({
    apiKey: 'test-key',
    fetchImpl: async (url) => {
      if (url.endsWith('/v1/voices?page_size=100')) {
        return new Response(JSON.stringify({ voices: [{ voice_id: 'voice_123', name: 'Studio Voice', category: 'premade' }] }), {
          status: 200, headers: { 'content-type': 'application/json' }
        });
      }
      return new Response(Buffer.from('fake-mp3-bytes'), { status: 200, headers: { 'content-type': 'audio/mpeg' } });
    }
  });
}

async function app() {
  const built = buildTestApp({
    env: { PLANS_ENABLED: 'false' },
    elevenlabs: fakeElevenLabs(),
    verifyUser: async (token) => token === USER_TOKEN ? { id: 'user-1' } : token === OTHER_TOKEN ? { id: 'user-2' } : null
  });
  const server = await serve(built.app);
  const connected = await fetch(server.url + '/v1/video-studio/elevenlabs/connection', {
    method: 'PUT', headers: { ...bearer(USER_TOKEN), 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: TEST_ELEV¶»§q«^