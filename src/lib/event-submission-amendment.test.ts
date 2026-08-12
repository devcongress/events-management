import { describe, expect, it } from 'vitest';
import { amendmentReplacesCover } from './event-submission-amendment';

describe('event submission amendment presentation', () => {
  it('does not report a cover change when no replacement was uploaded', () => {
    expect(amendmentReplacesCover('https://cdn.example.test/current.jpg', null)).toBe(false);
    expect(amendmentReplacesCover('https://cdn.example.test/current.jpg', '')).toBe(false);
  });

  it('reports only an actual replacement cover', () => {
    expect(amendmentReplacesCover(null, 'https://cdn.example.test/new.jpg')).toBe(true);
    expect(amendmentReplacesCover('https://cdn.example.test/current.jpg', 'https://cdn.example.test/new.jpg')).toBe(true);
    expect(amendmentReplacesCover('https://cdn.example.test/current.jpg', 'https://cdn.example.test/current.jpg')).toBe(false);
  });
});
