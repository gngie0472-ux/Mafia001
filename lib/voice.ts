import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
} from 'expo-audio';

export async function requestMicrophonePermission(): Promise<boolean> {
  const result =
    await AudioModule.requestRecordingPermissionsAsync();

  return result.granted;
}

export async function prepareMicrophone(): Promise<boolean> {
  const granted =
    await requestMicrophonePermission();

  if (!granted) {
    throw new Error(
      'لم يتم السماح باستخدام الميكروفون.'
    );
  }

  await setAudioModeAsync({
    allowsRecording: true,
    playsInSilentMode: true,
  });

  return true;
}

export async function checkMicrophonePermission(): Promise<boolean> {
  const result =
    await AudioModule.getRecordingPermissionsAsync();

  return result.granted;
}

export { RecordingPresets };
