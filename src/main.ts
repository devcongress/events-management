import { VueQueryPlugin } from '@tanstack/vue-query';
import { createApp } from 'vue';
import './api-base';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/inter/latin-800.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import '@fontsource/ibm-plex-mono/latin-600.css';
import '@fontsource/ibm-plex-mono/latin-700.css';
import { installButtonPressFeedback } from './button-press-feedback';
import { isAdminPath } from './admin-routes';
import { queryClient } from './lib/query';
import { router } from './router';
import './styles.css';

const initialPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;

void router.replace(initialPath)
  .catch(() => undefined)
  .then(async () => {
    const currentRoute = router.currentRoute.value;
    const isPublicRoute = Boolean(currentRoute.name)
      && !isAdminPath(currentRoute.path)
      && currentRoute.meta.requiresOrganizer !== true;
    const RootView = isPublicRoute
      ? (await import('./PublicApp.vue')).default
      : (await import('./App.vue')).default;
    const app = createApp(RootView).use(VueQueryPlugin, { queryClient }).use(router);
    app.mount('#app');
    installButtonPressFeedback();
  });
