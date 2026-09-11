import { QueryClient } from '@tanstack/vue-query';
import { describe, expect, it } from 'vitest';
import { queryKeys } from './lib/api';

describe('Annual Conference people query keys', () => {
  const completeDirectory = { organizers: [{ id: 'inactive-member', status: 'inactive' }] };
  const activeTaskMembers = { organizers: [{ id: 'active-member', status: 'active' }] };

  it.each([
    ['People & Access first', true],
    ['conference task members first', false],
  ])('keeps the two membership collections isolated when loading %s', (_label, directoryFirst) => {
    const queryClient = new QueryClient();
    const writes = directoryFirst
      ? [
          [queryKeys.adminOrganizers, completeDirectory],
          [queryKeys.annualConferenceTaskMembers('2026'), activeTaskMembers],
        ] as const
      : [
          [queryKeys.annualConferenceTaskMembers('2026'), activeTaskMembers],
          [queryKeys.adminOrganizers, completeDirectory],
        ] as const;

    for (const [key, data] of writes) queryClient.setQueryData(key, data);

    expect(queryClient.getQueryData(queryKeys.adminOrganizers)).toEqual(completeDirectory);
    expect(queryClient.getQueryData(queryKeys.annualConferenceTaskMembers('2026'))).toEqual(activeTaskMembers);
  });

  it('isolates task-member collections by conference edition', () => {
    expect(queryKeys.annualConferenceTaskMembers('2026')).not.toEqual(
      queryKeys.annualConferenceTaskMembers('2027'),
    );
  });
});
