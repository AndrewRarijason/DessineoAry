import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';

const COLORS = ['#5b4cf0', '#ffc93c', '#ff4d8d', '#2bc4a8', '#3b82f6', '#ff8a3d'];

/** Pluie de confettis (purement décorative, ~3 s). */
export function Confetti({ count = 70 }: { count?: number }) {
  const [visible, setVisible] = useState(true);

  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        style: {
          left: `${Math.random() * 100}%`,
          background: COLORS[i % COLORS.length],
          width: `${6 + Math.random() * 6}px`,
          height: `${10 + Math.random() * 8}px`,
          borderRadius: Math.random() > 0.6 ? '50%' : '2px',
          animationDelay: `${Math.random() * 0.5}s`,
          animationDuration: `${1.8 + Math.random() * 1.4}s`,
          '--drift': `${(Math.random() - 0.5) * 240}px`,
          '--spin': `${(Math.random() > 0.5 ? 1 : -1) * (360 + Math.random() * 720)}deg`,
        } as CSSProperties,
      })),
    [count],
  );

  useEffect(() => {
    const id = window.setTimeout(() => setVisible(false), 3600);
    return () => window.clearTimeout(id);
  }, []);

  if (!visible) return null;
  return (
    <div className="confetti" aria-hidden="true">
      {pieces.map((p) => (
        <span key={p.id} style={p.style} />
      ))}
    </div>
  );
}
