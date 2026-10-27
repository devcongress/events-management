import type { Context } from 'hono';

import { toEventBlast } from '@/lib/supabase/event-blasts';
import { getSupabaseAdminClient } from '@/lib/supabase/server';
import type { EventBlast } from '@/types';

export type VolunteerBroadcastRecipient = {
  recipient_id: string;
  decision_version: number;
  name: string;
  email: string;
};

export type VolunteerBroadcastPreview = {
  id: string;
  campaignId: string;
  subject: string;
  body: string;
  scheduledFor: string | null;
  recipients: VolunteerBroadcastRecipient[];
  recipientCount: number;
  renderedHtml: string;
  renderedText: string;
  templateVersion: string;
  expiresAt: string;
  confirmedBlastId: string | null;
};

function previewFromRow(row: {
  id: string;
  campaign_id: string;
  subject: string;
  body: string;
  scheduled_for: string | null;
  recipients: unknown;
  recipient_count: number;
  rendered_html: string;
  rendered_text: string;
  template_version: string;
  expires_at: string;
  confirmed_blast_id: string | null;
}): VolunteerBroadcastPreview {
  if (!Array.isArray(row.recipients)) throw new Error('Volunteer broadcast preview recipients are invalid.');

  return {
    id: row.id,
    campaignId: row.campaign_id,
    subject: row.subject,
    body: row.body,
    scheduledFor: row.scheduled_for,
    recipients: row.recipients as VolunteerBroadcastRecipient[],
    recipientCount: row.recipient_count,
    renderedHtml: row.rendered_html,
    renderedText: row.rendered_text,
    templateVersion: row.template_version,
    expiresAt: row.expires_at,
    confirmedBlastId: row.confirmed_blast_id,
  };
}

export async function createVolunteerBroadcastPreview(input: {
  campaignId: string;
  recipientIds: string[];
  subject: string;
  body: string;
  scheduledFor: string | null;
  renderedHtml: string;
  renderedText: string;
  templateVersion: string;
  actorEmail: string;
}, c?: Context): Promise<VolunteerBroadcastPreview> {
  const { data, error } = await getSupabaseAdminClient(c).rpc(
    'create_volunteer_follow_up_broadcast_preview',
    {
      p_campaign_id: input.campaignId,
      p_recipient_ids: input.recipientIds,
      p_subject: input.subject,
      p_body: input.body,
      p_scheduled_for: input.scheduledFor,
      p_rendered_html: input.renderedHtml,
      p_rendered_text: input.renderedText,
      p_template_version: input.templateVersion,
      p_actor: input.actorEmail,
    },
  );

  if (error) throw new Error(error.message);
  const row = data[0];

  if (!row) throw new Error('Unable to create volunteer broadcast preview.');

  return previewFromRow(row);
}

export async function readVolunteerBroadcastPreview(input: {
  previewId: string;
  actorEmail: string;
}, c?: Context): Promise<VolunteerBroadcastPreview | null> {
  const { data, error } = await getSupabaseAdminClient(c)
    .from('volunteer_follow_up_broadcast_previews')
    .select('*')
    .eq('id', input.previewId)
    .eq('created_by', input.actorEmail.toLowerCase())
    .maybeSingle();

  if (error) throw new Error(error.message);

  return data ? previewFromRow(data) : null;
}

export async function confirmVolunteerBroadcastPreview(input: {
  previewId: string;
  actorEmail: string;
}, c?: Context): Promise<EventBlast> {
  const { data, error } = await getSupabaseAdminClient(c).rpc(
    'confirm_volunteer_follow_up_broadcast_preview',
    { p_preview_id: input.previewId, p_actor: input.actorEmail },
  );

  if (error) throw new Error(error.message);
  const row = data[0];

  if (!row) throw new Error('Unable to confirm volunteer broadcast preview.');

  return toEventBlast(row);
}
