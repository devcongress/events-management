import { paintDigitalBadge } from './devcon26-digital-badge';

export type SpeakerBadge = { display_name: string; role: 'speaker'; crop: { x: number; y: number; scale: number }; photo_available: boolean };

export async function loadSpeakerBadge(path: string): Promise<{ card: SpeakerBadge; photo: File | null }> {
  const result = await fetch(path, { cache: 'no-store' });
  const body = await result.json();

  if (!result.ok) throw new Error(body.error || 'Unable to load the badge.');
  let photo: File | null = null;

  if (body.card.photo_available) {
    const image = await fetch(`${path}/photo`, { cache: 'no-store' });

    if (!image.ok) throw new Error('Unable to load the badge photo.');
    const blob = await image.blob();

    photo = new File([blob], 'portrait', { type: blob.type });
  }

  return { card: body.card, photo };
}

export async function renderSpeakerBadge(canvas: HTMLCanvasElement, card: SpeakerBadge, photo: File | null) {
  const result = await paintDigitalBadge(canvas, card.display_name, photo, { x: card.crop.x, y: card.crop.y, zoom: card.crop.scale }, 'speaker');

  if (!result.valid) throw new Error(result.message);
}

export function canvasPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Unable to export badge.')), 'image/png'));
}

export function saveBadgeFile(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;

  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }

  return (crc ^ 0xffffffff) >>> 0;
}

/** Produce an uncompressed ZIP in-browser so portrait data stays private. */
export async function downloadSpeakerBadgeZip(year: number, speakers: Array<{ sessionId: string; name: string }>) {
  const chunks: BlobPart[] = [];
  const directory: BlobPart[] = [];
  let offset = 0;

  for (const [index, speaker] of speakers.entries()) {
    const path = `/api/annual-conference/${year}/speaker-badges/${encodeURIComponent(speaker.sessionId)}`;
    const { card, photo } = await loadSpeakerBadge(path);
    const canvas = document.createElement('canvas');

    await renderSpeakerBadge(canvas, card, photo);
    const bytes = new Uint8Array(await (await canvasPng(canvas)).arrayBuffer());
    const filename = new TextEncoder().encode(`${String(index + 1).padStart(3, '0')}-${speaker.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 60) || 'speaker'}.png`);
    const crc = crc32(bytes);
    const local = new Uint8Array(30 + filename.length);
    const lv = new DataView(local.buffer);

    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint32(14, crc, true); lv.setUint32(18, bytes.length, true); lv.setUint32(22, bytes.length, true); lv.setUint16(26, filename.length, true); local.set(filename, 30);
    const central = new Uint8Array(46 + filename.length);
    const cv = new DataView(central.buffer);

    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint32(16, crc, true); cv.setUint32(20, bytes.length, true); cv.setUint32(24, bytes.length, true); cv.setUint16(28, filename.length, true); cv.setUint32(42, offset, true); central.set(filename, 46);
    chunks.push(local, bytes); directory.push(central); offset += local.length + bytes.length;
  }
  const directorySize = directory.reduce<number>((size, part) => size + (part as Uint8Array).length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);

  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, speakers.length, true); ev.setUint16(10, speakers.length, true); ev.setUint32(12, directorySize, true); ev.setUint32(16, offset, true);
  saveBadgeFile(new Blob([...chunks, ...directory, end], { type: 'application/zip' }), `devcon${year}-speaker-badges.zip`);
}
