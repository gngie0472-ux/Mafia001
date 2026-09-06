import { supabase } from './supabase';

export type Room = {
  id: string;
  code: string;
  name: string;
  max_players: number;
  status: string;
  host_id: string;
  game_round?: number;
  game_phase?: string;
  winner?: string | null;
  phase_ends_at?: string | null;
};

export type PublicRoom = {
  id: string;
  name: string;
  max_players: number;
  host_id: string;
  status: string;
  player_count: number;
  host_name: string;
};

export type RoomPlayer = {
  id: string;
  room_id: string;
  user_id: string;
  name: string;
  ready: boolean;
  alive?: boolean;
  role?: string | null;
  avatar_url?: string | null;
  last_seen_at?: string | null;
  created_at?: string;
};

function formatError(
  error: any,
  fallback: string
) {
  if (!error) {
    return fallback;
  }

  return [
    error.message,
    error.details,
    error.hint,
    error.code
      ? `code=${error.code}`
      : null,
  ]
    .filter(Boolean)
    .join(' | ') || fallback;
}

async function ensureUser() {
  const { data } =
    await supabase.auth.getUser();

  if (data.user) {
    return data.user;
  }

  const { data: authData, error } =
    await supabase.auth.signInAnonymously();

  if (error || !authData.user) {
    throw new Error(
      formatError(
        error,
        'تعذر إنشاء حساب اللاعب'
      )
    );
  }

  return authData.user;
}

async function ensureProfile(
  username?: string
) {
  const user = await ensureUser();

  const name =
    username?.trim() ||
    `Player_${user.id.slice(0, 5)}`;

  const { data, error } =
    await supabase.rpc(
      'ensure_my_profile',
      {
        p_username: name,
        p_avatar_url: null,
      }
    );

  if (error) {
    throw new Error(
      formatError(
        error,
        'تعذر إنشاء الملف الشخصي'
      )
    );
  }

  return {
    user,
    profile: data,
  };
}

export async function signInAnonymously() {
  return ensureUser();
}

export async function createRoom(
  roomName: string,
  playerName: string,
  maxPlayers = 8
) {
  const { user } =
    await ensureProfile(playerName);

  const name = roomName.trim();

  if (!name) {
    throw new Error(
      'أدخل اسم الغرفة'
    );
  }

  const max = Math.max(
    4,
    Math.min(20, Number(maxPlayers) || 8)
  );

  const { data, error } =
    await supabase
      .from('rooms')
      .insert({
        name,
        max_players: max,
        status: 'waiting',
        host_id: user.id,
      })
      .select('*')
      .single();

  if (error || !data) {
    throw new Error(
      formatError(
        error,
        'تعذر إنشاء الغرفة'
      )
    );
  }

  const { error: playerError } =
    await supabase
      .from('room_players')
      .insert({
        room_id: data.id,
        user_id: user.id,
        name:
          playerName.trim() ||
          'Host',
        ready: false,
      });

  if (playerError) {
    await supabase
      .from('rooms')
      .delete()
      .eq('id', data.id);

    throw new Error(
      formatError(
        playerError,
        'تعذر إضافة صاحب الغرفة'
      )
    );
  }

  return data as Room;
}

export async function getPublicRooms(): Promise<
  PublicRoom[]
> {
  await ensureUser();

  const { data, error } =
    await supabase.rpc(
      'get_public_rooms'
    );

  if (error) {
    throw new Error(
      formatError(
        error,
        'تعذر تحميل الغرف'
      )
    );
  }

  return (data ?? []) as PublicRoom[];
}

export async function joinPublicRoom(
  roomId: string,
  playerName: string
) {
  await ensureProfile(playerName);

  const { data, error } =
    await supabase.rpc(
      'join_public_room',
      {
        p_room_id: roomId,
      }
    );

  if (error) {
    throw new Error(
      formatError(
        error,
        'تعذر الانضمام إلى الغرفة'
      )
    );
  }

  return data;
}

/**
 * توافق مع نظام الكود القديم.
 */
