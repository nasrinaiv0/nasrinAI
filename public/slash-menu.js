// The composer's "/" menu: type "/" to find a command among the core tasks,
// every NasrinAI skill and each Professional AI role. Picking one inserts
// "/command " into the message; the server applies it (src/skill-commands.js).
// Plain DOM only (strict CSP), loaded with the app.
(function () {
  'use strict';
  const CORE = {
    image: 'Create an image', video: 'Create a video', clone: 'Clone an attached image’s style', blur: 'Blur a photo’s background',
    'remove-background': 'Remove a photo’s background', upscale: 'Enhance and upscale a photo', rewrite: 'Rewrite text', translate: 'Translate text',
    summarize: 'Summarize', shorten: 'Make it shorter', expand: 'Make it longer', proofread: 'Fix grammar and spelling', explain: 'Explain simply',
    debug: 'Find and fix a bug', review: 'Review code or writing', research: 'Research a topic', compare: 'Compare options', plan: 'Make a plan',
    brainstorm: 'Brainstorm ideas', email: 'Write an email', code: 'Write code', analyze: 'Analyze data or text', automate: 'Automate a task',
    search: 'Search the web', browse: 'Read a web page', remember: 'Remember a note', recall: 'Recall past chats', library: 'Use your Library',
    file: 'Work with a file', document: 'Write a document', connect: 'Connect a website'
  };
  const MAX = 8;
  let catalog = null;
  let loading = null;
  let items = [];
  let index = 0;

  function load() {
    if (catalog) return Promise.resolve(catalog);
    if (!loading) {
      const core = Object.keys(CORE).map((c) => ({ command: c, title: CORE[c], group: 'Core' }));
      loading = fetch('/v1/commands', { headers: { Accept: 'application/json' } })
        .then((r) => (r.ok ? r.json() : { commands: [] }))
        .catch(() => ({ commands: [] }))
        .then((body) => {
          const list = Array.isArray(body.commands) ? body.commands : [];
          if (globalThis.NasrinCreativeIntent && globalThis.NasrinCreativeIntent.registerImageEdits) globalThis.NasrinCreativeIntent.registerImageEdits(list);
          catalog = core.concat(list);
          return catalog;
        });
    }
    return loading;
  }

  function search(query) {
    const q = query.toLowerCase();
    if (!q) return catalog.filter((c) => c.group === 'Core').slice(0, MAX);
    const starts = [], words = [], within = [];
    for (const c of catalog) {
      const title = String(c.title).toLowerCase();
      if (c.command.startsWith(q)) starts.push(c);
      else if (c.command.includes('-' + q) || title.split(/\s+/).some((w) => w.startsWith(q))) words.push(c);
      else if (c.command.includes(q) || title.includes(q)) within.push(c);
      if (starts.length >= MAX) break;
    }
    return starts.concat(words, within).slice(0, MAX);
  }

  function init() {
    const input = document.getElementById('input');
    const composer = document.getElementById('composer');
    if (!input || !composer) return;
    const menu = document.createElement('div');
    menu.className = 'slash-menu';
    menu.id = 'slashMenu';
    menu.setAttribute('role', 'listbox');
    menu.setAttribute('aria-label', 'Commands');
    menu.hidden = true;
    composer.appendChild(menu);
    input.setAttribute('aria-controls', 'slashMenu');
    input.setAttribute('aria-autocomplete', 'list');

    const open = () => !menu.hidden;
    function close() { menu.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); }
    function choose(i) {
      const c = items[i];
      if (!c) return;
      input.value = '/' + c.command + ' ';
      close();
      input.focus();
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    function render() {
      menu.replaceChildren();
      if (!items.length) {
        const none = document.createElement('div');
        none.className = 'slash-empty';
        none.textContent = 'No command matches. Send it as a normal message.';
        menu.appendChild(none);
      }
      items.forEach((c, i) => {
        const row = document.createElement('div');
        row.className = 'slash-item';
        row.id = 'slashItem' + i;
        row.setAttribute('role', 'option');
        row.setAttribute('aria-selected', String(i === index));
        const name = document.createElement('strong');
        name.textContent = '/' + c.command;
        const meta = document.createElement('small');
        meta.textContent = c.title + (c.group && c.group !== 'Core' ? ' · ' + c.group : '');
        row.append(name, meta);
        row.addEventListener('mousedown', (e) => { e.preventDefault(); choose(i); });
        menu.appendChild(row);
      });
      menu.hidden = false;
      input.setAttribute('aria-expanded', 'true');
      if (items[index]) input.setAttribute('aria-activedescendant', 'slashItem' + index);
      const active = menu.querySelector('[aria-selected="true"]');
      if (active && active.scrollIntoView) active.scrollIntoView({ block: 'nearest' });
    }
    function update() {
      const m = /^\/([a-z0-9-]{0,48})$/i.exec(input.value);
      if (!m) { close(); return; }
      load().then(() => {
        if (!/^\/[a-z0-9-]{0,48}$/i.test(input.value)) return;
        items = search(m[1]);
        index = 0;
        render();
      });
    }
    input.addEventListener('input', update);
    input.addEventListener('blur', () => setTimeout(close, 120));
    // Capture phase on the document: runs before the composer's Enter-to-send.
    document.addEventListener('keydown', (e) => {
      if (e.target !== input || !open()) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (items.length) { index = (index + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length; render(); }
      } else if ((e.key === 'Enter' || e.key === 'Tab') && items.length && !e.isComposing) {
        e.preventDefault(); e.stopImmediatePropagation(); choose(index);
      } else if (e.key === 'Escape') {
        e.preventDefault(); close();
      }
    }, true);
  }

  globalThis.NasrinSlashMenu = Object.freeze({ search: (q) => (catalog ? search(q) : []), load });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
