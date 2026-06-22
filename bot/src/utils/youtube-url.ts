const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtu.be',
  'www.youtu.be',
]);

export function isValidYouTubeUrl(raw: string): boolean {
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    const host = url.hostname.toLowerCase();
    if (!YOUTUBE_HOSTS.has(host)) return false;

    if (host.includes('youtu.be')) {
      return url.pathname.length > 1;
    }

    if (url.pathname === '/watch' && url.searchParams.has('v')) return true;
    if (url.pathname.startsWith('/embed/') && url.pathname.length > 7) return true;
    if (url.pathname.startsWith('/live/') && url.pathname.length > 6) return true;
    if (url.pathname.startsWith('/shorts/') && url.pathname.length > 8) return true;

    return false;
  } catch {
    return false;
  }
}

export function normalizeYouTubeUrl(raw: string): string {
  return raw.trim();
}

export function parseRecordingLinksInput(raw: string): string[] {
  const seen = new Set<string>();
  const links: string[] = [];

  for (const part of raw.trim().split(/\s+/)) {
    const normalized = normalizeYouTubeUrl(part);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    links.push(normalized);
  }

  return links;
}
