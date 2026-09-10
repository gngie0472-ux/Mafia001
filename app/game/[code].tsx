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

import { Room, RoomEvent } from "livekit-client";

import {
  advanceMafiaPhase,
  GamePlayer,
  GameRole,
  GameState,
  getGameState,
  getMyRole,
  getRoleAbility,
  getRoleCardData,
  getRoleDescription,
  getRoleLabel,
  getRoleObjective,
  getRolePhase,
  getRoleTeam,
  getTeamLabel,
  submitDayVote,
  submitNightAction,
} from "../../lib/game";

import { getLiveKitToken } from "../../lib/livekit";

import {
  prepareMicrophone,
  stopMicrophoneSession,
} from "../../lib/voice";

import { supabase } from "../../lib/supabase";

/* ============================================================
   TYPES
============================================================ */

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
  role: GameRole | null;
  alive: boolean;
  team?: string | null;

  /* Ghoul */
  ghoul_ability_stolen?: boolean;
  stolen_role?: GameRole | null;
  stolen_ability?: string | null;

  /* Raw database names */
  ghoul_has_copied?: boolean;
  ghoul_copied_role?: GameRole | null;
};

/* ============================================================
   ROLE VISUALS
============================================================ */

const ROLE_ICONS: Partial<
  Record<GameRole, keyof typeof Ionicons.glyphMap>
> = {
  CITIZEN: "person",
  DOCTOR: "medkit",
  DETECTIVE: "search",
  GHOUL: "skull",
  SPY: "eye-outline",
  BODYGUARD: "shield",
  SHERIFF: "locate",
  WITCH: "flask",
  MAFIA: "skull-outline",
  GODFATHER: "diamond",
  CONSIGLIERE: "eye",
  CULT_LEADER: "flame",
  CULTIST: "people",
};

const ROLE_COLORS: Partial<Record<GameRole, string>> = {
  CITIZEN: "#D7A94B",
  DOCTOR: "#3B82F6",
  DETECTIVE: "#22C55E",
  GHOUL: "#A855F7",
  SPY: "#06B6D4",
  BODYGUARD: "#60A5FA",
  SHERIFF: "#10B981",
  WITCH: "#EC4899",
  MAFIA: "#B83232",
  GODFATHER: "#8B1E2D",
  CONSIGLIERE: "#C2410C",
  CULT_LEADER: "#8B5CF6",
  CULTIST: "#7C3AED",
};

const ROLE_EMOJIS: Partial<Record<GameRole, string>> = {
  CITIZEN: "🧑",
  DOCTOR: "🩺",
  DETECTIVE: "🕵️",
  GHOUL: "👹",
  SPY: "🥷",
  BODYGUARD: "🛡️",
  SHERIFF: "⭐",
  WITCH: "🧙",
  MAFIA: "🔪",
  GODFATHER: "👑",
  CONSIGLIERE: "🎭",
  CULT_LEADER: "🔥",
  CULTIST: "☠️",
};

/* ============================================================
   HELPERS
============================================================ */

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

  const timestamp = new Date(value).getTime();

  if (Number.isNaN(timestamp)) return 0;

  return Math.max(
    0,
    Math.ceil((timestamp - Date.now()) / 1000),
  );
}

function errorText(error: any) {
  if (!error) {
    return "حدث خطأ غير معروف.";
  }

  if (typeof error === "string") {
    return error;
  }

  return (
    error?.message ||
    error?.details ||
    error?.hint ||
    "حدث خطأ أثناء تنفيذ العملية."
  );
}

function safeTeamLabel(team?: string | null) {
  try {
    if (team) {
      const value = getTeamLabel(team as any);

      if (value) {
        return value;
      }
    }
  } catch {}

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

function safeActionLabel(action?: string | null) {
  switch (action) {
    case "kill":
      return "قتل";

    case "protect":
      return "حماية";

    case "investigate":
      return "تحقيق";

    case "spy":
      return "تجسس";

    case "guard":
      return "حراسة";

    case "sheriff_check":
      return "فحص";

    case "witch_save":
      return "إنقاذ";

    case "witch_kill":
      return "قتل";

    case "cult_convert":
      return "تحويل";

    case "ghoul":
      return "قدرة الغول";

    default:
      return action || "قدرة";
  }
}

function safeRolePhase(role?: GameRole | null) {
  if (!role) {
    return "غير محدد";
  }

  try {
    return getRolePhase(role);
  } catch {
    return "night";
  }
}

function normalizeRoleInfo(value: any): RoleInfo | null {
  if (!value) {
    return null;
  }

  const rawRole =
    typeof value.role === "string"
      ? value.role
      : null;

  const role =
    rawRole as GameRole | null;

  const copiedRole =
    typeof value.ghoul_copied_role === "string"
      ? (value.ghoul_copied_role as GameRole)
      : typeof value.stolen_role === "string"
        ? (value.stolen_role as GameRole)
        : null;

  const copied =
    Boolean(
      value.ghoul_has_copied ??
        value.ghoul_ability_stolen ??
        false,
    );

  let stolenAbility =
    typeof value.stolen_ability === "string"
      ? value.stolen_ability
      : null;

  /*
   * إذا كان اللاعب غولًا وقد نسخ دورًا،
   * نحصل على قدرة الدور المنسوخ مباشرة
   * من تعريفات اللعبة.
   */
  if (
    !stolenAbility &&
    copied &&
    copiedRole
  ) {
    try {
      const card =
        getRoleCardData(copiedRole);

      stolenAbility =
        card?.action || null;
    } catch {}
  }

  return {
    role,
    alive:
      value.alive !== false,
    team:
      value.team ??
      null,

    ghoul_ability_stolen:
      copied,

    stolen_role:
      copiedRole,

    stolen_ability:
      stolenAbility,

    ghoul_has_copied:
      copied,

    ghoul_copied_role:
      copiedRole,
  };
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
  const uri =
    profile?.avatar_url ||
    player.avatar_url ||
    null;

  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          opacity: player.alive
            ? 1
            : 0.35,
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
          opacity: player.alive
            ? 1
            : 0.35,
        },
      ]}
    >
      <Ionicons
        name="person"
        size={size * 0.42}
        color="#D7A94B"
      />
    </View>
  );
}

