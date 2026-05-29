import { createPinia } from 'pinia';
import { createApp } from 'vue';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import '@fontsource/ibm-plex-mono/latin-600.css';
import '@fontsource/ibm-plex-mono/latin-700.css';
import App from './App.vue';
import { router } from './router';
import './styles.css';

createApp(App).use(createPinia()).use(router).mount('#app');
