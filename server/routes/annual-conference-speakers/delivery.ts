import type { Context } from 'hono';
import type { AnnualConferenceSpeakerSubmission } from '@/lib/annual-conference-speakers';
import { updateAnnualConferenceSpeakerIntakeLink } from '@/lib/annual-conference-speakers';
import { recordResendEmailHealth } from '@/lib/email/delivery-health';
import { sendResendEmailBatch, ResendBatchError } from '@/lib/email/resend';
import { EMAIL_SENDERS } from '@/lib/email/scenarios';
import { conferenceSpeakerAcceptanceEmail } from '@/lib/email/templates/conference-speaker-acceptance';
import { envValue } from '@/server/env';
import { publicAppOrigin } from '@/server/http/public-app-origin';

export async function deliverAnnualConferenceWorkspaceEmail(c: Context, input: {
  editionLabel: string;
  editionYear: number;
  deadline: string;
  submission: AnnualConferenceSpeakerSubmission;
  linkId: string;
  token: string;
}): Promise<'accepted' | 'failed'> {
  const privateUrl = new URL(
    `/conference-speakers/${input.editionYear}/${input.token}`,
    publicAppOrigin(c),
  ).toString();
  const content = conferenceSpeakerAcceptanceEmail({
    editionLabel: input.editionLabel,
    speakerName: input.submission.speaker_name,
    talkTitle: input.submission.title,
    privateUrl,
    deadline: input.deadline,
  });

  try {
    const result = await sendResendEmailBatch({
      apiKey: envValue('RESEND_API_KEY', c)!.trim(),
      idempotencyKey: `conference-speaker-accepted-${input.linkId}`,
      emails: [{
        from: EMAIL_SENDERS.speakers.from,
        to: [input.submission.speaker_email],
        reply_to: envValue('SPEAKER_EMAIL_REPLY_TO', c)!.trim(),
        ...content,
      }],
    });
    await recordResendEmailHealth(c, result.quota);
    await updateAnnualConferenceSpeakerIntakeLink(input.linkId, {
      email_status: 'accepted',
      email_provider_id: result.ids[0] ?? null,
      email_sent_at: new Date().toISOString(),
      email_last_error: null,
    });
    return 'accepted';
  } catch (error) {
    await updateAnnualConferenceSpeakerIntakeLink(input.linkId, {
      email_status: 'failed',
      email_last_error: 'The email provider did not accept this delivery.',
    });
    console.warn(JSON.stringify({
      event: 'annual_conference_speaker_acceptance_email_failed',
      submission_id: input.submission.id,
      provider_status: error instanceof ResendBatchError ? error.status : null,
    }));
    return 'failed';
  }
}
