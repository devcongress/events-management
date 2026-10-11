import { readFileSync } from 'node:fs';
import { compile, createRenderer, nextTick, ssrContextKey } from 'vue';
import { compileScript, parse } from 'vue/compiler-sfc';
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';
import { describe, expect, it, vi } from 'vitest';
import type { Devcon26TestCheckoutLedgerRow, Devcon26TestCouponsResponse } from '@/lib/devcon26-test-coupons';
import { fetchDevcon26TestCoupons } from './lib/api';
import Devcon26TestCoupons from './components/Devcon26TestCoupons.vue';

vi.mock('./lib/api', async (importOriginal) => ({
  ...await importOriginal<typeof import('./lib/api')>(),
  fetchDevcon26TestCoupons: vi.fn(),
}));
vi.mock('./components/AppDropdown.vue', () => ({ default: { render: () => null } }));
vi.mock('./components/ui/AppDatePicker.vue', () => ({ default: { render: () => null } }));
vi.mock('./components/ui/AppCopyButton.vue', () => ({ default: { render: () => null } }));

// Vitest's Node transform emits an SSR template; compile the same source for mounted events.
const { descriptor } = parse(readFileSync(new URL('./components/Devcon26TestCoupons.vue', import.meta.url), 'utf8'));
const bindings = compileScript(descriptor, { id: 'checkout-pagination-test' }).bindings;
const mountedComponent = {
  ...Devcon26TestCoupons,
  render: compile(descriptor.template!.content, { bindingMetadata: bindings, prefixIdentifiers: true }),
};

interface TestNode {
  tag: string;
  tagName: string;
  text: string;
  props: Record<string, unknown>;
  children: TestNode[];
  parent: TestNode | null;
  addEventListener: () => void;
}

function node(tag: string, text = ''): TestNode {
  return {
    tag,
    tagName: tag.toUpperCase(),
    text,
    props: {},
    children: [],
    parent: null,
    addEventListener: () => {},
  };
}

function insert(child: TestNode, parent: TestNode, anchor?: TestNode | null) {
  remove(child);
  child.parent = parent;
  const index = anchor ? parent.children.indexOf(anchor) : -1;

  parent.children.splice(index < 0 ? parent.children.length : index, 0, child);
}

function remove(child: TestNode) {
  if (!child.parent) return;
  const siblings = child.parent.children;

  siblings.splice(siblings.indexOf(child), 1);
  child.parent = null;
}

// A minimal Vue host tests real component events and query updates without a DOM dependency.
const renderer = createRenderer<TestNode, TestNode>({
  createElement: (tag) => node(tag),
  createText: (text) => node('#text', text),
  createComment: (text) => node('#comment', text),
  setText: (element, text) => { element.text = text; },
  setElementText: (element, text) => {
    element.text = text;
    element.children = [];
  },
  patchProp: (element, key, _previous, value) => { element.props[key] = value; },
  parentNode: (element) => element.parent,
  nextSibling: (element) => {
    const siblings = element.parent?.children ?? [];

    return siblings[siblings.indexOf(element) + 1] ?? null;
  },
  insert,
  remove,
  insertStaticContent: (content, parent, anchor) => {
    const element = node('#static', content);

    insert(element, parent, anchor);

    return [element, element];
  },
});

function descendants(root: TestNode): TestNode[] {
  return [root, ...root.children.flatMap(descendants)];
}

function textContent(root: TestNode): string {
  return root.text + root.children.map(textContent).join('');
}

function fixture(index: number): Devcon26TestCheckoutLedgerRow {
  return {
    id: `checkout-${index}`,
    payment_reference: `devcon26-test-reference-${index}`,
    purchaser_name: null, purchaser_email: null,
    tier_key: 'regular', quantity: 1, coupon_code: null,
    base_amount_minor: 19999, discount_amount_minor: 0, amount_minor: 19999, currency: 'GHS',
    status: 'verified', resolution_reason: null,
    created_at: '2026-10-10T12:00:00Z', expires_at: '2026-10-10T12:15:00Z', verified_at: null,
  };
}

describe('Checkout pagination component interaction', () => {
  it('navigates five-row pages independently and clamps after the checkout total shrinks', async () => {
    let total = 11;
    const fetchMock = vi.mocked(fetchDevcon26TestCoupons);

    fetchMock.mockReset();
    fetchMock.mockImplementation(async (_year, page, checkoutPage): Promise<Devcon26TestCouponsResponse> => ({
      coupons: [], total: 20, page, page_size: 8,
      checkouts: Array.from({ length: total }, (_, index) => fixture(index + 1)).slice((checkoutPage - 1) * 5, checkoutPage * 5),
      checkout_total: total, checkout_page: checkoutPage, checkout_page_size: 5,
    }));
    const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, gcTime: Infinity, retry: false } } });
    const app = renderer.createApp(mountedComponent, { year: '2026' });
    const root = node('root');

    app.use(VueQueryPlugin, { queryClient });
    app.provide(ssrContextKey, {});
    app.mount(root);

    async function assertPage(range: string, expectedRowCount: number) {
      await vi.waitFor(async () => {
        await nextTick();
        expect(textContent(root)).toContain(range);
        const tableBody = descendants(root).find((element) => element.tag === 'tbody');
        const rows = tableBody?.children.filter((element) => element.tag === 'tr') ?? [];

        expect(rows.length).toBe(expectedRowCount);
      });
    }

    function button(label: string) {
      const element = descendants(root).find((candidate) => candidate.tag === 'button' && candidate.props['aria-label'] === label);

      expect(element).toBeDefined();

      return element!;
    }

    function click(label: string) {
      const element = button(label);

      expect(element.props.disabled).toBe(false);
      (element.props.onClick as () => void)();
    }

    try {
      await assertPage('1–5 of 11 · Page 1 of 3', 5);
      expect(button('Previous checkout page').props.disabled).toBe(true);
      click('Next checkout page');
      await assertPage('6–10 of 11 · Page 2 of 3', 5);
      expect(fetchMock).toHaveBeenLastCalledWith('2026', 1, 2);
      click('Next checkout page');
      await assertPage('11–11 of 11 · Page 3 of 3', 1);
      expect(button('Next checkout page').props.disabled).toBe(true);
      click('Previous checkout page');
      await assertPage('6–10 of 11 · Page 2 of 3', 5);

      const couponNext = descendants(root).find((element) => element.tag === 'button' && !element.props['aria-label'] && textContent(element) === 'Next');

      expect(couponNext?.props.disabled).toBe(false);
      (couponNext!.props.onClick as () => void)();
      await vi.waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith('2026', 2, 2));
      await assertPage('6–10 of 11 · Page 2 of 3', 5);
      total = 3;
      await queryClient.invalidateQueries({ queryKey: ['devcon26-test-coupons', '2026'] });
      await assertPage('1–3 of 3 · Page 1 of 1', 3);
      expect(fetchMock).toHaveBeenLastCalledWith('2026', 2, 1);
      expect(button('Previous checkout page').props.disabled).toBe(true);
      expect(button('Next checkout page').props.disabled).toBe(true);
    } finally {
      app.unmount();
      queryClient.clear();
      fetchMock.mockReset();
    }
  });
});
