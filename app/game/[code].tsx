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
  registerGlobals,
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
  submitDayVote,
  submitNightAction,
} from "../../lib/game";

import {
  getLiveKitToken,
} from "../../lib/livekit";

registerGlobals();

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

const ROLE_LABELS: Record<GameRole, string> = {
  MAFIA: "المافيا",
  DOCTOR: "الطبيب",
  DETECTIVE: "المحقق",
  CITIZEN: "المواطن",
};

const ROLE_DESCRIPTIONS: Record<GameRole, string> = {
  MAFIA:
    "أنت من المافيا. اختر لاعبًا واحدًا كل ليلة لمحاولة التخلص منه. تعاون مع فريق المافيا وحافظ على هويتك سرية.",
  DOCTOR:
    "أنت الطبيب. كل ليلة يمكنك حماية لاعب واحد من القتل. اختر بحكمة وحاول إنقاذ أحد اللاعبين.",
  DETECTIVE:
    "أنت المحقق. يمكنك التحقيق مع لاعب واحد فقط كل ليلة لمعرفة هل هو من المافيا أم لا.",
  CITIZEN:
    "أنت مواطن. لا تملك قدرة ليلية خاصة. تحدث مع الآخرين أثناء النهار واستخدم التصويت لاكتشاف المافيا.",
};

const ROLE_ICONS: Record<
  GameRole,
  keyof typeof Ionicons.glyphMap
> = {
  MAFIA: "skull",
  DOCTOR: "medkit",
  DETECTIVE: "search",
  CITIZEN: "people",
};

const ROLE_COLORS: Record<GameRole, string> = {
  MAFIA: "#B83232",
  DOCTOR: "#3B82F6",
  DETECTIVE: "#8B5CF6",
  CITIZEN: "#D7A94B",
};

function getSecondsLeft(
  endsAt: string | null
): number {
  if (!endsAt) {
    return 0;
  }

  const time = new Date(endsAt).getTime();

  if (Number.isNaN(time)) {
    return 0;
  }

  return Math.max(
    0,
    Math.ceil(
      (time - Date.now()) / 1000
    )
  );
}

function formatTime(seconds: number) {
  const safe = Math.max(0, seconds);

  const minutes = Math.floor(
    safe / 60
  );

  const remaining = safe % 60;

  return `${String(minutes).padStart(
    2,
    "0"
  )}:${String(remaining).padStart(
    2,
    "0"
  )}`;
}

function getEventText(
  event: GameState["room"]["last_event"]
) {
  if (!event) {
    return null;
  }

  if (typeof event === "string") {
    return event;
  }

  switch (event.type) {
    case "night_started":
      return "بدأ الليل. الأدوار الليلية تعمل الآن.";

    case "day_started":
      return "انتهى الليل وبدأ النهار. حان وقت الحديث.";

    case "night_kill":
      return "حدثت عملية قتل خلال الليل.";

    case "night_saved":
      return "الطبيب أنقذ اللاعب المستهدف.";

    case "day_vote":
      return "تم تنفيذ نتيجة التصويت.";

    case "day_tie":
      return "حدث تعادل في التصويت ولم يمت أحد.";

    case "winner":
      return event.winner
        ? `انتهت اللعبة. الفائز: ${event.winner}`
        : "انتهت اللعبة.";

    default:
      return null;
  }
}

function PlayerAvatar({
  player,
  profile,
  size = 54,
}: {
  player: GamePlayer;
  profile?: Profile;
  size?: number;
}) {
  const avatar =
    profile?.avatar_url || player.avatar_url;

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
          !player.alive &&
            styles.deadAvatar,
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
        !player.alive &&
          styles.deadAvatar,
      ]}
    >
      <Ionicons
        name="person"
        size={Math.max(
          18,
          size * 0.42
        )}
        color={
          player.alive
            ? "#D7A94B"
            : "#666"
        }
      />
    </View>
  );
}

