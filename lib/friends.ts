import { supabase } from '@/lib/supabase';

export type FriendProfile = {
  user_id: string;
  username: string;
  avatar_url: string | null;
  wins: number;
  games: number;
  rating: number;
};

export type Friend = {
  id: string;
  username: string;
  avatar_url: string | null;
  wins: number;
  games: number;
  rating: number;
  online: boolean;
};

export type FriendRequest = {
  id: string;
  user_id: string;
  username: string;
  avatar_url: string | null;
  wins: number;
  games: number;
  rating: number;
};

async function getCurrentUserId(): Promise<string> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) throw error;

  if (!user) {
    throw new Error('يجب تسجيل الدخول أولاً');
  }

  return user.id;
}

/**
 * البحث عن لاعبين حقيقيين في profiles
 */
export async function searchPlayers(
  search: string
): Promise<FriendProfile[]> {
  const userId = await getCurrentUserId();

  const query = search.trim();

  if (!query) return [];

  const { data, error } = await supabase
    .from('profiles')
    .select(
      'user_id, username, avatar_url, wins, games, rating'
    )
    .ilike('username', `%${query}%`)
    .neq('user_id', userId)
    .order('rating', { ascending: false })
    .limit(20);

  if (error) throw error;

  return (data ?? []) as FriendProfile[];
}

/**
 * إرسال طلب صداقة
 */
