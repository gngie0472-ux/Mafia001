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
  code: string;
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

export type PlayerProfile = {
  user_id: string;
  username: string;
  avatar_url: string | null;
  wins?: number;
  games?: number;
  rating?: number;
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

/**
 * إنشاء كود غرفة عشوائي من 6 أحرف.
 *
 * تم استبعاد:
 * O و 0
 * I و 1
 * حتى يكون الكود واضحاً عند عرضه للاعبين.
 */
function generateRoomCode(
  length = 6
): string {
  const chars =
    'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  let code = '';

  for (let i = 0; i < length; i++) {
    const index = Math.floor(
      Math.random() * chars.length
    );

    code += chars.charAt(index);
  }

  return code;
}

/**
 * إنشاء كود غرفة غير مستخدم حالياً.
 *
 * نحاول 10 مرات كحد أقصى لتجنب أي حلقة لا نهائية.
 */
async function generateUniqueRoomCode(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateRoomCode();

    const {
      data,
      error,
    } = await supabase
      .from('rooms')
      .select('id')
      .eq('code', code)
      .maybeSingle();

    if (error) {
      throw new Error(
        formatError(
          error,
          'تعذر التحقق من كود الغرفة'
        )
      );
    }

    if (!data) {
      return code;
    }
  }

  throw new Error(
    'تعذر إنشاء كود غرفة فريد، حاول مرة أخرى'
  );
}

async function ensureUser() {
  const {
    data,
  } = await supabase.auth.getUser();

  if (data.user) {
    return data.user;
  }

  const {
    data: authData,
    error,
  } = await supabase.auth.signInAnonymously();

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
): Promise<{
  user: any;
  profile: PlayerProfile;
}> {
  const user = await ensureUser();

  const fallbackName =
    username?.trim() ||
    `Player_${user.id.slice(0, 5)}`;

  const {
    data,
    error,
  } = await supabase.rpc(
    'ensure_my_profile',
    {
      p_username: fallbackName,
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

  if (!data) {
    throw new Error(
      'تعذر تحميل الملف الشخصي'
    );
  }

  return {
    user,
    profile: data as PlayerProfile,
  };
}

export async function signInAnonymously() {
  return ensureUser();
}

/**
 * إنشاء غرفة عامة.
 */
export async function createRoom(
  roomName: string,
  playerName: string,
  maxPlayers = 8
): Promise<Room> {
  const {
    user,
    profile,
  } = await ensureProfile(playerName);

  const name = roomName.trim();

  if (!name) {
    throw new Error(
      'أدخل اسم الغرفة'
    );
  }

  const max = Math.max(
    4,
    Math.min(
      20,
      Number(maxPlayers) || 8
    )
  );

  /**
   * إنشاء كود فريد قبل إدخال الغرفة.
   */
  const code =
    await generateUniqueRoomCode();

  const {
    data,
    error,
  } = await supabase
    .from('rooms')
    .insert({
      code,
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

  const playerNameToUse =
    profile.username?.trim() ||
    playerName.trim() ||
    'Host';

  const {
    error: playerError,
  } = await supabase
    .from('room_players')
    .insert({
      room_id: data.id,
      user_id: user.id,
      name: playerNameToUse,
      ready: false,
      alive: true,
      avatar_url:
        profile.avatar_url || null,
      last_seen_at:
        new Date().toISOString(),
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

/**
 * تحميل الغرف العامة المتاحة.
 */
export async function getPublicRooms(): Promise<
  PublicRoom[]
> {
  await ensureUser();

  const {
    data,
    error,
  } = await supabase.rpc(
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

/**
 * الانضمام إلى غرفة عامة.
 */
export async function joinPublicRoom(
  roomId: string,
  playerName?: string
) {
  const {
    profile,
  } = await ensureProfile(playerName);

  const {
    data,
    error,
  } = await supabase.rpc(
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

  const user = await ensureUser();

  const {
    error: syncError,
  } = await supabase
    .from('room_players')
    .update({
      name:
        profile.username?.trim() ||
        playerName?.trim() ||
        `Player_${user.id.slice(0, 5)}`,
      avatar_url:
        profile.avatar_url || null,
      last_seen_at:
        new Date().toISOString(),
    })
    .eq('room_id', roomId)
    .eq('user_id', user.id);

  if (syncError) {
    throw new Error(
      formatError(
        syncError,
        'تم الانضمام لكن تعذر تحديث بيانات اللاعب'
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
): Promise<Room> {
  await ensureProfile(playerName);

  const normalized =
    code.trim().toUpperCase();

  const {
    data: room,
    error,
  } = await supabase
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

  await joinPublicRoom(
    room.id,
    playerName
  );

  return room as Room;
}

/**
 * تحميل غرفة بواسطة ID.
 */
export async function getRoom(
  roomId: string
): Promise<Room> {
  const {
    data,
    error,
  } = await supabase
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

/**
 * تحميل جميع لاعبي الغرفة.
 */
export async function getRoomPlayers(
  roomId: string
): Promise<RoomPlayer[]> {
  const {
    data,
    error,
  } = await supabase
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

/**
 * تغيير جاهزية اللاعب.
 */
export async function setReady(
  roomId: string,
  ready: boolean
): Promise<RoomPlayer> {
  const user = await ensureUser();

  const {
    data,
    error,
  } = await supabase
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

/**
 * تحديث آخر ظهور للاعب.
 */
export async function heartbeatRoom(
  roomId: string
) {
  const user = await ensureUser();

  const {
    error,
  } = await supabase
    .from('room_players')
    .update({
      last_seen_at:
        new Date().toISOString(),
    })
    .eq('room_id', roomId)
    .eq('user_id', user.id);

  if (error) {
    console.error(
      'heartbeatRoom:',
      error
    );
  }
}

/**
 * بدء اللعبة.
 */
export async function startGame(
  roomId: string
) {
  await ensureUser();

  const {
    data,
    error,
  } = await supabase.rpc(
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

/**
 * الحصول على دور اللاعب.
 */
export async function getMyRole(
  roomId: string
) {
  const {
    data,
    error,
  } = await supabase.rpc(
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

/**
 * مغادرة الغرفة.
 */
export async function leaveRoom(
  roomId: string
) {
  const user = await ensureUser();

  const {
    error,
  } = await supabase
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

/**
 * Realtime للاعبين داخل الغرفة.
 */
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
              await getRoomPlayers(
                roomId
              )
            );
          } catch (error) {
            console.error(
              'room players realtime:',
              error
            );
          }
        }
      )
      .subscribe();

  return channel;
}

/**
 * Realtime للغرفة نفسها.
 */
export function subscribeToRoom(
  roomId: string,
  callback: (
    room: Room
  ) => void
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

/**
 * إزالة قناة Realtime.
 */
export async function unsubscribeFromRoom(
  channel: any
) {
  if (channel) {
    await supabase.removeChannel(
      channel
    );
  }
}
