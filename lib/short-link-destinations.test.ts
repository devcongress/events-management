import { describe, expect, it } from 'vitest';
import {
  staticShortLinkDestinationPath,
  VOLUNTEER_FOLLOW_UP_TEST_PATH,
} from './short-link-destinations';

describe('static short-link destinations', () => {
  it('resolves the evergreen volunteer destination to its canonical route', () => {
    expect(staticShortLinkDestinationPath('volunteer_intake')).toBe('/volunteer');
    expect(staticShortLinkDestinationPath('volunteer_follow_up_test')).toBe(
      VOLUNTEER_FOLLOW_UP_TEST_PATH,
    );
  });

  it('leaves event and conference destinations to their runtime availability checks', () => {
    expect(staticShortLinkDestinationPath('event_registration')).toBeNull();
    expect(staticShortLinkDestinationPath('event_feedback')).toBeNull();
    expect(staticShortLinkDestinationPath('monthly_cfp')).toBeNull();
    expect(staticShortLinkDestinationPath('conference_cfp')).toBeNull();
  });
});