export async function sendFriendRequest(
  targetUserId: string
): Promise<void> {
  const userId = await getCurrentUserId();

  if (userId === targetUserId) {
    throw new Error('لا يمكنك إرسال طلب صداقة لنفسك');
  }

  // تحقق من وجود علاقة سابقة بأي اتجاه
  const { data: existing, error: existingError } = await supabase
    .from('friendships')
    .select('id, requester_id, addressee_id, status')
    .or(
      `and(requester_id.eq.${userId},addressee_id.eq.${targetUserId}),and(requester_id.eq.${targetUserId},addressee_id.eq.${userId})`
    )
    .maybeSingle();

  if (existingError) throw existingError;

  if (existing) {
    if (existing.status === 'accepted') {
      throw new Error('هذا اللاعب موجود بالفعل في قائمة أصدقائك');
    }

    if (
      existing.status === 'pending' &&
      existing.requester_id === userId
    ) {
      throw new Error('لقد أرسلت طلب صداقة بالفعل');
    }

    if (
      existing.status === 'pending' &&
      existing.addressee_id === userId
    ) {
      throw new Error('لديك طلب صداقة من هذا اللاعب بالفعل');
    }

    // السماح بإعادة إرسال طلب بعد رفض سابق
    if (existing.status === 'rejected') {
      const { error } = await supabase
        .from('friendships')
        .update({
          requester_id: userId,
          addressee_id: targetUserId,
          status: 'pending',
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);

      if (error) throw error;

      return;
    }
  }

  const { error } = await supabase
    .from('friendships')
    .insert({
      requester_id: userId,
      addressee_id: targetUserId,
      status: 'pending',
    });

  if (error) throw error;
}

/**
 * جلب الأصدقاء المقبولين
 */
export async function getFriends(): Promise<Friend[]> {
  const userId = await getCurrentUserId();

  const { data, error } = await supabase
    .from('friendships')
    .select(
      `
      id,
      requester_id,
      addressee_id,
      status
    `
    )
    .eq('status', 'accepted')
    .or(
      `requester_id.eq.${userId},addressee_id.eq.${userId}`
    );

  if (error) throw error;

  if (!data || data.length === 0) {
    return [];
  }

  const friendIds = data.map((friendship) =>
    friendship.requester_id === userId
      ? friendship.addressee_id
      : friendship.requester_id
  );

  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select(
      'user_id, username, avatar_url, wins, games, rating'
    )
    .in('user_id', friendIds);

  if (profilesError) throw profilesError;

  const profileMap = new Map(
    (profiles ?? []).map((profile) => [
      profile.user_id,
      profile,
    ])
  );

  return data
    .map((friendship) => {
      const friendId =
        friendship.requester_id === userId
          ? friendship.addressee_id
          : friendship.requester_id;

      const profile = profileMap.get(friendId);

      if (!profile) return null;

      return {
        id: friendship.id,
        username: profile.username,
        avatar_url: profile.avatar_url,
        wins: profile.wins ?? 0,
        games: profile.games ?? 0,
        rating: profile.rating ?? 0,
        online: false,
      };
    })
    .filter(Boolean) as Friend[];
}

/**
 * جلب طلبات الصداقة الواردة
 */
export async function getFriendRequests(): Promise<FriendRequest[]> {
  const userId = await getCurrentUserId();

  const { data, error } = await supabase
    .from('friendships')
    .select(
      `
      id,
      requester_id,
      status
    `
    )
    .eq('addressee_id', userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) throw error;

  if (!data || data.length === 0) {
    return [];
  }

  const requesterIds = data.map(
    (request) => request.requester_id
  );

  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select(
      'user_id, username, avatar_url, wins, games, rating'
    )
    .in('user_id', requesterIds);

  if (profilesError) throw profilesError;

  const profileMap = new Map(
    (profiles ?? []).map((profile) => [
      profile.user_id,
      profile,
    ])
  );

  return data
    .map((request) => {
      const profile = profileMap.get(request.requester_id);

      if (!profile) return null;

      return {
        id: request.id,
        user_id: profile.user_id,
        username: profile.username,
        avatar_url: profile.avatar_url,
        wins: profile.wins ?? 0,
        games: profile.games ?? 0,
        rating: profile.rating ?? 0,
      };
    })
    .filter(Boolean) as FriendRequest[];
}

/**
 * قبول طلب صداقة
 */
export async function acceptFriendRequest(
  friendshipId: string
): Promise<void> {
  const userId = await getCurrentUserId();

  const { error } = await supabase
    .from('friendships')
    .update({
      status: 'accepted',
      updated_at: new Date().toISOString(),
    })
    .eq('id', friendshipId)
    .eq('addressee_id', userId)
    .eq('status', 'pending');

  if (error) throw error;
}

/**
 * رفض طلب صداقة
 */
export async function rejectFriendRequest(
  friendshipId: string
): Promise<void> {
  const userId = await getCurrentUserId();

  const { error } = await supabase
    .from('friendships')
    .delete()
    .eq('id', friendshipId)
    .eq('addressee_id', userId)
    .eq('status', 'pending');

  if (error) throw error;
}

/**
 * حذف صديق
 */
export async function removeFriend(
  friendshipId: string
): Promise<void> {
  const userId = await getCurrentUserId();

  const { error } = await supabase
    .from('friendships')
    .delete()
    .eq('id', friendshipId)
    .or(
      `requester_id.eq.${userId},addressee_id.eq.${userId}`
    );

  if (error) throw error;
}

/**
 * معرفة حالة العلاقة مع لاعب
 */
export async function getFriendshipStatus(
  targetUserId: string
): Promise<
  'none' | 'pending_sent' | 'pending_received' | 'accepted'
> {
  const userId = await getCurrentUserId();

  if (userId === targetUserId) {
    return 'none';
  }

  const { data, error } = await supabase
    .from('friendships')
    .select(
      'requester_id, addressee_id, status'
    )
    .or(
      `and(requester_id.eq.${userId},addressee_id.eq.${targetUserId}),and(requester_id.eq.${targetUserId},addressee_id.eq.${userId})`
    )
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    return 'none';
  }

  if (data.status === 'accepted') {
    return 'accepted';
  }

  if (
    data.status === 'pending' &&
    data.requester_id === userId
  ) {
    return 'pending_sent';
  }

  if (
    data.status === 'pending' &&
    data.addressee_id === userId
  ) {
    return 'pending_received';
  }

  return 'none';
}
