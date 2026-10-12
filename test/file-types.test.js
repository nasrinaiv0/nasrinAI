import { test } from 'node:test';
import assert from 'node:assert/strict';
import { documentFiles, htmlToDoc } from '../src/ai/file-types.js';
import { buildSystemPrompt } from '../src/ai/prompt.js';
import { createFakeProvider } from '../src/ai/fake.js';
import { buildTestApp, serve, bearer, postJson, USER_TOKEN } from './helpers.js';

// 2026-10-12: a meal plan and shopping list arrived as an .html download.
const HTML_PLAN = 'Here is your plan.\n[[file name="Dinner_Plan.html"]]\n<!DOCTYPE html><html><head><title>x</title><style>h1{}</style></head><body><h1>Dinner Plan</h1><p>Sheet pan <b>chicken</b>.</p><ul><li>Rice</li><li>Beans</li></ul></body></html>\n[[/file]]';

test('a document handed over as .html becomes a .pdf in the reply format', () => {
  const out = documentFiles(HTML_PLAN, 'meal plan for 5 people with a shopping list');
  assert.match(out, /\[\[file name="Dinner_Plan\.pdf"\]\]/);
  assert.match(out, /## Dinner Plan[\s\S]*Sheet pan \*\*chicken\*\*\.[\s\S]*- Rice\n- Beans/);
  assert.doesNotMatch(out, /<[a-z!]/i);
  assert.equal(htmlToDoc('<h3>Tip</h3><table><tr><td>Egg</td><td>12</td></tr></table>'), '### Tip\n\nEgg · 12');
});

test('coding work and asked-for web pages keep their .html file', () => {
  for (const asked of ['make me a landing page', 'write the html for my site', 'fix this javascript code']) {
    assert.equal(documentFiles(HTML_PLAN, asked), HTML_PLAN, asked);
  }
  const pdf = 'Done.\n[[file name="plan.pdf"]]\n## Plan\n[[/file]]';
  assert.equal(documentFiles(pdf, 'meal plan'), pdf);
});

test('the prompt makes documents PDFs and keeps .html for coding', () => {
  const p = buildSystemPrompt({ blocks: true });
  assert.match(p, /Documents \(plans, meal plans[^)]*\) are \.pdf/);
  assert.match(p, /\.html, \.css, \.js and other code extensions only for coding work/);
});

test('chat: the saved reply carries the .pdf, not the .html', async () => {
  const provider = createFakeProvider({ reply: () => HTML_PLAN });
  const built = buildTestApp({ provider });
  const srv = await serve(built.app);
  try {
    const r = await (await postJson(srv.url + '/v1/chat', { message: 'Make a dinner plan and shopping list for 5 people' }, bearer(USER_TOKEN))).json();
    assert.match(r.message.content, /Dinner_Plan\.pdf/);
    assert.doesNotMatch(r.message.content, /Dinner_Plan\.html|<body>/);
  } finally { await srv.close(); }
});
