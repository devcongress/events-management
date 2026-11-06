import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Slack reviewer browser handoff', () => {
  it('removes the fragment and stores it before navigating to a token-free login destination', () => {
    const view = readFileSync(new URL('./views/SlackReviewerLinkView.vue', import.meta.url), 'utf8');
    const removeFragment = view.indexOf("history.replaceState(history.state, '', LINK_PATH)");
    const storeToken = view.indexOf('sessionStorage.setItem(STORAGE_KEY, fragment)');
    const goToLogin = view.indexOf("window.location.replace(`${adminPath('login')}?redirect=${encodeURIComponent(LINK_PATH)}`)");

    expect(removeFragment).toBeGreaterThan(0);
    expect(storeToken).toBeGreaterThan(removeFragment);
    expect(goToLogin).toBeGreaterThan(storeToken);
    expect(view).not.toMatch(/encodeURIComponent\((?:token|fragment)\)/);
    expect(view).toContain("method: 'POST'");
    expect(view).toContain('JSON.stringify({ token })');
  });
});
