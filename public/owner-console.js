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
    intelligence: ['Continuous Intelligence', 'Hourly crawl health, trusted source coverage, and recent indexed pages. Retrieval is keyword-based until semantic indexing is implemented.', '↻'],
    users: ['Users & Growth', 'Account totals, usage-based activity, and first-observed retention cohorts.', '♙'],
    regional: ['Regional Analytics', 'Approximate location trends for registered users and guests, derived from trusted edge metadata.', '◎'],
    'google-analytics': ['Google Search & Traffic', 'Google Search Console clicks and impressions alongside GA4 visits and page engagement.', '⌕'],
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
    link.href = 'https://github.com/nasrinaiv0/nasrinAI/actions/workflows/verify-openrouter-models.yml';
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

      const estimatePanel = el('section', 'panel');
      estimatePanel.classList.add('module-extra');
      estimatePanel.append(el('h3', '', 'Estimated direct-provider request spend'));
      estimatePanel.append(el('p', 'panel-copy', 'Summed from request-level token usage and the versioned list-price registry. This is an estimate, not an invoice total; free Gemini quota, Cloudflare neuron allocations, and provider-specific discounts are not allocated per request.'));
      const estimateResult = el('div');
      estimateResult.append(notice('Loading estimates', 'Reading aggregated estimates from recorded request usage.'));
      estimatePanel.append(estimateResult);
      c.append(estimatePanel);
      const loadEstimates = async () => {
        estimateResult.replaceChildren(notice('Loading estimates', 'Fetching aggregate request estimates for ' + windowSelect.value + '.'));
        try {
          const response = await fetch('/owner/api/estimated-costs?window=' + encodeURIComponent(windowSelect.value), { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } });
          const payload = await response.json();
          if (!response.ok) throw new Error(payload?.error?.message || 'Estimated request costs unavailable.');
          const summary = payload.summary || {};
          estimateResult.replaceChildren();
          estimateResult.append(el('p', 'panel-copy', 'Updated ' + new Date(payload.generated_at).toLocaleString() + ' · ' + payload.window + ' · ' + numberText(summary.request_count || 0) + ' priced requests.'));
          const grid = el('div', 'grid');
          grid.append(metric('Estimated request spend', 'USD', moneyText(summary.estimated_total_usd), 'Versioned list-price estimate · not actual provider billing'));
          grid.append(metric('Priced requests', 'Σ', numberText(summary.request_count || 0), (Array.isArray(summary.pricing_versions) ? summary.pricing_versions.join(', ') : 'Pricing version unavailable')));
          estimateResult.append(grid);
          const list = el('div', 'source-list');
          (Array.isArray(summary.rows) ? summary.rows : []).forEach((item) => {
            const row = el('div', 'source-row'), left = el('div');
            left.append(el('div', 'source-name', String(item.provider || 'unknown') + ' · ' + String(item.model || 'unknown model')),
              el('div', 'source-detail', numberText(item.request_count || 0) + ' requests · latest ' + (item.latest_at ? new Date(item.latest_at).toLocaleString() : 'unknown')));
            row.append(left, el('div', 'source-name', moneyText(item.estimated_cost_usd)));
            list.append(row);
          });
          if (!summary.rows?.length) list.append(el('p', 'panel-copy', 'No priced direct-provider request estimates found in this window.'));
          estimateResult.append(list);
          estimateResult.append(notice('Estimate boundary', payload.note || 'Estimates are separate from provider-reported actual costs.'));
        } catch (error) {
          estimateResult.replaceChildren(notice('Estimated request costs unavailable', String(error?.message || 'Confirm migration 077 is applied and retry.')));
        }
      };
      windowSelect.addEventListener('change', loadEstimates);
      loadEstimates();

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
          const billingProviders = [
            ['openai','OpenAI organization spend'],
            ['anthropic','Anthropic organization spend'],
            ['google','Google Gemini account spend'],
            ['groq','Groq account spend'],
            ['cloudflare','Cloudflare Workers AI / account spend'],
            ['cerebras','Cerebras account spend'],
            ['mistral','Mistral account spend'],
            ['nvidia_nim','NVIDIA NIM account spend']
          ];
          for (const [id, label] of billingProviders) {
            const item = providers[id] || { status: 'not_available', source: 'billing_api_not_integrated', total_usd: null, rows: [] };
            const statusLabel = item.status === 'available' ? 'Provider-reported · aggregate'
              : item.status === 'not_configured' ? 'Billing credentials not configured'
              : item.status === 'not_available' ? 'No verified billing API integration'
              : 'Unavailable · check provider credentials or API';
            grid.append(metric(label, 'USD', moneyText(item.total_usd), statusLabel));
          }
          result.append(grid);
          const list = el('div','source-list');
          for (const [id, label] of billingProviders) {
            const item = providers[id] || { status: 'not_available', source: 'billing_api_not_integrated', total_usd: null, rows: [] };
            const row = el('div','source-row'), left = el('div');
            const displayName = label.replace(' organization spend','').replace(' account spend','').replace(' / account spend','');
            const detail = item.status === 'not_available'
              ? 'No verified organization billing API integrated'
              : item.status === 'not_configured'
                ? 'Provider billing API credentials are not configured'
                : String(item.source || 'billing API') + ' · ' + numberText(Array.isArray(item.rows) ? item.rows.length : 0) + ' report line items';
            left.append(el('div','source-name',displayName),el('div','source-detail',detail));
            const stateLabel = item.status === 'available' ? 'Available' : item.status === 'not_configured' ? 'Not configured' : item.status === 'not_available' ? 'Not integrated' : 'Unavailable';
            row.append(left,state(stateLabel,item.status === 'available' ? 'available' : 'unavailable'));
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
  async function renderIntelligence() {
    const c = $('content');
    c.replaceChildren();
    c.append(head('Continuous Intelligence', 'Crawl status and indexed source evidence. Counts are bounded samples, not global totals.', 'Read-only'));
    const panel = el('section', 'panel');
    const toolbar = el('div', 'toolbar');
    const refreshButton = el('button', 'quiet-button', 'Refresh crawl status');
    refreshButton.type = 'button';
    toolbar.append(refreshButton);
    panel.append(toolbar);
    const result = el('div');
    result.append(notice('Loading crawl telemetry', 'Fetching queue and indexed-page metadata from the server. No page bodies or raw errors are returned.'));
    panel.append(result);
    c.append(panel);
    async function load() {
      refreshButton.disabled = true;
      result.replaceChildren(notice('Loading crawl telemetry', 'Fetching current queue and indexed-page metadata.'));
      try {
        const response = await fetch('/owner/api/continuous-intelligence', { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } });
        if (response.status === 404) { window.location.href = 'https://www.nasrinai.com/'; return; }
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error?.message || 'Crawler telemetry is unavailable.');
        result.replaceChildren();
        const queue = payload.queue || {}, statuses = queue.status_counts || {}, sources = queue.source_counts || {};
        const pages = Array.isArray(payload.recent_pages) ? payload.recent_pages : [];
        const grid = el('div', 'grid');
        grid.append(
          metric('Queue rows sampled', '≋', numberText(payload.coverage?.queue_rows_sampled), 'Latest queue rows; limit 500'),
          metric('Queued', '◷', numberText(statuses.queued || 0), 'Rows in the sample'),
          metric('Retrying', '↻', numberText(statuses.retry || 0), 'Rows in the sample'),
          metric('Indexed pages sampled', '▤', numberText(payload.coverage?.page_rows_sampled), 'Latest page metadata; limit 50'),
          metric('Official learning seeds', '✓', numberText(sources.owner_seed || 0), 'Seed and same-host descendants in queue sample'),
          metric('Discovered research URLs', '⌕', numberText(sources.discovered || 0), 'Other discovered links in queue sample')
        );
        result.append(grid);
        result.append(notice('Retrieval and training status', 'Current retrieval: bounded keyword search over indexed page text, filtered to official HTTPS documentation hosts and cited in relevant platform coding answers. Semantic embeddings/vector ranking and model fine-tuning are not implemented by this feature. Crawling knowledge does not retrain model weights.'));
        if (payload.coverage?.queue_sample_may_be_truncated) result.append(notice('Queue sample is capped', 'The queue sample reached 500 rows. Counts shown here are sampled and must not be interpreted as exact global totals.'));
        const tableWrap = el('div', 'table-wrap'), table = el('table', 'data-table');
        const thead = el('thead'), header = el('tr');
        ['Source title','Official documentation URL','Fetched at','Content hash'].forEach(label => header.append(el('th','',label)));
        thead.append(header); table.append(thead);
        const tbody = el('tbody');
        for (const page of pages) {
          const row = el('tr');
          row.append(el('td','',page.title || 'Untitled'));
          const linkCell = el('td'), link = el('a','',page.url || '');
          link.href = page.url;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          linkCell.append(link);
          row.append(linkCell, el('td','',page.fetched_at || 'Unavailable'), el('td','',page.content_hash ? page.content_hash.slice(0,16) + '…' : 'Unavailable'));
          tbody.append(row);
        }
        if (!pages.length) {
          const row = el('tr'), cell = el('td','', 'No indexed pages are available in the current sample.');
          cell.colSpan = 4; row.append(cell); tbody.append(row);
        }
        table.append(tbody); tableWrap.append(table); result.append(tableWrap);
        result.append(el('p','panel-copy','Last checked: ' + new Date(payload.generated_at).toLocaleString() + '. Queue counts reflect a sample of up to 500 rows; page history shows up to 50 records.'));
      } catch (error) {
        result.replaceChildren(notice('Continuous intelligence unavailable', String(error?.message || 'Check the owner session and server-side crawl tables.')));
      } finally { refreshButton.disabled = false; }
    }
    refreshButton.addEventListener('click', load);
    await load();
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


  async function renderGoogleAnalytics() {
    const c = $('content');
    c.replaceChildren(head('Google Search & Traffic', 'Google Search Console + Google Analytics 4 · reporting uses completed days only.', 'Read-only'));
    const controls = el('div', 'toolbar');
    const windowSelect = el('select', 'input');
    windowSelect.setAttribute('aria-label', 'Google analytics date range');
    [['7d','Last 7 days'],['28d','Last 28 days'],['90d','Last 90 days']].forEach(([value,label]) => {
      const option = el('option', '', label); option.value = value; windowSelect.append(option);
    });
    const refreshButton = el('button', 'quiet-button', 'Refresh Google data'); refreshButton.type = 'button';
    controls.append(windowSelect, refreshButton); c.append(controls);
    const result = el('div'); result.append(notice('Loading Google data', 'Requesting aggregate search and website traffic metrics from Google.'));
    c.append(result);
    const safeNumber = value => value === null || value === undefined ? 'Unavailable' : numberText(value);
    const safePercent = value => value === null || value === undefined ? 'Unavailable' : (Number(value) * 100).toFixed(2) + '%';
    const makeTable = (title, columns, rows, emptyText) => {
      const panel = el('section', 'panel'); panel.classList.add('module-extra');
      panel.append(el('h3', '', title));
      const wrap = el('div', 'table-wrap'), table = el('table', 'data-table'), thead = el('thead'), tr = el('tr');
      columns.forEach(label => tr.append(el('th', '', label)));
      thead.append(tr); table.append(thead);
      const tbody = el('tbody');
      rows.forEach(row => { const line = el('tr'); row.forEach(value => line.append(el('td', '', String(value ?? '—')))); tbody.append(line); });
      if (!rows.length) { const line = el('tr'), cell = el('td', '', emptyText); cell.colSpan = columns.length; line.append(cell); tbody.append(line); }
      table.append(tbody); wrap.append(table); panel.append(wrap); return panel;
    };
    const load = async () => {
      refreshButton.disabled = true; windowSelect.disabled = true;
      result.replaceChildren(notice('Loading Google data', 'No metrics are cached in the browser; fetching a fresh server-side report.'));
      try {
        const response = await fetch('/owner/api/google-search-analytics?window=' + encodeURIComponent(windowSelect.value), { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } });
        if (response.status === 404) { window.location.href = 'https://www.nasrinai.com/'; return; }
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error?.message || 'Google analytics request failed.');
        result.replaceChildren();
        if (payload.status === 'not_configured') {
          result.append(notice('Google integration needs setup', payload.setup || 'Configure the server-side Google Analytics and Search Console credentials in Vercel.'));
          refreshButton.disabled = false; windowSelect.disabled = false;
          return;
        }
        const range = payload.date_range || {};
        result.append(el('p', 'panel-copy', 'Reporting window: ' + (range.start || '—') + ' to ' + (range.end || '—') + '. Google Search Console data may be delayed; these metrics are not real-time.'));
        const ga = payload.analytics || {}, sc = payload.search_console || {};
        const grid = el('div', 'grid');
        [
          metric('Website sessions', '↗', safeNumber(ga.sessions), 'GA4 · ' + (ga.status || 'unavailable')),
          metric('Website visitors', '♙', safeNumber(ga.total_users), 'GA4 total users'),
          metric('New visitors', '＋', safeNumber(ga.new_users), 'GA4 new users'),
          metric('Page views', '▤', safeNumber(ga.screen_page_views), 'GA4 screen/page views'),
          metric('Google Search clicks', '⌕', safeNumber(sc.clicks), 'Clicks from Google Search'),
          metric('Search impressions', '◎', safeNumber(sc.impressions), 'Appearances in Google Search'),
          metric('Search CTR', '%', safePercent(sc.ctr), 'Clicks divided by impressions'),
          metric('Average position', '↕', sc.average_position === null || sc.average_position === undefined ? 'Unavailable' : Number(sc.average_position).toFixed(1), 'Search Console reported average')
        ].forEach(card => grid.append(card));
        result.append(grid);
        result.append(makeTable('Top website pages', ['Page path','Sessions','Users','Page views'],
          (Array.isArray(ga.top_pages) ? ga.top_pages : []).map(row => [row.page, safeNumber(row.sessions), safeNumber(row.users), safeNumber(row.page_views)]),
          'No GA4 page rows are available for this range.'));
        result.append(makeTable('Top Google search queries', ['Search query','Clicks','Impressions','CTR','Avg. position'],
          (Array.isArray(sc.top_queries) ? sc.top_queries : []).map(row => [row.query, safeNumber(row.clicks), safeNumber(row.impressions), safePercent(row.ctr), row.position === null || row.position === undefined ? 'Unavailable' : Number(row.position).toFixed(1)]),
          'No query rows are available. Search Console may omit anonymized queries.'));
        result.append(makeTable('Pages found in Google Search', ['Page','Clicks','Impressions','CTR','Avg. position'],
          (Array.isArray(sc.top_pages) ? sc.top_pages : []).map(row => [row.page, safeNumber(row.clicks), safeNumber(row.impressions), safePercent(row.ctr), row.position === null || row.position === undefined ? 'Unavailable' : Number(row.position).toFixed(1)]),
          'No Search Console page rows are available for this range.'));
        if (ga.status !== 'available' || sc.status !== 'available') result.append(notice('Some metrics are unavailable', 'Check that the service account has GA4 Viewer access and Search Console property access. Each source can fail independently.'));
      } catch (error) {
        result.replaceChildren(notice('Google analytics unavailable', String(error?.message || 'Could not load Google analytics. Check server-side configuration and permissions.')));
      } finally { refreshButton.disabled = false; windowSelect.disabled = false; }
    };
    refreshButton.addEventListener('click', load);
    windowSelect.addEventListener('change', load);
    await load();
  }

  // ---------------------------------------------------------------------------
  // Owner Command Center pages. Every figure comes from a server-side source;
  // a missing source renders an empty state, never placeholder numbers.
  // Charts are built with DOM/SVG APIs only (strict CSP: no inline code or styles).
  // ---------------------------------------------------------------------------
  const NS = 'http://www.w3.org/2000/svg';
  const LINKS = {
    ncc: 'https://ncc.nasrinai.com/',
    vercel: 'https://vercel.com/dashboard',
    supabase: 'https://supabase.com/dashboard/projects',
    github: 'https://github.com/nasrinaiv0/nasrinAI',
    actions: 'https://github.com/nasrinaiv0/nasrinAI/actions',
    pulls: 'https://github.com/nasrinaiv0/nasrinAI/pulls',
    githubSecurity: 'https://github.com/nasrinaiv0/nasrinAI/security',
    paymongo: 'https://dashboard.paymongo.com/',
    openrouter: 'https://openrouter.ai/activity',
    searchConsole: 'https://search.google.com/search-console',
    analytics: 'https://analytics.google.com/'
  };
  const ICONS = {
    home: ['m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z', 'M9 22V12h6v10'],
    cpu: ['r:4,4,16,16,2', 'r:9,9,6,6,1', 'M15 2v2M15 20v2M2 15h2M2 9h2M20 15h2M20 9h2M9 2v2M9 20v2'],
    users: ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'c:9,7,4', 'M22 21v-2a4 4 0 0 0-3-3.87', 'M16 3.13a4 4 0 0 1 0 7.75'],
    user: ['M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2', 'c:12,7,4'],
    image: ['r:3,3,18,18,2', 'c:9,9,2', 'm21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21'],
    dollar: ['M12 2v20', 'M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6'],
    layers: ['m12 2 10 5-10 5L2 7z', 'm2 17 10 5 10-5', 'm2 12 10 5 10-5'],
    shield: ['M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z'],
    share: ['c:18,5,3', 'c:6,12,3', 'c:18,19,3', 'm8.59 13.51 6.83 3.98', 'm15.41 6.51-6.82 3.98'],
    'check-circle': ['c:12,12,10', 'm9 12 2 2 4-4'],
    file: ['M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z', 'M14 2v4a2 2 0 0 0 2 2h4', 'M10 9H8M16 13H8M16 17H8'],
    settings: ['c:12,12,3', 'M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z'],
    'chevron-right': ['m9 18 6-6-6-6'],
    arrow: ['M5 12h14', 'm12 5 7 7-7 7'],
    menu: ['M4 6h16M4 12h16M4 18h16'],
    calendar: ['r:3,4,18,18,2', 'M16 2v4M8 2v4M3 10h18'],
    bell: ['M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9', 'M10.3 21a1.94 1.94 0 0 0 3.4 0'],
    message: ['M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'],
    database: ['M3 5c0-1.66 4-3 9-3s9 1.34 9 3-4 3-9 3-9-1.34-9-3', 'M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5', 'M3 12c0 1.66 4 3 9 3s9-1.34 9-3'],
    activity: ['M22 12h-4l-3 9L9 3l-3 9H2'],
    clock: ['c:12,12,10', 'M12 6v6l4 2'],
    alert: ['m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3', 'M12 9v4', 'M12 17h.01'],
    zap: ['M13 2 3 14h9l-1 8 10-12h-9l1-8z'],
    video: ['m16 13 5.22 3.48a.5.5 0 0 0 .78-.42V7.94a.5.5 0 0 0-.78-.42L16 11', 'r:2,6,14,12,2'],
    upload: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'm17 8-5-5-5 5', 'M12 3v12'],
    download: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'm7 10 5 5 5-5', 'M12 15V3'],
    refresh: ['M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8', 'M21 3v5h-5', 'M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16', 'M8 16H3v5'],
    play: ['m6 3 14 9-14 9z'],
    pause: ['M8 4v16M16 4v16'],
    globe: ['c:12,12,10', 'M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20', 'M2 12h20'],
    lock: ['r:3,11,18,11,2', 'M7 11V7a5 5 0 0 1 10 0v4'],
    key: ['c:7.5,15.5,5.5', 'm21 2-9.6 9.6', 'm15.5 7.5 3 3L22 7l-3-3'],
    server: ['r:2,2,20,8,2', 'r:2,14,20,8,2', 'M6 6h.01M6 18h.01'],
    terminal: ['m4 17 6-6-6-6', 'M12 19h8'],
    search: ['c:11,11,8', 'm21 21-4.3-4.3'],
    plus: ['M5 12h14M12 5v14'],
    x: ['M18 6 6 18M6 6l12 12'],
    check: ['M20 6 9 17l-5-5'],
    branch: ['M6 3v12', 'c:18,6,3', 'c:6,18,3', 'M18 9a9 9 0 0 1-9 9'],
    box: ['M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z', 'm3.3 7 8.7 5 8.7-5', 'M12 22V12'],
    cloud: ['M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9z'],
    list: ['M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01'],
    chart: ['M3 3v18h18', 'M18 17V9', 'M13 17V5', 'M8 17v-3'],
    card: ['r:2,5,20,14,2', 'M2 10h20'],
    rotate: ['M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8', 'M3 3v5h5'],
    external: ['M15 3h6v6', 'M10 14 21 3', 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6'],
    printer: ['M6 9V2h12v7', 'M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2', 'r:6,14,12,8,0'],
    sun: ['c:12,12,4', 'M12 2v2M12 20v2m-7.07-14.07 1.41 1.41m11.32 11.32 1.41 1.41M2 12h2M20 12h2m-14.07 7.07 1.41-1.41m11.32-11.32 1.41-1.41'],
    moon: ['M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z'],
    monitor: ['r:2,3,20,14,2', 'M8 21h8M12 17v4'],
    eye: ['M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7', 'c:12,12,3'],
    mail: ['r:2,4,20,16,2', 'm22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7'],
    trend: ['m22 7-8.5 8.5-5-5L2 17', 'M16 7h6v6'],
    code: ['m16 18 6-6-6-6', 'm8 6-6 6 6 6'],
    flag: ['M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z', 'M4 22v-7'],
    dot: ['c:12,12,3']
  };
  const TONES = { blue: 1, green: 2, amber: 3, pink: 4, purple: 5, cyan: 6 };
  let dash = null;
  let release = null;
  let incidentsCache = null;
  let activeTab = 'dashboard';
  let liveTimer = null;
  let liveOn = true;
  const prefs = loadPrefs();

  function loadPrefs() {
    const defaults = { theme: 'dark', accent: 'blue', sidebar: 'default', font: 'medium', range: '7d', dateFormat: 'medium', timeFormat: '12h', usageMetric: 'requests' };
    try {
      const saved = JSON.parse(localStorage.getItem('nasrinai-owner-prefs') || '{}');
      const allowed = { theme: ['dark', 'light', 'system'], accent: ['blue', 'green', 'amber', 'pink', 'purple', 'mono'], sidebar: ['default', 'compact'], font: ['small', 'medium', 'large'], range: ['7d', '14d', '30d'], dateFormat: ['medium', 'iso', 'dmy'], timeFormat: ['12h', '24h'], usageMetric: ['requests', 'conversations', 'tokens', 'active'] };
      Object.keys(allowed).forEach((key) => { if (allowed[key].includes(saved[key])) defaults[key] = saved[key]; });
    } catch (_) {}
    return defaults;
  }
  function savePrefs() { try { localStorage.setItem('nasrinai-owner-prefs', JSON.stringify(prefs)); } catch (_) {} }
  function applyPrefs() {
    const root = document.documentElement;
    root.dataset.theme = prefs.theme; root.dataset.accent = prefs.accent; root.dataset.sidebar = prefs.sidebar; root.dataset.font = prefs.font;
  }

  // ---- small DOM helpers ----------------------------------------------------
  function svgEl(tag, attrs, cls) {
    const n = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach((k) => n.setAttribute(k, String(attrs[k])));
    if (cls) n.setAttribute('class', cls);
    return n;
  }
  function icon(name) {
    const wrap = el('span', 'icon'), s = svgEl('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' });
    (ICONS[name] || ICONS.dot).forEach((d) => {
      if (d.startsWith('c:')) { const [cx, cy, r] = d.slice(2).split(','); s.append(svgEl('circle', { cx, cy, r })); }
      else if (d.startsWith('r:')) { const [x, y, width, height, rx] = d.slice(2).split(','); s.append(svgEl('rect', { x, y, width, height, rx })); }
      else s.append(svgEl('path', { d }));
    });
    wrap.append(s);
    return wrap;
  }
  function tile(name, tone) { const t = el('span', 'tile tone-' + (TONES[tone] || tone || 1)); t.append(icon(name)); return t; }
  function button(label, cls, onClick, iconName) {
    const b = el('button', cls || 'btn'); b.type = 'button';
    if (iconName) b.append(icon(iconName));
    b.append(document.createTextNode(label));
    if (onClick) b.addEventListener('click', onClick);
    return b;
  }
  function extLink(label, href, cls, iconName) {
    const a = el('a', cls || 'btn'); a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer';
    if (iconName) a.append(icon(iconName));
    a.append(document.createTextNode(label));
    return a;
  }
  function card(title, opts) {
    const o = opts || {}, root = el('section', 'card ' + (o.span ? 'span-' + o.span : 'span-12')), h = el('div', 'card-head');
    h.append(el('h2', '', title));
    const tools = el('div', 'card-tools');
    (o.tools || []).forEach((t) => tools.append(t));
    if (o.view) tools.append(viewAll(o.view[0], o.view[1], o.view[2]));
    if (tools.childNodes.length) h.append(tools);
    if (o.sub) h.append(el('p', '', o.sub));
    root.append(h);
    return root;
  }
  function viewAll(label, page, tab) {
    const b = el('button', 'link-button', label || 'View all'); b.type = 'button';
    b.append(icon('arrow'));
    b.addEventListener('click', () => go(page, tab));
    return b;
  }
  function empty(title, copy) { const e = el('div', 'empty'); e.append(el('strong', '', title)); if (copy) e.append(el('span', '', copy)); return e; }
  function statusTag(label, kind) { return el('span', 'status ' + (kind || 'idle'), label); }
  function badge(label, cls) { return el('span', 'badge ' + (cls || ''), label); }
  function selectEl(options, value, onChange, label) {
    const s = el('select', 'select'); s.setAttribute('aria-label', label || 'Choose');
    options.forEach(([v, t]) => { const o = el('option', '', t); o.value = v; if (v === value) o.selected = true; s.append(o); });
    s.addEventListener('change', () => onChange(s.value));
    return s;
  }
  function toast(message) {
    const t = $('toast'); t.textContent = message; t.hidden = false;
    clearTimeout(toast.timer); toast.timer = setTimeout(() => { t.hidden = true; }, 3800);
  }
  function dash_() { return dash && dash.dashboard; }

  // ---- formatting -------------------------------------------------------------
  const NF = new Intl.NumberFormat('en-US');
  const CF = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
  function num(v) { const n = Number(v); return Number.isFinite(n) ? NF.format(n) : '—'; }
  function compact(v) { const n = Number(v); return Number.isFinite(n) ? CF.format(n) : '—'; }
  function peso(minor) { const n = Number(minor) / 100; return Number.isFinite(n) ? '₱' + n.toLocaleString('en-PH', { maximumFractionDigits: n >= 1000 ? 0 : 2 }) : '—'; }
  function pct(part, whole, digits) { const p = Number(part), w = Number(whole); return w > 0 && Number.isFinite(p) ? (p / w * 100).toFixed(digits === undefined ? 1 : digits) + '%' : '—'; }
  function bytes(v) { let n = Number(v); if (!Number.isFinite(n)) return '—'; const u = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0; while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; } return (i ? n.toFixed(1) : n) + ' ' + u[i]; }
  function ms(v) { const n = Number(v); if (!Number.isFinite(n) || v === null) return '—'; return n >= 1000 ? (n / 1000).toFixed(1) + ' s' : Math.round(n) + ' ms'; }
  function dateText(value) {
    const d = new Date(value); if (Number.isNaN(d.getTime())) return '—';
    if (prefs.dateFormat === 'iso') return d.toISOString().slice(0, 10);
    if (prefs.dateFormat === 'dmy') return d.toLocaleDateString('en-GB');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
  function timeText(value) { const d = new Date(value); return Number.isNaN(d.getTime()) ? '—' : d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: prefs.timeFormat === '12h' }); }
  function dateTimeText(value) { return dateText(value) + ' ' + timeText(value); }
  function shortDateTime(value) { const d = new Date(value); return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' + timeText(value); }
  function ago(value, short) {
    const t = new Date(value).getTime(); if (!Number.isFinite(t)) return '—';
    const s = Math.round((t - Date.now()) / 1000), rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto', style: short ? 'narrow' : 'long' });
    const steps = [[60, 'second'], [3600, 'minute', 60], [86400, 'hour', 3600], [604800, 'day', 86400], [Infinity, 'week', 604800]];
    for (const [limit, unit, div] of steps) if (Math.abs(s) < limit) return rtf.format(Math.round(s / (div || 1)), unit);
    return dateText(value);
  }
  function dayLabel(day) { const d = new Date(day + 'T00:00:00Z'); return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }); }
  function initials(text) { const s = String(text || '?').replace(/[^A-Za-z]/g, ''); return (s.slice(0, 2) || '?').toUpperCase(); }

  // ---- series maths -------------------------------------------------------------
  function windowRows() {
    const d = dash_(), rows = d && Array.isArray(d.series) ? d.series : [], n = dash ? dash.window_days : 7;
    return { cur: rows.slice(-n), prev: rows.length > n ? rows.slice(0, rows.length - n) : [], n };
  }
  function pick(row, f) { return typeof f === 'function' ? Number(f(row)) || 0 : Number(row[f]) || 0; }
  function total(rows, f) { return rows.reduce((a, r) => a + pick(r, f), 0); }
  function chat(row) { return Math.max(0, pick(row, 'requests') - pick(row, 'coding') - pick(row, 'image') - pick(row, 'video') - pick(row, 'voice')); }
  function trend(f, opts) {
    const w = windowRows(), cur = total(w.cur, f), prev = total(w.prev, f), o = opts || {};
    return { value: cur, values: w.cur.map((r) => pick(r, f)), delta: deltaText(cur, prev, o.downIsGood, w.n, w.prev.length) };
  }
  function deltaText(cur, prev, downIsGood, n, havePrev) {
    const d = el('div', 'kpi-delta');
    if (!havePrev) { d.textContent = 'No earlier period to compare'; return d; }
    if (prev === 0 && cur === 0) { d.textContent = 'No activity in either period'; return d; }
    if (prev === 0) { d.append(el('b', downIsGood ? 'down' : 'up', 'New'), document.createTextNode(' vs. previous ' + n + ' days')); return d; }
    if (cur === prev) { d.append(el('b', 'flat', 'No change'), document.createTextNode(' vs. previous ' + n + ' days')); return d; }
    const change = (cur - prev) / prev * 100, up = change >= 0, good = downIsGood ? !up : up;
    d.append(el('b', Math.abs(change) < 0.05 ? 'flat' : good ? 'up' : 'down', (up ? '↑ ' : '↓ ') + Math.abs(change).toFixed(Math.abs(change) < 10 ? 1 : 0) + '%'), document.createTextNode(' vs. previous ' + n + ' days'));
    return d;
  }

  // ---- charts -------------------------------------------------------------------
  function niceMax(v) { if (!(v > 0)) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))), m = v / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p; }
  function smooth(points) {
    if (points.length < 3) return points.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    let d = 'M' + points[0][0].toFixed(1) + ' ' + points[0][1].toFixed(1);
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i - 1] || points[i], p1 = points[i], p2 = points[i + 1], p3 = points[i + 2] || p2;
      const lo = Math.min(p1[1], p2[1]), hi = Math.max(p1[1], p2[1]);
      const c1y = Math.min(hi, Math.max(lo, p1[1] + (p2[1] - p0[1]) / 6)), c2y = Math.min(hi, Math.max(lo, p2[1] - (p3[1] - p1[1]) / 6));
      d += ' C' + (p1[0] + (p2[0] - p0[0]) / 6).toFixed(1) + ' ' + c1y.toFixed(1) + ' ' + (p2[0] - (p3[0] - p1[0]) / 6).toFixed(1) + ' ' + c2y.toFixed(1) + ' ' + p2[0].toFixed(1) + ' ' + p2[1].toFixed(1);
    }
    return d;
  }
  function axes(svg, w, h, pad, max, labels, fmt) {
    for (let i = 0; i <= 4; i++) {
      const y = pad.t + (h - pad.t - pad.b) * (1 - i / 4);
      svg.append(svgEl('line', { x1: pad.l, x2: w - pad.r, y1: y, y2: y }, 'gridline'));
      const t = svgEl('text', { x: pad.l - 8, y: y + 4, 'text-anchor': 'end' }); t.textContent = (fmt || compact)(max * i / 4); svg.append(t);
    }
    const n = labels.length, every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(w / 80))));
    labels.forEach((label, i) => {
      if (i % every && i !== n - 1) return;
      const x = n === 1 ? (pad.l + w - pad.r) / 2 : pad.l + (w - pad.l - pad.r) * i / (n - 1);
      const t = svgEl('text', { x, y: h - 4, 'text-anchor': 'middle' }); t.textContent = label; svg.append(t);
    });
  }
  function legend(items) { const l = el('div', 'legend'); items.forEach(([label, tone]) => { const s = el('span'); s.append(el('i', 'sw c' + tone), document.createTextNode(label)); l.append(s); }); return l; }
  // Charts draw at their real width so axis text stays readable; they redraw on resize.
  function responsive(drawSvg, legendNode) {
    const wrap = el('div', 'chart-wrap'), holder = el('div');
    let last = 0;
    const draw = () => { const w = Math.max(260, Math.round(holder.clientWidth || 600)); if (w === last) return; last = w; holder.replaceChildren(drawSvg(w)); };
    wrap.append(holder);
    if (legendNode) wrap.append(legendNode);
    holder.append(drawSvg(600));
    requestAnimationFrame(draw);
    if (typeof ResizeObserver === 'function') new ResizeObserver(() => draw()).observe(holder);
    return wrap;
  }
  function lineChart(labels, series, opts) {
    const o = opts || {};
    return responsive((w) => {
      const h = o.height || 230, pad = { l: 46, r: 12, t: 10, b: 24 };
      const svg = svgEl('svg', { viewBox: '0 0 ' + w + ' ' + h, role: 'img', 'aria-label': o.label || 'Line chart' }, 'chart');
      const max = niceMax(Math.max(1, ...series.flatMap((s) => s.values)));
      axes(svg, w, h, pad, max, labels, o.fmt);
      series.forEach((s) => {
        const pts = s.values.map((v, i) => [labels.length === 1 ? (pad.l + w - pad.r) / 2 : pad.l + (w - pad.l - pad.r) * i / (labels.length - 1), pad.t + (h - pad.t - pad.b) * (1 - (Number(v) || 0) / max)]);
        if (!pts.length) return;
        const d = smooth(pts);
        if (o.area !== false && s.area !== false) svg.append(svgEl('path', { d: d + ' L' + pts[pts.length - 1][0] + ' ' + (h - pad.b) + ' L' + pts[0][0] + ' ' + (h - pad.b) + ' Z' }, 'area f' + s.tone));
        svg.append(svgEl('path', { d }, 'line s' + s.tone));
        if (pts.length <= 31) pts.forEach((p, i) => { const c = svgEl('circle', { cx: p[0], cy: p[1], r: 3.2 }, 'dot f' + s.tone); const tt = svgEl('title'); tt.textContent = s.name + ' · ' + labels[i] + ': ' + (o.fmt || num)(s.values[i]); c.append(tt); svg.append(c); });
      });
      return svg;
    }, o.legend === false ? null : legend(series.map((s) => [s.name, s.tone])));
  }
  function barChart(labels, series, opts) {
    const o = opts || {};
    return responsive((w) => {
      const h = o.height || 230, pad = { l: 46, r: 12, t: 10, b: 24 };
      const svg = svgEl('svg', { viewBox: '0 0 ' + w + ' ' + h, role: 'img', 'aria-label': o.label || 'Bar chart' }, 'chart');
      const sums = labels.map((_, i) => o.stacked ? series.reduce((a, s) => a + (Number(s.values[i]) || 0), 0) : Math.max(0, ...series.map((s) => Number(s.values[i]) || 0)));
      const max = niceMax(Math.max(1, ...sums));
      for (let i = 0; i <= 4; i++) {
        const y = pad.t + (h - pad.t - pad.b) * (1 - i / 4);
        svg.append(svgEl('line', { x1: pad.l, x2: w - pad.r, y1: y, y2: y }, 'gridline'));
        const t = svgEl('text', { x: pad.l - 8, y: y + 4, 'text-anchor': 'end' }); t.textContent = (o.fmt || compact)(max * i / 4); svg.append(t);
      }
      const slot = (w - pad.l - pad.r) / Math.max(1, labels.length), every = Math.max(1, Math.ceil(labels.length / Math.max(2, Math.floor(w / 70))));
      labels.forEach((label, i) => {
        const x0 = pad.l + slot * i, inner = Math.min(46, slot * 0.62);
        let base = h - pad.b;
        series.forEach((s, si) => {
          const v = Number(s.values[i]) || 0, bh = (h - pad.t - pad.b) * v / max;
          const bw = o.stacked ? inner : inner / series.length;
          const x = x0 + (slot - inner) / 2 + (o.stacked ? 0 : bw * si);
          const y = o.stacked ? base - bh : h - pad.b - bh;
          if (bh > 0) { const r = svgEl('rect', { x, y, width: Math.max(1, bw - (o.stacked ? 0 : 2)), height: bh, rx: 3 }, 'f' + s.tone); const tt = svgEl('title'); tt.textContent = s.name + ' · ' + label + ': ' + (o.fmt || num)(v); r.append(tt); svg.append(r); }
          if (o.stacked) base -= bh;
        });
        if (i % every === 0 || i === labels.length - 1) { const t = svgEl('text', { x: x0 + slot / 2, y: h - 4, 'text-anchor': 'middle' }); t.textContent = label; svg.append(t); }
      });
      return svg;
    }, o.legend === false ? null : legend(series.map((s) => [s.name, s.tone])));
  }
  function sparkline(values, tone) {
    const w = 86, h = 34, svg = svgEl('svg', { viewBox: '0 0 ' + w + ' ' + h, 'aria-hidden': 'true' }, 'spark chart');
    if (!values.length || values.every((v) => !v)) { svg.append(svgEl('line', { x1: 0, x2: w, y1: h - 4, y2: h - 4 }, 'line s' + tone)); return svg; }
    const max = Math.max(...values), min = Math.min(...values), span = max - min || 1;
    const pts = values.map((v, i) => [values.length === 1 ? w / 2 : w * i / (values.length - 1), 3 + (h - 6) * (1 - (v - min) / span)]);
    const d = smooth(pts);
    svg.append(svgEl('path', { d: d + ' L' + w + ' ' + h + ' L0 ' + h + ' Z' }, 'area f' + tone), svgEl('path', { d }, 'line s' + tone));
    return svg;
  }
  function donut(segments, center, centerLabel, opts) {
    const o = opts || {}, wrap = el('div', 'donut-wrap'), box = el('div', 'donut');
    const totalValue = segments.reduce((a, s) => a + Math.max(0, Number(s.value) || 0), 0);
    const r = 15.9, c = 2 * Math.PI * r, svg = svgEl('svg', { viewBox: '0 0 42 42', role: 'img', 'aria-label': o.label || 'Donut chart' });
    svg.append(svgEl('circle', { cx: 21, cy: 21, r, fill: 'none', 'stroke-width': 5 }, 'track'));
    let offset = 0;
    if (totalValue > 0) segments.forEach((s) => {
      const len = c * Math.max(0, Number(s.value) || 0) / totalValue; if (!len) return;
      const gap = segments.filter((x) => Number(x.value) > 0).length > 1 ? 0.6 : 0;
      svg.append(svgEl('circle', { cx: 21, cy: 21, r, fill: 'none', 'stroke-width': 5, 'stroke-dasharray': Math.max(0, len - gap) + ' ' + (c - Math.max(0, len - gap)), 'stroke-dashoffset': -offset }, 's' + s.tone));
      offset += len;
    });
    const mid = el('div', 'donut-center'); mid.append(el('strong', String(center).length > 6 ? 'long' : '', center), el('span', '', centerLabel || ''));
    box.append(svg, mid);
    const rows = el('div', 'rows');
    segments.forEach((s) => {
      const row = el('div', 'row'), name = el('div', 'name');
      name.append(el('i', 'sw c' + s.tone), el('span', '', s.label));
      row.append(name, el('span', 'muted num', totalValue > 0 ? pct(s.value, totalValue, 0) : '—'), el('span', 'num', s.display || num(s.value)));
      rows.append(row);
    });
    wrap.append(box, rows);
    return wrap;
  }
  function barRows(items, valueText) {
    const rows = el('div'), max = Math.max(1, ...items.map((i) => Number(i.value) || 0));
    items.forEach((item, idx) => {
      const r = el('div', 'bar-row'), top = el('div', 'top'), name = el('span', 'name');
      if (item.icon) name.append(icon(item.icon));
      name.append(document.createTextNode(' ' + item.label));
      top.append(name, el('span', 'muted num', valueText ? valueText(item) : num(item.value)));
      const bar = el('div', 'bar'), fill = el('i', 'c' + (item.tone || ((idx % 6) + 1)));
      fill.style.width = Math.max(1.5, (Number(item.value) || 0) / max * 100) + '%';
      bar.append(fill); r.append(top, bar); rows.append(r);
    });
    return rows;
  }
  function table(columns, rows, opts) {
    const o = opts || {}, wrap = el('div', 'tbl-wrap'), t = el('table', 'tbl'), thead = el('thead'), hr = el('tr'), tb = el('tbody');
    columns.forEach((c) => hr.append(el('th', '', c)));
    thead.append(hr); t.append(thead, tb);
    rows.forEach((cells, i) => {
      const tr = el('tr');
      cells.forEach((cell) => { const td = el('td'); if (cell instanceof Node) td.append(cell); else td.textContent = cell === null || cell === undefined ? '—' : String(cell); tr.append(td); });
      if (o.onRow) { tr.classList.add('clickable'); tr.tabIndex = 0; tr.addEventListener('click', () => o.onRow(i, tr)); tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') o.onRow(i, tr); }); }
      tb.append(tr);
    });
    wrap.append(t);
    return wrap;
  }
  function kpi(label, value, iconName, tone, deltaNode, values) {
    const c = el('article', 'card kpi span-3'), body = el('div', 'kpi-body');
    body.append(el('div', 'kpi-label', label), el('div', 'kpi-value', value));
    body.append(deltaNode || el('div', 'kpi-delta', ''));
    c.append(tile(iconName, tone), body);
    if (values) { c.classList.add('has-spark'); c.append(sparkline(values, TONES[tone] || 1)); }
    return c;
  }
  function note(text) { return el('div', 'kpi-delta', text); }
  function action(title, sub, iconName, tone, handler) {
    const isLink = typeof handler === 'string', a = el(isLink ? 'a' : 'button', 'action');
    if (isLink) { a.href = handler; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.title = 'Opens in a new tab'; } else { a.type = 'button'; a.addEventListener('click', handler); }
    const text = el('span', 'action-text'); text.append(el('strong', '', title), el('small', '', sub));
    if (isLink) text.querySelector('strong').append(icon('external'));
    a.append(tile(iconName, tone), text);
    return a;
  }
  function actions(title, items, opts) {
    const c = card(title, { span: (opts && opts.span) || 12 }), grid = el('div', 'actions' + (opts && opts.tiles ? ' tiles' : ''));
    items.forEach((i) => grid.append(action(...i)));
    c.append(grid);
    return c;
  }
  function rowLine(label, middle, right, opts) {
    const o = opts || {}, row = el('div', 'row' + (middle === null ? ' two' : '')), name = el('div', 'name');
    if (o.icon) name.append(icon(o.icon)); if (o.tone) name.append(el('i', 'sw ' + o.tone));
    name.append(el('span', '', label));
    row.append(name);
    if (middle !== null) row.append(middle instanceof Node ? middle : el('span', 'muted num', middle));
    row.append(right instanceof Node ? right : el('span', 'num', right));
    return row;
  }
  function csvDownload(filename, header, rows) {
    const clean = (v) => { let s = v === null || v === undefined ? '' : String(v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const text = [header, ...rows].map((r) => r.map(clean).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
    const a = el('a'); a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Downloaded ' + filename);
  }
  function exportSeries() {
    const w = windowRows();
    if (!w.cur.length) { toast('No daily data to export yet.'); return; }
    const fields = ['requests', 'successes', 'failures', 'tokens', 'conversations', 'coding', 'image', 'video', 'voice', 'active_users', 'active_guests', 'new_users', 'payments', 'gross_php_minor', 'images', 'videos', 'files', 'automation_ok', 'automation_failed'];
    csvDownload('nasrinai-daily-' + dash.window + '.csv', ['day', ...fields], w.cur.map((r) => [r.day, ...fields.map((f) => r[f])]));
  }
  async function getJson(url) {
    const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } });
    if (response.status === 404) { window.location.href = 'https://www.nasrinai.com/'; throw new Error('session ended'); }
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error((body && body.error && body.error.message) || 'Request failed');
    return body;
  }
  function needsData(container, what) {
    if (dash_()) return false;
    container.append(empty('Daily ' + (what || 'series') + ' unavailable', dash && dash.status === 'unavailable' ? 'Apply migration 080 (owner_console_dashboard) in Supabase to turn on charts.' : 'Loading…'));
    return true;
  }
  function planBreakdown() {
    const users = data && data.user_summary, plans = data && data.plans_24h;
    if (!users || !plans) return null;
    const pro = Number(plans.active_pro_periods) || 0, max = Number(plans.active_max_periods) || 0, ultra = Number(plans.active_ultra_periods) || 0;
    const all = Number(users.auth_user_records) || 0;
    return { all, segments: [{ label: 'Free', value: Math.max(0, all - pro - max - ultra), tone: 2 }, { label: 'Pro', value: pro, tone: 1 }, { label: 'Max', value: max, tone: 3 }, { label: 'Ultra', value: ultra, tone: 4 }] };
  }
  function planBadge(plan) { const p = String(plan || 'free').toLowerCase(); return badge(p === 'free' ? 'Free' : p[0].toUpperCase() + p.slice(1), p); }
  function aiSuccess() { const u = data && data.usage_24h; return u && Number(u.request_count) > 0 ? Number(u.success_count) / Number(u.request_count) : null; }

  // ---- system status ------------------------------------------------------------------
  function services() {
    const db = data && data.database_health && data.database_health.status === 'available';
    const dep = data && data.deployment_summary, latest = dep && dep.latest;
    const rate = aiSuccess(), sig = data && data.incidents_24h, auto = data && data.automation_24h, integ = (dash && dash.integrations) || {};
    const list = [
      { name: 'NasrinAI API', icon: 'server', kind: data ? 'good' : 'idle', label: data ? 'Operational' : 'Checking', short: data ? 'Live' : '—', detail: data ? 'Responded ' + timeText(data.generated_at) : '—' },
      { name: 'Supabase Database', icon: 'database', kind: !data ? 'idle' : db ? 'good' : 'bad', label: !data ? 'Checking' : db ? 'Operational' : 'Unreachable', short: db ? 'Read OK' : '—', detail: db ? 'Read check passed' : 'Read check failed' },
      { name: 'Vercel Deployment', icon: 'cloud', kind: !latest ? 'idle' : latest.state === 'ready' ? 'good' : ['error', 'canceled', 'cancelled'].includes(latest.state) ? 'bad' : 'warn', label: !latest ? 'Not connected' : latest.state === 'ready' ? 'Operational' : latest.state[0].toUpperCase() + latest.state.slice(1), short: latest && latest.created_at ? ago(latest.created_at, true) : '—', detail: latest && latest.created_at ? 'Deployed ' + ago(latest.created_at) : 'Read-only token not set' },
      { name: 'AI Providers', icon: 'cpu', kind: rate === null ? 'idle' : rate >= 0.97 ? 'good' : rate >= 0.9 ? 'warn' : 'bad', label: rate === null ? 'No traffic (24h)' : rate >= 0.97 ? 'Operational' : rate >= 0.9 ? 'Degraded' : 'Failing', short: rate === null ? '—' : (rate * 100).toFixed(2) + '%', detail: rate === null ? 'No model calls in 24 hours' : (rate * 100).toFixed(2) + '% success in 24 hours' },
      { name: 'Automations', icon: 'share', kind: !auto ? 'idle' : Number(auto.failed_count) > 0 || Number(auto.stale_running_count) > 0 ? 'warn' : 'good', label: !auto ? 'Not connected' : Number(auto.failed_count) > 0 || Number(auto.stale_running_count) > 0 ? 'Needs attention' : 'Operational', short: auto ? num(auto.run_count) + ' runs' : '—', detail: auto ? num(auto.run_count) + ' runs in 24 hours' : 'Automation summary unavailable' },
      { name: 'Payment Gateway', icon: 'card', kind: integ.paymongo ? 'good' : 'idle', label: integ.paymongo ? 'Configured' : 'Not configured', short: 'PayMongo', detail: 'PayMongo checkout' },
      { name: 'GitHub Actions', icon: 'branch', kind: integ.github_actions ? 'good' : 'idle', label: integ.github_actions ? 'Connected' : 'Not connected', short: '—', detail: 'Release Guard source (OWNER_GITHUB_ACTIONS_TOKEN)' },
      { name: 'Signals (24h)', icon: 'alert', kind: !sig ? 'idle' : (Number(sig.ai_failed_requests) + Number(sig.automation_failed_runs) + Number(sig.stale_running_runs)) > 0 ? 'warn' : 'good', label: !sig ? 'Unavailable' : (Number(sig.ai_failed_requests) + Number(sig.automation_failed_runs) + Number(sig.stale_running_runs)) > 0 ? 'Attention' : 'Clear', short: sig ? num(sig.ai_failed_requests) + ' fails' : '—', detail: sig ? num(sig.ai_failed_requests) + ' failed AI calls in 24 hours' : 'Signals unavailable' }
    ];
    return list;
  }
  function updateStatusPill() {
    const pill = $('status-pill'), text = $('status-text'), list = services();
    const bad = list.filter((s) => s.kind === 'bad'), warn = list.filter((s) => s.kind === 'warn');
    pill.className = 'status-pill ' + (!data ? 'idle' : bad.length ? 'bad' : warn.length ? 'warn' : '');
    text.textContent = !data ? 'Checking systems…' : bad.length ? bad.length + ' system' + (bad.length > 1 ? 's' : '') + ' down' : warn.length ? 'Some systems need attention' : 'All Systems Operational';
  }
  async function updateNotifications() {
    const listEl = $('notify-list'), items = [];
    services().filter((s) => s.kind === 'bad' || s.kind === 'warn').forEach((s) => items.push({ title: s.name + ': ' + s.label, sub: s.detail, page: 'infrastructure' }));
    try {
      if (!incidentsCache) incidentsCache = await getJson('/owner/api/incidents');
      (incidentsCache.incidents || []).filter((i) => i.status !== 'resolved').slice(0, 8).forEach((i) => items.push({ title: (i.severity ? String(i.severity).toUpperCase() + ' · ' : '') + (i.title || 'Incident'), sub: i.created_at ? ago(i.created_at) : '', page: 'security', tab: 'incidents' }));
    } catch (_) {}
    $('bell-dot').hidden = items.length === 0;
    listEl.replaceChildren();
    if (!items.length) listEl.append(empty('You’re all caught up', 'No open incidents or failing systems.'));
    items.forEach((item) => {
      const b = el('button', 'notify-item'); b.type = 'button';
      b.append(el('strong', '', item.title), el('small', '', item.sub || ''));
      b.addEventListener('click', () => { closePanels(); go(item.page, item.tab); });
      listEl.append(b);
    });
  }

  // ---- pages -------------------------------------------------------------------
  function pageOverview(c) {
    const g = el('div', 'dash'), users = data && data.user_summary;
    const conv = trend('conversations'), tok = trend('tokens'), rev = trend('gross_php_minor'), signups = trend('new_users');
    const has = Boolean(dash_());
    g.append(
      kpi('Total Users', users ? num(users.auth_user_records) : '—', 'users', 'blue', has ? deltaText(signups.value, total(windowRows().prev, 'new_users'), false, windowRows().n, windowRows().prev.length) : note('Account summary'), has ? signups.values : null),
      kpi('Total Conversations', has ? num(conv.value) : '—', 'message', 'green', has ? conv.delta : note('Needs migration 080'), has ? conv.values : null),
      kpi('Total Tokens', has ? compact(tok.value) : '—', 'database', 'amber', has ? tok.delta : note('Needs migration 080'), has ? tok.values : null),
      kpi('Revenue (gross)', has ? peso(rev.value) : '—', 'dollar', 'pink', has ? rev.delta : note('PayMongo payments recorded'), has ? rev.values : null)
    );
    const usage = card('Usage Overview', { span: 8, tools: [selectEl([['requests', 'AI requests'], ['conversations', 'Conversations'], ['tokens', 'Tokens'], ['active', 'Active users']], prefs.usageMetric, (v) => { prefs.usageMetric = v; savePrefs(); render(); }, 'Usage metric'), rangeSelect()] });
    if (!needsData(usage)) {
      const w = windowRows(), labels = w.cur.map((r) => dayLabel(r.day));
      const m = prefs.usageMetric;
      const series = m === 'requests' ? [
        { name: 'Total', tone: 0, values: w.cur.map((r) => pick(r, 'requests')) },
        { name: 'Chat', tone: 2, values: w.cur.map(chat), area: false },
        { name: 'Coding', tone: 1, values: w.cur.map((r) => pick(r, 'coding')), area: false },
        { name: 'Images', tone: 3, values: w.cur.map((r) => pick(r, 'image')), area: false },
        { name: 'Video', tone: 4, values: w.cur.map((r) => pick(r, 'video')), area: false }
      ] : m === 'active' ? [
        { name: 'Signed-in', tone: 1, values: w.cur.map((r) => pick(r, 'active_users')) },
        { name: 'Guests', tone: 2, values: w.cur.map((r) => pick(r, 'active_guests')), area: false }
      ] : [{ name: m === 'tokens' ? 'Tokens' : 'Conversations', tone: m === 'tokens' ? 3 : 2, values: w.cur.map((r) => pick(r, m)) }];
      usage.append(lineChart(labels, series, { label: 'Usage over time' }));
    }
    const plan = card('Plan Distribution', { span: 4, view: ['Users', 'users'] }), pb = planBreakdown();
    plan.append(pb ? donut(pb.segments, num(pb.all), 'Users', { label: 'Users by plan' }) : empty('Plan data unavailable', 'Needs migration 057.'));
    const recent = card('Recent Users', { span: 5, view: ['View all', 'users'] }), ru = dash_() ? dash_().recent_users : [];
    recent.append(ru && ru.length ? table(['User', 'Plan', 'Status', 'Joined'], ru.slice(0, 6).map((u) => [userCell(u.email_masked), planBadge(u.plan), activeTag(u.last_sign_in_at), dateText(u.joined_at)])) : empty('No users to show', dash_() ? 'No sign-ups yet.' : 'Needs migration 080.'));
    const sys = card('System Status', { span: 4, view: ['View all', 'infrastructure'] }), rows = el('div', 'rows');
    services().forEach((s) => { const r = rowLine(s.name, el('span', 'status plain ' + s.kind, s.label), el('span', 'muted num', s.short), { tone: s.kind }); r.title = s.detail; rows.append(r); });
    sys.append(rows);
    const act = card('Recent Activity', { span: 3, view: ['View all', 'reports'] });
    act.append(activityList(dash_() ? dash_().recent_activity : null, 8));
    g.append(usage, plan, recent, sys, act);
    g.append(quick([
      ['Open NCC', 'Manage automations', 'share', 'blue', LINKS.ncc],
      ['View Logs', 'AI request logs', 'file', 'green', () => go('ai-ops', 'logs')],
      ['Infrastructure', 'Services & deployments', 'database', 'amber', () => go('infrastructure')],
      ['User Management', 'Accounts & plans', 'users', 'pink', () => go('users')],
      ['Financial Reports', 'Revenue & costs', 'chart', 'purple', () => go('finance')],
      ['Security Center', 'Access & audit logs', 'shield', 'cyan', () => go('security')]
    ]));
    c.append(g);
  }
  function quick(items, title) { const a = actions(title || 'Quick Actions', items); a.classList.add('quick'); return a; }
  function rangeSelect() { return selectEl([['7d', 'Last 7 days'], ['14d', 'Last 14 days'], ['30d', 'Last 30 days']], prefs.range, setRange, 'Date range'); }
  function userCell(email) { const n = el('div', 'name'); n.append(el('span', 'mini-avatar', initials(email)), el('span', '', email || 'Unknown')); return n; }
  function activeTag(lastSignIn) { const recent = lastSignIn && Date.now() - new Date(lastSignIn).getTime() < 30 * 86400e3; return statusTag(recent ? 'Active' : 'Inactive', recent ? 'good' : 'idle'); }
  function activityList(items, limit) {
    const rows = el('div', 'rows');
    if (!items) { rows.append(empty('Activity unavailable', 'Needs migration 080.')); return rows; }
    if (!items.length) { rows.append(empty('No recent activity', 'Events appear here as they happen.')); return rows; }
    const map = { signup: 'user', payment: 'card', image: 'image', video: 'video', owner: 'key', automation: 'share' };
    rows.classList.add('wrap');
    items.slice(0, limit || 10).forEach((i) => rows.append(rowLine(i.label, null, el('span', 'muted num', ago(i.at, true)), { icon: map[i.kind] || 'dot' })));
    return rows;
  }

  function pageAiOps(c) {
    const g = el('div', 'dash'), u24 = data && data.usage_24h, u7 = data && data.usage_7d, req = trend('requests'), tok = trend('tokens'), act = trend('active_users');
    const has = Boolean(dash_());
    g.append(
      kpi('AI Requests', has ? num(req.value) : u24 ? num(u24.request_count) : '—', 'message', 'blue', has ? req.delta : note('Last 24 hours'), has ? req.values : null),
      kpi('Active Users (24h)', u24 ? num(u24.active_user_ids) : '—', 'users', 'green', note(u24 ? num(u24.active_guest_ids) + ' guests also active' : 'Usage telemetry'), has ? act.values : null),
      kpi('Tokens', has ? compact(tok.value) : u24 ? compact(u24.total_tokens) : '—', 'database', 'amber', has ? tok.delta : note('Last 24 hours'), has ? tok.values : null),
      kpi('Provider Cost (7d)', u7 && Number(u7.cost_known_rows) > 0 ? moneyText(u7.provider_reported_cost_usd) : '—', 'dollar', 'pink', note(u7 ? num(u7.cost_known_rows) + ' calls with provider cost · ' + num(u7.cost_unknown_rows) + ' unknown' : 'Provider-reported only'))
    );
    const prov = card('AI Provider Usage', { span: 5, tools: [rangeSelect()] });
    if (!needsData(prov)) {
      const w = windowRows(), days = w.cur.map((r) => r.day), daily = (dash_().providers_daily || []).filter((p) => days.includes(p.day));
      const names = [...new Set(daily.map((p) => p.provider))].sort((a, b) => (a === 'others') - (b === 'others'));
      if (!names.length) prov.append(empty('No provider traffic', 'No model calls in this window.'));
      else prov.append(lineChart(days.map(dayLabel), names.map((n, i) => ({ name: n === 'others' ? 'Others' : n, tone: (i % 6) + 1, area: i === 0, values: days.map((d) => { const hit = daily.find((p) => p.day === d && p.provider === n); return hit ? Number(hit.requests) : 0; }) })), { label: 'Requests by provider' }));
    }
    const feat = card('Requests by Feature', { span: 4 });
    if (!needsData(feat)) {
      const w = windowRows(), segs = [{ label: 'Chat', value: total(w.cur, chat), tone: 2 }, { label: 'Coding', value: total(w.cur, 'coding'), tone: 1 }, { label: 'Images', value: total(w.cur, 'image'), tone: 3 }, { label: 'Video', value: total(w.cur, 'video'), tone: 4 }, { label: 'Voice', value: total(w.cur, 'voice'), tone: 5 }];
      feat.append(donut(segs, compact(total(w.cur, 'requests')), 'Total', { label: 'Requests by feature' }));
    }
    const health = card('AI Service Health', { span: 3 }), ph = dash_() ? dash_().provider_health : null;
    if (!ph) health.append(empty('Health unavailable', 'Needs migration 080.'));
    else if (!ph.length) health.append(empty('No provider calls', 'Nothing recorded in this window.'));
    else { const rows = el('div', 'rows'); ph.forEach((p) => { const r = Number(p.requests) ? Number(p.successes) / Number(p.requests) : 0; rows.append(rowLine(p.provider, (r * 100).toFixed(2) + '%', ms(p.latency_p50_ms), { tone: r >= 0.97 ? 'good' : r >= 0.9 ? 'warn' : 'bad' })); }); health.append(rows); }
    const live = card('Real-time Activity', { span: 5, view: ['View all', 'ai-ops', 'logs'] }), liveBody = el('div');
    const toggle = button(liveOn ? 'Pause' : 'Resume', 'btn', () => { liveOn = !liveOn; toggle.lastChild.textContent = liveOn ? 'Pause' : 'Resume'; toggle.firstChild.replaceWith(icon(liveOn ? 'pause' : 'play')); liveBadge.className = 'status ' + (liveOn ? 'good' : 'idle'); liveBadge.textContent = liveOn ? 'Live' : 'Paused'; if (liveOn) loadLive(liveBody); }, liveOn ? 'pause' : 'play');
    const liveBadge = statusTag(liveOn ? 'Live' : 'Paused', liveOn ? 'good' : 'idle');
    live.querySelector('.card-tools').prepend(liveBadge, toggle);
    live.append(liveBody); loadLive(liveBody);
    liveTimer = setInterval(() => { if (liveOn && !document.hidden) loadLive(liveBody); }, 20000);
    const tokens = card('Token Usage by Feature', { span: 4, view: ['View all', 'reports'] });
    if (!needsData(tokens)) {
      const w = windowRows();
      tokens.append(barChart(w.cur.map((r) => dayLabel(r.day)), [{ name: 'Requests', tone: 2, values: w.cur.map((r) => pick(r, 'successes')) }, { name: 'Failures', tone: 4, values: w.cur.map((r) => pick(r, 'failures')) }], { stacked: true, label: 'Successful and failed requests' }));
      tokens.querySelector('h2').textContent = 'Request Outcomes';
    }
    const alerts = card('System Alerts', { span: 3, view: ['View all', 'security', 'incidents'] });
    alerts.append(signalRows());
    g.append(prov, feat, health, live, tokens, alerts);
    g.append(actions('AI Operations Tools', [
      ['AI Logs', 'Request-level telemetry', 'list', 'blue', () => go('ai-ops', 'logs')],
      ['Model Catalog', 'Unlisted models', 'search', 'green', () => go('ai-ops', 'openrouter-unlisted')],
      ['Model Activity', 'All logged models', 'activity', 'amber', () => go('ai-ops', 'other-unlisted')],
      ['Usage & Costs', 'Providers & features', 'chart', 'pink', () => go('ai-ops', 'ai')],
      ['Learning Review', 'Community examples', 'check-circle', 'purple', () => go('ai-ops', 'learning')],
      ['Knowledge Crawl', 'Continuous intelligence', 'globe', 'cyan', () => go('ai-ops', 'intelligence')]
    ], { span: 7, tiles: true }));
    g.append(actions('Quick Actions', [
      ['Refresh', 'Reload all data', 'refresh', 'blue', () => refresh(true)],
      ['Verify Models', 'Run GitHub check', 'check', 'green', () => go('ai-ops', 'ai')],
      ['Health Check', 'Re-test services', 'activity', 'amber', healthCheck],
      ['OpenRouter', 'Provider activity', 'external', 'pink', LINKS.openrouter]
    ], { span: 5, tiles: true }));
    c.append(g);
  }
  async function loadLive(target) {
    try {
      const body = await getJson('/owner/api/ai-logs?window=24h&provider=all&limit=8&offset=0');
      const rows = Array.isArray(body.rows) ? body.rows : [];
      target.replaceChildren(rows.length ? table(['Time', 'Provider', 'Model', 'Status', 'Tokens', 'Latency'], rows.map((r) => [timeText(r.created_at), r.provider || '—', r.model || '—', statusTag(['success', 'ok'].includes(r.status) ? 'Success' : r.status || 'Unknown', ['success', 'ok'].includes(r.status) ? 'good' : 'bad'), compact(r.total_tokens), ms(r.latency_ms)])) : empty('No AI requests in the last 24 hours'));
    } catch (e) { target.replaceChildren(empty('Live activity unavailable', e.message)); }
  }
  function signalRows() {
    const rows = el('div', 'rows'), sig = data && data.incidents_24h, auto = data && data.automation_24h;
    if (!sig) { rows.append(empty('Signals unavailable', 'Needs migration 057.')); return rows; }
    const items = [
      ['Failed AI requests (24h)', Number(sig.ai_failed_requests) || 0],
      ['Failed automation runs (24h)', Number(sig.automation_failed_runs) || 0],
      ['Stale running jobs', Number(sig.stale_running_runs) || 0],
      ['Pending approvals', auto ? Number(auto.pending_approval_count) || 0 : 0]
    ];
    items.forEach(([label, n]) => rows.append(rowLine(label, null, el('span', 'num', num(n)), { tone: n > 0 ? 'warn' : 'good' })));
    if (sig.last_failure_at) rows.append(rowLine('Last failure', null, el('span', 'muted num', ago(sig.last_failure_at)), { icon: 'clock' }));
    return rows;
  }
  async function healthCheck() {
    toast('Running health check…');
    await refresh(true);
    const list = services(), bad = list.filter((s) => s.kind === 'bad').length, warn = list.filter((s) => s.kind === 'warn').length;
    toast(bad ? bad + ' service(s) failing — see Infrastructure.' : warn ? warn + ' service(s) need attention.' : 'All checked services are operational.');
  }

  let userFilter = 'all', selectedUser = 0;
  function pageUsers(c) {
    const g = el('div', 'dash'), users = data && data.user_summary, growth = data && data.growth_summary, plans = data && data.plans_24h, signups = trend('new_users'), has = Boolean(dash_());
    g.append(
      kpi('Total Users', users ? num(users.auth_user_records) : '—', 'users', 'blue', note(users && users.last_signup_at ? 'Last sign-up ' + ago(users.last_signup_at) : 'Auth records'), has ? signups.values : null),
      kpi('Active Users (7d)', growth ? num(growth.active_user_ids_7d) : '—', 'user', 'green', note(growth ? num(growth.active_user_ids_30d) + ' in 30 days' : 'Usage-based')),
      kpi('New Signups', has ? num(signups.value) : users ? num(users.new_auth_records_7d) : '—', 'plus', 'amber', has ? signups.delta : note('Last 7 days'), has ? signups.values : null),
      kpi('Paid Subscribers', plans ? num(plans.active_paid_periods) : '—', 'card', 'pink', note('Active Pro / Max / Ultra periods'))
    );
    const byPlan = card('Users by Plan', { span: 4 }), pb = planBreakdown();
    byPlan.append(pb ? donut(pb.segments, num(pb.all), 'Total Users') : empty('Plan data unavailable'));
    const growthCard = card('User Growth', { span: 5, tools: [rangeSelect()] });
    if (!needsData(growthCard)) { const w = windowRows(); growthCard.append(barChart(w.cur.map((r) => dayLabel(r.day)), [{ name: 'New Users', tone: 1, values: w.cur.map((r) => pick(r, 'new_users')) }, { name: 'Paid Conversions', tone: 2, values: w.cur.map((r) => pick(r, 'payments')) }], { label: 'New users and payments' })); }
    const activity = card('User Activity', { span: 3 }), rows = el('div', 'rows');
    const line = (label, f, iconName) => { const t = trend(f), d = t.delta; rows.append(rowLine(label, el('span', 'num', num(t.value)), d.querySelector('b') ? d.querySelector('b') : el('span', 'muted', '—'), { icon: iconName })); };
    if (!needsData(activity)) {
      rows.append(rowLine('Sign-ins (30d)', el('span', 'num', users ? num(users.active_signins_30d) : '—'), el('span', 'muted', ''), { icon: 'users' }));
      line('Chat requests', chat, 'message'); line('Images generated', 'images', 'image'); line('Videos generated', 'videos', 'video'); line('Files sent', 'files', 'file');
      activity.append(rows);
    }
    const list = card('', { span: 8 }), head2 = list.querySelector('.card-head'); head2.replaceChildren();
    const tabs = el('div', 'subtabs');
    [['all', 'All Users'], ['free', 'Free'], ['pro', 'Pro'], ['max', 'Max'], ['ultra', 'Ultra']].forEach(([k, t]) => { const b = button(t, 'subtab' + (userFilter === k ? ' active' : ''), () => { userFilter = k; selectedUser = 0; render(); }); tabs.append(b); });
    const search = el('input', 'select'); search.type = 'search'; search.placeholder = 'Search users…'; search.setAttribute('aria-label', 'Search users');
    const all = dash_() ? dash_().recent_users || [] : [];
    const filtered = () => all.filter((u) => (userFilter === 'all' || String(u.plan || 'free') === userFilter) && (!search.value || String(u.email_masked || '').toLowerCase().includes(search.value.toLowerCase())));
    const body = el('div');
    const draw = () => {
      const rowsData = filtered();
      body.replaceChildren(rowsData.length ? table(['User', 'Plan', 'Status', 'Sign up', 'Last sign-in'], rowsData.map((u) => [userCell(u.email_masked), planBadge(u.plan), activeTag(u.last_sign_in_at), dateText(u.joined_at), u.last_sign_in_at ? ago(u.last_sign_in_at) : 'Never']), { onRow: (i) => { selectedUser = all.indexOf(rowsData[i]); drawDetail(); } }) : empty(all.length ? 'No users match' : 'No users to show', all.length ? 'Try another plan or search.' : dash_() ? 'No sign-ups yet.' : 'Needs migration 080.'));
    };
    search.addEventListener('input', draw);
    const tools = el('div', 'card-tools');
    tools.append(search, button('Export', 'btn', () => csvDownload('nasrinai-recent-users.csv', ['email_masked', 'plan', 'joined_at', 'last_sign_in_at'], filtered().map((u) => [u.email_masked, u.plan || 'free', u.joined_at, u.last_sign_in_at])), 'download'), extLink('Add User', LINKS.supabase, 'btn primary', 'plus'));
    head2.append(tabs, tools);
    list.append(body, el('p', 'freshness', 'Latest 10 sign-ups. Emails are masked by the server; manage accounts in Supabase Auth.'));
    draw();
    const detail = card('User', { span: 4 });
    function drawDetail() {
      const u = all[selectedUser]; detail.replaceChildren();
      if (!u) { detail.append(el('h2', '', 'User details'), empty('Select a user', 'Click a row to see details.')); return; }
      const top = el('div', 'card-head'); top.append(userCell(u.email_masked), activeTag(u.last_sign_in_at)); detail.append(top);
      const rws = el('div', 'rows');
      rws.append(rowLine('Plan', null, planBadge(u.plan)), rowLine('Member since', null, dateText(u.joined_at)), rowLine('Last sign-in', null, u.last_sign_in_at ? ago(u.last_sign_in_at) : 'Never'));
      detail.append(rws);
      const btns = el('div', 'actions stack'); btns.append(action('Manage account', 'Supabase Auth', 'user', 'blue', LINKS.supabase), action('Message user', 'Open NCC', 'message', 'green', LINKS.ncc));
      detail.append(btns);
    }
    drawDetail();
    g.append(byPlan, growthCard, activity, list, detail);
    c.append(g);
  }

  let mediaFilter = 'all';
  function pageContent(c) {
    const g = el('div', 'dash'), d = dash_(), m = d ? d.media_totals : null, img = trend('images'), vid = trend('videos'), files = trend('files');
    g.append(
      kpi('Total Media Files', m ? num(Number(m.images) + Number(m.videos) + Number(m.sent_files) + Number(m.library_files)) : '—', 'image', 'blue', note('Images, videos, sent and Library files')),
      kpi('Images Generated', d ? num(img.value) : '—', 'image', 'green', d ? img.delta : note('Needs migration 080'), d ? img.values : null),
      kpi('Videos Generated', d ? num(vid.value) : '—', 'video', 'amber', d ? vid.delta : note('Needs migration 080'), d ? vid.values : null),
      kpi('Sent Files Stored', m ? bytes(m.sent_file_bytes) : '—', 'database', 'pink', note(m ? num(m.sent_files) + ' files kept for their owners' : 'Storage metadata'))
    );
    const tabsCard = el('div', 'span-12 card-tools'), tabs = el('div', 'subtabs');
    [['all', 'All Media'], ['image', 'Images'], ['video', 'Videos']].forEach(([k, t]) => tabs.append(button(t, 'subtab' + (mediaFilter === k ? ' active' : ''), () => { mediaFilter = k; render(); })));
    tabsCard.append(tabs, extLink('Storage', LINKS.supabase, 'btn', 'database'), button('Export', 'btn primary', () => { if (!m) return toast('No media data yet.'); csvDownload('nasrinai-media-summary.csv', ['metric', 'value'], [['images_total', m.images], ['videos_total', m.videos], ['videos_failed', m.videos_failed], ['sent_files', m.sent_files], ['sent_file_bytes', m.sent_file_bytes], ['library_files', m.library_files]]); }, 'download'));
    g.append(tabsCard);
    const recent = card('Recent Media', { span: 8, sub: 'Latest generation events. Media content stays private to its owner and is never shown here.' });
    const events = d ? (d.recent_activity || []).filter((a) => (mediaFilter === 'all' ? ['image', 'video'].includes(a.kind) : a.kind === mediaFilter)) : null;
    if (!events) recent.append(empty('Media events unavailable', 'Needs migration 080.'));
    else if (!events.length) recent.append(empty('No recent media', 'Generated pictures and videos appear here.'));
    else { const grid = el('div', 'media-grid'); events.forEach((e) => { const cardEl = el('div', 'media-card'), thumb = el('div', 'media-thumb tone-' + (e.kind === 'video' ? 4 : 1)); thumb.append(el('span', 'tag', e.kind === 'video' ? 'VIDEO' : 'IMAGE'), icon(e.kind === 'video' ? 'video' : 'image')); cardEl.append(thumb, el('strong', '', e.label), el('small', '', ago(e.at))); grid.append(cardEl); }); recent.append(grid); }
    const types = card('Media Usage by Type', { span: 4 });
    if (!m) types.append(empty('Unavailable', 'Needs migration 080.'));
    else { const kinds = (m.sent_by_kind || []).slice(0, 3).map((k, i) => ({ label: 'Sent ' + k.kind, value: Number(k.files), tone: i + 3 })); const segs = [{ label: 'Images', value: Number(m.images), tone: 1 }, { label: 'Videos', value: Number(m.videos), tone: 4 }, { label: 'Library files', value: Number(m.library_files), tone: 2 }, ...kinds]; types.append(donut(segs, compact(segs.reduce((a, s) => a + s.value, 0)), 'Files')); }
    const storage = card('Storage Breakdown', { span: 4, sub: 'Sent files by kind (bytes kept).' });
    storage.append(m && (m.sent_by_kind || []).length ? barRows(m.sent_by_kind.map((k, i) => ({ label: k.kind, value: Number(k.bytes), tone: (i % 6) + 1, files: k.files })), (i) => bytes(i.value) + ' · ' + num(i.files) + ' files') : empty('No stored files', m ? 'Nothing kept yet.' : 'Needs migration 080.'));
    const top = card('Top Users by Media Generation', { span: 4, sub: 'Images and videos in the selected window. Emails masked.' });
    const tm = d ? d.top_media_users || [] : null;
    top.append(tm && tm.length ? barRows(tm.map((u, i) => ({ label: (i + 1) + '. ' + (u.email_masked || 'Unknown'), value: Number(u.items), tone: (i % 6) + 1 })), (i) => num(i.value) + ' files') : empty('No media generators', tm ? 'Nobody generated media in this window.' : 'Needs migration 080.'));
    const mod = card('Content Safety', { span: 4 }), rows = el('div', 'rows');
    rows.append(rowLine('Failed video generations', null, m ? num(m.videos_failed) : '—', { icon: 'alert' }), rowLine('Image safety', null, 'Provider-side filters', { icon: 'shield' }), rowLine('Moderation queue', null, el('span', 'muted', 'Not connected'), { icon: 'list' }));
    mod.append(rows);
    g.append(recent, types, storage, top, mod);
    g.append(actions('Quick Actions', [
      ['Bulk Download', 'Export media summary', 'download', 'blue', () => tabsCard.querySelector('.btn.primary').click()],
      ['Storage', 'Supabase Storage', 'database', 'green', LINKS.supabase],
      ['Policies', 'Privacy & retention', 'shield', 'amber', 'https://www.nasrinai.com/legal.html?doc=privacy'],
      ['Search User', 'Users & CRM', 'search', 'pink', () => go('users')],
      ['Delete Files', 'Supabase Storage', 'x', 'purple', LINKS.supabase],
      ['Analytics', 'Reports', 'chart', 'cyan', () => go('reports')]
    ]));
    c.append(g);
  }

  function pageFinance(c) {
    const g = el('div', 'dash'), d = dash_(), plans = data && data.plans_24h, rev = trend('gross_php_minor'), pays = trend('payments'), u7 = data && data.usage_7d;
    g.append(
      kpi('Total Revenue (gross)', d ? peso(rev.value) : '—', 'dollar', 'blue', d ? rev.delta : note('PayMongo, before fees/refunds'), d ? rev.values : null),
      kpi('Total Payments', d ? num(pays.value) : '—', 'card', 'green', d ? pays.delta : note('Recorded paid checkouts'), d ? pays.values : null),
      kpi('Active Subscribers', plans ? num(plans.active_paid_periods) : '—', 'users', 'amber', note('Unexpired paid periods')),
      kpi('Avg. Payment', d && pays.value ? peso(rev.value / pays.value) : '—', 'rotate', 'pink', note('Gross ÷ payments in window'))
    );
    const over = card('Revenue Overview', { span: 5, tools: [rangeSelect()] });
    if (!needsData(over)) { const w = windowRows(); over.append(lineChart(w.cur.map((r) => dayLabel(r.day)), [{ name: 'Gross (₱)', tone: 0, values: w.cur.map((r) => pick(r, 'gross_php_minor') / 100) }], { fmt: (v) => '₱' + compact(v), label: 'Gross revenue per day' })); }
    const byPlan = card('Revenue by Plan', { span: 4 }), rp = d ? d.revenue_by_plan || [] : null;
    if (!rp) byPlan.append(empty('Unavailable', 'Needs migration 080.'));
    else { const tones = { pro: 1, max: 3, ultra: 4 }; const segs = ['pro', 'max', 'ultra'].map((p) => { const hit = rp.find((x) => x.plan === p); return { label: p[0].toUpperCase() + p.slice(1), value: hit ? Number(hit.gross_php_minor) : 0, display: peso(hit ? hit.gross_php_minor : 0), tone: tones[p] }; }); byPlan.append(donut(segs, peso(segs.reduce((a, s) => a + s.value, 0)), 'Total')); }
    const methods = card('Payment Methods', { span: 3, sub: 'Enabled at checkout (PayMongo). Per-method totals are not recorded.' }), pm = dash ? dash.payment_methods || [] : [];
    const mrows = el('div', 'rows');
    if (!pm.length) mrows.append(empty('No methods configured', 'Set PayMongo methods in Vercel.'));
    pm.forEach((m) => mrows.append(rowLine(m.replace(/_/g, ' ').replace(/\b\w/g, (x) => x.toUpperCase()), null, statusTag('Enabled', 'good'), { icon: 'card' })));
    methods.append(mrows);
    const tx = card('Recent Transactions', { span: 6, view: ['Costs & billing', 'finance', 'finance'] }), rows = d ? d.recent_payments || [] : null;
    tx.append(rows && rows.length ? table(['Date & time', 'User', 'Plan', 'Amount', 'Method', 'Status'], rows.map((p) => [shortDateTime(p.created_at), p.email_masked || '—', planBadge(p.plan), p.amount_minor !== null && p.currency === 'PHP' ? peso(p.amount_minor) : p.amount_minor !== null ? num(p.amount_minor / 100) + ' ' + (p.currency || '') : '—', p.provider === 'paymongo' ? 'PayMongo' : 'Manual grant', statusTag(p.status === 'active' ? 'Success' : 'Canceled', p.status === 'active' ? 'good' : 'idle')])) : empty('No transactions', rows ? 'No plan periods recorded.' : 'Needs migration 080.'));
    const subs = card('Subscription Metrics', { span: 3 }), srows = el('div', 'rows');
    if (!needsData(subs)) {
      [['New Pro', 'new_pro', 'user'], ['New Max', 'new_max', 'trend'], ['New Ultra', 'new_ultra', 'zap']].forEach(([label, f, ic]) => { const t = trend(f); srows.append(rowLine(label, el('span', 'num', num(t.value)), t.delta.querySelector('b') || el('span', 'muted', '—'), { icon: ic })); });
      const canceled = plans && Array.isArray(plans.recent_by_status) ? plans.recent_by_status.filter((s) => s.status === 'canceled').reduce((a, s) => a + Number(s.periods || 0), 0) : null;
      srows.append(rowLine('Canceled (24h)', null, canceled === null ? '—' : num(canceled), { icon: 'x' }));
      subs.append(srows);
    }
    const margin = card('AI Cost vs Revenue', { span: 3, sub: 'Provider-reported AI cost (USD, 7 days) next to gross payments (PHP, 7 days). Different currencies; not net margin.' }), mr = el('div', 'rows');
    const last7 = d ? (d.series || []).slice(-7) : [];
    mr.append(rowLine('Gross payments · 7d', null, d ? peso(total(last7, 'gross_php_minor')) : '—', { icon: 'dollar' }), rowLine('AI cost · 7d', null, u7 && Number(u7.cost_known_rows) > 0 ? moneyText(u7.provider_reported_cost_usd) : '—', { icon: 'cpu' }), rowLine('Calls without provider cost', null, u7 ? num(u7.cost_unknown_rows) : '—', { icon: 'alert' }));
    margin.append(mr);
    g.append(over, byPlan, methods, tx, subs, margin);
    g.append(quick([
      ['Payouts', 'PayMongo dashboard', 'dollar', 'blue', LINKS.paymongo],
      ['Generate Report', 'Daily CSV', 'file', 'green', exportSeries],
      ['Export', 'Usage CSV (7d)', 'download', 'amber', () => { window.location.href = '/owner/api/export?window=7d'; }],
      ['Manage Plans', 'Costs & billing', 'flag', 'pink', () => go('finance', 'finance')],
      ['Refund', 'In PayMongo', 'rotate', 'purple', LINKS.paymongo],
      ['Disputes', 'In PayMongo', 'shield', 'cyan', LINKS.paymongo]
    ]));
    c.append(g);
  }

  function pageInfrastructure(c) {
    const g = el('div', 'dash'), d = dash_(), u7 = data && data.usage_7d, req = trend('requests'), fails = trend('failures', { downIsGood: true }), dep = data && data.deployment_summary;
    const w = windowRows(), rate = total(w.cur, 'requests') ? total(w.cur, 'successes') / total(w.cur, 'requests') : null;
    g.append(
      kpi('API Success Rate', rate === null ? '—' : (rate * 100).toFixed(2) + '%', 'shield', 'blue', note('Successful model calls in window')),
      kpi('Total Requests', d ? compact(req.value) : '—', 'layers', 'green', d ? req.delta : note('Needs migration 080'), d ? req.values : null),
      kpi('p95 Response Time', u7 && u7.latency_p95_ms != null ? ms(u7.latency_p95_ms) : '—', 'zap', 'amber', note(u7 && u7.latency_p50_ms != null ? 'p50 ' + ms(u7.latency_p50_ms) + ' · 7 days' : 'Successful calls · 7 days')),
      kpi('Error Rate', rate === null ? '—' : ((1 - rate) * 100).toFixed(2) + '%', 'alert', 'pink', d ? fails.delta : note('Failed model calls'), d ? fails.values : null)
    );
    const chips = el('div', 'chips span-12');
    services().slice(1, 7).forEach((s) => { const chip = el('div', 'chip-card'), t = el('div'); t.append(el('strong', '', s.name), statusTag(s.label, s.kind)); chip.append(tile(s.icon, s.kind === 'bad' ? 'pink' : s.kind === 'warn' ? 'amber' : 'green'), t); chips.append(chip); });
    g.append(chips);
    const perf = card('Service Performance', { span: 5, sub: 'Daily p95 latency of successful model calls.', tools: [rangeSelect()] });
    if (!needsData(perf)) perf.append(lineChart(w.cur.map((r) => dayLabel(r.day)), [{ name: 'p95 latency', tone: 2, values: w.cur.map((r) => Number(r.latency_p95_ms) || 0) }], { fmt: (v) => ms(v), label: 'Latency per day' }));
    const arch = card('Infrastructure Overview', { span: 4 }), dia = el('div', 'diagram');
    const node = (name, sub, ic) => { const n = el('div', 'node'), t = el('div'); t.append(el('strong', '', name), el('small', '', sub)); n.append(icon(ic), t); return n; };
    const lvl = (...nodes) => { const l = el('div', 'level'); nodes.forEach((n) => l.append(n)); return l; };
    dia.append(lvl(node('Users', 'Web, guests, NCC', 'users')), el('div', 'arrow', '↓'), lvl(node('Vercel', 'App & API functions', 'layers')), el('div', 'arrow', '↓'), lvl(node('AI Providers', 'Routed models', 'cpu'), node('Supabase', 'Database & Auth', 'database'), node('Storage', 'Uploads & media', 'cloud')), el('div', 'arrow', '↓'), lvl(node('Automations', 'Approval outbox', 'share'), node('External', 'PayMongo, Meta, Google', 'globe')));
    arch.append(dia);
    const res = card('Resource Usage', { span: 3 });
    res.append(empty('Not exposed', 'Vercel serverless functions do not report CPU, memory or disk. See Vercel Observability.'), extLink('Open Vercel', LINKS.vercel, 'btn', 'external'));
    const deps = card('Deployments', { span: 7, sub: 'Latest production deployments (read-only Vercel token).' });
    deps.append(dep && (dep.deployments || []).length ? table(['Time', 'Branch', 'Commit', 'URL', 'Status'], dep.deployments.map((x) => [x.created_at ? dateTimeText(x.created_at) : '—', x.branch || '—', x.commit ? x.commit.slice(0, 7) : '—', x.url || '—', statusTag(x.state === 'ready' ? 'Ready' : x.state, x.state === 'ready' ? 'good' : ['error', 'canceled', 'cancelled'].includes(x.state) ? 'bad' : 'warn')])) : empty('Deployment source not connected', 'Set OWNER_VERCEL_READONLY_TOKEN, OWNER_VERCEL_PROJECT_ID and OWNER_VERCEL_TEAM_ID in Vercel.'));
    const store = card('Storage Usage', { span: 5 }), m = d ? d.media_totals : null;
    store.append(m && (m.sent_by_kind || []).length ? donut(m.sent_by_kind.slice(0, 6).map((k, i) => ({ label: k.kind, value: Number(k.bytes), display: bytes(k.bytes), tone: (i % 6) + 1 })), bytes(m.sent_file_bytes), 'Sent files') : empty('No stored files tracked', m ? 'Nothing kept yet.' : 'Needs migration 080.'));
    const healthCard = card('Services Health', { span: 5 });
    healthCard.append(table(['Service', 'Status', 'Detail'], services().map((s) => [s.name, statusTag(s.label, s.kind), s.detail])));
    const env = card('Environment Status', { span: 3 }), er = el('div', 'rows');
    const latest = dep && dep.latest, integ = (dash && dash.integrations) || {};
    er.append(
      rowLine('Production', null, latest ? statusTag(latest.state === 'ready' ? 'Healthy' : latest.state, latest.state === 'ready' ? 'good' : 'warn') : statusTag('Unknown', 'idle')),
      rowLine('Database', null, statusTag(data && data.database_health && data.database_health.status === 'available' ? 'Healthy' : 'Unreachable', data && data.database_health && data.database_health.status === 'available' ? 'good' : 'bad')),
      rowLine('Automation jobs', null, statusTag(data && data.automation_24h ? 'Running' : 'Unknown', data && data.automation_24h ? 'good' : 'idle')),
      rowLine('Supabase store', null, statusTag(integ.supabase ? 'Connected' : 'Memory store', integ.supabase ? 'good' : 'warn')),
      rowLine('Billing reconciliation', null, statusTag(integ.openrouter ? 'OpenRouter' : 'Not connected', integ.openrouter ? 'good' : 'idle'))
    );
    env.append(er);
    g.append(perf, arch, res, deps, store, healthCard, env);
    g.append(actions('Quick Actions', [
      ['View Logs', 'Vercel runtime logs', 'file', 'blue', LINKS.vercel],
      ['Deployments', 'Rollback in Vercel', 'upload', 'green', LINKS.vercel],
      ['Restart', 'Redeploy in Vercel', 'refresh', 'amber', LINKS.vercel],
      ['Database', 'Supabase dashboard', 'database', 'pink', LINKS.supabase],
      ['Backups', 'Supabase backups', 'check', 'purple', LINKS.supabase],
      ['Details', 'DB & deployments', 'terminal', 'cyan', () => go('infrastructure', 'infra')]
    ], { span: 4, tiles: true }));
    c.append(g);
  }

  function pageSecurity(c) {
    const g = el('div', 'dash'), d = dash_(), pa = data && data.platform_auth_audit_24h, audit = data && data.audit_24h, sig = data && data.incidents_24h, fails = trend('failures', { downIsGood: true });
    const paReady = pa && pa.available === true;
    g.append(
      kpi('Failed AI Requests', d ? num(fails.value) : sig ? num(sig.ai_failed_requests) : '—', 'shield', 'blue', d ? fails.delta : note('Last 24 hours'), d ? fails.values : null),
      kpi('Sign-in Events (24h)', paReady ? num(pa.sign_in_events) : '—', 'users', 'green', note(paReady ? num(pa.event_count) + ' Auth events in total' : 'Supabase Auth audit')),
      kpi('Account Recovery (24h)', paReady ? num(pa.account_recovery_events) : '—', 'lock', 'amber', note(paReady ? num(pa.password_change_events) + ' password changes' : 'Supabase Auth audit')),
      kpi('Open Incidents', incidentsCache ? num((incidentsCache.counts || {}).open || 0) : '—', 'alert', 'pink', note(incidentsCache ? num((incidentsCache.counts || {}).critical_open || 0) + ' critical open' : 'Incident register'))
    );
    const threat = card('Failure Activity', { span: 5, tools: [rangeSelect()] });
    if (!needsData(threat)) { const w = windowRows(); threat.append(lineChart(w.cur.map((r) => dayLabel(r.day)), [{ name: 'Failed AI calls', tone: 4, values: w.cur.map((r) => pick(r, 'failures')) }, { name: 'Failed automations', tone: 3, values: w.cur.map((r) => pick(r, 'automation_failed')), area: false }], { label: 'Failures per day' })); }
    const types = card('Requests by Outcome', { span: 4 });
    if (!needsData(types)) { const w = windowRows(); types.append(donut([{ label: 'Successful', value: total(w.cur, 'successes'), tone: 2 }, { label: 'Failed', value: total(w.cur, 'failures'), tone: 4 }], compact(total(w.cur, 'requests')), 'Total')); }
    const auth = card('Auth Events (24h)', { span: 3 });
    auth.append(paReady && Array.isArray(pa.by_category) && pa.by_category.length ? barRows(pa.by_category.map((x, i) => ({ label: String(x.category || x.action || 'other').replace(/_/g, ' '), value: Number(x.count || x.events || 0), tone: (i % 6) + 1 }))) : empty('No Auth events', paReady ? 'Nothing recorded in 24 hours.' : 'Supabase Auth audit source unavailable.'));
    const events = card('Recent Security Events', { span: 5, view: ['Audit', 'security', 'security'] });
    events.append(activityList(d ? (d.recent_activity || []).filter((a) => ['owner', 'signup'].includes(a.kind)) : null, 8));
    const health = card('Security Health', { span: 4, sub: 'Controls enforced in code and CI.' }), hr = el('div', 'rows');
    [['Strict Content Security Policy', 'Enforced'], ['Owner email + IP allowlist', 'Enforced'], ['Unknown visitors get 404', 'Enforced'], ['Same-origin + JSON on writes', 'Enforced'], ['Secret scan in CI', 'On every push'], ['Row-level security', 'Service role only'], ['Rate limits', 'Shared limiter']].forEach(([a, b]) => hr.append(rowLine(a, null, el('span', 'up', b), { icon: 'check' })));
    health.append(hr);
    const access = card('Access Control', { span: 3, view: ['Manage', 'settings'] }), ar = el('div', 'rows'), acc = dash ? dash.access : null;
    ar.append(rowLine('Owner emails', null, acc ? num(acc.owner_emails) : '—', { icon: 'mail' }), rowLine('Allowed IP addresses', null, acc ? num(acc.allowed_ips) : '—', { icon: 'lock' }), rowLine('Session timeout', null, acc ? acc.session_minutes + ' minutes' : '—', { icon: 'clock' }), rowLine('Owner audit events (24h)', null, audit ? num(audit.event_count) : '—', { icon: 'file' }), rowLine('Session cookie', null, 'HttpOnly, Strict', { icon: 'key' }));
    access.append(ar);
    g.append(threat, types, auth, events, health, access);
    g.append(actions('Security Analytics', [
      ['Incidents', 'Register & signals', 'alert', 'blue', () => go('security', 'incidents')],
      ['Audit', 'Owner & Auth events', 'file', 'green', () => go('security', 'security')],
      ['Login Analytics', 'Regional sign-ins', 'globe', 'amber', () => go('users', 'regional')],
      ['Code Scanning', 'GitHub security', 'code', 'pink', LINKS.githubSecurity]
    ], { span: 7, tiles: true }));
    g.append(actions('Quick Actions', [
      ['Block IP', 'Vercel Firewall', 'x', 'blue', LINKS.vercel],
      ['Auth Logs', 'Supabase Auth', 'list', 'green', LINKS.supabase],
      ['Settings', 'Access & security', 'settings', 'amber', () => go('settings')],
      ['Security Scan', 'Run CI checks', 'search', 'pink', LINKS.actions]
    ], { span: 5, tiles: true }));
    c.append(g);
  }

  function pageAutomation(c) {
    const g = el('div', 'dash'), d = dash_(), a = d ? d.automation : null, ok = trend('automation_ok'), failed = trend('automation_failed', { downIsGood: true }), a24 = data && data.automation_24h;
    g.append(
      kpi('Total Workflows', a ? num(a.workflows) : '—', 'play', 'blue', note(a ? num(a.enabled_workflows) + ' enabled' : 'Needs migration 080')),
      kpi('Successful Runs', d ? num(ok.value) : '—', 'check', 'green', d ? ok.delta : note('Automation runs'), d ? ok.values : null),
      kpi('Failed Runs', d ? num(failed.value) : '—', 'alert', 'amber', d ? failed.delta : note('Automation runs'), d ? failed.values : null),
      kpi('Avg. Execution Time', a && a.avg_duration_ms != null ? ms(a.avg_duration_ms) : '—', 'clock', 'pink', note('Finished runs in window'))
    );
    const flow = card('Workflow Builder & Monitor', { span: 8, sub: 'How NasrinAI automations run. Workflows are built and approved in NCC.', tools: [extLink('Open NCC', LINKS.ncc, 'btn primary', 'external')] });
    const p = el('div', 'pipeline');
    [['Trigger', 'Manual, schedule, event', 'zap'], ['Rules', 'Allowed actions only', 'list'], ['AI Draft', 'Untrusted output', 'cpu'], ['Approval', 'Owner confirms', 'user'], ['Outbox', 'Queued sends', 'share'], ['Send', 'Meta, email, CRM', 'globe'], ['Log', 'Run history', 'database']].forEach(([t, s, ic]) => { const st = el('div', 'stage'); st.append(tile(ic, 'blue'), el('strong', '', t), el('small', '', s)); p.append(st); });
    flow.append(p);
    const status = card('Automation Status', { span: 4 }), sr = el('div', 'rows');
    if (!a24) sr.append(empty('Unavailable', 'Needs migration 057.'));
    else [['Runs (24h)', a24.run_count, 'activity'], ['Pending approval', a24.pending_approval_count, 'user'], ['Running', a24.running_count, 'refresh'], ['Failed', a24.failed_count, 'alert'], ['Stale running', a24.stale_running_count, 'clock']].forEach(([l, v, ic]) => sr.append(rowLine(l, null, num(v), { icon: ic })));
    status.append(sr);
    const runs = card('Workflow Runs', { span: 8, view: ['Run health', 'automation', 'automation'] }), rr = a ? a.recent_runs || [] : null;
    const runTone = (s) => s === 'succeeded' ? 'good' : s === 'failed' ? 'bad' : s === 'running' || s === 'queued' ? 'info' : 'warn';
    runs.append(rr && rr.length ? table(['Date & time', 'Workflow', 'Trigger', 'Status', 'Time'], rr.map((r) => [dateTimeText(r.created_at), r.workflow || '—', r.trigger_type || '—', statusTag(String(r.status || '').replace(/_/g, ' '), runTone(r.status)), ms(r.duration_ms)])) : empty('No workflow runs', rr ? 'Runs appear here once workflows execute.' : 'Needs migration 080.'));
    const daily = card('Runs per Day', { span: 4 });
    if (!needsData(daily)) { const w = windowRows(); daily.append(barChart(w.cur.map((r) => dayLabel(r.day)), [{ name: 'Succeeded', tone: 2, values: w.cur.map((r) => pick(r, 'automation_ok')) }, { name: 'Failed', tone: 4, values: w.cur.map((r) => pick(r, 'automation_failed')) }], { stacked: true })); }
    g.append(flow, status, runs, daily);
    g.append(quick([
      ['New Workflow', 'In NCC', 'plus', 'blue', LINKS.ncc],
      ['Integrations', 'Meta channels', 'share', 'green', LINKS.ncc],
      ['Executions', 'Run health', 'list', 'amber', () => go('automation', 'automation')],
      ['Incidents', 'Failures & alerts', 'zap', 'pink', () => go('security', 'incidents')],
      ['Credentials', 'Vercel env vars', 'key', 'purple', LINKS.vercel],
      ['Export', 'Daily CSV', 'download', 'cyan', exportSeries]
    ]));
    c.append(g);
  }

  async function pageRelease(c) {
    const g = el('div', 'dash'), dep = data && data.deployment_summary;
    c.append(g);
    if (!release) { g.append(el('div', 'span-12 loading', 'Loading release data…')); try { release = await getJson('/owner/api/release-guard'); } catch (e) { release = { status: 'unavailable', runs: [], pull_requests: [], message: e.message }; } if (active !== 'release') return; g.replaceChildren(); }
    const runs = release.runs || [], done = runs.filter((r) => r.status === 'completed'), okRuns = done.filter((r) => r.conclusion === 'success'), badRuns = done.filter((r) => ['failure', 'timed_out', 'cancelled'].includes(r.conclusion));
    g.append(
      kpi('Production Deployments', dep ? num(dep.deployment_count) : '—', 'share', 'blue', note(dep ? 'Latest ' + num(dep.deployment_count) + ' from Vercel' : 'Vercel token not set')),
      kpi('Successful Deployments', dep ? num(dep.ready_count) : '—', 'check', 'green', note('Ready state')),
      kpi('Failed Deployments', dep ? num(dep.failed_count) : '—', 'x', 'amber', note('Error or canceled')),
      kpi('CI Pass Rate', done.length ? pct(okRuns.length, done.length, 0) : '—', 'clock', 'pink', note(release.status === 'not_configured' ? 'GitHub Actions token not set' : num(done.length) + ' recent completed runs'))
    );
    const pipe = card('Deployment Pipeline', { span: 5, sub: 'Latest run of each check on main.', tools: [extLink('Deploy (merge PR)', LINKS.pulls, 'btn primary', 'check-circle')] });
    const latestBy = new Map(); runs.filter((r) => r.branch === 'main').forEach((r) => { if (!latestBy.has(r.name)) latestBy.set(r.name, r); });
    if (!latestBy.size) pipe.append(empty('No main-branch runs', release.status === 'not_configured' ? 'Set OWNER_GITHUB_ACTIONS_TOKEN in Vercel.' : 'Nothing recent.'));
    else { const p = el('div', 'pipeline'); [...latestBy.values()].slice(0, 7).forEach((r) => { const ok = r.conclusion === 'success', st = el('div', 'stage'); st.append(tile(ok ? 'check' : r.status !== 'completed' ? 'clock' : 'x', ok ? 'green' : r.status !== 'completed' ? 'blue' : 'pink'), el('strong', '', r.name || 'Workflow'), statusTag(ok ? 'Passed' : r.status !== 'completed' ? 'Running' : r.conclusion || 'Failed', ok ? 'good' : r.status !== 'completed' ? 'info' : 'bad')); p.append(st); }); const st = el('div', 'stage'); st.append(tile('user', 'amber'), el('strong', '', 'Approval'), statusTag('Owner only', 'warn')); p.append(st); pipe.append(p); }
    const check = card('Pre-Deployment Checklist', { span: 4 }), cr = el('div', 'rows');
    [['Tests pass (npm test)', 'CI'], ['Database tests', 'CI'], ['Documentation gate', 'CI'], ['Secret scan', 'CI'], ['Vercel preview build', 'Every PR'], ['Owner merges the PR', 'Enforced'], ['Rollback available', 'Vercel']].forEach(([a, b]) => cr.append(rowLine(a, null, el('span', 'muted', b), { icon: 'check' })));
    check.append(cr);
    const envs = card('Environments', { span: 3 }), latest = dep && dep.latest, er = el('div', 'rows');
    er.append(rowLine('Production', null, latest ? statusTag(latest.state === 'ready' ? 'Healthy' : latest.state, latest.state === 'ready' ? 'good' : 'warn') : statusTag('Unknown', 'idle'), { icon: 'server' }), rowLine('Preview (open PRs)', null, num((release.pull_requests || []).length), { icon: 'branch' }), rowLine('Owner console', null, statusTag('Healthy', 'good'), { icon: 'shield' }));
    envs.append(er);
    const recent = card('Recent CI Runs', { span: 7, tools: [extLink('All runs', LINKS.actions, 'link-button', 'external')] });
    recent.append(runs.length ? table(['Time', 'Workflow', 'Branch', 'Commit', 'Status'], runs.slice(0, 10).map((r) => [r.created_at ? dateTimeText(r.created_at) : '—', r.url ? linkCell(r.name || 'Run', r.url) : r.name || '—', r.branch || '—', r.commit || '—', statusTag(r.status !== 'completed' ? 'Running' : r.conclusion === 'success' ? 'Success' : r.conclusion || 'Failed', r.status !== 'completed' ? 'info' : r.conclusion === 'success' ? 'good' : 'bad')])) : empty('No CI runs', release.status === 'not_configured' ? 'Set OWNER_GITHUB_ACTIONS_TOKEN in Vercel.' : release.message || 'Nothing recent.'));
    const results = card('Test Results', { span: 5, sub: 'Outcomes of the latest completed CI runs.' });
    results.append(done.length ? donut([{ label: 'Passed', value: okRuns.length, tone: 2 }, { label: 'Failed', value: badRuns.length, tone: 4 }, { label: 'Other', value: done.length - okRuns.length - badRuns.length, tone: 3 }], num(done.length), 'Runs') : empty('No completed runs'));
    const prs = card('Open Pull Requests', { span: 7, tools: [extLink('GitHub', LINKS.pulls, 'link-button', 'external')] });
    const pr = release.pull_requests || [];
    prs.append(pr.length ? table(['#', 'Title', 'Branch', 'Updated'], pr.map((x) => ['#' + x.number, x.url ? linkCell(x.title || 'Pull request', x.url) : x.title, x.branch || '—', x.updated_at ? ago(x.updated_at) : '—'])) : empty('No open pull requests'));
    const deps = card('Production Deployments', { span: 5 });
    deps.append(dep && (dep.deployments || []).length ? table(['Time', 'Commit', 'Status'], dep.deployments.slice(0, 6).map((x) => [x.created_at ? dateTimeText(x.created_at) : '—', x.commit ? x.commit.slice(0, 7) : '—', statusTag(x.state, x.state === 'ready' ? 'good' : 'bad')])) : empty('Vercel source not connected'));
    g.append(pipe, check, envs, recent, results, prs, deps);
    g.append(actions('Quick Actions', [
      ['Deploy', 'Merge a ready PR', 'check-circle', 'blue', LINKS.pulls],
      ['View Logs', 'GitHub Actions', 'file', 'green', LINKS.actions],
      ['Run Tests', 'Re-run in Actions', 'check', 'amber', LINKS.actions],
      ['Security Scan', 'Code scanning', 'shield', 'pink', LINKS.githubSecurity],
      ['Rollback', 'Instant rollback in Vercel', 'rotate', 'purple', LINKS.vercel],
      ['Refresh', 'Reload release data', 'refresh', 'cyan', () => { release = null; render(); }]
    ], { tiles: true }));
  }
  function linkCell(text, href) { const a = el('a', '', text); a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'; return a; }

  function miniReport(title, sub, stats, chartNode, page, tab) {
    const c2 = card(title, { span: 4, sub, tools: [button('View Full Report', 'btn', () => go(page, tab))] }), ms2 = el('div', 'mini-stats');
    stats.forEach(([v, l]) => { const s = el('div'); s.append(el('strong', '', v), el('small', '', l)); ms2.append(s); });
    c2.append(ms2, chartNode || empty('No chart data'));
    return c2;
  }
  function pageReports(c) {
    const g = el('div', 'dash'), d = dash_(), w = windowRows(), labels = w.cur.map((r) => dayLabel(r.day)), users = data && data.user_summary, plans = data && data.plans_24h, m = d ? d.media_totals : null, a = d ? d.automation : null;
    const bar = el('div', 'span-12 card-tools');
    bar.append(rangeSelect(), button('Export Daily CSV', 'btn primary', exportSeries, 'download'), button('Usage CSV (24h)', 'btn', () => { window.location.href = '/owner/api/export?window=24h'; }, 'download'), button('Print / PDF', 'btn', () => window.print(), 'printer'));
    g.append(bar);
    const small = (label, value, ic, tone, f) => { const k = kpi(label, value, ic, tone, d && f ? trend(f).delta : note('Current')); k.className = 'card kpi small span-2'; return k; };
    g.append(small('New Users', d ? num(total(w.cur, 'new_users')) : '—', 'users', 'blue', 'new_users'), small('Gross Revenue', d ? peso(total(w.cur, 'gross_php_minor')) : '—', 'dollar', 'green', 'gross_php_minor'), small('AI Requests', d ? compact(total(w.cur, 'requests')) : '—', 'layers', 'amber', 'requests'), small('Media Generated', d ? num(total(w.cur, 'images') + total(w.cur, 'videos')) : '—', 'image', 'pink', (r) => pick(r, 'images') + pick(r, 'videos')), small('Subscribers', plans ? num(plans.active_paid_periods) : '—', 'user', 'purple'), small('Success Rate', d && total(w.cur, 'requests') ? pct(total(w.cur, 'successes'), total(w.cur, 'requests'), 2) : '—', 'shield', 'cyan'));
    const lc = (series, o) => d ? lineChart(labels, series, Object.assign({ height: 150, legend: false }, o)) : null;
    const bc = (series, o) => d ? barChart(labels, series, Object.assign({ height: 150, legend: false }, o)) : null;
    g.append(
      miniReport('Users & Growth', 'Sign-ups and active users.', [[users ? num(users.auth_user_records) : '—', 'Total users'], [d ? num(total(w.cur, 'new_users')) : '—', 'New sign-ups'], [plans ? num(plans.active_paid_periods) : '—', 'Paid'], [data && data.growth_summary && data.growth_summary.return_rate_pct != null ? Number(data.growth_summary.return_rate_pct).toFixed(0) + '%' : '—', 'Return rate']], lc([{ name: 'Active users', tone: 1, values: w.cur.map((r) => pick(r, 'active_users')) }, { name: 'New users', tone: 2, values: w.cur.map((r) => pick(r, 'new_users')), area: false }]), 'users'),
      miniReport('Revenue & Payments', 'Gross PayMongo payments.', [[d ? peso(total(w.cur, 'gross_php_minor')) : '—', 'Gross'], [d ? num(total(w.cur, 'payments')) : '—', 'Payments'], [d ? num(total(w.cur, 'new_pro')) : '—', 'Pro'], [d ? num(total(w.cur, 'new_max') + total(w.cur, 'new_ultra')) : '—', 'Max + Ultra']], bc([{ name: 'Pro', tone: 1, values: w.cur.map((r) => pick(r, 'new_pro')) }, { name: 'Max', tone: 3, values: w.cur.map((r) => pick(r, 'new_max')) }, { name: 'Ultra', tone: 4, values: w.cur.map((r) => pick(r, 'new_ultra')) }], { stacked: true }), 'finance'),
      miniReport('Token Usage', 'Input plus output tokens.', [[d ? compact(total(w.cur, 'tokens')) : '—', 'Total'], [d ? compact(total(w.cur, 'tokens') / Math.max(1, w.n)) : '—', 'Daily avg'], [d ? compact(total(w.cur, 'requests')) : '—', 'Requests'], [d ? compact(total(w.cur, 'conversations')) : '—', 'Chats']], lc([{ name: 'Tokens', tone: 0, values: w.cur.map((r) => pick(r, 'tokens')) }]), 'ai-ops'),
      miniReport('Media Generation', 'Images, videos and files.', [[m ? num(Number(m.images) + Number(m.videos)) : '—', 'All time'], [d ? num(total(w.cur, 'images')) : '—', 'Images'], [d ? num(total(w.cur, 'videos')) : '—', 'Videos'], [d ? num(total(w.cur, 'files')) : '—', 'Files sent']], bc([{ name: 'Images', tone: 1, values: w.cur.map((r) => pick(r, 'images') + pick(r, 'videos')) }]), 'content'),
      miniReport('AI Provider Analytics', 'Usage by provider.', [[d ? compact(total(w.cur, 'requests')) : '—', 'Requests'], [data && data.usage_7d && Number(data.usage_7d.cost_known_rows) > 0 ? moneyText(data.usage_7d.provider_reported_cost_usd) : '—', 'Cost 7d'], [data && data.usage_7d ? ms(data.usage_7d.latency_p95_ms) : '—', 'p95'], [d && total(w.cur, 'requests') ? pct(total(w.cur, 'successes'), total(w.cur, 'requests'), 1) : '—', 'Success']], d && (d.provider_health || []).length ? barRows(d.provider_health.slice(0, 4).map((p, i) => ({ label: p.provider, value: Number(p.requests), tone: i + 1 }))) : null, 'ai-ops'),
      miniReport('System & Infrastructure', 'Latency and failures.', [[d ? compact(total(w.cur, 'requests')) : '—', 'API calls'], [data && data.usage_7d ? ms(data.usage_7d.latency_p50_ms) : '—', 'p50'], [data && data.deployment_summary ? num(data.deployment_summary.ready_count) : '—', 'Ready deploys'], [d && total(w.cur, 'requests') ? pct(total(w.cur, 'failures'), total(w.cur, 'requests'), 2) : '—', 'Error rate']], lc([{ name: 'p95', tone: 2, values: w.cur.map((r) => Number(r.latency_p95_ms) || 0) }], { fmt: ms }), 'infrastructure'),
      miniReport('Security & Failures', 'Failures and Auth activity.', [[d ? num(total(w.cur, 'failures')) : '—', 'Failed calls'], [data && data.platform_auth_audit_24h && data.platform_auth_audit_24h.available ? num(data.platform_auth_audit_24h.sign_in_events) : '—', 'Sign-ins 24h'], [data && data.audit_24h ? num(data.audit_24h.event_count) : '—', 'Owner events'], [incidentsCache ? num((incidentsCache.counts || {}).open || 0) : '—', 'Open incidents']], lc([{ name: 'Failures', tone: 4, values: w.cur.map((r) => pick(r, 'failures')) }]), 'security'),
      miniReport('Automation', 'Workflow runs.', [[a ? num(a.workflows) : '—', 'Workflows'], [d ? num(total(w.cur, 'automation_ok')) : '—', 'Succeeded'], [d ? num(total(w.cur, 'automation_failed')) : '—', 'Failed'], [a && a.avg_duration_ms != null ? ms(a.avg_duration_ms) : '—', 'Avg time']], bc([{ name: 'Succeeded', tone: 2, values: w.cur.map((r) => pick(r, 'automation_ok')) }, { name: 'Failed', tone: 4, values: w.cur.map((r) => pick(r, 'automation_failed')) }]), 'automation'),
      miniReport('Search & Traffic', 'Google Search Console and GA4.', [['GSC', 'Clicks'], ['GA4', 'Visits'], ['', ''], ['', '']], empty('Open the full report', 'Loaded live from Google when connected.'), 'users', 'google-analytics')
    );
    const sum = card('Recent Activity Summary', { span: 8 });
    sum.append(d && (d.recent_activity || []).length ? table(['Date & time', 'Category', 'Details'], d.recent_activity.map((x) => [dateTimeText(x.at), x.kind[0].toUpperCase() + x.kind.slice(1), x.label])) : empty('No recent activity', d ? 'Nothing yet.' : 'Needs migration 080.'));
    g.append(sum, actions('Custom Reports & Exports', [
      ['Generate', 'Daily CSV for range', 'file', 'blue', exportSeries],
      ['Usage export', 'Aggregate CSV (7d)', 'clock', 'green', () => { window.location.href = '/owner/api/export?window=7d'; }],
      ['Print', 'Save as PDF', 'printer', 'amber', () => window.print()],
      ['Saved', 'Exports module', 'list', 'pink', () => go('reports', 'reports')]
    ], { span: 4, tiles: true }));
    c.append(g);
  }

  let settingsSection = 'general';
  function pageSettings(c) {
    const g = el('div', 'dash'), side = el('section', 'card span-3'), nav = el('nav', 'settings-nav'), main = el('div', 'span-9 dash');
    main.classList.add('settings-main');
    const sections = [['general', 'General', 'settings'], ['appearance', 'Appearance', 'eye'], ['api-keys', 'API Keys', 'key'], ['access', 'Access & Permissions', 'users'], ['security', 'Security', 'shield'], ['notifications', 'Notifications', 'bell'], ['integrations', 'Integrations', 'share'], ['data', 'Data Sources', 'database'], ['about', 'About', 'file']];
    sections.forEach(([k, t, ic]) => { const b = button(t, 'nav-btn' + (settingsSection === k ? ' active' : ''), () => { settingsSection = k; render(); }, ic); nav.append(b); });
    side.append(nav);
    const field = (label, value) => { const f = el('div', 'field'); f.append(el('span', '', label), el('div', 'value', value)); return f; };
    const selField = (label, opts, key) => { const f = el('label', 'field'); f.append(el('span', '', label), selectEl(opts, prefs[key], (v) => { prefs[key] = v; savePrefs(); toast('Saved on this device.'); render(); }, label)); return f; };
    const general = card('General Settings', { span: 6, sub: 'Basic configuration for the Owner Command Center.' }), fg = el('div', 'form-grid');
    fg.append(field('Platform Name', 'NasrinAI'), field('Signed-in owner', dash && dash.owner ? dash.owner.email_masked || 'Owner' : '—'), field('Timezone', Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local'), field('Session ends', dash && dash.owner ? timeText(dash.owner.session_expires_at) : '—'), selField('Date Format', [['medium', 'Oct 23, 2026'], ['iso', '2026-10-23'], ['dmy', '23/10/2026']], 'dateFormat'), selField('Time Format', [['12h', '12-hour (AM/PM)'], ['24h', '24-hour']], 'timeFormat'));
    general.append(fg);
    const appearance = card('Appearance', { span: 6, sub: 'Saved on this device only.' });
    const themes = el('div', 'theme-cards');
    [['light', 'Light', 'sun'], ['dark', 'Dark', 'moon'], ['system', 'System', 'monitor']].forEach(([k, t, ic]) => { const b = button(t, 'choice', () => { prefs.theme = k; savePrefs(); applyPrefs(); render(); }, ic); b.setAttribute('aria-pressed', String(prefs.theme === k)); themes.append(b); });
    const sw = el('div', 'swatches');
    ['blue', 'green', 'amber', 'pink', 'purple', 'mono'].forEach((k) => { const b = button('', 'swatch', () => { prefs.accent = k; savePrefs(); applyPrefs(); render(); }); b.dataset.accent = k; b.setAttribute('aria-label', k + ' accent'); b.setAttribute('aria-pressed', String(prefs.accent === k)); sw.append(b); });
    const seg = (key, opts) => { const s = el('div', 'seg'); opts.forEach(([k, t]) => { const b = button(t, 'choice', () => { prefs[key] = k; savePrefs(); applyPrefs(); render(); }); b.setAttribute('aria-pressed', String(prefs[key] === k)); s.append(b); }); return s; };
    const ap = el('div', 'rows');
    ap.append(themes, rowLine('Accent Color', null, sw), rowLine('Sidebar Style', null, seg('sidebar', [['default', 'Default'], ['compact', 'Compact']])), rowLine('Font Size', null, seg('font', [['small', 'Small'], ['medium', 'Medium'], ['large', 'Large']])));
    appearance.append(ap);
    const acc = dash ? dash.access : null;
    const access = card('Access & Permissions', { span: 6, sub: 'Allowlists live in Vercel environment variables; values are never shown here.' }), ar = el('div', 'rows');
    const fixed = (on) => { const t = el('button', 'toggle'); t.type = 'button'; t.disabled = true; t.setAttribute('aria-pressed', String(on)); t.title = 'Enforced by the server'; return t; };
    ar.append(rowLine('Owner emails (OWNER_ALLOWED_EMAILS)', null, acc ? num(acc.owner_emails) : '—', { icon: 'mail' }), rowLine('Allowed IPs (OWNER_ALLOWED_IPS)', null, acc ? num(acc.allowed_ips) : '—', { icon: 'lock' }), rowLine('Require both email and IP', null, fixed(true), { icon: 'shield' }));
    access.append(ar, extLink('Edit in Vercel', LINKS.vercel, 'btn', 'external'));
    const sec = card('Security Settings', { span: 6, sub: 'Enforced in code. Changing them requires a reviewed code change.' }), sr = el('div', 'rows');
    sr.append(rowLine('Session timeout', null, acc ? acc.session_minutes + ' minutes' : '—', { icon: 'clock' }), rowLine('Owner access logging', null, fixed(true), { icon: 'file' }), rowLine('404 outside allowed IPs', null, fixed(true), { icon: 'globe' }), rowLine('Sign out everywhere', null, button('Sign out', 'btn', signOut), { icon: 'key' }));
    sec.append(sr);
    const notif = card('Notifications', { span: 6 }), nr = el('div', 'rows');
    nr.append(rowLine('In-console alerts (bell)', null, fixed(true), { icon: 'bell' }), rowLine('Owner alert delivery', null, el('span', 'muted', 'Server-side outbox'), { icon: 'mail' }), rowLine('Incident register', null, button('Open', 'btn', () => go('security', 'incidents')), { icon: 'alert' }));
    notif.append(nr);
    const integ = (dash && dash.integrations) || {}, ig = card('Integrations', { span: 6, sub: 'Connection status only; credentials stay on the server.' }), ir = el('div', 'rows');
    [['Supabase', 'Database, Auth, Storage', integ.supabase, LINKS.supabase], ['Vercel (read-only)', 'Deployments', integ.vercel, LINKS.vercel], ['GitHub Actions', 'CI & model checks', integ.github_actions, LINKS.actions], ['GitHub App', 'Coding chat', integ.github_app, LINKS.github], ['PayMongo', 'Payments', integ.paymongo, LINKS.paymongo], ['OpenRouter', 'Models & billing', integ.openrouter, LINKS.openrouter], ['OpenAI billing', 'Admin key', integ.openai_billing, 'https://platform.openai.com/usage'], ['Anthropic billing', 'Admin key', integ.anthropic_billing, 'https://console.anthropic.com/'], ['Cloudflare billing', 'API token', integ.cloudflare_billing, 'https://dash.cloudflare.com/']].forEach(([name, sub, on, href]) => { const right = el('div', 'card-tools'); right.append(statusTag(on ? 'Connected' : 'Not configured', on ? 'good' : 'idle'), extLink('Manage', href, 'btn')); const r = rowLine(name, null, right, { icon: 'share' }); r.querySelector('.name > span:last-child').append(el('small', 'sub', sub)); ir.append(r); });
    ig.append(ir);
    const about = card('About', { span: 6 }), ab = el('div', 'rows');
    ab.append(rowLine('Console', null, 'Owner Command Center'), rowLine('Data policy', null, 'Real data only · masked emails'), rowLine('Data window', null, dash ? dash.window_days + ' days' : '—'), rowLine('Last refresh', null, data ? timeText(data.generated_at) : '—'));
    about.append(ab);
    const map = { general: [general, appearance], appearance: [appearance, general], access: [access, sec], security: [sec, access], notifications: [notif, ig], integrations: [ig, notif], about: [about, general] };
    if (settingsSection === 'data') { main.append(sourcesCard()); }
    else if (settingsSection === 'api-keys') { main.append(apiKeysCard()); }
    else (map[settingsSection] || map.general).forEach((x) => main.append(x));
    if (!['data', 'api-keys'].includes(settingsSection)) [general, appearance, access, sec, notif, ig].filter((x) => !(map[settingsSection] || []).includes(x)).forEach((x) => main.append(x));
    g.append(side, main);
    c.append(g);
  }
  async function sendJson(url, payload) {
    const response = await fetch(url, { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(payload) });
    if (response.status === 404 && !/revoke$/.test(url)) { window.location.href = 'https://www.nasrinai.com/'; throw new Error('session ended'); }
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error((body && body.error && body.error.message) || 'Request failed');
    return body;
  }
  // API keys: created once (full key shown a single time), listed by prefix only, revoked with confirmation.
  function apiKeysCard() {
    const c2 = card('API Keys', { span: 12, sub: 'Secret keys for calling the NasrinAI API from your own servers (scope: chat). The full key is shown once; only its hash is stored. Never put a secret key in browser or app code.' });
    const form = el('form', 'card-tools'), input = el('input', 'select'), reveal = el('div'), list = el('div');
    input.type = 'text'; input.maxLength = 80; input.required = true; input.placeholder = 'Key name, e.g. POS server'; input.setAttribute('aria-label', 'Key name');
    const create = button('Create key', 'btn primary', null, 'plus'); create.type = 'submit';
    form.append(input, create);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const label = input.value.trim();
      if (!label) return;
      if (!window.confirm('Create a new API key named "' + label + '"? Anyone holding it can use NasrinAI as your service.')) return;
      create.disabled = true;
      try {
        const out = await sendJson('/owner/api/api-keys', { label, confirm: true });
        input.value = '';
        const box = el('div', 'key-reveal'), code = el('code', '', out.key), copy = button('Copy', 'btn', async () => { try { await navigator.clipboard.writeText(out.key); toast('Key copied. Store it in your server settings now.'); } catch (_) { toast('Copy failed. Select the key and copy it manually.'); } }, 'file');
        box.append(el('strong', '', 'Copy this key now — it will not be shown again.'), code, copy, el('small', 'sub', 'Use it as: Authorization: Bearer <key>  ·  POST https://www.nasrinai.com/v1/chat  {"message": "Hello"}'));
        reveal.replaceChildren(box);
        load();
      } catch (err) { toast(err.message); } finally { create.disabled = false; }
    });
    async function load() {
      list.replaceChildren(el('div', 'loading', 'Loading keys…'));
      try {
        const out = await getJson('/owner/api/api-keys');
        const keys = out.keys || [];
        list.replaceChildren(el('p', 'freshness', num(out.active) + ' of ' + num(out.limit) + ' active keys'));
        if (!keys.length) { list.append(empty('No API keys yet', 'Create one above for a server that should call NasrinAI.')); return; }
        list.append(table(['Name', 'Key', 'Scope', 'Created', 'Status', ''], keys.map((k) => {
          const revokeBtn = k.revoked_at ? el('span', 'muted', '—') : button('Revoke', 'btn', async () => {
            if (!window.confirm('Revoke "' + k.label + '" (' + k.prefix + '…)? Servers using it stop working immediately.')) return;
            try { await sendJson('/owner/api/api-keys/' + k.id + '/revoke', { confirm: true }); toast('Key revoked.'); load(); } catch (err) { toast(err.message); }
          }, 'x');
          return [k.label, k.prefix + '_…', (k.scopes || []).join(', '), dateText(k.created_at), statusTag(k.revoked_at ? 'Revoked' : 'Active', k.revoked_at ? 'idle' : 'good'), revokeBtn];
        })));
      } catch (err) { list.replaceChildren(empty('API keys unavailable', err.message)); }
    }
    c2.append(form, reveal, list);
    load();
    return c2;
  }
  function sourcesCard() { const s = card('Data Sources', { span: 12, sub: 'A source is Available only when its server-side query succeeds.' }); s.append(sourceRows()); return s; }

  // ---- routing --------------------------------------------------------------------
  const PAGES = {
    overview: { title: null, desc: 'Here’s what’s happening with NasrinAI today.', render: pageOverview, tabs: [['snapshot', 'Data Readiness']] },
    'ai-ops': { title: 'AI Ops Center', desc: 'Real-time monitoring, AI services, and system operations.', render: pageAiOps, tabs: [['logs', 'AI Logs'], ['ai', 'Usage & Verification'], ['openrouter-unlisted', 'Unlisted Models'], ['other-unlisted', 'Model Activities'], ['learning', 'Community Learning'], ['intelligence', 'Continuous Intelligence']] },
    users: { title: 'Users & CRM', desc: 'Manage users, subscriptions, customer relationships, and engagement.', render: pageUsers, tabs: [['users', 'Growth & Retention'], ['regional', 'Regional'], ['google-analytics', 'Search & Traffic']] },
    content: { title: 'Content & Media', desc: 'User-generated and system content, media files, and storage.', render: pageContent },
    finance: { title: 'Finance', desc: 'Track revenue, subscriptions, payments, and financial performance.', render: pageFinance, tabs: [['finance', 'Costs & Billing']] },
    infrastructure: { title: 'Infrastructure', desc: 'Monitor systems, services, deployments, and integrations.', render: pageInfrastructure, tabs: [['infra', 'Database & Deployments']] },
    security: { title: 'Security', desc: 'Monitor threats, access control, and system security.', render: pageSecurity, tabs: [['security', 'Audit'], ['incidents', 'Incidents']] },
    automation: { title: 'Automation', desc: 'Monitor workflows, integrations, and automated operations.', render: pageAutomation, tabs: [['automation', 'Run Health']] },
    release: { title: 'Release Guard', desc: 'Ensure safe, reliable, and controlled deployments for NasrinAI.', render: pageRelease },
    reports: { title: 'Reports', desc: 'Analytics and detailed reports across all areas of NasrinAI.', render: pageReports, tabs: [['reports', 'Exports']] },
    settings: { title: 'Settings', desc: 'Configure the Owner Command Center and platform preferences.', render: pageSettings }
  };
  function legacy(key) {
    if (key === 'snapshot') renderOverview();
    else if (key === 'learning') renderLearning();
    else if (key === 'intelligence') renderIntelligence();
    else if (key === 'openrouter-unlisted') renderUnlistedModels();
    else if (key === 'other-unlisted') renderActivities();
    else if (key === 'regional') renderRegional();
    else if (key === 'google-analytics') renderGoogleAnalytics();
    else renderModule(key);
  }
  function go(page, tab) { const next = '#/' + page + (tab && tab !== 'dashboard' ? '/' + tab : ''); if (window.location.hash === next) render(); else window.location.hash = next; closePanels(); }
  function fromHash() {
    const parts = window.location.hash.replace(/^#\/?/, '').split('/');
    active = PAGES[parts[0]] ? parts[0] : 'overview';
    const tabs = (PAGES[active].tabs || []).map((t) => t[0]);
    activeTab = tabs.includes(parts[1]) ? parts[1] : 'dashboard';
  }
  function render() {
    if (liveTimer) { clearInterval(liveTimer); liveTimer = null; }
    const page = PAGES[active], c = $('content');
    const title = $('page-title'); title.replaceChildren();
    if (page.title) title.textContent = page.title; else title.append(document.createTextNode('Welcome back, '), el('span', 'accent-text', 'Nasrin'));
    $('page-description').textContent = page.desc;
    document.title = (page.title || 'Overview') + ' · Owner Command Center';
    document.querySelectorAll('.nav-item').forEach((b) => { const on = b.dataset.page === active; b.classList.toggle('active', on); if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    const tabsEl = $('subtabs'); tabsEl.replaceChildren();
    if (page.tabs) [['dashboard', 'Dashboard'], ...page.tabs].forEach(([k, t]) => { const b = button(t, 'subtab' + (activeTab === k ? ' active' : ''), () => go(active, k)); b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', String(activeTab === k)); tabsEl.append(b); });
    c.replaceChildren();
    if (activeTab !== 'dashboard') { legacy(activeTab); return; }
    page.render(c);
  }
  function setRange(value) { prefs.range = value; savePrefs(); $('range').value = value; loadDashboard().then(render); }
  function rangeDates() {
    const n = { '7d': 7, '14d': 14, '30d': 30 }[prefs.range] || 7, end = new Date(), start = new Date(Date.now() - (n - 1) * 86400e3);
    $('range-dates').textContent = dateText(start) + ' – ' + dateText(end);
  }
  async function loadDashboard() {
    rangeDates();
    try { dash = await getJson('/owner/api/dashboard?window=' + encodeURIComponent(prefs.range)); } catch (_) { if (!dash) dash = { status: 'unavailable', window_days: 7 }; }
    if (dash && dash.owner && dash.owner.email_masked) $('owner-session').textContent = 'Signed in as ' + dash.owner.email_masked;
  }
  async function refresh(force) {
    $('freshness').textContent = 'Checking data sources…';
    if (force) { incidentsCache = null; release = null; }
    try {
      const [overview] = await Promise.all([getJson('/owner/api/overview'), loadDashboard()]);
      data = overview;
      $('freshness').textContent = 'Updated ' + timeText(data.generated_at) + (dash && dash.status === 'unavailable' ? ' · charts need migration 080' : '') + ' · real data only';
    } catch (_) {
      $('freshness').textContent = 'Could not refresh. No data was cached.';
    }
    updateStatusPill();
    await updateNotifications();
    render();
  }
  async function signOut() {
    try { await fetch('/owner/api/session', { method: 'DELETE', credentials: 'same-origin', cache: 'no-store' }); } catch (_) {}
    window.location.href = 'https://www.nasrinai.com/';
  }
  function closePanels() {
    $('notify-panel').hidden = true; $('bell').setAttribute('aria-expanded', 'false');
    $('owner-menu').hidden = true; $('owner-card').setAttribute('aria-expanded', 'false');
    $('sidebar').closest('.shell').classList.remove('nav-open'); $('menu-toggle').setAttribute('aria-expanded', 'false');
  }

  // ---- wiring -----------------------------------------------------------------------
  applyPrefs();
  document.querySelectorAll('[data-icon]').forEach((n) => n.replaceWith(icon(n.dataset.icon)));
  document.querySelectorAll('.nav-item').forEach((b) => b.addEventListener('click', () => go(b.dataset.page)));
  $('range').value = prefs.range;
  $('range').addEventListener('change', () => setRange($('range').value));
  $('status-pill').addEventListener('click', () => go('infrastructure'));
  $('bell').addEventListener('click', (e) => { e.stopPropagation(); const open = $('notify-panel').hidden; closePanels(); $('notify-panel').hidden = !open; $('bell').setAttribute('aria-expanded', String(open)); });
  $('notify-all').addEventListener('click', () => go('security', 'incidents'));
  $('owner-card').addEventListener('click', (e) => { e.stopPropagation(); const open = $('owner-menu').hidden; closePanels(); $('owner-menu').hidden = !open; $('owner-card').setAttribute('aria-expanded', String(open)); });
  $('owner-menu').querySelector('[data-go]').addEventListener('click', () => go('settings'));
  $('theme-toggle').addEventListener('click', () => { prefs.theme = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'; savePrefs(); applyPrefs(); closePanels(); if (active === 'settings') render(); });
  $('signout').addEventListener('click', () => { $('signout').disabled = true; signOut(); });
  $('menu-toggle').addEventListener('click', (e) => { e.stopPropagation(); const shell = $('sidebar').closest('.shell'), open = !shell.classList.contains('nav-open'); closePanels(); shell.classList.toggle('nav-open', open); $('menu-toggle').setAttribute('aria-expanded', String(open)); });
  document.addEventListener('click', (e) => { if (!e.target.closest('.notify-panel, .owner-menu, .sidebar')) closePanels(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePanels(); });
  window.addEventListener('hashchange', () => { fromHash(); render(); });
  fromHash();
  refresh();
})();
