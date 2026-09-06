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

/**
 * تحويل خطأ Supabase إلى رسالة مفيدة
 */
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
  const { data, error } = await supabase.auth.signInAnonymously();

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

  /**
   * إذا لم يوجد مستخدم، نحاول إنشاء مستخدم مجهول
   */
  if (!user) {
    user = await signInAnonymously();
  }

  if (!user) {
    throw new Error("تعذر إنشاء المستخدم");
  }

  let code = "";
  let room: Room | null = null;
  let lastError: any = null;

  /**
   * نحاول حتى 10 مرات فقط إذا كان الخطأ
   * بسبب تكرار كود الغرفة.
   */
  for (let attempt = 0; attempt < 10; attempt++) {
    code = generateRoomCode();

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
      room = data;
      break;
    }

    lastError = error;

    /**
     * 23505 = duplicate key
     *
     * في هذه الحالة فقط نولد كودًا جديدًا.
     * أما بقية الأخطاء فهي أخطاء حقيقية في
     * قاعدة البيانات أو RLS ولا فائدة من إعادة المحاولة.
     */
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

  /**
   * إضافة صاحب الغرفة كلاعب
   */
  const { error: playerError } = await supabase
    .from("room_players")
    .insert({
      room_id: room.id,
      user_id: user.id,
      name: playerName,
      ready: false,
    });

  if (playerError) {
    /**
     * إذا فشلت إضافة المضيف، نحذف الغرفة التي أنشأناها
     * حتى لا تبقى غرفة فارغة في قاعدة البيانات.
     */
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

  const { data: room, error: roomError } = await supabase
    .from("rooms")
    .select("*")
    .eq("code", code.trim().toUpperCase())
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

  /**
   * عدد اللاعبين الحاليين
   */
  const { count, error: countError } = await supabase
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

  /**
   * التأكد من أن المستخدم ليس موجودًا بالفعل
   */
  const { data: existingPlayer } = await supabase
    .from("room_players")
    .select("*")
    .eq("room_id", room.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!existingPlayer) {
    const { error: playerError } = await supabase
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

  return room;
}

/**
 * جلب لاعبي الغرفة
 */
export async function getRoomPlayers(roomId: string) {
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

  return data as RoomPlayer[];
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
    throw error;
  }

  return data;
}

/**
 * بدء اللعبة
 */
export async function startGame(roomId: string) {
  const user = (await supabase.auth.getUser()).data.user;

  if (!user) {
    throw new Error("المستخدم غير مسجل");
  }

  const { data: room, error: roomError } = await supabase
    .from("rooms")
    .select("*")
    .eq("id", roomId)
    .single();

  if (roomError || !room) {
    throw new Error("الغرفة غير موجودة");
  }

  if (room.host_id !== user.id) {
    throw new Error(
      "فقط صاحب الغرفة يستطيع بدء اللعبة"
    );
  }

  const { data: players, error: playersError } =
    await supabase
      .from("room_players")
      .select("*")
      .eq("room_id", roomId);

  if (playersError) {
    throw playersError;
  }

  if (!players || players.length < 2) {
    throw new Error(
      "يجب أن يكون هناك لاعبان على الأقل"
    );
  }

  const allReady = players.every(
    (player) => player.ready
  );

  if (!allReady) {
    throw new Error(
      "يجب أن يكون جميع اللاعبين Ready"
    );
  }

  const { data, error } = await supabase
    .from("rooms")
    .update({
      status: "playing",
    })
    .eq("id", roomId)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
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
    throw error;
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
        callback(payload.new as Room);
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
  await supabase.removeChannel(channel);
}
