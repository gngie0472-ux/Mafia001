import React, { useEffect, useState } from "react";

import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from "react-native";

import {
  useLocalSearchParams,
  router,
} from "expo-router";

import { supabase } from "../../lib/supabase";

import {
  getRoomPlayers,
  setReady,
  startGame,
  leaveRoom,
  subscribeToRoomPlayers,
  subscribeToRoom,
  RoomPlayer,
  Room,
} from "../../lib/rooms";

export default function RoomScreen() {
  const { code } =
    useLocalSearchParams<{ code: string }>();

  const [room, setRoom] =
    useState<Room | null>(null);

  const [players, setPlayers] =
    useState<RoomPlayer[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [ready, setReadyState] =
    useState(false);

  const [currentUserId, setCurrentUserId] =
    useState<string | null>(null);

  const [starting, setStarting] =
    useState(false);

  useEffect(() => {
    if (!code) {
      return;
    }

    let playerChannel: any = null;
    let roomChannel: any = null;
    let mounted = true;

    async function loadRoom() {
      try {
        const normalizedCode =
          code.trim().toUpperCase();

        const {
          data: userData,
        } = await supabase.auth.getUser();

        const user = userData.user;

        if (!user) {
          throw new Error(
            "المستخدم غير مسجل"
          );
        }

        if (!mounted) return;

        setCurrentUserId(user.id);

        const {
          data: roomData,
          error: roomError,
        } = await supabase
          .from("rooms")
          .select("*")
          .eq("code", normalizedCode)
          .single();

        if (roomError) {
          throw roomError;
        }

        if (!roomData) {
          throw new Error(
            "الغرفة غير موجودة"
          );
        }

        const room = roomData as Room;

        if (!mounted) return;

        setRoom(room);

        /**
         * إذا كانت اللعبة بدأت بالفعل،
         * نذهب مباشرة إلى شاشة اللعبة.
         */
        if (room.status === "playing") {
          router.replace(
            `/game/${room.code}`
          );
          return;
        }

        const roomPlayers =
          await getRoomPlayers(room.id);

        if (!mounted) return;

        setPlayers(roomPlayers);

        const currentPlayer =
          roomPlayers.find(
            (player) =>
              player.user_id === user.id
          );

        setReadyState(
          currentPlayer?.ready ?? false
        );

        /**
         * Realtime: players
         */
        playerChannel =
          subscribeToRoomPlayers(
            room.id,
            (updatedPlayers) => {
              if (!mounted) return;

              setPlayers(updatedPlayers);

              const current =
                updatedPlayers.find(
                  (player) =>
                    player.user_id === user.id
                );

              setReadyState(
                current?.ready ?? false
              );
            }
          );

        /**
         * Realtime: room
         */
        roomChannel = subscribeToRoom(
          room.id,
          (updatedRoom) => {
            if (!mounted) return;

            setRoom(updatedRoom);

            /**
             * عندما يبدأ المضيف اللعبة،
             * جميع الأجهزة تنتقل تلقائيًا.
             */
            if (
              updatedRoom.status ===
              "playing"
            ) {
              router.replace(
                `/game/${updatedRoom.code}`
              );
            }
          }
        );
      } catch (error: any) {
        if (!mounted) return;

        Alert.alert(
          "خطأ",
          error?.message ||
            "تعذر تحميل الغرفة"
        );

        router.back();
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    loadRoom();

    return () => {
      mounted = false;

      if (playerChannel) {
        supabase.removeChannel(
          playerChannel
        );
      }

      if (roomChannel) {
        supabase.removeChannel(
          roomChannel
        );
      }
    };
  }, [code]);

  /**
   * READY
   */
  async function handleReady() {
    if (!room || !currentUserId) {
      return;
    }

    const newReady = !ready;

    try {
      setReadyState(newReady);

      await setReady(
        room.id,
        newReady
      );
    } catch (error: any) {
      setReadyState(ready);

      Alert.alert(
        "خطأ",
        error?.message ||
          "تعذر تغيير الحالة"
      );
    }
  }

  /**
   * START GAME
   */
  async function handleStartGame() {
    if (!room) {
      return;
    }

    if (starting) {
      return;
    }

    /**
     * تأكيد أن المستخدم هو المضيف
     */
    if (
      !currentUserId ||
      room.host_id !== currentUserId
    ) {
      Alert.alert(
        "غير مسموح",
        "فقط صاحب الغرفة يستطيع بدء اللعبة."
      );

      return;
    }

    /**
     * تحقق إضافي من اللاعبين
     */
    if (players.length < 2) {
      Alert.alert(
        "لا يمكن بدء اللعبة",
        "يجب أن يكون هناك لاعبان على الأقل."
      );

      return;
    }

    const allReady = players.every(
      (player) => player.ready
    );

    if (!allReady) {
      Alert.alert(
        "اللاعبون غير جاهزين",
        "يجب أن يكون جميع اللاعبين في حالة READY."
      );

      return;
    }

    try {
      setStarting(true);

      await startGame(room.id);

      /**
       * الانتقال مباشرة للمضيف.
       * اللاعب الثاني سينتقل عبر Realtime.
       */
      router.replace(
        `/game/${room.code}`
      );
    } catch (error: any) {
      Alert.alert(
        "لا يمكن بدء اللعبة",
        error?.message ||
          "حدث خطأ أثناء بدء اللعبة"
      );
    } finally {
      setStarting(false);
    }
  }

  /**
   * LEAVE ROOM
   */
  async function handleLeaveRoom() {
    if (!room) {
      return;
    }

    try {
      await leaveRoom(room.id);

      router.replace("/");
    } catch (error: any) {
      Alert.alert(
        "خطأ",
        error?.message ||
          "تعذر مغادرة الغرفة"
      );
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator
          size="large"
          color="#8f0018"
        />

        <Text style={styles.loadingText}>
          جاري تحميل الغرفة...
        </Text>
      </View>
    );
  }

  if (!room) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>
          الغرفة غير موجودة
        </Text>
      </View>
    );
  }

  /**
   * إصلاح مهم:
   * المضيف الحقيقي فقط يرى زر START GAME.
   */
  const isHost =
    currentUserId === room.host_id;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        MAFIA NIGHT
      </Text>

      <View style={styles.roomBox}>
        <Text style={styles.roomName}>
          {room.name}
        </Text>

        <Text style={styles.codeLabel}>
          ROOM CODE
        </Text>

        <Text style={styles.code}>
          {room.code}
        </Text>
      </View>

      <Text style={styles.playersTitle}>
        PLAYERS {players.length}/
        {room.max_players}
      </Text>

      <View style={styles.playersBox}>
        {players.map((player, index) => {
          const isPlayerHost =
            player.user_id ===
            room.host_id;

          return (
            <View
              style={styles.playerRow}
              key={player.id}
            >
              <Text
                style={styles.playerNumber}
              >
                {index + 1}
              </Text>

              <View
                style={styles.playerInfo}
              >
                <Text
                  style={styles.playerName}
                >
                  {player.name}
                  {player.user_id ===
                    currentUserId
                    ? "  (YOU)"
                    : ""}
                </Text>

                {isPlayerHost && (
                  <Text
                    style={styles.hostLabel}
                  >
                    HOST
                  </Text>
                )}
              </View>

              <Text
                style={[
                  styles.status,
                  player.ready
                    ? styles.ready
                    : styles.notReady,
                ]}
              >
                {player.ready
                  ? "READY"
                  : "NOT READY"}
              </Text>
            </View>
          );
        })}
      </View>

      <TouchableOpacity
        style={[
          styles.button,
          ready
            ? styles.readyButton
            : null,
        ]}
        onPress={handleReady}
        disabled={starting}
      >
        <Text style={styles.buttonText}>
          {ready
            ? "NOT READY"
            : "READY"}
        </Text>
      </TouchableOpacity>

      {isHost && (
        <TouchableOpacity
          style={[
            styles.startButton,
            starting
              ? styles.disabledButton
              : null,
          ]}
          onPress={handleStartGame}
          disabled={starting}
        >
          {starting ? (
            <ActivityIndicator
              color="#fff"
            />
          ) : (
            <Text style={styles.buttonText}>
              START GAME
            </Text>
          )}
        </TouchableOpacity>
      )}

      <TouchableOpacity
        style={styles.leaveButton}
        onPress={handleLeaveRoom}
        disabled={starting}
      >
        <Text style={styles.leaveText}>
          LEAVE ROOM
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    paddingTop: 60,
    backgroundColor: "#101010",
  },

  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#101010",
  },

  loadingText: {
    color: "#fff",
    marginTop: 15,
  },

  errorText: {
    color: "#fff",
    fontSize: 18,
  },

  title: {
    color: "#fff",
    fontSize: 30,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 25,
  },

  roomBox: {
    backgroundColor: "#1d1d1d",
    padding: 20,
    borderRadius: 15,
    alignItems: "center",
    marginBottom: 25,
  },

  roomName: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 15,
  },

  codeLabel: {
    color: "#999",
    fontSize: 12,
  },

  code: {
    color: "#fff",
    fontSize: 32,
    fontWeight: "bold",
    letterSpacing: 5,
    marginTop: 5,
  },

  playersTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 10,
  },

  playersBox: {
    backgroundColor: "#1d1d1d",
    borderRadius: 15,
    padding: 10,
    marginBottom: 20,
  },

  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#333",
  },

  playerNumber: {
    color: "#888",
    width: 30,
  },

  playerInfo: {
    flex: 1,
  },

  playerName: {
    color: "#fff",
    fontSize: 16,
  },

  hostLabel: {
    color: "#8f0018",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 2,
    marginTop: 3,
  },

  status: {
    fontSize: 12,
    fontWeight: "bold",
  },

  ready: {
    color: "#4ade80",
  },

  notReady: {
    color: "#aaa",
  },

  button: {
    backgroundColor: "#333",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 12,
  },

  readyButton: {
    backgroundColor: "#555",
  },

  startButton: {
    backgroundColor: "#8b0000",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 12,
  },

  disabledButton: {
    opacity: 0.6,
  },

  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },

  leaveButton: {
    padding: 15,
    alignItems: "center",
  },

  leaveText: {
    color: "#ff5555",
    fontWeight: "bold",
  },
});
