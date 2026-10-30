import { renderSpeakerEmailLayout } from './speaker-email-layout';
import type { SpeakerBlastIntent, SpeakerBlastRecipient } from '@/lib/speaker-blasts';

function escape(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

export function speakerBlastEmail(input: {
  eventName: string;
  subject: string;
  message: string;
  intent: SpeakerBlastIntent;
  recipient: SpeakerBlastRecipient;
}): { html: string; text: string } {
  const reminder = input.intent === 'slides_reminder';
  const greeting = `Hi ${input.recipient.name.trim().split(/\s+/)[0] || 'there'},`;
  const rows = input.recipient.sessions.map((session) => {
    if (reminder && (!session.url || !session.deadline)) throw new Error('A slides reminder needs a valid private link and deadline.');
    if (session.url && !/^https?:\/\//.test(session.url)) throw new Error('Invalid speaker workspace URL.');
    const deadline = session.deadline ? new Date(session.deadline).toLocaleString('en-GB', { timeZone: 'Africa/Accra', dateStyle: 'medium', timeStyle: 'short' }) + ' GMT' : '';

    return {
      html: `<div style="margin:20px 0;padding:18px;border:1px solid #444;border-radius:8px;"><h2 style="margin:0 0 12px;font-size:18px;">${escape(session.title)}</h2>${session.url ? `<p><a href="${escape(session.url!)}" style="color:#ff61b0;">${reminder ? 'Add my slides link' : 'Open my speaker workspace'} →</a></p><p style="font-size:13px;">Please use your private link by ${escape(deadline)}. ${reminder ? 'Paste a secure HTTPS link to your slides; a file upload is not required.' : 'This workspace link is private to you.'}</p>` : ''}</div>`,
      text: `${session.title}${session.url ? `\n${reminder ? 'Add my slides link' : 'Open my speaker workspace'}: ${session.url}\nPlease use this private link by ${deadline}.` : '\nNo active speaker workspace link is available.'}`,
    };
  });
  const text = `${input.subject}\n\n${greeting}\n\n${input.message}\n\n${input.eventName}\n\n${rows.map((row) => row.text).join('\n\n')}\n\nQuestions? Reply to this email.\nDevCongress`;

  return {
    text,
    html: renderSpeakerEmailLayout({
      subject: input.subject,
      preheader: reminder ? 'A reminder to share your presentation slides.' : `An update for speakers at ${input.eventName}.`,
      brandMeta: ['Speaker updates', reminder ? 'Slides reminder' : 'Event update'],
      contentHtml: `<p>${escape(greeting)}</p><h1 style="font-size:28px;">${escape(input.subject)}</h1><p style="line-height:1.7;">${escape(input.message).replaceAll('\n', '<br>')}</p><p>${escape(input.eventName)}</p>${rows.map((row) => row.html).join('')}`,
      footerTitle: 'Questions? Reply to this email.',
      footerCopy: 'You are receiving this operational update because you are an approved speaker for this event.',
    }),
  };
}
