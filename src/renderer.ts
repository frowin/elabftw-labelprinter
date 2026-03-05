import { LabelConfig, getLabelCanvasSize } from './label-configs';
import { LayoutConfig, EntityData, LayoutArea } from './layout-configs';

export function loadImageFromDataUrl(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image load failed'));
    img.src = dataUrl;
  });
}

export function renderLabel(
  data: EntityData,
  label: LabelConfig,
  layout: LayoutConfig,
  qrImg: HTMLImageElement | null,
): HTMLCanvasElement {
  const { width, height } = getLabelCanvasSize(label);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  const area: LayoutArea = { width, height, margin: label.margin };
  layout.render(ctx, data, qrImg, area);
  return canvas;
}

export function renderPreview(source: HTMLCanvasElement, target: HTMLCanvasElement, scale: number): void {
  target.width = source.width * scale;
  target.height = source.height * scale;
  const ctx = target.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(source, 0, 0, target.width, target.height);
}