export default function MafiaGameScreen() {
  const router = useRouter();

  const params =
    useLocalSearchParams<{
      code?: string | string[];
    }>();

  const roomId = Array.isArray(
    params.code
  )
    ? params.code[0]
    : params.code;

  const [loading, setLoading] =
    useState(true);

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
    useState("");

  const [sendingMessage, setSendingMessage] =
    useState(false);

  const [messagesLoading, setMessagesLoading] =
    useState(false);

  const [micEnabled, setMicEnabled] =
    useState(false);

  const [voiceConnected, setVoiceConnected] =
    useState(false);

  const [speakingUsers, setSpeakingUsers] =
    useState<Record<string, boolean>>({});

  const [investigationResult, setInvestigationResult] =
    useState<string | null>(null);

  /*
   * بطاقة الدور.
   *
   * تظهر مرة واحدة عند بداية اللعبة
   * لكل لاعب بشكل خاص.
   */
  const [showRoleCard, setShowRoleCard] =
    useState(false);

  const [roleCardShownForGame, setRoleCardShownForGame] =
    useState<string | null>(null);

  const mountedRef =
    useRef(true);

  const advancingRef =
    useRef(false);

  const lastAdvanceRef =
    useRef(0);

  const voiceRoomRef =
    useRef<Room | null>(null);

  /*
   * ----------------------------------------------------
   * Profiles
   * ----------------------------------------------------
   */

  const loadProfiles = useCallback(
    async (
      players: GamePlayer[]
    ) => {
      const ids = players
        .map(
          (player) =>
            player.user_id
        )
        .filter(Boolean);

      if (!ids.length) {
        setProfiles({});
        return;
      }

      const {
        data,
        error,
      } = await supabase
        .from("profiles")
        .select(
          "user_id, username, avatar_url"
        )
        .in(
          "user_id",
          ids
        );

      if (error) {
        console.error(
          "loadProfiles:",
          error
        );
        return;
      }

      const map: ProfileMap = {};

      for (
        const row of data || []
      ) {
        map[row.user_id] = {
          username:
            row.username ||
            "Player",
          avatar_url:
            row.avatar_url ||
            null,
        };
      }

      if (mountedRef.current) {
        setProfiles(map);
      }
    },
    []
  );

  /*
   * ----------------------------------------------------
   * Messages
   * ----------------------------------------------------
   */

  const loadMessages = useCallback(
    async () => {
      if (!roomId) {
        return;
      }

      setMessagesLoading(true);

      const {
        data,
        error,
      } = await supabase
        .from("room_messages")
        .select(
          "id, room_id, user_id, message, created_at"
        )
        .eq(
          "room_id",
          roomId
        )
        .order(
          "created_at",
          {
            ascending: true,
          }
        )
        .limit(100);

      if (error) {
        console.error(
          "loadMessages:",
          error
        );
      } else if (
        mountedRef.current
      ) {
        setMessages(
          (data || []) as Message[]
        );
      }

      if (mountedRef.current) {
        setMessagesLoading(false);
      }
    },
    [roomId]
  );

  /*
   * ----------------------------------------------------
   * Game state
   * ----------------------------------------------------
   */

  const loadGame = useCallback(
    async (
      showLoader = false
    ) => {
      if (!roomId) {
        return;
      }

      try {
        if (showLoader) {
          setLoading(true);
        }

        const state =
          await getGameState(
            roomId
          );

        if (
          !mountedRef.current
        ) {
          return;
        }

        setGameState(state);

        const role =
          await getMyRole(
            roomId
          );

        if (
          !mountedRef.current
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

        /*
         * بطاقة الدور:
         *
         * نستعمل room id + الجولة الحالية.
         * بذلك تظهر البطاقة عند بداية كل لعبة/جولة توزيع
         * ولا تظهر عند كل تحديث polling.
         */
        const roleCardKey =
          `${state.room.id}-${state.room.game_round}`;

        if (
          state.room.status ===
            "playing" &&
          role.role &&
          roleCardShownForGame !==
            roleCardKey
        ) {
          setRoleCardShownForGame(
            roleCardKey
          );

          setShowRoleCard(true);
        }

        if (
          state.room.status ===
          "finished"
        ) {
          setSelectedTarget(null);
        }
      } catch (error: any) {
        console.error(
          "loadGame:",
          error
        );

        if (
          showLoader &&
          mountedRef.current
        ) {
          Alert.alert(
            "تعذر تحميل اللعبة",
            error?.message ||
              "حدث خطأ أثناء تحميل حالة اللعبة."
          );
        }
      } finally {
        if (
          showLoader &&
          mountedRef.current
        ) {
          setLoading(false);
        }
      }
    },
    [
      roomId,
      loadProfiles,
      roleCardShownForGame,
    ]
  );

  useEffect(() => {
    mountedRef.current = true;

    loadGame(true);
    loadMessages();

    return () => {
      mountedRef.current = false;
    };
  }, [
    loadGame,
    loadMessages,
  ]);

  /*
   * Polling احتياطي.
   */

  useEffect(() => {
    if (!roomId) {
      return;
    }

    const interval =
      setInterval(() => {
        loadGame(false);
      }, 2500);

    return () => {
      clearInterval(
        interval
      );
    };
  }, [
    roomId,
    loadGame,
  ]);

  /*
   * ----------------------------------------------------
   * Realtime
   * ----------------------------------------------------
   */

  useEffect(() => {
    if (!roomId) {
      return;
    }

    const channel =
      supabase
        .channel(
          `mafia-game-${roomId}`
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
          }
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
          }
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "room_messages",
            filter: `room_id=eq.${roomId}`,
          },
          () => {
            loadMessages();
          }
        )
        .subscribe();

    return () => {
      supabase.removeChannel(
        channel
      );
    };
  }, [
    roomId,
    loadGame,
    loadMessages,
  ]);

  /*
   * ----------------------------------------------------
   * Timer
   * ----------------------------------------------------
   */

  useEffect(() => {
    if (!gameState) {
      return;
    }

    setSecondsLeft(
      getSecondsLeft(
        gameState.room
          .phase_ends_at
      )
    );
  }, [gameState]);

  useEffect(() => {
    if (!gameState?.room) {
      return;
    }

    const endsAt =
      gameState.room
        .phase_ends_at;

    if (!endsAt) {
      setSecondsLeft(0);
      return;
    }

    const update =
      () => {
        const remaining =
          getSecondsLeft(
            endsAt
          );

        if (
          mountedRef.current
        ) {
          setSecondsLeft(
            remaining
          );
        }

        if (
          remaining <= 0 &&
          gameState.room.status ===
            "playing" &&
          !advancingRef.current
        ) {
          const now =
            Date.now();

          if (
            now -
              lastAdvanceRef.current >
            1500
          ) {
            lastAdvanceRef.current =
              now;

            advancingRef.current =
              true;

            advanceMafiaPhase(
              roomId!
            )
              .then(() => {
                loadGame(false);
              })
              .catch(
                (error: any) => {
                  const message =
                    error?.message ||
                    "";

                  if (
                    !message.includes(
                      "phase_not_finished"
                    )
                  ) {
                    console.error(
                      "advance phase:",
                      error
                    );
                  }
                }
              )
              .finally(() => {
                advancingRef.current =
                  false;
              });
          }
        }
      };

    update();

    const interval =
      setInterval(
        update,
        500
      );

    return () => {
      clearInterval(
        interval
      );
    };
  }, [
    gameState?.room
      ?.phase_ends_at,
    gameState?.room?.status,
    roomId,
    loadGame,
  ]);

  /*
   * ----------------------------------------------------
   * LiveKit voice
   * ----------------------------------------------------
   */

  useEffect(() => {
    let cancelled = false;

    async function connectVoice() {
      if (!roomId) {
        return;
      }

      try {
        const result =
          await getLiveKitToken(
            roomId
          );

        if (cancelled) {
          return;
        }

        await AudioSession.startAudioSession();

        const room =
          new Room();

        voiceRoomRef.current =
          room;

        room.on(
          RoomEvent.ActiveSpeakersChanged,
          (speakers) => {
            const map: Record<
              string,
              boolean
            > = {};

            for (
              const participant of speakers
            ) {
              map[
                participant.identity
              ] = true;
            }

            if (
              mountedRef.current
            ) {
              setSpeakingUsers(
                map
              );
            }
          }
        );

        room.on(
          RoomEvent.Disconnected,
          () => {
            if (
              mountedRef.current
            ) {
              setVoiceConnected(
                false
              );
              setMicEnabled(
                false
              );
            }
          }
        );

        await room.connect(
          result.server_url,
          result.token
        );

        if (
          cancelled
        ) {
          await room.disconnect();
          return;
        }

        await room.localParticipant.setMicrophoneEnabled(
          false
        );

        if (
          mountedRef.current
        ) {
          setVoiceConnected(
            true
          );
        }
      } catch (error) {
        console.error(
          "LiveKit connection:",
          error
        );

        if (
          mountedRef.current
        ) {
          setVoiceConnected(
            false
          );
        }
      }
    }

    connectVoice();

    return () => {
      cancelled = true;

      const room =
        voiceRoomRef.current;

      voiceRoomRef.current =
        null;

      if (room) {
        room.disconnect();
      }

      AudioSession.stopAudioSession().catch(
        () => {}
      );
    };
  }, [roomId]);

  /*
   * يمنع الميكروفون خارج النهار.
   */

  useEffect(() => {
    const room =
      voiceRoomRef.current;

    const allowed =
      !!gameState &&
      gameState.room.status ===
        "playing" &&
      gameState.room.game_phase ===
        "day" &&
      myAlive;

    if (
      room &&
      !allowed &&
      micEnabled
    ) {
      room.localParticipant
        .setMicrophoneEnabled(
          false
        )
        .catch(() => {});

      setMicEnabled(false);
    }
  }, [
    gameState?.room?.status,
    gameState?.room?.game_phase,
    myAlive,
    micEnabled,
  ]);

  const toggleMicrophone =
    async () => {
      const room =
        voiceRoomRef.current;

      if (!room) {
        Alert.alert(
          "الصوت",
          "لم يتم الاتصال بخدمة الصوت بعد."
        );
        return;
      }

      if (
        !gameState ||
        gameState.room.game_phase !==
          "day" ||
        !myAlive
      ) {
        Alert.alert(
          "الميكروفون مغلق",
          "يمكنك استخدام الميكروفون أثناء النهار فقط."
        );
        return;
      }

      try {
        const next =
          !micEnabled;

        await room.localParticipant.setMicrophoneEnabled(
          next
        );

        setMicEnabled(next);
      } catch (error) {
        console.error(
          "microphone:",
          error
        );

        Alert.alert(
          "الميكروفون",
          "تعذر تشغيل الميكروفون."
        );
      }
    };

  /*
   * ----------------------------------------------------
   * Targets
   * ----------------------------------------------------
   */

  const alivePlayers =
    useMemo(() => {
      return (
        gameState?.players.filter(
          (player) =>
            player.alive
        ) || []
      );
    }, [gameState]);

  const selectablePlayers =
    useMemo(() => {
      if (!gameState) {
        return [];
      }

      return gameState.players.filter(
        (player) => {
          if (!player.alive) {
            return false;
          }

          if (
            player.id ===
            gameState.my_player_id
          ) {
            return false;
          }

          return true;
        }
      );
    }, [gameState]);

  /*
   * ----------------------------------------------------
   * Night action
   * ----------------------------------------------------
   */

  const handleNightAction =
    async () => {
      if (
        !roomId ||
        !gameState ||
        !myRole ||
        !selectedTarget
      ) {
        return;
      }

      if (
        gameState.room.game_phase !==
        "night"
      ) {
        return;
      }

      if (!myAlive) {
        return;
      }

      let action:
        | "kill"
        | "protect"
        | "investigate"
        | null = null;

      if (
        myRole === "MAFIA"
      ) {
        action = "kill";
      } else if (
        myRole === "DOCTOR"
      ) {
        action = "protect";
      } else if (
        myRole === "DETECTIVE"
      ) {
        action = "investigate";
      }

      if (!action) {
        return;
      }

      try {
        setBusy(true);

        const result =
          await submitNightAction(
            roomId,
            action,
            selectedTarget
          );

        if (
          action ===
          "investigate"
        ) {
          const isMafia =
            result ===
              true ||
            result?.is_mafia ===
              true ||
            result?.mafia ===
              true;

          setInvestigationResult(
            isMafia
              ? "نتيجة التحقيق: هذا اللاعب من المافيا."
              : "نتيجة التحقيق: هذا اللاعب ليس من المافيا."
          );
        } else {
          Alert.alert(
            "تم",
            action ===
              "kill"
              ? "تم تسجيل هدف المافيا."
              : "تم تسجيل الحماية."
          );
        }

        setSelectedTarget(null);

        await loadGame(false);
      } catch (error: any) {
        console.error(
          "night action:",
          error
        );

        Alert.alert(
          "تعذر تنفيذ العملية",
          error?.message ||
            "لا يمكن تنفيذ هذا الإجراء الآن."
        );
      } finally {
        setBusy(false);
      }
    };

  /*
   * ----------------------------------------------------
   * Day vote
   * ----------------------------------------------------
   */

  const handleVote =
    async () => {
      if (
        !roomId ||
        !gameState ||
        !selectedTarget
      ) {
        return;
      }

      if (
        gameState.room.game_phase !==
        "day"
      ) {
        return;
      }

      if (!myAlive) {
        return;
      }

      try {
        setBusy(true);

        await submitDayVote(
          roomId,
          selectedTarget
        );

        setSelectedTarget(
          null
        );

        Alert.alert(
          "تم التصويت",
          "تم تسجيل صوتك بنجاح."
        );

        await loadGame(false);
      } catch (error: any) {
        console.error(
          "vote:",
          error
        );

        Alert.alert(
          "تعذر التصويت",
          error?.message ||
            "لا يمكن التصويت الآن."
        );
      } finally {
        setBusy(false);
      }
    };

  /*
   * ----------------------------------------------------
   * Chat
   * ----------------------------------------------------
   */

  const sendMessage =
    async () => {
      const text =
        messageText.trim();

      if (
        !roomId ||
        !text ||
        sendingMessage
      ) {
        return;
      }

      if (
        !gameState ||
        gameState.room.game_phase !==
          "day"
      ) {
        Alert.alert(
          "الدردشة مغلقة",
          "الدردشة متاحة أثناء النهار فقط."
        );
        return;
      }

      if (!myAlive) {
        Alert.alert(
          "أنت ميت",
          "لا يمكنك إرسال رسائل بعد موتك."
        );
        return;
      }

      try {
        setSendingMessage(
          true
        );

        const {
          error,
        } = await supabase.rpc(
          "send_room_message",
          {
            p_room_id: roomId,
            p_message: text,
          }
        );

        if (error) {
          throw error;
        }

        setMessageText("");

        await loadMessages();
      } catch (error: any) {
        console.error(
          "sendMessage:",
          error
        );

        Alert.alert(
          "تعذر إرسال الرسالة",
          error?.message ||
            "حدث خطأ أثناء إرسال الرسالة."
        );
      } finally {
        setSendingMessage(
          false
        );
      }
    };

  /*
   * ----------------------------------------------------
   * Derived UI
   * ----------------------------------------------------
   */

  const phase =
    gameState?.room.game_phase;

  const isPlaying =
    gameState?.room.status ===
    "playing";

  const isFinished =
    gameState?.room.status ===
    "finished";

  const eventText =
    getEventText(
      gameState?.room.last_event ||
        null
    );

  const canChat =
    isPlaying &&
    phase === "day" &&
    myAlive;

  const canVoice =
    isPlaying &&
    phase === "day" &&
    myAlive;

  const canNightAction =
    isPlaying &&
    phase === "night" &&
    myAlive &&
    !!myRole &&
    (myRole === "MAFIA" ||
      myRole === "DOCTOR" ||
      myRole ===
        "DETECTIVE");

  const canVote =
    isPlaying &&
    phase === "day" &&
    myAlive;

  /*
   * ----------------------------------------------------
   * Role card
   * ----------------------------------------------------
   */

  const closeRoleCard =
    () => {
      setShowRoleCard(
        false
      );
      setSelectedTarget(
        null
      );
    };

  /*
   * ----------------------------------------------------
   * Loading
   * ----------------------------------------------------
   */

  if (loading) {
    return (
      <View
        style={styles.loading}
      >
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

  if (!gameState) {
    return (
      <View
        style={styles.loading}
      >
        <Ionicons
          name="warning"
          size={50}
          color="#D7A94B"
        />

        <Text
          style={
            styles.loadingText
          }
        >
          تعذر تحميل حالة اللعبة
        </Text>

        <Pressable
          style={
            styles.goldButton
          }
          onPress={() =>
            loadGame(true)
          }
        >
          <Text
            style={
              styles.goldButtonText
            }
          >
            إعادة المحاولة
          </Text>
        </Pressable>
      </View>
    );
  }

  /*
   * ----------------------------------------------------
   * MAIN SCREEN
   * ----------------------------------------------------
   */

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={
        Platform.OS === "ios"
          ? "padding"
          : undefined
      }
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={
          styles.content
        }
        keyboardShouldPersistTaps="handled"
      >
        {/* HEADER */}

        <View
          style={styles.header}
        >
          <View>
            <Text
              style={
                styles.title
              }
            >
              Mafia Night
            </Text>

            <Text
              style={
                styles.subtitle
              }
            >
              الجولة{" "}
              {gameState.room.game_round}
            </Text>
          </View>

          <View
            style={
              styles.headerRight
            }
          >
            <View
              style={
                styles.connectionDot
              }
            />

            <Text
              style={
                styles.connectionText
              }
            >
              متصل
            </Text>
          </View>
        </View>

        {/* PHASE / TIMER */}

        <View
          style={
            styles.phaseCard
          }
        >
          <View>
            <Text
              style={
                styles.phaseSmall
              }
            >
              المرحلة الحالية
            </Text>

            <Text
              style={
                styles.phaseTitle
              }
            >
              {phase === "night"
                ? "🌙 الليل"
                : "☀️ النهار"}
            </Text>
          </View>

          <View
            style={
              styles.timerBox
            }
          >
            <Text
              style={
                styles.timerLabel
              }
            >
              الوقت المتبقي
            </Text>

            <Text
              style={
                styles.timer
              }
            >
              {formatTime(
                secondsLeft
              )}
            </Text>
          </View>
        </View>

        {/* EVENT */}

        {eventText && (
          <View
            style={
              styles.eventBox
            }
          >
            <Ionicons
              name="information-circle"
              size={22}
              color="#D7A94B"
            />

            <Text
              style={
                styles.eventText
              }
            >
              {eventText}
            </Text>
          </View>
        )}

        {/* MY ROLE MINI CARD */}

        {myRole && (
          <View
            style={[
              styles.myRoleMini,
              {
                borderColor:
                  ROLE_COLORS[
                    myRole
                  ],
              },
            ]}
          >
            <View
              style={[
                styles.roleIconSmall,
                {
                  backgroundColor:
                    ROLE_COLORS[
                      myRole
                    ],
                },
              ]}
            >
              <Ionicons
                name={
                  ROLE_ICONS[
                    myRole
                  ]
                }
                size={22}
                color="#fff"
              />
            </View>

            <View
              style={
                styles.flex
              }
            >
              <Text
                style={
                  styles.myRoleLabel
                }
              >
                دورك
              </Text>

              <Text
                style={
                  styles.myRoleValue
                }
              >
                {ROLE_LABELS[
                  myRole
                ]}
              </Text>
            </View>

            {!myAlive && (
              <View
                style={
                  styles.deadBadge
                }
              >
                <Text
                  style={
                    styles.deadBadgeText
                  }
                >
                  ☠ ميت
                </Text>
              </View>
            )}
          </View>
        )}

        {/* NIGHT ACTIONS */}

        {phase === "night" &&
          myAlive && (
            <View
              style={
                styles.section
              }
            >
              <Text
                style={
                  styles.sectionTitle
                }
              >
                {myRole ===
                "MAFIA"
                  ? "🔪 اختر ضحيتك"
                  : myRole ===
                    "DOCTOR"
                  ? "🩺 اختر من تريد حمايته"
                  : myRole ===
                    "DETECTIVE"
                  ? "🕵️ اختر شخصًا للتحقيق"
                  : "🌙 الليل"}
              </Text>

              {myRole ===
                "CITIZEN" && (
                <View
                  style={
                    styles.infoCard
                  }
                >
                  <Text
                    style={
                      styles.infoText
                    }
                  >
                    أنت مواطن. لا يوجد لديك إجراء
                    ليلي. انتظر حتى يبدأ النهار.
                  </Text>
                </View>
              )}

              {canNightAction && (
                <>
                  <PlayerList
                    players={
                      selectablePlayers
                    }
                    profiles={
                      profiles
                    }
                    selectedTarget={
                      selectedTarget
                    }
                    onSelect={
                      setSelectedTarget
                    }
                    speakingUsers={
                      speakingUsers
                    }
                  />

                  <Pressable
                    style={[
                      styles.actionButton,
                      (!selectedTarget ||
                        busy) &&
                        styles.disabledButton,
                    ]}
                    disabled={
                      !selectedTarget ||
                      busy
                    }
                    onPress={
                      handleNightAction
                    }
                  >
                    {busy ? (
                      <ActivityIndicator
                        color="#fff"
                      />
                    ) : (
                      <Text
                        style={
                          styles.actionButtonText
                        }
                      >
                        {myRole ===
                        "MAFIA"
                          ? "تأكيد القتل"
                          : myRole ===
                            "DOCTOR"
                          ? "تأكيد الحماية"
                          : "تحقيق مع اللاعب"}
                      </Text>
                    )}
                  </Pressable>
                </>
              )}

              {investigationResult && (
                <View
                  style={
                    styles.investigationCard
                  }
                >
                  <Ionicons
                    name="search-circle"
                    size={28}
                    color="#A78BFA"
                  />

                  <Text
                    style={
                      styles.investigationText
                    }
                  >
                    {
                      investigationResult
                    }
                  </Text>
                </View>
              )}
            </View>
          )}

        {/* DAY */}

        {phase === "day" && (
          <>
            <View
              style={
                styles.section
              }
            >
              <Text
                style={
                  styles.sectionTitle
                }
              >
                ☀️ اللاعبون
              </Text>

              <PlayerList
                players={
                  alivePlayers
                }
                profiles={
                  profiles
                }
                selectedTarget={
                  canVote
                    ? selectedTarget
                    : null
                }
                onSelect={
                  canVote
                    ? setSelectedTarget
                    : undefined
                }
                speakingUsers={
                  speakingUsers
                }
              />

              {canVote && (
                <Pressable
                  style={[
                    styles.actionButton,
                    (!selectedTarget ||
                      busy) &&
                      styles.disabledButton,
                  ]}
                  disabled={
                    !selectedTarget ||
                    busy
                  }
                  onPress={
                    handleVote
                  }
                >
                  {busy ? (
                    <ActivityIndicator
                      color="#fff"
                    />
                  ) : (
                    <Text
                      style={
                        styles.actionButtonText
                      }
                    >
                      🗳️ تأكيد التصويت
                    </Text>
                  )}
                </Pressable>
              )}
            </View>

            {/* VOICE */}

            <View
              style={
                styles.section
              }
            >
              <View
                style={
                  styles.voiceHeader
                }
              >
                <View>
                  <Text
                    style={
                      styles.sectionTitle
                    }
                  >
                    🎙️ الصوت المباشر
                  </Text>

                  <Text
                    style={
                      styles.voiceHint
                    }
                  >
                    {voiceConnected
                      ? "متصل بالصوت"
                      : "جاري الاتصال..."}
                  </Text>
                </View>

                <Pressable
                  style={[
                    styles.micButton,
                    !canVoice &&
                      styles.disabledButton,
                    micEnabled &&
                      styles.micActive,
                  ]}
                  disabled={!canVoice}
                  onPress={
                    toggleMicrophone
                  }
                >
                  <Ionicons
                    name={
                      micEnabled
                        ? "mic"
                        : "mic-off"
                    }
                    size={25}
                    color="#fff"
                  />
                </Pressable>
              </View>

              {!canVoice && (
                <Text
                  style={
                    styles.voiceDisabled
                  }
                >
                  الصوت متاح للاعبين الأحياء
                  أثناء النهار فقط.
                </Text>
              )}

              {voiceConnected &&
                Object.keys(
                  speakingUsers
                ).length > 0 && (
                  <View
                    style={
                      styles.speakingBox
                    }
                  >
                    <Ionicons
                      name="volume-high"
                      size={18}
                      color="#5EEAD4"
                    />

                    <Text
                      style={
                        styles.speakingText
                      }
                    >
                      هناك لاعب يتحدث الآن
                    </Text>
                  </View>
                )}
            </View>

            {/* CHAT */}

            <View
              style={
                styles.section
              }
            >
              <Text
                style={
                  styles.sectionTitle
                }
              >
                💬 دردشة النهار
              </Text>

              <View
                style={
                  styles.chatBox
                }
              >
                {messagesLoading &&
                messages.length ===
                  0 ? (
                  <ActivityIndicator
                    color="#D7A94B"
                  />
                ) : messages.length ===
                  0 ? (
                  <Text
                    style={
                      styles.emptyText
                    }
                  >
                    لا توجد رسائل بعد.
                  </Text>
                ) : (
                  messages.map(
                    (message) => {
                      const profile =
                        profiles[
                          message.user_id
                        ];

                      return (
                        <View
                          key={
                            message.id
                          }
                          style={
                            styles.messageRow
                          }
                        >
                          <Text
                            style={
                              styles.messageName
                            }
                          >
                            {profile?.username ||
                              "Player"}
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
                      );
                    }
                  )
                )}
              </View>

              {canChat && (
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
                    placeholder="اكتب رسالتك..."
                    placeholderTextColor="#777"
                    style={
                      styles.chatInput
                    }
                    multiline
                    maxLength={500}
                    textAlign="right"
                  />

                  <Pressable
                    style={[
                      styles.sendButton,
                      (!messageText.trim() ||
                        sendingMessage) &&
                        styles.disabledButton,
                    ]}
                    disabled={
                      !messageText.trim() ||
                      sendingMessage
                    }
                    onPress={
                      sendMessage
                    }
                  >
                    <Ionicons
                      name="send"
                      size={21}
                      color="#fff"
                    />
                  </Pressable>
                </View>
              )}

              {!canChat && (
                <Text
                  style={
                    styles.voiceDisabled
                  }
                >
                  الدردشة مغلقة حاليًا.
                </Text>
              )}
            </View>
          </>
        )}

        {/* DEAD PLAYERS */}

        <View
          style={
            styles.section
          }
        >
          <Text
            style={
              styles.sectionTitle
            }
          >
            ☠️ حالة اللاعبين
          </Text>

          {gameState.players.map(
            (player) => {
              const profile =
                profiles[
                  player.user_id
                ];

              const speaking =
                !!speakingUsers[
                  player.user_id
                ];

              return (
                <View
                  key={
                    player.id
                  }
                  style={[
                    styles.playerRow,
                    !player.alive &&
                      styles.deadPlayerRow,
                    speaking &&
                      styles.speakingPlayer,
                  ]}
                >
                  <PlayerAvatar
                    player={
                      player
                    }
                    profile={
                      profile
                    }
                    size={46}
                  />

                  <View
                    style={
                      styles.flex
                    }
                  >
                    <Text
                      style={
                        styles.playerName
                      }
                    >
                      {profile?.username ||
                        player.name ||
                        "Player"}
                    </Text>

                    <Text
                      style={
                        styles.playerStatus
                      }
                    >
                      {player.alive
                        ? "حي"
                        : "☠️ مات"}
                    </Text>
                  </View>

                  {speaking && (
                    <Ionicons
                      name="mic"
                      size={21}
                      color="#5EEAD4"
                    />
                  )}
                </View>
              );
            }
          )}
        </View>

        {/* WINNER */}

        {isFinished && (
          <View
            style={
              styles.winnerCard
            }
          >
            <Ionicons
              name="trophy"
              size={55}
              color="#D7A94B"
            />

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
              {gameState.room.winner
                ? `الفائز: ${gameState.room.winner}`
                : "تم تحديد الفائز."}
            </Text>

            <Pressable
              style={
                styles.goldButton
              }
              onPress={() =>
                router.replace(
                  "/rooms"
                )
              }
            >
              <Text
                style={
                  styles.goldButtonText
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

      {/* =================================================
          PRIVATE ROLE CARD
          ================================================= */}

      {showRoleCard &&
        myRole && (
          <View
            style={
              styles.roleOverlay
            }
          >
            <View
              style={[
                styles.roleCard,
                {
                  borderColor:
                    ROLE_COLORS[
                      myRole
                    ],
                },
              ]}
            >
              <View
                style={
                  styles.roleTopIcon
                }
              >
                <Ionicons
                  name="shield-checkmark"
                  size={22}
                  color="#D7A94B"
                />
              </View>

              <Text
                style={
                  styles.secretTitle
                }
              >
                🔒 دورك السري
              </Text>

              <Text
                style={
                  styles.secretSubtitle
                }
              >
                لا تشارك هذه البطاقة مع الآخرين
              </Text>

              <View
                style={[
                  styles.largeRoleIcon,
                  {
                    backgroundColor:
                      ROLE_COLORS[
                        myRole
                      ],
                  },
                ]}
              >
                <Ionicons
                  name={
                    ROLE_ICONS[
                      myRole
                    ]
                  }
                  size={70}
                  color="#fff"
                />
              </View>

              <Text
                style={
                  styles.roleCardRole
                }
              >
                {ROLE_LABELS[
                  myRole
                ]}
              </Text>

              <Text
                style={
                  styles.roleCardPlayer
                }
              >
                {profiles[
                  gameState.my_player_id ||
                    ""
                ]?.username ||
                  "اللاعب"}
              </Text>

              {gameState.my_player_id &&
                (() => {
                  const me =
                    gameState.players.find(
                      (player) =>
                        player.id ===
                        gameState.my_player_id
                    );

                  const profile =
                    me
                      ? profiles[
                          me.user_id
                        ]
                      : undefined;

                  return me ? (
                    <PlayerAvatar
                      player={me}
                      profile={
                        profile
                      }
                      size={74}
                    />
                  ) : null;
                })()}

              <View
                style={
                  styles.roleDescriptionBox
                }
              >
                <Text
                  style={
                    styles.roleDescriptionTitle
                  }
                >
                  مهمتك
                </Text>

                <Text
                  style={
                    styles.roleDescription
                  }
                >
                  {
                    ROLE_DESCRIPTIONS[
                      myRole
                    ]
                  }
                </Text>
              </View>

              <Pressable
                style={[
                  styles.roleContinueButton,
                  {
                    backgroundColor:
                      ROLE_COLORS[
                        myRole
                      ],
                  },
                ]}
                onPress={
                  closeRoleCard
                }
              >
                <Text
                  style={
                    styles.roleContinueText
                  }
                >
                  فهمت، ابدأ اللعبة
                </Text>

                <Ionicons
                  name="arrow-back"
                  size={20}
                  color="#fff"
                />
              </Pressable>
            </View>
          </View>
        )}
    </KeyboardAvoidingView>
  );
}

/*
 * ======================================================
 * PLAYER LIST
 * ======================================================
 */

function PlayerList({
  players,
  profiles,
  selectedTarget,
  onSelect,
  speakingUsers,
}: {
  players: GamePlayer[];
  profiles: ProfileMap;
  selectedTarget: string | null;
  onSelect?: (
    id: string
  ) => void;
  speakingUsers: Record<
    string,
    boolean
  >;
}) {
  return (
    <View>
      {players.map(
        (player) => {
          const profile =
            profiles[
              player.user_id
            ];

          const selected =
            selectedTarget ===
            player.id;

          const speaking =
            !!speakingUsers[
              player.user_id
            ];

          return (
            <Pressable
              key={
                player.id
              }
              disabled={!onSelect}
              onPress={() =>
                onSelect?.(
                  player.id
                )
              }
              style={[
                styles.targetRow,
                selected &&
                  styles.selectedTarget,
                speaking &&
                  styles.speakingPlayer,
              ]}
            >
              <PlayerAvatar
                player={
                  player
                }
                profile={
                  profile
                }
                size={50}
              />

              <View
                style={
                  styles.flex
                }
              >
                <Text
                  style={
                    styles.targetName
                  }
                >
                  {profile?.username ||
                    player.name ||
                    "Player"}
                </Text>

                <Text
                  style={
                    styles.targetStatus
                  }
                >
                  {speaking
                    ? "🎙️ يتحدث"
                    : "حي"}
                </Text>
              </View>

              {selected && (
                <Ionicons
                  name="checkmark-circle"
                  size={30}
                  color="#D7A94B"
                />
              )}
            </Pressable>
          );
        }
      )}

      {players.length ===
        0 && (
        <Text
          style={
            styles.emptyText
          }
        >
          لا يوجد لاعبون متاحون.
        </Text>
      )}
    </View>
  );
}

/*
 * ======================================================
 * STYLES
 * ======================================================
 */

const styles =
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor:
        "#090A0F",
    },

    content: {
      padding: 16,
      paddingBottom: 40,
    },

    loading: {
      flex: 1,
      backgroundColor:
        "#090A0F",
      justifyContent:
        "center",
      alignItems:
        "center",
      padding: 25,
    },

    loadingText: {
      color: "#fff",
      fontSize: 17,
      marginTop: 15,
      textAlign: "center",
    },

    header: {
      flexDirection:
        "row",
      alignItems:
        "center",
      justifyContent:
        "space-between",
      marginBottom: 18,
    },

    title: {
      color: "#D7A94B",
      fontSize: 27,
      fontWeight: "900",
    },

    subtitle: {
      color: "#777",
      marginTop: 3,
      fontSize: 13,
    },

    headerRight: {
      flexDirection:
        "row",
      alignItems:
        "center",
      gap: 6,
    },

    connectionDot: {
      width: 9,
      height: 9,
      borderRadius: 5,
      backgroundColor:
        "#35D07F",
    },

    connectionText: {
      color: "#35D07F",
      fontSize: 12,
    },

    phaseCard: {
      backgroundColor:
        "#11131A",
      borderRadius: 18,
      padding: 18,
      borderWidth: 1,
      borderColor:
        "#272A34",
      flexDirection:
        "row",
      justifyContent:
        "space-between",
      alignItems:
        "center",
      marginBottom: 12,
    },

    phaseSmall: {
      color: "#777",
      fontSize: 12,
      marginBottom: 5,
    },

    phaseTitle: {
      color: "#fff",
      fontSize: 23,
      fontWeight: "900",
    },

    timerBox: {
      alignItems:
        "flex-end",
    },

    timerLabel: {
      color: "#777",
      fontSize: 11,
    },

    timer: {
      color: "#D7A94B",
      fontSize: 27,
      fontWeight: "900",
      marginTop: 2,
    },

    eventBox: {
      flexDirection:
        "row",
      alignItems:
        "center",
      backgroundColor:
        "#15130D",
      borderWidth: 1,
      borderColor:
        "#5A471F",
      borderRadius: 14,
      padding: 13,
      marginBottom: 12,
      gap: 9,
    },

    eventText: {
      color: "#E8D9AE",
      flex: 1,
      textAlign: "right",
      lineHeight: 20,
    },

    myRoleMini: {
      flexDirection:
        "row",
      alignItems:
        "center",
      padding: 12,
      backgroundColor:
        "#11131A",
      borderRadius: 15,
      borderWidth: 1,
      marginBottom: 15,
      gap: 11,
    },

    roleIconSmall: {
      width: 42,
      height: 42,
      borderRadius: 12,
      justifyContent:
        "center",
      alignItems:
        "center",
    },

    myRoleLabel: {
      color: "#777",
      fontSize: 11,
      textAlign: "right",
    },

    myRoleValue: {
      color: "#fff",
      fontSize: 17,
      fontWeight: "800",
      textAlign: "right",
      marginTop: 2,
    },

    flex: {
      flex: 1,
    },

    deadBadge: {
      backgroundColor:
        "#35181A",
      borderRadius: 8,
      paddingHorizontal: 9,
      paddingVertical: 5,
    },

    deadBadgeText: {
      color: "#F87171",
      fontSize: 12,
      fontWeight: "800",
    },

    section: {
      marginTop: 10,
      marginBottom: 18,
    },

    sectionTitle: {
      color: "#fff",
      fontSize: 19,
      fontWeight: "900",
      textAlign: "right",
      marginBottom: 11,
    },

    infoCard: {
      backgroundColor:
        "#11131A",
      borderRadius: 14,
      padding: 15,
      borderWidth: 1,
      borderColor:
        "#272A34",
    },

    infoText: {
      color: "#AAA",
      textAlign: "right",
      lineHeight: 22,
    },

    targetRow: {
      flexDirection:
        "row",
      alignItems:
        "center",
      backgroundColor:
        "#11131A",
      borderRadius: 15,
      padding: 10,
      marginBottom: 8,
      borderWidth: 1,
      borderColor:
        "#242731",
      gap: 10,
    },

    selectedTarget: {
      borderColor:
        "#D7A94B",
      backgroundColor:
        "#19160E",
    },

    targetName: {
      color: "#fff",
      fontSize: 16,
      fontWeight: "800",
      textAlign: "right",
    },

    targetStatus: {
      color: "#777",
      fontSize: 12,
      textAlign: "right",
      marginTop: 2,
    },

    actionButton: {
      backgroundColor:
        "#B88924",
      borderRadius: 14,
      padding: 16,
      justifyContent:
        "center",
      alignItems:
        "center",
      marginTop: 8,
      minHeight: 54,
    },

    actionButtonText: {
      color: "#fff",
      fontSize: 16,
      fontWeight: "900",
    },

    disabledButton: {
      opacity: 0.45,
    },

    investigationCard: {
      flexDirection:
        "row",
      alignItems:
        "center",
      backgroundColor:
        "#171324",
      borderColor:
        "#6D4BB1",
      borderWidth: 1,
      borderRadius: 14,
      padding: 14,
      marginTop: 12,
      gap: 9,
    },

    investigationText: {
      color: "#DDD2F7",
      flex: 1,
      textAlign: "right",
      lineHeight: 21,
    },

    voiceHeader: {
      flexDirection:
        "row",
      alignItems:
        "center",
      justifyContent:
        "space-between",
      backgroundColor:
        "#11131A",
      borderRadius: 15,
      padding: 14,
      borderWidth: 1,
      borderColor:
        "#272A34",
    },

    voiceHint: {
      color: "#5EEAD4",
      fontSize: 12,
      textAlign: "right",
      marginTop: 3,
    },

    micButton: {
      width: 50,
      height: 50,
      borderRadius: 25,
      backgroundColor:
        "#333742",
      justifyContent:
        "center",
      alignItems:
        "center",
    },

    micActive: {
      backgroundColor:
        "#168C68",
    },

    voiceDisabled: {
      color: "#777",
      fontSize: 12,
      textAlign: "right",
      marginTop: 8,
      lineHeight: 18,
    },

    speakingBox: {
      flexDirection:
        "row",
      alignItems:
        "center",
      backgroundColor:
        "#10201D",
      borderRadius: 10,
      padding: 10,
      marginTop: 8,
      gap: 7,
    },

    speakingText: {
      color: "#5EEAD4",
      flex: 1,
      textAlign: "right",
    },

    chatBox: {
      backgroundColor:
        "#0F1117",
      borderRadius: 15,
      borderWidth: 1,
      borderColor:
        "#252832",
      padding: 12,
      minHeight: 100,
      maxHeight: 300,
    },

    messageRow: {
      marginBottom: 10,
      borderBottomWidth: 1,
      borderBottomColor:
        "#1D2028",
      paddingBottom: 8,
    },

    messageName: {
      color: "#D7A94B",
      fontSize: 12,
      fontWeight: "800",
      textAlign: "right",
      marginBottom: 2,
    },

    messageText: {
      color: "#E8E8E8",
      fontSize: 14,
      textAlign: "right",
      lineHeight: 20,
    },

    chatInputRow: {
      flexDirection:
        "row",
      alignItems:
        "flex-end",
      marginTop: 8,
      gap: 8,
    },

    chatInput: {
      flex: 1,
      minHeight: 48,
      maxHeight: 110,
      backgroundColor:
        "#11131A",
      borderRadius: 14,
      borderWidth: 1,
      borderColor:
        "#272A34",
      color: "#fff",
      paddingHorizontal: 13,
      paddingVertical: 11,
    },

    sendButton: {
      width: 48,
      height: 48,
      borderRadius: 14,
      backgroundColor:
        "#B88924",
      justifyContent:
        "center",
      alignItems:
        "center",
    },

    playerRow: {
      flexDirection:
        "row",
      alignItems:
        "center",
      backgroundColor:
        "#11131A",
      borderRadius: 14,
      padding: 9,
      marginBottom: 7,
      borderWidth: 1,
      borderColor:
        "#242731",
      gap: 10,
    },

    deadPlayerRow: {
      opacity: 0.55,
    },

    playerName: {
      color: "#fff",
      fontSize: 15,
      fontWeight: "800",
      textAlign: "right",
    },

    playerStatus: {
      color: "#777",
      fontSize: 11,
      textAlign: "right",
      marginTop: 2,
    },

    speakingPlayer: {
      borderColor:
        "#28BFA0",
    },

    avatar: {
      borderWidth: 2,
      borderColor:
        "#D7A94B",
    },

    avatarFallback: {
      backgroundColor:
        "#1C1F28",
      borderWidth: 2,
      borderColor:
        "#393D48",
      justifyContent:
        "center",
      alignItems:
        "center",
    },

    deadAvatar: {
      opacity: 0.45,
      borderColor:
        "#555",
    },

    emptyText: {
      color: "#777",
      textAlign: "center",
      padding: 18,
    },

    winnerCard: {
      backgroundColor:
        "#15130D",
      borderRadius: 20,
      borderWidth: 1,
      borderColor:
        "#6A5221",
      padding: 25,
      alignItems:
        "center",
      marginTop: 10,
    },

    winnerTitle: {
      color: "#D7A94B",
      fontSize: 25,
      fontWeight: "900",
      marginTop: 10,
    },

    winnerText: {
      color: "#fff",
      fontSize: 17,
      marginTop: 8,
      marginBottom: 18,
      textAlign: "center",
    },

    goldButton: {
      backgroundColor:
        "#B88924",
      borderRadius: 13,
      paddingHorizontal: 25,
      paddingVertical: 14,
      marginTop: 10,
    },

    goldButtonText: {
      color: "#fff",
      fontSize: 15,
      fontWeight: "900",
    },

    bottomSpace: {
      height: 30,
    },

    /*
     * ROLE CARD
     */

    roleOverlay: {
      position: "absolute",
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
      backgroundColor:
        "rgba(0,0,0,0.94)",
      justifyContent:
        "center",
      alignItems:
        "center",
      padding: 20,
      zIndex: 100,
      elevation: 100,
    },

    roleCard: {
      width: "100%",
      maxWidth: 420,
      backgroundColor:
        "#11131A",
      borderRadius: 26,
      borderWidth: 2,
      padding: 22,
      alignItems:
        "center",
    },

    roleTopIcon: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor:
        "#201D15",
      justifyContent:
        "center",
      alignItems:
        "center",
      marginBottom: 8,
    },

    secretTitle: {
      color: "#D7A94B",
      fontSize: 25,
      fontWeight: "900",
      textAlign: "center",
    },

    secretSubtitle: {
      color: "#777",
      fontSize: 12,
      textAlign: "center",
      marginTop: 5,
      marginBottom: 16,
    },

    largeRoleIcon: {
      width: 125,
      height: 125,
      borderRadius: 63,
      justifyContent:
        "center",
      alignItems:
        "center",
      marginBottom: 14,
    },

    roleCardRole: {
      color: "#fff",
      fontSize: 31,
      fontWeight: "900",
      textAlign: "center",
    },

    roleCardPlayer: {
      color: "#D7A94B",
      fontSize: 16,
      fontWeight: "800",
      marginTop: 5,
      marginBottom: 12,
    },

    roleDescriptionBox: {
      width: "100%",
      backgroundColor:
        "#0A0B10",
      borderRadius: 15,
      borderWidth: 1,
      borderColor:
        "#292D38",
      padding: 14,
      marginTop: 5,
      marginBottom: 16,
    },

    roleDescriptionTitle: {
      color: "#D7A94B",
      fontSize: 14,
      fontWeight: "900",
      textAlign: "right",
      marginBottom: 6,
    },

    roleDescription: {
      color: "#D6D6D6",
      fontSize: 14,
      lineHeight: 23,
      textAlign: "right",
    },

    roleContinueButton: {
      width: "100%",
      minHeight: 54,
      borderRadius: 15,
      flexDirection:
        "row",
      justifyContent:
        "center",
      alignItems:
        "center",
      gap: 8,
    },

    roleContinueText: {
      color: "#fff",
      fontSize: 16,
      fontWeight: "900",
    },
  });
