Import React, {
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
  RefreshControl,
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

// LiveKit Imports (Native Modules)
import { Room } from '@livekit/react-native';

import { supabase } from '../../lib/supabase';
import { getMyProfile } from '../../lib/profile';

import {
  getGameState,
  submitDayVote,
  submitNightAction,
} from '../../lib/game';

import type {
  GamePlayer,
  GameState,
} from '../../lib/game';

import { getLiveKitToken } from '../../lib/livekit';
import { prepareMicrophone, stopMicrophoneSession } from '../../lib/voice';

type GameRoom = GameState['room'] & {
  host_id?: string | null;
  phase_ends_at?: string | null;
};

type Message = {
  id: string;
  room_id: string;
  user_id: string;
  message: string;
  created_at: string;
  username?: string | null;
};

function getErrorMessage(
  error: any,
  fallback: string,
): string {
  if (typeof error === 'string' && error.trim()) {
    return error;
  }

  if (error?.message && typeof error.message === 'string') {
    return error.message;
  }

  if (error?.reason && typeof error.reason === 'string') {
    return error.reason;
  }

  if (error?.details && typeof error.details === 'string') {
    return error.details;
  }

  return fallback;
}

function getSecondsLeft(
  value: string | null | undefined,
): number {
  if (!value) {
    return 0;
  }

  const timestamp = new Date(value).getTime();

  if (!Number.isFinite(timestamp)) {
    return 0;
  }

  return Math.max(
    0,
    Math.ceil((timestamp - Date.now()) / 1000),
  );
}

function formatTime(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  const remaining = safe % 60;

  return `${String(minutes).padStart(2, '0')}:${String(
    remaining,
  ).padStart(2, '0')}`;
}

function roleLabel(
  role: string | null | undefined,
): string {
  switch (String(role).toUpperCase()) {
    case 'MAFIA':
      return 'المافيا';

    case 'GODFATHER':
      return 'عرّاب المافيا';

    case 'CONSIGLIERE':
      return 'المستشار';

    case 'DOCTOR':
      return 'الطبيب';

    case 'DETECTIVE':
      return 'المحقق';

    case 'GHOUL':
      return 'الغول';

    case 'CULT_LEADER':
      return 'زعيم الطائفة';

    case 'CULTIST':
      return 'عضو الطائفة';

    case 'CITIZEN':
      return 'المواطن';

    default:
      return role || 'غير معروف';
  }
}

function PlayerAvatar({
  player,
  size = 52,
}: {
  player: GamePlayer;
  size?: number;
}) {
  const initial =
    String(player.name || 'P')
      .trim()
      .charAt(0)
      .toUpperCase() || 'P';

  return (
    <View
      style={[
        styles.avatar,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
        },
      ]}
    >
      <Text style={styles.avatarText}>{initial}</Text>
    </View>
  );
}

