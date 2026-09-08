import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import AdminShortLinksState from './components/admin/AdminShortLinksState.vue';

function renderState(props: {
  error: string;
  pending: boolean;
  statusFilter: 'active' | 'revoked';
  totalCount: number;
  visibleCount: number;
}) {
  const component = AdminShortLinksState as typeof AdminShortLinksState & {
    ssrRender: (
      context: typeof props & {
        $props: typeof props;
        $slots: Record<string, (...args: unknown[]) => void>;
      },
      push: (chunk: string) => void,
      parent: unknown,
      attrs: Record<string, unknown>,
      componentProps: typeof props,
      setup: Record<string, unknown>,
      data: Record<string, unknown>,
      options: Record<string, unknown>,
    ) => void;
  };
  let html = '';
  component.ssrRender({
    ...props,
    $props: props,
    $slots: {
      default: (_slotProps: unknown, push: unknown) => {
        if (typeof push === 'function') push('<table data-testid="registry-table"></table>');
      },
    },
  }, (chunk) => { html += chunk; }, null, {}, props, {}, {}, {});
  return html;
}

describe('short-link registry states', () => {
  it('keeps state-row styling with the scoped child component', () => {
    const source = readFileSync(
      fileURLToPath(new URL('./components/admin/AdminShortLinksState.vue', import.meta.url)),
      'utf8',
    );

    expect(source).toMatch(/<style scoped>[\s\S]*\.audit-log-delivery-history__empty\s*\{/);
    expect(source).toContain('padding: 1.5rem;');
  });

  it('renders a failed request as an alert instead of an empty registry', async () => {
    const html = renderState({
      error: 'Unable to load short links.',
      pending: false,
      statusFilter: 'active',
      totalCount: 0,
      visibleCount: 0,
    });

    expect(html).toContain('role="alert"');
    expect(html).toContain('Unable to load short links.');
    expect(html).not.toContain('No open public forms are ready for a flyer link.');
    expect(html).not.toContain('data-testid="registry-table"');
  });

  it('renders the empty state only after a successful zero-link response', async () => {
    const html = renderState({
      error: '',
      pending: false,
      statusFilter: 'active',
      totalCount: 0,
      visibleCount: 0,
    });

    expect(html).toContain('No open public forms are ready for a flyer link.');
    expect(html).not.toContain('role="alert"');
    expect(html).not.toContain('data-testid="registry-table"');
  });

  it('renders the registry content only for a successful non-empty result', async () => {
    const html = renderState({
      error: '',
      pending: false,
      statusFilter: 'active',
      totalCount: 2,
      visibleCount: 2,
    });

    expect(html).toContain('data-testid="registry-table"');
    expect(html).not.toContain('role="alert"');
  });
});
