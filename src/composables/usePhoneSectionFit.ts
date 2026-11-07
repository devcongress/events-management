import { computed, nextTick, onMounted, onUnmounted, ref, watch, type Ref } from 'vue';

export function usePhoneSectionFit(
  container: Ref<HTMLElement | null>,
  measurement: Ref<HTMLElement | null>,
  count: Ref<number>,
) {
  const isPhone = ref(false);
  const overflows = ref(false);
  const usePicker = computed(() => isPhone.value && (count.value > 3 || overflows.value));
  let observer: ResizeObserver | undefined;
  let disposed = false;

  async function measure() {
    await nextTick();
    if (disposed) return;
    isPhone.value = window.matchMedia('(max-width: 767px)').matches;
    if (container.value && measurement.value) {
      overflows.value = measurement.value.scrollWidth > container.value.clientWidth + 1;
    }
  }

  onMounted(() => {
    void measure();
    window.addEventListener('resize', measure);
    void document.fonts?.ready.then(measure);
  });

  onUnmounted(() => {
    disposed = true;
    observer?.disconnect();
    window.removeEventListener('resize', measure);
  });

  watch(count, measure);
  watch([container, measurement], ([nextContainer, nextMeasurement]) => {
    observer?.disconnect();
    observer = undefined;
    if (typeof ResizeObserver !== 'undefined' && nextContainer && nextMeasurement) {
      observer = new ResizeObserver(() => { void measure(); });
      observer.observe(nextContainer);
      observer.observe(nextMeasurement);
    }
    void measure();
  }, { flush: 'post', immediate: true });

  return usePicker;
}
