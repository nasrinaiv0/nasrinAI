// NCC (Nasrin Client Connect): the enterprise CRM page in Settings → NasrinAI
// Space (docs/ncc.md). Contacts and a deal pipeline, nothing more yet.
//
// - Talks only to our own /v1/ncc API through the app's api() (the signed-in
//   person's token); the server checks every request. The browser is never
//   trusted with access decisions.
// - Builds every element with createElement/textContent: no HTML from data.
// - Import reads a CSV or Excel file here in the browser (public/cleaner.js)
//   and sends only the matched contact fields.
//
// Exposes window.NasrinNcc = { mount({ root, api, inflate }) } -> { load(fresh) }.
(function () {
  'use strict';

  const STAGE_NAMES = { lead: 'Lead', qualified: 'Qualified', proposal: 'Proposal', won: 'Won', lost: 'Lost' };
  // Column names a file may use for each contact field (lower case, no spaces).
  const HEADERS = {
    name: ['name', 'fullname', 'contact', 'contactname', 'customer', 'customername', 'client'],
    first: ['firstname', 'givenname', 'first'],
    last: ['lastname', 'surname', 'familyname', 'last'],
    email: ['email', 'e-mail', 'emailaddress', 'mail'],
    phone: ['phone', 'phonenumber', 'mobile', 'mobilenumber', 'cell', 'contactnumber', 'tel', 'telephone'],
    company: ['company', 'business', 'organization', 'organisation', 'companyname', 'businessname'],
    tags: ['tags', 'tag', 'labels', 'label', 'group'],
    notes: ['notes', 'note', 'remarks', 'comments', 'comment']
  };
  const BATCH = 500;

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = String(text);
    return e;
  }
  function button(text, cls, onClick) {
    const b = el('button', cls || 'btn small', text);
    b.type = 'button';
    if (onClick) b.addEventListener('click', onClick);
    return b;
  }
  function field(label, input) {
    const wrap = el('div', 'ncc-field');
    const l = el('label', 'lib-label', label);
    const id = 'ncc-' + Math.random().toString(36).slice(2, 9);
    input.id = id;
    l.htmlFor = id;
    wrap.append(l, input);
    return wrap;
  }
  function input(value, { max = 120, type = 'text', placeholder = '' } = {}) {
    const i = el('input', 'memory-edit lib-input');
    i.type = type;
    i.maxLength = max;
    i.value = value || '';
    if (placeholder) i.placeholder = placeholder;
    return i;
  }
  const money = (n, cur) => {
    try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur, maximumFractionDigits: 2 }).format(n); } catch { return cur + ' ' + n; }
  };
  const key = (h) => String(h || '').toLowerCase().replace(/[\s_.]+/g, '');

  // A sheet (rows of cells) -> contact objects. The first row with a name or
  // email column is the header; rows without a name are skipped.
  function contactsFromGrid(grid) {
    const rows = grid.map((r) => (r || []).map((c) => String(c ?? '').trim()));
    const headerAt = rows.findIndex((r) => r.some((c) => HEADERS.name.includes(key(c)) || HEADERS.first.includes(key(c)) || HEADERS.email.includes(key(c))));
    if (headerAt < 0) return { contacts: [], skipped: rows.length };
    const head = rows[headerAt].map(key);
    const col = {};
    for (const [f, names] of Object.entries(HEADERS)) col[f] = head.findIndex((h) => names.includes(h));
    const out = [];
    let skipped = 0;
    for (const r of rows.slice(headerAt + 1)) {
      if (!r.some(Boolean)) continue;
      const get = (f) => (col[f] >= 0 ? r[col[f]] || '' : '');
      const name = (get('name') || [get('first'), get('last')].filter(Boolean).join(' ') || get('company')).slice(0, 120);
      if (!name) { skipped++; continue; }
      const c = { name };
      for (const f of ['email', 'phone', 'company', 'tags', 'notes']) if (get(f)) c[f] = get(f);
      out.push(c);
    }
    return { contacts: out, skipped };
  }

  function mount({ root, api, inflate }) {
    let data = { contacts: [], deals: [], stages: Object.keys(STAGE_NAMES), limits: {} };
    let tab = 'contacts';
    let query = '';
    const status = el('p', 'signin-status ncc-status');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    const body = el('div', 'ncc-body');
    const tabs = el('div', 'ncc-tabs');
    tabs.setAttribute('role', 'tablist');
    const tabButtons = {};
    for (const [k, label] of [['contacts', 'Contacts'], ['pipeline', 'Pipeline'], ['data', 'Import & export']]) {
      const b = button(label, 'ncc-tab', () => { tab = k; say(''); render(); });
      b.setAttribute('role', 'tab');
      tabButtons[k] = b;
      tabs.append(b);
    }
    root.replaceChildren(tabs, status, body);

    const say = (t) => { status.textContent = t || ''; };
    const fail = (err) => say(err && err.message ? err.message : 'Something went wrong. Please try again.');
    const contactName = (id) => (data.contacts.find((c) => c.id === id) || {}).name || 'Unknown contact';

    // Reloads everything; a message set just before (like "Saved.") stays.
    // fresh: opening the page (starts on Contacts, with no old message).
    async function load(fresh = false) {
      if (fresh) { say(''); tab = 'contacts'; query = ''; }
      const loading = !status.textContent;
      if (loading) say('Loading…');
      try {
        data = await api('/v1/ncc');
        if (loading) say('');
      } catch (err) { fail(err); }
      render();
    }

    function render() {
      for (const [k, b] of Object.entries(tabButtons)) { b.setAttribute('aria-selected', String(k === tab)); b.classList.toggle('on', k === tab); }
      if (tab === 'contacts') renderContacts();
      else if (tab === 'pipeline') renderPipeline();
      else renderData();
    }

    // ---------- contacts ----------
    function renderContacts() {
      const tools = el('div', 'lib-tools');
      const search = input(query, { max: 120, type: 'search', placeholder: 'Search contacts' });
      search.setAttribute('aria-label', 'Search contacts');
      const list = el('ul', 'history-list ncc-list');
      const fill = () => {
        const q = query.toLowerCase();
        const shown = data.contacts.filter((c) => !q || [c.name, c.email, c.phone, c.company, c.tags.join(' ')].some((v) => String(v).toLowerCase().includes(q)));
        list.replaceChildren(...shown.map((c) => {
          const li = el('li');
          const b = button('', 'ncc-row', () => editContact(c));
          b.append(el('strong', '', c.name), el('span', 'setting-hint', [c.company, c.email || c.phone].filter(Boolean).join(' · ')));
          if (c.tags.length) b.append(el('span', 'ncc-tags', c.tags.join(', ')));
          li.append(b);
          return li;
        }));
        if (!shown.length) list.append(el('li', 'setting-hint ncc-empty', data.contacts.length ? 'No contacts match.' : 'No contacts yet. Add one, or import a file.'));
      };
      search.addEventListener('input', () => { query = search.value; fill(); });
      tools.append(button('Add contact', 'btn small', () => editContact(null)), search);
      body.replaceChildren(tools, el('p', 'setting-hint', `${data.contacts.length} of ${data.limits.contacts || '…'} contacts`), list);
      fill();
    }

    function editContact(c) {
      const form = el('form', 'ncc-form');
      const back = button('‹ Contacts', 'text-btn lib-back', () => render());
      const name = input(c && c.name, { max: 120 });
      name.required = true;
      const email = input(c && c.email, { max: 254, type: 'email' });
      const phone = input(c && c.phone, { max: 40, type: 'tel' });
      const company = input(c && c.company, { max: 120 });
      const tags = input(c && c.tags.join(', '), { max: 340, placeholder: 'vip, catering' });
      const notes = el('textarea', 'memory-edit lib-text short');
      notes.maxLength = 4000;
      notes.rows = 4;
      notes.value = (c && c.notes) || '';
      const actions = el('div', 'lib-tools');
      const save = el('button', 'btn small', c ? 'Save' : 'Add contact');
      save.type = 'submit';
      actions.append(save);
      if (c) {
        actions.append(button('Add deal', 'btn small outline', () => editDeal(null, c.id)));
        actions.append(button('Delete', 'btn small outline danger', async () => {
          if (!window.confirm(`Delete ${c.name} and their deals?`)) return;
          try { await api('/v1/ncc/contacts/' + encodeURIComponent(c.id), { method: 'DELETE' }); say('Contact deleted.'); await load(); } catch (err) { fail(err); }
        }));
      }
      form.append(back, field('Name', name), field('Email', email), field('Phone', phone), field('Company', company), field('Tags (separated by commas)', tags), field('Notes', notes), actions);
      if (c) {
        const deals = data.deals.filter((d) => d.contact_id === c.id);
        if (deals.length) {
          form.append(el('p', 'menu-label', 'Deals'));
          const ul = el('ul', 'history-list');
          for (const d of deals) {
            const li = el('li');
            const b = button('', 'ncc-row', () => editDeal(d));
            b.append(el('strong', '', d.title), el('span', 'setting-hint', STAGE_NAMES[d.stage] + ' · ' + money(d.value, d.currency)));
            li.append(b);
            ul.append(li);
          }
          form.append(ul);
        }
      }
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const payload = { name: name.value, email: email.value, phone: phone.value, company: company.value, tags: tags.value, notes: notes.value };
        save.disabled = true;
        try {
          if (c) await api('/v1/ncc/contacts/' + encodeURIComponent(c.id), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
          else await api('/v1/ncc/contacts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
          say(c ? 'Saved.' : 'Contact added.');
          await load();
        } catch (err) { fail(err); save.disabled = false; }
      });
      body.replaceChildren(form);
      name.focus();
    }

    // ---------- pipeline ----------
    function renderPipeline() {
      const tools = el('div', 'lib-tools');
      tools.append(button('Add deal', 'btn small', () => editDeal(null)));
      const board = el('div', 'ncc-board');
      for (const stage of data.stages) {
        const deals = data.deals.filter((d) => d.stage === stage);
        const col = el('section', 'ncc-col');
        col.setAttribute('aria-label', STAGE_NAMES[stage]);
        const totals = {};
        for (const d of deals) totals[d.currency] = (totals[d.currency] || 0) + d.value;
        const head = el('div', 'ncc-col-head');
        head.append(el('strong', '', STAGE_NAMES[stage] + ' · ' + deals.length), el('span', 'setting-hint', Object.entries(totals).map(([cur, n]) => money(n, cur)).join(' + ') || '—'));
        col.append(head);
        for (const d of deals) {
          const card = el('div', 'ncc-card');
          const open = button('', 'ncc-card-open', () => editDeal(d));
          open.append(el('strong', '', d.title), el('span', 'setting-hint', contactName(d.contact_id)), el('span', 'ncc-value', money(d.value, d.currency)));
          const move = el('select', 'lib-select ncc-move');
          move.setAttribute('aria-label', 'Move ' + d.title + ' to a stage');
          for (const s of data.stages) { const o = el('option', '', STAGE_NAMES[s]); o.value = s; o.selected = s === d.stage; move.append(o); }
          move.addEventListener('change', async () => {
            move.disabled = true;
            try { await api('/v1/ncc/deals/' + encodeURIComponent(d.id), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stage: move.value }) }); say(`Moved to ${STAGE_NAMES[move.value]}.`); await load(); } catch (err) { fail(err); move.disabled = false; }
          });
          card.append(open, move);
          col.append(card);
        }
        board.append(col);
      }
      body.replaceChildren(tools, board);
      if (!data.contacts.length) body.insertBefore(el('p', 'setting-hint', 'Add a contact first: every deal belongs to a contact.'), board);
    }

    function editDeal(d, contactId) {
      if (!d && !data.contacts.length) { tab = 'contacts'; render(); say('Add a contact first: every deal belongs to a contact.'); return; }
      const form = el('form', 'ncc-form');
      const back = button(d || !contactId ? '‹ Pipeline' : '‹ Contacts', 'text-btn lib-back', () => render());
      const title = input(d && d.title, { max: 120 });
      title.required = true;
      const who = el('select', 'lib-select');
      for (const c of [...data.contacts].sort((a, b) => a.name.localeCompare(b.name))) {
        const o = el('option', '', c.name + (c.company ? ' · ' + c.company : ''));
        o.value = c.id;
        o.selected = c.id === (d ? d.contact_id : contactId);
        who.append(o);
      }
      if (d) who.disabled = true;
      const stage = el('select', 'lib-select');
      for (const s of data.stages) { const o = el('option', '', STAGE_NAMES[s]); o.value = s; o.selected = s === (d ? d.stage : 'lead'); stage.append(o); }
      const value = input(d ? String(d.value) : '', { max: 16, placeholder: '0' });
      value.inputMode = 'decimal';
      const currency = input(d ? d.currency : 'PHP', { max: 3 });
      const actions = el('div', 'lib-tools');
      const save = el('button', 'btn small', d ? 'Save' : 'Add deal');
      save.type = 'submit';
      actions.append(save);
      if (d) actions.append(button('Delete', 'btn small outline danger', async () => {
        if (!window.confirm(`Delete the deal "${d.title}"?`)) return;
        try { await api('/v1/ncc/deals/' + encodeURIComponent(d.id), { method: 'DELETE' }); say('Deal deleted.'); await load(); } catch (err) { fail(err); }
      }));
      form.append(back, field('Deal', title), field('Contact', who), field('Stage', stage), field('Value', value), field('Currency', currency), actions);
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const payload = { title: title.value, stage: stage.value, value: value.value.replace(/,/g, '').trim(), currency: currency.value };
        save.disabled = true;
        try {
          if (d) await api('/v1/ncc/deals/' + encodeURIComponent(d.id), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
          else await api('/v1/ncc/deals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, contact_id: who.value }) });
          tab = 'pipeline';
          say(d ? 'Saved.' : 'Deal added.');
          await load();
        } catch (err) { fail(err); save.disabled = false; }
      });
      body.replaceChildren(form);
      title.focus();
    }

    // ---------- import, export, delete ----------
    function renderData() {
      const wrap = el('div', 'ncc-data');
      // Import
      const file = el('input');
      file.type = 'file';
      file.accept = '.csv,.tsv,.xlsx,.xlsm';
      const preview = el('p', 'setting-hint');
      const add = button('Add contacts', 'btn small', null);
      add.hidden = true;
      let ready = [];
      file.addEventListener('change', async () => {
        ready = [];
        add.hidden = true;
        preview.textContent = '';
        const f = file.files && file.files[0];
        if (!f) return;
        if (!window.NasrinCleaner) { preview.textContent = 'Import is not available in this browser.'; return; }
        try {
          const bytes = new Uint8Array(await f.arrayBuffer());
          const sheets = await window.NasrinCleaner.read({ name: f.name, bytes }, inflate);
          const { contacts, skipped } = contactsFromGrid((sheets[0] && sheets[0].grid) || []);
          ready = contacts;
          preview.textContent = contacts.length
            ? `Found ${contacts.length} contacts${skipped ? ` (${skipped} rows without a name are left out)` : ''}. Columns used: name, email, phone, company, tags and notes when present.`
            : 'No contacts found. The file needs a header row with a Name (or First name) or Email column.';
          add.textContent = `Add ${contacts.length} contacts`;
          add.hidden = !contacts.length;
        } catch (err) { preview.textContent = err && err.message ? err.message : 'That file could not be read.'; }
      });
      add.addEventListener('click', async () => {
        add.disabled = true;
        const total = { added: 0, duplicates: 0, invalid: 0, over_limit: 0 };
        try {
          for (let i = 0; i < ready.length; i += BATCH) {
            say(`Adding contacts… ${Math.min(i + BATCH, ready.length)} of ${ready.length}`);
            const r = await api('/v1/ncc/contacts/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contacts: ready.slice(i, i + BATCH) }) });
            for (const k of Object.keys(total)) total[k] += r[k] || 0;
          }
          await load();
          tab = 'data';
          render();
          say(`Added ${total.added}.` + (total.duplicates ? ` ${total.duplicates} already there (same email).` : '') + (total.invalid ? ` ${total.invalid} not valid.` : '') + (total.over_limit ? ` ${total.over_limit} over the contact limit.` : ''));
        } catch (err) { fail(err); add.disabled = false; }
      });
      wrap.append(el('p', 'menu-label', 'Import contacts'), el('p', 'setting-hint', 'A CSV or Excel file with a header row. It is read on this device; only names, emails, phones, companies, tags and notes are sent.'), file, preview, add);

      // Export
      wrap.append(el('p', 'menu-label', 'Export'), el('p', 'setting-hint', 'Every contact and deal, as a JSON file.'), button('Export NCC data', 'btn small outline', async () => {
        try {
          const out = await api('/v1/ncc/export');
          const url = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' }));
          const a = el('a');
          a.href = url;
          a.download = 'ncc-export.json';
          document.body.append(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 2000);
        } catch (err) { fail(err); }
      }));

      // Delete everything
      const confirmBox = input('', { max: 6, placeholder: 'Type DELETE' });
      confirmBox.setAttribute('aria-label', 'Type DELETE to confirm');
      wrap.append(el('p', 'menu-label', 'Delete all NCC data'), el('p', 'setting-hint', 'Deletes every contact and deal in your NCC. This cannot be undone.'), confirmBox, button('Delete all', 'btn small outline danger', async () => {
        if (confirmBox.value !== 'DELETE') { say('Type DELETE to confirm.'); return; }
        try { await api('/v1/ncc/delete-all', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: 'DELETE' }) }); say('All NCC data deleted.'); await load(); } catch (err) { fail(err); }
      }));
      body.replaceChildren(wrap);
    }

    return { load };
  }

  window.NasrinNcc = { mount, contactsFromGrid };
})();
