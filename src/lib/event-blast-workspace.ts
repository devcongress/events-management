import { emailSubjects } from '@/lib/email/scenarios';

export interface EventBlastStarter {
  id: 'update' | 'reminder' | 'venue';
  label: string;
  subject: string;
  body: string;
}

export function eventBlastStarters(
  eventName: string,
  eventDateLabel: string,
): EventBlastStarter[] {
  return [
    {
      id: 'update',
      label: 'Event update',
      subject: emailSubjects.eventUpdate(eventName),
      body: `Hi,\n\nHere’s a quick update about ${eventName}.\n\n[Add your update]\n\nSee you there,\nDevCongress`,
    },
    {
      id: 'reminder',
      label: 'Reminder',
      subject: emailSubjects.eventReminder(eventName),
      body: `Hi,\n\nA quick reminder that ${eventName} is happening ${eventDateLabel}.\n\n[Add any final details]\n\nSee you there,\nDevCongress`,
    },
    {
      id: 'venue',
      label: 'Venue change',
      subject: emailSubjects.eventVenueChange(eventName),
      body: `Hi,\n\nThe venue for ${eventName} has changed.\n\n[Add the new venue and any arrival details]\n\nSee you there,\nDevCongress`,
    },
  ];
}
