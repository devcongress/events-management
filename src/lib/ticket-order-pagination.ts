export interface TicketOrderPageRequest {
  year: string;
  page: number;
  view: string;
}

/** Resolve a page only for the response belonging to the current view. */
export function ticketOrderPageAfterResponse(
  current: TicketOrderPageRequest,
  request: TicketOrderPageRequest,
  total: number,
  pageSize: number,
): number {
  if (current.year !== request.year || current.page !== request.page || current.view !== request.view) {
    return current.page;
  }

  return Math.min(current.page, Math.max(1, Math.ceil(total / pageSize)));
}
