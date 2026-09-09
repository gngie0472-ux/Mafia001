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

import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

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

import { supabase } from "../../lib/supabase";

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

type RoleInfo = {
  role: GameRole;
  alive: boolean;
  team?: string;
  ghoul_ability_stolen?: boolean;
  stolen_role?: GameRole | null;
  stolen_ability?:
    | "kill"
    | "protect"
    | "investigate"
    | "cult_convert"
    | null;
};

const ROLE_ICONS: Record<GameRole, keyof typeof Ionicons.glyphMap> = {
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

const ROLE_COLORS: Record<GameRole, string> = {
  CITIZEN: "#D7A94B",
  DOCTOR: "#3B82F6",
  DETECTIVE: "#22C55E",
  GHOUL: "#A855F7",
  MAFIA: "#B83232",
  GODFATHER: "#8B1E2D",
  CONSIGLIERE: "#C2410C",
  CULT_LEADER: "#8B5CF6",
  CULTIST: "#7C3AED",
};

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

function formatTime(seconds: number) {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const remaining = safe % 60;

  return `${String(minutes).padStart(2, "0")}:${String(
    remaining,
  ).padStart(2, "0")}`;
}

function secondsUntil(value?: string | null) {
  if (!value) return 0;

  const time = new Date(value).getTime();

  if (Number.isNaN(time)) return 0;

  return Math.max(0, Math.ceil((time - Date.now()) / 1000));
}

function teamLabel(team?: string | null) {
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

function actionLabel(action?: string | null) {
  switch (action) {
    case "kill":
      return "قتل";
    case "protect":
      return "حماية";
    case "investigate":
      return "تحقيق";
    case "cult_convert":
      return "تحويل";
    default:
      return "";
  }
}

function errorText(error: any) {
  if (!error) return "حدث خطأ غير معروف.";

  if (typeof error === "string") return error;

  return (
    error.message ||
    error.details ||
    error.hint ||
    "حدث خطأ أثناء تنفيذ العملية."
  );
}

function Avatar({
  player,
  profile,
  size = 54,
}: {
  player: GamePlayer;
  profile?: Profile;
  size?: number;
}) {
  const uri = profile?.avatar_url || player.avatar_url || null;

  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          opacity: player.alive ? 1 : 0.35,
        }}
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
          opacity: player.alive ? 1 : 0.35,
        },
      ]}
    >
      <Ionicons name="person" size={size * 0.42} color="#D7A94B" />
    </View>
  );
}

