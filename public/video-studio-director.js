(() => {
  'use strict';
  const KEY = 'nasrinai.videoStudio.director.v1';
  const PROMPT_KEY = 'nasrinai.videoStudio.promptLibrary.v1';
  const $ = (id) => document.getElementById(id);
  const clampText = (value, max = 2000) => String(value || '').trim().slice(0, max);
  const uid = () => (globalThis.crypto && typeof crypto.randomUUID === 'function')
    ? crypto.randomUUID() : 'shot-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const presets = {
    drama: { label: 'Short drama', beats: [
      ['The hook', 'Open on a striking visual or a character facing an urgent choice.'],
      ['The setup', 'Establish the character, location, and what they stand to lose.'],
      ['The turn', 'Reveal new information that changes the meaning of the opening.'],
      ['The confrontation', 'Build tension through a decisive action or emotional exchange.'],
      ['The cliffhanger', 'End on a surprising reveal or unresolved question.']
    ]},
    music: { label: 'Music video', beats: [
      ['Opening image', 'Introduce the visual world with a memorable establishing shot.'],
      ['First verse', 'Use intimate character details and movement that fit the lyrical mood.'],
      ['Build', 'Increase visual scale and motion as the music builds.'],
      ['Chorus', 'Deliver the strongest performance image and visual motif.'],
      ['Bridge', 'Change location, framing, or visual texture to create contrast.'],
      ['Final refrain', 'Return to the central motif with a new emotional meaning.']
    ]},
    product: { label: 'Product advertisement', beats: [
      ['The hook', 'Show a compelling problem, desire, or unexpected visual.'],
      ['Product reveal', 'Reveal the product clearly in a clean hero composition.'],
      ['Detail', 'Show a tactile close-up that communicates material and quality.'],
      ['Benefit', 'Show the product being used in a believable real-world moment.'],
      ['Call to action', 'Finish with a composed hero shot and room for a CTA overlay.']
    ]},
    social: { label: 'Social short', beats: [
      ['Stop the scroll', 'Start with a surprising image or a direct visual question.'],
      ['Promise', 'Show what the viewer will learn, feel, or see.'],
      ['Payoff', 'Deliver the key moment with clear visual progression.'],
      ['Proof', 'Show a concrete result, reaction, or before-and-after.'],
      ['CTA', 'End with a clean composition that leaves space for a short CTA.']
    ]}
  };
  const state = { workflow: 'drama', shots: [], prompts: [], projectName: '' };
  function loadJson(key, fallback) {
    try { const value = JSON.parse(localStorage.getItem(key) || 'null'); return value == null ? fallback : value; }
    catch (_) { return fallback; }
  }
  function persist() {
    try {
      state.projectName = clampText($('projectName')?.value || 'Untitled video', 80) || 'Untitled video';
      localStorage.setItem(KEY, JSON.stringify({
        version: 1, workflow: state.workflow, shots: state.shots,
        projectName: state.projectName, brief: clampText($('directorBrief')?.value, 1200),
        style: clampText($('directorStyle')?.value, 180), ratio: $('directorRatio')?.value || '9:16',
        duration: Number($('directorDuration')?.value) || 30, updatedAt: new Date().toISOString()
      }));
      localStorage.setItem(PROMPT_KEY, JSON.stringify(state.prompts));
      const status = $('directorSaveState');
      if (status) status.textContent = 'Director plan saved on this device';
    } catch (_) {
      const status = $('directorSaveState');
      if (status) status.textContent = 'Could not save locally — check browser storage';
    }
  }
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function injectStyles() {
    if ($('directorWorkflowStyles')) return;
    const style = el('style'); style.id = 'directorWorkflowStyles';
    style.textContent = [
      '.director-workflow{margin:28px 0 10px;padding:clamp(16px,2.5vw,26px);border:1px solid var(--line,rgba(140,140,150,.24));border-radius:18px;background:var(--panel,rgba(120,120,130,.045));color:var(--text,inherit)}',
      '.director-head{display:flex;gap:16px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;margin-bottom:18px}',
      '.director-head h2{margin:4px 0 7px;font-size:clamp(20px,2.5vw,28px)}.director-head p{margin:0;max-width:680px;color:var(--muted,#888);line-height:1.55}',
      '.director-kicker{font-size:11px;letter-spacing:.13em;font-weight:750;color:var(--accent,#8ba9ff)}',
      '.director-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(220px,.65fr);gap:14px}',
      '.director-field{display:flex;flex-direction:column;gap:7px;min-width:0;margin-bottom:12px}.director-field label,.director-label{font-size:11px;letter-spacing:.08em;font-weight:700;color:var(--muted,#888)}',
      '.director-field input,.director-field textarea,.director-field select,.director-shot textarea,.director-library input{width:100%;box-sizing:border-box;border:1px solid var(--line,rgba(140,140,150,.28));border-radius:10px;padding:10px 12px;background:var(--input,rgba(120,120,130,.08));color:inherit;font:inherit}',
      '.director-field textarea{resize:vertical;min-height:86px}.director-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:8px 0 18px}',
      '.director-btn{border:1px solid var(--line,rgba(140,140,150,.3));border-radius:10px;padding:9px 12px;background:transparent;color:inherit;font:inherit;font-size:13px;cursor:pointer;min-height:38px}.director-btn.primary{background:var(--accent,#7396ff);border-color:transparent;color:#fff;font-weight:700}',
      '.director-btn:focus-visible,.director-workflow input:focus-visible,.director-workflow textarea:focus-visible,.director-workflow select:focus-visible{outline:2px solid var(--accent,#7396ff);outline-offset:2px}',
      '.director-shots{display:grid;gap:10px}.director-shot{padding:14px;border:1px solid var(--line,rgba(140,140,150,.22));border-radius:13px;background:var(--surface,rgba(120,120,130,.035))}',
      '.director-shot-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}.director-shot-head strong{font-size:14px}.director-shot-meta{font-size:11px;color:var(--muted,#888)}',
      '.director-shot textarea{min-height:94px;line-height:1.5;resize:vertical}.director-shot-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:9px}',
      '.director-library{margin-top:22px;padding-top:18px;border-top:1px solid var(--line,rgba(140,140,150,.2))}.director-library h3{margin:0 0 6px;font-size:16px}',
      '.director-library-list{display:grid;gap:8px;margin-top:10px}.director-prompt-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px;border:1px solid var(--line,rgba(140,140,150,.2));border-radius:10px}',
      '.director-prompt-row span{font-size:13px;overflow-wrap:anywhere}.director-empty{padding:20px;border:1px dashed var(--line,rgba(140,140,150,.3));border-radius:12px;color:var(--muted,#888);text-align:center}.director-status{font-size:12px;color:var(--muted,#888);min-height:18px}',
      '@media(max-width:700px){.director-grid{grid-template-columns:1fr}.director-prompt-row{align-items:flex-start;flex-direction:column}.director-head{display:block}}'
    ].join('\n');
    document.head.append(style);
  }
  function setStatus(message) { const node = $('directorStatus'); if (node) node.textContent = message; }
  function makeShotList() {
    const brief = clampText($('directorBrief')?.value, 1200);
    if (!brief) { setStatus('Add a project idea first so the shot plan has a clear direction.'); $('directorBrief')?.focus(); return; }
    const preset = presets[state.workflow] || presets.drama;
    const style = clampText($('directorStyle')?.value, 180) || 'cinematic, natural lighting, intentional camera movement';
    const ratio = $('directorRatio')?.value || '9:16';
    const duration = Math.max(5, Math.min(60, Number($('directorDuration')?.value) || 30));
    const each = Math.max(1, Math.floor(duration / preset.beats.length));
    state.shots = preset.beats.map((beat, index) => ({
      id: uid(), number: index + 1, title: beat[0],
      seconds: index === preset.beats.length - 1 ? Math.max(1, duration - each * (preset.beats.length - 1)) : each,
      prompt: beat[1] + ' Project brief: ' + brief + '. Visual direction: ' + style + '. Shot ' + (index + 1) + ' of ' + preset.beats.length + '. Compose for ' + ratio + '. Maintain consistent characters, wardrobe, props, lighting logic, and visual style. No unintended text, logos, or watermarks.',
      locked: false
    }));
    renderShots(); persist();
    setStatus('Created ' + state.shots.length + ' editable shot prompts. Review each before generating footage.');
  }
  function renderShots() {
    const root = $('directorShots'); if (!root) return; root.replaceChildren();
    if (!state.shots.length) {
      root.append(el('div', 'director-empty', 'Your shot plan will appear here. Generate a plan from a brief, then edit each shot before sending it to the video generator.'));
      return;
    }
    state.shots.forEach((shot, index) => {
      const card = el('article', 'director-shot');
      const head = el('div', 'director-shot-head');
      const label = el('div');
      label.append(el('strong', '', String(index + 1).padStart(2, '0') + ' · ' + shot.title));
      label.append(el('div', 'director-shot-meta', shot.seconds + 's planned · editable prompt'));
      head.append(label);
      const remove = el('button', 'director-btn', 'Remove shot');
      remove.type = 'button'; remove.dataset.action = 'remove-shot'; remove.dataset.id = shot.id; head.append(remove); card.append(head);
      const textarea = el('textarea'); textarea.value = shot.prompt; textarea.maxLength = 2000;
      textarea.setAttribute('aria-label', 'Prompt for shot ' + (index + 1) + ': ' + shot.title);
      textarea.dataset.action = 'edit-shot'; textarea.dataset.id = shot.id; card.append(textarea);
      const actions = el('div', 'director-shot-actions');
      const use = el('button', 'director-btn primary', 'Use in video generator');
      use.type = 'button'; use.dataset.action = 'use-shot'; use.dataset.id = shot.id;
      const save = el('button', 'director-btn', 'Save to prompt library');
      save.type = 'button'; save.dataset.action = 'save-shot'; save.dataset.id = shot.id;
      actions.append(use, save); card.append(actions); root.append(card);
    });
  }
  function renderLibrary() {
    const root = $('directorLibraryList'); if (!root) return; root.replaceChildren();
    if (!state.prompts.length) {
      root.append(el('div', 'director-empty', 'No saved prompts yet. Save a shot prompt to reuse it in future projects on this device.')); return;
    }
    state.prompts.forEach((item) => {
      const row = el('div', 'director-prompt-row'); row.append(el('span', '', item.name));
      const actions = el('div', 'director-shot-actions');
      const use = el('button', 'director-btn', 'Use'); use.type = 'button'; use.dataset.action = 'use-library'; use.dataset.id = item.id;
      const remove = el('button', 'director-btn', 'Delete'); remove.type = 'button'; remove.dataset.action = 'delete-library'; remove.dataset.id = item.id;
      actions.append(use, remove); row.append(actions); root.append(row);
    });
  }
  function usePrompt(prompt) {
    const input = $('prompt');
    if (!input) { setStatus('The existing video prompt field was not found; refresh Video Studio and try again.'); return; }
    input.value = clampText(prompt, 2000);
    input.dispatchEvent(new Event('input', { bubbles: true })); input.focus();
    setStatus('Prompt copied into the existing video generator. Review it and press Generate scene when ready.');
    input.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function downloadShotPlan() {
    if (!state.shots.length) { setStatus('Create a shot plan before exporting it.'); return; }
    const payload = {
      schemaVersion: 1, projectName: clampText($('projectName')?.value || 'Untitled video', 80),
      workflow: state.workflow, format: $('directorRatio')?.value || '9:16',
      brief: clampText($('directorBrief')?.value, 1200),
      shots: state.shots.map((shot, index) => ({ order: index + 1, title: shot.title, durationSeconds: shot.seconds, prompt: clampText(shot.prompt, 2000) })),
      exportedAt: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const link = el('a'); link.href = url;
    link.download = 'nasrinai-shot-plan.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus('Shot plan exported as JSON. This exports the plan, not a rendered video.');
  }
  function injectPanel() {
    if ($('directorWorkflow')) return;
    const host = $('createPanel'); if (!host) return; injectStyles();
    const section = el('section', 'director-workflow'); section.id = 'directorWorkflow';
    section.setAttribute('aria-labelledby', 'directorTitle');
    section.innerHTML = [
      '<div class="director-head"><div><div class="director-kicker">AI PRODUCTION WORKSHOP</div><h2 id="directorTitle">Director &amp; Shot Planner</h2><p>Turn a creative brief into an editable sequence of shot prompts. Review every shot, then send prompts to the existing video generator one at a time.</p></div><div id="directorSaveState" class="director-status" role="status">Saved on this device</div></div>',
      '<div class="director-grid"><div><div class="director-field"><label for="directorBrief">PROJECT IDEA / BRIEF</label><textarea id="directorBrief" maxlength="1200" rows="4" placeholder="A young chef tries to save her family restaurant before sunrise…"></textarea></div><div class="director-field"><label for="directorStyle">VISUAL DIRECTION</label><input id="directorStyle" maxlength="180" value="cinematic composition, natural light, expressive close-ups, consistent visual continuity"></div></div>',
      '<div><div class="director-field"><label for="directorWorkflowType">WORKFLOW</label><select id="directorWorkflowType"><option value="drama">Short drama</option><option value="music">Music video</option><option value="product">Product advertisement</option><option value="social">Social short</option></select></div><div class="director-field"><label for="directorRatio">ASPECT RATIO</label><select id="directorRatio"><option value="9:16">Portrait · 9:16</option><option value="16:9">Landscape · 16:9</option><option value="1:1">Square · 1:1</option></select></div><div class="director-field"><label for="directorDuration">TARGET LENGTH</label><select id="directorDuration"><option value="15">15 seconds</option><option value="30" selected>30 seconds</option><option value="45">45 seconds</option><option value="60">60 seconds</option></select></div></div></div>',
      '<div class="director-actions"><button id="directorGeneratePlan" class="director-btn primary" type="button">Create shot plan</button><button id="directorExportPlan" class="director-btn" type="button">Export shot plan JSON</button><button id="directorClearPlan" class="director-btn" type="button">Clear plan</button></div>',
      '<div id="directorShots" class="director-shots" aria-live="polite"></div><div class="director-library"><h3>Prompt library</h3><p class="director-shot-meta">Save and reuse prompts on this device. No API keys or authentication tokens are stored here.</p>',
      '<div class="director-actions"><input id="directorPromptName" maxlength="80" aria-label="Name for a saved prompt" placeholder="Prompt name, e.g. dramatic close-up" style="flex:1;min-width:180px;max-width:420px"><button id="directorSaveCurrentPrompt" class="director-btn" type="button">Save current generator prompt</button></div><div id="directorLibraryList" class="director-library-list"></div></div><p id="directorStatus" class="director-status" role="status" aria-live="polite"></p>'
    ].join('');
    host.append(section);
    const restored = loadJson(KEY, {});
    if (restored && restored.version === 1) {
      if (presets[restored.workflow]) state.workflow = restored.workflow;
      if (Array.isArray(restored.shots)) state.shots = restored.shots.filter(s => s && typeof s.id === 'string' && typeof s.prompt === 'string').slice(0, 40);
      if ($('directorBrief')) $('directorBrief').value = clampText(restored.brief, 1200);
    }
    const savedPrompts = loadJson(PROMPT_KEY, []);
    state.prompts = (Array.isArray(savedPrompts) ? savedPrompts : []).filter(p => p && typeof p.id === 'string' && typeof p.prompt === 'string').slice(0, 100);
    $('directorWorkflowType').value = state.workflow;
    const current = loadJson(KEY, {});
    if (current && current.brief) $('directorBrief').value = clampText(current.brief, 1200);
    if (current && current.style) $('directorStyle').value = clampText(current.style, 180);
    if (current && current.ratio) $('directorRatio').value = current.ratio;
    if (current && current.duration) $('directorDuration').value = String(current.duration);
    renderShots(); renderLibrary();
    $('directorWorkflowType').addEventListener('change', () => { state.workflow = $('directorWorkflowType').value; persist(); });
    ['directorBrief', 'directorStyle', 'directorRatio', 'directorDuration'].forEach(id => {
      $(id).addEventListener('input', persist); $(id).addEventListener('change', persist);
    });
    $('directorGeneratePlan').addEventListener('click', makeShotList);
    $('directorExportPlan').addEventListener('click', downloadShotPlan);
    $('directorClearPlan').addEventListener('click', () => { state.shots = []; renderShots(); persist(); setStatus('Shot plan cleared. Your prompt library is unchanged.'); });
    $('directorShots').addEventListener('input', (event) => {
      const target = event.target.closest('[data-action="edit-shot"]'); if (!target) return;
      const shot = state.shots.find(s => s.id === target.dataset.id);
      if (shot) { shot.prompt = clampText(target.value, 2000); persist(); }
    });
    $('directorShots').addEventListener('click', (event) => {
      const button = event.target.closest('button[data-action]'); if (!button) return;
      const shot = state.shots.find(s => s.id === button.dataset.id);
      switch (button.dataset.action) {
        case 'use-shot': if (shot) usePrompt(shot.prompt); break;
        case 'save-shot':
          if (shot) { state.prompts.unshift({ id: uid(), name: clampText(shot.title, 80) || 'Saved shot prompt', prompt: shot.prompt }); state.prompts = state.prompts.slice(0, 100); renderLibrary(); persist(); setStatus('Shot prompt saved to your local prompt library.'); }
          break;
        case 'remove-shot':
          state.shots = state.shots.filter(s => s.id !== button.dataset.id); renderShots(); persist(); setStatus('Shot removed from the plan.'); break;
      }
    });
    $('directorSaveCurrentPrompt').addEventListener('click', () => {
      const prompt = clampText($('prompt')?.value, 2000);
      if (!prompt) { setStatus('Enter a prompt in the existing video generator first.'); return; }
      const name = clampText($('directorPromptName').value, 80) || 'Saved video prompt';
      state.prompts.unshift({ id: uid(), name, prompt }); state.prompts = state.prompts.slice(0, 100);
      $('directorPromptName').value = ''; renderLibrary(); persist(); setStatus('Current video prompt saved to your local prompt library.');
    });
    $('directorLibraryList').addEventListener('click', (event) => {
      const button = event.target.closest('button[data-action]'); if (!button) return;
      const item = state.prompts.find(p => p.id === button.dataset.id);
      if (button.dataset.action === 'use-library' && item) usePrompt(item.prompt);
      if (button.dataset.action === 'delete-library') { state.prompts = state.prompts.filter(p => p.id !== button.dataset.id); renderLibrary(); persist(); setStatus('Prompt removed from your local library.'); }
    });
    $('projectName')?.addEventListener('change', persist);
    persist();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', injectPanel, { once: true });
  else injectPanel();
})();