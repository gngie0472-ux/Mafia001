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

import {
  AudioSession,
  registerGlobals,
  Room,
  RoomEvent,
} from '@livekit/react-native';

import { supabase } from '../../lib/supabase';

// LiveKit globals must be registered before any Room/RTC APIs are used.
try {
  registerGlobals();
} catch (error) {
  console.error('LiveKit registerGlobals error:', error);
}

import {
  getLiveKitToken,
} from '../../lib/livekit';

import {
  advanceMafiaPhase,
  GamePlayer,
  GameState,
  getGameState,
  getMyRole,
  GameRole,
  NightAction,
  submitDayVote,
  submitNightAction,
} from '../../lib/game';

import {
  heartbeatRoom,
  kickRoomPlayer,
  leaveRoom,
} from '../../lib/rooms';

type Message = {
  id: string;
  room_id: string;
  user_id: string;
  message: string;
  created_at: string;
};

type ProfileMap = Record<
  string,
  {
    username: string;
    avatar_url: string | null;
  }
>;

type ExtendedGameRoom = GameState['room'] & {
  host_id?: string;
};

const ROLE_LABELS: Record<GameRole, string> = {
  MAFIA: 'المافيا',
  GODFATHER: 'العرّاب',
  CONSIGLIERE: 'المستشار',
  FRAMER: 'المزوّر',
  SILENCER: 'الكاتم',
  DOCTOR: 'الطبيب',
  DETECTIVE: 'المحقق',
  SHERIFF: 'الشريف',
  BODYGUARD: 'الحارس الشخصي',
  MEDIUM: 'الوسيط',
  VIGILANTE: 'المنتقم',
  MAYOR: 'العمدة',
  TRACKER: 'المتعقّب',
  LOOKOUT: 'المراقب',
  SPY: 'الجاسوس',
  WITCH: 'الساحرة',
  GHOUL: 'الغول',
  CULT_LEADER: 'زعيم الطائفة',
  CULTIST: 'عضو الطائفة',
  JESTER: 'المهرج',
  SERIAL_KILLER: 'القاتل المتسلسل',
  SURVIVOR: 'الناجي',
  CITIZEN: 'المواطن',
};

const ROLE_DESCRIPTIONS: Record<GameRole, string> = {
  MAFIA:
    'اقتل لاعبًا ليلًا وساعد المافيا على السيطرة على المدينة.',
  GODFATHER:
    'أنت قائد المافيا. نفّذ عملية قتل ليلية وساعد المافيا على الفوز.',
  CONSIGLIERE:
    'أنت مستشار المافيا. لديك قدرة خاصة للتحقيق ضمن نظام اللعبة.',
  FRAMER:
    'أنت المزوّر. لديك قدرة خاصة ضمن فريق المافيا.',
  SILENCER:
    'أنت الكاتم. لديك قدرة خاصة ضمن فريق المافيا.',
  DOCTOR:
    'احمِ لاعبًا واحدًا كل ليلة من القتل.',
  DETECTIVE:
    'تحقق من لاعب واحد كل ليلة لمعرفة هل هو من المافيا.',
  SHERIFF:
    'استخدم قدرة الشريف لفحص لاعب خلال الليل.',
  BODYGUARD:
    'استخدم قدرة الحارس الشخصي لحماية لاعب خلال الليل.',
  MEDIUM:
    'أنت الوسيط. تابع الأحداث واستخدم قدراتك عندما يتم دعمها في اللعبة.',
  VIGILANTE:
    'أنت المنتقم. تابع المدينة واستعد لاستخدام قدرتك الخاصة.',
  MAYOR:
    'أنت العمدة. تأثيرك يعتمد على ميكانيكيات التصويت الخاصة باللعبة.',
  TRACKER:
    'أنت المتعقّب. لديك قدرة خاصة ضمن نظام اللعبة.',
  LOOKOUT:
    'أنت المراقب. لديك قدرة خاصة ضمن نظام اللعبة.',
  SPY:
    'استخدم قدرة الجاسوس على لاعب حي خلال الليل.',
  WITCH:
    'لديك قدرتان ليليتان: الإنقاذ والقتل.',
  GHOUL:
    'استخدم قدرة الغول على لاعب حي خلال الليل.',
  CULT_LEADER:
    'استخدم قدرة زعيم الطائفة لتحويل لاعب إلى الطائفة.',
  CULTIST:
    'أنت عضو في الطائفة وساعد الطائفة على تحقيق هدفها.',
  JESTER:
    'هدفك الخاص هو تحقيق شرط المهرج في نظام اللعبة.',
  SERIAL_KILLER:
    'أنت مستقل. هدفك النهائي هو البقاء وتحقيق شرط القاتل المتسلسل.',
  SURVIVOR:
    'هدفك الأساسي هو البقاء حتى نهاية اللعبة.',
  CITIZEN:
    'راقب اللاعبين وتحدث وصوّت لاكتشاف المافيا.',
};

const ROLE_ACTIONS: Partial<Record<GameRole, NightAction[]>> = {
  MAFIA: ['kill'],
  GODFATHER: ['kill'],
  DOCTOR: ['protect'],
  DETECTIVE: ['investigate'],
  SPY: ['spy'],
  BODYGUARD: ['guard'],
  SHERIFF: ['sheriff_check'],
  WITCH: ['witch_save', 'witch_kill'],
  GHOUL: ['ghoul'],
  CULT_LEADER: ['cult_convert'],
};

const ACTION_INFO: Record<
  NightAction,
  {
    title: string;
    description: string;
    button: string;
    danger?: boolean;
  }
> = {
  kill: {
    title: '🔪 مهمة المافيا',
    description: 'اختر لاعبًا حيًا واحدًا للقضاء عليه.',
    button: 'تنفيذ القتل',
    danger: true,
  },
  protect: {
    title: '🩺 مهمة الطبيب',
    description: 'اختر لاعبًا واحدًا لحمايته هذه الليلة.',
    button: 'حماية اللاعب',
  },
  investigate: {
    title: '🔎 مهمة المحقق',
    description: 'يمكنك التحقيق مع شخص واحد فقط كل ليلة.',
    button: 'التحقيق',
  },
  spy: {
    title: '🕵️ مهمة الجاسوس',
    description: 'اختر لاعبًا حيًا لتنفيذ قدرة الجاسوس عليه.',
    button: 'تنفيذ قدرة الجاسوس',
  },
  guard: {
    title: '🛡️ مهمة الحارس الشخصي',
    description: 'اختر لاعبًا حيًا لتنفيذ قدرة الحارس عليه.',
    button: 'حماية اللاعب',
  },
  sheriff_check: {
    title: '⭐ مهمة الشريف',
    description: 'افحص لاعبًا حيًا باستخدام قدرة الشريف.',
    button: 'فحص اللاعب',
  },
  witch_save: {
    title: '🧙‍♀️ إنقاذ الساحرة',
    description: 'استخدم قدرة الإنقاذ على لاعب حي.',
    button: 'إنقاذ اللاعب',
  },
  witch_kill: {
    title: '☠️ قتل الساحرة',
    description: 'استخدم قدرة القتل على لاعب حي.',
    button: 'تنفيذ القتل',
    danger: true,
  },
  ghoul: {
    title: '👹 قدرة الغول',
    description: 'اختر لاعبًا حيًا لتنفيذ قدرة الغول عليه.',
    button: 'تنفيذ قدرة الغول',
  },
  cult_convert: {
    title: '☥ تحويل الطائفة',
    description:
      'اختر لاعبًا حيًا لمحاولة تحويله إلى عضو في الطائفة.',
    button: 'تحويل اللاعب',
  },
};

function getSecondsLeft(endsAt: string | null): number {
  if (!endsAt) return 0;

  const end = new Date(endsAt).getTime();

  return Math.max(
    0,
    Math.ceil((end - Date.now()) / 1000)
  );
}

function formatTime(seconds: number): string {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const remaining = safe % 60;

  return `${String(minutes).padStart(
    2,
    '0'
  )}:${String(remaining).padStart(
    2,
    '0'
  )}`;
}

function getEventText(
  event: GameState['room']['last_event']
) {
  if (!event) return null;

  if (typeof event === 'string') return event;

  switch (event.type) {
    case 'game_started':
      return 'بدأت اللعبة وتم توزيع الأدوار.';

    case 'night_started':
      return 'بدأ الليل. كل دور ليلي ينفذ مهمته الآن.';

    case 'day_started':
      return 'انتهى الليل وبدأ النهار. يمكن للاعبين الأحياء التحدث والتصويت.';

    case 'night_kill':
      return 'حدثت عملية قتل خلال الليل.';

    case 'night_saved':
      return 'تم إنقاذ لاعب خلال الليل.';

    case 'day_vote':
      return 'تم تنفيذ نتيجة التصويت.';

    case 'day_tie':
      return 'حدث تعادل في التصويت ولم يمت أحد.';

    case 'cult_convert':
      return 'تم تنفيذ قدرة الطائفة خلال الليل.';

    case 'ghoul_action':
      return 'تم تنفيذ قدرة الغول خلال الليل.';

    case 'game_finished':
    case 'winner':
      return event.winner
        ? `انتهت اللعبة. الفائز: ${event.winner}`
        : 'انتهت اللعبة.';

    default:
      return null;
  }
}

