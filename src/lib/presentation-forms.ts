import type { AdminShortLink } from './api';

type PresentationDestination = Exclude<
  AdminShortLink['destination'],
  'volunteer_follow_up_test'
>;

export interface PresentationForm {
  key: string;
  available?: boolean;
  destination: PresentationDestination;
  event_id: string | null;
  conference_year: number | null;
  label: string;
  event_date: string | null;
  series_type: string | null;
}

export const presentationCopy = {
  conference_cfp: { title: 'Share what you know.', label: 'Conference speaker applications' },
  volunteer_intake: { title: 'Join the crew.', label: 'Volunteer with DevCongress' },
  event_feedback: { title: 'How was today?', label: 'Meetup feedback' },
  monthly_cfp: { title: 'Share what you know', label: 'Meetup speaker applications' },
  event_registration: { title: 'Save your seat', label: 'Event registration' },
} as const;

export function presentationMonth(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Africa/Accra', year: 'numeric', month: '2-digit',
  }).formatToParts(date);

  return `${parts.find((part) => part.type === 'year')?.value}-${parts.find((part) => part.type === 'month')?.value}`;
}

export function formsForMonth(forms: PresentationForm[], month: string): PresentationForm[] {
  return forms.filter((form) => ['event_feedback', 'volunteer_intake', 'conference_cfp'].includes(form.destination)).filter((form) => !form.event_id || (
    form.event_date && presentationMonth(new Date(form.event_date)) === month
  ));
}

export function defaultPresentationKeys(forms: PresentationForm[], month: string): string[] {
  const available = formsForMonth(forms, month).filter((form) => form.available !== false);
  const speaker = available.find((form) => form.destination === 'conference_cfp' && form.conference_year === Number(month.slice(0, 4)));
  const volunteer = available.find((form) => form.destination === 'volunteer_intake');
  const feedback = available.filter((form) => form.destination === 'event_feedback' && form.series_type === 'monthly');

  // Multiple meetups need an explicit owner choice, never an arbitrary first match.
  return [speaker, volunteer, feedback.length === 1 ? feedback[0] : undefined]
    .filter((form): form is PresentationForm => Boolean(form))
    .map((form) => form.key);
}
