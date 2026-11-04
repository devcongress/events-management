import { onMounted, onUnmounted, ref, watch, type Ref } from 'vue';

interface ExpiringOrder {
  status: string;
  expires_at?: string | null;
}

export function useTicketOrderExpiry(orders: Ref<ExpiringOrder[]>) {
  const now = ref(Date.now());
  let timer: ReturnType<typeof setTimeout> | undefined;
  let mounted = false;

  function schedule() {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    if (!mounted) return;

    now.value = Date.now();
    const nextExpiry = orders.value
      .filter((order) => order.status === 'pending_payment' && order.expires_at)
      .map((order) => Date.parse(order.expires_at!))
      .filter((expiry) => Number.isFinite(expiry) && expiry > now.value)
      .reduce((earliest, expiry) => Math.min(earliest, expiry), Infinity);

    if (Number.isFinite(nextExpiry)) {
      timer = setTimeout(schedule, Math.min(nextExpiry - now.value, 2_147_483_647));
    }
  }

  watch(orders, schedule);
  onMounted(() => {
    mounted = true;
    schedule();
  });
  onUnmounted(() => {
    mounted = false;
    if (timer !== undefined) clearTimeout(timer);
  });

  return now;
}
