// lib/livekit.ts

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

function getErrorMessage(error: any, fallback: string): string {
  if (typeof error === 'string' && error.trim()) {
    return error;
  }

  if (error?.message && typeof error.message === 'string') {
    return error.message;
  }

  if (error?.details && typeof error.details === 'string') {
    return error.details;
  }

  if (error?.hint && typeof error.hint === 'string') {
    return error.hint;
  }

  return fallback;
}

export async function getLiveKitToken(
  roomValue: string,
): Promise<LiveKitTokenResponse> {
  const value = String(roomValue ?? '').trim();

  if (!value) {
    throw new Error('معرف الغرفة غير موجود.');
  }

  let roomId = value;

  // The game route may contain the 6-character room code.
  // LiveKit must always receive the real UUID.
  if (!isUuid(value)) {
    const { data, error } = await supabase
      .from('rooms')
      .select('id')
      .eq('code', value.toUpperCase())
      .maybeSingle();

    if (error) {
      throw new Error(
        getErrorMessage(error, 'تعذر العثور على الغرفة.'),
      );
    }

    if (!data?.id || !isUuid(String(data.id))) {
      throw new Error('الغرفة غير موجودة.');
    }

    roomId = String(data.id);
  }

  if (
    !isUuid(roomId) ||
    roomId.includes('${') ||
    roomId.includes('}')
  ) {
    throw new Error('معرف الغرفة غير صالح.');
  }

  const { data, error } = await supabase.functions.invoke(
    'livekit-token',
    {
      body: {
        room_id: roomId,
      },
    },
  );

  if (error) {
    console.error('LiveKit token error:', error);

    throw new Error(
      getErrorMessage(
        error,
        'تعذر الحصول على رمز الاتصال الصوتي.',
      ),
    );
  }

  if (
    !data ||
    typeof data.token !== 'string' ||
    !data.token.trim() ||
    typeof data.server_url !== 'string' ||
    !data.server_url.trim()
  ) {
    throw new Error(
      'خادم الصوت لم يرجع بيانات اتصال صحيحة.',
    );
  }

  const returnedRoomId =
    typeof data.room_id === 'string' &&
    isUuid(data.room_id)
      ? data.room_id
      : roomId;

  return {
    token: data.token,
    server_url: data.server_url,
    room_id: returnedRoomId,
  };
}
