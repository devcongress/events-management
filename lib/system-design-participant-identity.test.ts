import { describe, expect, it } from 'vitest';
import {
  generateParticipantAlias,
  participantIdentityMode,
  validateParticipantDisplayName,
} from './system-design-participant-identity';

describe('System Design participant identity', () => {
  it('defaults legacy sessions to generated aliases', () => {
    expect(participantIdentityMode({})).toBe('generated');
    expect(participantIdentityMode({ participant_identity_mode: 'self_named' })).toBe('self_named');
  });

  it('normalizes human names and rejects unsafe or oversized values', () => {
    expect(validateParticipantDisplayName('  Ama   Osei  ')).toBe('Ama Osei');
    expect(validateParticipantDisplayName("Nii O'Kane-Smith")).toBe("Nii O'Kane-Smith");
    expect(validateParticipantDisplayName('<script>')).toBeNull();
    expect(validateParticipantDisplayName('A'.repeat(25))).toBeNull();
  });

  it('selects a unique friendly alias when a generated name is already taken', () => {
    expect(generateParticipantAlias(['Bold Badger'], () => 0)).toBe('Bold Falcon');
  });
});
