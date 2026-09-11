import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { Event } from '@/types';
import { isEventCheckInDay } from '@/lib/event-check-in';

export function useCheckInDay(event: () => Pick<Event, 'event_date' | 'timezone'> | null | undefined) {
  const now = ref(new Date());
  let timer: ReturnType<typeof setTimeout> | undefined;
  function refresh() {
    clearTimeout(timer);
    now.value = new Date();
    timer = setTimeout(refresh, 60_000 - Date.now() % 60_000);
  }
  onMounted(() => {
    refresh();
    document.addEventListener('visibilitychange', refresh);
  });
  onBeforeUnmount(() => {
    clearTimeout(timer);
    document.removeEventListener('visibilitychange', refresh);
  });
  return computed(() => isEventCheckInDay(event(), now.value));
}
