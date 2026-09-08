import { supabase } from './supabase';

export type LiveKitTokenResponse = {
  token: string;
  server_url: string;
  room_id: string;
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_REGEX.test(value.trim());
}

function getErrorMessage(
  error: any,
  fallback: string,
): string {
  if (
    typeof error === 'string' &&
    error.trim()
  ) {
    return error;
  }

  if (
    error?.message &&
    typeof error.message === 'string'
  ) {
    return error.message;
  }

  return fallback;
}

/**
 * الحصول على LiveKit token.
 *
 * يقبل:
 * - UUID الحقيقي للغرفة
 * - أو كود الغرفة القصير مثل ABC123
 *
 * وفي حالة الكود يتم تحويله إلى UUID
 * قبل استدعاء Edge Function.
 */
export async function getLiveKitToken(
  roomValue: string,
): Promise<LiveKitTokenResponse> {
  const value = roomValue?.trim();

  if (!value) {
    throw new Error(
      'معرف الغرفة غير موجود.',
    );
  }

  let roomId = value;

  /*
   * إذا لم تكن القيمة UUID،
   * نعتبرها كود الغرفة ونبحث عن UUID الحقيقي.
   */
  if (!isUuid(value)) {
    const {
      data: room,
      error: roomError,
    } = await supabase
      .from('rooms')
      .select('id')
      .eq(
        'code',
        value.toUpperCase(),
      )
      .maybeSingle();

    if (roomError) {
      throw new Error(
        getErrorMessage(
          roomError,
          'تعذر العثور على الغرفة.',
        ),
      );
    }

    if (!room?.id) {
      throw new Error(
        'الغرفة غير موجودة.',
      );
    }

    roomId = room.id;
  }

  /*
   * حماية إضافية:
   * لا نسمح أبدًا بإرسال قيمة مثل
   * ${room.id}
   * إلى Supabase.
   */
  if (
    !isUuid(roomId) ||
    roomId.includes('${') ||
    roomId.includes('}')
  ) {
    throw new Error(
      'معرف الغرفة غير صالح.',
    );
  }

  const {
    data,
    error,
  } =
    await supabase.functions.invoke(
      'livekit-token',
      {
        body: {
          room_id: roomId,
        },
      },
    );

  if (error) {
    console.error(
      'LiveKit token error:',
      error,
    );

    throw new Error(
      getErrorMessage(
        error,
        'تعذر الحصول على رمز الصوت.',
      ),
    );
  }

  if (
    !data?.token ||
    !data?.server_url
  ) {
    throw new Error(
      'خادم الصوت لم يرجع بيانات الاتصال المطلوبة.',
    );
  }

  /*
   * إذا أعاد الخادم room_id،
   * نتحقق منه أيضًا.
   */
  if (
    data.room_id &&
    typeof data.room_id === 'string' &&
    !isUuid(data.room_id)
  ) {
    throw new Error(
      'خادم الصوت أعاد معرف غرفة غير صالح.',
    );
  }

  return {
    token: String(data.token),
    server_url: String(data.server_url),
    room_id:
      typeof data.room_id === 'string' &&
      isUuid(data.room_id)
        ? data.room_id
        : roomId,
  };
}
