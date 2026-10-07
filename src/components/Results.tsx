import type { CSSProperties } from 'react';
import { api } from '../lib/api';
import { TEAM_INFO, type Player, type RoomState } from '../lib/types';
import type { RoomConnection } from '../hooks/useRoom';
import { useAction } from '../hooks/useAction';
import { isWinner } from '../hooks/useSound';
import { Logo } from './Logo';
import { Confetti } from './Confetti';
import { SoundToggle } from './SoundToggle';

interface Props {
  conn: RoomConnection;
  state: RoomState;
  userId: string;
  onLeave: () => void;
}

const MEDALS = ['🥇', '🥈', '🥉'];

export function Results({ conn, state, userId, onLeave }: Props) {
  const { room, players } = state;
  const isHost = room.host_id === userId;
  const { run, busy, error } = useAction();
  const act = (fn: () => Promise<unknown>) => void run(fn).then(() => conn.refresh());

  const ranked = [...players].sort((a, b) => b.score - a.score || a.nickname.localeCompare(b.nickname));
  const rankOf = (p: Player) => ranked.findIndex((q) => q.score === p.score);

  let headline: string;
  if (room.mode === 'team') {
    const a = room.team_a_score;
    const b = room.team_b_score;
    headline =
      a === b
        ? `🤝 Égalité parfaite, ${a} à ${b} !`
        : `🏆 ${TEAM_INFO[a > b ? 'A' : 'B'].emoji} ${TEAM_INFO[a > b ? 'A' : 'B'].name} gagne ${Math.max(a, b)} à ${Math.min(a, b)} !`;
  } else {
    const best = ranked[0]?.score ?? 0;
    const winners = ranked.filter((p) => p.score === best);
    headline =
      best === 0
        ? '😅 Personne n’a marqué… on remet ça ?'
        : winners.length > 1
          ? `🤝 Égalité entre ${winners.map((w) => w.nickname).join(' et ')} !`
          : `🏆 ${winners[0].nickname} gagne la partie !`;
  }

  return (
    <div className="page results">
      {isWinner(state, userId) && <Confetti count={110} />}
      <header className="topbar">
        <Logo small />
        <div className="topbar-actions">
          <SoundToggle />
          <button className="btn btn-ghost" onClick={onLeave}>
            Quitter
          </button>
        </div>
      </header>

      <section className="card results-card anim-up">
        <h2>Partie terminée</h2>
        <p className="headline">{headline}</p>

        {room.mode === 'team' ? (
          <div className="teams">
            {(['A', 'B'] as const).map((team) => (
              <div key={team} className={`team-col ${TEAM_INFO[team].className}`}>
                <h4>
                  {TEAM_INFO[team].emoji} {TEAM_INFO[team].name}
                </h4>
                <div className="team-final">{team === 'A' ? room.team_a_score : room.team_b_score} pts</div>
                <ul className="player-list">
                  {players
                    .filter((p) => p.team === team)
                    .map((p) => (
                      <li key={p.user_id} className="player-chip">
                        <span className="name">{p.nickname}</span>
                        <span className="muted small">{p.score} trouvé{p.score > 1 ? 's' : ''}</span>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <ol className="ranking">
            {ranked.map((p, i) => (
              <li
                key={p.user_id}
                className={`${p.user_id === userId ? 'me' : ''}${rankOf(p) === 0 ? ' first' : ''}`}
                style={{ '--d': `${0.25 + i * 0.12}s` } as CSSProperties}
              >
                <span className="rank">{MEDALS[rankOf(p)] ?? `${rankOf(p) + 1}.`}</span>
                <span className="name">{p.nickname}</span>
                <span className="points">
                  {p.score} pt{p.score > 1 ? 's' : ''}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <footer className="lobby-footer">
        {isHost ? (
          <div className="row">
            <button className="btn btn-primary btn-big" disabled={busy} onClick={() => act(() => api.startGame(room.id))}>
              🔁 Rejouer
            </button>
            <button className="btn btn-big" disabled={busy} onClick={() => act(() => api.returnToLobby(room.id))}>
              ⚙️ Retour au salon
            </button>
          </div>
        ) : (
          <p className="muted waiting">⏳ L’hôte peut relancer une partie…</p>
        )}
        {error && <p className="error">{error}</p>}
      </footer>
    </div>
  );
}
