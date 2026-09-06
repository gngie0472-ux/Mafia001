import React, {
  useState,
} from 'react';

import {
  ActivityIndicator,
  Alert,
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
  createRoom,
} from '../lib/rooms';

import {
  getMyProfile,
} from '../lib/profile';

export default function CreateRoom() {
  const [roomName, setRoomName] =
    useState('');

  const [players, setPlayers] =
    useState('8');

  const [loading, setLoading] =
    useState(false);

  async function handleCreate() {
    const name =
      roomName.trim();

    if (!name) {
      Alert.alert(
        'Room name',
        'Enter a name for the room.'
      );
      return;
    }

    try {
      setLoading(true);

      const profile =
        await getMyProfile();

      const room =
        await createRoom(
          name,
          profile.username,
          Number(players)
        );

      router.replace(
        `/room/${room.id}`
      );
    } catch (error: any) {
      Alert.alert(
        'Could not create room',
        error?.message ||
          'Something went wrong.'
      );
    } finally {
      setLoading(false);
    }
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
          disabled={loading}
        >
          <Ionicons
            name="arrow-back"
            size={22}
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
          HOST A GAME
        </Text>

        <Text
          style={styles.title}
        >
          Create Room
        </Text>

        <Text
          style={styles.sub}
        >
          Create a public Mafia game.
          Other players will see it
          immediately.
        </Text>

        <Text
          style={styles.label}
        >
          ROOM NAME
        </Text>

        <TextInput
          value={roomName}
          onChangeText={
            setRoomName
          }
          placeholder="Friday Night"
          placeholderTextColor="#666872"
          style={styles.input}
          maxLength={40}
          editable={!loading}
        />

        <Text
          style={styles.label}
        >
          PLAYERS
        </Text>

        <View
          style={styles.row}
        >
          {[
            '6',
            '8',
            '10',
            '12',
            '16',
          ].map((n) => (
            <Pressable
              key={n}
              onPress={() =>
                setPlayers(n)
              }
              style={[
                styles.choice,
                players === n &&
                  styles.choiceOn,
              ]}
            >
              <Text
                style={[
                  styles.choiceText,
                  players === n &&
                    styles.choiceTextOn,
                ]}
              >
                {n}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text
          style={styles.label}
        >
          MODE
        </Text>

        <View
          style={styles.mode}
        >
          <Ionicons
            name="moon"
            size={24}
            color="#D7A94B"
          />

          <View
            style={styles.modeInfo}
          >
            <Text
              style={styles.modeTitle}
            >
              Classic Mafia
            </Text>

            <Text
              style={styles.modeSub}
            >
              Night • Day • Roles •
              Investigation • Voting
            </Text>
          </View>

          <Ionicons
            name="checkmark-circle"
            size={22}
            color="#D7A94B"
          />
        </View>

        <View
          style={styles.publicBox}
        >
          <Ionicons
            name="globe-outline"
            size={20}
            color="#D7A94B"
          />

          <Text
            style={styles.publicText}
          >
            Public room — anyone can
            join while the lobby is open.
          </Text>
        </View>

        <Pressable
          style={[
            styles.button,
            loading &&
              styles.disabled,
          ]}
          onPress={handleCreate}
          disabled={loading}
        >
          {loading ? (
            <>
              <ActivityIndicator
                color="#090A0D"
              />

              <Text
                style={styles.buttonText}
              >
                CREATING...
              </Text>
            </>
          ) : (
            <>
              <Text
                style={styles.buttonText}
              >
                CREATE ROOM
              </Text>

              <Ionicons
                name="arrow-forward"
                size={19}
                color="#090A0D"
              />
            </>
          )}
        </Pressable>
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

    back: {
      flexDirection:
        'row',
      alignItems:
        'center',
      gap: 8,
      marginBottom: 32,
    },

    backText: {
      color: '#AAA',
    },

    kicker: {
      color: '#B5222E',
      fontSize: 10,
      letterSpacing: 2,
      fontWeight: '900',
    },

    title: {
      color: '#F4F1EF',
      fontSize: 34,
      fontWeight: '900',
      marginTop: 4,
    },

    sub: {
      color: '#898A92',
      lineHeight: 20,
      marginTop: 7,
      marginBottom: 22,
    },

    label: {
      color: '#777983',
      fontSize: 10,
      letterSpacing: 1.5,
      fontWeight: '900',
      marginTop: 13,
      marginBottom: 9,
    },

    input: {
      height: 52,
      borderRadius: 13,
      borderWidth: 1,
      borderColor:
        '#292B32',
      backgroundColor:
        '#14151A',
      paddingHorizontal: 15,
      color: '#EEE',
    },

    row: {
      flexDirection:
        'row',
      gap: 7,
    },

    choice: {
      flex: 1,
      height: 47,
      borderRadius: 11,
      borderWidth: 1,
      borderColor:
        '#292B32',
      backgroundColor:
        '#14151A',
      alignItems:
        'center',
      justifyContent:
        'center',
    },

    choiceOn: {
      borderColor:
        '#D7A94B',
      backgroundColor:
        '#2A2110',
    },

    choiceText: {
      color: '#888993',
      fontWeight: '800',
    },

    choiceTextOn: {
      color: '#D7A94B',
    },

    mode: {
      flexDirection:
        'row',
      alignItems:
        'center',
      gap: 12,
      padding: 15,
      borderRadius: 14,
      borderWidth: 1,
      borderColor:
        '#292B32',
      backgroundColor:
        '#14151A',
    },

    modeInfo: {
      flex: 1,
    },

    modeTitle: {
      color: '#EEE',
      fontWeight: '900',
    },

    modeSub: {
      color: '#777983',
      fontSize: 10,
      marginTop: 4,
    },

    publicBox: {
      marginTop: 13,
      padding: 14,
      borderRadius: 13,
      backgroundColor:
        '#15130E',
      borderWidth: 1,
      borderColor:
        '#4A3B1B',
      flexDirection:
        'row',
      alignItems:
        'center',
      gap: 10,
    },

    publicText: {
      flex: 1,
      color: '#AAA',
      fontSize: 11,
      lineHeight: 17,
    },

    button: {
      marginTop: 27,
      height: 54,
      borderRadius: 14,
      backgroundColor:
        '#D7A94B',
      flexDirection:
        'row',
      alignItems:
        'center',
      justifyContent:
        'center',
      gap: 10,
    },

    disabled: {
      opacity: 0.55,
    },

    buttonText: {
      color: '#090A0D',
      fontWeight: '900',
      letterSpacing: 1,
    },
  });
