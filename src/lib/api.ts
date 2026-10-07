import { supabase } from './supabase';
import type { Category, GuessResult, Mode, RoomState, Team } from './types';

async function call<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message || 'Erreur du serveur');
  return data as T;
}

interface RoomRef {
  room_id: string;
  code: string;
}

export const api = {
  serverNow: () => call<string>('server_now'),

  createRoom: (nickname: string, mode: Mode = 'solo', teamSets = 3) =>
    call<RoomRef>('create_room', { p_nickname: nickname, p_mode: mode, p_team_sets: teamSets }),

  joinRoom: (code: string, nickname: string) =>
    call<RoomRef>('join_room', { p_code: code, p_nickname: nickname }),

  leaveRoom: (roomId: string) => call<void>('leave_room', { p_room_id: roomId }),

  getRoomState: (roomId: string) => call<RoomState>('get_room_state', { p_room_id: roomId }),

  updateSettings: (roomId: string, mode: Mode, teamSets: number) =>
    call<void>('update_room_settings', { p_room_id: roomId, p_mode: mode, p_team_sets: teamSets }),

  setMyTeam: (roomId: string, team: Team) => call<void>('set_my_team', { p_room_id: roomId, p_team: team }),

  shuffleTeams: (roomId: string) => call<void>('shuffle_teams', { p_room_id: roomId }),

  startGame: (roomId: string) => call<void>('start_game', { p_room_id: roomId }),

  returnToLobby: (roomId: string) => call<void>('return_to_lobby', { p_room_id: roomId }),

  chooseCategory: (roundId: string, categoryId: number) =>
    call<void>('choose_category', { p_round_id: roundId, p_category_id: categoryId }),

  submitGuess: (roundId: string, text: string) =>
    call<GuessResult>('submit_guess', { p_round_id: roundId, p_text: text }),

  advanceRoom: (roomId: string) => call<void>('advance_room', { p_room_id: roomId }),

  skipRound: (roomId: string) => call<void>('skip_round', { p_room_id: roomId }),

  async categories(): Promise<Category[]> {
    const { data, error } = await supabase.from('categories').select('*').order('sort_order');
    if (error) throw new Error(error.message);
    return data as Category[];
  },
};
