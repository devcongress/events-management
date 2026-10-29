import { readFileSync } from 'node:fs';
import { compile, createRenderer, h, nextTick, ssrContextKey, type Component } from 'vue';
import { compileScript, parse } from 'vue/compiler-sfc';
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchAnnualConferenceTicketEmailDeliveries, fetchJson, retryAnnualConferenceTicketEmailDelivery } from './lib/api';
import { navigateDropdown } from './lib/dropdown-keyboard';
import AnnualConferenceRegistrationEmails from './components/AnnualConferenceRegistrationEmails.vue';
import AnnualConferenceCommunityTickets from './components/AnnualConferenceCommunityTickets.vue';

type DropdownControl = {
  props: { modelValue: string | number; label: string; options: Array<{ value: string | number; label: string }>; disabled?: boolean; teleport?: boolean; density?: string };
  choose: (value: string | number) => void;
};

const { dropdowns } = vi.hoisted(() => ({ dropdowns: new Map<string, DropdownControl>() }));

vi.mock('./lib/api', async importOriginal => ({
  ...await importOriginal<typeof import('./lib/api')>(),
  fetchAnnualConferenceTicketEmailDeliveries: vi.fn(),
  fetchJson: vi.fn(),
  retryAnnualConferenceTicketEmailDelivery: vi.fn(),
}));
vi.mock('./components/AppDropdown.vue', () => ({ default: {
  props: { modelValue: [String, Number], options: Array, label: String, disabled: Boolean, teleport: Boolean, density: String },
  emits: ['update:modelValue'],
  setup(props: DropdownControl['props'], { emit }: { emit: (name: string, value: string | number) => void }) {
    dropdowns.set(props.label, { props, choose: value => emit('update:modelValue', value) });

    return () => h('button', { 'data-dropdown': props.label, disabled: props.disabled, 'aria-haspopup': 'listbox' },
      props.options.find(option => option.value === props.modelValue)?.label);
  },
} }));
vi.mock('./components/ui/BoneyardPageSkeleton.vue', () => ({ default: { render: () => null } }));
vi.mock('./components/RegistrationEmailDrawer.vue', () => ({ default: { render: () => null } }));
vi.mock('./components/AppPagination.vue', () => ({ default: {
  props: ['page', 'pageCount'],
  emits: ['update:page'],
  setup(props: { page: number; pageCount: number }, { emit }: { emit: (name: string, value: number) => void }) {
    return () => h('button', { 'aria-label': 'Next page', disabled: props.page >= props.pageCount, onClick: () => emit('update:page', props.page + 1) }, 'Next page');
  },
} }));

interface TestNode {
  tag: string;
  text: string;
  props: Record<string, unknown>;
  children: TestNode[];
  parent: TestNode | null;
  close: () => void;
  addEventListener: () => void;
}

function node(tag: string, text = ''): TestNode {
  return { tag, text, props: {}, children: [], parent: null, close: vi.fn(), addEventListener: vi.fn() };
}

function remove(child: TestNode): void {
  if (!child.parent) return;

  const children = child.parent.children;

  children.splice(children.indexOf(child), 1);
  child.parent = null;
}

const body = node('body');
const renderer = createRenderer<TestNode, TestNode>({
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
    const element = node('#static', content);

    element.parent = parent;
    parent.children.push(element);

    return [element, element];
  },
});

function descendants(element: TestNode): TestNode[] {
  return [element, ...element.children.flatMap(descendants)];
}

function text(element: TestNode): string {
  return element.text + element.children.map(text).join('');
}

const cleanup: Array<() => void> = [];

beforeEach(() => {
  vi.stubGlobal('document', { activeElement: null });
  dropdowns.clear();
  vi.mocked(fetchAnnualConferenceTicketEmailDeliveries).mockReset();
  vi.mocked(retryAnnualConferenceTicketEmailDelivery).mockReset();
  vi.mocked(fetchJson).mockReset();
  vi.mocked(fetchAnnualConferenceTicketEmailDeliveries).mockImplementation(async (_year, input) => ({
    deliveries: [], total: 24, page: input?.page ?? 1, page_size: 8,
    summary: { queued: 0, sending: 0, accepted: 0, delivered: 0, failed: 0 },
  }));
  vi.mocked(fetchJson).mockResolvedValue({ purchases: [], next_offset: 25 });
});

afterEach(() => {
  cleanup.splice(0).forEach(unmount => unmount());
  body.children = [];
  vi.unstubAllGlobals();
});

async function mount(component: Component, file: string, props: Record<string, unknown> = { year: '2026' }) {
  const { descriptor } = parse(readFileSync(new URL(file, import.meta.url), 'utf8'));
  const bindings = compileScript(descriptor, { id: 'conference-filter-test' }).bindings;
  const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, gcTime: Infinity, retry: false } } });
  // The runtime compiler accepts JavaScript; the SFC's offset assertion is type-only.
  const template = descriptor.template!.content.replaceAll('next_offset!', 'next_offset');
  const app = renderer.createApp({ ...component, render: compile(template, { bindingMetadata: bindings, prefixIdentifiers: true }) }, props);
  const root = node('root');

  app.use(VueQueryPlugin, { queryClient });
  app.provide(ssrContextKey, {});
  const instance = app.mount(root);

  cleanup.push(() => { app.unmount(); queryClient.clear(); });
  await vi.waitFor(() => expect(dropdowns.size).toBe(1));

  const internal = instance.$ as unknown as { setupState: { busy: boolean } };

  return { root, state: internal.setupState };
}

