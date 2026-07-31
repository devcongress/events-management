import { describe, expect, it } from 'vitest';
import {
  isSystemDesignPresenterPath,
  systemDesignPresenterPath,
} from './system-design-presenter-route';

describe('System Design presenter route', () => {
  it('builds and recognizes the standalone organizer-protected presentation path', () => {
    const sessionId = '3bf6c1e1-ded5-42bc-84be-e1c2efd06036';
    const path = systemDesignPresenterPath(sessionId);

    expect(path).toBe(`/present/system-design/${sessionId}`);
    expect(isSystemDesignPresenterPath(path)).toBe(true);
    expect(isSystemDesignPresenterPath('/organizer-console/events/event-1/system-design')).toBe(false);
    expect(isSystemDesignPresenterPath('/present/system-design/not-a-session')).toBe(false);
  });
});
