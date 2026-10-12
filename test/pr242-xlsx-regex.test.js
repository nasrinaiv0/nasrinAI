import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../public/files.js', import.meta.url), 'utf8');

test('PR #242 worksheet marker regex recognizes named worksheet blocks', () => {
  const line = source.split('\n').find((value) => value.includes('const marker ='));
  assert.ok(line);
  const literal = line.slice(line.indexOf('=') + 1, line.lastIndexOf(';')).trim();
  const marker = vm.runInNewContext(`(${literal})`);
  const input = '[[sheet name="Customers"]]\nName,Amount\nAda,12\n[[/sheet]]';
  const match = marker.exec(input);
  assert.ok(match, 'named worksheet marker must match');
  assert.equal(match[1], 'Customers');
  assert.match(match[2], /Name,Amount/);
});

test('PR #242 worksheet marker regex supports multiple tabs and rejects malformed markers', () => {
  const line = source.split('\n').find((value) => value.includes('const marker ='));
  const literal = line.slice(line.indexOf('=') + 1, line.lastIndexOf(';')).trim();
  const marker = vm.runInNewContext(`(${literal})`);
  const input = '[[sheet name="One"]]A,B[[/sheet]]\n[[sheet name="Two"]]C,D[[/sheet]]';
  assert.deepEqual(Array.from(input.matchAll(marker), (match) => match[1]), ['One', 'Two']);
  assert.equal(marker.test('[[sheet name=One]]A,B[[/sheet]]'), false);
});

test('PR #242 numeric-cell regex recognizes numbers but preserves leading-zero identifiers', () => {
  const lines = source.split('\n');
  const line = lines.find((value) => value.includes('test(v)') && value.includes('return `<c r='));
  assert.ok(line, 'numeric-cell condition exists in workbook builder');
  const condition = line.trim().replace(/^if\s*\(/, '').replace(/\)\s*return.*$/, '');
  const predicates = condition.split(' && ').map((part) => vm.runInNewContext(`(${part})`));
  const numeric = (v) => predicates[0].test(v) && predicates[1].test(v);
  for (const value of ['0', '12', '-12', '12.50', '999999999999999']) assert.equal(numeric(value), true, value);
  for (const value of ['0012', '-01', 'abc', '1.2.3', '1234567890123456']) assert.equal(numeric(value), false, value);
});
