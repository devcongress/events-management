import { describe, expect, it } from 'vitest';
import { staticShortLinkDestinationPath } from './short-link-destinations';

describe('static short-link destinations', () => {
  it('resolves the evergreen volunteer destination to its canonical route', () => {
    expect(staticShortLinkDestinationPath('volunteer_intake')).toBe('/volunteer');
  });

  it('leaves event and conference destinations to their runtime availability checks', () => {
    expect(staticShortLinkDestinationPath('event_registration')).toBeNull();
    expect(staticShortLinkDestinationPath('monthly_cfp')).toBeNull();
    expect(staticShortLinkDestinationPath('conference_cfp')).toBeNull();
  });
});
