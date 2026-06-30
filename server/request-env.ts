import { AsyncLocalStorage } from 'node:async_hooks';

type RequestEnv = Record<string, unknown>;

const requestEnvStorage = new AsyncLocalStorage<RequestEnv>();

export function withRequestEnv<T>(env: RequestEnv | undefined, fn: () => Promise<T>): Promise<T> {
  return requestEnvStorage.run(env ?? {}, fn);
}

export function requestEnvValue(key: string): string | undefined {
  const value = requestEnvStorage.getStore()?.[key];
  return typeof value === 'string' ? value : undefined;
}
