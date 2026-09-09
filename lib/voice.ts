import { AudioSession } from "@livekit/react-native";
import {
  PermissionsAndroid,
  Platform,
} from "react-native";

function getPermissionStatusGranted(): string {
  return PermissionsAndroid.RESULTS.GRANTED;
}

export async function requestMicrophonePermission(): Promise<boolean> {
  if (Platform.OS !== "android") {
    return true;
  }

  try {
    const permission =
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO;

    const current =
      await PermissionsAndroid.check(
        permission,
      );

    if (current) {
      return true;
    }

    const result =
      await PermissionsAndroid.request(
        permission,
        {
          title: "صلاحية الميكروفون",
          message:
            "تحتاج Mafia Night إلى استخدام الميكروفون للمحادثة الصوتية أثناء اللعبة.",
          buttonPositive: "السماح",
          buttonNegative: "رفض",
          buttonNeutral: "لاحقًا",
        },
      );

    return (
      result ===
      getPermissionStatusGranted()
    );
  } catch (error) {
    console.error(
      "requestMicrophonePermission:",
      error,
    );

    return false;
  }
}

export async function checkMicrophonePermission(): Promise<boolean> {
  if (Platform.OS !== "android") {
    return true;
  }

  try {
    return await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    );
  } catch (error) {
    console.error(
      "checkMicrophonePermission:",
      error,
    );

    return false;
  }
}

export async function prepareMicrophone(): Promise<boolean> {
  const granted =
    await requestMicrophonePermission();

  if (!granted) {
    throw new Error(
      "لم يتم السماح باستخدام الميكروفون.",
    );
  }

  try {
    if (
      AudioSession &&
      typeof AudioSession.startAudioSession ===
        "function"
    ) {
      await AudioSession.startAudioSession();
    }
  } catch (error) {
    console.error(
      "startAudioSession:",
      error,
    );

    /*
     * لا نرمي الخطأ هنا.
     * الاتصال بـ LiveKit يمكن أن يكمل،
     * بينما يتم التعامل مع حالة الصوت
     * من خلال Room/localParticipant.
     */
  }

  return true;
}

export async function stopMicrophoneSession(): Promise<void> {
  try {
    if (
      AudioSession &&
      typeof AudioSession.stopAudioSession ===
        "function"
    ) {
      await AudioSession.stopAudioSession();
    }
  } catch (error) {
    console.error(
      "stopAudioSession:",
      error,
    );
  }
}
