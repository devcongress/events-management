import { readData, updateData } from './index';
import type { QuizParticipant } from '@/types';
import type { Database } from '@/types/supabase';
import { generateId, now } from '@/lib/utils';
import { getSupabaseAdminClient, isSupabaseRuntimeEnabled } from '@/lib/supabase/server';
import { participantDisplayNameKey } from '@/lib/system-design-participant-identity';

const FILE = 'quiz-participants';
type QuizParticipantRow = Database['public']['Tables']['quiz_participants']['Row'];
type QuizParticipantUpdate = Partial<Omit<QuizParticipant, 'id' | 'joined_at' | 'nickname_used'>>;

export class QuizParticipantNicknameTakenError extends Error {
  constructor() {
    super('That name is already in use in this room.');
    this.name = 'QuizParticipantNicknameTakenError';
  }
}

function fromSupabaseRow(row: QuizParticipantRow): QuizParticipant {
  return {
    id: row.id,
    quiz_session_id: row.quiz_session_id,
    user_id: row.user_id,
    nickname_used: row.nickname_used,
    total_score: row.total_score,
    current_streak: row.current_streak,
    joined_at: row.joined_at,
  };
}

export async function getAllQuizParticipants(): Promise<QuizParticipant[]> {
  if (isSupabaseRuntimeEnabled()) {
    const { data, error } = await getSupabaseAdminClient()
      .from('quiz_participants')
      .select('*')
      .order('joined_at', { ascending: true });

    if (error) throw new Error('Unable to load quiz participants');
    return (data ?? []).map(fromSupabaseRow);
  }

  return readData<QuizParticipant>(FILE);
}

export async function getQuizParticipantById(id: string): Promise<QuizParticipant | undefined> {
  if (isSupabaseRuntimeEnabled()) {
    const { data, error } = await getSupabaseAdminClient()
      .from('quiz_participants')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw new Error('Unable to load quiz participant');
    return data ? fromSupabaseRow(data) : undefined;
  }

  const participants = await readData<QuizParticipant>(FILE);
  return participants.find((participant) => participant.id === id);
}

export async function getQuizParticipantsBySession(sessionId: string): Promise<QuizParticipant[]> {
  if (isSupabaseRuntimeEnabled()) {
    const { data, error } = await getSupabaseAdminClient()
      .from('quiz_participants')
      .select('*')
      .eq('quiz_session_id', sessionId)
      .order('joined_at', { ascending: true });

    if (error) throw new Error('Unable to load room participants');
    return (data ?? []).map(fromSupabaseRow);
  }

  const participants = await readData<QuizParticipant>(FILE);
  return participants.filter((participant) => participant.quiz_session_id === sessionId);
}

