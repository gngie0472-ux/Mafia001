import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  RefreshControl,
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
import { SafeAreaView } from "react-native-safe-area-context";

import { supabase } from "@/lib/supabase";

import {
  GamePlayer,
  GameRole,
  GameState,
  advanceMafiaPhase,
  getGameState,
  getMyRole,
  submitDayVote,
  submitNightAction,
} from "@/lib/game";

type NightAction =
  | "kill"
  | "protect"
  | "investigate";

type Message = {
  id: string;
  room_id: string;
  user_id: string;
  message: string;
  created_at: string;
};

type Profile = {
  user_id: string;
  username: string;
  avatar_url: string | null;
};

export default function GameScreen() {
  const params = useLocalSearchParams<{
    code?: string | string[];
  }>();

  const router = useRouter();

  const roomParam = Array.isArray(params.code)
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

  const [currentUserId, setCurrentUserId] =
    useState<string | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [submitting, setSubmitting] =
    useState(false);

  const [secondsLeft, setSecondsLeft] =
    useState(0);

  const [investigationRound, setInvestigationRound] =
    useState<number | null>(null);

  const [investigationResult, setInvestigationResult] =
    useState<boolean | null>(null);

  const [messages, setMessages] =
    useState<Message[]>([]);

  const [profiles, setProfiles] =
    useState<Record<string, Profile>>({});

  const [messageText, setMessageText] =
    useState("");

  const [sendingMessage, setSendingMessage] =
    useState(false);

  /*
   * ------------------------------------------------
   * Resolve room
   * ------------------------------------------------
   */

  const resolveRoom = useCallback(async () => {
    if (!roomParam) {
      throw new Error("الغرفة غير محددة.");
    }

    const byId = await supabase
      .from("rooms")
      .select("id")
      .eq("id", roomParam)
      .maybeSingle();

    if (byId.data?.id) {
      return byId.data.id as string;
    }

    const byCode = await supabase
      .from("rooms")
      .select("id")
      .eq("code", roomParam.toUpperCase())
      .maybeSingle();

    if (byCode.error) {
      throw byCode.error;
    }

    if (!byCode.data?.id) {
      throw new Error("الغرفة غير موجودة.");
    }

    return byCode.data.id as string;
  }, [roomParam]);

  /*
   * ------------------------------------------------
   * Current user
   * ------------------------------------------------
   */

  const loadCurrentUser = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      throw new Error("لم يتم تسجيل الدخول.");
    }

    setCurrentUserId(user.id);

    return user.id;
  }, []);

  /*
   * ------------------------------------------------
   * Messages
   *
   * يجب تعريفها قبل Realtime لأن Realtime
   * يستخدمها.
   * ------------------------------------------------
   */

  const loadMessages = useCallback(
    async (id: string) => {
      const { data, error } =
        await supabase
          .from("room_messages")
          .select(
            "id, room_id, user_id, message, created_at"
          )
          .eq("room_id", id)
          .order("created_at", {
            ascending: true,
          })
          .limit(100);

      if (error) {
        console.log(
          "messages:",
          error.message
        );
        return;
      }

      setMessages(
        (data ?? []) as Message[]
      );
    },
    []
  );

  /*
   * ------------------------------------------------
   * Load profiles
   *
   * مهم:
   * GamePlayer.id = room_players.id
   * GamePlayer.user_id = profiles.user_id
   *
   * لذلك يجب استخدام user_id.
   * ------------------------------------------------
   */

  const loadProfiles = useCallback(
    async (state: GameState) => {
      const ids = state.players
        .map(
          (player) =>
            player.user_id
        )
        .filter(Boolean);

      if (ids.length === 0) {
        return;
      }

      const { data, error } =
        await supabase
          .from("profiles")
          .select(
            "user_id, username, avatar_url"
          )
          .in("user_id", ids);

      if (error) {
        console.log(
          "profiles:",
          error.message
        );
        return;
      }

      if (!data) {
        return;
      }

      const map: Record<
        string,
        Profile
      > = {};

      for (const profile of data) {
        map[profile.user_id] =
          profile as Profile;
      }

      setProfiles(map);
    },
    []
  );

  /*
   * ------------------------------------------------
   * Load game
   * ------------------------------------------------
   */

  const loadGame = useCallback(
    async (showLoading = false) => {
      try {
        if (showLoading) {
          setLoading(true);
        }

        const id =
          roomId ??
          (await resolveRoom());

        if (!roomId) {
          setRoomId(id);
        }

        await loadCurrentUser();

        const [state, myRole] =
          await Promise.all([
            getGameState(id),
            getMyRole(id),
          ]);

        setGame(state);
        setRole(myRole.role);
        setMyAlive(myRole.alive);

        await loadProfiles(state);

        /*
         * الجولة الجديدة تعني أن المحقق
         * يستطيع التحقيق من جديد.
         */

        if (
          investigationRound !== null &&
          state.room.game_round !==
            investigationRound
        ) {
          setInvestigationRound(null);
          setInvestigationResult(null);
        }
      } catch (error: any) {
        console.error(
          "load game:",
          error
        );

        if (showLoading) {
          Alert.alert(
            "خطأ",
            error?.message ||
              "تعذر تحميل اللعبة."
          );
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [
      roomId,
      resolveRoom,
      loadCurrentUser,
      loadProfiles,
      investigationRound,
    ]
  );

  /*
   * ------------------------------------------------
   * Initial load
   * ------------------------------------------------
   */

  useEffect(() => {
    loadGame(true);
  }, [loadGame]);

  /*
   * ------------------------------------------------
   * Polling
   * ------------------------------------------------
   */

  useEffect(() => {
    const interval =
      setInterval(() => {
        loadGame(false);
      }, 1500);

    return () => {
      clearInterval(interval);
    };
  }, [loadGame]);

  /*
   * ------------------------------------------------
   * Realtime
   * ------------------------------------------------
   */

  useEffect(() => {
    if (!roomId) {
      return;
    }

    const channel = supabase
      .channel(`game-${roomId}`)
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
          loadMessages(roomId);
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
   * ------------------------------------------------
   * Messages polling
   * ------------------------------------------------
   */

  useEffect(() => {
    if (!roomId) {
      return;
    }

    loadMessages(roomId);

    const timer =
      setInterval(() => {
        loadMessages(roomId);
      }, 2000);

    return () => {
      clearInterval(timer);
    };
  }, [roomId, loadMessages]);

  /*
   * ------------------------------------------------
   * Countdown
   * ------------------------------------------------
   */

  useEffect(() => {
    if (
      !game ||
      game.room.status !==
        "playing" ||
      !game.room.phase_ends_at
    ) {
      setSecondsLeft(0);
      return;
    }

    const update = () => {
      const end =
        new Date(
          game.room.phase_ends_at
        ).getTime();

      const remaining =
        Math.max(
          0,
          Math.ceil(
            (end -
              Date.now()) /
              1000
          )
        );

      setSecondsLeft(
        remaining
      );
    };

    update();

    const timer =
      setInterval(
        update,
        250
      );

    return () => {
      clearInterval(timer);
    };
  }, [
    game?.room?.phase_ends_at,
    game?.room?.status,
  ]);

  /*
   * ------------------------------------------------
   * Automatic phase transition
   * ------------------------------------------------
   */

  useEffect(() => {
    if (
      !roomId ||
      !game ||
      game.room.status !==
        "playing" ||
      !game.room.phase_ends_at
    ) {
      return;
    }

    const endTime =
      new Date(
        game.room.phase_ends_at
      ).getTime();

    let advancing = false;

    async function check() {
      if (
        advancing ||
        Date.now() < endTime
      ) {
        return;
      }

      advancing = true;

      try {
        await advanceMafiaPhase(
          roomId
        );
      } catch (error) {
        console.log(
          "phase transition:",
          error
        );
      }

      await loadGame(false);

      advancing = false;
    }

    check();

    const timer =
      setInterval(
        check,
        1000
      );

    return () => {
      clearInterval(timer);
    };
  }, [
    roomId,
    game?.room?.status,
    game?.room?.phase_ends_at,
    loadGame,
  ]);

  /*
   * ------------------------------------------------
   * Send day message
   * ------------------------------------------------
   */

  async function sendMessage() {
    if (
      !roomId ||
      !messageText.trim() ||
      sendingMessage
    ) {
      return;
    }

    if (
      !game ||
      game.room.game_phase !==
        "day"
    ) {
      Alert.alert(
        "الدردشة مغلقة",
        "يمكن التواصل أثناء النهار فقط."
      );
      return;
    }

    if (!myAlive) {
      Alert.alert(
        "أنت ميت",
        "اللاعبون الذين ماتوا لا يستطيعون التحدث."
      );
      return;
    }

    if (secondsLeft <= 0) {
      return;
    }

    try {
      setSendingMessage(true);

      const text =
        messageText.trim();

      const { error } =
        await supabase.rpc(
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

      await loadMessages(
        roomId
      );
    } catch (error: any) {
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
  }

  /*
   * ------------------------------------------------
   * Computed state
   * ------------------------------------------------
   */

  const isNight =
    game?.room.game_phase ===
    "night";

  const isDay =
    game?.room.game_phase ===
    "day";

  const phaseFinished =
    game?.room.phase_ends_at
      ? new Date(
          game.room.phase_ends_at
        ).getTime() <=
        Date.now()
      : false;

  const alivePlayers =
    useMemo(() => {
      return (
        game?.players ?? []
      ).filter(
        (player) =>
          player.alive
      );
    }, [game]);

  const voteTargets =
    useMemo(() => {
      if (!game) {
        return [];
      }

      return game.players.filter(
        (player) =>
          player.alive &&
          player.id !==
            game.my_player_id
      );
    }, [game]);

  const formattedTime =
    useMemo(() => {
      const minutes =
        Math.floor(
          secondsLeft / 60
        );

      const seconds =
        secondsLeft % 60;

      return `${String(
        minutes
      ).padStart(
        2,
        "0"
      )}:${String(
        seconds
      ).padStart(
        2,
        "0"
      )}`;
    }, [secondsLeft]);

  /*
   * ------------------------------------------------
   * Player display helpers
   * ------------------------------------------------
   */

  function playerName(
    player: GamePlayer
  ) {
    return (
      profiles[
        player.user_id
      ]?.username ||
      player.name ||
      "Player"
    );
  }

  function playerAvatar(
    player: GamePlayer
  ) {
    return (
      profiles[
        player.user_id
      ]?.avatar_url ||
      player.avatar_url ||
      null
    );
  }

  function PlayerAvatar({
    player,
  }: {
    player: GamePlayer;
  }) {
    const avatar =
      playerAvatar(player);

    if (avatar) {
      return (
        <Image
          source={{
            uri: avatar,
          }}
          style={
            styles.playerAvatar
          }
        />
      );
    }

    return (
      <View
        style={
          styles.playerAvatarFallback
        }
      >
        <Ionicons
          name="person"
          size={19}
          color="#D7A94B"
        />
      </View>
    );
  }

  /*
   * ------------------------------------------------
   * Night targets
   * ------------------------------------------------
   */

  const nightTargets =
    useMemo(() => {
      if (
        !game ||
        !role
      ) {
        return [];
      }

      return game.players.filter(
        (player) => {
          if (!player.alive) {
            return false;
          }

          if (
            player.id ===
            game.my_player_id
          ) {
            /*
             * لا يمكن اختيار نفسك.
             */
            return false;
          }

          return true;
        }
      );
    }, [game, role]);

  /*
   * ------------------------------------------------
   * Night action
   * ------------------------------------------------
   */

  async function performNightAction(
    action: NightAction,
    target: GamePlayer
  ) {
    if (
      !roomId ||
      !game
    ) {
      return;
    }

    if (!myAlive) {
      Alert.alert(
        "أنت خارج اللعبة",
        "لا يمكنك تنفيذ أي إجراء."
      );
      return;
    }

    if (!isNight) {
      Alert.alert(
        "ليس الليل",
        "هذا الإجراء متاح أثناء الليل فقط."
      );
      return;
    }

    if (phaseFinished) {
      Alert.alert(
        "انتهى الوقت",
        "انتهى وقت الليل."
      );
      return;
    }

    if (!target.alive) {
      Alert.alert(
        "هدف غير صالح",
        "هذا اللاعب ميت."
      );
      return;
    }

    if (
      target.id ===
      game.my_player_id
    ) {
      Alert.alert(
        "غير مسموح",
        "لا يمكنك اختيار نفسك."
      );
      return;
    }

    /*
     * المحقق يستطيع التحقيق مع لاعب
     * واحد فقط في الجولة.
     */

    if (
      action ===
        "investigate" &&
      investigationRound ===
        game.room.game_round
    ) {
      Alert.alert(
        "تم التحقيق مسبقًا",
        "المحقق يستطيع التحقيق مع شخص واحد فقط كل ليلة."
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

      /*
       * نتيجة التحقيق.
       *
       * ندعم شكل:
       * { is_mafia: true/false }
       */

      if (
        action ===
          "investigate" &&
        result &&
        typeof result ===
          "object" &&
        "is_mafia" in
          result
      ) {
        const mafia =
          Boolean(
            (result as any)
              .is_mafia
          );

        setInvestigationResult(
          mafia
        );

        setInvestigationRound(
          game.room.game_round
        );

        Alert.alert(
          "نتيجة التحقيق",
          mafia
            ? `اللاعب ${playerName(
                target
              )} هو المافيا 🔴`
            : `اللاعب ${playerName(
                target
              )} ليس المافيا 🟢`
        );
      } else if (
        action === "kill"
      ) {
        Alert.alert(
          "تم تسجيل الهدف",
          "سيتم تنفيذ قرار المافيا عند انتهاء الليل."
        );
      } else if (
        action === "protect"
      ) {
        Alert.alert(
          "تمت الحماية",
          `تم تسجيل ${playerName(
            target
          )} للحماية.`
        );
      } else {
        Alert.alert(
          "تم",
          "تم تسجيل الإجراء."
        );
      }

      await loadGame(false);
    } catch (error: any) {
      console.error(
        "night action:",
        error
      );

      Alert.alert(
        "تعذر تنفيذ الإجراء",
        error?.message ||
          "حدث خطأ غير متوقع."
      );
    } finally {
      setSubmitting(false);
    }
  }

  /*
   * ------------------------------------------------
   * Vote
   * ------------------------------------------------
   */

  async function performVote(
    target: GamePlayer
  ) {
    if (
      !roomId ||
      !game
    ) {
      return;
    }

    if (!myAlive) {
      Alert.alert(
        "أنت ميت",
        "لا يمكنك التصويت."
      );
      return;
    }

    if (!isDay) {
      Alert.alert(
        "ليس وقت التصويت",
        "التصويت متاح أثناء النهار."
      );
      return;
    }

    if (phaseFinished) {
      Alert.alert(
        "انتهى التصويت",
        "انتهى الوقت."
      );
      return;
    }

    if (!target.alive) {
      Alert.alert(
        "هدف غير صالح",
        "هذا اللاعب ميت."
      );
      return;
    }

    if (
      target.id ===
      game.my_player_id
    ) {
      Alert.alert(
        "غير مسموح",
        "لا يمكنك التصويت لنفسك."
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
        "تم التصويت",
        `صوتك ذهب إلى ${playerName(
          target
        )}.`
      );

      await loadGame(false);
    } catch (error: any) {
      Alert.alert(
        "تعذر التصويت",
        error?.message ||
          "حدث خطأ أثناء التصويت."
      );
    } finally {
      setSubmitting(false);
    }
  }

  /*
   * ------------------------------------------------
   * Role
   * ------------------------------------------------
   */

  function roleName(
    value: GameRole | null
  ) {
    switch (value) {
      case "MAFIA":
        return "MAFIA";

      case "DOCTOR":
        return "DOCTOR";

      case "DETECTIVE":
        return "DETECTIVE";

      case "CITIZEN":
        return "CITIZEN";

      default:
        return "UNKNOWN";
    }
  }

  function roleDescription(
    value: GameRole | null
  ) {
    switch (value) {
      case "MAFIA":
        return "اقضِ على اللاعبين ليلًا دون أن يتم كشفك.";

      case "DOCTOR":
        return "احمِ لاعبًا واحدًا كل ليلة.";

      case "DETECTIVE":
        return "تحقق من لاعب واحد فقط كل ليلة.";

      case "CITIZEN":
        return "اكتشف المافيا وصوّت عليها أثناء النهار.";

      default:
        return "";
    }
  }

  /*
   * ------------------------------------------------
   * Safe event text
   * ------------------------------------------------
   */

  function getEventText() {
    const event =
      game?.room.last_event;

    if (!event) {
      return "";
    }

    if (
      typeof event ===
      "string"
    ) {
      return event;
    }

    if (
      typeof event ===
        "object" &&
      event !== null
    ) {
      const type =
        (event as any).type;

      if (
        type ===
        "night_saved"
      ) {
        return "الطبيب أنقذ اللاعب المستهدف الليلة.";
      }

      if (
        type ===
        "night_kill"
      ) {
        return "تم العثور على لاعب ميت بعد انتهاء الليل.";
      }

      if (
        type ===
        "day_vote"
      ) {
        return "انتهى التصويت وتم إخراج لاعب.";
      }

      if (
        type ===
        "day_tie"
      ) {
        return "انتهى التصويت بالتعادل.";
      }

      if (
        type ===
        "winner"
      ) {
        return `انتهت اللعبة. الفائز: ${
          (event as any)
            .winner ||
          "غير محدد"
        }`;
      }

      try {
        return JSON.stringify(
          event
        );
      } catch {
        return "";
      }
    }

    return "";
  }

  /*
   * ------------------------------------------------
   * Loading
   * ------------------------------------------------
   */

  if (
    loading &&
    !game
  ) {
    return (
      <SafeAreaView
        style={styles.safe}
      >
        <View
          style={styles.center}
        >
          <ActivityIndicator
            size="large"
            color="#D7A94B"
          />

          <Text
            style={
              styles.loading
            }
          >
            جاري دخول اللعبة...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!game) {
    return (
      <SafeAreaView
        style={styles.safe}
      >
        <View
          style={styles.center}
        >
          <Text
            style={styles.error}
          >
            تعذر تحميل اللعبة
          </Text>

          <Pressable
            onPress={() =>
              loadGame(true)
            }
            style={
              styles.retry
            }
          >
            <Text
              style={
                styles.retryText
              }
            >
              TRY AGAIN
            </Text>
          </Pressable>

          <Pressable
            onPress={() =>
              router.replace(
                "/rooms"
              )
            }
            style={
              styles.backRoomsButton
            }
          >
            <Text
              style={
                styles.backRoomsText
              }
            >
              BACK TO ROOMS
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  /*
   * ------------------------------------------------
   * Finished
   * ------------------------------------------------
   */

  if (
    game.room.status ===
    "finished"
  ) {
    const winner =
      game.room.winner;

    return (
      <SafeAreaView
        style={styles.safe}
      >
        <ScrollView
          contentContainerStyle={
            styles.finishedContainer
          }
        >
          <View
            style={
              styles.finishedIcon
            }
          >
            <Ionicons
              name="trophy"
              size={48}
              color="#D7A94B"
            />
          </View>

          <Text
            style={
              styles.finishedTitle
            }
          >
            GAME OVER
          </Text>

          <Text
            style={
              styles.finishedWinner
            }
          >
            {winner ===
            "MAFIA"
              ? "MAFIA WINS"
              : "CITIZENS WIN"}
          </Text>

          <View
            style={
              styles.finalPlayers
            }
          >
            {game.players.map(
              (player) => (
                <View
                  key={
                    player.id
                  }
                  style={
                    styles.finalPlayer
                  }
                >
                  <PlayerAvatar
                    player={
                      player
                    }
                  />

                  <View
                    style={{
                      flex: 1,
                    }}
                  >
                    <Text
                      style={
                        styles.finalName
                      }
                    >
                      {playerName(
                        player
                      )}
                    </Text>

                    <Text
                      style={
                        styles.finalRole
                      }
                    >
                      {player.alive
                        ? "ALIVE"
                        : "DEAD"}
                    </Text>
                  </View>
                </View>
              )
            )}
          </View>

          <Pressable
            style={
              styles.exitButton
            }
            onPress={() =>
              router.replace(
                "/rooms"
              )
            }
          >
            <Text
              style={
                styles.exitText
              }
            >
              BACK TO ROOMS
            </Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const eventText =
    getEventText();

  return (
    <SafeAreaView
      style={styles.safe}
    >
      <ScrollView
        contentContainerStyle={
          styles.container
        }
        refreshControl={
          <RefreshControl
            refreshing={
              refreshing
            }
            onRefresh={() => {
              setRefreshing(
                true
              );

              loadGame(
                false
              );
            }}
            tintColor="#D7A94B"
          />
        }
        showsVerticalScrollIndicator={
          false
        }
      >
        {/* HEADER */}

        <View
          style={styles.header}
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
                styles.round
              }
            >
              ROUND{" "}
              {
                game.room
                  .game_round
              }
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
              size={16}
              color="#FFF"
            />

            <Text
              style={
                styles.phaseText
              }
            >
              {isNight
                ? "NIGHT"
                : "DAY"}
            </Text>
          </View>
        </View>

        {/* COUNTDOWN */}

        <View
          style={
            styles.timerCard
          }
        >
          <Text
            style={
              styles.timerLabel
            }
          >
            {isNight
              ? "NIGHT ENDS IN"
              : "DAY ENDS IN"}
          </Text>

          <Text
            style={[
              styles.timer,
              secondsLeft <=
                10 &&
                styles.timerDanger,
            ]}
          >
            {formattedTime}
          </Text>

          <View
            style={
              styles.timerBar
            }
          >
            <View
              style={[
                styles.timerProgress,
                {
                  width: `${Math.min(
                    100,
                    secondsLeft /
                      (isNight
                        ? 60
                        : 120) *
                      100
                  )}%`,
                },
              ]}
            />
          </View>
        </View>

        {/* ROLE */}

        <View
          style={styles.roleCard}
        >
          <View
            style={
              styles.roleIcon
            }
          >
            <Ionicons
              name={
                role ===
                "MAFIA"
                  ? "skull"
                  : role ===
                    "DOCTOR"
                  ? "medkit"
                  : role ===
                    "DETECTIVE"
                  ? "search"
                  : "people"
              }
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
                styles.roleLabel
              }
            >
              YOUR ROLE
            </Text>

            <Text
              style={
                styles.roleName
              }
            >
              {roleName(role)}
            </Text>

            <Text
              style={
                styles.roleDescription
              }
            >
              {roleDescription(
                role
              )}
            </Text>
          </View>
        </View>

        {/* DEAD */}

        {!myAlive && (
          <View
            style={
              styles.deadBanner
            }
          >
            <Ionicons
              name="skull"
              size={22}
              color="#B5222E"
            />

            <View
              style={{
                flex: 1,
              }}
            >
              <Text
                style={
                  styles.deadTitle
                }
              >
                YOU ARE DEAD
              </Text>

              <Text
                style={
                  styles.deadText
                }
              >
                يمكنك مشاهدة اللعبة، لكن لا يمكنك
                التصويت أو إرسال الرسائل أو تنفيذ
                الإجراءات.
              </Text>
            </View>
          </View>
        )}

        {/* NIGHT */}

        {isNight &&
          myAlive && (
            <View>
              <Text
                style={
                  styles.sectionTitle
                }
              >
                NIGHT ACTION
              </Text>

              {role ===
                "MAFIA" && (
                <View>
                  <Text
                    style={
                      styles.helper
                    }
                  >
                    اختر اللاعب الذي تريد قتله.
                  </Text>

                  {nightTargets.map(
                    (
                      player
                    ) => (
                      <Pressable
                        key={
                          player.id
                        }
                        disabled={
                          submitting ||
                          phaseFinished
                        }
                        onPress={() =>
                          performNightAction(
                            "kill",
                            player
                          )
                        }
                        style={
                          styles.targetCard
                        }
                      >
                        <PlayerAvatar
                          player={
                            player
                          }
                        />

                        <View
                          style={{
                            flex: 1,
                          }}
                        >
                          <Text
                            style={
                              styles.targetName
                            }
                          >
                            {playerName(
                              player
                            )}
                          </Text>

                          <Text
                            style={
                              styles.targetStatus
                            }
                          >
                            ALIVE
                          </Text>
                        </View>

                        <Ionicons
                          name="skull-outline"
                          size={
                            22
                          }
                          color="#B5222E"
                        />
                      </Pressable>
                    )
                  )}
                </View>
              )}

              {role ===
                "DOCTOR" && (
                <View>
                  <Text
                    style={
                      styles.helper
                    }
                  >
                    اختر لاعبًا لحمايته الليلة.
                  </Text>

                  {[
                    ...game.players.filter(
                      (
                        player
                      ) =>
                        player.alive
                    ),
                  ].map(
                    (
                      player
                    ) => (
                      <Pressable
                        key={
                          player.id
                        }
                        disabled={
                          submitting ||
                          phaseFinished
                        }
                        onPress={() =>
                          performNightAction(
                            "protect",
                            player
                          )
                        }
                        style={
                          styles.targetCard
                        }
                      >
                        <PlayerAvatar
                          player={
                            player
                          }
                        />

                        <View
                          style={{
                            flex: 1,
                          }}
                        >
                          <Text
                            style={
                              styles.targetName
                            }
                          >
                            {playerName(
                              player
                            )}
                          </Text>
                        </View>

                        <Ionicons
                          name="shield-checkmark-outline"
                          size={
                            23
                          }
                          color="#59C878"
                        />
                      </Pressable>
                    )
                  )}
                </View>
              )}

              {role ===
                "DETECTIVE" && (
                <View>
                  <Text
                    style={
                      styles.helper
                    }
                  >
                    يمكنك التحقيق مع شخص واحد فقط في
                    هذه الليلة.
                  </Text>

                  {investigationRound ===
                  game.room.game_round ? (
                    <View
                      style={
                        styles.investigationDone
                      }
                    >
                      <Ionicons
                        name={
                          investigationResult
                            ? "alert-circle"
                            : "checkmark-circle"
                        }
                        size={
                          25
                        }
                        color={
                          investigationResult
                            ? "#B5222E"
                            : "#59C878"
                        }
                      />

                      <Text
                        style={
                          styles.investigationDoneText
                        }
                      >
                        {investigationResult
                          ? "الهدف الذي حققت معه هو المافيا."
                          : "الهدف الذي حققت معه ليس المافيا."}
                      </Text>
                    </View>
                  ) : (
                    nightTargets.map(
                      (
                        player
                      ) => (
                        <Pressable
                          key={
                            player.id
                          }
                          disabled={
                            submitting ||
                            phaseFinished
                          }
                          onPress={() =>
                            performNightAction(
                              "investigate",
                              player
                            )
                          }
                          style={
                            styles.targetCard
                          }
                        >
                          <PlayerAvatar
                            player={
                              player
                            }
                          />

                          <View
                            style={{
                              flex: 1,
                            }}
                          >
                            <Text
                              style={
                                styles.targetName
                              }
                            >
                              {playerName(
                                player
                              )}
                            </Text>
                          </View>

                          <Ionicons
                            name="search"
                            size={
                              22
                            }
                            color="#D7A94B"
                          />
                        </Pressable>
                      )
                    )
                  )}
                </View>
              )}

              {role ===
                "CITIZEN" && (
                <View
                  style={
                    styles.waitCard
                  }
                >
                  <Ionicons
                    name="moon"
                    size={30}
                    color="#777983"
                  />

                  <Text
                    style={
                      styles.waitTitle
                    }
                  >
                    WAIT FOR MORNING
                  </Text>

                  <Text
                    style={
                      styles.waitText
                    }
                  >
                    المواطنون ينتظرون انتهاء الليل.
                  </Text>
                </View>
              )}
            </View>
          )}

        {/* DAY */}

        {isDay && (
          <View>
            <Text
              style={
                styles.sectionTitle
              }
            >
              DAY
            </Text>

            {eventText !==
              "" && (
              <View
                style={
                  styles.eventCard
                }
              >
                <Ionicons
                  name="megaphone-outline"
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

            <Text
              style={
                styles.helper
              }
            >
              اللاعبون الأحياء يمكنهم التصويت قبل انتهاء
              المؤقت.
            </Text>

            {myAlive &&
              voteTargets.map(
                (
                  player
                ) => (
                  <Pressable
                    key={
                      player.id
                    }
                    disabled={
                      submitting ||
                      phaseFinished
                    }
                    onPress={() =>
                      performVote(
                        player
                      )
                    }
                    style={
                      styles.voteCard
                    }
                  >
                    <PlayerAvatar
                      player={
                        player
                      }
                    />

                    <View
                      style={{
                        flex: 1,
                      }}
                    >
                      <Text
                        style={
                          styles.targetName
                        }
                      >
                        {playerName(
                          player
                        )}
                      </Text>

                      <Text
                        style={
                          styles.targetStatus
                        }
                      >
                        VOTE FOR PLAYER
                      </Text>
                    </View>

                    <Ionicons
                      name="radio-button-off"
                      size={
                        23
                      }
                      color="#B5222E"
                    />
                  </Pressable>
                )
              )}

            {myAlive &&
              voteTargets.length ===
                0 && (
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
                    لا يوجد لاعب آخر صالح للتصويت.
                  </Text>
                </View>
              )}
          </View>
        )}

        {/* ALL PLAYERS */}

        <Text
          style={
            styles.sectionTitle
          }
        >
          PLAYERS
        </Text>

        <View
          style={
            styles.playersCard
          }
        >
          {game.players.map(
            (
              player
            ) => {
              const isMe =
                player.id ===
                game.my_player_id;

              return (
                <View
                  key={
                    player.id
                  }
                  style={[
                    styles.gamePlayer,
                    !player.alive &&
                      styles.deadPlayer,
                  ]}
                >
                  <PlayerAvatar
                    player={
                      player
                    }
                  />

                  <View
                    style={{
                      flex: 1,
                    }}
                  >
                    <View
                      style={
                        styles.nameLine
                      }
                    >
                      <Text
                        style={
                          styles.gamePlayerName
                        }
                      >
                        {playerName(
                          player
                        )}
                      </Text>

                      {isMe && (
                        <Text
                          style={
                            styles.you
                          }
                        >
                          YOU
                        </Text>
                      )}
                    </View>

                    <Text
                      style={[
                        styles.playerState,
                        player.alive
                          ? styles.alive
                          : styles.dead,
                      ]}
                    >
                      {player.alive
                        ? "ALIVE"
                        : "DEAD"}
                    </Text>
                  </View>

                  {!player.alive && (
                    <Ionicons
                      name="skull"
                      size={20}
                      color="#B5222E"
                    />
                  )}
                </View>
              );
            }
          )}
        </View>

        {/* DAY CHAT */}

        {isDay && (
          <View>
            <Text
              style={
                styles.sectionTitle
              }
            >
              DAY CHAT
            </Text>

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
                <View
                  style={
                    styles.chatLiveDot
                  }
                />

                <Text
                  style={
                    styles.chatHeaderText
                  }
                >
                  LIVE CHAT
                </Text>

                <Text
                  style={
                    styles.chatTimer
                  }
                >
                  {formattedTime}
                </Text>
              </View>

              <View
                style={
                  styles.messages
                }
              >
                {messages.length ===
                0 ? (
                  <Text
                    style={
                      styles.emptyMessages
                    }
                  >
                    لا توجد رسائل بعد.
                  </Text>
                ) : (
                  messages.map(
                    (
                      message
                    ) => {
                      const sender =
                        profiles[
                          message.user_id
                        ];

                      const own =
                        message.user_id ===
                        currentUserId;

                      return (
                        <View
                          key={
                            message.id
                          }
                          style={[
                            styles.messageRow,
                            own &&
                              styles.messageOwn,
                          ]}
                        >
                          <Text
                            style={
                              styles.messageSender
                            }
                          >
                            {sender?.username ||
                              "Player"}
                          </Text>

                          <View
                            style={[
                              styles.messageBubble,
                              own &&
                                styles.messageBubbleOwn,
                            ]}
                          >
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
              secondsLeft >
                0 ? (
                <View
                  style={
                    styles.messageInputRow
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
                    maxLength={
                      300
                    }
                    editable={
                      !sendingMessage
                    }
                  />

                  <Pressable
                    onPress={
                      sendMessage
                    }
                    disabled={
                      sendingMessage ||
                      !messageText.trim()
                    }
                    style={[
                      styles.sendButton,
                      (!messageText.trim() ||
                        sendingMessage) &&
                        styles.sendDisabled,
                    ]}
                  >
                    {sendingMessage ? (
                      <ActivityIndicator
                        size="small"
                        color="#090A0D"
                      />
                    ) : (
                      <Ionicons
                        name="send"
                        size={
                          19
                        }
                        color="#090A0D"
                      />
                    )}
                  </Pressable>
                </View>
              ) : (
                <Text
                  style={
                    styles.chatClosed
                  }
                >
                  الدردشة مغلقة.
                </Text>
              )}
            </View>
          </View>
        )}

        {/* MICROPHONE */}

        {isDay &&
          myAlive && (
            <View>
              <Text
                style={
                  styles.sectionTitle
                }
              >
                VOICE
              </Text>

              <Pressable
                style={
                  styles.voiceButton
                }
                onPress={() =>
                  Alert.alert(
                    "Voice",
                    "الميكروفون الصوتي يحتاج طبقة WebRTC أو LiveKit للبث المباشر بين اللاعبين. expo-audio وحده لا يوفر مكالمة جماعية مباشرة."
                  )
                }
              >
                <View
                  style={
                    styles.voiceIcon
                  }
                >
                  <Ionicons
                    name="mic"
                    size={23}
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
                      styles.voiceTitle
                    }
                  >
                    MICROPHONE
                  </Text>

                  <Text
                    style={
                      styles.voiceText
                    }
                  >
                    التواصل الصوتي متاح أثناء النهار
                  </Text>
                </View>

                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color="#777983"
                />
              </Pressable>
            </View>
          )}

        <View
          style={
            styles.bottomSpace
          }
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#090A0D",
  },

  container: {
    padding: 18,
    paddingBottom: 50,
  },

  finishedContainer: {
    flexGrow: 1,
    padding: 22,
    justifyContent: "center",
  },

  center: {
    flex: 1,
    backgroundColor: "#090A0D",
    alignItems: "center",
    justifyContent: "center",
    padding: 25,
  },

  loading: {
    color: "#999",
    marginTop: 15,
  },

  error: {
    color: "#FFF",
    fontSize: 19,
    fontWeight: "900",
    textAlign: "center",
  },

  retry: {
    marginTop: 20,
    backgroundColor: "#D7A94B",
    paddingHorizontal: 24,
    paddingVertical: 13,
    borderRadius: 12,
  },

  retryText: {
    color: "#090A0D",
    fontWeight: "900",
  },

  backRoomsButton: {
    marginTop: 10,
    paddingHorizontal: 24,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: "#24262B",
  },

  backRoomsText: {
    color: "#FFF",
    fontWeight: "900",
  },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  eyebrow: {
    color: "#B5222E",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 3,
  },

  round: {
    color: "#777983",
    fontSize: 11,
    fontWeight: "800",
    marginTop: 4,
  },

  phaseBadge: {
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
  },

  nightBadge: {
    backgroundColor: "#252238",
  },

  dayBadge: {
    backgroundColor: "#6D5422",
  },

  phaseText: {
    color: "#FFF",
    fontSize: 10,
    fontWeight: "900",
    marginLeft: 6,
  },

  timerCard: {
    marginTop: 18,
    backgroundColor: "#15171B",
    borderRadius: 20,
    padding: 20,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#24262B",
  },

  timerLabel: {
    color: "#777983",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 2,
  },

  timer: {
    color: "#F4F1EF",
    fontSize: 48,
    fontWeight: "900",
    marginVertical: 5,
    fontVariant: [
      "tabular-nums",
    ],
  },

  timerDanger: {
    color: "#B5222E",
  },

  timerBar: {
    height: 5,
    width: "100%",
    borderRadius: 3,
    overflow: "hidden",
    backgroundColor: "#292B30",
  },

  timerProgress: {
    height: "100%",
    backgroundColor: "#D7A94B",
  },

  roleCard: {
    marginTop: 15,
    padding: 17,
    borderRadius: 18,
    backgroundColor: "#15171B",
    flexDirection: "row",
    borderWidth: 1,
    borderColor: "#24262B",
  },

  roleIcon: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: "#24262B",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 13,
  },

  roleLabel: {
    color: "#777983",
    fontSize: 8,
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
    color: "#898B94",
    fontSize: 11,
    lineHeight: 16,
    marginTop: 3,
  },

  deadBanner: {
    marginTop: 15,
    padding: 15,
    borderRadius: 16,
    backgroundColor: "#241216",
    borderWidth: 1,
    borderColor: "#54232B",
    flexDirection: "row",
    alignItems: "center",
  },

  deadTitle: {
    color: "#B5222E",
    fontSize: 12,
    fontWeight: "900",
    marginLeft: 11,
  },

  deadText: {
    color: "#9C7277",
    fontSize: 10,
    lineHeight: 15,
    marginLeft: 11,
    marginTop: 2,
  },

  sectionTitle: {
    color: "#777983",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 2,
    marginTop: 25,
    marginBottom: 10,
  },

  helper: {
    color: "#888A93",
    fontSize: 11,
    lineHeight: 17,
    marginBottom: 9,
  },

  targetCard: {
    minHeight: 62,
    padding: 11,
    borderRadius: 15,
    backgroundColor: "#15171B",
    borderWidth: 1,
    borderColor: "#24262B",
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },

  targetName: {
    color: "#F4F1EF",
    fontSize: 14,
    fontWeight: "800",
  },

  targetStatus: {
    color: "#666870",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1,
    marginTop: 3,
  },

  playerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },

  playerAvatarFallback: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#24262B",
    alignItems: "center",
    justifyContent: "center",
  },

  investigationDone: {
    padding: 17,
    backgroundColor: "#15171B",
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
  },

  investigationDoneText: {
    color: "#DDD",
    fontSize: 12,
    fontWeight: "700",
    marginLeft: 10,
    flex: 1,
  },

  waitCard: {
    backgroundColor: "#15171B",
    padding: 25,
    borderRadius: 17,
    alignItems: "center",
  },

  waitTitle: {
    color: "#DDD",
    fontSize: 13,
    fontWeight: "900",
    marginTop: 10,
  },

  waitText: {
    color: "#777983",
    fontSize: 11,
    marginTop: 5,
    textAlign: "center",
  },

  eventCard: {
    padding: 15,
    backgroundColor: "#211D12",
    borderRadius: 15,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },

  eventText: {
    color: "#E3D5B5",
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    marginLeft: 10,
    fontWeight: "700",
  },

  voteCard: {
    minHeight: 62,
    padding: 11,
    borderRadius: 15,
    backgroundColor: "#15171B",
    borderWidth: 1,
    borderColor: "#24262B",
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },

  playersCard: {
    backgroundColor: "#15171B",
    borderRadius: 18,
    paddingHorizontal: 13,
  },

  gamePlayer: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#24262B",
  },

  deadPlayer: {
    opacity: 0.5,
  },

  gamePlayerName: {
    color: "#EDEAE6",
    fontSize: 14,
    fontWeight: "800",
  },

  nameLine: {
    flexDirection: "row",
    alignItems: "center",
  },

  you: {
    color: "#D7A94B",
    fontSize: 8,
    fontWeight: "900",
    marginLeft: 7,
  },

  playerState: {
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1,
    marginTop: 3,
  },

  alive: {
    color: "#59C878",
  },

  dead: {
    color: "#B5222E",
  },

  chatCard: {
    backgroundColor: "#15171B",
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#24262B",
  },

  chatHeader: {
    height: 43,
    paddingHorizontal: 13,
    borderBottomWidth: 1,
    borderBottomColor: "#24262B",
    flexDirection: "row",
    alignItems: "center",
  },

  chatLiveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#59C878",
    marginRight: 7,
  },

  chatHeaderText: {
    color: "#AAA",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.5,
    flex: 1,
  },

  chatTimer: {
    color: "#D7A94B",
    fontSize: 11,
    fontWeight: "900",
  },

  messages: {
    minHeight: 80,
    maxHeight: 330,
    padding: 12,
  },

  emptyMessages: {
    color: "#666870",
    textAlign: "center",
    padding: 20,
    fontSize: 11,
  },

  messageRow: {
    marginBottom: 10,
    alignItems: "flex-start",
  },

  messageOwn: {
    alignItems: "flex-end",
  },

  messageSender: {
    color: "#777983",
    fontSize: 8,
    fontWeight: "800",
    marginBottom: 3,
  },

  messageBubble: {
    maxWidth: "88%",
    backgroundColor: "#24262B",
    borderRadius: 12,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },

  messageBubbleOwn: {
    backgroundColor: "#493A19",
  },

  messageText: {
    color: "#E8E5E1",
    fontSize: 12,
    lineHeight: 17,
  },

  messageInputRow: {
    borderTopWidth: 1,
    borderTopColor: "#24262B",
    padding: 10,
    flexDirection: "row",
    alignItems: "flex-end",
  },

  messageInput: {
    flex: 1,
    minHeight: 42,
    maxHeight: 90,
    borderRadius: 13,
    backgroundColor: "#24262B",
    color: "#F4F1EF",
    paddingHorizontal: 12,
    paddingTop: 11,
    fontSize: 12,
  },

  sendButton: {
    width: 43,
    height: 43,
    borderRadius: 13,
    marginLeft: 7,
    backgroundColor: "#D7A94B",
    alignItems: "center",
    justifyContent: "center",
  },

  sendDisabled: {
    opacity: 0.4,
  },

  chatClosed: {
    color: "#666870",
    textAlign: "center",
    padding: 13,
    fontSize: 10,
  },

  voiceButton: {
    minHeight: 68,
    backgroundColor: "#15171B",
    borderRadius: 17,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#24262B",
  },

  voiceIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "#24262B",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 11,
  },

  voiceTitle: {
    color: "#EDEAE6",
    fontSize: 12,
    fontWeight: "900",
  },

  voiceText: {
    color: "#777983",
    fontSize: 9,
    marginTop: 3,
  },

  bottomSpace: {
    height: 20,
  },

  finishedIcon: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: "#211D12",
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
  },

  finishedTitle: {
    color: "#777983",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 3,
    textAlign: "center",
    marginTop: 25,
  },

  finishedWinner: {
    color: "#D7A94B",
    fontSize: 29,
    fontWeight: "900",
    textAlign: "center",
    marginTop: 7,
  },

  finalPlayers: {
    marginTop: 25,
    backgroundColor: "#15171B",
    borderRadius: 18,
    paddingHorizontal: 15,
  },

  finalPlayer: {
    minHeight: 60,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#24262B",
  },

  finalName: {
    color: "#F4F1EF",
    fontWeight: "800",
    fontSize: 14,
    marginLeft: 10,
  },

  finalRole: {
    color: "#777983",
    fontSize: 8,
    fontWeight: "900",
    marginLeft: 10,
    marginTop: 3,
  },

  exitButton: {
    marginTop: 25,
    height: 53,
    borderRadius: 15,
    backgroundColor: "#D7A94B",
    alignItems: "center",
    justifyContent: "center",
  },

  exitText: {
    color: "#090A0D",
    fontWeight: "900",
    letterSpacing: 1,
  },
});
