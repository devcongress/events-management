import { createMemoryHistory, createRouter } from 'vue-router';
import { describe, expect, it, vi } from 'vitest';
import { resolveTicketingSection, ticketingSectionLabel, ticketingSectionLocation, ticketingSections } from './ticketing-navigation';

describe('Ticketing section navigation', () => {
  it('shows the five current sections and keeps Testing limited to DevCon26', () => {
    expect(ticketingSections('2026').map(section => section.label)).toEqual(['Overview', 'Orders', 'Delivery', 'Sponsors', 'Testing']);
    expect(ticketingSections('2027').map(section => section.key)).toEqual(['overview', 'orders', 'delivery', 'sponsors']);
    expect(ticketingSectionLabel('delivery')).toBe('Delivery');
  });

  it.each([undefined, null, '', 'unknown', ['orders'], ['orders', 'delivery']])('defaults a missing or malformed section to Overview: %j', value => {
    expect(resolveTicketingSection(value, '2026')).toBe('overview');
  });

  it('accepts direct links while keeping unavailable Testing links on Overview', () => {
    for (const section of ticketingSections('2026')) {
      expect(resolveTicketingSection(section.key, '2026')).toBe(section.key);
    }
    expect(resolveTicketingSection('testing', '2027')).toBe('overview');
  });

  it('preserves unrelated query values and supports native Back/Forward history', async () => {
    const path = '/organizer-console/annual-conference/2026/ticketing';
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path, component: {} }] });

    await router.push({ path, query: { section: 'orders', source: 'review', tag: ['one', 'two'] } });
    await router.push(ticketingSectionLocation(path, router.currentRoute.value.query, 'sponsors'));
    expect(router.currentRoute.value.query).toEqual({ section: 'sponsors', source: 'review', tag: ['one', 'two'] });
    router.back();
    await vi.waitFor(() => expect(router.currentRoute.value.query.section).toBe('orders'));
    router.forward();
    await vi.waitFor(() => expect(router.currentRoute.value.query.section).toBe('sponsors'));
  });
});
