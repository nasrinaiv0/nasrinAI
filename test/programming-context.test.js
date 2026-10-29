import test from 'node:test';
import assert from 'node:assert/strict';
import { formatProgrammingKnowledgeContext, shouldRetrieveProgrammingKnowledge } from '../src/knowledge/programming-context.js';

const platform = 'platform';

test('programming retrieval is limited to platform coding questions without attachments', () => {
  assert.equal(shouldRetrieveProgrammingKnowledge({ tenantId: platform, platformTenantId: platform, query: 'How do I fix this TypeScript error?' }), true);
  assert.equal(shouldRetrieveProgrammingKnowledge({ tenantId: 'customer-tenant', platformTenantId: platform, query: 'How do I fix this TypeScript error?' }), false);
  assert.equal(shouldRetrieveProgrammingKnowledge({ tenantId: platform, platformTenantId: platform, query: 'How do I fix this TypeScript error?', hasAttachments: true }), false);
  assert.equal(shouldRetrieveProgrammingKnowledge({ tenantId: platform, platformTenantId: platform, query: 'My API key is abc123; how do I configure TypeScript?' }), false);
  const tokenLikeValue = ['sk', 'proj', 'a'.repeat(24)].join('-');
  assert.equal(shouldRetrieveProgrammingKnowledge({ tenantId: platform, platformTenantId: platform, query: 'Configure TypeScript with ' + tokenLikeValue }), false);
  assert.equal(shouldRetrieveProgrammingKnowledge({ tenantId: platform, platformTenantId: platform, query: 'Hello there' }), false);
  assert.equal(shouldRetrieveProgrammingKnowledge({ tenantId: platform, platformTenantId: platform, query: 'I want to go out today with friends' }), false);
});

test('programming context only trusts official allowlisted HTTPS sources', () => {
  const good = { url: 'https://www.typescriptlang.org/docs/', title: 'TypeScript docs', text: 'TypeScript is a strongly typed programming language that builds on JavaScript and gives you better tooling at any scale.' };
  const badHost = { ...good, url: 'https://attacker.example/docs/' };
  const http = { ...good, url: 'http://www.typescriptlang.org/docs/' };
  const out = formatProgrammingKnowledgeContext([badHost, http, good]);
  assert.equal(out.sources.length, 1);
  assert.equal(out.sources[0].url, good.url);
  assert.match(out.context, /untrusted reference data/);
  assert.match(out.context, /TypeScript docs/);
});

test('programming context is bounded and safely handles empty or malformed results', () => {
  assert.deepEqual(formatProgrammingKnowledgeContext(null), { context: '', sources: [] });
  const out = formatProgrammingKnowledgeContext([
    { url: 'javascript:alert(1)', title: 'bad', text: 'x'.repeat(2000) },
    { url: 'https://www.typescriptlang.org/docs/', title: 'docs', text: 'x'.repeat(3000) }
  ], { maxChars: 2500 });
  assert.ok(out.context.length < 3000);
  assert.equal(out.sources.length, 1);
});
