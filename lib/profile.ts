import { supabase } from './supabase';

export type Profile = {
  user_id: string;
  username: string;
  avatar_url: string | null;
  wins: number;
  games: number;
  rating: number;
};

async function ensureAuth() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    throw error;
  }

  if (!user) {
    throw new Error(
      'يجب تسجيل الدخول أولاً.'
    );
  }

  return user;
}

export async function getCurrentUserId(): Promise<string> {
  const user = await ensureAuth();
  return user.id;
}

export async function getMyProfile(): Promise<Profile> {
  await ensureAuth();

  const { data, error } =
    await supabase.rpc(
      'get_my_profile'
    );

  if (error) {
    console.error(
      'getMyProfile error:',
      error
    );
    throw error;
  }

  if (!data) {
    throw new Error(
      'لم يتم العثور على الملف الشخصي.'
    );
  }

  return data as Profile;
}

export async function saveMyProfile(
  username: string,
  avatarUrl?: string | null
): Promise<Profile> {
  await ensureAuth();

  const cleanName =
    username.trim();

  if (!cleanName) {
    throw new Error(
      'اسم اللاعب مطلوب.'
    );
  }

  const { data, error } =
    await supabase.rpc(
      'ensure_my_profile',
      {
        p_username: cleanName,
        p_avatar_url:
          avatarUrl ?? null,
      }
    );

  if (error) {
    console.error(
      'saveMyProfile error:',
      error
    );
    throw error;
  }

  if (!data) {
    throw new Error(
      'تعذر حفظ الملف الشخصي.'
    );
  }

  return data as Profile;
}

export async function uploadAvatar(
  imageUri: string
): Promise<string> {
  const user = await ensureAuth();

  if (!imageUri) {
    throw new Error(
      'لم يتم اختيار صورة.'
    );
  }

  const response =
    await fetch(imageUri);

  if (!response.ok) {
    throw new Error(
      'تعذر قراءة الصورة.'
    );
  }

  const arrayBuffer =
    await response.arrayBuffer();

  const filePath =
    `${user.id}/avatar-${Date.now()}.jpg`;

  const { error: uploadError } =
    await supabase.storage
      .from('avatars')
      .upload(
        filePath,
        arrayBuffer,
        {
          contentType:
            'image/jpeg',
          upsert: true,
        }
      );

  if (uploadError) {
    console.error(
      'uploadAvatar error:',
      uploadError
    );
    throw uploadError;
  }

  const {
    data: publicData,
  } =
    supabase.storage
      .from('avatars')
      .getPublicUrl(filePath);

  if (!publicData?.publicUrl) {
    throw new Error(
      'تعذر الحصول على رابط الصورة.'
    );
  }

  return publicData.publicUrl;
}

export async function saveMyProfileWithAvatar(
  username: string,
  imageUri?: string | null
): Promise<Profile> {
  let avatarUrl: string | null = null;

  if (imageUri) {
    avatarUrl =
      await uploadAvatar(
        imageUri
      );
  } else {
    try {
      const current =
        await getMyProfile();

      avatarUrl =
        current.avatar_url ||
        null;
    } catch {
      avatarUrl = null;
    }
  }

  return saveMyProfile(
    username,
    avatarUrl
  );
}
