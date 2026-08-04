import type { EventRegistrationCampaignStatus } from '@/types';

export interface RegistrationSettingsDraft {
  status: EventRegistrationCampaignStatus;
  description: string;
  capacity: number;
  opens_at: string;
  closes_at: string;
}

export type RegistrationSettingsField = keyof RegistrationSettingsDraft;

const REGISTRATION_SETTINGS_FIELDS: RegistrationSettingsField[] = [
  'status',
  'description',
  'capacity',
  'opens_at',
  'closes_at',
];

export function changedRegistrationSettings(
  baseline: RegistrationSettingsDraft,
  current: RegistrationSettingsDraft,
): RegistrationSettingsField[] {
  return REGISTRATION_SETTINGS_FIELDS.filter((field) => baseline[field] !== current[field]);
}