export default function MafiaGameScreen() {
  const router = useRouter();

  const params = useLocalSearchParams<{
    code?: string | string[];
  }>();

  const roomValue = Array.isArray(params.code)
    ? params.code[0]
    : params.code;

  const mountedRef = useRef(true);

  const [gameState, setGameState] = useState<GameState | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [currentUserId, setCurrentUserId] = useState('');

  const voiceRoomRef = useRef<Room | null>(null);
  const voiceConnectingRef = useRef(false);

  const [voiceConnected, setVoiceConnected] = useState(false);
  const [micEnabled, setMicEnabled] = useState(false);
  const [voiceLoading, setVoiceLoading] = useState(false);

  const roomId = roomValue;
  const room = (gameState?.room || null) as GameRoom | null;
  const players = gameState?.players || [];
  const me = gameState?.me || null;
  const phase = room?.game_phase || 'waiting';
  const isNight = phase === 'night';
  const isDay = phase === 'day';
  const gameFinished = phase === 'finished' || room?.status === 'finished';
  const myAlive = Boolean(me?.alive);
  const isHost = Boolean(room?.host_id && currentUserId && room.host_id === currentUserId);
  const myRole = me?.role || null;

  const alivePlayers = useMemo(
    () => players.filter((player) => player.alive),
    [players],
  );

  void alivePlayers;

  const canNightAction = isNight && myAlive && !gameFinished && !busy;
  const canDayVote = isDay && myAlive && !gameFinished && !busy;

  const loadGame = useCallback(
    async (showLoader = false) => {
      if (!roomId) {
        if (mountedRef.current) setLoading(false);
        return;
      }

      try {
        if (showLoader && mountedRef.current) setLoading(true);

        const [profile, state] = await Promise.all([
          getMyProfile(),
          getGameState(roomId),
        ]);

        if (!mountedRef.current) return;

        setCurrentUserId(profile.user_id);
        setGameState(state);
      } catch (error) {
        console.error('loadGame error:', error);
        if (mountedRef.current) {
          Alert.alert('خطأ', getErrorMessage(error, 'تعذر تحميل الغرفة.'));
        }
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    },
    [roomId],
  );

  const loadMessages = useCallback(async () => {
    if (!roomId) return;

    try {
      const { data, error } = await supabase
        .from('room_messages')
        .select('id,room_id,user_id,message,created_at')
        .eq('room_id', roomId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      const rows = (data || []) as Message[];
      if (!rows.length) {
        if (mountedRef.current) setMessages([]);
        return;
      }

      const userIds = [...new Set(rows.map((item) => item.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id,username')
        .in('user_id', userIds);

      const profileMap = new Map<string, string>();
      (profiles || []).forEach((profile: any) => {
        if (profile?.user_id) {
          profileMap.set(profile.user_id, profile.username || 'لاعب');
        }
      });

      const normalized = rows.map((item) => ({
        ...item,
        username: profileMap.get(item.user_id) || 'لاعب',
      }));

      if (mountedRef.current) setMessages(normalized);
    } catch (error) {
      console.error('loadMessages error:', error);
    }
  }, [roomId]);

  useEffect(() => {
    mountedRef.current = true;
    void loadGame(true);
    void loadMessages();

    return () => {
      mountedRef.current = false;
    };
  }, [loadGame, loadMessages]);

  useEffect(() => {
    if (!roomId) return;

    const channel = supabase
      .channel(`mafia-room-${roomId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
        () => { void loadGame(false); },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'room_players', filter: `room_id=eq.${roomId}` },
        () => { void loadGame(false); },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'room_messages', filter: `room_id=eq.${roomId}` },
        () => { void loadMessages(); },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [roomId, loadGame, loadMessages]);

  useEffect(() => {
    if (!roomId) return;

    let cancelled = false;
    const heartbeat = async () => {
      if (cancelled) return;
      try {
        await supabase.rpc('heartbeat_room', { p_room_id: roomId });
      } catch (error) {
        console.error('heartbeat error:', error);
      }
    };

    void heartbeat();
    const interval = setInterval(heartbeat, 10000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [roomId]);

  const advancingRef = useRef(false);

  const advancePhase = useCallback(async () => {
    if (!roomId || advancingRef.current) return;
    advancingRef.current = true;

    try {
      const { error } = await supabase.rpc('advance_mafia_phase', { p_room_id: roomId });
      if (error) {
        const message = getErrorMessage(error, '');
        if (!message.includes('phase_not_finished')) {
          console.error('advance phase error:', error);
        }
      }
      await loadGame(false);
    } catch (error) {
      console.error('advance phase error:', error);
    } finally {
      advancingRef.current = false;
    }
  }, [roomId, loadGame]);

  useEffect(() => {
    const end = room?.phase_ends_at;
    if (!end) {
      setSecondsLeft(0);
      return;
    }

    const update = () => {
      const remaining = getSecondsLeft(end);
      if (mountedRef.current) setSecondsLeft(remaining);

      if (remaining <= 0 && room?.status === 'playing') {
        void advancePhase();
      }
    };

    update();
    const interval = setInterval(update, 1000);

    return () => {
      clearInterval(interval);
    };
  }, [room?.phase_ends_at, room?.status, advancePhase]);

  const selectTarget = useCallback(
    (userId: string) => {
      if (busy || gameFinished || !myAlive) return;

      const target = players.find((player) => player.user_id === userId);
      if (!target || !target.alive) return;
      if (isDay && userId === currentUserId) return;

      setSelectedTarget((current) => (current === userId ? null : userId));
    },
    [busy, gameFinished, myAlive, players, isDay, currentUserId],
  );

  const getNightAction = useCallback((role: string | null | undefined) => {
    switch (String(role || '').toUpperCase()) {
      case 'MAFIA':
      case 'GODFATHER':
        return 'kill';
      case 'DOCTOR':
        return 'protect';
      case 'DETECTIVE':
      case 'CONSIGLIERE':
        return 'investigate';
      case 'CULT_LEADER':
        return 'cult_convert';
      default:
        return null;
    }
  }, []);

  const performNightAction = useCallback(
    async (action: 'kill' | 'protect' | 'investigate' | 'cult_convert') => {
      if (!roomId || !selectedTarget) {
        Alert.alert('اختر لاعبًا', 'اختر لاعبًا حيًا أولًا.');
        return;
      }

      if (!canNightAction) return;

      const target = players.find((player) => player.user_id === selectedTarget);
      if (!target || !target.alive) {
        Alert.alert('هدف غير صالح', 'اختر لاعبًا حيًا.');
        return;
      }

      if (action === 'kill' && target.user_id === currentUserId) {
        Alert.alert('هدف غير صالح', 'لا يمكنك اختيار نفسك.');
        return;
      }

      setBusy(true);

      try {
        await submitNightAction(roomId, action, selectedTarget);
        setSelectedTarget(null);
        await loadGame(false);
        Alert.alert('تم', 'تم تسجيل الفعل الليلي.');
      } catch (error) {
        Alert.alert('تعذر تنفيذ الفعل', getErrorMessage(error, 'حدث خطأ أثناء تنفيذ الفعل.'));
      } finally {
        if (mountedRef.current) setBusy(false);
      }
    },
    [roomId, selectedTarget, canNightAction, players, currentUserId, loadGame],
  );

  const performVote = useCallback(async () => {
    if (!roomId || !selectedTarget) {
      Alert.alert('اختر لاعبًا', 'اختر لاعبًا حيًا للتصويت ضده.');
      return;
    }

    if (!canDayVote) return;

    const target = players.find((player) => player.user_id === selectedTarget);
    if (!target || !target.alive || target.user_id === currentUserId) {
      Alert.alert('تصويت غير صالح', 'اختر لاعبًا حيًا آخر.');
      return;
    }

    setBusy(true);

    try {
      await submitDayVote(roomId, selectedTarget);
      setSelectedTarget(null);
      await loadGame(false);
      Alert.alert('تم التصويت', `تم تسجيل تصويتك ضد ${target.name || 'اللاعب'}.`);
    } catch (error) {
      Alert.alert('تعذر تسجيل التصويت', getErrorMessage(error, 'حدث خطأ أثناء التصويت.'));
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }, [roomId, selectedTarget, canDayVote, players, currentUserId, loadGame]);

  const sendMessage = useCallback(async () => {
    const text = messageText.trim();
    if (!text || !roomId || busy) return;

    setBusy(true);

    try {
      const { error } = await supabase.rpc('send_room_message', {
        p_room_id: roomId,
        p_message: text,
      });

      if (error) throw error;

      setMessageText('');
      await loadMessages();
    } catch (error) {
      Alert.alert('تعذر إرسال الرسالة', getErrorMessage(error, 'حدث خطأ أثناء إرسال الرسالة.'));
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }, [messageText, roomId, busy, loadMessages]);

  const disconnectVoice = useCallback(async () => {
    const voiceRoom = voiceRoomRef.current;
    voiceRoomRef.current = null;
    voiceConnectingRef.current = false;

    try {
      if (voiceRoom) {
        await voiceRoom.disconnect();
      }
      await stopMicrophoneSession();
    } catch (error) {
      console.error('LiveKit disconnect error:', error);
    } finally {
      if (mountedRef.current) {
        setVoiceConnected(false);
        setMicEnabled(false);
        setVoiceLoading(false);
      }
    }
  }, []);

  const connectVoice = useCallback(async () => {
    if (!roomId || voiceRoomRef.current || voiceConnectingRef.current) {
      return;
    }

    voiceConnectingRef.current = true;
    if (mountedRef.current) setVoiceLoading(true);

    let createdRoom: Room | null = null;

    try {
      await prepareMicrophone();

      const token = await getLiveKitToken(roomId);
      if (!token || !token.token || !token.server_url) {
        throw new Error('بيانات LiveKit غير صالحة.');
      }

      createdRoom = new Room();
      voiceRoomRef.current = createdRoom;

      await createdRoom.connect(token.server_url, token.token);

      if (!mountedRef.current) {
        try {
          await createdRoom.disconnect();
        } catch {}
        return;
      }

      setVoiceConnected(true);

      if (
        createdRoom.localParticipant &&
        typeof createdRoom.localParticipant.setMicrophoneEnabled === 'function'
      ) {
        await createdRoom.localParticipant.setMicrophoneEnabled(true);
      }

      if (mountedRef.current) {
        setMicEnabled(true);
      }
    } catch (error) {
      console.error('connectVoice error:', error);

      if (createdRoom && voiceRoomRef.current === createdRoom) {
        voiceRoomRef.current = null;
        try {
          await createdRoom.disconnect();
        } catch {}
      }

      if (mountedRef.current) {
        setVoiceConnected(false);
        setMicEnabled(false);

        Alert.alert(
          'الصوت',
          getErrorMessage(
            error,
            'تعذر تشغيل الميكروفون. يمكنك متابعة اللعبة بدون الصوت.',
          ),
        );
      }
    } finally {
      voiceConnectingRef.current = false;
      if (mountedRef.current) setVoiceLoading(false);
    }
  }, [roomId]);

  const toggleMicrophone = useCallback(async () => {
    if (voiceLoading || voiceConnectingRef.current) return;

    if (!voiceRoomRef.current) {
      await connectVoice();
      return;
    }

    const voiceRoom = voiceRoomRef.current;
    if (!voiceRoom || !voiceRoom.localParticipant) {
      await connectVoice();
      return;
    }

    try {
      setVoiceLoading(true);
      const next = !micEnabled;

      await voiceRoom.localParticipant.setMicrophoneEnabled(next);

      if (mountedRef.current) {
        setMicEnabled(next);
      }
    } catch (error) {
      console.error('toggleMicrophone error:', error);
      Alert.alert(
        'الميكروفون',
        getErrorMessage(error, 'تعذر تغيير حالة الميكروفون.'),
      );
    } finally {
      if (mountedRef.current) {
        setVoiceLoading(false);
      }
    }
  }, [connectVoice, micEnabled, voiceLoading]);

  const leaveRoom = useCallback(async () => {
    if (!roomId) return;

    try {
      try {
        await disconnectVoice();
      } catch (error) {
        console.error('leave voice cleanup error:', error);
      }

      if (currentUserId) {
        const { error } = await supabase
          .from('room_players')
          .delete()
          .eq('room_id', roomId)
          .eq('user_id', currentUserId);

        if (error) throw error;
      }

      router.replace('/rooms');
    } catch (error) {
      Alert.alert('خطأ', getErrorMessage(error, 'تعذر مغادرة الغرفة.'));
    }
  }, [roomId, currentUserId, disconnectVoice, router]);

  const kickPlayer = useCallback(
    (player: GamePlayer) => {
      if (!roomId || !isHost || player.user_id === currentUserId) return;

      Alert.alert(
        'طرد اللاعب',
        `هل تريد طرد ${player.name || 'هذا اللاعب'} من الغرفة؟`,
        [
          { text: 'إلغاء', style: 'cancel' },
          {
            text: 'طرد',
            style: 'destructive',
            onPress: async () => {
              try {
                const { error } = await supabase
                  .from('room_players')
                  .delete()
                  .eq('room_id', roomId)
                  .eq('user_id', player.user_id);

                if (error) throw error;
                await loadGame(false);
              } catch (error) {
                Alert.alert('خطأ', getErrorMessage(error, 'تعذر طرد اللاعب.'));
              }
            },
          },
        ],
      );
    },
    [roomId, isHost, currentUserId, loadGame],
  );

  useEffect(() => {
    return () => {
      void disconnectVoice();
    };
  }, [disconnectVoice]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([loadGame(false), loadMessages()]);
    } finally {
      if (mountedRef.current) setRefreshing(false);
    }
  }, [loadGame, loadMessages]);

  if (loading && !gameState) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>جارٍ تحميل الغرفة...</Text>
      </View>
    );
  }

  if (!room) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>تعذر العثور على الغرفة</Text>
        <Text style={styles.errorText}>الغرفة غير موجودة أو لم تعد متاحة.</Text>
        <Pressable
          style={styles.primaryButton}
          onPress={() => router.replace('/rooms')}
        >
          <Text style={styles.primaryButtonText}>العودة</Text>
        </Pressable>
      </View>
    );
  }

  const nightAction = getNightAction(myRole);

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} />
        }
      >
        <View style={styles.header}>
          <View style={styles.headerMain}>
            <Text style={styles.title}>{room.name || 'Mafia Night'}</Text>
            <Text style={styles.code}>كود الغرفة: {room.code}</Text>
          </View>

          <Pressable style={styles.leaveButton} onPress={leaveRoom}>
            <Text style={styles.leaveButtonText}>مغادرة</Text>
          </Pressable>
        </View>

        <View style={styles.statusCard}>
          <Text style={styles.phaseTitle}>
            {gameFinished
              ? 'انتهت اللعبة'
              : isNight
                ? '🌙 الليل'
                : isDay
                  ? '☀️ النهار'
                  : '⏳ الانتظار'}
          </Text>

          {room.phase_ends_at && room.status === 'playing' && (
            <Text style={styles.timer}>{formatTime(secondsLeft)}</Text>
          )}

          {myRole && (
            <Text style={styles.roleText}>دورك: {roleLabel(myRole)}</Text>
          )}

          {room.winner && (
            <Text style={styles.winnerText}>الفائز: {String(room.winner)}</Text>
          )}
        </View>

        {/* زر بدء اللعبة يظهر للمنظم فقط في وضع الانتظار */}
        {isHost && (phase === 'waiting' || phase === 'lobby') && (
          <View style={styles.actionCard}>
            <Text style={styles.sectionTitle}>إدارة الغرفة</Text>
            <Text style={styles.actionHint}>يمكنك بدء اللعبة عندما يكتمل عدد اللاعبين.</Text>
            
            <Pressable
              style={[styles.primaryButton, busy && styles.disabledButton]}
              disabled={busy}
              onPress={async () => {
                try {
                  setBusy(true);
                  const { error } = await supabase
                    .from('rooms')
                    .update({ status: 'playing', game_phase: 'day' })
                    .eq('id', roomId);
                  
                  if (error) throw error;
                  await loadGame(false);
                } catch (error) {
                  Alert.alert('خطأ', getErrorMessage(error, 'تعذر بدء اللعبة.'));
                } finally {
                  if (mountedRef.current) setBusy(false);
                }
              }}
            >
              <Text style={styles.primaryButtonText}>🚀 بدء اللعبة</Text>
            </Pressable>
          </View>
        )}

        <View style={styles.voiceCard}>
          <View style={styles.voiceInfo}>
            <Text style={styles.sectionTitle}>🎙️ الصوت</Text>
            <Text style={styles.voiceStatus}>
              {voiceConnected
                ? micEnabled
                  ? 'الميكروفون يعمل'
                  : 'متصل — الميكروفون مغلق'
                : 'غير متصل'}
            </Text>
          </View>

          <Pressable
            style={[
              styles.voiceButton,
              voiceConnected && micEnabled && styles.voiceButtonActive,
            ]}
            onPress={toggleMicrophone}
            disabled={voiceLoading || voiceConnectingRef.current}
          >
            {voiceLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.voiceButtonText}>
                {voiceConnected
                  ? micEnabled
                    ? '🔇 إيقاف الميكروفون'
                    : '🎤 تشغيل الميكروفون'
                  : '🎤 تشغيل الصوت'}
              </Text>
            )}
          </Pressable>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.sectionTitle}>اللاعبين ({players.length})</Text>
          </View>

          {players.map((player) => {
            const selected = selectedTarget === player.user_id;
            const canSelect =
              player.alive &&
              !gameFinished &&
              myAlive &&
              ((isNight && Boolean(nightAction)) || isDay) &&
              player.user_id !== currentUserId;

            return (
              <Pressable
                key={player.id || player.user_id}
                style={[
                  styles.playerRow,
                  selected && styles.playerSelected,
                  !player.alive && styles.playerDead,
                ]}
                disabled={!canSelect}
                onPress={() => selectTarget(player.user_id)}
              >
                <PlayerAvatar player={player} size={48} />

                <View style={styles.playerInfo}>
                  <Text style={styles.playerName}>
                    {player.name || 'لاعب'}
                    {player.user_id === currentUserId && ' (أنت)'}
                  </Text>

                  <Text
                    style={[
                      styles.playerStatus,
                      !player.alive && styles.deadText,
                    ]}
                  >
                    {player.alive ? 'حي' : 'ميت'}
                  </Text>
                </View>

                {selected && <Text style={styles.selectedText}>✓</Text>}

                {isHost && player.user_id !== currentUserId && (
                  <Pressable
                    style={styles.kickButton}
                    onPress={(event) => {
                      event.stopPropagation();
                      kickPlayer(player);
                    }}
                  >
                    <Text style={styles.kickText}>طرد</Text>
                  </Pressable>
                )}
              </Pressable>
            );
          })}
        </View>

        {isNight && myAlive && nightAction && !gameFinished && (
          <View style={styles.actionCard}>
            <Text style={styles.sectionTitle}>الفعل الليلي</Text>
            <Text style={styles.actionHint}>اختر لاعبًا ثم نفّذ الفعل.</Text>

            <Pressable
              style={[
                styles.primaryButton,
                !selectedTarget && styles.disabledButton,
              ]}
              disabled={busy || !selectedTarget}
              onPress={() => performNightAction(nightAction)}
            >
              <Text style={styles.primaryButtonText}>
                {nightAction === 'kill'
                  ? '☠️ قتل'
                  : nightAction === 'protect'
                    ? '🛡️ حماية'
                    : nightAction === 'investigate'
                      ? '🔎 تحقيق'
                      : '🌀 تحويل'}
              </Text>
            </Pressable>
          </View>
        )}

        {isDay && myAlive && !gameFinished && (
          <View style={styles.actionCard}>
            <Text style={styles.sectionTitle}>التصويت</Text>
            <Text style={styles.actionHint}>اختر لاعبًا حيًا ثم صوّت.</Text>

            <Pressable
              style={[
                styles.primaryButton,
                !selectedTarget && styles.disabledButton,
              ]}
              disabled={busy || !selectedTarget}
              onPress={performVote}
            >
              <Text style={styles.primaryButtonText}>🗳️ تصويت</Text>
            </Pressable>
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>💬 الدردشة</Text>

          <View style={styles.messages}>
            {messages.length === 0 ? (
              <Text style={styles.emptyText}>لا توجد رسائل بعد.</Text>
            ) : (
              messages.map((item) => (
                <View key={item.id} style={styles.messageRow}>
                  <Text style={styles.messageUser}>
                    {item.username || 'لاعب'}
                  </Text>
                  <Text style={styles.messageText}>{item.message}</Text>
                </View>
              ))
            )}
          </View>

          <View style={styles.chatInputRow}>
            <TextInput
              style={styles.input}
              value={messageText}
              onChangeText={setMessageText}
              placeholder="اكتب رسالة..."
              placeholderTextColor="#777"
              multiline
              maxLength={500}
            />

            <Pressable
              style={styles.sendButton}
              onPress={sendMessage}
              disabled={busy || !messageText.trim()}
            >
              <Text style={styles.sendText}>إرسال</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#09090f',
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#09090f',
    padding: 24,
  },
  loadingText: {
    color: '#fff',
    marginTop: 14,
    fontSize: 16,
  },
  errorTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 10,
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
    marginBottom: 14,
  },
  headerMain: {
    flex: 1,
    marginRight: 12,
  },
  title: {
    color: '#fff',
    fontSize: 23,
    fontWeight: '800',
  },
  code: {
    color: '#999',
    fontSize: 13,
    marginTop: 5,
  },
  leaveButton: {
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: '#35151b',
  },
  leaveButtonText: {
    color: '#ff8f9a',
    fontWeight: '700',
  },
  statusCard: {
    backgroundColor: '#151520',
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
    marginBottom: 14,
  },
  phaseTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '800',
  },
  timer: {
    color: '#fff',
    fontSize: 30,
    fontWeight: '800',
    marginTop: 8,
  },
  roleText: {
    color: '#c7c7d5',
    fontSize: 15,
    marginTop: 8,
  },
  winnerText: {
    color: '#ffd166',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 8,
  },
  voiceCard: {
    backgroundColor: '#151520',
    borderRadius: 16,
    padding: 15,
    marginBottom: 14,
  },
  voiceInfo: {
    marginBottom: 12,
  },
  voiceStatus: {
    color: '#999',
    marginTop: 5,
  },
  voiceButton: {
    backgroundColor: '#242433',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  voiceButtonActive: {
    backgroundColor: '#263b2d',
  },
  voiceButtonText: {
    color: '#fff',
    fontWeight: '800',
  },
  card: {
    backgroundColor: '#151520',
    borderRadius: 16,
    padding: 15,
    marginBottom: 14,
  },
  actionCard: {
    backgroundColor: '#171727',
    borderRadius: 16,
    padding: 15,
    marginBottom: 14,
  },
  cardHeader: {
    marginBottom: 6,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
  },
  actionHint: {
    color: '#999',
    marginTop: 7,
    marginBottom: 13,
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1c1c29',
    borderRadius: 13,
    padding: 10,
    marginTop: 8,
  },
  playerSelected: {
    borderWidth: 1,
    borderColor: '#fff',
  },
  playerDead: {
    opacity: 0.45,
  },
  avatar: {
    backgroundColor: '#29293a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '800',
  },
  playerInfo: {
    flex: 1,
    marginLeft: 11,
  },
  playerName: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  playerStatus: {
    color: '#83d18b',
    fontSize: 12,
    marginTop: 3,
  },
  deadText: {
    color: '#ff7c86',
  },
  selectedText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '900',
    marginHorizontal: 8,
  },
  kickButton: {
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#35151b',
  },
  kickText: {
    color: '#ff8f9a',
    fontWeight: '700',
    fontSize: 12,
  },
  primaryButton: {
    backgroundColor: '#5a2630',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
  disabledButton: {
    opacity: 0.4,
  },
  messages: {
    marginTop: 12,
    marginBottom: 12,
  },
  messageRow: {
    marginBottom: 9,
    backgroundColor: '#1c1c29',
    borderRadius: 10,
    padding: 10,
  },
  messageUser: {
    color: '#b8b8d0',
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 3,
  },
  messageText: {
    color: '#fff',
    fontSize: 14,
  },
  emptyText: {
    color: '#777',
    textAlign: 'center',
    paddingVertical: 15,
  },
  chatInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  input: {
    flex: 1,
    minHeight: 46,
    maxHeight: 110,
    backgroundColor: '#20202d',
    borderRadius: 11,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#fff',
    textAlignVertical: 'top',
  },
  sendButton: {
    marginLeft: 8,
    backgroundColor: '#303047',
    borderRadius: 11,
    paddingHorizontal: 15,
    paddingVertical: 14,
  },
  sendText: {
    color: '#fff',
    fontWeight: '800',
  },
});
