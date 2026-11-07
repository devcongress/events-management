import { onMounted, onUnmounted, ref } from 'vue';
import { ORGANIZER_PHONE_MEDIA_QUERY } from '@/src/organizer-viewport';

export function usePhoneViewport() {
  const media = typeof window === 'undefined' ? undefined : window.matchMedia(ORGANIZER_PHONE_MEDIA_QUERY);
  const phone = ref(media?.matches ?? false);
  const sync = () => { phone.value = media?.matches ?? false; };

  onMounted(() => media?.addEventListener('change', sync));
  onUnmounted(() => media?.removeEventListener('change', sync));

  return phone;
}
