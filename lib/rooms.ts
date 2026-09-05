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

// إنشاء مستخدم مجهول
export async function signInAnonymously() {
  const { data, error } = await supabase.auth.signInAnonymously();

  if (error) throw error;

  return data.user;
}

// إنشاء غرفة
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

  let code = "";
  let room: Room | null = null;

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
  }

  if (!room) {
    throw new Error("تعذر إنشاء الغرفة");
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
    await supabase.from("rooms").delete().eq("id", room.id);
    throw playerError;
  }

  return room;
}

// الانضمام إلى غرفة
export async function joinRoom(code: string, playerName: string) {
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
    throw new Error("الغرفة غير موجودة أو بدأت اللعبة");
  }

  const { count, error: countError } = await supabase
    .from("room_players")
    .select("*", { count: "exact", head: true })
    .eq("room_id", room.id);

  if (countError) throw countError;

  if ((count ?? 0) >= room.max_players) {
    throw new Error("الغرفة ممتلئة");
  }

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

    if (playerError) throw playerError;
  }

  return room;
}

// جلب لاعبي الغرفة
export async function getRoomPlayers(roomId: string) {
  const { data, error } = await supabase
    .from("room_players")
    .select("*")
    .eq("room_id", roomId)
    .order("created_at", { ascending: true });

  if (error) throw error;

  return data as RoomPlayer[];
}

// تغيير حالة Ready
export async function setReady(roomId: string, ready: boolean) {
  const user = (await supabase.auth.getUser()).data.user;

  if (!user) {
    throw new Error("المستخدم غير مسجل");
  }

  const { data, error } = await supabase
    .from("room_players")
    .update({ ready })
    .eq("room_id", roomId)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) throw error;

  return data;
}

// بدء اللعبة
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
    throw new Error("فقط صاحب الغرفة يستطيع بدء اللعبة");
  }

  const { data: players, error: playersError } = await supabase
    .from("room_players")
    .select("*")
    .eq("room_id", roomId);

  if (playersError) throw playersError;

  if (!players || players.length < 2) {
    throw new Error("يجب أن يكون هناك لاعبان على الأقل");
  }

  const allReady = players.every((player) => player.ready);

  if (!allReady) {
    throw new Error("يجب أن يكون جميع اللاعبين Ready");
  }

  const { data, error } = await supabase
    .from("rooms")
    .update({ status: "playing" })
    .eq("id", roomId)
    .select()
    .single();

  if (error) throw error;

  return data;
}

// مغادرة الغرفة
export async function leaveRoom(roomId: string) {
  const user = (await supabase.auth.getUser()).data.user;

  if (!user) return;

  const { error } = await supabase
    .from("room_players")
    .delete()
    .eq("room_id", roomId)
    .eq("user_id", user.id);

  if (error) throw error;
}

// الاستماع لتغييرات اللاعبين
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
        const players = await getRoomPlayers(roomId);
        callback(players);
      }
    )
    .subscribe();

  return channel;
}

// الاستماع لتغييرات الغرفة
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

// إلغاء الاشتراك
export async function unsubscribeFromRoom(channel: any) {
  await supabase.removeChannel(channel);
}
