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

  return `${String(minutes).padStart(2, '0')}:${String(
    remaining
  ).padStart(2, '0')}`;
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

  const voiceRoomRef =
    useRef<Room | null>(null);

  const voiceConnectingRef =
    useRef(false);

  const voiceShouldBeConnectedRef =
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

  useEffect(() => {
    try {
      registerGlobals();
    } catch (error) {
      console.error(
        'LiveKit registerGlobals error:',
        error
      );
    }
  }, []);

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

==================================================

الصوت أصبح متاحًا بمجرد دخول الغرفة.

لا نعتمد على المرحلة الليلية/النهارية.

هذا يمنع قطع LiveKit عند انتقال الجولة.

==================================================
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

==================================================

LIVEKIT FUNCTIONS

==================================================
*/


const disconnectVoice =
useCallback(
async () => {
const currentRoom =
voiceRoomRef.current;

voiceRoomRef.current =  
      null;  

    voiceShouldBeConnectedRef.current =  
      false;  

    if (isMountedRef.current) {  
      setVoiceConnected(false);  
      setMicEnabled(false);  
      setVoiceConnecting(false);  
      setVoiceError(null);  
    }  

    if (currentRoom) {  
      try {  
        await currentRoom.disconnect();  
      } catch (error) {  
        console.error(  
          'LiveKit disconnect error:',  
          error  
        );  
      }  
    }  

    try {  
      await AudioSession.stopAudioSession();  
    } catch (error) {  
      console.error(  
        'AudioSession stop error:',  
        error  
      );  
    }  

    if (isMountedRef.current) {  
      setVoiceParticipantsVersion(  
        (value) => value + 1  
      );  
    }  
  },  
  []  
);

