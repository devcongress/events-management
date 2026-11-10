import { describe, expect, it, vi } from 'vitest';
import { createRecoveryClient } from './adapter';
import { readRecoveryConfig } from './config';
import { abortableSleep, runRecoveryLoop } from './loop';

const env = {
  ADMISSION_RECOVERY_RUNNER_ENABLED: 'true', ADMISSION_RECOVERY_OWNER: 'postgres',
  ADMISSION_RECOVERY_DATABASE_URL: 'postgresql://postgres.ref:password@aws.pooler.supabase.com:5432/postgres?sslmode=require',
  ADMISSION_RECOVERY_EXPECTED_HOST: 'aws.pooler.supabase.com', ADMISSION_RECOVERY_EXPECTED_PROJECT_REF: 'ref',
  DEVCON26_ADMISSION_EMAILS_ENABLED: 'true', RESEND_API_KEY: 'key', DEVCON26_ADMISSION_EMAIL_FROM: 'from',
  DEVCON26_ADMISSION_EMAIL_REPLY_TO: 'reply', PUBLIC_WEBSITE_ORIGIN: 'https://example.com',
};

describe('recovery runner', () => {
  it('requires explicit ownership and a pinned project endpoint', () => {
    expect(readRecoveryConfig(env).databaseUrl).toBe(env.ADMISSION_RECOVERY_DATABASE_URL);
    expect(readRecoveryConfig({ ...env, ADMISSION_RECOVERY_DATABASE_ROLE: 'ems_recovery', ADMISSION_RECOVERY_DATABASE_URL: env.ADMISSION_RECOVERY_DATABASE_URL.replace('postgres.ref', 'ems_recovery.ref') }).databaseUrl).toContain('ems_recovery.ref');
    expect(() => readRecoveryConfig({ ...env, ADMISSION_RECOVERY_OWNER: 'queue' })).toThrow();
    expect(() => readRecoveryConfig({ ...env, ADMISSION_RECOVERY_EXPECTED_PROJECT_REF: 'other' })).toThrow();
    expect(() => readRecoveryConfig({ ...env, ADMISSION_RECOVERY_DATABASE_URL: env.ADMISSION_RECOVERY_DATABASE_URL.replace(':5432', ':6543') })).toThrow();
    expect(() => readRecoveryConfig({ ...env, ADMISSION_RECOVERY_DATABASE_URL: env.ADMISSION_RECOVERY_DATABASE_URL.replace('sslmode=require', 'sslmode=disable') })).toThrow();
  });

  it('rejects unsupported RPCs and reads without sending SQL', async () => {
    const query = vi.fn().mockResolvedValue([{ data: true }]);
    const client = createRecoveryClient(query);

    expect((await client.rpc('anything' as never)).error).toBeTruthy();
    expect((await client.from('annual_conference_tickets').select('*').eq('id', 'x').single()).error).toBeTruthy();
    expect(query).not.toHaveBeenCalled();
    expect((await client.rpc('lease_admission_dispatch' as never, { p_token: 'x', p_seconds: 60 } as never)).data).toBe(true);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('binds the frozen payload as JSON text for conversion to a JSON object', async () => {
    const query = vi.fn().mockResolvedValue([{ data: {} }]);
    const client = createRecoveryClient(query);
    const payload = { subject: 'Ticket', to: ['attendee@example.test'] };

    await client.rpc('freeze_annual_conference_admission_email' as never, {
      p_id: 'delivery', p_claim: 'claim', p_payload: payload,
    } as never);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('$3::text::jsonb'),
      ['delivery', 'claim', JSON.stringify(payload)],
    );
  });

  it('wakes for due work, continues productive batches and never overlaps', async () => {
    const controller = new AbortController();
    const delays: number[] = [];
    let active = false;
    const runBatch = vi.fn(async () => {
      expect(active).toBe(false);
      active = true;
      await Promise.resolve();
      active = false;

      return { configured: true, accepted: runBatch.mock.calls.length === 2 ? 1 : 0, failed: 0 };
    });

    await runRecoveryLoop({ runBatch, nextDue: async () => new Date(2000).toISOString(), signal: controller.signal, now: () => 0,
      sleep: async ms => {
        delays.push(ms);
        if (delays.length === 3) controller.abort();
      }, log: () => {} });
    expect(delays).toEqual([2000, 2000, 2000]);
  });

  it('backs off failures and avoids polling unproductive past due work', async () => {
    const controller = new AbortController();
    const delays: number[] = [];
    let calls = 0;

    await runRecoveryLoop({ runBatch: async () => {
      calls += 1;
      if (calls < 3) throw new Error();

      return { configured: true, accepted: 0, failed: 0 };
    },
      nextDue: async () => new Date(0).toISOString(), signal: controller.signal, now: () => 100,
      sleep: async ms => {
        delays.push(ms);
        if (delays.length === 3) controller.abort();
      }, log: () => {} });
    expect(delays).toEqual([1000, 2000, 1000]);
  });
  it('respects cooldowns and parked queues after failed batches', async () => {
    const controller = new AbortController();
    const delays: number[] = [];
    let calls = 0;

    await runRecoveryLoop({ runBatch: async () => ({ configured: true, accepted: 0, failed: 1 }),
      nextDue: async () => {
        calls += 1;

        return calls === 1 ? new Date(10_000).toISOString() : null;
      },
      signal: controller.signal, now: () => 0,
      sleep: async ms => {
        delays.push(ms);
        if (delays.length === 2) controller.abort();
      }, log: () => {} });
    expect(delays).toEqual([10_000, 300_000]);
  });

  it('continues productive work only while another item is due', async () => {
    const controller = new AbortController();
    const delays: number[] = [];

    await runRecoveryLoop({ runBatch: async () => ({ configured: true, accepted: 1, failed: 0 }),
      nextDue: async () => new Date(0).toISOString(), signal: controller.signal, now: () => 100,
      sleep: async ms => {
        delays.push(ms);
        controller.abort();
      }, log: () => {} });
    expect(delays).toEqual([1000]);
  });

  it('interrupts idle sleep and finishes an in-flight batch before stopping', async () => {
    const sleepController = new AbortController();
    const sleeping = abortableSleep(300_000, sleepController.signal);

    sleepController.abort();
    await expect(sleeping).resolves.toBeUndefined();
    const controller = new AbortController();
    const runBatch = vi.fn(async () => {
      controller.abort();
      await Promise.resolve();

      return { configured: true, accepted: 1, failed: 0 };
    });
    const sleep = vi.fn();

    await runRecoveryLoop({ runBatch, nextDue: async () => null, signal: controller.signal, sleep, log: () => {} });
    expect(runBatch).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('retries when work becomes due just after an empty batch', async () => {
    const controller = new AbortController();
    const delays: number[] = [];
    let batches = 0;
    let currentTime = 1000;

    await runRecoveryLoop({
      runBatch: async () => {
        batches += 1;
        if (batches === 1) currentTime = 2000;

        return { configured: true, accepted: batches === 2 ? 1 : 0, failed: 0 };
      },
      nextDue: async () => batches === 1 ? new Date(1500).toISOString() : null,
      now: () => currentTime,
      signal: controller.signal,
      sleep: async (ms) => {
        delays.push(ms);
        if (batches === 2) controller.abort();
      },
      log: () => {},
    });
    expect(batches).toBe(2);
    expect(delays).toEqual([1000, 300_000]);
  });

  it('backs off repeated past-due batches with no progress and resets after progress', async () => {
    const controller = new AbortController();
    const delays: number[] = [];
    let batches = 0;

    await runRecoveryLoop({
      runBatch: async () => {
        batches += 1;

        return { configured: true, accepted: batches === 4 ? 1 : 0, failed: 0 };
      },
      nextDue: async () => new Date(0).toISOString(),
      now: () => 100,
      signal: controller.signal,
      sleep: async (ms) => {
        delays.push(ms);
        if (batches === 5) controller.abort();
      },
      log: () => {},
    });
    expect(delays).toEqual([1000, 2000, 4000, 1000, 1000]);
  });
});
