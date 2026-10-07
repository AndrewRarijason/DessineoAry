import type { CSSProperties } from 'react';

export function Rules() {
  return (
    <section className="rules">
      <article className="card rule-card anim-up" style={{ '--d': '0.5s' } as CSSProperties}>
        <h3>👤 Mode solo</h3>
        <p className="muted">2 joueurs minimum</p>
        <ul>
          <li>Chacun dessine à son tour un mot tiré au hasard.</li>
          <li>Le dessinateur a <strong>45 secondes</strong>.</li>
          <li>Les autres tapent leurs réponses : <strong>le premier qui trouve gagne 1 point</strong>.</li>
          <li>5 sets minimum, et tout le monde dessine le même nombre de fois.</li>
        </ul>
      </article>
      <article className="card rule-card anim-up" style={{ '--d': '0.6s' } as CSSProperties}>
        <h3>👥 Mode équipe</h3>
        <p className="muted">4 joueurs minimum, 2 équipes</p>
        <ul>
          <li>Le dessinateur choisit une catégorie et reçoit un mot.</li>
          <li>Il a <strong>30 secondes</strong> pour le dessiner.</li>
          <li>Ses coéquipiers devinent : <strong>mot trouvé = 1 point</strong> pour l’équipe.</li>
          <li>Partie en 3 ou 5 sets ; un set = chaque équipe dessine une fois.</li>
        </ul>
      </article>
    </section>
  );
}
