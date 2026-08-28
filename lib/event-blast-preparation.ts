export const EVENT_BLAST_PREPARATION_BATCH_SIZE = 10;

export type EventBlastPreparationMessage = {
  event_id: string;
  blast_id: string;
  offset: number;
};

/** The small structural subset of Cloudflare's Queue binding that EMS uses. */
export type EventBlastPreparationQueue = {
  send(message: EventBlastPreparationMessage): Promise<unknown>;
};
