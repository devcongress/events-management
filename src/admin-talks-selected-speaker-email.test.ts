import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const viewSource = readFileSync(
  new URL('./views/admin/AdminTalksView.vue', import.meta.url),
  'utf8',
);
const previewSource = readFileSync(
  new URL('./components/ui/SelectedSpeakerEmailPreview.vue', import.meta.url),
  'utf8',
);

describe('selected-speaker email controls', () => {
  it('previews system-generated content before an explicit send', () => {
    expect(viewSource).toContain('/selected-speaker-emails/preview');
    expect(viewSource).toContain('/selected-speaker-emails/send');
    expect(viewSource).toContain('Preview ${selectedSpeakerEmailReadyCount} email');
    expect(viewSource).toContain("'Preview email'");
    expect(viewSource).toContain('@click.stop="previewSelectedSpeakerEmails(submission.id)"');
    expect(viewSource).toContain(':disabled="preparingSelectedSpeakerEmailTarget === submission.id"');
    expect(viewSource).toContain("preparingSelectedSpeakerEmailTarget.value = submissionId ?? 'all'");
    expect(viewSource).toContain('selectedSpeakerEmailReadyCount.value < 2');
    expect(viewSource).toContain('selectedSpeakerEmailReadyCount < 2 || preparingSelectedSpeakerEmailTarget');
    expect(viewSource).toContain('Bulk email preview requires at least two ready emails.');
    expect(viewSource).toContain('selectedSpeakerEmailPreviewController?.abort()');
    expect(viewSource).toContain('submission_ids: selectedSpeakerEmailPreviews.value.map');
    expect(previewSource).toContain('Nothing is sent until you confirm below.');
    expect(previewSource).toContain(':srcdoc="activePreview.html"');
    expect(previewSource).toContain('sandbox=""');
  });

  it('uses prepared short links and has no manual prepare-links action', () => {
    expect(viewSource).toContain('selectedSpeakerLinkForSubmission(submission.id)?.short_url');
    expect(viewSource).not.toMatch(/Prepare \$\{missingSelectedSpeakerLinkCount\}/);
    expect(viewSource).not.toContain('generateSelectedSpeakerLinks');
    expect(viewSource).toContain("previewProposal.status === 'submitted'");
    expect(viewSource).toContain('This decision is final.');
  });
});
