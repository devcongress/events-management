import { readFileSync } from 'node:fs';
import { compile, createRenderer, nextTick, ssrContextKey } from 'vue';
import { compileScript, parse } from 'vue/compiler-sfc';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SpeakerUpdatesPanel from './components/SpeakerUpdatesPanel.vue';
import { fetchJson } from './lib/api';

vi.mock('./lib/api', () => ({ fetchJson: vi.fn() }));
vi.mock('./lib/notify', () => ({ notify: { error: vi.fn(), success: vi.fn() } }));
vi.mock('./components/AppPagination.vue', () => ({ default: { render: () => null } }));
// Dropdown behavior is covered by browser journeys; this renderer tests the panel state.
vi.mock('./components/AppDropdown.vue', () => ({ default: { render: () => null } }));

type Node = { tag: string; text: string; props: Record<string, unknown>; children: Node[]; parent: Node | null; focus: () => void; addEventListener: () => void };

function node(tag: string, text = ''): Node {
  return { tag, text, props: {}, children: [], parent: null, focus: vi.fn(), addEventListener: vi.fn() };
}

function remove(child: Node) {
  if (!child.parent) return;
  const children = child.parent.children;

  children.splice(children.indexOf(child), 1);
  child.parent = null;
}

const body = node('body');
const renderer = createRenderer<Node, Node>({
  createElement: tag => node(tag),
  createText: text => node('#text', text),
  createComment: text => node('#comment', text),
  setText: (element, text) => { element.text = text; },
  setElementText: (element, text) => { element.text = text; element.children = []; },
  patchProp: (element, key, _previous, value) => { element.props[key] = value; },
  parentNode: element => element.parent,
  nextSibling: element => {
    const siblings = element.parent?.children ?? [];

    return siblings[siblings.indexOf(element) + 1] ?? null;
  },
  querySelector: () => body,
  insert(child, parent, anchor) {
    remove(child);
    child.parent = parent;
    const index = anchor ? parent.children.indexOf(anchor) : -1;

    parent.children.splice(index < 0 ? parent.children.length : index, 0, child);
  },
  remove,
  insertStaticContent(content, parent) {
    const child = node('#static', content);

    child.parent = parent;
    parent.children.push(child);

    return [child, child];
  },
});

function descendants(element: Node): Node[] {
  return [element, ...element.children.flatMap(descendants)];
}

const unmount: Array<() => void> = [];

