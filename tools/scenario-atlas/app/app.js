const app = document.querySelector('#app');
const labels = { verified: 'Verified', failed: 'Failed here', untested: 'Untested', not_reached: 'Not reached' };
const marks = { verified: '✓', failed: '×', untested: '○', not_reached: '—' };
const classes = { verified: 'pass', failed: 'fail', untested: 'open', not_reached: 'blocked' };
let catalog = null;
let activeWorkflowId = null;
let activeScreen = 'atlas';
let stack = [];
let selectedStatus = null;

const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
const workflow = () => catalog.workflows.find((item) => item.id === activeWorkflowId) ?? catalog.workflows[0];
const checkpoint = (id) => catalog.workflows.flatMap((item) => item.checkpoints).find((item) => item.id === id);
const scenario = (id) => catalog.workflows.flatMap((item) => item.checkpoints.flatMap((point) => point.scenarios)).find((item) => item.id === id);

function statusBadge(status) {
  return `<span class="tab-status ${status === 'failed' ? 'failed' : 'open'}">${escapeHtml(labels[status])}</span>`;
}

function renderTopbar() {
  return `<header class="topbar"><div class="brand"><span class="brand-mark">SA</span><strong>Scenario Atlas</strong><span>/ EMS</span></div><nav class="primary-nav" aria-label="Primary views"><button class="${activeScreen === 'atlas' ? 'active' : ''}" type="button" data-screen="atlas" aria-pressed="${activeScreen === 'atlas'}">Atlas</button><button class="${activeScreen === 'coverage' ? 'active' : ''}" type="button" data-screen="coverage" aria-pressed="${activeScreen === 'coverage'}">Coverage</button></nav><div class="top-actions"><span class="local-badge mono">Local only</span><button class="quiet-button" type="button" data-regenerate>Reload catalog</button><button class="theme-button" type="button" data-theme-toggle aria-label="Switch theme"><svg class="sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.5" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M19 5l-2 2M7 17l-2 2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg><svg class="moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 15.2A8.5 8.5 0 0 1 8.8 4 8.5 8.5 0 1 0 20 15.2Z" fill="none" stroke="currentColor" stroke-width="1.7"/></svg></button></div></header>`;
}

function renderWorkflowTabs() {
  return `<div class="workflow-tabs" role="tablist" aria-label="Seed workflows">${catalog.workflows.map((item) => `<button class="workflow-tab ${item.id === activeWorkflowId ? 'active' : ''}" type="button" role="tab" aria-selected="${item.id === activeWorkflowId}" data-workflow="${escapeHtml(item.id)}"><span class="workflow-index mono">${escapeHtml(item.index)}</span><span><strong>${escapeHtml(item.actor)}</strong><span>${item.checkpoints.length} checkpoints · ${item.coverage.total} scenarios</span></span>${statusBadge(item.status)}</button>`).join('')}</div>`;
}

function renderGraph(item) {
  const stages = [...new Set(item.checkpoints.map((point) => point.stage))];
  return `<div class="graph-shell"><div class="graph-title mono">Happy path · select a checkpoint to open its derived workflows</div><div class="graph-legend"><span><i class="legend-pass"></i>Verified</span><span><i class="legend-fail"></i>Failed here</span><span><i class="legend-open"></i>Untested</span><span><i class="legend-blocked"></i>Not reached</span></div><div class="dynamic-flow">${stages.map((stage, index) => {
    const points = item.checkpoints.filter((point) => point.stage === stage);
    const group = `<div class="stage-group ${points.length > 1 ? 'branch' : ''}">${points.map((point) => `<button class="checkpoint ${classes[point.status]}" type="button" data-checkpoint="${escapeHtml(point.id)}"><span class="checkpoint-status">${marks[point.status]}</span><span class="cp-id mono">${escapeHtml(point.label)}</span><span class="cp-name">${escapeHtml(point.title)}</span><span class="cp-meta"><span>${labels[point.status]}</span><span class="branch-count">${point.scenarios.length} scenario${point.scenarios.length === 1 ? '' : 's'}</span></span></button>`).join('')}</div>`;
    return `${index ? `<i class="connector ${points.every((point) => point.status === 'not_reached') ? 'blocked' : ''}"></i>` : ''}${group}`;
  }).join('')}</div><div class="graph-hint"><kbd>Click</kbd> a checkpoint to make its scenarios the primary graph</div></div>`;
}

