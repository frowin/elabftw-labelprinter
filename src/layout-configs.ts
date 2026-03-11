export interface EntityData {
  title: string;
  id: number;
  elabid: string;
  date: string;
  custom_id: string | null;
  category_title: string | null;
  fullname: string | null;
}

export interface LayoutArea {
  width: number;
  height: number;
  margin: number;
}

export interface LayoutConfig {
  id: string;
  name: string;
  description: string;
  render: (ctx: CanvasRenderingContext2D, data: EntityData, qrImg: HTMLImageElement | null, area: LayoutArea) => void;
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, font: string): string {
  if (!text) return '';
  ctx.font = font;
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '\u2026').width > maxWidth) t = t.slice(0, -1);
  return t + '\u2026';
}

/** Gibt den Titel als 1 Zeile zurück (wenn er passt) oder aufgeteilt in 2 Zeilen. */
function titleLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, font: string): string[] {
  if (!text) return [];
  ctx.font = font;
  if (ctx.measureText(text).width <= maxWidth) return [text];
  const words = text.trim().split(/\s+/);
  let line1 = '';
  let line2 = '';
  for (const word of words) {
    const candidate = line1 ? line1 + ' ' + word : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      line1 = candidate;
    } else {
      line2 = line2 ? line2 + ' ' + word : word;
    }
  }
  if (!line2) return [line1];
  return [line1, line2];
}

export const layoutConfigs: LayoutConfig[] = [
  {
    id: 'qr-right-detailed',
    name: 'QR + detailed',
    description: 'QR code left, with title, category, owner and date.',
    render(ctx, data, qrImg, area) {
      const m = area.margin;
      const qrSize = area.height - m * 2;
      const idBandWidth = Math.min(20, Math.max(10, qrSize * 0.25));
      const qrX = m + idBandWidth;
      const textX = qrX + qrSize + 6;
      const textW = area.width - textX - m;

      if (qrImg) {
        ctx.drawImage(qrImg, qrX, m, qrSize, qrSize);

        const idText = `#${data.id}`;
        const fontSize = 17; //Math.min(12, idBandWidth - 2);

        ctx.save();
        ctx.fillStyle = '#000';
        ctx.font = `${fontSize}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.translate(m + idBandWidth / 2 + 17, m + qrSize / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText(idText, 0, 0);
        ctx.restore();
      }

      const lineH = 16; // Math.min(13, Math.floor((area.height - m * 2) / 5));
      const titleFont = `bold ${lineH}px Arial, sans-serif`;
      const bodyFont = `${lineH - 2}px Arial, sans-serif`;
      const dateFont = `${lineH - 4}px Arial, sans-serif`;

      ctx.font = titleFont;
      const titleLinesArr = titleLines(ctx, data.title, textW, titleFont);
      const totalHeight =
        titleLinesArr.length * (lineH + 1) +
        (data.category_title ? lineH-2 : 0) +
        (data.fullname ? lineH-2 : 0) +
        lineH;
      const startY = m + (qrSize - totalHeight) / 2 + lineH;

      let y = startY;
      ctx.fillStyle = '#000';

      ctx.font = titleFont;
      for (const line of titleLinesArr) {
        ctx.fillText(line, textX, y);
        y += lineH + 1;
      }

      ctx.font = bodyFont;
      if (data.category_title) {
        ctx.fillText(fitText(ctx, data.category_title, textW, bodyFont), textX, y);
        y += lineH-2;
      }

      if (data.fullname) {
        ctx.fillText(fitText(ctx, data.fullname, textW, bodyFont), textX, y);
        y += lineH-2;
      }
      ctx.fillText(fitText(ctx, data.date, textW, dateFont), textX, y);
    },
  },
  {
    id: 'qr-only',
    name: 'QR only',
    description: 'Large centered QR code.',
    render(ctx, data, qrImg, area) {
      if (!qrImg) return;

      const count = 4;
      const gap = 1; // Abstand zwischen QR-Codes

      const idText = `#${data.id}`;
      const idFontSize = 14;

      const availableW = area.width - gap * (count - 1);
      const qrSize = area.height - area.margin * 2; // Math.floor(Math.min(cellW, maxQrH));
      const cellW = qrSize + gap;

      // QR ohne Margin oben (y = 0)
      const qrY = 0;
      const textY = qrY + qrSize -4;

      for (let i = 0; i < count; i++) {
        const cellX = i * (cellW + gap);
        const qrX = cellX + (cellW - qrSize) / 2;

        ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);

        ctx.save();
        ctx.fillStyle = '#000';
        ctx.font = `${idFontSize}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(idText, cellX + cellW / 2, textY);
        ctx.restore();

        // Vertikale Schnittmarke mittig im Gap (nicht nach dem letzten Code)
        if (i < count) {
          const markX = (i + 1) * cellW + i * gap + gap / 2;
          ctx.save();
          ctx.strokeStyle = '#000';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(markX, 0);
          ctx.lineTo(markX, area.height);
          ctx.stroke();
          ctx.restore();
        }
      }
    },
  },
  {
    id: 'text-only',
    name: 'Text only',
    description: 'Title, ID and date — no QR code, full width.',
    render(ctx, data, _qrImg, area) {
      const m = area.margin;
      const textW = area.width - m * 2;
      const lineH = Math.min(16, Math.floor((area.height - m * 2) / 4));
      const titleFont = `bold ${lineH + 2}px Arial, sans-serif`;
      const bodyFont = `${lineH}px Arial, sans-serif`;
      const monoFont = `${lineH - 2}px monospace`;

      let y = m + lineH + 2;
      ctx.fillStyle = '#000';

      ctx.font = titleFont;
      ctx.fillText(fitText(ctx, data.title, textW, titleFont), m, y);
      y += lineH + 4;

      ctx.font = bodyFont;
      ctx.fillText(fitText(ctx, `${data.custom_id || '#' + data.id}  |  ${data.date}`, textW, bodyFont), m, y);
      y += lineH + 2;

      if (y + lineH <= area.height - m) {
        ctx.font = monoFont;
        ctx.fillText(fitText(ctx, data.elabid.substring(0, 30), textW, monoFont), m, y);
      }
    },
  },
];

export function getLayoutConfig(id: string): LayoutConfig {
  return layoutConfigs.find(c => c.id === id) ?? layoutConfigs[0];
}
