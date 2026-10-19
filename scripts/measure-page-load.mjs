// Page-load baseline over the Chrome DevTools Protocol (Node 22 WebSocket, no packages). See docs/performance-baseline.md.
// usage: [CHROMIUM_PATH=...] node scripts/measure-page-load.mjs <url> <runs> <throttle:0|1>
import { spawn } from 'node:child_process';
const [url, runsArg, throttle] = process.argv.slice(2);
const runs = +runsArg || 3;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function once() {
  const port = 9300 + Math.floor(Math.random() * 500);
  const chrome = spawn(process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium', ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${port}`, '--window-size=390,844', 'about:blank'], { stdio: 'ignore' });
  let target;
  for (let i = 0; i < 50 && !target; i++) { await sleep(200); try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page'); } catch {} }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0; const pending = new Map(); const events = [];
  ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } else events.push(m); });
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await send('Network.enable'); await send('Page.enable'); await send('Runtime.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  if (throttle === '1') {
    await send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6e6 / 8, uploadThroughput: 750e3 / 8 });
    await send('Emulation.setCPUThrottlingRate', { rate: 4 });
  }
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__m={};new PerformanceObserver(l=>{for(const e of l.getEntries())window.__m.lcp=e.startTime}).observe({type:'largest-contentful-paint',buffered:true});` });
  await send('Page.navigate', { url });
  const t0 = Date.now();
  while (Date.now() - t0 < 60000) { if (events.some((e) => e.method === 'Page.loadEventFired')) break; await sleep(100); }
  await sleep(2500);
  const ev = await send('Runtime.evaluate', { expression: `JSON.stringify({fcp:(performance.getEntriesByName('first-contentful-paint')[0]||{}).startTime,lcp:window.__m.lcp,dcl:performance.timing.domContentLoadedEventEnd-performance.timing.navigationStart,load:performance.timing.loadEventEnd-performance.timing.navigationStart,dom:document.getElementsByTagName('*').length})` });
  const m = JSON.parse(ev.result.result.value);
  const reqs = new Map();
  for (const e of events) {
    if (e.method === 'Network.responseReceived') reqs.set(e.params.requestId, { url: e.params.response.url, status: e.params.response.status, type: e.params.type, cache: e.params.response.headers['cache-control'] || e.params.response.headers['Cache-Control'] || '' });
    if (e.method === 'Network.loadingFinished' && reqs.has(e.params.requestId)) reqs.get(e.params.requestId).bytes = e.params.encodedDataLength;
  }
  const errors = events.filter((e) => e.method === 'Runtime.exceptionThrown' || (e.method === 'Log.entryAdded' && e.params.entry.level === 'error')).length;
  chrome.kill();
  return { ...m, requests: [...reqs.values()], errors };
}
const results = [];
for (let i = 0; i < runs; i++) results.push(await once());
const med = (k) => results.map((r) => r[k]).filter((v) => v != null).sort((a, b) => a - b)[Math.floor(results.length / 2)];
const last = results.at(-1);
const bytes = last.requests.reduce((n, r) => n + (r.bytes || 0), 0);
const byType = {};
for (const r of last.requests) byType[r.type] = (byType[r.type] || 0) + (r.bytes || 0);
console.log(JSON.stringify({ url, throttle: throttle === '1', runs, fcp_ms: Math.round(med('fcp')), lcp_ms: Math.round(med('lcp')), dcl_ms: Math.round(med('dcl')), load_ms: Math.round(med('load')), dom_nodes: last.dom, js_errors: last.errors, requests: last.requests.length, bytes, byType, failed: last.requests.filter((r) => r.status >= 400).map((r) => r.status + ' ' + r.url), biggest: last.requests.sort((a, b) => (b.bytes || 0) - (a.bytes || 0)).slice(0, 8).map((r) => `${r.bytes} ${r.url.replace(/^https?:\/\/[^/]+/, '')}`) }, null, 1));
