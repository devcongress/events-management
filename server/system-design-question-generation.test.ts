import { describe, expect, it } from 'vitest';
import { generateQuestionDraftsFromText } from './app';

describe('System Design question generation', () => {
  it('varies the source-grounded question format instead of repeating one preamble', () => {
    const source = [
      'The checkout service records every reservation with an idempotency key so a client retry cannot create a second order when the first response is delayed.',
      'A durable outbox writes the payment event in the same transaction as the order, allowing workers to retry delivery without losing the business decision.',
      'The inventory service uses a version check on the stock row so concurrent purchases cannot silently overwrite a newer quantity.',
      'A cache is useful for the product catalogue because it lowers read latency, but checkout availability remains authoritative in the transactional store.',
    ].join(' ');

    const drafts = generateQuestionDraftsFromText(source, 4);

    expect(drafts).toHaveLength(4);
    expect(drafts.map((draft) => draft.question_text)).toEqual(expect.arrayContaining([
      expect.stringMatching(/^Which concept completes this source statement\?/),
      expect.stringMatching(/^Which detail from the source most directly supports/),
      expect.stringMatching(/^Within the source,/),
      expect.stringMatching(/^A team is facing this condition:/),
    ]));
    expect(drafts.every((draft) => draft.options.length === 4)).toBe(true);
  });
});
