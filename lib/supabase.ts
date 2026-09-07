import 'react-native-url-polyfill/auto'

import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl) {
  throw new Error(
    'EXPO_PUBLIC_SUPABASE_URL غير موجود في إعدادات البيئة.'
  )
}

if (!supabaseAnonKey) {
  throw new Error(
    'EXPO_PUBLIC_SUPABASE_ANON_KEY غير موجود في إعدادات البيئة.'
  )
}

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      storage: AsyncStorage,

      // الاحتفاظ بتسجيل الدخول بعد إغلاق التطبيق
      persistSession: true,

      // تجديد الجلسة تلقائيًا قبل انتهائها
      autoRefreshToken: true,

      // React Native لا يحتاج إلى قراءة session من URL
      detectSessionInUrl: false,
    },
  }
)
