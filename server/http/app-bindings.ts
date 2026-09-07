import type { EventBlastPreparationQueue } from '@/lib/event-blast-preparation';
import type { AdminSession } from '@/lib/supabase/admin-auth';

export type AppBindings = {
  Bindings: {
    EVENT_BLAST_PREPARATION_QUEUE?: EventBlastPreparationQueue;
  };
  Variables: {
    requestId: string;
    adminSession: AdminSession | undefined;
  };
};
