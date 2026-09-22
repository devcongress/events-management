import type { AnnualConferenceTask } from '@/lib/annual-conference-work-plan';

/**
 * Shows cards that have just entered a board column first, without altering the
 * persisted order used by phone layouts or established cards.
 */
export function annualConferenceTasksForBoard(
  tasks: readonly AnnualConferenceTask[],
): AnnualConferenceTask[] {
  return tasks
    .map((task, index) => ({ task, index }))
    .sort((left, right) => {
      const leftEnteredAt = boardEntryTime(left.task.board_entered_at);
      const rightEnteredAt = boardEntryTime(right.task.board_entered_at);

      if (leftEnteredAt !== null && rightEnteredAt !== null) {
        const byMostRecent = rightEnteredAt - leftEnteredAt;

        if (byMostRecent !== 0) return byMostRecent;
      } else if (leftEnteredAt) {
        return -1;
      } else if (rightEnteredAt) {
        return 1;
      }

      return left.index - right.index;
    })
    .map(({ task }) => task);
}

function boardEntryTime(value: string | null | undefined): number | null {
  if (!value) return null;

  const timestamp = Date.parse(value);

  return Number.isNaN(timestamp) ? null : timestamp;
}
