export type AuditLogFilters = {
  limit: number;
  actor?: string;
  action?: string;
  targetType?: string;
};

export class OperationsReadModelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OperationsReadModelError';
  }
}

/**
 * Bounded read model for the operational console. It composes the audit ledger
 * with delivery state, quota guardrails, and broadcasts so the UI does not
 * need to infer which values belong to the same operational snapshot.
 */
export function createOperationsReadModel<AuditEntry, EmailHealth, EmailOutbox, EmailDelivery, EventBlast, BlastCapacity>(dependencies: {
  listAudit(filters: AuditLogFilters): Promise<AuditEntry[]>;
  emailHealth(): Promise<EmailHealth>;
  emailOutbox(): Promise<EmailOutbox>;
  recentEmailDeliveries(): Promise<EmailDelivery[]>;
  recentEventBlasts(limit: number): Promise<EventBlast[]>;
  blastCapacity(input: { health: EmailHealth; outbox: EmailOutbox }): BlastCapacity;
}) {
  return {
    async load(filters: AuditLogFilters) {
      const [logs, emailHealth, emailOutbox, recentEmailDeliveries, recentEventBlasts] = await Promise.all([
        dependencies.listAudit(filters),
        dependencies.emailHealth(),
        dependencies.emailOutbox(),
        dependencies.recentEmailDeliveries(),
        dependencies.recentEventBlasts(10),
      ]);

      return {
        logs,
        email_health: emailHealth,
        email_outbox: emailOutbox,
        blast_capacity: dependencies.blastCapacity({ health: emailHealth, outbox: emailOutbox }),
        recent_email_deliveries: recentEmailDeliveries,
        recent_event_blasts: recentEventBlasts,
        auth_mode: 'supabase' as const,
      };
    },
  };
}
