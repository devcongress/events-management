import { describe, expect, it } from 'vitest';
import app from './app';

describe('monthly finance retirement', () => {
  it('does not register monthly finance endpoints', () => {
    expect(app.routes.filter((route) => route.path.startsWith('/api/events/:eventId/finance'))).toEqual([]);
  });

  it('retains Annual Conference finance reads and mutations', () => {
    const financeRoutes = app.routes.filter((route) => route.path.startsWith('/api/annual-conference/:year/finance'));

    expect(financeRoutes.map(({ method, path }) => `${method} ${path}`)).toEqual(expect.arrayContaining([
      'GET /api/annual-conference/:year/finance',
      'POST /api/annual-conference/:year/finance/budgets',
      'POST /api/annual-conference/:year/finance/entries',
      'POST /api/annual-conference/:year/finance/entries/:entryId/receipts',
    ]));
  });
});
