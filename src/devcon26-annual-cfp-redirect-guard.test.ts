import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { DEVCON26_ANNUAL_CFP_WEBSITE_URL } from '@/lib/devcon26-annual-cfp-redirect';
import { registerDevCon26AnnualCfpRedirectGuard } from './devcon26-annual-cfp-redirect-guard';

const TestView = { template: '<div />' };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function testRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: TestView },
      { path: '/speak/c/:year(\\d{4})', name: 'conference-cfp', component: TestView },
      { path: '/conference-speakers/:year/:token', name: 'private-speaker', component: TestView },
    ],
  });
}

describe('DevCon26 annual CFP Vue route guard', () => {
  it('redirects the exact public 2026 route during client-side navigation', async () => {
    const locationReplace = vi.fn();

    vi.stubGlobal('window', { location: { replace: locationReplace } });
    vi.stubGlobal('document', {
      querySelector: vi.fn(() => ({ content: 'true' })),
    });
    const router = testRouter();

    registerDevCon26AnnualCfpRedirectGuard(router);
    await router.push('/');
    await router.push('/speak/c/2026?token=private');

    expect(locationReplace).toHaveBeenCalledOnce();
    expect(locationReplace).toHaveBeenCalledWith(DEVCON26_ANNUAL_CFP_WEBSITE_URL);
    expect(router.currentRoute.value.path).toBe('/');
  });

  it('redirects the optional trailing-slash alias of the same public route', async () => {
    const locationReplace = vi.fn();

    vi.stubGlobal('window', { location: { replace: locationReplace } });
    vi.stubGlobal('document', {
      querySelector: vi.fn(() => ({ content: 'true' })),
    });
    const router = testRouter();

    registerDevCon26AnnualCfpRedirectGuard(router);
    await router.push('/');
    await router.push('/speak/c/2026/');

    expect(locationReplace).toHaveBeenCalledOnce();
    expect(locationReplace).toHaveBeenCalledWith(DEVCON26_ANNUAL_CFP_WEBSITE_URL);
    expect(router.currentRoute.value.path).toBe('/');
  });

  it('leaves the redirect off unless the runtime meta value is exactly true', async () => {
    const locationReplace = vi.fn();

    vi.stubGlobal('window', { location: { replace: locationReplace } });
    vi.stubGlobal('document', {
      querySelector: vi.fn(() => ({ content: 'false' })),
    });
    const router = testRouter();

    registerDevCon26AnnualCfpRedirectGuard(router);
    await router.push('/speak/c/2026');

    expect(locationReplace).not.toHaveBeenCalled();
    expect(router.currentRoute.value.path).toBe('/speak/c/2026');
  });

  it('does not redirect another year, extra path segments, or private speaker links', async () => {
    const locationReplace = vi.fn();

    vi.stubGlobal('window', { location: { replace: locationReplace } });
    vi.stubGlobal('document', {
      querySelector: vi.fn(() => ({ content: 'true' })),
    });
    const router = testRouter();

    registerDevCon26AnnualCfpRedirectGuard(router);
    await router.push('/speak/c/2025');
    await router.push('/speak/c/2026/extra');
    await router.push('/conference-speakers/2026/private-token');

    expect(locationReplace).not.toHaveBeenCalled();
    expect(router.currentRoute.value.name).toBe('private-speaker');
  });
});
