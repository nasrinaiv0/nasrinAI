import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { grade } from '../scripts/eval/run.js';

const suite = JSON.parse(readFileSync(new URL('../scripts/eval/suites/coding.json', import.meta.url), 'utf8'));
const re = (src) => (src.startsWith('(?i)') ? new RegExp(src.slice(4), 'i') : new RegExp(src));

test('coding benchmark: versioned, unique ids, every case has a checkable outcome', () => {
  assert.equal(suite.name, 'coding');
  assert.match(suite.version, /^\d{4}-\d{2}-\d{2}-v\d+$/);
  assert.ok(suite.cases.length >= 8 && suite.cases.length <= 12, 'small enough for guest limits');
  assert.equal(new Set(suite.cases.map((c) => c.id)).size, suite.cases.length);
  for (const c of suite.cases) {
    assert.ok(c.message && c.mustMatch?.length, c.id + ' needs mustMatch');
    for (const m of c.mustMatch) re(m);   // every pattern compiles
  }
});

test('coding benchmark: right answers pass and wrong ones fail', () => {
  const byId = Object.fromEntries(suite.cases.map((c) => [c.id, c]));
  assert.deepEqual(grade(byId['js-map-join'], 'It prints 2-4-6.'), []);
  assert.notDeepEqual(grade(byId['js-map-join'], 'It prints 1-2-3.'), []);
  assert.deepEqual(grade(byId['bat-and-ball'], 'The ball costs $0.05.'), []);
  assert.notDeepEqual(grade(byId['bat-and-ball'], 'The ball costs $0.10.'), []);
  assert.deepEqual(grade(byId.syllogism, 'Yes, by transitivity.'), []);
  assert.notDeepEqual(grade(byId.syllogism, 'No.'), []);
  assert.deepEqual(grade(byId['sql-group-by'], 'SELECT status, COUNT(*) FROM orders GROUP BY status;'), []);
});

test('coding benchmark can be run from the manual live-evaluation workflow', () => {
  const wf = readFileSync(new URL('../.github/workflows/manual-live-evaluations.yml', import.meta.url), 'utf8');
  assert.match(wf, /- coding\n/);
  assert.match(wf, /--suite coding --url https:\/\/www\.nasrinai\.com/);
});
