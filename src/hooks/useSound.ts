import { useEffect, useRef, useSyncExternalStore } from 'react';
import { audio } from '../lib/audio';
import type { RoomState } from '../lib/types';

export function useSoundSettings() {
  return useSyncExternalStore(audio.subscribe, audio.getSettings);
}

/** Joue les bruitages correspondant aux changements d'état de la partie. */
export function useGameSounds(state: RoomState | null, userId: string) {
  const prevRef = useRef<RoomState | null>(null);

  useEffect(() => {
    audio.setMood(state?.room.status === 'playing' ? 'game' : 'menu');
  }, [state?.room.status]);

  useEffect(() => () => audio.setMood('menu'), []);

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = state;
    if (!state || !prev) return;

    const { room, round, players } = state;
    const justStarted = prev.room.status !== 'playing' && room.status === 'playing';

    if (room.status === 'lobby' && players.length > prev.players.length) audio.play('join');

    if (justStarted) {
      audio.play('start');
      if (round?.drawer_id === userId) window.setTimeout(() => audio.play('turn'), 900);
    } else if (room.status === 'playing' && round) {
      const before = prev.round;
      if (!before || before.id !== round.id) {
        audio.play(round.drawer_id === userId ? 'turn' : 'round');
      } else {
        if (before.phase === 'choosing' && round.phase === 'drawing') audio.play('go');
        if (before.phase !== 'reveal' && round.phase === 'reveal') {
          if (!round.winner_id) audio.play('fail');
          else audio.play(round.winner_id === userId ? 'correct' : 'found');
        }
      }

      const known = new Set(prev.guesses.map((g) => g.id));
      const fresh = state.guesses.filter((g) => !known.has(g.id) && !g.is_correct && g.user_id !== userId);
      if (fresh.length > 0 && round.phase === 'drawing') audio.play('message');
    }

    if (prev.room.status === 'playing' && room.status === 'finished') {
      audio.play(isWinner(state, userId) ? 'victory' : 'gameover');
    }
  }, [state, userId]);
}

export function isWinner(state: RoomState, userId: string): boolean {
  const { room, players } = state;
  const me = players.find((p) => p.user_id === userId);
  if (!me) return false;
  if (room.mode === 'team') {
    const mine = me.team === 'A' ? room.team_a_score : room.team_b_score;
    const other = me.team === 'A' ? room.team_b_score : room.team_a_score;
    return mine >= other;
  }
  const best = Math.max(...players.map((p) => p.score));
  return best > 0 && me.score === best;
}