/* ============================================================
   SCREEN
============================================================ */

export default function MafiaGameScreen() {
  const router = useRouter();

  const params =
    useLocalSearchParams<{
      code?: string | string[];
    }>();

  const code = Array.isArray(params.code)
    ? params.code[0]
    : params.code;

  const mounted =
    useRef(true);

  const advancing =
    useRef(false);

  const lastAdvanceAt =
    useRef(0);

  /* ============================================================
     LIVEKIT
  ============================================================ */

  const liveKitRoomRef =
    useRef<Room | null>(null);

  const [voiceConnecting, setVoiceConnecting] =
    useState(false);

  const [voiceConnected, setVoiceConnected] =
    useState(false);

  const [microphoneEnabled, setMicrophoneEnabled] =
    useState(false);

  const [voiceError, setVoiceError] =
    useState<string | null>(null);

  const disconnectVoice =
    useCallback(async () => {
      try {
        const room =
          liveKitRoomRef.current;

        liveKitRoomRef.current =
          null;

        if (room) {
          try {
            await room.localParticipant.setMicrophoneEnabled(
              false,
            );
          } catch {}

          try {
            room.disconnect();
          } catch {}
        }
      } catch (error) {
        console.log(
          "disconnect voice:",
          error,
        );
      } finally {
        setMicrophoneEnabled(false);
        setVoiceConnected(false);
        setVoiceConnecting(false);

        try {
          await stopMicrophoneSession();
        } catch {}
      }
    }, []);

  const toggleMicrophone =
    useCallback(async () => {
      if (voiceConnecting) {
        return;
      }

      setVoiceError(null);

      try {
        if (!liveKitRoomRef.current) {
          if (!code) {
            throw new Error(
              "كود الغرفة غير موجود.",
            );
          }

          setVoiceConnecting(true);

          await prepareMicrophone();

          const connection =
            await getLiveKitToken(code);

          if (
            !connection?.token ||
            !connection?.server_url
          ) {
            throw new Error(
              "لم يتم الحصول على بيانات الاتصال الصوتي.",
            );
          }

          const room =
            new Room();

          liveKitRoomRef.current =
            room;

          room.on(
            RoomEvent.Connected,
            () => {
              if (!mounted.current) {
                return;
              }

              setVoiceConnected(true);
              setVoiceConnecting(false);
              setVoiceError(null);
            },
          );

          room.on(
            RoomEvent.Disconnected,
            () => {
              if (!mounted.current) {
                return;
              }

              setVoiceConnected(false);
              setMicrophoneEnabled(false);
            },
          );

          room.on(
            RoomEvent.MediaDevicesError,
            (error) => {
              console.log(
                "LiveKit media device error:",
                error,
              );

              if (mounted.current) {
                setVoiceError(
                  "تعذر الوصول إلى الميكروفون.",
                );
              }
            },
          );

          await room.connect(
            connection.server_url,
            connection.token,
          );

          if (!mounted.current) {
            try {
              room.disconnect();
            } catch {}

            return;
          }

          setVoiceConnected(true);

          await room.localParticipant.setMicrophoneEnabled(
            true,
          );

          if (mounted.current) {
            setMicrophoneEnabled(true);
            setVoiceConnecting(false);
          }

          return;
        }

        const room =
          liveKitRoomRef.current;

        if (!room) {
          return;
        }

        const next =
          !microphoneEnabled;

        const result =
          await room.localParticipant.setMicrophoneEnabled(
            next,
          );

        if (mounted.current) {
          setMicrophoneEnabled(
            result !== false
              ? next
              : false,
          );
        }
      } catch (error) {
        console.error(
          "toggle microphone:",
          error,
        );

        try {
          await disconnectVoice();
        } catch {}

        if (mounted.current) {
          const text =
            errorText(error);

          setVoiceError(text);
          setVoiceConnecting(false);
          setVoiceConnected(false);
          setMicrophoneEnabled(false);

          Alert.alert(
            "تعذر تشغيل الصوت",
            text,
          );
        }
      }
    }, [
      code,
      voiceConnecting,
      microphoneEnabled,
      disconnectVoice,
    ]);

  /* ============================================================
     STATE
  ============================================================ */

  const [roomId, setRoomId] =
    useState<string | null>(null);

  const [userId, setUserId] =
    useState<string | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [state, setState] =
    useState<GameState | null>(null);

  const [role, setRole] =
    useState<RoleInfo | null>(null);

  const [profiles, setProfiles] =
    useState<ProfileMap>({});

  /*
   * مهم جدًا:
   * selectedTarget أصبح room_players.id
   * وليس user_id.
   */
  const [selectedTarget, setSelectedTarget] =
    useState<string | null>(null);

  const [busy, setBusy] =
    useState(false);

  const [seconds, setSeconds] =
    useState(0);

  const [messages, setMessages] =
    useState<Message[]>([]);

  const [message, setMessage] =
    useState("");

  const [sendingMessage, setSendingMessage] =
    useState(false);

  const [showRoleCard, setShowRoleCard] =
    useState(false);

  const scrollRef =
    useRef<ScrollView>(null);

  /* ============================================================
     AUTH
  ============================================================ */

  useEffect(() => {
    mounted.current = true;

    let active = true;

    const loadSession =
      async () => {
        try {
          const {
            data,
            error,
          } =
            await supabase.auth.getSession();

          if (error) {
            console.log(
              "getSession:",
              error,
            );
          }

          if (
            active &&
            mounted.current
          ) {
            setUserId(
              data.session?.user?.id ??
                null,
            );
          }
        } catch (error) {
          console.log(
            "load session:",
            error,
          );
        }
      };

    loadSession();

    const {
      data: {
        subscription,
      },
    } =
      supabase.auth.onAuthStateChange(
        (_event, session) => {
          if (
            active &&
            mounted.current
          ) {
            setUserId(
              session?.user?.id ??
                null,
            );
          }
        },
      );

    return () => {
      active = false;
      mounted.current = false;
      subscription.unsubscribe();
    };
  }, []);

  /* ============================================================
     VOICE CLEANUP
  ============================================================ */

  useEffect(() => {
    return () => {
      mounted.current = false;

      const room =
        liveKitRoomRef.current;

      liveKitRoomRef.current =
        null;

      try {
        if (room) {
          room.localParticipant.setMicrophoneEnabled(
            false,
          );
        }
      } catch {}

      try {
        if (room) {
          room.disconnect();
        }
      } catch {}

      stopMicrophoneSession().catch(
        () => {},
      );
    };
  }, []);

  /* ============================================================
     RESOLVE ROOM
  ============================================================ */

  useEffect(() => {
    let cancelled = false;

    async function resolveRoom() {
      if (!code) {
        if (!cancelled) {
          setLoading(false);
        }

        return;
      }

      try {
        const value =
          code.trim();

        if (isUuid(value)) {
          if (!cancelled) {
            setRoomId(value);
          }

          return;
        }

        const {
          data,
          error,
        } =
          await supabase
            .from("rooms")
            .select("id")
            .eq(
              "code",
              value.toUpperCase(),
            )
            .maybeSingle();

        if (error) {
          throw error;
        }

        if (
          !data?.id ||
          !isUuid(data.id)
        ) {
          throw new Error(
            "الغرفة غير موجودة أو لم تعد متاحة.",
          );
        }

        if (!cancelled) {
          setRoomId(data.id);
        }
      } catch (error) {
        console.error(
          "resolveRoom:",
          error,
        );

        if (!cancelled) {
          Alert.alert(
            "تعذر فتح اللعبة",
            errorText(error),
          );

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

  const loadProfiles =
    useCallback(
      async (
        players: GamePlayer[],
      ) => {
        const ids =
          players
            .map(
              (player) =>
                player.user_id,
            )
            .filter(
              (
                id,
              ): id is string =>
                Boolean(id) &&
                isUuid(id),
            );

        if (!ids.length) {
          if (mounted.current) {
            setProfiles({});
          }

          return;
        }

        try {
          const {
            data,
            error,
          } =
            await supabase
              .from("profiles")
              .select(
                "user_id,username,avatar_url",
              )
              .in(
                "user_id",
                ids,
              );

          if (error) {
            throw error;
          }

          const map: ProfileMap =
            {};

          for (
            const row of data || []
          ) {
            if (row.user_id) {
              map[row.user_id] = {
                username:
                  row.username ||
                  "لاعب",

                avatar_url:
                  row.avatar_url ||
                  null,
              };
            }
          }

          if (mounted.current) {
            setProfiles(map);
          }
        } catch (error) {
          console.log(
            "loadProfiles:",
            error,
          );
        }
      },
      [],
    );

  /* ============================================================
     CHAT
  ============================================================ */

  const loadMessages =
    useCallback(async () => {
      if (!roomId) {
        return;
      }

      const {
        data,
        error,
      } =
        await supabase
          .from("room_messages")
          .select(
            "id,room_id,user_id,message,created_at",
          )
          .eq(
            "room_id",
            roomId,
          )
          .order(
            "created_at",
            {
              ascending: true,
            },
          )
          .limit(100);

      if (error) {
        console.log(
          "loadMessages:",
          error,
        );

        return;
      }

      if (mounted.current) {
        setMessages(
          (data || []) as Message[],
        );
      }
    }, [roomId]);

  /* ============================================================
     GAME
  ============================================================ */

  const loadGame =
    useCallback(
      async (
        initial = false,
      ) => {
        if (!roomId) {
          return;
        }

        try {
          if (
            initial &&
            mounted.current
          ) {
            setLoading(true);
          }

          const next =
            await getGameState(
              roomId,
            );

          if (!mounted.current) {
            return;
          }

          setState(next);

          await loadProfiles(
            next.players || [],
          );

          /*
           * ====================================================
           * SOURCE OF TRUTH
           *
           * status=waiting:
           * لا يوجد دور حتى لو كانت game_phase قديمة.
           *
           * status=finished:
           * لا نعيد جلب دور جديد.
           *
           * status=playing:
           * يمكن إظهار الدور الحقيقي فقط.
           * ====================================================
           */

          const status =
            next.room?.status ||
            "waiting";

          if (
            status !== "playing"
          ) {
            setRole(null);
            setShowRoleCard(false);
          } else {
            try {
              const myRole =
                await getMyRole(
                  roomId,
                );

              const normalized =
                normalizeRoleInfo(
                  myRole,
                );

              if (
                mounted.current &&
                normalized?.role
              ) {
                setRole(normalized);
                setShowRoleCard(true);
              } else if (
                mounted.current
              ) {
                setRole(null);
                setShowRoleCard(false);
              }
            } catch (error) {
              console.log(
                "getMyRole:",
                error,
              );

              if (
                mounted.current
              ) {
                setRole(null);
                setShowRoleCard(false);
              }
            }
          }
        } catch (error) {
          console.error(
            "loadGame:",
            error,
          );

          if (
            initial &&
            mounted.current
          ) {
            Alert.alert(
              "تعذر تحميل اللعبة",
              errorText(error),
            );
          }
        } finally {
          if (
            initial &&
            mounted.current
          ) {
            setLoading(false);
          }
        }
      },
      [
        roomId,
        loadProfiles,
      ],
    );

  useEffect(() => {
    if (!roomId) {
      return;
    }

    loadGame(true);
    loadMessages();
  }, [
    roomId,
    loadGame,
    loadMessages,
  ]);

  /* ============================================================
     REALTIME GAME
  ============================================================ */

  useEffect(() => {
    if (!roomId) {
      return;
    }

    const channel =
      supabase
        .channel(
          `mafia-game-${roomId}`,
        )
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
      supabase.removeChannel(
        channel,
      );
    };
  }, [
    roomId,
    loadGame,
  ]);

  /* ============================================================
     REALTIME CHAT
  ============================================================ */

  useEffect(() => {
    if (!roomId) {
      return;
    }

    const channel =
      supabase
        .channel(
          `mafia-chat-${roomId}`,
        )
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "room_messages",
            filter: `room_id=eq.${roomId}`,
          },
          (payload) => {
            const item =
              payload.new as Message;

            setMessages(
              (current) => {
                if (
                  current.some(
                    (m) =>
                      m.id ===
                      item.id,
                  )
                ) {
                  return current;
                }

                return [
                  ...current,
                  item,
                ];
              },
            );

            setTimeout(() => {
              scrollRef.current?.scrollToEnd(
                {
                  animated: true,
                },
              );
            }, 50);
          },
        )
        .subscribe();

    return () => {
      supabase.removeChannel(
        channel,
      );
    };
  }, [roomId]);

  /* ============================================================
     COUNTDOWN
  ============================================================ */

  useEffect(() => {
    const update = () => {
      const status =
        state?.room?.status;

      const currentPhase =
        status === "playing"
          ? state?.room?.game_phase
          : status === "finished"
            ? "finished"
            : "waiting";

      const value =
        status === "playing"
          ? secondsUntil(
              state?.room
                ?.phase_ends_at,
            )
          : 0;

      if (mounted.current) {
        setSeconds(value);
      }

      if (
        value <= 0 &&
        roomId &&
        currentPhase &&
        currentPhase !== "waiting" &&
        currentPhase !== "finished" &&
        status === "playing" &&
        !advancing.current &&
        Date.now() -
          lastAdvanceAt.current >
          2500
      ) {
        advancing.current =
          true;

        lastAdvanceAt.current =
          Date.now();

        advanceMafiaPhase(roomId)
          .catch((error) => {
            console.log(
              "advance phase:",
              error,
            );
          })
          .finally(() => {
            setTimeout(() => {
              advancing.current =
                false;

              if (
                mounted.current
              ) {
                loadGame(false);
              }
            }, 700);
          });
      }
    };

    update();

    const timer =
      setInterval(
        update,
        1000,
      );

    return () =>
      clearInterval(timer);
  }, [
    state?.room?.status,
    state?.room?.phase_ends_at,
    state?.room?.game_phase,
    roomId,
    loadGame,
  ]);

  /* ============================================================
     CURRENT PLAYER
  ============================================================ */

  const me = useMemo(() => {
    if (!state) {
      return null;
    }

    if (state.me) {
      if (
        !userId ||
        state.me.user_id ===
          userId
      ) {
        return state.me;
      }
    }

    if (userId) {
      const found =
        state.players.find(
          (player) =>
            player.user_id ===
            userId,
        );

      if (found) {
        return found;
      }
    }

    if (state.my_player_id) {
      const found =
        state.players.find(
          (player) =>
            player.id ===
              state.my_player_id ||
            player.user_id ===
              state.my_player_id,
        );

      if (found) {
        return found;
      }
    }

    return null;
  }, [
    state,
    userId,
  ]);

  /* ============================================================
     PHASE
  ============================================================ */

  /*
   * status هو المصدر الأول.
   * هذا يمنع night/day القديمة من الظهور في غرفة waiting.
   */
  const roomStatus =
    state?.room?.status ||
    "waiting";

  const phase =
    roomStatus === "waiting"
      ? "waiting"
      : roomStatus === "finished"
        ? "finished"
        : state?.room?.game_phase ||
          "waiting";

  const gameStarted =
    roomStatus === "playing";

  /* ============================================================
     ROLE
  ============================================================ */

  /*
   * مهم جدًا:
   *
   * لا نقرأ me.role إذا لم تبدأ اللعبة.
   */
  const currentRole: GameRole | null =
    gameStarted
      ? role?.role ??
        me?.role ??
        null
      : null;

  const myAlive =
    role?.alive ??
    me?.alive ??
    true;

  const roleLabel =
    currentRole
      ? getRoleLabel(
          currentRole,
        )
      : "بانتظار توزيع الدور";

  const roleDescription =
    currentRole
      ? getRoleDescription(
          currentRole,
        )
      : "سيظهر دورك هنا بعد بدء اللعبة وتوزيع الأدوار.";

  const roleAbility =
    currentRole
      ? getRoleAbility(
          currentRole,
        )
      : "سيتم عرض قدرتك بعد توزيع الأدوار.";

  const roleObjective =
    currentRole
      ? getRoleObjective(
          currentRole,
        )
      : "انتظر بدء اللعبة.";

  const roleTeam =
    currentRole
      ? role?.team ??
        getRoleTeam(
          currentRole,
        )
      : null;

  const rolePhase =
    currentRole
      ? safeRolePhase(
          currentRole,
        )
      : null;

  const roleColor =
    currentRole
      ? ROLE_COLORS[
          currentRole
        ] || "#D7A94B"
      : "#D7A94B";

  const roleIcon =
    currentRole
      ? ROLE_ICONS[
          currentRole
        ] || "help-circle"
      : "help-circle";

  const roleEmoji =
    currentRole
      ? ROLE_EMOJIS[
          currentRole
        ] || "🎴"
      : "🎴";

  /*
   * قدرة الغول:
   *
   * إذا كان الغول قد نسخ دورًا، نأخذ قدرة
   * الدور المنسوخ من getRoleCardData.
   */
  const stolenRole =
    currentRole === "GHOUL"
      ? role?.stolen_role ??
        role?.ghoul_copied_role ??
        null
      : null;

  const ghoulCopied =
    currentRole === "GHOUL" &&
    Boolean(
      role?.ghoul_ability_stolen ??
        role?.ghoul_has_copied ??
        false,
    );

  const stolenAction =
    ghoulCopied &&
    stolenRole
      ? (() => {
          try {
            return (
              getRoleCardData(
                stolenRole,
              )?.action ??
              null
            );
          } catch {
            return null;
          }
        })()
      : role?.stolen_ability ??
        null;

  const normalAction =
    currentRole
      ? (() => {
          try {
            return (
              getRoleCardData(
                currentRole,
              )?.action ??
              null
            );
          } catch {
            return null;
          }
        })()
      : null;

  const effectiveAction =
    currentRole === "GHOUL" &&
    ghoulCopied &&
    stolenAction
      ? stolenAction
      : normalAction;

  /* ============================================================
     PLAYERS
  ============================================================ */

  const players =
    state?.players || [];

  const alivePlayers =
    useMemo(
      () =>
        players.filter(
          (player) =>
            player.alive,
        ),
      [players],
    );

  /*
   * الأهداف تستخدم player.id
   * وهو room_players.id.
   */
  const targets =
    useMemo(
      () =>
        alivePlayers.filter(
          (player) => {
            if (!me) {
              return true;
            }

            if (
              player.id ===
              me.id
            ) {
              return false;
            }

            if (
              player.user_id ===
              me.user_id
            ) {
              return false;
            }

            if (
              userId &&
              player.user_id ===
                userId
            ) {
              return false;
            }

            return true;
          },
        ),
      [
        alivePlayers,
        me,
        userId,
      ],
    );

  const selectedPlayer =
    useMemo(
      () =>
        players.find(
          (player) =>
            player.id ===
            selectedTarget,
        ) || null,
      [
        players,
        selectedTarget,
      ],
    );

  useEffect(() => {
    if (!selectedTarget) {
      return;
    }

    const exists =
      targets.some(
        (player) =>
          player.id ===
          selectedTarget,
      );

    if (!exists) {
      setSelectedTarget(null);
    }
  }, [
    targets,
    selectedTarget,
  ]);

  /* ============================================================
     VOTE
  ============================================================ */

  const vote =
    useCallback(
      async () => {
        if (!roomId) {
          return;
        }

        if (!myAlive) {
          Alert.alert(
            "لا يمكنك التصويت",
            "أنت ميت.",
          );

          return;
        }

        if (
          !gameStarted ||
          phase !== "day"
        ) {
          Alert.alert(
            "التصويت غير متاح",
            "التصويت متاح خلال النهار فقط.",
          );

          return;
        }

        /*
         * selectedTarget = room_players.id
         */
        if (
          !selectedTarget ||
          !isUuid(selectedTarget)
        ) {
          Alert.alert(
            "اختر لاعبًا",
            "اختر لاعبًا حيًا للتصويت ضده.",
          );

          return;
        }

        const target =
          players.find(
            (player) =>
              player.id ===
                selectedTarget &&
              player.alive &&
              player.user_id !==
                userId,
          );

        if (
          !target ||
          !isUuid(target.id)
        ) {
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
           * FIX:
           * نرسل room_players.id
           * وليس user_id.
           */
          await submitDayVote(
            roomId,
            target.id,
          );

          Alert.alert(
            "تم التصويت",
            `تم تسجيل صوتك ضد ${target.name}.`,
          );

          setSelectedTarget(null);

          await loadGame(false);
        } catch (error) {
          console.error(
            "vote:",
            error,
          );

          Alert.alert(
            "تعذر تسجيل التصويت",
            errorText(error),
          );
        } finally {
          if (
            mounted.current
          ) {
            setBusy(false);
          }
        }
      },
      [
        roomId,
        myAlive,
        gameStarted,
        phase,
        selectedTarget,
        players,
        userId,
        loadGame,
      ],
    );

  /* ============================================================
     NIGHT ACTION
  ============================================================ */

  const performAction =
    useCallback(
      async () => {
        if (!roomId) {
          return;
        }

        if (!myAlive) {
          Alert.alert(
            "لا يمكنك استخدام القدرة",
            "أنت ميت.",
          );

          return;
        }

        if (
          !gameStarted ||
          phase !== "night"
        ) {
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

        if (
          !selectedTarget ||
          !isUuid(selectedTarget)
        ) {
          Alert.alert(
            "اختر هدفًا",
            "اختر لاعبًا حيًا أولًا.",
          );

          return;
        }

        /*
         * الهدف = room_players.id
         */
        const target =
          players.find(
            (player) =>
              player.id ===
                selectedTarget &&
              player.alive &&
              player.user_id !==
                userId,
          );

        if (
          !target ||
          !isUuid(target.id)
        ) {
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
           * FIX:
           * نرسل room_players.id.
           */
          await submitNightAction(
            roomId,
            effectiveAction,
            target.id,
          );

          Alert.alert(
            "تم",
            `تم تنفيذ ${safeActionLabel(
              effectiveAction,
            )} على ${target.name}.`,
          );

          setSelectedTarget(null);

          await loadGame(false);
        } catch (error) {
          console.error(
            "night action:",
            error,
          );

          Alert.alert(
            "تعذر تنفيذ القدرة",
            errorText(error),
          );
        } finally {
          if (
            mounted.current
          ) {
            setBusy(false);
          }
        }
      },
      [
        roomId,
        myAlive,
        gameStarted,
        phase,
        effectiveAction,
        selectedTarget,
        players,
        userId,
        loadGame,
      ],
    );

  /* ============================================================
     CHAT
  ============================================================ */

  const sendMessage =
    useCallback(
      async () => {
        const text =
          message.trim();

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
          const {
            data,
            error,
          } =
            await supabase
              .from(
                "room_messages",
              )
              .insert({
                room_id: roomId,
                user_id: userId,
                message: text,
              })
              .select(
                "id,room_id,user_id,message,created_at",
              )
              .single();

          if (error) {
            throw error;
          }

          if (data) {
            setMessages(
              (current) => {
                if (
                  current.some(
                    (item) =>
                      item.id ===
                      data.id,
                  )
                ) {
                  return current;
                }

                return [
                  ...current,
                  data as Message,
                ];
              },
            );
          }

          setMessage("");

          setTimeout(() => {
            scrollRef.current?.scrollToEnd(
              {
                animated: true,
              },
            );
          }, 50);
        } catch (error) {
          Alert.alert(
            "تعذر إرسال الرسالة",
            errorText(error),
          );
        } finally {
          if (
            mounted.current
          ) {
            setSendingMessage(false);
          }
        }
      },
      [
        roomId,
        userId,
        message,
        sendingMessage,
      ],
    );

  /* ============================================================
     PHASE TEXT
  ============================================================ */

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

  const winner =
    state?.room?.winner;

  /* ============================================================
     LOADING
  ============================================================ */

  if (
    loading &&
    !state
  ) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator
          size="large"
          color="#D7A94B"
        />

        <Text
          style={
            styles.loadingText
          }
        >
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

        <Text
          style={
            styles.loadingText
          }
        >
          تعذر تحميل اللعبة
        </Text>

        <Pressable
          style={
            styles.primaryButton
          }
          onPress={() =>
            roomId &&
            loadGame(true)
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
      {/* HEADER */}

      <View style={styles.header}>
        <Pressable
          onPress={() =>
            router.back()
          }
          style={
            styles.iconButton
          }
        >
          <Ionicons
            name="arrow-back"
            size={23}
            color="#fff"
          />
        </Pressable>

        <View
          style={
            styles.headerCenter
          }
        >
          <Text
            style={styles.roomCode}
          >
            {state.room.code}
          </Text>

          <Text
            style={
              styles.phaseTitle
            }
          >
            {phaseTitle}
          </Text>
        </View>

        <View
          style={
            styles.headerRight
          }
        >
          <Pressable
            onPress={
              toggleMicrophone
            }
            disabled={
              voiceConnecting
            }
            style={[
              styles.micButton,
              microphoneEnabled &&
                styles.micButtonActive,
              voiceConnecting &&
                styles.micButtonBusy,
            ]}
          >
            {voiceConnecting ? (
              <ActivityIndicator
                size="small"
                color="#D7A94B"
              />
            ) : (
              <Ionicons
                name={
                  microphoneEnabled
                    ? "mic"
                    : "mic-off"
                }
                size={19}
                color={
                  microphoneEnabled
                    ? "#111"
                    : "#D7A94B"
                }
              />
            )}
          </Pressable>

          <View
            style={
              styles.timerBox
            }
          >
            <Ionicons
              name="time-outline"
              size={18}
              color="#D7A94B"
            />

            <Text
              style={
                styles.timerText
              }
            >
              {formatTime(seconds)}
            </Text>
          </View>
        </View>
      </View>

      {/* VOICE STATUS */}

      {(voiceConnected ||
        voiceError) && (
        <View
          style={[
            styles.voiceStatus,
            voiceConnected
              ? styles.voiceStatusConnected
              : styles.voiceStatusError,
          ]}
        >
          <Ionicons
            name={
              voiceConnected
                ? microphoneEnabled
                  ? "mic"
                  : "mic-off"
                : "warning-outline"
            }
            size={17}
            color={
              voiceConnected
                ? "#6EE7B7"
                : "#F87171"
            }
          />

          <Text
            style={
              styles.voiceStatusText
            }
          >
            {voiceConnected
              ? microphoneEnabled
                ? "الصوت متصل والميكروفون يعمل"
                : "الصوت متصل والميكروفون مغلق"
              : voiceError}
          </Text>

          {voiceConnected && (
            <Pressable
              onPress={
                disconnectVoice
              }
            >
              <Ionicons
                name="close-circle-outline"
                size={19}
                color="#888"
              />
            </Pressable>
          )}
        </View>
      )}

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={
          styles.content
        }
        keyboardShouldPersistTaps="handled"
      >
        {/* ======================================================
           ROLE CARD
        ====================================================== */}

        {gameStarted &&
        currentRole &&
        showRoleCard ? (
          <View
            style={[
              styles.roleCard,
              {
                borderColor:
                  roleColor,
              },
            ]}
          >
            <View
              style={[
                styles.roleArtwork,
                {
                  borderColor:
                    roleColor,
                  backgroundColor:
                    `${roleColor}12`,
                },
              ]}
            >
              <View
                style={[
                  styles.artGlow,
                  {
                    backgroundColor:
                      `${roleColor}18`,
                  },
                ]}
              />

              <Text
                style={
                  styles.roleEmoji
                }
              >
                {roleEmoji}
              </Text>

              <View
                style={[
                  styles.artIconCircle,
                  {
                    borderColor:
                      roleColor,
                    backgroundColor:
                      `${roleColor}20`,
                  },
                ]}
              >
                <Ionicons
                  name={roleIcon}
                  size={30}
                  color={roleColor}
                />
              </View>

              <View
                style={
                  styles.artLines
                }
              >
                <View
                  style={[
                    styles.artLine,
                    {
                      backgroundColor:
                        roleColor,
                      opacity: 0.25,
                    },
                  ]}
                />

                <View
                  style={[
                    styles.artLineSmall,
                    {
                      backgroundColor:
                        roleColor,
                      opacity: 0.18,
                    },
                  ]}
                />
              </View>
            </View>

            <Text
              style={
                styles.cardCaption
              }
            >
              🎴 بطاقة الشخصية
            </Text>

            <Text
              style={
                styles.yourRole
              }
            >
              دورك
            </Text>

            <Text
              style={[
                styles.roleName,
                {
                  color:
                    roleColor,
                },
              ]}
            >
              {roleLabel}
            </Text>

            <View
              style={[
                styles.teamBadge,
                {
                  borderColor:
                    roleColor,
                  backgroundColor:
                    `${roleColor}12`,
                },
              ]}
            >
              <Text
                style={[
                  styles.teamBadgeText,
                  {
                    color:
                      roleColor,
                  },
                ]}
              >
                {safeTeamLabel(
                  roleTeam,
                )}
              </Text>
            </View>

            <View
              style={
                styles.roleMetaRow
              }
            >
              <View
                style={
                  styles.metaBadge
                }
              >
                <Ionicons
                  name={
                    rolePhase ===
                    "day"
                      ? "sunny"
                      : "moon"
                  }
                  size={15}
                  color="#D7A94B"
                />

                <Text
                  style={
                    styles.metaText
                  }
                >
                  {rolePhase ===
                  "day"
                    ? "النهار"
                    : "الليل"}
                </Text>
              </View>

              <View
                style={
                  styles.metaBadge
                }
              >
                <Ionicons
                  name="shield-checkmark"
                  size={15}
                  color="#D7A94B"
                />

                <Text
                  style={
                    styles.metaText
                  }
                >
                  {myAlive
                    ? "حي"
                    : "ميت"}
                </Text>
              </View>
            </View>

            <View
              style={styles.infoBlock}
            >
              <Text
                style={
                  styles.infoTitle
                }
              >
                📖 الوصف
              </Text>

              <Text
                style={
                  styles.roleDescription
                }
              >
                {roleDescription}
              </Text>
            </View>

            <View
              style={styles.infoBlock}
            >
              <Text
                style={
                  styles.infoTitle
                }
              >
                ⚡ القدرة
              </Text>

              <Text
                style={
                  styles.roleDescription
                }
              >
                {roleAbility}
              </Text>
            </View>

            <View
              style={styles.infoBlock}
            >
              <Text
                style={
                  styles.infoTitle
                }
              >
                🎯 الهدف
              </Text>

              <Text
                style={
                  styles.roleDescription
                }
              >
                {roleObjective}
              </Text>
            </View>

            {currentRole ===
              "GHOUL" &&
              ghoulCopied &&
              stolenRole &&
              stolenAction && (
                <View
                  style={
                    styles.stolenBox
                  }
                >
                  <View
                    style={
                      styles.stolenIcon
                    }
                  >
                    <Ionicons
                      name="flash"
                      size={22}
                      color="#C084FC"
                    />
                  </View>

                  <View
                    style={{
                      flex: 1,
                    }}
                  >
                    <Text
                      style={
                        styles.stolenTitle
                      }
                    >
                      قدرة الغول المسروقة
                    </Text>

                    <Text
                      style={
                        styles.stolenText
                      }
                    >
                      {safeActionLabel(
                        stolenAction,
                      )} من دور{" "}
                      {getRoleLabel(
                        stolenRole,
                      )}
                    </Text>

                    <Text
                      style={
                        styles.stolenHint
                      }
                    >
                      الغول ينتمي إلى
                      فريق المواطنين
                      ويستطيع استخدام
                      القدرة المسروقة
                      مرة واحدة في
                      اللعبة.
                    </Text>
                  </View>
                </View>
              )}

            <Pressable
              onPress={() =>
                setShowRoleCard(false)
              }
              style={
                styles.hideRoleButton
              }
            >
              <Ionicons
                name="eye-off-outline"
                size={16}
                color="#999"
              />

              <Text
                style={
                  styles.hideRoleText
                }
              >
                إخفاء البطاقة
              </Text>
            </Pressable>
          </View>
        ) : gameStarted &&
          currentRole ? (
          <View
            style={
              styles.hiddenRoleCard
            }
          >
            <View
              style={
                styles.hiddenRoleIcon
              }
            >
              <Ionicons
                name="lock-closed"
                size={25}
                color="#D7A94B"
              />
            </View>

            <View
              style={{
                flex: 1,
              }}
            >
              <Text
                style={
                  styles.hiddenRoleTitle
                }
              >
                دورك مخفي
              </Text>

              <Text
                style={
                  styles.hiddenRoleText
                }
              >
                اضغط لإظهار بطاقة
                دورك.
              </Text>
            </View>

            <Pressable
              onPress={() =>
                setShowRoleCard(true)
              }
              style={
                styles.showRoleButton
              }
            >
              <Ionicons
                name="eye"
                size={18}
                color="#D7A94B"
              />

              <Text
                style={
                  styles.showRoleText
                }
              >
                إظهار
              </Text>
            </Pressable>
          </View>
        ) : null}

        {/* PHASE */}

        <View
          style={styles.phaseCard}
        >
          <View
            style={
              styles.phaseHeaderRow
            }
          >
            <View>
              <Text
                style={
                  styles.sectionTitle
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
            </View>

            <View
              style={
                styles.bigTimer
              }
            >
              <Text
                style={
                  styles.bigTimerText
                }
              >
                {formatTime(seconds)}
              </Text>
            </View>
          </View>

          {phase === "night" &&
            effectiveAction && (
              <View
                style={
                  styles.actionInfo
                }
              >
                <Ionicons
                  name="flash"
                  size={20}
                  color="#D7A94B"
                />

                <Text
                  style={
                    styles.actionInfoText
                  }
                >
                  قدرتك الحالية:{" "}
                  <Text
                    style={
                      styles.bold
                    }
                  >
                    {safeActionLabel(
                      effectiveAction,
                    )}
                  </Text>
                </Text>
              </View>
            )}
        </View>

        {/* WINNER */}

        {phase ===
          "finished" && (
          <View
            style={styles.winnerCard}
          >
            <View
              style={
                styles.trophyCircle
              }
            >
              <Ionicons
                name="trophy"
                size={55}
                color="#D7A94B"
              />
            </View>

            <Text
              style={
                styles.winnerTitle
              }
            >
              انتهت اللعبة
            </Text>

            <Text
              style={
                styles.winnerText
              }
            >
              الفائز:{" "}
              {winner
                ? safeTeamLabel(
                    String(winner),
                  )
                : "غير محدد"}
            </Text>
          </View>
        )}

        {/* PLAYERS */}

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

            <View
              style={
                styles.playerCountBadge
              }
            >
              <Text
                style={
                  styles.playerCount
                }
              >
                {alivePlayers.length}/
                {players.length} أحياء
              </Text>
            </View>
          </View>

          {players.map(
            (player) => {
              /*
               * selectedTarget = player.id
               */
              const selected =
                selectedTarget ===
                player.id;

              const isMe =
                player.user_id ===
                  userId ||
                player.user_id ===
                  me?.user_id ||
                player.id ===
                  me?.id;

              const canSelect =
                Boolean(
                  player.alive &&
                    !isMe &&
                    myAlive &&
                    gameStarted &&
                    (phase ===
                      "day" ||
                      (phase ===
                        "night" &&
                        Boolean(
                          effectiveAction,
                        ))),
                );

              return (
                <Pressable
                  key={
                    player.id ||
                    player.user_id
                  }
                  disabled={
                    !canSelect
                  }
                  onPress={() => {
                    if (
                      player.id &&
                      isUuid(
                        player.id,
                      )
                    ) {
                      /*
                       * FIX:
                       * حفظ room_players.id
                       */
                      setSelectedTarget(
                        player.id,
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
                      phase !==
                        "finished" &&
                      styles.disabledPlayer,
                  ]}
                >
                  <Avatar
                    player={player}
                    profile={
                      profiles[
                        player.user_id
                      ]
                    }
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
                        style={
                          styles.playerName
                        }
                      >
                        {profiles[
                          player.user_id
                        ]?.username ||
                          player.name ||
                          "لاعب"}
                      </Text>

                      {isMe && (
                        <View
                          style={
                            styles.meBadge
                          }
                        >
                          <Text
                            style={
                              styles.meBadgeText
                            }
                          >
                            أنت
                          </Text>
                        </View>
                      )}
                    </View>

                    <Text
                      style={
                        styles.playerStatus
                      }
                    >
                      {player.alive
                        ? "حي"
                        : "ميت"}
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
            },
          )}
        </View>

        {/* ACTION */}

        {myAlive &&
          gameStarted &&
          (phase === "day" ||
            phase === "night") && (
            <View
              style={
                styles.actionSection
              }
            >
              {phase === "day" ? (
                <>
                  <Text
                    style={
                      styles.sectionTitle
                    }
                  >
                    التصويت
                  </Text>

                  <Text
                    style={
                      styles.helpText
                    }
                  >
                    اختر لاعبًا حيًا
                    من القائمة ثم
                    سجل تصويتك.
                  </Text>

                  {selectedPlayer && (
                    <View
                      style={
                        styles.selectedTargetBox
                      }
                    >
                      <Ionicons
                        name="person"
                        size={20}
                        color="#D7A94B"
                      />

                      <Text
                        style={
                          styles.selectedTargetText
                        }
                      >
                        الهدف:{" "}
                        <Text
                          style={
                            styles.bold
                          }
                        >
                          {
                            selectedPlayer.name
                          }
                        </Text>
                      </Text>
                    </View>
                  )}

                  <Pressable
                    disabled={
                      busy ||
                      !selectedTarget
                    }
                    onPress={vote}
                    style={[
                      styles.primaryButton,
                      (busy ||
                        !selectedTarget) &&
                        styles.disabledButton,
                    ]}
                  >
                    {busy ? (
                      <ActivityIndicator
                        color="#111"
                      />
                    ) : (
                      <>
                        <Ionicons
                          name="checkmark"
                          size={22}
                          color="#111"
                        />

                        <Text
                          style={
                            styles.primaryButtonText
                          }
                        >
                          تسجيل التصويت
                        </Text>
                      </>
                    )}
                  </Pressable>
                </>
              ) : (
                <>
                  <Text
                    style={
                      styles.sectionTitle
                    }
                  >
                    قدرتك الليلية
                  </Text>

                  {!effectiveAction ? (
                    <View
                      style={
                        styles.noActionBox
                      }
                    >
                      <Ionicons
                        name="moon-outline"
                        size={24}
                        color="#777"
                      />

                      <Text
                        style={
                          styles.noActionText
                        }
                      >
                        لا تملك قدرة
                        ليلية. انتظر
                        بداية النهار.
                      </Text>
                    </View>
                  ) : (
                    <>
                      <Text
                        style={
                          styles.helpText
                        }
                      >
                        اختر لاعبًا ثم
                        اضغط تنفيذ
                        القدرة.
                      </Text>

                      {selectedPlayer && (
                        <View
                          style={
                            styles.selectedTargetBox
                          }
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
                            <Text
                              style={
                                styles.bold
                              }
                            >
                              {
                                selectedPlayer.name
                              }
                            </Text>
                          </Text>
                        </View>
                      )}

                      <Pressable
                        disabled={
                          busy ||
                          !selectedTarget
                        }
                        onPress={
                          performAction
                        }
                        style={[
                          styles.primaryButton,
                          (busy ||
                            !selectedTarget) &&
                            styles.disabledButton,
                        ]}
                      >
                        {busy ? (
                          <ActivityIndicator
                            color="#111"
                          />
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
                              {safeActionLabel(
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

        {!myAlive &&
          gameStarted && (
            <View
              style={
                styles.spectatorBox
              }
            >
              <View
                style={
                  styles.spectatorIcon
                }
              >
                <Ionicons
                  name="eye-outline"
                  size={26}
                  color="#A0A0A0"
                />
              </View>

              <View
                style={{ flex: 1 }}
              >
                <Text
                  style={
                    styles.spectatorTitle
                  }
                >
                  أنت ميت
                </Text>

                <Text
                  style={
                    styles.spectatorText
                  }
                >
                  يمكنك متابعة اللعبة،
                  لكن لا يمكنك
                  التصويت أو استخدام
                  القدرات.
                </Text>
              </View>
            </View>
          )}

        {/* CHAT */}

        <View
          style={styles.chatSection}
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
              الدردشة
            </Text>

            <Ionicons
              name="chatbubbles-outline"
              size={22}
              color="#D7A94B"
            />
          </View>

          <View
            style={styles.chatBox}
          >
            {messages.length ===
            0 ? (
              <Text
                style={
                  styles.emptyChat
                }
              >
                لا توجد رسائل بعد.
              </Text>
            ) : (
              messages.map(
                (item) => {
                  const own =
                    item.user_id ===
                    userId;

                  const profile =
                    profiles[
                      item.user_id
                    ];

                  return (
                    <View
                      key={item.id}
                      style={[
                        styles.messageRow,
                        own &&
                          styles.myMessageRow,
                      ]}
                    >
                      <View
                        style={
                          styles.messageBubble
                        }
                      >
                        <Text
                          style={
                            styles.messageUser
                          }
                        >
                          {own
                            ? "أنت"
                            : profile?.username ||
                              "لاعب"}
                        </Text>

                        <Text
                          style={
                            styles.messageText
                          }
                        >
                          {
                            item.message
                          }
                        </Text>
                      </View>
                    </View>
                  );
                },
              )
            )}
          </View>

          <View
            style={styles.inputRow}
          >
            <TextInput
              value={message}
              onChangeText={
                setMessage
              }
              placeholder="اكتب رسالة..."
              placeholderTextColor="#666"
              style={
                styles.messageInput
              }
              multiline
              maxLength={500}
            />

            <Pressable
              onPress={
                sendMessage
              }
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
    paddingTop:
      Platform.OS === "ios"
        ? 42
        : 18,
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

  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
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

  micButton: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: "#17130C",
    borderWidth: 1,
    borderColor: "#3A3020",
    alignItems: "center",
    justifyContent: "center",
  },

  micButtonActive: {
    backgroundColor: "#6EE7B7",
    borderColor: "#6EE7B7",
  },

  micButtonBusy: {
    opacity: 0.6,
  },

  timerBox: {
    minWidth: 78,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#3A3020",
    backgroundColor: "#17130C",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },

  timerText: {
    color: "#D7A94B",
   
