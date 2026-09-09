import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

// LiveKit Import
import { registerGlobals } from '@livekit/react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { supabase } from '../lib/supabase';

// تسجيل WebRTC Globals فورياً في الجذر لمنع خطأ prototype undefined
try {
  registerGlobals();
} catch (error) {
  console.error('Failed to register LiveKit globals:', error);
}

const GOLD = '#D7A94B';
const BACKGROUND = '#090A0D';

export default function RootLayout() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;

    const initializeAuth = async () => {
      try {
        /*
         * محاولة استعادة الجلسة المحفوظة أولاً.
         */
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError) {
          console.error('Supabase session error:', sessionError);
        }

        if (session) {
          if (mounted) {
            setReady(true);
          }
          return;
        }

        /*
         * إنشاء حساب مجهول تلقائياً في حال عدم وجود جلسة.
         */
        const { data, error } = await supabase.auth.signInAnonymously();

        if (error) {
          console.error('Anonymous sign-in error:', error);
          throw error;
        }

        if (!data.session) {
          throw new Error('تم إنشاء المستخدم ولكن لم يتم إنشاء جلسة تسجيل الدخول.');
        }

        console.log('Anonymous user created:', data.user?.id);

        if (mounted) {
          setReady(true);
        }
      } catch (error: any) {
        console.error('Auth initialization failed:', error);

        if (mounted) {
          setReady(true);
        }
      }
    };

    void initializeAuth();

    /*
     * الاستماع لتغيرات حالة المصادقة.
     */
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log('Auth state changed:', event, session?.user?.id ?? 'no-user');
      }
    );

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  if (!ready) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: BACKGROUND,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ActivityIndicator size="large" color={GOLD} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="light" />

      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'fade',
        }}
      />
    </>
  );
}
