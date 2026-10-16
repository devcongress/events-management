import type { Router } from 'vue-router';
import {
  DEVCON26_ANNUAL_CFP_REDIRECT_META_NAME,
  DEVCON26_ANNUAL_CFP_WEBSITE_URL,
  devCon26AnnualCfpRedirectEnabledFromMeta,
  shouldRedirectDevCon26AnnualCfpRoute,
} from '@/lib/devcon26-annual-cfp-redirect';

export function registerDevCon26AnnualCfpRedirectGuard(router: Router): void {
  router.beforeEach((to) => {
    if (typeof document === 'undefined' || typeof window === 'undefined') return true;

    const redirectMeta = document.querySelector<HTMLMetaElement>(
      `meta[name="${DEVCON26_ANNUAL_CFP_REDIRECT_META_NAME}"]`,
    );
    const redirectEnabled = devCon26AnnualCfpRedirectEnabledFromMeta(
      redirectMeta?.content ?? null,
    );

    if (!shouldRedirectDevCon26AnnualCfpRoute(to.path, redirectEnabled)) return true;

    window.location.replace(DEVCON26_ANNUAL_CFP_WEBSITE_URL);

    return false;
  });
}
