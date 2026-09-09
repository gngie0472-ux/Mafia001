import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  useLocalSearchParams,
  useRouter,
} from "expo-router";

import { Ionicons } from "@expo/vector-icons";

import {
  AudioSession,
} from "@livekit/react-native";

import {
  Room,
  RoomEvent,
} from "livekit-client";

import { supabase } from "../../lib/supabase";

import {
  advanceMafiaPhase,
  GamePlayer,
  GameRole,
  GameState,
  getGameState,
  getMyRole,
  getRoleDescription,
  getRoleLabel,
  getRoleNightAction,
  getRoleTeam,
  submitDayVote,
  submitNightAction,
} from "../../lib/game";

import {
  getLiveKitToken,
} from "../../lib/livekit";

// ملاحظة: تم إزالة registerGlobals() من هنا لأنها مسجلة مسبقاً في نقطة الجذر app/_layout.tsx

type Message = {
  id: string;
  room_id: string;
  user_id: string;
  message: string;
  created_at: string;
};

type Profile = {
  username: string;
  avatar_url: string | null;
};

type ProfileMap = Record<string, Profile>;

type MyRoleInfo = {
  role: GameRole;
  alive: boolean;
  team?: string;
  ghoul_ability_stolen?: boolean;
  stolen_role?: GameRole | null;
  stolen_ability?: "kill" | "protect" | "investigate" | "cult_convert" | null;
};

const ROLE_LABELS: Record<GameRole, string> = {
  CITIZEN: "المواطن",
  DOCTOR: "الطبيب",
  DETECTIVE: "المحقق",
  GHOUL: "الغول",
  MAFIA: "المافيا",
  GODFATHER: "عرّاب المافيا",
  CONSIGLIERE: "المستشار",
  CULT_LEADER: "زعيم الطائفة",
  CULTIST: "عضو الطائفة",
};

const ROLE_DESCRIPTIONS: Record<GameRole, string> = {
  CITIZEN:
    "مواطن عادي. لا تملك قدرة ليلية خاصة. مهمتك اكتشاف أعداء المواطنين عن طريق النقاش والتصويت.",
  DOCTOR:
    "الطبيب. يمكنك حماية لاعب واحد كل ليلة من محاولة القتل.",
  DETECTIVE:
    "المحقق. يمكنك التحقيق مع لاعب واحد كل ليلة لمعرفة الفريق الذي ينتمي إليه.",
  GHOUL:
    "الغول. أنت من فريق المواطنين. عند موت أول لاعب في اللعبة، تسرق قدرة ذلك اللاعب مرة واحدة إذا كانت لديه قدرة قابلة للسرقة.",
  MAFIA:
    "عضو المافيا. تشارك في اختيار هدف القتل خلال الليل.",
  GODFATHER:
    "عرّاب المافيا. قائد فريق المافيا وله خصائص خاصة يحددها نظام اللعبة.",
  CONSIGLIERE:
    "المستشار. يمكنك التحقيق مع لاعب لمعرفة دوره الدقيق، وليس مجرد فريقه.",
  CULT_LEADER:
    "زعيم الطائفة. يمكنك تحويل لاعب مناسب إلى فريق الطائفة.",
  CULTIST:
    "عضو في الطائفة. تنتمي إلى فريق الطائفة ولا تملك قدرة ليلية مستقلة.",
};

const ROLE_ICONS: Record<
  GameRole,
  keyof typeof Ionicons.glyphMap
> = {
  CITIZEN: "person",
  DOCTOR: "medkit",
  DETECTIVE: "search",
  GHOUL: "skull",
  MAFIA: "skull-outline",
  GODFATHER: "diamond",
  CONSIGLIERE: "eye",
  CULT_LEADER: "flame",
  CULTIST: "people",
};

function getRoleColor(role: GameRole | null): string {
  switch (role) {
    case "MAFIA":
    case "GODFATHER":
    case "CONSIGLIERE":
      return "#B83232";
    case "CULT_LEADER":
    case "CULTIST":
      return "#8B5CF6";
    case "DOCTOR":
      return "#3B82F6";
    case "DETECTIVE":
      return "#22C55E";
    case "GHOUL":
      return "#A855F7";
    case "CITIZEN":
    default:
      return "#D7A94B";
  }
}

function getTeamLabel(team?: string | null): string {
  switch (team) {
    case "MAFIA":
      return "المافيا";
    case "CULT":
      return "الطائفة";
    case "CITIZENS":
      return "المواطنون";
    default:
      return "غير معروف";
  }
}

function getSecondsLeft(endsAt?: string | null): number {
  if (!endsAt) return 0;
  const timestamp = new Date(endsAt).getTime();
  if (Number.isNaN(timestamp)) return 0;
  return Math.max(0, Math.ceil((timestamp - Date.now()) / 1000));
}

function formatTime(seconds: number): string {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const remaining = safe % 60;
  return (
    `${String(minutes).padStart(2, "0")}:` +
    `${String(remaining).padStart(2, "0")}`
  );
}

