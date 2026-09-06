import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { useLocalSearchParams, useRouter } from 'expo-router';
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
  MAFIA: 'اقتل أحد اللاعبين ليلًا وحاول السيطرة على المدينة.',
  DOCTOR: 'احمِ لاعبًا واحدًا كل ليلة من القتل.',
  DETECTIVE: 'تحقق من لاعب واحد كل ليلة لمعرفة هل هو من المافيا.',
  CITIZEN: 'راقب اللاعبين وصوّت لاكتشاف المافيا.',
};

function getSecondsLeft(endAt: string | null) {
  if (!endAt) return 0;

  const end = new Date(endAt).getTime();
  const now = Date.now();

  return Math.max(0, Math.ceil((end - now) / 1000));
}

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;

  return `${String(minutes).padStart(2, '0')}:${String(
    remaining
  ).padStart(2, '0')}`;
}

function getEventText(
  event: GameState['room']['last_event'],
  players: GamePlayer[]
) {
  if (!event) return '';

  const player = event.player_id
    ? players.find((p) => p.id === event.player_id)
    : null;

  const name = player?.name ?? 'لاعب';

  switch (event.type) {
    case 'night_kill':
      return `💀 تم قتل ${name} أثناء الليل.`;

    case 'night_saved':
      return '🩺 الطبيب أنقذ الضحية هذه الليلة.';

    case 'day_elimination':
      return `⚖️ تم إخراج ${name} من اللعبة بالتصويت.`;

    case 'day_tie':
      return '⚖️ انتهى التصويت بالتعادل، ولم يتم إخراج أحد.';

    case 'game_finished':
      return event.winner === 'MAFIA'
        ? '🏆 المافيا فازت!'
        : '🏆 المواطنون فازوا!';

    default:
      return '';
  }
}

function PlayerAvatar({
  player,
  profiles,
}: {
  player: GamePlayer;
  profiles: ProfileMap;
}) {
  const avatar =
    player.avatar_url ??
    profiles[player.user_id]?.avatar_url ??
    null;

  if (avatar) {
    return (
      <Image
        source={{ uri: avatar }}
        style={styles.avatar}
      />
    );
  }

  return (
    <View style={styles.avatarPlaceholder}>
      <Text style={styles.avatarLetter}>
        {(player.name || 'P').charAt(0).toUpperCase()}
      </Text>
    </View>
  );
}

