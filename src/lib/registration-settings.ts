import type { EventRegistrationCampaignStatus } from '@/types';

export const REGISTRATION_SETUP_HISTORY_KEY = 'registrationSetup';

export interface RegistrationSettingsDraft {
  status: EventRegistrationCampaignStatus;
  capacity: number;
  opens_at: string;
  closes_at: string;
  waitlist_enabled: boolean;
  auto_confirm: boolean;
}

export type RegistrationSettingsField = keyof RegistrationSettingsDraft;

export const REGISTRATION_SETTINGS_FIELDS: RegistrationSettingsField[] = [
  'status',
  'capacity',
  'opens_at',
  'closes_at',
  'auto_confirm',
  'waitlist_enabled',
];

export function changedRegistrationSettings(
  baseline: RegistrationSettingsDraft,
  current: RegistrationSettingsDraft,
): RegistrationSettingsField[] {
  return REGISTRATION_SETTINGS_FIELDS.filter((field) => baseline[field] !== current[field]);
}

export function isInitialRegistrationSetupState(state: unknown): boolean {
  return Boolean(
    state
    && typeof state === 'object'
    && (state as Record<string, unknown>)[REGISTRATION_SETUP_HISTORY_KEY] === true
  );
}
