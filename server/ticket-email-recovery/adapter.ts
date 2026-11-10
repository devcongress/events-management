import type { getSupabaseAdminClient } from '@/lib/supabase/server';

// The only SQL callable by the delivery path. Identifiers and casts are fixed here.
const rpcSql: Record<string, { sql: string; args: string[] }> = {
  lease_admission_dispatch: { sql: 'select to_jsonb(public.lease_admission_dispatch($1::uuid, $2::integer)) as data', args: ['p_token', 'p_seconds'] },
  release_admission_dispatch: { sql: 'select to_jsonb(public.release_admission_dispatch($1::uuid)) as data', args: ['p_token'] },
  claim_annual_conference_ticket_email_outbox: { sql: 'select coalesce(jsonb_agg(to_jsonb(t)), \'[]\'::jsonb) as data from public.claim_annual_conference_ticket_email_outbox($1::uuid, $2::integer) t', args: ['p_claim_token', 'p_limit'] },
  annual_conference_email_allowed: { sql: 'select to_jsonb(public.annual_conference_email_allowed($1::text, $2::uuid, $3::text, $4::boolean)) as data', args: ['p_kind', 'p_id', 'p_email', 'p_testing_only'] },
  hold_annual_conference_testing_email: { sql: 'select to_jsonb(public.hold_annual_conference_testing_email($1::text, $2::uuid, $3::uuid)) as data', args: ['p_kind', 'p_id', 'p_claim'] },
  complete_test_email_context: { sql: 'select to_jsonb(public.complete_test_email_context($1::text, $2::uuid)) as data', args: ['p_kind', 'p_id'] },
  freeze_annual_conference_admission_email: { sql: 'select to_jsonb(public.freeze_annual_conference_admission_email($1::uuid, $2::uuid, $3::text::jsonb)) as data', args: ['p_id', 'p_claim', 'p_payload'] },
  admission_send_slot: { sql: 'select to_jsonb(public.admission_send_slot($1::uuid, $2::integer)) as data', args: ['p_token', 'p_cooldown_seconds'] },
  defer_admission_delivery: { sql: 'select to_jsonb(public.defer_admission_delivery($1::uuid, $2::uuid, $3::text, $4::integer)) as data', args: ['p_id', 'p_claim', 'p_kind', 'p_seconds'] },
  finalize_annual_conference_ticket_email_outbox: { sql: 'select to_jsonb(public.finalize_annual_conference_ticket_email_outbox($1::uuid, $2::uuid, $3::public.annual_conference_ticket_email_status, $4::text)) as data', args: ['p_outbox_id', 'p_claim_token', 'p_status', 'p_provider_email_id'] },
};
const reads: Record<string, { select: string; column: string; sql: string }> = {
  annual_conference_social_cards: { select: 'id,is_test,revoked_at', column: 'ticket_id', sql: 'select to_jsonb(t) as data from (select id,is_test,revoked_at from public.annual_conference_social_cards where ticket_id = $1::uuid) t' },
  annual_conference_tickets: { select: 'order_id,order_seat_number,attendee_email', column: 'id', sql: 'select to_jsonb(t) as data from (select order_id,order_seat_number,attendee_email from public.annual_conference_tickets where id = $1::uuid) t' },
  annual_conference_ticket_orders: { select: 'payment_mode,checkout_origin,status,checkout_settings_version', column: 'id', sql: 'select to_jsonb(t) as data from (select payment_mode,checkout_origin,status,checkout_settings_version from public.annual_conference_ticket_orders where id = $1::uuid) t' },
};

type Query = (sql: string, args: unknown[]) => Promise<Array<{ data: unknown }>>;

export function createRecoveryClient(query: Query) {
  const safeQuery = async (sql: string, args: unknown[]) => {
    try {
      const rows = await query(sql, args);

      return { data: rows[0]?.data ?? null, error: null };
    } catch {
      return { data: null, error: { code: 'DATABASE_UNAVAILABLE' } };
    }
  };
  const client = {
    async rpc(name: string, args: Record<string, unknown> = {}) {
      const entry = rpcSql[name];

      if (!entry || Object.keys(args).some(key => !entry.args.includes(key))
        || entry.args.some(key => !(key in args) && key !== 'p_cooldown_seconds')) {
        return { data: null, error: { code: 'UNSUPPORTED_OPERATION' } };
      }

      return safeQuery(entry.sql, entry.args.map(key => key === 'p_cooldown_seconds' ? args[key] ?? 0 : key === 'p_payload' ? JSON.stringify(args[key]) : args[key]));
    },
    from(table: string) {
      return {
        select(selection: string) {
          return {
            eq(column: string, value: string) {
              return {
                async single() {
                  const entry = reads[table];

                  if (!entry || entry.select !== selection || entry.column !== column) {
                    return { data: null, error: { code: 'UNSUPPORTED_OPERATION' } };
                  }
                  try {
                    const rows = await query(entry.sql, [value]);

                    if (rows.length !== 1) return { data: null, error: { code: 'ROW_COUNT' } };

                    return { data: rows[0].data, error: null };
                  } catch {
                    return { data: null, error: { code: 'DATABASE_UNAVAILABLE' } };
                  }
                },
              };
            },
          };
        },
      };
    },
  };

  return client as unknown as ReturnType<typeof getSupabaseAdminClient>;
}

export async function createRecoveryAdapter(databaseUrl: string) {
  const { SQL } = await import('bun');
  const sql = new SQL({ url: databaseUrl, max: 1, idleTimeout: 30, connectionTimeout: 15, tls: { rejectUnauthorized: true } });
  let reserved: Awaited<ReturnType<typeof sql.reserve>> | undefined;
  const query: Query = async (statement, args) => {
    try {
      if (!reserved) {
        reserved = await sql.reserve();
        await reserved.unsafe("SET statement_timeout = '30s'");
        await reserved.unsafe("SET lock_timeout = '15s'");
        const settings = await reserved.unsafe("select current_setting('statement_timeout') as statement_timeout, current_setting('lock_timeout') as lock_timeout");

        if (settings[0]?.statement_timeout !== '30s' || settings[0]?.lock_timeout !== '15s') {
          throw new Error('Database timeout settings not applied.');
        }
      }

      return await reserved.unsafe(statement, args as never[]) as Array<{ data: unknown }>;
    } catch (error) {
      reserved?.release();
      reserved = undefined;

      throw error;
    }
  };
  const client = createRecoveryClient(query);

  return {
    client,
    async nextDue() {
      const rows = await query('select to_jsonb(public.next_annual_conference_admission_recovery_at()) as data', []);
      const value = rows[0]?.data;

      if (value !== null && typeof value !== 'string') throw new Error('Invalid next recovery time.');

      return value as string | null;
    },
    async close() {
      reserved?.release();
      reserved = undefined;
      await sql.close({ timeout: 5 });
    },
  };
}
