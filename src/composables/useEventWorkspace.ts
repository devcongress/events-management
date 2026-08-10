import { useQuery } from '@tanstack/vue-query';
import { computed, toValue, type MaybeRefOrGetter } from 'vue';
import { fetchEventById, fetchEventChecklist, queryKeys } from '@/src/lib/api';

/**
 * One cache boundary for data shared by every event-workspace tab.
 * Views may keep local draft state, but no longer need to recreate event and
 * checklist query keys or decide their cache lifetime independently.
 */
export function useEventWorkspace(eventId: MaybeRefOrGetter<string>) {
  const id = computed(() => toValue(eventId));
  const eventQuery = useQuery({
    queryKey: computed(() => queryKeys.event(id.value)),
    queryFn: () => fetchEventById(id.value),
    enabled: computed(() => Boolean(id.value)),
  });
  const checklistQuery = useQuery({
    queryKey: computed(() => queryKeys.eventChecklist(id.value)),
    queryFn: () => fetchEventChecklist(id.value),
    enabled: computed(() => Boolean(id.value)),
  });

  async function refresh() {
    return Promise.all([eventQuery.refetch(), checklistQuery.refetch()]);
  }

  return { id, eventQuery, checklistQuery, refresh };
}
