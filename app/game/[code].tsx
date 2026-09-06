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
  prepareMicrophone,
  checkMicrophonePermission,
} from "../../lib/voice";

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
    "أنت من المافيا. اختر لاعبًا لقتله خلال الليل.",
  DOCTOR:
    "احمِ لاعبًا واحدًا خلال الليل من القتل.",
  DETECTIVE:
    "تحقق من لاعب واحد فقط كل ليلة لمعرفة هل هو من المافيا.",
  CITIZEN:
    "راقب اللاعبين واستخدم التصويت خلال النهار لاكتشاف المافيا.",
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
      return "انتهى الليل وبدأ النهار. تحدثوا واكتشفوا المافيا.";

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
  size = 52,
}: {
  player: GamePlayer;
  profile?: Profile;
  size?: number;
}) {
  const image =
    profile?.avatar_url;

  if (image) {
    return (
      <Image
        source={{ uri: image }}
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
        size={Math.max(18, size * 0.42)}
        color={
          player.alive
            ? "#D7A94B"
            : "#686A70"
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

  const roomId =
    Array.isArray(params.code)
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

  const [messagesLoading, setMessagesLoading] =
    useState(false);

  const [sendingMessage, setSendingMessage] =
    useState(false);

  const [micEnabled, setMicEnabled] =
    useState(false);

  const [investigationResult, setInvestigationResult] =
    useState<string | null>(null);

  const mountedRef =
    useRef(true);

  const advancingRef =
    useRef(false);

  const lastAdvanceRef =
    useRef(0);

  const loadProfiles =
    useCallback(
      async (players: GamePlayer[]) => {
        const ids =
          players
            .map(
              (player) =>
                player.user_id
            )
            .filter(Boolean);

        if (ids.length === 0) {
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
          .in("user_id", ids);

        if (error) {
          console.error(
            "loadProfiles:",
            error
          );
          return;
        }

        const map: ProfileMap = {};

        for (const row of data || []) {
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
          .from("room_messages")
          .select(
            "id, room_id, user_id, message, created_at"
          )
          .eq("room_id", roomId)
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
        } else if (mountedRef.current) {
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

  const loadGame =
    useCallback(
      async (
        showLoader = false
      ) => {
        if (!roomId) {
          Alert.alert(
            "خطأ",
            "معرف الغرفة غير موجود."
          );
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

          if (!mountedRef.current) {
            return;
          }

          setGameState(state);

          const role =
            await getMyRole(
              roomId
            );

          if (!mountedRef.current) {
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

          if (mountedRef.current) {
            Alert.alert(
              "تعذر تحميل اللعبة",
              error?.message ||
                "حدث خطأ أثناء تحميل حالة اللعبة."
            );
          }
        } finally {
          if (
            mountedRef.current &&
            showLoader
          ) {
            setLoading(false);
          }
        }
      },
      [
        roomId,
        loadProfiles,
      ]
    );

  useEffect(() => {
    mountedRef.current = true;

    loadGame(true);

    return () => {
      mountedRef.current = false;
    };
  }, [loadGame]);

  useEffect(() => {
    if (!roomId) {
      return;
    }

    const poll =
      setInterval(() => {
        loadGame(false);
      }, 2500);

    return () => {
      clearInterval(poll);
    };
  }, [roomId, loadGame]);

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

  useEffect(() => {
    if (!gameState) {
      return;
    }

    setSecondsLeft(
      getSecondsLeft(
        gameState.room
          .phase_ends_at
      );

      // noop
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

        if (mountedRef.current) {
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
              .catch((error: any) => {
                const message =
                  error?.message ||
                  "";

                /*
                 * قد تكون عميلة أخرى
                 * سبقتنا في الانتقال.
                 * لذلك لا نظهر خطأ للمستخدم
                 * في هذه الحالة.
                 */
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
              })
              .finally(() => {
                advancingRef.current =
                  false;
              });
          }
        }
      };

    update();

    const timer =
      setInterval(
        update,
        500
      );

    return () => {
      clearInterval(timer);
    };
  }, [
    gameState?.room?.phase_ends_at,
    gameState?.room?.status,
    roomId,
    loadGame,
  ]);

  useEffect(() => {
    if (!gameState) {
      return;
    }

    loadMessages();
  }, [
    gameState?.room?.id,
    loadMessages,
  ]);

  const room =
    gameState?.room ||
    null;

  const players =
    gameState?.players ||
    [];

  const alivePlayers =
    useMemo(
      () =>
        players.filter(
          (player) =>
            player.alive
        ),
      [players]
    );

  const deadPlayers =
    useMemo(
      () =>
        players.filter(
          (player) =>
            !player.alive
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
        ),
      [
        players,
        gameState?.my_player_id,
      ]
    );

  const isNight =
    room?.game_phase ===
    "night";

  const isDay =
    room?.game_phase ===
    "day";

  const gameFinished =
    room?.status ===
      "finished" ||
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

  const eventText =
    getEventText(
      room?.last_event ||
        null
    );

  const selectedPlayer =
    players.find(
      (player) =>
        player.id ===
        selectedTarget
    );

  const canNightAction =
    Boolean(
      room &&
        isNight &&
        !gameFinished &&
        myAlive &&
        !busy &&
        myRole &&
        (
          myRole ===
            "MAFIA" ||
          myRole ===
            "DOCTOR" ||
          myRole ===
            "DETECTIVE"
        )
    );

  const canVote =
    Boolean(
      room &&
        isDay &&
        !gameFinished &&
        myAlive &&
        !busy
    );

  const canChat =
    Boolean(
      room &&
        isDay &&
        !gameFinished &&
        myAlive &&
        !sendingMessage
    );

  async function performNightAction(
    action:
      | "kill"
      | "protect"
      | "investigate"
  ) {
    if (
      !roomId ||
      !selectedTarget ||
      !canNightAction
    ) {
      return;
    }

    if (
      !selectedPlayer ||
      !selectedPlayer.alive
    ) {
      Alert.alert(
        "هدف غير صالح",
        "يجب اختيار لاعب حي."
      );
      return;
    }

    if (
      selectedTarget ===
      gameState?.my_player_id
    ) {
      Alert.alert(
        "هدف غير صالح",
        "لا يمكنك اختيار نفسك."
      );
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
        let resultText =
          "تم التحقيق في اللاعب.";

        if (
          result &&
          typeof result ===
            "object"
        ) {
          const value =
            result as any;

          const role =
            value.role ||
            value.target_role ||
            value.result;

          if (role) {
            resultText =
              role === "MAFIA"
                ? "نتيجة التحقيق: هذا اللاعب من المافيا."
                : "نتيجة التحقيق: هذا اللاعب ليس من المافيا.";
          }
        }

        setInvestigationResult(
          resultText
        );
      } else {
        Alert.alert(
          "تم",
          action ===
            "kill"
            ? "تم تسجيل هدف المافيا."
            : "تم تسجيل حماية الطبيب."
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
          "لا يمكن تنفيذ هذه العملية الآن."
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleVote() {
    if (
      !roomId ||
      !selectedTarget ||
      !canVote
    ) {
      return;
    }

    if (
      !selectedPlayer ||
      !selectedPlayer.alive
    ) {
      Alert.alert(
        "تصويت غير صالح",
        "يمكن التصويت على لاعب حي فقط."
      );
      return;
    }

    try {
      setBusy(true);

      await submitDayVote(
        roomId,
        selectedTarget
      );

      Alert.alert(
        "تم التصويت",
        `تم تسجيل تصويتك ضد ${
          profiles[
            selectedTarget
          ]?.username ||
          selectedPlayer.name
        }.`
      );

      setSelectedTarget(
        null
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
  }

  async function handleSendMessage() {
    const text =
      messageText.trim();

    if (
      !roomId ||
      !canChat ||
      !text
    ) {
      return;
    }

    try {
      setSendingMessage(true);

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
        "send message:",
        error
      );

      Alert.alert(
        "تعذر إرسال الرسالة",
        error?.message ||
          "لا يمكن إرسال الرسالة الآن."
      );
    } finally {
      setSendingMessage(
        false
      );
    }
  }

  async function handleMicrophone() {
    if (
      !isDay ||
      !myAlive ||
      gameFinished
    ) {
      Alert.alert(
        "الميكروفون غير متاح",
        "الميكروفون متاح فقط أثناء النهار للاعبين الأحياء."
      );
      return;
    }

    try {
      const granted =
        await checkMicrophonePermission();

      if (!granted) {
        await prepareMicrophone();
      }

      setMicEnabled(
        (value) => !value
      );

      Alert.alert(
        "الميكروفون",
        "تم السماح بالميكروفون. النقل الصوتي المباشر بين اللاعبين يحتاج نظام Voice/WebRTC مستقل."
      );
    } catch (error: any) {
      Alert.alert(
        "الميكروفون",
        error?.message ||
          "تعذر تشغيل الميكروفون."
      );
    }
  }

  function selectPlayer(
    playerId: string
  ) {
    if (busy) {
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
      !player.alive
    ) {
      return;
    }

    if (
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

    if (
      isNight &&
      myRole !==
        "DETECTIVE"
    ) {
      setInvestigationResult(
        null
      );
    }
  }

  function renderPlayer(
    player: GamePlayer
  ) {
    const profile =
      profiles[
        player.user_id
      ];

    const displayName =
      profile?.username ||
      player.name ||
      "Player";

    const isMe =
      player.id ===
      gameState?.my_player_id;

    const isSelected =
      selectedTarget ===
      player.id;

    const selectable =
      player.alive &&
      !isMe &&
      !gameFinished;

    return (
      <Pressable
        key={player.id}
        onPress={() =>
          selectable &&
          selectPlayer(
            player.id
          )
        }
        disabled={
          !selectable ||
          busy
        }
        style={[
          styles.playerCard,
          !player.alive &&
            styles.deadPlayerCard,
          isSelected &&
            styles.selectedPlayerCard,
          !selectable &&
            !player.alive &&
            styles.notSelectable,
        ]}
      >
        <PlayerAvatar
          player={player}
          profile={profile}
          size={50}
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
                  styles.deadText,
              ]}
            >
              {displayName}
            </Text>

            {isMe && (
              <Text
                style={
                  styles.youBadge
                }
              >
                YOU
              </Text>
            )}
          </View>

          {player.alive ? (
            <Text
              style={
                styles.aliveText
              }
            >
              على قيد الحياة
            </Text>
          ) : (
            <Text
              style={
                styles.deadText
              }
            >
              ☠ ميت
            </Text>
          )}
        </View>

        {isSelected &&
          player.alive &&
          !isMe && (
            <Ionicons
              name="checkmark-circle"
              size={27}
              color="#D7A94B"
            />
          )}

        {!player.alive && (
          <Ionicons
            name="skull-outline"
            size={24}
            color="#686A70"
          />
        )}
      </Pressable>
    );
  }

  if (loading) {
    return (
      <View
        style={
          styles.loadingScreen
        }
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
          جاري دخول اللعبة...
        </Text>
      </View>
    );
  }

  if (!gameState || !room) {
    return (
      <View
        style={
          styles.loadingScreen
        }
      >
        <Ionicons
          name="alert-circle-outline"
          size={55}
          color="#B5222E"
        />

        <Text
          style={
            styles.errorTitle
          }
        >
          تعذر تحميل اللعبة
        </Text>

        <Pressable
          onPress={() =>
            loadGame(true)
          }
          style={
            styles.retryButton
          }
        >
          <Text
            style={
              styles.retryText
            }
          >
            إعادة المحاولة
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={
        styles.screen
      }
      behavior={
        Platform.OS ===
        "ios"
          ? "padding"
          : undefined
      }
    >
      <ScrollView
        style={
          styles.scroll
        }
        contentContainerStyle={
          styles.container
        }
        showsVerticalScrollIndicator={
          false
        }
        keyboardShouldPersistTaps="handled"
      >
        <View
          style={
            styles.header
          }
        >
          <View>
            <Text
              style={
                styles.eyebrow
              }
            >
              MAFIA NIGHT
            </Text>

            <Text
              style={
                styles.roomTitle
              }
            >
              الجولة {room.game_round}
            </Text>
          </View>

          <View
            style={[
              styles.phaseBadge,
              isNight
                ? styles.nightBadge
                : styles.dayBadge,
            ]}
          >
            <Ionicons
              name={
                isNight
                  ? "moon"
                  : "sunny"
              }
              size={17}
              color="#F4F1EF"
            />

            <Text
              style={
                styles.phaseText
              }
            >
              {isNight
                ? "ليل"
                : "نهار"}
            </Text>
          </View>
        </View>

        <View
          style={[
            styles.timerCard,
            secondsLeft <= 10 &&
              styles.timerDanger,
          ]}
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

          <Text
            style={
              styles.timerHint
            }
          >
            {isNight
              ? "تنتهي المرحلة الليلية تلقائيًا"
              : "ينتهي النهار تلقائيًا"}
          </Text>
        </View>

        {myRole && (
          <View
            style={
              styles.roleCard
            }
          >
            <View
              style={
                styles.roleIcon
              }
            >
              <Ionicons
                name={
                  myRole ===
                  "MAFIA"
                    ? "skull"
                    : myRole ===
                      "DOCTOR"
                    ? "medkit"
                    : myRole ===
                      "DETECTIVE"
                    ? "search"
                    : "person"
                }
                size={27}
                color="#D7A94B"
              />
            </View>

            <View
              style={
                styles.roleContent
              }
            >
              <Text
                style={
                  styles.roleSmall
                }
              >
                دورك
              </Text>

              <Text
                style={
                  styles.roleName
                }
              >
                {ROLE_LABELS[
                  myRole
                ]}
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
          </View>
        )}

        {!myAlive && (
          <View
            style={
              styles.deadBanner
            }
          >
            <Ionicons
              name="skull-outline"
              size={25}
              color="#B5222E"
            />

            <View
              style={
                styles.deadBannerContent
              }
            >
              <Text
                style={
                  styles.deadBannerTitle
                }
              >
                لقد مت
              </Text>

              <Text
                style={
                  styles.deadBannerText
                }
              >
                لم يعد بإمكانك تنفيذ الأدوار أو التصويت أو إرسال الرسائل.
              </Text>
            </View>
          </View>
        )}

        {gameFinished && (
          <View
            style={
              styles.winnerCard
            }
          >
            <Ionicons
              name="trophy"
              size={35}
              color="#D7A94B"
            />

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
              {room.winner
                ? `الفائز: ${room.winner}`
                : "تم تحديد الفائز."}
            </Text>
          </View>
        )}

        {eventText && (
          <View
            style={
              styles.eventCard
            }
          >
            <Ionicons
              name="information-circle-outline"
              size={21}
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

        {isNight &&
          canNightAction && (
            <View
              style={
                styles.actionSection
              }
            >
              <Text
                style={
                  styles.sectionTitle
                }
              >
                اختر لاعبًا
              </Text>

              <Text
                style={
                  styles.sectionHint
                }
              >
                اضغط على لاعب حي لتحديده.
              </Text>

              <View
                style={
                  styles.playersGrid
                }
              >
                {selectablePlayers.map(
                  renderPlayer
                )}
              </View>

              {selectedPlayer && (
                <View
                  style={
                    styles.selectedBox
                  }
                >
                  <Text
                    style={
                      styles.selectedText
                    }
                  >
                    المحدد:{" "}
                    {profiles[
                      selectedPlayer
                        .user_id
                    ]?.username ||
                      selectedPlayer.name}
                  </Text>
                </View>
              )}

              {myRole ===
                "MAFIA" && (
                <Pressable
                  onPress={() =>
                    performNightAction(
                      "kill"
                    )
                  }
                  disabled={
                    !selectedTarget ||
                    busy
                  }
                  style={[
                    styles.actionButton,
                    styles.killButton,
                    (!selectedTarget ||
                      busy) &&
                      styles.disabledButton,
                  ]}
                >
                  {busy ? (
                    <ActivityIndicator
                      color="#FFF"
                    />
                  ) : (
                    <>
                      <Ionicons
                        name="skull"
                        size={21}
                        color="#FFF"
                      />

                      <Text
                        style={
                          styles.actionButtonText
                        }
                      >
                        قتل اللاعب
                      </Text>
                    </>
                  )}
                </Pressable>
              )}

              {myRole ===
                "DOCTOR" && (
                <Pressable
                  onPress={() =>
                    performNightAction(
                      "protect"
                    )
                  }
                  disabled={
                    !selectedTarget ||
                    busy
                  }
                  style={[
                    styles.actionButton,
                    styles.protectButton,
                    (!selectedTarget ||
                      busy) &&
                      styles.disabledButton,
                  ]}
                >
                  {busy ? (
                    <ActivityIndicator
                      color="#090A0D"
                    />
                  ) : (
                    <>
                      <Ionicons
                        name="shield-checkmark"
                        size={21}
                        color="#090A0D"
                      />

                      <Text
                        style={
                          styles.darkActionText
                        }
                      >
                        حماية اللاعب
                      </Text>
                    </>
                  )}
                </Pressable>
              )}

              {myRole ===
                "DETECTIVE" && (
                <>
                  <Pressable
                    onPress={() =>
                      performNightAction(
                        "investigate"
                      )
                    }
                    disabled={
                      !selectedTarget ||
                      busy
                    }
                    style={[
                      styles.actionButton,
                      styles.investigateButton,
                      (!selectedTarget ||
                        busy) &&
                        styles.disabledButton,
                    ]}
                  >
                    {busy ? (
                      <ActivityIndicator
                        color="#090A0D"
                      />
                    ) : (
                      <>
                        <Ionicons
                          name="search"
                          size={21}
                          color="#090A0D"
                        />

                        <Text
                          style={
                            styles.darkActionText
                          }
                        >
                          التحقيق
                        </Text>
                      </>
                    )}
                  </Pressable>

                  <Text
                    style={
                      styles.oneInvestigation
                    }
                  >
                    يمكنك التحقيق في لاعب واحد فقط كل ليلة.
                  </Text>
                </>
              )}

              {investigationResult &&
                myRole ===
                  "DETECTIVE" && (
                  <View
                    style={
                      styles.investigationCard
                    }
                  >
                    <Ionicons
                      name="eye"
                      size={22}
                      color="#D7A94B"
                    />

                    <Text
                      style={
                        styles.investigationText
                      }
                    >
                      {investigationResult}
                    </Text>
                  </View>
                )}
            </View>
          )}

        {isNight &&
          myAlive &&
          myRole ===
            "CITIZEN" && (
            <View
              style={
                styles.waitingCard
              }
            >
              <Ionicons
                name="moon-outline"
                size={28}
                color="#D7A94B"
              />

              <Text
                style={
                  styles.waitingTitle
                }
              >
                انتظر حتى ينتهي الليل
              </Text>

              <Text
                style={
                  styles.waitingText
                }
              >
                دورك يبدأ في النهار.
              </Text>
            </View>
          )}

        {isDay && (
          <>
            <View
              style={
                styles.dayHeader
              }
            >
              <View>
                <Text
                  style={
                    styles.sectionTitle
                  }
                >
                  وقت النهار
                </Text>

                <Text
                  style={
                    styles.sectionHint
                  }
                >
                  تحدثوا ثم اختاروا اللاعب الذي تريدون التصويت ضده.
                </Text>
              </View>
            </View>

            {canVote && (
              <View
                style={
                  styles.actionSection
                }
              >
                <Text
                  style={
                    styles.sectionTitle
                  }
                >
                  التصويت
                </Text>

                <View
                  style={
                    styles.playersGrid
                  }
                >
                  {selectablePlayers.map(
                    renderPlayer
                  )}
                </View>

                {selectedPlayer && (
                  <View
                    style={
                      styles.selectedBox
                    }
                  >
                    <Text
                      style={
                        styles.selectedText
                      }
                    >
                      التصويت ضد:{" "}
                      {profiles[
                        selectedPlayer
                          .user_id
                      ]?.username ||
                        selectedPlayer.name}
                    </Text>
                  </View>
                )}

                <Pressable
                  onPress={
                    handleVote
                  }
                  disabled={
                    !selectedTarget ||
                    busy
                  }
                  style={[
                    styles.voteButton,
                    (!selectedTarget ||
                      busy) &&
                      styles.disabledButton,
                  ]}
                >
                  {busy ? (
                    <ActivityIndicator
                      color="#090A0D"
                    />
                  ) : (
                    <>
                      <Ionicons
                        name="checkmark-circle"
                        size={21}
                        color="#090A0D"
                      />

                      <Text
                        style={
                          styles.voteText
                        }
                      >
                        تأكيد التصويت
                      </Text>
                    </>
                  )}
                </Pressable>
              </View>
            )}

            {myAlive &&
              !gameFinished && (
                <View
                  style={
                    styles.voiceCard
                  }
                >
                  <View
                    style={
                      styles.voiceIcon
                    }
                  >
                    <Ionicons
                      name={
                        micEnabled
                          ? "mic"
                          : "mic-outline"
                      }
                      size={23}
                      color="#D7A94B"
                    />
                  </View>

                  <View
                    style={
                      styles.voiceContent
                    }
                  >
                    <Text
                      style={
                        styles.voiceTitle
                      }
                    >
                      الميكروفون
                    </Text>

                    <Text
                      style={
                        styles.voiceText
                      }
                    >
                      متاح أثناء النهار فقط.
                    </Text>
                  </View>

                  <Pressable
                    onPress={
                      handleMicrophone
                    }
                    style={[
                      styles.micButton,
                      micEnabled &&
                        styles.micButtonActive,
                    ]}
                  >
                    <Text
                      style={
                        styles.micButtonText
                      }
                    >
                      {micEnabled
                        ? "ON"
                        : "MIC"}
                    </Text>
                  </Pressable>
                </View>
              )}

            <View
              style={
                styles.chatSection
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
                      styles.sectionTitle
                    }
                  >
                    الدردشة
                  </Text>

                  <Text
                    style={
                      styles.sectionHint
                    }
                  >
                    الدردشة متاحة للأحياء أثناء النهار.
                  </Text>
                </View>

                <Ionicons
                  name="chatbubbles-outline"
                  size={25}
                  color="#D7A94B"
                />
              </View>

              <View
                style={
                  styles.messagesBox
                }
              >
                {messagesLoading &&
                  messages.length ===
                    0 && (
                    <ActivityIndicator
                      color="#D7A94B"
                    />
                  )}

                {!messagesLoading &&
                  messages.length ===
                    0 && (
                    <Text
                      style={
                        styles.emptyMessages
                      }
                    >
                      لا توجد رسائل بعد.
                    </Text>
                  )}

                {messages.map(
                  (message) => {
                    const profile =
                      profiles[
                        message.user_id
                      ];

                    const name =
                      profile?.username ||
                      "Player";

                    return (
                      <View
                        key={
                          message.id
                        }
                        style={
                          styles.messageRow
                        }
                      >
                        {profile?.avatar_url ? (
                          <Image
                            source={{
                              uri: profile.avatar_url,
                            }}
                            style={
                              styles.messageAvatar
                            }
                          />
                        ) : (
                          <View
                            style={
                              styles.messageAvatarFallback
                            }
                          >
                            <Ionicons
                              name="person"
                              size={15}
                              color="#D7A94B"
                            />
                          </View>
                        )}

                        <View
                          style={
                            styles.messageBubble
                          }
                        >
                          <Text
                            style={
                              styles.messageName
                            }
                          >
                            {name}
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
                )}
              </View>

              {canChat ? (
                <View
                  style={
                    styles.inputRow
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
                    placeholderTextColor="#666870"
                    style={
                      styles.messageInput
                    }
                    multiline
                    maxLength={300}
                    editable={
                      !sendingMessage
                    }
                  />

                  <Pressable
                    onPress={
                      handleSendMessage
                    }
                    disabled={
                      !messageText.trim() ||
                      sendingMessage
                    }
                    style={[
                      styles.sendButton,
                      (!messageText.trim() ||
                        sendingMessage) &&
                        styles.disabledSend,
                    ]}
                  >
                    {sendingMessage ? (
                      <ActivityIndicator
                        color="#090A0D"
                      />
                    ) : (
                      <Ionicons
                        name="send"
                        size={20}
                        color="#090A0D"
                      />
                    )}
                  </Pressable>
                </View>
              ) : (
                <View
                  style={
                    styles.chatClosed
                  }
                >
                  <Ionicons
                    name="lock-closed-outline"
                    size={19}
                    color="#666870"
                  />

                  <Text
                    style={
                      styles.chatClosedText
                    }
                  >
                    الدردشة مغلقة حاليًا.
                  </Text>
                </View>
              )}
            </View>
          </>
        )}

        <View
          style={
            styles.playersSection
          }
        >
          <View
            style={
              styles.playersSectionHeader
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
              {alivePlayers.length}
              {" / "}
              {players.length} أحياء
            </Text>
          </View>

          {players.map(
            renderPlayer
          )}
        </View>

        {deadPlayers.length >
          0 && (
          <View
            style={
              styles.deadInfo
            }
          >
            <Ionicons
              name="skull-outline"
              size={19}
              color="#B5222E"
            />

            <Text
              style={
                styles.deadInfoText
              }
            >
              اللاعبون الذين يظهرون بعلامة ☠ ميتون ولا يمكنهم المشاركة.
            </Text>
          </View>
        )}

        <View
          style={
            styles.bottomSpace
          }
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles =
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: "#090A0D",
    },

    scroll: {
      flex: 1,
    },

    container: {
      padding: 18,
      paddingBottom: 45,
    },

    loadingScreen: {
      flex: 1,
      backgroundColor: "#090A0D",
      alignItems: "center",
      justifyContent: "center",
      padding: 25,
    },

    loadingText: {
      color: "#A5A6AC",
      marginTop: 15,
      fontSize: 14,
    },

    errorTitle: {
      color: "#F4F1EF",
      fontSize: 19,
      fontWeight: "900",
      marginTop: 15,
      marginBottom: 20,
    },

    retryButton: {
      backgroundColor: "#D7A94B",
      paddingHorizontal: 25,
      paddingVertical: 13,
      borderRadius: 13,
    },

    retryText: {
      color: "#090A0D",
      fontWeight: "900",
    },

    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 18,
    },

    eyebrow: {
      color: "#B5222E",
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 3,
    },

    roomTitle: {
      color: "#F4F1EF",
      fontSize: 26,
      fontWeight: "900",
      marginTop: 4,
    },

    phaseBadge: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 13,
      paddingVertical: 10,
      borderRadius: 14,
    },

    nightBadge: {
      backgroundColor: "#202038",
    },

    dayBadge: {
      backgroundColor: "#4A3C20",
    },

    phaseText: {
      color: "#F4F1EF",
      fontSize: 12,
      fontWeight: "900",
      marginLeft: 6,
    },

    timerCard: {
      backgroundColor: "#15171B",
      borderWidth: 1,
      borderColor: "#292B30",
      borderRadius: 20,
      alignItems: "center",
      paddingVertical: 18,
      marginBottom: 15,
    },

    timerDanger: {
      borderColor: "#B5222E",
    },

    timerLabel: {
      color: "#777983",
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 2,
    },

    timer: {
      color: "#F4F1EF",
      fontSize: 43,
      fontWeight: "900",
      letterSpacing: 2,
      marginTop: 4,
    },

    timerHint: {
      color: "#666870",
      fontSize: 10,
      marginTop: 3,
    },

    roleCard: {
      backgroundColor: "#15171B",
      borderRadius: 18,
      borderWidth: 1,
      borderColor: "#2A2C31",
      padding: 16,
      flexDirection: "row",
      marginBottom: 15,
    },

    roleIcon: {
      width: 53,
      height: 53,
      borderRadius: 16,
      backgroundColor: "#24262B",
      alignItems: "center",
      justifyContent: "center",
    },

    roleContent: {
      flex: 1,
      marginLeft: 13,
    },

    roleSmall: {
      color: "#777983",
      fontSize: 9,
      fontWeight: "900",
      letterSpacing: 2,
    },

    roleName: {
      color: "#D7A94B",
      fontSize: 20,
      fontWeight: "900",
      marginTop: 2,
    },

    roleDescription: {
      color: "#9799A1",
      fontSize: 12,
      lineHeight: 18,
      marginTop: 4,
    },

    deadBanner: {
      backgroundColor: "#211317",
      borderWidth: 1,
      borderColor: "#57212A",
      borderRadius: 17,
      padding: 15,
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 15,
    },

    deadBannerContent: {
      flex: 1,
      marginLeft: 12,
    },

    deadBannerTitle: {
      color: "#B5222E",
      fontSize: 17,
      fontWeight: "900",
    },

    deadBannerText: {
      color: "#9B7C81",
      fontSize: 11,
      lineHeight: 17,
      marginTop: 3,
    },

    winnerCard: {
      backgroundColor: "#2A2415",
      borderWidth: 1,
      borderColor: "#8A6A26",
      borderRadius: 18,
      padding: 20,
      alignItems: "center",
      marginBottom: 15,
    },

    winnerTitle: {
      color: "#D7A94B",
      fontSize: 22,
      fontWeight: "900",
      marginTop: 7,
    },

    winnerText: {
      color: "#F4F1EF",
      fontSize: 14,
      fontWeight: "800",
      marginTop: 5,
    },

    eventCard: {
      backgroundColor: "#121419",
      borderRadius: 15,
      padding: 14,
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 15,
    },

    eventText: {
      flex: 1,
      color: "#A7A8AF",
      fontSize: 12,
      lineHeight: 18,
      marginLeft: 10,
    },

    actionSection: {
      marginBottom: 20,
    },

    sectionTitle: {
      color: "#777983",
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 2,
    },

    sectionHint: {
      color: "#777983",
      fontSize: 11,
      lineHeight: 17,
      marginTop: 5,
    },

    playersGrid: {
      marginTop: 11,
    },

    playerCard: {
      backgroundColor: "#15171B",
      borderWidth: 1,
      borderColor: "#282A2F",
      borderRadius: 16,
      minHeight: 70,
      padding: 9,
      marginBottom: 8,
      flexDirection: "row",
      alignItems: "center",
    },

    selectedPlayerCard: {
      borderColor: "#D7A94B",
      backgroundColor: "#211D13",
    },

    deadPlayerCard: {
      opacity: 0.58,
      backgroundColor: "#121317",
      borderColor: "#24252A",
    },

    notSelectable: {
      opacity: 0.58,
    },

    avatar: {
      backgroundColor: "#24262B",
    },

    deadAvatar: {
      opacity: 0.5,
    },

    avatarFallback: {
      backgroundColor: "#24262B",
      alignItems: "center",
      justifyContent: "center",
    },

    playerInfo: {
      flex: 1,
      marginLeft: 11,
    },

    playerNameRow: {
      flexDirection: "row",
      alignItems: "center",
    },

    playerName: {
      color: "#F4F1EF",
      fontSize: 14,
      fontWeight: "800",
    },

    deadText: {
      color: "#777983",
    },

    youBadge: {
      color: "#D7A94B",
      fontSize: 8,
      fontWeight: "900",
      marginLeft: 7,
    },

    aliveText: {
      color: "#59C878",
      fontSize: 9,
      marginTop: 3,
    },

    selectedBox: {
      backgroundColor: "#2A2415",
      borderRadius: 13,
      padding: 12,
      marginTop: 8,
      marginBottom: 10,
    },

    selectedText: {
      color: "#D7A94B",
      textAlign: "center",
      fontSize: 12,
      fontWeight: "900",
    },

    actionButton: {
      minHeight: 54,
      borderRadius: 15,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      marginTop: 10,
    },

    killButton: {
      backgroundColor: "#B5222E",
    },

    protectButton: {
      backgroundColor: "#59C878",
    },

    investigateButton: {
      backgroundColor: "#D7A94B",
    },

    actionButtonText: {
      color: "#FFF",
      fontSize: 14,
      fontWeight: "900",
      marginLeft: 8,
    },

    darkActionText: {
      color: "#090A0D",
      fontSize: 14,
      fontWeight: "900",
      marginLeft: 8,
    },

    disabledButton: {
      opacity: 0.35,
    },

    oneInvestigation: {
      color: "#777983",
      textAlign: "center",
      fontSize: 10,
      marginTop: 9,
    },

    investigationCard: {
      backgroundColor: "#171A20",
      borderWidth: 1,
      borderColor: "#D7A94B",
      borderRadius: 15,
      padding: 14,
      flexDirection: "row",
      alignItems: "center",
      marginTop: 11,
    },

    investigationText: {
      flex: 1,
      color: "#D7A94B",
      fontSize: 13,
      fontWeight: "800",
      marginLeft: 10,
      lineHeight: 19,
    },

    waitingCard: {
      backgroundColor: "#15171B",
      borderRadius: 18,
      padding: 20,
      alignItems: "center",
      marginBottom: 18,
    },

    waitingTitle: {
      color: "#F4F1EF",
      fontSize: 16,
      fontWeight: "900",
      marginTop: 9,
    },

    waitingText: {
      color: "#777983",
      fontSize: 11,
      marginTop: 4,
    },

    dayHeader: {
      marginBottom: 7,
    },

    voteButton: {
      height: 55,
      borderRadius: 15,
      backgroundColor: "#D7A94B",
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      marginTop: 11,
    },

    voteText: {
      color: "#090A0D",
      fontSize: 14,
      fontWeight: "900",
      marginLeft: 8,
    },

    voiceCard: {
      backgroundColor: "#15171B",
      borderRadius: 17,
      padding: 13,
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 18,
      borderWidth: 1,
      borderColor: "#282A2F",
    },

    voiceIcon: {
      width: 45,
      height: 45,
      borderRadius: 14,
      backgroundColor: "#24262B",
      alignItems: "center",
      justifyContent: "center",
    },

    voiceContent: {
      flex: 1,
      marginLeft: 10,
    },

    voiceTitle: {
      color: "#F4F1EF",
      fontSize: 14,
      fontWeight: "900",
    },

    voiceText: {
      color: "#777983",
      fontSize: 10,
      marginTop: 3,
    },

    micButton: {
      backgroundColor: "#24262B",
      borderRadius: 11,
      paddingHorizontal: 15,
      paddingVertical: 10,
    },

    micButtonActive: {
      backgroundColor: "#31563A",
    },

    micButtonText: {
      color: "#D7A94B",
      fontSize: 10,
      fontWeight: "900",
    },

    chatSection: {
      marginBottom: 20,
    },

    chatHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 10,
    },

    messagesBox: {
      backgroundColor: "#111318",
      borderRadius: 16,
      padding: 12,
      minHeight: 90,
      maxHeight: 360,
    },

    emptyMessages: {
      color: "#666870",
      textAlign: "center",
      paddingVertical: 24,
      fontSize: 11,
    },

    messageRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      marginBottom: 9,
    },

    messageAvatar: {
      width: 34,
      height: 34,
      borderRadius: 17,
    },

    messageAvatarFallback: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: "#24262B",
      alignItems: "center",
      justifyContent: "center",
    },

    messageBubble: {
      flex: 1,
      backgroundColor: "#1A1C21",
      borderRadius: 13,
      padding: 9,
      marginLeft: 8,
    },

    messageName: {
      color: "#D7A94B",
      fontSize: 10,
      fontWeight: "900",
      marginBottom: 2,
    },

    messageText: {
      color: "#E2E0DD",
      fontSize: 12,
      lineHeight: 17,
    },

    inputRow: {
      flexDirection: "row",
      alignItems: "flex-end",
      marginTop: 9,
    },

    messageInput: {
      flex: 1,
      minHeight: 48,
      maxHeight: 100,
      backgroundColor: "#15171B",
      borderWidth: 1,
      borderColor: "#282A2F",
      borderRadius: 14,
      color: "#F4F1EF",
      paddingHorizontal: 13,
      paddingVertical: 11,
      fontSize: 12,
    },

    sendButton: {
      width: 48,
      height: 48,
      borderRadius: 14,
      backgroundColor: "#D7A94B",
      alignItems: "center",
      justifyContent: "center",
      marginLeft: 7,
    },

    disabledSend: {
      opacity: 0.35,
    },

    chatClosed: {
      backgroundColor: "#121419",
      borderRadius: 13,
      padding: 13,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
    },

    chatClosedText: {
      color: "#666870",
      fontSize: 11,
      marginLeft: 7,
    },

    playersSection: {
      marginTop: 3,
    },

    playersSectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 10,
    },

    playerCount: {
      color: "#777983",
      fontSize: 10,
      fontWeight: "800",
    },

    deadInfo: {
      backgroundColor: "#151317",
      borderRadius: 13,
      padding: 12,
      flexDirection: "row",
      alignItems: "center",
      marginTop: 7,
    },

    deadInfoText: {
      flex: 1,
      color: "#777983",
      fontSize: 10,
      lineHeight: 16,
      marginLeft: 8,
    },

    bottomSpace: {
      height: 20,
    },
  });
