import { EMAIL_SENDERS } from '@/lib/email/scenarios';
import { renderSpeakerEmailLayout } from '@/lib/email/templates/speaker-email-layout';

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

export function volunteerFollowUpEmail(input: {
  name: string;
  privateUrl: string;
  responseDeadline: string;
}) {
  const subject = 'A quick follow-up about volunteering at DevCongress 2026';
  const firstName = input.name.trim().split(/\s+/u)[0] || 'there';
  const deadlineLabel = new Intl.DateTimeFormat('en-GH', {
    timeZone: 'Africa/Accra',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(input.responseDeadline));
  const html = renderSpeakerEmailLayout({
    subject,
    preheader: `Two quick questions about volunteering on 19 December. Respond by ${deadlineLabel}.`,
    brandMeta: ['Annual Conference', 'Volunteer follow-up'],
    contentHtml: `
      <p class="email-eyebrow" style="margin:0 0 10px;color:#C80D68;font-family:'IBM Plex Mono','Courier New',monospace;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;">Volunteer follow-up / 2026</p>
      <h1 class="email-heading" style="margin:0 0 12px;color:#111111;font-size:34px;font-weight:800;line-height:1.15;">Hi ${escapeHtml(firstName)},</h1>
      <p class="email-copy" style="margin:0 0 20px;color:#444444;font-size:16px;line-height:1.6;">Thank you for offering to volunteer with DevCongress. We have two short questions before our team reviews applications for the event in Accra on 19 December 2026.</p>
      <p class="email-copy" style="margin:0 0 24px;color:#444444;font-size:16px;line-height:1.6;">We cannot provide travel grants or sponsorship. Please let us know whether you can come to Accra and why you would like to volunteer.</p>
      <p style="margin:0;"><a href="${escapeHtml(input.privateUrl)}" style="color:#C80D68;font-family:'IBM Plex Mono','Courier New',monospace;font-size:13px;font-weight:700;text-decoration:underline;text-decoration-thickness:2px;text-underline-offset:4px;text-transform:uppercase;">Answer the two questions&nbsp;&nbsp;&rarr;</a></p>`,
    footerTitle: `Please respond by ${deadlineLabel}`,
    footerCopy: 'This private link is for your application. Your answers are final once submitted.',
  });
  const text = [
    `Hi ${firstName},`,
    '',
    'Thank you for offering to volunteer with DevCongress on 19 December 2026 in Accra.',
    'We cannot provide travel grants or sponsorship. Please answer two short questions by ' + deadlineLabel + '.',
    input.privateUrl,
    '',
    'Your answers are final once submitted. Please do not forward this private link.',
  ].join('\n');

  return { from: EMAIL_SENDERS.events.from, subject, html, text };
}

function volunteerOutcomeEmail(
  input: { name: string },
  decision: "accepted" | "not_selected",
) {
  const firstName = input.name.trim().split(/\s+/u)[0] || "there";
  const accepted = decision === "accepted";
  const subject = accepted
    ? "Your DevCongress 2026 volunteer application"
    : "An update on your DevCongress 2026 volunteer application";
  const message = accepted
    ? "We’re pleased to let you know that you’ve been selected to volunteer with DevCongress 2026. Our team will share the next steps and event information with you soon."
    : "Thank you for offering your time and for completing the volunteer follow-up. We’re unable to offer you a volunteer place for DevCongress 2026. We appreciate your interest and hope to see you at the event.";
  const html = renderSpeakerEmailLayout({
    subject,
    preheader: accepted
      ? "Your volunteer application has been selected."
      : "There is an update on your volunteer application.",
    brandMeta: ["Annual Conference", "Volunteer decision"],
    contentHtml: `
      <p class="email-eyebrow" style="margin:0 0 10px;color:#C80D68;font-family:'IBM Plex Mono','Courier New',monospace;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;">Volunteer decision / 2026</p>
      <h1 class="email-heading" style="margin:0 0 12px;color:#111111;font-size:34px;font-weight:800;line-height:1.15;">Hi ${escapeHtml(firstName)},</h1>
      <p class="email-copy" style="margin:0;color:#444444;font-size:16px;line-height:1.6;">${escapeHtml(message)}</p>`,
    footerTitle: "DevCongress 2026 · Accra",
    footerCopy: "Thank you for being part of the DevCongress community.",
  });
  const text = [`Hi ${firstName},`, "", message, "", "DevCongress 2026 · Accra"].join("\n");

  return { from: EMAIL_SENDERS.events.from, subject, html, text };
}

export function volunteerOutcomeEmailPreview(input: {
  name: string;
  decision: "accepted" | "not_selected";
}) {
  return volunteerOutcomeEmail(input, input.decision);
}
