const YOUTUBE_EMBED_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
]);

export function canEmbedPublicMeetupMedia(value: string): boolean {
  try {
    const url = new URL(value);
    if (
      url.protocol !== 'https:'
      || url.username
      || url.password
      || url.port
    ) {
      return false;
    }

    const hostname = url.hostname.toLowerCase();
    if (YOUTUBE_EMBED_HOSTS.has(hostname)) {
      return /^\/embed\/[a-z0-9_-]+\/?$/i.test(url.pathname);
    }

    return hostname === 'player.vimeo.com' && /^\/video\/\d+\/?$/.test(url.pathname);
  } catch {
    return false;
  }
}
