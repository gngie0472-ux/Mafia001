import React, {
  useCallback,
  useEffect,
  useMemo,
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
  View,
} from 'react-native';

import { useLocalSearchParams } from 'expo-router';

import { supabase } from '@/lib/supabase';

import {
  GamePlayer,
  GameRole,
  GameState,
  advanceMafiaPhase,
  getGameState,
  getMyRole,
  submitDayVote,
  submitNightAction,
} from '@/lib/game';

type NightAction =
  | 'kill'
  | 'protect'
  | 'investigate';

export default function GameScreen() {
  const params = useLocalSearchParams<{
    code?: string | string[];
  }>();

  const code = Array.isArray(params.code)
    ? params.code[0]
    : params.code;

  const [roomId, setRoomId] =
    useState<string | null>(null);

  const [game, setGame] =
    useState<GameState | null>(null);

  const [role, setRole] =
    useState<GameRole | null>(null);

  const [myAlive, setMyAlive] =
    useState(true);

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [submitting, setSubmitting] =
    useState(false);

  const [secondsLeft, setSecondsLeft] =
    useState(0);

  const [investigationResult, setInvestigationResult] =
    useState<boolean | null>(null);

  const [investigationRound, setInvestigationRound] =
    useState<number | null>(null);

  /*
   * --------------------------------------------------
   * العثور على الغرفة
   * --------------------------------------------------
   */

  const loadRoom = useCallback(async () => {
    if (!code) {
      throw new Error('Missing room code');
    }

    const { data, error } = await supabase
      .from('rooms')
      .select('id')
      .eq('code', code)
      .single();

    if (error) {
      throw error;
    }

    if (!data?.id) {
      throw new Error('Room not found');
    }

    return data.id as string;
  }, [code]);

  /*
   * --------------------------------------------------
   * تحميل اللعبة
   * --------------------------------------------------
   */

  const loadGame = useCallback(
    async (showLoading = false) => {
      try {
        if (showLoading) {
          setLoading(true);
        }

        const id =
          roomId ?? (await loadRoom());

        if (!roomId) {
          setRoomId(id);
        }

        const [state, myRole] =
          await Promise.all([
            getGameState(id),
            getMyRole(id),
          ]);

        setGame(state);

        setRole(myRole.role);

        setMyAlive(myRole.alive);

        /*
         * عند بدء جولة جديدة
         * نمسح نتيجة التحقيق القديمة.
         */

        if (
          investigationRound !== null &&
          state.room.game_round !==
            investigationRound
        ) {
          setInvestigationResult(null);
          setInvestigationRound(null);
        }
      } catch (error: any) {
        console.error(
          'loadGame error:',
          error
        );

        if (showLoading) {
          Alert.alert(
            'خطأ',
            error?.message ||
              'تعذر تحميل اللعبة'
          );
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [
      loadRoom,
      roomId,
      investigationRound,
    ]
  );

  /*
   * --------------------------------------------------
   * أول تحميل
   * --------------------------------------------------
   */

  useEffect(() => {
    loadGame(true);
  }, [loadGame]);

  /*
   * --------------------------------------------------
   * تحديث دوري
   * --------------------------------------------------
   */

  useEffect(() => {
    const interval = setInterval(() => {
      loadGame(false);
    }, 1500);

    return () => {
      clearInterval(interval);
    };
  }, [loadGame]);

  /*
   * --------------------------------------------------
   * Realtime
   * --------------------------------------------------
   */

  useEffect(() => {
    if (!roomId) {
      return;
    }

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
          loadGame(false);
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
          loadGame(false);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId, loadGame]);

  /*
   * --------------------------------------------------
   * Countdown
   * --------------------------------------------------
   */

  useEffect(() => {
    if (
      !game ||
      game.room.status !== 'playing' ||
      !game.room.phase_ends_at
    ) {
      setSecondsLeft(0);
      return;
    }

    const update = () => {
      const end =
        new Date(
          game.room.phase_ends_at!
        ).getTime();

      const remaining = Math.max(
        0,
        Math.ceil(
          (end - Date.now()) / 1000
        )
      );

      setSecondsLeft(remaining);
    };

    update();

    const interval = setInterval(
      update,
      250
    );

    return () => {
      clearInterval(interval);
    };
  }, [
    game?.room?.phase_ends_at,
    game?.room?.status,
  ]);

  /*
   * --------------------------------------------------
   * الانتقال التلقائي
   * --------------------------------------------------
   */

  useEffect(() => {
    if (
      !roomId ||
      !game ||
      game.room.status !== 'playing' ||
      !game.room.phase_ends_at
    ) {
      return;
    }

    const endTime =
      new Date(
        game.room.phase_ends_at
      ).getTime();

    let advancing = false;

    const checkPhase = async () => {
      if (
        advancing ||
        Date.now() < endTime
      ) {
        return;
      }

      advancing = true;

      try {
        await advanceMafiaPhase(roomId);
      } catch (error) {
        console.log(
          'advance phase:',
          error
        );
      } finally {
        await loadGame(false);
        advancing = false;
      }
    };

    checkPhase();

    const interval = setInterval(
      checkPhase,
      1000
    );

    return () => {
      clearInterval(interval);
    };
  }, [
    roomId,
    game?.room?.status,
    game?.room?.phase_ends_at,
    loadGame,
  ]);

  /*
   * --------------------------------------------------
   * معلومات المرحلة
   * --------------------------------------------------
   */

  const isNight =
    game?.room.game_phase === 'night';

  const isDay =
    game?.room.game_phase === 'day';

  const phaseFinished =
    game?.room.phase_ends_at
      ? new Date(
          game.room.phase_ends_at
        ).getTime() <= Date.now()
      : false;

  const canAct =
    myAlive &&
    !submitting &&
    !phaseFinished;

  /*
   * --------------------------------------------------
   * الوقت
   * --------------------------------------------------
   */

  const formattedTime = useMemo(() => {
    const minutes =
      Math.floor(secondsLeft / 60);

    const seconds =
      secondsLeft % 60;

    return `${String(minutes).padStart(
      2,
      '0'
    )}:${String(seconds).padStart(
      2,
      '0'
    )}`;
  }, [secondsLeft]);

  /*
   * --------------------------------------------------
   * اللاعبين الأحياء
   * --------------------------------------------------
   */

  const alivePlayers = useMemo(() => {
    return (
      game?.players ?? []
    ).filter(
      (player) => player.alive
    );
  }, [game]);

  /*
   * --------------------------------------------------
   * اللاعب الحالي
   * --------------------------------------------------
   */

  const currentPlayer = useMemo(() => {
    if (
      !game ||
      !game.my_player_id
    ) {
      return null;
    }

    return (
      game.players.find(
        (player) =>
          player.id ===
          game.my_player_id
      ) ?? null
    );
  }, [game]);

  /*
   * --------------------------------------------------
   * أهداف الليل
   *
   * أهم إصلاح:
   * المافيا لن ترى نفسها كهدف.
   * --------------------------------------------------
   */

  const nightTargets = useMemo(() => {
    if (!game || !role) {
      return [];
    }

    return game.players.filter(
      (player) => {
        if (!player.alive) {
          return false;
        }

        /*
         * المافيا لا تستطيع استهداف نفسها.
         */

        if (
          role === 'MAFIA' &&
          player.id ===
            game.my_player_id
        ) {
          return false;
        }

        /*
         * الطبيب والمحقق يمكنهما
         * اختيار اللاعبين الأحياء.
         */

        return true;
      }
    );
  }, [game, role]);

  /*
   * --------------------------------------------------
   * تنفيذ إجراء ليلي
   * --------------------------------------------------
   */

  const performNightAction =
    async (
      action: NightAction,
      target: GamePlayer
    ) => {
      if (!roomId || !game) {
        return;
      }

      if (!myAlive) {
        Alert.alert(
          'أنت خارج اللعبة',
          'لا يمكنك تنفيذ أي إجراء.'
        );
        return;
      }

      if (!isNight) {
        Alert.alert(
          'انتهى الليل',
          'لا يمكن تنفيذ إجراء ليلي الآن.'
        );
        return;
      }

      if (phaseFinished) {
        Alert.alert(
          'انتهى الوقت',
          'انتهى وقت الليل.'
        );

        await loadGame(false);
        return;
      }

      if (!target.alive) {
        Alert.alert(
          'هدف غير صالح',
          'هذا اللاعب خرج من اللعبة.'
        );

        await loadGame(false);
        return;
      }

      if (
        action === 'kill' &&
        target.id ===
          game.my_player_id
      ) {
        Alert.alert(
          'غير مسموح',
          'لا يمكنك استهداف نفسك.'
        );
        return;
      }

      if (
        action === 'investigate' &&
        investigationRound ===
          game.room.game_round
      ) {
        Alert.alert(
          'تم التحقيق مسبقًا',
          'يمكن للمحقق التحقيق مع شخص واحد فقط كل ليلة.'
        );

        return;
      }

      if (submitting) {
        return;
      }

      try {
        setSubmitting(true);

        const result =
          await submitNightAction(
            roomId,
            action,
            target.id
          );

        if (
          action ===
            'investigate' &&
          result?.is_mafia !==
            undefined
        ) {
          const isMafia =
            Boolean(
              result.is_mafia
            );

          setInvestigationResult(
            isMafia
          );

          setInvestigationRound(
            game.room.game_round
          );

          Alert.alert(
            'نتيجة التحقيق',
            isMafia
              ? 'هذا اللاعب هو المافيا 🔴'
              : 'هذا اللاعب ليس المافيا 🟢'
          );
        } else if (
          action === 'kill'
        ) {
          Alert.alert(
            'تم',
            'تم تسجيل هدف المافيا. سيتم تنفيذ العملية عند انتهاء الليل.'
          );
        } else if (
          action === 'protect'
        ) {
          Alert.alert(
            'تم',
            'تم تسجيل اللاعب للحماية.'
          );
        }

        await loadGame(false);
      } catch (error: any) {
        console.error(
          'performNightAction error:',
          error
        );

        Alert.alert(
          'تعذر تنفيذ الإجراء',
          error?.message ||
            'حدث خطأ غير متوقع'
        );
      } finally {
        setSubmitting(false);
      }
    };

  /*
   * --------------------------------------------------
   * التصويت
   * --------------------------------------------------
   */

  const performVote =
    async (
      target: GamePlayer
    ) => {
      if (!roomId || !game) {
        return;
      }

      if (!myAlive) {
        Alert.alert(
          'أنت خارج اللعبة',
          'لا يمكنك التصويت.'
        );
        return;
      }

      if (!isDay) {
        Alert.alert(
          'ليس وقت التصويت',
          'التصويت متاح أثناء النهار فقط.'
        );
        return;
      }

      if (phaseFinished) {
        Alert.alert(
          'انتهى الوقت',
          'انتهى وقت التصويت.'
        );

        await loadGame(false);
        return;
      }

      if (!target.alive) {
        Alert.alert(
          'هدف غير صالح',
          'هذا اللاعب خرج من اللعبة.'
        );

        await loadGame(false);
        return;
      }

      if (
        target.id ===
        game.my_player_id
      ) {
        Alert.alert(
          'غير مسموح',
          'لا يمكنك التصويت لنفسك.'
        );
        return;
      }

      if (submitting) {
        return;
      }

      try {
        setSubmitting(true);

        await submitDayVote(
          roomId,
          target.id
        );

        Alert.alert(
          'تم التصويت',
          `صوتك ذهب إلى ${target.name}.`
        );

        await loadGame(false);
      } catch (error: any) {
        console.error(
          'performVote error:',
          error
        );

        Alert.alert(
          'تعذر التصويت',
          error?.message ||
            'حدث خطأ غير متوقع'
        );
      } finally {
        setSubmitting(false);
      }
    };

  /*
   * --------------------------------------------------
   * رسالة الحدث
   * --------------------------------------------------
   */

  const eventMessage = useMemo(() => {
    const event =
      game?.room.last_event;

    if (!event?.type) {
      return null;
    }

    const player =
      event.player_id
        ? game?.players.find(
            (p) =>
              p.id ===
              event.player_id
          )
        : null;

    switch (event.type) {
      case 'night_kill':
        return player
          ? `💀 تم قتل ${player.name} أثناء الليل.`
          : '💀 حدثت عملية قتل أثناء الليل.';

      case 'night_saved':
        return '🩺 الطبيب أنقذ الهدف الليلة.';

      case 'day_elimination':
        return player
          ? `⚖️ تم إقصاء ${player.name} بالتصويت.`
          : '⚖️ تم إقصاء لاعب بالتصويت.';

      case 'day_tie':
        return '⚖️ حدث تعادل في التصويت.';

      case 'game_finished':
        if (
          event.winner === 'MAFIA'
        ) {
          return '🏴‍☠️ المافيا فازت باللعبة!';
        }

        if (
          event.winner === 'CITIZENS'
        ) {
          return '🛡️ المواطنون فازوا باللعبة!';
        }

        return '🏆 انتهت اللعبة.';

      default:
        return null;
    }
  }, [
    game,
    game?.room?.last_event,
  ]);

  /*
   * --------------------------------------------------
   * شاشة التحميل
   * --------------------------------------------------
   */

  if (loading && !game) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator
          size="large"
        />

        <Text style={styles.loadingText}>
          جاري تحميل اللعبة...
        </Text>
      </View>
    );
  }

  if (!game) {
    return (
      <View style={styles.loading}>
        <Text style={styles.errorText}>
          تعذر تحميل اللعبة.
        </Text>

        <Pressable
          style={styles.retryButton}
          onPress={() =>
            loadGame(true)
          }
        >
          <Text
            style={styles.retryText}
          >
            إعادة المحاولة
          </Text>
        </Pressable>
      </View>
    );
  }

  /*
   * --------------------------------------------------
   * الواجهة
   * --------------------------------------------------
   */

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={
          styles.content
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadGame(false);
            }}
          />
        }
      >
        <View style={styles.header}>
          <Text style={styles.title}>
            🕵️ Mafia Night
          </Text>

          <Text style={styles.roomCode}>
            الغرفة: {game.room.code}
          </Text>
        </View>

        <View
          style={[
            styles.phaseCard,
            isNight
              ? styles.nightCard
              : styles.dayCard,
          ]}
        >
          <Text style={styles.phaseTitle}>
            {isNight
              ? '🌙 الليل'
              : '☀️ النهار'}
          </Text>

          <Text
            style={styles.timer}
          >
            {formattedTime}
          </Text>

          <Text style={styles.round}>
            الجولة {game.room.game_round}
          </Text>

          {phaseFinished && (
            <Text style={styles.finished}>
              ⏳ جارٍ الانتقال...
            </Text>
          )}
        </View>

        <View style={styles.roleCard}>
          <Text style={styles.label}>
            دورك
          </Text>

          <Text style={styles.role}>
            {role === 'MAFIA'
              ? '🔴 المافيا'
              : role === 'DOCTOR'
              ? '🩺 الطبيب'
              : role === 'DETECTIVE'
              ? '🔎 المحقق'
              : '👤 المواطن'}
          </Text>

          <Text
            style={
              myAlive
                ? styles.alive
                : styles.dead
            }
          >
            {myAlive
              ? '🟢 حي'
              : '💀 ميت'}
          </Text>
        </View>

        {currentPlayer && (
          <View style={styles.identityCard}>
            <Text style={styles.identityTitle}>
              حسابك داخل اللعبة
            </Text>

            <Text style={styles.identityName}>
              👤 {currentPlayer.name}
            </Text>

            <Text style={styles.identityId}>
              معرف اللاعب: {currentPlayer.id}
            </Text>
          </View>
        )}

        {eventMessage && (
          <View style={styles.eventCard}>
            <Text style={styles.eventText}>
              {eventMessage}
            </Text>
          </View>
        )}

        {role === 'DETECTIVE' &&
          investigationResult !==
            null && (
            <View style={styles.resultCard}>
              <Text
                style={styles.resultTitle}
              >
                🔎 نتيجة التحقيق
              </Text>

              <Text
                style={styles.resultText}
              >
                {investigationResult
                  ? '🔴 اللاعب مافيا'
                  : '🟢 اللاعب ليس مافيا'}
              </Text>
            </View>
          )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            👥 اللاعبون
          </Text>

          {game.players.map(
            (player) => {
              const isMe =
                player.id ===
                game.my_player_id;

              return (
                <View
                  key={player.id}
                  style={[
                    styles.playerRow,
                    !player.alive &&
                      styles.deadRow,
                  ]}
                >
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
                      {player.alive
                        ? '🟢'
                        : '💀'}{' '}
                      {player.name}

                      {isMe
                        ? ' (أنت)'
                        : ''}
                    </Text>

                    {!player.alive && (
                      <Text
                        style={
                          styles.deadLabel
                        }
                      >
                        خرج من اللعبة
                      </Text>
                    )}
                  </View>
                </View>
              );
            }
          )}
        </View>

        {isNight &&
          myAlive &&
          role && (
            <View style={styles.section}>
              <Text
                style={
                  styles.sectionTitle
                }
              >
                🌙 إجراءات الليل
              </Text>

              {role === 'MAFIA' && (
                <>
                  <Text
                    style={
                      styles.actionDescription
                    }
                  >
                    اختر اللاعب الذي تريد
                    قتله:
                  </Text>

                  {nightTargets.map(
                    (player) => (
                      <Pressable
                        key={player.id}
                        disabled={!canAct}
                        style={[
                          styles.actionButton,
                          !canAct &&
                            styles.disabled,
                        ]}
                        onPress={() =>
                          performNightAction(
                            'kill',
                            player
                          )
                        }
                      >
                        <Text
                          style={
                            styles.actionText
                          }
                        >
                          🔪 قتل {player.name}
                        </Text>
                      </Pressable>
                    )
                  )}
                </>
              )}

              {role === 'DOCTOR' && (
                <>
                  <Text
                    style={
                      styles.actionDescription
                    }
                  >
                    اختر اللاعب الذي تريد
                    حمايته:
                  </Text>

                  {nightTargets.map(
                    (player) => (
                      <Pressable
                        key={player.id}
                        disabled={!canAct}
                        style={[
                          styles.actionButton,
                          !canAct &&
                            styles.disabled,
                        ]}
                        onPress={() =>
                          performNightAction(
                            'protect',
                            player
                          )
                        }
                      >
                        <Text
                          style={
                            styles.actionText
                          }
                        >
                          🩺 حماية {player.name}
                        </Text>
                      </Pressable>
                    )
                  )}
                </>
              )}

              {role === 'DETECTIVE' && (
                <>
                  <Text
                    style={
                      styles.actionDescription
                    }
                  >
                    اختر لاعبًا واحدًا للتحقيق
                    معه:
                  </Text>

                  {nightTargets.map(
                    (player) => (
                      <Pressable
                        key={player.id}
                        disabled={
                          !canAct ||
                          investigationRound ===
                            game.room
                              .game_round
                        }
                        style={[
                          styles.actionButton,
                          (!canAct ||
                            investigationRound ===
                              game.room
                                .game_round) &&
                            styles.disabled,
                        ]}
                        onPress={() =>
                          performNightAction(
                            'investigate',
                            player
                          )
                        }
                      >
                        <Text
                          style={
                            styles.actionText
                          }
                        >
                          🔎 التحقيق مع{' '}
                          {player.name}
                        </Text>
                      </Pressable>
                    )
                  )}
                </>
              )}

              {role === 'CITIZEN' && (
                <View
                  style={
                    styles.waitCard
                  }
                >
                  <Text
                    style={
                      styles.waitText
                    }
                  >
                    👤 أنت مواطن.
                    انتظر حتى ينتهي الليل.
                  </Text>
                </View>
              )}
            </View>
          )}

        {isDay && myAlive && (
          <View style={styles.section}>
            <Text
              style={styles.sectionTitle}
            >
              ☀️ التصويت
            </Text>

            <Text
              style={
                styles.actionDescription
              }
            >
              اختر اللاعب الذي تريد
              التصويت ضده:
            </Text>

            {alivePlayers
              .filter(
                (player) =>
                  player.id !==
                  game.my_player_id
              )
              .map((player) => (
                <Pressable
                  key={player.id}
                  disabled={!canAct}
                  style={[
                    styles.voteButton,
                    !canAct &&
                      styles.disabled,
                  ]}
                  onPress={() =>
                    performVote(
                      player
                    )
                  }
                >
                  <Text
                    style={
                      styles.voteText
                    }
                  >
                    ⚖️ التصويت ضد{' '}
                    {player.name}
                  </Text>
                </Pressable>
              ))}
          </View>
        )}

        {!myAlive && (
          <View style={styles.deadNotice}>
            <Text
              style={styles.deadNoticeTitle}
            >
              💀 أنت ميت
            </Text>

            <Text
              style={styles.deadNoticeText}
            >
              لا يمكنك التصويت أو تنفيذ
              أي إجراء في اللعبة.
            </Text>
          </View>
        )}

        {game.room.status ===
          'finished' && (
          <View style={styles.winnerCard}>
            <Text
              style={styles.winnerTitle}
            >
              🏆 انتهت اللعبة
            </Text>

            <Text
              style={styles.winnerText}
            >
              {game.room.winner ===
              'MAFIA'
                ? '🔴 المافيا فازت'
                : game.room.winner ===
                  'CITIZENS'
                ? '🟢 المواطنون فازوا'
                : 'انتهت اللعبة'}
            </Text>
          </View>
        )}

        <View style={styles.bottomSpace} />
      </ScrollView>
    </View>
  );
}

