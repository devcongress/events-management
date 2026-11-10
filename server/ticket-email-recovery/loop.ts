type Counts = { configured: boolean; accepted: number; failed: number };
type LoopOptions = {
  runBatch: () => Promise<Counts>;
  nextDue: () => Promise<string | null>;
  signal: AbortSignal;
  once?: boolean;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  now?: () => number;
  log?: (entry: Record<string, unknown>) => void;
};

export async function abortableSleep(ms: number, signal: AbortSignal) {
  if (signal.aborted) return;
  await new Promise<void>((resolve) => {
    const done = () => { clearTimeout(timer); signal.removeEventListener('abort', done); resolve(); };
    const timer = setTimeout(done, ms);

    signal.addEventListener('abort', done, { once: true });
    if (signal.aborted) done();
  });
}

export async function runRecoveryLoop(options: LoopOptions) {
  const sleep = options.sleep ?? abortableSleep;
  const now = options.now ?? Date.now;
  const log = options.log ?? (entry => console.info(JSON.stringify(entry)));
  let failures = 0;
  let noProgress = 0;
  let lastSuccess: string | null = null;
  let succeeded = false;

  while (!options.signal.aborted) {
    let delay = 300_000;

    const scheduleDelay = async (productive: boolean) => {
      const due = await options.nextDue();
      const dueMs = due === null ? null : Date.parse(due);

      if (dueMs !== null && !Number.isFinite(dueMs)) throw new Error('Invalid recovery schedule.');
      if (dueMs === null || dueMs > now() || productive) noProgress = 0;
      if (dueMs === null) return 300_000;
      if (dueMs > now()) return Math.max(1000, Math.min(300_000, dueMs - now()));
      if (productive) return 1000;

      // Work can become due after an empty claim; bound repeated no-progress polls.
      noProgress += 1;

      return Math.min(300_000, 1000 * 2 ** Math.min(noProgress - 1, 9));
    };

    try {
      const counts = await options.runBatch();

      if (!counts.configured) throw new Error('Recovery is not configured.');
      succeeded = counts.failed === 0;
      failures = succeeded ? 0 : failures + 1;
      if (succeeded) lastSuccess = new Date(now()).toISOString();
      delay = await scheduleDelay(counts.accepted > 0);
      if (!succeeded) delay = Math.max(delay, Math.min(300_000, 1000 * 2 ** Math.min(failures - 1, 9)));
      log({ event: 'admission_recovery_batch', accepted: counts.accepted, failed: counts.failed, lastSuccess, sleepMs: delay });
    } catch {
      succeeded = false;
      failures += 1;
      delay = Math.min(300_000, 1000 * 2 ** Math.min(failures - 1, 9));
      try {
        // A known future cooldown or empty queue still takes precedence after errors.
        const due = await options.nextDue();
        const dueMs = due === null ? null : Date.parse(due);

        if (dueMs === null) delay = 300_000;
        else if (Number.isFinite(dueMs) && dueMs > now()) delay = Math.max(delay, Math.min(300_000, dueMs - now()));
      } catch {
        // Database availability is unknown; retry with bounded exponential backoff.
      }
      log({ event: 'admission_recovery_error', failures, lastSuccess, sleepMs: delay });
    }
    if (options.once || options.signal.aborted) break;
    await sleep(delay, options.signal);
  }

  return succeeded;
}
