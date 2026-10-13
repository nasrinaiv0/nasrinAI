// NCC (Nasrin Client Connect) app, served at ncc.nasrinai.com (/ncc/).
// docs/ncc.md. Plain JS, no packages.
//
// - Signs in with the same NasrinAI accounts (email code or Google); the
//   short-lived access token stays in this closure, the refresh cookie is the
//   server's (HttpOnly, /v1/auth only).
// - Talks only to our own /v1 API. The server decides who may use NCC and
//   checks every request; nothing here is trusted for access.
// - Builds every element with createElement/textContent: no HTML from data.
// - Desktop: sidebar, tables, drag-and-drop pipeline, side panels.
//   Phones: iOS-style tab bar, large titles, bottom sheets, 16px fields.
//
// Exposes window.NCC (helpers for automations.js).
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const STAGE_NAMES = { lead: 'Lead', qualified: 'Qualified', proposal: 'Proposal', won: 'Won', lost: 'Lost' };
  const OPEN_STAGES = ['lead', 'qualified', 'proposal'];

  // ---------- small DOM helpers ----------
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = String(text);
    return e;
  }
  const ICONS = {
    home: ['M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z'],
    contacts: ['M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20', 'M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z', 'M20 20v-1.5a3.5 3.5 0 0 0-2.5-3.35', 'M15.5 4.15a3.5 3.5 0 0 1 0 6.7'],
    pipeline: ['M4 5h4v14H4z', 'M10 5h4v9h-4z', 'M16 5h4v5h-4z'],
    tasks: ['M9 11l3 3 8-8', 'M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9'],
    bolt: ['M13 2 4 14h7l-1 8 9-12h-7z'],
    gear: ['M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z'],
    plus: ['M12 5v14', 'M5 12h14'],
    close: ['M6 6l12 12', 'M18 6 6 18'],
    search: ['M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z', 'M20 20l-3.5-3.5'],
    chev: ['m9 6 6 6-6 6'],
    mail: ['M4 6h16v12H4z', 'm4 7 8 6 8-6'],
    phone: ['M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z'],
    trash: ['M4 7h16', 'M10 11v6', 'M14 11v6', 'M6 7l1 13h10l1-13', 'M9 7V4h6v3'],
    edit: ['M4 20h4L19 9l-4-4L4 16z', 'M13.5 6.5l4 4']
  };
  function icon(name) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    for (const d of ICONS[name] || []) {
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('d', d);
      svg.append(p);
    }
    return svg;
  }
  function button(text, cls, onClick, iconName) {
    const b = el('button', cls || 'btn');
    b.type = 'button';
    if (iconName) b.append(icon(iconName));
    if (text) b.append(document.createTextNode(text));
    if (onClick) b.addEventListener('click', onClick);
    return b;
  }
  function iconButton(name, label, onClick) {
    const b = button('', 'icon-btn', onClick, name);
    b.setAttribute('aria-label', label);
    b.title = label;
    return b;
  }
  let uid = 0;
  function field(label, control, hint) {
    const f = el('div', 'field');
    const l = el('label', '', label);
    control.id = control.id || 'f' + (++uid);
    l.htmlFor = control.id;
    f.append(l, control);
    if (hint) f.append(el('p', 'hint', hint));
    return f;
  }
  function input(value, { type = 'text', max = 120, placeholder = '', required = false } = {}) {
    const i = el('input', 'input');
    i.type = type;
    if (max) i.maxLength = max;
    i.value = value ?? '';
    if (placeholder) i.placeholder = placeholder;
    if (required) i.required = true;
    return i;
  }
  function select(options, value) {
    const s = el('select', 'select');
    for (const [v, label, disabled] of options) {
      const o = el('option', '', label);
      o.value = v;
      if (disabled) o.disabled = true;
      if (v === value) o.selected = true;
      s.append(o);
    }
    return s;
  }
  function textarea(value, max = 4000, rows = 4) {
    const t = el('textarea', 'textarea');
    t.maxLength = max;
    t.rows = rows;
    t.value = value || '';
    return t;
  }
  const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('').toUpperCase() || '?';
  function avatar(name, big) { return el('span', 'avatar' + (big ? ' big' : ''), initials(name)); }
  function money(n, cur) {
    try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur || 'PHP', maximumFractionDigits: n % 1 ? 2 : 0 }).format(n); } catch { return (cur || '') + ' ' + n; }
  }
  function sums(deals) {
    const by = {};
    for (const d of deals) by[d.currency] = (by[d.currency] || 0) + Number(d.value || 0);
    const parts = Object.entries(by).map(([c, n]) => money(n, c));
    return parts.length ? parts.join(' + ') : money(0, 'PHP');
  }
  const dayStart = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); };
  function dueLabel(iso) {
    if (!iso) return 'No date';
    const t = dayStart(iso);
    const today = dayStart(Date.now());
    const diff = Math.round((t - today) / 86_400_000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    if (diff === -1) return 'Yesterday';
    return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  }
  const overdue = (t) => !t.done && t.due_at && dayStart(t.due_at) < dayStart(Date.now());
  function when(iso) {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  }
  // A date field's value (YYYY-MM-DD) as midday in this time zone, so the day never shifts.
  function dateToIso(v) {
    if (!v) return '';
    const off = -new Date(v + 'T12:00:00').getTimezoneOffset();
    const sign = off >= 0 ? '+' : '-';
    const pad = (n) => String(Math.floor(Math.abs(n))).padStart(2, '0');
    return `${v}T12:00:00${sign}${pad(off / 60)}:${pad(off % 60)}`;
  }
  function isoToDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  // ---------- toast ----------
  let toastTimer;
  function toast(text) {
    const t = $('toast');
    t.textContent = text;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 3200);
  }
  const fail = (err) => toast(err && err.message ? err.message : 'Something went wrong. Please try again.');

  // ---------- sign-in and the API ----------
  let token = '';
  let until = 0;
  let refreshing = null;
  const net = (path, opts = {}) => fetch(path, { credentials: 'same-origin', ...opts });
  async function errorFrom(resp) {
    let message = 'Something went wrong. Please try again.';
    let code;
    try {
      const body = await resp.json();
      if (body && body.error && typeof body.error.message === 'string') message = body.error.message;
      code = body && body.error && body.error.code;
    } catch { /* not JSON */ }
    return Object.assign(new Error(message), { status: resp.status, code });
  }
  function signedIn(body) {
    token = String(body.access_token || '');
    until = Date.now() + Math.max(60, Number(body.expires_in) || 3600) * 1000;
  }
  // One refresh at a time across tabs (the refresh token is single-use).
  function refresh() {
    if (!refreshing) {
      refreshing = (async () => {
        const once = (fn) => (navigator.locks && navigator.locks.request ? navigator.locks.request('nasrin-auth-refresh', fn) : fn());
        const resp = await once(async () => {
          let r;
          for (let i = 0; i < 2; i++) {
            r = await net('/v1/auth/refresh', { method: 'POST' });
            if (r.status !== 401 || i === 1) break;
            await new Promise((ok) => setTimeout(ok, 250));
          }
          return r;
        });
        if (!resp.ok) { token = ''; return false; }
        signedIn(await resp.json());
        return true;
      })().finally(() => { refreshing = null; });
    }
    return refreshing;
  }
  async function api(path, opts = {}, retried = false) {
    if (!token || until - Date.now() < 60_000 || retried) {
      if (!(await refresh())) { showAuth(); throw Object.assign(new Error('Please sign in again.'), { status: 401 }); }
    }
    const headers = { ...(opts.headers || {}), Authorization: 'Bearer ' + token };
    let body = opts.body;
    if (body !== undefined && typeof body !== 'string') { body = JSON.stringify(body); headers['Content-Type'] = 'application/json'; }
    const resp = await net(path, { ...opts, headers, body });
    if (resp.status === 401 && !retried) return api(path, opts, true);
    if (!resp.ok) throw await errorFrom(resp);
    return resp.status === 204 ? null : resp.json();
  }

  // Sign-in methods and the invisible security check (Cloudflare Turnstile).
  let methods = { email: false, google: false };
  let siteKey = '';
  let widget = null;
  let captcha = '';
  let captchaWait = [];
  async function loadMethods() {
    try {
      const s = await (await net('/v1/status')).json();
      methods = { email: s.sign_in?.email === true, google: s.sign_in?.google === true };
      siteKey = typeof s.turnstile?.site_key === 'string' ? s.turnstile.site_key : '';
    } catch { /* keep defaults */ }
    $('emailForm').hidden = !methods.email;
    $('googleBtn').hidden = !methods.google;
    $('authOr').hidden = !(methods.email && methods.google);
    if (!methods.email && !methods.google) $('authStatus').textContent = 'Sign-in is not available right now.';
    if (siteKey) setupCaptcha().catch(() => {});
  }
  function setupCaptcha() {
    return new Promise((resolve, reject) => {
      const render = () => {
        $('turnstileWidget').hidden = false;
        if (widget === null) {
          widget = window.turnstile.render('#turnstileWidget', {
            sitekey: siteKey,
            appearance: 'interaction-only',
            callback: (t) => { captcha = t; const w = captchaWait; captchaWait = []; w.forEach((f) => f()); },
            'expired-callback': () => { captcha = ''; },
            'error-callback': () => { captcha = ''; }
          });
        }
        resolve();
      };
      if (window.turnstile) return render();
      const sc = document.createElement('script');
      sc.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      sc.async = true;
      sc.onload = render;
      sc.onerror = () => reject(new Error('The security check could not load.'));
      document.head.append(sc);
    });
  }
  async function captchaToken() {
    if (!siteKey) return undefined;
    if (!captcha) {
      $('authStatus').textContent = 'Checking your connection is secure…';
      await new Promise((ok, no) => {
        const timer = setTimeout(() => no(new Error('The security check is taking too long. Try again.')), 20000);
        captchaWait.push(() => { clearTimeout(timer); ok(); });
      });
    }
    const t = captcha;
    captcha = '';
    return t;
  }
  const resetCaptcha = () => { if (window.turnstile && widget !== null) window.turnstile.reset(widget); };

  let pendingEmail = '';
  $('emailForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('emailBtn');
    btn.disabled = true;
    try {
      pendingEmail = $('authEmail').value.trim().toLowerCase();
      const r = await net('/v1/auth/email/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: pendingEmail, captcha_token: await captchaToken() }) });
      if (!r.ok) throw await errorFrom(r);
      $('emailForm').hidden = true;
      $('codeForm').hidden = false;
      $('googleBtn').hidden = true;
      $('authOr').hidden = true;
      $('authStatus').textContent = 'We sent a code to ' + pendingEmail + '.';
      $('authCode').focus();
    } catch (err) { $('authStatus').textContent = err.message; } finally { btn.disabled = false; resetCaptcha(); }
  });
  $('codeForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('codeBtn');
    btn.disabled = true;
    try {
      const r = await net('/v1/auth/email/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: pendingEmail, code: $('authCode').value }) });
      if (!r.ok) throw await errorFrom(r);
      signedIn(await r.json());
      $('authStatus').textContent = '';
      await start();
    } catch (err) { $('authStatus').textContent = err.message; } finally { btn.disabled = false; }
  });
  $('codeBack').addEventListener('click', () => {
    $('codeForm').hidden = true;
    $('emailForm').hidden = !methods.email;
    $('googleBtn').hidden = !methods.google;
    $('authOr').hidden = !(methods.email && methods.google);
    $('authStatus').textContent = '';
  });
  $('googleBtn').addEventListener('click', async () => {
    const btn = $('googleBtn');
    btn.disabled = true;
    try {
      const r = await net('/v1/auth/google/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ captcha_token: await captchaToken() }) });
      if (!r.ok) throw await errorFrom(r);
      const { url } = await r.json();
      if (typeof url === 'string' && /^https:\/\//.test(url)) location.assign(url);
    } catch (err) { $('authStatus').textContent = err.message; btn.disabled = false; resetCaptcha(); }
  });
  async function signOut() {
    try { await net('/v1/auth/sign-out', { method: 'POST', headers: token ? { Authorization: 'Bearer ' + token } : {} }); } catch { /* signed out here anyway */ }
    token = '';
    data = null;
    closeSheet();
    showAuth();
  }
  $('sideSignOut').addEventListener('click', signOut);
  $('lockedSignOut').addEventListener('click', signOut);

  function showOnly(id) {
    for (const x of ['boot', 'auth', 'locked', 'app']) $(x).hidden = x !== id;
  }
  function showAuth() {
    showOnly('auth');
    if (!methods.email && !methods.google) loadMethods();
  }

  // ---------- data ----------
  let data = null;
  async function reload() {
    data = await api('/v1/ncc');
    renderNav();
    render();
  }
  const contactById = (id) => (data.contacts.find((c) => c.id === id) || null);
  const contactName = (id) => (contactById(id) || {}).name || 'No contact';

  // ---------- navigation ----------
  const VIEWS = [
    ['home', 'Home', 'home'], ['contacts', 'Contacts', 'contacts'], ['pipeline', 'Pipeline', 'pipeline'],
    ['tasks', 'Tasks', 'tasks'], ['automations', 'Automations', 'bolt'], ['settings', 'Settings', 'gear']
  ];
  let view = 'home';
  function counts() {
    return {
      contacts: data.contacts.length,
      pipeline: data.deals.filter((d) => OPEN_STAGES.includes(d.stage)).length,
      tasks: data.tasks.filter((t) => !t.done).length,
      automations: data.automations.filter((a) => a.enabled).length
    };
  }
  function renderNav() {
    const n = counts();
    const side = $('sideNav');
    const tabs = $('tabbar');
    side.replaceChildren();
    tabs.replaceChildren();
    for (const [key, label, ic] of VIEWS) {
      const b = button('', 'nav-item', () => go(key), ic);
      b.append(el('span', '', label));
      if (n[key]) b.append(el('span', 'count', n[key]));
      if (key === view) b.setAttribute('aria-current', 'page');
      side.append(b);
      if (key === 'settings') continue;
      const t = button('', 'tab', () => go(key), ic);
      t.append(el('span', '', label));
      if (key === view) t.setAttribute('aria-current', 'page');
      tabs.append(t);
    }
    $('sideEmail').textContent = data.account?.email || '';
  }
  function go(key) {
    if (!VIEWS.some(([k]) => k === key)) key = 'home';
    view = key;
    if (location.hash.slice(1) !== key) history.replaceState(null, '', '#' + key);
    closeSheet();
    renderNav();
    render();
    $('view').scrollTop = 0;
    document.querySelector('.main').scrollTop = 0;
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', () => { if (data) go(location.hash.slice(1)); });

  function setTop(title, actions = []) {
    $('viewTitle').textContent = title;
    const box = $('topActions');
    box.replaceChildren(...actions);
    // On phones Settings sits in the header (the tab bar has five places).
    if (view !== 'settings') {
      const g = iconButton('gear', 'Settings', () => go('settings'));
      g.classList.add('only-phone');
      box.append(g);
    }
  }
  function render() {
    if (!data) return;
    const v = $('view');
    v.className = 'view view-' + view;
    v.replaceChildren();
    ({ home: viewHome, contacts: viewContacts, pipeline: viewPipeline, tasks: viewTasks, automations: viewAutomations, settings: viewSettings }[view] || viewHome)(v);
  }

  // ---------- sheet (side panel / bottom sheet) ----------
  let sheetBack = null;
  function openSheet(title, body, { actions = [], wide = false, back = null } = {}) {
    sheetBack = back;
    $('sheetTitle').textContent = title;
    $('sheetBody').replaceChildren(body);
    $('sheetActions').replaceChildren(...actions);
    const close = $('sheetClose');
    close.replaceChildren(icon(back ? 'chev' : 'close'));
    close.classList.toggle('back', Boolean(back));
    close.setAttribute('aria-label', back ? 'Back' : 'Close');
    $('sheet').classList.toggle('wide', wide);
    $('sheet').hidden = false;
    $('scrim').hidden = false;
    $('sheetBody').scrollTop = 0;
    const first = body.querySelector('input:not([type=checkbox]), select, textarea');
    if (first && window.matchMedia('(min-width: 900px)').matches) setTimeout(() => first.focus(), 60);
    else close.focus();
  }
  function closeSheet() {
    $('sheet').hidden = true;
    $('scrim').hidden = true;
    sheetBack = null;
  }
  $('sheetClose').addEventListener('click', () => { if (sheetBack) { const b = sheetBack; sheetBack = null; b(); } else closeSheet(); });
  $('scrim').addEventListener('click', closeSheet);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('sheet').hidden) closeSheet(); });

  // A form in the sheet: fields, then Save (and Delete when editing).
  function formSheet(title, fields, { save, remove, saveText = 'Save', back = null, wide = false }) {
    const form = el('form', 'form');
    form.append(...fields);
    const row = el('div', 'row');
    const ok = el('button', 'btn primary', saveText);
    ok.type = 'submit';
    row.append(ok);
    if (remove) row.append(button('Delete', 'btn plain danger', async () => {
      try { await remove(); } catch (err) { fail(err); }
    }));
    form.append(row);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      ok.disabled = true;
      try { await save(); } catch (err) { fail(err); ok.disabled = false; }
    });
    openSheet(title, form, { back, wide });
  }

  // ---------- Home ----------
  function viewHome(v) {
    setTop('Home', [button('New contact', 'btn small primary', () => contactForm(null), 'plus')]);
    const openDeals = data.deals.filter((d) => OPEN_STAGES.includes(d.stage));
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const wonMonth = data.deals.filter((d) => d.stage === 'won' && new Date(d.updated_at) >= monthStart);
    const open = data.tasks.filter((t) => !t.done);
    const late = open.filter(overdue);
    const today = open.filter((t) => t.due_at && dayStart(t.due_at) === dayStart(Date.now()));
    const kpis = el('div', 'kpis');
    const kpi = (label, value, sub, to) => {
      const k = button('', 'kpi card', () => go(to));
      k.append(el('span', '', label), el('strong', '', value), el('em', '', sub));
      return k;
    };
    kpis.append(
      kpi('Contacts', data.contacts.length, `${data.contacts.filter((c) => Date.now() - new Date(c.created_at) < 7 * 86_400_000).length} new this week`, 'contacts'),
      kpi('Open deals', openDeals.length, sums(openDeals), 'pipeline'),
      kpi('Won this month', wonMonth.length, sums(wonMonth), 'pipeline'),
      kpi('Tasks', open.length, late.length ? `${late.length} overdue · ${today.length} today` : `${today.length} due today`, 'tasks')
    );
    v.append(kpis);
    if (!data.contacts.length) {
      const e = el('div', 'card empty');
      e.append(el('strong', '', 'Welcome to NCC'), el('p', 'hint', 'Add your first contact, or import a CSV or Excel file in Settings.'));
      const r = el('div', 'row');
      r.style.justifyContent = 'center';
      r.append(button('Add a contact', 'btn primary small', () => contactForm(null)), button('Import a file', 'btn small', () => go('settings')));
      e.append(r);
      v.append(e);
      return;
    }
    const panels = el('div', 'panels');
    // Pipeline at a glance
    const p1 = el('section', 'panel card');
    const h1 = el('h2', '', 'Pipeline');
    h1.append(button('Open', 'link-btn', () => go('pipeline')));
    const funnel = el('div', 'funnel');
    const max = Math.max(1, ...data.stages.map((s) => data.deals.filter((d) => d.stage === s).length));
    for (const s of data.stages) {
      const ds = data.deals.filter((d) => d.stage === s);
      const row = el('div', 'funnel-row');
      const bar = el('div', 'funnel-bar');
      const fill = el('i');
      fill.style.width = (ds.length / max * 100) + '%';
      bar.append(fill);
      row.append(el('span', '', `${STAGE_NAMES[s]} · ${ds.length}`), bar, el('span', 'hint', ds.length ? sums(ds) : ''));
      funnel.append(row);
    }
    p1.append(h1, funnel);
    // Up next
    const p2 = el('section', 'panel card');
    const h2 = el('h2', '', 'Up next');
    h2.append(button('All tasks', 'link-btn', () => go('tasks')));
    p2.append(h2);
    const next = open.slice().sort((a, b) => (a.due_at || '9').localeCompare(b.due_at || '9')).slice(0, 6);
    if (next.length) {
      const ul = el('ul', 'list');
      for (const t of next) ul.append(taskRow(t));
      p2.append(ul);
    } else p2.append(el('p', 'hint', 'Nothing to do. Nice.'));
    // Recent contacts
    const p3 = el('section', 'panel card');
    const h3 = el('h2', '', 'Recent contacts');
    h3.append(button('All', 'link-btn', () => go('contacts')));
    const ul3 = el('ul', 'list');
    for (const c of data.contacts.slice(0, 5)) ul3.append(contactRow(c));
    p3.append(h3, ul3);
    // Automations
    const p4 = el('section', 'panel card');
    const h4 = el('h2', '', 'Automations');
    h4.append(button('Manage', 'link-btn', () => go('automations')));
    const on = data.automations.filter((a) => a.enabled);
    p4.append(h4, el('p', 'hint', on.length ? `${on.length} on, ${data.automations.reduce((n, a) => n + (a.runs || 0), 0)} runs so far.` : 'No automations on yet. Start from a ready-made one.'));
    panels.append(p1, p2, p3, p4);
    v.append(panels);
  }

  // ---------- Contacts ----------
  let query = '';
  let tagFilter = '';
  function contactRow(c) {
    const li = el('li');
    const b = button('', 'item', () => contactSheet(c.id));
    const main = el('span', 'item-main');
    main.append(el('strong', '', c.name), el('span', '', [c.company, c.email || c.phone].filter(Boolean).join(' · ') || 'No details yet'));
    b.append(avatar(c.name), main, icon('chev'));
    b.lastChild.setAttribute('class', 'chev');
    li.append(b);
    return li;
  }
  function viewContacts(v) {
    setTop('Contacts', [button('New', 'btn small primary', () => contactForm(null), 'plus')]);
    const bar = el('div', 'toolbar');
    const s = el('label', 'search');
    const q = input(query, { type: 'search', placeholder: 'Search name, company, email, phone' });
    q.setAttribute('aria-label', 'Search contacts');
    s.append(icon('search'), q);
    bar.append(s);
    const tags = {};
    for (const c of data.contacts) for (const t of c.tags) tags[t] = (tags[t] || 0) + 1;
    const chipBox = el('div', 'chips');
    for (const t of Object.keys(tags).sort((a, b) => tags[b] - tags[a]).slice(0, 10)) {
      const ch = button(t, 'chip' + (tagFilter === t ? ' on' : ''), () => { tagFilter = tagFilter === t ? '' : t; render(); });
      ch.setAttribute('aria-pressed', String(tagFilter === t));
      chipBox.append(ch);
    }
    const list = el('ul', 'list');
    const tableWrap = el('div', 'table-wrap');
    const table = el('table', 'grid');
    const head = el('tr');
    for (const h of ['Name', 'Company', 'Email', 'Phone', 'Tags', 'Deals']) head.append(el('th', '', h));
    const thead = el('thead');
    thead.append(head);
    const tbody = el('tbody');
    table.append(thead, tbody);
    tableWrap.append(table);
    const countLine = el('p', 'hint');
    const fill = () => {
      const needle = query.trim().toLowerCase();
      const shown = data.contacts.filter((c) => (!tagFilter || c.tags.includes(tagFilter))
        && (!needle || [c.name, c.company, c.email, c.phone, c.tags.join(' ')].some((x) => String(x).toLowerCase().includes(needle))));
      list.replaceChildren(...shown.map(contactRow));
      tbody.replaceChildren(...shown.map((c) => {
        const tr = el('tr');
        tr.tabIndex = 0;
        tr.addEventListener('click', () => contactSheet(c.id));
        tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') contactSheet(c.id); });
        const name = el('td');
        const wrap = el('span', 'cell-name');
        wrap.append(avatar(c.name), el('span', '', c.name));
        name.append(wrap);
        const tagsTd = el('td');
        const tc = el('span', 'chips');
        for (const t of c.tags.slice(0, 3)) tc.append(el('span', 'chip', t));
        tagsTd.append(tc);
        tr.append(name, el('td', '', c.company), el('td', '', c.email), el('td', '', c.phone), tagsTd, el('td', '', data.deals.filter((d) => d.contact_id === c.id).length || ''));
        return tr;
      }));
      countLine.textContent = `${shown.length} of ${data.contacts.length} contacts`;
      if (!shown.length) {
        const e = el('li', 'empty');
        e.append(el('strong', '', data.contacts.length ? 'No matches' : 'No contacts yet'), el('span', '', data.contacts.length ? 'Try another search.' : 'Add one, or import a file in Settings.'));
        list.append(e);
        const tr = el('tr');
        const td = el('td', 'empty', data.contacts.length ? 'No matches.' : 'No contacts yet.');
        td.colSpan = 6;
        tr.append(td);
        tbody.append(tr);
      }
    };
    q.addEventListener('input', () => { query = q.value; fill(); });
    v.append(bar);
    if (chipBox.childNodes.length) v.append(chipBox, el('div', 'spacer'));
    v.append(countLine, list, tableWrap);
    fill();
  }

  function contactForm(c, back) {
    const name = input(c?.name, { max: 120, required: true });
    name.autocomplete = 'name';
    const email = input(c?.email, { type: 'email', max: 254 });
    email.autocomplete = 'email';
    const phone = input(c?.phone, { type: 'tel', max: 40 });
    phone.autocomplete = 'tel';
    const company = input(c?.company, { max: 120 });
    company.autocomplete = 'organization';
    const tags = input(c ? c.tags.join(', ') : '', { max: 340, placeholder: 'vip, catering' });
    const notes = textarea(c?.notes, 4000, 3);
    const row1 = el('div', 'row');
    row1.append(field('Email', email), field('Phone', phone));
    formSheet(c ? 'Edit contact' : 'New contact', [field('Name', name), row1, field('Company', company), field('Tags', tags, 'Separate tags with commas. Tags can start automations.'), field('About', notes)], {
      saveText: c ? 'Save' : 'Add contact',
      back,
      save: async () => {
        const body = { name: name.value, email: email.value, phone: phone.value, company: company.value, tags: tags.value, notes: notes.value };
        const saved = c ? await api('/v1/ncc/contacts/' + encodeURIComponent(c.id), { method: 'PUT', body }) : await api('/v1/ncc/contacts', { method: 'POST', body });
        await reload();
        toast(c ? 'Saved.' : 'Contact added.');
        contactSheet(saved.id);
      }
    });
  }

  async function contactSheet(id) {
    const c = contactById(id);
    if (!c) { closeSheet(); return; }
    const body = el('div');
    const prof = el('div', 'profile');
    const who = el('div');
    who.append(el('h3', '', c.name), el('p', '', [c.company, c.source === 'import' ? 'Imported' : ''].filter(Boolean).join(' · ')));
    prof.append(avatar(c.name, true), who);
    body.append(prof);
    const quick = el('div', 'quick');
    if (c.email) { const a = el('a', 'btn small'); a.href = 'mailto:' + c.email; a.append(icon('mail'), document.createTextNode('Email')); quick.append(a); }
    if (c.phone) { const a = el('a', 'btn small'); a.href = 'tel:' + c.phone.replace(/[^0-9+]/g, ''); a.append(icon('phone'), document.createTextNode('Call')); quick.append(a); }
    quick.append(button('Edit', 'btn small', () => contactForm(c, () => contactSheet(id)), 'edit'));
    body.append(quick);
    if (c.tags.length) { const ch = el('div', 'chips'); for (const t of c.tags) ch.append(el('span', 'chip', t)); body.append(ch); }
    const details = el('div', 'section');
    for (const [label, value] of [['Email', c.email], ['Phone', c.phone], ['About', c.notes]]) if (value) { details.append(el('p', 'label', label), el('p', 'detail', value)); }
    body.append(details);

    // Deals
    const deals = data.deals.filter((d) => d.contact_id === id);
    const ds = el('div', 'section');
    const dh = el('div', 'section-head');
    dh.append(el('h3', '', 'Deals'), button('Add', 'btn small', () => dealForm(null, id, () => contactSheet(id)), 'plus'));
    ds.append(dh);
    if (deals.length) {
      const ul = el('ul', 'list');
      for (const d of deals) {
        const li = el('li');
        const b = button('', 'item', () => dealForm(d, id, () => contactSheet(id)));
        const m = el('span', 'item-main');
        m.append(el('strong', '', d.title), el('span', '', STAGE_NAMES[d.stage]));
        b.append(m, el('span', 'item-end', money(d.value, d.currency)));
        li.append(b);
        ul.append(li);
      }
      ds.append(ul);
    } else ds.append(el('p', 'hint', 'No deals yet.'));
    body.append(ds);

    // Tasks
    const tasks = data.tasks.filter((t) => t.contact_id === id);
    const ts = el('div', 'section');
    const th = el('div', 'section-head');
    th.append(el('h3', '', 'Tasks'), button('Add', 'btn small', () => taskForm(null, { contactId: id, back: () => contactSheet(id) }), 'plus'));
    ts.append(th);
    if (tasks.length) { const ul = el('ul', 'list'); for (const t of tasks) ul.append(taskRow(t, () => contactSheet(id))); ts.append(ul); } else ts.append(el('p', 'hint', 'No tasks yet.'));
    body.append(ts);

    // Timeline
    const tl = el('div', 'section');
    tl.append(el('div', 'section-head'));
    tl.firstChild.append(el('h3', '', 'Timeline'));
    const comp = el('form', 'composer');
    const note = textarea('', 2000, 1);
    note.placeholder = 'Add a note…';
    note.setAttribute('aria-label', 'Add a note');
    const add = el('button', 'btn small primary', 'Add');
    add.type = 'submit';
    comp.append(note, add);
    const list = el('ul', 'timeline');
    list.append(el('li', 'hint', 'Loading…'));
    comp.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!note.value.trim()) return;
      add.disabled = true;
      try { await api('/v1/ncc/contacts/' + encodeURIComponent(id) + '/notes', { method: 'POST', body: { text: note.value } }); note.value = ''; await fillTimeline(); } catch (err) { fail(err); }
      add.disabled = false;
    });
    tl.append(comp, list);
    body.append(tl);
    async function fillTimeline() {
      try {
        const r = await api('/v1/ncc/contacts/' + encodeURIComponent(id) + '/timeline');
        list.replaceChildren(...r.activities.map((a) => { const li = el('li', 'tl-' + a.kind); li.append(el('p', '', a.text), el('time', '', when(a.created_at))); return li; }));
        if (!r.activities.length) list.append(el('li', 'hint', 'Nothing yet.'));
      } catch (err) { list.replaceChildren(el('li', 'hint', err.message)); }
    }
    const del = iconButton('trash', 'Delete contact', async () => {
      if (!window.confirm(`Delete ${c.name}, their deals, tasks and timeline?`)) return;
      try { await api('/v1/ncc/contacts/' + encodeURIComponent(id), { method: 'DELETE' }); closeSheet(); await reload(); toast('Contact deleted.'); } catch (err) { fail(err); }
    });
    openSheet(c.name, body, { actions: [del] });
    fillTimeline();
  }

  // ---------- Deals and the pipeline ----------
  function dealForm(d, contactId, back) {
    if (!data.contacts.length) { toast('Add a contact first: every deal belongs to a contact.'); return; }
    const title = input(d?.title, { max: 120, required: true, placeholder: 'Catering for 50' });
    const who = select([...data.contacts].sort((a, b) => a.name.localeCompare(b.name)).map((c) => [c.id, c.name + (c.company ? ' · ' + c.company : '')]), d ? d.contact_id : contactId);
    if (d) who.disabled = true;
    const stage = select(data.stages.map((s) => [s, STAGE_NAMES[s]]), d ? d.stage : 'lead');
    const value = input(d ? String(d.value) : '', { max: 16, placeholder: '0' });
    value.inputMode = 'decimal';
    const currency = input(d ? d.currency : 'PHP', { max: 3 });
    currency.autocapitalize = 'characters';
    const row = el('div', 'row');
    row.append(field('Value', value), field('Currency', currency));
    formSheet(d ? 'Edit deal' : 'New deal', [field('Deal', title), field('Contact', who), field('Stage', stage), row], {
      saveText: d ? 'Save' : 'Add deal',
      back,
      save: async () => {
        const body = { title: title.value, stage: stage.value, value: value.value.replace(/,/g, '').trim(), currency: currency.value };
        if (d) await api('/v1/ncc/deals/' + encodeURIComponent(d.id), { method: 'PUT', body });
        else await api('/v1/ncc/deals', { method: 'POST', body: { ...body, contact_id: who.value } });
        await reload();
        toast(d ? 'Saved.' : 'Deal added.');
        if (back) back(); else closeSheet();
      },
      remove: d ? async () => {
        if (!window.confirm(`Delete the deal "${d.title}"?`)) return;
        await api('/v1/ncc/deals/' + encodeURIComponent(d.id), { method: 'DELETE' });
        await reload();
        toast('Deal deleted.');
        if (back) back(); else closeSheet();
      } : null
    });
  }
  async function moveDeal(id, stage) {
    const d = data.deals.find((x) => x.id === id);
    if (!d || d.stage === stage) return;
    try {
      await api('/v1/ncc/deals/' + encodeURIComponent(id), { method: 'PUT', body: { stage } });
      await reload();
      toast(`Moved to ${STAGE_NAMES[stage]}.`);
    } catch (err) { fail(err); }
  }
  function viewPipeline(v) {
    setTop('Pipeline', [button('New deal', 'btn small primary', () => dealForm(null, data.contacts[0]?.id), 'plus')]);
    if (!data.contacts.length) v.append(el('p', 'hint', 'Add a contact first: every deal belongs to a contact.'));
    const board = el('div', 'board');
    const canDrag = window.matchMedia('(pointer: fine)').matches;
    for (const s of data.stages) {
      const ds = data.deals.filter((d) => d.stage === s);
      const col = el('section', 'col');
      col.setAttribute('aria-label', STAGE_NAMES[s]);
      const head = el('div', 'col-head');
      head.append(el('strong', '', `${STAGE_NAMES[s]} · ${ds.length}`), el('span', '', ds.length ? sums(ds) : ''));
      col.append(head);
      for (const d of ds) {
        const card = el('div', 'deal');
        card.tabIndex = 0;
        card.setAttribute('role', 'button');
        card.append(el('strong', '', d.title), el('span', '', contactName(d.contact_id)));
        const foot = el('div', 'deal-foot');
        foot.append(el('span', 'money', money(d.value, d.currency)));
        const mv = select(data.stages.map((x) => [x, STAGE_NAMES[x]]), d.stage);
        mv.setAttribute('aria-label', 'Move ' + d.title);
        mv.addEventListener('click', (e) => e.stopPropagation());
        mv.addEventListener('change', () => moveDeal(d.id, mv.value));
        foot.append(mv);
        card.append(foot);
        card.addEventListener('click', () => dealForm(d));
        card.addEventListener('keydown', (e) => { if (e.key === 'Enter') dealForm(d); });
        if (canDrag) {
          card.draggable = true;
          card.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', d.id); e.dataTransfer.effectAllowed = 'move'; card.classList.add('dragging'); });
          card.addEventListener('dragend', () => card.classList.remove('dragging'));
        }
        col.append(card);
      }
      if (!ds.length) col.append(el('p', 'hint', canDrag ? 'Drag deals here.' : 'No deals.'));
      col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('drop'); });
      col.addEventListener('dragleave', () => col.classList.remove('drop'));
      col.addEventListener('drop', (e) => { e.preventDefault(); col.classList.remove('drop'); moveDeal(e.dataTransfer.getData('text/plain'), s); });
      board.append(col);
    }
    v.append(board);
  }

  // ---------- Tasks ----------
  let taskFilter = 'open';
  function taskRow(t, back) {
    const li = el('li', 'task' + (t.done ? ' done' : ''));
    const check = el('input', 'check');
    check.type = 'checkbox';
    check.checked = t.done;
    check.setAttribute('aria-label', (t.done ? 'Mark not done: ' : 'Mark done: ') + t.title);
    check.addEventListener('change', async () => {
      check.disabled = true;
      try {
        await api('/v1/ncc/tasks/' + encodeURIComponent(t.id), { method: 'PUT', body: { done: check.checked } });
        await reload();
        toast(check.checked ? 'Done.' : 'Opened again.');
        if (back) back();
      } catch (err) { fail(err); check.checked = !check.checked; check.disabled = false; }
    });
    const main = button('', 'item-main', () => taskForm(t, { back }));
    main.classList.add('plain-btn');
    const meta = el('span', overdue(t) ? 'due-over' : '', [dueLabel(t.due_at), t.contact_id ? contactName(t.contact_id) : ''].filter(Boolean).join(' · '));
    const title = el('strong', '', t.title);
    if (t.origin === 'automation') title.append(el('span', 'chip tag-auto', 'Auto'));
    main.append(title, meta);
    li.append(check, main);
    return li;
  }
  function taskForm(t, { contactId = null, back = null } = {}) {
    const title = input(t?.title, { max: 200, required: true, placeholder: 'Call back about the quote' });
    const due = input(isoToDate(t?.due_at), { type: 'date', max: 0 });
    const who = select([['', 'No contact'], ...[...data.contacts].sort((a, b) => a.name.localeCompare(b.name)).map((c) => [c.id, c.name])], t ? (t.contact_id || '') : (contactId || ''));
    if (t) who.disabled = true;
    formSheet(t ? 'Edit task' : 'New task', [field('Task', title), field('Due', due), field('Contact', who)], {
      saveText: t ? 'Save' : 'Add task',
      back,
      save: async () => {
        const body = { title: title.value, due_at: dateToIso(due.value) };
        if (t) await api('/v1/ncc/tasks/' + encodeURIComponent(t.id), { method: 'PUT', body });
        else await api('/v1/ncc/tasks', { method: 'POST', body: { ...body, contact_id: who.value || null } });
        await reload();
        toast(t ? 'Saved.' : 'Task added.');
        if (back) back(); else closeSheet();
      },
      remove: t ? async () => {
        await api('/v1/ncc/tasks/' + encodeURIComponent(t.id), { method: 'DELETE' });
        await reload();
        toast('Task deleted.');
        if (back) back(); else closeSheet();
      } : null
    });
  }
  function viewTasks(v) {
    setTop('Tasks', [button('New', 'btn small primary', () => taskForm(null), 'plus')]);
    const chips = el('div', 'chips toolbar');
    for (const [k, label] of [['open', 'To do'], ['done', 'Done'], ['all', 'All']]) {
      const c = button(label, 'chip' + (taskFilter === k ? ' on' : ''), () => { taskFilter = k; render(); });
      c.setAttribute('aria-pressed', String(taskFilter === k));
      chips.append(c);
    }
    v.append(chips);
    const shown = data.tasks.filter((t) => taskFilter === 'all' || (taskFilter === 'done' ? t.done : !t.done));
    if (!shown.length) {
      const e = el('div', 'card empty');
      e.append(el('strong', '', taskFilter === 'done' ? 'Nothing done yet' : 'All clear'), el('span', '', 'Tasks you or your automations add show up here.'));
      v.append(e);
      return;
    }
    const today = dayStart(Date.now());
    const groups = [
      ['Overdue', (t) => overdue(t)],
      ['Today', (t) => !t.done && t.due_at && dayStart(t.due_at) === today],
      ['Upcoming', (t) => !t.done && t.due_at && dayStart(t.due_at) > today],
      ['No date', (t) => !t.done && !t.due_at],
      ['Done', (t) => t.done]
    ];
    for (const [label, test] of groups) {
      const ts = shown.filter(test);
      if (!ts.length) continue;
      v.append(el('p', 'group-label', `${label} · ${ts.length}`));
      const ul = el('ul', 'list');
      for (const t of ts) ul.append(taskRow(t));
      v.append(ul);
    }
  }

  // ---------- Automations (the editor is in automations.js) ----------
  function viewAutomations(v) {
    const auto = window.NCCAutomations;
    setTop('Automations', [button('New', 'btn small primary', () => auto && auto.edit(null), 'plus')]);
    if (!auto) { v.append(el('p', 'hint', 'Automations could not load. Refresh the page.')); return; }
    auto.renderList(v);
  }

  // ---------- Settings: import, export, delete, account ----------
  const HEADERS = {
    name: ['name', 'fullname', 'contact', 'contactname', 'customer', 'customername', 'client'],
    first: ['firstname', 'givenname', 'first'],
    last: ['lastname', 'surname', 'familyname', 'last'],
    email: ['email', 'e-mail', 'emailaddress', 'mail'],
    phone: ['phone', 'phonenumber', 'mobile', 'mobilenumber', 'cell', 'contactnumber', 'tel', 'telephone'],
    company: ['company', 'business', 'organization', 'organisation', 'companyname', 'businessname'],
    tags: ['tags', 'tag', 'labels', 'label', 'group'],
    notes: ['notes', 'note', 'remarks', 'comments', 'comment', 'about']
  };
  const key = (h) => String(h || '').toLowerCase().replace(/[\s_.]+/g, '');
  // A sheet (rows of cells) -> contacts. The first row naming a name or email column is the header.
  function contactsFromGrid(grid) {
    const rows = grid.map((r) => (r || []).map((c) => String(c ?? '').trim()));
    const at = rows.findIndex((r) => r.some((c) => HEADERS.name.includes(key(c)) || HEADERS.first.includes(key(c)) || HEADERS.email.includes(key(c))));
    if (at < 0) return { contacts: [], skipped: rows.length };
    const head = rows[at].map(key);
    const col = {};
    for (const [f, names] of Object.entries(HEADERS)) col[f] = head.findIndex((h) => names.includes(h));
    const out = [];
    let skipped = 0;
    for (const r of rows.slice(at + 1)) {
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
  const inflate = async (u8) => {
    if (typeof DecompressionStream !== 'function') throw new Error('This browser cannot open Excel files. Save the file as CSV, then try again.');
    return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
  };
  function download(name, blob) {
    const url = URL.createObjectURL(blob);
    const a = el('a');
    a.href = url;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  // CSV cells: quoted, and cells a spreadsheet would run as a formula are made plain text.
  const csvCell = (v) => {
    let s = String(v ?? '');
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  };
  function viewSettings(v) {
    setTop('Settings');
    const box = el('div', 'settings');

    const acct = el('section', 'card');
    acct.append(el('h2', '', 'Account'), el('p', 'hint', 'Signed in as ' + (data.account?.email || '')));
    const ar = el('div', 'row');
    const back = el('a', 'btn small', 'Open NasrinAI');
    back.href = 'https://nasrinai.com';
    ar.append(back, button('Sign out', 'btn small plain', signOut));
    acct.append(ar);

    const imp = el('section', 'card');
    imp.append(el('h2', '', 'Import contacts'), el('p', 'hint', 'A CSV or Excel file with a header row (Name or First name, Email, Phone, Company, Tags, Notes). It is read on this device; only those columns are sent. Imports do not start automations.'));
    const file = el('input');
    file.type = 'file';
    file.accept = '.csv,.tsv,.xlsx,.xlsm';
    file.setAttribute('aria-label', 'Choose a CSV or Excel file');
    const pv = el('p', 'hint');
    const go2 = button('Add contacts', 'btn small primary', null);
    go2.hidden = true;
    let ready = [];
    file.addEventListener('change', async () => {
      ready = [];
      go2.hidden = true;
      pv.textContent = '';
      const f = file.files && file.files[0];
      if (!f) return;
      try {
        if (!window.NasrinCleaner) throw new Error('Import is not available in this browser.');
        const sheets = await window.NasrinCleaner.read({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }, inflate);
        const { contacts, skipped } = contactsFromGrid((sheets[0] && sheets[0].grid) || []);
        ready = contacts;
        pv.textContent = contacts.length ? `Found ${contacts.length} contacts${skipped ? ` (${skipped} rows without a name left out)` : ''}.` : 'No contacts found. The file needs a header row with a Name, First name or Email column.';
        go2.textContent = `Add ${contacts.length} contacts`;
        go2.hidden = !contacts.length;
      } catch (err) { pv.textContent = err.message || 'That file could not be read.'; }
    });
    go2.addEventListener('click', async () => {
      go2.disabled = true;
      const total = { added: 0, duplicates: 0, invalid: 0, over_limit: 0 };
      try {
        for (let i = 0; i < ready.length; i += 500) {
          pv.textContent = `Adding… ${Math.min(i + 500, ready.length)} of ${ready.length}`;
          const r = await api('/v1/ncc/contacts/import', { method: 'POST', body: { contacts: ready.slice(i, i + 500) } });
          for (const k of Object.keys(total)) total[k] += r[k] || 0;
        }
        await reload();
        toast(`Added ${total.added}.` + (total.duplicates ? ` ${total.duplicates} already there.` : '') + (total.invalid ? ` ${total.invalid} not valid.` : '') + (total.over_limit ? ` ${total.over_limit} over the limit.` : ''));
      } catch (err) { fail(err); go2.disabled = false; }
    });
    imp.append(file, pv, go2);

    const exp = el('section', 'card');
    exp.append(el('h2', '', 'Export'), el('p', 'hint', 'Contacts as a spreadsheet (CSV), or everything (contacts with timelines, deals, tasks, automations) as JSON.'));
    const er = el('div', 'row');
    er.append(
      button('Contacts (CSV)', 'btn small', () => {
        const head = ['Name', 'Email', 'Phone', 'Company', 'Tags', 'Notes', 'Added'];
        const lines = [head.map(csvCell).join(',')].concat(data.contacts.map((c) => [c.name, c.email, c.phone, c.company, c.tags.join(', '), c.notes, c.created_at].map(csvCell).join(',')));
        download('ncc-contacts.csv', new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv' }));
      }),
      button('Everything (JSON)', 'btn small', async () => {
        try { download('ncc-export.json', new Blob([JSON.stringify(await api('/v1/ncc/export'), null, 2)], { type: 'application/json' })); } catch (err) { fail(err); }
      })
    );
    exp.append(er);

    const app = el('section', 'card');
    app.append(el('h2', '', 'NCC on your phone'), el('p', 'hint', 'On iPhone: open this page in Safari, tap Share, then Add to Home Screen. NCC opens like an app.'));

    const del = el('section', 'card');
    del.append(el('h2', '', 'Delete all NCC data'), el('p', 'hint', 'Deletes every contact, deal, task, note and automation in your NCC. This cannot be undone.'));
    const confirm = input('', { max: 6, placeholder: 'Type DELETE' });
    confirm.setAttribute('aria-label', 'Type DELETE to confirm');
    const dr = el('div', 'row');
    dr.append(confirm, button('Delete all', 'btn small danger', async () => {
      if (confirm.value !== 'DELETE') { toast('Type DELETE to confirm.'); return; }
      try { await api('/v1/ncc/delete-all', { method: 'POST', body: { confirm: 'DELETE' } }); await reload(); toast('All NCC data deleted.'); } catch (err) { fail(err); }
    }));
    del.append(dr);

    const legal = el('p', 'hint');
    const t = el('a', '', 'Terms of Service'); t.href = '/legal.html?doc=terms';
    const p = el('a', '', 'Privacy Notice'); p.href = '/legal.html?doc=privacy';
    legal.append(t, document.createTextNode(' · '), p);
    box.append(acct, imp, exp, app, del, legal);
    v.append(box);
  }

  // ---------- start ----------
  async function start() {
    showOnly('boot');
    let status;
    try { status = await api('/v1/ncc/status'); } catch (err) {
      if (err.status === 401) return;
      showOnly('auth');
      $('authStatus').textContent = err.message;
      return;
    }
    if (!status.enabled) {
      $('lockedWho').textContent = 'Signed in';
      showOnly('locked');
      return;
    }
    try {
      data = await api('/v1/ncc');
    } catch (err) {
      showOnly('auth');
      $('authStatus').textContent = err.message;
      return;
    }
    showOnly('app');
    $('lockedWho').textContent = '';
    view = VIEWS.some(([k]) => k === location.hash.slice(1)) ? location.hash.slice(1) : 'home';
    renderNav();
    render();
  }

  window.NCC = { el, icon, button, iconButton, field, input, select, textarea, toast, fail, api, openSheet, closeSheet, reload, render, get data() { return data; }, STAGE_NAMES, when };

  document.addEventListener('DOMContentLoaded', async () => {
    const qs = new URLSearchParams(location.search);
    if (qs.has('signin')) {
      if (qs.get('signin') === 'failed') $('authStatus').textContent = 'Google sign-in did not finish. Please try again.';
      history.replaceState(null, '', location.pathname + location.hash);
    }
    loadMethods();
    if (await refresh().catch(() => false)) await start();
    else showOnly('auth');
  });
})();