/*
 * ==================================================
 * Styles
 * ==================================================
 */

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#09090f',
  },

  content: {
    padding: 18,
    paddingBottom: 40,
  },

  loading: {
    flex: 1,
    backgroundColor: '#09090f',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },

  loadingText: {
    color: '#ffffff',
    marginTop: 14,
    fontSize: 16,
  },

  errorText: {
    color: '#ff6b6b',
    fontSize: 17,
    textAlign: 'center',
  },

  retryButton: {
    marginTop: 20,
    backgroundColor: '#6c5ce7',
    paddingHorizontal: 24,
    paddingVertical: 13,
    borderRadius: 12,
  },

  retryText: {
    color: '#ffffff',
    fontWeight: '700',
  },

  header: {
    alignItems: 'center',
    marginBottom: 18,
  },

  title: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '900',
  },

  roomCode: {
    color: '#aaaab8',
    marginTop: 6,
    fontSize: 14,
  },

  phaseCard: {
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    marginBottom: 14,
    borderWidth: 1,
  },

  nightCard: {
    backgroundColor: '#15132b',
    borderColor: '#4940a8',
  },

  dayCard: {
    backgroundColor: '#252116',
    borderColor: '#a88739',
  },

  phaseTitle: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '800',
  },

  timer: {
    color: '#ffffff',
    fontSize: 42,
    fontWeight: '900',
    marginTop: 8,
    letterSpacing: 2,
  },

  round: {
    color: '#aaaab8',
    marginTop: 4,
  },

  finished: {
    color: '#ffb347',
    marginTop: 8,
    fontWeight: '700',
  },

  roleCard: {
    backgroundColor: '#13131b',
    borderRadius: 16,
    padding: 18,
    marginBottom: 14,
    alignItems: 'center',
  },

  label: {
    color: '#9999aa',
    fontSize: 13,
  },

  role: {
    color: '#ffffff',
    fontSize: 23,
    fontWeight: '900',
    marginTop: 5,
  },

  alive: {
    color: '#55d68a',
    marginTop: 6,
    fontWeight: '700',
  },

  dead: {
    color: '#ff5f6d',
    marginTop: 6,
    fontWeight: '700',
  },

  identityCard: {
    backgroundColor: '#111722',
    borderRadius: 15,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#27344d',
  },

  identityTitle: {
    color: '#8f9bb3',
    fontSize: 13,
  },

  identityName: {
    color: '#ffffff',
    fontSize: 19,
    fontWeight: '800',
    marginTop: 6,
  },

  identityId: {
    color: '#667085',
    fontSize: 10,
    marginTop: 6,
  },

  eventCard: {
    backgroundColor: '#21191b',
    borderRadius: 15,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#593136',
  },

  eventText: {
    color: '#ffffff',
    fontSize: 15,
    textAlign: 'center',
    fontWeight: '700',
  },

  resultCard: {
    backgroundColor: '#111d17',
    borderRadius: 15,
    padding: 16,
    marginBottom: 14,
    alignItems: 'center',
  },

  resultTitle: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 16,
  },

  resultText: {
    color: '#75e6a5',
    fontSize: 18,
    fontWeight: '900',
    marginTop: 7,
  },

  section: {
    marginTop: 8,
    marginBottom: 10,
  },

  sectionTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '900',
    marginBottom: 12,
  },

  playerRow: {
    backgroundColor: '#12121a',
    borderRadius: 14,
    padding: 15,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#22222e',
  },

  deadRow: {
    opacity: 0.5,
  },

  playerInfo: {
    flex: 1,
  },

  playerName: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },

  deadLabel: {
    color: '#ff6875',
    fontSize: 12,
    marginTop: 4,
  },

  actionDescription: {
    color: '#a6a6b5',
    marginBottom: 12,
    lineHeight: 20,
  },

  actionButton: {
    backgroundColor: '#332a63',
    borderRadius: 13,
    padding: 16,
    marginBottom: 9,
  },

  actionText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
  },

  voteButton: {
    backgroundColor: '#54302f',
    borderRadius: 13,
    padding: 16,
    marginBottom: 9,
  },

  voteText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
  },

  disabled: {
    opacity: 0.4,
  },

  waitCard: {
    backgroundColor: '#15151e',
    padding: 18,
    borderRadius: 14,
  },

  waitText: {
    color: '#aaaab8',
    textAlign: 'center',
  },

  deadNotice: {
    backgroundColor: '#241416',
    borderRadius: 16,
    padding: 20,
    marginTop: 15,
    borderWidth: 1,
    borderColor: '#5b292e',
    alignItems: 'center',
  },

  deadNoticeTitle: {
    color: '#ff6975',
    fontSize: 20,
    fontWeight: '900',
  },

  deadNoticeText: {
    color: '#c5a6a9',
    marginTop: 7,
    textAlign: 'center',
  },

  winnerCard: {
    backgroundColor: '#18151f',
    borderRadius: 18,
    padding: 24,
    marginTop: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#5a4c78',
  },

  winnerTitle: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '900',
  },

  winnerText: {
    color: '#d7c7ff',
    fontSize: 20,
    fontWeight: '900',
    marginTop: 8,
  },

  bottomSpace: {
    height: 40,
  },
});
