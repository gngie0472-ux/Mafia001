import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

declare const require: any;

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

import {
  supabase,
} from '../../lib/supabase';

import {
  ensureAuth,
  getMyProfile,
} from '../../lib/profile';

import {
  getLiveKitToken,
} from '../../lib/livekit';

type Player = {
  id: string;
  user_id?: string | null;
  username?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
  is_host?: boolean;
  is_ready?: boolean;
  is_alive?: boolean;
  role?: string | null;
  joined_at?: string | null;
};

type RoomData = {
  id: string;
  code?: string | null;
  host_id?: string | null;
  status?: string | null;
  winner?: string | null;
  max_players?: number | null;
  current_round?: number | null;
  phase?: string | null;
  settings?: any;
};

type ChatMessage = {
  id: string;
  room_id?: string;
  user_id?: string;
  username?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
  message?: string | null;
  content?: string | null;
  created_at?: string;
};

type GameState = {
  room: RoomData | null;
  players: Player[];
  messages: ChatMessage[];
};

type Profile = {
  id?: string;
  user_id?: string;
  username?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
};

const ACTION_LABELS: Record<string, string> = {
  mafia: 'المافيا',
  doctor: 'الطبيب',
  detective: 'المحقق',
  vote: 'التصويت',
  kill: 'القتل',
  save: 'الإنقاذ',
  investigate: 'التحقيق',
  skip: 'تخطي',
};

const DEFAULT_AVATAR =
  'https://ui-avatars.com/api/?background=171717&color=ffffff&name=Player';

function normalizePlayer(player: any): Player {
  return {
    ...player,
    id: String(player?.id ?? player?.user_id ?? ''),
    user_id: player?.user_id ?? player?.id ?? null,
    username:
      player?.username ??
      player?.profile?.username ??
      player?.profiles?.username ??
      null,
    display_name:
      player?.display_name ??
      player?.profile?.display_name ??
      player?.profiles?.display_name ??
      player?.username ??
      null,
    avatar_url:
      player?.avatar_url ??
      player?.profile?.avatar_url ??
      player?.profiles?.avatar_url ??
      null,
    is_host: Boolean(player?.is_host),
    is_ready: Boolean(player?.is_ready),
    is_alive:
      player?.is_alive === undefined
        ? true
        : Boolean(player?.is_alive),
  };
}

function normalizeMessage(message: any): ChatMessage {
  return {
    ...message,
    id: String(message?.id ?? `${Date.now()}-${Math.random()}`),
    user_id: message?.user_id ?? message?.profile_id ?? null,
    username:
      message?.username ??
      message?.profile?.username ??
      message?.profiles?.username ??
      null,
    display_name:
      message?.display_name ??
      message?.profile?.display_name ??
      message?.profiles?.display_name ??
      message?.username ??
      null,
    avatar_url:
      message?.avatar_url ??
      message?.profile?.avatar_url ??
      message?.profiles?.avatar_url ??
      null,
    message: message?.message ?? message?.content ?? '',
    content: message?.content ?? message?.message ?? '',
    created_at: message?.created_at ?? new Date().toISOString(),
  };
}

