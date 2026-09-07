import React, { useEffect, useState } from 'react';

import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { supabase } from '@/lib/supabase';

import {
  getMyProfile,
  saveMyProfileWithAvatar,
  Profile,
} from '@/lib/profile';

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();

  const [profile, setProfile] =
    useState<Profile | null>(null);

  const [username, setUsername] =
    useState('');

  const [avatarUri, setAvatarUri] =
    useState<string | null>(null);

  const [newAvatarUri, setNewAvatarUri] =
    useState<string | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [checkingAuth, setCheckingAuth] =
    useState(true);

  useEffect(() => {
    initializeProfile();

    const {
      data: authListener,
    } =
      supabase.auth.onAuthStateChange(
        async (_event, session) => {
          if (!session?.user) {
            setProfile(null);
            setUsername('');
            setAvatarUri(null);
            setNewAvatarUri(null);

            setLoading(false);
            setCheckingAuth(false);

            return;
          }

          /*
           * إذا عادت الجلسة بعد أن كان
           * التطبيق ينتظر استعادتها، نحمل
           * الملف الشخصي من جديد.
           */
          await loadProfile();
        }
      );

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  /**
   * تهيئة الصفحة والتأكد من وجود جلسة.
   */
  async function initializeProfile() {
    try {
      setCheckingAuth(true);
      setLoading(true);

      /*
       * getSession() يسترجع الجلسة المحفوظة
       * في AsyncStorage.
       */
      const {
        data,
        error,
      } =
        await supabase.auth.getSession();

      if (error) {
        console.error(
          'Profile getSession error:',
          error
        );

        Alert.alert(
          'تسجيل الدخول',
          'تعذر استعادة جلسة تسجيل الدخول. يرجى تسجيل الدخول مرة أخرى.',
          [
            {
              text: 'حسنًا',
              onPress: () => {
                router.replace('/login');
              },
            },
          ]
        );

        return;
      }

      if (!data.session?.user) {
        Alert.alert(
          'تسجيل الدخول مطلوب',
          'يجب تسجيل الدخول أولًا للوصول إلى الملف الشخصي.',
          [
            {
              text: 'تسجيل الدخول',
              onPress: () => {
                router.replace('/login');
              },
            },
          ]
        );

        return;
      }

      await loadProfile();
    } catch (error: any) {
      console.error(
        'initializeProfile error:',
        error
      );

      Alert.alert(
        'خطأ',
        error?.message ||
          'تعذر تحميل الملف الشخصي.'
      );
    } finally {
      setCheckingAuth(false);
      setLoading(false);
    }
  }

  /**
   * تحميل الملف الشخصي.
   */
  async function loadProfile() {
    try {
      setLoading(true);

      /*
       * تحقق إضافي قبل استدعاء RPC.
       */
      const {
        data: sessionData,
      } =
        await supabase.auth.getSession();

      if (!sessionData.session?.user) {
        throw new Error(
          'يجب تسجيل الدخول أولاً.'
        );
      }

      const data =
        await getMyProfile();

      setProfile(data);

      setUsername(
        data.username || ''
      );

      setAvatarUri(
        data.avatar_url || null
      );

      setNewAvatarUri(null);
    } catch (error: any) {
      console.error(
        'loadProfile error:',
        error
      );

      /*
       * لا نظهر رسالة خام مثل:
       * Auth session missing!
       */
      const message =
        error?.message ===
          'Auth session missing!'
          ? 'انتهت جلسة تسجيل الدخول. يرجى تسجيل الدخول مرة أخرى.'
          : error?.message ||
            'تعذر تحميل الملف الشخصي.';

      Alert.alert(
        'خطأ',
        message
      );
    } finally {
      setLoading(false);
    }
  }

  /**
   * اختيار صورة الملف الشخصي.
   */
  async function chooseAvatar() {
    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        Alert.alert(
          'صلاحية مطلوبة',
          'اسمح للتطبيق بالوصول إلى الصور لاختيار صورة الملف الشخصي.'
        );

        return;
      }

      const result =
        await ImagePicker.launchImageLibraryAsync(
          {
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
          }
        );

      if (result.canceled) {
        return;
      }

      const selected =
        result.assets?.[0]?.uri;

      if (selected) {
        setNewAvatarUri(selected);
        setAvatarUri(selected);
      }
    } catch (error: any) {
      Alert.alert(
        'خطأ',
        error?.message ||
          'تعذر اختيار الصورة.'
      );
    }
  }

  /**
   * حفظ الملف الشخصي.
   */
  async function saveProfile() {
    const cleanName =
      username.trim();

    if (cleanName.length < 2) {
      Alert.alert(
        'اسم غير صالح',
        'اسم اللاعب يجب أن يحتوي على حرفين على الأقل.'
      );

      return;
    }

    if (cleanName.length > 24) {
      Alert.alert(
        'اسم غير صالح',
        'اسم اللاعب يجب ألا يتجاوز 24 حرفًا.'
      );

      return;
    }

    try {
      setSaving(true);

      /*
       * مهم جدًا:
       * نتأكد من وجود الجلسة قبل محاولة الحفظ.
       */
      const {
        data: sessionData,
        error: sessionError,
      } =
        await supabase.auth.getSession();

      if (sessionError) {
        throw new Error(
          'تعذر التحقق من جلسة تسجيل الدخول.'
        );
      }

      if (!sessionData.session?.user) {
        Alert.alert(
          'تسجيل الدخول مطلوب',
          'انتهت جلسة تسجيل الدخول. يرجى تسجيل الدخول مرة أخرى.',
          [
            {
              text: 'تسجيل الدخول',
              onPress: () => {
                router.replace('/login');
              },
            },
          ]
        );

        return;
      }

      /*
       * نرفع الصورة فقط إذا اختار المستخدم
       * صورة جديدة.
       *
       * إذا لم يختر صورة جديدة، تبقى
       * الصورة الحالية كما هي.
       */
      const updated =
        await saveMyProfileWithAvatar(
          cleanName,
          newAvatarUri
        );

      setProfile(updated);

      setUsername(
        updated.username || ''
      );

      setAvatarUri(
        updated.avatar_url || null
      );

      setNewAvatarUri(null);

      Alert.alert(
        'تم الحفظ',
        'تم تحديث ملفك الشخصي بنجاح.'
      );
    } catch (error: any) {
      console.error(
        'saveProfile error:',
        error
      );

      const message =
        error?.message ===
          'Auth session missing!'
          ? 'انتهت جلسة تسجيل الدخول. يرجى تسجيل الدخول مرة أخرى.'
          : error?.message ||
            'حدث خطأ أثناء حفظ الملف الشخصي.';

      Alert.alert(
        'تعذر الحفظ',
        message
      );
    } finally {
      setSaving(false);
    }
  }

  if (
    loading ||
    checkingAuth
  ) {
    return (
      <View
        style={
          styles.loadingContainer
        }
      >
        <ActivityIndicator
          size="large"
          color="#D7A94B"
        />

        <Text
          style={
            styles.loadingText
          }
        >
          جاري تحميل الملف الشخصي...
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}

      <View
        style={[
          styles.header,
          {
            paddingTop:
              Math.max(
                insets.top,
                12
              ),
          },
        ]}
      >
        <Pressable
          style={
            styles.backButton
          }
          onPress={() =>
            router.back()
          }
        >
          <Ionicons
            name="arrow-forward"
            size={23}
            color="#FFFFFF"
          />
        </Pressable>

        <View
          style={
            styles.headerText
          }
        >
          <Text
            style={
              styles.title
            }
          >
            الملف الشخصي
          </Text>

          <Text
            style={
              styles.subtitle
            }
          >
            هويتك داخل Mafia Night
          </Text>
        </View>

        <View
          style={
            styles.headerSpacer
          }
        />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          {
            paddingBottom:
              100 +
              insets.bottom,
          },
        ]}
        showsVerticalScrollIndicator={
          false
        }
      >
        {/* Avatar */}

        <View
          style={
            styles.avatarSection
          }
        >
          <Pressable
            style={
              styles.avatarButton
            }
            onPress={
              chooseAvatar
            }
            disabled={saving}
          >
            {avatarUri ? (
              <Image
                source={{
                  uri: avatarUri,
                }}
                style={
                  styles.avatar
                }
              />
            ) : (
              <View
                style={
                  styles.avatarPlaceholder
                }
              >
                <Ionicons
                  name="person"
                  size={54}
                  color="#777"
                />
              </View>
            )}

            <View
              style={
                styles.cameraButton
              }
            >
              <Ionicons
                name="camera"
                size={20}
                color="#fff"
              />
            </View>
          </Pressable>

          <Text
            style={
              styles.changePhoto
            }
          >
            اضغط لتغيير الصورة
          </Text>
        </View>

        {/* Username */}

        <View
          style={styles.card}
        >
          <Text
            style={
              styles.label
            }
          >
            اسم اللاعب
          </Text>

          <TextInput
            value={username}
            onChangeText={
              setUsername
            }
            placeholder="اكتب اسمك"
            placeholderTextColor="#666"
            maxLength={24}
            editable={!saving}
            autoCapitalize="none"
            style={
              styles.input
            }
          />

          <Text
            style={
              styles.counter
            }
          >
            {username.length}/24
          </Text>
        </View>

        {/* Stats */}

        {profile && (
          <View
            style={
              styles.statsCard
            }
          >
            <View
              style={styles.stat}
            >
              <Text
                style={
                  styles.statValue
                }
              >
                {profile.games ??
                  0}
              </Text>

              <Text
                style={
                  styles.statLabel
                }
              >
                المباريات
              </Text>
            </View>

            <View
              style={
                styles.divider
              }
            />

            <View
              style={styles.stat}
            >
              <Text
                style={
                  styles.statValue
                }
              >
                {profile.wins ??
                  0}
              </Text>

              <Text
                style={
                  styles.statLabel
                }
              >
                الانتصارات
              </Text>
            </View>

            <View
              style={
                styles.divider
              }
            />

            <View
              style={styles.stat}
            >
              <Text
                style={
                  styles.statValue
                }
              >
                {profile.rating ??
                  0}
              </Text>

              <Text
                style={
                  styles.statLabel
                }
              >
                التقييم
              </Text>
            </View>
          </View>
        )}

        {/* Save */}

        <Pressable
          style={[
            styles.saveButton,
            saving &&
              styles.disabledButton,
          ]}
          onPress={
            saveProfile
          }
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator
              color="#fff"
            />
          ) : (
            <>
              <Ionicons
                name="save-outline"
                size={21}
                color="#fff"
              />

              <Text
                style={
                  styles.saveText
                }
              >
                حفظ الملف الشخصي
              </Text>
            </>
          )}
        </Pressable>

        <Text
          style={
            styles.infoText
          }
        >
          اسمك وصورتك سيظهران للاعبين داخل
          الغرف وأثناء المباراة.
        </Text>

        <View
          style={
            styles.bottomSpace
          }
        />
      </ScrollView>

      {/* Bottom Navigation */}

      <View
        style={[
          styles.bottomNav,
          {
            height:
              75 +
              insets.bottom,

            paddingBottom:
              Math.max(
                insets.bottom,
                8
              ),
          },
        ]}
      >
        {/* Home */}

        <Pressable
          style={
            styles.navItem
          }
          onPress={() =>
            router.replace(
              '/home'
            )
          }
        >
          <Ionicons
            name="home-outline"
            size={23}
            color="#777782"
          />

          <Text
            style={
              styles.navText
            }
          >
            الرئيسية
          </Text>
        </Pressable>

        {/* Rooms */}

        <Pressable
          style={
            styles.navItem
          }
          onPress={() =>
            router.replace(
              '/rooms'
            )
          }
        >
          <Ionicons
            name="game-controller-outline"
            size={23}
            color="#777782"
          />

          <Text
            style={
              styles.navText
            }
          >
            اللعب
          </Text>
        </Pressable>

        {/* Inventory */}

        <Pressable
          style={
            styles.navItem
          }
          onPress={() =>
            router.replace(
              '/inventory'
            )
          }
        >
          <Ionicons
            name="albums-outline"
            size={23}
            color="#777782"
          />

          <Text
            style={
              styles.navText
            }
          >
            المخزون
          </Text>
        </Pressable>

        {/* Friends */}

        <Pressable
          style={
            styles.navItem
          }
          onPress={() =>
            router.replace(
              '/friends'
            )
          }
        >
          <Ionicons
            name="people-outline"
            size={23}
            color="#777782"
          />

          <Text
            style={
              styles.navText
            }
          >
            الأصدقاء
          </Text>
        </Pressable>

        {/* Profile */}

        <Pressable
          style={
            styles.navItem
          }
          onPress={() =>
            router.replace(
              '/profile'
            )
          }
        >
          <View
            style={
              styles.activeNavIcon
            }
          >
            <Ionicons
              name="person"
              size={22}
              color="#17171D"
            />
          </View>

          <Text
            style={
              styles.navTextActive
            }
          >
            حسابي
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles =
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor:
        '#101014',
    },

    scroll: {
      flex: 1,
    },

    content: {
      paddingHorizontal: 20,
      paddingTop: 24,
    },

    loadingContainer: {
      flex: 1,
      backgroundColor:
        '#101014',
      justifyContent:
        'center',
      alignItems: 'center',
    },

    loadingText: {
      marginTop: 12,
      color: '#aaa',
      fontSize: 15,
    },

    header: {
      minHeight: 82,
      paddingHorizontal: 18,
      paddingBottom: 12,
      flexDirection:
        'row',
      alignItems:
        'center',
      borderBottomWidth: 1,
      borderBottomColor:
        '#24242B',
      backgroundColor:
        '#111116',
    },

    backButton: {
      width: 42,
      height: 42,
      borderRadius: 13,
      backgroundColor:
        '#1B1B21',
      alignItems:
        'center',
      justifyContent:
        'center',
    },

    headerText: {
      flex: 1,
      alignItems:
        'center',
    },

    headerSpacer: {
      width: 42,
    },

    title: {
      color: '#FFFFFF',
      fontSize: 22,
      fontWeight:
        '800',
    },

    subtitle: {
      color: '#777782',
      marginTop: 3,
      fontSize: 11,
    },

    avatarSection: {
      alignItems:
        'center',
      marginBottom: 28,
    },

    avatarButton: {
      width: 120,
      height: 120,
      borderRadius: 60,
      position:
        'relative',
    },

    avatar: {
      width: 120,
      height: 120,
      borderRadius: 60,
      backgroundColor:
        '#202020',
    },

    avatarPlaceholder: {
      width: 120,
      height: 120,
      borderRadius: 60,
      backgroundColor:
        '#202020',
      justifyContent:
        'center',
      alignItems:
        'center',
      borderWidth: 2,
      borderColor:
        '#2E2E35',
    },

    cameraButton: {
      position:
        'absolute',
      right: 0,
      bottom: 2,
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor:
        '#D7A94B',
      justifyContent:
        'center',
      alignItems:
        'center',
      borderWidth: 3,
      borderColor:
        '#101014',
    },

    changePhoto: {
      color: '#888',
      fontSize: 13,
      marginTop: 10,
    },

    card: {
      backgroundColor:
        '#19191F',
      borderRadius: 18,
      borderWidth: 1,
      borderColor:
        '#292930',
      padding: 16,
      marginBottom: 16,
    },

    label: {
      color: '#999',
      fontSize: 13,
      marginBottom: 8,
    },

    input: {
      height: 50,
      borderRadius: 12,
      backgroundColor:
        '#222',
      color: '#fff',
      paddingHorizontal: 15,
      fontSize: 16,
      textAlign:
        'right',
    },

    counter: {
      color: '#666',
      fontSize: 11,
      textAlign:
        'right',
      marginTop: 6,
    },

    statsCard: {
      backgroundColor:
        '#19191F',
      borderRadius: 18,
      borderWidth: 1,
      borderColor:
        '#292930',
      minHeight: 90,
      flexDirection:
        'row',
      alignItems:
        'center',
      justifyContent:
        'space-around',
      marginBottom: 20,
    },

    stat: {
      flex: 1,
      alignItems:
        'center',
    },

    statValue: {
      color: '#FFFFFF',
      fontSize: 22,
      fontWeight:
        '800',
    },

    statLabel: {
      color: '#777',
      fontSize: 12,
      marginTop: 4,
    },

    divider: {
      width: 1,
      height: 42,
      backgroundColor:
        '#333',
    },

    saveButton: {
      height: 54,
      borderRadius: 15,
      backgroundColor:
        '#B00020',
      flexDirection:
        'row',
      justifyContent:
        'center',
      alignItems:
        'center',
      gap: 9,
    },

    disabledButton: {
      opacity: 0.6,
    },

    saveText: {
      color: '#fff',
      fontSize: 16,
      fontWeight:
        '800',
    },

    infoText: {
      color: '#666',
      fontSize: 12,
      textAlign:
        'center',
      marginTop: 16,
      lineHeight: 19,
    },

    bottomSpace: {
      height: 20,
    },

    bottomNav: {
      backgroundColor:
        '#15151A',
      borderTopWidth: 1,
      borderTopColor:
        '#292930',
      flexDirection:
        'row',
      alignItems:
        'center',
      justifyContent:
        'space-around',
    },

    navItem: {
      minWidth: 58,
      alignItems:
        'center',
      justifyContent:
        'center',
    },

    activeNavIcon: {
      width: 36,
      height: 36,
      borderRadius: 12,
      backgroundColor:
        '#D7A94B',
      alignItems:
        'center',
      justifyContent:
        'center',
      marginBottom: 3,
    },

    navText: {
      color: '#777782',
      fontSize: 9,
      marginTop: 3,
    },

    navTextActive: {
      color: '#D7A94B',
      fontSize: 9,
      fontWeight:
        '800',
      marginTop: 1,
    },
  });
