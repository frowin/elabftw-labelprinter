export interface LabelConfig {
  id: string;
  name: string;
  widthMm: number;
  heightMm: number;
  dpi: number;
  printheadPx: number;
  printDirection: 'left' | 'top';
  margin: number;
}

function mmToPx(mm: number, dpi: number): number {
  return Math.round(mm * dpi / 25.4);
}

export function getLabelCanvasSize(label: LabelConfig): { width: number; height: number } {
  if (label.printDirection === 'left') {
    return { width: mmToPx(label.widthMm, label.dpi), height: label.printheadPx };
  }
  return { width: label.printheadPx, height: mmToPx(label.heightMm, label.dpi) };
}

export const labelConfigs: LabelConfig[] = [
  {
    id: 'b18-14x50',
    name: 'B18 — 14×50 mm',
    widthMm: 50, heightMm: 14, dpi: 203, printheadPx: 96,
    printDirection: 'left', margin: 4,
  },
  {
    id: 'b18-12x40',
    name: 'B18 — 12×40 mm',
    widthMm: 40, heightMm: 12, dpi: 203, printheadPx: 96,
    printDirection: 'left', margin: 4,
  },
  {
    id: 'b18-15x30',
    name: 'B18 — 15×30 mm (square-ish)',
    widthMm: 30, heightMm: 15, dpi: 203, printheadPx: 96,
    printDirection: 'left', margin: 4,
  },
  {
    id: 'b21-30x40',
    name: 'B21 — 30×40 mm',
    widthMm: 40, heightMm: 30, dpi: 203, printheadPx: 384,
    printDirection: 'left', margin: 8,
  },
];

export function getLabelConfig(id: string): LabelConfig {
  return labelConfigs.find(c => c.id === id) ?? labelConfigs[0];
}
