import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
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

import {
  useLocalSearchParams,
  useRouter,
} from 'expo-router';

import { supabase } from '../../lib/supabase';
import { getMyProfile } from '../../lib/profile';
import {
  getGameState,
  submitDayVote,
  submitNightAction,
} from '../../lib/game';

import type {
  GameState,
  GamePlayer,
} from '../../lib/game';

import { getLiveKitToken } from '../../lib/livekit';

/* =========================================================
   TYPES
========================================================= */

type GameRoom = GameState['room'] & {
  host_id?: string;
  phase_ends_at?: string | null;
};

type Message = {
  id: string;
  room_id: string;
  user_id: string;
  message: string;
  created_at: string;
  username?: string | null;
  avatar_url?: string | null;
};

type VoiceRoom = any;

/* =========================================================
   HELPERS
========================================================= */

function getErrorMessage(error: any, fallback: string) {
  if (typeof error === 'string' && error.trim()) {
    return error;
  }

  if (
    error?.message &&
    typeof error.message === 'string'
  ) {
    return error.message;
  }

  return fallback;
}

function getSecondsLeft(
  value: string | null | undefined,
) {
  if (!value) return 0;

  const timestamp = new Date(value).getTime();

  if (!Number.isFinite(timestamp)) {
    return 0;
  }

  return Math.max(
    0,
    Math.ceil(
      (timestamp - Date.now()) / 1000,
    ),
  );
}

function formatTime(seconds: number) {
  const safe = Math.max(
    0,
    Math.floor(seconds),
  );

  const minutes = Math.floor(
    safe / 60,
  );

  const remaining = safe % 60;

  return `${String(minutes).padStart(
    2,
    '0',
  )}:${String(remaining).padStart(
    2,
    '0',
  )}`;
}

function roleLabel(
  role: string | null | undefined,
) {
  switch (String(role).toLowerCase()) {
    case 'mafia':
      return 'المافيا';

    case 'doctor':
      return 'الطبيب';

    case 'detective':
      return 'المحقق';

    case 'citizen':
      return 'المواطن';

    default:
      return role || 'غير معروف';
  }
}

/* =========================================================
   AVATAR
========================================================= */

function PlayerAvatar({
  player,
  size = 52,
}: {
  player: GamePlayer;
  size?: number;
}) {
  const initials =
    (player.name || 'P')
      .trim()
      .charAt(0)
      .toUpperCase();

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
        {initials}
      </Text>
    </View>
  );
}

/* =========================================================
   SCREEN
========================================================= */

