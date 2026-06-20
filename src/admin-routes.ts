const FALLBACK_ADMIN_BASE_PATH = '/organizer-console';
export const ADMIN_OAUTH_REDIRECT_STORAGE_KEY = 'devcon-admin-oauth-redirect';

function normalizeBasePath(value: string | undefined): string {
  const trimmed = value?.trim() || FALLBACK_ADMIN_BASE_PATH;
  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withLeadingSlash.replace(/\/+$/, '') || FALLBACK_ADMIN_BASE_PATH;
}

export const ADMIN_BASE_PATH = normalizeBasePath(import.meta.env.VITE_ADMIN_BASE_PATH);

export function adminPath(path = ''): string {
  if (!path) return ADMIN_BASE_PATH;
  return `${ADMIN_BASE_PATH}/${path.replace(/^\/+/, '')}`;
}

export function isAdminPath(path: string): boolean {
  return path === ADMIN_BASE_PATH || path.startsWith(`${ADMIN_BASE_PATH}/`);
}
