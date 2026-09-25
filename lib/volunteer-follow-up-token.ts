import crypto from 'crypto';

export function volunteerFollowUpToken(input: {
  recipientId: string;
  campaignId: string;
  secret: string;
}): string {
  return crypto.createHmac('sha256', input.secret)
    .update(`volunteer-follow-up:${input.campaignId}:${input.recipientId}`)
    .digest('hex');
}

export function volunteerFollowUpTokenMatches(input: {
  recipientId: string;
  campaignId: string;
  secret: string;
  token: string;
}): boolean {
  if (!/^[a-f0-9]{64}$/u.test(input.token)) return false;

  const expected = Buffer.from(volunteerFollowUpToken(input), 'hex');
  const received = Buffer.from(input.token, 'hex');

  return crypto.timingSafeEqual(expected, received);
}
