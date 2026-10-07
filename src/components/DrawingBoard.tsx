import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import {
  CANVAS_H, CANVAS_W, COLORS, ERASER_COLOR, SIZES, drawStroke, newStrokeId,
  type DrawMessage, type Stroke,
} from '../lib/drawing';

interface Props {
  roundId: string;
  userId: string;
  drawerId: string;
  /** Le joueur est dessinateur ET la phase de dessin est en cours */
  canDraw: boolean;
  connected: boolean;
  sendDraw: (msg: DrawMessage) => void;
  onDraw: (listener: (msg: DrawMessage) => void) => () => void;
  /** Contenu affiché par-dessus le canevas (choix de catégorie, mot dévoilé…) */
  overlay?: ReactNode;
}

const FLUSH_MS = 100;

export function DrawingBoard({ roundId, userId, drawerId, canDraw, connected, sendDraw, onDraw, overlay }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const currentRef = useRef<Stroke | null>(null);
  /** id du trait -> index du premier nombre pas encore envoyé */
  const pendingRef = useRef(new Map<string, number>());
  const isDrawer = userId === drawerId;
  const live = useRef({ roundId, isDrawer, drawerId });
  live.current = { roundId, isDrawer, drawerId };

  const [color, setColor] = useState(COLORS[0]);
  const [size, setSize] = useState(SIZES[1]);
  const [eraser, setEraser] = useState(false);

  const getCtx = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return null;
    ctx.setTransform(canvas.width / CANVAS_W, 0, 0, canvas.height / CANVAS_H, 0, 0);
    return ctx;
  }, []);

  const redraw = useCallback(() => {
    const ctx = getCtx();
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    for (const stroke of strokesRef.current) drawStroke(ctx, stroke);
  }, [getCtx]);

  const flush = useCallback(() => {
    const pending = pendingRef.current;
    for (const [id, index] of pending) {
      const stroke = strokesRef.current.find((s) => s.id === id);
      if (!stroke) {
        pending.delete(id);
        continue;
      }
      if (stroke.points.length > index) {
        sendDraw({
          event: 'draw',
          payload: {
            roundId: live.current.roundId,
            id: stroke.id,
            color: stroke.color,
            size: stroke.size,
            points: stroke.points.slice(index),
          },
        });
        pending.set(id, stroke.points.length);
      }
      if (stroke !== currentRef.current) pending.delete(id);
    }
  }, [sendDraw]);

  // Taille réelle du canevas = taille affichée × densité de pixels
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.round(canvas.clientWidth * dpr);
      const height = Math.round(canvas.clientHeight * dpr);
      if (width && height && (canvas.width !== width || canvas.height !== height)) {
        canvas.width = width;
        canvas.height = height;
        redraw();
      }
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [redraw]);

  // Nouvelle manche : canevas vierge, puis on récupère le dessin en cours si on arrive en retard
  useEffect(() => {
    strokesRef.current = [];
    currentRef.current = null;
    pendingRef.current.clear();
    redraw();
  }, [roundId, redraw]);

  useEffect(() => {
    if (connected) sendDraw({ event: 'sync_req', payload: { roundId, from: userId } });
  }, [connected, roundId, userId, sendDraw]);

  // Messages reçus des autres joueurs
  useEffect(
    () =>
      onDraw((msg) => {
        const { roundId: current, isDrawer: drawing, drawerId: drawer } = live.current;
        if (msg.payload.roundId !== current) return;

        switch (msg.event) {
          case 'draw': {
            if (drawing) return;
            const { id, color: c, size: sz, points } = msg.payload;
            let stroke = strokesRef.current.find((s) => s.id === id);
            if (!stroke) {
              stroke = { id, color: c, size: sz, points: [] };
              strokesRef.current.push(stroke);
            }
            const from = stroke.points.length;
            stroke.points.push(...points);
            const ctx = getCtx();
            if (ctx) drawStroke(ctx, stroke, from);
            break;
          }
          case 'undo':
            if (drawing) return;
            strokesRef.current = strokesRef.current.filter((s) => s.id !== msg.payload.id);
            redraw();
            break;
          case 'clear':
            if (drawing) return;
            strokesRef.current = [];
            redraw();
            break;
          case 'sync_req':
            if (drawing) {
              flush();
              sendDraw({ event: 'sync', payload: { roundId: current, strokes: strokesRef.current } });
            } else if (msg.payload.from === drawer && strokesRef.current.length > 0) {
              // Le dessinateur a rechargé sa page : un joueur lui renvoie le dessin
              const strokes = strokesRef.current;
              window.setTimeout(
                () => sendDraw({ event: 'sync', payload: { roundId: current, strokes, forDrawer: true } }),
                Math.random() * 400,
              );
            }
            break;
          case 'sync': {
            const forDrawer = Boolean(msg.payload.forDrawer);
            if (drawing !== forDrawer) return;
            if (drawing && strokesRef.current.length > 0) return;
            strokesRef.current = msg.payload.strokes.map((s) => ({ ...s, points: [...s.points] }));
            redraw();
            break;
          }
        }
      }),
    [onDraw, sendDraw, flush, getCtx, redraw],
  );

  // Envoi des points par paquets (≈10 messages/s) pour rester dans le quota gratuit
  useEffect(() => {
    if (!canDraw) return;
    const id = window.setInterval(flush, FLUSH_MS);
    return () => {
      window.clearInterval(id);
      currentRef.current = null;
      flush();
    };
  }, [canDraw, flush]);

  const toLogical = (e: { clientX: number; clientY: number }): [number, number] => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * CANVAS_W);
    const y = Math.round(((e.clientY - rect.top) / rect.height) * CANVAS_H);
    return [Math.min(CANVAS_W, Math.max(0, x)), Math.min(CANVAS_H, Math.max(0, y))];
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!canDraw || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const stroke: Stroke = {
      id: newStrokeId(),
      color: eraser ? ERASER_COLOR : color,
      size: eraser ? size * 2 : size,
      points: toLogical(e),
    };
    strokesRef.current.push(stroke);
    currentRef.current = stroke;
    pendingRef.current.set(stroke.id, 0);
    const ctx = getCtx();
    if (ctx) drawStroke(ctx, stroke);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const stroke = currentRef.current;
    if (!stroke || !canDraw) return;
    const events = e.nativeEvent.getCoalescedEvents?.() ?? [];
    const samples = events.length > 0 ? events : [e.nativeEvent];
    const from = stroke.points.length;
    for (const sample of samples) {
      const [x, y] = toLogical(sample);
      const n = stroke.points.length;
      if (stroke.points[n - 2] === x && stroke.points[n - 1] === y) continue;
      stroke.points.push(x, y);
    }
    if (stroke.points.length > from) {
      const ctx = getCtx();
      if (ctx) drawStroke(ctx, stroke, from);
    }
  };

  const endStroke = () => {
    if (!currentRef.current) return;
    currentRef.current = null;
    flush();
  };

  const undo = () => {
    const stroke = strokesRef.current.pop();
    if (!stroke) return;
    pendingRef.current.delete(stroke.id);
    redraw();
    sendDraw({ event: 'undo', payload: { roundId, id: stroke.id } });
  };

  const clear = () => {
    strokesRef.current = [];
    pendingRef.current.clear();
    redraw();
    sendDraw({ event: 'clear', payload: { roundId } });
  };

  return (
    <div className="board">
      <div className="canvas-wrap">
        <canvas
          ref={canvasRef}
          className={`board-canvas${canDraw ? ' can-draw' : ''}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endStroke}
          onPointerCancel={endStroke}
          onLostPointerCapture={endStroke}
        />
        {overlay}
      </div>
      {canDraw && (
        <div className="toolbar" role="toolbar" aria-label="Outils de dessin">
          <div className="palette">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={`swatch${!eraser && color === c ? ' active' : ''}`}
                style={{ background: c }}
                aria-label={`Couleur ${c}`}
                onClick={() => {
                  setColor(c);
                  setEraser(false);
                }}
              />
            ))}
          </div>
          <div className="tools">
            {SIZES.map((s) => (
              <button
                key={s}
                type="button"
                className={`size-btn${size === s ? ' active' : ''}`}
                aria-label={`Épaisseur ${s}`}
                onClick={() => setSize(s)}
              >
                <span style={{ width: Math.max(4, s / 2), height: Math.max(4, s / 2) }} />
              </button>
            ))}
            <button
              type="button"
              className={`tool-btn${eraser ? ' active' : ''}`}
              onClick={() => setEraser((v) => !v)}
              title="Gomme"
            >
              🧽
            </button>
            <button type="button" className="tool-btn" onClick={undo} title="Annuler">
              ↩️
            </button>
            <button type="button" className="tool-btn" onClick={clear} title="Tout effacer">
              🗑️
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
