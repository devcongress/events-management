import type { LocationQuery, RouteLocationRaw } from 'vue-router';

export type TicketingSection = 'overview' | 'orders' | 'delivery' | 'sponsors' | 'testing';

const sections: Array<{ key: TicketingSection; label: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'orders', label: 'Orders' },
  { key: 'delivery', label: 'Delivery' },
  { key: 'sponsors', label: 'Sponsors' },
  { key: 'testing', label: 'Testing' },
];

export function ticketingSections(year: string) {
  return sections.filter(section => section.key !== 'testing' || year === '2026');
}

export function resolveTicketingSection(value: unknown, year: string): TicketingSection {
  return ticketingSections(year).find(section => section.key === value)?.key ?? 'overview';
}

export function ticketingSectionLabel(section: TicketingSection): string {
  return sections.find(item => item.key === section)!.label;
}

export function ticketingSectionLocation(path: string, query: LocationQuery, section: TicketingSection): RouteLocationRaw {
  return { path, query: { ...query, section } };
}
