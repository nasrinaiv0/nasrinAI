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
  function render(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
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
        try { widget = render(JSON.parse(match[1])); } catch { /* malformed payload stays visible below */ }
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