function renderAtlas() {
  const item = workflow();
  return `<section class="screen active"><div class="atlas-body atlas-body-local"><header class="workflow-head"><div class="workflow-copy"><div class="eyebrow mono">Workflow ${escapeHtml(item.index)} · ${escapeHtml(item.actor)}</div><h1>${escapeHtml(item.title)}</h1><p>${escapeHtml(item.description)}</p></div><div class="workflow-stats"><div class="workflow-stat"><strong>${item.coverage.total}</strong><span>Scenarios</span></div><div class="workflow-stat"><strong>${item.coverage.verified} / ${item.coverage.total}</strong><span>Verified</span></div><div class="workflow-stat"><strong>${item.coverage.failed}</strong><span>Failures</span></div></div></header>${renderGraph(item)}</div></section>`;
}

function renderCoverage() {
  const verified = catalog.workflows.reduce((sum, item) => sum + item.coverage.verified, 0);
  const total = catalog.workflows.reduce((sum, item) => sum + item.coverage.total, 0);
  return `<section class="screen coverage-screen active"><header class="coverage-head"><div><h1>Workflow coverage</h1><p>Every declared dimension is covered or explicitly excluded; run state still follows the first unresolved checkpoint.</p></div><div class="coverage-total"><strong>${verified} / ${total}</strong><span class="mono">scenarios verified</span><span class="local-badge mono">Stored locally</span></div></header><div class="coverage-list">${catalog.workflows.map((item) => `<article class="coverage-item"><div><h2>${escapeHtml(item.index)} · ${escapeHtml(item.actor)}</h2><p>${escapeHtml(item.title)}</p></div><div class="coverage-points">${item.checkpoints.map((point) => `<span class="coverage-point ${classes[point.status]}" data-mark="${marks[point.status]}">${escapeHtml(point.title)}</span>`).join('')}</div><div class="coverage-result"><strong>${item.coverage.verified} / ${item.coverage.total}</strong><span>${item.coverage.failed} failed</span></div></article>`).join('')}</div></section>`;
}

function renderCheckpointPage(point) {
  return `<header class="drilldown-head"><div class="drilldown-copy"><div class="drilldown-eyebrow mono">${escapeHtml(point.label)} · Derived workflows</div><h1>${escapeHtml(point.title)}</h1><p>${escapeHtml(point.description)} Choose a scenario to make its complete test path the primary graph.</p></div><div class="drilldown-stats"><div class="drilldown-stat"><strong>${point.scenarios.length}</strong><span>Workflows</span></div><div class="drilldown-stat"><strong>${point.scenarios.filter((item) => item.status === 'verified').length}</strong><span>Verified</span></div><div class="drilldown-stat"><strong>${point.scenarios.filter((item) => item.status === 'failed').length}</strong><span>Failures</span></div></div></header><div class="drilldown-canvas"><div class="drilldown-caption mono">Derived scenarios · each card opens as its own workflow</div><div class="scenario-workflow-grid">${point.scenarios.length ? point.scenarios.map((item) => `<button class="scenario-workflow" type="button" data-scenario="${escapeHtml(item.id)}"><span class="scenario-workflow-id mono">${escapeHtml(item.id)}</span><span class="scenario-workflow-state ${classes[item.status]}">${labels[item.status]}</span><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.description)}</p></button>`).join('') : '<div class="empty-workflow">No derived workflows begin at this terminal checkpoint.</div>'}</div></div>`;
}

function renderScenarioPage(item) {
  selectedStatus = selectedStatus ?? item.status;
  const statuses = item.status === 'verified' ? ['verified', 'verified', 'verified', 'verified'] : item.status === 'failed' ? ['verified', 'verified', 'failed', 'not_reached'] : ['untested', 'not_reached', 'not_reached', 'not_reached'];
  const path = [item.precondition, item.action, 'Observe the system response', item.expected];
  const nodes = path.map((label, index) => `<div class="path-node ${classes[statuses[index]]}"><span class="path-node-mark">${marks[statuses[index]]}</span><span class="mono">CP 0${index + 1}</span><strong>${escapeHtml(label)}</strong><span>${labels[statuses[index]]}</span></div>${index < 3 ? `<i class="connector ${statuses[index + 1] === 'not_reached' ? 'blocked' : ''}"></i>` : ''}`).join('');
  return `<header class="drilldown-head"><div class="drilldown-copy"><div class="drilldown-eyebrow mono">${escapeHtml(item.id)} · Scenario workflow</div><h1>${escapeHtml(item.title)}</h1><p>${escapeHtml(item.expected)}</p></div><div><div class="status-editor" role="group" aria-label="Scenario result">${['untested', 'verified', 'failed'].map((status) => `<button class="status-choice ${selectedStatus === status ? 'active' : ''}" type="button" data-status="${status}">${labels[status]}</button>`).join('')}<input class="scenario-note" type="text" maxlength="2000" value="${escapeHtml(item.note)}" placeholder="Optional evidence note"><button class="save-state" type="button" data-save-state>Save locally</button></div></div></header><div class="drilldown-canvas"><div class="drilldown-caption mono">Complete test path · first unresolved checkpoint stops everything after it</div><div class="scenario-path">${nodes}</div></div>`;
}

