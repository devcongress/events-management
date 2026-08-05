import { VueQueryPlugin, QueryClient } from '@tanstack/vue-query';
import { createRenderer, ssrContextKey } from 'vue';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/src/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/src/lib/api')>();
  const pending = () => new Promise<never>(() => undefined);

  return {
    ...actual,
    fetchAdminOrganizers: vi.fn(pending),
    fetchAdminSession: vi.fn(pending),
    fetchAnnualConferenceAccess: vi.fn(pending),
    fetchAnnualConferenceEditions: vi.fn(pending),
  };
});

import AdminOrganizersView from './AdminOrganizersView.vue';

interface TestNode {
  children: TestNode[];
  parent: TestNode | null;
  text?: string;
  type: string;
}

function node(type: string, text?: string): TestNode {
  return { children: [], parent: null, text, type };
}

const renderer = createRenderer<TestNode, TestNode>({
  patchProp: () => undefined,
  insert(child, parent, anchor) {
    child.parent = parent;
    const anchorIndex = anchor ? parent.children.indexOf(anchor) : -1;
    if (anchorIndex >= 0) parent.children.splice(anchorIndex, 0, child);
    else parent.children.push(child);
  },
  remove(child) {
    if (!child.parent) return;
    const index = child.parent.children.indexOf(child);
    if (index >= 0) child.parent.children.splice(index, 1);
    child.parent = null;
  },
  createElement: (type) => node(type),
  createText: (text) => node('text', text),
  createComment: (text) => node('comment', text),
  setText(target, text) {
    target.text = text;
  },
  setElementText(target, text) {
    target.text = text;
    target.children = [];
  },
  parentNode: (target) => target.parent,
  nextSibling(target) {
    if (!target.parent) return null;
    const index = target.parent.children.indexOf(target);
    return target.parent.children[index + 1] ?? null;
  },
  querySelector: () => null,
  setScopeId: () => undefined,
  cloneNode: (target) => ({ ...target, children: [...target.children], parent: null }),
  insertStaticContent(content, parent, anchor) {
    const target = node('static', content);
    target.parent = parent;
    const anchorIndex = anchor ? parent.children.indexOf(anchor) : -1;
    if (anchorIndex >= 0) parent.children.splice(anchorIndex, 0, target);
    else parent.children.push(target);
    return [target, target];
  },
});

describe('AdminOrganizersView', () => {
  it('mounts before the authenticated role queries resolve', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const app = renderer.createApp(AdminOrganizersView);
    app.use(VueQueryPlugin, { queryClient });
    app.provide(ssrContextKey, { modules: new Set<string>() });
    app.config.warnHandler = () => undefined;

    expect(() => app.mount(node('root'))).not.toThrow();

    app.unmount();
    queryClient.clear();
  });
});
