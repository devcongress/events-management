import { readFileSync } from 'node:fs';
import { compile, createRenderer, nextTick, ssrContextKey, type VNodeChild } from 'vue';
import { compileScript, parse } from 'vue/compiler-sfc';
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchJson } from './lib/api';
import AnnualConferencePaymentModeSettings from './components/AnnualConferencePaymentModeSettings.vue';

vi.mock('./lib/api', async (importOriginal) => ({
  ...await importOriginal<typeof import('./lib/api')>(),
  fetchJson: vi.fn(),
}));
vi.mock('./components/ui/ConfirmDialog.vue', async () => {
  const { h } = await import('vue');

  return { default: {
    props: ['open', 'busy', 'confirmDisabled', 'title', 'message'],
    emits: ['confirm', 'cancel'],
    setup(props: { open: boolean; busy: boolean; confirmDisabled: boolean; title: string; message: string }, context: { emit: (name: string) => void; slots: { default?: () => VNodeChild[] } }) {
      return () => props.open ? h('section', { 'data-review': true }, [
        h('h2', props.title), h('p', props.message), context.slots.default?.(),
        h('button', { 'data-confirm': true, disabled: props.busy || props.confirmDisabled, onClick: () => context.emit('confirm') }, 'Save payment settings'),
        h('button', { 'data-cancel': true, onClick: () => context.emit('cancel') }, 'Cancel'),
      ]) : null;
    },
  } };
});

const source = readFileSync(new URL('./components/AnnualConferencePaymentModeSettings.vue', import.meta.url), 'utf8');
const { descriptor } = parse(source);
const bindings = compileScript(descriptor, { id: 'payment-mode-settings-test' }).bindings;
const mountedComponent = {
  ...AnnualConferencePaymentModeSettings,
  render: compile(descriptor.template!.content, { bindingMetadata: bindings, prefixIdentifiers: true }),
};

interface TestNode {
  tag: string;
  text: string;
  props: Record<string, unknown>;
  children: TestNode[];
  parent: TestNode | null;
}

function node(tag: string, text = ''): TestNode {
  return { tag, text, props: {}, children: [], parent: null };
}

function remove(child: TestNode) {
  if (!child.parent) return;
  const children = child.parent.children;

  children.splice(children.indexOf(child), 1);
  child.parent = null;
}

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

function descendants(root: TestNode): TestNode[] {
  return [root, ...root.children.flatMap(descendants)];
}

function text(root: TestNode): string {
  return root.text + root.children.map(text).join('');
}

function fixture() {
  return {
    payment_mode: 'test' as 'test' | 'live', settings_version: 1, tester_emails: ['tester@example.test'],
    readiness: { test: { ready: true, reasons: [] as string[] }, live: { ready: true, reasons: [] as string[] } },
  };
}

let server = fixture();
const mounted: Array<() => void> = [];

beforeEach(() => {
  server = fixture();
  vi.mocked(fetchJson).mockReset();
  vi.mocked(fetchJson).mockImplementation(async () => structuredClone(server));
  vi.stubGlobal('fetch', vi.fn(async (_url, init: RequestInit) => {
    const payload = JSON.parse(String(init.body));

    server.payment_mode = payload.payment_mode;
    server.tester_emails = payload.tester_emails;
    server.settings_version += 1;

    return Response.json(server);
  }));
});

afterEach(() => {
  mounted.splice(0).forEach((cleanup) => cleanup());
  vi.unstubAllGlobals();
});

async function mountSettings() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, gcTime: Infinity, retry: false } } });
  const app = renderer.createApp(mountedComponent, { year: '2026' });
  const root = node('root');
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

  app.use(VueQueryPlugin, { queryClient });
  app.provide(ssrContextKey, {});
  app.mount(root);
  mounted.push(() => { app.unmount(); queryClient.clear(); });
  await vi.waitFor(() => expect(text(root)).toContain(`Current: ${server.payment_mode === 'live' ? 'Live' : 'Testing'}`));

  function find(predicate: (candidate: TestNode) => boolean) {
    const found = descendants(root).find(predicate);

    expect(found).toBeDefined();

    return found!;
  }

  async function choose(mode: 'test' | 'live') {
    (find((candidate) => candidate.tag === 'input' && candidate.props.value === mode).props.onChange as () => void)();
    await nextTick();
  }

  async function emails(value: string) {
    (find((candidate) => candidate.tag === 'textarea').props.onInput as (event: unknown) => void)({ target: { value } });
    await nextTick();
  }

  async function review() {
    const button = find((candidate) => candidate.tag === 'button' && candidate.props.type === 'submit');

    expect(button.props.disabled).toBe(false);
    (find((candidate) => candidate.tag === 'form').props.onSubmit as (event: unknown) => void)({ preventDefault() {} });
    await nextTick();
  }

  async function confirm() {
    const button = find((candidate) => candidate.props['data-confirm'] === true);

    expect(button.props.disabled).toBe(false);
    (button.props.onClick as () => void)();
    await nextTick();
  }

  return { root, queryClient, invalidate, find, choose, emails, review, confirm };
}

