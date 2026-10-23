import { PNG } from 'pngjs';
import QRCode from 'qrcode';

// A small bitmap alphabet keeps the PNG label portable in Workers without
// native canvas/font dependencies. The quiet zone and QR pixels stay intact.
const letters: Record<string, string[]> = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '11001', '10101', '10011', '10011', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
};

function label(image: PNG, text: string, top: number, scale: number) {
  const left = Math.floor((image.width - (text.length * 6 - 1) * scale) / 2);

  Array.from(text).forEach((character, index) => {
    if (character === ' ') return;

    const glyph = letters[character];

    if (!glyph) throw new Error('Unsupported test QR label.');

    glyph.forEach((row, y) => Array.from(row).forEach((pixel, x) => {
      if (pixel !== '1') return;

      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const offset = ((top + y * scale + dy) * image.width + left + (index * 6 + x) * scale + dx) * 4;

          image.data.fill(255, offset, offset + 4);
        }
      }
    }));
  });
}

export async function completeTestQrPng(token: string): Promise<Buffer> {
  // Workers resolves qrcode's browser entry, which exposes create but not toBuffer.
  const matrix = QRCode.create(token, { errorCorrectionLevel: 'M' }).modules;
  const margin = 4;
  const scale = 600 / (matrix.size + margin * 2);
  const image = new PNG({ width: 600, height: 720 });

  image.data.fill(0);
  for (let offset = 3; offset < image.data.length; offset += 4) image.data[offset] = 255;
  for (let y = 0; y < 600; y++) {
    for (let x = 0; x < 600; x++) {
      const row = Math.floor(y / scale) - margin;
      const column = Math.floor(x / scale) - margin;
      const dark = row >= 0 && row < matrix.size && column >= 0 && column < matrix.size && matrix.get(row, column);
      const offset = ((y + 60) * image.width + x) * 4;

      image.data.fill(dark ? 0 : 255, offset, offset + 3);
    }
  }
  label(image, 'TEST ONLY', 12, 5);
  label(image, 'NOT VALID FOR ADMISSION', 678, 4);

  return PNG.sync.write(image);
}
