import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  PUBLIC_FORM_ROUTE_NAMES,
  isPublicFormRouteName,
} from './public-form-routes';

const frameSource = readFileSync(
  new URL('./components/PublicFormRouteFrame.vue', import.meta.url),
  'utf8',
);
const publicAppSource = readFileSync(new URL('./PublicApp.vue', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('./App.vue', import.meta.url), 'utf8');

describe('public form route frame', () => {
  it('includes every active public form route and excludes non-form routes', () => {
    expect(PUBLIC_FORM_ROUTE_NAMES).toEqual([
      'event-feedback',
      'event-cfp',
      'monthly-cfp',
      'conference-cfp',
      'event-registration-short',
      'event-registration',
      'event-amendment',
      'event-amendment-legacy',
      'speaker-talk-intake',
      'conference-speaker-intake',
      'volunteer-intake',
      'volunteer-follow-up',
      'volunteer-follow-up-test',
      'admin-access-request',
    ]);

    for (const routeName of PUBLIC_FORM_ROUTE_NAMES) {
      expect(isPublicFormRouteName(routeName)).toBe(true);
    }

    expect(isPublicFormRouteName('admin-login')).toBe(false);
    expect(isPublicFormRouteName('admin-auth-callback')).toBe(false);
    expect(isPublicFormRouteName('admin-events')).toBe(false);
    expect(isPublicFormRouteName('system-design-participant')).toBe(false);
    expect(isPublicFormRouteName('admin-volunteer-follow-up-form-preview')).toBe(false);
    expect(isPublicFormRouteName(Symbol('organizer-route'))).toBe(false);
    expect(isPublicFormRouteName(undefined)).toBe(false);
  });

  it('frames the visible decorative subject in a fixed viewport layer behind transparent routed form views', () => {
    expect(frameSource).toContain(
      "const DEVCONGRESS_FORM_COLLABORATION_PATH = '/illustrations/devcongress-form-collaboration.png';",
    );
    expect(frameSource).toContain(':src="DEVCONGRESS_FORM_COLLABORATION_PATH"');
    expect(frameSource).not.toContain('src="/illustrations/devcongress-form-collaboration.png"');
    expect(frameSource).toContain('alt=""');
    expect(frameSource).toContain('aria-hidden="true"');
    expect(frameSource).toContain(':draggable="false"');
    expect(frameSource).toContain('decoding="async"');
    expect(frameSource).toContain('pointer-events: none');
    expect(frameSource).toContain('position: relative');
    expect(frameSource).toContain('min-height: 100%');
    expect(frameSource).toContain('overflow: clip');
    expect(frameSource).toContain('isolation: isolate');
    expect(frameSource).toContain('background: #f5f2e8');
    expect(frameSource).toMatch(
      /\.public-form-route-frame__content \{[\s\S]*?z-index: 2;/,
    );
    expect(frameSource).toContain('.public-form-route-frame__content > :deep(.page-view)');
    expect(frameSource).toContain('background: transparent');
    expect(frameSource).toContain('position: fixed');
    expect(frameSource).toMatch(
      /\.public-form-route-frame__art \{[\s\S]*?z-index: 1;/,
    );
    expect(frameSource).toContain('inset: 0');
    expect(frameSource).toContain('.public-form-route-frame__art-window');
    expect(frameSource).toContain('aspect-ratio: 836 / 600');
    expect(frameSource).toContain('width: min(24rem, 86vw)');
    expect(frameSource).toContain('right: max(env(safe-area-inset-right), -0.25rem)');
    expect(frameSource).toContain('bottom: max(env(safe-area-inset-bottom), -0.25rem)');
    expect(frameSource).toContain('width: 183.732%');
    expect(frameSource).toContain('left: -83.732%');
    expect(frameSource).toContain('top: -63.333%');
    expect(frameSource).toContain('@media (min-width: 64rem)');
    expect(frameSource).toContain('width: clamp(26rem, 40vw, 44rem)');
    expect(frameSource).toContain('@media (min-width: 80rem)');
    expect(frameSource).toContain('width: calc(100% - clamp(20rem, 30vw, 30rem))');
    expect(frameSource).not.toContain('grid-template-columns');
    expect(frameSource).not.toContain('public-form-route-frame__layout');
    expect(frameSource).not.toContain('.public-form-route-frame__left-rail {');
    expect(frameSource).not.toContain('margin:');
  });

  it('keeps the mobile artwork in the lower-right viewport and opts the frame out of page motion', () => {
    expect(frameSource).toContain('position: fixed');
    expect(frameSource).toContain('inset: 0');
    expect(frameSource).toContain('overflow: clip');
    expect(frameSource).toContain(':global(.public-form-route-frame.page-enter-active)');
    expect(frameSource).toContain(':global(.public-form-route-frame.page-leave-active)');
    expect(frameSource).toContain('transition: none');
    expect(frameSource).toContain('will-change: auto');
    expect(frameSource).toContain(':global(.public-form-route-frame.page-enter-from)');
    expect(frameSource).toContain(':global(.public-form-route-frame.page-leave-to)');
    expect(frameSource).toContain('opacity: 1');
    expect(frameSource).toContain('transform: none');
  });

  it('wraps only allowlisted public forms at both app route boundaries', () => {
    for (const appShellSource of [publicAppSource, appSource]) {
      expect(appShellSource).toMatch(
        /import PublicFormRouteFrame from ['"]\.\/components\/PublicFormRouteFrame\.vue['"];/,
      );
      expect(appShellSource).toMatch(
        /import \{ isPublicFormRouteName \} from ['"]\.\/public-form-routes['"];/,
      );
      expect(appShellSource).toContain('v-if="isPublicFormRouteName(route.name)"');
      expect(appShellSource).toContain('<PublicFormRouteFrame');
    }

    expect(appSource).toContain(':key="routeViewKey(route)"');
  });
});
