import type { CSSProperties } from 'react';

export function Credits() {
  return (
    <footer className="credits anim-up" style={{ '--d': '0.7s' } as CSSProperties}>
      <h3>Crédits</h3>
      <p>
        Jeu imaginé et développé par <strong>Andrew Rarijason</strong>
      </p>
      <p className="muted small">© 2026 Andrew Rarijason · Dessineo Ary !</p>
    </footer>
  );
}
