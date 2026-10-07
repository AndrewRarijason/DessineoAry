export type Mode = 'solo' | 'team';
export type Team = 'A' | 'B';
export type RoomStatus = 'lobby' | 'playing' | 'finished';
export type Phase = 'choosing' | 'drawing' | 'reveal';

export interface Room {
  id: string;
  code: string;
  host_id: string;
  mode: Mode;
  team_sets: 3 | 5;
  status: RoomStatus;
  total_rounds: number;
  current_round: number;
  team_a_score: number;
  team_b_score: number;
  bonus_sets: number;
  created_at: string;
  updated_at: string;
}

export interface Player {
  room_id: string;
  user_id: string;
  nickname: string;
  team: Team | null;
  score: number;
  draw_order: number | null;
  joined_at: string;
  left_at: string | null;
}

export interface Category {
  id: number;
  name: string;
  emoji: string;
  sort_order: number;
}

export interface Round {
  id: string;
  room_id: string;
  round_no: number;
  drawer_id: string;
  team: Team | null;
  category_id: number | null;
  phase: Phase;
  phase_ends_at: string;
  winner_id: string | null;
  revealed_word: string | null;
  /** Visible uniquement par le dessinateur (ou par tous pendant la révélation) */
  word: string | null;
  mask: string | null;
  category: Category | null;
}

export interface Guess {
  id: number;
  round_id: string;
  user_id: string;
  nickname: string;
  content: string | null;
  is_correct: boolean;
  created_at: string;
}

export interface RoomState {
  server_now: string;
  room: Room;
  players: Player[];
  round: Round | null;
  guesses: Guess[];
}

export type GuessResult = 'correct' | 'close' | 'wrong' | 'ignored';

export const TEAM_INFO: Record<Team, { name: string; emoji: string; className: string }> = {
  A: { name: 'Équipe Rouge', emoji: '🔴', className: 'team-a' },
  B: { name: 'Équipe Bleue', emoji: '🔵', className: 'team-b' },
};

/** Nombre de sets en mode solo : 5 minimum et chacun dessine autant de fois. */
export function soloRounds(playerCount: number): number {
  if (playerCount < 1) return 0;
  return Math.ceil(5 / playerCount) * playerCount;
}
