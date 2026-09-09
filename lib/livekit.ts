import { supabase } from "./supabase";

export type LiveKitTokenResponse = {
  token: string;
  server_url: string;
  room_id: string;
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_REGEX.test(value.trim());
}

function getErrorMessage(
  error: unknown,
  fallback: string,
): string {
  if (typeof error === "string" && error.trim()) {
    return error;
  }

  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as any).message === "string"
  ) {
    return (error as any).message;
  }

  if (
    error &&
    typeof error === "object" &&
    "details" in error &&
    typeof (error as any).details === "string"
  ) {
    return (error as any).details;
  }

  if (
    error &&
    typeof error === "object" &&
    "hint" in error &&
    typeof (error as any).hint === "string"
  ) {
    return (error as any).hint;
  }

  return fallback;
}

async function resolveRoomId(
  roomValue: string,
): Promise<string> {
  const value = String(roomValue ?? "").trim();

  if (!value) {
    throw new Error("معرف الغرفة غير موجود.");
  }

  if (isUuid(value)) {
    return value;
  }

  const { data, error } = await supabase
    .from("rooms")
    .select("id")
    .eq("code", value.toUpperCase())
    .maybeSingle();

  if (error) {
    throw new Error(
      getErrorMessage(
        error,
        "تعذر العثور على الغرفة.",
      ),
    );
  }

  if (!data?.id || !isUuid(String(data.id))) {
    throw new Error(
      "الغرفة غير موجودة أو لم تعد متاحة.",
    );
  }

  return String(data.id);
}

export async function getLiveKitToken(
  roomValue: string,
): Promise<LiveKitTokenResponse> {
  const roomId = await resolveRoomId(roomValue);

  if (!isUuid(roomId)) {
    throw new Error("معرف الغرفة غير صالح.");
  }

  const {
    data,
    error,
  } = await supabase.functions.invoke(
    "livekit-token",
    {
      body: {
        room_id: roomId,
      },
    },
  );

  if (error) {
    console.error(
      "LiveKit token error:",
      error,
    );

    throw new Error(
      getErrorMessage(
        error,
        "تعذر الحصول على رمز الاتصال الصوتي.",
      ),
    );
  }

  if (!data) {
    throw new Error(
      "خادم الصوت لم يرجع أي بيانات.",
    );
  }

  if (
    typeof data.token !== "string" ||
    !data.token.trim()
  ) {
    throw new Error(
      "رمز LiveKit غير صالح.",
    );
  }

  if (
    typeof data.server_url !== "string" ||
    !data.server_url.trim()
  ) {
    throw new Error(
      "عنوان خادم LiveKit غير صالح.",
    );
  }

  const returnedRoomId =
    typeof data.room_id === "string" &&
    isUuid(data.room_id)
      ? data.room_id
      : roomId;

  return {
    token: data.token,
    server_url: data.server_url,
    room_id: returnedRoomId,
  };
}

export { resolveRoomId };
