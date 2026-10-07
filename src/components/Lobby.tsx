import { useState } from 'react';
import type { CSSProperties } from 'react';
import { api } from '../lib/api';
import { roomPath } from '../lib/router';
import { TEAM_INFO, soloRounds, type Mode, type Player, type RoomState, type Team } from '../lib/types';
import type { RoomConnection } from '../hooks/useRoom';
import { useAction } from '../hooks/useAction';
import { Logo } from './Logo';
import { SoundToggle } from './SoundToggle';

interface Props {
  conn: RoomConnection;
  state: RoomState;
  userId: string;
  onLeave: () => void;
}

export function Lobby({ conn, state, userId, onLeave }: Props) {
  const { room, players } = state;
  const isHost = room.host_id === userId;
  const { run, busy, error } = useAction();
  const [copied, setCopied] = useState(false);

  const act = (fn: () => Promise<unknown>) => void run(fn).then(() => conn.refresh());

  const teamA = players.filter((p) => p.team === 'A');
  const teamB = players.filter((p) => p.team === 'B');

  let blocker: string | null = null;
  if (room.mode === 'solo' && players.length < 2) blocker = 'Il faut au moins 2 joueurs.';
  if (room.mode === 'team') {
    if (players.length < 4) blocker = 'Il faut au moins 4 joueurs.';
    else if (teamA.length < 2 || teamB.length < 2) blocker = 'Chaque équipe doit avoir au moins 2 joueurs.';
  }

  const sets = room.mode === 'solo' ? soloRounds(players.length) : room.team_sets;

  const share = async () => {
    const url = window.location.origin + roomPath(room.code);
    const text = `Viens jouer à Dessineo Ary ! Code de la salle : ${room.code}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Dessineo Ary !', text, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // partage annulé
    }
  };

  const setMode = (mode: Mode) => act(() => api.updateSettings(room.id, mode, room.team_sets));
  const setSets = (n: number) => act(() => api.updateSettings(room.id, room.mode, n));
  const joinTeam = (team: Team) => act(() => api.setMyTeam(room.id, team));

  return (
    <div className="page lobby">
      <header className="topbar">
        <Logo small />
        <div className="topbar-actions">
          <SoundToggle />
          <button className="btn btn-ghost" onClick={onLeave}>
            Quitter
          </button>
        </div>
      </header>

      <section className="card room-code-card anim-up">
        <p className="muted">Code de la salle</p>
        <div className="room-code" aria-label={room.code}>
          {room.code.split('').map((c, i) => (
            <span key={i} style={{ '--i': i } as CSSProperties} aria-hidden="true">
              {c}
            </span>
          ))}
        </div>
        <button className="btn" onClick={share}>
          {copied ? '✅ Lien copié !' : '🔗 Inviter des amis'}
        </button>
      </section>

      <section className="card anim-up" style={{ '--d': '0.1s' } as CSSProperties}>
        <h3>Réglages {isHost ? '' : <span className="muted small">(choisis par l’hôte)</span>}</h3>
        <div className="segmented" role="radiogroup" aria-label="Mode de jeu">
          {(['solo', 'team'] as const).map((m) => (
            <button
              key={m}
              role="radio"
              aria-checked={room.mode === m}
              className={room.mode === m ? 'active' : ''}
              disabled={!isHost || busy}
              onClick={() => setMode(m)}
            >
              {m === 'solo' ? '👤 Solo' : '👥 Équipe'}
            </button>
          ))}
        </div>

        {room.mode === 'team' && (
          <div className="segmented small" role="radiogroup" aria-label="Nombre de sets">
            {[3, 5].map((n) => (
              <button
                key={n}
                role="radio"
                aria-checked={room.team_sets === n}
                className={room.team_sets === n ? 'active' : ''}
                disabled={!isHost || busy}
                onClick={() => setSets(n)}
              >
                {n} sets
              </button>
            ))}
          </div>
        )}

        <p className="mode-summary">
          {room.mode === 'solo'
            ? `Chacun dessine à son tour (45 s). Le premier qui trouve gagne 1 point. ${sets} sets avec ${players.length} joueur${players.length > 1 ? 's' : ''}.`
            : `Le dessinateur choisit une catégorie et a 30 s. Ses coéquipiers devinent : 1 point par mot trouvé. ${sets} sets (${sets * 2} dessins).`}
        </p>
      </section>

      <section className="card anim-up" style={{ '--d': '0.2s' } as CSSProperties}>
        <h3>Joueurs ({players.length}/12)</h3>
        {room.mode === 'solo' ? (
          <ul className="player-list">
            {players.map((p) => (
              <PlayerChip key={p.user_id} player={p} hostId={room.host_id} userId={userId} online={conn.online} />
            ))}
          </ul>
        ) : (
          <>
            <div className="teams">
              {(['A', 'B'] as const).map((team) => {
                const members = team === 'A' ? teamA : teamB;
                const mine = players.find((p) => p.user_id === userId)?.team === team;
                return (
                  <div key={team} className={`team-col ${TEAM_INFO[team].className}`}>
                    <h4>
                      {TEAM_INFO[team].emoji} {TEAM_INFO[team].name} ({members.length})
                    </h4>
                    <ul className="player-list">
                      {members.map((p) => (
                        <PlayerChip key={p.user_id} player={p} hostId={room.host_id} userId={userId} online={conn.online} />
                      ))}
                    </ul>
                    {!mine && (
                      <button className="btn btn-small" disabled={busy} onClick={() => joinTeam(team)}>
                        Rejoindre
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            {isHost && (
              <button className="btn btn-ghost btn-small" disabled={busy} onClick={() => act(() => api.shuffleTeams(room.id))}>
                🔀 Mélanger les équipes
              </button>
            )}
          </>
        )}
      </section>

      <footer className="lobby-footer">
        {isHost ? (
          <>
            <button
              className={`btn btn-primary btn-big shine${blocker === null ? ' ready-pulse' : ''}`}
              disabled={busy || blocker !== null}
              onClick={() => act(() => api.startGame(room.id))}
            >
              🚀 Lancer la partie
            </button>
            {blocker && <p className="muted">{blocker}</p>}
          </>
        ) : (
          <p className="muted waiting loading-dots">⏳ En attente du lancement par l’hôte</p>
        )}
        {error && <p className="error">{error}</p>}
      </footer>
    </div>
  );
}

function PlayerChip({
  player,
  hostId,
  userId,
  online,
}: {
  player: Player;
  hostId: string;
  userId: string;
  online: Set<string>;
}) {
  const isOnline = online.has(player.user_id) || player.user_id === userId;
  return (
    <li className={`player-chip${isOnline ? '' : ' offline'}`}>
      <span className="avatar" aria-hidden="true">
        {player.nickname.slice(0, 1).toUpperCase()}
      </span>
      <span className="name">
        {player.nickname}
        {player.user_id === userId && <span className="muted small"> (vous)</span>}
      </span>
      {player.user_id === hostId && (
        <span className="badge" title="Hôte">
          👑
        </span>
      )}
    </li>
  );
}
