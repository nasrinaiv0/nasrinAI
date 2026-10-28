import test from 'node:test';
import assert from 'node:assert/strict';
import { PROGRAMMING_DOC_SOURCES } from '../src/knowledge/programming-sources.js';

test('programming knowledge seeds are unique HTTPS official documentation roots', () => {
  assert.ok(PROGRAMMING_DOC_SOURCES.length >= 15);
  assert.equal(new Set(PROGRAMMING_DOC_SOURCES).size, PROGRAMMING_DOC_SOURCES.length);
  for (const raw of PROGRAMMING_DOC_SOURCES) {
    const url = new URL(raw);
    assert.equal(url.protocol, 'https:');
    assert.equal(url.username, '');
    assert.equal(url.password, '');
    assert.ok(!url.search);
    assert.ok(!url.hash);
  }
});

test('programming knowledge registry covers core languages and web stack', () => {
  const hosts = new Set(PROGRAMMING_DOC_SOURCES.map((raw) => new URL(raw).hostname));
  for (const host of [
    'www.typescriptlang.org', 'docs.python.org', 'www.postgresql.org',
    'react.dev', 'nextjs.org', 'nodejs.org', 'go.dev',
    'doc.rust-lang.org', 'www.swift.org', 'kotlinlang.org'
  ]) assert.ok(hosts.has(host), `missing documentation host: ${host}`);
});
