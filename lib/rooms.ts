import { supabase } from "./supabase";

export type Room = {
  id: string;
  code: string;
  name: string;
  max_players: number;
  status: string;
  host_id: string;
};

export type RoomPlayer = {
  id: string;
  room_id: string;
  user_id: string;
  name: string;
  ready: boolean;
};

function generateRoomCode(length = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";

  for (let i = 0; i < length; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }

  return code;
}

function formatSupabaseError(error: any, fallback: string) {
  if (!error) {
    return fallback;
  }

  const parts = [
    error.message,
    error.details,
    error.hint,
    error.code ? `code=${error.code}` : null,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(" | ") : fallback;
}

/**
 * تسجيل دخول مجهول
 */
export async function signInAnonymously() {
  const { data, error } =
    await supabase.auth.signInAnonymously();

  if (error) {
    throw new Error(
      `فشل تسجيل الدخول المجهول: ${formatSupabaseError(
        error,
        "خطأ غير معروف في المصادقة"
      )}`
    );
  }

  return data.user;
}

/**
 * إنشاء غرفة
 */
export async function createRoom(
  roomName: string,
  playerName: string,
  maxPlayers = 8
) {
  let user = (await supabase.auth.getUser()).data.user;

  if (!user) {
    user = await signInAnonymously();
  }

  if (!user) {
    throw new Error("تعذر إنشاء المستخدم");
  }

  let room: Room | null = null;
  let lastError: any = null;

  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateRoomCode();

    const { data, error } = await supabase
      .from("rooms")
      .insert({
        code,
        name: roomName,
        max_players: maxPlayers,
        status: "waiting",
        host_id: user.id,
      })
      .select()
      .single();

    if (!error) {
      room = data as Room;
      break;
    }

    lastError = error;

    if (error.code !== "23505") {
      break;
    }
  }

  if (!room) {
    throw new Error(
      `تعذر إنشاء الغرفة: ${formatSupabaseError(
        lastError,
        "تعذر حفظ الغرفة في قاعدة البيانات"
      )}`
    );
  }

  const { error: playerError } = await supabase
    .from("room_players")
    .insert({
      room_id: room.id,
      user_id: user.id,
      name: playerName,
      ready: false,
    });

  if (playerError) {
    await supabase
      .from("rooms")
      .delete()
      .eq("id", room.id);

    throw new Error(
      `تعذر إضافة صاحب الغرفة: ${formatSupabaseError(
        playerError,
        "تعذر إضافة اللاعب إلى الغرفة"
      )}`
    );
  }

  return room;
}

/**
 * الانضمام إلى غرفة
 */
export async function joinRoom(
  code: string,
  playerName: string
) {
  let user = (await supabase.auth.getUser()).data.user;

  if (!user) {
    user = await signInAnonymously();
  }

  if (!user) {
    throw new Error("تعذر إنشاء المستخدم");
  }

  const normalizedCode = code.trim().toUpperCase();

  const { data: room, error: roomError } =
    await supabase
      .from("rooms")
      .select("*")
      .eq("code", normalizedCode)
      .eq("status", "waiting")
      .single();

  if (roomError || !room) {
    throw new Error(
      roomError
        ? formatSupabaseError(
            roomError,
            "الغرفة غير موجودة أو بدأت اللعبة"
          )
        : "الغرفة غير موجودة أو بدأت اللعبة"
    );
  }

  const { count, error: countError } =
    await supabase
      .from("room_players")
      .select("*", {
        count: "exact",
        head: true,
      })
      .eq("room_id", room.id);

  if (countError) {
    throw new Error(
      `تعذر قراءة اللاعبين: ${formatSupabaseError(
        countError,
        "خطأ غير معروف"
      )}`
    );
  }

  if ((count ?? 0) >= room.max_players) {
    throw new Error("الغرفة ممتلئة");
  }

  const { data: existingPlayer } =
    await supabase
      .from("room_players")
      .select("*")
      .eq("room_id", room.id)
      .eq("user_id", user.id)
      .maybeSingle();

  if (!existingPlayer) {
    const { error: playerError } =
      await supabase
        .from("room_players")
        .insert({
          room_id: room.id,
          user_id: user.id,
          name: playerName,
          ready: false,
        });

    if (playerError) {
      throw new Error(
        `تعذر الانضمام إلى الغرفة: ${formatSupabaseError(
          playerError,
          "خطأ غير معروف"
        )}`
      );
    }
  }

  return room as Room;
}

