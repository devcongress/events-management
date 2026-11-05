import crypto from 'node:crypto';
import { readData, updateData } from '@/lib/mock-db';
import { getSupabaseAdminClient, isSupabaseRuntimeEnabled } from '@/lib/supabase/server';
import type { SpeakerUpdateCampaign, SpeakerUpdatePreview, SpeakerUpdateRecipient } from '@/lib/annual-conference-speaker-updates';

export type SpeakerUpdateDelivery = {
  id: string;
  update_id: string;
  submission_id: string;
  name: string;
  recipient: string;
  speaker_email: string;
  link_id: string;
  link_expires_at: string;
  provider_payload: SpeakerUpdateRecipient['provider_payload'];
  idempotency_key: string;
  status: string;
  attempt_count: number;
  provider_id: string | null;
  last_error: string | null;
};

type State = { id: string; campaigns: SpeakerUpdateCampaign[]; previews: SpeakerUpdatePreview[]; deliveries: SpeakerUpdateDelivery[] };
const FILE = 'annual-conference-speaker-updates';
const empty = (): State => ({ id: 'state', campaigns: [], previews: [], deliveries: [] });

async function state(): Promise<State> {
  return (await readData<State>(FILE))[0] ?? empty();
}

async function mutate<T>(fn: (current: State) => { state: State; result: T }): Promise<T> {
  return updateData<State, T>(FILE, (records) => {
    const next = fn(records[0] ?? empty());

    return { data: [next.state], result: next.result };
  });
}

export async function listSpeakerUpdates(editionId: string): Promise<SpeakerUpdateCampaign[]> {
  if (!isSupabaseRuntimeEnabled()) return (await state()).campaigns.filter((item) => item.edition_id === editionId);
  const result = await getSupabaseAdminClient().from('annual_conference_speaker_updates' as never).select('*').eq('edition_id', editionId).order('created_at', { ascending: false });

  if (result.error) throw new Error('Unable to load speaker updates.');

  return result.data as unknown as SpeakerUpdateCampaign[];
}

export async function getSpeakerUpdate(editionId: string, id: string): Promise<SpeakerUpdateCampaign | undefined> {
  return (await listSpeakerUpdates(editionId)).find((item) => item.id === id);
}

export async function saveSpeakerUpdate(editionId: string, input: { id?: string; subject: string; message: string; version?: number }): Promise<SpeakerUpdateCampaign | undefined> {
  const now = new Date().toISOString();

  if (!isSupabaseRuntimeEnabled()) return mutate((current) => {
    const existing = input.id ? current.campaigns.find((item) => item.id === input.id && item.edition_id === editionId) : undefined;

    if (input.id && (!existing || existing.state !== 'draft' || existing.version !== input.version)) return { state: current, result: undefined };
    const campaign: SpeakerUpdateCampaign = existing
      ? { ...existing, subject: input.subject, message: input.message, version: existing.version + 1, updated_at: now }
      : { id: crypto.randomUUID(), edition_id: editionId, subject: input.subject, message: input.message, state: 'draft', version: 1, created_at: now, updated_at: now };

    return { state: { ...current, campaigns: [...current.campaigns.filter((item) => item.id !== campaign.id), campaign] }, result: campaign };
  });
  const client = getSupabaseAdminClient();
  const result = input.id
    ? await client.from('annual_conference_speaker_updates' as never).update({ subject: input.subject, message: input.message, version: (input.version ?? 0) + 1, updated_at: now } as never).eq('id', input.id).eq('edition_id', editionId).eq('state', 'draft').eq('version', input.version!).select('*').maybeSingle()
    : await client.from('annual_conference_speaker_updates' as never).insert({ edition_id: editionId, subject: input.subject, message: input.message } as never).select('*').single();

  if (result.error) throw new Error('Unable to save speaker update.');

  return (result.data as unknown as SpeakerUpdateCampaign | null) ?? undefined;
}

export async function listSpeakerUpdateDeliveries(updateId: string): Promise<SpeakerUpdateDelivery[]> {
  if (!isSupabaseRuntimeEnabled()) return (await state()).deliveries.filter((item) => item.update_id === updateId);
  const result = await getSupabaseAdminClient().from('annual_conference_speaker_update_deliveries' as never).select('*').eq('update_id', updateId);

  if (result.error) throw new Error('Unable to load speaker update deliveries.');

  return result.data as unknown as SpeakerUpdateDelivery[];
}

