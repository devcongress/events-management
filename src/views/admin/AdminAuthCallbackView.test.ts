import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const callbackViewPath = fileURLToPath(
  new URL('./AdminAuthCallbackView.vue', import.meta.url),
);

describe('AdminAuthCallbackView recovery wiring', () => {
  it('uses one bounded callback deadline and delegates token exchange safely', async () => {
    const source = await readFile(callbackViewPath, 'utf8');

    expect(source).toContain('createAdminAuthCallbackDeadline()');
    expect(source).toContain('callbackDeadline.run(');
    expect(source).toContain("import { exchangeAdminToken } from '@/src/lib/admin-auth-callback-exchange'");
    expect(source).toContain('exchangeAdminToken(data.session.access_token, callbackDeadline)');
    expect(source).toContain('error instanceof AdminAuthCallbackTimeoutError');
  });

  it('keeps timeout recovery on the callback surface with retry-safe copy', async () => {
    const source = await readFile(callbackViewPath, 'utf8');

    expect(source).toContain('recoveryRequired.value = true');
    expect(source).toContain('Organizer sign-in took too long. We could not confirm access in this tab.');
    expect(source).toContain('The protected workspace stays closed until a check succeeds.');
    expect(source).toContain("@primary=\"retrySignIn\"");
  });
});