describe('Conference shared filter dropdowns', () => {
  it('keeps every email status and resets pagination when the selected status changes', async () => {
    const { root } = await mount(AnnualConferenceRegistrationEmails, './components/AnnualConferenceRegistrationEmails.vue');
    const dropdown = dropdowns.get('Delivery status')!;

    expect(dropdown.props.options).toEqual([
      { value: 'all', label: 'All emails' },
      { value: 'queued', label: 'Queued' },
      { value: 'sending', label: 'Sending' },
      { value: 'accepted', label: 'Accepted by provider' },
      { value: 'delivered', label: 'Delivered' },
      { value: 'failed', label: 'Failed' },
    ]);
    expect(dropdown.props.teleport).toBe(true);
    expect(dropdown.props.density).toBeUndefined();
    const next = descendants(root).find(element => element.props['aria-label'] === 'Next page')!;

    (next.props.onClick as () => void)();
    await vi.waitFor(() => expect(fetchAnnualConferenceTicketEmailDeliveries).toHaveBeenLastCalledWith('2026', expect.objectContaining({ page: 2, status: undefined })));
    dropdown.choose('failed');
    await vi.waitFor(() => expect(fetchAnnualConferenceTicketEmailDeliveries).toHaveBeenLastCalledWith('2026', expect.objectContaining({ page: 1, status: 'failed' })));
    expect(text(root)).toContain('Failed');
    dropdown.choose('all');
    await nextTick();
    expect(dropdown.props.modelValue).toBe('all');
    expect(retryAnnualConferenceTicketEmailDelivery).not.toHaveBeenCalled();
  });

  it('preserves the guest drawer filter and ignores values outside the delivery status union', async () => {
    await mount(AnnualConferenceRegistrationEmails, './components/AnnualConferenceRegistrationEmails.vue', { year: '2026', registrationId: 'guest-id' });
    const dropdown = dropdowns.get('Delivery status')!;

    dropdown.choose(7);
    dropdown.choose('unrecognized');
    await nextTick();
    expect(dropdown.props.modelValue).toBe('all');
    dropdown.choose('delivered');
    await vi.waitFor(() => expect(fetchAnnualConferenceTicketEmailDeliveries).toHaveBeenLastCalledWith('2026', expect.objectContaining({ registrationId: 'guest-id', status: 'delivered', page: 1 })));
  });

  it('keeps payment mode labels, changes only the read filter and resets the purchase offset', async () => {
    const { root, state } = await mount(AnnualConferenceCommunityTickets, './components/AnnualConferenceCommunityTickets.vue');
    const dropdown = dropdowns.get('Payment mode')!;

    expect(dropdown.props.options).toEqual([{ value: 'live', label: 'Live purchases' }, { value: 'test', label: 'Test purchases' }]);
    expect(dropdown.props.teleport).toBe(true);
    expect(dropdown.props.disabled).toBe(false);
    expect(dropdown.props.density).toBeUndefined();
    await vi.waitFor(() => expect(text(root)).toContain('Next'));
    const next = descendants(root).find(element => element.tag === 'button' && text(element) === 'Next')!;

    (next.props.onClick as () => void)();
    await vi.waitFor(() => expect(fetchJson).toHaveBeenLastCalledWith(expect.stringContaining('mode=live&offset=25'), { credentials: 'include' }));
    dropdown.choose('test');
    await vi.waitFor(() => expect(fetchJson).toHaveBeenLastCalledWith(expect.stringContaining('mode=test&offset=0'), { credentials: 'include' }));
    expect(text(root)).toContain('Test purchases');
    dropdown.choose(7);
    dropdown.choose('invalid');
    await nextTick();
    expect(dropdown.props.modelValue).toBe('test');
    state.busy = true;
    await nextTick();
    expect(dropdown.props.disabled).toBe(true);
    dropdown.choose('live');
    await nextTick();
    expect(dropdown.props.modelValue).toBe('test');
    expect(vi.mocked(fetchJson).mock.calls.every(([, init]) => !init?.method || init.method === 'GET')).toBe(true);
  });
});

describe('Shared filter keyboard navigation', () => {
  it('moves between enabled choices and restores the trigger when Escape closes the listbox', () => {
    const options = Array.from({ length: 3 }, () => ({ focus: vi.fn() }));
    const close = vi.fn();
    const trigger = { focus: vi.fn() } as unknown as HTMLElement;
    const panel = { querySelectorAll: () => options } as unknown as HTMLElement;
    const event = (key: string) => ({ key, preventDefault: vi.fn(), stopPropagation: vi.fn() }) as unknown as KeyboardEvent;

    vi.stubGlobal('document', { activeElement: options[0] });
    navigateDropdown(event('ArrowDown'), panel, close, trigger);
    expect(options[1].focus).toHaveBeenCalledOnce();
    navigateDropdown(event('End'), panel, close, trigger);
    expect(options[2].focus).toHaveBeenCalledOnce();
    navigateDropdown(event('Escape'), panel, close, trigger);
    expect(close).toHaveBeenCalledOnce();
    expect(trigger.focus).toHaveBeenCalledOnce();
  });
});
