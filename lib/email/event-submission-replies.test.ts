import crypto from 'crypto';
import { describe, expect, it } from 'vitest';
import { eventSubmissionReplyAddress, parseEventSubmissionReplyRecipient } from './event-submission-replies';

const submissionId = '3e171129-0077-4dbd-ad8b-d82ba31d3176';
const domain = 'updates.devcongress.org';
const secret = 'submission-routing-secret';

describe('event submission reply addresses', () => {
  it('uses a compact signed local part that remains within the email limit', () => {
    const address = eventSubmissionReplyAddress({ submissionId, domain, secret });

    expect(address).toMatch(/^s\+[0-9a-f]{32}\.[A-Za-z0-9_-]{20}@updates\.devcongress\.org$/);
    expect(address!.split('@')[0]).toHaveLength(55);
    expect(parseEventSubmissionReplyRecipient(address!, domain, secret)).toMatchObject({ submissionId });
  });

  it('continues to recognize replies addressed to the previous signed format', () => {
    const legacySignature = crypto.createHmac('sha256', secret).update(submissionId).digest('base64url');
    const legacyAddress = `submissions+${submissionId}.${legacySignature}@${domain}`;

    expect(parseEventSubmissionReplyRecipient(legacyAddress, domain, secret)).toMatchObject({
      submissionId,
      signature: legacySignature,
    });
  });
});
