import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { describe, expect, it } from 'vitest';
import AppCopyButton from './AppCopyButton.vue';

async function renderState(state: 'idle' | 'copying' | 'copied') {
  return renderToString(createSSRApp(AppCopyButton, {
    state,
    label: 'Copy public link',
  }));
}

describe('AppCopyButton', () => {
  it('keeps the action name stable while transient states lock repeat clicks', async () => {
    const idle = await renderState('idle');
    const copying = await renderState('copying');
    const copied = await renderState('copied');

    expect(idle).toContain('aria-label="Copy public link"');
    expect(idle).not.toContain(' disabled');
    expect(idle).toContain('role="status"');

    expect(copying).toContain('aria-label="Copy public link"');
    expect(copying).toContain(' disabled');
    expect(copying).toContain('aria-busy="true"');
    expect(copying).toContain('>Copying…</span>');

    expect(copied).toContain('aria-label="Copy public link"');
    expect(copied).toContain(' disabled');
    expect(copied).toContain('>Copied</span>');
  });
});