export async function joinRoom(
  code: string,
  playerName: string
) {
  await ensureProfile(playerName);

  const normalized =
    code.trim().toUpperCase();

  const { data: room, error } =
    await supabase
      .from('rooms')
      .select('*')
      .eq('code', normalized)
      .eq('status', 'waiting')
      .single();

  if (error || !room) {
    throw new Error(
      formatError(
        error,
        'الغرفة غير موجودة'
      )
    );
  }

  return joinPublicRoom(
    room.id,
    playerName
  ).then(() => room as Room);
}

export async function getRoom(
  roomId: string
) {
  const { data, error } =
    await supabase
      .from('rooms')
      .select('*')
      .eq('id', roomId)
      .single();

  if (error || !data) {
    throw new Error(
      formatError(
        error,
        'تعذر تحميل الغرفة'
      )
    );
  }

  return data as Room;
}

export async function getRoomPlayers(
  roomId: string
): Promise<RoomPlayer[]> {
  const { data, error } =
    await supabase
      .from('room_players')
      .select('*')
      .eq('room_id', roomId)
      .order('created_at', {
        ascending: true,
      });

  if (error) {
    throw new Error(
      formatError(
        error,
        'تعذر تحميل اللاعبين'
      )
    );
  }

  return (data ?? []) as RoomPlayer[];
}

export async function setReady(
  roomId: string,
  ready: boolean
) {
  const user = await ensureUser();

  const { data, error } =
    await supabase
      .from('room_players')
      .update({
        ready,
        last_seen_at:
          new Date().toISOString(),
      })
      .eq('room_id', roomId)
      .eq('user_id', user.id)
      .select('*')
      .single();

  if (error) {
    throw new Error(
      formatError(
        error,
        'تعذر تغيير الجاهزية'
      )
    );
  }

  return data as RoomPlayer;
}

export async function heartbeatRoom(
  roomId: string
) {
  const user = await ensureUser();

  await supabase
    .from('room_players')
    .update({
      last_seen_at:
        new Date().toISOString(),
    })
    .eq('room_id', roomId)
    .eq('user_id', user.id);
}

export async function startGame(
  roomId: string
) {
  await ensureUser();

  const { data, error } =
    await supabase.rpc(
      'start_mafia_game',
      {
        p_room_id: roomId,
      }
    );

  if (error) {
    throw new Error(
      formatError(
        error,
        'تعذر بدء اللعبة'
      )
    );
  }

  return data;
}

export async function getMyRole(
  roomId: string
) {
  const { data, error } =
    await supabase.rpc(
      'get_my_mafia_role',
      {
        p_room_id: roomId,
      }
    );

  if (error) {
    throw new Error(
      formatError(
        error,
        'تعذر تحميل الدور'
      )
    );
  }

  return data;
}

export async function leaveRoom(
  roomId: string
) {
  const user = await ensureUser();

  const { error } =
    await supabase
      .from('room_players')
      .delete()
      .eq('room_id', roomId)
      .eq('user_id', user.id);

  if (error) {
    throw new Error(
      formatError(
        error,
        'تعذر مغادرة الغرفة'
      )
    );
  }
}

export function subscribeToRoomPlayers(
  roomId: string,
  callback: (
    players: RoomPlayer[]
  ) => void
) {
  const channel =
    supabase
      .channel(
        `room-players-${roomId}-${Date.now()}`
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'room_players',
          filter:
            `room_id=eq.${roomId}`,
        },
        async () => {
          try {
            callback(
              await getRoomPlayers(roomId)
            );
          } catch (error) {
            console.error(
              error
            );
          }
        }
      )
      .subscribe();

  return channel;
}

export function subscribeToRoom(
  roomId: string,
  callback: (room: Room) => void
) {
  const channel =
    supabase
      .channel(
        `room-${roomId}-${Date.now()}`
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'rooms',
          filter:
            `id=eq.${roomId}`,
        },
        (payload) => {
          if (payload.new) {
            callback(
              payload.new as Room
            );
          }
        }
      )
      .subscribe();

  return channel;
}

export async function unsubscribeFromRoom(
  channel: any
) {
  if (channel) {
    await supabase.removeChannel(
      channel
    );
  }
}
