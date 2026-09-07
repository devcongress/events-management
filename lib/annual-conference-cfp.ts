export const ANNUAL_CONFERENCE_TOPIC_TRACKS = [
  'Open Source & Developer Community',
  'AI & Emerging Technologies',
  'Tech Education',
  'Real-World Impact',
  'Cybersecurity',
  'UX & Product Design',
] as const;

export const ANNUAL_CONFERENCE_SESSION_TYPES = [
  '15-minute short talk',
  '25-minute short talk',
  '40-minute long talk',
  '60-minute workshop',
] as const;

export const ANNUAL_CONFERENCE_BIO_WORD_LIMIT = 150;
export const ANNUAL_CONFERENCE_ABSTRACT_WORD_LIMIT = 250;
export const ANNUAL_CONFERENCE_LEARNING_OUTCOME_MIN = 3;
export const ANNUAL_CONFERENCE_LEARNING_OUTCOME_MAX = 5;

export type AnnualConferenceTopicTrack = typeof ANNUAL_CONFERENCE_TOPIC_TRACKS[number];
export type AnnualConferenceSessionType = typeof ANNUAL_CONFERENCE_SESSION_TYPES[number];

export function countWords(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

export function isAnnualConferenceWorkshop(sessionType: AnnualConferenceSessionType): boolean {
  return sessionType === '60-minute workshop';
}