export async function getQuizParticipantBySessionAndUser(
  sessionId: string,
  userId: string,
): Promise<QuizParticipant | undefined> {
  if (isSupabaseRuntimeEnabled()) {
    const { data, error } = await getSupabaseAdminClient()
      .from('quiz_participants')
      .select('*')
      .eq('quiz_session_id', sessionId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw new Error('Unable to load quiz participant');
    return data ? fromSupabaseRow(data) : undefined;
  }

  const participants = await readData<QuizParticipant>(FILE);
  return participants.find((participant) => (
    participant.quiz_session_id === sessionId && participant.user_id === userId
  ));
}

export async function createQuizParticipant(
  data: Omit<QuizParticipant, 'id' | 'joined_at' | 'total_score' | 'current_streak'>,
  options: { enforceUniqueName?: boolean } = {},
): Promise<QuizParticipant> {
  const newParticipant: QuizParticipant = {
    ...data,
    id: generateId(),
    total_score: 0,
    current_streak: 0,
    joined_at: now(),
  };

  if (isSupabaseRuntimeEnabled()) {
    const { data: stored, error } = await getSupabaseAdminClient()
      .from('quiz_participants')
      .insert({
        id: newParticipant.id,
        quiz_session_id: newParticipant.quiz_session_id,
        user_id: newParticipant.user_id,
        nickname_used: newParticipant.nickname_used,
        enforce_unique_name: options.enforceUniqueName ?? false,
        total_score: newParticipant.total_score,
        current_streak: newParticipant.current_streak,
        joined_at: newParticipant.joined_at,
      })
      .select('*')
      .single();

    if (error?.code === '23505') {
      const existing = await getQuizParticipantBySessionAndUser(data.quiz_session_id, data.user_id);
      if (existing) return existing;
      if (options.enforceUniqueName) throw new QuizParticipantNicknameTakenError();
    }
    if (error || !stored) throw new Error('Unable to join this quiz room');
    return fromSupabaseRow(stored);
  }

  return updateData<QuizParticipant, QuizParticipant>(FILE, (participants) => {
    const existing = participants.find((participant) => (
      participant.quiz_session_id === data.quiz_session_id && participant.user_id === data.user_id
    ));
    if (existing) return { data: participants, result: existing };

    if (options.enforceUniqueName) {
      const nicknameKey = participantDisplayNameKey(data.nickname_used);
      const nicknameTaken = participants.some((participant) => (
        participant.quiz_session_id === data.quiz_session_id
        && participantDisplayNameKey(participant.nickname_used) === nicknameKey
      ));
      if (nicknameTaken) throw new QuizParticipantNicknameTakenError();
    }

    return {
      data: [...participants, newParticipant],
      result: newParticipant,
    };
  });
}

export async function updateQuizParticipant(
  id: string,
  updates: QuizParticipantUpdate,
): Promise<QuizParticipant> {
  if (isSupabaseRuntimeEnabled()) {
    const { data, error } = await getSupabaseAdminClient()
      .from('quiz_participants')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single();

    if (error || !data) throw new Error(`Quiz participant ${id} not found`);
    return fromSupabaseRow(data);
  }

  return updateData<QuizParticipant, QuizParticipant>(FILE, (participants) => {
    const index = participants.findIndex((participant) => participant.id === id);
    if (index === -1) throw new Error(`Quiz participant ${id} not found`);

    const updated = { ...participants[index]!, ...updates };
    participants[index] = updated;
    return { data: participants, result: updated };
  });
}

export async function renameQuizParticipant(
  id: string,
  sessionId: string,
  nickname: string,
): Promise<{ participant: QuizParticipant | null; nicknameTaken: boolean }> {
  if (isSupabaseRuntimeEnabled()) {
    const { data, error } = await getSupabaseAdminClient()
      .from('quiz_participants')
      .update({
        nickname_used: nickname,
      })
      .eq('id', id)
      .eq('quiz_session_id', sessionId)
      .select('*')
      .maybeSingle();

    if (error?.code === '23505') return { participant: null, nicknameTaken: true };
    if (error) throw new Error('Unable to update participant name');
    return {
      participant: data ? fromSupabaseRow(data) : null,
      nicknameTaken: false,
    };
  }

  return updateData<QuizParticipant, { participant: QuizParticipant | null; nicknameTaken: boolean }>(FILE, (participants) => {
    const index = participants.findIndex((participant) => (
      participant.id === id && participant.quiz_session_id === sessionId
    ));
    if (index === -1) return { data: participants, result: { participant: null, nicknameTaken: false } };

    const nicknameKey = participantDisplayNameKey(nickname);
    const nicknameTaken = participants.some((participant, participantIndex) => (
      participantIndex !== index
      && participant.quiz_session_id === sessionId
      && participantDisplayNameKey(participant.nickname_used) === nicknameKey
    ));
    if (nicknameTaken) return { data: participants, result: { participant: null, nicknameTaken: true } };

    const renamed = { ...participants[index]!, nickname_used: nickname };
    participants[index] = renamed;
    return { data: participants, result: { participant: renamed, nicknameTaken: false } };
  });
}

export async function deleteQuizParticipant(id: string): Promise<void> {
  if (isSupabaseRuntimeEnabled()) {
    const { error } = await getSupabaseAdminClient()
      .from('quiz_participants')
      .delete()
      .eq('id', id);

    if (error) throw new Error('Unable to delete quiz participant');
    return;
  }

  await updateData<QuizParticipant, void>(FILE, (participants) => ({
    data: participants.filter((participant) => participant.id !== id),
    result: undefined,
  }));
}

export async function deleteQuizParticipantsBySession(sessionId: string): Promise<number> {
  if (isSupabaseRuntimeEnabled()) {
    const { data, error } = await getSupabaseAdminClient()
      .from('quiz_participants')
      .delete()
      .eq('quiz_session_id', sessionId)
      .select('id');

    if (error) throw new Error('Unable to clear room participants');
    return data?.length ?? 0;
  }

  return updateData<QuizParticipant, number>(FILE, (participants) => {
    const retained = participants.filter((participant) => participant.quiz_session_id !== sessionId);
    return {
      data: retained,
      result: participants.length - retained.length,
    };
  });
}

export async function mergeQuizParticipantUsers(targetUserId: string, sourceUserId: string): Promise<void> {
  if (isSupabaseRuntimeEnabled()) {
    const { error } = await getSupabaseAdminClient().rpc('merge_quiz_participant_users', {
      p_target_user_id: targetUserId,
      p_source_user_id: sourceUserId,
    });
    if (error) throw new Error('Unable to merge quiz participant history');
    return;
  }

  await updateData<QuizParticipant, void>(FILE, (participants) => {
    const participantBySession = new Map<string, QuizParticipant>();
    const retained: QuizParticipant[] = [];

    for (const participant of participants) {
      if (participant.user_id === targetUserId) {
        participantBySession.set(participant.quiz_session_id, participant);
        retained.push(participant);
      } else if (participant.user_id !== sourceUserId) {
        retained.push(participant);
      }
    }

    for (const participant of participants) {
      if (participant.user_id !== sourceUserId) continue;

      const targetParticipant = participantBySession.get(participant.quiz_session_id);
      if (targetParticipant) {
        targetParticipant.total_score += participant.total_score;
        targetParticipant.current_streak = Math.max(targetParticipant.current_streak, participant.current_streak);
      } else {
        const reassigned = { ...participant, user_id: targetUserId };
        participantBySession.set(participant.quiz_session_id, reassigned);
        retained.push(reassigned);
      }
    }

    return { data: retained, result: undefined };
  });
}
