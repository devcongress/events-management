const speakerIntakeSubmissionLocks = new Map<string, Promise<void>>();

/**
 * Serializes same-process speaker intake mutations. Database compare-and-set
 * operations remain the cross-instance correctness boundary.
 */
export async function acquireSpeakerIntakeSubmissionLock(key: string): Promise<() => void> {
  const previous = speakerIntakeSubmissionLocks.get(key) ?? Promise.resolve();
  let releaseCurrent!: () => void;
  const current = new Promise<void>((resolve) => {
    releaseCurrent = resolve;
  });
  const queued = previous.then(() => current);
  speakerIntakeSubmissionLocks.set(key, queued);
  await previous;

  return () => {
    releaseCurrent();
    if (speakerIntakeSubmissionLocks.get(key) === queued) {
      speakerIntakeSubmissionLocks.delete(key);
    }
  };
}
