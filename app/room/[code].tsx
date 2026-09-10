import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  useLocalSearchParams,
  useRouter,
} from 'expo-router';

import { Room, RoomEvent } from 'livekit-client';

import {
  prepareMicrophone,
  stopMicrophoneSession,
} from '../../lib/voice';

import { getLiveKitToken } from '../../lib/livekit';

import { supabase } from '../../lib/supabase';
import { getMyProfile } from '../../lib/profile';
import { getGameState } from '../../lib/game';

import type {
  GamePlayer,
  GameState,
} from '../../lib/game';

type RoomData = GameState['room'] & {
  id?: string;
  code?: string | null;
  name?: string | null;
  max_players?: number | null;
  status?: string | null;
  host_id?: string | null;
  game_round?: number | null;
  game_phase?: string | null;
  winner?: string | null;
  phase_ends_at?: string | null;
  last_event?: unknown;
};

type Message = {
  id: string;
  room_id: string;
  user_id: string;
  message: string;
  created_at: string;
  username?: string | null;
};

function getErrorMessage(
  error: unknown,
  fallback: string,
): string {
  if (
    typeof error === 'string' &&
    error.trim()
  ) {
    return error;
  }

  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof (error as any).message === 'string'
  ) {
    return (error as any).message;
  }

  if (
    error &&
    typeof error === 'object' &&
    'details' in error &&
    typeof (error as any).details === 'string'
  ) {
    return (error as any).details;
  }

  if (
    error &&
    typeof error === 'object' &&
    'reason' in error &&
    typeof (error as any).reason === 'string'
  ) {
    return (error as any).reason;
  }

  return fallback;
}

function normalizeCode(
  value: string | string[] | undefined,
): string {
  const raw = Array.isArray(value)
    ? value[0]
    : value;

  return String(raw || '')
    .trim()
    .toUpperCase();
}

function PlayerAvatar({
  player,
  size = 54,
}: {
  player: GamePlayer;
  size?: number;
}) {
  const initial =
    String(player.name || 'P')
      .trim()
      .charAt(0)
      .toUpperCase() || 'P';

  return (
    <View
      style={[
        styles.avatar,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
        },
      ]}
    >
      <Text style={styles.avatarText}>
        {initial}
      </Text>
    </View>
  );
}