export default function MafiaGameScreen() {
  const params = useLocalSearchParams<{ code?: string }>();
  const router = useRouter();

  const roomCode =
    typeof params.code === 'string'
      ? params.code
      : '';

  const [game, setGame] = useState<GameState | null>(null);
  const [role, setRole] = useState<GameRole | null>(null);
  const [myAlive, setMyAlive] = useState(true);

  const [profiles, setProfiles] =
    useState<ProfileMap>({});

  const [messages, setMessages] =
    useState<Message[]>([]);

  const [messageText, setMessageText] =
    useState('');

  const [secondsLeft, setSecondsLeft] =
    useState(0);

  const [selectedTarget, setSelectedTarget] =
    useState<string | null>(null);

  const [busy, setBusy] =
    useState(false);

  const [loading, setLoading] =
    useState(true);

  const advancingRef = useRef(false);

  const roomId = game?.room.id ?? null;

  const loadGame = useCallback(async () => {
    if (!roomCode) return;

    try {
      const state = await getGameState(roomCode);

      setGame(state);

      if (state.my_player_id) {
        const mine = state.players.find(
          (p) => p.id === state.my_player_id
        );

        if (mine) {
          setMyAlive(mine.alive);
        }
      }

      try {
        const myRole = await getMyRole(roomCode);

        setRole(myRole.role);
        setMyAlive(myRole.alive);
      } catch (roleError) {
        console.log(
          'Role not available:',
          roleError
        );
      }
    } catch (error: any) {
      console.error('loadGame:', error);

      Alert.alert(
        'خطأ',
        error?.message ||
          'تعذر تحميل حالة اللعبة.'
      );
    } finally {
      setLoading(false);
    }
  }, [roomCode]);

  const loadProfiles = useCallback(
    async (players: GamePlayer[]) => {
      const ids = [
        ...new Set(
          players
            .map((player) => player.user_id)
            .filter(Boolean)
        ),
      ];

      if (!ids.length) return;

      const { data, error } =
        await supabase
          .from('profiles')
          .select(
            'user_id, username, avatar_url'
          )
          .in('user_id', ids);

      if (error) {
        console.log(
          'loadProfiles:',
          error
        );
        return;
      }

      const map: ProfileMap = {};

      for (const profile of data ?? []) {
        map[profile.user_id] = {
          username: profile.username,
          avatar_url: profile.avatar_url,
        };
      }

      setProfiles(map);
    },
    []
  );

  const loadMessages = useCallback(async () => {
    if (!roomId) return;

    const { data, error } =
      await supabase
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
      console.log(
        'loadMessages:',
        error
      );
      return;
    }

    setMessages((data ?? []) as Message[]);
  }, [roomId]);

  useEffect(() => {
    loadGame();
  }, [loadGame]);

  useEffect(() => {
    if (!game?.players) return;

    loadProfiles(game.players);
  }, [game?.players, loadProfiles]);

  useEffect(() => {
    if (!roomId) return;

    loadMessages();
  }, [roomId, loadMessages]);

  /*
   * Realtime game updates.
   */
  useEffect(() => {
    if (!roomId) return;

    const channel = supabase
      .channel(`mafia-game-${roomId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'rooms',
          filter: `id=eq.${roomId}`,
        },
        () => {
          loadGame();
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
          loadGame();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'room_messages',
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          const message =
            payload.new as Message;

          setMessages((current) => {
            if (
              current.some(
                (item) =>
                  item.id === message.id
              )
            ) {
              return current;
            }

            return [...current, message];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId, loadGame, loadMessages]);

  /*
   * Countdown.
   */
  useEffect(() => {
    if (!game?.room.phase_ends_at) {
      setSecondsLeft(0);
      return;
    }

    const update = () => {
      setSecondsLeft(
        getSecondsLeft(
          game.room.phase_ends_at
        )
      );
    };

    update();

    const timer = setInterval(
      update,
      1000
    );

    return () => {
      clearInterval(timer);
    };
  }, [game?.room.phase_ends_at]);

  /*
   * Automatically advance the phase when
   * the timer reaches zero.
   */
  useEffect(() => {
    if (!game?.room.phase_ends_at) return;
    if (secondsLeft > 0) return;
    if (game.room.status !== 'playing')
      return;

    if (advancingRef.current) return;

    advancingRef.current = true;

    advanceMafiaPhase(game.room.id)
      .then(() => {
        loadGame();
      })
      .catch((error: any) => {
        const message =
          error?.message || '';

        if (
          !message.includes(
            'phase has not finished'
          ) &&
          !message.includes(
            'phase_not_finished'
          )
        ) {
          console.log(
            'advance phase:',
            error
          );
        }
      })
      .finally(() => {
        setTimeout(() => {
          advancingRef.current = false;
        }, 500);
      });
  }, [
    secondsLeft,
    game?.room.phase_ends_at,
    game?.room.status,
    game?.room.id,
    loadGame,
  ]);

  const players = game?.players ?? [];

  const alivePlayers = useMemo(
    () =>
      players.filter(
        (player) => player.alive
      ),
    [players]
  );

  const myPlayer = useMemo(
    () =>
      players.find(
        (player) =>
          player.id === game?.my_player_id
      ) ?? null,
    [players, game?.my_player_id]
  );

  const selectablePlayers = useMemo(() => {
    return alivePlayers.filter(
      (player) =>
        player.id !== game?.my_player_id
    );
  }, [
    alivePlayers,
    game?.my_player_id,
  ]);

  const displayName = (player: GamePlayer) =>
    profiles[player.user_id]?.username ??
    player.name ??
    'Player';

  async function performNightAction(
    action:
      | 'kill'
      | 'protect'
      | 'investigate'
  ) {
    if (!game) return;

    if (!myAlive) {
      Alert.alert(
        'غير مسموح',
        'أنت ميت ولا يمكنك تنفيذ الأفعال.'
      );
      return;
    }

    if (game.room.game_phase !== 'night') {
      Alert.alert(
        'غير مسموح',
        'هذه الأفعال متاحة أثناء الليل فقط.'
      );
      return;
    }

    if (!selectedTarget) {
      Alert.alert(
        'اختر لاعبًا',
        'يجب اختيار لاعب أولًا.'
      );
      return;
    }

    try {
      setBusy(true);

      const result =
        await submitNightAction(
          game.room.id,
          action,
          selectedTarget
        );

      if (
        action === 'investigate' &&
        result?.is_mafia !== undefined
      ) {
        Alert.alert(
          'نتيجة التحقيق',
          result.is_mafia
            ? '🚨 هذا اللاعب من المافيا!'
            : '✅ هذا اللاعب ليس من المافيا.'
        );
      } else {
        Alert.alert(
          'تم',
          'تم تسجيل اختيارك.'
        );
      }

      setSelectedTarget(null);
    } catch (error: any) {
      Alert.alert(
        'تعذر تنفيذ العملية',
        error?.message ||
          'حدث خطأ أثناء تنفيذ العملية.'
      );
    } finally {
      setBusy(false);
    }
  }

  async function performVote() {
    if (!game) return;

    if (!myAlive) {
      Alert.alert(
        'غير مسموح',
        'اللاعب الميت لا يستطيع التصويت.'
      );
      return;
    }

    if (game.room.game_phase !== 'day') {
      Alert.alert(
        'غير مسموح',
        'التصويت متاح أثناء النهار فقط.'
      );
      return;
    }

    if (!selectedTarget) {
      Alert.alert(
        'اختر لاعبًا',
        'اختر اللاعب الذي تريد التصويت ضده.'
      );
      return;
    }

    try {
      setBusy(true);

      await submitDayVote(
        game.room.id,
        selectedTarget
      );

      Alert.alert(
        'تم التصويت',
        'تم تسجيل تصويتك. يمكنك تغييره قبل انتهاء الوقت.'
      );

      setSelectedTarget(null);
    } catch (error: any) {
      Alert.alert(
        'تعذر التصويت',
        error?.message ||
          'حدث خطأ أثناء التصويت.'
      );
    } finally {
      setBusy(false);
    }
  }

  async function sendMessage() {
    if (!game || !roomId) return;

    const text =
      messageText.trim();

    if (!text) return;

    if (!myAlive) {
      Alert.alert(
        'غير مسموح',
        'اللاعب الميت لا يستطيع إرسال رسائل.'
      );
      return;
    }

    if (game.room.game_phase !== 'day') {
      Alert.alert(
        'الدردشة مغلقة',
        'الدردشة متاحة أثناء النهار فقط.'
      );
      return;
    }

    try {
      setBusy(true);

      const { error } =
        await supabase.rpc(
          'send_room_message',
          {
            p_room_id: roomId,
            p_message: text,
          }
        );

      if (error) {
        throw error;
      }

      setMessageText('');
    } catch (error: any) {
      Alert.alert(
        'تعذر إرسال الرسالة',
        error?.message ||
          'حدث خطأ أثناء إرسال الرسالة.'
      );
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>
          جاري تحميل اللعبة...
        </Text>
      </View>
    );
  }

  if (!game) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>
          تعذر تحميل اللعبة.
        </Text>

        <Pressable
          style={styles.primaryButton}
          onPress={loadGame}
        >
          <Text style={styles.buttonText}>
            إعادة المحاولة
          </Text>
        </Pressable>
      </View>
    );
  }

  const phase =
    game.room.game_phase;

  const isNight =
    phase === 'night';

  const isDay =
    phase === 'day';

  const eventText =
    getEventText(
      game.room.last_event,
      players
    );

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={
          styles.content
        }
      >
        {/* HEADER */}
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>
              MAFIA NIGHT
            </Text>

            <Text style={styles.round}>
              الجولة {game.room.game_round}
            </Text>
          </View>

          <Pressable
            onPress={() =>
              router.replace('/rooms')
            }
            style={styles.exitButton}
          >
            <Text style={styles.exitText}>
              خروج
            </Text>
          </Pressable>
        </View>

        {/* PHASE */}
        <View
          style={[
            styles.phaseCard,
            isNight
              ? styles.nightCard
              : styles.dayCard,
          ]}
        >
          <Text style={styles.phaseIcon}>
            {isNight ? '🌙' : '☀️'}
          </Text>

          <View style={styles.phaseInfo}>
            <Text style={styles.phaseTitle}>
              {isNight
                ? 'الليل'
                : 'النهار'}
            </Text>

            <Text style={styles.phaseSubtitle}>
              {isNight
                ? 'الأدوار الخاصة تنفذ الآن'
                : 'ناقشوا واتفقوا ثم صوّتوا'}
            </Text>
          </View>

          <Text style={styles.timer}>
            {formatTime(secondsLeft)}
          </Text>
        </View>

        {/* ROLE */}
        {role && (
          <View style={styles.roleCard}>
            <Text style={styles.roleCaption}>
              دورك
            </Text>

            <Text style={styles.roleTitle}>
              {ROLE_LABELS[role]}
            </Text>

            <Text style={styles.roleDescription}>
              {ROLE_DESCRIPTIONS[role]}
            </Text>

            {!myAlive && (
              <Text style={styles.deadText}>
                💀 أنت ميت — لا يمكنك التأثير في اللعبة.
              </Text>
            )}
          </View>
        )}

        {/* EVENT */}
        {eventText ? (
          <View style={styles.eventCard}>
            <Text style={styles.eventText}>
              {eventText}
            </Text>
          </View>
        ) : null}

        {/* PLAYERS */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            اللاعبين
          </Text>

          <Text style={styles.playerCount}>
            {alivePlayers.length} على قيد الحياة /{' '}
            {players.length}
          </Text>

          {players.map((player) => {
            const isMe =
              player.id ===
              game.my_player_id;

            const isSelected =
              selectedTarget ===
              player.id;

            const canSelect =
              player.alive &&
              !isMe &&
              myAlive;

            return (
              <Pressable
                key={player.id}
                disabled={!canSelect || busy}
                onPress={() =>
                  setSelectedTarget(
                    isSelected
                      ? null
                      : player.id
                  )
                }
                style={[
                  styles.playerRow,
                  !player.alive &&
                    styles.deadPlayerRow,
                  isSelected &&
                    styles.selectedPlayer,
                ]}
              >
                <PlayerAvatar
                  player={player}
                  profiles={profiles}
                />

                <View
                  style={styles.playerInfo}
                >
                  <Text
                    style={[
                      styles.playerName,
                      !player.alive &&
                        styles.deadName,
                    ]}
                  >
                    {displayName(player)}
                    {isMe ? ' (أنت)' : ''}
                  </Text>

                  <Text style={styles.playerStatus}>
                    {player.alive
                      ? '🟢 حي'
                      : '💀 ميت'}
                  </Text>
                </View>

                {isSelected && (
                  <Text
                    style={styles.checkMark}
                  >
                    ✓
                  </Text>
                )}
              </Pressable>
            );
          })}
        </View>

        {/* NIGHT ACTIONS */}
        {isNight && myAlive && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              أفعال الليل
            </Text>

            <Text style={styles.helperText}>
              اختر لاعبًا ثم اختر العملية المناسبة لدورك.
            </Text>

            {role === 'MAFIA' && (
              <Pressable
                disabled={busy}
                onPress={() =>
                  performNightAction('kill')
                }
                style={styles.dangerButton}
              >
                <Text style={styles.buttonText}>
                  🔪 قتل اللاعب المحدد
                </Text>
              </Pressable>
            )}

            {role === 'DOCTOR' && (
              <Pressable
                disabled={busy}
                onPress={() =>
                  performNightAction('protect')
                }
                style={styles.primaryButton}
              >
                <Text style={styles.buttonText}>
                  🩺 حماية اللاعب المحدد
                </Text>
              </Pressable>
            )}

            {role === 'DETECTIVE' && (
              <Pressable
                disabled={busy}
                onPress={() =>
                  performNightAction(
                    'investigate'
                  )
                }
                style={styles.primaryButton}
              >
                <Text style={styles.buttonText}>
                  🕵️ التحقيق في اللاعب المحدد
                </Text>
              </Pressable>
            )}

            {role === 'CITIZEN' && (
              <View style={styles.infoBox}>
                <Text style={styles.infoText}>
                  أنت مواطن. لا تملك إجراءً ليليًا.
                </Text>
              </View>
            )}
          </View>
        )}

        {/* DAY VOTE */}
        {isDay && myAlive && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              التصويت
            </Text>

            <Text style={styles.helperText}>
              اختر لاعبًا ثم اضغط على زر التصويت.
              يمكنك تغيير تصويتك قبل انتهاء الوقت.
            </Text>

            <Pressable
              disabled={busy}
              onPress={performVote}
              style={styles.voteButton}
            >
              <Text style={styles.buttonText}>
                🗳️ التصويت للاعب المحدد
              </Text>
            </Pressable>
          </View>
        )}

        {/* CHAT */}
        {isDay && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              💬 دردشة النهار
            </Text>

            <Text style={styles.helperText}>
              الدردشة متاحة فقط أثناء النهار.
            </Text>

            <View style={styles.chatBox}>
              {messages.length === 0 ? (
                <Text style={styles.emptyChat}>
                  لا توجد رسائل بعد.
                </Text>
              ) : (
                messages.map((message) => {
                  const sender =
                    players.find(
                      (player) =>
                        player.user_id ===
                        message.user_id
                    );

                  const senderName =
                    sender
                      ? displayName(sender)
                      : profiles[
                          message.user_id
                        ]?.username ??
                        'Player';

                  return (
                    <View
                      key={message.id}
                      style={styles.message}
                    >
                      <Text
                        style={styles.messageName}
                      >
                        {senderName}
                      </Text>

                      <Text
                        style={styles.messageText}
                      >
                        {message.message}
                      </Text>
                    </View>
                  );
                })
              )}
            </View>

            {myAlive ? (
              <View
                style={styles.messageComposer}
              >
                <TextInput
                  value={messageText}
                  onChangeText={
                    setMessageText
                  }
                  placeholder="اكتب رسالتك..."
                  placeholderTextColor="#777"
                  maxLength={500}
                  multiline
                  style={styles.input}
                  editable={!busy}
                />

                <Pressable
                  disabled={
                    busy ||
                    !messageText.trim()
                  }
                  onPress={sendMessage}
                  style={styles.sendButton}
                >
                  <Text
                    style={styles.buttonText}
                  >
                    إرسال
                  </Text>
                </Pressable>
              </View>
            ) : (
              <Text style={styles.deadText}>
                💀 لا يمكنك إرسال رسائل لأنك ميت.
              </Text>
            )}
          </View>
        )}

        {/* VOICE */}
        {isDay && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              🎙️ الصوت
            </Text>

            <View style={styles.infoBox}>
              <Text style={styles.infoText}>
                الميكروفون متاح كواجهة للمرحلة الحالية.
              </Text>

              <Text
                style={[
                  styles.infoText,
                  { marginTop: 6 },
                ]}
              >
                المحادثة الصوتية الحية بين اللاعبين
                تحتاج WebRTC أو خدمة صوت مخصصة، ولا
                يوفرها expo-audio وحده.
              </Text>
            </View>
          </View>
        )}

        {/* FINISHED */}
        {game.room.status ===
          'finished' && (
          <View style={styles.finishedCard}>
            <Text style={styles.finishedTitle}>
              🏆 انتهت اللعبة
            </Text>

            <Text style={styles.finishedWinner}>
              {game.room.winner ===
              'MAFIA'
                ? 'المافيا فازت'
                : 'المواطنون فازوا'}
            </Text>

            <Pressable
              style={styles.primaryButton}
              onPress={() =>
                router.replace('/rooms')
              }
            >
              <Text style={styles.buttonText}>
                العودة إلى الغرف
              </Text>
            </Pressable>
          </View>
        )}
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
    paddingBottom: 50,
  },

  center: {
    flex: 1,
    backgroundColor: '#08090d',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },

  loadingText: {
    color: '#aaa',
    marginTop: 14,
    fontSize: 16,
  },

  errorText: {
    color: '#ff6b6b',
    fontSize: 17,
    marginBottom: 20,
    textAlign: 'center',
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

  round: {
    color: '#888',
    marginTop: 4,
    fontSize: 13,
  },

  exitButton: {
    borderWidth: 1,
    borderColor: '#333',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },

  exitText: {
    color: '#aaa',
    fontWeight: '700',
  },

  phaseCard: {
    borderRadius: 18,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    borderWidth: 1,
  },

  nightCard: {
    backgroundColor: '#111528',
    borderColor: '#29345d',
  },

  dayCard: {
    backgroundColor: '#29200e',
    borderColor: '#59451b',
  },

  phaseIcon: {
    fontSize: 34,
    marginRight: 14,
  },

  phaseInfo: {
    flex: 1,
  },

  phaseTitle: {
    color: '#fff',
    fontSize: 23,
    fontWeight: '900',
  },

  phaseSubtitle: {
    color: '#aaa',
    fontSize: 12,
    marginTop: 3,
  },

  timer: {
    color: '#fff',
    fontSize: 25,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },

  roleCard: {
    backgroundColor: '#121318',
    borderRadius: 16,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#292b35',
  },

  roleCaption: {
    color: '#777',
    fontSize: 12,
    marginBottom: 5,
  },

  roleTitle: {
    color: '#fff',
    fontSize: 25,
    fontWeight: '900',
  },

  roleDescription: {
    color: '#aaa',
    lineHeight: 20,
    marginTop: 7,
  },

  deadText: {
    color: '#ff7070',
    fontWeight: '700',
    marginTop: 10,
  },

  eventCard: {
    backgroundColor: '#18151a',
    borderRadius: 14,
    padding: 15,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#312a35',
  },

  eventText: {
    color: '#eee',
    textAlign: 'center',
    fontWeight: '700',
  },

  section: {
    marginBottom: 18,
  },

  sectionTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '900',
    marginBottom: 5,
  },

  playerCount: {
    color: '#777',
    fontSize: 12,
    marginBottom: 10,
  },

  helperText: {
    color: '#888',
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 10,
  },

  playerRow: {
    backgroundColor: '#111217',
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#22242c',
  },

  deadPlayerRow: {
    opacity: 0.5,
  },

  selectedPlayer: {
    borderColor: '#fff',
    backgroundColor: '#1b1d24',
  },

  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginRight: 12,
  },

  avatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#292c35',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },

  avatarLetter: {
    color: '#fff',
    fontSize: 19,
    fontWeight: '900',
  },

  playerInfo: {
    flex: 1,
  },

  playerName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },

  deadName: {
    textDecorationLine: 'line-through',
    color: '#888',
  },

  playerStatus: {
    color: '#888',
    fontSize: 12,
    marginTop: 3,
  },

  checkMark: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '900',
  },

  primaryButton: {
    backgroundColor: '#252833',
    borderRadius: 13,
    padding: 15,
    alignItems: 'center',
    marginTop: 8,
  },

  dangerButton: {
    backgroundColor: '#571c25',
    borderRadius: 13,
    padding: 15,
    alignItems: 'center',
    marginTop: 8,
  },

  voteButton: {
    backgroundColor: '#40351b',
    borderRadius: 13,
    padding: 15,
    alignItems: 'center',
    marginTop: 8,
  },

  buttonText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 15,
  },

  infoBox: {
    backgroundColor: '#111217',
    borderRadius: 13,
    padding: 14,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#242630',
  },

  infoText: {
    color: '#aaa',
    lineHeight: 19,
  },

  chatBox: {
    backgroundColor: '#0e0f13',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#22242c',
    padding: 12,
    minHeight: 100,
    maxHeight: 330,
  },

  emptyChat: {
    color: '#666',
    textAlign: 'center',
    paddingVertical: 30,
  },

  message: {
    marginBottom: 10,
  },

  messageName: {
    color: '#aaa',
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 2,
  },

  messageText: {
    color: '#eee',
    fontSize: 15,
    lineHeight: 20,
  },

  messageComposer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginTop: 8,
    gap: 8,
  },

  input: {
    flex: 1,
    minHeight: 46,
    maxHeight: 110,
    backgroundColor: '#15161b',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#292b34',
    color: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    textAlignVertical: 'top',
  },

  sendButton: {
    backgroundColor: '#252833',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },

  finishedCard: {
    backgroundColor: '#17151b',
    borderRadius: 18,
    padding: 20,
    marginTop: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#39313f',
  },

  finishedTitle: {
    color: '#fff',
    fontSize: 25,
    fontWeight: '900',
  },

  finishedWinner: {
    color: '#bbb',
    fontSize: 18,
    fontWeight: '800',
    marginTop: 8,
    marginBottom: 12,
  },
});
