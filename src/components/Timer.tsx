import { useEffect, useRef, useState } from 'react';
import { secondsLeft } from '../lib/clock';
import { audio } from '../lib/audio';

interface Props {
  endsAt: string;
  total: number;
  /** Tic-tac sonore pendant les 5 dernières secondes */
  ticking?: boolean;
}

export function Timer({ endsAt, total, ticking = false }: Props) {
  const [left, setLeft] = useState(() => secondsLeft(endsAt));
  const lastTick = useRef<number | null>(null);

  useEffect(() => {
    setLeft(secondsLeft(endsAt));
    const id = window.setInterval(() => setLeft(secondsLeft(endsAt)), 200);
    return () => window.clearInterval(id);
  }, [endsAt]);

  useEffect(() => {
    if (!ticking || left < 1 || left > 5 || lastTick.current === left) return;
    lastTick.current = left;
    audio.play('tick');
  }, [left, ticking]);

  const pct = total > 0 ? Math.min(100, (left / total) * 100) : 0;
  const level = left <= 5 ? ' critical' : left <= 10 ? ' urgent' : '';
  return (
    <div className={`timer${level}`} role="timer" aria-live="off">
      <span className="timer-value">{left}s</span>
      <div className="timer-bar">
        <div style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
