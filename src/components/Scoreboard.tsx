import { TEAM_INFO, type Player, type RoomState } from '../lib/types';

interface Props {
  state: RoomState;
  userId: string;
  online: Set<string>;
}

export function Scoreboard({ state, userId, online }: Props) {
  const { room, players, round } = state;

  const row = (p: Player) => {
    const isOnline = !p.left_at && (online.has(p.user_id) || p.user_id === userId);
    return (
      <li key={p.user_id} className={`score-row${isOnline ? '' : ' offline'}${round?.drawer_id === p.user_id ? ' drawing' : ''}`}>
        <span className="avatar small" aria-hidden="true">
          {p.nickname.slice(0, 1).toUpperCase()}
        </span>
        <span className="name">
          {p.nickname}
          {p.user_id === userId && <span className="muted small"> (vous)</span>}
        </span>
        {round?.drawer_id === p.user_id && <span title="Dessine">✏️</span>}
        {round?.winner_id === p.user_id && <span title="A trouvé">✅</span>}
        {room.mode === 'solo' && (
          <span key={p.score} className="points bump">
            {p.score}
          </span>
        )}
      </li>
    );
  };

  if (room.mode === 'solo') {
    const sorted = [...players].sort((a, b) => b.score - a.score || a.nickname.localeCompare(b.nickname));
    return <ul className="scoreboard">{sorted.map(row)}</ul>;
  }

  return (
    <div className="scoreboard teams-board">
      {(['A', 'B'] as const).map((team) => (
        <div key={team} className={`team-score ${TEAM_INFO[team].className}${round?.team === team ? ' playing' : ''}`}>
          <div className="team-score-head">
            <span>
              {TEAM_INFO[team].emoji} {TEAM_INFO[team].name}
            </span>
            <span key={team === 'A' ? room.team_a_score : room.team_b_score} className="points bump">
              {team === 'A' ? room.team_a_score : room.team_b_score}
            </span>
          </div>
          <ul>{players.filter((p) => p.team === team).map(row)}</ul>
        </div>
      ))}
    </div>
  );
}
