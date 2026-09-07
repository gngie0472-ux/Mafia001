import React, { useEffect, useState } from 'react';

import {
  ActivityIndicator,
  View,
} from 'react-native';

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { supabase } from '../lib/supabase';

const GOLD = '#D7A94B';
const BACKGROUND = '#090A0D';

export default function RootLayout() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;

    const initializeAuth = async () => {
      try {
        /*
         * أولاً نحاول استعادة الجلسة المحفوظة.
         * إذا كان اللاعب قد استخدم التطبيق من قبل،
         * فلن ننشئ مستخدمًا جديدًا.
         */
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError) {
          console.error(
            'Supabase session error:',
            sessionError
          );
        }

        /*
         * توجد جلسة بالفعل.
         */
        if (session) {
          if (mounted) {
            setReady(true);
          }

          return;
        }

        /*
         * لا توجد جلسة.
         *
         * بما أن Anonymous Sign-In مفعّل في Supabase،
         * ننشئ حسابًا مجهولًا تلقائيًا.
         */
        const {
          data,
          error,
        } = await supabase.auth.signInAnonymously();

        if (error) {
          console.error(
            'Anonymous sign-in error:',
            error
          );

          throw error;
        }

        if (!data.session) {
          throw new Error(
            'تم إنشاء المستخدم ولكن لم يتم إنشاء جلسة تسجيل الدخول.'
          );
        }

        console.log(
          'Anonymous user created:',
          data.user?.id
        );

        if (mounted) {
          setReady(true);
        }
      } catch (error: any) {
        console.error(
          'Auth initialization failed:',
          error
        );

        /*
         * نسمح للتطبيق بالاستمرار بدل بقائه في شاشة تحميل
         * لا نهائية. إذا كان هناك خطأ سنراه في الصفحة التي
         * تحتاج إلى Auth.
         */
        if (mounted) {
          setReady(true);
        }
      }
    };

    initializeAuth();

    /*
     * متابعة تغييرات حالة تسجيل الدخول.
     */
    const {
      data: authListener,
    } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log(
          'Auth state changed:',
          event,
          session?.user?.id ?? 'no-user'
        );
      }
    );

    return () => {
      mounted = false;

      authListener.subscription.unsubscribe();
    };
  }, []);

  /*
   * لا نعرض صفحات التطبيق قبل الانتهاء من محاولة
   * استعادة/إنشاء جلسة Supabase.
   */
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
        <ActivityIndicator
          size="large"
          color={GOLD}
        />
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
