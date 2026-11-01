import { readData, updateData } from '@/lib/mock-db';
import { getSupabaseAdminClient, isSupabaseRuntimeEnabled } from '@/lib/supabase/server';
import { renderSpeakerEmailLayout } from '@/lib/email/templates/speaker-email-layout';
import type { AnnualConferenceEmailKind } from '@/lib/annual-conference-speakers';

export type SpeakerOutcomeMessage = {
  edition_id: string;
  kind: AnnualConferenceEmailKind;
  subject: string;
  message: string;
  version: number;
};

const FILE = 'annual-conference-speaker-outcome-messages';

export function defaultSpeakerOutcomeMessage(editionId: string, kind: AnnualConferenceEmailKind): SpeakerOutcomeMessage {
  return kind === 'acceptance'
    ? { edition_id: editionId, kind, version: 0, subject: 'Your {edition} proposal has been accepted', message: 'Hi {first_name},\n\nGreat news! Your proposal “{talk_title}” has been accepted for {edition}.\n\nPlease use your private workspace to keep your logistics up to date by {deadline}:\n{workspace_url}\n\nPlease do not forward this private link.' }
    : { edition_id: editionId, kind, version: 0, subject: 'An update on your {edition} proposal', message: 'Hi {first_name},\n\nThank you for submitting “{talk_title}” for {edition}. After reviewing the programme, we will not be moving forward with this proposal.\n\nWe appreciate the time and thought you put into it and hope you will submit another idea for a future event.' };
}

export async function getSpeakerOutcomeMessage(editionId: string, kind: AnnualConferenceEmailKind): Promise<SpeakerOutcomeMessage> {
  if (isSupabaseRuntimeEnabled()) {
    const result = await getSupabaseAdminClient().from('annual_conference_speaker_outcome_messages' as never).select('*').eq('edition_id', editionId).eq('kind', kind).maybeSingle() as unknown as { data: SpeakerOutcomeMessage | null; error: unknown };

    if (result.error) throw new Error('Unable to load the speaker outcome message.');

    return result.data ?? defaultSpeakerOutcomeMessage(editionId, kind);
  }
  const records = await readData<SpeakerOutcomeMessage>(FILE);

  return records.find((record) => record.edition_id === editionId && record.kind === kind) ?? defaultSpeakerOutcomeMessage(editionId, kind);
}