export async function saveSpeakerUpdatePreview(preview: SpeakerUpdatePreview): Promise<void> {
  if (!isSupabaseRuntimeEnabled()) {
    await mutate((current) => ({ state: { ...current, previews: [...current.previews.filter((item) => item.used_at || Date.parse(item.expires_at) > Date.now()), preview] }, result: undefined }));

    return;
  }
  const cleanup = await getSupabaseAdminClient().from('annual_conference_speaker_update_previews' as never).delete().is('used_at', null).lt('expires_at', new Date().toISOString());

  if (cleanup.error) throw new Error('Unable to remove expired speaker update previews.');
  const result = await getSupabaseAdminClient().from('annual_conference_speaker_update_previews' as never).insert(preview as never);

  if (result.error) throw new Error('Unable to save speaker update preview.');
}

export async function getSpeakerUpdatePreview(id: string, updateId: string, editionId: string, actorId: string): Promise<SpeakerUpdatePreview | undefined> {
  let preview: SpeakerUpdatePreview | undefined;

  if (!isSupabaseRuntimeEnabled()) preview = (await state()).previews.find((item) => item.id === id && item.update_id === updateId && item.edition_id === editionId && item.actor_id === actorId);
  else {
    const result = await getSupabaseAdminClient().from('annual_conference_speaker_update_previews' as never).select('*').eq('id', id).eq('update_id', updateId).eq('edition_id', editionId).eq('actor_id', actorId).maybeSingle();

    if (result.error) throw new Error('Unable to load speaker update preview.');
    preview = (result.data as unknown as SpeakerUpdatePreview | null) ?? undefined;
  }

  return preview;
}

export async function suppressedSpeakerUpdateEmails(emails: string[]): Promise<Set<string>> {
  if (!isSupabaseRuntimeEnabled()) return new Set((await readData<{ email: string }>('annual-conference-email-suppressions')).map((item) => item.email));
  const result = await getSupabaseAdminClient().from('annual_conference_email_suppressions' as never).select('email').in('email', emails);

  if (result.error) throw new Error('Unable to check email suppressions.');

  return new Set((result.data as unknown as { email: string }[]).map((item) => item.email));
}

export async function queueSpeakerUpdate(preview: SpeakerUpdatePreview): Promise<number> {
  if (isSupabaseRuntimeEnabled()) {
    const result = await getSupabaseAdminClient().rpc('queue_annual_conference_speaker_update' as never, { p_preview_id: preview.id, p_update_id: preview.update_id, p_edition_id: preview.edition_id, p_actor_id: preview.actor_id } as never);

    if (result.error) throw new Error('The preview expired or its audience changed. Preview again.');

    return result.data as unknown as number;
  }

  return mutate((current) => {
    const stored = current.previews.find((item) => item.id === preview.id && item.update_id === preview.update_id && item.edition_id === preview.edition_id && item.actor_id === preview.actor_id);
    const campaign = current.campaigns.find((item) => item.id === preview.update_id && item.edition_id === preview.edition_id);

    if (stored?.used_at) return { state: current, result: stored.queued_count ?? 0 };
    if (!stored || Date.parse(stored.expires_at) <= Date.now() || !campaign || campaign.state !== 'draft' || campaign.version !== stored.version) throw new Error('The preview expired or its audience changed. Preview again.');
    const now = new Date().toISOString();
    const deliveries = stored.recipients.map((item) => ({ id: crypto.randomUUID(), update_id: stored.update_id, submission_id: item.id, name: item.name, recipient: item.recipient, speaker_email: item.speaker_email, link_id: item.link_id, link_expires_at: item.link_expires_at, provider_payload: item.provider_payload, idempotency_key: item.key, status: 'queued', attempt_count: 0, provider_id: null, last_error: null }));

    return { state: { ...current, campaigns: current.campaigns.map((item) => item.id === campaign.id ? { ...item, state: 'queued', updated_at: now } : item), previews: current.previews.map((item) => item.id === stored.id ? { ...item, recipients: [], used_at: now, queued_count: deliveries.length } : item), deliveries: [...current.deliveries, ...deliveries] }, result: deliveries.length };
  });
}
