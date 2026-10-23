import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, rgb } from 'pdf-lib';
import QRCode from 'qrcode';
import { conferenceTicketDesign } from '@/lib/email/templates/conference-ticket-design';
import { ticketFont, ticketLogo, ticketBoldFont } from './assets/conference-ticket-assets';

export async function conferenceTicketPdf(input: { token: string; name: string; seat: number; isTest: boolean }): Promise<Uint8Array> {
  const document = await PDFDocument.create();

  document.registerFontkit(fontkit);
  const font = await document.embedFont(Buffer.from(ticketFont, 'base64'), { subset: true });
  const bold = await document.embedFont(Buffer.from(ticketBoldFont, 'base64'), { subset: true });
  const logo = await document.embedPng(Buffer.from(ticketLogo, 'base64'));
  const page = document.addPage([420, 660]);
  const color = (hex: string) => rgb(...([1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255) as [number, number, number]));
  const ink = color(conferenceTicketDesign.ink);
  const pink = color(conferenceTicketDesign.pink);
  const text = (value: string, x: number, y: number, size: number) => {
    page.drawText(value, { x, y, size, font, color: ink });
  };

  page.drawRectangle({ x: 0, y: 0, width: 420, height: 660, color: color(conferenceTicketDesign.paper) });
  page.drawRectangle({ x: 0, y: 584, width: 420, height: 76, color: ink });
  page.drawImage(logo, { x: 28, y: 608, width: 190, height: 190 * logo.height / logo.width });
  page.drawRectangle({ x: 0, y: 580, width: 420, height: 5, color: pink });
  page.drawText('YOUR CONFERENCE TICKET', { x: 28, y: 551, size: 9, font: bold, color: pink });
  page.drawText('DevCon26', { x: 28, y: 513, size: 30, font: bold, color: ink });
  text('Saturday, 19 December 2026', 28, 487, 12);
  text('Ghana Digital Center, Accra', 28, 468, 11);
  page.drawLine({ start: { x: 28, y: 450 }, end: { x: 392, y: 450 }, thickness: 0.7, color: color(conferenceTicketDesign.border) });

  const name = input.name.replace(/[\r\n\t]/g, ' ').trim();
  let displayName = name;

  while (displayName.length > 0 && font.widthOfTextAtSize(displayName, 15) > 360) {
    displayName = Array.from(displayName).slice(0, -1).join('');
  }
  text(displayName === name ? name : `${displayName.trimEnd()}…`, 28, 423, 15);
  text(`Individual ticket | Ticket ${input.seat}`, 28, 403, 10);

  const matrix = QRCode.create(input.token, { errorCorrectionLevel: 'M' }).modules;
  const size = 232;
  const moduleSize = size / (matrix.size + 8);
  const left = 94;
  const bottom = 152;

  page.drawRectangle({ x: left, y: bottom, width: size, height: size, color: rgb(1, 1, 1) });
  for (let row = 0; row < matrix.size; row += 1) {
    for (let column = 0; column < matrix.size; column += 1) {
      if (!matrix.get(row, column)) continue;
      page.drawRectangle({
        x: left + (column + 4) * moduleSize,
        y: bottom + (matrix.size + 3 - row) * moduleSize,
        width: moduleSize, height: moduleSize, color: rgb(0, 0, 0),
      });
    }
  }
  page.drawLine({ start: { x: 16, y: 136 }, end: { x: 404, y: 136 }, thickness: 0.7,
    dashArray: [3, 4], color: color(conferenceTicketDesign.border) });
  page.drawCircle({ x: 0, y: 136, size: 9, color: rgb(1, 1, 1) });
  page.drawCircle({ x: 420, y: 136, size: 9, color: rgb(1, 1, 1) });
  if (input.isTest) {
    page.drawRectangle({ x: 28, y: 90, width: 364, height: 28, color: color(conferenceTicketDesign.yellow) });
    text('TEST TICKET - NOT VALID FOR ADMISSION', 40, 100, 11);
    text('No money was charged. This PDF is for preview testing.', 28, 69, 9);
  } else {
    text('Show this QR at the entrance. One scan admits one person.', 28, 110, 10);
  }
  text('Keep this ticket private. Your conference badge is separate.', 28, 42, 9);
  document.setTitle('DevCon26 ticket');

  return document.save();
}
