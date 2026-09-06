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

const ROLE_ACTIONS: Partial<
  Record<GameRole, NightAction[]>
> = {
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
  endsAt: string | null
): number {
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
  )}:${String(remaining).padStart(2, '0')}`;
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

  const roomId = Array.isArray(params.code)
    ? params.code[0]
    : params.code;

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

  const lastAdvanceRef =
    useRef<number>(0);

  const advancingRef =
    useRef(false);

  const isMountedRef =
    useRef(true);

  const loadProfiles = useCallback(
    async (players: GamePlayer[]) => {
      if (!players.length) {
        setProfiles({});
        return;
      }

      const userIds = players
        .map(
          (player) => player.user_id
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
        .in('user_id', userIds);

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

      const {
        data,
        error,
      } = await supabase
        .from('room_messages')
        .select(
          'id, room_id, user_id, message, created_at'
        )
        .eq('room_id', roomId)
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

      if (isMountedRef.current) {
        setMessagesLoading(false);
      }
    },
    [roomId]
  );

  const loadGame = useCallback(
    async (showLoader = false) => {
      if (!roomId) {
        Alert.alert(
          'خطأ',
          'معرف الغرفة غير موجود.'
        );
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
          .eq('room_id', roomId)
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

          if (
            !isMountedRef.current
          ) {
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

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  /*
   * --------------------------------------------------
   * HEARTBEAT
   * --------------------------------------------------
   *
   * يتم تحديث last_seen_at فور دخول اللاعب
   * إلى الغرفة ثم كل 20 ثانية.
   *
   * get_public_rooms يستخدم هذه القيمة لمعرفة
   * اللاعبين الموجودين فعليًا.
   */
  useEffect(() => {
    if (!roomId) return;

    let cancelled = false;

    const sendHeartbeat = async () => {
      if (cancelled) return;

      await heartbeatRoom(roomId);
    };

    sendHeartbeat();

    const interval = setInterval(
      sendHeartbeat,
      20_000
    );

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [roomId]);

  useEffect(() => {
    if (!roomId) return;

    loadGame(true);
  }, [roomId, loadGame]);

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
        const now = Date.now();

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
                loadGame(false);
              }
            })
            .catch(
              (error: any) => {
                const message =
                  error?.message ||
                  '';

                if (
                  !message.includes(
                    'phase_not_finished'
                  )
                ) {
                  console.error(
                    'advanceMafiaPhase error:',
                    error
                  );
                }

                loadGame(false);
              }
            )
            .finally(() => {
              advancingRef.current =
                false;
            });
        }
      }
    };

    updateTimer();

    const interval = setInterval(
      updateTimer,
      500
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

  useEffect(() => {
    if (!gameState?.room?.id)
      return;

    loadMessages();
  }, [
    gameState?.room?.id,
    loadMessages,
  ]);

  useEffect(() => {
    if (!roomId) return;

    const interval = setInterval(
      () => {
        loadGame(false);
      },
      2500
    );

    return () => {
      clearInterval(
        interval
      );
    };
  }, [roomId, loadGame]);

  useEffect(() => {
    if (!gameState?.room?.id)
      return;

    const currentRoomId =
      gameState.room.id;

    const channel =
      supabase
        .channel(
          `mafia-game-${currentRoomId}`
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'rooms',
            filter:
              `id=eq.${currentRoomId}`,
          },
          () => {
            loadGame(false);
          }
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'room_players',
            filter:
              `room_id=eq.${currentRoomId}`,
          },
          () => {
            loadGame(false);
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'room_messages',
            filter:
              `room_id=eq.${currentRoomId}`,
          },
          (payload) => {
            const message =
              payload.new as Message;

            if (
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
                      message.id
                  )
                ) {
                  return current;
                }

                return [
                  ...current,
                  message,
                ];
              }
            );
          }
        )
        .subscribe();

    return () => {
      supabase.removeChannel(
        channel
      );
    };
  }, [
    gameState?.room?.id,
    loadGame,
  ]);

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
    room?.status === 'waiting';

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

  const canChat = Boolean(
    room &&
      !gameFinished &&
      (isWaiting ||
        (isDay && myAlive))
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
        nightActions.length >
          0
    );

  const roleLabel = myRole
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

  const kickPlayer = async (
    player: GamePlayer
  ) => {
    if (
      !roomId ||
      !room ||
      !canKick
    ) {
      return;
    }

    if (
      player.user_id ===
      myPlayer?.user_id
    ) {
      return;
    }

    const playerName =
      profiles[
        player.user_id
      ]?.username ||
      player.name ||
      'هذا اللاعب';

    Alert.alert(
      'طرد اللاعب',
      `هل تريد طرد ${playerName} من الغرفة؟`,
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
              if (
                !roomId ||
                !isMountedRef.current
              ) {
                return;
              }

              setKickingUserId(
                player.user_id
              );

              try {
                await kickRoomPlayer(
                  roomId,
                  player.user_id
                );

                if (
                  !isMountedRef.current
                ) {
                  return;
                }

                Alert.alert(
                  'تم الطرد',
                  `تم طرد ${playerName} من الغرفة.`
                );

                await loadGame(
                  false
                );
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
                    'تعذر الطرد',
                    error?.message ||
                      'حدث خطأ أثناء طرد اللاعب.'
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
  };

  const selectTarget = (
    playerId: string
  ) => {
    if (
      busy ||
      !myAlive ||
      gameFinished
    ) {
      return;
    }

    const player =
      players.find(
        (item) =>
          item.id === playerId
      );

    if (
      !player ||
      !player.alive ||
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
  };

  const performNightAction =
    async (
      action: NightAction
    ) => {
      if (
        !roomId ||
        !selectedTarget
      ) {
        Alert.alert(
          'اختر لاعبًا',
          'يجب اختيار لاعب واحد أولًا.'
        );
        return;
      }

      if (
        !canNightAction ||
        !myRole ||
        !nightActions.includes(
          action
        )
      ) {
        return;
      }

      const target =
        players.find(
          (player) =>
            player.id ===
            selectedTarget
        );

      if (
        !target ||
        !target.alive ||
        target.id ===
          gameState?.my_player_id
      ) {
        Alert.alert(
          'هدف غير صالح',
          'يجب اختيار لاعب حي آخر.'
        );
        return;
      }

      setBusy(true);

      try {
        const result =
          await submitNightAction(
            roomId,
            action,
            selectedTarget
          );

        const selectedName =
          profiles[
            target.user_id
          ]?.username ||
          target.name ||
          'Player';

        setSelectedTarget(
          null
        );

        if (
          action ===
          'investigate'
        ) {
          let resultText =
            'تم تنفيذ التحقيق.';

          if (
            typeof result ===
            'string'
          ) {
            resultText =
              result;
          } else if (
            result &&
            typeof result ===
              'object'
          ) {
            const data =
              result as any;

            if (
              data.is_mafia ===
              true
            ) {
              resultText =
                'هذا اللاعب من المافيا.';
            } else if (
              data.is_mafia ===
              false
            ) {
              resultText =
                'هذا اللاعب ليس من المافيا.';
            } else {
              const role =
                data.role ||
                data.target_role;

              if (
                role ===
                'MAFIA'
              ) {
                resultText =
                  'هذا اللاعب من المافيا.';
              } else if (
                role
              ) {
                resultText =
                  'هذا اللاعب ليس من المافيا.';
              }
            }
          }

          Alert.alert(
            'نتيجة التحقيق',
            `${selectedName}\n\n${resultText}`
          );
        } else {
          const info =
            ACTION_INFO[
              action
            ];

          Alert.alert(
            'تم تنفيذ المهمة',
            `${info.button}\n\nالهدف: ${selectedName}`
          );
        }

        await loadGame(false);
      } catch (
        error: any
      ) {
        console.error(
          'performNightAction error:',
          error
        );

        Alert.alert(
          'تعذر تنفيذ العملية',
          error?.message ||
            'لا يمكن تنفيذ هذه العملية الآن.'
        );
      } finally {
        setBusy(false);
      }
    };

  const performVote =
    async () => {
      if (
        !roomId ||
        !selectedTarget ||
        !isDay ||
        !myAlive ||
        gameFinished
      ) {
        return;
      }

      const target =
        players.find(
          (player) =>
            player.id ===
            selectedTarget
        );

      if (
        !target ||
        !target.alive ||
        target.id ===
          gameState?.my_player_id
      ) {
        Alert.alert(
          'تصويت غير صالح',
          'اختر لاعبًا حيًا آخر.'
        );
        return;
      }

      setBusy(true);

      try {
        await submitDayVote(
          roomId,
          selectedTarget
        );

        const targetName =
          profiles[
            target.user_id
          ]?.username ||
          target.name ||
          'Player';

        setSelectedTarget(
          null
        );

        Alert.alert(
          'تم التصويت',
          `تم تسجيل تصويتك ضد ${targetName}.`
        );

        await loadGame(false);
      } catch (
        error: any
      ) {
        console.error(
          'performVote error:',
          error
        );

        Alert.alert(
          'تعذر تسجيل التصويت',
          error?.message ||
            'حدث خطأ أثناء تسجيل التصويت.'
        );
      } finally {
        setBusy(false);
      }
    };

  const sendMessage =
    async () => {
      const text =
        messageText.trim();

      if (
        !text ||
        !room?.id ||
        !canChat ||
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
                room.id,
              p_message: text,
            }
          );

        if (error) {
          throw error;
        }

        setMessageText('');
      } catch (
        error: any
      ) {
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
        setBusy(false);
      }
    };

  const leaveGame = () => {
    Alert.alert(
      'الخروج من الغرفة',
      'هل تريد العودة إلى قائمة الغرف؟',
      [
        {
          text: 'إلغاء',
          style: 'cancel',
        },
        {
          text: 'خروج',
          style: 'destructive',
          onPress: () => {
            router.replace(
              '/rooms'
            );
          },
        },
      ]
    );
  };

  if (!roomId) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>
          معرف الغرفة غير موجود.
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
            style={styles.buttonText}
          >
            العودة إلى الغرف
          </Text>
        </Pressable>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator
          size="large"
          color="#D7A94B"
        />

        <Text
          style={styles.loadingText}
        >
          جارٍ تحميل اللعبة...
        </Text>
      </View>
    );
  }

  if (
    !gameState ||
    !room
  ) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>
          تعذر العثور على حالة اللعبة.
        </Text>

        <Pressable
          style={
            styles.primaryButton
          }
          onPress={() =>
            loadGame(true)
          }
        >
          <Text
            style={styles.buttonText}
          >
            إعادة المحاولة
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={
          styles.content
        }
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={
          false
        }
      >
        <View
          style={styles.header}
        >
          <View>
            <Text
              style={styles.logo}
            >
              MAFIA NIGHT
            </Text>

            <Text
              style={styles.roomCode}
            >
              الغرفة:{' '}
              {room.code ||
                room.id}
            </Text>
          </View>

          <Pressable
            style={
              styles.exitButton
            }
            onPress={
              leaveGame
            }
          >
            <Text
              style={styles.exitText}
            >
              خروج
            </Text>
          </Pressable>
        </View>

        {isWaiting ? (
          <View
            style={[
              styles.phaseCard,
              styles.waitingCard,
            ]}
          >
            <Text
              style={
                styles.phaseTitle
              }
            >
              ⏳ انتظار بدء اللعبة
            </Text>

            <Text
              style={
                styles.waitingText
              }
            >
              يمكنكم التحدث هنا مع باقي اللاعبين قبل بدء اللعبة.
            </Text>

            <Text
              style={styles.roundText}
            >
              عدد اللاعبين:{' '}
              {players.length}
            </Text>
          </View>
        ) : (
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
              {gameFinished
                ? 'انتهت اللعبة'
                : isNight
                ? '🌙 الليل'
                : '☀️ النهار'}
            </Text>

            {!gameFinished && (
              <>
                <Text
                  style={styles.timer}
                >
                  {formatTime(
                    secondsLeft
                  )}
                </Text>

                <Text
                  style={
                    styles.timerCaption
                  }
                >
                  الوقت المتبقي
                </Text>
              </>
            )}

            <Text
              style={styles.roundText}
            >
              الجولة{' '}
              {room.game_round ||
                1}
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

        {!isWaiting && (
          <View
            style={styles.roleCard}
          >
            <View
              style={
                styles.roleHeader
              }
            >
              <Text
                style={
                  styles.roleTitle
                }
              >
                دورك
              </Text>

              {myPlayer && (
                <PlayerAvatar
                  player={myPlayer}
                  profile={
                    profiles[
                      myPlayer.user_id
                    ]
                  }
                  size={54}
                />
              )}
            </View>

            <Text
              style={styles.roleName}
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
                  💀 لقد مت — يمكنك متابعة اللعبة، لكن لا يمكنك تنفيذ المهام أو التصويت أو التحدث.
                </Text>
              </View>
            )}
          </View>
        )}

        {eventText && (
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
              {eventText}
            </Text>
          </View>
        )}

        <View
          style={styles.section}
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
              {players.length}{' '}
              أحياء
            </Text>
          </View>

          {canKick && (
            <View
              style={
                styles.hostNotice
              }
            >
              <Text
                style={
                  styles.hostNoticeText
                }
              >
                👑 أنت منشئ الغرفة — يمكنك طرد اللاعبين قبل بدء اللعبة.
              </Text>
            </View>
          )}

          {players.map(
            (player) => {
              const profile =
                profiles[
                  player.user_id
                ];

              const selected =
                selectedTarget ===
                player.id;

              const isMe =
                player.id ===
                gameState.my_player_id;

              const selectable =
                player.alive &&
                !isMe &&
                myAlive &&
                !gameFinished &&
                (isNight
                  ? canNightAction
                  : Boolean(isDay));

              const canKickThisPlayer =
                canKick &&
                !isMe &&
                player.user_id !==
                  myPlayer?.user_id;

              const isBeingKicked =
                kickingUserId ===
                player.user_id;

              return (
                <View
                  key={player.id}
                  style={[
                    styles.playerCard,
                    !player.alive &&
                      styles.deadPlayerCard,
                    selected &&
                      styles.selectedPlayerCard,
                  ]}
                >
                  <Pressable
                    onPress={() => {
                      if (
                        selectable
                      ) {
                        selectTarget(
                          player.id
                        );
                      }
                    }}
                    disabled={
                      !selectable ||
                      busy
                    }
                    style={
                      styles.playerMain
                    }
                  >
                    <PlayerAvatar
                      player={player}
                      profile={
                        profile
                      }
                      size={48}
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
                          style={[
                            styles.playerName,
                            !player.alive &&
                              styles.deadName,
                          ]}
                        >
                          {profile?.username ||
                            player.name ||
                            'Player'}
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
                            👑 منشئ
                          </Text>
                        )}
                      </View>

                      <Text
                        style={
                          styles.playerStatus
                        }
                      >
                        {player.alive
                          ? '🟢 حي'
                          : '💀 مات'}
                      </Text>
                    </View>

                    {selected && (
                      <Text
                        style={
                          styles.selectedMark
                        }
                      >
                        ✓
                      </Text>
                    )}
                  </Pressable>

                  {canKickThisPlayer && (
                    <Pressable
                      style={[
                        styles.kickButton,
                        isBeingKicked &&
                          styles.kickButtonDisabled,
                      ]}
                      disabled={
                        isBeingKicked
                      }
                      onPress={() =>
                        kickPlayer(
                          player
                        )
                      }
                    >
                      {isBeingKicked ? (
                        <ActivityIndicator
                          size="small"
                          color="#fff"
                        />
                      ) : (
                        <Text
                          style={
                            styles.kickButtonText
                          }
                        >
                          🚫 طرد
                        </Text>
                      )}
                    </Pressable>
                  )}
                </View>
              );
            }
          )}
        </View>

        {isNight &&
          myAlive &&
          !gameFinished &&
          nightActions.length >
            0 && (
            <>
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
                        {info.description}
                      </Text>

                      <Pressable
                        style={[
                          info.danger
                            ? styles.dangerButton
                            : styles.primaryButton,
                          !selectedTarget &&
                            styles.disabledButton,
                        ]}
                        disabled={
                          !selectedTarget ||
                          busy
                        }
                        onPress={() =>
                          performNightAction(
                            action
                          )
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
            </>
          )}

        {isNight &&
          myAlive &&
          !gameFinished &&
          nightActions.length ===
            0 && (
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
                🌙 لا توجد مهمة ليلية
              </Text>

              <Text
                style={styles.infoText}
              >
                دورك لا يملك إجراءً ليليًا متاحًا حاليًا. راقب الأحداث واستعد للنهار.
              </Text>
            </View>
          )}

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
                  styles.actionTitle
                }
              >
                🗳️ التصويت
              </Text>

              <Text
                style={
                  styles.actionDescription
                }
              >
                اختر لاعبًا حيًا واحدًا للتصويت عليه. يتم احتساب النتيجة عند انتهاء النهار.
              </Text>

              <Pressable
                style={[
                  styles.voteButton,
                  !selectedTarget &&
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
                    تأكيد التصويت
                  </Text>
                )}
              </Pressable>
            </View>
          )}

        {canChat && (
          <View
            style={styles.chatCard}
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
                  <ActivityIndicator
                    color="#D7A94B"
                  />

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
              <ActivityIndicator
                color="#D7A94B"
              />
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

  center: {
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

  errorText: {
    color: '#ff6b6b',
    fontSize: 17,
    textAlign: 'center',
    marginBottom: 20,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },

  logo: {
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

  exitButton: {
    borderWidth: 1,
    borderColor: '#393b45',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
  },

  exitText: {
    color: '#ddd',
    fontWeight: '700',
  },

  phaseCard: {
    borderRadius: 20,
    padding: 22,
    alignItems: 'center',
    marginBottom: 14,
    borderWidth: 1,
  },

  nightCard: {
    backgroundColor: '#111425',
    borderColor: '#2a3157',
  },

  dayCard: {
    backgroundColor: '#19150d',
    borderColor: '#574522',
  },

  waitingCard: {
    backgroundColor: '#11151a',
    borderColor: '#39434f',
  },

  waitingText: {
    color: '#aaa',
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginTop: 9,
  },

  phaseTitle: {
    color: '#fff',
    fontSize: 25,
    fontWeight: '900',
    textAlign: 'center',
  },

  timer: {
    color: '#fff',
    fontSize: 44,
    fontWeight: '900',
    marginTop: 8,
    letterSpacing: 2,
  },

  timerCaption: {
    color: '#aaa',
    fontSize: 12,
  },

  roundText: {
    color: '#aaa',
    marginTop: 10,
    fontSize: 13,
  },

  winnerCard: {
    backgroundColor: '#16130a',
    borderWidth: 1,
    borderColor: '#6b5420',
    borderRadius: 16,
    padding: 18,
    marginBottom: 14,
    alignItems: 'center',
  },

  winnerTitle: {
    color: '#f0c75e',
    fontSize: 21,
    fontWeight: '900',
  },

  winnerText: {
    color: '#fff',
    fontSize: 17,
    marginTop: 8,
    fontWeight: '700',
  },

  roleCard: {
    backgroundColor: '#111216',
    borderColor: '#282a31',
    borderWidth: 1,
    borderRadius: 18,
    padding: 18,
    marginBottom: 14,
  },

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

  playerStatus: {
    color: '#888',
    fontSize: 12,
    marginTop: 4,
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

بعد استبداله لا نبني APK بعد.

الخطوة التالية المهمة هي إصلاح "app/game/[code].tsx" لأن هذا هو المكان الذي يدخل فيه "T2GZ6M" إلى "getGameState()" باعتباره UUID.

أرسل لي فقط "app/game/[code].tsx" الحالي كاملًا إذا كنت قد عدّلته منذ آخر نسخة، وسأعطيك النسخة النهائية التي تقبل كود الغرفة وUUID بأمان دون ظهور خطأ "invalid input syntax for type uuid".
