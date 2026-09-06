import React, {
  useCallback,
  useEffect,
  useState,
} from 'react';

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

import { router } from 'expo-router';

import { Ionicons } from '@expo/vector-icons';

import { SafeAreaView } from 'react-native-safe-area-context';

import {
  getMyProfile,
  saveMyProfile,
  Profile as ProfileType,
} from '../lib/profile';

export default function Profile() {
  const [profile, setProfile] =
    useState<ProfileType | null>(null);

  const [name, setName] =
    useState('');

  const [avatar, setAvatar] =
    useState('');

  const [editing, setEditing] =
    useState(false);

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [pickingImage, setPickingImage] =
    useState(false);

  const load = useCallback(
    async () => {
      try {
        const data =
          await getMyProfile();

        setProfile(data);
        setName(data.username);
        setAvatar(
          data.avatar_url || ''
        );
      } catch (error: any) {
        Alert.alert(
          'الحساب',
          error?.message ||
            'تعذر تحميل الحساب'
        );
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    load();
  }, [load]);

  async function choosePhoto() {
    try {
      setPickingImage(true);

      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        Alert.alert(
          'الصورة الشخصية',
          'يجب السماح للتطبيق بالوصول إلى الصور لاختيار صورة شخصية.'
        );
        return;
      }

      const result =
        await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.8,
        });

      if (
        result.canceled ||
        !result.assets?.length
      ) {
        return;
      }

      const selected =
        result.assets[0];

      if (selected.uri) {
        setAvatar(selected.uri);
        setEditing(true);
      }
    } catch (error: any) {
      Alert.alert(
        'الصورة الشخصية',
        error?.message ||
          'تعذر اختيار الصورة'
      );
    } finally {
      setPickingImage(false);
    }
  }

  async function save() {
    try {
      setSaving(true);

      const cleanName =
        name.trim();

      if (cleanName.length < 2) {
        Alert.alert(
          'اسم اللاعب',
          'اسم اللاعب يجب أن يحتوي على حرفين على الأقل.'
        );
        return;
      }

      /*
       * ملاحظة:
       * إذا كانت الصورة من معرض الهاتف فهي URI محلية.
       * سيتم التعامل مع رفع الصورة إلى Storage
       * في طبقة التخزين التالية قبل اعتمادها كصورة
       * دائمة على جميع الأجهزة.
       *
       * في الوقت الحالي نحفظ الرابط إذا كان رابطًا
       * صالحًا أو URI متاحًا.
       */
      const data =
        await saveMyProfile(
          cleanName,
          avatar.trim() || null
        );

      setProfile(data);
      setName(data.username);
      setAvatar(
        data.avatar_url || ''
      );
      setEditing(false);

      Alert.alert(
        'تم',
        'تم حفظ الملف الشخصي.'
      );
    } catch (error: any) {
      Alert.alert(
        'الحساب',
        error?.message ||
          'تعذر حفظ التغييرات'
      );
    } finally {
      setSaving(false);
    }
  }

  function cancelEditing() {
    setName(
      profile?.username || ''
    );

    setAvatar(
      profile?.avatar_url || ''
    );

    setEditing(false);
  }

  if (loading) {
    return (
      <SafeAreaView
        style={styles.safe}
      >
        <View
          style={styles.center}
        >
          <ActivityIndicator
            size="large"
            color="#D7A94B"
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={styles.safe}
    >
      <ScrollView
        contentContainerStyle={
          styles.scroll
        }
        keyboardShouldPersistTaps="handled"
      >
        <View
          style={styles.container}
        >
          <Pressable
            style={styles.back}
            onPress={() =>
              router.back()
            }
          >
            <Ionicons
              name="arrow-back"
              size={23}
              color="#EEE"
            />

            <Text
              style={styles.backText}
            >
              رجوع
            </Text>
          </Pressable>

          <Text
            style={styles.kicker}
          >
            PLAYER ACCOUNT
          </Text>

          <Pressable
            style={styles.avatar}
            onPress={choosePhoto}
            disabled={pickingImage}
          >
            {avatar ? (
              <Image
                source={{
                  uri: avatar,
                }}
                style={
                  styles.avatarImage
                }
              />
            ) : (
              <Ionicons
                name="person"
                size={45}
                color="#D7A94B"
              />
            )}

            <View
              style={styles.camera}
            >
              {pickingImage ? (
                <ActivityIndicator
                  size="small"
                  color="#090A0D"
                />
              ) : (
                <Ionicons
                  name="camera"
                  size={17}
                  color="#090A0D"
                />
              )}
            </View>
          </Pressable>

          <Text
            style={styles.photoHint}
          >
            اضغط على الصورة لتغييرها
          </Text>

          {editing ? (
            <>
              <Text
                style={styles.label}
              >
                PLAYER NAME
              </Text>

              <TextInput
                value={name}
                onChangeText={setName}
                style={styles.input}
                placeholder="اسم اللاعب"
                placeholderTextColor="#666872"
                maxLength={24}
                autoCorrect={false}
              />

              <View
                style={styles.editRow}
              >
                <Pressable
                  style={styles.cancel}
                  onPress={
                    cancelEditing
                  }
                  disabled={saving}
                >
                  <Text
                    style={
                      styles.cancelText
                    }
                  >
                    إلغاء
                  </Text>
                </Pressable>

                <Pressable
                  style={styles.save}
                  onPress={save}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator
                      color="#090A0D"
                    />
                  ) : (
                    <Text
                      style={
                        styles.saveText
                      }
                    >
                      حفظ
                    </Text>
                  )}
                </Pressable>
              </View>
            </>
          ) : (
            <>
              <Text
                style={styles.name}
              >
                {profile?.username ||
                  'Player'}
              </Text>

              <Text
                style={styles.handle}
              >
                @mafia_player
              </Text>

              <Pressable
                style={styles.editButton}
                onPress={() =>
                  setEditing(true)
                }
              >
                <Ionicons
                  name="create-outline"
                  size={17}
                  color="#D7A94B"
                />

                <Text
                  style={
                    styles.editText
                  }
                >
                  تعديل الحساب
                </Text>
              </Pressable>
            </>
          )}

          <View
            style={styles.stats}
          >
            <View
              style={styles.stat}
            >
              <Text
                style={styles.num}
              >
                {profile?.wins ?? 0}
              </Text>

              <Text
                style={styles.lab}
              >
                WINS
              </Text>
            </View>

            <View
              style={styles.stat}
            >
              <Text
                style={styles.num}
              >
                {profile?.games ?? 0}
              </Text>

              <Text
                style={styles.lab}
              >
                GAMES
              </Text>
            </View>

            <View
              style={styles.stat}
            >
              <Text
                style={styles.num}
              >
                {profile?.rating ?? 0}
              </Text>

              <Text
                style={styles.lab}
              >
                RATING
              </Text>
            </View>
          </View>

          <View
            style={styles.infoCard}
          >
            <View
              style={styles.infoIcon}
            >
              <Ionicons
                name="shield-checkmark"
                size={20}
                color="#D7A94B"
              />
            </View>

            <View
              style={styles.infoBody}
            >
              <Text
                style={styles.infoTitle}
              >
                حسابك محفوظ
              </Text>

              <Text
                style={styles.infoText}
              >
                اسمك وإحصائياتك مرتبطة بحساب
                اللاعب وتظهر داخل غرف Mafia Night.
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles =
  StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor:
        '#090A0D',
    },

    scroll: {
      flexGrow: 1,
    },

    container: {
      padding: 20,
      paddingBottom: 40,
    },

    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor:
        '#090A0D',
    },

    back: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 30,
    },

    backText: {
      color: '#AAA',
      fontSize: 14,
    },

    kicker: {
      textAlign: 'center',
      color: '#B5222E',
      fontSize: 10,
      letterSpacing: 2,
      fontWeight: '900',
    },

    avatar: {
      width: 112,
      height: 112,
      borderRadius: 56,
      backgroundColor:
        '#19150C',
      borderWidth: 1,
      borderColor:
        '#5A4720',
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'center',
      marginTop: 24,
      overflow: 'hidden',
      position: 'relative',
    },

    avatarImage: {
      width: '100%',
      height: '100%',
    },

    camera: {
      position: 'absolute',
      right: 4,
      bottom: 4,
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor:
        '#D7A94B',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor:
        '#090A0D',
    },

    photoHint: {
      textAlign: 'center',
      color: '#666872',
      fontSize: 11,
      marginTop: 8,
    },

    name: {
      textAlign: 'center',
      color: '#EEE',
      fontSize: 22,
      fontWeight: '900',
      marginTop: 14,
    },

    handle: {
      textAlign: 'center',
      color: '#777983',
      marginTop: 4,
    },

    editButton: {
      alignSelf: 'center',
      marginTop: 14,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 10,
      backgroundColor:
        '#19150C',
    },

    editText: {
      color: '#D7A94B',
      fontSize: 10,
      fontWeight: '900',
      letterSpacing: 1,
    },

    label: {
      color: '#777983',
      fontSize: 10,
      letterSpacing: 1.5,
      fontWeight: '900',
      marginTop: 22,
      marginBottom: 8,
    },

    input: {
      height: 50,
      borderRadius: 12,
      borderWidth: 1,
      borderColor:
        '#292B32',
      backgroundColor:
        '#14151A',
      color: '#EEE',
      paddingHorizontal: 14,
      fontSize: 15,
    },

    editRow: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 18,
    },

    cancel: {
      flex: 1,
      height: 48,
      borderRadius: 12,
      borderWidth: 1,
      borderColor:
        '#292B32',
      alignItems: 'center',
      justifyContent: 'center',
    },

    cancelText: {
      color: '#AAA',
      fontWeight: '900',
    },

    save: {
      flex: 1,
      height: 48,
      borderRadius: 12,
      backgroundColor:
        '#D7A94B',
      alignItems: 'center',
      justifyContent: 'center',
    },

    saveText: {
      color: '#090A0D',
      fontWeight: '900',
    },

    stats: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      marginTop: 38,
      padding: 20,
      borderRadius: 16,
      backgroundColor:
        '#14151A',
      borderWidth: 1,
      borderColor:
        '#202229',
    },

    stat: {
      minWidth: 70,
      alignItems: 'center',
    },

    num: {
      textAlign: 'center',
      color: '#D7A94B',
      fontSize: 22,
      fontWeight: '900',
    },

    lab: {
      textAlign: 'center',
      color: '#777983',
      fontSize: 9,
      letterSpacing: 1,
      marginTop: 4,
    },

    infoCard: {
      flexDirection: 'row',
      marginTop: 18,
      padding: 15,
      borderRadius: 15,
      backgroundColor:
        '#111217',
      borderWidth: 1,
      borderColor:
        '#202229',
    },

    infoIcon: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor:
        '#19150C',
      alignItems: 'center',
      justifyContent: 'center',
    },

    infoBody: {
      flex: 1,
      marginLeft: 12,
    },

    infoTitle: {
      color: '#EEE',
      fontSize: 13,
      fontWeight: '800',
    },

    infoText: {
      color: '#777983',
      fontSize: 11,
      lineHeight: 17,
      marginTop: 4,
    },
  });
