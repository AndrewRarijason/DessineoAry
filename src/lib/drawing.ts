// Coordonnées logiques du canevas (ratio 4:3), indépendantes de la taille de l'écran
export const CANVAS_W = 1000;
export const CANVAS_H = 750;

export interface Stroke {
  id: string;
  color: string;
  size: number;
  /** x0, y0, x1, y1… en coordonnées logiques entières */
  points: number[];
}

export type DrawMessage =
  | { event: 'draw'; payload: { roundId: string; id: string; color: string; size: number; points: number[] } }
  | { event: 'undo'; payload: { roundId: string; id: string } }
  | { event: 'clear'; payload: { roundId: string } }
  | { event: 'sync_req'; payload: { roundId: string; from: string } }
  | { event: 'sync'; payload: { roundId: string; strokes: Stroke[]; forDrawer?: boolean } };

export const DRAW_EVENTS = ['draw', 'undo', 'clear', 'sync_req', 'sync'] as const;

export const COLORS = [
  '#1f1f1f', '#7a7a7a', '#ffffff', '#e63946', '#ff7a00', '#ffd60a',
  '#2a9d3f', '#00b4d8', '#1d4ed8', '#8e44ad', '#ff70a6', '#8b5a2b',
];

export const SIZES = [4, 10, 20, 40];

export const ERASER_COLOR = '#ffffff';

export function newStrokeId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke, from = 0): void {
  const p = stroke.points;
  if (p.length < 2) return;
  ctx.strokeStyle = stroke.color;
  ctx.fillStyle = stroke.color;
  ctx.lineWidth = stroke.size;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (p.length === 2) {
    ctx.beginPath();
    ctx.arc(p[0], p[1], stroke.size / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  // On repart du point précédent pour relier les segments reçus par paquets
  const start = Math.max(0, from - 2);
  ctx.beginPath();
  ctx.moveTo(p[start], p[start + 1]);
  for (let i = start + 2; i < p.length; i += 2) {
    ctx.lineTo(p[i], p[i + 1]);
  }
  ctx.stroke();
}
