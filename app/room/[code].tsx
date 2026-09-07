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

try {
registerGlobals();
} catch (error) {
console.error(
'LiveKit registerGlobals error:',
error
);
}

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

«;»

type ExtendedGameRoom =
GameState['room'] & {
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

const ROLE_ACTIONS: Partial<
Record<GameRole, NightAction[]>

«= {
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
};»

const ACTION_INFO: Record<
NightAction,
{
title: string;
description: string;
button: string;
danger?: boolean;
}

«= {
kill: {
title: '🔪 مهمة المافيا',
description:
'اختر لاعبًا حيًا واحدًا للقضاء عليه.',
button: 'تنفيذ القتل',
danger: true,
},»

protect: {
title: '🩺 مهمة الطبيب',
description:
'اختر لاعبًا واحدًا لحمايته هذه الليلة.',
button: 'حماية اللاعب',
},

investigate: {
title: '🔎 مهمة المحقق',
description:
'يمكنك التحقيق مع شخص واحد فقط كل ليلة.',
button: 'التحقيق',
},

spy: {
title: '🕵️ مهمة الجاسوس',
description:
'اختر لاعبًا حيًا لتنفيذ قدرة الجاسوس عليه.',
button: 'تنفيذ قدرة الجاسوس',
},

guard: {
title: '🛡️ مهمة الحارس الشخصي',
description:
'اختر لاعبًا حيًا لتنفيذ قدرة الحارس عليه.',
button: 'حماية اللاعب',
},

sheriff_check: {
title: '⭐ مهمة الشريف',
description:
'افحص لاعبًا حيًا باستخدام قدرة الشريف.',
button: 'فحص اللاعب',
},

witch_save: {
title: '🧙‍♀️ إنقاذ الساحرة',
description:
'استخدم قدرة الإنقاذ على لاعب حي.',
button: 'إنقاذ اللاعب',
},

witch_kill: {
title: '☠️ قتل الساحرة',
description:
'استخدم قدرة القتل على لاعب حي.',
button: 'تنفيذ القتل',
danger: true,
},

ghoul: {
title: '👹 قدرة الغول',
description:
'اختر لاعبًا حيًا لتنفيذ قدرة الغول عليه.',
button: 'تنفيذ قدرة الغول',
},

cult_convert: {
title: '☥ تحويل الطائفة',
description:
'اختر لاعبًا حيًا لمحاولة تحويله إلى عضو في الطائفة.',
button: 'تحويل اللاعب',
},
};

function getSecondsLeft(
endsAt: string | null | undefined
): number {
if (!endsAt) return 0;

const end =
new Date(endsAt).getTime();

return Math.max(
0,
Math.ceil(
(end - Date.now()) / 1000
)
);
}

function formatTime(
seconds: number
): string {
const safe = Math.max(
0,
seconds
);

const minutes = Math.floor(
safe / 60
);

const remaining =
safe % 60;

return "${String( minutes ).padStart(2, '0')}:${String( remaining ).padStart(2, '0')}";
}

function getEventText(
event: GameState['room']['last_event']
) {
if (!event) return null;

if (typeof event === 'string') {
return event;
}

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
!player.alive &&
styles.deadAvatar,
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
!player.alive &&
styles.deadAvatar,
]}
>
<Text
style={styles.avatarText}
>
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

const routeValue = Array.isArray(
params.code
)
? params.code[0]
: params.code;

const [
roomId,
setRoomId,
] = useState<string | null>(
null
);

const [
resolvingRoom,
setResolvingRoom,
] = useState(true);

const [
loading,
setLoading,
] = useState(true);

const [
refreshing,
setRefreshing,
] = useState(false);

const [
gameState,
setGameState,
] = useState<GameState | null>(
null
);

const [
myRole,
setMyRole,
] = useState<GameRole | null>(
null
);

const [
myAlive,
setMyAlive,
] = useState(true);

const [
profiles,
setProfiles,
] = useState<ProfileMap>({});

const [
selectedTarget,
setSelectedTarget,
] = useState<string | null>(
null
);

const [
busy,
setBusy,
] = useState(false);

const [
secondsLeft,
setSecondsLeft,
] = useState(0);

const [
messages,
setMessages,
] = useState<Message[]>([]);

const [
messageText,
setMessageText,
] = useState('');

const [
messagesLoading,
setMessagesLoading,
] = useState(false);

const [
kickingUserId,
setKickingUserId,
] = useState<string | null>(
null
);

const voiceRoomRef =
useRef<Room | null>(null);

const voiceConnectingRef =
useRef(false);

const voiceShouldBeConnectedRef =
useRef(false);

const voiceOperationRef =
useRef(0);

const audioSessionStartedRef =
useRef(false);

const isUnmountingRef =
useRef(false);

const isMountedRef =
useRef(true);

const [
voiceConnected,
setVoiceConnected,
] = useState(false);

const [
voiceConnecting,
setVoiceConnecting,
] = useState(false);

const [
micEnabled,
setMicEnabled,
] = useState(false);

const [
voiceError,
setVoiceError,
] = useState<string | null>(
null
);

const [
voiceParticipantsVersion,
setVoiceParticipantsVersion,
] = useState(0);

const advancingRef =
useRef(false);

/*

* ---
* RESOLVE ROOM
* ---

*/

useEffect(() => {
let cancelled = false;

const resolveRoomId =
  async () => {
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

    if (
      uuidRegex.test(routeValue)
    ) {
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
        .eq(
          'code',
          normalizedCode
        )
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
                router.replace(
                  '/rooms'
                ),
            },
          ],
          {
            cancelable: false,
          }
        );
      }
    }
  };

void resolveRoomId();

return () => {
  cancelled = true;
};

}, [
routeValue,
router,
]);

/*

* ---
* PROFILES
* ---

*/

const loadProfiles =
useCallback(
async (
playersList: GamePlayer[]
) => {
if (
!playersList.length
) {
setProfiles({});
return;
}

    const userIds =
      playersList
        .map(
          (player) =>
            player.user_id
        )
        .filter(Boolean);

    if (!userIds.length) {
      return;
    }

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

    const map: ProfileMap =
      {};

    for (
      const profile of data ||
      []
    ) {
      map[profile.user_id] = {
        username:
          profile.username ||
          'لاعب',
        avatar_url:
          profile.avatar_url ||
          null,
      };
    }

    setProfiles(map);
  },
  []
);

