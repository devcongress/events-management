import { describe, expect, it } from 'vitest';
import { selectedMessagesAreDirty } from './speaker-outcome-selection';

describe('selected speaker outcome messages', () => {
  it('blocks only when a selected recipient needs an edited message', () => {
    const messages = [{ kind: 'acceptance' as const, text: 'New' }, { kind: 'rejection' as const, text: 'Saved' }];
    const saved = { acceptance: JSON.stringify({ kind: 'acceptance', text: 'Old' }), rejection: JSON.stringify(messages[1]) };
    const submissions = [{ id: 'a', status: 'selected' }, { id: 'b', status: 'not_selected' }];

    expect(selectedMessagesAreDirty(messages, saved, submissions, [])).toBe(false);
    expect(selectedMessagesAreDirty(messages, saved, submissions, ['b'])).toBe(false);
    expect(selectedMessagesAreDirty(messages, saved, submissions, ['a'])).toBe(true);
    expect(selectedMessagesAreDirty(messages, saved, submissions, ['a', 'b'])).toBe(true);
    expect(selectedMessagesAreDirty(messages, { ...saved, acceptance: JSON.stringify(messages[0]) }, submissions, ['a', 'b'])).toBe(false);
  });
});
