import { supabase } from './supabase';

export type Profile = {
  user_id: string;
  username: string;
  avatar_url: string | null;
  wins: number;
  games: number;
  rating: number;
  created_at?: string;
  updated_at?: string;
};

async function ensureAuth() {
  const { data } = await supabase.auth.getUser();

  if (data.user) {
    return data.user;
  }

  const { data: authData, error } =
    await supabase.auth.signInAnonymously();

  if (error || !authData.user) {
    throw new Error(
      error?.message || 'تعذر إنشاء حساب اللاعب'
    );
  }

  return authData.user;
}

export async function getMyProfile(): Promise<Profile> {
  await ensureAuth();

  const { data, error } =
    await supabase.rpc('get_my_profile');

  if (error) {
    throw new Error(
      error.message || 'تعذر تحميل الملف الشخصي'
    );
  }

  if (!data) {
    throw new Error('لم يتم العثور على الملف الشخصي');
  }

  return data as Profile;
}

export async function saveMyProfile(
  username: string,
  avatarUrl?: string | null
): Promise<Profile> {
  await ensureAuth();

  const cleanName = username.trim();

  if (cleanName.length < 2) {
    throw new Error(
      'اسم اللاعب يجب أن يحتوي على حرفين على الأقل'
    );
  }

  if (cleanName.length > 24) {
    throw new Error(
      'اسم اللاعب يجب ألا يتجاوز 24 حرفًا'
    );
  }

  const { data, error } =
    await supabase.rpc('ensure_my_profile', {
      p_username: cleanName,
      p_avatar_url: avatarUrl || null,
    });

  if (error) {
    throw new Error(
      error.message || 'تعذر حفظ الملف الشخصي'
    );
  }

  return data as Profile;
}

/**
 * رفع صورة اللاعب إلى Supabase Storage.
 *
 * imageUri:
 *   المسار المحلي للصورة المختارة من الهاتف.
 */
export async function uploadAvatar(
  imageUri: string
): Promise<string> {
  const user = await ensureAuth();

  if (!imageUri) {
    throw new Error('لم يتم اختيار صورة.');
  }

  const response = await fetch(imageUri);

  if (!response.ok) {
    throw new Error('تعذر قراءة صورة الملف الشخصي.');
  }

  const arrayBuffer = await response.arrayBuffer();

  const filePath = `${user.id}/avatar.jpg`;

  const { error: uploadError } =
    await supabase.storage
      .from('avatars')
      .upload(filePath, arrayBuffer, {
        contentType: 'image/jpeg',
        upsert: true,
      });

  if (uploadError) {
    throw new Error(
      uploadError.message ||
        'تعذر رفع صورة الملف الشخصي.'
    );
  }

  const { data } =
    supabase.storage
      .from('avatars')
      .getPublicUrl(filePath);

  if (!data?.publicUrl) {
    throw new Error(
      'تعذر الحصول على رابط صورة الملف الشخصي.'
    );
  }

  return `${data.publicUrl}?t=${Date.now()}`;
}

export async function saveMyProfileWithAvatar(
  username: string,
  imageUri?: string | null
): Promise<Profile> {
  let avatarUrl: string | null = null;

  if (imageUri) {
    avatarUrl = await uploadAvatar(imageUri);
  }

  return saveMyProfile(
    username,
    avatarUrl
  );
}

export async function getCurrentUserId() {
  const user = await ensureAuth();
  return user.id;
}
