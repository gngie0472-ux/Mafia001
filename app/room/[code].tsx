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
  submitDayVote,
  submitNightAction,
} from '../../lib/game';

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

const ROLE_LABELS: Record<GameRole, string> = {
  MAFIA: 'المافيا',
  DOCTOR: 'الطبيب',
  DETECTIVE: 'المحقق',
  CITIZEN: 'المواطن',
};

const ROLE_DESCRIPTIONS: Record<GameRole, string> = {
  MAFIA:
    'اقتل أحد اللاعبين ليلًا وحاول السيطرة على المدينة.',
  DOCTOR:
    'احمِ لاعبًا واحدًا كل ليلة من القتل.',
  DETECTIVE:
    'تحقق من لاعب واحد كل ليلة لمعرفة هل هو من المافيا.',
  CITIZEN:
    'راقب اللاعبين وصوّت لاكتشاف المافيا.',
};

function getSecondsLeft(
  endsAt: string | null
): number {
  if (!endsAt) {
    return 0;
  }

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
  const safe =
    Math.max(0, seconds);

  const minutes =
    Math.floor(safe / 60);

  const remaining =
    safe % 60;

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
  if (!event) {
    return null;
  }

  if (typeof event === 'string') {
    return event;
  }

  switch (event.type) {
    case 'night_started':
      return 'بدأ الليل. كل دور عليه تنفيذ مهمته.';

    case 'day_started':
      return 'انتهى الليل وبدأ النهار. تحدثوا واكتشفوا المافيا.';

    case 'night_kill':
      return 'حدثت عملية قتل خلال الليل.';

    case 'night_saved':
      return 'الطبيب أنقذ اللاعب المستهدف.';

    case 'day_vote':
      return 'تم تنفيذ نتيجة التصويت.';

    case 'day_tie':
      return 'حدث تعادل في التصويت ولم يمت أحد.';

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

  /*
   * app/room/[code].tsx يرسل room.id
   * وليس كود الغرفة.
   */
  const roomId =
    Array.isArray(params.code)
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

  const lastAdvanceRef =
    useRef<number>(0);

  const advancingRef =
    useRef(false);

  const isMountedRef =
    useRef(true);

  const loadProfiles =
    useCallback(
      async (
        players: GamePlayer[]
      ) => {
        if (!players.length) {
          setProfiles({});
          return;
        }

        const userIds =
          players
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

  const loadMessages =
    useCallback(
      async () => {
        if (!roomId) {
          return;
        }

        setMessagesLoading(true);

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
          setMessagesLoading(
            false
          );
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

          setMyRole(
            role.role
          );

          setMyAlive(
            role.alive
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
            isMountedRef.current
          ) {
            Alert.alert(
              'تعذر تحميل اللعبة',
              error?.message ||
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
      ]
    );

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!roomId) {
      return;
    }

    loadGame(true);
  }, [
    roomId,
    loadGame,
  ]);

  /*
   * عداد المرحلة + الانتقال التلقائي.
   */
  useEffect(() => {
    if (
      !gameState?.room?.phase_ends_at
    ) {
      setSecondsLeft(0);
      return;
    }

    const updateTimer =
      () => {
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
          gameState.room
            .status === 'playing' &&
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
                  loadGame(
                    false
                  );
                }
              })
              .catch(
                (error: any) => {
                  const message =
                    error?.message ||
                    '';

                  /*
                   * إذا سبق جهاز آخر ونقل المرحلة،
                   * لا نعتبر ذلك خطأ للمستخدم.
                   */
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

    const interval =
      setInterval(
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
    if (!gameState?.room?.id) {
      return;
    }

    loadMessages();
  }, [
    gameState?.room?.id,
    loadMessages,
  ]);

  /*
   * تحديث احتياطي كل 2.5 ثانية.
   */
  useEffect(() => {
    if (!roomId) {
      return;
    }

    const interval =
      setInterval(
        () => {
          loadGame(false);
        },
        2500
      );

    return () => {
      clearInterval(interval);
    };
  }, [
    roomId,
    loadGame,
  ]);

  /*
   * Realtime.
   */
  useEffect(() => {
    if (!gameState?.room?.id) {
      return;
    }

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
            filter: `id=eq.${currentRoomId}`,
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
            filter: `room_id=eq.${currentRoomId}`,
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
            filter: `room_id=eq.${currentRoomId}`,
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
    gameState?.room || null;

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

  const canNightAction =
    Boolean(
      isNight &&
        myAlive &&
        !gameFinished &&
        myRole &&
        (
          myRole ===
            'MAFIA' ||
          myRole ===
            'DOCTOR' ||
          myRole ===
            'DETECTIVE'
        )
    );

  const roleLabel =
    myRole
      ? ROLE_LABELS[myRole]
      : 'جارٍ التحميل';

  const roleDescription =
    myRole
      ? ROLE_DESCRIPTIONS[
          myRole
        ]
      : '';

  const eventText =
    getEventText(
      room?.last_event ||
        null
    );

  const selectTarget =
    (playerId: string) => {
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
            item.id ===
            playerId
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
      action:
        | 'kill'
        | 'protect'
        | 'investigate'
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
        !myRole
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

      if (
        action === 'kill' &&
        myRole !== 'MAFIA'
      ) {
        return;
      }

      if (
        action === 'protect' &&
        myRole !== 'DOCTOR'
      ) {
        return;
      }

      if (
        action ===
          'investigate' &&
        myRole !== 'DETECTIVE'
      ) {
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

            const role =
              data.role ||
              data.target_role ||
              data.result;

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

          Alert.alert(
            'نتيجة التحقيق',
            `${selectedName}\n\n${resultText}`
          );
        } else if (
          action === 'kill'
        ) {
          Alert.alert(
            'تم',
            `تم اختيار ${selectedName} كهدف للمافيا.`
          );
        } else {
          Alert.alert(
            'تم',
            `تم اختيار ${selectedName} للحماية.`
          );
        }

        await loadGame(
          false
        );
      } catch (error: any) {
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

        await loadGame(
          false
        );
      } catch (error: any) {
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
        !isDay ||
        !myAlive ||
        gameFinished ||
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
            p_room_id:
              room.id,
            p_message:
              text,
          }
        );

        if (error) {
          throw error;
        }

        setMessageText('');
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
        setBusy(false);
      }
    };

  const leaveGame =
    () => {
      Alert.alert(
        'الخروج من اللعبة',
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
        <Text
          style={
            styles.errorText
          }
        >
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
            style={
              styles.buttonText
            }
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
          style={
            styles.loadingText
          }
        >
          جارٍ تحميل اللعبة...
        </Text>
      </View>
    );
  }

  if (!gameState || !room) {
    return (
      <View style={styles.center}>
        <Text
          style={
            styles.errorText
          }
        >
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
            style={
              styles.buttonText
            }
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
        <View style={styles.header}>
          <View>
            <Text
              style={
                styles.logo
              }
            >
              MAFIA NIGHT
            </Text>

            <Text
              style={
                styles.roomCode
              }
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
              style={
                styles.exitText
              }
            >
              خروج
            </Text>
          </Pressable>
        </View>

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
                style={
                  styles.timer
                }
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
            style={
              styles.roundText
            }
          >
            الجولة{' '}
            {room.game_round ||
              1}
          </Text>
        </View>

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
                player={
                  myPlayer
                }
                profile={
                  profiles[
                    myPlayer
                      .user_id
                  ]
                }
                size={54}
              />
            )}
          </View>

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
                💀 لقد مت — يمكنك متابعة اللعبة، لكن لا يمكنك تنفيذ المهام أو التصويت أو التحدث.
              </Text>
            </View>
          )}
        </View>

        {eventText && (
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
        )}

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
                styles.playerCount
              }
            >
              {alivePlayers.length}/
              {players.length}{' '}
              أحياء
            </Text>
          </View>

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
                (
                  isNight
                    ? canNightAction
                    : Boolean(
                        isDay
                      )
                );

              return (
                <Pressable
                  key={
                    player.id
                  }
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
                  style={[
                    styles.playerCard,
                    !player.alive &&
                      styles.deadPlayerCard,
                    selected &&
                      styles.selectedPlayerCard,
                  ]}
                >
                  <PlayerAvatar
                    player={
                      player
                    }
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
              );
            }
          )}
        </View>

        {isNight &&
          myAlive &&
          !gameFinished &&
          myRole ===
            'MAFIA' && (
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
                🔪 مهمة المافيا
              </Text>

              <Text
                style={
                  styles.actionDescription
                }
              >
                اختر لاعبًا حيًا واحدًا للقضاء عليه.
              </Text>

              <Pressable
                style={[
                  styles.dangerButton,
                  !selectedTarget &&
                    styles.disabledButton,
                ]}
                disabled={
                  !selectedTarget ||
                  busy
                }
                onPress={() =>
                  performNightAction(
                    'kill'
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
                    تنفيذ القتل
                  </Text>
                )}
              </Pressable>
            </View>
          )}

        {isNight &&
          myAlive &&
          !gameFinished &&
          myRole ===
            'DOCTOR' && (
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
                🩺 مهمة الطبيب
              </Text>

              <Text
                style={
                  styles.actionDescription
                }
              >
                اختر لاعبًا واحدًا لحمايته هذه الليلة.
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
                onPress={() =>
                  performNightAction(
                    'protect'
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
                    حماية اللاعب
                  </Text>
                )}
              </Pressable>
            </View>
          )}

        {isNight &&
          myAlive &&
          !gameFinished &&
          myRole ===
            'DETECTIVE' && (
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
                🔎 مهمة المحقق
              </Text>

              <Text
                style={
                  styles.actionDescription
                }
              >
                يمكنك التحقيق مع شخص واحد فقط كل ليلة.
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
                onPress={() =>
                  performNightAction(
                    'investigate'
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
                    التحقيق
                  </Text>
                )}
              </Pressable>
            </View>
          )}

        {isNight &&
          myAlive &&
          !gameFinished &&
          myRole ===
            'CITIZEN' && (
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
                🌙 أنت مواطن
              </Text>

              <Text
                style={
                  styles.infoText
                }
              >
                لا توجد لديك مهمة ليلية. راقب ما يحدث واستعد للنقاش في النهار.
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

        {isDay && (
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
                  💬 دردشة النهار
                </Text>

                <Text
                  style={
                    styles.chatSubtitle
                  }
                >
                  التواصل متاح أثناء النهار فقط
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
                              id:
                                message.user_id,
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

            {myAlive &&
            !gameFinished ? (
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
                  placeholder="اكتب رسالتك..."
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
                  <Text
                    style={
                      styles.sendButtonText
                    }
                  >
                    إرسال
                  </Text>
                </Pressable>
              </View>
            ) : (
              <View
                style={
                  styles.chatClosed
                }
              >
                <Text
                  style={
                    styles.chatClosedText
                  }
                >
                  💀 لا يمكنك إرسال الرسائل.
                </Text>
              </View>
            )}
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

        {!myAlive &&
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

const styles =
  StyleSheet.create({
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

    phaseTitle: {
      color: '#fff',
      fontSize: 25,
      fontWeight: '900',
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

    playerCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#111216',
      borderWidth: 1,
      borderColor: '#24262c',
      borderRadius: 15,
      padding: 11,
      marginBottom: 8,
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

    chatClosed: {
      borderTopWidth: 1,
      borderTopColor: '#282a30',
      paddingTop: 12,
    },

    chatClosedText: {
      color: '#777',
      textAlign: 'center',
      fontSize: 12,
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
