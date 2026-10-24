const backend = 'https://devcon26-full-test-events-management.admins-a7d.workers.dev';
const website = 'https://feature-devcon26-flexible-ticket-checkout-devcongress-website.admins-a7d.workers.dev';
const jobs = [
  { label: 'admission', path: '/api/internal/annual-conference-admission-emails/retry' },
  { label: 'social', path: '/api/internal/annual-conference-social-card-emails/retry' },
];

export default {
  fetch() {
    return new Response('Not found', { status: 404 });
  },

  async scheduled(_controller: unknown, env: { SLACK_EVENTS_RETRY_SECRET?: string }) {
    const secret = env.SLACK_EVENTS_RETRY_SECRET?.trim();

    if (!secret || secret.length < 32) throw new Error('Preview delivery authentication unavailable.');

    const catalog = await fetch(`${backend}/api/public/annual-conference/2026/complete-test-checkout`, {
      headers: { Origin: website, 'Cache-Control': 'no-store' },
      redirect: 'manual', signal: AbortSignal.timeout(15000),
    });

    if (!catalog.ok) throw new Error(`Preview catalog returned ${catalog.status}.`);

    const state = await catalog.json() as { mode?: string };

    if (state.mode !== 'test') return;

    const results = await Promise.allSettled(jobs.map(async (job) => {
      const response = await fetch(`${backend}${job.path}`, {
        method: 'POST', headers: { 'x-scheduled-job-secret': secret },
        redirect: 'manual', signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) throw new Error(`${job.label} preview delivery returned ${response.status}.`);
      const result = await response.json() as {
        configured?: boolean; accepted?: number; failed?: number;
        admissions?: { configured?: boolean; accepted?: number; failed?: number };
      };
      const delivery = job.label === 'admission' ? result.admissions : result;

      if (!delivery?.configured || !Number.isInteger(delivery.accepted) || !Number.isInteger(delivery.failed)) {
        throw new Error(`${job.label} preview delivery is not configured.`);
      }

      console.info(JSON.stringify({ event: 'preview_email_delivery', queue: job.label,
        accepted: delivery.accepted, failed: delivery.failed }));

      if (delivery.failed! > 0) throw new Error(`${job.label} preview delivery failed.`);
    }));

    if (results.some((result) => result.status === 'rejected')) {
      // Neither provider bodies nor authentication values belong in logs.
      throw new Error('A preview email delivery job failed.');
    }
  },
};
