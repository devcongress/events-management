import type { AnnualConferencePhase } from './annual-conference-work-plan';

function dateOrdinal(value: string): number {
  return Math.floor(Date.parse(`${value}T00:00:00Z`) / 86_400_000);
}

function dayLabel(value: number): string {
  return `${value} ${value === 1 ? 'day' : 'days'}`;
}

export function annualConferencePhaseTiming(
  phase: Pick<AnnualConferencePhase, 'starts_on' | 'ends_on'>,
  today: string,
): string {
  const currentDay = dateOrdinal(today);
  const startDay = dateOrdinal(phase.starts_on);
  const endDay = dateOrdinal(phase.ends_on);

  if (currentDay < startDay) return `Starts in ${dayLabel(startDay - currentDay)}`;
  if (currentDay === endDay) return 'Ends today';
  if (currentDay > endDay) return `Ended ${dayLabel(currentDay - endDay)} ago`;

  return `${dayLabel(endDay - currentDay)} remaining`;
}
