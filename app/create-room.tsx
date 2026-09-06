import React, { useState } from "react";
import {
  Alert,
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";

import { createRoom } from "../lib/rooms";

export default function CreateRoom() {
  const [roomName, setRoomName] = useState("");
  const [players, setPlayers] = useState("8");
  const [loading, setLoading] = useState(false);

  async function handleCreateRoom() {
    const name = roomName.trim();

    if (!name) {
      Alert.alert("Missing room name", "Please enter a room name.");
      return;
    }

    if (loading) return;

    try {
      setLoading(true);

      const room = await createRoom(
        name,
        "Host",
        Number(players)
      );

      router.replace(`/room/${room.code}`);
    } catch (error: any) {
      console.error("Create room error:", error);

      Alert.alert(
        "Could not create room",
        error?.message || "Something went wrong."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Pressable
          onPress={() => router.back()}
          style={styles.back}
          disabled={loading}
        >
          <Ionicons
            name="arrow-back"
            size={22}
            color="#EEE"
          />
          <Text style={styles.backText}>Back</Text>
        </Pressable>

        <Text style={styles.kicker}>HOST A GAME</Text>

        <Text style={styles.title}>Create Room</Text>

        <Text style={styles.sub}>
          Set the rules, invite your crew, and let the night begin.
        </Text>

        <Text style={styles.label}>ROOM NAME</Text>

        <TextInput
          value={roomName}
          onChangeText={setRoomName}
          placeholder="Friday Night"
          placeholderTextColor="#666872"
          style={styles.input}
          editable={!loading}
          maxLength={40}
        />

        <Text style={styles.label}>PLAYERS</Text>

        <View style={styles.row}>
          {["6", "8", "10", "12"].map((n) => (
            <Pressable
              key={n}
              onPress={() => setPlayers(n)}
              disabled={loading}
              style={[
                styles.choice,
                players === n && styles.choiceOn,
              ]}
            >
              <Text
                style={[
                  styles.choiceText,
                  players === n && styles.choiceTextOn,
                ]}
              >
                {n}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>MODE</Text>

        <View style={styles.mode}>
          <Ionicons
            name="moon"
            size={22}
            color="#D7A94B"
          />

          <View style={{ flex: 1 }}>
            <Text style={styles.modeTitle}>
              Classic Mafia
            </Text>

            <Text style={styles.modeSub}>
              Night & day • hidden roles • voting
            </Text>
          </View>

          <Ionicons
            name="checkmark-circle"
            size={22}
            color="#D7A94B"
          />
        </View>

        <Pressable
          style={[
            styles.button,
            loading && styles.buttonDisabled,
          ]}
          onPress={handleCreateRoom}
          disabled={loading}
        >
          {loading ? (
            <>
              <ActivityIndicator
                size="small"
                color="#090A0D"
              />

              <Text style={styles.buttonText}>
                CREATING...
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.buttonText}>
                CREATE ROOM
              </Text>

              <Ionicons
                name="arrow-forward"
                size={19}
                color="#090A0D"
              />
            </>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#090A0D",
  },

  container: {
    padding: 20,
  },

  back: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 34,
  },

  backText: {
    color: "#AAA",
    fontSize: 13,
  },

  kicker: {
    fontSize: 10,
    letterSpacing: 2,
    color: "#B5222E",
    fontWeight: "900",
  },

  title: {
    fontSize: 34,
    color: "#F4F1EF",
    fontWeight: "900",
    marginTop: 5,
  },

  sub: {
    color: "#898A92",
    lineHeight: 20,
    marginTop: 7,
    marginBottom: 28,
  },

  label: {
    fontSize: 10,
    letterSpacing: 1.5,
    color: "#777983",
    fontWeight: "900",
    marginTop: 14,
    marginBottom: 9,
  },

  input: {
    height: 52,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#292B32",
    backgroundColor: "#14151A",
    paddingHorizontal: 15,
    color: "#EEE",
  },

  row: {
    flexDirection: "row",
    gap: 9,
  },

  choice: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#292B32",
    backgroundColor: "#14151A",
    alignItems: "center",
    justifyContent: "center",
  },

  choiceOn: {
    borderColor: "#D7A94B",
    backgroundColor: "#2A2110",
  },

  choiceText: {
    color: "#888993",
    fontWeight: "800",
  },

  choiceTextOn: {
    color: "#D7A94B",
  },

  mode: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    padding: 15,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#292B32",
    backgroundColor: "#14151A",
  },

  modeTitle: {
    color: "#EEE",
    fontWeight: "800",
  },

  modeSub: {
    color: "#777983",
    fontSize: 10,
    marginTop: 3,
  },

  button: {
    marginTop: 34,
    height: 54,
    borderRadius: 14,
    backgroundColor: "#D7A94B",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },

  buttonDisabled: {
    opacity: 0.6,
  },

  buttonText: {
    fontWeight: "900",
    letterSpacing: 1,
    color: "#090A0D",
  },
});
