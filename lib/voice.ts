import { Platform, PermissionsAndroid } from 'react-native';
import { AudioSession } from '@livekit/react-native';

export async function requestMicrophonePermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;

  try {
    const permission = PermissionsAndroid.PERMISSIONS.RECORD_AUDIO;
    const alreadyGranted = await PermissionsAndroid.check(permission);

    if (alreadyGranted) return true;

    const result = await PermissionsAndroid.request(permission, {
      title: 'صلاحية الميكروفون',
      message: 'تحتاج اللعبة إلى استخدام الميكروفون للمحادثة الصوتية.',
      buttonPositive: 'السماح',
      buttonNegative: 'رفض',
    });

    return result === PermissionsAndroid.RESULTS.GRANTED;
  } catch (error) {
    console.error('microphone permission error:', error);
    return false;
  }
}

export async function checkMicrophonePermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  return PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
}

export async function prepareMicrophone(): Promise<boolean> {
  const granted = await requestMicrophonePermission();

  if (!granted) {
    throw new Error('لم يتم السماح باستخدام الميكروفون.');
  }

  // التأكد من توفر محرك WebRTC لمنع أخطاء prototype
  if (typeof global.RTCPeerConnection === 'undefined') {
    throw new Error('محرك WebRTC غير متهيّأ في التطبيق.');
  }

  // بدء AudioSession آمن
  try {
    await AudioSession.startAudioSession();
  } catch (error) {
    console.warn('AudioSession initialized or skipped:', error);
  }

  return true;
}

export async function stopMicrophoneSession(): Promise<void> {
  try {
    await AudioSession.stopAudioSession();
  } catch (error) {
    console.warn('AudioSession stop skipped:', error);
  }
}
