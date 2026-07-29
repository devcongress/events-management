import { describe, expect, it } from 'vitest';
import { adminPath, safeInternalAppPath } from './admin-routes';

describe('safeInternalAppPath', () => {
  it('preserves internal organizer destinations', () => {
    expect(safeInternalAppPath(`${adminPath('events')}?month=2026-07#details`))
      .toBe(`${adminPath('events')}?month=2026-07#details`);
  });

  it('rejects external, protocol-relative, backslash, and non-string redirects', () => {
    expect(safeInternalAppPath('https://attacker.example/path')).toBeNull();
    expect(safeInternalAppPath('//attacker.example/path')).toBeNull();
    expect(safeInternalAppPath('/\\attacker.example/path')).toBeNull();
    expect(safeInternalAppPath({ path: adminPath('events') })).toBeNull();
  });
});
