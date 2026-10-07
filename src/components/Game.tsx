import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { api } from '../lib/api';
import { TEAM_INFO, type Category, type Player, type Round, type RoomState, type Team } from '../lib/types';
import type { RoomConnection } from '../hooks/useRoom';
import { useAction } from '../hooks/useAction';
import { DrawingBoard } from './DrawingBoard';
import { GuessPanel } from './GuessPanel';
import { Scoreboard } from './Scoreboard';
import { Timer } from './Timer';
import { Confetti } from './Confetti';
import { SoundToggle } from './SoundToggle';

interface Props {
  conn: RoomConnection;
  state: RoomState;
  userId: string;
  onLeave: () => void;
}

let categoriesCache: Category[] | null = null;

export function Game({ conn, state, userId, onLeave }: Props) {
  const { room, round, players } = state;
  const [categories, setCategories] = useState<Category[]>(categoriesCache ?? []);
  const { run, busy, error } = useAction();

  useEffect(() => {
    if (categoriesCache) return;
    api
      .categories()
      .then((list) => {
        categoriesCache = list;
        setCategories(list);
      })
      .catch(() => undefined);
  }, []);

  if (!round) {
    return (
      <div className="page center">
        <p className="muted">Préparation de la manche…</p>
      </div>
    );
  }

  const me = players.find((p) => p.user_id === userId);
  const isHost = room.host_id === userId;
  const isDrawer = round.drawer_id === userId;
  const drawer = players.find((p) => p.user_id === round.drawer_id);
  const isTeam = room.mode === 'team';

  const phaseTotal = round.phase === 'choosing' ? 15 : round.phase === 'reveal' ? 5 : isTeam ? 30 : 45;
  const setNo = isTeam ? Math.ceil(round.round_no / 2) : round.round_no;
  const totalSets = isTeam ? room.total_rounds / 2 : room.total_rounds;
  const suddenDeath = isTeam && setNo > room.team_sets;

  let disabledReason: string | null = null;
  if (isDrawer) disabledReason = '✏️ C’est vous qui dessinez !';
  else if (isTeam && round.team && me?.team !== round.team)
    disabledReason = `👀 C’est à l’${TEAM_INFO[round.team].name} de deviner.`;
  else if (round.phase === 'choosing') disabledReason = 'Le dessinateur choisit une catégorie…';
  else if (round.phase === 'reveal') disabledReason = 'Manche terminée !';

  const act = (fn: () => Promise<unknown>) => void run(fn).then(() => conn.refresh());

  const overlay =
    round.phase === 'choosing' ? (
      <div className="overlay">
        {isDrawer ? (
          <div className="overlay-box">
            <h3>Choisissez une catégorie</h3>
            <div className="category-grid">
              {categories.map((c) => (
                <button
                  key={c.id}
                  className="category-btn"
                  disabled={busy}
                  onClick={() => act(() => api.chooseCategory(round.id, c.id))}
                >
                  <span className="category-emoji">{c.emoji}</span>
                  {c.name}
                </button>
              ))}
            </div>
            <p className="muted small">Sans choix, une catégorie sera tirée au hasard.</p>
          </div>
        ) : (
          <div className="overlay-box">
            <div className="big-emoji">🤔</div>
            <p>
              <strong>{drawer?.nickname}</strong> choisit une catégorie…
            </p>
          </div>
        )}
      </div>
    ) : round.phase === 'reveal' ? (
      <RevealOverlay round={round} players={players} isTeam={isTeam} />
    ) : null;

  return (
    <div className="page game">
      <header className="game-header">
        <div className="game-meta">
          <span className="set-badge">
            {suddenDeath ? '⚡ Mort subite' : `Set ${setNo}/${totalSets}`}
          </span>
          {round.category && (
            <span className="category-chip">
              {round.category.emoji} {round.category.name}
            </span>
          )}
        </div>
        <WordDisplay round={round} isDrawer={isDrawer} />
        <div className="game-actions">
          <Timer endsAt={round.phase_ends_at} total={phaseTotal} ticking={round.phase === 'drawing'} />
          <SoundToggle />
          <button
            className="btn btn-ghost btn-small"
            onClick={() => window.confirm('Quitter la partie ?') && onLeave()}
            title="Quitter la partie"
          >
            ✕
          </button>
        </div>
      </header>

      <div className="game-body">
        <main className="stage">
          <RoundBanner
            key={round.id}
            title={suddenDeath ? '⚡ Mort subite !' : `Set ${setNo} / ${totalSets}`}
            subtitle={isDrawer ? '✏️ À vous de dessiner !' : `✏️ ${drawer?.nickname ?? '?'} dessine`}
            team={round.team}
            hidden={round.phase === 'reveal'}
          />
          {round.phase === 'reveal' && round.winner_id && <Confetti key={`c-${round.id}`} />}
          <DrawingBoard
            roundId={round.id}
            userId={userId}
            drawerId={round.drawer_id}
            canDraw={isDrawer && round.phase === 'drawing'}
            connected={conn.connected}
            sendDraw={conn.sendDraw}
            onDraw={conn.onDraw}
            overlay={overlay}
          />
          <div className="stage-info">
            <span>
              ✏️ <strong>{isDrawer ? 'Vous dessinez' : `${drawer?.nickname ?? '?'} dessine`}</strong>
              {isTeam && round.team && (
                <span className={`team-tag ${TEAM_INFO[round.team].className}`}>
                  {TEAM_INFO[round.team].emoji} {TEAM_INFO[round.team].name}
                </span>
              )}
            </span>
            {(isHost || isDrawer) && round.phase !== 'reveal' && (
              <button className="btn btn-ghost btn-small" disabled={busy} onClick={() => act(() => api.skipRound(room.id))}>
                ⏭️ Passer le tour
              </button>
            )}
          </div>
          {!conn.connected && <p className="warning">Connexion temps réel perdue, reconnexion…</p>}
          {error && <p className="error">{error}</p>}
        </main>

        <section className="side-chat card">
          <GuessPanel state={state} disabledReason={disabledReason} onSubmitted={conn.refresh} />
        </section>

        <aside className="side-players card">
          <Scoreboard state={state} userId={userId} online={conn.online} />
        </aside>
      </div>
    </div>
  );
}

