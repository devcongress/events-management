import { describe, expect, it } from 'vitest';
import { conferenceQrToken } from './conference-qr';

describe('conference QR capabilities', () => {
  const token = 'a'.repeat(64);

  it('accepts only an opaque token or the approved admission fragment', () => {
    expect(conferenceQrToken(token)).toBe(token);
    expect(conferenceQrToken(`https://devcongress.org/devcon26/admission/#${token}`)).toBe(token);
  });

  it('rejects other origins, routes, query tokens, and executable URLs', () => {
    for (const value of [
      `https://attacker.example/devcon26/admission/#${token}`,
      `https://devcongress.org/other/#${token}`,
      `https://devcongress.org/devcon26/admission/?token=${token}`,
      'javascript:alert(1)',
      'not-a-ticket',
    ]) expect(conferenceQrToken(value)).toBeNull();
  });
});
