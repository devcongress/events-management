import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FeedbackQuestion } from '@/types';
import { updateSupabaseFeedbackCampaign } from './feedback-campaigns';

const state = vi.hoisted(() => ({
  writes: [] as string[],
  responses: [{ id: 'response-1' }],
  question: { id: 'question-1', type: 'rating', label: 'Session', required: true, options: [], order_index: 0 },
}));

vi.mock('./server', () => ({
  isSupabaseRuntimeEnabled: () => true,
  getSupabaseAdminClient: () => ({
    from(table: string) {
      let updates: Record<string, unknown> = {};
      const query = {
        select: () => query,
        eq: () => query,
        order: async () => ({ data: [state.question], error: null }),
        limit: async () => ({ data: state.responses, error: null }),
        maybeSingle: async () => ({ data: { id: 'campaign-1', event_id: 'event-1', status: 'active' }, error: null }),
        single: async () => ({ data: { id: 'campaign-1', event_id: 'event-1', ...updates }, error: null }),
        update(value: Record<string, unknown>) {
          state.writes.push(`${table}:update`);
          updates = value;

          return query;
        },
        delete() {
          state.writes.push(`${table}:delete`);

          return query;
        },
        insert() {
          state.writes.push(`${table}:insert`);

          return query;
        },
      };

      return query;
    },
  }),
}));

describe('feedback campaign updates after responses', () => {
  beforeEach(() => {
    state.writes.length = 0;
  });

  it('closes a campaign with unchanged questions without rewriting answered questions', async () => {
    const question = state.question as FeedbackQuestion;
    // Different property order must not turn an unchanged question into an edit.
    const questions = [{ order_index: 0, options: [], required: true, label: question.label, type: question.type, id: question.id }];
    const result = await updateSupabaseFeedbackCampaign('event-1', { status: 'closed', questions });

    expect(result?.status).toBe('closed');
    expect(state.writes).toEqual(['feedback_campaigns:update']);
  });

  it('rejects actual question edits before writing campaign metadata', async () => {
    await expect(updateSupabaseFeedbackCampaign('event-1', {
      status: 'closed',
      questions: [{ ...state.question, label: 'Changed' } as FeedbackQuestion],
    })).rejects.toThrow('Feedback questions cannot be changed after responses exist');
    expect(state.writes).toEqual([]);
  });

  it('allows a status-only close after responses', async () => {
    const result = await updateSupabaseFeedbackCampaign('event-1', { status: 'closed' });

    expect(result?.status).toBe('closed');
    expect(state.writes).toEqual(['feedback_campaigns:update']);
  });
});
