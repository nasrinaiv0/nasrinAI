import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildTestApp, serve, bearer, USER_TOKEN } from './helpers.js';
import { cleanEmail, cleanPhone, cleanTags, cleanValue, readContact, readDeal } from '../src/ncc.js';

const OTHER = 'other.user.token';
const PLAIN = 'plain.user.token';
const users = async (t) => (t === USER_TOKEN ? { id: 'user-1', email: 'owner@business.example' }
  : t === OTHER ? { id: 'user-2', email: 'second@business.example' }
    : t === PLAIN ? { id: 'user-3', email: 'someone@else.example' } : null);
const ON = { NCC_ENABLED: 'true', NCC_ACCOUNTS: 'Owner@Business.example, second@business.example' };
const call = (url, path, method, token, body) => fetch(url + path, {
  method, headers: { ...(token ? bearer(token) : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {})
});
const json = async (r) => ({ status: r.status, body: await r.json() });
const guestToken = async (url) => (await (await fetch(url + '/v1/guest/sessions', { method: 'POST' })).json()).token;

test('NCC fields are checked and cleaned', () => {
  assert.equal(cleanEmail(' Ana@Example.COM '), 'ana@example.com');
  assert.equal(cleanEmail(''), '');
  assert.throws(() => cleanEmail('not an email'), /does not look right/);
  assert.throws(() => cleanEmail('a@b'), /does not look right/);
  assert.equal(cleanPhone('+63 917 123 4567'), '+63 917 123 4567');
  assert.throws(() => cleanPhone('call me'), /does not look right/);
  assert.deepEqual(cleanTags('VIP, vip , Catering,,'), ['vip', 'catering']);
  assert.throws(() => cleanTags(Array.from({ length: 11 }, (_, i) => 't' + i)), /at most 10/);
  assert.equal(cleanValue('25000.5'), 25000.5);
  assert.equal(cleanValue(''), 0);
  assert.throws(() => cleanValue(-1), /from 0 up/);
  assert.throws(() => cleanValue('1e3'), /from 0 up/);
  assert.throws(() => readContact({ email: 'a@b.co' }, true), /name cannot be empty/);
  assert.deepEqual(readContact({ name: ' Ana\u0000 ', company: 'Cafe' }, true), { name: 'Ana', company: 'Cafe' });
  assert.throws(() => readContact({}, false), /Nothing to change/);
  assert.throws(() => readDeal({ title: 'x', contact_id: 'nope' }, true), /not found/);
  assert.throws(() => readDeal({ stage: 'archived' }, false), /Choose lead/);
  assert.throws(() => readDeal({ currency: 'pesos' }, false), /three-letter/);
});

test('NCC is only for accounts the team turned on', async () => {
  const off = buildTestApp({ verifyUser: users });
  const a = await serve(off.app);
  try {
    assert.deepEqual((await json(await call(a.url, '/v1/ncc/status', 'GET', USER_TOKEN))).body.enabled, false);
    assert.equal((await call(a.url, '/v1/ncc', 'GET', USER_TOKEN)).status, 403, 'NCC_ENABLED is off by default');
  } finally { await a.close(); }

  const on = buildTestApp({ verifyUser: users, env: ON });
  const b = await serve(on.app);
  try {
    assert.equal((await json(await call(b.url, '/v1/ncc/status', 'GET', USER_TOKEN))).body.enabled, true);
    assert.equal((await json(await call(b.url, '/v1/ncc/status', 'GET', PLAIN))).body.enabled, false);
    const notListed = await json(await call(b.url, '/v1/ncc', 'GET', PLAIN));
    assert.deepEqual([notListed.status, notListed.body.error?.code ?? notListed.body.code], [403, 'ncc_not_enabled']);
    const guest = await guestToken(b.url);
    assert.equal((await json(await call(b.url, '/v1/ncc/status', 'GET', guest))).body.enabled, false);
    assert.equal((await call(b.url, '/v1/ncc/contacts', 'POST', guest, { name: 'x' })).status, 403);
    assert.equal((await call(b.url, '/v1/ncc', 'GET')).status, 401);
  } finally { await b.close(); }
});

test('NCC contacts and deals: create, duplicates, pipeline, own only, export, delete', async () => {
  const built = buildTestApp({ verifyUser: users, env: { ...ON, NCC_CONTACTS_MAX: '10' } });
  const { url, close } = await serve(built.app);
  try {
    const ana = await json(await call(url, '/v1/ncc/contacts', 'POST', USER_TOKEN, { name: 'Ana Cruz', email: 'Ana@Cafe.example', phone: '+63 917 000 0000', company: 'Cafe', tags: 'vip, catering' }));
    assert.equal(ana.status, 201);
    assert.deepEqual([ana.body.email, ana.body.tags, ana.body.source], ['ana@cafe.example', ['vip', 'catering'], 'manual']);
    const dup = await call(url, '/v1/ncc/contacts', 'POST', USER_TOKEN, { name: 'Ana again', email: 'ANA@cafe.example' });
    assert.equal(dup.status, 409, 'one contact per email');
    const ben = await json(await call(url, '/v1/ncc/contacts', 'POST', USER_TOKEN, { name: 'Ben' }));
    assert.equal((await call(url, '/v1/ncc/contacts/' + ben.body.id, 'PUT', USER_TOKEN, { email: 'ana@cafe.example' })).status, 409, 'an edit cannot copy another contact\'s email');
    const edited = await json(await call(url, '/v1/ncc/contacts/' + ben.body.id, 'PUT', USER_TOKEN, { notes: 'Met at the fair.\nCall in May.' }));
    assert.equal(edited.body.notes, 'Met at the fair.\nCall in May.');

    const deal = await json(await call(url, '/v1/ncc/deals', 'POST', USER_TOKEN, { contact_id: ana.body.id, title: 'Catering for 50', value: '25000' }));
    assert.equal(deal.status, 201);
    assert.deepEqual([deal.body.stage, deal.body.value, deal.body.currency], ['lead', 25000, 'PHP']);
    const moved = await json(await call(url, '/v1/ncc/deals/' + deal.body.id, 'PUT', USER_TOKEN, { stage: 'won' }));
    assert.equal(moved.body.stage, 'won');

    // Another enabled account sees nothing of this one and cannot touch it.
    const theirs = await json(await call(url, '/v1/ncc', 'GET', OTHER));
    assert.deepEqual([theirs.body.contacts.length, theirs.body.deals.length], [0, 0]);
    assert.equal((await call(url, '/v1/ncc/contacts/' + ana.body.id, 'PUT', OTHER, { name: 'x' })).status, 404);
    assert.equal((await call(url, '/v1/ncc/contacts/' + ana.body.id, 'DELETE', OTHER)).status, 404);
    assert.equal((await call(url, '/v1/ncc/deals/' + deal.body.id, 'PUT', OTHER, { stage: 'lost' })).status, 404);
    assert.equal((await call(url, '/v1/ncc/deals', 'POST', OTHER, { contact_id: ana.body.id, title: 'x' })).status, 404, 'a deal only on your own contact');
    assert.equal((await call(url, '/v1/ncc/contacts/same', 'PUT', USER_TOKEN, { name: 'x' })).status, 404);

    // Import: bad rows and repeats are skipped and counted; the limit holds.
    const rows = [{ name: 'Carla', email: 'carla@x.example' }, { name: '' }, { name: 'Ana dup', email: 'ana@cafe.example' }, { name: 'Dan', email: 'bad' },
      ...Array.from({ length: 10 }, (_, i) => ({ name: 'Bulk ' + i }))];
    const imp = await json(await call(url, '/v1/ncc/contacts/import', 'POST', USER_TOKEN, { contacts: rows }));
    assert.deepEqual(imp.body, { added: 8, duplicates: 1, invalid: 2, over_limit: 3 });
    assert.equal((await call(url, '/v1/ncc/contacts', 'POST', USER_TOKEN, { name: 'One more' })).status, 409, 'NCC_CONTACTS_MAX');
    assert.equal((await call(url, '/v1/ncc/contacts/import', 'POST', USER_TOKEN, { contacts: Array(501).fill({ name: 'x' }) })).status, 400);

    const all = await json(await call(url, '/v1/ncc', 'GET', USER_TOKEN));
    assert.equal(all.body.contacts.length, 10);
    assert.deepEqual(all.body.stages, ['lead', 'qualified', 'proposal', 'won', 'lost']);
    const exp = await json(await call(url, '/v1/ncc/export', 'GET', USER_TOKEN));
    assert.equal(exp.body.contacts.length, 10);
    assert.equal(exp.body.deals[0].title, 'Catering for 50');

    // The account export carries NCC too; deleting a contact deletes its deals.
    const account = await json(await call(url, '/v1/account/export', 'GET', USER_TOKEN));
    assert.equal(account.body.ncc.contacts.length, 10);
    assert.equal((await call(url, '/v1/ncc/contacts/' + ana.body.id, 'DELETE', USER_TOKEN)).status, 200);
    assert.equal((await json(await call(url, '/v1/ncc', 'GET', USER_TOKEN))).body.deals.length, 0);

    assert.equal((await call(url, '/v1/ncc/delete-all', 'POST', USER_TOKEN, { confirm: 'yes' })).status, 400);
    assert.equal((await call(url, '/v1/ncc/delete-all', 'POST', USER_TOKEN, { confirm: 'DELETE' })).status, 200);
    assert.equal((await json(await call(url, '/v1/ncc', 'GET', USER_TOKEN))).body.contacts.length, 0);
  } finally { await close(); }
});

test('deleting the account deletes its NCC records', async () => {
  const built = buildTestApp({ verifyUser: users, env: ON });
  const { url, close } = await serve(built.app);
  try {
    const c = await json(await call(url, '/v1/ncc/contacts', 'POST', USER_TOKEN, { name: 'Ana' }));
    await call(url, '/v1/ncc/deals', 'POST', USER_TOKEN, { contact_id: c.body.id, title: 'Deal' });
    await built.store.deleteUserData({ tenantId: '00000000-0000-0000-0000-000000000001', userId: 'user-1' });
    const who = { tenantId: '00000000-0000-0000-0000-000000000001', userId: 'user-1' };
    assert.deepEqual([(await built.store.listNccContacts(who)).length, (await built.store.listNccDeals(who)).length], [0, 0]);
  } finally { await close(); }
});

test('the NCC page talks only to our own API and builds no HTML from data', async () => {
  const js = await readFile(new URL('../public/ncc.js', import.meta.url), 'utf8');
  assert.doesNotMatch(js, /innerHTML|insertAdjacentHTML|outerHTML|document\.write|eval\(|new Function/);
  for (const m of js.matchAll(/api\('([^']+)'/g)) assert.match(m[1], /^\/v1\/ncc/);
  assert.doesNotMatch(js, /https?:\/\//, 'no outside addresses');
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(html, /<script src="\/ncc\.js" defer><\/script>/);
  assert.match(html, /id="pageNcc"/);
});

test('the Supabase store always filters NCC by tenant and user, and reports a repeated email', async () => {
  const { createSupabaseStore } = await import('../src/store/supabase-store.js');
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push({ url, method: init.method, body: init.body });
    if (init.method === 'POST' && url.includes('ncc_contacts') && JSON.parse(init.body).email === 'dup@x.example') return new Response('{"code":"23505"}', { status: 409 });
    return new Response(init.method === 'GET' ? '[]' : '[{"id":"00000000-0000-4000-8000-000000000001","name":"A","email":"","phone":"","company":"","tags":[],"notes":"","source":"manual"}]', { status: 200 });
  };
  const store = createSupabaseStore({ url: 'https://p.supabase.co', serviceKey: 'k', fetchImpl });
  const who = { tenantId: '00000000-0000-0000-0000-000000000001', userId: 'user-1' };
  await store.listNccContacts(who);
  await store.listNccDeals(who);
  await store.updateNccDeal({ ...who, id: '00000000-0000-4000-8000-000000000002', patch: { stage: 'won', contact_id: 'x', user_id: 'evil' } });
  await store.deleteNccData(who);
  for (const s of seen) assert.match(s.url, /tenant_id=eq\.00000000-0000-0000-0000-000000000001&user_id=eq\.user-1/);
  assert.deepEqual(Object.keys(JSON.parse(seen[2].body)).sort(), ['stage', 'updated_at'], 'only known fields are written');
  await assert.rejects(store.createNccContact({ ...who, name: 'Dup', email: 'dup@x.example' }), (e) => e.code === 'duplicate');
  assert.deepEqual(await store.listNccContacts({ ...who, userId: 'bad user!' }), []);
});
