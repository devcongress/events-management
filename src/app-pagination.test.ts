import { createSSRApp, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { describe, expect, it } from 'vitest';
import AppPagination from './components/AppPagination.vue';

async function renderPagination(props: Record<string, unknown>) {
  return renderToString(createSSRApp({ render: () => h(AppPagination, { page: 1, rangeStart: 1, rangeEnd: 25, ...props }) }));
}

describe('AppPagination', () => {
  it('hides a single known or unknown page', async () => {
    expect(await renderPagination({ page: 1, pageCount: 1, total: 10 })).not.toContain('<nav');
    expect(await renderPagination({ page: 1, hasNext: false })).not.toContain('<nav');
  });

  it('shows unknown-total navigation without inventing a last page', async () => {
    const first = await renderPagination({ page: 1, hasNext: true, disabled: true });
    const last = await renderPagination({ page: 2, hasNext: false });

    expect(first).toContain('Page 1');
    expect(first).not.toContain('of 2');
    expect((first.match(/ disabled/g) ?? []).length).toBe(2);
    expect(last).toContain('Page 2');
    expect((last.match(/ disabled/g) ?? []).length).toBe(1);
  });
});