export default function MafiaGameScreen() {
  const router = useRouter();

  const params = useLocalSearchParams<{
    code?: string | string[];
  }>();

  const code = Array.isArray(params.code)
    ? params.code[0]
    : params.code;

  const mounted = useRef(true);
  const advancing = useRef(false);
  const lastAdvanceAt = useRef(0);

  const [roomId, setRoomId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [state, setState] = useState<GameState | null>(null);
  const [role, setRole] = useState<RoleInfo | null>(null);
  const [profiles, setProfiles] = useState<ProfileMap>({});

  /*
   * مهم:
   * selectedTarget أصبح دائمًا user_id للاعب.
   * هذا يمنع إرسال room_players.id عندما يكون RPC
   * mafia_submit_vote ينتظر user_id.
   */
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [seconds, setSeconds] = useState(0);

  const [messages, setMessages] = useState<Message[]>([]);
  const [message, setMessage] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);

  const [showRoleCard, setShowRoleCard] = useState(true);

  const scrollRef = useRef<ScrollView>(null);

  /* ============================================================
     AUTH
  ============================================================ */

  useEffect(() => {
    mounted.current = true;

    const loadSession = async () => {
      const { data } = await supabase.auth.getSession();

      if (mounted.current) {
        setUserId(data.session?.user?.id ?? null);
      }
    };

    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted.current) {
        setUserId(session?.user?.id ?? null);
      }
    });

    return () => {
      mounted.current = false;
      subscription.unsubscribe();
    };
  }, []);

  /* ============================================================
     RESOLVE ROOM
  ============================================================ */

  useEffect(() => {
    let cancelled = false;

    async function resolveRoom() {
      if (!code) {
        if (!cancelled) setLoading(false);
        return;
      }

      try {
        let id = code.trim();

        if (!isUuid(id)) {
          const { data, error } = await supabase
            .from("rooms")
            .select("id")
            .eq("code", id.toUpperCase())
            .maybeSingle();

          if (error) throw error;

          if (!data?.id) {
            throw new Error("الغرفة غير موجودة.");
          }

          id = data.id;
        }

        if (!isUuid(id)) {
          throw new Error("معرف الغرفة غير صالح.");
        }

        if (!cancelled) {
          setRoomId(id);
        }
      } catch (error) {
        if (!cancelled) {
          Alert.alert("تعذر فتح اللعبة", errorText(error));
          setLoading(false);
        }
      }
    }

    resolveRoom();

    return () => {
      cancelled = true;
    };
  }, [code]);

  /* ============================================================
     PROFILES
  ============================================================ */

  const loadProfiles = useCallback(async (players: GamePlayer[]) => {
    const ids = players
      .map((p) => p.user_id)
      .filter((id): id is string => Boolean(id) && isUuid(id));

    if (!ids.length) {
      if (mounted.current) setProfiles({});
      return;
    }

    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id,username,avatar_url")
        .in("user_id", ids);

      if (error) throw error;

      const map: ProfileMap = {};

      for (const row of data || []) {
        if (row.user_id) {
          map[row.user_id] = {
            username: row.username || "لاعب",
            avatar_url: row.avatar_url || null,
          };
        }
      }

      if (mounted.current) {
        setProfiles(map);
      }
    } catch (error) {
      console.log("profiles:", error);
    }
  }, []);

  /* ============================================================
     CHAT
  ============================================================ */

  const loadMessages = useCallback(async () => {
    if (!roomId) return;

    const { data, error } = await supabase
      .from("room_messages")
      .select("id,room_id,user_id,message,created_at")
      .eq("room_id", roomId)
      .order("created_at", { ascending: true })
      .limit(100);

    if (!error && mounted.current) {
      setMessages((data || []) as Message[]);
    }
  }, [roomId]);

  /* ============================================================
     GAME
  ============================================================ */

  const loadGame = useCallback(
    async (initial = false) => {
      if (!roomId) return;

      try {
        if (initial && mounted.current) {
          setLoading(true);
        }

        const next = await getGameState(roomId);

        if (!mounted.current) return;

        setState(next);

        await loadProfiles(next.players || []);

        try {
          const myRole = await getMyRole(roomId);

          if (mounted.current && myRole) {
            setRole(myRole as RoleInfo);
          }
        } catch (error) {
          console.log("getMyRole:", error);
        }
      } catch (error) {
        console.error("loadGame:", error);

        if (initial && mounted.current) {
          Alert.alert("تعذر تحميل اللعبة", errorText(error));
        }
      } finally {
        if (initial && mounted.current) {
          setLoading(false);
        }
      }
    },
    [roomId, loadProfiles],
  );

  useEffect(() => {
    if (!roomId) return;

    loadGame(true);
    loadMessages();
  }, [roomId, loadGame, loadMessages]);

  /* ============================================================
     REALTIME GAME
  ============================================================ */

  useEffect(() => {
    if (!roomId) return;

    const channel = supabase
      .channel(`mafia-game-${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "rooms",
          filter: `id=eq.${roomId}`,
        },
        () => {
          loadGame(false);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "room_players",
          filter: `room_id=eq.${roomId}`,
        },
        () => {
          loadGame(false);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId, loadGame]);

  /* ============================================================
     REALTIME CHAT
  ============================================================ */

  useEffect(() => {
    if (!roomId) return;

    const channel = supabase
      .channel(`mafia-chat-${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "room_messages",
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          const item = payload.new as Message;

          setMessages((current) => {
            if (current.some((m) => m.id === item.id)) {
              return current;
            }

            return [...current, item];
          });

          setTimeout(() => {
            scrollRef.current?.scrollToEnd({
              animated: true,
            });
          }, 50);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId]);

  /* ============================================================
     COUNTDOWN
  ============================================================ */

  useEffect(() => {
    const update = () => {
      const value = secondsUntil(state?.room?.phase_ends_at);

      if (mounted.current) {
        setSeconds(value);
      }

      const phase = state?.room?.game_phase;

      if (
        value <= 0 &&
        roomId &&
        phase &&
        phase !== "waiting" &&
        phase !== "finished" &&
        !advancing.current &&
        Date.now() - lastAdvanceAt.current > 2500
      ) {
        advancing.current = true;
        lastAdvanceAt.current = Date.now();

        advanceMafiaPhase(roomId)
          .catch((error) => {
            console.log("advance phase:", error);
          })
          .finally(() => {
            setTimeout(() => {
              advancing.current = false;

              if (mounted.current) {
                loadGame(false);
              }
            }, 700);
          });
      }
    };

    update();

    const timer = setInterval(update, 1000);

    return () => clearInterval(timer);
  }, [
    state?.room?.phase_ends_at,
    state?.room?.game_phase,
    roomId,
    loadGame,
  ]);

  /* ============================================================
     CURRENT PLAYER
  ============================================================ */

  const me = useMemo(() => {
    if (!state) return null;

    if (state.me) {
      if (!userId || state.me.user_id === userId) {
        return state.me;
      }
    }

    if (userId) {
      const found = state.players.find(
        (p) => p.user_id === userId,
      );

      if (found) return found;
    }

    if (state.my_player_id) {
      const found = state.players.find(
        (p) =>
          p.id === state.my_player_id ||
          p.user_id === state.my_player_id,
      );

      if (found) return found;
    }

    return null;
  }, [state, userId]);

  /* ============================================================
     ROLE
  ============================================================ */

  const myAlive =
    role?.alive ??
    me?.alive ??
    true;

  const currentRole =
    role?.role ??
    (me?.role ? (me.role as GameRole) : null);

  const roleDescription = currentRole
    ? getRoleDescription(currentRole)
    : "سيظهر دورك هنا بعد توزيع الأدوار.";

  const roleLabel = currentRole
    ? getRoleLabel(currentRole)
    : "بانتظار الدور";

  const roleTeam =
    role?.team ??
    (currentRole ? getRoleTeam(currentRole) : null);

  const roleColor =
    currentRole && ROLE_COLORS[currentRole]
      ? ROLE_COLORS[currentRole]
      : "#D7A94B";

  const roleIcon =
    currentRole && ROLE_ICONS[currentRole]
      ? ROLE_ICONS[currentRole]
      : "help-circle";

  const normalAction = currentRole
    ? getRoleNightAction(currentRole)
    : null;

  const stolenAction = role?.stolen_ability ?? null;

  const effectiveAction =
    role?.ghoul_ability_stolen && stolenAction
      ? stolenAction
      : normalAction;

  /* ============================================================
     PLAYERS / TARGETS
  ============================================================ */

  const players = state?.players || [];

  const alivePlayers = useMemo(
    () => players.filter((player) => player.alive),
    [players],
  );

  const targets = useMemo(() => {
    return alivePlayers.filter((player) => {
      if (!me) return true;

      if (player.user_id === me.user_id) {
        return false;
      }

      if (userId && player.user_id === userId) {
        return false;
      }

      return true;
    });
  }, [alivePlayers, me, userId]);

  const selectedPlayer = useMemo(
    () =>
      players.find(
        (player) => player.user_id === selectedTarget,
      ) || null,
    [players, selectedTarget],
  );

  /* ============================================================
     CLEAR INVALID TARGET
  ============================================================ */

  useEffect(() => {
    if (!selectedTarget) return;

    const exists = targets.some(
      (player) => player.user_id === selectedTarget,
    );

    if (!exists) {
      setSelectedTarget(null);
    }
  }, [targets, selectedTarget]);

  /* ============================================================
     VOTE
  ============================================================ */

  const vote = useCallback(async () => {
    if (!roomId) return;

    if (!myAlive) {
      Alert.alert("لا يمكنك التصويت", "أنت ميت.");
      return;
    }

    if (state?.room?.game_phase !== "day") {
      Alert.alert(
        "التصويت غير متاح",
        "التصويت متاح خلال النهار فقط.",
      );
      return;
    }

    if (!selectedTarget || !isUuid(selectedTarget)) {
      Alert.alert(
        "اختر لاعبًا",
        "اختر لاعبًا حيًا للتصويت ضده.",
      );
      return;
    }

    const target = players.find(
      (player) =>
        player.user_id === selectedTarget &&
        player.alive &&
        player.user_id !== userId,
    );

    if (!target) {
      Alert.alert(
        "الهدف غير صالح",
        "اللاعب المحدد لم يعد هدفًا صالحًا للتصويت.",
      );
      setSelectedTarget(null);
      return;
    }

    setBusy(true);

    try {
      /*
       * نرسل user_id فقط.
       * لا نرسل room_players.id.
       */
      await submitDayVote(
        roomId,
        target.user_id,
      );

      Alert.alert(
        "تم التصويت",
        `تم تسجيل صوتك ضد ${target.name}.`,
      );

      setSelectedTarget(null);

      await loadGame(false);
    } catch (error) {
      console.error("vote:", error);

      Alert.alert(
        "تعذر تسجيل التصويت",
        errorText(error),
      );
    } finally {
      if (mounted.current) {
        setBusy(false);
      }
    }
  }, [
    roomId,
    myAlive,
    state?.room?.game_phase,
    selectedTarget,
    players,
    userId,
    loadGame,
  ]);

  /* ============================================================
     NIGHT ACTION
  ============================================================ */

  const performAction = useCallback(async () => {
    if (!roomId) return;

    if (!myAlive) {
      Alert.alert(
        "لا يمكنك استخدام القدرة",
        "أنت ميت.",
      );
      return;
    }

    if (state?.room?.game_phase !== "night") {
      Alert.alert(
        "القدرة غير متاحة",
        "القدرات متاحة أثناء الليل فقط.",
      );
      return;
    }

    if (!effectiveAction) {
      Alert.alert(
        "لا توجد قدرة",
        "دورك لا يملك قدرة ليلية فعالة.",
      );
      return;
    }

    if (!selectedTarget || !isUuid(selectedTarget)) {
      Alert.alert(
        "اختر هدفًا",
        "اختر لاعبًا حيًا أولًا.",
      );
      return;
    }

    const target = players.find(
      (player) =>
        player.user_id === selectedTarget &&
        player.alive &&
        player.user_id !== userId,
    );

    if (!target) {
      Alert.alert(
        "الهدف غير صالح",
        "اللاعب المحدد لم يعد هدفًا صالحًا.",
      );
      setSelectedTarget(null);
      return;
    }

    setBusy(true);

    try {
      /*
       * كما في التصويت، نستخدم user_id كمعرف موحد للهدف.
       */
      await submitNightAction(
        roomId,
        effectiveAction,
        target.user_id,
      );

      Alert.alert(
        "تم",
        `تم تنفيذ ${actionLabel(effectiveAction)} على ${target.name}.`,
      );

      setSelectedTarget(null);

      await loadGame(false);
    } catch (error) {
      console.error("night action:", error);

      Alert.alert(
        "تعذر تنفيذ القدرة",
        errorText(error),
      );
    } finally {
      if (mounted.current) {
        setBusy(false);
      }
    }
  }, [
    roomId,
    myAlive,
    state?.room?.game_phase,
    effectiveAction,
    selectedTarget,
    players,
    userId,
    loadGame,
  ]);

  /* ============================================================
     CHAT
  ============================================================ */

  const sendMessage = useCallback(async () => {
    const text = message.trim();

    if (
      !roomId ||
      !userId ||
      !text ||
      sendingMessage
    ) {
      return;
    }

    setSendingMessage(true);

    try {
      const { data, error } = await supabase
        .from("room_messages")
        .insert({
          room_id: roomId,
          user_id: userId,
          message: text,
        })
        .select(
          "id,room_id,user_id,message,created_at",
        )
        .single();

      if (error) throw error;

      if (data) {
        setMessages((current) => {
          if (current.some((m) => m.id === data.id)) {
            return current;
          }

          return [...current, data as Message];
        });
      }

      setMessage("");

      setTimeout(() => {
        scrollRef.current?.scrollToEnd({
          animated: true,
        });
      }, 50);
    } catch (error) {
      Alert.alert(
        "تعذر إرسال الرسالة",
        errorText(error),
      );
    } finally {
      if (mounted.current) {
        setSendingMessage(false);
      }
    }
  }, [
    roomId,
    userId,
    message,
    sendingMessage,
  ]);

  /* ============================================================
     PHASE
  ============================================================ */

  const phase =
    state?.room?.game_phase || "waiting";

  const phaseTitle =
    phase === "night"
      ? "🌙 الليل"
      : phase === "day"
        ? "☀️ النهار"
        : phase === "finished"
          ? "🏆 انتهت اللعبة"
          : "⏳ الانتظار";

  const phaseDescription =
    phase === "night"
      ? "الأدوار التي تملك قدرات ليلية يمكنها تنفيذها الآن."
      : phase === "day"
        ? "تحدث مع اللاعبين واختر من تعتقد أنه العدو."
        : phase === "finished"
          ? "تم تحديد الفريق الفائز."
          : "بانتظار بدء اللعبة.";

  const winner = state?.room?.winner;

  /* ============================================================
     LOADING
  ============================================================ */

  if (loading && !state) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#D7A94B" />

        <Text style={styles.loadingText}>
          جاري تحميل اللعبة...
        </Text>
      </View>
    );
  }

  if (!state) {
    return (
      <View style={styles.loading}>
        <Ionicons
          name="alert-circle"
          size={60}
          color="#B83232"
        />

        <Text style={styles.loadingText}>
          تعذر تحميل اللعبة
        </Text>

        <Pressable
          style={styles.primaryButton}
          onPress={() => roomId && loadGame(true)}
        >
          <Text style={styles.primaryButtonText}>
            إعادة المحاولة
          </Text>
        </Pressable>
      </View>
    );
  }

  /* ============================================================
     UI
  ============================================================ */

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={
        Platform.OS === "ios"
          ? "padding"
          : undefined
      }
    >
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={styles.iconButton}
        >
          <Ionicons
            name="arrow-back"
            size={23}
            color="#fff"
          />
        </Pressable>

        <View style={styles.headerCenter}>
          <Text style={styles.roomCode}>
            {state.room.code}
          </Text>

          <Text style={styles.phaseTitle}>
            {phaseTitle}
          </Text>
        </View>

        <View style={styles.timerBox}>
          <Ionicons
            name="time-outline"
            size={18}
            color="#D7A94B"
          />

          <Text style={styles.timerText}>
            {formatTime(seconds)}
          </Text>
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* ROLE */}

        {showRoleCard ? (
          <View
            style={[
              styles.roleCard,
              { borderColor: roleColor },
            ]}
          >
            <View
              style={[
                styles.roleIcon,
                {
                  backgroundColor: `${roleColor}22`,
                  borderColor: roleColor,
                },
              ]}
            >
              <Ionicons
                name={roleIcon}
                size={48}
                color={roleColor}
              />
            </View>

            <Text style={styles.yourRole}>
              دورك
            </Text>

            <Text
              style={[
                styles.roleName,
                { color: roleColor },
              ]}
            >
              {roleLabel}
            </Text>

            <View
              style={[
                styles.teamBadge,
                { borderColor: roleColor },
              ]}
            >
              <Text
                style={[
                  styles.teamBadgeText,
                  { color: roleColor },
                ]}
              >
                {teamLabel(roleTeam)}
              </Text>
            </View>

            <Text style={styles.roleDescription}>
              {roleDescription}
            </Text>

            {role?.ghoul_ability_stolen &&
              stolenAction && (
                <View style={styles.stolenBox}>
                  <Ionicons
                    name="flash"
                    size={20}
                    color="#A855F7"
                  />

                  <View style={{ flex: 1 }}>
                    <Text style={styles.stolenTitle}>
                      قدرة الغول المسروقة
                    </Text>

                    <Text style={styles.stolenText}>
                      {actionLabel(stolenAction)} من دور{" "}
                      {role.stolen_role
                        ? getRoleLabel(role.stolen_role)
                        : "اللاعب الأول الذي مات"}
                    </Text>
                  </View>
                </View>
              )}

            <Pressable
              onPress={() => setShowRoleCard(false)}
              style={styles.hideRoleButton}
            >
              <Text style={styles.hideRoleText}>
                إخفاء البطاقة
              </Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.hiddenRoleCard}>
            <Ionicons
              name="lock-closed"
              size={28}
              color="#D7A94B"
            />

            <View style={{ flex: 1 }}>
              <Text style={styles.hiddenRoleTitle}>
                دورك مخفي
              </Text>

              <Text style={styles.hiddenRoleText}>
                اضغط لإظهار بطاقة دورك.
              </Text>
            </View>

            <Pressable
              onPress={() => setShowRoleCard(true)}
              style={styles.showRoleButton}
            >
              <Ionicons
                name="eye"
                size={18}
                color="#D7A94B"
              />

              <Text style={styles.showRoleText}>
                إظهار
              </Text>
            </Pressable>
          </View>
        )}

        {/* PHASE */}

        <View style={styles.phaseCard}>
          <Text style={styles.sectionTitle}>
            {phaseTitle}
          </Text>

          <Text style={styles.phaseDescription}>
            {phaseDescription}
          </Text>

          {phase === "night" &&
            effectiveAction && (
              <View style={styles.actionInfo}>
                <Ionicons
                  name="flash"
                  size={20}
                  color="#D7A94B"
                />

                <Text style={styles.actionInfoText}>
                  قدرتك الحالية:{" "}
                  <Text style={styles.bold}>
                    {actionLabel(effectiveAction)}
                  </Text>
                </Text>
              </View>
            )}
        </View>

        {/* WINNER */}

        {phase === "finished" && (
          <View style={styles.winnerCard}>
            <Ionicons
              name="trophy"
              size={60}
              color="#D7A94B"
            />

            <Text style={styles.winnerTitle}>
              انتهت اللعبة
            </Text>

            <Text style={styles.winnerText}>
              الفائز:{" "}
              {teamLabel(
                winner ? String(winner) : null,
              )}
            </Text>
          </View>
        )}

        {/* PLAYERS */}

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              اللاعبون
            </Text>

            <Text style={styles.playerCount}>
              {alivePlayers.length}/{players.length} أحياء
            </Text>
          </View>

          {players.map((player) => {
            const selected =
              selectedTarget === player.user_id;

            const isMe =
              player.user_id === userId ||
              player.user_id === me?.user_id;

            const canSelect =
              player.alive &&
              !isMe &&
              myAlive &&
              (phase === "day" ||
                (phase === "night" &&
                  Boolean(effectiveAction)));

            return (
              <Pressable
                key={player.user_id || player.id}
                disabled={!canSelect}
                onPress={() => {
                  if (
                    player.user_id &&
                    isUuid(player.user_id)
                  ) {
                    setSelectedTarget(
                      player.user_id,
                    );
                  }
                }}
                style={[
                  styles.playerCard,
                  selected &&
                    styles.selectedPlayer,
                  !player.alive &&
                    styles.deadPlayer,
                  !canSelect &&
                    phase !== "finished" &&
                    styles.disabledPlayer,
                ]}
              >
                <Avatar
                  player={player}
                  profile={profiles[player.user_id]}
                />

                <View style={styles.playerInfo}>
                  <View style={styles.playerNameRow}>
                    <Text style={styles.playerName}>
                      {profiles[player.user_id]
                        ?.username ||
                        player.name ||
                        "لاعب"}
                    </Text>

                    {isMe && (
                      <View style={styles.meBadge}>
                        <Text style={styles.meBadgeText}>
                          أنت
                        </Text>
                      </View>
                    )}
                  </View>

                  <Text style={styles.playerStatus}>
                    {player.alive ? "حي" : "ميت"}
                  </Text>
                </View>

                {selected && (
                  <Ionicons
                    name="checkmark-circle"
                    size={28}
                    color="#D7A94B"
                  />
                )}
              </Pressable>
            );
          })}
        </View>

        {/* ACTION */}

        {myAlive &&
          (phase === "day" ||
            phase === "night") && (
            <View style={styles.actionSection}>
              {phase === "day" ? (
                <>
                  <Text style={styles.sectionTitle}>
                    التصويت
                  </Text>

                  <Text style={styles.helpText}>
                    اختر لاعبًا حيًا من القائمة ثم اضغط
                    تسجيل التصويت.
                  </Text>

                  {selectedPlayer && (
                    <View style={styles.selectedTargetBox}>
                      <Ionicons
                        name="person"
                        size={20}
                        color="#D7A94B"
                      />

                      <Text style={styles.selectedTargetText}>
                        الهدف:{" "}
                        <Text style={styles.bold}>
                          {selectedPlayer.name}
                        </Text>
                      </Text>
                    </View>
                  )}

                  <Pressable
                    disabled={busy || !selectedTarget}
                    onPress={vote}
                    style={[
                      styles.primaryButton,
                      (busy || !selectedTarget) &&
                        styles.disabledButton,
                    ]}
                  >
                    {busy ? (
                      <ActivityIndicator color="#111" />
                    ) : (
                      <>
                        <Ionicons
                          name="checkmark"
                          size={22}
                          color="#111"
                        />

                        <Text style={styles.primaryButtonText}>
                          تسجيل التصويت
                        </Text>
                      </>
                    )}
                  </Pressable>
                </>
              ) : (
                <>
                  <Text style={styles.sectionTitle}>
                    قدرتك الليلية
                  </Text>

                  {!effectiveAction ? (
                    <View style={styles.noActionBox}>
                      <Ionicons
                        name="moon-outline"
                        size={24}
                        color="#777"
                      />

                      <Text style={styles.noActionText}>
                        لا تملك قدرة ليلية. انتظر بداية
                        النهار.
                      </Text>
                    </View>
                  ) : (
                    <>
                      <Text style={styles.helpText}>
                        اختر لاعبًا ثم اضغط تنفيذ القدرة.
                      </Text>

                      {selectedPlayer && (
                        <View
                          style={styles.selectedTargetBox}
                        >
                          <Ionicons
                            name="flash"
                            size={20}
                            color="#D7A94B"
                          />

                          <Text
                            style={
                              styles.selectedTargetText
                            }
                          >
                            الهدف:{" "}
                            <Text style={styles.bold}>
                              {selectedPlayer.name}
                            </Text>
                          </Text>
                        </View>
                      )}

                      <Pressable
                        disabled={busy || !selectedTarget}
                        onPress={performAction}
                        style={[
                          styles.primaryButton,
                          (busy || !selectedTarget) &&
                            styles.disabledButton,
                        ]}
                      >
                        {busy ? (
                          <ActivityIndicator color="#111" />
                        ) : (
                          <>
                            <Ionicons
                              name="flash"
                              size={22}
                              color="#111"
                            />

                            <Text
                              style={
                                styles.primaryButtonText
                              }
                            >
                              تنفيذ{" "}
                              {actionLabel(
                                effectiveAction,
                              )}
                            </Text>
                          </>
                        )}
                      </Pressable>
                    </>
                  )}
                </>
              )}
            </View>
          )}

        {/* DEAD */}

        {!myAlive && (
          <View style={styles.spectatorBox}>
            <Ionicons
              name="eye-outline"
              size={26}
              color="#A0A0A0"
            />

            <View style={{ flex: 1 }}>
              <Text style={styles.spectatorTitle}>
                أنت ميت
              </Text>

              <Text style={styles.spectatorText}>
                يمكنك متابعة اللعبة، لكن لا يمكنك
                التصويت أو استخدام القدرات.
              </Text>
            </View>
          </View>
        )}

        {/* CHAT */}

        <View style={styles.chatSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              الدردشة
            </Text>

            <Ionicons
              name="chatbubbles-outline"
              size={22}
              color="#D7A94B"
            />
          </View>

          <View style={styles.chatBox}>
            {messages.length === 0 ? (
              <Text style={styles.emptyChat}>
                لا توجد رسائل بعد.
              </Text>
            ) : (
              messages.map((item) => {
                const own = item.user_id === userId;
                const profile = profiles[item.user_id];

                return (
                  <View
                    key={item.id}
                    style={[
                      styles.messageRow,
                      own && styles.myMessageRow,
                    ]}
                  >
                    <View style={styles.messageBubble}>
                      <Text style={styles.messageUser}>
                        {own
                          ? "أنت"
                          : profile?.username || "لاعب"}
                      </Text>

                      <Text style={styles.messageText}>
                        {item.message}
                      </Text>
                    </View>
                  </View>
                );
              })
            )}
          </View>

          <View style={styles.inputRow}>
            <TextInput
              value={message}
              onChangeText={setMessage}
              placeholder="اكتب رسالة..."
              placeholderTextColor="#666"
              style={styles.messageInput}
              multiline
              maxLength={500}
            />

            <Pressable
              onPress={sendMessage}
              disabled={
                sendingMessage ||
                !message.trim()
              }
              style={[
                styles.sendButton,
                (sendingMessage ||
                  !message.trim()) &&
                  styles.disabledSend,
              ]}
            >
              {sendingMessage ? (
                <ActivityIndicator
                  size="small"
                  color="#111"
                />
              ) : (
                <Ionicons
                  name="send"
                  size={20}
                  color="#111"
                />
              )}
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/* ============================================================
   STYLES
============================================================ */

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#090909",
  },

  loading: {
    flex: 1,
    backgroundColor: "#090909",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },

  loadingText: {
    color: "#fff",
    fontSize: 17,
    marginTop: 18,
    textAlign: "center",
  },

  header: {
    minHeight: 72,
    paddingHorizontal: 14,
    paddingTop: Platform.OS === "ios" ? 42 : 18,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#202020",
    backgroundColor: "#101010",
  },

  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#191919",
    alignItems: "center",
    justifyContent: "center",
  },

  headerCenter: {
    flex: 1,
    alignItems: "center",
  },

  roomCode: {
    color: "#777",
    fontSize: 11,
    letterSpacing: 2,
    fontWeight: "700",
  },

  phaseTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
    marginTop: 2,
  },

  timerBox: {
    minWidth: 82,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#3A3020",
    backgroundColor: "#17130C",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },

  timerText: {
    color: "#D7A94B",
    fontSize: 15,
    fontWeight: "900",
  },

  scroll: {
    flex: 1,
  },

  content: {
    padding: 14,
    paddingBottom: 40,
  },

  roleCard: {
    borderWidth: 2,
    borderRadius: 24,
    backgroundColor: "#111",
    padding: 22,
    alignItems: "center",
    marginBottom: 14,
  },

  hiddenRoleCard: {
    borderWidth: 1,
    borderColor: "#332B1B",
    borderRadius: 20,
    backgroundColor: "#111",
    padding: 18,
    marginBottom: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  hiddenRoleTitle: {
    color: "#D7A94B",
    fontSize: 17,
    fontWeight: "900",
  },

  hiddenRoleText: {
    color: "#777",
    fontSize: 12,
    marginTop: 4,
  },

  roleIcon: {
    width: 92,
    height: 92,
    borderRadius: 46,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },

  yourRole: {
    color: "#777",
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 3,
  },

  roleName: {
    fontSize: 34,
    fontWeight: "900",
    textAlign: "center",
  },

  teamBadge: {
    marginTop: 9,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 7,
  },

  teamBadgeText: {
    fontSize: 14,
    fontWeight: "900",
  },

  roleDescription: {
    color: "#D0D0D0",
    fontSize: 16,
    lineHeight: 26,
    textAlign: "center",
    marginTop: 17,
  },

  stolenBox: {
    width: "100%",
    marginTop: 16,
    padding: 13,
    borderRadius: 14,
    backgroundColor: "#1B1124",
    borderWidth: 1,
    borderColor: "#542A73",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  stolenTitle: {
    color: "#C084FC",
    fontSize: 14,
    fontWeight: "900",
  },

  stolenText: {
    color: "#DDD",
    fontSize: 13,
    marginTop: 3,
  },

  hideRoleButton: {
    marginTop: 18,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: "#1B1B1B",
  },

  hideRoleText: {
    color: "#999",
    fontSize: 12,
    fontWeight: "700",
  },

  showRoleButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 13,
    backgroundColor: "#1B1710",
  },

  showRoleText: {
    color: "#D7A94B",
    fontWeight: "900",
  },

  phaseCard: {
    backgroundColor: "#111",
    borderRadius: 18,
    padding: 17,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#222",
  },

  section: {
    marginTop: 4,
    marginBottom: 14,
  },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },

  sectionTitle: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "900",
  },

  phaseDescription: {
    color: "#999",
    fontSize: 14,
    lineHeight: 21,
    marginTop: 6,
  },

  actionInfo: {
    marginTop: 13,
    padding: 11,
    borderRadius: 12,
    backgroundColor: "#19150D",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  actionInfoText: {
    color: "#D0D0D0",
    fontSize: 14,
  },

  bold: {
    fontWeight: "900",
    color: "#D7A94B",
  },

  playerCount: {
    color: "#777",
    fontSize: 12,
    fontWeight: "700",
  },

  playerCard: {
    minHeight: 78,
    padding: 11,
    marginBottom: 8,
    borderRadius: 17,
    backgroundColor: "#121212",
    borderWidth: 1,
    borderColor: "#242424",
    flexDirection: "row",
    alignItems: "center",
  },

  selectedPlayer: {
    borderColor: "#D7A94B",
    backgroundColor: "#1B160C",
  },

  deadPlayer: {
    opacity: 0.55,
  },

  disabledPlayer: {
    opacity: 0.75,
  },

  avatarFallback: {
    backgroundColor: "#1D1D1D",
    borderWidth: 1,
    borderColor: "#333",
    alignItems: "center",
    justifyContent: "center",
  },

  playerInfo: {
    flex: 1,
    marginLeft: 12,
  },

  playerNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },

  playerName: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
  },

  playerStatus: {
    color: "#777",
    fontSize: 12,
    marginTop: 4,
  },

  meBadge: {
    backgroundColor: "#D7A94B",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },

  meBadgeText: {
    color: "#111",
    fontSize: 9,
    fontWeight: "900",
  },

  actionSection: {
    backgroundColor: "#111",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#292929",
    padding: 17,
    marginBottom: 14,
  },

  helpText: {
    color: "#888",
    fontSize: 13,
    lineHeight: 20,
    marginTop: 6,
    marginBottom: 13,
  },

  selectedTargetBox: {
    minHeight: 44,
    borderRadius: 13,
    backgroundColor: "#1B160C",
    borderWidth: 1,
    borderColor: "#59451E",
    paddingHorizontal: 12,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  selectedTargetText: {
    color: "#D0D0D0",
    fontSize: 14,
  },

  primaryButton: {
    minHeight: 52,
    borderRadius: 15,
    backgroundColor: "#D7A94B",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
  },

  primaryButtonText: {
    color: "#111",
    fontSize: 15,
    fontWeight: "900",
  },

  disabledButton: {
    opacity: 0.4,
  },

  noActionBox: {
    padding: 15,
    borderRadius: 14,
    backgroundColor: "#181818",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 12,
  },

  noActionText: {
    color: "#888",
    flex: 1,
    fontSize: 13,
    lineHeight: 20,
  },

  spectatorBox: {
    padding: 16,
    backgroundColor: "#151515",
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "#292929",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 14,
  },

  spectatorTitle: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 15,
  },

  spectatorText: {
    color: "#888",
    fontSize: 12,
    lineHeight: 19,
    marginTop: 3,
  },

  winnerCard: {
    backgroundColor: "#17130A",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#806326",
    alignItems: "center",
    padding: 25,
    marginBottom: 14,
  },

  winnerTitle: {
    color: "#D7A94B",
    fontSize: 27,
    fontWeight: "900",
    marginTop: 10,
  },

  winnerText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "800",
    marginTop: 7,
  },

  chatSection: {
    marginTop: 8,
    backgroundColor: "#111",
    borderRadius: 18,
    padding: 15,
    borderWidth: 1,
    borderColor: "#222",
  },

  chatBox: {
    minHeight: 100,
    maxHeight: 360,
    backgroundColor: "#0C0C0C",
    borderRadius: 14,
    padding: 10,
  },

  emptyChat: {
    color: "#666",
    textAlign: "center",
    marginTop: 30,
  },

  messageRow: {
    flexDirection: "row",
    marginBottom: 8,
  },

  myMessageRow: {
    justifyContent: "flex-end",
  },

  messageBubble: {
    maxWidth: "86%",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 13,
    backgroundColor: "#1B1B1B",
  },

  messageUser: {
    color: "#D7A94B",
    fontSize: 11,
    fontWeight: "900",
    marginBottom: 3,
  },

  messageText: {
    color: "#E5E5E5",
    fontSize: 14,
    lineHeight: 20,
  },

  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    marginTop: 10,
    gap: 8,
  },

  messageInput: {
    flex: 1,
    minHeight: 46,
    maxHeight: 100,
    backgroundColor: "#1A1A1A",
    borderRadius: 14,
    paddingHorizontal: 13,
    paddingVertical: 11,
    color: "#fff",
    fontSize: 14,
    borderWidth: 1,
    borderColor: "#292929",
  },

  sendButton: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: "#D7A94B",
    alignItems: "center",
    justifyContent: "center",
  },

  disabledSend: {
    opacity: 0.35,
  },
});
