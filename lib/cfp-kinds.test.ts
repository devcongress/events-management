import { describe, expect, it } from 'vitest';
import { allowedCfpKinds, cfpKindsSchema } from './cfp-kinds';

describe('CFP formats', () => {
  it('defaults missing values to both formats', () => {
    expect(allowedCfpKinds(undefined)).toEqual(['talk', 'product_demo']);
  });

  it.each([['talk'], ['product_demo'], ['talk', 'product_demo'], ['product_demo', 'talk']])('accepts %j', (...kinds) => {
    expect(cfpKindsSchema.safeParse(kinds).success).toBe(true);
  });

  it.each([[], ['talk', 'talk'], ['workshop'], ['talk', 'product_demo', 'talk']])('rejects %j', (...kinds) => {
    expect(cfpKindsSchema.safeParse(kinds).success).toBe(false);
  });
});
