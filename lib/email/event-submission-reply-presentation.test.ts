import { describe, expect, it } from 'vitest';
import { presentEventSubmissionReply } from './event-submission-reply-presentation';

describe('presentEventSubmissionReply', () => {
  it('separates a fresh reply from its quoted original email', () => {
    expect(presentEventSubmissionReply([
      'How long does the review take?',
      '',
      'On Sat, Aug 8, 2026 at 6:08 AM DevCongress Events <events@updates.devcongress.org> wrote:',
      '',
      '> [image: DevCongress]',
      '>',
      '> Community calendar',
      '> We received your event submission.',
      '> Browse community events <https://devcongress.org/events/>',
    ].join('\n'))).toEqual({
      message: 'How long does the review take?',
      quotedMessage: 'Community calendar\nWe received your event submission.\nBrowse community events https://devcongress.org/events/',
    });
  });

  it('uses quote markers as a fallback while preserving an unquoted message', () => {
    expect(presentEventSubmissionReply('Thanks for the update.\n\n> Previous message\n> More context')).toEqual({
      message: 'Thanks for the update.',
      quotedMessage: 'Previous message\nMore context',
    });
  });

  it('keeps a reply intact when no quoted content is present', () => {
    expect(presentEventSubmissionReply('Thanks for the update.')).toEqual({
      message: 'Thanks for the update.',
      quotedMessage: null,
    });
  });
});