function isUuid(value?: string | null): boolean {
  if (!value) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function getEventText(
  event: GameState["room"]["last_event"]
): string | null {
  if (!event) return null;
  if (typeof event === "string") return event;

  switch (event.type) {
    case "game_started":
      return "بدأت اللعبة.";
    case "night_started":
      return "بدأ الليل. القدرات الليلية متاحة الآن.";
    case "day_started":
      return "بدأ النهار. تحدثوا واستخدموا التصويت.";
    case "night_kill":
      return "انتهى الليل وتم تنفيذ نتيجة القتل.";
    case "night_saved":
      return "الطبيب نجح في إنقاذ الهدف.";
    case "day_vote":
      return "تم تنفيذ نتيجة التصويت.";
    case "day_tie":
      return "حدث تعادل في التصويت ولم يمت أحد.";
    case "ghoul_ability_stolen":
      return "الغول حصل على القدرة المسروقة.";
    case "cult_convert":
      return "تم تنفيذ عملية تحويل إلى الطائفة.";
    case "winner":
      return event.winner
        ? `انتهت اللعبة. الفائز: ${getTeamLabel(String(event.winner))}`
        : "انتهت اللعبة.";
    case "game_finished":
      return "انتهت اللعبة.";
    default:
      return event.message || null;
  }
}

function PlayerAvatar({
  player,
  profile,
  size = 52,
}: {
  player: GamePlayer;
  profile?: Profile;
  size?: number;
}) {
  const avatar = profile?.avatar_url || player.avatar_url || null;

  if (avatar) {
    return (
      <Image
        source={{ uri: avatar }}
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
        styles.avatarFallback,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
        },
        !player.alive && styles.deadAvatar,
      ]}
    >
      <Ionicons
        name="person"
        size={Math.max(18, size * 0.4)}
        color={player.alive ? "#D7A94B" : "#666"}
      />
    </View>
  );
}

