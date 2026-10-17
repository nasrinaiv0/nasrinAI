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


test('Google integration exposes read-only Gmail and Calendar tools to signed-in users', () => {
  const oldId=process.env.GOOGLE_INTEGRATION_CLIENT_ID;
  const oldSecret=process.env.GOOGLE_INTEGRATION_CLIENT_SECRET;
  delete process.env.GOOGLE_INTEGRATION_CLIENT_ID;
  delete process.env.GOOGLE_INTEGRATION_CLIENT_SECRET;
  try {
    const integration=createGoogleIntegration({config:{publicUrl:'https://nasrinai.com',connectors:{key:Buffer.alloc(32,1)},supabaseUrl:'https://example.supabase.co',supabaseSecretKey:'test'},fetchImpl:async()=>{throw new Error('must not call network')}});
    const gmail=integration.tools.find((tool)=>tool.name==='google_gmail_search');
    const calendar=integration.tools.find((tool)=>tool.name==='google_calendar_events');
    const createEvent=integration.tools.find((tool)=>tool.name==='google_calendar_create_event');
    assert.ok(gmail);
    assert.ok(calendar);
    assert.ok(createEvent);
    assert.equal(gmail.risk,'read');
    assert.equal(calendar.risk,'read');
    assert.equal(createEvent.risk,'write');
    assert.deepEqual(gmail.who,['user']);
    assert.deepEqual(calendar.who,['user']);
    assert.deepEqual(createEvent.who,['user']);
    assert.match(gmail.description,/read-only/i);
    assert.match(calendar.description,/read-only/i);
    assert.match(createEvent.description,/explicitly confirmed/i);
  } finally {
    if(oldId===undefined) delete process.env.GOOGLE_INTEGRATION_CLIENT_ID; else process.env.GOOGLE_INTEGRATION_CLIENT_ID=oldId;
    if(oldSecret===undefined) delete process.env.GOOGLE_INTEGRATION_CLIENT_SECRET; else process.env.GOOGLE_INTEGRATION_CLIENT_SECRET=oldSecret;
  }
});
