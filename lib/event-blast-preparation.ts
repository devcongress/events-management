export const EVENT_BLAST_PREPARATION_BATCH_SIZE = 10;

export type EventBlastPreparationMessage = {
  kind?: 'event';
  event_id: string;
  blast_id: string;
  offset: number;
  phase?: 'prepare' | 'send' | 'clear';
  slot_number?: number;
};

export type VolunteerBlastPreparationMessage = {
  kind: 'volunteer';
  campaign_id: string;
  blast_id: string;
  offset: number;
  phase?: 'prepare' | 'send' | 'clear';
  slot_number?: number;
};

export type BlastPreparationMessage = EventBlastPreparationMessage | VolunteerBlastPreparationMessage;

export type CheckoutRecoveryMessage = { kind: 'admission-recovery' | 'payment-recovery' };

/** The small structural subset of Cloudflare's Queue binding that EMS uses. */
export type EventBlastPreparationQueue = {
  send(message: BlastPreparationMessage | CheckoutRecoveryMessage, options?: { delaySeconds?: number }): Promise<unknown>;
};