export default function MafiaGameScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string | string[] }>();
  const routeValue = Array.isArray(params.code) ? params.code[0] : params.code;

  const [roomId, setRoomId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loadingRoom, setLoadingRoom] = useState(true);
  const [loading, setLoading] = useState(true);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [myRoleInfo, setMyRoleInfo] = useState<MyRoleInfo | null>(null);
  const [profiles, setProfiles] = useState<ProfileMap>({});
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageText, setMessageText] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const [showRoleCard, setShowRoleCard] = useState(false);
  const [roleCardGameKey, setRoleCardGameKey] = useState<string | null>(null);
  const [investigationResult, setInvestigationResult] = useState<string | null>(null);
  const [voiceConnected, setVoiceConnected] = useState(false);
  const [micEnabled, setMicEnabled] = useState(false);
  const [speakingUsers, setSpeakingUsers] = useState<Record<string, boolean>>({});

  const mountedRef = useRef(true);
  const advancingRef = useRef(false);
  const lastAdvanceRef = useRef(0);
  const voiceRoomRef = useRef<Room | null>(null);

  /* Fetch current Auth User ID */
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user?.id && mountedRef.current) {
        setCurrentUserId(data.user.id);
      }
    });
  }, []);

  /* Resolve room code -> UUID */
  useEffect(() => {
    let cancelled = false;

    async function resolveRoom() {
      const value = routeValue?.trim();
      if (!value) {
        if (!cancelled) {
          setRoomId(null);
          setLoadingRoom(false);
        }
        return;
      }

      if (isUuid(value)) {
        if (!cancelled) {
          setRoomId(value);
          setLoadingRoom(false);
        }
        return;
      }

      try {
        setLoadingRoom(true);
        const { data, error } = await supabase
          .from("rooms")
          .select("id")
          .eq("code", value.toUpperCase())
          .maybeSingle();

        if (error) throw error;
        if (!data?.id) throw new Error("الغرفة غير موجودة.");

        if (!cancelled) setRoomId(data.id);
      } catch (error: any) {
        console.error("resolveRoom:", error);
        if (!cancelled) {
          setRoomId(null);
          Alert.alert("تعذر فتح الغرفة", error?.message || "كود الغرفة غير صحيح.");
        }
      } finally {
        if (!cancelled) setLoadingRoom(false);
      }
    }

    resolveRoom();
    return () => { cancelled = true; };
  }, [routeValue]);

  /* Load profiles */
  const loadProfiles = useCallback(async (players: GamePlayer[]) => {
    const ids = players.map((player) => player.user_id).filter(Boolean);
    if (!ids.length) {
      if (mountedRef.current) setProfiles({});
      return;
    }

    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, username, avatar_url")
        .in("user_id", ids);

      if (error) throw error;

      const map: ProfileMap = {};
      for (const row of data || []) {
        map[row.user_id] = {
          username: row.username || "Player",
          avatar_url: row.avatar_url || null,
        };
      }

      if (mountedRef.current) setProfiles(map);
    } catch (error) {
      console.error("loadProfiles:", error);
    }
  }, []);

  /* Load messages */
  const loadMessages = useCallback(async () => {
    if (!roomId) return;
    try {
      const { data, error } = await supabase
        .from("room_messages")
        .select("id, room_id, user_id, message, created_at")
        .eq("room_id", roomId)
        .order("created_at", { ascending: true })
        .limit(100);

      if (error) throw error;
      if (mountedRef.current) setMessages((data || []) as Message[]);
    } catch (error) {
      console.error("loadMessages:", error);
    }
  }, [roomId]);

  /* Load game */
  const loadGame = useCallback(
    async (showLoader = false) => {
      if (!roomId) return;
      try {
        if (showLoader) setLoading(true);
        const state = await getGameState(roomId);
        if (!mountedRef.current) return;

        setGameState(state);
        await loadProfiles(state.players || []);

        try {
          const role = await getMyRole(roomId);
          if (mountedRef.current) {
            setMyRoleInfo(role as MyRoleInfo);
            const gameKey = `${state.room.id}-${state.room.game_round}`;
            if (
              state.room.status === "playing" &&
              role?.role &&
              roleCardGameKey !== gameKey
            ) {
              setRoleCardGameKey(gameKey);
              setShowRoleCard(true);
            }
          }
        } catch (roleError) {
          console.error("getMyRole:", roleError);
          if (state.room.status === "waiting") setMyRoleInfo(null);
        }

        if (state.room.status === "finished") setSelectedTarget(null);
      } catch (error: any) {
        console.error("loadGame:", error);
        if (showLoader && mountedRef.current) {
          Alert.alert(
            "تعذر تحميل اللعبة",
            error?.message || "حدث خطأ أثناء تحميل حالة اللعبة."
          );
        }
      } finally {
        if (showLoader && mountedRef.current) setLoading(false);
      }
    },
    [roomId, loadProfiles, roleCardGameKey]
  );

  useEffect(() => {
    if (!roomId) return;
    loadGame(true);
    loadMessages();
  }, [roomId, loadGame, loadMessages]);

  /* Realtime */
  useEffect(() => {
    if (!roomId) return;
    const channel = supabase.channel(`mafia-game-${roomId}`);

    channel
      .on("postgres_changes", { event: "*", schema: "public", table: "rooms", filter: `id=eq.${roomId}` }, () => loadGame(false))
      .on("postgres_changes", { event: "*", schema: "public", table: "room_players", filter: `room_id=eq.${roomId}` }, () => loadGame(false))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "room_messages", filter: `room_id=eq.${roomId}` }, (payload) => {
        const message = payload.new as Message;
        if (mountedRef.current && message?.id) {
          setMessages((current) => {
            if (current.some((item) => item.id === message.id)) return current;
            return [...current, message].slice(-100);
          });
        }
      })
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [roomId, loadGame]);

  /* Timer */
  useEffect(() => {
    if (!gameState?.room?.phase_ends_at) {
      setSecondsLeft(0);
      return;
    }

    const update = () => {
      const left = getSecondsLeft(gameState.room.phase_ends_at);
      if (mountedRef.current) setSecondsLeft(left);
    };

    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [gameState?.room?.phase_ends_at]);

  /* Automatically advance expired phase */
  useEffect(() => {
    if (
      !roomId ||
      !gameState?.room ||
      secondsLeft > 0 ||
      gameState.room.status !== "playing"
    ) {
      return;
    }

    const now = Date.now();
    if (advancingRef.current || now - lastAdvanceRef.current < 3000) return;

    advancingRef.current = true;
    lastAdvanceRef.current = now;

    advanceMafiaPhase(roomId)
      .then(() => {
        if (mountedRef.current) loadGame(false);
      })
      .catch((error) => console.error("advanceMafiaPhase:", error))
      .finally(() => { advancingRef.current = false; });
  }, [roomId, gameState?.room?.status, secondsLeft, loadGame]);

  /* Voice Connection (Safe Implementation) */
  useEffect(() => {
    if (!roomId) return;
    let cancelled = false;

    async function connectVoice() {
      try {
        if (AudioSession?.startAudioSession) {
          await AudioSession.startAudioSession();
        }

        const token = await getLiveKitToken(roomId);
        if (cancelled || !token?.token || !token?.server_url) return;

        const RoomClass = Room;
        if (!RoomClass) {
          throw new Error("LiveKit Room class is undefined");
        }

        const room = new RoomClass();
        voiceRoomRef.current = room;

        room.on(RoomEvent.Disconnected, () => {
          if (mountedRef.current) {
            setVoiceConnected(false);
            setMicEnabled(false);
          }
        });

        room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
          const active: Record<string, boolean> = {};
          for (const participant of speakers) {
            if (participant?.identity) {
              active[participant.identity] = true;
            }
          }
          if (mountedRef.current) setSpeakingUsers(active);
        });

        await room.connect(token.server_url, token.token);

        if (!cancelled && mountedRef.current) {
          setVoiceConnected(true);
        }
      } catch (error) {
        console.error("LiveKit connection error:", error);
        if (mountedRef.current) setVoiceConnected(false);
      }
    }

    connectVoice();

    return () => {
      cancelled = true;
      const room = voiceRoomRef.current;
      voiceRoomRef.current = null;
      if (room) {
        try { room.disconnect(); } catch {}
      }
      if (AudioSession?.stopAudioSession) {
        AudioSession.stopAudioSession().catch(() => {});
      }
    };
  }, [roomId]);

  /* Toggle Microphone */
  const toggleMicrophone = useCallback(async () => {
    const room = voiceRoomRef.current;
    if (!room || !voiceConnected) {
      Alert.alert("الصوت غير متصل", "لم يتم الاتصال بالصوت بعد.");
      return;
    }

    try {
      const next = !micEnabled;
      await room.localParticipant.setMicrophoneEnabled(next);
      if (mountedRef.current) setMicEnabled(next);
    } catch (error) {
      console.error("toggleMicrophone:", error);
      Alert.alert(
        "تعذر تشغيل الميكروفون",
        "تأكد من إعطاء التطبيق صلاحية استخدام الميكروفون."
      );
    }
  }, [voiceConnected, micEnabled]);

  const phase = String(gameState?.room?.game_phase || "waiting");
  const roomStatus = String(gameState?.room?.status || "waiting");
  const isNight = phase === "night";
  const isDay = phase === "day";
  const isPlaying = roomStatus === "playing";
  const isFinished = roomStatus === "finished" || phase === "finished";

  const players = gameState?.players || [];
  const alivePlayers = players.filter((player) => player.alive);
  const myPlayerId = gameState?.my_player_id || gameState?.me?.id || null;

  const effectiveNightAction = useMemo(() => {
    if (!myRoleInfo) return null;
    if (myRoleInfo.role === "GHOUL" && myRoleInfo.stolen_ability) {
      return myRoleInfo.stolen_ability;
    }
    return getRoleNightAction(myRoleInfo.role);
  }, [myRoleInfo]);

  const canUseNightAbility = Boolean(
    isNight && isPlaying && myRoleInfo?.alive && effectiveNightAction
  );

  const actionTitle = useMemo(() => {
    if (myRoleInfo?.role === "GHOUL") {
      if (myRoleInfo.stolen_ability) {
        switch (myRoleInfo.stolen_ability) {
          case "kill": return "قدرتك المسروقة: القتل";
          case "protect": return "قدرتك المسروقة: الحماية";
          case "investigate": return "قدرتك المسروقة: التحقيق";
          case "cult_convert": return "قدرتك المسروقة: التحويل";
        }
      }
      return "قدرتك الخاصة";
    }

    switch (effectiveNightAction) {
      case "kill": return "اختر هدف القتل";
      case "protect": return "اختر لاعبًا لحمايته";
      case "investigate":
        return myRoleInfo?.role === "CONSIGLIERE"
          ? "اختر لاعبًا لمعرفة دوره"
          : "اختر لاعبًا لمعرفة فريقه";
      case "cult_convert": return "اختر لاعبًا لتحويله إلى الطائفة";
      default: return "";
    }
  }, [effectiveNightAction, myRoleInfo]);

  const targetAllowed = useCallback(
    (player: GamePlayer) => {
      if (!player.alive) return false;
      if (effectiveNightAction === "cult_convert") {
        return player.id !== myPlayerId;
      }
      return true;
    },
    [effectiveNightAction, myPlayerId]
  );

  /* Night action submit */
  const handleNightAction = useCallback(async () => {
    if (!roomId || !myRoleInfo || !effectiveNightAction || !selectedTarget) {
      Alert.alert("اختر لاعبًا", "يجب اختيار لاعب قبل تنفيذ القدرة.");
      return;
    }

    const target = players.find((player) => player.id === selectedTarget);
    if (!target || !target.alive) {
      Alert.alert("هدف غير صالح", "هذا اللاعب لم يعد متاحًا.");
      return;
    }

    try {
      setBusy(true);
      const result = await submitNightAction(
        roomId,
        effectiveNightAction,
        selectedTarget
      );

      if (effectiveNightAction === "investigate") {
        let text = "تم تنفيذ التحقيق.";
        if (result && typeof result === "object") {
          const value = result as any;
          if (value.role) {
            text = `دور ${target.name}: ${getRoleLabel(value.role)}`;
          } else if (value.team) {
            text = `فريق ${target.name}: ${getTeamLabel(value.team)}`;
          } else if (value.result) {
            text = String(value.result);
          }
        }
        setInvestigationResult(text);
      } else {
        Alert.alert("تم التنفيذ", "تم تسجيل قدرتك الليلية بنجاح.");
      }

      setSelectedTarget(null);
      await loadGame(false);
    } catch (error: any) {
      console.error("handleNightAction:", error);
      Alert.alert("تعذر تنفيذ القدرة", error?.message || "لم يتم تنفيذ القدرة.");
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }, [roomId, myRoleInfo, effectiveNightAction, selectedTarget, players, loadGame]);

  /* Day vote submit */
  const handleDayVote = useCallback(async () => {
    if (!roomId || !selectedTarget) {
      Alert.alert("اختر لاعبًا", "اختر اللاعب الذي تريد التصويت ضده.");
      return;
    }

    const target = players.find((player) => player.id === selectedTarget);
    if (!target || !target.alive) {
      Alert.alert("هدف غير صالح", "هذا اللاعب لم يعد حيًا.");
      return;
    }

    try {
      setBusy(true);
      await submitDayVote(roomId, selectedTarget);
      setSelectedTarget(null);
      Alert.alert("تم التصويت", `تم تسجيل تصويتك ضد ${target.name}.`);
      await loadGame(false);
    } catch (error: any) {
      console.error("handleDayVote:", error);
      Alert.alert("تعذر التصويت", error?.message || "لم يتم تسجيل التصويت.");
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }, [roomId, selectedTarget, players, loadGame]);

  /* Send message */
  const sendMessage = useCallback(async () => {
    const text = messageText.trim();
    if (!roomId || !text || sendingMessage) return;

    try {
      setSendingMessage(true);
      const userId = currentUserId;

      if (!userId) {
        throw new Error("يجب تسجيل الدخول أولًا.");
      }

      const { data, error } = await supabase
        .from("room_messages")
        .insert({
          room_id: roomId,
          user_id: userId,
          message: text,
        })
        .select("id, room_id, user_id, message, created_at")
        .single();

      if (error) throw error;

      if (data && mountedRef.current) {
        setMessages((current) => {
          if (current.some((item) => item.id === data.id)) return current;
          return [...current, data as Message].slice(-100);
        });
      }

      setMessageText("");
    } catch (error: any) {
      console.error("sendMessage:", error);
      Alert.alert("تعذر إرسال الرسالة", error?.message || "حدث خطأ أثناء إرسال الرسالة.");
    } finally {
      if (mountedRef.current) setSendingMessage(false);
    }
  }, [roomId, messageText, sendingMessage, currentUserId]);

  const renderRoleCard = () => {
    if (!showRoleCard || !myRoleInfo) return null;
    const role = myRoleInfo.role;
    const color = getRoleColor(role);

    return (
      <View style={styles.modalOverlay}>
        <View style={styles.roleModal}>
          <View style={[styles.roleIconLarge, { borderColor: color }]}>
            <Ionicons name={ROLE_ICONS[role]} size={42} color={color} />
          </View>
          <Text style={styles.roleSmallTitle}>دورك في اللعبة</Text>
          <Text style={[styles.roleModalTitle, { color }]}>{ROLE_LABELS[role]}</Text>
          <Text style={styles.roleTeam}>الفريق: {getTeamLabel(getRoleTeam(role))}</Text>
          <Text style={styles.roleModalDescription}>{ROLE_DESCRIPTIONS[role]}</Text>

          {role === "GHOUL" && !myRoleInfo.stolen_ability && (
            <View style={styles.infoBox}>
              <Ionicons name="information-circle" size={20} color="#A855F7" />
              <Text style={styles.infoText}>
                عند موت أول لاعب في اللعبة، ستسرق قدرته القابلة للسرقة مرة واحدة فقط.
              </Text>
            </View>
          )}

          {role === "GHOUL" && myRoleInfo.stolen_ability && (
            <View style={styles.infoBox}>
              <Ionicons name="flash" size={20} color="#A855F7" />
              <Text style={styles.infoText}>
                القدرة المسروقة: {myRoleInfo.stolen_ability}
              </Text>
            </View>
          )}

          <Pressable
            style={[styles.primaryButton, { backgroundColor: color }]}
            onPress={() => setShowRoleCard(false)}
          >
            <Text style={styles.primaryButtonText}>فهمت</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  if (loadingRoom || loading) {
    return (
      <View style={styles.centerScreen}>
        <ActivityIndicator size="large" color="#D7A94B" />
        <Text style={styles.loadingText}>جارٍ تحميل الغرفة...</Text>
      </View>
    );
  }

  if (!roomId) {
    return (
      <View style={styles.centerScreen}>
        <Ionicons name="alert-circle" size={56} color="#B83232" />
        <Text style={styles.errorTitle}>تعذر فتح الغرفة</Text>
        <Pressable style={styles.primaryButton} onPress={() => router.back()}>
          <Text style={styles.primaryButtonText}>العودة</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {/* HEADER */}
          <View style={styles.header}>
            <View>
              <Text style={styles.headerTitle}>
                {gameState?.room?.name || "Mafia Night"}
              </Text>
              <Text style={styles.roomCode}>
                الغرفة: {gameState?.room?.code || routeValue}
              </Text>
            </View>

            <Pressable style={styles.backButton} onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={22} color="#FFF" />
            </Pressable>
          </View>

          {/* PHASE */}
          <View style={styles.phaseCard}>
            <View>
              <Text style={styles.phaseLabel}>المرحلة الحالية</Text>
              <Text style={styles.phaseTitle}>
                {phase === "night"
                  ? "🌙 الليل"
                  : phase === "day"
                  ? "☀️ النهار"
                  : phase === "finished"
                  ? "🏆 انتهت اللعبة"
                  : "⏳ الانتظار"}
              </Text>
            </View>

            {isPlaying && !isFinished && (
              <View style={styles.timerBox}>
                <Ionicons name="time-outline" size={18} color="#D7A94B" />
                <Text style={styles.timerText}>{formatTime(secondsLeft)}</Text>
              </View>
            )}
          </View>

          {/* EVENT */}
          {getEventText(gameState?.room?.last_event) && (
            <View style={styles.eventCard}>
              <Ionicons name="notifications-outline" size={20} color="#D7A94B" />
              <Text style={styles.eventText}>
                {getEventText(gameState?.room?.last_event)}
              </Text>
            </View>
          )}

          {/* MY ROLE */}
          {myRoleInfo && (
            <Pressable
              style={[
                styles.myRoleCard,
                { borderColor: getRoleColor(myRoleInfo.role) },
              ]}
              onPress={() => setShowRoleCard(true)}
            >
              <View
                style={[
                  styles.myRoleIcon,
                  { backgroundColor: getRoleColor(myRoleInfo.role) },
                ]}
              >
                <Ionicons
                  name={ROLE_ICONS[myRoleInfo.role]}
                  size={26}
                  color="#FFF"
                />
              </View>

              <View style={styles.myRoleInfo}>
                <Text style={styles.myRoleCaption}>دورك</Text>
                <Text
                  style={[
                    styles.myRoleName,
                    { color: getRoleColor(myRoleInfo.role) },
                  ]}
                >
                  {ROLE_LABELS[myRoleInfo.role]}
                </Text>
                <Text style={styles.myRoleTeam}>
                  {getTeamLabel(myRoleInfo.team || getRoleTeam(myRoleInfo.role))}
                </Text>
              </View>

              <Ionicons name="eye-outline" size={22} color="#AAA" />
            </Pressable>
          )}

          {/* PLAYERS */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>اللاعبون</Text>
            <Text style={styles.sectionSubtitle}>
              الأحياء: {alivePlayers.length} / {players.length}
            </Text>

            {players.map((player) => {
              const profile = profiles[player.user_id];
              const selected = selectedTarget === player.id;
              const allowed = targetAllowed(player);
              const selectable =
                isPlaying &&
                player.alive &&
                allowed &&
                (isNight ? Boolean(canUseNightAbility) : isDay);

              return (
                <Pressable
                  key={player.id}
                  disabled={!selectable || busy}
                  onPress={() => setSelectedTarget(selected ? null : player.id)}
                  style={[
                    styles.playerCard,
                    !player.alive && styles.playerDead,
                    selected && styles.playerSelected,
                    !selectable && styles.playerDisabled,
                  ]}
                >
                  <PlayerAvatar player={player} profile={profile} />

                  <View style={styles.playerInfo}>
                    <Text style={styles.playerName}>
                      {profile?.username || player.name}
                    </Text>
                    <Text style={styles.playerStatus}>
                      {player.alive ? "حي" : "ميت"}
                    </Text>
                  </View>

                  {speakingUsers[player.user_id] && (
                    <Ionicons name="mic" size={20} color="#22C55E" />
                  )}

                  {selected && (
                    <Ionicons name="checkmark-circle" size={26} color="#D7A94B" />
                  )}
                </Pressable>
              );
            })}
          </View>

          {/* NIGHT ACTION */}
          {canUseNightAbility && (
            <View style={styles.actionCard}>
              <Text style={styles.actionTitle}>{actionTitle}</Text>
              <Text style={styles.actionDescription}>
                اختر لاعبًا من القائمة أعلاه ثم نفّذ قدرتك.
              </Text>

              <Pressable
                disabled={busy || !selectedTarget}
                onPress={handleNightAction}
                style={[
                  styles.primaryButton,
                  (!selectedTarget || busy) && styles.buttonDisabled,
                ]}
              >
                {busy ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={styles.primaryButtonText}>تنفيذ القدرة</Text>
                )}
              </Pressable>
            </View>
          )}

          {/* GHOUL WAITING */}
          {isNight &&
            myRoleInfo?.role === "GHOUL" &&
            !myRoleInfo.stolen_ability &&
            myRoleInfo.alive && (
              <View style={styles.infoCard}>
                <Ionicons name="skull-outline" size={25} color="#A855F7" />
                <View style={styles.infoCardContent}>
                  <Text style={styles.infoCardTitle}>قدرة الغول</Text>
                  <Text style={styles.infoCardText}>
                    لا توجد لك قدرة ليلية الآن. عند موت أول لاعب في اللعبة، ستسرق قدرته القابلة للسرقة مرة واحدة فقط.
                  </Text>
                </View>
              </View>
            )}

          {/* PASSIVE ROLES */}
          {isNight &&
            myRoleInfo &&
            ["CITIZEN", "GODFATHER", "CULTIST"].includes(myRoleInfo.role) &&
            !(myRoleInfo.role === "GHOUL" && myRoleInfo.stolen_ability) && (
              <View style={styles.infoCard}>
                <Ionicons name="moon-outline" size={25} color="#D7A94B" />
                <View style={styles.infoCardContent}>
                  <Text style={styles.infoCardTitle}>لا توجد قدرة ليلية مستقلة</Text>
                  <Text style={styles.infoCardText}>
                    دورك لا يحتاج إلى اختيار هدف في هذه المرحلة.
                  </Text>
                </View>
              </View>
            )}

          {/* DAY VOTE */}
          {isDay && isPlaying && myRoleInfo?.alive && (
            <View style={styles.actionCard}>
              <Text style={styles.actionTitle}>🗳️ التصويت</Text>
              <Text style={styles.actionDescription}>
                اختر لاعبًا حيًا ثم سجّل تصويتك.
              </Text>

              <Pressable
                disabled={busy || !selectedTarget}
                onPress={handleDayVote}
                style={[
                  styles.primaryButton,
                  (!selectedTarget || busy) && styles.buttonDisabled,
                ]}
              >
                {busy ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={styles.primaryButtonText}>تأكيد التصويت</Text>
                )}
              </Pressable>
            </View>
          )}

          {/* INVESTIGATION RESULT */}
          {investigationResult && (
            <View style={styles.resultCard}>
              <Ionicons name="search" size={25} color="#22C55E" />
              <Text style={styles.resultText}>{investigationResult}</Text>
              <Pressable onPress={() => setInvestigationResult(null)}>
                <Ionicons name="close" size={20} color="#AAA" />
              </Pressable>
            </View>
          )}

          {/* VOICE */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>الصوت</Text>
            <View style={styles.voiceCard}>
              <View style={styles.voiceStatus}>
                <View
                  style={[
                    styles.statusDot,
                    { backgroundColor: voiceConnected ? "#22C55E" : "#777" },
                  ]}
                />
                <Text style={styles.voiceStatusText}>
                  {voiceConnected ? "متصل بالصوت" : "غير متصل بالصوت"}
                </Text>
              </View>

              <Pressable
                disabled={!voiceConnected}
                onPress={toggleMicrophone}
                style={[
                  styles.micButton,
                  micEnabled && styles.micButtonActive,
                  !voiceConnected && styles.buttonDisabled,
                ]}
              >
                <Ionicons
                  name={micEnabled ? "mic" : "mic-off"}
                  size={25}
                  color="#FFF"
                />
                <Text style={styles.micText}>
                  {micEnabled ? "الميكروفون يعمل" : "الميكروفون متوقف"}
                </Text>
              </Pressable>
            </View>
          </View>

          {/* CHAT */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>💬 الدردشة</Text>
            <View style={styles.chatBox}>
              {messages.length === 0 ? (
                <Text style={styles.emptyText}>لا توجد رسائل بعد.</Text>
              ) : (
                messages.map((message) => {
                  const profile = profiles[message.user_id];
                  const own = message.user_id === currentUserId;

                  return (
                    <View
                      key={message.id}
                      style={[styles.messageRow, own && styles.messageOwn]}
                    >
                      <Text style={styles.messageAuthor}>
                        {profile?.username || "Player"}
                      </Text>
                      <Text style={styles.messageText}>{message.message}</Text>
                    </View>
                  );
                })
              )}
            </View>

            <View style={styles.messageInputRow}>
              <TextInput
                value={messageText}
                onChangeText={setMessageText}
                placeholder="اكتب رسالة..."
                placeholderTextColor="#777"
                multiline
                style={styles.messageInput}
                editable={!sendingMessage}
              />

              <Pressable
                disabled={!messageText.trim() || sendingMessage}
                onPress={sendMessage}
                style={[
                  styles.sendButton,
                  (!messageText.trim() || sendingMessage) && styles.buttonDisabled,
                ]}
              >
                {sendingMessage ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <Ionicons name="send" size={21} color="#FFF" />
                )}
              </Pressable>
            </View>
          </View>

          {/* FINISHED */}
          {isFinished && (
            <View style={styles.finishedCard}>
              <Ionicons name="trophy" size={42} color="#D7A94B" />
              <Text style={styles.finishedTitle}>انتهت اللعبة</Text>
              {gameState?.room?.winner && (
                <Text style={styles.finishedWinner}>
                  الفائز: {getTeamLabel(String(gameState.room.winner))}
                </Text>
              )}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {renderRoleCard()}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: "#0D0D0F" },
  content: { padding: 16, paddingBottom: 40 },
  centerScreen: {
    flex: 1,
    backgroundColor: "#0D0D0F",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  loadingText: { color: "#AAA", fontSize: 15, marginTop: 14 },
  errorTitle: {
    color: "#FFF",
    fontSize: 22,
    fontWeight: "800",
    marginTop: 16,
    marginBottom: 20,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  headerTitle: { color: "#FFF", fontSize: 24, fontWeight: "900" },
  roomCode: { color: "#888", fontSize: 13, marginTop: 4 },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#1B1B20",
    alignItems: "center",
    justifyContent: "center",
  },
  phaseCard: {
    backgroundColor: "#17171C",
    borderRadius: 18,
    padding: 17,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#29292F",
  },
  phaseLabel: { color: "#777", fontSize: 12, marginBottom: 4 },
  phaseTitle: { color: "#FFF", fontSize: 22, fontWeight: "900" },
  timerBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: "#222127",
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
  },
  timerText: { color: "#D7A94B", fontSize: 17, fontWeight: "800" },
  eventCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#19191E",
    borderRadius: 14,
    padding: 13,
    marginTop: 12,
    gap: 10,
  },
  eventText: { flex: 1, color: "#CCC", fontSize: 14, lineHeight: 20 },
  myRoleCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#17171C",
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    marginTop: 14,
  },
  myRoleIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  myRoleInfo: { flex: 1, marginStart: 12 },
  myRoleCaption: { color: "#777", fontSize: 12 },
  myRoleName: { fontSize: 18, fontWeight: "900", marginTop: 2 },
  myRoleTeam: { color: "#999", fontSize: 12, marginTop: 2 },
  section: { marginTop: 20 },
  sectionTitle: { color: "#FFF", fontSize: 20, fontWeight: "900" },
  sectionSubtitle: { color: "#777", fontSize: 12, marginTop: 3, marginBottom: 10 },
  playerCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#17171C",
    borderRadius: 15,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#25252B",
  },
  playerSelected: { borderColor: "#D7A94B", backgroundColor: "#211F18" },
  playerDisabled: { opacity: 0.72 },
  playerDead: { opacity: 0.42 },
  avatar: { backgroundColor: "#25252B" },
  avatarFallback: {
    backgroundColor: "#25252B",
    alignItems: "center",
    justifyContent: "center",
  },
  deadAvatar: { opacity: 0.45 },
  playerInfo: { flex: 1, marginStart: 12 },
  playerName: { color: "#FFF", fontSize: 15, fontWeight: "700" },
  playerStatus: { color: "#777", fontSize: 12, marginTop: 3 },
  actionCard: {
    backgroundColor: "#17171C",
    borderWidth: 1,
    borderColor: "#353039",
    borderRadius: 18,
    padding: 16,
    marginTop: 16,
  },
  actionTitle: { color: "#FFF", fontSize: 19, fontWeight: "900" },
  actionDescription: {
    color: "#999",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6,
    marginBottom: 14,
  },
  primaryButton: {
    minHeight: 48,
    borderRadius: 13,
    backgroundColor: "#D7A94B",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
    marginTop: 5,
  },
  primaryButtonText: { color: "#101010", fontSize: 15, fontWeight: "900" },
  buttonDisabled: { opacity: 0.45 },
  infoCard: {
    flexDirection: "row",
    backgroundColor: "#17171C",
    borderRadius: 16,
    padding: 15,
    marginTop: 15,
    borderWidth: 1,
    borderColor: "#29292F",
  },
  infoCardContent: { flex: 1, marginStart: 11 },
  infoCardTitle: { color: "#FFF", fontSize: 16, fontWeight: "800" },
  infoCardText: { color: "#999", fontSize: 13, lineHeight: 19, marginTop: 5 },
  resultCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#142018",
    borderRadius: 15,
    padding: 14,
    marginTop: 15,
    gap: 10,
  },
  resultText: { flex: 1, color: "#D7EBDD", fontSize: 14, fontWeight: "700" },
  voiceCard: {
    backgroundColor: "#17171C",
    borderRadius: 17,
    padding: 15,
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#29292F",
  },
  voiceStatus: { flexDirection: "row", alignItems: "center", marginBottom: 13 },
  statusDot: { width: 9, height: 9, borderRadius: 5, marginEnd: 8 },
  voiceStatusText: { color: "#BBB", fontSize: 13 },
  micButton: {
    minHeight: 48,
    borderRadius: 13,
    backgroundColor: "#29292F",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  micButtonActive: { backgroundColor: "#B83232" },
  micText: { color: "#FFF", fontSize: 14, fontWeight: "800" },
  chatBox: {
    backgroundColor: "#17171C",
    borderRadius: 16,
    padding: 12,
    marginTop: 10,
    minHeight: 100,
    borderWidth: 1,
    borderColor: "#29292F",
  },
  emptyText: { color: "#666", textAlign: "center", paddingVertical: 20 },
  messageRow: {
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: "#24242A",
  },
  messageOwn: {
    backgroundColor: "#1D1B16",
    borderRadius: 8,
    paddingHorizontal: 8,
  },
  messageAuthor: {
    color: "#D7A94B",
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 2,
  },
  messageText: { color: "#DDD", fontSize: 14, lineHeight: 19 },
  messageInputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    marginTop: 9,
    gap: 8,
  },
  messageInput: {
    flex: 1,
    minHeight: 46,
    maxHeight: 110,
    backgroundColor: "#17171C",
    borderRadius: 13,
    paddingHorizontal: 13,
    paddingVertical: 11,
    color: "#FFF",
    fontSize: 14,
    borderWidth: 1,
    borderColor: "#29292F",
  },
  sendButton: {
    width: 48,
    height: 46,
    borderRadius: 13,
    backgroundColor: "#D7A94B",
    alignItems: "center",
    justifyContent: "center",
  },
  finishedCard: {
    alignItems: "center",
    backgroundColor: "#17171C",
    borderRadius: 20,
    padding: 25,
    marginTop: 20,
  },
  finishedTitle: {
    color: "#FFF",
    fontSize: 23,
    fontWeight: "900",
    marginTop: 10,
  },
  finishedWinner: {
    color: "#D7A94B",
    fontSize: 17,
    fontWeight: "800",
    marginTop: 7,
  },
  modalOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.82)",
    alignItems: "center",
    justifyContent: "center",
    padding: 22,
  },
  roleModal: {
    width: "100%",
    maxWidth: 430,
    backgroundColor: "#17171C",
    borderRadius: 24,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#33333A",
  },
  roleIconLarge: {
    width: 86,
    height: 86,
    borderRadius: 43,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 15,
  },
  roleSmallTitle: { color: "#777", fontSize: 13 },
  roleModalTitle: { fontSize: 28, fontWeight: "900", marginTop: 5 },
  roleTeam: { color: "#999", fontSize: 13, marginTop: 5 },
  roleModalDescription: {
    color: "#CCC",
    fontSize: 14,
    lineHeight: 22,
    textAlign: "center",
    marginTop: 18,
  },
  infoBox: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#211D25",
    borderRadius: 13,
    padding: 12,
    marginTop: 15,
  },
  infoText: {
    flex: 1,
    color: "#CCC",
    fontSize: 12,
    lineHeight: 18,
    marginStart: 9,
  },
});