function WordDisplay({ round, isDrawer }: { round: Round; isDrawer: boolean }) {
  if (round.phase === 'reveal') {
    return (
      <div className="word">
        <span className="word-label">Le mot</span>
        <strong>{round.revealed_word ?? round.word}</strong>
      </div>
    );
  }
  if (isDrawer && round.word) {
    return (
      <div className="word">
        <span className="word-label">À dessiner</span>
        <strong>{round.word}</strong>
      </div>
    );
  }
  if (!round.mask) {
    return <div className="word muted">…</div>;
  }
  const letters = round.mask.split('').filter((c) => c === '_').length;
  return (
    <div className="word mask" aria-label={`Mot de ${letters} lettres`}>
      <span className="slots">
        {round.mask.split('').map((c, i) =>
          c === '_' ? <span key={i} className="slot" /> : c === ' ' ? <span key={i} className="gap" /> : <span key={i} className="sep">{c}</span>,
        )}
      </span>
      <span className="word-label">{letters} lettres</span>
    </div>
  );
}

function RoundBanner({
  title,
  subtitle,
  team,
  hidden,
}: {
  title: string;
  subtitle: string;
  team: Team | null;
  hidden: boolean;
}) {
  const [visible, setVisible] = useState(!hidden);
  useEffect(() => {
    const id = window.setTimeout(() => setVisible(false), 2600);
    return () => window.clearTimeout(id);
  }, []);
  if (!visible || hidden) return null;
  return (
    <div className={`round-banner${team ? ` ${TEAM_INFO[team].className}` : ''}`} aria-live="polite">
      <strong>{title}</strong>
      <span>
        {subtitle}
        {team && ` · ${TEAM_INFO[team].emoji} ${TEAM_INFO[team].name}`}
      </span>
    </div>
  );
}

function RevealOverlay({ round, players, isTeam }: { round: Round; players: Player[]; isTeam: boolean }) {
  const winner = players.find((p) => p.user_id === round.winner_id);
  const word = round.revealed_word ?? round.word ?? '';
  return (
    <div className="overlay reveal">
      <div className="overlay-box">
        <p className="muted">Le mot était</p>
        <div className="reveal-word" aria-label={word}>
          {word.split('').map((c, i) => (
            <span key={i} style={{ '--i': i } as CSSProperties} aria-hidden="true">
              {c === ' ' ? ' ' : c}
            </span>
          ))}
        </div>
        {winner ? (
          <p className="reveal-result success">
            🎉 <strong>{winner.nickname}</strong> a trouvé !
            {isTeam && round.team && ` +1 pour l’${TEAM_INFO[round.team].name}`}
          </p>
        ) : (
          <p className="reveal-result">⏰ Personne n’a trouvé.</p>
        )}
      </div>
    </div>
  );
}
