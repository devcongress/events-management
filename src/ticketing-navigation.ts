import type { LocationQuery, RouteLocationRaw } from 'vue-router';
import type { AnnualConferenceCapability } from '@/lib/annual-conference-capabilities';

export type TicketingSection = 'overview' | 'orders' | 'delivery' | 'sponsors' | 'complimentary' | 'testing';

const sections: Array<{ key: TicketingSection; label: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'orders', label: 'Orders' },
  { key: 'delivery', label: 'Delivery' },
  { key: 'sponsors', label: 'Sponsors' },
  { key: 'complimentary', label: 'Complimentary' },
  { key: 'testing', label: 'Coupons' },
];

export const TICKETING_VIEW_CAPABILITIES = [
  'ticketing.overview.view', 'ticketing.orders.view', 'ticketing.delivery.view',
  'ticketing.sponsors.view', 'ticketing.complimentary.view', 'ticketing.coupons.view',
] as const;

const sectionCapabilities: Record<TicketingSection, AnnualConferenceCapability> = {
  overview: 'ticketing.overview.view',
  orders: 'ticketing.orders.view',
  delivery: 'ticketing.delivery.view',
  sponsors: 'ticketing.sponsors.view',
  complimentary: 'ticketing.complimentary.view',
  testing: 'ticketing.coupons.view',
};

export function allowedTicketingSections(year: string, capabilities: readonly AnnualConferenceCapability[]) {
  return ticketingSections(year).filter(section => capabilities.includes(sectionCapabilities[section.key]));
}

export function resolveAllowedTicketingSection(value: unknown, year: string, capabilities: readonly AnnualConferenceCapability[]): TicketingSection | undefined {
  const allowed = allowedTicketingSections(year, capabilities);

  return allowed.find(section => section.key === value)?.key ?? allowed[0]?.key;
}

export function ticketingSections(year: string) {
  return sections.filter(section => !['testing', 'complimentary'].includes(section.key) || year === '2026');
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
