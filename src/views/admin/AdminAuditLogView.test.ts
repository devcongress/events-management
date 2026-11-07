import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';
import { createRenderer, nextTick, ssrContextKey } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';

const routeState = vi.hoisted(() => ({
  push: vi.fn(),
  route: null as null | { path: string; query: Record<string, string> },
}));

vi.mock('vue-router', async (importOriginal) => {
  const { reactive } = await import('vue');

  routeState.route = reactive({ path: '/organizer-console/audit-log', query: { month: '2026-11' } });

  return {
    ...await importOriginal<typeof import('vue-router')>(),
    useRoute: () => routeState.route,
    useRouter: () => ({ push: routeState.push }),
  };
});

vi.mock('@/src/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/src/lib/api')>();
  const pending = () => new Promise<never>(() => undefined);

  return {
    ...actual,
    fetchAdminAuditLog: vi.fn(pending),
    fetchAdminShortLinks: vi.fn(pending),
    fetchAdminArchivedEvents: vi.fn(pending),
    regenerateAdminShortLink: vi.fn(async () => ({ url: 'https://example.test/s/new' })),
    revokeAdminShortLink: vi.fn(async () => ({})),
  };
});

import AdminAuditLogView from './AdminAuditLogView.vue';
import { regenerateAdminShortLink, revokeAdminShortLink } from '@/src/lib/api';

type TestNode = { children: TestNode[]; parent: TestNode | null };
const node = (): TestNode => ({ children: [], parent: null });
const renderer = createRenderer<TestNode, TestNode>({
  createElement: node,
  createText: node,
  createComment: node,
  setText: () => {},
  setElementText: () => {},
  patchProp: () => {},
  parentNode: item => item.parent,
  nextSibling: () => null,
  insert(child, parent) { child.parent = parent; parent.children.push(child); },
  remove: () => {},
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('audit short-link menu actions', () => {
  it('uses the selected link ID after closing the menu for both actions', async () => {
    vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() });
    vi.stubGlobal('document', { addEventListener: vi.fn(), removeEventListener: vi.fn() });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const app = renderer.createApp({ ...AdminAuditLogView, render: () => null });

    app.use(VueQueryPlugin, { queryClient });
    app.provide(ssrContextKey, {});
    const instance = app.mount(node());
    const internal = instance.$ as unknown as { setupState: {
      openShortLinkMenuId: string | null;
      selectedAuditLogId: string | null;
      activeSection: string;
      filters: { action: string };
      manageShortLink: (action: 'regenerate' | 'revoke') => void;
      selectSection: (section: string) => void;
    } };
    const state = internal.setupState;

    state.openShortLinkMenuId = 'link-regenerate';
    state.manageShortLink('regenerate');
    expect(state.openShortLinkMenuId).toBeNull();
    await vi.waitFor(() => expect(vi.mocked(regenerateAdminShortLink).mock.calls[0]?.[0]).toBe('link-regenerate'));

    state.openShortLinkMenuId = 'link-revoke';
    state.manageShortLink('revoke');
    expect(state.openShortLinkMenuId).toBeNull();
    await vi.waitFor(() => expect(vi.mocked(revokeAdminShortLink).mock.calls[0]?.[0]).toBe('link-revoke'));

    state.manageShortLink('revoke');
    expect(revokeAdminShortLink).toHaveBeenCalledTimes(1);

    state.filters.action = 'event.updated';
    state.selectSection('short-links');
    expect(routeState.push).toHaveBeenCalledWith({ path: '/organizer-console/audit-log', query: { month: '2026-11', section: 'short-links' } });
    state.openShortLinkMenuId = 'link-revoke';
    state.selectedAuditLogId = 'audit-entry';
    routeState.route!.query.section = 'short-links';
    await nextTick();
    expect(state.activeSection).toBe('short-links');
    expect(state.openShortLinkMenuId).toBeNull();
    expect(state.selectedAuditLogId).toBeNull();
    expect(state.filters.action).toBe('event.updated');
    routeState.route!.query.section = 'activity';
    await nextTick();
    expect(state.activeSection).toBe('activity');
    app.unmount();
    queryClient.clear();
  });
});
