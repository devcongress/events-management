/** Only link recognized profile URLs or handles; never arbitrary submitted URLs. */
export function xProfile(value: string | null) {
  if (!value?.trim()) return null;
  let handle = value.trim().replace(/^@/, '');
  if (/^(https?:\/\/|(?:www\.)?(?:x|twitter)\.com\/)/i.test(handle)) {
    try {
      const url = new URL(/^https?:\/\//i.test(handle) ? handle : `https://${handle}`);
      if (!['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'].includes(url.hostname)) return null;
      if (!/^\/[A-Za-z0-9_]+\/?$/.test(url.pathname)) return null;
      handle = url.pathname.split('/')[1]!;
    } catch { return null; }
  }
  if (!/^[A-Za-z0-9_]{1,15}$/.test(handle)) return null;
  return { label: `@${handle}`, href: `https://x.com/${handle}` };
}
