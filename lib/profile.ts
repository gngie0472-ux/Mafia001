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
 * التأكد من وجود جلسة Supabase صالحة.
 *
 * Anonymous users لديهم Session عادية في Supabase،
 * لذلك auth.uid() سيعمل معهم مثل المستخدمين المسجلين.
 */
async function ensureAuth() {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) {
    console.error(
      'getSession error:',
      sessionError
    );

    throw sessionError;
  }

  if (!session?.access_token) {
    throw new Error(
      'انتهت جلسة تسجيل الدخول. يرجى إعادة فتح التطبيق.'
    );
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    console.error(
      'getUser error:',
      userError
    );

    /*
     * معالجة الخطأ الشائع:
     * Auth session missing!
     */
    if (
      userError.message?.includes(
        'Auth session missing'
      ) ||
      userError.name ===
        'AuthSessionMissingError'
    ) {
      throw new Error(
        'انتهت جلسة تسجيل الدخول. يرجى إعادة فتح التطبيق.'
      );
    }

    throw userError;
  }

  if (!user) {
    throw new Error(
      'لم يتم العثور على مستخدم مسجل.'
    );
  }

  return user;
}

/**
 * الحصول على ID المستخدم الحالي.
 */
export async function getCurrentUserId(): Promise<string> {
  const user = await ensureAuth();

  return user.id;
}

/**
 * الحصول على الملف الشخصي الحالي.
 *
 * إذا كان المستخدم جديدًا ولا يوجد له Profile،
 * يتم إنشاؤه تلقائيًا باسم Player.
 */
export async function getMyProfile(): Promise<Profile> {
  await ensureAuth();

  /*
   * نحاول أولاً الحصول على الملف الموجود.
   */
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

  /*
   * إذا كان الملف موجودًا نعيده مباشرة.
   */
  if (data) {
    return data as Profile;
  }

  /*
   * المستخدم جديد ولا يوجد له Profile.
   *
   * ensure_my_profile تقوم بإنشائه باستخدام auth.uid().
   */
  const {
    data: createdProfile,
    error: createError,
  } = await supabase.rpc(
    'ensure_my_profile',
    {
      p_username: 'Player',
      p_avatar_url: null,
    }
  );

  if (createError) {
    console.error(
      'create profile error:',
      createError
    );

    throw createError;
  }

  if (!createdProfile) {
    throw new Error(
      'تعذر إنشاء الملف الشخصي.'
    );
  }

  return createdProfile as Profile;
}

/**
 * حفظ اسم المستخدم والصورة.
 */
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

  if (cleanName.length < 2) {
    throw new Error(
      'اسم اللاعب يجب أن يكون حرفين على الأقل.'
    );
  }

  if (cleanName.length > 24) {
    throw new Error(
      'اسم اللاعب يجب ألا يتجاوز 24 حرفًا.'
    );
  }

  const {
    data,
    error,
  } = await supabase.rpc(
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

    if (
      error.message?.includes(
        'Auth session missing'
      )
    ) {
      throw new Error(
        'انتهت جلسة تسجيل الدخول. يرجى إعادة فتح التطبيق.'
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

/**
 * رفع صورة الحساب إلى Supabase Storage.
 */
export async function uploadAvatar(
  imageUri: string
): Promise<string> {
  const user = await ensureAuth();

  if (!imageUri) {
    throw new Error(
      'لم يتم اختيار صورة.'
    );
  }

  /*
   * قراءة الصورة من URI الخاص بالجهاز.
   */
  const response =
    await fetch(imageUri);

  if (!response.ok) {
    throw new Error(
      'تعذر قراءة الصورة.'
    );
  }

  const arrayBuffer =
    await response.arrayBuffer();

  /*
   * كل مستخدم يحصل على مجلد خاص به.
   */
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

    throw uploadError;
  }

  /*
   * الحصول على الرابط العام للصورة.
   */
  const {
    data: publicData,
  } =
    supabase.storage
      .from('avatars')
      .getPublicUrl(
        filePath
      );

  if (!publicData?.publicUrl) {
    throw new Error(
      'تعذر الحصول على رابط الصورة.'
    );
  }

  return publicData.publicUrl;
}

/**
 * حفظ الملف الشخصي مع الصورة الجديدة.
 *
 * إذا لم توجد صورة جديدة، يتم الاحتفاظ
 * بالصورة الحالية.
 */
export async function saveMyProfileWithAvatar(
  username: string,
  imageUri?: string | null
): Promise<Profile> {
  /*
   * التأكد من وجود Session قبل تنفيذ أي عملية.
   */
  await ensureAuth();

  let avatarUrl:
    | string
    | null = null;

  /*
   * إذا اختار المستخدم صورة جديدة،
   * نرفعها أولاً.
   */
  if (imageUri) {
    avatarUrl =
      await uploadAvatar(
        imageUri
      );
  } else {
    /*
     * لا توجد صورة جديدة.
     * نحتفظ بالصورة الحالية.
     */
    try {
      const current =
        await getMyProfile();

      avatarUrl =
        current.avatar_url ||
        null;
    } catch (error) {
      console.error(
        'get current profile error:',
        error
      );

      avatarUrl = null;
    }
  }

  /*
   * حفظ الاسم والرابط.
   */
  return saveMyProfile(
    username,
    avatarUrl
  );
}