const connectVoice =
useCallback(
async () => {
if (!roomId) return;

/*  
     * لا نسمح بإنشاء اتصالين في نفس الوقت.  
     */  
    if (  
      voiceConnectingRef.current  
    ) {  
      return;  
    }  

    /*  
     * إذا كانت هناك غرفة LiveKit بالفعل،  
     * لا ننشئ Room ثانية.  
     */  
    if (voiceRoomRef.current) {  
      return;  
    }  

    if (  
      isUnmountingRef.current ||  
      !isMountedRef.current  
    ) {  
      return;  
    }  

    voiceConnectingRef.current =  
      true;  

    voiceShouldBeConnectedRef.current =  
      true;  

    if (isMountedRef.current) {  
      setVoiceConnecting(true);  
      setVoiceError(null);  
    }  

    let liveKitRoom:  
      | Room  
      | null = null;  

    try {  
      /*  
       * تشغيل AudioSession قبل LiveKit.  
       *  
       * أي خطأ هنا لا يجب أن يغلق التطبيق.  
       */  
      try {  
        await AudioSession.startAudioSession();  
      } catch (audioError) {  
        console.error(  
          'AudioSession start error:',  
          audioError  
        );  
      }  

      if (  
        isUnmountingRef.current ||  
        !voiceShouldBeConnectedRef.current  
      ) {  
        return;  
      }  

      /*  
       * الحصول على التوكن.  
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
          'لم يتم الحصول على بيانات الاتصال الصوتي.'  
        );  
      }  

      if (  
        isUnmountingRef.current ||  
        !voiceShouldBeConnectedRef.current  
      ) {  
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

const toggleMicrophone =
useCallback(
async () => {
const currentRoom =
voiceRoomRef.current;

if (!currentRoom) {  
      /*  
       * نحاول الاتصال بدل إخراج المستخدم.  
       */  
      await connectVoice();  
      return;  
    }  

    if (!voiceConnected) {  
      Alert.alert(  
        'الصوت غير متصل',  
        'انتظر حتى يكتمل الاتصال الصوتي.'  
      );  
      return;  
    }  

    const nextState =  
      !micEnabled;  

    try {  
      await currentRoom.localParticipant  
        .setMicrophoneEnabled(  
          nextState  
        );  

      if (  
        isMountedRef.current  
      ) {  
        setMicEnabled(  
          nextState  
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
        setMicEnabled(false);  

        setVoiceError(  
          error?.message ||  
            'تعذر تشغيل الميكروفون. تأكد من السماح للتطبيق باستخدام الميكروفون.'  
        );  

        Alert.alert(  
          'تعذر تشغيل الميكروفون',  
          error?.message ||  
            'تأكد من السماح للتطبيق باستخدام الميكروفون.'  
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


---

توصيل / فصل LiveKit


---


*/

/*
  الصوت اختياري:
  لا نتصل بـ LiveKit تلقائيًا عند دخول الغرفة.
  الاتصال يبدأ فقط عندما يضغط اللاعب على زر الميكروفون.
  هذا يمنع AudioSession / WebRTC من التسبب في خروج التطبيق
  مباشرة بعد إنشاء أو دخول الغرفة.
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

/*


---

تنظيف LiveKit عند مغادرة الصفحة


---


*/

useEffect(() => {
return () => {
isUnmountingRef.current =
true;

voiceShouldBeConnectedRef.current =  
    false;  

  const currentRoom =  
    voiceRoomRef.current;  

  voiceRoomRef.current =  
    null;  

  if (currentRoom) {  
    try {  
      currentRoom.disconnect();  
    } catch (error) {  
      console.error(  
        'Unmount LiveKit disconnect error:',  
        error  
      );  
    }  
  }  

  try {  
    AudioSession.stopAudioSession();  
  } catch (error) {  
    console.error(  
      'Unmount AudioSession stop error:',  
      error  
    );  
  }  
};

}, []);

/*


---

MICROPHONE STATUS


---


*/

const isPlayerMicEnabled =
useCallback(
(
userId: string
): boolean => {
void voiceParticipantsVersion;

const currentRoom =  
      voiceRoomRef.current;  

    if (!currentRoom) {  
      return false;  
    }  

    if (  
      currentRoom.localParticipant  
        .identity === userId  
    ) {  
      return micEnabled;  
    }  

    const remoteParticipants =  
      currentRoom.remoteParticipants;  

    let participant:  
      | any  
      | null = null;  

    remoteParticipants.forEach(  
      (item: any) => {  
        if (  
          item.identity ===  
          userId  
        ) {  
          participant =  
            item;  
        }  
      }  
    );  

    if (!participant) {  
      return false;  
    }  

    try {  
      if (  
        typeof participant.isMicrophoneEnabled ===  
        'boolean'  
      ) {  
        return participant.isMicrophoneEnabled;  
      }  
    } catch {}  

    try {  
      const publication =  
        participant.getTrackPublication?.(  
          'microphone'  
        );  

      if (publication) {  
        return !Boolean(  
          publication.isMuted  
        );  
      }  
    } catch {}  

    try {  
      const publications =  
        participant.audioTrackPublications;  

      if (publications) {  
        for (  
          const publication of publications.values()  
        ) {  
          if (  
            publication &&  
            !publication.isMuted  
          ) {  
            return true;  
          }  
        }  
      }  
    } catch {}  

    return false;  
  },  
  [  
    micEnabled,  
    voiceParticipantsVersion,  
  ]  
);

/*


---

HEARTBEAT


---


*/

useEffect(() => {
if (!roomId) return;

let cancelled = false;  

const sendHeartbeat = async () => {  
  if (cancelled) return;  

  try {  
    await heartbeatRoom(  
      roomId  
    );  
  } catch (error) {  
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
    10_000  
  );  

return () => {  
  cancelled = true;  
  clearInterval(interval);  
};

}, [roomId]);

/*


---

INITIAL GAME LOAD


---


*/

useEffect(() => {
if (!roomId) return;

void loadGame(true);

}, [
roomId,
loadGame,
]);

/*


---

COUNTDOWN


---


*/

useEffect(() => {
if (
!gameState?.room
?.phase_ends_at
) {
setSecondsLeft(0);
return;
}

const updateTimer = () => {  
  if (  
    !gameState?.room  
      ?.phase_ends_at  
  ) {  
    return;  
  }  

  const remaining =  
    getSecondsLeft(  
      gameState.room  
        .phase_ends_at  
    );  

  if (  
    isMountedRef.current  
  ) {  
    setSecondsLeft(  
      remaining  
    );  
  }  

  if (  
    remaining <= 0 &&  
    gameState.room.status ===  
      'playing' &&  
    roomId &&  
    !advancingRef.current  
  ) {  
    const now =  
      Date.now();  

    if (  
      now -  
        lastAdvanceRef.current >  
      2500  
    ) {  
      lastAdvanceRef.current =  
        now;  

      advancingRef.current =  
        true;  

      advanceMafiaPhase(  
        roomId  
      )  
        .then(() => {  
          if (  
            isMountedRef.current  
          ) {  
            return loadGame(false);  
          }  
          return null;  
        })  
        .catch((error) => {  
          console.error(  
            'advance phase error:',  
            error  
          );  
        })  
        .finally(() => {  
          advancingRef.current =  
            false;  
        });  
    }  
  }  
};

updateTimer();

const interval =
setInterval(
updateTimer,
1000
);

return () => {
clearInterval(interval);
};

}, [
gameState?.room
?.phase_ends_at,
gameState?.room?.status,
roomId,
loadGame,
]);

/*


---

REALTIME


---


*/

useEffect(() => {
if (!roomId) return;

let cancelled = false;  

const channel =  
  supabase  
    .channel(  
      `room-${roomId}`  
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
        if (cancelled) return;  

        void loadGame(false);  
      }  
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
        if (cancelled) return;  

        void loadGame(false);  
      }  
    )  
    .subscribe();  

return () => {  
  cancelled = true;  

  try {  
    void supabase.removeChannel(  
      channel  
    );  
  } catch (error) {  
    console.error(  
      'remove realtime channel error:',  
      error  
    );  
  }  
};

}, [
roomId,
loadGame,
]);

/*


---

CURRENT PLAYER


---


*/

const currentPlayer =
useMemo(
() =>
players.find(
(player) =>
player.user_id ===
currentUserId
) ||
null,
[
players,
currentUserId,
]
);

const currentPlayerAlive =
Boolean(
currentPlayer?.is_alive
);

const alivePlayers =
useMemo(
() =>
players.filter(
(player) =>
player.is_alive
),
[
players,
]
);

const alivePlayerCount =
alivePlayers.length;

const mafiaPlayers =
useMemo(
() =>
players.filter(
(player) =>
player.role ===
'mafia' &&
player.is_alive
),
[
players,
]
);

const detectivePlayers =
useMemo(
() =>
players.filter(
(player) =>
player.role ===
'detective' &&
player.is_alive
),
[
players,
]
);

const doctorPlayers =
useMemo(
() =>
players.filter(
(player) =>
player.role ===
'doctor' &&
player.is_alive
),
[
players,
]
);

/*


---

PLAYER ACTIONS


---


*/

const handleLeaveRoom =
useCallback(
async () => {
if (!roomId) return;

try {  
      await leaveRoom(  
        roomId  
      );  

      if (  
        isMountedRef.current  
      ) {  
        router.replace(  
          '/rooms'  
        );  
      }  
    } catch (error: any) {  
      console.error(  
        'leaveRoom error:',  
        error  
      );  

      Alert.alert(  
        'خطأ',  
        error?.message ||  
          'تعذر مغادرة الغرفة.'  
      );  
    }  
  },  
  [roomId, router]  
);

const handleKickPlayer =
useCallback(
async (
player: GamePlayer
) => {
if (!roomId) return;

if (  
      player.user_id ===  
      currentUserId  
    ) {  
      return;  
    }  

    Alert.alert(  
      'طرد اللاعب',  
      `هل أنت متأكد من طرد ${  
        player.display_name ||  
        'هذا اللاعب'  
      }؟`,  
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
              await kickRoomPlayer(  
                roomId,  
                player.user_id  
              );  

              await loadGame(  
                false  
              );  
            } catch (error: any) {  
              console.error(  
                'kick player error:',  
                error  
              );  

              Alert.alert(  
                'خطأ',  
                error?.message ||  
                  'تعذر طرد اللاعب.'  
              );  
            }  
          },  
        },  
      ]  
    );  
  },  
  [  
    roomId,  
    currentUserId,  
    loadGame,  
  ]  
);

const handleDayVote =
useCallback(
async (
targetUserId: string
) => {
if (!roomId) return;

if (  
      !canDayVote ||  
      !currentPlayerAlive  
    ) {  
      return;  
    }  

    try {  
      await submitDayVote(  
        roomId,  
        targetUserId  
      );  

      await loadGame(  
        false  
      );  
    } catch (error: any) {  
      console.error(  
        'day vote error:',  
        error  
      );  

      Alert.alert(  
        'خطأ',  
        error?.message ||  
          'تعذر تسجيل التصويت.'  
      );  
    }  
  },  
  [  
    roomId,  
    canDayVote,  
    currentPlayerAlive,  
    loadGame,  
  ]  
);

const handleNightAction =
useCallback(
async (
action: NightAction,
targetUserId:
string | null
) => {
if (!roomId) return;

if (  
      !canNightAction ||  
      !myRole  
    ) {  
      return;  
    }  

    try {  
      await submitNightAction(  
        roomId,  
        action,  
        targetUserId  
      );  

      await loadGame(  
        false  
      );  
    } catch (error: any) {  
      console.error(  
        'night action error:',  
        error  
      );  

      Alert.alert(  
        'خطأ',  
        error?.message ||  
          'تعذر تنفيذ الإجراء.'  
      );  
    }  
  },  
  [  
    roomId,  
    canNightAction,  
    myRole,  
    loadGame,  
  ]  
);

const handleStartGame =
useCallback(
async () => {
if (!roomId) return;

try {  
      await advanceMafiaPhase(  
        roomId  
      );  

      await loadGame(  
        false  
      );  
    } catch (error: any) {  
      console.error(  
        'start game error:',  
        error  
      );  

      Alert.alert(  
        'خطأ',  
        error?.message ||  
          'تعذر بدء اللعبة.'  
      );  
    }  
  },  
  [roomId, loadGame]  
);

/*


---

ROLE / GAME UI HELPERS


---


*/

const getPlayerDisplayName =
useCallback(
(
player: GamePlayer
) => {
return (
player.display_name ||
player.username ||
'لاعب'
);
},
[]);

const getPlayerInitial =
useCallback(
(
player: GamePlayer
) => {
const name =
getPlayerDisplayName(
player
);

return (
name
.trim()
.charAt(0)
.toUpperCase() ||
'?'
);
},
[
getPlayerDisplayName,
]);

const getPlayerRoleText =
useCallback(
(
player: GamePlayer
) => {
if (
!gameFinished
) {
return null;
}

if (!player.role) {
return null;
}

return (
ROLE_LABELS[
player.role
] ||
player.role
);
},
[
gameFinished,
]);

/*


---

RENDER


---


*/

if (loading) {
return (
<View
style={
styles.centered
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

if (error) {
return (
<View
style={
styles.centered
}
>
<Text
style={
styles.errorTitle
}
>
حدث خطأ
</Text>

<Text
style={
styles.errorText
}
>
{error}
</Text>

<Pressable
style={
styles.primaryButton
}
onPress={() =>
void loadGame(
true
)
}
>
<Text
style={
styles.primaryButtonText
}
>
إعادة المحاولة
</Text>
</Pressable>

<Pressable
style={
styles.secondaryButton
}
onPress={() =>
router.replace(
'/rooms'
)
}
>
<Text
style={
styles.secondaryButtonText
}
>
العودة للغرف
</Text>
</Pressable>
</View>
);
}

if (!gameState?.room) {
return (
<View
style={
styles.centered
}
>
<Text
style={
styles.errorTitle
}
>
الغرفة غير موجودة
</Text>

<Text
style={
styles.errorText
}
>
تعذر العثور على هذه الغرفة.
</Text>

<Pressable
style={
styles.secondaryButton
}
onPress={() =>
router.replace(
'/rooms'
)
}
>
<Text
style={
styles.secondaryButtonText
}
>
العودة للغرف
</Text>
</Pressable>
</View>
);
}

const roomStatusText =
isWaiting
? 'في الانتظار'
: gameFinished
? 'انتهت اللعبة'
: isNight
? 'الليل'
: 'النهار';

const phaseDescription =
isWaiting
? 'انتظر حتى يبدأ منشئ الغرفة اللعبة.'
: gameFinished
? 'انتهت اللعبة.'
: isNight
? 'نفّذ دورك الليلي.'
: 'وقت النقاش والتصويت.';

const voiceStatusText =
voiceConnecting
? 'جارٍ الاتصال بالصوت...'
: voiceConnected
? 'الصوت متصل'
: 'الصوت غير متصل';

const voiceButtonText =
voiceConnecting
? 'جارٍ الاتصال...'
: voiceConnected
? micEnabled
? 'إيقاف الميكروفون'
: 'تشغيل الميكروفون'
: 'تشغيل الصوت';

return (
<View
style={
styles.container
}
>
  <View
        style={[
          styles.phaseCard,
          isNight
            ? styles.nightCard
            : styles.dayCard,
        ]}
      >
        <Text
          style={
            styles.phaseTitle
          }
        >
          {isNight
            ? '🌙 الليل'
            : '☀️ النهار'}
        </Text>

        <Text
          style={
            styles.phaseDescription
          }
        >
          {phaseDescription}
        </Text>

        {secondsLeft > 0 && (
          <Text
            style={
              styles.timerText
            }
          >
            {formatTime(
              secondsLeft
            )}
          </Text>
        )}
      </View>
    )}

    {gameFinished && (
      <View
        style={
          styles.winnerCard
        }
      >
        <Text
          style={
            styles.winnerTitle
          }
        >
          🏆 انتهت اللعبة
        </Text>

        <Text
          style={
            styles.winnerText
          }
        >
          الفائز:{' '}
          {room.winner ||
            'غير محدد'}
        </Text>
      </View>
    )}

    <View
      style={
        styles.roleCard
      }
    >
      <Text
        style={
          styles.sectionTitle
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

      <View
        style={
          styles.statusRow
        }
      >
        <View
          style={[
            styles.statusDot,
            currentPlayerAlive
              ? styles.aliveDot
              : styles.deadDot,
          ]}
        />

        <Text
          style={
            styles.statusText
          }
        >
          {currentPlayerAlive
            ? 'حي'
            : 'ميت'}
        </Text>
      </View>
    </View>

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
              styles.sectionTitle
            }
          >
            🎙️ الصوت
          </Text>

          <Text
            style={
              styles.voiceStatus
            }
          >
            {voiceStatusText}
          </Text>
        </View>

        <Pressable
          style={[
            styles.micButton,
            micEnabled &&
              styles.micButtonActive,
            voiceConnecting &&
              styles.disabledMicButton,
          ]}
          disabled={
            voiceConnecting
          }
          onPress={
            toggleMicrophone
          }
        >
          <Text
            style={
              styles.micButtonText
            }
          >
            {voiceButtonText}
          </Text>
        </Pressable>
      </View>

      <Text
        style={
          styles.voiceHint
        }
      >
        اضغط على تشغيل للاتصال بالصوت
      </Text>

      {voiceError && (
        <Text
          style={
            styles.voiceError
          }
        >
          {voiceError}
        </Text>
      )}

      <View
        style={
          styles.voiceParticipants
        }
      >
        {players.map(
          (player) => (
            <View
              key={
                player.id
              }
              style={
                styles.voiceParticipant
              }
            >
              <View
                style={
                  styles.voiceParticipantAvatar
                }
              >
                <Text
                  style={
                    styles.voiceParticipantInitial
                  }
                >
                  {getPlayerInitial(
                    player
                  )}
                </Text>
              </View>

              <View
                style={
                  styles.voiceParticipantInfo
                }
              >
                <Text
                  style={
                    styles.voiceParticipantName
                  }
                  numberOfLines={
                    1
                  }
                >
                  {getPlayerDisplayName(
                    player
                  )}
                </Text>

                <Text
                  style={
                    styles.voiceParticipantStatus
                  }
                >
                  {isPlayerMicEnabled(
                    player.user_id
                  )
                    ? '🎙️ يتحدث'
                    : '🔇 مكتوم'}
                </Text>
              </View>
            </View>
          )
        )}
      </View>
    </View>

    {canNightAction && (
      <View
        style={
          styles.actionCard
        }
      >
        <Text
          style={
            styles.sectionTitle
          }
        >
          🌙 مهمتك الليلية
        </Text>

        <Text
          style={
            styles.actionHint
          }
        >
          اختر لاعبًا ثم اختر المهمة التي تريد تنفيذها.
        </Text>

        <View
          style={
            styles.playersGrid
          }
        >
          {players
            .filter(
              (player) =>
                player.alive &&
                player.id !==
                  gameState.my_player_id
            )
            .map(
              (player) => {
                const selected =
                  selectedTarget ===
                  player.id;

                return (
                  <Pressable
                    key={
                      player.id
                    }
                    style={[
                      styles.playerCard,
                      selected &&
                        styles.selectedPlayerCard,
                    ]}
                    onPress={() =>
                      selectTarget(
                        player.id
                      )
                    }
                  >
                    <View
                      style={
                        styles.playerAvatar
                      }
                    >
                      <Text
                        style={
                          styles.playerAvatarText
                        }
                      >
                        {getPlayerInitial(
                          player
                        )}
                      </Text>
                    </View>

                    <Text
                      style={
                        styles.playerName
                      }
                      numberOfLines={
                        1
                      }
                    >
                      {getPlayerDisplayName(
                        player
                      )}
                    </Text>

                    <Text
                      style={
                        styles.playerState
                      }
                    >
                      حي
                    </Text>
                  </Pressable>
                );
              }
            )}
        </View>

        {selectedTarget && (
          <View
            style={
              styles.selectedTargetBox
            }
          >
            <Text
              style={
                styles.selectedTargetText
              }
            >
              الهدف:{' '}
              {(() => {
                const target =
                  players.find(
                    (player) =>
                      player.id ===
                      selectedTarget
                  );

                return target
                  ? getPlayerDisplayName(
                      target
                    )
                  : 'غير محدد';
              })()}
            </Text>
          </View>
        )}

        <View
          style={
            styles.actionsList
          }
        >
          {nightActions.map(
            (action) => {
              const info =
                ACTION_INFO[
                  action
                ];

              return (
                <Pressable
                  key={
                    action
                  }
                  style={[
                    styles.actionButton,
                    (!selectedTarget ||
                      busy) &&
                      styles.disabledButton,
                  ]}
                  disabled={
                    !selectedTarget ||
                    busy
                  }
                  onPress={() =>
                    void performNightAction(
                      action
                    )
                  }
                >
                  <Text
                    style={
                      styles.actionButtonText
                    }
                  >
                    {info.button}
                  </Text>

                  <Text
                    style={
                      styles.actionButtonDescription
                    }
                  >
                    {info.description}
                  </Text>
                </Pressable>
              );
            }
          )}
        </View>
      </View>
    )}

    {isDay &&
      currentPlayerAlive &&
      !gameFinished && (
        <View
          style={
            styles.actionCard
          }
        >
          <Text
            style={
              styles.sectionTitle
            }
          >
            ☀️ التصويت
          </Text>

          <Text
            style={
              styles.actionHint
            }
          >
            اختر اللاعب الذي تريد التصويت ضده.
          </Text>

          <View
            style={
              styles.playersGrid
            }
          >
            {players
              .filter(
                (player) =>
                  player.alive &&
                  player.id !==
                    gameState.my_player_id
              )
              .map(
                (player) => {
                  const selected =
                    selectedTarget ===
                    player.id;

                  return (
                    <Pressable
                      key={
                        player.id
                      }
                      style={[
                        styles.playerCard,
                        selected &&
                          styles.selectedPlayerCard,
                      ]}
                      onPress={() =>
                        selectTarget(
                          player.id
                        )
                      }
                    >
                      <View
                        style={
                          styles.playerAvatar
                        }
                      >
                        <Text
                          style={
                            styles.playerAvatarText
                          }
                        >
                          {getPlayerInitial(
                            player
                          )}
                        </Text>
                      </View>

                      <Text
                        style={
                          styles.playerName
                        }
                        numberOfLines={
                          1
                        }
                      >
                        {getPlayerDisplayName(
                          player
                        )}
                      </Text>

                      <Text
                        style={
                          styles.playerState
                        }
                      >
                        حي
                      </Text>
                    </Pressable>
                  );
                }
              )}
          </View>

          <Pressable
            style={[
              styles.voteButton,
              (!selectedTarget ||
                busy) &&
                styles.disabledButton,
            ]}
            disabled={
              !selectedTarget ||
              busy
            }
            onPress={
              performVote
            }
          >
            <Text
              style={
                styles.voteButtonText
              }
            >
              {busy
                ? 'جارٍ التصويت...'
                : 'تأكيد التصويت'}
            </Text>
          </Pressable>
        </View>
      )}

    <View
      style={
        styles.playersCard
      }
    >
      <View
        style={
          styles.playersHeader
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
            styles.playerCount
          }
        >
          {players.length}
        </Text>
      </View>

      {players.map(
        (player) => {
          const isMe =
            player.user_id ===
            currentUserId;

          const playerName =
            getPlayerDisplayName(
              player
            );

          const isAlive =
            player.alive ??
            player.is_alive;

          return (
            <View
              key={
                player.id
              }
              style={
                styles.playerRow
              }
            >
              <View
                style={
                  styles.playerRowAvatar
                }
              >
                <Text
                  style={
                    styles.playerRowAvatarText
                  }
                >
                  {getPlayerInitial(
                    player
                  )}
                </Text>
              </View>

              <View
                style={
                  styles.playerRowInfo
                }
              >
                <View
                  style={
                    styles.playerRowNameContainer
                  }
                >
                  <Text
                    style={
                      styles.playerRowName
                    }
                    numberOfLines={
                      1
                    }
                  >
                    {playerName}
                  </Text>

                  {isMe && (
                    <Text
                      style={
                        styles.youBadge
                      }
                    >
                      أنت
                    </Text>
                  )}
                </View>

                <Text
                  style={
                    styles.playerRowStatus
                  }
                >
                  {isAlive
                    ? 'حي'
                    : 'ميت'}

                  {gameFinished &&
                    getPlayerRoleText(
                      player
                    )
                      ? ` • ${getPlayerRoleText(
                          player
                        )}`
                      : ''}
                </Text>
              </View>

              {canKick &&
                !isMe && (
                  <Pressable
                    style={
                      styles.kickButton
                    }
                    disabled={
                      kickingUserId ===
                      player.user_id
                    }
                    onPress={() =>
                      void kickPlayer(
                        player
                      )
                    }
                  >
                    <Text
                      style={
                        styles.kickButtonText
                      }
                    >
                      {kickingUserId ===
                      player.user_id
                        ? '...'
                        : 'طرد'}
                    </Text>
                  </Pressable>
                )}
            </View>
          );
        }
      )}
    </View>

    <View
      style={
        styles.chatCard
      }
    >
      <Text
        style={
          styles.sectionTitle
        }
      >
        💬 الدردشة
      </Text>

      <View
        style={
          styles.messagesContainer
        }
      >
        {messages.length ===
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
              const sender =
                profiles[
                  message.user_id
                ]?.username ||
                message.username ||
                'Player';

              const isMine =
                message.user_id ===
                currentUserId;

              return (
                <View
                  key={
                    message.id
                  }
                  style={[
                    styles.messageRow,
                    isMine &&
                      styles.myMessageRow,
                  ]}
                >
                  <View
                    style={[
                      styles.messageBubble,
                      isMine &&
                        styles.myMessageBubble,
                    ]}
                  >
                    <Text
                      style={[
                        styles.messageSender,
                        isMine &&
                          styles.myMessageSender,
                      ]}
                    >
                      {sender}
                    </Text>

                    <Text
                      style={[
                        styles.messageText,
                        isMine &&
                          styles.myMessageText,
                      ]}
                    >
                      {message.message}
                    </Text>
                  </View>
                </View>
              );
            }
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
            styles.chatInput
          }
          value={
            messageText
          }
          onChangeText={
            setMessageText
          }
          placeholder="اكتب رسالة..."
          placeholderTextColor="#777"
          editable={
            canChat &&
            !busy
          }
          multiline
          maxLength={
            500
          }
        />

        <Pressable
          style={[
            styles.sendButton,
            (!canChat ||
              !messageText.trim() ||
              busy) &&
              styles.disabledButton,
          ]}
          disabled={
            !canChat ||
            !messageText.trim() ||
            busy
          }
          onPress={
            sendMessage
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

    {isWaiting &&
      canStartGame && (
        <Pressable
          style={
            styles.startButton
          }
          onPress={
            handleStartGame
          }
        >
          <Text
            style={
              styles.startButtonText
            }
          >
            🎮 بدء اللعبة
          </Text>
        </Pressable>
      )}

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
  const styles =
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: '#0b0b0f',
    },

    scrollContent: {
      padding: 16,
      paddingBottom: 40,
    },

    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      backgroundColor: '#0b0b0f',
    },

    loadingText: {
      color: '#fff',
      marginTop: 12,
      fontSize: 16,
      textAlign: 'center',
    },

    errorTitle: {
      color: '#fff',
      fontSize: 22,
      fontWeight: '700',
      marginBottom: 8,
      textAlign: 'center',
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
      marginBottom: 16,
    },

    headerTitle: {
      color: '#fff',
      fontSize: 24,
      fontWeight: '800',
    },

    roomCode: {
      color: '#aaa',
      fontSize: 14,
      marginTop: 4,
    },

    phaseCard: {
      borderRadius: 18,
      padding: 18,
      marginBottom: 14,
      borderWidth: 1,
    },

    nightCard: {
      backgroundColor: '#17152b',
      borderColor: '#3b356d',
    },

    dayCard: {
      backgroundColor: '#211d12',
      borderColor: '#66552a',
    },

    phaseTitle: {
      color: '#fff',
      fontSize: 21,
      fontWeight: '800',
      marginBottom: 6,
    },

    phaseDescription: {
      color: '#c9c9c9',
      fontSize: 14,
      lineHeight: 20,
    },

    timerText: {
      color: '#fff',
      fontSize: 32,
      fontWeight: '900',
      marginTop: 12,
      textAlign: 'center',
    },

    winnerCard: {
      backgroundColor: '#182018',
      borderColor: '#415f41',
      borderWidth: 1,
      borderRadius: 18,
      padding: 18,
      marginBottom: 14,
      alignItems: 'center',
    },

    winnerTitle: {
      color: '#fff',
      fontSize: 22,
      fontWeight: '800',
      marginBottom: 8,
    },

    winnerText: {
      color: '#cfcfcf',
      fontSize: 16,
    },

    roleCard: {
      backgroundColor: '#141419',
      borderRadius: 18,
      borderWidth: 1,
      borderColor: '#282832',
      padding: 18,
      marginBottom: 14,
    },

    sectionTitle: {
      color: '#fff',
      fontSize: 18,
      fontWeight: '800',
      marginBottom: 8,
    },

    roleTitle: {
      color: '#fff',
      fontSize: 24,
      fontWeight: '900',
      marginBottom: 6,
    },

    roleDescription: {
      color: '#aaa',
      fontSize: 14,
      lineHeight: 20,
    },

    statusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 12,
    },

    statusDot: {
      width: 9,
      height: 9,
      borderRadius: 9,
      marginRight: 7,
    },

    aliveDot: {
      backgroundColor: '#54d16b',
    },

    deadDot: {
      backgroundColor: '#e05252',
    },

    statusText: {
      color: '#bbb',
      fontSize: 13,
    },

    voiceCard: {
      backgroundColor: '#141419',
      borderRadius: 18,
      borderWidth: 1,
      borderColor: '#282832',
      padding: 18,
      marginBottom: 14,
    },

    voiceHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },

    voiceStatus: {
      color: '#999',
      fontSize: 13,
    },

    voiceHint: {
      color: '#777',
      fontSize: 13,
      marginTop: 12,
    },

    voiceError: {
      color: '#ff7777',
      fontSize: 13,
      marginTop: 10,
      lineHeight: 18,
    },

    micButton: {
      minWidth: 130,
      paddingHorizontal: 14,
      paddingVertical: 11,
      borderRadius: 12,
      backgroundColor: '#292934',
      alignItems: 'center',
      justifyContent: 'center',
    },

    micButtonActive: {
      backgroundColor: '#315f3b',
    },

    disabledMicButton: {
      opacity: 0.5,
    },

    micButtonText: {
      color: '#fff',
      fontSize: 13,
      fontWeight: '700',
    },

    voiceParticipants: {
      marginTop: 16,
      gap: 8,
    },

    voiceParticipant: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#101014',
      borderRadius: 12,
      padding: 10,
    },

    voiceParticipantAvatar: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: '#292934',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 10,
    },

    voiceParticipantInitial: {
      color: '#fff',
      fontSize: 15,
      fontWeight: '800',
    },

    voiceParticipantInfo: {
      flex: 1,
    },

    voiceParticipantName: {
      color: '#fff',
      fontSize: 14,
      fontWeight: '700',
    },

    voiceParticipantStatus: {
      color: '#888',
      fontSize: 12,
      marginTop: 2,
    },

    actionCard: {
      backgroundColor: '#141419',
      borderRadius: 18,
      borderWidth: 1,
      borderColor: '#282832',
      padding: 18,
      marginBottom: 14,
    },

    actionHint: {
      color: '#999',
      fontSize: 13,
      lineHeight: 19,
      marginBottom: 14,
    },

    playersGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },

    playerCard: {
      width: '31%',
      minHeight: 100,
      borderRadius: 14,
      backgroundColor: '#101014',
      borderWidth: 1,
      borderColor: '#25252e',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 8,
    },

    selectedPlayerCard: {
      borderColor: '#fff',
      backgroundColor: '#20202a',
    },

    playerAvatar: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: '#292934',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 7,
    },

    playerAvatarText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '800',
    },

    playerName: {
      color: '#fff',
      fontSize: 12,
      fontWeight: '700',
      textAlign: 'center',
    },

    playerState: {
      color: '#6bcf79',
      fontSize: 11,
      marginTop: 3,
    },

    selectedTargetBox: {
      backgroundColor: '#20202a',
      borderRadius: 10,
      padding: 11,
      marginTop: 14,
    },

    selectedTargetText: {
      color: '#fff',
      fontSize: 13,
      fontWeight: '700',
      textAlign: 'center',
    },

    actionsList: {
      marginTop: 14,
      gap: 10,
    },

    actionButton: {
      backgroundColor: '#24242e',
      borderRadius: 12,
      padding: 14,
    },

    actionButtonText: {
      color: '#fff',
      fontSize: 15,
      fontWeight: '800',
      marginBottom: 3,
    },

    actionButtonDescription: {
      color: '#999',
      fontSize: 12,
      lineHeight: 17,
    },

    disabledButton: {
      opacity: 0.45,
    },

    voteButton: {
      backgroundColor: '#6b3b3b',
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: 14,
    },

    voteButtonText: {
      color: '#fff',
      fontSize: 15,
      fontWeight: '800',
    },

    playersCard: {
      backgroundColor: '#141419',
      borderRadius: 18,
      borderWidth: 1,
      borderColor: '#282832',
      padding: 18,
      marginBottom: 14,
    },

    playersHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
    },

    playerCount: {
      color: '#aaa',
      fontSize: 14,
      fontWeight: '700',
    },

    playerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: '#202027',
    },

    playerRowAvatar: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: '#292934',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 10,
    },

    playerRowAvatarText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '800',
    },

    playerRowInfo: {
      flex: 1,
      minWidth: 0,
    },

    playerRowNameContainer: {
      flexDirection: 'row',
      alignItems: 'center',
    },

    playerRowName: {
      color: '#fff',
      fontSize: 14,
      fontWeight: '700',
      flexShrink: 1,
    },

    youBadge: {
      color: '#8e8eff',
      fontSize: 11,
      fontWeight: '700',
      marginLeft: 6,
    },

    playerRowStatus: {
      color: '#888',
      fontSize: 12,
      marginTop: 3,
    },

    kickButton: {
      backgroundColor: '#482525',
      borderRadius: 9,
      paddingHorizontal: 11,
      paddingVertical: 8,
      marginLeft: 8,
    },

    kickButtonText: {
      color: '#ff9a9a',
      fontSize: 12,
      fontWeight: '800',
    },

    chatCard: {
      backgroundColor: '#141419',
      borderRadius: 18,
      borderWidth: 1,
      borderColor: '#282832',
      padding: 18,
      marginBottom: 14,
    },

    messagesContainer: {
      maxHeight: 320,
      marginBottom: 12,
    },

    emptyMessages: {
      color: '#777',
      fontSize: 13,
      textAlign: 'center',
      paddingVertical: 18,
    },

    messageRow: {
      flexDirection: 'row',
      marginBottom: 8,
    },

    myMessageRow: {
      justifyContent: 'flex-end',
    },

    messageBubble: {
      maxWidth: '85%',
      backgroundColor: '#202027',
      borderRadius: 12,
      paddingHorizontal: 11,
      paddingVertical: 8,
    },

    myMessageBubble: {
      backgroundColor: '#303052',
    },

    messageSender: {
      color: '#999',
      fontSize: 11,
      fontWeight: '700',
      marginBottom: 3,
    },

    myMessageSender: {
      color: '#b5b5e8',
    },

    messageText: {
      color: '#eee',
      fontSize: 13,
      lineHeight: 18,
    },

    myMessageText: {
      color: '#fff',
    },

    chatInputRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 8,
    },

    chatInput: {
      flex: 1,
      minHeight: 45,
      maxHeight: 100,
      backgroundColor: '#0f0f13',
      borderRadius: 12,
      borderWidth: 1,
      borderColor: '#292932',
      color: '#fff',
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 14,
    },

    sendButton: {
      backgroundColor: '#35355b',
      borderRadius: 12,
      paddingHorizontal: 15,
      paddingVertical: 13,
      alignItems: 'center',
      justifyContent: 'center',
    },

    sendButtonText: {
      color: '#fff',
      fontSize: 13,
      fontWeight: '800',
    },

    startButton: {
      backgroundColor: '#315f3b',
      borderRadius: 14,
      paddingVertical: 15,
      alignItems: 'center',
      marginBottom: 12,
    },

    startButtonText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '900',
    },

    primaryButton: {
      backgroundColor: '#35355b',
      borderRadius: 12,
      paddingHorizontal: 20,
      paddingVertical: 13,
      marginBottom: 10,
      minWidth: 150,
      alignItems: 'center',
    },

    primaryButtonText: {
      color: '#fff',
      fontSize: 14,
      fontWeight: '800',
    },

    secondaryButton: {
      backgroundColor: '#202027',
      borderRadius: 12,
      paddingHorizontal: 20,
      paddingVertical: 13,
      minWidth: 150,
      alignItems: 'center',
    },

    secondaryButtonText: {
      color: '#ddd',
      fontSize: 14,
      fontWeight: '700',
    },

    leaveButton: {
      backgroundColor: '#482525',
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: 4,
    },

    leaveButtonText: {
      color: '#ff9b9b',
      fontSize: 15,
      fontWeight: '800',
    },
  });
