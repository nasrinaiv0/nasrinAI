(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const names = {
    overview: ['Good to have you back.', 'A clear view of platform health, AI operations, and business signals.', '◫'],
    ai: ['AI Operations', 'Provider performance, routing, latency, and token usage from verified telemetry.', '✳'],
    users: ['Users & Growth', 'Activity signals from recorded usage; registered-account totals remain separate.', '♙'],
    infra: ['Infrastructure & Releases', 'Database reachability and connected deployment sources.', '⌘'],
    security: ['Security & Audit', 'Authorization health and minimized owner-action audit events.', '◇'],
    automation: ['Automation & Jobs', 'Workflow health, queue state, retries, and execution outcomes.', '↗'],
    finance: ['Finance & Costs', 'Internal AI cost estimates, distinct from invoices and settled billing.', '▤'],
    incidents: ['Incidents & Alerts', 'Operational issues and alert delivery from verified sources.', '◎'],
    reports: ['Reports & Exports', 'Date-scoped aggregate reports from verified data sources.', '▥'],
    settings: ['Settings', 'Owner-console access status. Allowlist values remain in Vercel.', '⚙']
  };
  const sources = {
    ai_usage: ['AI usage & tokens', 'Request-level usage events and cost-estimate coverage'],
    users: ['Users & growth', 'Registered-account and retention sources not connected'],
    infrastructure: ['Infrastructure & releases', 'Vercel and dependency health integrations'],
    database: ['Database connection', 'Server-side Supabase reachability check'],
    security_audit: ['Owner action audit events', 'Session and export events only'],
    automation: ['Automation & jobs', 'Aggregate workflow run states'],
    finance: ['Finance & costs', 'Settled billing and provider-cost reconciliation'],
    plan_entitlements: ['Paid plan entitlements', 'Current active Max/Ultra periods; not revenue'],
    incidents: ['Incidents & alerts', 'Durable incident states and alert delivery']
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
    const n = Number(value);
    return Number.isFinite(n) ? '~' + new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 4 }).format(n) : 'Unavailable';
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
  function renderOverview() {
    const c = $('content'), u = data && data.usage_24h;
    const hasUsage = Boolean(u), requests = hasUsage ? Number(u.request_count) : NaN;
    const noData = hasUsage && requests === 0;
    c.replaceChildren();
    c.append(notice(hasUsage ? 'Usage telemetry is connected' : 'Telemetry connections are not verified yet',
      hasUsage
        ? 'AI usage metrics are aggregated from server-side events. Cost values are internal estimates, not provider invoices. Registered-account totals, infrastructure/release telemetry, platform-wide security events, billing reconciliation, incidents, and alerts remain unavailable until their sources are verified.'
        : 'The secure console is in place, but this view deliberately does not invent metrics. Each panel shows real figures only after its server-side source, definitions, and access checks are verified.'));
    c.append(head('Platform snapshot', 'Last 24 hours · recorded model-call telemetry only.', 'Read-only'));
    const grid = el('div', 'grid');
    const requestValue = !hasUsage ? 'Unavailable' : noData ? 'No data yet' : numberText(requests);
    const successValue = !hasUsage ? 'Unavailable' : noData ? 'No data yet' : requests > 0 ? (Number(u.success_count) / requests * 100).toFixed(1) + '%' : 'No data yet';
    const activeValue = !hasUsage ? 'Unavailable' : noData ? 'No data yet' : numberText(u.active_user_ids);
    const tokenValue = !hasUsage ? 'Unavailable' : noData ? 'No data yet' : numberText(u.total_tokens);
    const costValue = !hasUsage || Number(u.cost_estimate_rows) === 0 ? 'Unavailable' : moneyText(u.estimated_cost_usd);
    const latencyValue = !hasUsage || u.latency_p95_ms === null || u.latency_p95_ms === undefined ? 'Unavailable' : numberText(Math.round(Number(u.latency_p95_ms))) + ' ms';
    grid.append(
      metric('AI requests', '✳', requestValue, 'Recorded model-call events'),
      metric('Success rate', '✓', successValue, 'Successful outcomes / recorded requests'),
      metric('Active user IDs', '♙', activeValue, 'Distinct signed-in IDs with calls; not total accounts'),
      metric('Tokens recorded', '↗', tokenValue, 'Input plus output tokens'),
      metric('Estimated AI cost', 'USD', costValue, Number(u && u.cost_estimate_rows) > 0 ? 'Internal estimate; not an invoice' : 'No cost estimates recorded'),
      metric('p95 latency', '◷', latencyValue, 'Successful-call latency, when observations exist')
    );
    c.append(grid);
    const lower = el('div', 'lower-grid'), readiness = el('section', 'panel'), statusPanel = el('section', 'panel');
    readiness.append(el('h3', '', 'Data-source readiness'), el('p', 'panel-copy', 'A source is marked available only when its server-side query succeeds. No placeholder zeros are shown.'), sourceRows());
    statusPanel.append(el('h3', '', 'Implementation status'), el('p', 'panel-copy', 'The owner access boundary and responsive shell are implemented. Usage, automation, and owner-action audit summaries require migration 042 to be applied and verified. Other panels remain unavailable until their source and permission boundaries are audited.'));
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
  function renderModule(key) {
    const c = $('content'), meta = names[key];
    c.replaceChildren();
    c.append(head(meta[0], meta[1], 'Read-only'), notice('No unverified data is shown', 'This module remains read-only. Data without a verified source is marked Unavailable rather than represented by fabricated counts or stale values.'));
    const sourceKeys = key === 'ai' ? ['ai_usage', 'infrastructure'] :
      key === 'users' ? ['users'] :
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
      card.append(el('div', 'module-symbol', meta[2]));
      body.append(el('h3', '', source[0]), el('p', '', source[1] + '. Source verification and freshness checks are required before this becomes actionable.'));
      const foot = el('div', 'module-meta');
      foot.append(state('Unavailable'), el('small', '', 'No data displayed'));
      body.append(foot);
      card.append(body);
      cards.append(card);
    });
    c.append(cards);

    if (key === 'ai') {
      const usage = data && data.usage_24h;
      const providers = data && data.usage_7d && Array.isArray(data.usage_7d.providers) ? data.usage_7d.providers : [];
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
          row.append(left, el('div', 'source-name', moneyText(item.estimated_cost_usd)));
          list.append(row);
        });
      } else list.append(el('p', 'panel-copy', 'Provider breakdown unavailable until usage telemetry is connected.'));
      panel.append(list);
      c.append(panel);
    }

    if (key === 'users') {
      const a = data && data.usage_24h, b = data && data.usage_7d, panel = el('section', 'panel');
      panel.classList.add('module-extra');
      panel.append(el('h3', '', 'Recorded activity signals'), el('p', 'panel-copy', 'These are distinct actor IDs with recorded model calls, not registered-account totals, signup counts, or retention cohorts.'));
      const grid = el('div', 'grid');
      const value = (summary, field) => !summary ? 'Unavailable' : Number(summary.request_count) === 0 ? 'No data yet' : numberText(summary[field]);
      grid.append(
        metric('Active user IDs · 24h', '♙', value(a, 'active_user_ids'), 'Signed-in actors with recorded calls'),
        metric('Active guest IDs · 24h', '◌', value(a, 'active_guest_ids'), 'Guest actors with recorded calls'),
        metric('Active user IDs · 7d', '♙', value(b, 'active_user_ids'), 'Distinct signed-in actors'),
        metric('Active guest IDs · 7d', '◌', value(b, 'active_guest_ids'), 'Distinct guest actors')
      );
      panel.append(grid);
      c.append(panel);
    }

    if (key === 'infra') {
      const panel = el('section', 'panel');
      panel.classList.add('module-extra');
      const db = data && data.database_health ? data.database_health.status : 'unavailable';
      panel.append(el('h3', '', 'Database reachability'), el('p', 'panel-copy', 'This is a bounded server-side connectivity check; it does not expose database rows.'));
      panel.append(state(db === 'available' ? 'Available' : 'Unavailable', db === 'available' ? 'available' : 'unavailable'));
      c.append(panel);
    }

    if (key === 'finance') {
      const usage = data && data.usage_24h, plans = data && data.plans_24h, hasCosts = Boolean(usage && Number(usage.cost_estimate_rows) > 0), panel = el('section', 'panel');
      panel.classList.add('module-extra');
      panel.append(el('h3', '', 'Recorded AI cost estimates'), el('p', 'panel-copy', 'These are internal estimates recorded with model calls, not provider invoices, settled payments, revenue, refunds, or net margin.'));
      const grid = el('div', 'grid');
      grid.append(
        metric('Estimated AI cost · 24h', 'USD', hasCosts ? moneyText(usage.estimated_cost_usd) : 'Unavailable', hasCosts ? 'Recorded cost estimates only' : 'No recorded cost estimates'),
        metric('Requests with cost', '▤', hasCosts ? numberText(usage.cost_estimate_rows) : 'Unavailable', 'Usage events with an estimate'),
        metric('Requests · 24h', '✳', usage ? numberText(usage.request_count) : 'Unavailable', 'Recorded usage events'),
        metric('Active paid plan periods', '◇', plans ? numberText(plans.active_paid_periods) : 'Unavailable', 'Unexpired active periods, not unique users'),
        metric('Max periods', 'M', plans ? numberText(plans.active_max_periods) : 'Unavailable', 'Current active Max periods'),
        metric('Ultra periods', 'U', plans ? numberText(plans.active_ultra_periods) : 'Unavailable', 'Current active Ultra periods')
      );
      panel.append(grid, el('p', 'panel-copy', 'Billing and revenue remain unavailable until payment and refund records are reconciled against authoritative webhook state.'));
      c.append(panel);
    }

    if (key === 'security') {
      const panel = el('section', 'panel'), audit = data && data.audit_24h;
      panel.classList.add('module-extra');
      panel.append(el('h3', '', 'Access boundary'), el('p', 'panel-copy', 'The current page is visible only after server-side email/IP validation. Allowlist values and the signing secret are never returned to the browser.'));
      const rows = el('div', 'source-list');
      [
        ['Owner session', '10-minute HttpOnly, SameSite=Strict cookie', 'Enabled'],
        ['Email and IP validation', 'Rechecked on protected requests', 'Enabled'],
        ['Shared IP rate limit', 'Uses the existing server-side limiter', 'Enabled'],
        ['Owner action audit history', 'Session and export events; raw IP values are not returned', audit ? (Number(audit.event_count) > 0 ? 'Available' : 'No data yet') : 'Unavailable']
      ].forEach((item) => {
        const row = el('div', 'source-row'), left = el('div');
        left.append(el('div', 'source-name', item[0]), el('div', 'source-detail', item[1]));
        row.append(left, state(item[2], item[2] === 'Enabled' || item[2] === 'Available' ? 'available' : 'unavailable'));
        rows.append(row);
      });
      panel.append(rows);
      const grid = el('div', 'grid');
      grid.append(metric('Owner audit events · 24h', '◇', audit ? numberText(audit.event_count) : 'Unavailable', audit && audit.last_event_at ? 'Last event ' + new Date(audit.last_event_at).toLocaleString() : 'No audit events recorded'));
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
    else renderModule(active);
  }
  async function refresh() {
    $('freshness').textContent = 'Checking data sources…';
    try {
      const response = await fetch('/owner/api/overview', { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } });
      if (response.status === 404) { window.location.href = '/'; return; }
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
    window.location.href = '/';
  });
  show('overview');
  refresh();
})();
