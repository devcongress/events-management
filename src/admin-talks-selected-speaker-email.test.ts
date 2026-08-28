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
const confirmDialogSource = readFileSync(
  new URL('./components/ui/ConfirmDialog.vue', import.meta.url),
  'utf8',
);

describe('selected-speaker email controls', () => {
  it('shows automatic delivery state instead of making selected-speaker email a manual step', () => {
    expect(viewSource).toContain('acceptance email are being sent automatically');
    expect(viewSource).not.toContain('@click.stop="previewSelectedSpeakerEmails(submission.id)"');
    expect(viewSource).not.toContain('@click="previewSelectedSpeakerEmails()"');
    expect(viewSource).toContain(">Sending</span>");
    expect(viewSource).toContain(">Retrying</span>");
    expect(previewSource).toContain('The branded email is only sent after you confirm.');
    expect(previewSource).toContain('aria-describedby="speaker-email-preview-description"');
    expect(previewSource).toContain('{{ activePreview.text }}');
    expect(previewSource).toContain('role="alert"');
    expect(previewSource).toContain(':aria-pressed="activePreview.submission_id === preview.submission_id"');
    expect(previewSource).toContain('activeIndex === -1');
    expect(previewSource).not.toContain('<iframe');
    expect(previewSource).toContain('justify-content: flex-end');
    expect(previewSource).toContain('transform: translate3d(100%, 0, 0)');
    expect(previewSource).toContain('@media (prefers-reduced-motion: reduce)');
    expect(previewSource).toContain('width: 100%');
  });

  it('keeps the owner test action at table level and separate from real speakers', () => {
    expect(viewSource).toContain('/speaker-submissions/test');
    expect(viewSource).toContain('Create test proposal');
    expect(viewSource).toContain('createOwnerTestSpeakerSubmission');
    expect(viewSource).toContain('/selected-speaker-emails/test');
    expect(viewSource).toContain('Send test to me');
    expect(viewSource).toContain("adminSessionQuery.data.value?.user?.role === 'owner'");
    expect(viewSource).toContain('selectedSpeakerTestRequestId.value ??= crypto.randomUUID()');
    expect(viewSource).toContain('body: JSON.stringify({ request_id: selectedSpeakerTestRequestId.value })');
    expect(viewSource).toContain('selectedSpeakerTestRequestId.value = null');
    expect(viewSource).not.toContain('sendSelectedSpeakerTestEmail(submission.id)');
    expect([...viewSource.matchAll(/@click="sendSelectedSpeakerTestEmail"/g)]).toHaveLength(1);
    expect(viewSource.indexOf('@click="sendSelectedSpeakerTestEmail"')).toBeLessThan(viewSource.indexOf('<table class="w-full min-w-[1080px]'));
  });

  it('uses prepared short links and has no manual prepare-links action', () => {
    expect(viewSource).toContain('selectedSpeakerLinkForSubmission(submission.id)?.short_url');
    expect(viewSource).not.toMatch(/Prepare \$\{missingSelectedSpeakerLinkCount\}/);
    expect(viewSource).not.toContain('generateSelectedSpeakerLinks');
    expect(viewSource).toContain("previewProposal.status === 'submitted'");
    expect(viewSource).toContain('This decision is final.');
    expect(viewSource).toContain('Confirming will automatically send the speaker a rejection email.');
    expect(viewSource).toContain("'Rejecting & emailing...'");
    expect(viewSource).toContain('/rejection-email/preview');
    expect(viewSource).toContain('Email sent on confirmation');
    expect(viewSource).toContain(':confirm-disabled="pendingProposalDecision?.status === \'not_selected\' && !speakerRejectionEmailPreview"');
    expect(viewSource).toContain('{{ speakerRejectionEmailPreview.text }}');
    expect(confirmDialogSource).toContain(':disabled="busy || confirmDisabled"');
  });

  it('marks accepted proposal emails as sent in the review table', () => {
    expect(viewSource).toContain('v-if="proposalEmailWasSent(submission)"');
    expect(viewSource).toContain("selectedSpeakerLinkForSubmission(submission.id)?.email_status === 'accepted'");
    expect(viewSource).toContain("submission.decision_email_status === 'accepted'");
    expect(viewSource).toContain(':title="proposalEmailSentTitle(submission)"');
    expect(viewSource).toContain('Sent');
  });
});
