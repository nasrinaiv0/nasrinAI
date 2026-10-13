// NCC automations: the list and the step editor (When -> If -> Then), like
// a small n8n. docs/ncc.md. The server checks every part again
// (src/ncc-automations.js); this page only helps build it.
//
// Exposes window.NCCAutomations = { renderList(view), edit(automation|null) }.
(function () {
  'use strict';

  const FIELD_LABELS = {
    'contact.tags': 'Contact tags', 'contact.company': 'Company', 'contact.email': 'Email', 'contact.phone': 'Phone',
    'contact.source': 'How it was added', 'deal.value': 'Deal value', 'deal.stage': 'Deal stage'
  };
  const OP_LABELS = { has: 'has the tag', not_has: "doesn't have the tag", equals: 'is', contains: 'contains', is_set: 'is filled in', not_set: 'is empty', gte: 'is at least', lte: 'is at most' };
  const PARAM_LABELS = { tag: 'Tag', title: 'Name', due_days: 'Due in (days)', text: 'Note', value: 'Value', stage: 'Stage' };

  const TEMPLATES = [
    { name: 'Welcome new contacts', about: 'Tag them "new" and plan a call for tomorrow.', trigger: { type: 'contact_created' }, conditions: [],
      actions: [{ type: 'add_tag', tag: 'new' }, { type: 'create_task', title: 'Call {{contact.first_name}}', due_days: 1 }] },
    { name: 'Won deal: thank the customer', about: 'Tag "customer", add a thank-you task and a note.', trigger: { type: 'deal_stage', stage: 'won' }, conditions: [],
      actions: [{ type: 'add_tag', tag: 'customer' }, { type: 'remove_tag', tag: 'new' }, { type: 'create_task', title: 'Thank {{contact.name}} for {{deal.title}}', due_days: 0 }, { type: 'add_note', text: 'Won: {{deal.title}}.' }] },
    { name: 'VIP gets a deal', about: 'When a contact is tagged "vip", open a deal and reach out today.', trigger: { type: 'tag_added', tag: 'vip' }, conditions: [],
      actions: [{ type: 'create_deal', title: 'VIP: {{contact.name}}', value: 0 }, { type: 'create_task', title: 'Reach out to {{contact.first_name}}', due_days: 0 }] }
  ];

  const N = () => window.NCC;

  function triggerText(t, cat) {
    const base = (cat.triggers.find((x) => x.type === t.type) || {}).label || t.type;
    if (t.type === 'tag_added') return `${base}: ${t.tag}`;
    if (t.type === 'deal_stage') return `${base}: ${N().STAGE_NAMES[t.stage] || t.stage}`;
    return base;
  }
  function actionText(a, cat) {
    const base = (cat.actions.find((x) => x.type === a.type) || {}).label || a.type;
    if (a.tag) return `${base}: ${a.tag}`;
    if (a.stage) return `${base}: ${N().STAGE_NAMES[a.stage]}`;
    if (a.title) return `${base}: ${a.title}`;
    return base;
  }

  function renderList(v) {
    const { el, button, toast, fail, api, reload, data } = N();
    const cat = data.catalog;
    if (data.automations.length < 3) {
      v.append(el('p', 'group-label', 'Start from a ready-made automation'));
      const tl = el('div', 'templates');
      for (const t of TEMPLATES) {
        const b = button('', 'template', () => edit({ ...structuredClone(t), enabled: true }, true));
        b.append(el('strong', '', t.name), el('span', '', t.about));
        tl.append(b);
      }
      v.append(tl);
    }
    if (!data.automations.length) {
      const e = el('div', 'card empty');
      e.append(el('strong', '', 'No automations yet'), el('span', '', 'An automation does the routine work for you: when something happens, it tags, plans tasks, adds notes or moves deals.'));
      v.append(e);
      return;
    }
    v.append(el('p', 'group-label', `Your automations · ${data.automations.length}`));
    const grid = el('div', 'autos');
    for (const a of data.automations) {
      const card = el('article', 'auto card');
      const head = el('div', 'auto-head');
      const sw = el('input', 'switch');
      sw.type = 'checkbox';
      sw.checked = a.enabled;
      sw.setAttribute('aria-label', (a.enabled ? 'Turn off ' : 'Turn on ') + a.name);
      sw.addEventListener('change', async () => {
        sw.disabled = true;
        try { await api('/v1/ncc/automations/' + encodeURIComponent(a.id), { method: 'PUT', body: { enabled: sw.checked } }); await reload(); toast(sw.checked ? 'Automation on.' : 'Automation off.'); } catch (err) { fail(err); sw.checked = !sw.checked; sw.disabled = false; }
      });
      head.append(el('strong', '', a.name), sw);
      const flow = el('div', 'auto-flow');
      flow.append(el('span', 'chip', triggerText(a.trigger, cat)), el('span', 'arrow', '→'));
      if (a.conditions.length) flow.append(el('span', 'chip', `${a.conditions.length} condition${a.conditions.length > 1 ? 's' : ''}`), el('span', 'arrow', '→'));
      a.actions.forEach((s, i) => { if (i) flow.append(el('span', 'arrow', '·')); flow.append(el('span', 'chip', actionText(s, cat))); });
      const meta = el('p', 'auto-meta', a.runs ? `Ran ${a.runs} time${a.runs > 1 ? 's' : ''} · last ${N().when(a.last_run_at)}${a.last_result ? ' · ' + a.last_result : ''}` : (a.enabled ? 'On. Waiting for its first run.' : 'Off.'));
      const foot = el('div', 'auto-foot');
      foot.append(button('Edit', 'btn small', () => edit(a)));
      card.append(head, flow, meta, foot);
      grid.append(card);
    }
    v.append(grid);
  }

  // The editor. auto: a saved automation, a template, or null (new).
  function edit(auto, fromTemplate = false) {
    const { el, button, iconButton, field, input, select, textarea, toast, fail, api, openSheet, closeSheet, reload, data } = N();
    const cat = data.catalog;
    const saved = auto && auto.id && !fromTemplate ? auto : null;
    const state = structuredClone({
      name: auto?.name || '',
      enabled: auto ? auto.enabled !== false : true,
      trigger: auto?.trigger || { type: 'contact_created' },
      conditions: auto?.conditions || [],
      actions: auto?.actions?.length ? auto.actions : [{ type: 'create_task', title: 'Follow up with {{contact.first_name}}', due_days: 1 }]
    });
    const stages = data.stages.map((s) => [s, N().STAGE_NAMES[s]]);
    const root = el('form', 'flow');

    function draw() {
      root.replaceChildren();
      // Name and on/off
      const name = input(state.name, { max: 100, required: true, placeholder: 'Welcome new contacts' });
      name.addEventListener('input', () => { state.name = name.value; });
      const onRow = el('div', 'row');
      const sw = el('input', 'switch');
      sw.type = 'checkbox';
      sw.checked = state.enabled;
      sw.id = 'autoOn';
      sw.addEventListener('change', () => { state.enabled = sw.checked; });
      const swl = el('label', '', 'On');
      swl.htmlFor = 'autoOn';
      onRow.append(field('Name', name), sw, swl);
      root.append(onRow);

      // WHEN
      const when = el('section', 'node when');
      const wh = el('div', 'node-head');
      wh.append(el('span', 'node-badge', 'WHEN'), el('strong', '', 'This happens'));
      const trig = select(cat.triggers.map((t) => [t.type, t.label]), state.trigger.type);
      trig.setAttribute('aria-label', 'What starts the automation');
      trig.addEventListener('change', () => {
        state.trigger = { type: trig.value };
        if (trig.value === 'tag_added') state.trigger.tag = 'vip';
        if (trig.value === 'deal_stage') state.trigger.stage = 'won';
        draw();
      });
      when.append(wh, field('Trigger', trig));
      if (state.trigger.type === 'tag_added') {
        const tg = input(state.trigger.tag || '', { max: 30, required: true, placeholder: 'vip' });
        tg.addEventListener('input', () => { state.trigger.tag = tg.value; });
        when.append(field('Tag', tg));
      }
      if (state.trigger.type === 'deal_stage') {
        const st = select(stages, state.trigger.stage || 'won');
        st.addEventListener('change', () => { state.trigger.stage = st.value; });
        when.append(field('Stage', st));
      }
      root.append(when, el('div', 'link'));

      // IF
      const iff = el('section', 'node');
      const ih = el('div', 'node-head');
      ih.append(el('span', 'node-badge', 'IF'), el('strong', '', state.conditions.length ? 'All of these match' : 'Every time (no conditions)'));
      iff.append(ih);
      state.conditions.forEach((c, i) => {
        const row = el('div', 'cond');
        const f = select(cat.fields.map((x) => [x.field, FIELD_LABELS[x.field] || x.field]), c.field);
        f.setAttribute('aria-label', `Condition ${i + 1}: field`);
        const ops = (cat.fields.find((x) => x.field === c.field) || { ops: [] }).ops;
        const op = select(ops.map((o) => [o, OP_LABELS[o] || o]), c.op);
        op.setAttribute('aria-label', `Condition ${i + 1}: comparison`);
        f.addEventListener('change', () => { const o = (cat.fields.find((x) => x.field === f.value) || { ops: ['equals'] }).ops[0]; state.conditions[i] = { field: f.value, op: o, value: '' }; draw(); });
        op.addEventListener('change', () => { c.op = op.value; draw(); });
        let val;
        if (c.op === 'is_set' || c.op === 'not_set') val = el('span');
        else if (c.field === 'deal.stage') { val = select(stages, c.value || 'lead'); c.value = val.value; val.addEventListener('change', () => { c.value = val.value; }); }
        else if (c.field === 'contact.source') { val = select([['manual', 'Added by hand'], ['import', 'Imported']], c.value || 'manual'); c.value = val.value; val.addEventListener('change', () => { c.value = val.value; }); }
        else {
          val = input(c.value ?? '', { max: c.field === 'deal.value' ? 16 : 120, placeholder: c.field === 'deal.value' ? '50000' : c.field === 'contact.tags' ? 'vip' : '' });
          if (c.field === 'deal.value') val.inputMode = 'decimal';
          val.addEventListener('input', () => { c.value = val.value; });
        }
        if (val.tagName !== 'SPAN') val.setAttribute('aria-label', `Condition ${i + 1}: value`);
        row.append(f, op, val, iconButton('close', `Remove condition ${i + 1}`, () => { state.conditions.splice(i, 1); draw(); }));
        iff.append(row);
      });
      const addC = el('div', 'add-line');
      if (state.conditions.length < cat.limits.conditions) addC.append(button('Add condition', 'btn small plain', () => { state.conditions.push({ field: 'contact.tags', op: 'has', value: '' }); draw(); }, 'plus'));
      iff.append(addC);
      root.append(iff, el('div', 'link'));

      // THEN: steps
      const dealTrigger = state.trigger.type === 'deal_created' || state.trigger.type === 'deal_stage';
      state.actions.forEach((a, i) => {
        const node = el('section', 'node');
        const nh = el('div', 'node-head');
        nh.append(el('span', 'node-badge', 'THEN ' + (i + 1)), el('strong', '', 'Do this'));
        if (i > 0) nh.append(iconButton('chev', `Move step ${i + 1} up`, () => { [state.actions[i - 1], state.actions[i]] = [state.actions[i], state.actions[i - 1]]; draw(); }));
        if (state.actions.length > 1) nh.append(iconButton('trash', `Remove step ${i + 1}`, () => { state.actions.splice(i, 1); draw(); }));
        if (i > 0) nh.childNodes[2].firstChild.style.transform = 'rotate(-90deg)';
        node.append(nh);
        const opts = cat.actions.map((x) => [x.type, x.label + (x.needs_deal && !dealTrigger ? ' (needs a deal trigger)' : ''), x.needs_deal && !dealTrigger]);
        for (const p of cat.planned) opts.push([p.type, p.label + ' (needs Meta connection)', true]);
        const kind = select(opts, a.type);
        kind.setAttribute('aria-label', `Step ${i + 1}: action`);
        kind.addEventListener('change', () => {
          const t = kind.value;
          state.actions[i] = t === 'add_tag' || t === 'remove_tag' ? { type: t, tag: '' } : t === 'create_task' ? { type: t, title: '', due_days: 1 } : t === 'add_note' ? { type: t, text: '' } : t === 'create_deal' ? { type: t, title: '', value: 0 } : { type: t, stage: 'won' };
          draw();
        });
        node.append(field('Action', kind));
        const spec = cat.actions.find((x) => x.type === a.type) || { params: [] };
        const row = el('div', 'row');
        for (const p of spec.params) {
          let ctl;
          if (p === 'stage') { ctl = select(stages, a.stage || 'won'); a.stage = ctl.value; ctl.addEventListener('change', () => { a.stage = ctl.value; }); }
          else if (p === 'text') { ctl = textarea(a.text, 1000, 2); ctl.addEventListener('input', () => { a.text = ctl.value; }); }
          else {
            const max = p === 'tag' ? 30 : p === 'title' ? (a.type === 'create_task' ? 200 : 120) : 16;
            ctl = input(a[p] ?? '', { max, required: p === 'tag' || p === 'title' });
            if (p === 'due_days' || p === 'value') { ctl.inputMode = 'numeric'; ctl.type = 'number'; ctl.min = '0'; ctl.max = p === 'due_days' ? '365' : ''; }
            ctl.addEventListener('input', () => { a[p] = p === 'due_days' || p === 'value' ? ctl.value : ctl.value; });
          }
          row.append(field(PARAM_LABELS[p] || p, ctl));
        }
        node.append(row);
        if (spec.params.some((p) => p === 'title' || p === 'text')) node.append(el('p', 'placeholders', 'You can use {{contact.first_name}}, {{contact.name}}, {{contact.company}}' + (dealTrigger ? ', {{deal.title}}, {{deal.value}}' : '') + '.'));
        root.append(node);
        if (i < state.actions.length - 1) root.append(el('div', 'link'));
      });
      const addS = el('div', 'add-line');
      if (state.actions.length < cat.limits.actions) addS.append(button('Add step', 'btn small', () => { state.actions.push({ type: 'add_tag', tag: '' }); draw(); }, 'plus'));
      root.append(addS);

      // Social channels: planned, not active yet.
      const planned = el('div', 'planned');
      planned.append(el('strong', '', 'Social channels'), el('p', 'hint', 'Posting to Facebook, Instagram and Threads, and messaging on Messenger and WhatsApp, will appear as steps once your business connects its Meta accounts.'));
      const chips = el('div', 'chips');
      for (const p of cat.planned) chips.append(el('span', 'chip', p.label));
      planned.append(chips);
      root.append(planned);

      // Save / delete
      const actions = el('div', 'row');
      actions.style.marginTop = '16px';
      const save = el('button', 'btn primary', saved ? 'Save automation' : 'Create automation');
      save.type = 'submit';
      actions.append(save);
      if (saved) actions.append(button('Delete', 'btn plain danger', async () => {
        if (!window.confirm(`Delete the automation "${saved.name}"?`)) return;
        try { await api('/v1/ncc/automations/' + encodeURIComponent(saved.id), { method: 'DELETE' }); closeSheet(); await reload(); toast('Automation deleted.'); } catch (err) { fail(err); }
      }));
      root.append(actions);
    }

    root.addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = {
        name: state.name,
        enabled: state.enabled,
        trigger: state.trigger,
        conditions: state.conditions.map((c) => (c.op === 'is_set' || c.op === 'not_set' ? { field: c.field, op: c.op } : c)),
        actions: state.actions.map((a) => {
          const out = { ...a };
          if ('due_days' in out) out.due_days = out.due_days === '' ? 1 : Number(out.due_days);
          if ('value' in out) out.value = out.value === '' ? 0 : Number(out.value);
          return out;
        })
      };
      const btn = root.querySelector('button[type=submit]');
      btn.disabled = true;
      try {
        if (saved) await api('/v1/ncc/automations/' + encodeURIComponent(saved.id), { method: 'PUT', body });
        else await api('/v1/ncc/automations', { method: 'POST', body });
        closeSheet();
        await reload();
        toast(saved ? 'Saved.' : (state.enabled ? 'Automation created and on.' : 'Automation created.'));
      } catch (err) { fail(err); btn.disabled = false; }
    });

    draw();
    openSheet(saved ? 'Edit automation' : 'New automation', root, { wide: true });
  }

  window.NCCAutomations = { renderList, edit, TEMPLATES };
})();
