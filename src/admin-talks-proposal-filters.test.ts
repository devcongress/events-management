import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('./views/admin/AdminTalksView.vue', import.meta.url),
  'utf8',
);

describe('presentation proposal table filters', () => {
  it('shows every proposal by default and uses one status dropdown', () => {
    expect(source).toContain('countSpeakerSubmissionsByReviewStatus');
    expect(source).toContain("const proposalStatusFilter = ref<ProposalStatusFilter>('all')");
    expect(source).toContain("proposalStatusFilter.value === 'all'");
    expect(source).toContain("import AppDropdown from '@/src/components/AppDropdown.vue'");
    expect(source).toContain(':model-value="proposalStatusFilter"');
    expect(source).toContain(':options="proposalStatusOptions"');
    expect(source).toContain('@update:model-value="setProposalStatusFilter"');
    expect(source).toContain('teleport');
    expect(source).not.toContain('<select v-model="proposalStatusFilter"');
    expect(source).not.toContain('v-for="filter in');
  });

  it('keeps the status dropdown above a readable proposal table', () => {
    expect(source).toContain('label="Status"');
    expect(source).toContain('class="flex flex-wrap items-end justify-end gap-2"');
    expect(source).toContain(':class="proposalActionClass(true)"');
    expect(source).toContain('class="min-h-10 disabled:cursor-not-allowed"');
    expect(source).toContain('<table class="w-full min-w-[1080px] table-fixed border-collapse text-left">');
    expect(source).toContain('>Status</th>');
    expect(source).toContain('proposalStatusClass(submission.status)');
    expect(source).toContain('{{ proposalStatusLabel(submission.status) }}');
    expect(source).toContain('colspan="6"');
  });

  it('confirms either final proposal decision before saving it', () => {
    expect(source).toContain("requestProposalDecision(previewProposal, 'selected')");
    expect(source).toContain("requestProposalDecision(previewProposal, 'not_selected')");
    expect(source).toContain('This decision cannot be undone.');
    expect(source).toContain('mobile-sheet');
    expect(source).toContain('@confirm="confirmProposalDecision"');
  });
});
