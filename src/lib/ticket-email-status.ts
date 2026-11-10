import type { AnnualConferenceTicketEmailDelivery } from '@/src/lib/api';

export function ticketEmailStatusLabel(delivery: Pick<AnnualConferenceTicketEmailDelivery, 'status' | 'next_attempt_at'>) {
  if (delivery.status === 'accepted') return 'Accepted by provider';
  if (delivery.status === 'sending') return 'Sending';
  if (delivery.status === 'failed') {
    return Number.isFinite(Date.parse(delivery.next_attempt_at)) ? 'Awaiting retry' : 'Needs review';
  }

  return delivery.status;
}
