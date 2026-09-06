import { supabase } from './supabase';

export type GamePhase = 'night' | 'day';

export type GameRole =
  | 'MAFIA'
  | 'DOCTOR'
  | 'DETECTIVE'
  | 'CITIZEN';

export type GamePlayer = {
  id: string;
  user_id: string;
  name: string;
  avatar_url: string | null;
  alive: boolean;
};

export type GameRoom = {
  id: string;
  code: string;
  status: string;
  game_round: number;
  game_phase: GamePhase;
  winner: string | null;
  phase_ends_at: string | null;
  last_event: {
    type?: string;
    player_id?: string;
    round?: number;
    winner?: string;
    phase?: GamePhase;
    phase_ends_at?: string;
  } | null;
};

export type GameState = {
  room: GameRoom;
  players: GamePlayer[];
  my_player_id: string | null;
};

export type MyRole = {
  role: GameRole;
  alive: boolean;
};

export async function getGameState(
  roomId: string
): Promise<GameState> {
  if (!roomId) {
    throw new Error('Missing room ID');
  }

  const { data, error } =
    await supabase.rpc(
      'get_mafia_game_state',
      {
        p_room_id: roomId,
      }
    );

  if (error) {
    console.error(
      'getGameState error:',
      error
    );
    throw error;
  }

  if (!data) {
    throw new Error(
      'Game state was not returned'
    );
  }

  return data as GameState;
}

export async function getMyRole(
  roomId: string
): Promise<MyRole> {
  if (!roomId) {
    throw new Error('Missing room ID');
  }

  const { data, error } =
    await supabase.rpc(
      'get_my_mafia_role',
      {
        p_room_id: roomId,
      }
    );

  if (error) {
    console.error(
      'getMyRole error:',
      error
    );
    throw error;
  }

  if (!data) {
    throw new Error(
      'Player role was not returned'
    );
  }

  return data as MyRole;
}

export async function submitNightAction(
  roomId: string,
  action:
    | 'kill'
    | 'protect'
    | 'investigate',
  targetId: string
) {
  if (!roomId) {
    throw new Error('Missing room ID');
  }

  if (!targetId) {
    throw new Error('Missing target');
  }

  const { data, error } =
    await supabase.rpc(
      'mafia_submit_action',
      {
        p_room_id: roomId,
        p_action: action,
        p_target_id: targetId,
      }
    );

  if (error) {
    console.error(
      'submitNightAction error:',
      error
    );
    throw error;
  }

  return data;
}

export async function submitDayVote(
  roomId: string,
  targetId: string
) {
  if (!roomId) {
    throw new Error('Missing room ID');
  }

  if (!targetId) {
    throw new Error(
      'Missing vote target'
    );
  }

  const { data, error } =
    await supabase.rpc(
      'mafia_submit_vote',
      {
        p_room_id: roomId,
        p_target_id: targetId,
      }
    );

  if (error) {
    console.error(
      'submitDayVote error:',
      error
    );
    throw error;
  }

  return data;
}

export async function startMafiaGame(
  roomId: string
) {
  if (!roomId) {
    throw new Error('Missing room ID');
  }

  const { data, error } =
    await supabase.rpc(
      'start_mafia_game',
      {
        p_room_id: roomId,
      }
    );

  if (error) {
    console.error(
      'startMafiaGame error:',
      error
    );
    throw error;
  }

  return data;
}

export async function advanceMafiaPhase(
  roomId: string
) {
  if (!roomId) {
    throw new Error('Missing room ID');
  }

  const { data, error } =
    await supabase.rpc(
      'advance_mafia_phase',
      {
        p_room_id: roomId,
      }
    );

  if (error) {
    console.error(
      'advanceMafiaPhase error:',
      error
    );
    throw error;
  }

  return data;
}
