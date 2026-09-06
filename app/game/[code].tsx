import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { useLocalSearchParams, useRouter } from 'expo-router';

import { supabase } from '@/lib/supabase';
import {
  GamePhase,
  GamePlayer,
  GameRole,
  GameState,
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
  const router = useRouter();

  const params = useLocalSearchParams<{
    code?: string | string[];
  }>();

  const code = Array.isArray(params.code)
    ? params.code[0]
    : params.code;

  const [roomId, setRoomId] = useState<string | null>(null);
  const [game, setGame] = useState<GameState | null>(null);
  const [role, setRole] = useState<GameRole | null>(null);
  const [myAlive, setMyAlive] = useState(true);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [investigationResult, setInvestigationResult] =
    useState<boolean | null>(null);

  const [lastEventSeen, setLastEventSeen] = useState<string | null>(null);

  /*
   * ------------------------------------------------------
   * Find room
   * ------------------------------------------------------
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
      console.error('loadRoom error:', error);
      throw error;
    }

    if (!data?.id) {
      throw new Error('Room not found');
    }

    return data.id as string;
  }, [code]);

  /*
   * ------------------------------------------------------
   * Load complete game
   * ------------------------------------------------------
   */

  const loadGame = useCallback(
    async (showLoading = false) => {
      try {
        if (showLoading) {
          setLoading(true);
        }

        const id = roomId ?? (await loadRoom());

        if (!roomId) {
          setRoomId(id);
        }

        const [state, myRole] = await Promise.all([
          getGameState(id),
          getMyRole(id),
        ]);

        setGame(state);
        setRole(myRole.role);
        setMyAlive(myRole.alive);
      } catch (error: any) {
        console.error('loadGame error:', error);

        if (showLoading) {
          Alert.alert(
            'خطأ',
            error?.message || 'تعذر تحميل اللعبة'
          );
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [loadRoom, roomId]
  );

  /*
   * ------------------------------------------------------
   * Initial load
   * ------------------------------------------------------
   */

  useEffect(() => {
    loadGame(true);
  }, [loadGame]);

  /*
   * ------------------------------------------------------
   * Poll game state
   * ------------------------------------------------------
   */

  useEffect(() => {
    const interval = setInterval(() => {
      loadGame(false);
    }, 1500);

    return () => clearInterval(interval);
  }, [loadGame]);

  /*
   * ------------------------------------------------------
   * Realtime room updates
   * ------------------------------------------------------
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
   * ------------------------------------------------------
   * Current player
   * ------------------------------------------------------
   */

  const currentUserId = useMemo(() => {
    return game?.players.find(
      (player) => false
    )?.id ?? null;
  }, [game]);

  /*
   * ------------------------------------------------------
   * Players that can be targeted
   * ------------------------------------------------------
   */

  const alivePlayers = useMemo(() => {
    return (game?.players ?? []).filter(
      (player) => player.alive
    );
  }, [game]);

  /*
   * ------------------------------------------------------
   * Night action
   * ------------------------------------------------------
   */

  const performNightAction = async (
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

    if (submitting) {
      return;
    }

    try {
      setSubmitting(true);

      const result = await submitNightAction(
        roomId,
        action,
        target.id
      );

      if (
        action === 'investigate' &&
        result?.is_mafia !== undefined
      ) {
        setInvestigationResult(
          Boolean(result.is_mafia)
        );

        Alert.alert(
          'نتيجة التحقيق',
          result.is_mafia
            ? 'هذا اللاعب هو المافيا 🔴'
            : 'هذا اللاعب ليس المافيا 🟢'
        );
      } else {
        Alert.alert(
          'تم',
          action === 'kill'
            ? 'تم اختيار هدف المافيا.'
            : 'تم اختيار اللاعب للحماية.'
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
        error?.message || 'حدث خطأ غير متوقع'
      );
    } finally {
      setSubmitting(false);
    }
  };

  /*
   * ------------------------------------------------------
   * Day vote
   * ------------------------------------------------------
   */

  const performVote = async (
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
        error?.message || 'حدث خطأ غير متوقع'
      );
    } finally {
      setSubmitting(false);
    }
  };

  /*
   * ------------------------------------------------------
   * Event message
   * ------------------------------------------------------
   */

  const eventMessage = useMemo(() => {
    const event = game?.room?.last_event;

    if (!event?.type) {
      return null;
    }

    const eventKey = JSON.stringify(event);

    if (eventKey !== lastEventSeen) {
      setTimeout(() => {
        setLastEventSeen(eventKey);
      }, 0);
    }

    const player = event.player_id
      ? game.players.find(
          (p) => p.id === event.player_id
        )
      : null;

    switch (event.type) {
      case 'game_started':
        return 'بدأت اللعبة. استعدوا لليلة الأولى.';

      case 'night_kill':
        return player
          ? `${player.name} خرج من اللعبة أثناء الليل.`
          : 'حدثت عملية قتل أثناء الليل.';

      case 'night_saved':
        return 'نجح الطبيب في إنقاذ الهدف الليلي.';

      case 'day_elimination':
        return player
          ? `${player.name} تم إقصاؤه بالتصويت.`
          : 'تم إقصاء لاعب بالتصويت.';

      case 'day_tie':
        return 'حدث تعادل في التصويت، ولم يتم إقصاء أي لاعب.';

      case 'game_finished':
        return event.winner === 'MAFIA'
          ? 'المافيا فازت باللعبة 🔴'
          : 'المواطنون فازوا باللعبة 🟢';

      default:
        return null;
    }
  }, [game, lastEventSeen]);

  /*
   * ------------------------------------------------------
   * Loading
   * ------------------------------------------------------
   */

  if (loading && !game) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>
          جارٍ تحميل اللعبة...
        </Text>
      </View>
    );
  }

  if (!game || !role) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>
          تعذر تحميل اللعبة
        </Text>

        <Pressable
          style={styles.primaryButton}
          onPress={() => loadGame(true)}
        >
          <Text style={styles.primaryButtonText}>
            إعادة المحاولة
          </Text>
        </Pressable>
      </View>
    );
  }

  /*
   * ------------------------------------------------------
   * Finished
   * ------------------------------------------------------
   */

  if (game.room.status === 'finished') {
    const mafiaWon =
      game.room.winner === 'MAFIA';

    return (
      <ScrollView
        contentContainerStyle={styles.container}
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
            MAFIA NIGHT
          </Text>

          <Text style={styles.subtitle}>
            انتهت اللعبة
          </Text>
        </View>

        <View style={styles.winnerCard}>
          <Text style={styles.winnerEmoji}>
            {mafiaWon ? '🔴' : '🟢'}
          </Text>

          <Text style={styles.winnerTitle}>
            {mafiaWon
              ? 'المافيا فازت'
              : 'المواطنون فازوا'}
          </Text>

          <Text style={styles.winnerText}>
            {mafiaWon
              ? 'تمكنت المافيا من السيطرة على المدينة.'
              : 'تمكن المواطنون من القضاء على المافيا.'}
          </Text>
        </View>

        <View style={styles.roleCard}>
          <Text style={styles.smallLabel}>
            دورك
          </Text>

          <Text style={styles.roleText}>
            {role}
          </Text>

          <Text style={styles.aliveText}>
            {myAlive ? 'ALIVE' : 'ELIMINATED'}
          </Text>
        </View>

        <View style={styles.playersCard}>
          <Text style={styles.sectionTitle}>
            اللاعبون
          </Text>

          {game.players.map((player) => (
            <PlayerRow
              key={player.id}
              player={player}
            />
          ))}
        </View>
      </ScrollView>
    );
  }

  /*
   * ------------------------------------------------------
   * Main game
   * ------------------------------------------------------
   */

  const isNight =
    game.room.game_phase === 'night';

  const isDay =
    game.room.game_phase === 'day';

  const canAct =
    myAlive && !submitting;

  return (
    <ScrollView
      contentContainerStyle={styles.container}
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
      {/* Header */}

      <View style={styles.header}>
        <Text style={styles.title}>
          MAFIA NIGHT
        </Text>

        <Text style={styles.subtitle}>
          {isNight
            ? `NIGHT ${game.room.game_round}`
            : `DAY ${game.room.game_round}`}
        </Text>
      </View>

      {/* Phase */}

      <View
        style={[
          styles.phaseCard,
          isDay
            ? styles.dayCard
            : styles.nightCard,
        ]}
      >
        <Text style={styles.phaseEmoji}>
          {isNight ? '🌙' : '☀️'}
        </Text>

        <Text style={styles.phaseTitle}>
          {isNight
            ? 'NIGHT PHASE'
            : 'DAY PHASE'}
        </Text>

        <Text style={styles.phaseText}>
          {isNight
            ? 'الليل بدأ. نفّذ دورك بسرية.'
            : 'النهار بدأ. ناقشوا واختاروا من سيتم إقصاؤه.'}
        </Text>
      </View>

      {/* Role */}

      <View style={styles.roleCard}>
        <Text style={styles.smallLabel}>
          YOUR SECRET ROLE
        </Text>

        <Text style={styles.roleText}>
          {role}
        </Text>

        <View
          style={[
            styles.statusBadge,
            myAlive
              ? styles.aliveBadge
              : styles.deadBadge,
          ]}
        >
          <Text style={styles.statusText}>
            {myAlive ? 'ALIVE' : 'ELIMINATED'}
          </Text>
        </View>
      </View>

      {/* Event */}

      {eventMessage ? (
        <View style={styles.eventCard}>
          <Text style={styles.eventText}>
            {eventMessage}
          </Text>
        </View>
      ) : null}

      {/* Dead */}

      {!myAlive ? (
        <View style={styles.deadInfo}>
          <Text style={styles.deadTitle}>
            لقد خرجت من اللعبة
          </Text>

          <Text style={styles.deadText}>
            يمكنك مشاهدة مجريات اللعبة، لكن لا يمكنك
            تنفيذ إجراءات أو التصويت.
          </Text>
        </View>
      ) : null}

      {/* NIGHT */}

      {isNight && myAlive ? (
        <View style={styles.actionCard}>
          <Text style={styles.sectionTitle}>
            {role === 'MAFIA'
              ? 'اختيار ضحية'
              : role === 'DOCTOR'
              ? 'اختيار من تحمي'
              : role === 'DETECTIVE'
              ? 'اختيار من تحقق منه'
              : 'انتظر بقية اللاعبين'}
          </Text>

          {role === 'CITIZEN' ? (
            <View style={styles.waitBox}>
              <Text style={styles.waitEmoji}>
                ⏳
              </Text>

              <Text style={styles.waitText}>
                أنت مواطن.
              </Text>

              <Text style={styles.waitSubtext}>
                انتظر حتى تنتهي أدوار الليل.
              </Text>
            </View>
          ) : (
            <>
              {alivePlayers.map((player) => {
                const action: NightAction =
                  role === 'MAFIA'
                    ? 'kill'
                    : role === 'DOCTOR'
                    ? 'protect'
                    : 'investigate';

                return (
                  <Pressable
                    key={player.id}
                    disabled={!canAct}
                    style={[
                      styles.playerButton,
                      !canAct &&
                        styles.disabledButton,
                    ]}
                    onPress={() =>
                      performNightAction(
                        action,
                        player
                      )
                    }
                  >
                    <View>
                      <Text style={styles.playerButtonName}>
                        {player.name}
                      </Text>

                      <Text style={styles.playerButtonStatus}>
                        {player.alive
                          ? 'ALIVE'
                          : 'OUT'}
                      </Text>
                    </View>

                    <Text style={styles.arrow}>
                      →
                    </Text>
                  </Pressable>
                );
              })}
            </>
          )}

          {role === 'DETECTIVE' &&
          investigationResult !== null ? (
            <View style={styles.investigationCard}>
              <Text style={styles.investigationTitle}>
                آخر نتيجة تحقيق
              </Text>

              <Text style={styles.investigationText}>
                {investigationResult
                  ? 'الهدف كان MAFIA 🔴'
                  : 'الهدف ليس MAFIA 🟢'}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {/* DAY */}

      {isDay && myAlive ? (
        <View style={styles.actionCard}>
          <Text style={styles.sectionTitle}>
            التصويت
          </Text>

          <Text style={styles.voteDescription}>
            اختر اللاعب الذي تعتقد أنه من المافيا.
          </Text>

          {alivePlayers
            .filter((player) => {
              return true;
            })
            .map((player) => (
              <Pressable
                key={player.id}
                disabled={!canAct}
                style={[
                  styles.voteButton,
                  !canAct &&
                    styles.disabledButton,
                ]}
                onPress={() =>
                  performVote(player)
                }
              >
                <Text style={styles.voteName}>
                  {player.name}
                </Text>

                <Text style={styles.voteArrow}>
                  🗳️
                </Text>
              </Pressable>
            ))}
        </View>
      ) : null}

      {/* Players */}

      <View style={styles.playersCard}>
        <Text style={styles.sectionTitle}>
          اللاعبون
        </Text>

        {game.players.map((player) => (
          <PlayerRow
            key={player.id}
            player={player}
          />
        ))}
      </View>

      {/* Refresh */}

      <Pressable
        style={styles.refreshButton}
        onPress={() => loadGame(false)}
      >
        <Text style={styles.refreshText}>
          تحديث اللعبة
        </Text>
      </Pressable>
    </ScrollView>
  );
}

/*
 * --------------------------------------------------------
 * Player Row
 * --------------------------------------------------------
 */

function PlayerRow({
  player,
}: {
  player: GamePlayer;
}) {
  return (
    <View style={styles.playerRow}>
      <View style={styles.playerLeft}>
        <View
          style={[
            styles.dot,
            player.alive
              ? styles.aliveDot
              : styles.deadDot,
          ]}
        />

        <Text
          style={[
            styles.playerName,
            !player.alive &&
              styles.deadPlayerName,
          ]}
        >
          {player.name}
        </Text>
      </View>

      <Text
        style={[
          styles.playerState,
          !player.alive &&
            styles.deadPlayerState,
        ]}
      >
        {player.alive
          ? 'ALIVE'
          : 'OUT'}
      </Text>
    </View>
  );
}

/*
 * --------------------------------------------------------
 * Styles
 * --------------------------------------------------------
 */

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 20,
    paddingBottom: 40,
    backgroundColor: '#080808',
  },

  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#080808',
  },

  loadingText: {
    marginTop: 14,
    color: '#ffffff',
    fontSize: 16,
  },

  errorTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 20,
  },

  header: {
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 20,
  },

  title: {
    color: '#ffffff',
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: 2,
  },

  subtitle: {
    color: '#999999',
    fontSize: 15,
    fontWeight: '700',
    marginTop: 6,
    letterSpacing: 2,
  },

  phaseCard: {
    borderRadius: 18,
    padding: 22,
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
  },

  nightCard: {
    backgroundColor: '#11152b',
    borderColor: '#323b73',
  },

  dayCard: {
    backgroundColor: '#29220d',
    borderColor: '#69551b',
  },

  phaseEmoji: {
    fontSize: 40,
    marginBottom: 8,
  },

  phaseTitle: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '900',
  },

  phaseText: {
    color: '#bcbcbc',
    textAlign: 'center',
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
  },

  roleCard: {
    backgroundColor: '#151515',
    borderRadius: 18,
    padding: 22,
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#2b2b2b',
  },

  smallLabel: {
    color: '#777777',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2,
  },

  roleText: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '900',
    marginTop: 8,
  },

  statusBadge: {
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
  },

  aliveBadge: {
    backgroundColor: '#17351e',
  },

  deadBadge: {
    backgroundColor: '#351717',
  },

  statusText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
  },

  eventCard: {
    backgroundColor: '#151515',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#303030',
  },

  eventText: {
    color: '#ffffff',
    textAlign: 'center',
    fontSize: 15,
    lineHeight: 22,
  },

  actionCard: {
    backgroundColor: '#101010',
    borderRadius: 18,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#252525',
  },

  sectionTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '900',
    marginBottom: 14,
  },

  waitBox: {
    alignItems: 'center',
    paddingVertical: 25,
  },

  waitEmoji: {
    fontSize: 40,
    marginBottom: 10,
  },

  waitText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800',
  },

  waitSubtext: {
    color: '#888888',
    fontSize: 14,
    marginTop: 6,
    textAlign: 'center',
  },

  playerButton: {
    minHeight: 64,
    backgroundColor: '#1a1a1a',
    borderRadius: 14,
    paddingHorizontal: 16,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#333333',
  },

  disabledButton: {
    opacity: 0.45,
  },

  playerButtonName: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },

  playerButtonStatus: {
    color: '#777777',
    fontSize: 11,
    marginTop: 3,
  },

  arrow: {
    color: '#ffffff',
    fontSize: 22,
  },

  investigationCard: {
    backgroundColor: '#182d1d',
    borderRadius: 14,
    padding: 16,
    marginTop: 8,
  },

  investigationTitle: {
    color: '#b7b7b7',
    fontSize: 12,
    fontWeight: '700',
  },

  investigationText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '900',
    marginTop: 6,
  },

  voteDescription: {
    color: '#999999',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 14,
  },

  voteButton: {
    minHeight: 60,
    backgroundColor: '#1b1b1b',
    borderRadius: 14,
    paddingHorizontal: 16,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#333333',
  },

  voteName: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },

  voteArrow: {
    fontSize: 20,
  },

  deadInfo: {
    backgroundColor: '#211414',
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#442020',
  },

  deadTitle: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '900',
    marginBottom: 6,
  },

  deadText: {
    color: '#999999',
    fontSize: 14,
    lineHeight: 20,
  },

  playersCard: {
    backgroundColor: '#101010',
    borderRadius: 18,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#252525',
  },

  playerRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#202020',
  },

  playerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  dot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    marginRight: 10,
  },

  aliveDot: {
    backgroundColor: '#49c66b',
  },

  deadDot: {
    backgroundColor: '#777777',
  },

  playerName: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },

  deadPlayerName: {
    color: '#666666',
    textDecorationLine: 'line-through',
  },

  playerState: {
    color: '#55c875',
    fontSize: 10,
    fontWeight: '900',
  },

  deadPlayerState: {
    color: '#777777',
  },

  refreshButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
    borderRadius: 14,
    backgroundColor: '#1b1b1b',
    borderWidth: 1,
    borderColor: '#333333',
  },

  refreshText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },

  primaryButton: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 24,
    paddingVertical: 13,
    borderRadius: 12,
  },

  primaryButtonText: {
    color: '#000000',
    fontSize: 15,
    fontWeight: '900',
  },

  winnerCard: {
    backgroundColor: '#151515',
    borderRadius: 20,
    padding: 30,
    alignItems: 'center',
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#303030',
  },

  winnerEmoji: {
    fontSize: 60,
    marginBottom: 12,
  },

  winnerTitle: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '900',
  },

  winnerText: {
    color: '#999999',
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 10,
  },
});
