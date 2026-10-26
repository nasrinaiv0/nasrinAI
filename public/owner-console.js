(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const names = {
    overview: ['Good to have you back.', 'A clear view of platform health, AI operations, and business signals.', '◫'],
    ai: ['AI Operations', 'Provider performance, routing, latency, and token usage from verified telemetry.', '✳'],
    logs: ['AI Logs', 'OpenRouter and direct-provider activity, tokens, verified costs, latency, and request metadata.', '≋'],
    'openrouter-unlisted': ['Unlisted Models', 'Logged models missing from NasrinAI’s configured catalog.', '⌕'],
    'other-unlisted': ['AI Models Activities', 'All logged models: listed and unlisted.', '◇'],
    learning: ['Community Learning Review', 'Review eligible examples before they can help future NasrinAI responses.', '✓'],
    users: ['Users & Growth', 'Account totals, usage-based activity, and first-observed retention cohorts.', '♙'],
    regional: ['Regional Analytics', 'Approximate location trends for registered users and guests, derived from trusted edge metadata.', '◎'],
    infra: ['Infrastructure & Releases', 'Database reachability and connected deployment sources.', '⌘'],
    security: ['Security & Audit', 'Authorization health and minimized owner-action audit events.', '◇'],
    automation: ['Automation & Jobs', 'Workflow health, queue state, retries, and execution outcomes.', '↗'],
    finance: ['Finance & Costs', 'Provider-reported AI costs where available and gross recorded PayMongo payments, not net revenue.', '▤'],
    incidents: ['Incidents & Alerts', 'Derived signals and the manual incident register; automatic alerts remain pending.', '◎'],
    reports: ['Reports & Exports', 'Date-scoped aggregate reports from verified data sources.', '▥'],
    settings: ['Settings', 'Owner-console access status. Allowlist values remain in Vercel.', '⚙']
  };
  const sources = {
    ai_usage: ['AI usage & tokens', 'Request-level usage events and provider-reported cost coverage'],
    users: ['Users & growth', 'Auth record counts and activity signals'],
    regional: ['Regional analytics', 'Coarse country, region, and city aggregates; no raw IP addresses or email addresses'],
    retention: ['Usage retention cohorts', 'First-observed signed-in model-call cohorts; not signup cohorts'],
    infrastructure: ['Infrastructure & releases', 'Vercel and dependency health integrations'],
    database: ['Database connection', 'Server-side Supabase reachability check'],
    security_audit: ['Owner action audit events', 'Session and export events only'],
    automation: ['Automation & jobs', 'Aggregate workflow run states'],
    finance: ['Finance & costs', 'Gross recorded PayMongo paid checkouts; excludes refunds, fees, and settlement reconciliation'],
    plan_entitlements: ['Paid plan entitlements', 'Current active Pro/Max/Ultra periods; not revenue'],
    incidents: ['Operational signals', 'Derived failure/stale-job signals and manual incident register; automatic alerts are not connected']
  };
  let data = null;
  let active = 'overview';

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }
  function state(label, kind) { return el('span', 'state ' + (kind || 'unavailable'), label); }
  function head(title, desc, label) {
    const h = el('div', 'section-head'), left = el('div');
    left.append(el('h2', '', title), el('p', '', desc));
    h.append(left, state(label || 'Read-only', ''));
    return h;
  }
  function metric(title, icon, value, note) {
    const card = el('article', 'metric'), top = el('div', 'metric-top');
    top.append(el('span', '', title), el('span', 'metric-icon', icon));
    card.append(top, el('div', 'metric-value', value), el('div', 'metric-note', note));
    return card;
  }
  function numberText(value) {
    const n = Number(value);
    return Number.isFinite(n) ? new Intl.NumberFormat().format(n) : 'Unavailable';
  }
  function moneyText(value) {
    const n = value === null || value === undefined || value === '' ? NaN : Number(value);
    return Number.isFinite(n) ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 4 }).format(n) : 'Unavailable';
  }
  function notice(title, copy) {
    const n = el('div', 'notice'), body = el('div');
    n.append(el('div', 'notice-icon', 'i'));
    body.append(el('strong', '', title), el('p', '', copy));
    n.append(body);
    return n;
  }
  function sourceRows() {
    const list = el('div', 'source-list');
    Object.keys(sources).forEach((key) => {
      const row = el('div', 'source-row'), left = el('div');
      const current = data && data.data_sources ? data.data_sources[key] : 'unavailable';
      left.append(el('div', 'source-name', sources[key][0]), el('div', 'source-detail', sources[key][1]));
      row.append(left, state(current === 'available' ? 'Available' : current === 'no_data' ? 'No data yet' : 'Unavailable', current === 'available' ? 'available' : 'unavailable'));
      list.append(row);
    });
    return list;
  }
  function addTableSettings(panel, table, storageKey) {
    const headers = Array.from(table.querySelectorAll('thead th'));
    if (!headers.length) return;
    const labels = headers.map((th, index) => (th.textContent || 'Column ' + (index + 1)).trim());
    const defaults = { order: labels.map((_, i) => i), hidden: [], density: 'compact', pinned: 0 };
    let saved = defaults;
    try {
      const raw = localStorage.getItem('nasrinai-owner-table:' + storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.order) && Array.isArray(parsed.hidden) && ['compact','regular','expanded'].includes(parsed.density)) {
          const valid = parsed.order.filter(i => Number.isInteger(i) && i >= 0 && i < labels.length);
          saved = { order: [...new Set(valid.concat(defaults.order))], hidden: parsed.hidden.filter(i => Number.isInteger(i) && i >= 0 && i < labels.length), density: parsed.density, pinned: Number.isInteger(parsed.pinned) ? Math.max(0, Math.min(parsed.pinned, labels.length - 1)) : 0 };
        }
      }
    } catch (_) {}
    let settings = saved;
    const toolbar = el('div', 'table-settings-toolbar');
    const trigger = el('button', 'quiet-button table-settings-trigger', '⚙ Table settings');
    trigger.type = 'button'; trigger.setAttribute('aria-expanded', 'false');
    const popover = el('section', 'table-settings-popover'); popover.hidden = true;
    const top = el('div', 'table-settings-top');
    top.append(el('strong', '', 'Table settings'));
    const reset = el('button', 'table-settings-reset', 'Reset'); reset.type = 'button';
    top.append(reset);
    const tabs = el('div', 'table-settings-tabs');
    const columnsTab = el('button', 'table-settings-tab active', 'Columns'); columnsTab.type = 'button';
    const densityTab = el('button', 'table-settings-tab', 'Density'); densityTab.type = 'button';
    tabs.append(columnsTab, densityTab);
    const body = el('div', 'table-settings-body');
    const save = () => { try { localStorage.setItem('nasrinai-owner-table:' + storageKey, JSON.stringify(settings)); } catch (_) {} };
    const moveColumn = (from, to) => {
      if (to < 0 || to >= settings.order.length || from === to) return;
      const [item] = settings.order.splice(from, 1); settings.order.splice(to, 0, item); save(); renderSettings(); apply();
    };
    function apply() {
      markColumns();
      const allRows = Array.from(table.querySelectorAll('tr'));
      allRows.forEach(row => {
        const cells = Array.from(row.children);
        settings.order.forEach((originalIndex, displayIndex) => {
          const cell = cells.find(node => Number(node.dataset.originalColumn) === originalIndex);
          if (cell) row.appendChild(cell);
        });
      });
      allRows.forEach(row => Array.from(row.children).forEach(cell => {
        const index = Number(cell.dataset.originalColumn);
        cell.hidden = settings.hidden.includes(index);
        cell.classList.toggle('table-column-pinned', index === settings.pinned);
      }));
      table.dataset.density = settings.density;
    }
    function markColumns() {
      Array.from(table.querySelectorAll('tr')).forEach(row => Array.from(row.children).forEach((cell, index) => {
        if (!cell.dataset.originalColumn) cell.dataset.originalColumn = String(index);
      }));
    }
    function renderSettings() {
      body.replaceChildren();
      columnsTab.classList.toggle('active', !body.dataset.mode || body.dataset.mode === 'columns');
      densityTab.classList.toggle('active', body.dataset.mode === 'density');
      if (body.dataset.mode === 'density') {
        [['compact','Compact'],['regular','Regular'],['expanded','Expanded']].forEach(([value,label]) => {
          const button = el('button', 'table-density-option' + (settings.density === value ? ' selected' : ''), label + (settings.density === value ? '  ✓' : ''));
          button.type = 'button'; button.addEventListener('click', () => { settings.density = value; save(); renderSettings(); apply(); }); body.append(button);
        });
        return;
      }
      const pinnedLabel = el('label', 'table-pinned-row');
      const pinSelect = el('select', 'provider-log-control'); pinSelect.setAttribute('aria-label', 'Pinned column');
      labels.forEach((label, index) => { const option = el('option','',label); option.value = String(index); option.selected = settings.pinned === index; pinSelect.append(option); });
      pinSelect.addEventListener('change', () => { settings.pinned = Number(pinSelect.value); save(); apply(); });
      pinnedLabel.append(el('span','','Pinned column'), pinSelect); body.append(pinnedLabel);
      settings.order.forEach((originalIndex, position) => {
        const row = el('div','table-column-option'); row.draggable = true; row.dataset.column = String(originalIndex);
        const grip = el('span','table-column-grip','⠿'); grip.setAttribute('aria-hidden','true');
        const checkbox = el('input',''); checkbox.type = 'checkbox'; checkbox.checked = !settings.hidden.includes(originalIndex); checkbox.setAttribute('aria-label','Show '+labels[originalIndex]);
        checkbox.addEventListener('change', () => { settings.hidden = checkbox.checked ? settings.hidden.filter(i => i !== originalIndex) : [...settings.hidden, originalIndex]; save(); apply(); });
        const label = el('label','table-column-label',labels[originalIndex]); label.prepend(checkbox);
        row.append(grip,label);
        row.addEventListener('dragstart', event => { event.dataTransfer.setData('text/plain', String(originalIndex)); event.dataTransfer.effectAllowed = 'move'; });
        row.addEventListener('dragover', event => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; });
        row.addEventListener('drop', event => { event.preventDefault(); const from = settings.order.indexOf(Number(event.dataTransfer.getData('text/plain'))); moveColumn(from, position); });
        body.append(row);
      });
    }
    columnsTab.addEventListener('click', () => { body.dataset.mode = 'columns'; renderSettings(); });
    densityTab.addEventListener('click', () => { body.dataset.mode = 'density'; renderSettings(); });
    trigger.addEventListener('click', () => { popover.hidden = !popover.hidden; trigger.setAttribute('aria-expanded', String(!popover.hidden)); });
    reset.addEventListener('click', () => { settings = { ...defaults, order: defaults.order.slice(), hidden: [] }; save(); renderSettings(); apply(); });
    markColumns(); toolbar.append(trigger); popover.append(top,tabs,body); toolbar.append(popover); panel.append(toolbar);
    renderSettings(); apply();
    return apply;
  }

  function renderOverview() {
    const c = $('content'), u = data && data.usage_24h, userSummary = data && data.user_summary;
    const hasUsage = Boolean(u), requests = hasUsage ? Number(u.request_count) : NaN;
    const noData = hasUsage && requests === 0;
    c.replaceChildren();
    c.append(notice(hasUsage ? 'Usage telemetry is connected' : 'Telemetry connections are not verified yet',
      hasUsage
        ? 'AI usage metrics are aggregated from server-side events. Cost values are internal estimates, not provider invoices. Auth account/sign-in aggregates and usage-based active IDs are shown only from their verified sources. Infrastructure/release telemetry requires the optional Vercel read-only source; platform-wide security events beyond owner actions, settled billing/revenue reconciliation, automatic incident generation, and alert delivery remain unavailable until their sources are verified.'
        : 'The secure console is in place, but this view deliberately does not invent metrics. Each panel shows real figures only after its server-side source, definitions, and access checks are verified.'));
    c.append(head('Platform snapshot', 'Last 24 hours · recorded model-call telemetry only.', 'Read-only'));
    const grid = el('div', 'grid');
    const requestValue = !hasUsage ? 'Unavailable' : noData ? 'No data yet' : numberText(requests);
    const successValue = !hasUsage ? 'Unavailable' : noData ? 'No data yet' : requests > 0 ? (Number(u.success_count) / requests * 100).toFixed(1) + '%' : 'No data yet';
    const activeValue = !hasUsage ? 'Unavailable' : noData ? 'No data yet' : numberText(u.active_user_ids);
    const tokenValue = !hasUsage ? 'Unavailable' : noData ? 'No data yet' : numberText(u.total_tokens);
    const costValue = !hasUsage || Number(u.cost_known_rows) === 0 ? 'Unavailable' : moneyText(u.provider_reported_cost_usd);
    const latencyValue = !hasUsage || u.latency_p95_ms === null || u.latency_p95_ms === undefined ? 'Unavailable' : numberText(Math.round(Number(u.latency_p95_ms))) + ' ms';
    grid.append(
      metric('AI requests', '✳', requestValue, 'Recorded model-call events'),
      metric('Success rate', '✓', successValue, 'Successful outcomes / recorded requests'),
      metric('Active user IDs', '♙', activeValue, 'Distinct signed-in IDs with calls'),
      metric('Auth user records', '♧', userSummary ? numberText(userSummary.auth_user_records) : 'Unavailable', 'Aggregate count only; no user IDs or emails returned'),
      metric('Tokens recorded', '↗', tokenValue, 'Input plus output tokens'),
      metric('Provider-reported AI cost', 'USD', costValue, Number(u && u.cost_known_rows) > 0 ? `${numberText(u.cost_known_rows)} events with cost · ${numberText(u.cost_unknown_rows)} unknown` : 'No provider-reported costs recorded'),
      metric('p95 latency', '◷', latencyValue, 'Successful-call latency, when observations exist')
    );
    c.append(grid);
    const lower = el('div', 'lower-grid'), readiness = el('section', 'panel'), statusPanel = el('section', 'panel');
    readiness.append(el('h3', '', 'Data-source readiness'), el('p', 'panel-copy', 'A source is marked available only when its server-side query succeeds. No placeholder zeros are shown.'), sourceRows());
    statusPanel.append(el('h3', '', 'Implementation status'), el('p', 'panel-copy', 'The owner access boundary and responsive shell are implemented. Usage, automation, and owner-action audit summaries require migration 057 to be applied and verified. Other panels remain unavailable until their source and permission boundaries are audited.'));
    const list = el('div', 'source-list');
    [
      ['Owner identity & IP allowlist', 'Server-only Vercel environment variables', 'Guard implemented'],
      ['Short-lived owner session', 'HttpOnly cookie with strict same-site policy', 'Guard implemented'],
      ['Usage and automation summaries', 'Aggregate RPCs; no prompts or workflow payloads', 'Migration required'],
      ['Broader operational sources', 'Account cohorts, releases, finance, incidents and alerts', 'Pending']
    ].forEach((item) => {
      const row = el('div', 'source-row'), left = el('div');
      left.append(el('div', 'source-name', item[0]), el('div', 'source-detail', item[1]));
      row.append(left, state(item[2], item[2] === 'Pending' ? 'unavailable' : 'available'));
      list.append(row);
    });
    statusPanel.append(list);
    lower.append(readiness, statusPanel);
    c.append(lower);
    if (hasUsage && u.last_event_at) $('freshness').textContent = 'Last usage event ' + new Date(u.last_event_at).toLocaleString() + ' · estimates may be partial';
  }
  function renderOpenRouterVerifier(container) {
    const panel = el('section', 'panel module-extra');
    const copy = el('p', 'panel-copy', 'Run the GitHub Actions verifier against the live OpenRouter catalog. This sends real provider requests and may incur costs.');
    const form = el('div', 'incident-form');
    const modelLabel = el('label', '', 'Optional model ID (leave blank to test all eligible text models)');
    const modelInput = el('input', 'provider-log-control');
    modelInput.type = 'text';
    modelInput.maxLength = 200;
    modelInput.autocomplete = 'off';
    modelInput.placeholder = 'e.g. openai/gpt-6-sol';
    modelLabel.append(modelInput);
    const confirmLabel = el('label', '', 'I understand real provider requests may incur costs');
    const confirmInput = el('input', 'provider-cost-confirmation');
    confirmInput.type = 'checkbox';
    confirmLabel.append(confirmInput);
    const runButton = el('button', 'quiet-button', 'Run model verification');
    runButton.type = 'button';
    const status = el('p', 'panel-copy provider-verification-status', 'Results appear in GitHub Actions after the workflow starts.');
    const link = el('a', 'quiet-button', 'View workflow runs');
    link.href = 'https://github.com/primusco20/nasrinAI/actions/workflows/verify-openrouter-models.yml';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    runButton.addEventListener('click', async () => {
      if (!confirmInput.checked) {
        status.textContent = 'Please confirm that real provider requests may incur costs.';
        confirmInput.focus();
        return;
      }
      const model = modelInput.value.trim();
      if (model && !/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(model)) {
        status.textContent = 'Enter a valid model ID using letters, numbers, dots, underscores, colons, slashes, or hyphens.';
        modelInput.focus();
        return;
      }
      runButton.disabled = true;
      status.textContent = 'Starting GitHub Actions workflow…';
      try {
        const response = await fetch('/owner/api/verify-openrouter-models', {
          method: 'POST',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ model, confirm_provider_costs: true })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload?.error?.message || 'Could not start the workflow.');
        status.textContent = 'Workflow queued' + (payload.model ? ' for ' + payload.model : ' for all eligible text models') + '. Open GitHub Actions to monitor the run and review per-model results.';
      } catch (error) {
        status.textContent = error instanceof Error ? error.message : 'Could not start the workflow.';
      } finally {
        runButton.disabled = false;
      }
    });
    form.append(modelLabel, confirmLabel, runButton, link, status);
    panel.append(el('h3', '', 'OpenRouter model verification'), copy, form);
    container.append(panel);
  }

  function renderModule(key) {
    const c = $('content'), meta = names[key];
    c.replaceChildren();
    c.append(head(meta[0], meta[1], 'Read-only'), notice('No unverified data is shown', 'This module remains read-only. Data without a verified source is marked Unavailable rather than represented by fabricated counts or stale values.'));
    if (key === 'ai') renderOpenRouterVerifier(c);
    const sourceKeys = key === 'ai' ? ['ai_usage', 'infrastructure'] :
      key === 'users' ? ['users', 'retention'] :
      key === 'infra' ? ['database', 'infrastructure'] :
      key === 'security' ? ['security_audit'] :
      key === 'automation' ? ['automation'] :
      key === 'finance' ? ['finance', 'ai_usage'] :
      key === 'incidents' ? ['incidents', 'security_audit'] :
      key === 'reports' ? ['ai_usage', 'users', 'finance'] :
      ['security_audit', 'infrastructure'];
    const cards = el('div', 'module-grid');
    sourceKeys.forEach((sourceKey) => {
      const source = sources[sourceKey], card = el('article', 'module-card'), body = el('div');
      const current = data && data.data_sources ? data.data_sources[sourceKey] : 'unavailable';
      const label = current === 'available' ? 'Available' : current === 'no_data' ? 'No data yet' : current === 'stale' ? 'Stale' : 'Unavailable';
      const kind = current === 'available' ? 'available' : current === 'stale' ? 'stale' : 'unavailable';
      card.append(el('div', 'module-symbol', meta[2]));
      body.append(el('h3', '', source[0]), el('p', '', source[1] + '. Status is based on the last server-side check.'));
      const foot = el('div', 'module-meta');
      foot.append(state(label, kind), el('small', '', current === 'available' ? 'Source connected' : current === 'no_data' ? 'Connected; no matching records' : current === 'stale' ? 'Refresh required' : 'No verified source'));
      body.append(foot);
      card.append(body);
      cards.append(card);
    });
    c.append(cards);

    if (key === 'finance') {
      const billing = el('section', 'panel');
      billing.classList.add('module-extra');
      billing.append(el('h3', '', 'Live OpenRouter account billing'), el('p', 'panel-copy', 'Fetched directly from OpenRouter using a server-only management key. These provider totals are displayed separately from Supabase usage events to prevent double-counting.'));
      const controls = el('div', 'toolbar');
      const windowSelect = el('select', 'input');
      windowSelect.setAttribute('aria-label', 'OpenRouter activity window');
      [['30d','Last 30 days'],['7d','Last 7 days']].forEach(([value,label]) => {
        const option = el('option','',label); option.value = value; windowSelect.append(option);
      });
      const loadButton = el('button', 'quiet-button', 'Refresh OpenRouter data'); loadButton.type = 'button';
      const reconcileButton = el('button', 'quiet-button', 'Reconcile request costs'); reconcileButton.type = 'button';
      reconcileButton.title = 'Fetch authoritative cost and token metadata for logged OpenRouter generation IDs.';
      controls.append(windowSelect, loadButton, reconcileButton); billing.append(controls);
      const result = el('div');
      result.append(notice('Loading provider data', 'Requesting current account analytics from OpenRouter.'));
      billing.append(result); c.append(billing);
      const loadBilling = async () => {
        loadButton.disabled = true; result.replaceChildren(notice('Loading provider data', 'Requesting current account analytics from OpenRouter.'));
        try {
          const response = await fetch('/owner/api/openrouter-billing?window=' + encodeURIComponent(windowSelect.value), { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } });
          const payload = await response.json();
          if (!response.ok) throw new Error(payload?.error?.message || 'Provider data unavailable');
          result.replaceChildren();
          result.append(el('p','panel-copy','Source: OpenRouter Management API · fetched ' + new Date(payload.generated_at).toLocaleString() + ' · window ' + payload.window));
          const totals = payload.totals || {}, credits = payload.credits || {}, grid = el('div','grid');
          grid.append(
            metric('OpenRouter requests','✳',totals.requests == null ? 'Unavailable' : numberText(totals.requests),'Provider activity rows may aggregate requests'),
            metric('Prompt tokens','↗',totals.prompt_tokens == null ? 'Unavailable' : numberText(totals.prompt_tokens),'Provider-reported'),
            metric('Completion tokens','↗',totals.completion_tokens == null ? 'Unavailable' : numberText(totals.completion_tokens),'Provider-reported'),
            metric('Reported activity spend','USD',moneyText(totals.provider_reported_cost_usd),'Not combined with Supabase cost totals'),
            metric('Total credits','USD',moneyText(credits.total_credits),'OpenRouter account balance metadata'),
            metric('Total usage','USD',moneyText(credits.total_usage),'OpenRouter account usage metadata'),
            metric('Remaining credits','USD',moneyText(credits.remaining_credits),'Credits minus reported usage')
          );
          result.append(grid);
          const list = el('div','source-list');
          (Array.isArray(payload.by_model) ? payload.by_model : []).forEach((item) => {
            const row = el('div','source-row'), left = el('div');
            left.append(el('div','source-name',String(item.model || 'unknown model')),el('div','source-detail',numberText(item.requests)+' requests · '+numberText(Number(item.prompt_tokens)+Number(item.completion_tokens))+' tokens'));
            row.append(left,el('div','source-name',moneyText(item.cost_rows ? item.total_cost_usd : null))); list.append(row);
          });
          if (!payload.by_model?.length) list.append(el('p','panel-copy','No model activity rows were returned for this window.'));
          result.append(list);
          result.append(notice('Reconciliation is separate',payload.reconciliation?.note || 'Provider totals have not been reconciled against individual request IDs.'));
        } catch (error) {
          result.replaceChildren(notice('OpenRouter billing unavailable',String(error?.message || 'The provider did not return billing data. Check the server-side management key and try again.')));
        } finally { loadButton.disabled = false; }
      };
      reconcileButton.addEventListener('click', async () => {
        const accepted = window.confirm('Reconcile provider-reported costs for logged OpenRouter requests in this window? This updates matching telemetry rows only and does not combine provider totals with other cost totals.');
        if (!accepted) return;
        reconcileButton.disabled = true;
        try {
          const response = await fetch('/owner/api/openrouter-billing/reconcile', {
            method: 'POST', credentials: 'same-origin', cache: 'no-store',
            headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({ confirm: 'RECONCILE', window: windowSelect.value })
          });
          const payload = await response.json();
          if (!response.ok) throw new Error(payload?.error?.message || 'Reconciliation unavailable');
          result.prepend(notice('Reconciliation finished', 'Attempted ' + numberText(payload.attempted) + ' rows · updated ' + numberText(payload.updated) + ' · unavailable ' + numberText(payload.unavailable) + ' · failed ' + numberText(payload.failed) + '. Only rows with provider generation IDs can be reconciled.'));
          await loadBilling();
        } catch (error) {
          result.prepend(notice('Reconciliation unavailable', String(error?.message || 'Try again after checking server configuration.')));
        } finally {
          reconcileButton.disabled = false;
        }
      });
      loadButton.addEventListener('click', loadBilling);
      windowSelect.addEventListener('change', loadBilling);
      loadBilling();
    }

    if (key === 'finance') {
      const panel = el('section', 'panel');
      panel.classList.add('module-extra');
      panel.append(el('h3', '', 'Direct-provider billing reconciliation'));
      panel.append(el('p', 'panel-copy', 'Organization-level billed spend from provider admin APIs. These totals are not assigned to individual requests and must not be added to request-level costs.'));
      const controls = el('div', 'toolbar');
      const windowSelect = el('select', 'input');
      windowSelect.setAttribute('aria-label', 'Direct-provider billing window');
      [['7d','Last 7 days'],['30d','Last 30 days'],['90d','Last 90 days']].forEach(([value,label]) => {
        const option = el('option','',label); option.value = value; windowSelect.append(option);
      });
      const refresh = el('button', 'quiet-button', 'Refresh direct-provider billing'); refresh.type = 'button';
      controls.append(windowSelect, refresh);
      const result = el('div');
      result.append(notice('Loading provider billing', 'Checking optional organization billing APIs.'));
      panel.append(controls, result); c.append(panel);
      const load = async () => {
        refresh.disabled = true;
        result.replaceChildren(notice('Loading provider billing', 'Fetching read-only organization-level billing reports.'));
        try {
          const response = await fetch('/owner/api/provider-billing?window=' + encodeURIComponent(windowSelect.value), { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } });
          const payload = await response.json();
          if (!response.ok) throw new Error(payload?.error?.message || 'Direct-provider billing is unavailable.');
          result.replaceChildren();
          result.append(el('p','panel-copy','Fetched ' + new Date(payload.generated_at).toLocaleString() + ' · ' + payload.window + ' · USD totals where reported.'));
          const grid = el('div','grid');
          const providers = payload.providers || {};
          for (const [id, label] of [['openai','OpenAI organization spend'],['anthropic','Anthropic organization spend']]) {
            const item = providers[id] || {};
            const statusLabel = item.status === 'available' ? 'Provider-reported · aggregate' : item.status === 'not_configured' ? 'Admin API key not configured' : 'Unavailable';
            grid.append(metric(label, 'USD', moneyText(item.total_usd), statusLabel));
          }
          result.append(grid);
          const list = el('div','source-list');
          for (const [id, label] of [['openai','OpenAI'],['anthropic','Anthropic']]) {
            const item = providers[id] || {};
            const row = el('div','source-row'), left = el('div');
            left.append(el('div','source-name',label),el('div','source-detail',String(item.source || 'billing API') + ' · ' + numberText(Array.isArray(item.rows) ? item.rows.length : 0) + ' report line items'));
            row.append(left,state(item.status === 'available' ? 'Available' : item.status === 'not_configured' ? 'Not configured' : 'Unavailable',item.status === 'available' ? 'available' : 'unavailable'));
            list.append(row);
          }
          result.append(list);
          result.append(notice('Reconciliation boundary',payload.note || 'Aggregate provider spend is not allocated to individual calls.'));
        } catch (error) {
          result.replaceChildren(notice('Direct-provider billing unavailable',String(error?.message || 'Check the optional provider admin keys and retry.')));
        } finally { refresh.disabled = false; }
      };
      refresh.addEventListener('click', load);
      windowSelect.addEventListener('change', load);
      load();
    }

    if (key === 'logs') {
      const panel = el('section', 'panel');
      panel.classList.add('module-extra', 'provider-logs-panel');
      panel.append(el('h3', '', 'AI request history'));
      panel.append(el('p', 'panel-copy', 'Sanitized request telemetry observed by NasrinAI and OpenRouter. Raw prompts, completions, uploaded files, and credentials are never shown. Only models confirmed in the current provider catalog appear here; unknown catalog status is not treated as listed. Costs are shown only when provider-reported. Speed is derived from output tokens / provider generation time; routing overhead is explicitly estimated.'));
      const controls = el('div', 'provider-log-filters');
      const windowLabel = el('label', 'provider-log-field');
      windowLabel.append(el('span', '', 'Time range'));
      const windowSelect = el('select', 'provider-log-control');
      [['15m','Past 15 minutes'],['30m','Past 30 minutes'],['1h','Past hour'],['5h','Past 5 hours'],['12h','Past 12 hours'],['24h','Past 24 hours'],['7d','Past 7 days'],['30d','Past 30 days'],['90d','Past 90 days']].forEach(([value,label]) => { const option = el('option','',label); option.value=value; windowSelect.append(option); });
      windowLabel.append(windowSelect);
      const providerLabel = el('label', 'provider-log-field');
      providerLabel.append(el('span', '', 'Provider'));
      const providerSelect = el('select', 'provider-log-control');
      [['all','All providers'],['openrouter','OpenRouter'],['google','Google'],['openai','OpenAI'],['anthropic','Anthropic']].forEach(([value,label]) => { const option=el('option','',label); option.value=value; providerSelect.append(option); });
      providerLabel.append(providerSelect);
      const statusLabel = el('label', 'provider-log-field');
      statusLabel.append(el('span', '', 'Status'));
      const statusSelect = el('select', 'provider-log-control');
      [['','All statuses'],['success','Success'],['error','Failed']].forEach(([value,label]) => { const option=el('option','',label); option.value=value; statusSelect.append(option); });
      statusLabel.append(statusSelect);
      const modelLabel = el('label', 'provider-log-field');
      modelLabel.append(el('span', '', 'Model contains'));
      const modelInput = el('input', 'provider-log-control');
      modelInput.type='search'; modelInput.maxLength=120; modelInput.placeholder='Search model name';
      modelLabel.append(modelInput);
      const endpointLabel = el('label', 'provider-log-field');
      endpointLabel.append(el('span', '', 'Endpoint'));
      const endpointSelect = el('select', 'provider-log-control');
      [['','All endpoints'],['/chat/completions','Chat / multimodal'],['/audio/speech','Speech'],['/audio/transcriptions','Transcription'],['/responses','Responses / web search'],['/embeddings','Embeddings'],['/rerank','Reranking']].forEach(([value,label]) => { const option=el('option','',label); option.value=value; endpointSelect.append(option); });
      endpointLabel.append(endpointSelect);
      const refresh = el('button', 'quiet-button', 'Refresh logs');
      refresh.type='button';
      controls.append(windowLabel,providerLabel,statusLabel,modelLabel,endpointLabel,refresh);
      panel.append(controls);
      const statusLine = el('p', 'panel-copy provider-log-status', 'Loading request history…');
      panel.append(statusLine);
      const tableWrap = el('div', 'provider-log-table-wrap');
      const table = el('table', 'provider-log-table');
      const thead = el('thead'), headerRow = el('tr');
      ['Date','Model','Provider','Upstream provider','Endpoint','Status','Input tokens','Cached tokens','Output tokens','Speed (tok/s)','Routing overhead*','Time to finish','Total latency','Cost (USD)','Finish reason','Cost source','Request ID'].forEach((label) => headerRow.append(el('th','',label)));
      thead.append(headerRow);
      const tbody = el('tbody');
      table.append(thead,tbody); tableWrap.append(table); panel.append(tableWrap);
      const applyLogTableSettings = addTableSettings(panel, table, 'ai-logs');
      const pager = el('div','provider-log-pager');
      const previous = el('button','quiet-button','Previous'); previous.type='button';
      const next = el('button','quiet-button','Next'); next.type='button';
      const pageLabel = el('span','panel-copy','Page 1');
      pager.append(previous,pageLabel,next); panel.append(pager);
      c.append(panel);
      let offset = 0, hasMore = false, loading = false;
      const cell = (row, value, cls) => { const td=el('td',cls || '', value === null || value === undefined || value === '' ? '—' : String(value)); row.append(td); };
      const fmt = (value) => { if (!value) return '—'; const date=new Date(value); return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString(); };
      const num = (value) => value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) ? '—' : numberText(value);
      const load = async (reset) => {
        if (loading) return;
        if (reset) offset=0;
        loading=true; refresh.disabled=true; previous.disabled=offset===0; next.disabled=true;
        statusLine.textContent='Loading request history…';
        try {
          const params=new URLSearchParams({window:windowSelect.value,provider:providerSelect.value,scope:'all',limit:'50',offset:String(offset)});
          if (statusSelect.value) params.set('status',statusSelect.value);
          if (modelInput.value.trim()) params.set('model',modelInput.value.trim());
          if (endpointSelect.value) params.set('endpoint',endpointSelect.value);
          const response=await fetch('/owner/api/ai-logs?'+params.toString(),{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});
          const payload=await response.json();
          if (!response.ok) throw new Error(payload?.error?.message || 'Request logs unavailable');
          const rows=Array.isArray(payload.rows)?payload.rows:[];
          tbody.replaceChildren();
          rows.forEach((item) => {
            const tr=el('tr');
            const endpoint=String(item.endpoint || '');
            const requestedModel=typeof item.requested_model==='string' ? item.requested_model : '';
            const actualModel=typeof item.model==='string' && item.model.trim() ? item.model.trim() : '';
            const autoRoute=/^openrouter\/(?:auto|free)$/i.test(requestedModel);
            const model=actualModel || (autoRoute ? 'Actual model not reported' : requestedModel || 'Actual model not reported');
            const providerLabel=String(item.provider || (actualModel.includes('/') ? actualModel.split('/')[0] : 'Not reported'));
            const discoveryRequest=/^\/(?:models|images\/models|videos\/models)$/.test(endpoint);
            const notApplicable=discoveryRequest ? 'N/A · catalog request' : '—';
            const statusText=String(item.status || 'unknown').toUpperCase() + (item.http_status ? ' · HTTP '+item.http_status : '');
            const resp=item.response_summary && typeof item.response_summary==='object' ? item.response_summary : {};
            const finish=resp.finish_reason || resp.finishReason || resp.native_finish_reason || '—';
            const cost=discoveryRequest ? 'N/A · catalog request'
              : item.total_cost_usd===null || item.total_cost_usd===undefined || !Number.isFinite(Number(item.total_cost_usd)) ? 'Unknown'
                : item.cost_kind === 'provider_reported' ? Number(item.total_cost_usd).toFixed(6)
                  : item.cost_kind === 'estimated' ? '~' + Number(item.total_cost_usd).toFixed(6) + ' (est.)' : 'Unknown';
            const generationSeconds = item.generation_time_seconds===null || item.generation_time_seconds===undefined ? null : Number(item.generation_time_seconds);
            const outputTokens = item.completion_tokens===null || item.completion_tokens===undefined ? null : Number(item.completion_tokens);
            const speed = generationSeconds > 0 && Number.isFinite(outputTokens) ? (outputTokens / generationSeconds).toFixed(2) : '—';
            const routingOverhead = generationSeconds !== null && Number.isFinite(Number(item.latency_ms)) ? Math.max(0, Number(item.latency_ms) - generationSeconds * 1000).toFixed(0) + ' ms (est.)' : '—';
            cell(tr,fmt(item.created_at));
            const modelCell=el('td','provider-log-model');
            modelCell.append(el('div','provider-log-model-name',model));
            if (requestedModel && requestedModel !== actualModel) modelCell.append(el('div','provider-log-model-requested','Requested: '+requestedModel));
            tr.append(modelCell);
            cell(tr,providerLabel);
            cell(tr,discoveryRequest ? 'Not applicable · catalog' : item.upstream_provider || 'Not reconciled');
            cell(tr,(item.http_method || 'POST')+' '+(item.endpoint || '—'));
            const statusCell=el('td'); statusCell.append(state(statusText,item.status==='success'?'available':'unavailable')); tr.append(statusCell);
            cell(tr,discoveryRequest ? notApplicable : num(item.prompt_tokens));
            cell(tr,discoveryRequest ? notApplicable : num(item.cached_tokens));
            cell(tr,discoveryRequest ? notApplicable : num(item.completion_tokens));
            cell(tr,discoveryRequest ? notApplicable : speed);
            cell(tr,discoveryRequest ? notApplicable : routingOverhead);
            cell(tr,discoveryRequest ? notApplicable : generationSeconds === null || !Number.isFinite(generationSeconds) ? '—' : generationSeconds.toFixed(3)+' s');
            cell(tr,item.latency_ms===null || item.latency_ms===undefined ? '—' : num(item.latency_ms)+' ms');
            cell(tr,cost);
            cell(tr,discoveryRequest ? notApplicable : item.finish_reason || finish);
            cell(tr,discoveryRequest ? notApplicable
              : item.cost_kind === 'estimated' && item.estimated_cost_source === 'pricing_registry_v1_standard_list_price'
                ? 'Estimated list price · ' + String(item.pricing_version || 'pricing registry')
                : item.provider_cost_source === 'openrouter_generation_api' && item.total_cost_usd != null ? 'OpenRouter generation API'
                  : item.provider_cost_source === 'openrouter_logs.total_cost_usd' && item.total_cost_usd != null ? 'Supabase total_cost_usd'
                    : item.provider_cost_source === 'usage_events.provider_reported' && item.total_cost_usd != null ? 'Provider-reported usage' : 'Unavailable');
            const requestId=String(item.provider_request_id || item.openrouter_generation_id || item.request_id || item.id || '—');
            const idCell=el('td','provider-log-id',requestId); tr.append(idCell);
            tbody.append(tr);
          });
          applyLogTableSettings();
          hasMore=Boolean(payload.has_more);
          previous.disabled=offset===0; next.disabled=!hasMore;
          pageLabel.textContent='Page '+(Math.floor(offset/50)+1);
          statusLine.textContent=rows.length ? 'Showing '+numberText(offset+1)+'–'+numberText(offset+rows.length)+' · '+payload.window+' · NasrinAI configured catalog · updated '+fmt(payload.generated_at)+(payload.coverage_limited ? ' · telemetry cap reached' : '') : 'No catalog-listed request logs found for these filters. Check configured catalog membership and telemetry coverage if expected models are missing.';
          if (!rows.length && offset>0) { offset=Math.max(0,offset-50); previous.disabled=offset===0; }
        } catch (error) {
          tbody.replaceChildren();
          statusLine.textContent=String(error?.message || 'Request logs could not be loaded.');
        } finally {
          loading=false; refresh.disabled=false; previous.disabled=offset===0; next.disabled=!hasMore;
        }
      };
      refresh.addEventListener('click',()=>load(true));
      windowSelect.addEventListener('change',()=>load(true));
      providerSelect.addEventListener('change',()=>load(true));
      statusSelect.addEventListener('change',()=>load(true));
      endpointSelect.addEventListener('change',()=>load(true));
      modelInput.addEventListener('keydown',(event)=>{if(event.key==='Enter')load(true);});
      previous.addEventListener('click',()=>{if(offset>=50){offset-=50;load(false);}});
      next.addEventListener('click',()=>{if(hasMore){offset+=50;load(false);}});
      load(true);
    }

    if (key === 'ai') {
      const usage = data && data.usage_24h;
      const providers = data && data.usage_7d && Array.isArray(data.usage_7d.providers) ? data.usage_7d.providers : [];
      const features = data && data.usage_7d && Array.isArray(data.usage_7d.features) ? data.usage_7d.features : [];
      const panel = el('section', 'panel');
      panel.classList.add('module-extra');
      panel.append(el('h3', '', 'Recorded AI activity'), el('p', 'panel-copy', 'Usage events contain aggregate telemetry only; cost values are internal estimates.'));
      const grid = el('div', 'grid');
      grid.append(
        metric('Requests · 24h', '✳', usage ? numberText(usage.request_count) : 'Unavailable', 'Recorded model calls'),
        metric('Tokens · 24h', '↗', usage ? numberText(usage.total_tokens) : 'Unavailable', 'Input plus output tokens'),
        metric('Success rate', '✓', usage && Number(usage.request_count) > 0 ? (Number(usage.success_count) / Number(usage.request_count) * 100).toFixed(1) + '%' : 'No data yet', 'Recorded successful outcomes'),
        metric('p95 latency', '◷', usage && usage.latency_p95_ms !== null && usage.latency_p95_ms !== undefined ? numberText(Math.round(Number(usage.latency_p95_ms))) + ' ms' : 'Unavailable', 'Successful calls')
      );
      panel.append(grid);
      const list = el('div', 'source-list');
      if (providers.length) {
        providers.forEach((item) => {
          const row = el('div', 'source-row'), left = el('div');
          left.append(el('div', 'source-name', item.provider + ' / ' + item.model), el('div', 'source-detail', numberText(item.requests) + ' requests · ' + numberText(Number(item.input_tokens) + Number(item.output_tokens)) + ' tokens'));
          row.append(left, el('div', 'source-name', moneyText(item.provider_reported_cost_usd)));
          list.append(row);
        });
      } else list.append(el('p', 'panel-copy', 'Provider breakdown unavailable until usage telemetry is connected.'));
      panel.append(list);
      c.append(panel);

      const featurePanel = el('section', 'panel');
      featurePanel.classList.add('module-extra');
      featurePanel.append(head('Feature activity · 7d', 'Fixed server-side usage categories; this is activity, not signup conversion or net revenue.', features.length ? 'Available' : 'No data yet'));
      const featureList = el('div', 'source-list');
      if (features.length) {
        features.forEach((item) => {
          const row = el('div', 'source-row'), left = el('div');
          left.append(
            el('div', 'source-name', String(item.feature || 'other').replace(/_/g, ' ')),
            el('div', 'source-detail', numberText(item.active_user_ids) + ' signed-in IDs · ' + numberText(item.active_guest_ids) + ' guest IDs · ' + numberText(item.total_tokens) + ' tokens')
          );
          row.append(left, el('div', 'source-name', numberText(item.requests) + ' requests'));
          featureList.append(row);
        });
      } else {
        featureList.append(el('p', 'panel-copy', 'Feature activity is unavailable until usage telemetry contains matching events.'));
      }
      featurePanel.append(featureList);
      c.append(featurePanel);
    }

    if (key === 'users') {
      const a = data && data.usage_24h, b = data && data.usage_7d, users = data && data.user_summary, growth = data && data.growth_summary, retention = data && data.retention_summary, panel = el('section', 'panel');
      panel.classList.add('module-extra');
      panel.append(el('h3', '', 'Account and activity signals'), el('p', 'panel-copy', 'Auth record totals and signup timestamps are aggregated server-side. Activity IDs reflect recorded model calls; retention cohorts use the first observed signed-in model-call date within a 45-day lookback, not signup date.'));
      const grid = el('div', 'grid');
      const value = (summary, field) => !summary ? 'Unavailable' : Number(summary.request_count) === 0 ? 'No data yet' : numberText(summary[field]);
      grid.append(
        metric('Auth user records', '♧', users ? numberText(users.auth_user_records) : 'Unavailable', 'Aggregate count; no user identifiers returned'),
        metric('New Auth records · 24h', '↗', users ? numberText(users.new_auth_records_24h) : 'Unavailable', 'Records created in the last day'),
        metric('New Auth records · 7d', '↗', users ? numberText(users.new_auth_records_7d) : 'Unavailable', 'Records created in the last week'),
        metric('Sign-ins · 30d', '◷', users ? numberText(users.active_signins_30d) : 'Unavailable', 'Auth records with a recent sign-in'),
        metric('Active users · 24h', '♙', growth ? numberText(growth.active_user_ids_24h) : 'Unavailable', 'Distinct actors with recorded calls'),
        metric('Active users · 7d', '♙', growth ? numberText(growth.active_user_ids_7d) : 'Unavailable', 'Distinct actors with recorded calls'),
        metric('Active users · 30d', '♙', growth ? numberText(growth.active_user_ids_30d) : 'Unavailable', 'Distinct actors with recorded calls'),
        metric('Active guests · 24h', '◌', growth ? numberText(growth.active_guest_ids_24h) : 'Unavailable', 'Distinct guest actors with recorded calls'),
        metric('7d return rate', '↻', growth && growth.return_rate_pct !== null ? Number(growth.return_rate_pct).toFixed(1) + '%' : growth ? 'No cohort yet' : 'Unavailable', 'Prior-week active users who returned this week'),
        metric('Active user IDs · 24h', '♙', value(a, 'active_user_ids'), 'Signed-in actors with recorded calls'),
        metric('Active guest IDs · 24h', '◌', value(a, 'active_guest_ids'), 'Guest actors with recorded calls'),
        metric('Active user IDs · 7d', '♙', value(b, 'active_user_ids'), 'Distinct signed-in actors'),
        metric('Active guest IDs · 7d', '◌', value(b, 'active_guest_ids'), 'Distinct guest actors')
      );
      panel.append(grid);
      c.append(panel);

      const cohorts = Array.isArray(retention?.cohorts) ? retention.cohorts.slice(0, 7) : [];
      const cohortPanel = el('section', 'panel');
      cohortPanel.classList.add('module-extra');
      cohortPanel.append(head('Usage-based retention cohorts', 'First-observed signed-in model-call cohorts · 45-day lookback · last 14 days', retention ? (cohorts.length ? 'Available' : 'No data yet') : 'Unavailable'));
      cohortPanel.append(el('p', 'panel-copy', 'Day 1 and day 7 retention count a model call on exactly cohort date + 1 or + 7. Newer cohorts are not eligible for day 7 yet. These are activity cohorts, not signup cohorts. Older activity outside the 45-day lookback is not used to establish a cohort.'));
      if (cohorts.length) {
        const cohortGrid = el('div', 'grid');
        cohorts.forEach((cohort) => {
          const d1 = cohort.day_1_retention_pct == null ? 'Not eligible' : Number(cohort.day_1_retention_pct).toFixed(1) + '%';
          const d7 = cohort.day_7_retention_pct == null ? 'Not eligible' : Number(cohort.day_7_retention_pct).toFixed(1) + '%';
          const d1Count = numberText(cohort.day_1_returned) + '/' + numberText(cohort.day_1_eligible);
          const d7Count = numberText(cohort.day_7_returned) + '/' + numberText(cohort.day_7_eligible);
          cohortGrid.append(metric('Cohort ' + cohort.cohort_date, '♙', numberText(cohort.cohort_size), 'D1 ' + d1 + ' (' + d1Count + ') · D7 ' + d7 + ' (' + d7Count + ')'));
        });
        cohortPanel.append(cohortGrid);
      } else {
        cohortPanel.append(notice(retention ? 'No cohort data yet' : 'Retention source unavailable', 'Cohorts appear after signed-in users have recorded model-call activity in the selected window.'));
      }
      c.append(cohortPanel);
    }

    if (key === 'infra') {
      const panel = el('section', 'panel'), db = data && data.database_health ? data.database_health.status : 'unavailable';
      const deployments = data && data.deployment_summary;
      panel.classList.add('module-extra');
      panel.append(el('h3', '', 'Database reachability'), el('p', 'panel-copy', 'This is a bounded server-side connectivity check; it does not expose database rows.'));
      panel.append(state(db === 'available' ? 'Available' : 'Unavailable', db === 'available' ? 'available' : 'unavailable'));
      panel.append(el('h3', '', 'Recent production deployments'), el('p', 'panel-copy', 'Read-only Vercel metadata. This integration requires a dedicated read-only token and project identifiers; missing credentials are shown as unavailable.'));
      if (!deployments) {
        panel.append(notice('Deployment source unavailable', 'Set OWNER_VERCEL_READONLY_TOKEN, OWNER_VERCEL_PROJECT_ID, and OWNER_VERCEL_TEAM_ID on the server to connect this read-only source.'));
      } else {
        const grid = el('div', 'grid');
        grid.append(
          metric('Deployments returned', '⌘', numberText(deployments.deployment_count), 'Latest production deployments'),
          metric('Ready', '✓', numberText(deployments.ready_count), 'State reported by Vercel'),
          metric('Failed or canceled', '!', numberText(deployments.failed_count), 'Error/canceled states reported by Vercel')
        );
        panel.append(grid);
        const list = el('div', 'source-list');
        (Array.isArray(deployments.deployments) ? deployments.deployments : []).forEach((item) => {
          const row = el('div', 'source-row'), left = el('div'), status = String(item.state || 'unknown');
          left.append(el('div', 'source-name', item.url || 'Deployment URL unavailable'), el('div', 'source-detail', [item.branch || 'branch unknown', item.commit ? item.commit.slice(0, 12) : 'commit unknown', item.created_at ? new Date(item.created_at).toLocaleString() : 'time unknown'].join(' · ')));
          row.append(left, state(status.toUpperCase(), status === 'ready' ? 'available' : ['error','canceled','cancelled'].includes(status) ? 'unavailable' : ''));
          list.append(row);
        });
        panel.append(list);
      }
      c.append(panel);
    }

    if (key === 'finance') {
      const usage = data && data.usage_24h, plans = data && data.plans_24h, hasCosts = Boolean(usage && Number(usage.cost_known_rows) > 0), panel = el('section', 'panel');
      const paidByCurrency = Array.isArray(plans?.gross_paid_by_currency) ? plans.gross_paid_by_currency : [];
      const phpPaid = paidByCurrency.find((item) => item && item.currency === 'PHP');
      const paidPaymentCount = plans && Number.isFinite(Number(plans.paid_payment_count)) ? Number(plans.paid_payment_count) : null;
      const grossPhp = plans ? '₱' + (Number(phpPaid?.gross_amount_minor || 0) / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : 'Unavailable';
      panel.classList.add('module-extra');
      panel.append(el('h3', '', 'Recorded AI cost estimates'), el('p', 'panel-copy', 'These are internal estimates recorded with model calls, not provider invoices, settled payments, revenue, refunds, or net margin.'));
      const grid = el('div', 'grid');
      grid.append(
        metric('Provider-reported AI cost · 24h', 'USD', hasCosts ? moneyText(usage.provider_reported_cost_usd) : 'Unavailable', hasCosts ? `${numberText(usage.cost_known_rows)} known · ${numberText(usage.cost_unknown_rows)} unknown` : 'No provider-reported costs'),
        metric('Requests with provider cost', '▤', hasCosts ? numberText(usage.cost_known_rows) : 'Unavailable', 'Events with provider-reported cost'),
        metric('Requests · 24h', '✳', usage ? numberText(usage.request_count) : 'Unavailable', 'Recorded usage events'),
        metric('Active paid plan periods', '◇', plans ? numberText(plans.active_paid_periods) : 'Unavailable', 'Unexpired active periods, not unique users'),
        metric('Pro periods', 'P', plans ? numberText(plans.active_pro_periods) : 'Unavailable', 'Current active Pro periods'),
        metric('Max periods', 'M', plans ? numberText(plans.active_max_periods) : 'Unavailable', 'Current active Max periods'),
        metric('Ultra periods', 'U', plans ? numberText(plans.active_ultra_periods) : 'Unavailable', 'Current active Ultra periods'),
        metric('Recorded PayMongo gross · 24h', 'PHP', grossPhp, 'Recorded paid checkout amounts before fees and refunds'),
        metric('Recorded paid checkouts · 24h', '#', paidPaymentCount === null ? 'Unavailable' : numberText(paidPaymentCount), 'PayMongo paid periods recorded in the selected window')
      );
      panel.append(grid, el('p', 'panel-copy', 'PayMongo gross amounts are derived only from recorded paid checkout periods. They are not net revenue: refunds, disputes, processor fees, settlement timing, and unrecorded adjustments are not represented.'));
      c.append(panel);
    }

    if (key === 'incidents') {
      const signals = data && data.incidents_24h, panel = el('section', 'panel');
      panel.classList.add('module-extra');
      const failedAi = signals ? Number(signals.ai_failed_requests || 0) : null;
      const failedJobs = signals ? Number(signals.automation_failed_runs || 0) : null;
      const staleJobs = signals ? Number(signals.stale_running_runs || 0) : null;
      const hasSignals = signals && (failedAi + failedJobs + staleJobs > 0);
      panel.append(head('Derived operational signals', 'Last 24 hours of recorded model-call failures and automation-run health.', hasSignals ? 'Attention' : signals ? 'No signals' : 'Unavailable'));
      panel.append(el('p', 'panel-copy', 'These are read-only signals derived from existing telemetry. They do not automatically create incidents, send notifications, or perform remediation.'));
      const grid = el('div', 'grid');
      grid.append(
        metric('Failed AI requests', '✳', signals ? numberText(failedAi) : 'Unavailable', 'Recorded outcomes other than ok'),
        metric('Failed automation runs', '↗', signals ? numberText(failedJobs) : 'Unavailable', 'Failed executions in the selected window'),
        metric('Stale running jobs', '◷', signals ? numberText(staleJobs) : 'Unavailable', 'Running over 30 minutes')
      );
      panel.append(grid);
      if (signals && signals.last_failure_at) panel.append(el('p', 'panel-copy', 'Most recent failure: ' + new Date(signals.last_failure_at).toLocaleString()));
      if (signals && !hasSignals) panel.append(el('p', 'panel-copy', 'No matching failures or stale runs were recorded in this window.'));
      c.append(panel);

      const manager = el('section', 'panel');
      manager.classList.add('module-extra');
      manager.append(el('h3', '', 'Incident register'), el('p', 'panel-copy', 'Create and track operational incidents. All changes require explicit confirmation and are recorded in the owner audit trail. This register does not deliver alerts.'));
      const form = el('form', 'incident-form');
      const titleLabel = el('label', '', 'Incident title'), titleInput = el('input');
      titleInput.name = 'title'; titleInput.maxLength = 160; titleInput.required = true; titleInput.placeholder = 'Short, actionable summary';
      titleLabel.append(titleInput);
      const descriptionLabel = el('label', '', 'Description'), descriptionInput = el('textarea');
      descriptionInput.name = 'description'; descriptionInput.maxLength = 1200; descriptionInput.rows = 3; descriptionInput.placeholder = 'Context without secrets or private user content';
      descriptionLabel.append(descriptionInput);
      const severityLabel = el('label', '', 'Severity'), severityInput = el('select');
      [['low','Low'],['medium','Medium'],['high','High'],['critical','Critical']].forEach(([value,label]) => { const option = el('option','',label); option.value = value; severityInput.append(option); });
      severityInput.name = 'severity'; severityLabel.append(severityInput);
      const sourceLabel = el('label', '', 'Source'), sourceInput = el('select');
      [['manual','Manual'],['ai_usage','AI usage'],['automation','Automation'],['infrastructure','Infrastructure'],['security','Security']].forEach(([value,label]) => { const option = el('option','',label); option.value = value; sourceInput.append(option); });
      sourceInput.name = 'source'; sourceLabel.append(sourceInput);
      const submit = el('button', 'quiet-button', 'Create incident'); submit.type = 'submit';
      const message = el('p', 'panel-copy', 'Incidents are private to the owner console. Do not include credentials, prompts, or unnecessary personal data.');
      form.append(titleLabel, descriptionLabel, severityLabel, sourceLabel, submit, message);
      const register = el('div', 'incident-register');
      manager.append(form, register);
      c.append(manager);

      async function refreshIncidents() {
        register.replaceChildren(el('p', 'panel-copy', 'Loading incident records…'));
        try {
          const response = await fetch('/owner/api/incidents', { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } });
          if (response.status === 404) { window.location.href = 'https://www.nasrinai.com/'; return; }
          if (!response.ok) throw new Error('incident list unavailable');
          const payload = await response.json();
          register.replaceChildren();
          const counts = payload.counts || {};
          const countGrid = el('div', 'grid');
          countGrid.append(
            metric('Open', '!', numberText(counts.open || 0), 'Needs attention'),
            metric('Acknowledged', '✓', numberText(counts.acknowledged || 0), 'Owner has acknowledged'),
            metric('Resolved', '✓', numberText(counts.resolved || 0), 'Resolution recorded'),
            metric('Critical open', '⚠', numberText(counts.critical_open || 0), 'Open critical incidents')
          );
          register.append(countGrid);
          const items = Array.isArray(payload.incidents) ? payload.incidents : [];
          if (!items.length) register.append(notice('No incidents recorded', 'Create an incident above when an operational issue needs a durable owner record.'));
          const list = el('div', 'source-list');
          items.forEach((item) => {
            const row = el('article', 'incident-item'), body = el('div', 'incident-item-body'), top = el('div', 'incident-item-top');
            top.append(el('strong', '', item.title || 'Untitled incident'), state(String(item.severity || 'unknown').toUpperCase(), item.severity === 'critical' || item.severity === 'high' ? 'unavailable' : ''));
            body.append(top, el('p', 'panel-copy', item.description || 'No description provided.'));
            body.append(el('p', 'source-detail', [String(item.source || 'manual'), String(item.status || 'open'), item.created_at ? new Date(item.created_at).toLocaleString() : 'time unknown'].join(' · ')));
            if (item.resolution_note) body.append(el('p', 'panel-copy', 'Resolution: ' + item.resolution_note));
            const actions = el('div', 'incident-actions');
            async function changeStatus(action) {
              const resolutionNote = action === 'resolve' ? window.prompt('Add a resolution note (3–1200 characters):') : '';
              if (action === 'resolve' && (typeof resolutionNote !== 'string' || resolutionNote.trim().length < 3 || resolutionNote.trim().length > 1200)) return;
              const confirmation = action === 'acknowledge' ? 'Acknowledge this incident?' : 'Resolve this incident with the provided note?';
              if (!window.confirm(confirmation)) return;
              try {
                const response = await fetch('/owner/api/incidents/' + encodeURIComponent(item.id) + '/' + action, {
                  method: 'POST', credentials: 'same-origin', cache: 'no-store',
                  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                  body: JSON.stringify({ confirm: action === 'acknowledge' ? 'ACKNOWLEDGE' : 'RESOLVE', resolution_note: resolutionNote || '' })
                });
                if (response.status === 404) { window.location.href = 'https://www.nasrinai.com/'; return; }
                if (!response.ok) throw new Error('incident update failed');
                await refreshIncidents();
              } catch {
                register.prepend(notice('Update failed', 'The incident could not be updated. Refresh the list and try again.'));
              }
            }
            if (item.status === 'open') {
              const acknowledge = el('button', 'quiet-button', 'Acknowledge'); acknowledge.type = 'button';
              acknowledge.addEventListener('click', () => changeStatus('acknowledge')); actions.append(acknowledge);
            }
            if (item.status !== 'resolved') {
              const resolve = el('button', 'quiet-button', 'Resolve'); resolve.type = 'button';
              resolve.addEventListener('click', () => changeStatus('resolve')); actions.append(resolve);
            }
            row.append(body, actions); list.append(row);
          });
          register.append(list);
        } catch {
          register.replaceChildren(notice('Incident storage unavailable', 'Apply and verify migration 057 before using the incident register. No changes were made.'));
        }
      }
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!window.confirm('Create a durable incident record? This does not send a notification.')) return;
        submit.disabled = true;
        try {
          const response = await fetch('/owner/api/incidents', {
            method: 'POST', credentials: 'same-origin', cache: 'no-store',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ confirm: 'CREATE INCIDENT', title: titleInput.value, description: descriptionInput.value, severity: severityInput.value, source: sourceInput.value })
          });
          if (response.status === 404) { window.location.href = 'https://www.nasrinai.com/'; return; }
          if (!response.ok) throw new Error('incident create failed');
          form.reset();
          await refreshIncidents();
        } catch {
          register.prepend(notice('Incident could not be recorded', 'Incident storage may be unavailable until migration 057 is applied and verified.'));
        } finally {
          submit.disabled = false;
        }
      });
      void refreshIncidents();
    }

    if (key === 'security') {
      const panel = el('section', 'panel'), audit = data && data.audit_24h, platformAudit = data && data.platform_auth_audit_24h;
      const platformReady = Boolean(platformAudit && platformAudit.available === true);
      panel.classList.add('module-extra');
      panel.append(el('h3', '', 'Access boundary'), el('p', 'panel-copy', 'The current page is visible only after server-side email/IP validation. Allowlist values and the signing secret are never returned to the browser.'));
      const rows = el('div', 'source-list');
      [
        ['Owner session', '10-minute HttpOnly, SameSite=Strict cookie', 'Enabled'],
        ['Email and IP validation', 'Rechecked on protected requests', 'Enabled'],
        ['Shared IP rate limit', 'Uses the existing server-side limiter', 'Enabled'],
        ['Owner action audit history', 'Session, export, and incident actions; raw IP values are not returned', audit ? (Number(audit.event_count) > 0 ? 'Available' : 'No data yet') : 'Unavailable'],
        ['Platform Auth audit source', 'Aggregate Supabase Auth event categories only; no email, IP, actor IDs, or raw payloads', platformReady ? (Number(platformAudit.event_count) > 0 ? 'Available' : 'No data yet') : 'Unavailable']
      ].forEach((item) => {
        const row = el('div', 'source-row'), left = el('div');
        left.append(el('div', 'source-name', item[0]), el('div', 'source-detail', item[1]));
        row.append(left, state(item[2], item[2] === 'Enabled' || item[2] === 'Available' ? 'available' : 'unavailable'));
        rows.append(row);
      });
      panel.append(rows);
      const grid = el('div', 'grid');
      grid.append(
        metric('Owner audit events · 24h', '◇', audit ? numberText(audit.event_count) : 'Unavailable', audit && audit.last_event_at ? 'Last event ' + new Date(audit.last_event_at).toLocaleString() : 'No audit events recorded'),
        metric('Platform Auth events · 24h', '⌁', platformReady ? numberText(platformAudit.event_count) : 'Unavailable', platformReady && platformAudit.last_event_at ? 'Last event ' + new Date(platformAudit.last_event_at).toLocaleString() : platformReady ? 'No Auth audit events recorded' : 'Auth audit source unavailable'),
        metric('Sign-in events', '↗', platformReady ? numberText(platformAudit.sign_in_events) : 'Unavailable', 'Coarse event categories only'),
        metric('Account recovery events', '◇', platformReady ? numberText(platformAudit.account_recovery_events) : 'Unavailable', 'No identities or recovery payloads returned'),
        metric('Password change events', '⚿', platformReady ? numberText(platformAudit.password_change_events) : 'Unavailable', 'Aggregate event count'),
        metric('Sign-out events', '↙', platformReady ? numberText(platformAudit.sign_out_events) : 'Unavailable', 'Aggregate event count')
      );
      panel.append(grid);
      c.append(panel);
    }

    if (key === 'automation') {
      const summary = data && data.automation_24h, ready = Boolean(summary), noData = ready && Number(summary.run_count) === 0, panel = el('section', 'panel');
      panel.classList.add('module-extra');
      panel.append(el('h3', '', 'Automation run health · 24 hours'), el('p', 'panel-copy', 'Aggregate run states only; workflow definitions, step arguments, and payloads are not returned.'));
      const grid = el('div', 'grid');
      grid.append(
        metric('Runs', '↗', !ready ? 'Unavailable' : noData ? 'No data yet' : numberText(summary.run_count), 'Recorded automation runs'),
        metric('Pending approval', '◷', !ready ? 'Unavailable' : numberText(summary.pending_approval_count), 'Awaiting explicit approval'),
        metric('Running', '↻', !ready ? 'Unavailable' : numberText(summary.running_count), 'Currently running'),
        metric('Failed', '!', !ready ? 'Unavailable' : numberText(summary.failed_count), 'Failed executions'),
        metric('Stale running', '⚠', !ready ? 'Unavailable' : numberText(summary.stale_running_count), 'Running for more than 30 minutes')
      );
      panel.append(grid);
      c.append(panel);
    }

    if (key === 'reports') {
      const panel = el('section', 'panel');
      panel.classList.add('module-extra');
      panel.append(el('h3', '', 'Export verified usage summaries'), el('p', 'panel-copy', 'Exports contain aggregate counts and provider/model totals only. They never include prompts, message content, credentials, or user-level records.'));
      const actions = el('div', 'module-meta');
      [['24-hour CSV', '/owner/api/export?window=24h'], ['7-day CSV', '/owner/api/export?window=7d']].forEach((item) => {
        const link = el('a', 'quiet-button', item[0]);
        link.href = item[1];
        link.setAttribute('download', '');
        actions.append(link);
      });
      panel.append(actions);
      c.append(panel);
    }

    if (key === 'settings') {
      const panel = el('section', 'panel');
      panel.classList.add('module-extra');
      panel.append(el('h3', '', 'Access configuration'), el('p', 'panel-copy', 'Manage OWNER_ALLOWED_EMAILS, OWNER_ALLOWED_IPS, and OWNER_SESSION_SECRET in Vercel Project → Settings → Environment Variables. Changes apply after redeploy. The console never displays the allowlist or session secret.'));
      c.append(panel);
    }
  }
  async function renderLearning() {
    const c = $('content');
    c.replaceChildren();
    c.append(head('Community Learning Review', 'Only approved examples can be retrieved by NasrinAI. Review decisions are recorded.', 'Owner review'));
    const toolbar = el('div', 'module-meta');
    const statusSelect = el('select', 'quiet-button');
    [['pending_review','Pending review'],['approved','Approved'],['rejected','Rejected']].forEach(([value,label]) => {
      const option = el('option', '', label); option.value = value; statusSelect.append(option);
    });
    const historyButton = el('button', 'quiet-button', 'View review history'); historyButton.type = 'button';
    toolbar.append(statusSelect, historyButton); c.append(toolbar);
    const list = el('div', 'source-list');
    c.append(list);
    async function load() {
      list.replaceChildren(notice('Loading examples…', 'Fetching eligible examples from the protected review queue.'));
      try {
        const response = await fetch('/owner/api/community-learning?status=' + encodeURIComponent(statusSelect.value), { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } });
        if (!response.ok) throw new Error('queue unavailable');
        const payload = await response.json();
        list.replaceChildren();
        const examples = Array.isArray(payload.examples) ? payload.examples : [];
        if (!examples.length) { list.append(notice('No examples in this queue', statusSelect.value === 'pending_review' ? 'New eligible examples appear here only when collection is permitted and screening passes.' : 'There are no examples in this status.')); return; }
        examples.forEach((item) => {
          const card = el('article', 'panel'), top = el('div', 'source-row'), left = el('div');
          left.append(el('div', 'source-name', (item.subject_type === 'guest' ? 'Guest' : 'Signed-in user') + ' · ' + new Date(item.created_at).toLocaleString()));
          left.append(el('div', 'source-detail', 'Expires ' + new Date(item.expires_at).toLocaleString() + ' · ID ' + String(item.id).slice(0,8)));
          top.append(left, state(String(item.status || statusSelect.value).replace('_',' ').toUpperCase(), item.status === 'approved' ? 'available' : item.status === 'rejected' ? 'unavailable' : ''));
          card.append(top);
          const content = el('pre', 'learning-example', String(item.example_text || '')); content.setAttribute('tabindex','0'); content.setAttribute('aria-label','Example question and answer');
          card.append(content);
          if (item.status === 'pending_review') {
            const actions = el('div', 'module-meta');
            const reason = el('select', 'quiet-button');
            [['meets_quality_bar','Meets quality bar'],['unclear','Unclear'],['sensitive_content','Sensitive content'],['possible_identifier','Possible identifier'],['duplicate','Duplicate'],['out_of_scope','Out of scope'],['other','Other']].forEach(([value,label]) => { const option=el('option','','' + label); option.value=value; reason.append(option); });
            const approve = el('button','quiet-button','Approve example'); approve.type='button';
            const reject = el('button','quiet-button','Reject example'); reject.type='button';
            approve.addEventListener('click', () => decide(item.id,'approve',reason.value));
            reject.addEventListener('click', () => decide(item.id,'reject',reason.value));
            actions.append(reason,approve,reject); card.append(actions);
          } else {
            card.append(el('p','panel-copy','Reviewed ' + (item.reviewed_at ? new Date(item.reviewed_at).toLocaleString() : 'at an earlier time') + (item.reviewer_id ? ' · reviewer ' + item.reviewer_id : '')));
          }
          list.append(card);
        });
      } catch {
        list.replaceChildren(notice('Review queue unavailable', 'Check that the latest deployment and database migrations are applied. No review action was taken.'));
      }
    }
    async function decide(id, action, reason) {
      const expected = action === 'approve' ? 'APPROVE' : 'REJECT';
      if (!window.confirm((action === 'approve' ? 'Approve' : 'Reject') + ' this example? ' + (action === 'approve' ? 'NasrinAI may retrieve it in future answers.' : 'It will be excluded from retrieval.'))) return;
      try {
        const response = await fetch('/owner/api/community-learning/' + encodeURIComponent(id) + '/' + action, { method:'POST', credentials:'same-origin', cache:'no-store', headers:{'Content-Type':'application/json','Accept':'application/json'}, body:JSON.stringify({ confirm: expected, reason_code: reason }) });
        if (!response.ok) { const result=await response.json().catch(()=>({})); throw new Error(result?.error?.message || 'Review action failed.'); }
        await load();
      } catch (error) { list.prepend(notice('Could not save review', error.message || 'Refresh and try again.')); }
    }
    historyButton.addEventListener('click', async () => {
      try {
        const response = await fetch('/owner/api/community-learning/history', { credentials:'same-origin', cache:'no-store', headers:{Accept:'application/json'} });
        if (!response.ok) throw new Error('history unavailable');
        const payload = await response.json();
        const history = el('section','panel'); history.append(el('h3','','Recent review history'),el('p','panel-copy','Last 50 owner review decisions.'));
        const rows = el('div','source-list');
        (Array.isArray(payload.events)?payload.events:[]).forEach((event) => {
          const row=el('div','source-row'), left=el('div');
          left.append(el('div','source-name',String(event.decision).toUpperCase()+' · '+String(event.reason_code).replaceAll('_',' ')));
          left.append(el('div','source-detail',new Date(event.created_at).toLocaleString()+' · example '+String(event.example_id).slice(0,8)+' · reviewer '+String(event.reviewer_id)));
          row.append(left); rows.append(row);
        });
        if (!payload.events?.length) rows.append(notice('No review history yet','Review decisions will appear here.'));
        history.append(rows); c.append(history);
      } catch { c.append(notice('History unavailable','The review history source is not available.')); }
    });
    statusSelect.addEventListener('change', load);
    await load();
  }
  async function renderUnlistedModels() {
    const c = $('content');
    c.replaceChildren();
    c.append(head('Unlisted Models', 'Logged models not listed in NasrinAI’s configured catalog.', 'Read-only'));
    const controls = el('div', 'toolbar');
    const windowSelect = el('select', 'input');
    windowSelect.setAttribute('aria-label', 'Unlisted model time range');
    [['15m','Past 15 minutes'],['30m','Past 30 minutes'],['1h','Past hour'],['5h','Past 5 hours'],['12h','Past 12 hours'],['24h','Past 24 hours'],['7d','Past 7 days'],['30d','Past 30 days'],['90d','Past 90 days']].forEach(([value,label]) => { const option=el('option','',label); option.value=value; windowSelect.append(option); });
    windowSelect.value='24h';
    const refresh=el('button','quiet-button','Refresh unlisted models'); refresh.type='button';
    controls.append(windowSelect,refresh);
    const result=el('div');
    result.append(notice('Loading unlisted models','Checking NasrinAI catalog membership.'));
    c.append(controls,result);
    async function load() {
      refresh.disabled=true;
      result.replaceChildren(notice('Loading unlisted models','Fetching logged models outside the NasrinAI catalog.'));
      try {
        const response=await fetch('/owner/api/ai-logs?scope=unlisted&window='+encodeURIComponent(windowSelect.value)+'&provider=all&limit=1000&offset=0',{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});
        const payload=await response.json();
        if(!response.ok) throw new Error(payload?.error?.message || 'Provider model telemetry unavailable.');
        const rows=Array.isArray(payload.rows)?payload.rows:[];
        const unlisted=rows.filter(row=>row && row.model && row.catalog_status==='not_listed');
        const unknown=[];
        const summary=el('div','module-grid');
        [[unlisted.length,'Unlisted models','unavailable'],[rows.length,'Logged models','stale']].forEach(([value,label,kind])=>{
          const card=el('article','module-card'); card.append(el('h3','',String(value)),el('p','',label),state(kind==='stale'?'Needs provider catalog access':'Confirmed absent',kind)); summary.append(card);
        });
        result.replaceChildren(summary);
        result.append(notice('Provider source and coverage',
          'Source: recorded NasrinAI/OpenRouter telemetry plus live provider catalogs. Catalog coverage: '+Object.entries(payload.catalog_coverage||{}).map(([p,v])=>p+': '+v).join(' · ')+'. Models not present in the telemetry sources cannot be discovered by this view; catalog failures remain unknown, not unlisted.'));
        const wrap=el('div','table-wrap'),table=el('table','data-table'),thead=el('thead'),hr=el('tr');
        ['Provider','Observed model ID','Catalog status','Requests','Success / failure','Input / output tokens','Provider-reported cost (USD)','First / last observed','Telemetry source'].forEach(label=>hr.append(el('th','',label)));
        thead.append(hr);table.append(thead);const tbody=el('tbody');
        const groups=new Map();
        unlisted.forEach(row=>{
          const key=String(row.provider)+'\u0000'+String(row.model);
          const item=groups.get(key)||{provider:row.provider,model:row.model,requests:0,successes:0,failures:0,input:0,output:0,cost:0,costKnown:false,first:row.created_at,last:row.created_at,sources:new Set()};
          item.requests++;
          if(row.status==='success')item.successes++;else if(row.status==='error')item.failures++;
          item.input+=Number(row.prompt_tokens)||0;item.output+=Number(row.completion_tokens)||0;
          if(row.cost_kind==='provider_reported'&&row.total_cost_usd!=null&&Number.isFinite(Number(row.total_cost_usd))){item.cost+=Number(row.total_cost_usd);item.costKnown=true;}
          if(row.created_at&&(!item.first||row.created_at<item.first))item.first=row.created_at;
          if(row.created_at&&(!item.last||row.created_at>item.last))item.last=row.created_at;
          item.sources.add(row.telemetry_source||'unknown');groups.set(key,item);
        });
        const safeDate=value=>{const d=value?new Date(value):null;return d&&!Number.isNaN(d.getTime())?d.toLocaleString():'—';};
        [...groups.values()].sort((a,b)=>b.requests-a.requests||String(a.model).localeCompare(String(b.model))).forEach(item=>{
          const tr=el('tr');
          [item.provider,item.model,'not listed',numberText(item.requests),numberText(item.successes)+' / '+numberText(item.failures),numberText(item.input)+' / '+numberText(item.output),item.costKnown?moneyText(item.cost):'Unknown',safeDate(item.first)+' / '+safeDate(item.last),[...item.sources].join(', ')].forEach((value,i)=>{const td=el('td',i===1?'model-id-cell':'',String(value));tr.append(td);});
          tbody.append(tr);
        });
        if(!groups.size){const tr=el('tr'),td=el('td','','No confirmed unlisted models were observed in this time range. Unknown catalog states are shown in the summary and are not classified as unlisted.');td.colSpan=10;tr.append(td);tbody.append(tr);}
        table.append(tbody);wrap.append(table);result.append(wrap);
        if(payload.coverage_limited)result.append(notice('Telemetry coverage is limited','At least one source returned 1,000 rows; extend server-side pagination before treating these counts as exhaustive.'));
      } catch(error) {
        result.replaceChildren(notice('Unlisted model data unavailable',String(error?.message||'Provider telemetry could not be loaded.')));
      } finally {refresh.disabled=false;}
    }
    refresh.addEventListener('click',load);windowSelect.addEventListener('change',load);await load();
  }

  async function renderActivities() {
    const c=$('content');c.replaceChildren();
    c.append(head('AI Models Activities','Provider/model summaries for observed requests. Costs are included only when a provider-reported cost is present; internal estimates are not presented as provider charges.','Read-only'));
    const controls=el('div','provider-log-filters');
    const providerLabel=el('label','provider-log-field');providerLabel.append(el('span','','Provider'));
    const providerSelect=el('select','provider-log-control');
    [['all','All providers'],['openrouter','OpenRouter'],['google','Google'],['openai','OpenAI'],['anthropic','Anthropic']].forEach(([value,label])=>{const option=el('option','',label);option.value=value;providerSelect.append(option);});providerLabel.append(providerSelect);
    const windowLabel=el('label','provider-log-field');windowLabel.append(el('span','','Time range'));
    const windowSelect=el('select','provider-log-control');
    [['15m','Past 15 minutes'],['30m','Past 30 minutes'],['1h','Past hour'],['5h','Past 5 hours'],['12h','Past 12 hours'],['24h','Past 24 hours'],['7d','Past 7 days'],['30d','Past 30 days'],['90d','Past 90 days']].forEach(([value,label])=>{const option=el('option','',label);option.value=value;windowSelect.append(option);});windowSelect.value='24h';windowLabel.append(windowSelect);
    const refresh=el('button','quiet-button','Refresh activities');refresh.type='button';controls.append(providerLabel,windowLabel,refresh);c.append(controls);
    const result=el('div');result.append(notice('Loading AI activity','Aggregating provider/model telemetry for the selected period.'));c.append(result);
    async function load(){
      refresh.disabled=true;result.replaceChildren(notice('Loading AI activity','Fetching provider telemetry.'));
      try{
        const params=new URLSearchParams({scope:'all',window:windowSelect.value,provider:providerSelect.value,limit:'1000',offset:'0'});
        const response=await fetch('/owner/api/ai-logs?'+params.toString(),{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});
        const payload=await response.json();if(!response.ok)throw new Error(payload?.error?.message||'AI activity unavailable.');
        const rows=Array.isArray(payload.rows)?payload.rows:[];
        // Keep the common providers visible, and add any provider surfaced by actual telemetry.
        const knownProviders=new Set(Array.from(providerSelect.options).map(option=>option.value));
        [...new Set(rows.map(row=>String(row.provider||'unknown').trim().toLowerCase()).filter(Boolean))].sort().forEach(provider=>{
          if(!knownProviders.has(provider)){
            const option=el('option','',provider.split(/[-_. ]+/).map(part=>part?part[0].toUpperCase()+part.slice(1):'').join(' '));
            option.value=provider;providerSelect.append(option);knownProviders.add(provider);
          }
        });
        const groups=new Map();
        rows.forEach(row=>{
          const key=String(row.provider||'unknown')+'\u0000'+String(row.model||'unknown');
          const item=groups.get(key)||{provider:row.provider||'unknown',model:row.model||'unknown',requests:0,successes:0,failures:0,unknown:0,cost:0,costKnown:0,estimate:0,estimateKnown:0,last:null,latestStatus:'unknown',latestModelStatus:'unknown',latestCatalogStatus:'unknown',statusCounts:{},sources:new Set()};
          const rawStatus=String(row.status||'unknown').trim().toLowerCase()||'unknown';
          const successStatuses=['success','ok','succeeded','complete','completed'];
          const failureStatuses=['error','failed','failure','timeout','timed_out','cancelled','canceled'];
          item.requests++;if(successStatuses.includes(rawStatus))item.successes++;else if(failureStatuses.includes(rawStatus))item.failures++;else item.unknown++;
          item.statusCounts[rawStatus]=(item.statusCounts[rawStatus]||0)+1;
          if(row.cost_kind==='provider_reported'&&row.total_cost_usd!=null&&Number.isFinite(Number(row.total_cost_usd))&&Number(row.total_cost_usd)>=0){item.cost+=Number(row.total_cost_usd);item.costKnown++;}
          if(row.cost_kind==='estimated'&&row.total_cost_usd!=null&&Number.isFinite(Number(row.total_cost_usd))&&Number(row.total_cost_usd)>=0){item.estimate+=Number(row.total_cost_usd);item.estimateKnown++;}
          if(row.telemetry_source)item.sources.add(String(row.telemetry_source));
          if(row.created_at&&(!item.last||row.created_at>item.last)){item.last=row.created_at;item.latestStatus=rawStatus;item.latestModelStatus=String(row.model_status||'observed');item.latestCatalogStatus=String(row.catalog_status||'unknown');}groups.set(key,item);
        });
        result.replaceChildren();
        const summary=el('div','grid');
        const total=rows.length,success=rows.filter(row=>row.status==='success').length,failed=rows.filter(row=>row.status==='error').length;
        const costs=rows.filter(row=>row.cost_kind==='provider_reported'&&row.total_cost_usd!=null&&Number.isFinite(Number(row.total_cost_usd)));
        summary.append(metric('Requests','✳',numberText(total),'Observed in selected telemetry window'),metric('Successful','✓',numberText(success),'Provider/app outcome recorded as success'),metric('Failed','!',numberText(failed),'Provider/app outcome recorded as error'),metric('Provider-reported cost','USD',costs.length?moneyText(costs.reduce((sum,row)=>sum+Number(row.total_cost_usd),0)):'Unavailable',numberText(costs.length)+' requests with provider cost'));
        result.append(summary);
        result.append(el('p','panel-copy','Source: '+String(payload.source||'provider telemetry')+' · refreshed '+(payload.generated_at?new Date(payload.generated_at).toLocaleString():'unknown')+' · window '+String(payload.window||windowSelect.value)+(payload.coverage_limited?' · telemetry cap reached; results may be incomplete':'')+'. Every status returned by recorded telemetry is retained; unknown, inferred, and unavailable states are not filtered out. Catalog status is separate from runtime status. Requests made outside NasrinAI are included only when a connected provider activity source records them.'));
        const wrap=el('div','table-wrap'),table=el('table','data-table'),thead=el('thead'),hr=el('tr');
        ['Provider','Model ID','Requests','Success','Failed','Other statuses','Latest request status','Model state','Catalog status','Provider-reported cost (USD)','Internal estimate (USD)','Requests with provider cost','Source','Latest activity'].forEach(label=>hr.append(el('th','',label)));thead.append(hr);table.append(thead);const tbody=el('tbody');
        [...groups.values()].sort((a,b)=>b.requests-a.requests||String(a.model).localeCompare(String(b.model))).forEach(item=>{
          const statusBreakdown=Object.entries(item.statusCounts).sort((a,b)=>b[1]-a[1]).map(([status,count])=>status+' ('+numberText(count)+')').join(', ');
          const sourceList=[...item.sources].sort().join(', ')||'unknown';
          const tr=el('tr');[item.provider,item.model,numberText(item.requests),numberText(item.successes),numberText(item.failures),numberText(item.unknown)+' · '+(statusBreakdown||'unknown'),item.latestStatus,item.latestModelStatus,item.latestCatalogStatus,item.costKnown?moneyText(item.cost):'Unknown',item.estimateKnown?moneyText(item.estimate):'Unknown',numberText(item.costKnown),sourceList,item.last?new Date(item.last).toLocaleString():'—'].forEach((value,i)=>{const td=el('td',i===1?'model-id-cell':'',String(value));tr.append(td);});tbody.append(tr);
        });
        if(!groups.size){const tr=el('tr'),td=el('td','','No model activity found for the selected provider and time range.');td.colSpan=14;tr.append(td);tbody.append(tr);}
        table.append(tbody);wrap.append(table);result.append(wrap);
        addTableSettings(result, table, 'ai-model-activities');
        if(payload.coverage_limited)result.append(notice('Telemetry coverage is limited','At least one source returned 1,000 rows. Counts may be incomplete for this period.'));
      }catch(error){result.replaceChildren(notice('AI Models Activities unavailable',String(error?.message||'Provider activity could not be loaded.')));}
      finally{refresh.disabled=false;}
    }
    refresh.addEventListener('click',load);providerSelect.addEventListener('change',load);windowSelect.addEventListener('change',load);await load();
  }

  async function renderRegional() {
    const c = $('content');
    c.replaceChildren();
    c.append(head('Regional user analytics', 'Approximate location from trusted Vercel edge headers. No GPS, raw IP addresses, emails, or individual user identities are displayed.', 'Read-only'));
    c.append(notice('Privacy & interpretation', 'Location can be imprecise or unavailable, especially for VPNs and mobile networks. Counts represent recorded session-start events and pseudonymous actors within the selected window—not exact people physically present. Events expire after 90 days.'));
    const controls = el('div', 'toolbar');
    const windowSelect = el('select', 'input');
    windowSelect.setAttribute('aria-label', 'Regional analytics time window');
    [['24h','Last 24 hours'],['7d','Last 7 days'],['30d','Last 30 days'],['90d','Last 90 days']].forEach(([value,label]) => {
      const option = el('option', '', label); option.value = value; windowSelect.append(option);
    });
    windowSelect.value = '7d';
    const refreshButton = el('button', 'quiet-button', 'Refresh regional data');
    refreshButton.type = 'button';
    controls.append(windowSelect, refreshButton);
    c.append(controls);
    const result = el('div');
    result.append(notice('Loading regional data', 'Loading aggregate region counts from the protected owner API.'));
    c.append(result);
    async function load() {
      refreshButton.disabled = true;
      windowSelect.disabled = true;
      result.replaceChildren(notice('Loading regional data', 'Fetching aggregate counts from the server.'));
      try {
        const response = await fetch('/owner/api/regional-analytics?window=' + encodeURIComponent(windowSelect.value), {
          credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' }
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error?.message || 'Regional analytics is unavailable.');
        const summary = payload.summary && typeof payload.summary === 'object' ? payload.summary : {};
        const rows = Array.isArray(payload.rows) ? payload.rows.filter(row => row && typeof row === 'object') : [];
        result.replaceChildren();
        result.append(el('p', 'panel-copy', 'Source: private regional analytics events · window ' + String(payload.window || windowSelect.value) + ' · refreshed ' + (payload.generated_at ? new Date(payload.generated_at).toLocaleString() : 'unknown')));
        const grid = el('div', 'grid');
        grid.append(
          metric('Session events', '◎', numberText(summary.event_count), 'Deduplicated session starts'),
          metric('Pseudonymous actors', '♙', numberText(summary.unique_actors), 'Hashed user/guest identifiers; no IDs exposed'),
          metric('Countries observed', '⌖', numberText(summary.countries_seen), 'Country code available from edge metadata'),
          metric('Registered-user events', '♧', numberText(summary.user_events), 'Session events for signed-in users'),
          metric('Guest events', '◇', numberText(summary.guest_events), 'Session events for guest sessions')
        );
        result.append(grid);
        const panel = el('section', 'panel');
        panel.classList.add('module-extra');
        panel.append(el('h3', '', 'Observed regions'), el('p', 'panel-copy', 'Grouped by approximate country, region, city, and actor type. Unknown location fields remain blank instead of being inferred.'));
        const wrap = el('div', 'table-wrap'), table = el('table', 'data-table');
        const thead = el('thead'), header = el('tr');
        ['Country','Region / state','City','Actor type','Events','Unique actors','Latest activity'].forEach(label => header.append(el('th', '', label)));
        thead.append(header); table.append(thead);
        const tbody = el('tbody');
        const safeDate = value => {
          if (!value) return '—';
          const parsed = new Date(value);
          return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleString();
        };
        rows.sort((a,b) => (Number(b.events)||0) - (Number(a.events)||0) || String(a.country_code||'').localeCompare(String(b.country_code||'')));
        rows.forEach(row => {
          const tr = el('tr');
          [row.country_code || 'Unknown', row.region || '—', row.city || '—', row.actor_type || 'unknown',
            numberText(row.events), numberText(row.unique_actors), safeDate(row.latest_activity)]
            .forEach(value => tr.append(el('td', '', String(value))));
          tbody.append(tr);
        });
        if (!rows.length) {
          const tr = el('tr'), td = el('td', '', 'No regional events recorded for this period. Once the feature is deployed and sessions arrive with trusted edge location headers, aggregate results will appear here.');
          td.colSpan = 7; tr.append(td); tbody.append(tr);
        }
        table.append(tbody); wrap.append(table); panel.append(wrap); result.append(panel);
      } catch (error) {
        result.replaceChildren(notice('Regional analytics unavailable', String(error?.message || 'Could not load regional analytics. Verify migration 071 and production deployment.')));
      } finally {
        refreshButton.disabled = false;
        windowSelect.disabled = false;
      }
    }
    refreshButton.addEventListener('click', load);
    windowSelect.addEventListener('change', load);
    await load();
  }

  function show(key) {
    active = names[key] ? key : 'overview';
    const meta = names[active];
    $('page-title').textContent = meta[0];
    $('page-description').textContent = meta[1];
    $('crumb').textContent = active === 'overview' ? 'Overview' : meta[0];
    document.querySelectorAll('.nav-item').forEach((button) => {
      const selected = button.dataset.panel === active;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-current', selected ? 'page' : 'false');
    });
    if (active === 'overview') renderOverview();
    else if (active === 'learning') renderLearning();
    else if (active === 'openrouter-unlisted') renderUnlistedModels();
    else if (active === 'other-unlisted') renderActivities();
    else if (active === 'regional') renderRegional();
    else renderModule(active);
  }
  async function refresh() {
    $('freshness').textContent = 'Checking data sources…';
    try {
      const response = await fetch('/owner/api/overview', { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } });
      if (response.status === 404) { window.location.href = 'https://www.nasrinai.com/'; return; }
      if (!response.ok) throw new Error('refresh failed');
      data = await response.json();
      $('freshness').textContent = 'Checked ' + new Date(data.generated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' · sources pending';
      show(active);
    } catch {
      $('freshness').textContent = 'Could not refresh';
      $('content').replaceChildren(el('div', 'error-state', 'The secure overview could not be refreshed. No data was cached. Try again, or sign out and open the console again.'));
    }
  }
  document.querySelectorAll('.nav-item').forEach((button) => button.addEventListener('click', () => show(button.dataset.panel)));
  const refreshButton = el('button', 'quiet-button', 'Refresh');
  refreshButton.type = 'button';
  refreshButton.addEventListener('click', () => {
    refreshButton.disabled = true;
    refresh().finally(() => { refreshButton.disabled = false; });
  });
  $('signout').parentElement.insertBefore(refreshButton, $('signout'));
  $('signout').addEventListener('click', async () => {
    $('signout').disabled = true;
    try { await fetch('/owner/api/session', { method: 'DELETE', credentials: 'same-origin', cache: 'no-store' }); } catch {}
    window.location.href = 'https://www.nasrinai.com/';
  });
  show('overview');
  refresh();
})();