function renderDrilldown() {
  if (!stack.length) return '';
  const current = stack.at(-1);
  const point = checkpoint(stack[0].id);
  const item = current.type === 'scenario' ? scenario(current.id) : null;
  const crumbs = `<button type="button" data-crumb-root>${escapeHtml(workflow().actor)}</button><i>/</i>${item ? `<button type="button" data-crumb-checkpoint>${escapeHtml(point.title)}</button><i>/</i><span>${escapeHtml(item.title)}</span>` : `<span>${escapeHtml(point.title)}</span>`}`;
  return `<section class="drilldown open" aria-hidden="false"><header class="drilldown-bar"><button class="back-button" type="button" data-back><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m12.5 4.5-5 5 5 5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Back</span></button><nav class="breadcrumbs" aria-label="Workflow path">${crumbs}</nav><span class="depth-label mono">Level ${stack.length + 1}</span></header><div class="drilldown-page">${item ? renderScenarioPage(item) : renderCheckpointPage(point)}</div></section>`;
}

function render() {
  app.className = 'app';
  app.innerHTML = `${renderTopbar()}<main class="main">${activeScreen === 'atlas' ? `${renderWorkflowTabs()}<div class="atlas-frame">${renderAtlas()}</div>${renderDrilldown()}` : renderCoverage()}</main>`;
}

async function loadCatalog() {
  const response = await fetch('/api/catalog', { cache: 'no-store' });
  if (!response.ok) throw new Error('Unable to load the local workflow catalog.');
  catalog = await response.json();
  activeWorkflowId = activeWorkflowId ?? catalog.workflows[0]?.id;
  render();
}

async function saveScenarioState() {
  const current = stack.at(-1);
  if (current?.type !== 'scenario') return;
  const note = document.querySelector('.scenario-note')?.value ?? '';
  const response = await fetch(`/api/scenarios/${encodeURIComponent(current.id)}/status`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: selectedStatus, note }) });
  if (!response.ok) throw new Error((await response.json()).error ?? 'Unable to save local scenario state.');
  catalog = await response.json();
  selectedStatus = null;
  render();
}

app.addEventListener('click', async (event) => {
  const button = event.target.closest('button');
  if (!button || !catalog) return;
  try {
    if (button.dataset.screen) { activeScreen = button.dataset.screen; stack = []; render(); }
    else if (button.dataset.workflow) { activeWorkflowId = button.dataset.workflow; stack = []; render(); }
    else if (button.dataset.checkpoint) { stack = [{ type: 'checkpoint', id: button.dataset.checkpoint }]; selectedStatus = null; render(); }
    else if (button.dataset.scenario) { stack.push({ type: 'scenario', id: button.dataset.scenario }); selectedStatus = null; render(); }
    else if (button.hasAttribute('data-back')) { stack.pop(); selectedStatus = null; render(); }
    else if (button.hasAttribute('data-crumb-root')) { stack = []; selectedStatus = null; render(); }
    else if (button.hasAttribute('data-crumb-checkpoint')) { stack = stack.slice(0, 1); selectedStatus = null; render(); }
    else if (button.dataset.status) { selectedStatus = button.dataset.status; document.querySelectorAll('.status-choice').forEach((item) => item.classList.toggle('active', item.dataset.status === selectedStatus)); }
    else if (button.hasAttribute('data-save-state')) await saveScenarioState();
    else if (button.hasAttribute('data-regenerate')) await loadCatalog();
    else if (button.hasAttribute('data-theme-toggle')) { const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = next; localStorage.setItem('scenario-atlas-theme', next); }
  } catch (error) {
    window.alert(error instanceof Error ? error.message : 'Scenario Atlas failed.');
  }
});

document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && stack.length) { stack.pop(); selectedStatus = null; render(); } });
document.documentElement.dataset.theme = localStorage.getItem('scenario-atlas-theme') === 'dark' ? 'dark' : 'light';
loadCatalog().catch((error) => { app.className = 'error-state'; app.textContent = error instanceof Error ? error.message : 'Scenario Atlas failed to start.'; });