export default function MafiaGameScreen() {
  const router = useRouter();

  const params =
    useLocalSearchParams<{
      code?: string | string[];
    }>();

  const roomId = Array.isArray(params.code)
    ? params.code[0]
    : params.code;

  const mountedRef = useRef(true);

  /* -------------------------------------------------------
     DATA
  ------------------------------------------------------- */

  const [gameState, setGameState] =
    useState<GameState | null>(null);

  const [messages, setMessages] =
    useState<Message[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [busy, setBusy] =
    useState(false);

  const [messageText, setMessageText] =
    useState('');

  const [selectedTarget, setSelectedTarget] =
    useState<string | null>(null);

  const [secondsLeft, setSecondsLeft] =
    useState(0);

  const [currentUserId, setCurrentUserId] =
    useState('');

  /* -------------------------------------------------------
     VOICE
  ------------------------------------------------------- */

  const voiceRoomRef =
    useRef<VoiceRoom | null>(null);

  const [voiceConnected, setVoiceConnected] =
    useState(false);

  const [micEnabled, setMicEnabled] =
    useState(false);

  const [voiceLoading, setVoiceLoading] =
    useState(false);

  /* =======================================================
     LOAD GAME
  ======================================================= */

  const loadGame = useCallback(
    async (showLoader = false) => {
      if (!roomId) return;

      try {
        if (showLoader && mountedRef.current) {
          setLoading(true);
        }

        const [
          profile,
          state,
        ] = await Promise.all([
          getMyProfile(),
          getGameState(roomId),
        ]);

        if (!mountedRef.current) {
          return;
        }

        setCurrentUserId(
          profile.user_id,
        );

        setGameState(state);
      } catch (error: any) {
        console.error(
          'loadGame error:',
          error,
        );

        if (mountedRef.current) {
          Alert.alert(
            'خطأ',
            getErrorMessage(
              error,
              'تعذر تحميل الغرفة.',
            ),
          );
        }
      } finally {
        if (mountedRef.current) {
          setLoading(false);
        }
      }
    },
    [roomId],
  );

  /* =======================================================
     LOAD MESSAGES
  ======================================================= */

  const loadMessages =
    useCallback(async () => {
      if (!roomId) return;

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
            roomId,
          )
          .order(
            'created_at',
            {
              ascending: true,
            },
          );

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
            rows.map(
              (item) => item.user_id,
            ),
          ),
        ];

        const {
          data: profiles,
        } = await supabase
          .from('profiles')
          .select(
            'user_id,username,avatar_url',
          )
          .in(
            'user_id',
            userIds,
          );

        const profileMap =
          new Map<
            string,
            {
              username: string | null;
              avatar_url: string | null;
            }
          >();

        (profiles || []).forEach(
          (profile: any) => {
            profileMap.set(
              profile.user_id,
              {
                username:
                  profile.username,
                avatar_url:
                  profile.avatar_url,
              },
            );
          },
        );

        const normalized =
          rows.map((item) => ({
            ...item,
            username:
              profileMap.get(
                item.user_id,
              )?.username ||
              null,
            avatar_url:
              profileMap.get(
                item.user_id,
              )?.avatar_url ||
              null,
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
    }, [roomId]);

  /* =======================================================
     INITIAL LOAD
  ======================================================= */

  useEffect(() => {
    mountedRef.current = true;

    if (!roomId) {
      setLoading(false);
      return;
    }

    void loadGame(true);
    void loadMessages();

    return () => {
      mountedRef.current = false;
    };
  }, [
    roomId,
    loadGame,
    loadMessages,
  ]);

  /* =======================================================
     REALTIME
  ======================================================= */

  useEffect(() => {
    if (!roomId) return;

    const channel =
      supabase
        .channel(
          `mafia-room-${roomId}`,
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'rooms',
            filter:
              `id=eq.${roomId}`,
          },
          () => {
            void loadGame(false);
          },
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'room_players',
            filter:
              `room_id=eq.${roomId}`,
          },
          () => {
            void loadGame(false);
          },
        )
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'room_messages',
            filter:
              `room_id=eq.${roomId}`,
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
    loadGame,
    loadMessages,
  ]);

  /* =======================================================
     HEARTBEAT
  ======================================================= */

  useEffect(() => {
    if (!roomId) return;

    let cancelled = false;

    const heartbeat = async () => {
      if (cancelled) return;

      try {
        await supabase.rpc(
          'heartbeat_room',
          {
            p_room_id: roomId,
          },
        );
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
      clearInterval(interval);
    };
  }, [roomId]);

  /* =======================================================
     DERIVED DATA
  ======================================================= */

  const room =
    (gameState?.room ||
      null) as GameRoom | null;

  const players =
    gameState?.players || [];

  const me =
    gameState?.me || null;

  const currentPlayer =
    players.find(
      (player) =>
        player.user_id ===
        currentUserId,
    ) || null;

  const myAlive =
    Boolean(me?.alive);

  const phase =
    room?.game_phase || 'night';

  const isNight =
    phase === 'night';

  const isDay =
    phase === 'day';

  const gameFinished =
    phase === 'finished' ||
    room?.status === 'finished';

  const isHost =
    Boolean(
      room?.host_id &&
      room.host_id ===
        currentUserId,
    );

  const alivePlayers =
    useMemo(
      () =>
        players.filter(
          (player) =>
            player.alive,
        ),
      [players],
    );

  const selectablePlayers =
    useMemo(
      () =>
        alivePlayers.filter(
          (player) =>
            player.user_id !==
            currentUserId,
        ),
      [
        alivePlayers,
        currentUserId,
      ],
    );

  const myRole =
    me?.role || null;

  const canNightAction =
    isNight &&
    myAlive &&
    !gameFinished &&
    !busy;

  const canDayVote =
    isDay &&
    myAlive &&
    !gameFinished &&
    !busy;

  /* =======================================================
     COUNTDOWN
  ======================================================= */

  useEffect(() => {
    const end =
      room?.phase_ends_at;

    if (!end) {
      setSecondsLeft(0);
      return;
    }

    const update = () => {
      const remaining =
        getSecondsLeft(end);

      if (mountedRef.current) {
        setSecondsLeft(
          remaining,
        );
      }

      if (
        remaining <= 0 &&
        room?.status ===
          'playing'
      ) {
        void advancePhase();
      }
    };

    update();

    const interval =
      setInterval(
        update,
        1000,
      );

    return () =>
      clearInterval(
        interval,
      );
  }, [
    room?.phase_ends_at,
    room?.status,
  ]);

  /* =======================================================
     ADVANCE PHASE
  ======================================================= */

  const advancingRef =
    useRef(false);

  const advancePhase =
    useCallback(async () => {
      if (
        !roomId ||
        advancingRef.current
      ) {
        return;
      }

      advancingRef.current = true;

      try {
        await supabase.rpc(
          'advance_mafia_phase',
          {
            p_room_id: roomId,
          },
        );

        await loadGame(false);
      } catch (error: any) {
        const message =
          getErrorMessage(
            error,
            '',
          );

        if (
          !message.includes(
            'phase_not_finished',
          )
        ) {
          console.error(
            'advance phase error:',
            error,
          );
        }
      } finally {
        advancingRef.current = false;
      }
    }, [
      roomId,
      loadGame,
    ]);

  /* =======================================================
     SELECT TARGET
  ======================================================= */

  const selectTarget =
    useCallback(
      (userId: string) => {
        if (
          busy ||
          gameFinished ||
          !myAlive
        ) {
          return;
        }

        const target =
          players.find(
            (player) =>
              player.user_id ===
              userId,
          );

        if (
          !target ||
          !target.alive ||
          target.user_id ===
            currentUserId
        ) {
          return;
        }

        setSelectedTarget(
          (current) =>
            current === userId
              ? null
              : userId,
        );
      },
      [
        busy,
        gameFinished,
        myAlive,
        players,
        currentUserId,
      ],
    );

  /* =======================================================
     START GAME
  ======================================================= */

  const startGame =
    useCallback(async () => {
      if (
        !roomId ||
        !isHost
      ) {
        return;
      }

      if (players.length < 4) {
        Alert.alert(
          'لا يمكن بدء اللعبة',
          'يجب أن يكون هناك 4 لاعبين على الأقل.',
        );
        return;
      }

      setBusy(true);

      try {
        const {
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

        await loadGame(false);
      } catch (error: any) {
        Alert.alert(
          'تعذر بدء اللعبة',
          getErrorMessage(
            error,
            'حدث خطأ أثناء بدء اللعبة.',
          ),
        );
      } finally {
        if (mountedRef.current) {
          setBusy(false);
        }
      }
    }, [
      roomId,
      isHost,
      players.length,
      loadGame,
    ]);

  /* =======================================================
     NIGHT ACTION
  ======================================================= */

  const performNightAction =
    useCallback(
      async (
        action:
          | 'kill'
          | 'protect'
          | 'investigate',
      ) => {
        if (
          !roomId ||
          !selectedTarget
        ) {
          Alert.alert(
            'اختر لاعبًا',
            'يجب اختيار لاعب واحد أولًا.',
          );
          return;
        }

        if (
          !canNightAction
        ) {
          return;
        }

        if (
          action ===
            'kill' &&
          myRole !==
            'mafia'
        ) {
          Alert.alert(
            'غير مسموح',
            'هذا الإجراء غير متاح لدورك.',
          );
          return;
        }

        if (
          action ===
            'protect' &&
          myRole !==
            'doctor'
        ) {
          Alert.alert(
            'غير مسموح',
            'هذا الإجراء غير متاح لدورك.',
          );
          return;
        }

        if (
          action ===
            'investigate' &&
          myRole !==
            'detective'
        ) {
          Alert.alert(
            'غير مسموح',
            'هذا الإجراء غير متاح لدورك.',
          );
          return;
        }

        const target =
          players.find(
            (player) =>
              player.user_id ===
              selectedTarget,
          );

        if (
          !target ||
          !target.alive ||
          target.user_id ===
            currentUserId
        ) {
          Alert.alert(
            'هدف غير صالح',
            'يجب اختيار لاعب حي آخر.',
          );
          return;
        }

        setBusy(true);

        try {
          const result =
            await submitNightAction(
              roomId,
              action,
              selectedTarget,
            );

          setSelectedTarget(
            null,
          );

          if (
            result?.result &&
            action ===
              'investigate'
          ) {
            Alert.alert(
              'نتيجة التحقيق',
              result.result.is_mafia
                ? 'هذا اللاعب من المافيا.'
                : 'هذا اللاعب ليس من المافيا.',
            );
          } else {
            Alert.alert(
              'تم التنفيذ',
              'تم تسجيل مهمتك الليلية بنجاح.',
            );
          }

          await loadGame(false);
        } catch (error: any) {
          Alert.alert(
            'تعذر تنفيذ العملية',
            getErrorMessage(
              error,
              'لا يمكن تنفيذ هذه العملية الآن.',
            ),
          );
        } finally {
          if (mountedRef.current) {
            setBusy(false);
          }
        }
      },
      [
        roomId,
        selectedTarget,
        canNightAction,
        myRole,
        players,
        currentUserId,
        loadGame,
      ],
    );

  /* =======================================================
     DAY VOTE
  ======================================================= */

  const performVote =
    useCallback(async () => {
      if (
        !roomId ||
        !selectedTarget
      ) {
        Alert.alert(
          'اختر لاعبًا',
          'اختر لاعبًا حيًا للتصويت ضده.',
        );
        return;
      }

      if (!canDayVote) {
        return;
      }

      const target =
        players.find(
          (player) =>
            player.user_id ===
            selectedTarget,
        );

      if (
        !target ||
        !target.alive ||
        target.user_id ===
          currentUserId
      ) {
        Alert.alert(
          'تصويت غير صالح',
          'اختر لاعبًا حيًا آخر.',
        );
        return;
      }

      setBusy(true);

      try {
        await submitDayVote(
          roomId,
          selectedTarget,
        );

        setSelectedTarget(
          null,
        );

        Alert.alert(
          'تم التصويت',
          `تم تسجيل تصويتك ضد ${
            target.name || 'اللاعب'
          }.`,
        );

        await loadGame(false);
      } catch (error: any) {
        Alert.alert(
          'تعذر تسجيل التصويت',
          getErrorMessage(
            error,
            'حدث خطأ أثناء تسجيل التصويت.',
          ),
        );
      } finally {
        if (mountedRef.current) {
          setBusy(false);
        }
      }
    }, [
      roomId,
      selectedTarget,
      canDayVote,
      players,
      currentUserId,
      loadGame,
    ]);

  /* =======================================================
     CHAT
  ======================================================= */

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

        setMessageText('');

        await loadMessages();
      } catch (error: any) {
        Alert.alert(
          'تعذر إرسال الرسالة',
          getErrorMessage(
            error,
            'حدث خطأ أثناء إرسال الرسالة.',
          ),
        );
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

  /* =======================================================
     LEAVE ROOM
  ======================================================= */

  const leaveRoom =
    useCallback(async () => {
      if (!roomId) return;

      try {
        await supabase
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

        router.replace('/rooms');
      } catch (error: any) {
        Alert.alert(
          'خطأ',
          getErrorMessage(
            error,
            'تعذر مغادرة الغرفة.',
          ),
        );
      }
    }, [
      roomId,
      currentUserId,
      router,
    ]);

  /* =======================================================
     KICK PLAYER
  ======================================================= */

  const kickPlayer =
    useCallback(
      (player: GamePlayer) => {
        if (
          !roomId ||
          !isHost ||
          player.user_id ===
            currentUserId
        ) {
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
              onPress:
                async () => {
                  try {
                    const {
                      error,
                    } =
                      await supabase
                        .from(
                          'room_players',
                        )
                        .delete()
                        .eq(
                          'room_id',
                          roomId,
                        )
                        .eq(
                          'user_id',
                          player.user_id,
                        );

                    if (error) {
                      throw error;
                    }

                    await loadGame(
                      false,
                    );
                  } catch (
                    error: any
                  ) {
                    Alert.alert(
                      'خطأ',
                      getErrorMessage(
                        error,
                        'تعذر طرد اللاعب.',
                      ),
                    );
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
        loadGame,
      ],
    );

  /* =======================================================
     VOICE
  ======================================================= */

  const disconnectVoice =
    useCallback(async () => {
      try {
        if (
          voiceRoomRef.current
        ) {
          await voiceRoomRef.current.disconnect();
        }
      } catch (error) {
        console.error(
          'disconnect voice:',
          error,
        );
      } finally {
        voiceRoomRef.current =
          null;

        if (mountedRef.current) {
          setVoiceConnected(
            false,
          );
          setMicEnabled(false);
        }
      }
    }, []);

  const connectVoice =
    useCallback(async () => {
      if (
        !roomId ||
        voiceRoomRef.current
      ) {
        return;
      }

      setVoiceLoading(true);

      try {
        const token =
          await getLiveKitToken(
            roomId,
          );

        if (
          !token?.token ||
          !token?.server_url
        ) {
          throw new Error(
            'تعذر الحصول على بيانات الصوت.',
          );
        }

        const livekit =
          await import(
            '@livekit/react-native'
          );

        try {
          livekit.registerGlobals();
        } catch {}

        const voiceRoom =
          new livekit.Room();

        voiceRoomRef.current =
          voiceRoom;

        voiceRoom.on(
          livekit.RoomEvent.Disconnected,
          () => {
            if (
              mountedRef.current
            ) {
              setVoiceConnected(
                false,
              );
              setMicEnabled(
                false,
              );
            }

            voiceRoomRef.current =
              null;
          },
        );

        await voiceRoom.connect(
          token.server_url,
          token.token,
        );

        if (
          !mountedRef.current
        ) {
          await voiceRoom.disconnect();
          return;
        }

        setVoiceConnected(
          true,
        );
      } catch (error: any) {
        voiceRoomRef.current =
          null;

        Alert.alert(
          'الصوت',
          getErrorMessage(
            error,
            'تعذر الاتصال بالصوت.',
          ),
        );
      } finally {
        if (mountedRef.current) {
          setVoiceLoading(false);
        }
      }
    }, [roomId]);

  const toggleMicrophone =
    useCallback(async () => {
      if (
        !voiceRoomRef.current
      ) {
        await connectVoice();
        return;
      }

      try {
        const next =
          !micEnabled;

        await voiceRoomRef.current.localParticipant.setMicrophoneEnabled(
          next,
        );

        if (mountedRef.current) {
          setMicEnabled(next);
        }
      } catch (error: any) {
        Alert.alert(
          'الميكروفون',
          getErrorMessage(
            error,
            'تعذر تغيير حالة الميكروفون.',
          ),
        );
      }
    }, [
      connectVoice,
      micEnabled,
    ]);

  useEffect(() => {
    return () => {
      void disconnectVoice();
    };
  }, [
    disconnectVoice,
  ]);

  /* =======================================================
     REFRESH
  ======================================================= */

  const refresh =
    useCallback(async () => {
      setRefreshing(true);

      try {
        await Promise.all([
          loadGame(false),
          loadMessages(),
        ]);
      } finally {
        if (mountedRef.current) {
          setRefreshing(false);
        }
      }
    }, [
      loadGame,
      loadMessages,
    ]);

  /* =======================================================
     LOADING
  ======================================================= */

  if (loading && !gameState) {
    return (
      <View
        style={styles.center}
      >
        <ActivityIndicator
          size="large"
        />

        <Text
          style={styles.loadingText}
        >
          جارٍ تحميل الغرفة...
        </Text>
      </View>
    );
  }

  /* =======================================================
     ROOM NOT FOUND
  ======================================================= */

  if (!room) {
    return (
      <View
        style={styles.center}
      >
        <Text
          style={styles.errorTitle}
        >
          تعذر العثور على الغرفة
        </Text>

        <Text
          style={styles.errorText}
        >
          الغرفة غير موجودة أو لم تعد متاحة.
        </Text>

        <Pressable
          style={styles.primaryButton}
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
            العودة
          </Text>
        </Pressable>
      </View>
    );
  }

  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={
          styles.content
        }
        keyboardShouldPersistTaps="handled"
      >
        {/* HEADER */}

        <View style={styles.header}>
          <Pressable
            onPress={() =>
              Alert.alert(
                'مغادرة الغرفة',
                'هل تريد مغادرة الغرفة؟',
                [
                  {
                    text: 'إلغاء',
                    style: 'cancel',
                  },
                  {
                    text: 'مغادرة',
                    style: 'destructive',
                    onPress:
                      () => {
                        void leaveRoom();
                      },
                  },
                ],
              )
            }
            style={styles.backButton}
          >
            <Text
              style={styles.backText}
            >
              ‹
            </Text>
          </Pressable>

          <View
            style={styles.headerCenter}
          >
            <Text
              style={styles.roomName}
            >
              {room.name}
            </Text>

            <Text
              style={styles.roomCode}
            >
              رمز الغرفة: {room.code}
            </Text>
          </View>

          <Pressable
            style={[
              styles.micButton,
              micEnabled &&
                styles.micButtonActive,
            ]}
            onPress={() => {
              void toggleMicrophone();
            }}
            disabled={
              voiceLoading
            }
          >
            <Text
              style={styles.micText}
            >
              {voiceLoading
                ? '...'
                : micEnabled
                  ? '🎙️'
                  : '🔇'}
            </Text>
          </Pressable>
        </View>

        {/* STATUS */}

        <View
          style={styles.statusCard}
        >
          <View>
            <Text
              style={styles.statusTitle}
            >
              {gameFinished
                ? 'انتهت اللعبة'
                : isNight
                  ? '🌙 الليل'
                  : '☀️ النهار'}
            </Text>

            <Text
              style={styles.statusSub}
            >
              الجولة {room.game_round}
            </Text>
          </View>

          {!gameFinished && (
            <View
              style={styles.timerBox}
            >
              <Text
                style={styles.timerLabel}
              >
                الوقت
              </Text>

              <Text
                style={styles.timer}
              >
                {formatTime(
                  secondsLeft,
                )}
              </Text>
            </View>
          )}
        </View>

        {/* MY ROLE */}

        {gameState.me && (
          <View
            style={styles.roleCard}
          >
            <Text
              style={styles.sectionTitle}
            >
              دورك
            </Text>

            <Text
              style={styles.roleTitle}
            >
              {roleLabel(
                myRole,
              )}
            </Text>

            <Text
              style={styles.roleStatus}
            >
              {myAlive
                ? '🟢 أنت على قيد الحياة'
                : '🔴 أنت ميت'}
            </Text>
          </View>
        )}

        {/* PLAYERS */}

        <View
          style={styles.card}
        >
          <View
            style={styles.cardHeader}
          >
            <Text
              style={styles.sectionTitle}
            >
              اللاعبين
            </Text>

            <Text
              style={styles.count}
            >
              {alivePlayers.length}/
              {players.length}
            </Text>
          </View>

          {players.map(
            (player) => {
              const selected =
                selectedTarget ===
                player.user_id;

              const isMe =
                player.user_id ===
                currentUserId;

              const canSelect =
                player.alive &&
                !isMe &&
                !gameFinished &&
                myAlive &&
                (isNight ||
                  isDay);

              return (
                <Pressable
                  key={
                    player.user_id
                  }
                  onPress={() => {
                    if (
                      canSelect
                    ) {
                      selectTarget(
                        player.user_id,
                      );
                    }
                  }}
                  style={[
                    styles.playerRow,
                    selected &&
                      styles.playerSelected,
                    !player.alive &&
                      styles.playerDead,
                  ]}
                >
                  <PlayerAvatar
                    player={
                      player
                    }
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
                      {isMe
                        ? ' (أنت)'
                        : ''}
                    </Text>

                    <Text
                      style={
                        styles.playerStatus
                      }
                    >
                      {player.alive
                        ? 'حي'
                        : 'ميت'}
                    </Text>
                  </View>

                  {isHost &&
                    !isMe && (
                      <Pressable
                        style={
                          styles.kickButton
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

                  {selected && (
                    <Text
                      style={
                        styles.selectedText
                      }
                    >
                      ✓
                    </Text>
                  )}
                </Pressable>
              );
            },
          )}
        </View>

        {/* START GAME */}

        {room.status !==
          'playing' &&
          !gameFinished &&
          isHost && (
            <View
              style={styles.card}
            >
              <Text
                style={styles.waitingText}
              >
                عدد اللاعبين:{" "}
                {players.length}
              </Text>

              <Pressable
                style={[
                  styles.primaryButton,
                  players.length <
                    4 &&
                    styles.disabledButton,
                ]}
                disabled={
                  busy ||
                  players.length <
                    4
                }
                onPress={() => {
                  void startGame();
                }}
              >
                <Text
                  style={
                    styles.primaryButtonText
                  }
                >
                  {busy
                    ? 'جارٍ البدء...'
                    : 'ابدأ اللعبة'}
                </Text>
              </Pressable>
            </View>
          )}

        {/* ACTIONS */}

        {!gameFinished &&
          myAlive && (
            <View
              style={styles.card}
            >
              <Text
                style={styles.sectionTitle}
              >
                {isNight
                  ? 'مهمتك الليلية'
                  : 'التصويت'}
              </Text>

              {!selectedTarget && (
                <Text
                  style={styles.hint}
                >
                  اختر لاعبًا من القائمة أولًا.
                </Text>
              )}

              {isNight && (
                <View
                  style={
                    styles.actionGrid
                  }
                >
                  {myRole ===
                    'mafia' && (
                    <Pressable
                      style={
                        styles.actionButton
                      }
                      disabled={
                        busy ||
                        !selectedTarget
                      }
                      onPress={() => {
                        void performNightAction(
                          'kill',
                        );
                      }}
                    >
                      <Text
                        style={
                          styles.actionText
                        }
                      >
                        🔪 قتل
                      </Text>
                    </Pressable>
                  )}

                  {myRole ===
                    'doctor' && (
                    <Pressable
                      style={
                        styles.actionButton
                      }
                      disabled={
                        busy ||
                        !selectedTarget
                      }
                      onPress={() => {
                        void performNightAction(
                          'protect',
                        );
                      }}
                    >
                      <Text
                        style={
                          styles.actionText
                        }
                      >
                        🩺 حماية
                      </Text>
                    </Pressable>
                  )}

                  {myRole ===
                    'detective' && (
                    <Pressable
                      style={
                        styles.actionButton
                      }
                      disabled={
                        busy ||
                        !selectedTarget
                      }
                      onPress={() => {
                        void performNightAction(
                          'investigate',
                        );
                      }}
                    >
                      <Text
                        style={
                          styles.actionText
                        }
                      >
                        🔎 تحقيق
                      </Text>
                    </Pressable>
                  )}
                </View>
              )}

              {isDay && (
                <Pressable
                  style={
                    styles.voteButton
                  }
                  disabled={
                    busy ||
                    !selectedTarget
                  }
                  onPress={() => {
                    void performVote();
                  }}
                >
                  <Text
                    style={
                      styles.voteText
                    }
                  >
                    🗳️ تصويت
                  </Text>
                </Pressable>
              )}
            </View>
          )}

        {/* LAST EVENT */}

        {room.last_event && (
          <View
            style={styles.eventCard}
          >
            <Text
              style={styles.eventTitle}
            >
              آخر حدث
            </Text>

            <Text
              style={styles.eventText}
            >
              {room.last_event.type ===
              'night'
                ? room.last_event
                    .protected
                  ? 'تم إنقاذ لاعب خلال الليل.'
                  : room.last_event
                        .victim_id
                    ? 'حدثت عملية قتل خلال الليل.'
                    : 'انتهى الليل.'
                : room.last_event
                      .tie
                  ? 'حدث تعادل في التصويت.'
                  : room.last_event
                        .eliminated_id
                    ? 'تم إقصاء لاعب بالتصويت.'
                    : 'تم تنفيذ التصويت.'}
            </Text>
          </View>
        )}

        {/* CHAT */}

        <View
          style={styles.card}
        >
          <Text
            style={styles.sectionTitle}
          >
            💬 الدردشة
          </Text>

          <View
            style={styles.chatBox}
          >
            {messages.length ===
              0 ? (
              <Text
                style={styles.emptyText}
              >
                لا توجد رسائل بعد.
              </Text>
            ) : (
              messages.map(
                (message) => (
                  <View
                    key={
                      message.id
                    }
                    style={
                      styles.messageRow
                    }
                  >
                    {message.avatar_url ? (
                      <Image
                        source={{
                          uri: message.avatar_url,
                        }}
                        style={
                          styles.messageAvatar
                        }
                      />
                    ) : (
                      <View
                        style={
                          styles.messageAvatarPlaceholder
                        }
                      >
                        <Text
                          style={
                            styles.messageAvatarText
                          }
                        >
                          {(message.username ||
                            'P')
                            .charAt(
                              0,
                            )
                            .toUpperCase()}
                        </Text>
                      </View>
                    )}

                    <View
                      style={
                        styles.messageBody
                      }
                    >
                      <Text
                        style={
                          styles.messageUser
                        }
                      >
                        {message.username ||
                          'لاعب'}
                      </Text>

                      <Text
                        style={
                          styles.messageText
                        }
                      >
                        {message.message}
                      </Text>
                    </View>
                  </View>
                ),
              )
            )}
          </View>

          <View
            style={
              styles.messageInputRow
            }
          >
            <TextInput
              value={
                messageText
              }
              onChangeText={
                setMessageText
              }
              placeholder="اكتب رسالة..."
              placeholderTextColor="#777"
              style={
                styles.messageInput
              }
              multiline
              maxLength={500}
            />

            <Pressable
              style={
                styles.sendButton
              }
              disabled={
                busy ||
                !messageText.trim()
              }
              onPress={() => {
                void sendMessage();
              }}
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

        {/* REFRESH */}

        <Pressable
          style={styles.refreshButton}
          onPress={() => {
            void refresh();
          }}
          disabled={refreshing}
        >
          <Text
            style={
              styles.refreshText
            }
          >
            {refreshing
              ? 'جارٍ التحديث...'
              : 'تحديث الغرفة'}
          </Text>
        </Pressable>

        {/* LEAVE */}

        <Pressable
          style={styles.leaveButton}
          onPress={() =>
            Alert.alert(
              'مغادرة الغرفة',
              'هل أنت متأكد من مغادرة الغرفة؟',
              [
                {
                  text: 'إلغاء',
                  style: 'cancel',
                },
                {
                  text: 'مغادرة',
                  style: 'destructive',
                  onPress:
                    () => {
                      void leaveRoom();
                    },
                },
              ],
            )
          }
        >
          <Text
            style={
              styles.leaveText
            }
          >
            مغادرة الغرفة
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

/* =========================================================
   STYLES
========================================================= */

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050609',
  },

  scroll: {
    flex: 1,
  },

  content: {
    paddingTop: 48,
    paddingHorizontal: 16,
    paddingBottom: 40,
  },

  center: {
    flex: 1,
    backgroundColor: '#050609',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },

  loadingText: {
    color: '#fff',
    marginTop: 14,
    fontSize: 15,
  },

  errorTitle: {
    color: '#fff',
    fontSize: 21,
    fontWeight: '900',
    marginBottom: 10,
    textAlign: 'center',
  },

  errorText: {
    color: '#aaa',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
  },

  header: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },

  backButton: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: '#11141a',
    alignItems: 'center',
    justifyContent: 'center',
  },

  backText: {
    color: '#fff',
    fontSize: 34,
    lineHeight: 38,
  },

  headerCenter: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 10,
  },

  roomName: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '900',
  },

  roomCode: {
    color: '#777',
    fontSize: 10,
    marginTop: 4,
  },

  micButton: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: '#11141a',
    alignItems: 'center',
    justifyContent: 'center',
  },

  micButtonActive: {
    backgroundColor: '#1c3827',
  },

  micText: {
    fontSize: 20,
  },

  statusCard: {
    backgroundColor: '#11141a',
    borderWidth: 1,
    borderColor: '#282c34',
    borderRadius: 18,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },

  statusTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '900',
  },

  statusSub: {
    color: '#8b8e96',
    marginTop: 5,
    fontSize: 13,
  },

  timerBox: {
    alignItems: 'center',
  },

  timerLabel: {
    color: '#777',
    fontSize: 10,
  },

  timer: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '900',
    marginTop: 2,
  },

  roleCard: {
    backgroundColor: '#17151e',
    borderWidth: 1,
    borderColor: '#413650',
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
  },

  roleTitle: {
    color: '#e1b85b',
    fontSize: 24,
    fontWeight: '900',
    marginTop: 8,
  },

  roleStatus: {
    color: '#aaa',
    marginTop: 6,
  },

  card: {
    backgroundColor: '#0f1217',
    borderWidth: 1,
    borderColor: '#252932',
    borderRadius: 18,
    padding: 15,
    marginBottom: 12,
  },

  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },

  sectionTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '900',
  },

  count: {
    color: '#888',
    fontSize: 13,
    fontWeight: '800',
  },

  playerRow: {
    minHeight: 70,
    borderRadius: 14,
    backgroundColor: '#15181e',
    marginTop: 8,
    padding: 9,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#20242c',
  },

  playerSelected: {
    borderColor: '#d7a94b',
    backgroundColor: '#211d13',
  },

  playerDead: {
    opacity: 0.45,
  },

  avatar: {
    backgroundColor: '#252a34',
    alignItems: 'center',
    justifyContent: 'center',
  },

  avatarText: {
    color: '#fff',
    fontSize: 19,
    fontWeight: '900',
  },

  playerInfo: {
    flex: 1,
    marginLeft: 11,
  },

  playerName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },

  playerStatus: {
    color: '#777',
    fontSize: 11,
    marginTop: 4,
  },

  kickButton: {
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 9,
    backgroundColor: '#32191d',
    marginLeft: 6,
  },

  kickText: {
    color: '#ff9c9c',
    fontSize: 11,
    fontWeight: '900',
  },

  selectedText: {
    color: '#d7a94b',
    fontSize: 22,
    fontWeight: '900',
    marginLeft: 8,
  },

  waitingText: {
    color: '#999',
    marginBottom: 12,
    textAlign: 'center',
  },

  primaryButton: {
    minHeight: 50,
    borderRadius: 14,
    backgroundColor: '#d7a94b',
    alignItems: 'center',
    justifyContent: 'center',
  },

  disabledButton: {
    opacity: 0.4,
  },

  primaryButtonText: {
    color: '#080808',
    fontSize: 15,
    fontWeight: '900',
  },

  hint: {
    color: '#777',
    fontSize: 13,
    marginTop: 10,
    marginBottom: 10,
  },

  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
    marginTop: 12,
  },

  actionButton: {
    minHeight: 48,
    flex: 1,
    minWidth: '30%',
    borderRadius: 13,
    backgroundColor: '#222731',
    borderWidth: 1,
    borderColor: '#353a45',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },

  actionText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '900',
  },

  voteButton: {
    minHeight: 50,
    marginTop: 12,
    borderRadius: 13,
    backgroundColor: '#7e242d',
    alignItems: 'center',
    justifyContent: 'center',
  },

  voteText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '900',
  },

  eventCard: {
    backgroundColor: '#16191f',
    borderWidth: 1,
    borderColor: '#292e37',
    borderRadius: 16,
    padding: 15,
    marginBottom: 12,
  },

  eventTitle: {
    color: '#d7a94b',
    fontSize: 13,
    fontWeight: '900',
    marginBottom: 6,
  },

  eventText: {
    color: '#ddd',
    fontSize: 13,
    lineHeight: 20,
  },

  chatBox: {
    marginTop: 12,
    maxHeight: 320,
  },

  emptyText: {
    color: '#666',
    textAlign: 'center',
    paddingVertical: 20,
  },

  messageRow: {
    flexDirection: 'row',
    marginBottom: 10,
  },

  messageAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },

  messageAvatarPlaceholder: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#282d37',
    alignItems: 'center',
    justifyContent: 'center',
  },

  messageAvatarText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '900',
  },

  messageBody: {
    flex: 1,
    marginLeft: 9,
    backgroundColor: '#171a20',
    borderRadius: 12,
    padding: 9,
  },

  messageUser: {
    color: '#d7a94b',
    fontSize: 11,
    fontWeight: '900',
    marginBottom: 3,
  },

  messageText: {
    color: '#ddd',
    fontSize: 13,
    lineHeight: 18,
  },

  messageInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginTop: 10,
  },

  messageInput: {
    flex: 1,
    minHeight: 46,
    maxHeight: 100,
    borderRadius: 12,
    backgroundColor: '#171a20',
    borderWidth: 1,
    borderColor: '#292e37',
    color: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    textAlignVertical: 'top',
  },

  sendButton: {
    minHeight: 46,
    marginLeft: 8,
    paddingHorizontal: 15,
    borderRadius: 12,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },

  sendText: {
    color: '#000',
    fontSize: 13,
    fontWeight: '900',
  },

  refreshButton: {
    minHeight: 48,
    borderRadius: 13,
    backgroundColor: '#171a20',
    borderWidth: 1,
    borderColor: '#2b3039',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },

  refreshText: {
    color: '#ddd',
    fontSize: 13,
    fontWeight: '800',
  },

  leaveButton: {
    minHeight: 50,
    borderRadius: 13,
    backgroundColor: '#251313',
    borderWidth: 1,
    borderColor: '#472020',
    alignItems: 'center',
    justifyContent: 'center',
  },

  leaveText: {
    color: '#ff9b9b',
    fontSize: 14,
    fontWeight: '800',
  },
});
