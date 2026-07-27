import { initWasm, Resvg } from '@resvg/resvg-wasm';

export type SpeakerArchiveEmailAssetBucket = {
  head(key: string): Promise<unknown>;
  get(key: string): Promise<{ body: ReadableStream | null; httpMetadata?: { contentType?: string }; writeHttpMetadata?: (headers: Headers) => void } | null>;
  put(key: string, value: Uint8Array, options: { httpMetadata: { contentType: string; cacheControl: string } }): Promise<unknown>;
};

export type ArchiveEmailImageUrls = {
  presentationCardUrl: string;
  ctaImageUrl: string;
};

const EMAIL_ASSET_PREFIX = 'speaker-archive-email';
const PRESENTATION_CARD_VERSION = 'v1';
const CTA_VERSION = 'v1';
let rendererReady: Promise<void> | null = null;

function initializeRenderer(): Promise<void> {
  if (!rendererReady) {
    rendererReady = import('@resvg/resvg-wasm/index_bg.wasm').then(({ default: wasm }) => initWasm(wasm));
  }
  return rendererReady;
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function normalizedText(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function truncate(value: string, maxCharacters: number): string {
  const characters = Array.from(normalizedText(value));
  if (characters.length <= maxCharacters) return characters.join('');
  return `${characters.slice(0, Math.max(0, maxCharacters - 1)).join('').trimEnd()}…`;
}

function wrapTitle(value: string): string[] {
  const words = truncate(value, 58).split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= 24 || !current) {
      current = next;
      continue;
    }
    lines.push(current);
    current = word;
    if (lines.length === 2) break;
  }
  if (current && lines.length < 2) lines.push(current);
  return lines.slice(0, 2);
}

async function contentHash(value: string): Promise<string> {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function renderPng(svg: string): Promise<Uint8Array> {
  await initializeRenderer();
  const renderer = new Resvg(svg, {
    font: {
      loadSystemFonts: false,
      defaultFontFamily: 'Arial',
      sansSerifFamily: 'Arial',
      monospaceFamily: 'Courier New',
    },
  });

  try {
    const image = renderer.render();
    try {
      return image.asPng();
    } finally {
      image.free();
    }
  } finally {
    renderer.free();
  }
}

function presentationCardSvg(eventName: string, talkTitle: string): string {
  const titleLines = wrapTitle(talkTitle).map((line, index) => (
    `<text x="44" y="${112 + index * 48}" fill="#111111" font-family="Arial, Helvetica, sans-serif" font-size="38" font-weight="700">${escapeXml(line)}</text>`
  )).join('');
  const eventLabel = truncate(eventName, 44);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="272" viewBox="0 0 600 272">
  <rect width="600" height="272" rx="12" fill="#F5E642"/>
  <rect x="2" y="2" width="596" height="268" rx="10" fill="none" stroke="#111111" stroke-width="4"/>
  <text x="44" y="56" fill="#111111" font-family="Courier New, monospace" font-size="14" font-weight="700" letter-spacing="3">YOUR PRESENTATION</text>
  ${titleLines}
  <text x="44" y="232" fill="#111111" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="700">${escapeXml(eventLabel)}</text>
  <g transform="translate(425 52)" stroke="#111111" stroke-linejoin="round">
    <rect x="28" y="14" width="86" height="116" rx="7" fill="#FFFFFF" stroke-width="5"/>
    <path d="M44 42h56M44 62h38M44 82h52" stroke-width="6"/>
    <path d="M44 104h30" stroke="#E8117F" stroke-width="7"/>
    <rect x="0" y="122" width="94" height="54" rx="6" fill="#E8117F" stroke-width="5"/>
    <path d="M13 139h52M13 156h34" stroke="#FFFFFF" stroke-width="6"/>
    <path d="M4 177h112" stroke-width="7"/>
    <path d="M106 78v66c0 15 13 27 28 27s28-12 28-27V78" fill="none" stroke-width="6"/>
    <rect x="118" y="43" width="32" height="88" rx="16" fill="#FFFFFF" stroke-width="6"/>
    <path d="M118 68h32M118 91h32" stroke="#E8117F" stroke-width="6"/>
    <path d="M134 171v20M112 191h44" stroke-width="6"/>
    <path d="M12 96l-14-12M18 84l-12-18M162 90l15-13M156 77l10-19" stroke="#E8117F" stroke-width="6"/>
  </g>
</svg>`;
}

function ctaSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="76" viewBox="0 0 420 76">
  <rect x="4" y="4" width="408" height="64" rx="8" fill="#F5E642" stroke="#111111" stroke-width="4"/>
  <text x="30" y="45" fill="#111111" font-family="Courier New, monospace" font-size="15" font-weight="700" letter-spacing="1.2">ADD PRESENTATION DETAILS  →</text>
</svg>`;
}

async function ensurePng(bucket: SpeakerArchiveEmailAssetBucket, key: string, svg: string): Promise<void> {
  if (await bucket.head(key)) return;
  const image = await renderPng(svg);
  await bucket.put(key, image, {
    httpMetadata: {
      contentType: 'image/png',
      cacheControl: 'public, max-age=31536000, immutable',
    },
  });
}

export async function prepareArchiveEmailImages(input: {
  bucket: SpeakerArchiveEmailAssetBucket;
  publicOrigin: string;
  eventName: string;
  talkTitle: string;
}): Promise<ArchiveEmailImageUrls> {
  const cardDescriptor = `${PRESENTATION_CARD_VERSION}\n${normalizedText(input.eventName)}\n${normalizedText(input.talkTitle)}`;
  const cardHash = await contentHash(cardDescriptor);
  const cardKey = `${EMAIL_ASSET_PREFIX}/presentation-${cardHash}.png`;
  const ctaKey = `${EMAIL_ASSET_PREFIX}/cta-${CTA_VERSION}.png`;

  await Promise.all([
    ensurePng(input.bucket, cardKey, presentationCardSvg(input.eventName, input.talkTitle)),
    ensurePng(input.bucket, ctaKey, ctaSvg()),
  ]);

  const origin = input.publicOrigin.replace(/\/$/, '');
  return {
    presentationCardUrl: `${origin}/email-assets/${cardKey}`,
    ctaImageUrl: `${origin}/email-assets/${ctaKey}`,
  };
}

export function isSpeakerArchiveEmailAssetKey(value: string): boolean {
  return new RegExp(`^${EMAIL_ASSET_PREFIX}/(?:presentation-[a-f0-9]{64}|cta-${CTA_VERSION})\\.png$`).test(value);
}
