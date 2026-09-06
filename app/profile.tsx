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
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  router,
} from 'expo-router';

import {
  Ionicons,
} from '@expo/vector-icons';

import {
  SafeAreaView,
} from 'react-native-safe-area-context';

import {
  getMyProfile,
  saveMyProfile,
  Profile as ProfileType,
} from '../lib/profile';

export default function Profile() {
  const [profile, setProfile] =
    useState<ProfileType | null>(
      null
    );

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
          'Profile',
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

  async function save() {
    try {
      setSaving(true);

      const data =
        await saveMyProfile(
          name,
          avatar.trim() ||
            null
        );

      setProfile(data);
      setName(data.username);
      setAvatar(
        data.avatar_url || ''
      );
      setEditing(false);
    } catch (error: any) {
      Alert.alert(
        'Profile',
        error?.message ||
          'تعذر حفظ التغييرات'
      );
    } finally {
      setSaving(false);
    }
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
            Back
          </Text>
        </Pressable>

        <Text
          style={styles.kicker}
        >
          PLAYER ACCOUNT
        </Text>

        <View
          style={styles.avatar}
        >
          {profile?.avatar_url ? (
            <Image
              source={{
                uri:
                  profile.avatar_url,
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
        </View>

        {editing ? (
          <>
            <Text
              style={styles.label}
            >
              PLAYER NAME
            </Text>

            <TextInput
              value={name}
              onChangeText={
                setName
              }
              style={styles.input}
              placeholder="Your name"
              placeholderTextColor="#666872"
              maxLength={24}
            />

            <Text
              style={styles.label}
            >
              PROFILE PHOTO URL
            </Text>

            <TextInput
              value={avatar}
              onChangeText={
                setAvatar
              }
              style={styles.input}
              placeholder="https://..."
              placeholderTextColor="#666872"
              autoCapitalize="none"
            />

            <View
              style={styles.editRow}
            >
              <Pressable
                style={styles.cancel}
                onPress={() =>
                  setEditing(false)
                }
                disabled={saving}
              >
                <Text
                  style={
                    styles.cancelText
                  }
                >
                  CANCEL
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
                    SAVE
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
                EDIT PROFILE
              </Text>
            </Pressable>
          </>
        )}

        <View
          style={styles.stats}
        >
          <View>
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

          <View>
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

          <View>
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
      </View>
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

    container: {
      padding: 20,
    },

    center: {
      flex: 1,
      alignItems:
        'center',
      justifyContent:
        'center',
      backgroundColor:
        '#090A0D',
    },

    back: {
      flexDirection:
        'row',
      alignItems:
        'center',
      gap: 8,
      marginBottom: 30,
    },

    backText: {
      color: '#AAA',
    },

    kicker: {
      textAlign: 'center',
      color: '#B5222E',
      fontSize: 10,
      letterSpacing: 2,
      fontWeight: '900',
    },

    avatar: {
      width: 100,
      height: 100,
      borderRadius: 50,
      backgroundColor:
        '#19150C',
      borderWidth: 1,
      borderColor:
        '#5A4720',
      alignItems:
        'center',
      justifyContent:
        'center',
      alignSelf: 'center',
      marginTop: 24,
      overflow: 'hidden',
    },

    avatarImage: {
      width: '100%',
      height: '100%',
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
      alignSelf:
        'center',
      marginTop: 14,
      flexDirection:
        'row',
      alignItems:
        'center',
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
      marginTop: 17,
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
    },

    editRow: {
      flexDirection:
        'row',
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
      alignItems:
        'center',
      justifyContent:
        'center',
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
      alignItems:
        'center',
      justifyContent:
        'center',
    },

    saveText: {
      color: '#090A0D',
      fontWeight: '900',
    },

    stats: {
      flexDirection:
        'row',
      justifyContent:
        'space-around',
      marginTop: 38,
      padding: 20,
      borderRadius: 16,
      backgroundColor:
        '#14151A',
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
  });
