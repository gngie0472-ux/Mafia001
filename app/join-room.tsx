import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
import { joinRoom } from "../lib/rooms";

export default function JoinRoomScreen() {
  const [playerName, setPlayerName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleJoinRoom() {
    if (!playerName.trim()) {
      Alert.alert("تنبيه", "اكتب اسمك أولاً");
      return;
    }

    if (roomCode.trim().length !== 6) {
      Alert.alert(
        "تنبيه",
        "أدخل كود الغرفة المكون من 6 أحرف"
      );
      return;
    }

    try {
      setLoading(true);

      const room = await joinRoom(
        roomCode.trim(),
        playerName.trim()
      );

      // مهم:
      // room.code هو الكود القصير مثل ABC123
      // room.id هو UUID الذي تحتاجه RPCs وقاعدة البيانات.
      if (!room?.id) {
        throw new Error(
          "تم الانضمام إلى الغرفة لكن لم يتم العثور على معرف الغرفة."
        );
      }

      router.replace(`/room/${room.id}`);
    } catch (error: any) {
      console.error("joinRoom navigation error:", error);

      Alert.alert(
        "تعذر الانضمام",
        error?.message ||
          "حدث خطأ أثناء الانضمام إلى الغرفة"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>JOIN ROOM</Text>

      <Text style={styles.label}>Your name</Text>

      <TextInput
        style={styles.input}
        placeholder="Omar"
        placeholderTextColor="#777"
        value={playerName}
        onChangeText={setPlayerName}
        maxLength={20}
        editable={!loading}
      />

      <Text style={styles.label}>Room code</Text>

      <TextInput
        style={styles.input}
        placeholder="ABC123"
        placeholderTextColor="#777"
        value={roomCode}
        onChangeText={(text) =>
          setRoomCode(text.toUpperCase())
        }
        autoCapitalize="characters"
        maxLength={6}
        editable={!loading}
      />

      <TouchableOpacity
        style={[
          styles.button,
          loading && styles.buttonDisabled,
        ]}
        onPress={handleJoinRoom}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>
            JOIN GAME
          </Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.backButton}
        onPress={() => router.back()}
        disabled={loading}
      >
        <Text style={styles.backText}>BACK</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#101010",
    padding: 25,
    paddingTop: 70,
  },

  title: {
    color: "#fff",
    fontSize: 30,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 40,
  },

  label: {
    color: "#fff",
    fontSize: 15,
    marginBottom: 8,
  },

  input: {
    backgroundColor: "#1d1d1d",
    color: "#fff",
    borderRadius: 12,
    padding: 15,
    marginBottom: 20,
    fontSize: 16,
  },

  button: {
    backgroundColor: "#8b0000",
    padding: 17,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 10,
  },

  buttonDisabled: {
    opacity: 0.6,
  },

  buttonText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "bold",
  },

  backButton: {
    alignItems: "center",
    padding: 18,
  },

  backText: {
    color: "#aaa",
    fontWeight: "bold",
  },
});
