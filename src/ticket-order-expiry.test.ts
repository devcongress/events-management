import { computed, createRenderer, defineComponent, h, ref } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useTicketOrderExpiry } from './lib/ticket-order-expiry';

const renderer = createRenderer({
  createElement: () => ({}), createText: () => ({}), createComment: () => ({}),
  setText: () => {}, setElementText: () => {}, patchProp: () => {},
  insert: () => {}, remove: () => {}, parentNode: () => null, nextSibling: () => null,
});

afterEach(() => vi.useRealTimers());

describe('ticket order expiry clock', () => {
  it('updates at each nearest pending expiry and clears its timer on unmount', async () => {
    vi.useFakeTimers();
    vi.setSystemTime('2026-01-01T00:00:00Z');
    const orders = ref([
      { status: 'pending_payment', expires_at: '2026-01-01T00:00:02Z' },
      { status: 'pending_payment', expires_at: '2026-01-01T00:00:05Z' },
      { status: 'paid', expires_at: '2026-01-01T00:00:01Z' },
    ]);
    let clock = ref(0);
    const app = renderer.createApp(defineComponent({
      setup() {
        clock = useTicketOrderExpiry(computed(() => orders.value));

        return () => h('div');
      },
    }));

    app.mount({});
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(clock.value).toBe(Date.parse('2026-01-01T00:00:02Z'));
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(3000);
    expect(clock.value).toBe(Date.parse('2026-01-01T00:00:05Z'));
    expect(vi.getTimerCount()).toBe(0);
    orders.value = [{ status: 'pending_payment', expires_at: '2026-01-01T00:01:00Z' }];
    await vi.waitFor(() => expect(vi.getTimerCount()).toBe(1));
    app.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
