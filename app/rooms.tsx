import React, {
  useCallback,
  useEffect,
  useState,
} from 'react';

import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  router,
  useFocusEffect,
} from 'expo-router';

import {
  Ionicons,
} from '@expo/vector-icons';

import {
  SafeAreaView,
} from 'react-native-safe-area-context';

import {
  getPublicRooms,
  joinPublicRoom,
  PublicRoom,
} from '../lib/rooms';

import {
  getMyProfile,
} from '../lib/profile';

export default function Rooms() {
  const [rooms, setRooms] =
    useState<PublicRoom[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [joining, setJoining] =
    useState<string | null>(null);

  const loadRooms = useCallback(
    async () => {
      try {
        const data =
          await getPublicRooms();

        setRooms(data);
      } catch (error: any) {
        Alert.alert(
          'Rooms',
          error?.message ||
            'تعذر تحميل الغرف'
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    []
  );

  useFocusEffect(
    useCallback(() => {
      loadRooms();

      const timer =
        setInterval(
          loadRooms,
          5000
        );

      return () =>
        clearInterval(timer);
    }, [loadRooms])
  );

  async function handleJoin(
    room: PublicRoom
  ) {
    if (joining) return;

    try {
      setJoining(room.id);

      const profile =
        await getMyProfile();

      await joinPublicRoom(
        room.id,
        profile.username
      );

      router.push(
        `/room/${room.id}`
      );
    } catch (error: any) {
      Alert.alert(
        'تعذر الانضمام',
        error?.message ||
          'تعذر الانضمام إلى الغرفة'
      );
    } finally {
      setJoining(null);
    }
  }

  function renderRoom({
    item,
  }: {
    item: PublicRoom;
  }) {
    const full =
      item.player_count >=
      item.max_players;

    return (
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <View
            style={styles.roomIcon}
          >
            <Ionicons
              name="moon"
              size={22}
              color="#D7A94B"
            />
          </View>

          <View style={styles.info}>
            <Text
              style={styles.roomName}
              numberOfLines={1}
            >
              {item.name}
            </Text>

            <Text
              style={styles.host}
            >
              HOST · {item.host_name}
            </Text>
          </View>

          <View
            style={styles.players}
          >
            <Ionicons
              name="people"
              size={15}
              color="#999"
            />

            <Text
              style={styles.count}
            >
              {item.player_count}/
              {item.max_players}
            </Text>
          </View>
        </View>

        <Pressable
          style={[
            styles.join,
            full &&
              styles.joinDisabled,
          ]}
          disabled={
            full ||
            joining === item.id
          }
          onPress={() =>
            handleJoin(item)
          }
        >
          {joining === item.id ? (
            <ActivityIndicator
              color="#090A0D"
            />
          ) : (
            <Text
              style={styles.joinText}
            >
              {full
                ? 'FULL'
                : 'JOIN GAME'}
            </Text>
          )}
        </Pressable>
      </View>
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
          onPress={() => router.back()}
          style={styles.back}
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

        <View
          style={styles.header}
        >
          <View>
            <Text
              style={styles.kicker}
            >
              MULTIPLAYER
            </Text>

            <Text
              style={styles.title}
            >
              Public Rooms
            </Text>
          </View>

          <Pressable
            style={styles.create}
            onPress={() =>
              router.push(
                '/create-room'
              )
            }
          >
            <Ionicons
              name="add"
              size={20}
              color="#090A0D"
            />

            <Text
              style={styles.createText}
            >
              CREATE
            </Text>
          </Pressable>
        </View>

        {loading ? (
          <View
            style={styles.center}
          >
            <ActivityIndicator
              size="large"
              color="#D7A94B"
            />

            <Text
              style={styles.loadingText}
            >
              Searching for games...
            </Text>
          </View>
        ) : (
          <FlatList
            data={rooms}
            keyExtractor={(item) =>
              item.id
            }
            renderItem={
              renderRoom
            }
            contentContainerStyle={
              rooms.length === 0
                ? styles.emptyList
                : styles.list
            }
            refreshControl={
              <RefreshControl
                refreshing={
                  refreshing
                }
                onRefresh={() => {
                  setRefreshing(
                    true
                  );
                  loadRooms();
                }}
                tintColor="#D7A94B"
              />
            }
            ListEmptyComponent={
              <View
                style={styles.empty}
              >
                <Ionicons
                  name="moon-outline"
                  size={52}
                  color="#D7A94B"
                />

                <Text
                  style={styles.emptyTitle}
                >
                  No public rooms
                </Text>

                <Text
                  style={styles.emptyText}
                >
                  Create the first room
                  and let other players
                  join.
                </Text>

                <Pressable
                  style={styles.emptyButton}
                  onPress={() =>
                    router.push(
                      '/create-room'
                    )
                  }
                >
                  <Text
                    style={
                      styles.emptyButtonText
                    }
                  >
                    CREATE ROOM
                  </Text>
                </Pressable>
              </View>
            }
          />
        )}
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
      flex: 1,
      padding: 20,
    },

    back: {
      flexDirection:
        'row',
      alignItems:
        'center',
      gap: 8,
      marginBottom: 24,
    },

    backText: {
      color: '#AAA',
    },

    header: {
      flexDirection:
        'row',
      alignItems:
        'center',
      justifyContent:
        'space-between',
      marginBottom: 22,
    },

    kicker: {
      color: '#B5222E',
      fontSize: 10,
      letterSpacing: 2,
      fontWeight: '900',
    },

    title: {
      color: '#F4F1EF',
      fontSize: 30,
      fontWeight: '900',
      marginTop: 3,
    },

    create: {
      backgroundColor:
        '#D7A94B',
      borderRadius: 12,
      paddingHorizontal: 13,
      height: 42,
      flexDirection:
        'row',
      alignItems:
        'center',
      gap: 4,
    },

    createText: {
      color: '#090A0D',
      fontSize: 11,
      fontWeight: '900',
    },

    list: {
      paddingBottom: 30,
      gap: 12,
    },

    emptyList: {
      flexGrow: 1,
    },

    card: {
      backgroundColor:
        '#14151A',
      borderWidth: 1,
      borderColor:
        '#292B32',
      borderRadius: 17,
      padding: 14,
    },

    cardTop: {
      flexDirection:
        'row',
      alignItems:
        'center',
    },

    roomIcon: {
      width: 45,
      height: 45,
      borderRadius: 13,
      backgroundColor:
        '#211A0D',
      alignItems:
        'center',
      justifyContent:
        'center',
    },

    info: {
      flex: 1,
      marginLeft: 12,
    },

    roomName: {
      color: '#EEE',
      fontSize: 16,
      fontWeight: '900',
    },

    host: {
      color: '#777983',
      fontSize: 9,
      marginTop: 4,
      letterSpacing: 1,
    },

    players: {
      flexDirection:
        'row',
      alignItems:
        'center',
      gap: 5,
    },

    count: {
      color: '#AAA',
      fontWeight: '800',
      fontSize: 12,
    },

    join: {
      marginTop: 13,
      height: 43,
      borderRadius: 11,
      backgroundColor:
        '#D7A94B',
      alignItems:
        'center',
      justifyContent:
        'center',
    },

    joinDisabled: {
      opacity: 0.35,
    },

    joinText: {
      color: '#090A0D',
      fontWeight: '900',
      fontSize: 11,
      letterSpacing: 1,
    },

    center: {
      flex: 1,
      alignItems:
        'center',
      justifyContent:
        'center',
    },

    loadingText: {
      color: '#777983',
      marginTop: 14,
    },

    empty: {
      flex: 1,
      alignItems:
        'center',
      justifyContent:
        'center',
      paddingHorizontal: 30,
    },

    emptyTitle: {
      color: '#EEE',
      fontSize: 20,
      fontWeight: '900',
      marginTop: 18,
    },

    emptyText: {
      color: '#777983',
      textAlign: 'center',
      lineHeight: 21,
      marginTop: 7,
    },

    emptyButton: {
      marginTop: 22,
      backgroundColor:
        '#D7A94B',
      paddingHorizontal: 22,
      paddingVertical: 13,
      borderRadius: 12,
    },

    emptyButtonText: {
      color: '#090A0D',
      fontWeight: '900',
    },
  });