/*

* ---
* MESSAGES
* ---

*/

const loadMessages =
useCallback(
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
        .order(
          'created_at',
          {
            ascending: true,
          }
        )
        .limit(100);

      if (error) {
        throw error;
      }

      if (
        isMountedRef.current
      ) {
        setMessages(
          (data ||
            []) as Message[]
        );
      }
    } catch (error) {
      console.error(
        'loadMessages error:',
        error
      );
    } finally {
      if (
        isMountedRef.current
      ) {
        setMessagesLoading(
          false
        );
      }
    }
  },
  [roomId]
);

/*

* ---
* GAME LOAD
* ---

*/

const loadGame =
useCallback(
async (
silent = false
) => {
if (!roomId) return;

    if (!silent) {
      setLoading(true);
    }

    try {
      const state =
        await getGameState(
          roomId
        );

      if (
        !isMountedRef.current
      ) {
        return;
      }

      setGameState(state);

      const role =
        await getMyRole(
          roomId
        );

      if (
        !isMountedRef.current
      ) {
        return;
      }

      setMyRole(role);

      const currentPlayer =
        state.players.find(
          (player) =>
            player.id ===
            state.my_player_id
        );

      setMyAlive(
        currentPlayer?.alive ??
          true
      );

      await loadProfiles(
        state.players
      );
    } catch (error: any) {
      console.error(
        'loadGame error:',
        error
      );

      if (
        isMountedRef.current &&
        !silent
      ) {
        Alert.alert(
          'خطأ',
          error?.message ||
            'تعذر تحميل بيانات اللعبة.'
        );
      }
    } finally {
      if (
        isMountedRef.current &&
        !silent
      ) {
        setLoading(false);
      }
    }
  },
  [
    roomId,
    loadProfiles,
  ]
);

useEffect(() => {
if (!roomId) return;

void loadGame();

}, [
roomId,
loadGame,
]);

useEffect(() => {
if (!roomId) return;

void loadMessages();

}, [
roomId,
loadMessages,
]);

/*

* ---
* REALTIME
* ---

*/

useEffect(() => {
if (!roomId) return;

const channel =
  supabase
    .channel(
      `mafia-room-${roomId}`
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
        void loadGame(true);
      }
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'game_players',
        filter: `room_id=eq.${roomId}`,
      },
      () => {
        void loadGame(true);
      }
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'game_states',
        filter: `room_id=eq.${roomId}`,
      },
      () => {
        void loadGame(true);
      }
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
        void loadMessages();
      }
    )
    .subscribe();

return () => {
  void supabase.removeChannel(
    channel
  );
};

}, [
roomId,
loadGame,
loadMessages,
]);

/*

* ---
* DERIVED VALUES
* ---

*/

const room =
(gameState?.room ||
null) as ExtendedGameRoom | null;

const players =
gameState?.players || [];

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

