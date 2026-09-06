import { supabase } from './supabase';

export type RoomMessage = {
  id: string;
  room_id: string;
  user_id: string;
  message: string;
  created_at: string;
  username?: string;
  avatar_url?: string | null;
};

export async function getRoomMessages(
  roomId: string
): Promise<RoomMessage[]> {
  const { data, error } = await supabase
    .from('room_messages')
    .select(`
      id,
      room_id,
      user_id,
      message,
      created_at
    `)
    .eq('room_id', roomId)
    .order('created_at', {
      ascending: true,
    })
    .limit(100);

  if (error) {
    throw new Error(
      error.message || 'تعذر تحميل الرسائل'
    );
  }

  const messages = data ?? [];

  if (messages.length === 0) {
    return [];
  }

  const userIds = [
    ...new Set(messages.map((item) => item.user_id)),
  ];

  const { data: profiles } = await supabase
    .from('profiles')
    .select('user_id,username,avatar_url')
    .in('user_id', userIds);

  const profileMap = new Map(
    (profiles ?? []).map((profile) => [
      profile.user_id,
      profile,
    ])
  );

  return messages.map((message) => {
    const profile = profileMap.get(message.user_id);

    return {
      ...message,
      username: profile?.username ?? 'Player',
      avatar_url: profile?.avatar_url ?? null,
    };
  });
}

export async function sendRoomMessage(
  roomId: string,
  message: string
) {
  const text = message.trim();

  if (!text) {
    return null;
  }

  if (text.length > 500) {
    throw new Error(
      'الرسالة طويلة جدًا'
    );
  }

  const { data, error } =
    await supabase.rpc('send_room_message', {
      p_room_id: roomId,
      p_message: text,
    });

  if (error) {
    throw new Error(
      error.message || 'تعذر إرسال الرسالة'
    );
  }

  return data;
}

export function subscribeToRoomMessages(
  roomId: string,
  callback: (message: RoomMessage) => void
) {
  const channel = supabase
    .channel(`room-messages-${roomId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'room_messages',
        filter: `room_id=eq.${roomId}`,
      },
      async (payload) => {
        const row = payload.new as RoomMessage;

        try {
          const { data: profile } =
            await supabase
              .from('profiles')
              .select(
                'user_id,username,avatar_url'
              )
              .eq('user_id', row.user_id)
              .maybeSingle();

          callback({
            ...row,
            username:
              profile?.username ?? 'Player',
            avatar_url:
              profile?.avatar_url ?? null,
          });
        } catch {
          callback(row);
        }
      }
    )
    .subscribe();

  return channel;
}

export async function unsubscribeChat(
  channel: any
) {
  if (channel) {
    await supabase.removeChannel(channel);
  }
}
