import { supabase } from './supabase';

export type Profile = {
  user_id: string;
  username: string;
  avatar_url: string | null;
  wins: number;
  games: number;
  rating: number;
};

/**
 * التأكد من وجود جلسة تسجيل دخول صالحة.
 *
 * في React Native نعتمد أولًا على getSession()
 * لأن الجلسة محفوظة في AsyncStorage بواسطة supabase.ts.
 *
 * ثم نستخدم getUser() للتأكد من هوية المستخدم
 * عندما تكون الجلسة موجودة.
 */
async function ensureAuth() {
  try {
    const {
      data: sessionData,
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError) {
      console.error(
        'getSession error:',
        sessionError
      );

      throw new Error(
        'تعذر التحقق من جلسة تسجيل الدخول.'
      );
    }

    const session =
      sessionData?.session;

    if (!session?.access_token) {
      throw new Error(
        'يجب تسجيل الدخول أولاً.'
      );
    }

    /*
     * بعد التأكد من وجود session،
     * نحصل على المستخدم الحالي.
     */
    const {
      data: userData,
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) {
      console.error(
        'getUser error:',
        userError
      );

      throw new Error(
        'جلسة تسجيل الدخول غير صالحة. يرجى تسجيل الدخول مرة أخرى.'
      );
    }

    const user =
      userData?.user;

    if (!user) {
      throw new Error(
        'يجب تسجيل الدخول أولاً.'
      );
    }

    return user;
  } catch (error: any) {
    console.error(
      'ensureAuth error:',
      error
    );

    /*
     * نحول أخطاء Supabase مثل:
     * Auth session missing!
     * إلى رسالة مفهومة للمستخدم.
     */
    if (
      error?.message ===
        'Auth session missing!' ||
      error?.name ===
        'AuthSessionMissingError'
    ) {
      throw new Error(
        'انتهت جلسة تسجيل الدخول. يرجى تسجيل الدخول مرة أخرى.'
      );
    }

    throw error;
  }
}

export async function getCurrentUserId(): Promise<string> {
  const user =
    await ensureAuth();

  return user.id;
}

export async function getMyProfile(): Promise<Profile> {
  await ensureAuth();

  const {
    data,
    error,
  } = await supabase.rpc(
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
  /*
   * مهم:
   * نتحقق من الجلسة قبل استدعاء RPC.
   */
  await ensureAuth();

  const cleanName =
    username.trim();

  if (!cleanName) {
    throw new Error(
      'اسم اللاعب مطلوب.'
    );
  }

  const {
    data,
    error,
  } = await supabase.rpc(
    'ensure_my_profile',
    {
      p_username:
        cleanName,

      p_avatar_url:
        avatarUrl ?? null,
    }
  );

  if (error) {
    console.error(
      'saveMyProfile error:',
      error
    );

    /*
     * إذا كان الخطأ بسبب انتهاء الجلسة،
     * نعرض رسالة عربية واضحة.
     */
    if (
      error.message ===
        'Auth session missing!'
    ) {
      throw new Error(
        'انتهت جلسة تسجيل الدخول. يرجى تسجيل الدخول مرة أخرى.'
      );
    }

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
  const user =
    await ensureAuth();

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

  const {
    error: uploadError,
  } =
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

    if (
      uploadError.message ===
        'Auth session missing!'
    ) {
      throw new Error(
        'انتهت جلسة تسجيل الدخول. يرجى تسجيل الدخول مرة أخرى.'
      );
    }

    throw uploadError;
  }

  const {
    data: publicData,
  } =
    supabase.storage
      .from('avatars')
      .getPublicUrl(
        filePath
      );

  if (
    !publicData?.publicUrl
  ) {
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
  let avatarUrl:
    | string
    | null = null;

  /*
   * نتأكد من تسجيل الدخول قبل بدء عملية الحفظ
   * سواء كانت هناك صورة أم لا.
   */
  await ensureAuth();

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
