import test from 'node:test';
import assert from 'node:assert/strict';
import { createGoogleIntegration } from '../src/google/index.js';

test('Google integration stays disabled without dedicated credentials', () => {
  const oldId=process.env.GOOGLE_INTEGRATION_CLIENT_ID;
  const oldSecret=process.env.GOOGLE_INTEGRATION_CLIENT_SECRET;
  delete process.env.GOOGLE_INTEGRATION_CLIENT_ID;
  delete process.env.GOOGLE_INTEGRATION_CLIENT_SECRET;
  try {
    const integration=createGoogleIntegration({config:{publicUrl:'https://nasrinai.com',connectors:{key:Buffer.alloc(32,1)} ,supabaseUrl:'https://example.supabase.co',supabaseSecretKey:'test'},fetchImpl:async()=>{throw new Error('must not call network')}});
    assert.equal(integration.available,false);
    assert.ok(Array.isArray(integration.routes));
  } finally {
    if(oldId===undefined) delete process.env.GOOGLE_INTEGRATION_CLIENT_ID; else process.env.GOOGLE_INTEGRATION_CLIENT_ID=oldId;
    if(oldSecret===undefined) delete process.env.GOOGLE_INTEGRATION_CLIENT_SECRET; else process.env.GOOGLE_INTEGRATION_CLIENT_SECRET=oldSecret;
  }
});
