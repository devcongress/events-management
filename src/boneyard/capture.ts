import { createApp, h } from 'vue';
import { registerBones } from 'boneyard-js/vue';
import '@fontsource-variable/bricolage-grotesque/standard.css';
import '@fontsource-variable/source-sans-3/wght.css';
import '@fontsource-variable/source-sans-3/wght-italic.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import '@fontsource/ibm-plex-mono/latin-600.css';
import '@fontsource/ibm-plex-mono/latin-700.css';

import BoneyardPageSkeleton from '@/src/components/ui/BoneyardPageSkeleton.vue';
import PublicFormRouteFrame from '@/src/components/PublicFormRouteFrame.vue';
import { skeletonSections } from './sections';
import '@/src/styles.css';
import '@/src/styles/forms.css';

const requestedSections = new URLSearchParams(window.location.search).getAll('section');

if (requestedSections.length !== 1) {
  throw new Error('The isolated capture page requires exactly one section ID.');
}

const section = skeletonSections.find(({ id }) => id === requestedSections[0]);

if (!section) {
  throw new Error(`Unknown Boneyard section: ${requestedSections[0]}`);
}

// Read-only tooling can preview validated candidates before live promotion.
const preview = (window as Window & { __BONEYARD_PREVIEW_BONES?: Parameters<typeof registerBones>[0] }).__BONEYARD_PREVIEW_BONES;

if (preview?.[section.id]) {
  registerBones({ [section.id]: preview[section.id] });
}

const { capture } = section;
const viewportWidth = window.innerWidth;
const padding = Math.min(capture.padding ?? 0, viewportWidth < 640 ? 16 : viewportWidth < 1024 ? 24 : 32);
const innerPadding = capture.innerPadding ?? 0;
const pageWidth = Math.min(viewportWidth, capture.maxWidth);
const fraction = viewportWidth >= (capture.collapseAt ?? 1024) ? (capture.fraction ?? 1) : 1;
const contentWidth = Math.max(1, (pageWidth - padding * 2 - (fraction < 1 ? (capture.gap ?? 24) : 0)) * fraction - innerPadding * 2);
const alignRight = capture.context === 'drawer';
const centered = capture.align === 'center';

createApp({
  render() {
    const fixture = h('main', {
      'data-capture-context': capture.context ?? 'page',
      style: {
        boxSizing: 'border-box',
        width: '100%',
        minHeight: '100dvh',
        height: centered ? '100dvh' : undefined,
        display: centered ? 'flex' : undefined,
        alignItems: centered ? 'center' : undefined,
        justifyContent: centered ? 'center' : undefined,
        paddingTop: `${capture.topOffset ?? 0}px`,
        paddingInline: `${padding}px`,
        maxWidth: `${pageWidth}px`,
        marginInline: alignRight ? 'auto 0' : 'auto',
      },
    }, [
      h('div', {
        style: {
          width: `${contentWidth}px`,
          boxSizing: 'content-box',
          maxWidth: `calc(100% - ${innerPadding * 2}px)`,
          paddingInline: `${innerPadding}px`,
          marginLeft: alignRight ? 'auto' : undefined,
        },
      }, [
        h(BoneyardPageSkeleton, {
          label: section.label,
          name: section.id,
          showHeader: capture.showHeader,
        }),
      ]),
    ]);

    if (capture.publicFormFrame) {
      return h(PublicFormRouteFrame, { centerContent: capture.publicFormFrame === 'center' }, { default: () => fixture });
    }

    return fixture;
  },
}).mount('#app');
