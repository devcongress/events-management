export const SYSTEM_DESIGN_PRESENTER_ROUTE_NAME = 'system-design-presenter';

export function systemDesignPresenterPath(sessionId: string): string {
  return `/present/system-design/${encodeURIComponent(sessionId)}`;
}

export function isSystemDesignPresenterPath(path: string): boolean {
  return /^\/present\/system-design\/[a-f0-9-]{36}$/i.test(path);
}
