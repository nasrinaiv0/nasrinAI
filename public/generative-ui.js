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
    if (payload.type === 'architecture') {
      const nodes = Array.isArray(payload.nodes) ? payload.nodes.slice(0, MAX_NODES) : [];
      if (!nodes.length) return null;
      const flow = el('div', 'genui-flow');
      flow.setAttribute('role', 'list');
      flow.setAttribute('aria-label', 'Architecture flow');
      nodes.forEach((item, index) => {
        if (index) {
          const connector = el('div', 'genui-connector');
          connector.setAttribute('aria-hidden', 'true');
          connector.append(el('span', 'genui-connector-line'));
          flow.append(connector);
        }
        const node = el('div', 'genui-node');
        node.setAttribute('role', 'button');
        node.setAttribute('tabindex', '0');
        node.setAttribute('aria-expanded', 'false');
        node.setAttribute('aria-label', text(item?.label, 60) || 'Component');
        node.style.setProperty('--genui-index', String(index));
        const detailText = text(item?.detail, 110);
        const toggleNode = () => {
          const expanded = node.getAttribute('aria-expanded') === 'true';
          node.setAttribute('aria-expanded', String(!expanded));
          const detail = node.querySelector('.genui-node-detail');
          if (detail) detail.hidden = expanded;
        };
        node.addEventListener('click', toggleNode);
        node.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggleNode(); }
        });
        node.append(el('span', 'genui-node-index', String(index + 1).padStart(2, '0')));
        node.append(el('strong', 'genui-node-label', text(item?.label, 60) || 'Component'));
        const detail = el('span', 'genui-node-detail', detailText);
        detail.hidden = true;
        if (detail.textContent) node.append(detail);
        node.setAttribute('title', 'Select to show or hide details');
        flow.append(node);
      });
      visual.append(flow);
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
