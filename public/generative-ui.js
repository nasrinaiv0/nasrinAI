// Safe, dependency-free Generative UI renderer for the chat page.
// The model can request only registered widget types; it never supplies HTML.
(() => {
  'use strict';
  const MAX_NODES = 6;
  const MAX_METRICS = 6;
  const MAX_SCENARIOS = 4;
  const text = (value, max = 120) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
  const el = (tag, className, value) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value !== undefined) node.textContent = value;
    return node;
  };
  const safeMetric = (metric) => ({
    label: text(metric?.label, 48),
    value: text(metric?.value, 48),
    hint: text(metric?.hint, 90)
  });
  function renderMermaid(payload) {
    const source = text(payload.source, 6000);
    const directionMatch = source.match(/^\s*(?:flowchart|graph)\s+(TD|TB|LR|RL|BT)\b/m);
    if (!source || !directionMatch) return null;
    const direction = directionMatch[1];
    const nodes = [], edges = [], seen = new Set();
    const addNode = (id, label) => {
      id = text(id, 40); label = text(label || id, 90);
      if (!id || !/^[A-Za-z0-9_-]+$/.test(id)) return;
      if (!seen.has(id) && nodes.length < 12) { seen.add(id); nodes.push({id,label}); }
    };
    // Support common Mermaid flowchart nodes and connections while ignoring theme/init directives.
    const body = source.replace(/%%\{[\s\S]*?\}%%/g, '').split(/\r?\n/);
    for (const line of body) {
      const trimmed = line.trim();
      if (!trimmed || /^(%%|flowchart\b|graph\b|classDef\b|class\b|style\b|linkStyle\b|subgraph\b|end\b|click\b|direction\b)/.test(trimmed)) continue;
      const token = /([A-Za-z][A-Za-z0-9_-]*)\s*(?:\[([^\]]*)\]|\(\(([^)]*)\)\)|\(\[([^\]]*)\]\)|\(([^)]*)\)|\{([^}]*)\}|>([^]]+)\])/g;
      const found = [];
      let m;
      while ((m = token.exec(trimmed))) {
        const label = m.slice(2).find(Boolean) || m[1];
        addNode(m[1], label);
        found.push(m[1]);
      }
      if (found.length < 2) {
        const simple = trimmed.split(/\s*(?:-->|---|==>|-.->|--o|--x|<--)\s*/);
        for (const part of simple) {
          const m2 = part.match(/^\s*([A-Za-z][A-Za-z0-9_-]*)/);
          if (m2) { addNode(m2[1], m2[1]); found.push(m2[1]); }
        }
      }
      for (let i=0;i<found.length-1;i++) if (edges.length<20) edges.push([found[i],found[i+1]]);
    }
    if (!nodes.length) return null;
    const card=el('section','genui-card genui-mermaid-card'); card.classList.add('genui-enter');
    const header=el('header','genui-header');
    header.append(el('h3','genui-title',text(payload.title,100)||'Mermaid Architecture'));
    header.append(el('p','genui-subtitle',text(payload.description,220)||'Rendered Mermaid flowchart'));
    card.append(header);
    const canvas=el('div','genui-mermaid-canvas');
    const vertical=direction==='TD'||direction==='TB'||direction==='BT';
    const width=vertical?320:Math.max(320,nodes.length*178),height=vertical?Math.max(160,nodes.length*76):190;
    const positions=new Map();
    nodes.forEach((node,i)=>positions.set(node.id,vertical?{x:width/2,y:32+i*76}:{x:85+i*178,y:76}));
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('viewBox','0 0 '+width+' '+height);svg.setAttribute('role','img');svg.setAttribute('aria-label','Mermaid architecture flowchart');
    const defs=document.createElementNS(svg.namespaceURI,'defs'),marker=document.createElementNS(svg.namespaceURI,'marker');
    marker.setAttribute('id','genui-mermaid-arrow');marker.setAttribute('markerWidth','8');marker.setAttribute('markerHeight','8');marker.setAttribute('refX','6');marker.setAttribute('refY','3');marker.setAttribute('orient','auto');
    const arrow=document.createElementNS(svg.namespaceURI,'path');arrow.setAttribute('d','M0,0 L0,6 L6,3 z');arrow.setAttribute('fill','currentColor');marker.append(arrow);defs.append(marker);svg.append(defs);
    edges.forEach(([from,to],i)=>{const a=positions.get(from),b=positions.get(to);if(!a||!b)return;const line=document.createElementNS(svg.namespaceURI,'path');line.setAttribute('d',vertical?'M '+a.x+' '+(a.y+22)+' L '+b.x+' '+(b.y-22):'M '+(a.x+67)+' '+a.y+' L '+(b.x-67)+' '+b.y);line.setAttribute('class','genui-mermaid-edge');line.setAttribute('marker-end','url(#genui-mermaid-arrow)');line.style.setProperty('--edge-index',String(i));svg.append(line);});
    nodes.forEach(node=>{const p=positions.get(node.id),g=document.createElementNS(svg.namespaceURI,'g');g.setAttribute('class','genui-mermaid-node');const rect=document.createElementNS(svg.namespaceURI,'rect');rect.setAttribute('x',p.x-67);rect.setAttribute('y',p.y-22);rect.setAttribute('width','134');rect.setAttribute('height','44');rect.setAttribute('rx','12');g.append(rect);const label=document.createElementNS(svg.namespaceURI,'text');label.setAttribute('x',p.x);label.setAttribute('y',p.y+4);label.setAttribute('text-anchor','middle');label.textContent=node.label.slice(0,24);g.append(label);svg.append(g);});
    canvas.append(svg);card.append(canvas);
    const details=document.createElement('details');details.className='genui-mermaid-source';const summary=el('summary','', 'View Mermaid source');details.append(summary);const pre=el('pre','',source);details.append(pre);card.append(details);
    return card;
  }

  function render(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
    if (payload.type === 'mermaid') return renderMermaid(payload);
    if (payload.type !== 'architecture' && payload.type !== 'metrics') return null;
    const card = el('section', 'genui-card');
    card.setAttribute('aria-label', text(payload.title, 100) || 'Interactive visualization');
    card.classList.add('genui-enter');
    const header = el('header', 'genui-header');
    const heading = el('h3', 'genui-title', text(payload.title, 100) || 'Interactive visualization');
    const subtitle = el('p', 'genui-subtitle', text(payload.description, 220));
    header.append(heading);
    if (subtitle.textContent) header.append(subtitle);
    card.append(header);

    const visual = el('div', 'genui-visual');
    const suppliedNodes = Array.isArray(payload.nodes) ? payload.nodes.slice(0, MAX_NODES) : [];
    // A metrics-only payload still gets a useful illustrative topology, rather than a row of buttons and cards.
    const nodes = payload.type === 'architecture' || suppliedNodes.length
      ? suppliedNodes
      : [
          { label: 'Clients', detail: 'Web and mobile requests' },
          { label: 'Cloud CDN', detail: 'Edge cache and delivery' },
          { label: 'Load Balancer', detail: 'Routes requests to healthy instances' },
          { label: 'Application Servers', detail: 'Processes requests and scales with demand' },
          { label: 'Database', detail: 'Persists application data' }
        ];
    if (nodes.length) {
      const diagram = el('div', 'genui-diagram');
      diagram.setAttribute('role', 'group');
      diagram.setAttribute('aria-label', 'Illustrative system architecture diagram');
      const legend = el('div', 'genui-diagram-legend');
      legend.append(el('span', 'genui-live-dot'));
      legend.append(el('span', 'genui-diagram-legend-text', 'REQUEST FLOW'));
      legend.append(el('span', 'genui-diagram-caption', 'Illustrative topology'));
      diagram.append(legend);
      const flow = el('div', 'genui-flow');
      flow.setAttribute('role', 'list');
      flow.setAttribute('aria-label', 'Architecture components');
      nodes.forEach((item, index) => {
        if (index) {
          const connector = el('div', 'genui-connector');
          connector.setAttribute('aria-hidden', 'true');
          connector.append(el('span', 'genui-connector-line'));
          connector.append(el('span', 'genui-connector-arrow', '›'));
          flow.append(connector);
        }
        const node = el('button', 'genui-node', undefined);
        node.type = 'button';
        node.setAttribute('aria-expanded', 'false');
        node.setAttribute('aria-label', text(item?.label, 60) || 'Component');
        node.style.setProperty('--genui-index', String(index));
        const detailText = text(item?.detail, 110);
        node.append(el('span', 'genui-node-index', String(index + 1).padStart(2, '0')));
        node.append(el('strong', 'genui-node-label', text(item?.label, 60) || 'Component'));
        node.append(el('span', 'genui-node-hint', 'SYSTEM COMPONENT'));
        const detail = el('span', 'genui-node-detail', detailText);
        detail.hidden = true;
        if (detail.textContent) node.append(detail);
        node.addEventListener('click', () => {
          const expanded = node.getAttribute('aria-expanded') === 'true';
          node.setAttribute('aria-expanded', String(!expanded));
          detail.hidden = expanded;
        });
        flow.append(node);
      });
      diagram.append(flow);
      visual.append(diagram);
    }

    const metricWrap = el('div', 'genui-metrics');
    metricWrap.setAttribute('aria-label', 'Metrics');
    const baseMetrics = Array.isArray(payload.metrics) ? payload.metrics.slice(0, MAX_METRICS).map(safeMetric) : [];
    const scenarios = Array.isArray(payload.scenarios) ? payload.scenarios.slice(0, MAX_SCENARIOS) : [];
    const showMetrics = (metrics) => {
      metricWrap.replaceChildren();
      for (const metric of metrics.slice(0, MAX_METRICS).map(safeMetric)) {
        if (!metric.label || !metric.value) continue;
        const tile = el('div', 'genui-metric');
        tile.append(el('span', 'genui-metric-label', metric.label));
        const value = el('strong', 'genui-metric-value', metric.value);
        value.setAttribute('aria-live', 'polite');
        tile.append(value);
        if (metric.hint) tile.append(el('span', 'genui-metric-hint', metric.hint));
        metricWrap.append(tile);
      }
    };
    if (scenarios.length) {
      const controls = el('div', 'genui-scenarios');
      controls.setAttribute('role', 'group');
      controls.setAttribute('aria-label', 'Choose scenario');
      scenarios.forEach((scenario, index) => {
        const button = el('button', 'genui-scenario', text(scenario?.label, 48) || 'Scenario');
        button.type = 'button';
        button.setAttribute('aria-pressed', index === 0 ? 'true' : 'false');
        button.addEventListener('click', () => {
          controls.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', b === button ? 'true' : 'false'));
          showMetrics(Array.isArray(scenario?.metrics) ? scenario.metrics : baseMetrics);
          metricWrap.classList.remove('genui-metrics-refresh');
          void metricWrap.offsetWidth;
          metricWrap.classList.add('genui-metrics-refresh');
        });
        controls.append(button);
      });
      card.append(controls);
      showMetrics(Array.isArray(scenarios[0]?.metrics) ? scenarios[0].metrics : baseMetrics);
    } else showMetrics(baseMetrics);
    if (metricWrap.childElementCount) card.append(metricWrap);
    return card;
  }

  function parseWidgetPayload(raw) {
    let candidate = String(raw || '').trim().replace(/^```(?:json)?\\s*/i, '').replace(/\\s*```$/, '');
    for (let attempt = 0; attempt < 3; attempt++) {
      try { const parsed = JSON.parse(candidate); if (typeof parsed === 'string') { candidate = parsed.trim(); continue; } return parsed; }
      catch {
        let fixed = '', inString = false, escaped = false;
        for (const ch of candidate) {
          if (inString && ch === '\n') { fixed += '\\n'; escaped = false; continue; }
          if (inString && ch === '\r') continue;
          fixed += ch;
          if (escaped) escaped = false; else if (ch === '\\\\' && inString) escaped = true; else if (ch === '"') inString = !inString;
        }
        if (fixed === candidate) break; candidate = fixed;
      }
    }
    return null;
  }

  function install() {
    if (!window.NasrinFormat || window.NasrinFormat.__generativeUI) return false;
    const original = window.NasrinFormat.render;
    window.NasrinFormat.render = function (source) {
      const raw = String(source ?? '').replace(/\\n[ \\t]*\\n/g, '\n\n');
      const pattern = /\[\[ui\]\]([\s\S]{1,12000}?)\[\[\/ui\]\]/gi;
      const matches = [...raw.matchAll(pattern)].slice(0, 3);
      if (!matches.length) return original(raw);
      const fragment = document.createDocumentFragment();
      const blocks = [];
      let cursor = 0;
      const addText = (chunk) => {
        if (!chunk) return;
        const result = original(chunk);
        fragment.appendChild(result.node);
        blocks.push(...(result.blocks || []));
      };
      for (const match of matches) {
        addText(raw.slice(cursor, match.index));
        let widget = null;
        try { widget = render(parseWidgetPayload(match[1])); } catch { /* malformed payload stays visible below */ }
        if (widget) {
          fragment.appendChild(widget);
          blocks.push(widget);
        } else {
          addText(match[0]);
        }
        cursor = match.index + match[0].length;
      }
      addText(raw.slice(cursor));
      return { node: fragment, blocks };
    };
    window.NasrinFormat.__generativeUI = true;
    return true;
  }
  if (!install()) document.addEventListener('DOMContentLoaded', install, { once: true });
})();
