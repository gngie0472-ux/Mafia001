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
  startMafiaGame,
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

const ACTION_LABELS: Record<NightAction, string> = {
  kill: '🔪 تنفيذ القتل',
  protect: '🩺 حماية اللاعب',
  investigate: '🔎 التحقيق',
  spy: '🕵️ قدرة الجاسوس',
  guard: '🛡️ حماية اللاعب',
  sheriff_check: '⭐ فحص اللاعب',
  witch_save: '🧙‍♀️ إنقاذ اللاعب',
  witch_kill: '☠️ قتل اللاعب',
  ghoul: '👹 قدرة الغول',
  cult_convert: '☥ تحويل اللاعب',
};

function getSecondsLeft(
  endsAt: string | null
): number {
  if (!endsAt) return 0;

  const end = new Date(endsAt).getTime();

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

  return `${String(
    minutes
  ).padStart(2, '0')}:${String(
    remaining
  ).padStart(2, '0')}`;
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b0b0f',
  },

  scrollContent: {
    padding: 16,
    paddingBottom: 60,
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

  voicePlayers: {
    marginTop: 16,
    gap: 8,
  },

  voicePlayer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#101014',
    borderRadius: 12,
    padding: 10,
  },

  voicePlayerAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#292934',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },

  voicePlayerInitial: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },

  voicePlayerName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
  },

  voiceIcon: {
    fontSize: 18,
    marginLeft: 8,
  },

  actionCard: {
    backgroundColor: '#141419',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#282832',
    padding: 18,
    marginBottom: 14,
  },

  helperText: {
    color: '#999',
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 14,
  },

  actionButtons: {
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
  },

  disabledButton: {
    opacity: 0.45,
  },

  selectedPlayer: {
    backgroundColor: '#20202a',
    borderColor: '#7777aa',
  },

  nonSelectablePlayer: {
    opacity: 0.7,
  },

  selectedMark: {
    color: '#8e8eff',
    fontSize: 22,
    fontWeight: '900',
    marginLeft: 8,
  },

  playersCard: {
    backgroundColor: '#141419',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#282832',
    padding: 18,
    marginBottom: 14,
  },

  sectionHeader: {
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

  deadPlayer: {
    opacity: 0.55,
  },

  playerAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#292934',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },

  playerInitial: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },

  playerInfo: {
    flex: 1,
    minWidth: 0,
  },

  playerName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    flexShrink: 1,
  },

  playerStatus: {
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

  startCard: {
    backgroundColor: '#141419',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#282832',
    padding: 18,
    marginBottom: 14,
  },

  startButton: {
    backgroundColor: '#315f3b',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginBottom: 4,
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

  statusCard: {
    backgroundColor: '#141419',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#282832',
    padding: 18,
    marginBottom: 14,
  },

  roomCodeText: {
    color: '#aaa',
    fontSize: 14,
    marginTop: 8,
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

  bottomSpace: {
    height: 30,
  },
});

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

  const [roomId, setRoomId] =
    useState<string | null>(null);

  const [
    resolvingRoom,
    setResolvingRoom,
  ] = useState(true);

  const [loading, setLoading] =
    useState(true);

  const [
    refreshing,
    setRefreshing,
  ] = useState(false);

  const [
    errorMessage,
    setErrorMessage,
  ] = useState<string | null>(null);

  const [
    currentUserId,
    setCurrentUserId,
  ] = useState<string | null>(null);

  const [
    gameState,
    setGameState,
  ] = useState<GameState | null>(null);

  const [myRole, setMyRole] =
    useState<GameRole | null>(null);

  const [myAlive, setMyAlive] =
    useState(true);

  const [profiles, setProfiles] =
    useState<ProfileMap>({});

  const [
    selectedTarget,
    setSelectedTarget,
  ] = useState<string | null>(null);

  const [busy, setBusy] =
    useState(false);

  const [
    secondsLeft,
    setSecondsLeft,
  ] = useState(0);

  const [messages, setMessages] =
    useState<Message[]>([]);

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
  ] = useState<string | null>(null);

  const voiceRoomRef =
    useRef<Room | null>(null);

  const voiceConnectingRef =
    useRef(false);

  const voiceShouldBeConnectedRef =
    useRef(false);

  const isUnmountingRef =
    useRef(false);

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
  ] = useState<string | null>(null);

  const [
    voiceParticipantsVersion,
    setVoiceParticipantsVersion,
  ] = useState(0);

  const lastAdvanceRef =
    useRef(0);

  const advancingRef =
    useRef(false);

  const isMountedRef =
    useRef(true);

  /*
   * مهم:
   * registerGlobals لا يجب أن يؤدي إلى تشغيل الصوت.
   * يتم فقط تسجيل WebRTC globals مرة واحدة.
   */
  useEffect(() => {
    isMountedRef.current = true;
    isUnmountingRef.current = false;

    try {
      registerGlobals();
    } catch (e) {
      console.error(
        'LiveKit registerGlobals error:',
        e
      );
    }

    return () => {
      isMountedRef.current = false;
      isUnmountingRef.current = true;
    };
  }, []);

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
        } catch (e: any) {
          console.error(
            'resolveRoomId error:',
            e
          );

          if (!cancelled) {
            setRoomId(null);
            setResolvingRoom(false);
            setLoading(false);
            setErrorMessage(
              e?.message ||
                'كود الغرفة غير صحيح.'
            );
          }
        }
      };

    void resolveRoomId();

    return () => {
      cancelled = true;
    };
  }, [routeValue]);

  const loadProfiles =
    useCallback(
      async (
        gamePlayers: GamePlayer[]
      ) => {
        if (!gamePlayers.length) {
          setProfiles({});
          return;
        }

        const userIds =
          gamePlayers
            .map(
              p => p.user_id
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
          const profile of
            data || []
        ) {
          map[
            profile.user_id
          ] = {
            username:
              profile.username ||
              'Player',
            avatar_url:
              profile.avatar_url ||
              null,
          };
        }

        if (
          isMountedRef.current
        ) {
          setProfiles(map);
        }
      },
      []
    );

  const loadMessages =
    useCallback(
      async () => {
        if (!roomId) {
          return;
        }

        setMessagesLoading(
          true
        );

        try {
          const {
            data,
            error,
          } = await supabase
            .from(
              'room_messages'
            )
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
        } catch (e) {
          console.error(
            'loadMessages error:',
            e
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

  const loadGame =
    useCallback(
      async (
        showLoader = false
      ) => {
        if (!roomId) {
          return;
        }

        if (showLoader) {
          setRefreshing(true);
        }

        try {
          const {
            data: userData,
            error: authError,
          } =
            await supabase.auth.getUser();

          if (authError) {
            throw authError;
          }

          const userId =
            userData.user?.id;

          if (!userId) {
            throw new Error(
              'يجب تسجيل الدخول أولًا.'
            );
          }

          if (
            isMountedRef.current
          ) {
            setCurrentUserId(
              userId
            );
          }

          const {
            data: membership,
            error:
              membershipError,
          } =
            await supabase
              .from(
                'room_players'
              )
              .select('id')
              .eq(
                'room_id',
                roomId
              )
              .eq(
                'user_id',
                userId
              )
              .maybeSingle();

          if (
            membershipError
          ) {
            console.warn(
              'membership check error:',
              membershipError
            );
          }

          if (
            !membership &&
            membershipError ==
              null
          ) {
            throw new Error(
              'not a member'
            );
          }

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
          setErrorMessage(null);

          if (
            state.room.status ===
            'waiting'
          ) {
            setMyRole(null);
            setMyAlive(true);
          } else {
            const role =
              await getMyRole(
                roomId
              );

            if (
              !isMountedRef.current
            ) {
              return;
            }

            setMyRole(
              role.role
            );

            setMyAlive(
              role.alive
            );
          }

          await loadProfiles(
            state.players
          );

          await loadMessages();
        } catch (e: any) {
          console.error(
            'loadGame error:',
            e
          );

          if (
            !isMountedRef.current
          ) {
            return;
          }

          const message =
            e?.message ||
            'حدث خطأ أثناء تحميل حالة اللعبة.';

          if (
            message.includes(
              'not a member'
            ) ||
            message.includes(
              'player not found'
            )
          ) {
            setErrorMessage(
              'لم تعد عضوًا في هذه الغرفة.'
            );
          } else {
            setErrorMessage(
              message
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
        loadMessages,
      ]
    );

  const room =
    (gameState?.room as ExtendedGameRoom) ||
    null;

  const players =
    gameState?.players || [];

  const alivePlayers =
    useMemo(
      () =>
        players.filter(
          p => p.alive
        ),
      [players]
    );

  const currentPlayer =
    useMemo(
      () =>
        players.find(
          p =>
            p.id ===
            gameState?.my_player_id
        ) || null,
      [
        players,
        gameState?.my_player_id,
      ]
    );

  const currentPlayerAlive =
    currentPlayer
      ? currentPlayer.alive
      : myAlive;

  const isHost =
    Boolean(
      room?.host_id &&
        currentUserId &&
        room.host_id ===
          currentUserId
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
    isHost && isWaiting;

  const canStartGame =
    isHost &&
    isWaiting &&
    players.length >= 4;

  const canDayVote =
    isDay &&
    currentPlayerAlive &&
    !gameFinished;

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
          (
            isDay &&
            currentPlayerAlive
          )
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
        currentPlayerAlive &&
        !gameFinished &&
        nightActions.length
    );

  const roleLabel =
    myRole
      ? ROLE_LABELS[
          myRole
        ]
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

  const disconnectVoice =
    useCallback(
      async () => {
        voiceShouldBeConnectedRef.current =
          false;

        const currentRoom =
          voiceRoomRef.current;

        voiceRoomRef.current =
          null;

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
          } catch (e) {
            console.error(
              'LiveKit disconnect error:',
              e
            );
          }
        }

        try {
          await AudioSession.stopAudioSession();
        } catch (e) {
          console.error(
            'AudioSession stop error:',
            e
          );
        }

        if (
          isMountedRef.current
        ) {
          setVoiceParticipantsVersion(
            v => v + 1
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
          !canUseVoice ||
          isUnmountingRef.current ||
          !isMountedRef.current
        ) {
          return;
        }

        if (
          voiceConnectingRef.current ||
          voiceRoomRef.current
        ) {
          return;
        }

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
          /*
           * الصوت يبدأ فقط بعد ضغط المستخدم.
           */
          try {
            await AudioSession.startAudioSession();
          } catch (e) {
            console.warn(
              'AudioSession start error:',
              e
            );
          }

          if (
            !voiceShouldBeConnectedRef.current
          ) {
            return;
          }

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

              setVoiceError(
                null
              );

              setVoiceParticipantsVersion(
                v => v + 1
              );
            }
          );

          liveKitRoom.on(
            RoomEvent.Disconnected,
            () => {
              if (
                !isMountedRef.current
              ) {
                return;
              }

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
                v => v + 1
              );
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
                !isMountedRef.current ||
                !voiceShouldBeConnectedRef.current
              ) {
                return;
              }

              setVoiceConnected(
                true
              );

              setVoiceConnecting(
                false
              );

              try {
                await liveKitRoom
                  ?.localParticipant
                  .setMicrophoneEnabled(
                    true
                  );

                setMicEnabled(
                  true
                );

                setVoiceError(
                  null
                );
              } catch (e: any) {
                setMicEnabled(
                  false
                );

                setVoiceError(
                  e?.message ||
                    'تعذر إعادة تشغيل الميكروفون.'
                );
              }

              setVoiceParticipantsVersion(
                v => v + 1
              );
            }
          );

          liveKitRoom.on(
            RoomEvent.ParticipantConnected,
            () =>
              setVoiceParticipantsVersion(
                v => v + 1
              )
          );

          liveKitRoom.on(
            RoomEvent.ParticipantDisconnected,
            () =>
              setVoiceParticipantsVersion(
                v => v + 1
              )
          );

          liveKitRoom.on(
            RoomEvent.TrackMuted,
            () =>
              setVoiceParticipantsVersion(
                v => v + 1
              )
          );

          liveKitRoom.on(
            RoomEvent.TrackUnmuted,
            () =>
              setVoiceParticipantsVersion(
                v => v + 1
              )
          );

          await liveKitRoom.connect(
            server_url,
            token
          );

          if (
            !voiceShouldBeConnectedRef.current ||
            isUnmountingRef.current
          ) {
            try {
              await liveKitRoom.disconnect();
            } catch {}

            return;
          }

          if (
            isMountedRef.current
          ) {
            setVoiceConnected(
              true
            );

            setVoiceConnecting(
              false
            );
          }

          try {
            await liveKitRoom
              .localParticipant
              .setMicrophoneEnabled(
                true
              );

            if (
              isMountedRef.current
            ) {
              setMicEnabled(
                true
              );

              setVoiceError(
                null
              );

              setVoiceParticipantsVersion(
                v => v + 1
              );
            }
          } catch (e: any) {
            if (
              isMountedRef.current
            ) {
              setMicEnabled(
                false
              );

              setVoiceError(
                e?.message ||
                  'تعذر تشغيل الميكروفون. تأكد من السماح للتطبيق باستخدام الميكروفون.'
              );
            }
          }
        } catch (e: any) {
          console.error(
            'connectVoice error:',
            e
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

          if (
            isMountedRef.current &&
            !isUnmountingRef.current
          ) {
            setVoiceConnected(
              false
            );

            setMicEnabled(
              false
            );

            setVoiceError(
              e?.message ||
                'تعذر الاتصال بالصوت. يمكنك البقاء داخل الغرفة.'
            );
          }
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
      [
        roomId,
        canUseVoice,
      ]
    );

  const toggleMicrophone =
    useCallback(
      async () => {
        const currentRoom =
          voiceRoomRef.current;

        /*
         * لا توجد غرفة صوتية؟
         * هنا فقط نبدأ الاتصال.
         */
        if (!currentRoom) {
          await connectVoice();
          return;
        }

        if (!voiceConnected) {
          return;
        }

        const nextState =
          !micEnabled;

        try {
          await currentRoom
            .localParticipant
            .setMicrophoneEnabled(
              nextState
            );

          setMicEnabled(
            nextState
          );

          setVoiceError(
            null
          );

          setVoiceParticipantsVersion(
            v => v + 1
          );
        } catch (e: any) {
          console.error(
            'toggleMicrophone error:',
            e
          );

          setMicEnabled(
            false
          );

          setVoiceError(
            e?.message ||
              'تعذر تشغيل الميكروفون.'
          );
        }
      },
      [
        connectVoice,
        voiceConnected,
        micEnabled,
      ]
    );

  const isPlayerMicEnabled =
    useCallback(
      (userId: string) => {
        void voiceParticipantsVersion;

        const currentRoom =
          voiceRoomRef.current;

        if (!currentRoom) {
          return false;
        }

        if (
          currentRoom
            .localParticipant
            .identity === userId
        ) {
          return micEnabled;
        }

        const participant: any =
          Array.from(
            currentRoom
              .remoteParticipants
              .values()
          ).find(
            (p: any) =>
              p.identity ===
              userId
          );

        if (!participant) {
          return false;
        }

        try {
          if (
            typeof participant
              .isMicrophoneEnabled ===
            'boolean'
          ) {
            return participant
              .isMicrophoneEnabled;
          }
        } catch {}

        try {
          const pub =
            participant
              .getTrackPublication?.(
                'microphone'
              );

          if (pub) {
            return !Boolean(
              pub.isMuted
            );
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
   * إصلاح أساسي:
   *
   * لا يوجد هنا:
   *
   * void connectVoice();
   *
   * لذلك لن يحاول LiveKit الاتصال بمجرد
   * فتح الغرفة.
   *
   * الصوت يبدأ فقط من زر الميكروفون.
   */
  useEffect(() => {
    if (
      !roomId ||
      !gameState?.room
    ) {
      return;
    }

    if (!canUseVoice) {
      void disconnectVoice();
    }
  }, [
    roomId,
    gameState?.room?.status,
    gameState?.room?.winner,
    canUseVoice,
    disconnectVoice,
  ]);

  useEffect(
    () => {
      return () => {
        void disconnectVoice();
      };
    },
    [disconnectVoice]
  );

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
          await heartbeatRoom(
            roomId
          );
        } catch (e) {
          console.error(
            'heartbeat error:',
            e
          );
        }
      };

    void heartbeat();

    const id =
      setInterval(
        heartbeat,
        10000
      );

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [roomId]);

  useEffect(() => {
    if (roomId) {
      void loadGame(true);
    }
  }, [
    roomId,
    loadGame,
  ]);

  useEffect(() => {
    if (!roomId) {
      return;
    }

    const channel =
      supabase
        .channel(
          `room-screen-${roomId}`
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'rooms',
            filter: `id=eq.${roomId}`,
          },
          () =>
            void loadGame(false)
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'room_players',
            filter: `room_id=eq.${roomId}`,
          },
          () =>
            void loadGame(false)
        )
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'room_messages',
            filter: `room_id=eq.${roomId}`,
          },
          () =>
            void loadMessages()
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

  useEffect(() => {
    if (
      !gameState?.room
        ?.phase_ends_at
    ) {
      setSecondsLeft(0);
      return;
    }

    const update = () => {
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
        gameState.room
          .status ===
          'playing' &&
        roomId &&
        !advancingRef.current &&
        Date.now() -
          lastAdvanceRef.current >
          2500
      ) {
        lastAdvanceRef.current =
          Date.now();

        advancingRef.current =
          true;

        void advanceMafiaPhase(
          roomId
        )
          .then(() =>
            loadGame(false)
          )
          .catch(e =>
            console.error(
              'advance phase error:',
              e
            )
          )
          .finally(() => {
            advancingRef.current =
              false;
          });
      }
    };

    update();

    const id =
      setInterval(
        update,
        1000
      );

    return () =>
      clearInterval(id);
  }, [
    gameState?.room
      ?.phase_ends_at,
    gameState?.room?.status,
    roomId,
    loadGame,
  ]);

  const selectTarget =
    useCallback(
      (targetId: string) => {
        setSelectedTarget(
          prev =>
            prev === targetId
              ? null
              : targetId
        );
      },
      []
    );

  const handleLeaveRoom =
    useCallback(
      async () => {
        if (!roomId) {
          return;
        }

        try {
          await disconnectVoice();

          await leaveRoom(
            roomId
          );

          router.replace(
            '/rooms'
          );
        } catch (e: any) {
          Alert.alert(
            'خطأ',
            e?.message ||
              'تعذر مغادرة الغرفة.'
          );
        }
      },
      [
        roomId,
        router,
        disconnectVoice,
      ]
    );

  const handleKickPlayer =
    useCallback(
      async (
        player: GamePlayer
      ) => {
        if (
          !roomId ||
          player.user_id ===
            currentUserId
        ) {
          return;
        }

        Alert.alert(
          'طرد اللاعب',
          `هل أنت متأكد من طرد ${
            player.name ||
            'هذا اللاعب'
          }؟`,
          [
            {
              text: 'إلغاء',
              style: 'cancel',
            },
            {
              text: 'طرد',
              style:
                'destructive',
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
                      false
                    );
                  } catch (
                    e: any
                  ) {
                    Alert.alert(
                      'خطأ',
                      e?.message ||
                        'تعذر طرد اللاعب.'
                    );
                  } finally {
                    setKickingUserId(
                      null
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
        if (
          !roomId ||
          !canDayVote ||
          !currentPlayerAlive
        ) {
          return;
        }

        setBusy(true);

        try {
          await submitDayVote(
            roomId,
            targetUserId
          );

          setSelectedTarget(
            null
          );

          await loadGame(
            false
          );
        } catch (e: any) {
          Alert.alert(
            'خطأ',
            e?.message ||
              'تعذر تسجيل التصويت.'
          );
        } finally {
          setBusy(false);
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
          | string
          | null
      ) => {
        if (
          !roomId ||
          !canNightAction ||
          !targetUserId
        ) {
          return;
        }

        setBusy(true);

        try {
          await submitNightAction(
            roomId,
            action,
            targetUserId
          );

          setSelectedTarget(
            null
          );

          await loadGame(
            false
          );
        } catch (e: any) {
          Alert.alert(
            'خطأ',
            e?.message ||
              'تعذر تنفيذ الإجراء.'
          );
        } finally {
          setBusy(false);
        }
      },
      [
        roomId,
        canNightAction,
        loadGame,
      ]
    );

  const handleStartGame =
    useCallback(
      async () => {
        if (
          !roomId ||
          !canStartGame
        ) {
          return;
        }

        setBusy(true);

        try {
          await startMafiaGame(
            roomId
          );

          await loadGame(
            false
          );
        } catch (e: any) {
          Alert.alert(
            'خطأ',
            e?.message ||
              'تعذر بدء اللعبة.'
          );
        } finally {
          setBusy(false);
        }
      },
      [
        roomId,
        canStartGame,
        loadGame,
      ]
    );

  const handleSendMessage =
    useCallback(
      async () => {
        const text =
          messageText.trim();

        if (
          !roomId ||
          !canChat ||
          !text ||
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
              'send_room_message',
              {
                p_room_id:
                  roomId,
                p_message:
                  text,
              }
            );

          if (error) {
            throw error;
          }

          setMessageText('');

          await loadMessages();
        } catch (e: any) {
          Alert.alert(
            'خطأ',
            e?.message ||
              'تعذر إرسال الرسالة.'
          );
        } finally {
          setBusy(false);
        }
      },
      [
        roomId,
        canChat,
        messageText,
        busy,
        loadMessages,
      ]
    );

  const getPlayerDisplayName =
    useCallback(
      (player: GamePlayer) =>
        player.name ||
        profiles[
          player.user_id
        ]?.username ||
        'لاعب',
      [profiles]
    );

  const getPlayerInitial =
    useCallback(
      (player: GamePlayer) =>
        getPlayerDisplayName(
          player
        )
          .trim()
          .charAt(0)
          .toUpperCase() ||
        '?',
      [getPlayerDisplayName]
    );

  const getPlayerRoleText =
    useCallback(
      (player: GamePlayer) =>
        gameFinished &&
        player.role
          ? ROLE_LABELS[
              player.role as GameRole
            ] ||
            player.role
          : null,
      [gameFinished]
    );

  if (resolvingRoom) {
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
          جارٍ العثور على الغرفة...
        </Text>
      </View>
    );
  }

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

  if (errorMessage) {
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
          {errorMessage}
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
          تعذر العثور على هذه
          الغرفة.
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
      <ScrollView
        contentContainerStyle={
          styles.scrollContent
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
            {isWaiting
              ? '⏳ الانتظار'
              : isNight
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

        {eventText && (
          <View
            style={
              styles.statusCard
            }
          >
            <Text
              style={
                styles.sectionTitle
              }
            >
              آخر حدث
            </Text>

            <Text
              style={
                styles.statusText
              }
            >
              {eventText}
            </Text>
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
                style={{
                  flex: 1,
                  marginRight: 10,
                }}
              >
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
                onPress={() =>
                  void toggleMicrophone()
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

            {!voiceConnected &&
              !voiceConnecting && (
                <Text
                  style={
                    styles.voiceStatus
                  }
                >
                  اضغط على «تشغيل الصوت» للانضمام إلى المحادثة الصوتية.
                </Text>
              )}

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
                styles.voicePlayers
              }
            >
              {players.map(
                player => {
                  const micOn =
                    isPlayerMicEnabled(
                      player.user_id
                    );

                  return (
                    <View
                      key={
                        player.id
                      }
                      style={[
                        styles.voicePlayer,
                        !player.alive &&
                          styles.deadPlayer,
                      ]}
                    >
                      <View
                        style={
                          styles.voicePlayerAvatar
                        }
                      >
                        <Text
                          style={
                            styles.voicePlayerInitial
                          }
                        >
                          {getPlayerInitial(
                            player
                          )}
                        </Text>
                      </View>

                      <Text
                        numberOfLines={
                          1
                        }
                        style={
                          styles.voicePlayerName
                        }
                      >
                        {getPlayerDisplayName(
                          player
                        )}
                      </Text>

                      <Text
                        style={
                          styles.voiceIcon
                        }
                      >
                        {micOn
                          ? '🎤'
                          : '🔇'}
                      </Text>
                    </View>
                  );
                }
              )}
            </View>
          </View>
        )}

        {isWaiting &&
          isHost && (
            <View
              style={
                styles.startCard
              }
            >
              <Text
                style={
                  styles.sectionTitle
                }
              >
                إدارة اللعبة
              </Text>

              <Text
                style={
                  styles.helperText
                }
              >
                {players.length <
                4
                  ? `تحتاج إلى ${
                      4 -
                      players.length
                    } لاعب إضافي لبدء اللعبة.`
                  : 'يمكنك بدء اللعبة الآن.'}
              </Text>

              <Pressable
                style={[
                  styles.startButton,
                  !canStartGame &&
                    styles.disabledButton,
                ]}
                disabled={
                  !canStartGame ||
                  busy
                }
                onPress={() =>
                  void handleStartGame()
                }
              >
                <Text
                  style={
                    styles.startButtonText
                  }
                >
                  {busy
                    ? 'جارٍ البدء...'
                    : 'بدء اللعبة'}
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
                styles.playerCount
              }
            >
              {alivePlayers.length}/
              {players.length} أحياء
            </Text>
          </View>

          {players.map(
            player => {
              const isMe =
                player.user_id ===
                currentUserId;

              const isSelected =
                selectedTarget ===
                player.user_id;

              const roleText =
                getPlayerRoleText(
                  player
                );

              const selectable =
                player.alive &&
                !isMe &&
                !busy &&
                (
                  canDayVote ||
                  canNightAction
                );

              return (
                <Pressable
                  key={
                    player.id
                  }
                  disabled={
                    !selectable
                  }
                  onPress={() =>
                    selectable &&
                    selectTarget(
                      player.user_id
                    )
                  }
                  style={[
                    styles.playerRow,
                    !player.alive &&
                      styles.deadPlayer,
                    isSelected &&
                      styles.selectedPlayer,
                    !selectable &&
                      styles.nonSelectablePlayer,
                  ]}
                >
                  <View
                    style={
                      styles.playerAvatar
                    }
                  >
                    <Text
                      style={
                        styles.playerInitial
                      }
                    >
                      {getPlayerInitial(
                        player
                      )}
                    </Text>
                  </View>

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
                      {getPlayerDisplayName(
                        player
                      )}
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
                      {roleText
                        ? ` • ${roleText}`
                        : ''}
                    </Text>
                  </View>

                  {isHost &&
                    canKick &&
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
                          void handleKickPlayer(
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

                  {isSelected && (
                    <Text
                      style={
                        styles.selectedMark
                      }
                    >
                      ✓
                    </Text>
                  )}
                </Pressable>
              );
            }
          )}
        </View>

        {canDayVote && (
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
              التصويت
            </Text>

            <Text
              style={
                styles.helperText
              }
            >
              اختر اللاعب الذي تريد
              التصويت عليه.
            </Text>

            <Pressable
              style={[
                styles.primaryButton,
                !selectedTarget &&
                  styles.disabledButton,
              ]}
              disabled={
                !selectedTarget ||
                busy
              }
              onPress={() => {
                if (
                  selectedTarget
                ) {
                  void handleDayVote(
                    selectedTarget
                  );
                }
              }}
            >
              <Text
                style={
                  styles.primaryButtonText
                }
              >
                {busy
                  ? 'جارٍ التصويت...'
                  : 'تأكيد التصويت'}
              </Text>
            </Pressable>
          </View>
        )}

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
              الإجراء الليلي
            </Text>

            <Text
              style={
                styles.helperText
              }
            >
              اختر لاعبًا ثم اختر
              الإجراء المناسب لدورك.
            </Text>

            <View
              style={
                styles.actionButtons
              }
            >
              {nightActions.map(
                action => (
                  <Pressable
                    key={
                      action
                    }
                    style={[
                      styles.actionButton,
                      !selectedTarget &&
                        styles.disabledButton,
                    ]}
                    disabled={
                      !selectedTarget ||
                      busy
                    }
                    onPress={() =>
                      void handleNightAction(
                        action,
                        selectedTarget
                      )
                    }
                  >
                    <Text
                      style={
                        styles.actionButtonText
                      }
                    >
                      {ACTION_LABELS[
                        action
                      ] || action}
                    </Text>
                  </Pressable>
                )
              )}
            </View>
          </View>
        )}

        {canChat && (
          <View
            style={
              styles.chatCard
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
                💬 الدردشة
              </Text>

              {messagesLoading && (
                <ActivityIndicator
                  size="small"
                />
              )}
            </View>

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
                  message => {
                    const mine =
                      message.user_id ===
                      currentUserId;

                    const sender =
                      players.find(
                        p =>
                          p.user_id ===
                          message.user_id
                      );

                    return (
                      <View
                        key={
                          message.id
                        }
                        style={[
                          styles.messageRow,
                          mine &&
                            styles.myMessageRow,
                        ]}
                      >
                        <View
                          style={[
                            styles.messageBubble,
                            mine &&
                              styles.myMessageBubble,
                          ]}
                        >
                          <Text
                            style={[
                              styles.messageSender,
                              mine &&
                                styles.myMessageSender,
                            ]}
                          >
                            {sender
                              ? getPlayerDisplayName(
                                  sender
                                )
                              : 'لاعب'}
                          </Text>

                          <Text
                            style={[
                              styles.messageText,
                              mine &&
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
                value={
                  messageText
                }
                onChangeText={
                  setMessageText
                }
                placeholder="اكتب رسالة..."
                placeholderTextColor="#666"
                multiline
                style={
                  styles.chatInput
                }
                editable={
                  !busy
                }
              />

              <Pressable
                style={[
                  styles.sendButton,
                  (
                    !messageText.trim() ||
                    busy
                  ) &&
                    styles.disabledButton,
                ]}
                disabled={
                  !messageText.trim() ||
                  busy
                }
                onPress={() =>
                  void handleSendMessage()
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
        )}

        <View
          style={
            styles.statusCard
          }
        >
          <Text
            style={
              styles.sectionTitle
            }
          >
            حالة الغرفة
          </Text>

          <Text
            style={
              styles.statusText
            }
          >
            {roomStatusText}
          </Text>

          {room.code && (
            <Text
              style={
                styles.roomCodeText
              }
            >
              كود الغرفة: {room.code}
            </Text>
          )}
        </View>

        <Pressable
          style={
            styles.leaveButton
          }
          onPress={() =>
            void handleLeaveRoom()
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

        <View
          style={
            styles.bottomSpace
          }
        />
      </ScrollView>
    </View>
  );
}
