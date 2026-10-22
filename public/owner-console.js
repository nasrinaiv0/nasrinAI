(function(){
'use strict';
const $=id=>document.getElementById(id);
const names={
overview:['Good to have you back.','A clear view of platform health, AI operations, and business signals.','◫'],
ai:['AI Operations','Provider performance, routing, latency, and token usage from verified telemetry.','✳'],
users:['Users & Growth','Adoption and account trends, with personal data minimized by default.','♙'],
infra:['Infrastructure & Releases','Deployment and dependency status from connected sources.','⌘'],
security:['Security & Audit','Authorization health, security events, and owner-action history.','◇'],
automation:['Automation & Jobs','Workflow health, queue state, retries, and execution outcomes.','↗'],
finance:['Finance & Costs','Separate provider estimates, reservations, settled costs, and verified billing.','▤'],
incidents:['Incidents & Alerts','Operational issues and alert delivery, with clear ownership.','◎'],
reports:['Reports & Exports','Date-scoped reports from verified data sources.','▥'],
settings:['Settings','Owner-console preferences and access status. Allowlist values stay in Vercel.','⚙']
};
const sources={
ai_usage:['AI usage & tokens','Request-level usage events and provider cost semantics'],
users:['Users & growth','Verified account and activity definitions'],
infrastructure:['Infrastructure & releases','Vercel and dependency health integrations'],database:['Database connection','Server-side Supabase reachability check'],
security_audit:['Owner action audit events','Session and export events'],
automation:['Automation & jobs','Verified workflow and run-state mappings'],
finance:['Finance & costs','Settled billing and provider-cost reconciliation'],
incidents:['Incidents & alerts','Durable incident states and alert delivery']
};
let data=null,active='overview';
function el(tag,cls,txt){const n=document.createElement(tag);if(cls)n.className=cls;if(txt!==undefined)n.textContent=txt;return n}
function state(label,kind){return el('span','state '+(kind||'unavailable'),label)}
function head(title,desc){const h=el('div','section-head'),left=el('div');left.append(el('h2','',title),el('p','',desc));h.append(left,state('Read-only',''));return h}
function metric(title,icon,value,note){const c=el('article','metric'),t=el('div','metric-top');t.append(el('span','',title),el('span','metric-icon',icon));c.append(t,el('div','metric-value',value),el('div','metric-note',note));return c}
function sourceRows(){const list=el('div','source-list');Object.keys(sources).forEach(k=>{const r=el('div','source-row'),left=el('div'),s=data&&data.data_sources?data.data_sources[k]:'unavailable';left.append(el('div','source-name',sources[k][0]),el('div','source-detail',sources[k][1]));r.append(left,state(s==='available'?'Available':s==='no_data'?'No data yet':'Unavailable',s==='available'?'available':'unavailable'));list.append(r)});return list}
function notice(title,copy){const n=el('div','notice');n.append(el('div','notice-icon','i'));const b=el('div');b.append(el('strong','',title),el('p','',copy));n.append(b);return n}
function numberText(value){const n=Number(value);return Number.isFinite(n)?new Intl.NumberFormat().format(n):'Unavailable'}
function moneyText(value){const n=Number(value);return Number.isFinite(n)?'~'+new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:4}).format(n):'Unavailable'}
function renderOverview(){const c=$('content');c.replaceChildren();const u=data&&data.usage_24h,hasUsage=Boolean(u),requests=hasUsage?Number(u.request_count):NaN,noData=hasUsage&&requests===0;const available=hasUsage?'Recorded usage summary available':'Usage summary unavailable';c.append(notice(hasUsage?'Usage telemetry is connected':'Telemetry connections are not verified yet',hasUsage?'AI usage metrics are aggregated from server-side usage_events. Cost values are internal estimates, not provider invoices. Registered-account totals, revenue, infrastructure/release telemetry, security audit, incidents, and alerts remain unavailable until their sources are verified. Automation run-state aggregates are available after migration 042 is applied.':'The secure console is in place, but this view deliberately does not invent metrics. Each panel will show real figures only after its server-side source, definitions, and access checks are verified.'));c.append(head('Platform snapshot','Last 24 hours · values are based on recorded model-call telemetry.',available));const g=el('div','grid');const requestValue=!hasUsage?'Unavailable':noData?'No data yet':numberText(requests);const successValue=!hasUsage?'Unavailable':noData?'No data yet':requests>0?((Number(u.success_count)/requests)*100).toFixed(1)+'%':'No data yet';const activeValue=!hasUsage?'Unavailable':noData?'No data yet':numberText(u.active_user_ids);const tokenValue=!hasUsage?'Unavailable':noData?'No data yet':numberText(u.total_tokens);const costValue=!hasUsage?'Unavailable':Number(u.cost_estimate_rows)>0?moneyText(u.estimated_cost_usd):'Unavailable';const latencyValue=!hasUsage||u.latency_p95_ms===null||u.latency_p95_ms===undefined?'Unavailable':noData?'No data yet':numberText(Math.round(Number(u.latency_p95_ms)))+' ms';g.append(metric('AI requests','✳',requestValue,noData?'No recorded model calls in this window':'Recorded model-call events'),metric('Success rate','✓',successValue,hasUsage?'Successful outcomes / recorded requests':'Usage source unavailable'),metric('Active user IDs','♙',activeValue,'Distinct signed-in IDs with recorded calls; not total accounts'),metric('Tokens recorded','↗',tokenValue,'Input + output tokens from usage telemetry'),metric('Estimated AI cost','$',costValue,Number(u?.cost_estimate_rows)>0?'Internal estimate; not an invoice':'No cost estimates recorded'),metric('p95 latency','◷',latencyValue,'Successful-call latency, when observations exist'));c.append(g);const lower=el('div','lower-grid'),a=el('section','panel'),b=el('section','panel');a.append(el('h3','','Data-source readiness'),el('p','panel-copy','Every source needs a verified schema, definition, and freshness policy before it can drive an owner KPI.'),sourceRows());b.append(el('h3','','Implementation status'),el('p','panel-copy','The owner access boundary and responsive shell are implemented. AI usage summaries use a dedicated server-only aggregate RPC after migration 042 is applied. Automation run-state aggregates are included after migration 042 is applied. Other panels remain unavailable until their data sources and permission boundaries are audited.'));const list=el('div','source-list');[['Owner identity & IP allowlist','Server-side environment variables','Guard implemented'],['Short-lived owner session','HttpOnly cookie and strict same-site policy','Guard implemented'],['AI usage summary','Server-only aggregate RPC; no prompt content','Telemetry connected'],['Verified business and operational panels','Source audits and tests still required','Pending']].forEach(x=>{const r=el('div','source-row'),l=el('div');l.append(el('div','source-name',x[0]),el('div','source-detail',x[1]));r.append(l,state(x[2],x[2]==='Pending'?'unavailable':'available'));list.append(r)});b.append(list);lower.append(a,b);c.append(lower);if(hasUsage&&u.last_event_at){$('freshness').textContent='Last usage event '+new Date(u.last_event_at).toLocaleString()+' · estimates may be partial'}}
function renderModule(k) {
  const c = $('content'), m = names[k];
  c.replaceChildren();
  c.append(head(m[0], m[1]), notice('No unverified data is shown', 'This module is present in navigation, but its data source is not yet verified and connected. It remains unavailable rather than display fabricated counts, stale values as current, or unsafe controls.'));
  const keys = k === 'ai' ? ['ai_usage', 'infrastructure'] :
    k === 'users' ? ['users'] :
    k === 'infra' ? ['database', 'infrastructure'] :
    k === 'security' ? ['security_audit'] :
    k === 'automation' ? ['automation'] :
    k === 'finance' ? ['finance', 'ai_usage'] :
    k === 'incidents' ? ['incidents', 'security_audit'] :
    k === 'reports' ? ['ai_usage', 'users', 'finance'] :
    ['security_audit', 'infrastructure'];
  const grid = el('div', 'module-grid');
  keys.forEach((key) => {
    const source = sources[key], card = el('article', 'module-card');
    card.append(el('div', 'module-symbol', m[2]));
    const body = el('div');
    body.append(el('h3', '', source[0]), el('p', '', source[1] + '. Source verification and freshness checks are required before this becomes actionable.'));
    const foot = el('div', 'module-meta');
    foot.append(state('Unavailable'), el('small', '', 'No data displayed'));
    body.append(foot);
    card.append(body);
    grid.append(card);
  });
  c.append(grid);

  if (k === 'ai') {
    const usage = data && data.usage_24h;
    const providers = data && data.usage_7d && Array.isArray(data.usage_7d.providers) ? data.usage_7d.providers : [];
    const panel = el('section', 'panel');
    panel.classList.add('module-extra');
    panel.append(el('h3', '', 'Recorded AI activity'), el('p', 'panel-copy', 'Usage events contain aggregate telemetry only; cost values are internal estimates.'));
    const metrics = el('div', 'grid');
    metrics.append(
      metric('Requests · 24h', '✳', usage ? numberText(usage.request_count) : 'Unavailable', 'Recorded model calls'),
      metric('Tokens · 24h', '↗', usage ? numberText(usage.total_tokens) : 'Unavailable', 'Input plus output tokens'),
      metric('Success rate', '✓', usage && Number(usage.request_count) > 0 ? (Number(usage.success_count) / Number(usage.request_count) * 100).toFixed(1) + '%' : 'No data yet', 'Recorded successful outcomes'),
      metric('p95 latency', '◷', usage && usage.latency_p95_ms !== null && usage.latency_p95_ms !== undefined ? numberText(Math.round(Number(usage.latency_p95_ms))) + ' ms' : 'Unavailable', 'Successful calls')
    );
    panel.append(metrics);
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

  if (k === 'users') {
    const a = data && data.usage_24h, b = data && data.usage_7d;
    const panel = el('section', 'panel');
    panel.classList.add('module-extra');
    panel.append(el('h3', '', 'Recorded activity signals'), el('p', 'panel-copy', 'These are distinct actor IDs with recorded model calls, not registered-account totals, signup counts, or retention cohorts.'));
    const metrics = el('div', 'grid');
    const value = (summary, key) => !summary ? 'Unavailable' : Number(summary.request_count) === 0 ? 'No data yet' : numberText(summary[key]);
    metrics.append(
      metric('Active user IDs · 24h', '♙', value(a, 'active_user_ids'), 'Signed-in actors with recorded calls'),
      metric('Active guest IDs · 24h', '◌', value(a, 'active_guest_ids'), 'Guest actors with recorded calls'),
      metric('Active user IDs · 7d', '♙', value(b, 'active_user_ids'), 'Distinct signed-in actors'),
      metric('Active guest IDs · 7d', '◌', value(b, 'active_guest_ids'), 'Distinct guest actors')
    );
    panel.append(metrics);
    c.append(panel);
  }

  if (k === 'finance') {
    const usage = data && data.usage_24h;
    const hasCosts = Boolean(usage && Number(usage.cost_estimate_rows) > 0);
    const panel = el('section', 'panel');
    panel.classList.add('module-extra');
    panel.append(el('h3', '', 'Recorded AI cost estimates'), el('p', 'panel-copy', 'These are internal estimates recorded with model calls, not provider invoices, settled payments, revenue, refunds, or net margin.'));
    const metrics = el('div', 'grid');
    metrics.append(
      metric('Estimated AI cost · 24h', 'USD', hasCosts ? moneyText(usage.estimated_cost_usd) : 'Unavailable', hasCosts ? 'Recorded cost estimates only' : 'No recorded cost estimates'),
      metric('Requests with cost', '▤', hasCosts ? numberText(usage.cost_estimate_rows) : 'Unavailable', 'Usage events with an estimate'),
      metric('Requests · 24h', '✳', usage ? numberText(usage.request_count) : 'Unavailable', 'Recorded usage events')
    );
    panel.append(metrics, el('p', 'panel-copy', 'Billing and revenue remain unavailable until payment and refund records are reconciled against authoritative webhook state.'));
    c.append(panel);
  }

  if (k === 'security') {
    const panel = el('section', 'panel');
    panel.classList.add('module-extra');
    panel.append(el('h3', '', 'Access boundary'), el('p', 'panel-copy', 'The current page is visible only after server-side email/IP validation. The allowlist values and signing secret are never returned to the browser.'));
    const rows = el('div', 'source-list');
    const audit = data && data.audit_24h;
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
    const metrics = el('div', 'grid');
    metrics.append(metric('Owner audit events · 24h', '◇', audit ? numberText(audit.event_count) : 'Unavailable', audit && audit.last_event_at ? 'Last event ' + new Date(audit.last_event_at).toLocaleString() : 'No audit events recorded'));
    panel.append(metrics);
    c.append(panel);
  }

  if (k === 'automation') {
    const summary = data && data.automation_24h;
    const ready = Boolean(summary), noData = ready && Number(summary.run_count) === 0;
    const panel = el('section', 'panel');
    panel.classList.add('module-extra');
    panel.append(el('h3', '', 'Automation run health · 24 hours'), el('p', 'panel-copy', 'Aggregate run states only; workflow definitions, step arguments, and payloads are not returned.'));
    const metrics = el('div', 'grid');
    metrics.append(
      metric('Runs', '↗', !ready ? 'Unavailable' : noData ? 'No data yet' : numberText(summary.run_count), 'Recorded automation runs'),
      metric('Pending approval', '◷', !ready ? 'Unavailable' : numberText(summary.pending_approval_count), 'Awaiting explicit approval'),
      metric('Running', '↻', !ready ? 'Unavailable' : numberText(summary.running_count), 'Currently running'),
      metric('Failed', '!', !ready ? 'Unavailable' : numberText(summary.failed_count), 'Failed executions'),
      metric('Stale running', '⚠', !ready ? 'Unavailable' : numberText(summary.stale_running_count), 'Running for more than 30 minutes')
    );
    panel.append(metrics);
    c.append(panel);
  }

  if (k === 'reports') {
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

  if (k === 'settings') {
    const panel = el('section', 'panel');
    panel.classList.add('module-extra');
    panel.append(el('h3', '', 'Access configuration'), el('p', 'panel-copy', 'Manage OWNER_ALLOWED_EMAILS, OWNER_ALLOWED_IPS, and OWNER_SESSION_SECRET in Vercel Project → Settings → Environment Variables. Changes apply after redeploy. The console never displays the allowlist or session secret.'));
    c.append(panel);
  }
}
function show(k){active=names[k]?k:'overview';$('page-title').textContent=names[active][0];$('page-description').textContent=names[active][1];$('crumb').textContent=active==='overview'?'Overview':names[active][0];document.querySelectorAll('.nav-item').forEach(b=>{const yes=b.dataset.panel===active;b.classList.toggle('active',yes);b.setAttribute('aria-current',yes?'page':'false')});if(active==='overview')renderOverview();else renderModule(active)}
async function refresh(){ $('freshness').textContent='Checking data sources…';try{const r=await fetch('/owner/api/overview',{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});if(r.status===404){window.location.href='/';return}if(!r.ok)throw new Error('refresh');data=await r.json();$('freshness').textContent='Checked '+new Date(data.generated_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})+' · sources pending';show(active)}catch{$('freshness').textContent='Could not refresh';$('content').replaceChildren(el('div','error-state','The secure overview could not be refreshed. No data was cached. Try again, or sign out and open the console again.'))}}
document.querySelectorAll('.nav-item').forEach(b=>b.addEventListener('click',()=>show(b.dataset.panel)));
const refreshBtn=el('button','quiet-button','Refresh');refreshBtn.type='button';refreshBtn.addEventListener('click',()=>{refreshBtn.disabled=true;refresh().finally(()=>{refreshBtn.disabled=false})});$('signout').parentElement.insertBefore(refreshBtn,$('signout'));
$('signout').addEventListener('click',async()=>{ $('signout').disabled=true;try{await fetch('/owner/api/session',{method:'DELETE',credentials:'same-origin',cache:'no-store'})}catch(e){}window.location.href='/'});
show('overview');refresh();
})();,hasCosts?moneyText(u.estimated_cost_usd):'Unavailable',hasCosts?'Recorded cost estimates only':'No recorded cost estimates'),metric('Requests with cost','▤',hasCosts?numberText(u.cost_estimate_rows):'Unavailable','Usage events with an estimate'),metric('Requests · 24h','✳',u?numberText(u.request_count):'Unavailable','Recorded usage events'));p.append(g2,el('p','panel-copy','Billing and revenue remain unavailable until payment and refund records are reconciled against authoritative webhook state.'));c.append(p)}if(k==='security'){const p=el('section','panel');p.classList.add('module-extra');p.append(el('h3','','Access boundary'),el('p','panel-copy','The current page is visible only after server-side email/IP validation. The allowlist values and signing secret are never returned to the browser.'));const rows=el('div','source-list');[['Owner session','10-minute HttpOnly, SameSite=Strict cookie','Enabled'],['Email and IP validation','Rechecked on protected requests','Enabled'],['Shared IP rate limit','Uses the existing server-side limiter','Enabled'],['Durable security event history','No verified owner audit-event source yet','Unavailable']].forEach(x=>{const r=el('div','source-row'),l=el('div');l.append(el('div','source-name',x[0]),el('div','source-detail',x[1]));r.append(l,state(x[2],x[2]==='Enabled'?'available':'unavailable'));rows.append(r)});p.append(rows);c.append(p)}if(k==='users'){const a=data&&data.usage_24h,b=data&&data.usage_7d;const p=el('section','panel');p.classList.add('module-extra');p.append(el('h3','','Recorded activity signals'),el('p','panel-copy','These are distinct actor IDs with recorded model calls, not registered-account totals, signup counts, or retention cohorts.'));const g2=el('div','grid');const val=(s,key)=>!s?'Unavailable':Number(s.request_count)===0?'No data yet':numberText(s[key]);g2.append(metric('Active user IDs · 24h','♙',val(a,'active_user_ids'),'Signed-in actors with recorded calls'),metric('Active guest IDs · 24h','◌',val(a,'active_guest_ids'),'Guest actors with recorded calls'),metric('Active user IDs · 7d','♙',val(b,'active_user_ids'),'Distinct signed-in actors'),metric('Active guest IDs · 7d','◌',val(b,'active_guest_ids'),'Distinct guest actors'));p.append(g2);c.append(p)}if(k==='ai'){const u=data&&data.usage_24h,providers=data&&data.usage_7d&&Array.isArray(data.usage_7d.providers)?data.usage_7d.providers:[];const p=el('section','panel');p.classList.add('module-extra');p.append(el('h3','','Recorded AI activity'),el('p','panel-copy','Usage events contain aggregate telemetry only; cost values are internal estimates.'));const g2=el('div','grid');g2.append(metric('Requests · 24h','✳',u?numberText(u.request_count):'Unavailable','Recorded model calls'),metric('Tokens · 24h','↗',u?numberText(u.total_tokens):'Unavailable','Input plus output tokens'),metric('Success rate','✓',u&&Number(u.request_count)>0?(Number(u.success_count)/Number(u.request_count)*100).toFixed(1)+'%':'No data yet','Recorded successful outcomes'),metric('p95 latency','◷',u&&u.latency_p95_ms!==null&&u.latency_p95_ms!==undefined?numberText(Math.round(Number(u.latency_p95_ms)))+' ms':'Unavailable','Successful calls'));p.append(g2);const list=el('div','source-list');if(providers.length){providers.forEach(v=>{const row=el('div','source-row'),left=el('div');left.append(el('div','source-name',v.provider+' / '+v.model),el('div','source-detail',numberText(v.requests)+' requests · '+numberText(Number(v.input_tokens)+Number(v.output_tokens))+' tokens'));row.append(left,el('div','source-name',moneyText(v.estimated_cost_usd)));list.append(row)})}else{list.append(el('p','panel-copy','Provider breakdown unavailable until usage telemetry is connected.'))}p.append(list);c.append(p)}if(k==='automation'){const a=data&&data.automation_24h,ready=Boolean(a),none=ready&&Number(a.run_count)===0;const p=el('section','panel');p.classList.add('module-extra');p.append(el('h3','','Automation run health · 24 hours'),el('p','panel-copy','Aggregate run states only; workflow definitions, step arguments, and payloads are not returned.'));const ag=el('div','grid');ag.append(metric('Runs','↗',!ready?'Unavailable':none?'No data yet':numberText(a.run_count),'Recorded automation runs'),metric('Pending approval','◷',!ready?'Unavailable':numberText(a.pending_approval_count),'Awaiting explicit approval'),metric('Running','↻',!ready?'Unavailable':numberText(a.running_count),'Currently running'),metric('Failed','!',!ready?'Unavailable':numberText(a.failed_count),'Failed executions'),metric('Stale running','⚠',!ready?'Unavailable':numberText(a.stale_running_count),'Running for more than 30 minutes'));p.append(ag);c.append(p)}if(k==='reports'){const p=el('section','panel');p.classList.add('module-extra');p.append(el('h3','','Export verified usage summaries'),el('p','panel-copy','Exports contain aggregate counts and provider/model totals only. They never include prompts, message content, credentials, or user-level records.'));const actions=el('div','module-meta');[['24-hour CSV','/owner/api/export?window=24h'],['7-day CSV','/owner/api/export?window=7d']].forEach(item=>{const link=el('a','quiet-button',item[0]);link.href=item[1];link.setAttribute('download','');actions.append(link)});p.append(actions);c.append(p)}if(k==='settings'){const p=el('section','panel');p.style.marginTop='14px';p.append(el('h3','','Access configuration'),el('p','panel-copy','Manage OWNER_ALLOWED_EMAILS, OWNER_ALLOWED_IPS, and OWNER_SESSION_SECRET in Vercel Project → Settings → Environment Variables. Changes apply after redeploy. The console never displays the allowlist or session secret.'));c.append(p)}}
function show(k){active=names[k]?k:'overview';$('page-title').textContent=names[active][0];$('page-description').textContent=names[active][1];$('crumb').textContent=active==='overview'?'Overview':names[active][0];document.querySelectorAll('.nav-item').forEach(b=>{const yes=b.dataset.panel===active;b.classList.toggle('active',yes);b.setAttribute('aria-current',yes?'page':'false')});if(active==='overview')renderOverview();else renderModule(active)}
async function refresh(){ $('freshness').textContent='Checking data sources…';try{const r=await fetch('/owner/api/overview',{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});if(r.status===404){window.location.href='/';return}if(!r.ok)throw new Error('refresh');data=await r.json();$('freshness').textContent='Checked '+new Date(data.generated_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})+' · sources pending';show(active)}catch{$('freshness').textContent='Could not refresh';$('content').replaceChildren(el('div','error-state','The secure overview could not be refreshed. No data was cached. Try again, or sign out and open the console again.'))}}
document.querySelectorAll('.nav-item').forEach(b=>b.addEventListener('click',()=>show(b.dataset.panel)));
const refreshBtn=el('button','quiet-button','Refresh');refreshBtn.type='button';refreshBtn.addEventListener('click',()=>{refreshBtn.disabled=true;refresh().finally(()=>{refreshBtn.disabled=false})});$('signout').parentElement.insertBefore(refreshBtn,$('signout'));
$('signout').addEventListener('click',async()=>{ $('signout').disabled=true;try{await fetch('/owner/api/session',{method:'DELETE',credentials:'same-origin',cache:'no-store'})}catch(e){}window.location.href='/'});
show('overview');refresh();
})();