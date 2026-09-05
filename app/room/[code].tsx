import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";

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
  const { code } = useLocalSearchParams<{ code: string }>();

  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<RoomPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [ready, setReadyState] = useState(false);

  useEffect(() => {
    if (!code) return;

    let playerChannel: any;
    let roomChannel: any;

    async function loadRoom() {
      try {
        const { supabase } = await import("../../lib/supabase");

        const { data: roomData, error } = await supabase
          .from("rooms")
          .select("*")
          .eq("code", code.toUpperCase())
          .single();

        if (error) throw error;

        setRoom(roomData);

        const roomPlayers = await getRoomPlayers(roomData.id);
        setPlayers(roomPlayers);

        const user = (await supabase.auth.getUser()).data.user;

        const currentPlayer = roomPlayers.find(
          (player) => player.user_id === user?.id
        );

        setReadyState(currentPlayer?.ready ?? false);

        playerChannel = subscribeToRoomPlayers(roomData.id, (updated) => {
          setPlayers(updated);

          const current = updated.find(
            (player) => player.user_id === user?.id
          );

          setReadyState(current?.ready ?? false);
        });

        roomChannel = subscribeToRoom(roomData.id, (updatedRoom) => {
          setRoom(updatedRoom);

          if (updatedRoom.status === "playing") {
            Alert.alert("اللعبة بدأت!", "سيتم الانتقال إلى اللعبة.");
          }
        });
      } catch (error: any) {
        Alert.alert(
          "خطأ",
          error?.message || "تعذر تحميل الغرفة"
        );

        router.back();
      } finally {
        setLoading(false);
      }
    }

    loadRoom();

    return () => {
      if (playerChannel) {
        import("../../lib/supabase").then(({ supabase }) => {
          supabase.removeChannel(playerChannel);
        });
      }

      if (roomChannel) {
        import("../../lib/supabase").then(({ supabase }) => {
          supabase.removeChannel(roomChannel);
        });
      }
    };
  }, [code]);

  async function handleReady() {
    if (!room) return;

    try {
      const newReady = !ready;

      setReadyState(newReady);
      await setReady(room.id, newReady);
    } catch (error: any) {
      setReadyState(ready);

      Alert.alert(
        "خطأ",
        error?.message || "تعذر تغيير الحالة"
      );
    }
  }

  async function handleStartGame() {
    if (!room) return;

    try {
      await startGame(room.id);

      Alert.alert(
        "بدأت اللعبة",
        "جميع اللاعبين جاهزون!"
      );
    } catch (error: any) {
      Alert.alert(
        "لا يمكن بدء اللعبة",
        error?.message || "حدث خطأ"
      );
    }
  }

  async function handleLeaveRoom() {
    if (!room) return;

    try {
      await leaveRoom(room.id);
      router.replace("/");
    } catch (error: any) {
      Alert.alert(
        "خطأ",
        error?.message || "تعذر مغادرة الغرفة"
      );
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>جاري تحميل الغرفة...</Text>
      </View>
    );
  }

  if (!room) {
    return (
      <View style={styles.center}>
        <Text>الغرفة غير موجودة</Text>
      </View>
    );
  }

  const isHost =
    room.host_id ===
    players.find((p) => p.user_id === room.host_id)?.user_id;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>MAFIA NIGHT</Text>

      <View style={styles.roomBox}>
        <Text style={styles.roomName}>{room.name}</Text>

        <Text style={styles.codeLabel}>ROOM CODE</Text>
        <Text style={styles.code}>{room.code}</Text>
      </View>

      <Text style={styles.playersTitle}>
        PLAYERS {players.length}/{room.max_players}
      </Text>

      <View style={styles.playersBox}>
        {players.map((player, index) => (
          <View style={styles.playerRow} key={player.id}>
            <Text style={styles.playerNumber}>
              {index + 1}
            </Text>

            <Text style={styles.playerName}>
              {player.name}
            </Text>

            <Text
              style={[
                styles.status,
                player.ready
                  ? styles.ready
                  : styles.notReady,
              ]}
            >
              {player.ready ? "READY" : "NOT READY"}
            </Text>
          </View>
        ))}
      </View>

      <TouchableOpacity
        style={[
          styles.button,
          ready ? styles.readyButton : null,
        ]}
        onPress={handleReady}
      >
        <Text style={styles.buttonText}>
          {ready ? "NOT READY" : "READY"}
        </Text>
      </TouchableOpacity>

      {isHost && (
        <TouchableOpacity
          style={styles.startButton}
          onPress={handleStartGame}
        >
          <Text style={styles.buttonText}>
            START GAME
          </Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity
        style={styles.leaveButton}
        onPress={handleLeaveRoom}
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

  playerName: {
    color: "#fff",
    fontSize: 16,
    flex: 1,
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
