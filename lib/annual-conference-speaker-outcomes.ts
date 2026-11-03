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

export function isLegacyDefaultAcceptance(message: SpeakerOutcomeMessage): boolean {
  if (message.kind === 'acceptance'
    && message.subject === 'You’re in! Your DevCon {year} proposal has been accepted'
    && message.message === 'Hi {first_name},\n\nCongratulations! Your proposal “{talk_title}” has been accepted for DevCon {year}, the DevCongress annual conference. We’re excited to have you present.\n\nYour session\nFormat: {session_format}\nDuration: {session_duration}\nDate: {conference_date}\nVenue: {conference_venue}\n\nPlease confirm your participation and share your materials using your private speaker form by {deadline}:\n{workspace_url}\n\nYou can also share an optional headshot link and social handle in the form, and let us know about any equipment or accessibility support you need. You can return to the form to update your details. Please keep your private link to yourself.\n\nIf you have questions, reply to this email.\n\nWarmly,\nDevCon {year} organizing team\nDevCongress\nhttps://devcongress.org\nevents@devcongress.org') return true;

  return message.kind === 'acceptance'
    && message.subject === 'Your {edition} proposal has been accepted'
    && message.message === 'Hi {first_name},\n\nGreat news! Your proposal “{talk_title}” has been accepted for {edition}.\n\nPlease use your private workspace to keep your logistics up to date by {deadline}:\n{workspace_url}\n\nPlease do not forward this private link.';
}

export function defaultSpeakerOutcomeMessage(editionId: string, kind: AnnualConferenceEmailKind): SpeakerOutcomeMessage {
  return kind === 'acceptance'
    ? { edition_id: editionId, kind, version: 0, subject: 'You’re in! Your DevCon {year} proposal has been accepted', message: 'Hi {first_name},\n\nCongratulations! Your proposal “{talk_title}” has been accepted for DevCon {year}, the DevCongress annual conference. We’re excited to have you present.\n\nYour session\nFormat: {session_format}\nDuration: {session_duration}\nDate: {conference_date}\nVenue: {conference_venue}\n\nUse your private link to confirm your availability, upload your slides or share a resource link, and tell us about any equipment or accessibility needs. Please send your details by {deadline}.\n{workspace_url}\n\nYou can also add a headshot link and social handle. Keep this link private and use it again whenever you need to update your details.\n\nIf you have questions, reply to this email.\n\nWarmly,\nDevCon {year} organizing team\nDevCongress\nhttps://devcongress.org\nevents@devcongress.org' }
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
  year?: string;
  sessionFormat?: string;
  sessionDuration?: string;
  conferenceDate?: string;
  conferenceVenue?: string;
}): { subject: string; html: string; text: string } {
  const values: Record<string, string> = {
    first_name: input.speakerName.trim().split(/\s+/)[0] || 'there',
    talk_title: input.talkTitle,
    edition: input.edition,
    deadline: input.deadline,
    workspace_url: input.workspaceUrl,
    year: input.year ?? '',
    session_format: input.sessionFormat ?? 'To be confirmed',
    session_duration: input.sessionDuration ?? 'To be confirmed',
    conference_date: input.conferenceDate ?? 'To be confirmed',
    conference_venue: input.conferenceVenue ?? 'To be confirmed',
  };
  const personalize = (value: string) => value.replace(/\{(first_name|talk_title|edition|deadline|workspace_url|year|session_format|session_duration|conference_date|conference_venue)\}/g, (_, key: string) => values[key]);
  const subject = personalize(input.template.subject).replace(/[\r\n]+/g, ' ');
  const text = personalize(input.template.message);
  const primaryButton = input.workspaceUrl
    ? `<a href="${escapeHtml(input.workspaceUrl)}" style="display:inline-block;white-space:nowrap;margin:8px 0 2px;padding:12px 18px;background-color:#F5E642;border:1px solid #111111;border-radius:8px;color:#111111;-webkit-text-fill-color:#111111;font-weight:700;line-height:20px;text-decoration:none;">Open private link &rarr;</a>`
    : '';
  const contactButtons: Record<string, [string, string]> = {
    'https://devcongress.org': ['https://devcongress.org', 'Website'],
    'events@devcongress.org': ['mailto:events@devcongress.org', 'Email organizers'],
  };
  const contentHtml = text.replaceAll('\r\n', '\n').split('\n\n').map((paragraph) => {
    const lines = paragraph.split('\n');
    const content = lines.map((line, index) => {
      const contact = Object.hasOwn(contactButtons, line.trim()) && contactButtons[line.trim()];

      if (contact) {
        return `<a href="${contact[0]}" class="email-copy" style="display:inline-block;white-space:nowrap;margin:4px 4px 4px 0;padding:9px 14px;border:1px solid #888888;border-radius:6px;color:#444444;font-size:14px;font-weight:600;text-decoration:none;">${contact[1]}</a>`;
      }
      if (index === 0 && line === 'Your session') return '<strong>Your session</strong>';

      const safe = escapeHtml(line);

      return input.workspaceUrl ? safe.split(escapeHtml(input.workspaceUrl)).join(primaryButton) : safe;
    }).map((html, index) => {
      if (!index) return html;
      const adjacentContacts = Object.hasOwn(contactButtons, lines[index - 1].trim()) && Object.hasOwn(contactButtons, lines[index].trim());

      return (adjacentContacts ? '' : '<br>') + html;
    }).join('');

    return `<p class="email-copy" style="margin:0 0 20px;color:#444;font-size:16px;line-height:1.65;overflow-wrap:anywhere;">${content}</p>`;
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

export async function getSpeakerOutcomePreviewRecipient(id: string, editionId: string, actorId: string, recipientId: string): Promise<PreviewRecipient | undefined> {
  let preview: OutcomePreview | undefined;

  if (isSupabaseRuntimeEnabled()) {
    const result = await getSupabaseAdminClient().from('annual_conference_speaker_outcome_previews' as never).select('*').eq('id', id).eq('edition_id', editionId).eq('actor_id', actorId).maybeSingle() as unknown as { data: OutcomePreview | null; error: unknown };

    if (result.error) throw new Error('Unable to load the outcome preview.');
    preview = result.data ?? undefined;
  } else {
    const records = await readData<OutcomePreview>('annual-conference-speaker-outcome-previews');

    preview = records.find((record) => record.id === id && record.edition_id === editionId && record.actor_id === actorId);
  }

  if (!preview || preview.used_at || new Date(preview.expires_at).getTime() <= Date.now()) return undefined;

  return preview.recipients.find((recipient) => recipient.id === recipientId);
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
        || !link || link.revoked_at
        || link.edition_id !== editionId || link.speaker_submission_id !== item.id || link.expires_at !== item.link_expires_at
) throw new Error('The preview expired or its audience changed. Preview again.');
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