export async function saveSpeakerOutcomeMessage(input: SpeakerOutcomeMessage): Promise<boolean> {
  if (isSupabaseRuntimeEnabled()) {
    const result = await getSupabaseAdminClient().rpc('save_annual_conference_speaker_outcome_message' as never, {
      p_edition_id: input.edition_id, p_kind: input.kind, p_subject: input.subject,
      p_message: input.message, p_expected_version: input.version,
    } as never) as unknown as { data: boolean; error: unknown };

    if (result.error) throw new Error('Unable to save the speaker outcome message.');

    return result.data;
  }

  return updateData<SpeakerOutcomeMessage, boolean>(FILE, (records) => {
    const index = records.findIndex((record) => record.edition_id === input.edition_id && record.kind === input.kind);

    if ((index < 0 ? 0 : records[index].version) !== input.version) return { data: records, result: false };
    const next = [...records];
    const saved = { ...input, version: input.version + 1 };

    if (index < 0) next.push(saved);
    else next[index] = saved;

    return { data: next, result: true };
  });
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

export function renderSpeakerOutcomeMessage(input: {
  template: SpeakerOutcomeMessage;
  speakerName: string;
  talkTitle: string;
  edition: string;
  deadline: string;
  workspaceUrl: string;
}): { subject: string; html: string; text: string } {
  const values: Record<string, string> = {
    first_name: input.speakerName.trim().split(/\s+/)[0] || 'there',
    talk_title: input.talkTitle,
    edition: input.edition,
    deadline: input.deadline,
    workspace_url: input.workspaceUrl,
  };
  const personalize = (value: string) => value.replace(/\{(first_name|talk_title|edition|deadline|workspace_url)\}/g, (_, key: string) => values[key]);
  const subject = personalize(input.template.subject).replace(/[\r\n]+/g, ' ');
  const text = personalize(input.template.message);
  const contentHtml = text.split('\n\n').map((paragraph) => {
    const safe = escapeHtml(paragraph);
    const linked = input.workspaceUrl
      ? safe.replaceAll(escapeHtml(input.workspaceUrl), `<a href="${escapeHtml(input.workspaceUrl)}">Open your private speaker workspace</a>`)
      : safe;

    return `<p class="email-copy" style="margin:0 0 20px;color:#444;font-size:16px;line-height:1.65;white-space:pre-line;">${linked}</p>`;
  }).join('');

  return {
    subject,
    text,
    html: renderSpeakerEmailLayout({ subject, preheader: subject, brandMeta: ['Annual Conference', 'Speaker outcome'], contentHtml, footerTitle: 'DevCongress Annual Conference', footerCopy: 'Reply to this email if you have a question.' }),
  };
}

type PreviewRecipient = { id: string; key: string; recipient: string; subject: string; html: string; text: string; from: string; replyTo: string; kind: AnnualConferenceEmailKind; deadline: string | null; link_id: string | null; link_expires_at: string | null };
type OutcomePreview = { id: string; edition_id: string; actor_id: string; recipients: PreviewRecipient[]; expires_at: string; used_at: string | null };

export async function saveSpeakerOutcomePreview(preview: OutcomePreview): Promise<void> {
  if (isSupabaseRuntimeEnabled()) {
    const result = await getSupabaseAdminClient().from('annual_conference_speaker_outcome_previews' as never).insert(preview as never);

    if (result.error) throw new Error('Unable to save the outcome preview.');

    return;
  }
  await updateData<OutcomePreview, void>('annual-conference-speaker-outcome-previews', (records) => ({
    data: [...records.filter((record) => new Date(record.expires_at).getTime() > Date.now() && !record.used_at), preview], result: undefined,
  }));
}

export async function queueSpeakerOutcomePreview(id: string, editionId: string, actorId: string): Promise<number> {
  if (isSupabaseRuntimeEnabled()) {
    const result = await getSupabaseAdminClient().rpc('queue_annual_conference_speaker_outcome_preview' as never, {
      p_preview_id: id, p_edition_id: editionId, p_actor_id: actorId,
    } as never) as unknown as { data: number | null; error: { message: string } | null };

    if (result.error) {
      if (result.error.message.includes('speaker_preview_')) throw new Error('The preview expired or its audience changed. Preview again.');

      throw new Error('Unable to queue outcome messages.');
    }

    return result.data ?? 0;
  }

  return updateData<OutcomePreview, number>('annual-conference-speaker-outcome-previews', async (previews) => {
    const preview = previews.find((record) => record.id === id && record.edition_id === editionId && record.actor_id === actorId && !record.used_at && new Date(record.expires_at).getTime() > Date.now());

    if (!preview) throw new Error('The preview expired or its audience changed. Preview again.');
    const editions = await readData<{ id: string; speaker_logistics_deadline: string | null }>('annual-conference-editions');
    const links = await readData<import('@/lib/annual-conference-speakers').AnnualConferenceSpeakerIntakeLink>('annual-conference-speaker-intake-links');
    const edition = editions.find((item) => item.id === editionId);

    for (const item of preview.recipients.filter((recipient) => recipient.kind === 'acceptance')) {
      const link = links.find((candidate) => candidate.id === item.link_id);

      if (!edition?.speaker_logistics_deadline || edition.speaker_logistics_deadline !== item.deadline
        || new Date(edition.speaker_logistics_deadline).getTime() <= Date.now() || !link || link.revoked_at
        || link.edition_id !== editionId || link.speaker_submission_id !== item.id || link.expires_at !== item.link_expires_at
        || new Date(link.expires_at).getTime() <= Date.now()) throw new Error('The preview expired or its audience changed. Preview again.');
    }
    const count = await updateData<import('@/lib/annual-conference-speakers').AnnualConferenceSpeakerSubmission, number>('annual-conference-speaker-submissions', (submissions) => {
      for (const item of preview.recipients) {
        const proposal = submissions.find((submission) => submission.id === item.id);

        if (!proposal || proposal.edition_id !== editionId || !['pending', 'failed'].includes(proposal.decision_email_status ?? '') || proposal.decision_email_attempt_count !== 0
          || proposal.decision_email_queued_at || proposal.decision_email_idempotency_key !== item.key
          || (proposal.decision_email_recipient ?? proposal.speaker_email) !== item.recipient
          || (item.kind === 'acceptance' && (proposal.selected_intake_link_id !== item.link_id || links.find((link) => link.id === item.link_id)?.workspace_session_id !== proposal.selected_session_id))
          || (proposal.status === 'selected' ? proposal.decision_email_kind !== 'acceptance' : proposal.status !== 'not_selected' || proposal.decision_email_kind !== 'rejection')) {
          throw new Error('The preview expired or its audience changed. Preview again.');
        }
      }
      const queuedAt = new Date().toISOString();
      const next = submissions.map((submission) => {
        const item = preview.recipients.find((recipient) => recipient.id === submission.id);

        return item ? { ...submission, decision_email_status: 'pending' as const, decision_email_retryable: true, decision_email_last_error: null, decision_email_queued_at: queuedAt, decision_email_payload: { recipient: item.recipient, subject: item.subject, html: item.html, text: item.text, from: item.from, replyTo: item.replyTo, deadline: item.deadline, linkId: item.link_id, linkExpiresAt: item.link_expires_at } } : submission;
      });

      return { data: next, result: preview.recipients.length };
    });

    return { data: previews.filter((record) => record.id !== id), result: count };
  });
}

export async function purgeExpiredSpeakerOutcomePreviews(): Promise<void> {
  if (isSupabaseRuntimeEnabled()) {
    const result = await getSupabaseAdminClient().from('annual_conference_speaker_outcome_previews' as never).delete().lt('expires_at', new Date().toISOString());

    if (result.error) throw new Error('Unable to remove expired speaker outcome previews.');

    return;
  }
  await updateData<OutcomePreview, void>('annual-conference-speaker-outcome-previews', (records) => ({
    data: records.filter((record) => new Date(record.expires_at).getTime() > Date.now()), result: undefined,
  }));
}