describe('Owner payment-mode settings', () => {
  it('hydrates the saved mode and saves a reviewed mode and normalized email list atomically', async () => {
    const ui = await mountSettings();

    expect(fetchJson).toHaveBeenCalledWith('/api/annual-conference/2026/registrations/payment-mode', { credentials: 'include' });
    await ui.choose('live');
    await ui.emails(' ADA@EXAMPLE.TEST\nada@example.test; second@example.test');
    expect(text(ui.root)).toContain('Current: Testing');
    await ui.review();
    expect(fetch).not.toHaveBeenCalled();
    expect(text(ui.root)).toContain('will charge real money');
    await ui.confirm();
    await vi.waitFor(() => expect(text(ui.root)).toContain('Current: Live'));
    const [url, init] = vi.mocked(fetch).mock.calls[0];

    expect(url).toBe('/api/annual-conference/2026/registrations/payment-mode');
    expect(init).toMatchObject({ method: 'PATCH', credentials: 'include' });
    expect(JSON.parse(String(init!.body))).toEqual({
      payment_mode: 'live', settings_version: 1,
      tester_emails: ['ada@example.test', 'second@example.test'], confirmed: true,
    });
    for (const key of ['conference-payment-mode', 'conference-registration-testing', 'annual-conference-ticketing']) {
      expect(ui.invalidate).toHaveBeenCalledWith({ queryKey: [key, '2026'] });
    }
  });

  it('refuses Live activation when readiness fails and explains the missing configuration', async () => {
    server.readiness.live = { ready: false, reasons: ['Live payment credentials are not configured.'] };
    const ui = await mountSettings();

    await ui.choose('live');
    expect(text(ui.root)).toContain('Live checkout is not ready.');
    expect(text(ui.root)).toContain('Live payment credentials are not configured.');
    expect(ui.find((candidate) => candidate.props.type === 'submit').props.disabled).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('allows revoking all approved testers during a configuration outage while explaining that test checkout stays blocked', async () => {
    server.readiness.test = { ready: false, reasons: ['Test credentials and admission sender are missing.'] };
    server.readiness.live = { ready: false, reasons: ['Live credentials and admission sender are missing.'] };
    const ui = await mountSettings();

    await ui.emails('');
    expect(text(ui.root)).toContain('blocks all test checkout and delivery');
    await ui.review();
    await ui.confirm();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]!.body))).toMatchObject({ payment_mode: 'test', tester_emails: [] });
  });

  it('allows switching from Live to Testing when neither environment is ready', async () => {
    server.payment_mode = 'live';
    server.readiness.test = { ready: false, reasons: ['Test credentials are not configured.'] };
    server.readiness.live = { ready: false, reasons: ['Live credentials are not configured.'] };
    const ui = await mountSettings();

    await ui.choose('test');
    expect(text(ui.root)).toContain('Test checkout is not ready.');
    await ui.review();
    await ui.confirm();
    await vi.waitFor(() => expect(text(ui.root)).toContain('Current: Testing'));
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]!.body))).toEqual({
      payment_mode: 'test', settings_version: 1,
      tester_emails: ['tester@example.test'], confirmed: true,
    });
  });

  it('allows revoking approved testers while staying Live during a readiness outage', async () => {
    server.payment_mode = 'live';
    server.readiness.test = { ready: false, reasons: ['Test credentials are not configured.'] };
    server.readiness.live = { ready: false, reasons: ['Admission delivery is not configured.'] };
    const ui = await mountSettings();

    await ui.emails('');
    expect(text(ui.root)).toContain('Live checkout is not ready.');
    await ui.review();
    expect(text(ui.root)).toContain('Save approved tester emails?');
    expect(text(ui.root)).toContain('The website will stay in Live mode.');
    expect(text(ui.root)).not.toContain('Enable real payments?');
    await ui.confirm();
    await vi.waitFor(() => expect(text(ui.root)).toContain('Payment settings saved.'));
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]!.body))).toEqual({
      payment_mode: 'live', settings_version: 1, tester_emails: [], confirmed: true,
    });
    expect(text(ui.root)).toContain('Current: Live');
  });

  it('disables reviewed Live activation if configuration readiness is lost before confirmation', async () => {
    const ui = await mountSettings();

    await ui.choose('live');
    await ui.review();
    server.readiness.live = { ready: false, reasons: ['Live credentials are no longer configured.'] };
    await ui.queryClient.refetchQueries({ queryKey: ['conference-payment-mode', '2026'] });
    await nextTick();
    expect(ui.find((candidate) => candidate.props['data-confirm'] === true).props.disabled).toBe(true);
    expect(text(ui.root)).toContain('Live credentials are no longer configured.');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('refreshes readiness without misreporting a settings conflict when Live activation is refused', async () => {
    vi.mocked(fetch).mockImplementationOnce(async () => {
      server.readiness.live = { ready: false, reasons: ['Live payment credentials are not configured.'] };

      return Response.json({ error: 'Live payment mode is not ready.', code: 'payment_mode_not_ready' }, { status: 409 });
    });
    const ui = await mountSettings();

    await ui.choose('live');
    await ui.emails('draft@example.test');
    await ui.review();
    await ui.confirm();
    await vi.waitFor(() => expect(text(ui.root)).toContain('Live payments could not be enabled because payment configuration is not ready.'));
    expect(fetchJson).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(text(ui.root)).toContain('Live payment credentials are not configured.');
    expect(text(ui.root)).not.toContain('Payment settings changed.');
    expect(text(ui.root)).toContain('Current: Testing');
    expect(ui.find((candidate) => candidate.tag === 'textarea').props.value).toBe('draft@example.test');
    expect(ui.find((candidate) => candidate.tag === 'input' && candidate.props.value === 'live').props.checked).toBe(true);
    expect(ui.find((candidate) => candidate.props.type === 'submit').props.disabled).toBe(true);
    expect(descendants(ui.root).some((candidate) => candidate.props['data-review'] === true)).toBe(false);
    expect(ui.invalidate).not.toHaveBeenCalled();
  });

  it('preserves the draft on a version conflict and requires a fresh explicit review before retrying', async () => {
    const normalSave = vi.mocked(fetch).getMockImplementation()!;

    vi.mocked(fetch).mockImplementationOnce(async () => {
      server.settings_version = 2;

      return Response.json({ error: 'Settings changed.', code: 'checkout_settings_changed' }, { status: 409 });
    });
    const ui = await mountSettings();

    await ui.choose('live');
    await ui.emails('draft@example.test');
    await ui.review();
    await ui.confirm();
    await vi.waitFor(() => expect(text(ui.root)).toContain('Your draft is preserved.'));
    expect(ui.find((candidate) => candidate.tag === 'textarea').props.value).toBe('draft@example.test');
    expect(ui.find((candidate) => candidate.tag === 'input' && candidate.props.value === 'live').props.checked).toBe(true);
    expect(descendants(ui.root).some((candidate) => candidate.props['data-review'] === true)).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);
    vi.mocked(fetch).mockImplementation(normalSave);
    await ui.review();
    expect(fetch).toHaveBeenCalledTimes(1);
    await ui.confirm();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[1][1]!.body))).toMatchObject({
      payment_mode: 'live', settings_version: 2, tester_emails: ['draft@example.test'],
    });
  });

  it('keeps the saved mode unchanged when the server refuses the update', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ error: 'Permission denied.' }, { status: 403 }));
    const ui = await mountSettings();

    await ui.choose('live');
    await ui.review();
    await ui.confirm();
    await vi.waitFor(() => expect(text(ui.root)).toContain('Permission denied.'));
    expect(text(ui.root)).toContain('Current: Testing');
    expect(ui.invalidate).not.toHaveBeenCalled();
  });

  it('gates paid controls to 2026 Owners and preserves the free-registration testing panel', () => {
    const parent = readFileSync(new URL('./views/admin/AdminAnnualConferenceRegistrationsView.vue', import.meta.url), 'utf8');

    expect(parent).toContain("owner && canManageRegistration && year === '2026' && overview?.mode === 'paid' && activeSection === 'form'");
    expect(parent).toContain("owner && overview?.mode === 'free' && activeSection === 'form'");
    expect(parent).toContain("mutate('/testing'");
    expect(source).not.toMatch(/PAYSTACK_SECRET|sk_live_|sk_test_/);
  });
});