export default function RoomScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string | string[] }>();

  const roomId = useMemo(() => {
    const value = Array.isArray(params.code)
      ? params.code[0]
      : params.code;

    return value ? String(value) : '';
  }, [params.code]);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [gameState, setGameState] = useState<GameState>({
    room: null,
    players: [],
    messages: [],
  });
  const [profile, setProfile] = useState<Profile | null>(null);
  const [messageText, setMessageText] = useState('');
  const [selectedAction, setSelectedAction] = useState<string | null>(null);
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [voiceConnected, setVoiceConnected] = useState(false);
  const [microphoneEnabled, setMicrophoneEnabled] = useState(false);
  const [voiceLoading, setVoiceLoading] = useState(false);

  const isMountedRef = useRef(false);
  const isUnmountingRef = useRef(false);

  const voiceRoomRef = useRef<any>(null);
  const liveKitModuleRef = useRef<any>(null);
  const voiceShouldBeConnectedRef = useRef(false);
  const audioSessionStartedRef = useRef(false);

  const channelRef = useRef<any>(null);
  const roomRefreshInProgressRef = useRef(false);
  const messagesRefreshInProgressRef = useRef(false);

  const currentUserId = useMemo(() => {
    return (
      profile?.id ??
      profile?.user_id ??
      ''
    );
  }, [profile]);

  const room = gameState.room;

  const players = useMemo(() => {
    return gameState.players ?? [];
  }, [gameState.players]);

  const messages = useMemo(() => {
    return gameState.messages ?? [];
  }, [gameState.messages]);

  const currentPlayer = useMemo(() => {
    return players.find((player) => {
      return (
        player.user_id === currentUserId ||
        player.id === currentUserId
      );
    }) ?? null;
  }, [players, currentUserId]);

  const isHost = useMemo(() => {
    if (!room || !currentUserId) {
      return false;
    }

    return (
      room.host_id === currentUserId ||
      currentPlayer?.is_host === true
    );
  }, [room, currentUserId, currentPlayer]);

  const isAlive = currentPlayer?.is_alive !== false;

  const canUseVoice = Boolean(
    room &&
    room.status !== 'finished' &&
    isAlive
  );

  const refreshRoom = useCallback(async () => {
    if (!roomId || roomRefreshInProgressRef.current) {
      return;
    }

    roomRefreshInProgressRef.current = true;

    try {
      const { data, error } = await supabase
        .from('rooms')
        .select('*')
        .eq('id', roomId)
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (!data) {
        if (isMountedRef.current) {
          Alert.alert(
            'الغرفة غير موجودة',
            'تعذر العثور على هذه الغرفة.',
            [
              {
                text: 'رجوع',
                onPress: () => router.back(),
              },
            ],
          );
        }

        return;
      }

      if (!isMountedRef.current) {
        return;
      }

      setGameState((previous) => ({
        ...previous,
        room: data as RoomData,
      }));
    } catch (error) {
      console.error('refreshRoom error:', error);
    } finally {
      roomRefreshInProgressRef.current = false;
    }
  }, [roomId, router]);

  const refreshPlayers = useCallback(async () => {
    if (!roomId) {
      return;
    }

    try {
      const { data, error } = await supabase
        .from('room_players')
        .select('*')
        .eq('room_id', roomId)
        .order('joined_at', { ascending: true });

      if (error) {
        throw error;
      }

      if (!isMountedRef.current) {
        return;
      }

      setGameState((previous) => ({
        ...previous,
        players: (data ?? []).map(normalizePlayer),
      }));
    } catch (error) {
      console.error('refreshPlayers error:', error);
    }
  }, [roomId]);

  const refreshMessages = useCallback(async () => {
    if (!roomId || messagesRefreshInProgressRef.current) {
      return;
    }

    messagesRefreshInProgressRef.current = true;

    try {
      const { data, error } = await supabase
        .from('room_messages')
        .select('*')
        .eq('room_id', roomId)
        .order('created_at', { ascending: true });

      if (error) {
        throw error;
      }

      if (!isMountedRef.current) {
        return;
      }

      setGameState((previous) => ({
        ...previous,
        messages: (data ?? []).map(normalizeMessage),
      }));
    } catch (error) {
      console.error('refreshMessages error:', error);
    } finally {
      messagesRefreshInProgressRef.current = false;
    }
  }, [roomId]);

  const disconnectVoice = useCallback(async () => {
    voiceShouldBeConnectedRef.current = false;

    const voiceRoom = voiceRoomRef.current;

    voiceRoomRef.current = null;

    try {
      if (voiceRoom) {
        await voiceRoom.disconnect();
      }
    } catch (error) {
      console.warn('LiveKit disconnect error:', error);
    }

    if (
      audioSessionStartedRef.current &&
      liveKitModuleRef.current?.AudioSession
    ) {
      try {
        await liveKitModuleRef.current.AudioSession.stopAudioSession();
      } catch (error) {
        console.warn('AudioSession stop error:', error);
      }
    }

    audioSessionStartedRef.current = false;

    if (isMountedRef.current) {
      setVoiceConnected(false);
      setMicrophoneEnabled(false);
      setVoiceLoading(false);
    }
  }, []);

  const connectVoice = useCallback(async () => {
    if (
      !roomId ||
      !isMountedRef.current ||
      voiceLoading ||
      voiceRoomRef.current
    ) {
      return;
    }

    voiceShouldBeConnectedRef.current = true;
    setVoiceLoading(true);

    try {
      /*
       * IMPORTANT:
       * LiveKit is intentionally loaded only after the user explicitly
       * requests microphone/voice.
       *
       * This prevents the native WebRTC module from being initialized
       * merely by entering the room screen.
       */
      const liveKit = require('@livekit/react-native');

      liveKitModuleRef.current = liveKit;

      const {
        AudioSession,
        registerGlobals,
        Room,
        RoomEvent,
      } = liveKit;

      try {
        registerGlobals();
      } catch (error) {
        console.warn(
          'LiveKit registerGlobals warning:',
          error,
        );
      }

      if (!voiceShouldBeConnectedRef.current || !isMountedRef.current) {
        setVoiceLoading(false);
        return;
      }

      if (!audioSessionStartedRef.current) {
        await AudioSession.startAudioSession();
        audioSessionStartedRef.current = true;
      }

      if (!voiceShouldBeConnectedRef.current || !isMountedRef.current) {
        await AudioSession.stopAudioSession().catch(() => {});
        audioSessionStartedRef.current = false;
        setVoiceLoading(false);
        return;
      }

      const tokenResponse = await getLiveKitToken(roomId);

      if (!tokenResponse?.token || !tokenResponse?.server_url) {
        throw new Error('LiveKit token response is invalid');
      }

      const liveKitRoom = new Room();

      voiceRoomRef.current = liveKitRoom;

      liveKitRoom.on(
        RoomEvent.Disconnected,
        () => {
          if (!isMountedRef.current) {
            return;
          }

          voiceRoomRef.current = null;
          setVoiceConnected(false);
          setMicrophoneEnabled(false);
        },
      );

      liveKitRoom.on(
        RoomEvent.LocalTrackPublished,
        () => {
          if (!isMountedRef.current) {
            return;
          }

          setMicrophoneEnabled(true);
        },
      );

      await liveKitRoom.connect(
        tokenResponse.server_url,
        tokenResponse.token,
      );

      if (!voiceShouldBeConnectedRef.current || !isMountedRef.current) {
        try {
          await liveKitRoom.disconnect();
        } catch {}

        voiceRoomRef.current = null;

        if (audioSessionStartedRef.current) {
          try {
            await AudioSession.stopAudioSession();
          } catch {}

          audioSessionStartedRef.current = false;
        }

        setVoiceLoading(false);
        return;
      }

      await liveKitRoom.localParticipant.setMicrophoneEnabled(true);

      if (!isMountedRef.current) {
        return;
      }

      setVoiceConnected(true);
      setMicrophoneEnabled(true);
    } catch (error: any) {
      console.error('connectVoice error:', error);

      const roomToClose = voiceRoomRef.current;
      voiceRoomRef.current = null;

      try {
        if (roomToClose) {
          await roomToClose.disconnect();
        }
      } catch {}

      if (
        audioSessionStartedRef.current &&
        liveKitModuleRef.current?.AudioSession
      ) {
        try {
          await liveKitModuleRef.current.AudioSession.stopAudioSession();
        } catch {}
      }

      audioSessionStartedRef.current = false;

      if (isMountedRef.current) {
        setVoiceConnected(false);
        setMicrophoneEnabled(false);

        const message =
          error?.message ||
          'تعذر تشغيل الميكروفون حالياً.';

        Alert.alert(
          'الميكروفون',
          message,
        );
      }
    } finally {
      if (isMountedRef.current) {
        setVoiceLoading(false);
      }
    }
  }, [roomId, voiceLoading]);

  const toggleMicrophone = useCallback(async () => {
    if (voiceLoading) {
      return;
    }

    if (!voiceRoomRef.current) {
      await connectVoice();
      return;
    }

    try {
      setVoiceLoading(true);

      const enabled =
        voiceRoomRef.current.localParticipant
          ?.isMicrophoneEnabled === true;

      await voiceRoomRef.current.localParticipant
        .setMicrophoneEnabled(!enabled);

      if (isMountedRef.current) {
        setMicrophoneEnabled(!enabled);
      }
    } catch (error) {
      console.error(
        'toggleMicrophone error:',
        error,
      );

      Alert.alert(
        'الميكروفون',
        'تعذر تغيير حالة الميكروفون.',
      );
    } finally {
      if (isMountedRef.current) {
        setVoiceLoading(false);
      }
    }
  }, [connectVoice, voiceLoading]);

  useEffect(() => {
    isMountedRef.current = true;
    isUnmountingRef.current = false;

    return () => {
      isMountedRef.current = false;
      isUnmountingRef.current = true;
      voiceShouldBeConnectedRef.current = false;

      const voiceRoom = voiceRoomRef.current;
      voiceRoomRef.current = null;

      if (voiceRoom) {
        void voiceRoom.disconnect().catch(() => {});
      }

      if (
        audioSessionStartedRef.current &&
        liveKitModuleRef.current?.AudioSession
      ) {
        void liveKitModuleRef.current.AudioSession
          .stopAudioSession()
          .catch(() => {});
      }

      audioSessionStartedRef.current = false;
      channelRef.current = null;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadInitialData() {
      if (!roomId) {
        if (isMountedRef.current) {
          setLoading(false);

          Alert.alert(
            'خطأ',
            'معرف الغرفة غير موجود.',
            [
              {
                text: 'رجوع',
                onPress: () => router.back(),
              },
            ],
          );
        }

        return;
      }

      try {
        const session = await ensureAuth();

        if (!session?.user) {
          throw new Error('لم يتم تسجيل الدخول');
        }

        const myProfile = await getMyProfile();

        if (cancelled || !isMountedRef.current) {
          return;
        }

        setProfile(
          (myProfile ?? {
            id: session.user.id,
            user_id: session.user.id,
          }) as Profile,
        );

        await Promise.all([
          refreshRoom(),
          refreshPlayers(),
          refreshMessages(),
        ]);
      } catch (error: any) {
        console.error(
          'loadInitialData error:',
          error,
        );

        if (!cancelled && isMountedRef.current) {
          Alert.alert(
            'خطأ',
            error?.message ||
              'تعذر تحميل الغرفة.',
            [
              {
                text: 'رجوع',
                onPress: () => router.back(),
              },
            ],
          );
        }
      } finally {
        if (!cancelled && isMountedRef.current) {
          setLoading(false);
        }
      }
    }

    void loadInitialData();

    return () => {
      cancelled = true;
    };
  }, [
    roomId,
    router,
    refreshRoom,
    refreshPlayers,
    refreshMessages,
  ]);

  useEffect(() => {
    if (!roomId) {
      return;
    }

    const channelName =
      `room-screen-${roomId}-${Date.now()}`;

    const channel = supabase.channel(channelName);

    channelRef.current = channel;

    channel
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'rooms',
          filter: `id=eq.${roomId}`,
        },
        () => {
          void refreshRoom();
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
          void refreshPlayers();
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'room_messages',
          filter: `room_id=eq.${roomId}`,
        },
        () => {
          void refreshMessages();
        },
      )
      .subscribe((status) => {
        console.log(
          'Room realtime status:',
          status,
        );
      });

    return () => {
      if (channelRef.current === channel) {
        channelRef.current = null;
      }

      void supabase.removeChannel(channel);
    };
  }, [
    roomId,
    refreshRoom,
    refreshPlayers,
    refreshMessages,
  ]);

  /*
   * IMPORTANT:
   * Never connect to LiveKit automatically when entering the room.
   * The native WebRTC module is loaded only after an explicit
   * microphone tap.
   */
  useEffect(() => {
    if (!roomId || !gameState?.room) {
      return;
    }

    if (!canUseVoice && voiceRoomRef.current) {
      voiceShouldBeConnectedRef.current = false;
      void disconnectVoice();
    }
  }, [
    roomId,
    gameState?.room?.status,
    room?.winner,
    canUseVoice,
    disconnectVoice,
  ]);

  useEffect(() => {
    if (!room) {
      setRemainingSeconds(null);
      return;
    }

    const settings = room.settings ?? {};

    const duration =
      Number(
        settings?.round_duration ??
        settings?.phase_duration ??
        settings?.duration ??
        0,
      );

    if (!duration || duration <= 0) {
      setRemainingSeconds(null);
      return;
    }

    const startedAt =
      settings?.phase_started_at ??
      settings?.started_at ??
      null;

    if (!startedAt) {
      setRemainingSeconds(duration);
      return;
    }

    const updateTimer = () => {
      const start = new Date(
        startedAt,
      ).getTime();

      if (!Number.isFinite(start)) {
        setRemainingSeconds(null);
        return;
      }

      const elapsed = Math.floor(
        (Date.now() - start) / 1000,
      );

      const remaining = Math.max(
        0,
        duration - elapsed,
      );

      if (isMountedRef.current) {
        setRemainingSeconds(remaining);
      }
    };

    updateTimer();

    const timer = setInterval(
      updateTimer,
      1000,
    );

    return () => {
      clearInterval(timer);
    };
  }, [
    room?.id,
    room?.status,
    room?.current_round,
    room?.phase,
    room?.settings,
  ]);

  const sendMessage = useCallback(async () => {
    const text = messageText.trim();

    if (!text || !roomId || !currentUserId || busy) {
      return;
    }

    setBusy(true);

    try {
      const { error } = await supabase
        .from('room_messages')
        .insert({
          room_id: roomId,
          user_id: currentUserId,
          message: text,
          content: text,
        });

      if (error) {
        throw error;
      }

      if (isMountedRef.current) {
        setMessageText('');
      }

      await refreshMessages();
    } catch (error: any) {
      console.error(
        'sendMessage error:',
        error,
      );

      Alert.alert(
        'الدردشة',
        error?.message ||
          'تعذر إرسال الرسالة.',
      );
    } finally {
      if (isMountedRef.current) {
        setBusy(false);
      }
    }
  }, [
    messageText,
    roomId,
    currentUserId,
    busy,
    refreshMessages,
  ]);

  const leaveRoom = useCallback(async () => {
    if (!roomId || !currentUserId || busy) {
      return;
    }

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
          onPress: async () => {
            setBusy(true);

            try {
              await disconnectVoice();

              const { error } = await supabase
                .from('room_players')
                .delete()
                .eq('room_id', roomId)
                .eq('user_id', currentUserId);

              if (error) {
                throw error;
              }

              if (isMountedRef.current) {
                router.back();
              }
            } catch (error: any) {
              console.error(
                'leaveRoom error:',
                error,
              );

              Alert.alert(
                'خطأ',
                error?.message ||
                  'تعذر مغادرة الغرفة.',
              );
            } finally {
              if (isMountedRef.current) {
                setBusy(false);
              }
            }
          },
        },
      ],
    );
  }, [
    roomId,
    currentUserId,
    busy,
    disconnectVoice,
    router,
  ]);

  const kickPlayer = useCallback(
    async (player: Player) => {
      if (
        !roomId ||
        !currentUserId ||
        !isHost ||
        busy ||
        player.user_id === currentUserId
      ) {
        return;
      }

      const targetId =
        player.user_id ?? player.id;

      if (!targetId) {
        return;
      }

      Alert.alert(
        'طرد اللاعب',
        `هل تريد طرد ${player.display_name || player.username || 'هذا اللاعب'}؟`,
        [
          {
            text: 'إلغاء',
            style: 'cancel',
          },
          {
            text: 'طرد',
            style: 'destructive',
            onPress: async () => {
              setBusy(true);

              try {
                const { error } =
                  await supabase
                    .from('room_players')
                    .delete()
                    .eq('room_id', roomId)
                    .eq('user_id', targetId);

                if (error) {
                  throw error;
                }

                await refreshPlayers();
              } catch (error: any) {
                console.error(
                  'kickPlayer error:',
                  error,
                );

                Alert.alert(
                  'خطأ',
                  error?.message ||
                    'تعذر طرد اللاعب.',
                );
              } finally {
                if (isMountedRef.current) {
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
      currentUserId,
      isHost,
      busy,
      refreshPlayers,
    ],
  );

  const toggleReady = useCallback(async () => {
    if (
      !roomId ||
      !currentUserId ||
      !currentPlayer ||
      busy
    ) {
      return;
    }

    setBusy(true);

    try {
      const nextReady =
        !Boolean(currentPlayer.is_ready);

      const { error } = await supabase
        .from('room_players')
        .update({
          is_ready: nextReady,
        })
        .eq('room_id', roomId)
        .eq('user_id', currentUserId);

      if (error) {
        throw error;
      }

      await refreshPlayers();
    } catch (error: any) {
      console.error(
        'toggleReady error:',
        error,
      );

      Alert.alert(
        'جاهزية',
        error?.message ||
          'تعذر تغيير حالة الجاهزية.',
      );
    } finally {
      if (isMountedRef.current) {
        setBusy(false);
      }
    }
  }, [
    roomId,
    currentUserId,
    currentPlayer,
    busy,
    refreshPlayers,
  ]);

  const startGame = useCallback(async () => {
    if (
      !roomId ||
      !currentUserId ||
      !isHost ||
      busy
    ) {
      return;
    }

    if (players.length < 4) {
      Alert.alert(
        'لا يمكن البدء',
        'يجب أن يكون هناك 4 لاعبين على الأقل.',
      );
      return;
    }

    setBusy(true);

    try {
      const { error } = await supabase
        .from('rooms')
        .update({
          status: 'playing',
          current_round: 1,
          phase: 'night',
          settings: {
            ...(room?.settings ?? {}),
            started_at:
              new Date().toISOString(),
            phase_started_at:
              new Date().toISOString(),
          },
        })
        .eq('id', roomId);

      if (error) {
        throw error;
      }

      await refreshRoom();
    } catch (error: any) {
      console.error(
        'startGame error:',
        error,
      );

      Alert.alert(
        'خطأ',
        error?.message ||
          'تعذر بدء اللعبة.',
      );
    } finally {
      if (isMountedRef.current) {
        setBusy(false);
      }
    }
  }, [
    roomId,
    currentUserId,
    isHost,
    busy,
    players.length,
    room?.settings,
    refreshRoom,
  ]);

  const selectTarget = useCallback(
    (playerId: string) => {
      if (!playerId) {
        return;
      }

      setSelectedTarget((previous) =>
        previous === playerId
          ? null
          : playerId,
      );
    },
    [],
  );

  const selectAction = useCallback(
    (action: string) => {
      setSelectedAction((previous) =>
        previous === action
          ? null
          : action,
      );
    },
    [],
  );

  const performAction = useCallback(async () => {
    if (
      !roomId ||
      !currentUserId ||
      !selectedAction ||
      !selectedTarget ||
      busy
    ) {
      return;
    }

    setBusy(true);

    try {
      const payload = {
        room_id: roomId,
        actor_id: currentUserId,
        action: selectedAction,
        target_id: selectedTarget,
      };

      const { error } = await supabase
        .from('game_actions')
        .insert(payload);

      if (error) {
        throw error;
      }

      setSelectedAction(null);
      setSelectedTarget(null);
    } catch (error: any) {
      console.error(
        'performAction error:',
        error,
      );

      Alert.alert(
        'الحركة',
        error?.message ||
          'تعذر تنفيذ الحركة.',
      );
    } finally {
      if (isMountedRef.current) {
        setBusy(false);
      }
    }
  }, [
    roomId,
    currentUserId,
    selectedAction,
    selectedTarget,
    busy,
  ]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator
          size="large"
        />
        <Text style={styles.loadingText}>
          جارٍ تحميل الغرفة...
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable
          style={styles.backButton}
          onPress={() => {
            void disconnectVoice();
            router.back();
          }}
        >
          <Text style={styles.backButtonText}>
            ‹
          </Text>
        </Pressable>

        <View style={styles.headerCenter}>
          <Text style={styles.title}>
            غرفة المافيا
          </Text>

          <Text style={styles.roomCode}>
            {room?.code || roomId}
          </Text>
        </View>

        <Pressable
          style={[
            styles.voiceButton,
            voiceConnected &&
              styles.voiceButtonActive,
          ]}
          onPress={() => {
            void toggleMicrophone();
          }}
          disabled={voiceLoading}
        >
          {voiceLoading ? (
            <ActivityIndicator
              size="small"
            />
          ) : (
            <Text style={styles.voiceButtonText}>
              {voiceConnected
                ? microphoneEnabled
                  ? '🎙️'
                  : '🔇'
                : '🎤'}
            </Text>
          )}
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={
          styles.scrollContent
        }
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.statusCard}>
          <Text style={styles.statusTitle}>
            حالة الغرفة
          </Text>

          <Text style={styles.statusValue}>
            {room?.status === 'playing'
              ? 'اللعبة بدأت'
              : room?.status === 'finished'
                ? 'انتهت اللعبة'
                : 'انتظار اللاعبين'}
          </Text>

          {remainingSeconds !== null && (
            <Text style={styles.timerText}>
              {remainingSeconds}s
            </Text>
          )}
        </View>

        <View style={styles.playersCard}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              اللاعبين
            </Text>

            <Text style={styles.playerCount}>
              {players.length}/
              {room?.max_players ?? 12}
            </Text>
          </View>

          {players.map((player) => {
            const playerId =
              player.user_id ?? player.id;

            const isCurrent =
              playerId === currentUserId;

            const selected =
              selectedTarget === playerId;

            return (
              <Pressable
                key={player.id}
                style={[
                  styles.playerRow,
                  selected &&
                    styles.playerRowSelected,
                ]}
                onPress={() => {
                  if (
                    room?.status ===
                      'playing' &&
                    isAlive &&
                    !isCurrent
                  ) {
                    selectTarget(playerId);
                  }
                }}
              >
                <Image
                  source={{
                    uri:
                      player.avatar_url ||
                      DEFAULT_AVATAR,
                  }}
                  style={styles.avatar}
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
                    {player.display_name ||
                      player.username ||
                      'لاعب'}
                    {isCurrent
                      ? ' (أنت)'
                      : ''}
                  </Text>

                  <Text
                    style={
                      styles.playerStatus
                    }
                  >
                    {player.is_alive === false
                      ? '💀 ميت'
                      : player.is_ready
                        ? '✓ جاهز'
                        : 'غير جاهز'}
                  </Text>
                </View>

                {player.is_host && (
                  <Text
                    style={
                      styles.hostBadge
                    }
                  >
                    👑
                  </Text>
                )}

                {isHost && !isCurrent && (
                  <Pressable
                    style={
                      styles.kickButton
                    }
                    onPress={(event) => {
                      event.stopPropagation();
                      void kickPlayer(
                        player,
                      );
                    }}
                  >
                    <Text
                      style={
                        styles.kickButtonText
                      }
                    >
                      طرد
                    </Text>
                  </Pressable>
                )}
              </Pressable>
            );
          })}
        </View>

        {room?.status !== 'playing' && (
          <View style={styles.readyCard}>
            <Pressable
              style={[
                styles.readyButton,
                currentPlayer?.is_ready &&
                  styles.readyButtonActive,
              ]}
              onPress={() => {
                void toggleReady();
              }}
              disabled={busy}
            >
              <Text
                style={
                  styles.readyButtonText
                }
              >
                {currentPlayer?.is_ready
                  ? 'إلغاء الجاهزية'
                  : 'أنا جاهز'}
              </Text>
            </Pressable>

            {isHost && (
              <Pressable
                style={styles.startButton}
                onPress={() => {
                  void startGame();
                }}
                disabled={busy}
              >
                {busy ? (
                  <ActivityIndicator />
                ) : (
                  <Text
                    style={
                      styles.startButtonText
                    }
                  >
                    بدء اللعبة
                  </Text>
                )}
              </Pressable>
            )}
          </View>
        )}

        {room?.status === 'playing' &&
          isAlive && (
            <View style={styles.actionsCard}>
              <Text
                style={
                  styles.sectionTitle
                }
              >
                الإجراءات
              </Text>

              <View
                style={
                  styles.actionsGrid
                }
              >
                {Object.entries(
                  ACTION_LABELS,
                ).map(
                  ([action, label]) => (
                    <Pressable
                      key={action}
                      style={[
                        styles.actionButton,
                        selectedAction ===
                          action &&
                          styles.actionButtonSelected,
                      ]}
                      onPress={() =>
                        selectAction(
                          action,
                        )
                      }
                    >
                      <Text
                        style={
                          styles.actionButtonText
                        }
                      >
                        {label}
                      </Text>
                    </Pressable>
                  ),
                )}
              </View>

              {selectedAction &&
                selectedTarget && (
                  <Pressable
                    style={
                      styles.confirmActionButton
                    }
                    onPress={() => {
                      void performAction();
                    }}
                    disabled={busy}
                  >
                    <Text
                      style={
                        styles.confirmActionText
                      }
                    >
                      تنفيذ
                    </Text>
                  </Pressable>
                )}
            </View>
          )}

        <View style={styles.chatCard}>
          <Text style={styles.sectionTitle}>
            الدردشة
          </Text>

          <View style={styles.messagesBox}>
            {messages.length === 0 ? (
              <Text
                style={
                  styles.emptyMessages
                }
              >
                لا توجد رسائل بعد.
              </Text>
            ) : (
              messages.map((message) => (
                <View
                  key={message.id}
                  style={styles.messageRow}
                >
                  <Image
                    source={{
                      uri:
                        message.avatar_url ||
                        DEFAULT_AVATAR,
                    }}
                    style={
                      styles.messageAvatar
                    }
                  />

                  <View
                    style={
                      styles.messageContent
                    }
                  >
                    <Text
                      style={
                        styles.messageAuthor
                      }
                    >
                      {message.display_name ||
                        message.username ||
                        'لاعب'}
                    </Text>

                    <Text
                      style={
                        styles.messageText
                      }
                    >
                      {message.message ||
                        message.content ||
                        ''}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </View>

          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={messageText}
              onChangeText={
                setMessageText
              }
              placeholder="اكتب رسالة..."
              placeholderTextColor="#777"
              multiline
              maxLength={500}
              onSubmitEditing={() => {
                void sendMessage();
              }}
            />

            <Pressable
              style={styles.sendButton}
              onPress={() => {
                void sendMessage();
              }}
              disabled={
                busy ||
                !messageText.trim()
              }
            >
              <Text
                style={
                  styles.sendButtonText
                }
              >
                إرسال
              </Text>
            </Pressable>
          </View>
        </View>

        <Pressable
          style={styles.leaveButton}
          onPress={() => {
            void leaveRoom();
          }}
          disabled={busy}
        >
          <Text
            style={styles.leaveButtonText}
          >
            مغادرة الغرفة
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#090909',
  },

  loadingContainer: {
    flex: 1,
    backgroundColor: '#090909',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },

  loadingText: {
    color: '#fff',
    marginTop: 12,
    fontSize: 16,
  },

  header: {
    minHeight: 72,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#222',
    backgroundColor: '#111',
  },

  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1b1b1b',
  },

  backButtonText: {
    color: '#fff',
    fontSize: 34,
    lineHeight: 38,
    marginTop: -3,
  },

  headerCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  title: {
    color: '#fff',
    fontSize: 19,
    fontWeight: '800',
  },

  roomCode: {
    color: '#999',
    fontSize: 12,
    marginTop: 2,
  },

  voiceButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1b1b1b',
    alignItems: 'center',
    justifyContent: 'center',
  },

  voiceButtonActive: {
    backgroundColor: '#252525',
  },

  voiceButtonText: {
    fontSize: 20,
  },

  scroll: {
    flex: 1,
  },

  scrollContent: {
    padding: 14,
    paddingBottom: 40,
  },

  statusCard: {
    backgroundColor: '#141414',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#252525',
  },

  statusTitle: {
    color: '#888',
    fontSize: 13,
    marginBottom: 6,
  },

  statusValue: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
  },

  timerText: {
    color: '#ddd',
    fontSize: 22,
    fontWeight: '800',
    marginTop: 8,
  },

  playersCard: {
    backgroundColor: '#141414',
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#252525',
  },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },

  sectionTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '800',
  },

  playerCount: {
    color: '#888',
    fontSize: 13,
  },

  playerRow: {
    minHeight: 64,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#101010',
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },

  playerRowSelected: {
    borderWidth: 1,
    borderColor: '#fff',
    backgroundColor: '#1c1c1c',
  },

  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#222',
  },

  playerInfo: {
    flex: 1,
    marginLeft: 10,
  },

  playerName: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },

  playerStatus: {
    color: '#888',
    fontSize: 12,
    marginTop: 3,
  },

  hostBadge: {
    fontSize: 19,
    marginHorizontal: 7,
  },

  kickButton: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#2a1717',
  },

  kickButtonText: {
    color: '#ff8f8f',
    fontSize: 12,
    fontWeight: '700',
  },

  readyCard: {
    backgroundColor: '#141414',
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#252525',
  },

  readyButton: {
    minHeight: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#252525',
    marginBottom: 10,
  },

  readyButtonActive: {
    backgroundColor: '#343434',
  },

  readyButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },

  startButton: {
    minHeight: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },

  startButtonText: {
    color: '#000',
    fontSize: 15,
    fontWeight: '900',
  },

  actionsCard: {
    backgroundColor: '#141414',
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#252525',
  },

  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 10,
    marginHorizontal: -4,
  },

  actionButton: {
    minWidth: '30%',
    margin: 4,
    minHeight: 42,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: '#202020',
    alignItems: 'center',
    justifyContent: 'center',
  },

  actionButtonSelected: {
    backgroundColor: '#fff',
  },

  actionButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },

  confirmActionButton: {
    marginTop: 10,
    minHeight: 46,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },

  confirmActionText: {
    color: '#000',
    fontSize: 15,
    fontWeight: '900',
  },

  chatCard: {
    backgroundColor: '#141414',
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#252525',
  },

  messagesBox: {
    marginTop: 10,
    minHeight: 120,
    maxHeight: 340,
  },

  emptyMessages: {
    color: '#777',
    textAlign: 'center',
    paddingVertical: 30,
  },

  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
  },

  messageAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#222',
  },

  messageContent: {
    flex: 1,
    marginLeft: 8,
    paddingVertical: 2,
  },

  messageAuthor: {
    color: '#aaa',
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 2,
  },

  messageText: {
    color: '#eee',
    fontSize: 14,
    lineHeight: 20,
  },

  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginTop: 10,
  },

  input: {
    flex: 1,
    minHeight: 46,
    maxHeight: 100,
    backgroundColor: '#0f0f0f',
    borderWidth: 1,
    borderColor: '#292929',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    color: '#fff',
    fontSize: 14,
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

  sendButtonText: {
    color: '#000',
    fontSize: 13,
    fontWeight: '900',
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

  leaveButtonText: {
    color: '#ff9b9b',
    fontSize: 14,
    fontWeight: '800',
  },
});     
