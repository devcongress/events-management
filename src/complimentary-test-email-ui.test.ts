import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';
import { createRenderer, nextTick, ssrContextKey } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ComplimentaryTickets from './components/AnnualConferenceComplimentaryTickets.vue';
import { fetchJson } from './lib/api';
import { notify } from './lib/notify';

vi.mock('./lib/api', () => ({ fetchJson: vi.fn(), fetchAnnualConferenceSponsorAllocations: vi.fn(async () => ({ allocations: [] })) }));
vi.mock('./lib/notify', () => ({ notify: { success: vi.fn() } }));

type Node = { children: Node[]; parent: Node | null };
const node = (): Node => ({ children: [], parent: null });
const renderer = createRenderer<Node, Node>({
  createElement: node, createText: node, createComment: node,
  setText: () => {}, setElementText: () => {}, patchProp: () => {},
  parentNode: item => item.parent, nextSibling: () => null,
  insert(child, parent) { child.parent = parent; parent.children.push(child); }, remove: () => {},
});

const cleanup: Array<() => void> = [];

afterEach(() => {
  cleanup.splice(0).forEach(stop => stop());
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

function mount() {
  vi.stubGlobal('HTMLElement', class {});
  vi.stubGlobal('document', { activeElement: null, body: { style: {} }, documentElement: { style: {} }, querySelector: () => null, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.mocked(fetchJson).mockImplementation(async (url) => String(url).endsWith('/send-test') ? { accepted: true, recipient: 'test@example.com' } : { tickets: [], supporters: [], has_more: false });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const app = renderer.createApp({ ...ComplimentaryTickets, render: () => null }, { year: '2026', active: true });

  app.use(VueQueryPlugin, { queryClient });
  app.provide(ssrContextKey, {});
  const instance = app.mount(node());

  cleanup.push(() => { app.unmount(); queryClient.clear(); });
  const state = (instance.$ as unknown as { setupState: Record<string, any> }).setupState;

  state.guests = [{ name: 'Guest', email: 'guest@example.com' }];
  state.testRecipient = 'test@example.com';
  state.preview = { subject: 'Preview', html: '' };
  state.drawerMode = 'review';
  state.drawerOpen = true;

  return state;
}

describe('complimentary test email feedback', () => {
  it('sends a standalone sample without requiring or changing a ticket draft', async () => {
    const state = mount();

    state.guests = [{ name: '', email: '' }];
    state.reason = '';
    state.preview = null;
    state.drawerMode = 'test';
    await state.sendTest();
    expect(fetchJson).toHaveBeenCalledWith(expect.stringMatching(/\/send-test$/), expect.objectContaining({
      body: expect.any(String),
    }));
    const sendCall = vi.mocked(fetchJson).mock.calls.find(([url]) => String(url).endsWith('/send-test'));
    const body = JSON.parse(String(sendCall?.[1]?.body));

    expect(body.guest).toEqual({ name: 'DevCon Guest', email: 'test@example.com' });
    expect(body.recipient).toBe('test@example.com');
    expect(state.preview).toBeNull();
    expect(state.reason).toBe('');
    expect(state.drawerOpen).toBe(false);
  });

  it('closes after acceptance, records session status and retains the draft', async () => {
    const state = mount();
    const originalKey = state.testKey;

    await state.sendTest();
    await nextTick();
    expect(state.testing).toBe(false);
    expect(state.drawerOpen).toBe(false);
    expect(state.preview.subject).toBe('Preview');
    expect(state.guests[0].email).toBe('guest@example.com');
    expect(state.testKey).not.toBe(originalKey);
    expect(state.recentTests).toEqual([expect.objectContaining({ recipient: 'test@example.com' })]);
    expect(notify.success).toHaveBeenCalledWith('Test email accepted for test@example.com.');
  });

  it('keeps the drawer and request key on a configuration failure', async () => {
    const state = mount();
    const originalKey = state.testKey;

    vi.mocked(fetchJson).mockRejectedValueOnce(new Error('Test email sending is not configured.'));
    await state.sendTest();
    expect(state.drawerOpen).toBe(true);
    expect(state.testing).toBe(false);
    expect(state.testKey).toBe(originalKey);
    expect(state.testMessage).toBe('Test email sending is not configured.');
    expect(state.recentTests).toEqual([]);
    expect(notify.success).not.toHaveBeenCalled();
  });
});