function PlayerAvatar({
  player,
  profile,
  size = 48,
}: {
  player: GamePlayer;
  profile?: ProfileMap[string];
  size?: number;
}) {
  const uri =
    profile?.avatar_url ||
    player.avatar_url ||
    null;

  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={[
          styles.avatar,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
          },
          !player.alive && styles.deadAvatar,
        ]}
      />
    );
  }

  return (
    <View
      style={[
        styles.avatarPlaceholder,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
        },
        !player.alive && styles.deadAvatar,
      ]}
    >
      <Text style={styles.avatarText}>
        {(
          profile?.username ||
          player.name ||
          'P'
        )
          .charAt(0)
          .toUpperCase()}
      </Text>
    </View>
  );
}

export default function MafiaGameScreen() {
  const router = useRouter();

  const params =
    useLocalSearchParams<{
      code?: string | string[];
    }>();

  const routeValue = Array.isArray(params.code)
    ? params.code[0]
    : params.code;

  const [roomId, setRoomId] =
    useState<string | null>(null);

  const [resolvingRoom, setResolvingRoom] =
    useState(true);

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [gameState, setGameState] =
    useState<GameState | null>(null);

  const [myRole, setMyRole] =
    useState<GameRole | null>(null);

  const [myAlive, setMyAlive] =
    useState(true);

  const [profiles, setProfiles] =
    useState<ProfileMap>({});

  const [selectedTarget, setSelectedTarget] =
    useState<string | null>(null);

  const [busy, setBusy] =
    useState(false);

  const [secondsLeft, setSecondsLeft] =
    useState(0);

  const [messages, setMessages] =
    useState<Message[]>([]);

  const [messageText, setMessageText] =
    useState('');

  const [messagesLoading, setMessagesLoading] =
    useState(false);

  const [kickingUserId, setKickingUserId] =
    useState<string | null>(null);

  /*
   * ==================================================
   * LIVEKIT VOICE
   * ==================================================
   */

  const voiceRoomRef =
    useRef<Room | null>(null);

  const voiceConnectingRef =
    useRef(false);

  const voiceShouldBeConnectedRef =
    useRef(false);

  // Monotonically increasing operation id prevents an old connect/disconnect
  // operation from cleaning up a newer LiveKit connection.
  const voiceOperationRef =
    useRef(0);

  const audioSessionStartedRef =
    useRef(false);

  const isUnmountingRef =
    useRef(false);

  const [voiceConnected, setVoiceConnected] =
    useState(false);

  const [voiceConnecting, setVoiceConnecting] =
    useState(false);

  const [micEnabled, setMicEnabled] =
    useState(false);

  const [voiceError, setVoiceError] =
    useState<string | null>(null);

  const [
    voiceParticipantsVersion,
    setVoiceParticipantsVersion,
  ] = useState(0);

  const lastAdvanceRef =
    useRef<number>(0);

  const advancingRef =
    useRef(false);

  const isMountedRef =
    useRef(true);

  /*
   * --------------------------------------------------
   * RESOLVE ROOM ID
   * --------------------------------------------------
   */

  useEffect(() => {
    let cancelled = false;

    const resolveRoomId = async () => {
      if (!routeValue) {
        if (!cancelled) {
          setRoomId(null);
          setResolvingRoom(false);
          setLoading(false);
        }

        return;
      }

      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

      if (uuidRegex.test(routeValue)) {
        if (!cancelled) {
          setRoomId(routeValue);
          setResolvingRoom(false);
        }

        return;
      }

      try {
        const normalizedCode =
          routeValue
            .trim()
            .toUpperCase();

        const {
          data,
          error,
        } = await supabase
          .from('rooms')
          .select('id')
          .eq('code', normalizedCode)
          .maybeSingle();

        if (error) {
          throw error;
        }

        if (!data?.id) {
          throw new Error(
            'الغرفة غير موجودة أو لم تعد متاحة.'
          );
        }

        if (!cancelled) {
          setRoomId(data.id);
          setResolvingRoom(false);
        }
      } catch (error: any) {
        console.error(
          'resolveRoomId error:',
          error
        );

        if (!cancelled) {
          setRoomId(null);
          setResolvingRoom(false);
          setLoading(false);

          Alert.alert(
            'تعذر العثور على الغرفة',
            error?.message ||
              'كود الغرفة غير صحيح.',
            [
              {
                text: 'العودة',
                onPress: () =>
                  router.replace('/rooms'),
              },
            ],
            {
              cancelable: false,
            }
          );
        }
      }
    };

    resolveRoomId();

    return () => {
      cancelled = true;
    };
  }, [routeValue, router]);

  /*
   * --------------------------------------------------
   * PROFILES
   * --------------------------------------------------
   */

  const loadProfiles = useCallback(
    async (players: GamePlayer[]) => {
      if (!players.length) {
        setProfiles({});
        return;
      }

      const userIds = players
        .map(
          (player) =>
            player.user_id
        )
        .filter(Boolean);

      if (!userIds.length) return;

      const {
        data,
        error,
      } = await supabase
        .from('profiles')
        .select(
          'user_id, username, avatar_url'
        )
        .in(
          'user_id',
          userIds
        );

      if (error) {
        console.error(
          'loadProfiles error:',
          error
        );
        return;
      }

      const map: ProfileMap = {};

      for (const profile of data || []) {
        map[profile.user_id] = {
          username:
            profile.username ||
            'Player',
          avatar_url:
            profile.avatar_url ||
            null,
        };
      }

      if (isMountedRef.current) {
        setProfiles(map);
      }
    },
    []
  );

  /*
   * --------------------------------------------------
   * MESSAGES
   * --------------------------------------------------
   */

  const loadMessages = useCallback(
    async () => {
      if (!roomId) return;

      setMessagesLoading(true);

      try {
        const {
          data,
          error,
        } = await supabase
          .from('room_messages')
          .select(
            'id, room_id, user_id, message, created_at'
          )
          .eq(
            'room_id',
            roomId
          )
          .order('created_at', {
            ascending: true,
          })
          .limit(100);

        if (error) {
          console.error(
            'loadMessages error:',
            error
          );
        } else if (
          isMountedRef.current
        ) {
          setMessages(
            (data || []) as Message[]
          );
        }
      } catch (error) {
        console.error(
          'loadMessages unexpected error:',
          error
        );
      } finally {
        if (isMountedRef.current) {
          setMessagesLoading(false);
        }
      }
    },
    [roomId]
  );

  /*
   * --------------------------------------------------
   * GAME
   * --------------------------------------------------
   */

  const loadGame = useCallback(
    async (showLoader = false) => {
      if (!roomId) {
        return;
      }

      if (showLoader) {
        setRefreshing(true);
      }

      try {
        const {
          data: userData,
        } =
          await supabase.auth.getUser();

        const currentUserId =
          userData.user?.id;

        if (!currentUserId) {
          throw new Error(
            'يجب تسجيل الدخول أولًا.'
          );
        }

        const {
          data: membership,
          error: membershipError,
        } = await supabase
          .from('room_players')
          .select('id')
          .eq(
            'room_id',
            roomId
          )
          .eq(
            'user_id',
            currentUserId
          )
          .maybeSingle();

        if (membershipError) {
          console.error(
            'membership check error:',
            membershipError
          );
        }

        if (
          !membership &&
          !membershipError &&
          isMountedRef.current
        ) {
          Alert.alert(
            'تم طردك من الغرفة',
            'قام منشئ الغرفة بإزالتك من هذه الغرفة.',
            [
              {
                text: 'حسنًا',
                onPress: () =>
                  router.replace('/rooms'),
              },
            ],
            {
              cancelable: false,
            }
          );

          return;
        }

        const state =
          await getGameState(roomId);

        if (!isMountedRef.current) {
          return;
        }

        setGameState(state);

        if (
          state.room.status ===
          'waiting'
        ) {
          setMyRole(null);
          setMyAlive(true);
        } else {
          const role =
            await getMyRole(roomId);

          if (!isMountedRef.current) {
            return;
          }

          setMyRole(role.role);
          setMyAlive(role.alive);
        }

        await loadProfiles(
          state.players
        );
      } catch (error: any) {
        console.error(
          'loadGame error:',
          error
        );

        if (
          isMountedRef.current
        ) {
          const message =
            error?.message || '';

          if (
            message.includes(
              'not a member'
            ) ||
            message.includes(
              'player not found'
            ) ||
            (message.includes(
              'لاعب'
            ) &&
              message.includes(
                'الغرفة'
              ))
          ) {
            Alert.alert(
              'تم إخراجك من الغرفة',
              'لم تعد عضوًا في هذه الغرفة.',
              [
                {
                  text: 'حسنًا',
                  onPress: () =>
                    router.replace(
                      '/rooms'
                    ),
                },
              ],
              {
                cancelable: false,
              }
            );

            return;
          }

          Alert.alert(
            'تعذر تحميل اللعبة',
            message ||
              'حدث خطأ أثناء تحميل حالة اللعبة.'
          );
        }
      } finally {
        if (
          isMountedRef.current
        ) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [
      roomId,
      loadProfiles,
      router,
    ]
  );

  useEffect(() => {
    isMountedRef.current = true;
    isUnmountingRef.current = false;

    return () => {
      isMountedRef.current = false;
      isUnmountingRef.current = true;
    };
  }, []);

  /*
   * --------------------------------------------------
   * DERIVED STATE
   * --------------------------------------------------
   */

  const room =
    (gameState?.room as ExtendedGameRoom) ||
    null;

  const players =
    gameState?.players || [];

  const alivePlayers =
    useMemo(
      () =>
        players.filter(
          (player) =>
            player.alive
        ),
      [players]
    );

  const myPlayer =
    useMemo(
      () =>
        players.find(
          (player) =>
            player.id ===
            gameState?.my_player_id
        ) || null,
      [
        players,
        gameState?.my_player_id,
      ]
    );

  const isHost = Boolean(
    room &&
      myPlayer &&
      room.host_id &&
      room.host_id ===
        myPlayer.user_id
  );

  const canKick = Boolean(
    isHost &&
      room?.status ===
        'waiting'
  );

  const isWaiting =
    room?.status ===
    'waiting';

  const isNight =
    room?.game_phase ===
    'night';

  const isDay =
    room?.game_phase ===
    'day';

  const gameFinished =
    room?.status ===
      'finished' ||
    Boolean(room?.winner);

  /*
   * ==================================================
   * الصوت أصبح متاحًا بمجرد دخول الغرفة.
   *
   * لا نعتمد على المرحلة الليلية/النهارية.
   * هذا يمنع قطع LiveKit عند انتقال الجولة.
   * ==================================================
   */

  const canUseVoice = Boolean(
    room &&
      !gameFinished
  );

  const canChat = Boolean(
    room &&
      !gameFinished &&
      (
        isWaiting ||
        (isDay && myAlive)
      )
  );

  const nightActions =
    myRole
      ? ROLE_ACTIONS[myRole] || []
      : [];

  const canNightAction =
    Boolean(
      isNight &&
        myAlive &&
        !gameFinished &&
        nightActions.length >
          0
    );

  const roleLabel = myRole
    ? ROLE_LABELS[myRole]
    : 'لم يتم توزيع الدور بعد';

  const roleDescription =
    myRole
      ? ROLE_DESCRIPTIONS[myRole]
      : 'سيتم توزيع دورك تلقائيًا عند بدء اللعبة.';

  const eventText =
    getEventText(
      room?.last_event ||
        null
    );

  /*
   * ==================================================
   * LIVEKIT FUNCTIONS
   * ==================================================
   */

  const disconnectVoice =
    useCallback(
      async () => {
        voiceShouldBeConnectedRef.current =
          false;

        voiceOperationRef.current += 1;

        const currentRoom =
          voiceRoomRef.current;

        voiceRoomRef.current =
          null;

        voiceConnectingRef.current =
          false;

        if (isMountedRef.current) {
          setVoiceConnecting(false);
          setVoiceConnected(false);
          setMicEnabled(false);
          setVoiceError(null);
        }

        if (currentRoom) {
          try {
            await currentRoom.disconnect();
          } catch (error) {
            console.error(
              'disconnectVoice error:',
              error
            );
          }
        }

        if (
          audioSessionStartedRef.current
        ) {
          try {
            await AudioSession.stopAudioSession();
          } catch (error) {
            console.error(
              'stopAudioSession error:',
              error
            );
          }

          audioSessionStartedRef.current =
            false;
        }

        if (isMountedRef.current) {
          setVoiceParticipantsVersion(
            (value) =>
              value + 1
          );
        }
      },
      []
    );

  const connectVoice =
    useCallback(
      async () => {
        if (
          !roomId ||
          isUnmountingRef.current
        ) {
          return;
        }

        if (
          voiceConnectingRef.current
        ) {
          return;
        }

        const existingRoom =
          voiceRoomRef.current;

        if (
          existingRoom &&
          voiceConnected
        ) {
          return;
        }

        voiceShouldBeConnectedRef.current =
          true;

        const operation =
          ++voiceOperationRef.current;

        voiceConnectingRef.current =
          true;

        if (isMountedRef.current) {
          setVoiceConnecting(true);
          setVoiceError(null);
        }

        let liveKitRoom:
          | Room
          | null = null;

        let startedAudioSessionForThisOperation =
          false;

        try {
          /*
           * تشغيل AudioSession قبل الاتصال.
           *
           * إذا فشل تشغيل AudioSession لا نخرج
           * المستخدم من اللعبة؛ نسجل الخطأ فقط.
           */
          if (
            !audioSessionStartedRef.current
          ) {
            try {
              await AudioSession.startAudioSession();

              audioSessionStartedRef.current =
                true;

              startedAudioSessionForThisOperation =
                true;
            } catch (audioError: any) {
              console.error(
                'startAudioSession error:',
                audioError
              );

              if (
                isMountedRef.current
              ) {
                setVoiceError(
                  audioError?.message ||
                    'تعذر تشغيل نظام الصوت.'
                );
              }
            }
          }

          if (
            operation !==
              voiceOperationRef.current ||
            isUnmountingRef.current ||
            !voiceShouldBeConnectedRef.current
          ) {
            if (
              startedAudioSessionForThisOperation &&
              audioSessionStartedRef.current
            ) {
              try {
                await AudioSession.stopAudioSession();
              } catch {}

              audioSessionStartedRef.current =
                false;
            }

            return;
          }

          /*
           * الحصول على LiveKit token.
           */
          const {
            token,
            server_url,
          } =
            await getLiveKitToken(
              roomId
            );

          if (
            !token ||
            !server_url
          ) {
            throw new Error(
              'بيانات LiveKit غير مكتملة.'
            );
          }

          if (
            operation !==
              voiceOperationRef.current ||
            isUnmountingRef.current ||
            !voiceShouldBeConnectedRef.current
          ) {
            if (
              startedAudioSessionForThisOperation &&
              audioSessionStartedRef.current
            ) {
              try {
                await AudioSession.stopAudioSession();
              } catch {}

              audioSessionStartedRef.current =
                false;
            }

            return;
          }

          /*
           * إنشاء غرفة LiveKit واحدة فقط.
           */
          liveKitRoom =
            new Room();

          voiceRoomRef.current =
            liveKitRoom;

          /*
           * عند الاتصال.
           *
           * لا نشغل الميكروفون هنا حتى لا يحدث
           * استدعاء مزدوج أثناء connect().
           */
          liveKitRoom.on(
            RoomEvent.Connected,
            () => {
              if (
                !isMountedRef.current ||
                isUnmountingRef.current
              ) {
                return;
              }

              setVoiceConnected(true);
              setVoiceConnecting(false);
              setVoiceError(null);

              setVoiceParticipantsVersion(
                (value) =>
                  value + 1
              );
            }
          );

          liveKitRoom.on(
            RoomEvent.Disconnected,
            () => {
              if (
                voiceRoomRef.current ===
                liveKitRoom
              ) {
                voiceRoomRef.current =
                  null;
              }

              if (
                isMountedRef.current
              ) {
                setVoiceConnected(false);
                setMicEnabled(false);
                setVoiceConnecting(false);

                setVoiceParticipantsVersion(
                  (value) =>
                    value + 1
                );
              }
            }
          );

          liveKitRoom.on(
            RoomEvent.Reconnecting,
            () => {
              if (
                isMountedRef.current
              ) {
                setVoiceConnecting(true);
              }
            }
          );

          liveKitRoom.on(
            RoomEvent.Reconnected,
            async () => {
              if (
                !isMountedRef.current ||
                isUnmountingRef.current
              ) {
                return;
              }

              setVoiceConnecting(false);
              setVoiceConnected(true);

              /*
               * إعادة تشغيل الميكروفون بعد إعادة الاتصال.
               */
              try {
                await liveKitRoom?.localParticipant
                  .setMicrophoneEnabled(
                    true
                  );

                if (
                  isMountedRef.current
                ) {
                  setMicEnabled(true);
                  setVoiceError(null);

                  setVoiceParticipantsVersion(
                    (value) =>
                      value + 1
                  );
                }
              } catch (error: any) {
                console.error(
                  'Reconnected microphone error:',
                  error
                );

                if (
                  isMountedRef.current
                ) {
                  setMicEnabled(false);
                  setVoiceError(
                    error?.message ||
                      'تعذر إعادة تشغيل الميكروفون.'
                  );
                }
              }
            }
          );

          liveKitRoom.on(
            RoomEvent.ParticipantConnected,
            () => {
              if (
                isMountedRef.current
              ) {
                setVoiceParticipantsVersion(
                  (value) =>
                    value + 1
                );
              }
            }
          );

          liveKitRoom.on(
            RoomEvent.ParticipantDisconnected,
            () => {
              if (
                isMountedRef.current
              ) {
                setVoiceParticipantsVersion(
                  (value) =>
                    value + 1
                );
              }
            }
          );

          liveKitRoom.on(
            RoomEvent.TrackMuted,
            () => {
              if (
                isMountedRef.current
              ) {
                setVoiceParticipantsVersion(
                  (value) =>
                    value + 1
                );
              }
            }
          );

          liveKitRoom.on(
            RoomEvent.TrackUnmuted,
            () => {
              if (
                isMountedRef.current
              ) {
                setVoiceParticipantsVersion(
                  (value) =>
                    value + 1
                );
              }
            }
          );

          /*
           * الاتصال الفعلي.
           *
           * أي خطأ هنا يمسكه catch ولا يسمح
           * له بإسقاط شاشة اللعبة.
           */
          await liveKitRoom.connect(
            server_url,
            token
          );

          if (
            operation !== voiceOperationRef.current ||
            isUnmountingRef.current ||
            !voiceShouldBeConnectedRef.current
          ) {
            try {
              await liveKitRoom.disconnect();
            } catch {}

            if (
              voiceRoomRef.current ===
              liveKitRoom
            ) {
              voiceRoomRef.current =
                null;
            }

            if (
              operation === voiceOperationRef.current &&
              audioSessionStartedRef.current
            ) {
              try {
                await AudioSession.stopAudioSession();
              } catch (error) {
                console.error(
                  'Cancelled connected AudioSession stop error:',
                  error
                );
              }
              audioSessionStartedRef.current =
                false;
            }

            return;
          }

          if (isMountedRef.current) {
            setVoiceConnected(true);
            setVoiceConnecting(false);
          }

          /*
           * تشغيل الميكروفون صراحة بعد نجاح الاتصال.
           *
           * هذا هو الجزء المهم:
           * الميكروفون لا ينتظر دخول لاعب آخر
           * ولا ينتظر بدء الجولة.
           */
          try {
            await liveKitRoom.localParticipant
              .setMicrophoneEnabled(
                true
              );

            if (
              isMountedRef.current
            ) {
              setMicEnabled(true);
              setVoiceError(null);

              setVoiceParticipantsVersion(
                (value) =>
                  value + 1
              );
            }
          } catch (error: any) {
            /*
             * فشل الميكروفون لا يعني فشل اللعبة.
             * نبقي المستخدم داخل الغرفة.
             */
            console.error(
              'Enable microphone error:',
              error
            );

            if (
              isMountedRef.current
            ) {
              setMicEnabled(false);

              setVoiceError(
                error?.message ||
                  'تعذر تشغيل الميكروفون. تأكد من السماح للتطبيق باستخدام الميكروفون.'
              );
            }
          }
        } catch (error: any) {
          console.error(
            'connectVoice error:',
            error
          );

          /*
           * تنظيف آمن.
           */
          if (liveKitRoom) {
            try {
              await liveKitRoom.disconnect();
            } catch (disconnectError) {
              console.error(
                'LiveKit cleanup error:',
                disconnectError
              );
            }
          }

          if (
            voiceRoomRef.current ===
            liveKitRoom
          ) {
            voiceRoomRef.current =
              null;
          }

          if (
            operation === voiceOperationRef.current &&
            !voiceShouldBeConnectedRef.current &&
            audioSessionStartedRef.current
          ) {
            try {
              await AudioSession.stopAudioSession();
            } catch (audioStopError) {
              console.error(
                'LiveKit catch AudioSession stop error:',
                audioStopError
              );
            }
            audioSessionStartedRef.current =
              false;
          }

          if (
            isMountedRef.current &&
            !isUnmountingRef.current
          ) {
            setVoiceConnected(false);
            setMicEnabled(false);
            setVoiceConnecting(false);

            setVoiceError(
              error?.message ||
                'تعذر الاتصال بالصوت. يمكنك البقاء داخل الغرفة والمحاولة مرة أخرى.'
            );
          }

          /*
           * مهم:
           * لا يوجد router.replace هنا.
           * خطأ LiveKit لا يخرج المستخدم من اللعبة.
           */
        } finally {
          voiceConnectingRef.current =
            false;

          if (
            isMountedRef.current
          ) {
            setVoiceConnecting(false);
          }
        }
      },
      [roomId]
    );
    /*
   * ==================================================
   * AUTO CONNECT VOICE
   * ==================================================
   *
   * بمجرد توفر roomId ووجود غرفة فعالة، يتم الاتصال
   * بالصوت تلقائيًا دون انتظار بدء الجولة.
   */
  useEffect(() => {
    if (
      !roomId ||
      !canUseVoice ||
      isUnmountingRef.current
    ) {
      return;
    }

    void connectVoice();
  }, [
    roomId,
    canUseVoice,
    connectVoice,
  ]);

  /*
   * ==================================================
   * MICROPHONE TOGGLE
   * ==================================================
   */

  const toggleMicrophone =
    useCallback(
      async () => {
        const currentRoom =
          voiceRoomRef.current;

        if (
          !currentRoom ||
          !voiceConnected
        ) {
          /*
           * إذا لم يكن الاتصال موجودًا،
           * نحاول إنشاء الاتصال بدل إخراج المستخدم.
           */
          await connectVoice();
          return;
        }

        try {
          const nextEnabled =
            !micEnabled;

          await currentRoom
            .localParticipant
            .setMicrophoneEnabled(
              nextEnabled
            );

          if (
            isMountedRef.current
          ) {
            setMicEnabled(
              nextEnabled
            );

            setVoiceError(null);

            setVoiceParticipantsVersion(
              (value) =>
                value + 1
            );
          }
        } catch (error: any) {
          console.error(
            'toggleMicrophone error:',
            error
          );

          if (
            isMountedRef.current
          ) {
            setVoiceError(
              error?.message ||
                'تعذر تغيير حالة الميكروفون.'
            );
          }
        }
      },
      [
        voiceConnected,
        micEnabled,
        connectVoice,
      ]
    );

  /*
   * ==================================================
   * VOICE PARTICIPANTS
   * ==================================================
   */

  const voiceParticipants =
    useMemo(() => {
      /*
       * الاعتماد على voiceParticipantsVersion
       * يجعل القائمة تعاد عند دخول/خروج لاعب
       * أو تغيير حالة الميكروفون.
       */
      void voiceParticipantsVersion;

      const currentRoom =
        voiceRoomRef.current;

      if (!currentRoom) {
        return players.map(
          (player) => ({
            userId:
              player.user_id,
            name:
              profiles[
                player.user_id
              ]?.username ||
              player.name ||
              'Player',
            speaking: false,
            mic:
              player.user_id ===
              myPlayer?.user_id
                ? micEnabled
                : false,
          })
        );
      }

      const result: Array<{
        userId: string;
        name: string;
        speaking: boolean;
        mic: boolean;
      }> = [];

      const localUserId =
        myPlayer?.user_id ||
        null;

      if (localUserId) {
        result.push({
          userId: localUserId,
          name:
            profiles[
              localUserId
            ]?.username ||
            myPlayer?.name ||
            'You',
          speaking: false,
          mic: micEnabled,
        });
      }

      currentRoom
        .remoteParticipants
        .forEach(
          (participant) => {
            let microphoneEnabled =
              false;

            participant
              .trackPublications
              .forEach(
                (publication: any) => {
                  const source =
                    publication?.source;

                  const isMicrophone =
                    source ===
                      'microphone' ||
                    source ===
                      'Microphone' ||
                    String(
                      source
                    ).toLowerCase() ===
                      'microphone';

                  if (
                    isMicrophone &&
                    !publication.isMuted
                  ) {
                    microphoneEnabled =
                      true;
                  }
                }
              );

            result.push({
              userId:
                participant.identity,
              name:
                participant.name ||
                participant.identity ||
                'Player',
              speaking:
                Boolean(
                  participant.isSpeaking
                ),
              mic:
                microphoneEnabled,
            });
          }
        );

      return result;
    }, [
      players,
      profiles,
      myPlayer,
      micEnabled,
      voiceParticipantsVersion,
    ]);

  /*
   * --------------------------------------------------
   * INITIAL GAME LOAD
   * --------------------------------------------------
   */

  useEffect(() => {
    if (!roomId) {
      return;
    }

    void loadGame();

    void loadMessages();
  }, [
    roomId,
    loadGame,
    loadMessages,
  ]);

  /*
   * --------------------------------------------------
   * REALTIME GAME SUBSCRIPTION
   * --------------------------------------------------
   */

  useEffect(() => {
    if (!roomId) {
      return;
    }

    const channel =
      supabase.channel(
        `game-room-${roomId}`
      );

    channel
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
          if (
            isMountedRef.current
          ) {
            void loadGame();
          }
        }
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
          if (
            isMountedRef.current
          ) {
            void loadGame();
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'game_players',
          filter:
            `room_id=eq.${roomId}`,
        },
        () => {
          if (
            isMountedRef.current
          ) {
            void loadGame();
          }
        }
      )
      .subscribe(
        (status) => {
          console.log(
            'Game realtime status:',
            status
          );
        }
      );

    return () => {
      void supabase.removeChannel(
        channel
      );
    };
  }, [
    roomId,
    loadGame,
  ]);

  /*
   * --------------------------------------------------
   * REALTIME CHAT
   * --------------------------------------------------
   */

  useEffect(() => {
    if (!roomId) {
      return;
    }

    const channel =
      supabase.channel(
        `room-messages-${roomId}`
      );

    channel
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'room_messages',
          filter:
            `room_id=eq.${roomId}`,
        },
        (payload) => {
          const incoming =
            payload.new as Message;

          if (
            !incoming?.id ||
            !isMountedRef.current
          ) {
            return;
          }

          setMessages(
            (current) => {
              if (
                current.some(
                  (item) =>
                    item.id ===
                    incoming.id
                )
              ) {
                return current;
              }

              return [
                ...current,
                incoming,
              ];
            }
          );
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(
        channel
      );
    };
  }, [roomId]);

  /*
   * --------------------------------------------------
   * TIMER
   * --------------------------------------------------
   */

  useEffect(() => {
    if (!room?.phase_ends_at) {
      setSecondsLeft(0);
      return;
    }

    const updateTimer =
      () => {
        if (
          !isMountedRef.current
        ) {
          return;
        }

        setSecondsLeft(
          getSecondsLeft(
            room.phase_ends_at
          )
        );
      };

    updateTimer();

    const interval =
      setInterval(
        updateTimer,
        1000
      );

    return () =>
      clearInterval(
        interval
      );
  }, [
    room?.phase_ends_at,
  ]);

  /*
   * --------------------------------------------------
   * ROOM HEARTBEAT
   * --------------------------------------------------
   */

  useEffect(() => {
    if (!roomId) {
      return;
    }

    let active = true;

    const sendHeartbeat =
      async () => {
        if (!active) {
          return;
        }

        try {
          await heartbeatRoom(
            roomId
          );
        } catch (error) {
          /*
           * فشل heartbeat لا يجب أن يسقط
           * شاشة اللعبة.
           */
          console.error(
            'heartbeat error:',
            error
          );
        }
      };

    void sendHeartbeat();

    const interval =
      setInterval(
        sendHeartbeat,
        15000
      );

    return () => {
      active = false;
      clearInterval(
        interval
      );
    };
  }, [roomId]);

  /*
   * --------------------------------------------------
   * AUTO ADVANCE PHASE
   * --------------------------------------------------
   */

  useEffect(() => {
    if (
      !room ||
      gameFinished ||
      !room.phase_ends_at
    ) {
      return;
    }

    const remaining =
      getSecondsLeft(
        room.phase_ends_at
      );

    if (remaining > 0) {
      return;
    }

    if (
      !isHost &&
      room.host_id
    ) {
      return;
    }

    if (
      advancingRef.current
    ) {
      return;
    }

    const now =
      Date.now();

    /*
     * حماية إضافية من استدعاء advance عدة
     * مرات بسبب Realtime + Timer.
     */
    if (
      now -
        lastAdvanceRef.current <
      3000
    ) {
      return;
    }

    lastAdvanceRef.current =
      now;

    advancingRef.current =
      true;

    const advance =
      async () => {
        try {
          await advanceMafiaPhase(
            roomId!
          );
        } catch (error) {
          console.error(
            'advanceMafiaPhase error:',
            error
          );
        } finally {
          advancingRef.current =
            false;
        }
      };

    void advance();
  }, [
    room,
    roomId,
    gameFinished,
    isHost,
  ]);

  /*
   * --------------------------------------------------
   * CLEANUP LIVEKIT ON UNMOUNT
   * --------------------------------------------------
   */

  useEffect(() => {
    return () => {
      isUnmountingRef.current =
        true;

      voiceShouldBeConnectedRef.current =
        false;

      voiceOperationRef.current +=
        1;

      const currentRoom =
        voiceRoomRef.current;

      voiceRoomRef.current =
        null;

      if (currentRoom) {
        void currentRoom
          .disconnect()
          .catch(
            (error) => {
              console.error(
                'Unmount LiveKit disconnect error:',
                error
              );
            }
          );
      }

      if (
        audioSessionStartedRef.current
      ) {
        audioSessionStartedRef.current =
          false;

        void AudioSession
          .stopAudioSession()
          .catch(
            (error) => {
              console.error(
                'Unmount AudioSession stop error:',
                error
              );
            }
          );
      }
    };
  }, []);

  /*
   * --------------------------------------------------
   * TARGET SELECTION
   * --------------------------------------------------
   */

  const selectablePlayers =
    useMemo(
      () =>
        alivePlayers.filter(
          (player) =>
            player.user_id !==
            myPlayer?.user_id
        ),
      [
        alivePlayers,
        myPlayer?.user_id,
      ]
    );

  const selectTarget =
    useCallback(
      (userId: string) => {
        if (
          busy ||
          gameFinished
        ) {
          return;
        }

        setSelectedTarget(
          (current) =>
            current === userId
              ? null
              : userId
        );
      },
      [
        busy,
        gameFinished,
      ]
    );

  /*
   * --------------------------------------------------
   * NIGHT ACTION
   * --------------------------------------------------
   */

  const performNightAction =
    useCallback(
      async (
        action: NightAction
      ) => {
        if (
          !roomId ||
          !selectedTarget ||
          !myRole ||
          !myAlive ||
          !isNight ||
          busy ||
          gameFinished
        ) {
          return;
        }

        setBusy(true);

        try {
          await submitNightAction(
            roomId,
            action,
            selectedTarget
          );

          if (
            isMountedRef.current
          ) {
            setSelectedTarget(
              null
            );

            await loadGame();
          }
        } catch (error: any) {
          console.error(
            'performNightAction error:',
            error
          );

          if (
            isMountedRef.current
          ) {
            Alert.alert(
              'تعذر تنفيذ المهمة',
              error?.message ||
                'حدث خطأ أثناء تنفيذ المهمة.'
            );
          }
        } finally {
          if (
            isMountedRef.current
          ) {
            setBusy(false);
          }
        }
      },
      [
        roomId,
        selectedTarget,
        myRole,
        myAlive,
        isNight,
        busy,
        gameFinished,
        loadGame,
      ]
    );

  /*
   * --------------------------------------------------
   * DAY VOTE
   * --------------------------------------------------
   */

  const performVote =
    useCallback(
      async () => {
        if (
          !roomId ||
          !selectedTarget ||
          !myAlive ||
          !isDay ||
          busy ||
          gameFinished
        ) {
          return;
        }

        setBusy(true);

        try {
          await submitDayVote(
            roomId,
            selectedTarget
          );

          if (
            isMountedRef.current
          ) {
            setSelectedTarget(
              null
            );

            await loadGame();
          }
        } catch (error: any) {
          console.error(
            'performVote error:',
            error
          );

          if (
            isMountedRef.current
          ) {
            Alert.alert(
              'تعذر التصويت',
              error?.message ||
                'حدث خطأ أثناء التصويت.'
            );
          }
        } finally {
          if (
            isMountedRef.current
          ) {
            setBusy(false);
          }
        }
      },
      [
        roomId,
        selectedTarget,
        myAlive,
        isDay,
        busy,
        gameFinished,
        loadGame,
      ]
    );

  /*
   * --------------------------------------------------
   * SEND MESSAGE
   * --------------------------------------------------
   */

  const sendMessage =
    useCallback(
      async () => {
        const message =
          messageText.trim();

        if (
          !roomId ||
          !message ||
          !canChat
        ) {
          return;
        }

        if (
          message.length >
          500
        ) {
          Alert.alert(
            'الرسالة طويلة',
            'الحد الأقصى للرسالة هو 500 حرف.'
          );
          return;
        }

        try {
          const {
            data: userData,
          } =
            await supabase.auth.getUser();

          const userId =
            userData.user?.id;

          if (!userId) {
            throw new Error(
              'يجب تسجيل الدخول لإرسال رسالة.'
            );
          }

          const {
            error,
          } =
            await supabase
              .from(
                'room_messages'
              )
              .insert({
                room_id:
                  roomId,
                user_id:
                  userId,
                message,
              });

          if (error) {
            throw error;
          }

          if (
            isMountedRef.current
          ) {
            setMessageText(
              ''
            );
          }
        } catch (error: any) {
          console.error(
            'sendMessage error:',
            error
          );

          if (
            isMountedRef.current
          ) {
            Alert.alert(
              'تعذر إرسال الرسالة',
              error?.message ||
                'حدث خطأ أثناء إرسال الرسالة.'
            );
          }
        }
      },
      [
        roomId,
        messageText,
        canChat,
      ]
    );

  /*
   * --------------------------------------------------
   * KICK PLAYER
   * --------------------------------------------------
   */

  const kickPlayer =
    useCallback(
      async (
        userId: string
      ) => {
        if (
          !roomId ||
          !canKick ||
          kickingUserId
        ) {
          return;
        }

        const player =
          players.find(
            (item) =>
              item.user_id ===
              userId
          );

        const username =
          profiles[userId]
            ?.username ||
          player?.name ||
          'هذا اللاعب';

        Alert.alert(
          'طرد اللاعب',
          `هل تريد طرد ${username} من الغرفة؟`,
          [
            {
              text: 'إلغاء',
              style: 'cancel',
            },
            {
              text: 'طرد',
              style: 'destructive',
              onPress: async () => {
                setKickingUserId(
                  userId
                );

                try {
                  await kickRoomPlayer(
                    roomId,
                    userId
                  );

                  if (
                    isMountedRef.current
                  ) {
                    await loadGame();
                  }
                } catch (
                  error: any
                ) {
                  console.error(
                    'kickPlayer error:',
                    error
                  );

                  if (
                    isMountedRef.current
                  ) {
                    Alert.alert(
                      'تعذر طرد اللاعب',
                      error?.message ||
                        'حدث خطأ أثناء الطرد.'
                    );
                  }
                } finally {
                  if (
                    isMountedRef.current
                  ) {
                    setKickingUserId(
                      null
                    );
                  }
                }
              },
            },
          ]
        );
      },
      [
        roomId,
        canKick,
        kickingUserId,
        players,
        profiles,
        loadGame,
      ]
    );

  /*
   * --------------------------------------------------
   * START GAME
   * --------------------------------------------------
   */

  const startGame =
    useCallback(
      async () => {
        if (
          !roomId ||
          !isHost ||
          !isWaiting ||
          busy
        ) {
          return;
        }

        setBusy(true);

        try {
          /*
           * بدء اللعبة يتم عبر قاعدة البيانات.
           * لا علاقة له باتصال LiveKit.
           * بالتالي حتى لو كان الصوت غير متاح،
           * لا يجب أن تتوقف عملية اللعبة.
           */
          const {
            data,
            error,
          } =
            await supabase.rpc(
              'start_mafia_game',
              {
                p_room_id:
                  roomId,
              }
            );

          if (error) {
            throw error;
          }

          console.log(
            'start_mafia_game result:',
            data
          );

          if (
            isMountedRef.current
          ) {
            await loadGame();
          }
        } catch (error: any) {
          console.error(
            'startGame error:',
            error
          );

          if (
            isMountedRef.current
          ) {
            Alert.alert(
              'تعذر بدء اللعبة',
              error?.message ||
                'حدث خطأ أثناء بدء اللعبة.'
            );
          }
        } finally {
          if (
            isMountedRef.current
          ) {
            setBusy(false);
          }
        }
      },
      [
        roomId,
        isHost,
        isWaiting,
        busy,
        loadGame,
      ]
    );

  /*
   * --------------------------------------------------
   * LEAVE GAME
   * --------------------------------------------------
   */

  const leaveGame =
    useCallback(
      async () => {
        if (!roomId) {
          router.replace(
            '/rooms'
          );
          return;
        }

        Alert.alert(
          'مغادرة الغرفة',
          'هل تريد مغادرة هذه الغرفة؟',
          [
            {
              text: 'إلغاء',
              style: 'cancel',
            },
            {
              text: 'مغادرة',
              style: 'destructive',
              onPress: async () => {
                try {
                  /*
                   * أوقف الصوت أولًا وبشكل آمن.
                   * لا نترك AudioSession يعمل بعد المغادرة.
                   */
                  await disconnectVoice();

                  await leaveRoom(
                    roomId
                  );
                } catch (
                  error
                ) {
                  console.error(
                    'leaveGame error:',
                    error
                  );
                } finally {
                  if (
                    isMountedRef.current
                  ) {
                    router.replace(
                      '/rooms'
                    );
                  }
                }
              },
            },
          ]
        );
      },
      [
        roomId,
        disconnectVoice,
        router,
      ]
    );

  /*
   * --------------------------------------------------
   * REFRESH
   * --------------------------------------------------
   */

  const refreshGame =
    useCallback(
      async () => {
        if (refreshing) {
          return;
        }

        setRefreshing(true);

        try {
          await loadGame();
          await loadMessages();
        } finally {
          if (
            isMountedRef.current
          ) {
            setRefreshing(false);
          }
        }
      },
      [
        refreshing,
        loadGame,
        loadMessages,
      ]
    );

  /*
   * ==================================================
   * RENDER HELPERS
   * ==================================================
   */

  const renderPlayer =
    (
      player: GamePlayer
    ) => {
      const profile =
        profiles[
          player.user_id
        ];

      const isMe =
        player.user_id ===
        myPlayer?.user_id;

      const selected =
        selectedTarget ===
        player.user_id;

      const voice =
        voiceParticipants.find(
          (item) =>
            item.userId ===
            player.user_id
        );

      const selectable =
        selectablePlayers.some(
          (item) =>
            item.user_id ===
            player.user_id
        );

      return (
        <Pressable
          key={player.id}
          onPress={() => {
            if (
              selectable
            ) {
              selectTarget(
                player.user_id
              );
            }
          }}
          disabled={
            !selectable ||
            busy ||
            gameFinished
          }
          style={[
            styles.playerCard,
            selected &&
              styles.selectedPlayerCard,
            !player.alive &&
              styles.deadPlayerCard,
          ]}
        >
          <View style={styles.playerMain}>
            <PlayerAvatar
              player={player}
              profile={profile}
              size={50}
            />

            <View
              style={
                styles.playerInfo
              }
            >
              <View
                style={
                  styles.playerNameRow
                }
              >
                <Text
                  style={
                    styles.playerName
                  }
                >
                  {profile
                    ?.username ||
                    player.name ||
                    'Player'}
                  {isMe
                    ? ' (أنت)'
                    : ''}
                </Text>

                {voice?.mic ? (
                  <Text
                    style={
                      styles.micIndicator
                    }
                  >
                    🎙️
                  </Text>
                ) : null}

                {voice?.speaking ? (
                  <Text
                    style={
                      styles.speakingIndicator
                    }
                  >
                    🔊
                  </Text>
                ) : null}
              </View>

              <Text
                style={
                  player.alive
                    ? styles.aliveText
                    : styles.deadText
                }
              >
                {player.alive
                  ? 'حي'
                  : 'ميت'}
              </Text>
            </View>
          </View>

          {canKick &&
          !isMe ? (
            <Pressable
              style={
                styles.kickButton
              }
              onPress={() =>
                kickPlayer(
                  player.user_id
                )
              }
              disabled={
                kickingUserId ===
                player.user_id
              }
            >
              {kickingUserId ===
              player.user_id ? (
                <ActivityIndicator
                  size="small"
                />
              ) : (
                <Text
                  style={
                    styles.kickButtonText
                  }
                >
                  طرد
                </Text>
              )}
            </Pressable>
          ) : null}
        </Pressable>
      );
    };

  /*
   * ==================================================
   * LOADING
   * ==================================================
   */

  if (
    resolvingRoom ||
    loading
  ) {
    return (
      <View
        style={
          styles.loadingScreen
        }
      >
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

  if (!roomId || !gameState || !room) {
    return (
      <View
        style={
          styles.loadingScreen
        }
      >
        <Text
          style={
            styles.errorTitle
          }
        >
          تعذر تحميل الغرفة
        </Text>

        <Pressable
          style={
            styles.primaryButton
          }
          onPress={() =>
            router.replace(
              '/rooms'
            )
          }
        >
          <Text
            style={
              styles.primaryButtonText
            }
          >
            العودة إلى الغرف
          </Text>
        </Pressable>
      </View>
    );
  }

  /*
   * ==================================================
   * MAIN UI
   * ==================================================
   */

  return (
    <View
      style={styles.container}
    >
      <View
        style={styles.header}
      >
        <Pressable
          style={
            styles.headerButton
          }
          onPress={
            leaveGame
          }
        >
          <Text
            style={
              styles.headerButtonText
            }
          >
            ←
          </Text>
        </Pressable>

        <View
          style={
            styles.headerCenter
          }
        >
          <Text
            style={
              styles.headerTitle
            }
          >
            Mafia Night
          </Text>

          <Text
            style={
              styles.roomCode
            }
          >
            الغرفة: {routeValue}
          </Text>
        </View>

        <Pressable
          style={
            styles.headerButton
          }
          onPress={
            refreshGame
          }
          disabled={
            refreshing
          }
        >
          {refreshing ? (
            <ActivityIndicator
              size="small"
            />
          ) : (
            <Text
              style={
                styles.headerButtonText
              }
            >
              ↻
            </Text>
          )}
        </Pressable>
      </View>

      <ScrollView
        style={
          styles.scroll
        }
        contentContainerStyle={
          styles.scrollContent
        }
        keyboardShouldPersistTaps="handled"
      >
        <View
          style={
            styles.phaseCard
          }
        >
          <View>
            <Text
              style={
                styles.phaseLabel
              }
            >
              {isWaiting
                ? 'انتظار اللاعبين'
                : gameFinished
                ? 'انتهت اللعبة'
                : isNight
                ? 'الليل'
                : 'النهار'}
            </Text>

            {!isWaiting &&
            !gameFinished ? (
              <Text
                style={
                  styles.timerText
                }
              >
                {formatTime(
                  secondsLeft
                )}
              </Text>
            ) : null}
          </View>

          <View
            style={
              styles.phaseIcon
            }
          >
            <Text
              style={
                styles.phaseIconText
              }
            >
              {isWaiting
                ? '⏳'
                : gameFinished
                ? '🏆'
                : isNight
                ? '🌙'
                : '☀️'}
            </Text>
          </View>
        </View>

        {eventText ? (
          <View
            style={
              styles.eventCard
            }
          >
            <Text
              style={
                styles.eventTitle
              }
            >
              آخر حدث
            </Text>

            <Text
              style={
                styles.eventText
              }
            >
              {eventText}
            </Text>
          </View>
        ) : null}

        {isWaiting ? (
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
              بانتظار بدء اللعبة
            </Text>

            <Text
              style={
                styles.infoText
              }
            >
              {isHost
                ? 'أنت منشئ الغرفة. عندما يصبح اللاعبون جاهزين يمكنك بدء اللعبة.'
                : 'انتظر منشئ الغرفة حتى يبدأ الجولة.'}
            </Text>

            {isHost ? (
              <Pressable
                style={[
                  styles.primaryButton,
                  busy &&
                    styles.disabledButton,
                ]}
                onPress={
                  startGame
                }
                disabled={
                  busy
                }
              >
                {busy ? (
                  <ActivityIndicator
                    color="#fff"
                  />
                ) : (
                  <Text
                    style={
                      styles.primaryButtonText
                    }
                  >
                    بدء اللعبة
                  </Text>
                )}
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {!isWaiting &&
        !gameFinished ? (
          <View
            style={
              styles.roleCard
            }
          >
            <Text
              style={
                styles.roleSmall
              }
            >
              دورك
            </Text>

            <Text
              style={
                styles.roleTitle
              }
            >
              {roleLabel}
            </Text>

            <Text
              style={
                styles.roleDescription
              }
            >
              {roleDescription}
            </Text>

            {!myAlive ? (
              <Text
                style={
                  styles.deadRoleText
                }
              >
                لقد خرجت من اللعبة. يمكنك متابعة الأحداث فقط.
              </Text>
            ) : null}
          </View>
        ) : null}

        /*
         * --------------------------------------------------
         * VOICE CARD
         * --------------------------------------------------
         */

        <View
          style={
            styles.voiceCard
          }
        >
          <View
            style={
              styles.voiceHeader
            }
          >
            <View>
              <Text
                style={
                  styles.voiceTitle
                }
              >
                🎙️ الصوت
              </Text>

              <Text
                style={
                  styles.voiceSubtitle
                }
              >
                {voiceConnected
                  ? 'متصل مع لاعبي الغرفة'
                  : voiceConnecting
                  ? 'جارٍ الاتصال...'
                  : 'غير متصل'}
              </Text>
            </View>

            <View
              style={[
                styles.voiceStatus,
                voiceConnected &&
                  styles.voiceStatusConnected,
              ]}
            >
              <Text
                style={
                  styles.voiceStatusText
                }
              >
                {voiceConnected
                  ? 'متصل'
                  : voiceConnecting
                  ? '...'
                  : 'غير متصل'}
              </Text>
            </View>
          </View>

          {voiceError ? (
            <View
              style={
                styles.voiceErrorBox
              }
            >
              <Text
                style={
                  styles.voiceErrorText
                }
              >
                {voiceError}
              </Text>
            </View>
          ) : null}

          <View
            style={
              styles.voiceControls
            }
          >
            <Pressable
              style={[
                styles.voiceButton,
                micEnabled &&
                  styles.voiceButtonActive,
              ]}
              onPress={
                toggleMicrophone
              }
              disabled={
                voiceConnecting
              }
            >
              <Text
                style={
                  styles.voiceButtonText
                }
              >
                {micEnabled
                  ? '🎙️ الميكروفون يعمل'
                  : '🔇 تشغيل الميكروفون'}
              </Text>
            </Pressable>

            {!voiceConnected ? (
              <Pressable
                style={
                  styles.secondaryButton
                }
                onPress={
                  connectVoice
                }
                disabled={
                  voiceConnecting
                }
              >
                {voiceConnecting ? (
                  <ActivityIndicator />
                ) : (
                  <Text
                    style={
                      styles.secondaryButtonText
                    }
                  >
                    اتصال بالصوت
                  </Text>
                )}
              </Pressable>
            ) : null}
          </View>

          {voiceParticipants.length >
          0 ? (
            <View
              style={
                styles.voicePlayers
              }
            >
              {voiceParticipants.map(
                (participant) => (
                  <View
                    key={
                      participant.userId
                    }
                    style={
                      styles.voicePlayer
                    }
                  >
                    <Text
                      style={
                        styles.voicePlayerName
                      }
                    >
                      {participant.name}
                    </Text>

                    <Text
                      style={
                        styles.voicePlayerStatus
                      }
                    >
                      {participant.speaking
                        ? '🔊 يتحدث'
                        : participant.mic
                        ? '🎙️'
                        : '🔇'}
                    </Text>
                  </View>
                )
              )}
            </View>
          ) : null}
        </View>

        /*
         * --------------------------------------------------
         * PLAYERS
         * --------------------------------------------------
         */

        <View
          style={
            styles.section
          }
        >
          <View
            style={
              styles.sectionHeader
            }
          >
            <Text
              style={
                styles.sectionTitle
              }
            >
              اللاعبون
            </Text>

            <Text
              style={
                styles.sectionCount
              }
            >
              {alivePlayers.length}/
              {players.length} أحياء
            </Text>
          </View>

          {players.map(
            renderPlayer
          )}
        </View>

        /*
         * --------------------------------------------------
         * NIGHT ACTIONS
         * --------------------------------------------------
         */

        {canNightAction ? (
          <View
            style={
              styles.actionSection
            }
          >
            <Text
              style={
                styles.sectionTitle
              }
            >
              مهمتك الليلية
            </Text>

            {nightActions.map(
              (action) => {
                const info =
                  ACTION_INFO[
                    action
                  ];

                return (
                  <View
                    key={action}
                    style={
                      styles.actionCard
                    }
                  >
                    <Text
                      style={
                        styles.actionTitle
                      }
                    >
                      {info.title}
                    </Text>

                    <Text
                      style={
                        styles.actionDescription
                      }
                    >
                      {
                        info.description
                      }
                    </Text>

                    <Text
                      style={
                        styles.targetHint
                      }
                    >
                      {selectedTarget
                        ? `الهدف المحدد: ${
                            profiles[
                              selectedTarget
                            ]?.username ||
                            players.find(
                              (
                                player
                              ) =>
                                player.user_id ===
                                selectedTarget
                            )?.name ||
                            'لاعب'
                          }`
                        : 'اختر لاعبًا من القائمة أعلاه'}
                    </Text>

                    <Pressable
                      style={[
                        styles.primaryButton,
                        info.danger &&
                          styles.dangerButton,
                        (!selectedTarget ||
                          busy) &&
                          styles.disabledButton,
                      ]}
                      onPress={() =>
                        performNightAction(
                          action
                        )
                      }
                      disabled={
                        !selectedTarget ||
                        busy
                      }
                    >
                      {busy ? (
                        <ActivityIndicator
                          color="#fff"
                        />
                      ) : (
                        <Text
                          style={
                            styles.primaryButtonText
                          }
                        >
                          {
                            info.button
                          }
                        </Text>
                      )}
                    </Pressable>
                  </View>
                );
              }
            )}
          </View>
        ) : null}

        /*
         * --------------------------------------------------
         * DAY VOTE
         * --------------------------------------------------
         */

        {isDay &&
        myAlive &&
        !gameFinished ? (
          <View
            style={
              styles.actionSection
            }
          >
            <Text
              style={
                styles.sectionTitle
              }
            >
              التصويت
            </Text>

            <Text
              style={
                styles.actionDescription
              }
            >
              اختر لاعبًا من القائمة أعلاه ثم أكد تصويتك.
            </Text>

            <Text
              style={
                styles.targetHint
              }
            >
              {selectedTarget
                ? `الهدف المحدد: ${
                    profiles[
                      selectedTarget
                    ]?.username ||
                    players.find(
                      (player) =>
                        player.user_id ===
                        selectedTarget
                    )?.name ||
                    'لاعب'
                  }`
                : 'لم تحدد لاعبًا بعد'}
            </Text>

            <Pressable
              style={[
                styles.primaryButton,
                (!selectedTarget ||
                  busy) &&
                  styles.disabledButton,
              ]}
              onPress={
                performVote
              }
              disabled={
                !selectedTarget ||
                busy
              }
            >
              {busy ? (
                <ActivityIndicator
                  color="#fff"
                />
              ) : (
                <Text
                  style={
                    styles.primaryButtonText
                  }
                >
                  تأكيد التصويت
                </Text>
              )}
            </Pressable>
          </View>
        ) : null}

        /*
         * --------------------------------------------------
         * CHAT
         * --------------------------------------------------
         */

        <View
          style={
            styles.chatSection
          }
        >
          <Text
            style={
              styles.sectionTitle
            }
          >
            💬 الدردشة
          </Text>

          {!canChat &&
          !isWaiting ? (
            <View
              style={
                styles.closedChat
              }
            >
              <Text
                style={
                  styles.closedChatText
                }
              >
                الدردشة مغلقة بالنسبة لك حاليًا.
              </Text>
            </View>
          ) : (
            <>
              <View
                style={
                  styles.messagesBox
                }
              >
                {messagesLoading ? (
                  <ActivityIndicator />
                ) : messages.length ===
                  0 ? (
                  <Text
                    style={
                      styles.emptyMessages
                    }
                  >
                    لا توجد رسائل بعد.
                  </Text>
                ) : (
                  messages.map(
                    (message) => {
                      const profile =
                        profiles[
                          message.user_id
                        ];

                      const player =
                        players.find(
                          (
                            item
                          ) =>
                            item.user_id ===
                            message.user_id
                        );

                      return (
                        <View
                          key={
                            message.id
                          }
                          style={
                            styles.messageRow
                          }
                        >
                          <Text
                            style={
                              styles.messageAuthor
                            }
                          >
                            {profile
                              ?.username ||
                              player?.name ||
                              'Player'}
                          </Text>

                          <Text
                            style={
                              styles.messageText
                            }
                          >
                            {
                              message.message
                            }
                          </Text>
                        </View>
                      );
                    }
                  )
                )}
              </View>

              <View
                style={
                  styles.messageComposer
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
                  editable={
                    canChat
                  }
                  onSubmitEditing={() => {
                    void sendMessage();
                  }}
                />

                <Pressable
                  style={[
                    styles.sendButton,
                    (!messageText.trim() ||
                      !canChat) &&
                      styles.disabledButton,
                  ]}
                  onPress={
                    sendMessage
                  }
                  disabled={
                    !messageText.trim() ||
                    !canChat
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
            </>
          )}
        </View>

        /*
         * --------------------------------------------------
         * SPECTATOR
         * --------------------------------------------------
         */

        {!myAlive &&
        !isWaiting &&
        !gameFinished ? (
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
              👻 أنت الآن متفرج
            </Text>

            <Text
              style={
                styles.infoText
              }
            >
              لا يمكنك تنفيذ المهام أو التصويت، لكن يمكنك متابعة اللعبة والاستماع إلى اللاعبين.
            </Text>
          </View>
        ) : null}

        /*
         * --------------------------------------------------
         * GAME FINISHED
         * --------------------------------------------------
         */

        {gameFinished ? (
          <View
            style={
              styles.finishedCard
            }
          >
            <Text
              style={
                styles.finishedEmoji
              }
            >
              🏆
            </Text>

            <Text
              style={
                styles.finishedTitle
              }
            >
              انتهت اللعبة
            </Text>

            {room.winner ? (
              <Text
                style={
                  styles.finishedWinner
                }
              >
                الفائز: {room.winner}
              </Text>
            ) : null}

            <Pressable
              style={
                styles.primaryButton
              }
              onPress={() =>
                router.replace(
                  '/rooms'
                )
              }
            >
              <Text
                style={
                  styles.primaryButtonText
                }
              >
                العودة إلى الغرف
              </Text>
            </Pressable>
          </View>
        ) : null}

        <Pressable
          style={
            styles.leaveButton
          }
          onPress={
            leaveGame
          }
        >
          <Text
            style={
              styles.leaveButtonText
            }
          >
            مغادرة الغرفة
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}
  roleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  roleTitle: {
    color: '#999',
    fontSize: 14,
    fontWeight: '700',
  },

  roleName: {
    color: '#fff',
    fontSize: 27,
    fontWeight: '900',
    marginTop: 10,
  },

  roleDescription: {
    color: '#aaa',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 5,
  },

  deadBanner: {
    backgroundColor: '#211216',
    borderWidth: 1,
    borderColor: '#54212b',
    borderRadius: 10,
    padding: 10,
    marginTop: 14,
  },

  deadBannerText: {
    color: '#ff9b9b',
    fontSize: 13,
    lineHeight: 19,
  },

  eventCard: {
    backgroundColor: '#101114',
    borderRadius: 14,
    padding: 15,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#25272e',
  },

  eventTitle: {
    color: '#aaa',
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 5,
  },

  eventText: {
    color: '#eee',
    fontSize: 14,
    lineHeight: 20,
  },

  section: {
    marginBottom: 14,
  },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },

  sectionTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '900',
  },

  playerCount: {
    color: '#888',
    fontSize: 13,
  },

  hostNotice: {
    backgroundColor: '#1b170c',
    borderWidth: 1,
    borderColor: '#5c481b',
    borderRadius: 12,
    padding: 11,
    marginBottom: 9,
  },

  hostNoticeText: {
    color: '#d9b85c',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    fontWeight: '700',
  },

  playerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111216',
    borderWidth: 1,
    borderColor: '#24262c',
    borderRadius: 15,
    padding: 10,
    marginBottom: 8,
  },

  playerMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },

  playerAvatarWrapper: {
    position: 'relative',
  },

  micStatusBubble: {
    position: 'absolute',
    right: -3,
    bottom: -3,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#3f3a8f',
    borderWidth: 2,
    borderColor: '#111216',
    alignItems: 'center',
    justifyContent: 'center',
  },

  micStatusIcon: {
    fontSize: 9,
  },

  deadPlayerCard: {
    opacity: 0.5,
  },

  selectedPlayerCard: {
    borderColor: '#d4a72c',
    backgroundColor: '#19160d',
  },

  avatar: {
    backgroundColor: '#252831',
  },

  deadAvatar: {
    opacity: 0.55,
  },

  avatarPlaceholder: {
    backgroundColor: '#292c36',
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
    marginLeft: 12,
  },

  playerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },

  playerName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },

  deadName: {
    color: '#aaa',
    textDecorationLine: 'line-through',
  },

  youBadge: {
    color: '#d9b85c',
    backgroundColor: '#2b2513',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    marginLeft: 8,
    fontSize: 10,
    fontWeight: '800',
  },

  hostBadge: {
    color: '#e5c35e',
    backgroundColor: '#2b2513',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    marginLeft: 6,
    fontSize: 10,
    fontWeight: '800',
  },

  playerStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },

  playerStatus: {
    color: '#888',
    fontSize: 12,
  },

  playerVoiceStatus: {
    color: '#8f86cf',
    fontSize: 11,
    marginLeft: 8,
    fontWeight: '700',
  },

  selectedMark: {
    color: '#d9b85c',
    fontSize: 24,
    fontWeight: '900',
    marginLeft: 8,
  },

  kickButton: {
    minWidth: 62,
    height: 38,
    backgroundColor: '#7f2530',
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    marginLeft: 8,
  },

  kickButtonDisabled: {
    opacity: 0.45,
  },

  kickButtonText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '900',
  },

  actionCard: {
    backgroundColor: '#121318',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#2b2d35',
    padding: 18,
    marginBottom: 14,
  },

  actionTitle: {
    color: '#fff',
    fontSize: 19,
    fontWeight: '900',
  },

  actionDescription: {
    color: '#999',
    fontSize: 13,
    lineHeight: 20,
    marginTop: 7,
    marginBottom: 14,
  },

  primaryButton: {
    minHeight: 50,
    backgroundColor: '#3f3a8f',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },

  dangerButton: {
    minHeight: 50,
    backgroundColor: '#8f2633',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },

  voteButton: {
    minHeight: 50,
    backgroundColor: '#735a1b',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },

  disabledButton: {
    opacity: 0.35,
  },

  buttonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '900',
  },

  infoCard: {
    backgroundColor: '#10151b',
    borderWidth: 1,
    borderColor: '#263340',
    borderRadius: 16,
    padding: 17,
    marginBottom: 14,
  },

  infoTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '900',
  },

  infoText: {
    color: '#999',
    marginTop: 7,
    lineHeight: 20,
    fontSize: 13,
  },

  chatCard: {
    backgroundColor: '#101114',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#292b31',
    padding: 15,
    marginBottom: 14,
  },

  chatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },

  chatTitle: {
    color: '#fff',
    fontSize: 19,
    fontWeight: '900',
  },

  chatSubtitle: {
    color: '#777',
    fontSize: 11,
    marginTop: 4,
  },

  onlineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#54c77b',
  },

  messagesBox: {
    minHeight: 90,
    marginBottom: 10,
  },

  messagesLoading: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 25,
  },

  emptyMessages: {
    color: '#777',
    textAlign: 'center',
    paddingVertical: 28,
    fontSize: 13,
  },

  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
  },

  myMessageRow: {
    flexDirection: 'row-reverse',
  },

  messageBubble: {
    flex: 1,
    backgroundColor: '#1b1d23',
    borderRadius: 12,
    paddingHorizontal: 11,
    paddingVertical: 8,
    marginLeft: 8,
  },

  myMessageBubble: {
    marginLeft: 0,
    marginRight: 8,
    backgroundColor: '#24213a',
  },

  messageSender: {
    color: '#c7a84e',
    fontSize: 11,
    fontWeight: '800',
    marginBottom: 3,
  },

  messageText: {
    color: '#eee',
    fontSize: 14,
    lineHeight: 19,
  },

  messageComposer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderTopWidth: 1,
    borderTopColor: '#25272d',
    paddingTop: 10,
  },

  messageInput: {
    flex: 1,
    minHeight: 46,
    maxHeight: 100,
    backgroundColor: '#191b20',
    borderWidth: 1,
    borderColor: '#30323a',
    borderRadius: 12,
    color: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    textAlignVertical: 'top',
  },

  sendButton: {
    height: 46,
    minWidth: 64,
    marginLeft: 8,
    borderRadius: 12,
    backgroundColor: '#3f3a8f',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },

  sendButtonText: {
    color: '#fff',
    fontWeight: '900',
  },

  closedChatCard: {
    backgroundColor: '#111216',
    borderWidth: 1,
    borderColor: '#282a31',
    borderRadius: 16,
    padding: 17,
    marginBottom: 14,
    alignItems: 'center',
  },

  closedChatTitle: {
    color: '#aaa',
    fontSize: 16,
    fontWeight: '900',
  },

  closedChatText: {
    color: '#666',
    fontSize: 12,
    marginTop: 6,
    textAlign: 'center',
  },

  spectatorCard: {
    backgroundColor: '#151116',
    borderWidth: 1,
    borderColor: '#38252f',
    borderRadius: 16,
    padding: 17,
    marginBottom: 14,
  },

  spectatorTitle: {
    color: '#d99ba8',
    fontSize: 17,
    fontWeight: '900',
  },

  spectatorText: {
    color: '#999',
    fontSize: 13,
    lineHeight: 20,
    marginTop: 7,
  },

  refreshButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#30323a',
    marginTop: 4,
  },

  refreshText: {
    color: '#aaa',
    fontWeight: '800',
  },

  finishedCard: {
    backgroundColor: '#15130c',
    borderWidth: 1,
    borderColor: '#5b4820',
    borderRadius: 18,
    padding: 20,
    alignItems: 'center',
    marginTop: 8,
  },

  finishedTitle: {
    color: '#e4c45d',
    fontSize: 23,
    fontWeight: '900',
  },

  finishedText: {
    color: '#ddd',
    fontSize: 16,
    marginTop: 8,
    marginBottom: 16,
  },

  bottomSpace: {
    height: 30,
  },
});