const isHost =
Boolean(
room &&
myPlayer &&
room.host_id &&
room.host_id ===
myPlayer.user_id
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

const canKick =
Boolean(
isHost &&
isWaiting
);

const canUseVoice =
Boolean(
room &&
!gameFinished
);

const canChat =
Boolean(
room &&
!gameFinished &&
(
isWaiting ||
(isDay &&
myAlive)
)
);

const nightActions =
myRole
? ROLE_ACTIONS[
myRole
] || []
: [];

const canNightAction =
Boolean(
isNight &&
myAlive &&
!gameFinished &&
nightActions.length > 0
);

const alivePlayers =
useMemo(
() =>
players.filter(
(player) =>
player.alive
),
[players]
);

const deadPlayers =
useMemo(
() =>
players.filter(
(player) =>
!player.alive
),
[players]
);

const selectablePlayers =
useMemo(
() =>
alivePlayers.filter(
(player) =>
player.id !==
gameState?.my_player_id
),
[
alivePlayers,
gameState?.my_player_id,
]
);

const selectedPlayer =
useMemo(
() =>
players.find(
(player) =>
player.id ===
selectedTarget
) || null,
[
players,
selectedTarget,
]
);

const roleLabel =
myRole
? ROLE_LABELS[myRole]
: 'لم يتم توزيع الدور بعد';

const roleDescription =
myRole
? ROLE_DESCRIPTIONS[
myRole
]
: 'سيتم توزيع دورك تلقائيًا عند بدء اللعبة.';

const eventText =
getEventText(
room?.last_event ||
null
);

/*

* ---
* TIMER
* ---

*/

useEffect(() => {
const updateTimer =
() => {
setSecondsLeft(
getSecondsLeft(
room?.phase_ends_at
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

* ---
* HEARTBEAT
* ---

*/

useEffect(() => {
if (!roomId) return;

const sendHeartbeat =
  async () => {
    try {
      await heartbeatRoom(
        roomId
      );
    } catch (error) {
      console.error(
        'heartbeatRoom error:',
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

return () =>
  clearInterval(
    interval
  );

}, [roomId]);

/*

* ---
* AUTOMATIC PHASE ADVANCE
* ---

*/

useEffect(() => {
if (
!roomId ||
!room ||
gameFinished ||
isWaiting ||
secondsLeft > 0 ||
advancingRef.current
) {
return;
}

if (
  !isHost &&
  room.host_id
) {
  return;
}

if (
  room.game_phase !==
    'night' &&
  room.game_phase !==
    'day'
) {
  return;
}

advancingRef.current =
  true;

const advance =
  async () => {
    try {
      await advanceMafiaPhase(
        roomId
      );

      await loadGame(
        true
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
roomId,
room,
gameFinished,
isWaiting,
isHost,
secondsLeft,
loadGame,
]);

/*

* ---
* TARGET SELECTION
* ---

*/

const selectTarget =
useCallback(
(playerId: string) => {
if (
busy ||
gameFinished
) {
return;
}

    const player =
      players.find(
        (item) =>
          item.id ===
          playerId
      );

    if (!player) return;

    if (!player.alive) {
      return;
    }

    if (
      player.id ===
      gameState?.my_player_id
    ) {
      return;
    }

    setSelectedTarget(
      (current) =>
        current === playerId
          ? null
          : playerId
    );
  },
  [
    busy,
    gameFinished,
    players,
    gameState?.my_player_id,
  ]
);

/*

* ---
* NIGHT ACTION
* ---

*/

const performNightAction =
useCallback(
async (
action: NightAction
) => {
if (
!roomId ||
!selectedTarget ||
busy ||
!canNightAction
) {
if (
!selectedTarget
) {
Alert.alert(
'اختر لاعبًا',
'يجب اختيار لاعب حي أولًا.'
);
}

      return;
    }

    const target =
      selectablePlayers.find(
        (player) =>
          player.id ===
          selectedTarget
      );

    if (!target) {
      Alert.alert(
        'هدف غير صالح',
        'اختر لاعبًا حيًا آخر.'
      );
      return;
    }

    setBusy(true);

    try {
      await submitNightAction(
        roomId,
        action,
        selectedTarget
      );

      setSelectedTarget(
        null
      );

      await loadGame(
        true
      );

      Alert.alert(
        'تم',
        'تم تنفيذ مهمتك الليلية.'
      );
    } catch (error: any) {
      console.error(
        'performNightAction error:',
        error
      );

      Alert.alert(
        'تعذر تنفيذ المهمة',
        error?.message ||
          'حدث خطأ أثناء تنفيذ المهمة.'
      );
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
    busy,
    canNightAction,
    selectablePlayers,
    loadGame,
  ]
);

/*

* ---
* DAY VOTE
* ---

*/

const performVote =
useCallback(
async () => {
if (
!roomId ||
!selectedTarget ||
busy ||
!isDay ||
!myAlive ||
gameFinished
) {
return;
}

    const target =
      selectablePlayers.find(
        (player) =>
          player.id ===
          selectedTarget
      );

    if (!target) {
      Alert.alert(
        'هدف غير صالح',
        'اختر لاعبًا حيًا للتصويت عليه.'
      );
      return;
    }

    setBusy(true);

    try {
      await submitDayVote(
        roomId,
        selectedTarget
      );

      setSelectedTarget(
        null
      );

      await loadGame(
        true
      );

      Alert.alert(
        'تم التصويت',
        'تم تسجيل تصويتك.'
      );
    } catch (error: any) {
      console.error(
        'performVote error:',
        error
      );

      Alert.alert(
        'تعذر التصويت',
        error?.message ||
          'حدث خطأ أثناء تسجيل التصويت.'
      );
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
    busy,
    isDay,
    myAlive,
    gameFinished,
    selectablePlayers,
    loadGame,
  ]
);

/*

* ---
* CHAT
* ---

*/

const sendMessage =
useCallback(
async () => {
const text =
messageText.trim();

    if (
      !text ||
      !roomId ||
      !canChat ||
      busy
    ) {
      return;
    }

    setBusy(true);

    try {
      const {
        data: {
          user,
        },
        error: userError,
      } =
        await supabase.auth.getUser();

      if (userError) {
        throw userError;
      }

      if (!user) {
        throw new Error(
          'يجب تسجيل الدخول لإرسال الرسائل.'
        );
      }

      const {
        error,
      } = await supabase
        .from('room_messages')
        .insert({
          room_id: roomId,
          user_id: user.id,
          message: text,
        });

      if (error) {
        throw error;
      }

      setMessageText('');

      await loadMessages();
    } catch (error: any) {
      console.error(
        'sendMessage error:',
        error
      );

      Alert.alert(
        'تعذر إرسال الرسالة',
        error?.message ||
          'حدث خطأ أثناء إرسال الرسالة.'
      );
    } finally {
      if (
        isMountedRef.current
      ) {
        setBusy(false);
      }
    }
  },
  [
    messageText,
    roomId,
    canChat,
    busy,
    loadMessages,
  ]
);

/*

* ---
* KICK PLAYER
* ---

*/

const kickPlayer =
useCallback(
async (
player: GamePlayer
) => {
if (
!roomId ||
!canKick ||
kickingUserId
) {
return;
}

    Alert.alert(
      'طرد اللاعب',
      `هل تريد طرد ${
        profiles[
          player.user_id
        ]?.username ||
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
              setKickingUserId(
                player.user_id
              );

              try {
                await kickRoomPlayer(
                  roomId,
                  player.user_id
                );

                await loadGame(
                  true
                );
              } catch (
                error: any
              ) {
                console.error(
                  'kickPlayer error:',
                  error
                );

                Alert.alert(
                  'تعذر الطرد',
                  error?.message ||
                    'حدث خطأ أثناء طرد اللاعب.'
                );
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
    profiles,
    loadGame,
  ]
);

/*

* ---
* START GAME
* ---

*/

const startGame =
useCallback(
async () => {
if (
!roomId ||
!isHost ||
busy
) {
return;
}

    setBusy(true);

    try {
      const {
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

      await loadGame(
        false
      );
    } catch (error: any) {
      console.error(
        'startGame error:',
        error
      );

      Alert.alert(
        'تعذر بدء اللعبة',
        error?.message ||
          'حدث خطأ أثناء بدء اللعبة.'
      );
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
    busy,
    loadGame,
  ]
);

/*

* ---
* LIVEKIT
* ---

*/

const disconnectVoice =
useCallback(
async () => {
++voiceOperationRef.current;

    const currentRoom =
      voiceRoomRef.current;

    voiceRoomRef.current =
      null;

    voiceShouldBeConnectedRef.current =
      false;

    if (
      isMountedRef.current
    ) {
      setVoiceConnected(
        false
      );
      setMicEnabled(false);
      setVoiceConnecting(
        false
      );
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

    if (
      audioSessionStartedRef.current
    ) {
      try {
        await AudioSession.stopAudioSession();
      } catch (error) {
        console.error(
          'AudioSession stop error:',
          error
        );
      }

      audioSessionStartedRef.current =
        false;
    }

    if (
      isMountedRef.current
    ) {
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
if (!roomId) return;

    if (
      voiceConnectingRef.current
    ) {
      return;
    }

    if (
      voiceRoomRef.current
    ) {
      return;
    }

    if (
      isUnmountingRef.current ||
      !isMountedRef.current
    ) {
      return;
    }

    const operation =
      ++voiceOperationRef.current;

    voiceConnectingRef.current =
      true;

    voiceShouldBeConnectedRef.current =
      true;

    setVoiceConnecting(
      true
    );
    setVoiceError(null);

    let liveKitRoom:
      | Room
      | null = null;

    try {
      try {
        await AudioSession.startAudioSession();

        audioSessionStartedRef.current =
          true;
      } catch (error) {
        console.error(
          'AudioSession start error:',
          error
        );
      }

      const {
        token,
        server_url,
      } =
        await getLiveKitToken(
          roomId
        );

      if (
        operation !==
          voiceOperationRef.current ||
        !voiceShouldBeConnectedRef.current
      ) {
        return;
      }

      liveKitRoom =
        new Room();

      voiceRoomRef.current =
        liveKitRoom;

      liveKitRoom.on(
        RoomEvent.Connected,
        () => {
          if (
            !isMountedRef.current
          ) {
            return;
          }

          setVoiceConnected(
            true
          );
          setVoiceConnecting(
            false
          );
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
            setVoiceConnected(
              false
            );
            setMicEnabled(
              false
            );
            setVoiceConnecting(
              false
            );

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
            setVoiceConnecting(
              true
            );
          }
        }
      );

      liveKitRoom.on(
        RoomEvent.Reconnected,
        async () => {
          if (
            !isMountedRef.current
          ) {
            return;
          }

          setVoiceConnecting(
            false
          );
          setVoiceConnected(
            true
          );

          try {
            await liveKitRoom?.localParticipant.setMicrophoneEnabled(
              true
            );

            setMicEnabled(
              true
            );
            setVoiceError(null);
          } catch (
            error: any
          ) {
            console.error(
              'Reconnected microphone error:',
              error
            );

            setMicEnabled(
              false
            );

            setVoiceError(
              error?.message ||
                'تعذر إعادة تشغيل الميكروفون.'
            );
          }

          setVoiceParticipantsVersion(
            (value) =>
              value + 1
          );
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

      await liveKitRoom.connect(
        server_url,
        token
      );

      if (
        operation !==
          voiceOperationRef.current ||
        !voiceShouldBeConnectedRef.current
      ) {
        try {
          await liveKitRoom.disconnect();
        } catch {}

        return;
      }

      setVoiceConnected(
        true
      );
      setVoiceConnecting(
        false
      );

      try {
        await liveKitRoom.localParticipant.setMicrophoneEnabled(
          true
        );

        setMicEnabled(
          true
        );
        setVoiceError(null);
      } catch (
        error: any
      ) {
        console.error(
          'Enable microphone error:',
          error
        );

        setMicEnabled(
          false
        );

        setVoiceError(
          error?.message ||
            'تعذر تشغيل الميكروفون. تأكد من السماح للتطبيق باستخدام الميكروفون.'
        );
      }

      setVoiceParticipantsVersion(
        (value) =>
          value + 1
      );
    } catch (error: any) {
      console.error(
        'connectVoice error:',
        error
      );

      if (liveKitRoom) {
        try {
          await liveKitRoom.disconnect();
        } catch {}
      }

      if (
        voiceRoomRef.current ===
        liveKitRoom
      ) {
        voiceRoomRef.current =
          null;
      }

      setVoiceConnected(
        false
      );
      setMicEnabled(false);
      setVoiceConnecting(
        false
      );

      setVoiceError(
        error?.message ||
          'تعذر الاتصال بالصوت. يمكنك المحاولة مرة أخرى.'
      );
    } finally {
      voiceConnectingRef.current =
        false;

      if (
        isMountedRef.current
      ) {
        setVoiceConnecting(
          false
        );
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
      await currentRoom.localParticipant.setMicrophoneEnabled(
        nextState
      );

      setMicEnabled(
        nextState
      );
      setVoiceError(null);

      setVoiceParticipantsVersion(
        (value) =>
          value + 1
      );
    } catch (error: any) {
      console.error(
        'toggleMicrophone error:',
        error
      );

      setMicEnabled(
        false
      );

      setVoiceError(
        error?.message ||
          'تعذر تغيير حالة الميكروفون.'
      );
    }
  },
  [
    connectVoice,
    voiceConnected,
    micEnabled,
  ]
);

/*

* ---
* VOICE PARTICIPANTS
* ---

*/

const voiceParticipants =
useMemo(() => {
void voiceParticipantsVersion;

  const currentRoom =
    voiceRoomRef.current;

  if (!currentRoom) {
    return [];
  }

  const result: Array<{
    identity: string;
    name: string;
    microphone: boolean;
    local: boolean;
  }> = [];

  const local =
    currentRoom.localParticipant;

  result.push({
    identity:
      local.identity,
    name:
      local.name ||
      profiles[
        local.identity
      ]?.username ||
      'أنت',
    microphone:
      micEnabled,
    local: true,
  });

  currentRoom.remoteParticipants.forEach(
    (
      participant: any
    ) => {
      let microphone =
        false;

      try {
        participant.trackPublications?.forEach(
          (publication: any) => {
            if (
              publication.source ===
                'microphone' &&
              !publication.isMuted
            ) {
              microphone = true;
            }
          }
        );
      } catch {}

      result.push({
        identity:
          participant.identity,
        name:
          participant.name ||
          profiles[
            participant.identity
          ]?.username ||
          'لاعب',
        microphone,
        local: false,
      });
    }
  );

  return result;
}, [
  profiles,
  micEnabled,
  voiceParticipantsVersion,
]);

/*

* ---
* LEAVE
* ---

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
            async () => {
              try {
                await disconnectVoice();

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
              } catch (
                error: any
              ) {
                console.error(
                  'leaveGame error:',
                  error
                );

                Alert.alert(
                  'تعذر المغادرة',
                  error?.message ||
                    'حدث خطأ أثناء مغادرة الغرفة.'
                );
              }
            },
        },
      ]
    );
  },
  [
    roomId,
    router,
    disconnectVoice,
  ]
);

/*

* ---
* UNMOUNT CLEANUP
* ---

*/

useEffect(() => {
isMountedRef.current =
true;

isUnmountingRef.current =
  false;

return () => {
  isMountedRef.current =
    false;

  isUnmountingRef.current =
    true;

  voiceShouldBeConnectedRef.current =
    false;

  ++voiceOperationRef.current;

  const currentRoom =
    voiceRoomRef.current;

  voiceRoomRef.current =
    null;

  if (currentRoom) {
    void currentRoom.disconnect();
  }

  if (
    audioSessionStartedRef.current
  ) {
    void AudioSession.stopAudioSession();
    audioSessionStartedRef.current =
      false;
  }
};

}, []);

/*

* ---
* UI STATUS
* ---

*/

const phaseTitle =
isWaiting
? 'انتظار اللاعبين'
: isNight
? '🌙 الليل'
: isDay
? '☀️ النهار'
: gameFinished
? '🏆 انتهت اللعبة'
: 'لعبة المافيا';

const phaseDescription =
isWaiting
? 'انتظر حتى ينضم اللاعبون ثم يبدأ المضيف اللعبة.'
: isNight
? 'نفّذ مهمتك الليلية بسرية.'
: isDay
? 'تحدث مع اللاعبين وصوّت ضد المشتبه به.'
: gameFinished
? 'انتهت هذه الجولة.'
: '';

/*

* ---
* LOADING
* ---

*/

if (
resolvingRoom ||
loading
) {
return (
<View
style={
styles.loadingContainer
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
      جاري تحميل الغرفة...
    </Text>
  </View>
);

}

if (
!roomId ||
!gameState ||
!room
) {
return (
<View
style={
styles.loadingContainer
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

return (
<View
style={
styles.container
}
>
<ScrollView
contentContainerStyle={
styles.content
}
showsVerticalScrollIndicator={
false
}
>
{/* HEADER */}

    <View
      style={
        styles.header
      }
    >
      <View>
        <Text
          style={
            styles.title
          }
        >
          🕵️ Mafia
        </Text>

        <Text
          style={
            styles.roomCode
          }
        >
          الغرفة: {room.code}
        </Text>
      </View>

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
          خروج
        </Text>
      </Pressable>
    </View>

    {/* PHASE */}

    <View
      style={
        styles.phaseCard
      }
    >
      <Text
        style={
          styles.phaseTitle
        }
      >
        {phaseTitle}
      </Text>

      <Text
        style={
          styles.phaseDescription
        }
      >
        {phaseDescription}
      </Text>

      {!isWaiting &&
        !gameFinished && (
          <Text
            style={
              styles.timer
            }
          >
            {formatTime(
              secondsLeft
            )}
          </Text>
        )}
    </View>

    {/* EVENT */}

    {eventText && (
      <View
        style={
          styles.eventCard
        }
      >
        <Text
          style={
            styles.eventText
          }
        >
          {eventText}
        </Text>
      </View>
    )}

    {/* ROLE */}

    {!isWaiting && (
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
            styles.roleName
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

        {!myAlive && (
          <View
            style={
              styles.deadBanner
            }
          >
            <Text
              style={
                styles.deadBannerText
              }
            >
              ☠️ أنت ميت ولا يمكنك تنفيذ المهام أو التصويت أو إرسال الرسائل.
            </Text>
          </View>
        )}
      </View>
    )}

    {/* VOICE */}

    {canUseVoice && (
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
          <View
            style={
              styles.voiceHeaderText
            }
          >
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
              الصوت متاح داخل الغرفة.
            </Text>
          </View>

          <View
            style={[
              styles.voiceStatusBadge,
              voiceConnected
                ? styles.voiceConnectedBadge
                : styles.voiceDisconnectedBadge,
            ]}
          >
            <View
              style={[
                styles.voiceStatusDot,
                voiceConnected
                  ? styles.voiceConnectedDot
                  : styles.voiceDisconnectedDot,
              ]}
            />

            <Text
              style={
                styles.voiceStatusText
              }
            >
              {voiceConnecting
                ? 'اتصال...'
                : voiceConnected
                  ? 'متصل'
                  : 'غير متصل'}
            </Text>
          </View>
        </View>

        {voiceError && (
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

            {!voiceConnecting && (
              <Pressable
                style={
                  styles.voiceRetryButton
                }
                onPress={
                  connectVoice
                }
              >
                <Text
                  style={
                    styles.voiceRetryText
                  }
                >
                  إعادة الاتصال
                </Text>
              </Pressable>
            )}
          </View>
        )}

        <View
          style={
            styles.voiceControls
          }
        >
          <View
            style={
              styles.voiceInfo
            }
          >
            <Text
              style={
                styles.voiceInfoTitle
              }
            >
              {voiceConnected
                ? 'الميكروفون'
                : 'الاتصال الصوتي'}
            </Text>

            <Text
              style={
                styles.voiceInfoText
              }
            >
              {voiceConnected
                ? micEnabled
                  ? 'الميكروفون يعمل'
                  : 'الميكروفون متوقف'
                : 'اتصل للانضمام إلى الصوت'}
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
            onPress={
              toggleMicrophone
            }
            disabled={
              voiceConnecting
            }
          >
            <Text
              style={
                styles.micButtonText
              }
            >
              {micEnabled
                ? '🎤 إيقاف'
                : '🔇 تشغيل'}
            </Text>
          </Pressable>
        </View>

        {!voiceConnected &&
          !voiceConnecting && (
            <Pressable
              style={[
                styles.primaryButton,
                styles.voiceConnectButton,
              ]}
              onPress={
                connectVoice
              }
            >
              <Text
                style={
                  styles.primaryButtonText
                }
              >
                🎙️ اتصال بالصوت
              </Text>
            </Pressable>
          )}

        {voiceConnected &&
          voiceParticipants.length >
            0 && (
            <View
              style={
                styles.voiceParticipants
              }
            >
              {voiceParticipants.map(
                (
                  participant
                ) => (
                  <View
                    key={
                      participant.identity
                    }
                    style={
                      styles.voiceParticipant
                    }
                  >
                    <Text
                      style={
                        styles.voiceParticipantName
                      }
                    >
                      {participant.local
                        ? 'أنت'
                        : participant.name}
                    </Text>

                    <Text>
                      {participant.microphone
                        ? '🎤'
                        : '🔇'}
                    </Text>
                  </View>
                )
              )}
            </View>
          )}
      </View>
    )}

    {/* PLAYERS */}

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
            styles.playersCount
          }
        >
          {alivePlayers.length}/
          {players.length}
        </Text>
      </View>

      {players.map(
        (player) => {
          const profile =
            profiles[
              player.user_id
            ];

          const isSelected =
            selectedTarget ===
            player.id;

          const isMe =
            player.id ===
            gameState.my_player_id;

          const voicePlayer =
            voiceParticipants.find(
              (participant) =>
                participant.identity ===
                player.user_id
            );

          return (
            <Pressable
              key={
                player.id
              }
              style={[
                styles.playerCard,
                !player.alive &&
                  styles.deadPlayerCard,
                isSelected &&
                  styles.selectedPlayerCard,
              ]}
              onPress={() =>
                selectTarget(
                  player.id
                )
              }
              disabled={
                !player.alive ||
                isMe ||
                busy ||
                gameFinished
              }
            >
              <View
                style={
                  styles.playerMain
                }
              >
                <View
                  style={
                    styles.playerAvatarWrapper
                  }
                >
                  <PlayerAvatar
                    player={
                      player
                    }
                    profile={
                      profile
                    }
                  />

                  {voiceConnected &&
                    voicePlayer && (
                      <View
                        style={
                          styles.micStatusBubble
                        }
                      >
                        <Text
                          style={
                            styles.micStatusIcon
                          }
                        >
                          {voicePlayer.microphone
                            ? '🎤'
                            : '🔇'}
                        </Text>
                      </View>
                    )}
                </View>

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
                      style={[
                        styles.playerName,
                        !player.alive &&
                          styles.deadName,
                      ]}
                    >
                      {profile
                        ?.username ||
                        player.name ||
                        'لاعب'}
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

                    {room.host_id ===
                      player.user_id && (
                      <Text
                        style={
                          styles.hostBadge
                        }
                      >
                        المضيف
                      </Text>
                    )}
                  </View>

                  <View
                    style={
                      styles.playerStatusRow
                    }
                  >
                    <Text
                      style={
                        styles.playerStatus
                      }
                    >
                      {player.alive
                        ? '🟢 حي'
                        : '☠️ ميت'}
                    </Text>

                    {voiceConnected &&
                      voicePlayer && (
                        <Text
                          style={
                            styles.playerVoiceStatus
                          }
                        >
                          {voicePlayer.microphone
                            ? 'يتحدث'
                            : 'صامت'}
                        </Text>
                      )}
                  </View>
                </View>
              </View>

              {isSelected && (
                <Text
                  style={
                    styles.selectedMark
                  }
                >
                  ✓
                </Text>
              )}

              {canKick &&
                !isMe && (
                  <Pressable
                    style={
                      styles.kickButton
                    }
                    onPress={() =>
                      kickPlayer(
                        player
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
                )}
            </Pressable>
          );
        }
      )}
    </View>

    {/* WAITING */}

    {isWaiting && (
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
          الغرفة في وضع الانتظار
        </Text>

        <Text
          style={
            styles.infoText
          }
        >
          عدد اللاعبين: {players.length}
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
                🎮 بدء اللعبة
              </Text>
            )}
          </Pressable>
        ) : (
          <Text
            style={
              styles.infoText
            }
          >
            انتظر المضيف لبدء اللعبة...
          </Text>
        )}
      </View>
    )}

    {/* NIGHT ACTIONS */}

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

        {selectedPlayer && (
          <Text
            style={
              styles.selectedTarget
            }
          >
            الهدف المحدد:{' '}
            {profiles[
              selectedPlayer.user_id
            ]?.username ||
              selectedPlayer.name ||
              'لاعب'}
          </Text>
        )}

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
                  info.danger &&
                    styles.dangerButton,
                  busy &&
                    styles.disabledButton,
                ]}
                onPress={() =>
                  performNightAction(
                    action
                  )
                }
                disabled={
                  busy
                }
              >
                <Text
                  style={
                    styles.actionButtonTitle
                  }
                >
                  {info.title}
                </Text>

                <Text
                  style={
                    styles.actionButtonDescription
                  }
                >
                  {
                    info.description
                  }
                </Text>

                <Text
                  style={
                    styles.actionButtonText
                  }
                >
                  {info.button}
                </Text>
              </Pressable>
            );
          }
        )}
      </View>
    )}

    {/* DAY VOTE */}

    {isDay &&
      myAlive &&
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
              styles.actionDescription
            }
          >
            اختر لاعبًا حيًا واحدًا للتصويت عليه. يتم احتساب النتيجة عند انتهاء النهار.
          </Text>

          {selectedPlayer && (
            <Text
              style={
                styles.selectedTarget
              }
            >
              ستصوّت ضد:{' '}
              {profiles[
                selectedPlayer.user_id
              ]?.username ||
                selectedPlayer.name ||
                'لاعب'}
            </Text>
          )}

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
            {busy ? (
              <ActivityIndicator
                color="#fff"
              />
            ) : (
              <Text
                style={
                  styles.buttonText
                }
              >
                🗳️ تأكيد التصويت
              </Text>
            )}
          </Pressable>
        </View>
      )}

    {/* CHAT */}

    {canChat && (
      <View
        style={
          styles.chatCard
        }
      >
        <View
          style={
            styles.chatHeader
          }
        >
          <View>
            <Text
              style={
                styles.chatTitle
              }
            >
              {isWaiting
                ? '💬 دردشة الغرفة'
                : '💬 دردشة النهار'}
            </Text>

            <Text
              style={
                styles.chatSubtitle
              }
            >
              {isWaiting
                ? 'التواصل متاح لجميع اللاعبين قبل بدء اللعبة'
                : 'التواصل متاح أثناء النهار فقط'}
            </Text>
          </View>

          <View
            style={
              styles.onlineDot
            }
          />
        </View>

        <View
          style={
            styles.messagesBox
          }
        >
          {messagesLoading &&
          messages.length ===
            0 ? (
            <View
              style={
                styles.messagesLoading
              }
            >
              <ActivityIndicator />

              <Text
                style={
                  styles.loadingSmall
                }
              >
                جارٍ تحميل الرسائل...
              </Text>
            </View>
          ) : messages.length ===
            0 ? (
            <Text
              style={
                styles.emptyMessages
              }
            >
              لا توجد رسائل بعد. ابدأ النقاش!
            </Text>
          ) : (
            messages.map(
              (message) => {
                const profile =
                  profiles[
                    message.user_id
                  ];

                const sender =
                  players.find(
                    (player) =>
                      player.user_id ===
                      message.user_id
                  );

                const isOwn =
                  message.user_id ===
                  myPlayer?.user_id;

                return (
                  <View
                    key={
                      message.id
                    }
                    style={[
                      styles.messageRow,
                      isOwn &&
                        styles.myMessageRow,
                    ]}
                  >
                    <PlayerAvatar
                      player={
                        sender || {
                          id: message.user_id,
                          user_id:
                            message.user_id,
                          name:
                            profile?.username ||
                            'Player',
                          avatar_url:
                            profile?.avatar_url ||
                            null,
                          alive: true,
                        }
                      }
                      profile={
                        profile
                      }
                      size={34}
                    />

                    <View
                      style={[
                        styles.messageBubble,
                        isOwn &&
                          styles.myMessageBubble,
                      ]}
                    >
                      <Text
                        style={
                          styles.messageSender
                        }
                      >
                        {profile?.username ||
                          sender?.name ||
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
            placeholder={
              isWaiting
                ? 'اكتب رسالة للاعبين...'
                : 'اكتب رسالتك...'
            }
            placeholderTextColor="#777"
            style={
              styles.messageInput
            }
            multiline
            maxLength={500}
            editable={!busy}
          />

          <Pressable
            style={[
              styles.sendButton,
              (!messageText.trim() ||
                busy) &&
                styles.disabledButton,
            ]}
            disabled={
              !messageText.trim() ||
              busy
            }
            onPress={
              sendMessage
            }
          >
            {busy ? (
              <ActivityIndicator
                size="small"
                color="#fff"
              />
            ) : (
              <Text
                style={
                  styles.sendButtonText
                }
              >
                إرسال
              </Text>
            )}
          </Pressable>
        </View>
      </View>
    )}

    {/* CLOSED CHAT */}

    {isNight &&
      !gameFinished && (
        <View
          style={
            styles.closedChatCard
          }
        >
          <Text
            style={
              styles.closedChatTitle
            }
          >
            🔒 الدردشة مغلقة
          </Text>

          <Text
            style={
              styles.closedChatText
            }
          >
            انتظر حتى يبدأ النهار للتحدث مع اللاعبين.
          </Text>
        </View>
      )}

    {/* SPECTATOR */}

    {!isWaiting &&
      !myAlive &&
      !gameFinished && (
        <View
          style={
            styles.spectatorCard
          }
        >
          <Text
            style={
              styles.spectatorTitle
            }
          >
            👻 أنت الآن متفرج
          </Text>

          <Text
            style={
              styles.spectatorText
            }
          >
            يمكنك متابعة الأحداث واللاعبين، لكن لا يمكنك تنفيذ المهام أو التصويت أو إرسال الرسائل.
          </Text>
        </View>
      )}

    {/* REFRESH */}

    {!gameFinished && (
      <Pressable
        style={
          styles.refreshButton
        }
        onPress={() =>
          loadGame(true)
        }
        disabled={
          refreshing
        }
      >
        {refreshing ? (
          <ActivityIndicator />
        ) : (
          <Text
            style={
              styles.refreshText
            }
          >
            ↻ تحديث حالة اللعبة
          </Text>
        )}
      </Pressable>
    )}

    {/* FINISHED */}

    {gameFinished && (
      <View
        style={
          styles.finishedCard
        }
      >
        <Text
          style={
            styles.finishedTitle
          }
        >
          🎉 انتهت الجولة
        </Text>

        <Text
          style={
            styles.finishedText
          }
        >
          {room.winner
            ? `الفائز: ${room.winner}`
            : 'تم إنهاء اللعبة.'}
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
              styles.buttonText
            }
          >
            العودة إلى الغرف
          </Text>
        </Pressable>
      </View>
    )}

    <View
      style={
        styles.bottomSpace
      }
    />
  </ScrollView>
</View>

);
}

const styles = StyleSheet.create({
container: {
flex: 1,
backgroundColor: '#08090d',
},

content: {
padding: 16,
paddingBottom: 40,
},

loadingContainer: {
flex: 1,
backgroundColor: '#08090d',
alignItems: 'center',
justifyContent: 'center',
padding: 24,
},

loadingText: {
color: '#ddd',
marginTop: 14,
fontSize: 16,
},

loadingSmall: {
color: '#aaa',
marginTop: 8,
},

errorTitle: {
color: '#ff6b6b',
fontSize: 18,
textAlign: 'center',
marginBottom: 20,
fontWeight: '800',
},

header: {
flexDirection: 'row',
alignItems: 'center',
justifyContent: 'space-between',
marginBottom: 18,
},

title: {
color: '#fff',
fontSize: 25,
fontWeight: '900',
letterSpacing: 2,
},

roomCode: {
color: '#888',
marginTop: 4,
fontSize: 13,
},

leaveButton: {
borderWidth: 1,
borderColor: '#393b45',
paddingHorizontal: 14,
paddingVertical: 9,
borderRadius: 10,
},

leaveButtonText: {
color: '#ddd',
fontWeight: '700',
},

phaseCard: {
backgroundColor: '#111216',
borderRadius: 20,
padding: 22,
alignItems: 'center',
marginBottom: 14,
borderWidth: 1,
borderColor: '#30323a',
},

phaseTitle: {
color: '#fff',
fontSize: 25,
fontWeight: '900',
textAlign: 'center',
},

phaseDescription: {
color: '#aaa',
fontSize: 14,
lineHeight: 21,
textAlign: 'center',
marginTop: 8,
},

timer: {
color: '#fff',
fontSize: 44,
fontWeight: '900',
marginTop: 8,
letterSpacing: 2,
},

eventCard: {
backgroundColor: '#101114',
borderRadius: 14,
padding: 15,
marginBottom: 14,
borderWidth: 1,
borderColor: '#25272e',
},

eventText: {
color: '#eee',
fontSize: 14,
lineHeight: 20,
},

roleCard: {
backgroundColor: '#111216',
borderColor: '#282a31',
borderWidth: 1,
borderRadius: 18,
padding: 18,
marginBottom: 14,
},

sectionTitle: {
color: '#fff',
fontSize: 20,
fontWeight: '900',
},

roleName: {
color: '#d9b85c',
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

voiceCard: {
backgroundColor: '#111216',
borderWidth: 1,
borderColor: '#35304a',
borderRadius: 18,
padding: 16,
marginBottom: 14,
},

voiceHeader: {
flexDirection: 'row',
alignItems: 'center',
justifyContent: 'space-between',
},

voiceHeaderText: {
flex: 1,
paddingRight: 10,
},

voiceTitle: {
color: '#fff',
fontSize: 19,
fontWeight: '900',
},

voiceSubtitle: {
color: '#888',
fontSize: 12,
lineHeight: 18,
marginTop: 4,
},

voiceStatusBadge: {
flexDirection: 'row',
alignItems: 'center',
borderRadius: 9,
paddingHorizontal: 9,
paddingVertical: 6,
},

voiceConnectedBadge: {
backgroundColor: '#14271c',
},

voiceDisconnectedBadge: {
backgroundColor: '#21191a',
},

voiceStatusDot: {
width: 7,
height: 7,
borderRadius: 4,
marginRight: 5,
},

voiceConnectedDot: {
backgroundColor: '#54c77b',
},

voiceDisconnectedDot: {
backgroundColor: '#c85b63',
},

voiceStatusText: {
color: '#ddd',
fontSize: 10,
fontWeight: '800',
},

voiceErrorBox: {
backgroundColor: '#241417',
borderWidth: 1,
borderColor: '#52232a',
borderRadius: 10,
padding: 9,
marginTop: 12,
},

voiceErrorText: {
color: '#ff9b9b',
fontSize: 12,
lineHeight: 18,
textAlign: 'center',
},

voiceRetryButton: {
marginTop: 9,
minHeight: 38,
borderRadius: 9,
backgroundColor: '#3f3a8f',
alignItems: 'center',
justifyContent: 'center',
paddingHorizontal: 14,
},

voiceRetryText: {
color: '#fff',
fontSize: 12,
fontWeight: '900',
},

voiceControls: {
flexDirection: 'row',
alignItems: 'center',
marginTop: 15,
},

voiceInfo: {
flex: 1,
},

voiceInfoTitle: {
color: '#eee',
fontSize: 14,
fontWeight: '800',
},

voiceInfoText: {
color: '#777',
fontSize: 11,
marginTop: 4,
},

micButton: {
minWidth: 88,
minHeight: 54,
backgroundColor: '#29233f',
borderWidth: 1,
borderColor: '#50477a',
borderRadius: 13,
alignItems: 'center',
justifyContent: 'center',
paddingHorizontal: 12,
},

micButtonActive: {
backgroundColor: '#40358b',
borderColor: '#6f61c4',
},

disabledMicButton: {
opacity: 0.4,
},

micButtonText: {
color: '#fff',
fontSize: 11,
fontWeight: '900',
},

voiceConnectButton: {
marginTop: 14,
},

voiceParticipants: {
marginTop: 14,
borderTopWidth: 1,
borderTopColor: '#25272d',
paddingTop: 10,
},

voiceParticipant: {
flexDirection: 'row',
alignItems: 'center',
justifyContent: 'space-between',
paddingVertical: 7,
},

voiceParticipantName: {
color: '#ddd',
fontSize: 13,
fontWeight: '700',
},

playersCard: {
backgroundColor: '#101114',
borderRadius: 18,
borderWidth: 1,
borderColor: '#292b31',
padding: 15,
marginBottom: 14,
},

playersHeader: {
flexDirection: 'row',
alignItems: 'center',
justifyContent: 'space-between',
marginBottom: 10,
},

playersCount: {
color: '#888',
fontSize: 13,
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

avatar: {
backgroundColor: '#252831',
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

deadAvatar: {
opacity: 0.55,
},

deadPlayerCard: {
opacity: 0.5,
},

selectedPlayerCard: {
borderColor: '#d4a72c',
backgroundColor: '#19160d',
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

actionDescription: {
color: '#999',
fontSize: 13,
lineHeight: 20,
marginTop: 7,
marginBottom: 14,
},

selectedTarget: {
color: '#d9b85c',
fontSize: 13,
fontWeight: '800',
marginTop: 10,
marginBottom: 12,
},

actionButton: {
minHeight: 90,
backgroundColor: '#25233a',
borderRadius: 13,
marginTop: 10,
padding: 14,
justifyContent: 'center',
},

dangerButton: {
backgroundColor: '#8f2633',
},

actionButtonTitle: {
color: '#fff',
fontSize: 16,
fontWeight: '900',
},

actionButtonDescription: {
color: '#ccc',
fontSize: 12,
lineHeight: 18,
marginTop: 5,
},

actionButtonText: {
color: '#fff',
fontSize: 12,
fontWeight: '900',
marginTop: 8,
},

primaryButton: {
minHeight: 50,
backgroundColor: '#3f3a8f',
borderRadius: 12,
alignItems: 'center',
justifyContent: 'center',
paddingHorizontal: 18,
},

primaryButtonText: {
color: '#fff',
fontSize: 15,
fontWeight: '900',
},

voteButton: {
minHeight: 50,
backgroundColor: '#735a1b',
borderRadius: 12,
alignItems: 'center',
justifyContent: 'center',
paddingHorizontal: 18,
},

buttonText: {
color: '#fff',
fontSize: 15,
fontWeight: '900',
},

disabledButton: {
opacity: 0.35,
},

infoText: {
color: '#999',
marginTop: 7,
marginBottom: 14,
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
