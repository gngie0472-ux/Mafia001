import { AudioSession } from '@livekit/react-native';
import { PermissionsAndroid, Platform } from 'react-native';

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

  // بدء AudioSession لـ LiveKit بأمان مع التحقق من توفر الوحدة
  try {
    if (AudioSession && typeof AudioSession.startAudioSession === 'function') {
      await AudioSession.startAudioSession();
    } else {
      console.warn('AudioSession is not available or startAudioSession is not a function.');
    }
  } catch (error) {
    console.warn('AudioSession initialized or skipped:', error);
  }

  return true;
}

export async function stopMicrophoneSession(): Promise<void> {
  try {
    if (AudioSession && typeof AudioSession.stopAudioSession === 'function') {
      await AudioSession.stopAudioSession();
    }
  } catch (error) {
    console.warn('AudioSession stop skipped:', error);
  }
}
