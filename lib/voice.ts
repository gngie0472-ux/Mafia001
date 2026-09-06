import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio';

export async function requestMicrophonePermission() {
  const result =
    await AudioModule.requestRecordingPermissionsAsync();

  return result.granted;
}

export async function prepareMicrophone() {
  const granted =
    await requestMicrophonePermission();

  if (!granted) {
    throw new Error(
      'لم يتم السماح باستخدام الميكروفون'
    );
  }

  await setAudioModeAsync({
    allowsRecording: true,
    playsInSilentMode: true,
  });

  return true;
}

export { RecordingPresets };