afterEach(() => {
  unmount.splice(0).forEach(stop => stop());
  body.children = [];
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

async function mount(count: number) {
  const candidates = Array.from({ length: count }, (_, index) => ({ id: String(index), name: `Speaker ${index}`, email: `${index}@example.com`, eligible: index !== 1 }));

  vi.mocked(fetchJson).mockResolvedValue({ campaigns: [], candidates, default_draft: {}, sending_enabled: true });
  vi.stubGlobal('HTMLElement', class {});
  vi.stubGlobal('document', { body: { style: {} }, documentElement: { style: {} }, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  const { descriptor } = parse(readFileSync(new URL('./components/SpeakerUpdatesPanel.vue', import.meta.url), 'utf8'));
  const bindings = compileScript(descriptor, { id: 'speaker-updates-test' }).bindings;
  const app = renderer.createApp({ ...SpeakerUpdatesPanel, render: compile(descriptor.template!.content, { bindingMetadata: bindings, prefixIdentifiers: true }) }, { year: '2026', active: true, configured: true });
  const root = node('root');

  app.provide(ssrContextKey, {});
  const instance = app.mount(root);

  unmount.push(() => app.unmount());
  await vi.waitFor(() => expect(fetchJson).toHaveBeenCalled());
  await nextTick();

  const internal = instance.$ as unknown as { setupState: Record<string, any> };

  return { root, state: internal.setupState };
}

describe('speaker update recipients', () => {
  it('selects eligible speakers across pages, reflects partial selection, and clears all', async () => {
    const { state } = await mount(9);

    state.selectEligible({ target: { checked: true } });
    expect(state.selected).toEqual(['0', '2', '3', '4', '5', '6', '7', '8']);
    expect(state.allEligibleSelected).toBe(true);
    state.page = 2;
    expect(state.visibleCandidates.map((item: { id: string }) => item.id)).toEqual(['6', '7', '8']);
    state.selected = state.selected.filter((id: string) => id !== '7');
    expect(state.partiallySelected).toBe(true);
    expect(state.allEligibleSelected).toBe(false);
    state.clearSelection();
    expect(state.selected).toEqual([]);
    expect(state.partiallySelected).toBe(false);
  });

  it('caps selection at 100 without marking more than 100 eligible speakers as all selected', async () => {
    const { state } = await mount(103);

    state.selectEligible({ target: { checked: true } });
    expect(state.selected).toHaveLength(100);
    expect(state.selected[0]).toBe('0');
    expect(state.selected.at(-1)).toBe('100');
    expect(state.partiallySelected).toBe(true);
    expect(state.allEligibleSelected).toBe(false);
  });

  it('starts locally, copies content, and selects only eligible speakers missing details', async () => {
    const { state } = await mount(3);
    const callsBefore = vi.mocked(fetchJson).mock.calls.length;

    state.candidates[0].missing_workspace_details = ['headshot'];
    state.candidates[1].missing_workspace_details = ['socials'];
    state.campaigns = [{ id: 'prior', subject: 'Previous', message: 'Visit {workspace_url}', state: 'complete', version: 1, created_at: '', updated_at: '' }];
    state.createDraft();
    expect(state.campaign.id).toBe('');
    expect(vi.mocked(fetchJson).mock.calls.length).toBe(callsBefore);
    state.applyStartingPoint('prior');
    expect(state.campaign.subject).toBe('Previous');
    expect(state.campaign.id).toBe('');
    state.setAudience('missing');
    expect(state.selected).toEqual(['0']);
    state.historyFilter = 'sent';
    expect(state.filteredCampaigns.map((item: { id: string }) => item.id)).toEqual(['prior']);
  });

  it('discards a closed draft and resets audience when reopening', async () => {
    const { state } = await mount(2);
    const campaign = { id: 'draft', subject: 'Saved', message: 'Visit {workspace_url}', state: 'draft', version: 1, created_at: '', updated_at: '' };

    vi.stubGlobal('window', { confirm: () => true });
    vi.mocked(fetchJson).mockResolvedValueOnce({ campaign, deliveries: [] });
    await state.openCampaign('draft');
    state.campaign.subject = 'Changed';
    state.audienceMode = 'all';
    state.closeDetails();
    expect(state.campaign).toBeNull();
    vi.mocked(fetchJson).mockResolvedValueOnce({ campaign: { ...campaign, subject: 'Saved' }, deliveries: [] });
    await state.openCampaign('draft');
    expect(state.campaign.subject).toBe('Saved');
    expect(state.audienceMode).toBe('selected');
    expect(state.selected).toEqual([]);
  });

  it('shows draft delivery without repeating the status and preserves delivery counts', async () => {
    const { state } = await mount(2);
    const draft = { state: 'draft' };
    const sent = { state: 'complete', delivery_summary: { total: 2, statuses: { delivered: 1, failed: 1 } } };

    expect(state.historyLabel(draft)).toBe('Draft');
    expect(state.historySummary(draft)).toBe('Not sent');
    expect(state.historyLabel(sent)).toBe('Needs attention');
    expect(state.historySummary(sent)).toBe('2 recipients · 1 delivered, 1 failed');
  });

  it('only renders the test recipient form in test mode', async () => {
    const { state } = await mount(2);

    state.recipients = [{ id: '0', name: 'Speaker', recipient: 'speaker@example.com', subject: 'Update', preview_url: '/api/frozen-preview'  }];
    state.previewId = '0';
    state.drawerOpen = true;
    await nextTick();
    expect(descendants(body).some(element => element.props.id === 'update-test-email')).toBe(false);
    const iframe = descendants(body).find(element => element.tag === 'iframe');

    expect(iframe?.props.src).toBe('/api/frozen-preview');
    expect(iframe?.props.sandbox).toBe('');
    expect(iframe?.props.referrerpolicy).toBe('no-referrer');
    state.testMode = true;
    await nextTick();
    expect(descendants(body).some(element => element.props.id === 'update-test-email')).toBe(true);
    state.testMode = false;
    await nextTick();
    expect(descendants(body).some(element => element.props.id === 'update-test-email')).toBe(false);
  });
});
