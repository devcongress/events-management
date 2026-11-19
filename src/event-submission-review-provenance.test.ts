import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { compile, createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { describe, expect, it } from 'vitest';

const source = readFileSync(fileURLToPath(new URL('./views/admin/AdminEventSubmissionsView.vue', import.meta.url)), 'utf8');
const badge = source.match(/<span v-if="selectedSubmission\.reviewed_via === 'slack_only'" class="submission-compact-badge">Not in EMS<\/span>/)?.[0];

describe('submission reviewer provenance', () => {
  it('renders the existing badge only for Slack-only reviewers', async () => {
    expect(badge).toBeDefined();
    const render = compile(`<div>${badge}</div>`);
    const htmlFor = (reviewedVia: string | null) => renderToString(createSSRApp({ setup: () => ({ selectedSubmission: { reviewed_via: reviewedVia } }), render }));

    expect(await htmlFor('slack_only')).toContain('Not in EMS');
    expect(await htmlFor('slack_ems')).not.toContain('Not in EMS');
    expect(await htmlFor(null)).not.toContain('Not in EMS');
  });
});