export default function RoomLobbyScreen() {
  const router = useRouter();

  const params = useLocalSearchParams<{
    code?: string | string[];
  }>();

  const roomCode = normalizeCode(params.code);

  const mountedRef = useRef(true);

  const liveKitRoomRef = useRef<Room | null>(null);

  const [voiceConnecting, setVoiceConnecting] =
    useState(false);

  const [voiceConnected, setVoiceConnected] =
    useState(false);

  const [microphoneEnabled, setMicrophoneEnabled] =
    useState(false);

  const [voiceError, setVoiceError] =
    useState<string | null>(null);

  /*
   * يمنع الانتقال المكرر إلى شاشة اللعبة.
   */
  const navigatingToGameRef = useRef(false);

  /*
   * نحتفظ بآخر غرفة مؤكدة داخل ref.
   */
  const roomRef = useRef<RoomData | null>(null);

  const [roomId, setRoomId] = useState('');
  const [room, setRoom] =
    useState<RoomData | null>(null);

  const [players, setPlayers] =
    useState<GamePlayer[]>([]);

  const [messages, setMessages] =
    useState<Message[]>([]);

  const [currentUserId, setCurrentUserId] =
    useState('');

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [busy, setBusy] =
    useState(false);

  const [startingGame, setStartingGame] =
    useState(false);

  const [messageText, setMessageText] =
    useState('');

  const isWaiting =
    room?.status === 'waiting';

  const isPlaying =
    room?.status === 'playing';

  const isFinished =
    room?.status === 'finished';

  const isHost = Boolean(
    room?.host_id &&
      currentUserId &&
      room.host_id === currentUserId,
  );

  const maxPlayers = Math.max(
    1,
    Number(room?.max_players || 8),
  );

  const playerCount = players.length;

  const canStart =
    isHost &&
    isWaiting &&
    playerCount >= 4 &&
    playerCount <= maxPlayers &&
    !startingGame;

  const resolveRoom = useCallback(
    async (): Promise<string> => {
      if (!roomCode) {
        throw new Error(
          'كود الغرفة غير موجود.',
        );
      }

      if (roomId) {
        return roomId;
      }

      const isUuid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          roomCode,
        );

      let query = supabase
        .from('rooms')
        .select(
          [
            'id',
            'code',
            'name',
            'max_players',
            'status',
            'host_id',
            'game_round',
            'game_phase',
            'winner',
            'phase_ends_at',
            'last_event',
          ].join(','),
        );

      if (isUuid) {
        query = query.eq(
          'id',
          roomCode,
        );
      } else {
        query = query.ilike(
          'code',
          roomCode,
        );
      }

      const {
        data,
        error,
      } = await query.maybeSingle();

      if (error) {
        throw new Error(
          getErrorMessage(
            error,
            'تعذر العثور على الغرفة.',
          ),
        );
      }

      if (!data?.id) {
        throw new Error(
          'الغرفة غير موجودة أو لم تعد متاحة.',
        );
      }

      const id = String(data.id);

      if (mountedRef.current) {
        setRoomId(id);
      }

      return id;
    },
    [roomCode, roomId],
  );

  const loadMessages = useCallback(
    async (resolvedRoomId?: string) => {
      const id =
        resolvedRoomId || roomId;

      if (!id) {
        return;
      }

      try {
        const {
          data,
          error,
        } = await supabase
          .from('room_messages')
          .select(
            'id,room_id,user_id,message,created_at',
          )
          .eq(
            'room_id',
            id,
          )
          .order(
            'created_at',
            {
              ascending: true,
            },
          )
          .limit(100);

        if (error) {
          throw error;
        }

        const rows =
          (data || []) as Message[];

        if (!rows.length) {
          if (mountedRef.current) {
            setMessages([]);
          }

          return;
        }

        const userIds = [
          ...new Set(
            rows
              .map(
                (item) =>
                  item.user_id,
              )
              .filter(Boolean),
          ),
        ];

        let profileMap =
          new Map<string, string>();

        if (userIds.length) {
          const {
            data: profiles,
          } = await supabase
            .from('profiles')
            .select(
              'user_id,username',
            )
            .in(
              'user_id',
              userIds,
            );

          profileMap =
            new Map<string, string>();

          (profiles || []).forEach(
            (profile: any) => {
              if (
                profile?.user_id
              ) {
                profileMap.set(
                  profile.user_id,
                  profile.username ||
                    'لاعب',
                );
              }
            },
          );
        }

        const normalized =
          rows.map((item) => ({
            ...item,
            username:
              profileMap.get(
                item.user_id,
              ) || 'لاعب',
          }));

        if (mountedRef.current) {
          setMessages(normalized);
        }
      } catch (error) {
        console.error(
          'loadMessages error:',
          error,
        );
      }
    },
    [roomId],
  );

  const loadRoom = useCallback(
    async (
      showLoader = false,
    ) => {
      if (!roomCode) {
        if (mountedRef.current) {
          setLoading(false);
        }

        return;
      }

      try {
        if (
          showLoader &&
          mountedRef.current
        ) {
          setLoading(true);
        }

        const profile =
          await getMyProfile();

        if (!mountedRef.current) {
          return;
        }

        setCurrentUserId(
          profile.user_id,
        );

        const resolvedRoomId =
          await resolveRoom();

        const state =
          await getGameState(
            resolvedRoomId,
          );

        if (!mountedRef.current) {
          return;
        }

        const stateRoom =
          state?.room as
            | RoomData
            | null;

        if (!stateRoom) {
          throw new Error(
            'الغرفة غير موجودة أو لم تعد متاحة.',
          );
        }

        const statePlayers =
          Array.isArray(
            state.players,
          )
            ? state.players
            : [];

        roomRef.current =
          stateRoom;

        setRoom(stateRoom);
        setPlayers(statePlayers);

        await loadMessages(
          resolvedRoomId,
        );
      } catch (error) {
        console.error(
          'loadRoom error:',
          error,
        );

        if (mountedRef.current) {
          Alert.alert(
            'تعذر تحميل الغرفة',
            getErrorMessage(
              error,
              'الغرفة غير موجودة أو لم تعد متاحة.',
            ),
            [
              {
                text: 'العودة',
                onPress: () =>
                  router.replace(
                    '/rooms',
                  ),
              },
            ],
          );
        }
      } finally {
        if (mountedRef.current) {
          setLoading(false);
        }
      }
    },
    [
      roomCode,
      resolveRoom,
      loadMessages,
      router,
    ],
  );

  const toggleMicrophone = useCallback(
    async () => {
      if (!roomCode) {
        setVoiceError('كود الغرفة غير موجود.');
        return;
      }

      try {
        setVoiceError(null);

        if (liveKitRoomRef.current) {
          const nextState = !microphoneEnabled;

          await liveKitRoomRef.current.localParticipant
            .setMicrophoneEnabled(nextState);

          if (mountedRef.current) {
            setMicrophoneEnabled(nextState);
          }

          return;
        }

        setVoiceConnecting(true);

        await prepareMicrophone();

        const connection =
          await getLiveKitToken(roomCode);

        if (
          !connection?.token ||
          !connection?.server_url
        ) {
          throw new Error(
            'تعذر الحصول على بيانات الاتصال الصوتي.',
          );
        }

        const liveKitRoom = new Room();

        liveKitRoomRef.current =
          liveKitRoom;

        liveKitRoom.on(
          RoomEvent.Connected,
          () => {
            if (mountedRef.current) {
              setVoiceConnected(true);
              setVoiceError(null);
            }
          },
        );

        liveKitRoom.on(
          RoomEvent.Disconnected,
          () => {
            if (mountedRef.current) {
              setVoiceConnected(false);
              setMicrophoneEnabled(false);
            }
          },
        );

        liveKitRoom.on(
          RoomEvent.MediaDevicesError,
          (error) => {
            console.error(
              'LiveKit media device error:',
              error,
            );

            if (mountedRef.current) {
              setVoiceError(
                'تعذر الوصول إلى الميكروفون.',
              );
              setMicrophoneEnabled(false);
            }
          },
        );

        await liveKitRoom.connect(
          connection.server_url,
          connection.token,
        );

        if (mountedRef.current) {
          setVoiceConnected(true);
        }

        await liveKitRoom.localParticipant
          .setMicrophoneEnabled(true);

        if (mountedRef.current) {
          setMicrophoneEnabled(true);
        }
      } catch (error) {
        console.error(
          'toggleMicrophone error:',
          error,
        );

        if (liveKitRoomRef.current) {
          try {
            await liveKitRoomRef.current.disconnect();
          } catch {}
        }

        liveKitRoomRef.current = null;

        if (mountedRef.current) {
          setVoiceConnected(false);
          setMicrophoneEnabled(false);
          setVoiceError(
            getErrorMessage(
              error,
              'تعذر تشغيل الميكروفون.',
            ),
          );
        }
      } finally {
        if (mountedRef.current) {
          setVoiceConnecting(false);
        }
      }
    },
    [
      roomCode,
      microphoneEnabled,
    ],
  );

  useEffect(() => {
    mountedRef.current = true;
    navigatingToGameRef.current = false;

    void loadRoom(true);

    return () => {
      mountedRef.current = false;

      const liveKitRoom =
        liveKitRoomRef.current;

      liveKitRoomRef.current = null;

      if (liveKitRoom) {
        void liveKitRoom.disconnect();
      }

      void stopMicrophoneSession();
    };
  }, [loadRoom]);

  useEffect(() => {
    if (!roomId) {
      return;
    }

    const channel =
      supabase
        .channel(
          `room-lobby-${roomId}`,
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'rooms',
            filter: `id=eq.${roomId}`,
          },
          () => {
            void loadRoom(false);
          },
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'room_players',
            filter: `room_id=eq.${roomId}`,
          },
          () => {
            void loadRoom(false);
          },
        )
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'room_messages',
            filter: `room_id=eq.${roomId}`,
          },
          () => {
            void loadMessages();
          },
        )
        .subscribe();

    return () => {
      void supabase.removeChannel(
        channel,
      );
    };
  }, [
    roomId,
    loadRoom,
    loadMessages,
  ]);

  useEffect(() => {
    if (!roomId) {
      return;
    }

    let cancelled = false;

    const heartbeat =
      async () => {
        if (cancelled) {
          return;
        }

        try {
          const {
            error,
          } = await supabase.rpc(
            'heartbeat_room',
            {
              p_room_id: roomId,
            },
          );

          if (error) {
            console.error(
              'heartbeat error:',
              error,
            );
          }
        } catch (error) {
          console.error(
            'heartbeat error:',
            error,
          );
        }
      };

    void heartbeat();

    const interval =
      setInterval(
        heartbeat,
        10000,
      );

    return () => {
      cancelled = true;

      clearInterval(
        interval,
      );
    };
  }, [roomId]);

  const startGame =
    useCallback(async () => {
      if (!roomId) {
        Alert.alert(
          'خطأ',
          'معرف الغرفة غير جاهز.',
        );

        return;
      }

      if (!isHost) {
        Alert.alert(
          'غير مسموح',
          'فقط صاحب الغرفة يستطيع بدء اللعبة.',
        );

        return;
      }

      if (!isWaiting) {
        Alert.alert(
          'اللعبة غير جاهزة',
          'لا يمكن بدء اللعبة لأن الغرفة لم تعد في وضع الانتظار.',
        );

        return;
      }

      if (playerCount < 4) {
        Alert.alert(
          'عدد اللاعبين غير كافٍ',
          `تحتاج اللعبة إلى 4 لاعبين على الأقل.\nالعدد الحالي: ${playerCount}`,
        );

        return;
      }

      if (playerCount > maxPlayers) {
        Alert.alert(
          'الغرفة ممتلئة',
          `الحد الأقصى لهذه الغرفة هو ${maxPlayers} لاعبين.`,
        );

        return;
      }

      if (startingGame) {
        return;
      }

      setStartingGame(true);

      try {
        const {
          data,
          error,
        } = await supabase.rpc(
          'start_mafia_game',
          {
            p_room_id: roomId,
          },
        );

        if (error) {
          throw error;
        }

        if (
          data &&
          typeof data === 'object' &&
          'success' in data &&
          (data as any).success ===
            false
        ) {
          throw new Error(
            (data as any).message ||
              (data as any).error ||
              'تعذر بدء اللعبة.',
          );
        }

        await loadRoom(false);

        const latestRoom =
          roomRef.current;

        if (
          latestRoom?.status !==
          'playing'
        ) {
          throw new Error(
            'تم تنفيذ طلب بدء اللعبة، لكن الغرفة لم تنتقل إلى حالة اللعب بعد. حاول مرة أخرى.',
          );
        }

        if (
          mountedRef.current &&
          !navigatingToGameRef.current
        ) {
          navigatingToGameRef.current =
            true;

          router.replace(
            `/game/${encodeURIComponent(
              roomCode,
            )}`,
          );
        }
      } catch (error) {
        console.error(
          'startGame error:',
          error,
        );

        navigatingToGameRef.current =
          false;

        if (mountedRef.current) {
          Alert.alert(
            'تعذر بدء اللعبة',
            getErrorMessage(
              error,
              'حدث خطأ أثناء بدء اللعبة.',
            ),
          );
        }
      } finally {
        if (mountedRef.current) {
          setStartingGame(false);
        }
      }
    }, [
      roomId,
      isHost,
      isWaiting,
      playerCount,
      maxPlayers,
      startingGame,
      loadRoom,
      roomCode,
      router,
    ]);

  const kickPlayer =
    useCallback(
      (player: GamePlayer) => {
        if (!roomId) {
          Alert.alert(
            'خطأ',
            'معرف الغرفة غير جاهز.',
          );

          return;
        }

        if (!isHost) {
          Alert.alert(
            'غير مسموح',
            'فقط صاحب الغرفة يستطيع طرد اللاعبين.',
          );

          return;
        }

        if (
          player.user_id ===
          currentUserId
        ) {
          return;
        }

        if (!isWaiting) {
          Alert.alert(
            'غير متاح',
            'لا يمكن طرد اللاعبين بعد بدء اللعبة.',
          );

          return;
        }

        Alert.alert(
          'طرد اللاعب',
          `هل تريد طرد ${
            player.name ||
            'هذا اللاعب'
          } من الغرفة؟`,
          [
            {
              text: 'إلغاء',
              style: 'cancel',
            },
            {
              text: 'طرد',
              style: 'destructive',
              onPress: async () => {
                try {
                  setBusy(true);

                  const {
                    data,
                    error,
                  } =
                    await supabase.rpc(
                      'kick_room_player',
                      {
                        p_room_id:
                          roomId,
                        p_player_user_id:
                          player.user_id,
                      },
                    );

                  if (error) {
                    throw error;
                  }

                  if (
                    data &&
                    typeof data ===
                      'object' &&
                    'success' in data &&
                    (data as any)
                      .success ===
                      false
                  ) {
                    throw new Error(
                      (data as any)
                        .message ||
                        (data as any)
                          .error ||
                        'تعذر طرد اللاعب.',
                    );
                  }

                  await loadRoom(
                    false,
                  );

                  if (
                    mountedRef.current
                  ) {
                    Alert.alert(
                      'تم',
                      `تم طرد ${
                        player.name ||
                        'اللاعب'
                      } من الغرفة.`,
                    );
                  }
                } catch (error) {
                  console.error(
                    'kickPlayer error:',
                    error,
                  );

                  if (
                    mountedRef.current
                  ) {
                    Alert.alert(
                      'تعذر الطرد',
                      getErrorMessage(
                        error,
                        'حدث خطأ أثناء طرد اللاعب.',
                      ),
                    );
                  }
                } finally {
                  if (
                    mountedRef.current
                  ) {
                    setBusy(false);
                  }
                }
              },
            },
          ],
        );
      },
      [
        roomId,
        isHost,
        currentUserId,
        isWaiting,
        loadRoom,
      ],
    );

  const sendMessage =
    useCallback(async () => {
      const text =
        messageText.trim();

      if (
        !text ||
        !roomId ||
        busy
      ) {
        return;
      }

      setBusy(true);

      try {
        const {
          data,
          error,
        } = await supabase.rpc(
          'send_room_message',
          {
            p_room_id: roomId,
            p_message: text,
          },
        );

        if (error) {
          throw error;
        }

        if (
          data &&
          typeof data ===
            'object' &&
          'success' in data &&
          (data as any).success ===
            false
        ) {
          throw new Error(
            (data as any).message ||
              (data as any).error ||
              'تعذر إرسال الرسالة.',
          );
        }

        if (mountedRef.current) {
          setMessageText('');
        }

        await loadMessages();
      } catch (error) {
        console.error(
          'sendMessage error:',
          error,
        );

        if (mountedRef.current) {
          Alert.alert(
            'تعذر إرسال الرسالة',
            getErrorMessage(
              error,
              'حدث خطأ أثناء إرسال الرسالة.',
            ),
          );
        }
      } finally {
        if (mountedRef.current) {
          setBusy(false);
        }
      }
    }, [
      messageText,
      roomId,
      busy,
      loadMessages,
    ]);

  const leaveRoom =
    useCallback(async () => {
      if (!roomId) {
        router.replace('/rooms');
        return;
      }

      try {
        setBusy(true);

        if (currentUserId) {
          const {
            error,
          } = await supabase
            .from('room_players')
            .delete()
            .eq(
              'room_id',
              roomId,
            )
            .eq(
              'user_id',
              currentUserId,
            );

          if (error) {
            throw error;
          }
        }

        router.replace('/rooms');
      } catch (error) {
        console.error(
          'leaveRoom error:',
          error,
        );

        if (mountedRef.current) {
          Alert.alert(
            'تعذر مغادرة الغرفة',
            getErrorMessage(
              error,
              'حدث خطأ أثناء مغادرة الغرفة.',
            ),
          );
        }
      } finally {
        if (mountedRef.current) {
          setBusy(false);
        }
      }
    }, [
      roomId,
      currentUserId,
      router,
    ]);

  const refresh =
    useCallback(async () => {
      setRefreshing(true);

      try {
        await loadRoom(false);
      } finally {
        if (mountedRef.current) {
          setRefreshing(false);
        }
      }
    }, [loadRoom]);

  useEffect(() => {
    if (
      !room ||
      !roomId ||
      navigatingToGameRef.current
    ) {
      return;
    }

    const playing =
      room.status === 'playing';

    if (!playing) {
      return;
    }

    navigatingToGameRef.current =
      true;

    router.replace(
      `/game/${encodeURIComponent(
        roomCode,
      )}`,
    );
  }, [
    room,
    roomId,
    roomCode,
    router,
  ]);

  if (
    loading &&
    !room
  ) {
    return (
      <View style={styles.center}>
        <ActivityIndicator
          size="large"
        />

        <Text
          style={
            styles.loadingText
          }
        >
          جارٍ تحميل الغرفة...
        </Text>
      </View>
    );
  }

  if (!room) {
    return (
      <View style={styles.center}>
        <Text
          style={
            styles.errorTitle
          }
        >
          تعذر العثور على الغرفة
        </Text>

        <Text
          style={
            styles.errorText
          }
        >
          الغرفة غير موجودة أو لم تعد متاحة.
        </Text>

        <Pressable
          style={
            styles.primaryButton
          }
          onPress={() =>
            router.replace(
              '/rooms',
            )
          }
        >
          <Text
            style={
              styles.primaryButtonText
            }
          >
            العودة للغرف
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View
      style={
        styles.container
      }
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={
          styles.content
        }
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={
              refreshing
            }
            onRefresh={refresh}
          />
        }
      >
        {/* Header */}
        <View
          style={
            styles.header
          }
        >
          <View
            style={
              styles.headerMain
            }
          >
            <Text
              style={
                styles.title
              }
            >
              {room.name ||
                'Mafia Night'}
            </Text>

            <Text
              style={
                styles.code
              }
            >
              كود الغرفة: {room.code}
            </Text>
          </View>

          <View style={styles.headerActions}>
            <Pressable
              onPress={toggleMicrophone}
              disabled={voiceConnecting}
              style={[
                styles.micButton,
                microphoneEnabled &&
                  styles.micButtonActive,
                voiceConnecting &&
                  styles.micButtonBusy,
              ]}
            >
              {voiceConnecting ? (
                <ActivityIndicator
                  size="small"
                  color="#fff"
                />
              ) : (
                <Text style={styles.micButtonIcon}>
                  {microphoneEnabled
                    ? '🎙️'
                    : '🔇'}
                </Text>
              )}
            </Pressable>

            <Pressable
              style={
                styles.leaveButton
              }
              onPress={
                leaveRoom
              }
              disabled={busy}
            >
              <Text
                style={
                  styles.leaveButtonText
                }
              >
                مغادرة
              </Text>
            </Pressable>
          </View>
        </View>

        {voiceError && (
          <Text style={styles.voiceErrorText}>
            {voiceError}
          </Text>
        )}

        {/* Status */}
        <View
          style={
            styles.statusCard
          }
        >
          <Text
            style={
              styles.statusTitle
            }
          >
            {isWaiting
              ? '⏳ انتظار اللاعبين'
              : isPlaying
                ? '🎮 اللعبة بدأت'
                : isFinished
                  ? '🏆 انتهت اللعبة'
                  : '🏠 الغرفة'}
          </Text>

          <Text
            style={
              styles.playerCount
            }
          >
            {playerCount} / {maxPlayers} لاعبين
          </Text>

          {isWaiting && (
            <Text
              style={
                styles.statusHint
              }
            >
              بانتظار بدء اللعبة من صاحب الغرفة
            </Text>
          )}

          {isHost &&
            isWaiting && (
              <View
                style={
                  styles.hostBadge
                }
              >
                <Text
                  style={
                    styles.hostBadgeText
                  }
                >
                  👑 أنت صاحب الغرفة
                </Text>
              </View>
            )}
        </View>

        {/* Start Game */}
        {isWaiting &&
          isHost && (
            <View
              style={
                styles.startCard
              }
            >
              <Text
                style={
                  styles.startTitle
                }
              >
                🎮 جاهز لبدء اللعبة؟
              </Text>

              <Text
                style={
                  styles.startHint
                }
              >
                الحد الأدنى 4 لاعبين.
                عند البدء سيتم توزيع الأدوار
                والانتقال إلى شاشة اللعب.
              </Text>

              <Pressable
                style={[
                  styles.startButton,
                  !canStart &&
                    styles.disabledButton,
                ]}
                disabled={
                  !canStart
                }
                onPress={
                  startGame
                }
              >
                {startingGame ? (
                  <ActivityIndicator
                    color="#fff"
                  />
                ) : (
                  <Text
                    style={
                      styles.startButtonText
                    }
                  >
                    🚀 بدء اللعبة
                  </Text>
                )}
              </Pressable>

              {playerCount <
                4 && (
                <Text
                  style={
                    styles.minimumText
                  }
                >
                  تحتاج إلى{' '}
                  {4 -
                    playerCount}{' '}
                  لاعبين إضافيين.
                </Text>
              )}

              {playerCount >=
                4 &&
                playerCount <=
                  maxPlayers && (
                  <Text
                    style={
                      styles.readyText
                    }
                  >
                    ✅ الغرفة جاهزة للبدء
                  </Text>
                )}
            </View>
          )}

        {/* Players */}
        <View
          style={
            styles.card
          }
        >
          <View
            style={
              styles.cardHeader
            }
          >
            <Text
              style={
                styles.sectionTitle
              }
            >
              👥 اللاعبون
            </Text>

            <Text
              style={
                styles.sectionCount
              }
            >
              {playerCount}/
              {maxPlayers}
            </Text>
          </View>

          {players.length ===
          0 ? (
            <Text
              style={
                styles.emptyText
              }
            >
              لا يوجد لاعبون في الغرفة.
            </Text>
          ) : (
            players.map(
              (player) => {
                const isMe =
                  player.user_id ===
                  currentUserId;

                const isPlayerHost =
                  player.user_id ===
                  room.host_id;

                return (
                  <View
                    key={
                      player.id ||
                      player.user_id
                    }
                    style={
                      styles.playerRow
                    }
                  >
                    <PlayerAvatar
                      player={
                        player
                      }
                      size={52}
                    />

                    <View
                      style={
                        styles.playerInfo
                      }
                    >
                      <Text
                        style={
                          styles.playerName
                        }
                      >
                        {player.name ||
                          'لاعب'}

                        {isMe &&
                          ' (أنت)'}

                        {isPlayerHost &&
                          ' 👑'}
                      </Text>

                      <Text
                        style={
                          styles.playerStatus
                        }
                      >
                        {player.alive ===
                        false
                          ? 'غير متاح'
                          : isWaiting
                            ? 'بانتظار بدء اللعبة'
                            : 'داخل اللعبة'}
                      </Text>
                    </View>

                    {isHost &&
                      isWaiting &&
                      !isMe && (
                        <Pressable
                          style={
                            styles.kickButton
                          }
                          disabled={
                            busy
                          }
                          onPress={() =>
                            kickPlayer(
                              player,
                            )
                          }
                        >
                          <Text
                            style={
                              styles.kickText
                            }
                          >
                            طرد
                          </Text>
                        </Pressable>
                      )}
                  </View>
                );
              },
            )
          )}
        </View>

        {/* Chat */}
        <View
          style={
            styles.card
          }
        >
          <Text
            style={
              styles.sectionTitle
            }
          >
            💬 دردشة الغرفة
          </Text>

          <Text
            style={
              styles.chatHint
            }
          >
            يمكنك الدردشة مع اللاعبين قبل بدء اللعبة.
          </Text>

          <View
            style={
              styles.messages
            }
          >
            {messages.length ===
            0 ? (
              <Text
                style={
                  styles.emptyText
                }
              >
                لا توجد رسائل بعد. كن أول من يكتب!
              </Text>
            ) : (
              messages.map(
                (item) => (
                  <View
                    key={
                      item.id
                    }
                    style={
                      styles.messageRow
                    }
                  >
                    <Text
                      style={
                        styles.messageUser
                      }
                    >
                      {item.username ||
                        'لاعب'}
                    </Text>

                    <Text
                      style={
                        styles.messageText
                      }
                    >
                      {
                        item.message
                      }
                    </Text>
                  </View>
                ),
              )
            )}
          </View>

          <View
            style={
              styles.chatInputRow
            }
          >
            <TextInput
              style={
                styles.input
              }
              value={
                messageText
              }
              onChangeText={
                setMessageText
              }
              placeholder="اكتب رسالة..."
              placeholderTextColor="#777"
              multiline
              maxLength={500}
              editable={
                !busy
              }
            />

            <Pressable
              style={[
                styles.sendButton,
                (!messageText.trim() ||
                  busy) &&
                  styles.disabledButton,
              ]}
              disabled={
                busy ||
                !messageText.trim()
              }
              onPress={
                sendMessage
              }
            >
              <Text
                style={
                  styles.sendText
                }
              >
                إرسال
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Info */}
        <View
          style={
            styles.infoCard
          }
        >
          <Text
            style={
              styles.infoTitle
            }
          >
            ℹ️ كيف تعمل الغرفة؟
          </Text>

          <Text
            style={
              styles.infoText
            }
          >
            • يجب وجود 4 لاعبين على الأقل لبدء اللعبة.
          </Text>

          <Text
            style={
              styles.infoText
            }
          >
            • صاحب الغرفة وحده يستطيع بدء اللعبة أو طرد لاعب.
          </Text>

          <Text
            style={
              styles.infoText
            }
          >
            • حالة الانتظار تعتمد على status = waiting.
          </Text>

          <Text
            style={
              styles.infoText
            }
          >
            • بعد بدء اللعبة فعليًا سيتم نقلك تلقائيًا إلى شاشة اللعبة.
          </Text>

          <Text
            style={
              styles.infoText
            }
          >
            • الأدوار والتصويت والأفعال الليلية تظهر داخل شاشة اللعبة.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#09090f',
  },

  scroll: {
    flex: 1,
  },

  content: {
    padding: 16,
    paddingBottom: 40,
  },

  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#09090f',
    padding: 24,
  },

  loadingText: {
    color: '#fff',
    marginTop: 14,
    fontSize: 16,
  },

  errorTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 10,
  },

  errorText: {
    color: '#aaa',
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 20,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },

  headerMain: {
    flex: 1,
    marginRight: 12,
  },

  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  micButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#374151',
  },

  micButtonActive: {
    backgroundColor: '#16a34a',
  },

  micButtonBusy: {
    opacity: 0.7,
  },

  micButtonIcon: {
    fontSize: 20,
  },

  voiceErrorText: {
    color: '#f87171',
    fontSize: 13,
    marginBottom: 12,
    textAlign: 'center',
  },

  title: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '900',
  },

  code: {
    color: '#999',
    fontSize: 13,
    marginTop: 5,
    letterSpacing: 1,
  },

  leaveButton: {
    backgroundColor: '#35151b',
    borderRadius: 10,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },

  leaveButtonText: {
    color: '#ff8f9a',
    fontWeight: '800',
  },

  statusCard: {
    backgroundColor: '#151520',
    borderRadius: 18,
    padding: 20,
    alignItems: 'center',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#29293a',
  },

  statusTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '900',
  },

  playerCount: {
    color: '#d1d1df',
    fontSize: 18,
    fontWeight: '800',
    marginTop: 8,
  },

  statusHint: {
    color: '#999',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 7,
  },

  hostBadge: {
    marginTop: 12,
    backgroundColor: '#302348',
    borderRadius: 10,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },

  hostBadgeText: {
    color: '#e4d4ff',
    fontWeight: '800',
  },

  startCard: {
    backgroundColor: '#171426',
    borderRadius: 18,
    padding: 17,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#4a3970',
  },

  startTitle: {
    color: '#fff',
    fontSize: 19,
    fontWeight: '900',
    marginBottom: 7,
  },

  startHint: {
    color: '#aaa',
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 14,
  },

  startButton: {
    backgroundColor: '#4b2d78',
    borderRadius: 13,
    paddingVertical: 15,
    alignItems: 'center',
  },

  startButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '900',
  },

  minimumText: {
    color: '#ffb4bc',
    textAlign: 'center',
    fontSize: 12,
    marginTop: 9,
  },

  readyText: {
    color: '#83d18b',
    textAlign: 'center',
    fontSize: 12,
    marginTop: 9,
    fontWeight: '800',
  },

  disabledButton: {
    opacity: 0.4,
  },

  card: {
    backgroundColor: '#151520',
    borderRadius: 17,
    padding: 15,
    marginBottom: 14,
  },

  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 7,
  },

  sectionTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '900',
  },

  sectionCount: {
    color: '#999',
    fontSize: 14,
    fontWeight: '700',
  },

  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1c1c29',
    borderRadius: 13,
    padding: 10,
    marginTop: 8,
  },

  avatar: {
    backgroundColor: '#29293a',
    alignItems: 'center',
    justifyContent: 'center',
  },

  avatarText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '900',
  },

  playerInfo: {
    flex: 1,
    marginLeft: 11,
  },

  playerName: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },

  playerStatus: {
    color: '#83d18b',
    fontSize: 12,
    marginTop: 3,
  },

  kickButton: {
    backgroundColor: '#35151b',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },

  kickText: {
    color: '#ff8f9a',
    fontSize: 12,
    fontWeight: '800',
  },

  chatHint: {
    color: '#888',
    fontSize: 12,
    marginTop: 5,
  },

  messages: {
    marginTop: 13,
    marginBottom: 12,
  },

  messageRow: {
    backgroundColor: '#1c1c29',
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
  },

  messageUser: {
    color: '#b8b8d0',
    fontSize: 12,
    fontWeight: '900',
    marginBottom: 3,
  },

  messageText: {
    color: '#fff',
    fontSize: 14,
    lineHeight: 20,
  },

  emptyText: {
    color: '#777',
    textAlign: 'center',
    paddingVertical: 15,
    fontSize: 13,
  },

  chatInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },

  input: {
    flex: 1,
    minHeight: 46,
    maxHeight: 110,
    backgroundColor: '#20202d',
    borderRadius: 11,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#fff',
    textAlignVertical: 'top',
  },

  sendButton: {
    marginLeft: 8,
    backgroundColor: '#303047',
    borderRadius: 11,
    paddingHorizontal: 15,
    paddingVertical: 14,
  },

  sendText: {
    color: '#fff',
    fontWeight: '900',
  },

  infoCard: {
    backgroundColor: '#11111a',
    borderRadius: 16,
    padding: 15,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#252534',
  },

  infoTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 9,
  },

  infoText: {
    color: '#999',
    fontSize: 13,
    lineHeight: 21,
    marginTop: 3,
  },

  primaryButton: {
    backgroundColor: '#4b2d78',
    borderRadius: 12,
    paddingHorizontal: 22,
    paddingVertical: 14,
  },

  primaryButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '900',
  },
});