/**
 * جلب لاعبي الغرفة
 */
export async function getRoomPlayers(
  roomId: string
) {
  const { data, error } = await supabase
    .from("room_players")
    .select("*")
    .eq("room_id", roomId)
    .order("created_at", {
      ascending: true,
    });

  if (error) {
    throw error;
  }

  return (data ?? []) as RoomPlayer[];
}

/**
 * تغيير حالة Ready
 */
export async function setReady(
  roomId: string,
  ready: boolean
) {
  const user = (await supabase.auth.getUser()).data.user;

  if (!user) {
    throw new Error("المستخدم غير مسجل");
  }

  const { data, error } = await supabase
    .from("room_players")
    .update({
      ready,
    })
    .eq("room_id", roomId)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) {
    throw new Error(
      formatSupabaseError(
        error,
        "تعذر تغيير حالة الجاهزية"
      )
    );
  }

  return data as RoomPlayer;
}

/**
 * بدء اللعبة
 *
 * يتم تنفيذ توزيع الأدوار داخل Supabase
 * عن طريق الدالة الآمنة start_mafia_game.
 */
export async function startGame(roomId: string) {
  const user = (await supabase.auth.getUser()).data.user;

  if (!user) {
    throw new Error("المستخدم غير مسجل");
  }

  const { data, error } = await supabase.rpc(
    "start_mafia_game",
    {
      p_room_id: roomId,
    }
  );

  if (error) {
    throw new Error(
      formatSupabaseError(
        error,
        "تعذر بدء اللعبة"
      )
    );
  }

  return data;
}

/**
 * جلب دور اللاعب الحالي فقط
 *
 * لا يمكن لهذه الدالة إرجاع دور لاعب آخر.
 */
export async function getMyRole(roomId: string) {
  const { data, error } = await supabase.rpc(
    "get_my_mafia_role",
    {
      p_room_id: roomId,
    }
  );

  if (error) {
    throw new Error(
      formatSupabaseError(
        error,
        "تعذر تحميل دورك"
      )
    );
  }

  return data as {
    role: string;
    alive: boolean;
  };
}

/**
 * مغادرة الغرفة
 */
export async function leaveRoom(roomId: string) {
  const user = (await supabase.auth.getUser()).data.user;

  if (!user) {
    return;
  }

  const { error } = await supabase
    .from("room_players")
    .delete()
    .eq("room_id", roomId)
    .eq("user_id", user.id);

  if (error) {
    throw new Error(
      formatSupabaseError(
        error,
        "تعذر مغادرة الغرفة"
      )
    );
  }
}

/**
 * الاستماع لتغييرات اللاعبين
 */
export function subscribeToRoomPlayers(
  roomId: string,
  callback: (players: RoomPlayer[]) => void
) {
  const channel = supabase
    .channel(`room-players-${roomId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "room_players",
        filter: `room_id=eq.${roomId}`,
      },
      async () => {
        try {
          const players =
            await getRoomPlayers(roomId);

          callback(players);
        } catch (error) {
          console.error(
            "Failed to refresh room players:",
            error
          );
        }
      }
    )
    .subscribe();

  return channel;
}

/**
 * الاستماع لتغييرات الغرفة
 */
export function subscribeToRoom(
  roomId: string,
  callback: (room: Room) => void
) {
  const channel = supabase
    .channel(`room-${roomId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "rooms",
        filter: `id=eq.${roomId}`,
      },
      (payload) => {
        if (payload.new) {
          callback(payload.new as Room);
        }
      }
    )
    .subscribe();

  return channel;
}

/**
 * إلغاء الاشتراك
 */
export async function unsubscribeFromRoom(
  channel: any
) {
  if (channel) {
    await supabase.removeChannel(channel);
  }
}
