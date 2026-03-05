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

export const layoutConfigs: LayoutConfig[] = [
  {
    id: 'qr-right-compact',
    name: 'QR + info',
    description: 'QR code on the left, title / ID / date stacked on the right.',
    render(ctx, data, qrImg, area) {
      const m = area.margin;
      const qrSize = area.height - m * 2;
      const textX = qrSize + m + 6;
      const textW = area.width - textX - m;

      if (qrImg) ctx.drawImage(qrImg, m, m, qrSize, qrSize);

      const lineH = Math.min(14, Math.floor((area.height - m * 2) / 4.5));
      const titleFont = `bold ${lineH}px Arial, sans-serif`;
      const bodyFont = `${lineH - 2}px Arial, sans-serif`;
      const monoFont = `${lineH - 3}px monospace`;

      let y = m + lineH;
      ctx.fillStyle = '#000';

      ctx.font = titleFont;
      ctx.fillText(fitText(ctx, data.title, textW, titleFont), textX, y);
      y += lineH + 2;

      ctx.font = bodyFont;
      ctx.fillText(fitText(ctx, data.custom_id || `#${data.id}`, textW, bodyFont), textX, y);
      y += lineH;

      ctx.fillText(fitText(ctx, data.date, textW, bodyFont), textX, y);
      y += lineH;

      if (y + lineH <= area.height - m) {
        ctx.font = monoFont;
        ctx.fillText(fitText(ctx, data.elabid.substring(0, 20), textW, monoFont), textX, y);
      }
    },
  },
  {
    id: 'qr-right-detailed',
    name: 'QR + detailed',
    description: 'QR code left, with title, category, owner and date.',
    render(ctx, data, qrImg, area) {
      const m = area.margin;
      const qrSize = area.height - m * 2;
      const textX = qrSize + m + 6;
      const textW = area.width - textX - m;

      if (qrImg) ctx.drawImage(qrImg, m, m, qrSize, qrSize);

      const lineH = Math.min(13, Math.floor((area.height - m * 2) / 5));
      const titleFont = `bold ${lineH}px Arial, sans-serif`;
      const bodyFont = `${lineH - 2}px Arial, sans-serif`;

      let y = m + lineH;
      ctx.fillStyle = '#000';

      ctx.font = titleFont;
      ctx.fillText(fitText(ctx, data.title, textW, titleFont), textX, y);
      y += lineH + 1;

      ctx.font = bodyFont;
      if (data.category_title) {
        ctx.fillText(fitText(ctx, data.category_title, textW, bodyFont), textX, y);
        y += lineH;
      }
      ctx.fillText(fitText(ctx, data.custom_id || `#${data.id}`, textW, bodyFont), textX, y);
      y += lineH;

      if (data.fullname && y + lineH <= area.height - m) {
        ctx.fillText(fitText(ctx, data.fullname, textW, bodyFont), textX, y);
        y += lineH;
      }
      if (y + lineH <= area.height - m) {
        ctx.fillText(fitText(ctx, data.date, textW, bodyFont), textX, y);
      }
    },
  },
  {
    id: 'qr-only',
    name: 'QR only',
    description: 'Large centered QR code.',
    render(ctx, _data, qrImg, area) {
      const m = area.margin;
      const qrSize = area.height - m * 2;
      const x = Math.floor((area.width - qrSize) / 2);
      if (qrImg) ctx.drawImage(qrImg, x, m, qrSize, qrSize);
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
