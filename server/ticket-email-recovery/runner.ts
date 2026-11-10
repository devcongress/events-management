import { Hono } from 'hono';
import { retryAnnualConferenceAdmissionEmails } from '@/server/annual-conference-admission-email-delivery';
import { createRecoveryAdapter } from './adapter';
import { readRecoveryConfig, type RecoveryConfig } from './config';
import { runRecoveryLoop } from './loop';

export async function runTicketEmailRecovery(options: { config: RecoveryConfig; signal: AbortSignal; fetcher?: typeof fetch; once?: boolean }) {
  const adapter = await createRecoveryAdapter(options.config.databaseUrl);
  const app = new Hono();

  app.get('/', async (c) => {
    const succeeded = await runRecoveryLoop({
      runBatch: () => retryAnnualConferenceAdmissionEmails(c, { managed: true, scheduled: true, client: adapter.client, fetcher: options.fetcher }),
      nextDue: adapter.nextDue,
      signal: options.signal,
      once: options.once,
    });

    return c.text('stopped', options.once && !succeeded ? 503 : 200);
  });
  try {
    const response = await app.fetch(new Request('http://localhost/'), options.config.senderEnv);

    if (!response.ok) throw new Error('Recovery batch failed.');
  } finally {
    await adapter.close();
  }
}

if (import.meta.main) {
  const controller = new AbortController();

  process.once('SIGINT', () => controller.abort());
  process.once('SIGTERM', () => controller.abort());
  try {
    if (process.argv.slice(2).some(arg => arg !== '--once')) throw new Error('Unsupported argument.');
    await runTicketEmailRecovery({ config: readRecoveryConfig(Bun.env), signal: controller.signal, once: process.argv.includes('--once') });
  } catch {
    console.error(JSON.stringify({ event: 'admission_recovery_start_failed' }));
    process.exitCode = 1;
  }
}
