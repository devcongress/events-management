import type { Context } from 'hono';
import { requestEnvValue } from '@/server/request-env';

export function envValue(key: string, c?: Context): string | undefined {
  const honoEnvValue = c?.env?.[key];
  if (typeof honoEnvValue === 'string') {
    return honoEnvValue;
  }

  const scopedEnvValue = requestEnvValue(key);
  if (scopedEnvValue) {
    return scopedEnvValue;
  }

  return typeof Bun === 'undefined' ? process.env[key] : Bun.env[key];
}
