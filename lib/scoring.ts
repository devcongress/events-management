import { STREAK_BONUSES } from './constants';

/**
 * Calculate points for a quiz answer
 * @param basePoints - Base points for a correct answer (e.g., 1000)
 * @param timeLimitMs - Time limit for the question in milliseconds
 * @param timeTakenMs - Time taken to answer in milliseconds
 * @param isCorrect - Whether the answer was correct
 * @returns Points awarded (0 if incorrect, scaled by speed if correct)
 */
export function calculatePoints(
  basePoints: number,
  timeLimitMs: number,
  timeTakenMs: number,
  isCorrect: boolean
): number {
  if (!isCorrect) return 0;

  // Ensure we don't go negative if they answered after time limit
  const timeRemaining = Math.max(0, timeLimitMs - timeTakenMs);

  // Speed bonus: 50% base points + 50% scaled by speed
  // Instant answer = 100% of base
  // Answer at deadline = 50% of base
  const speedBonus = timeRemaining / timeLimitMs;
  const points = Math.round(basePoints * (0.5 + 0.5 * speedBonus));

  return points;
}

/**
 * Calculate streak bonus points
 * @param streakCount - Number of consecutive correct answers
 * @returns Bonus points (0 if no streak, up to 500 for 5+ streak)
 */
export function calculateStreakBonus(streakCount: number): number {
  if (streakCount < 2) return 0;
  if (streakCount >= 5) return STREAK_BONUSES[5];

  return STREAK_BONUSES[streakCount] || 0;
}
