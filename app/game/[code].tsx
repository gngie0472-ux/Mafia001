import React, {
  useEffect,
  useState,
} from "react";

import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
} from "react-native";

import {
  useLocalSearchParams,
  router,
} from "expo-router";

import { supabase } from "../../lib/supabase";

import { getMyRole } from "../../lib/rooms";

type PlayerRole = {
  role: string;
  alive: boolean;
};

const ROLE_INFO: Record<
  string,
  {
    title: string;
    description: string;
    icon: string;
  }
> = {
  mafia: {
    title: "MAFIA",
    description:
      "أنت من المافيا. تخلّص من المواطنين دون أن يكتشفوا هويتك.",
    icon: "♠",
  },

  doctor: {
    title: "DOCTOR",
    description:
      "أنت الطبيب. في الليل يمكنك حماية لاعب من المافيا.",
    icon: "✚",
  },

  detective: {
    title: "DETECTIVE",
    description:
      "أنت المحقق. في الليل يمكنك التحقيق في لاعب لمعرفة هل هو من المافيا.",
    icon: "⌕",
  },

  citizen: {
    title: "CITIZEN",
    description:
      "أنت مواطن. حاول اكتشاف المافيا والتصويت لإخراجهم.",
    icon: "●",
  },
};

export default function GameScreen() {
  const { code } =
    useLocalSearchParams<{
      code: string;
    }>();

  const [role, setRole] =
    useState<PlayerRole | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [showRole, setShowRole] =
    useState(false);

  const [roomId, setRoomId] =
    useState<string | null>(null);

  const [roomName, setRoomName] =
    useState("");

  useEffect(() => {
    if (!code) {
      return;
    }

    let mounted = true;

    async function loadGame() {
      try {
        const normalizedCode =
          code.trim().toUpperCase();

        /**
         * التأكد من المستخدم
         */
        const {
          data: userData,
        } = await supabase.auth.getUser();

        if (!userData.user) {
          throw new Error(
            "المستخدم غير مسجل"
          );
        }

        /**
         * العثور على الغرفة
         */
        const {
          data: room,
          error: roomError,
        } = await supabase
          .from("rooms")
          .select(
            "id, code, name, status"
          )
          .eq("code", normalizedCode)
          .single();

        if (roomError) {
          throw roomError;
        }

        if (!room) {
          throw new Error(
            "الغرفة غير موجودة"
          );
        }

        /**
         * إذا لم تبدأ اللعبة بعد،
         * نعيد اللاعب للـ Lobby.
         */
        if (room.status !== "playing") {
          router.replace(
            `/room/${room.code}`
          );

          return;
        }

        /**
         * جلب دوري السري.
         */
        const myRole =
          await getMyRole(room.id);

        if (!mounted) {
          return;
        }

        setRoomId(room.id);
        setRoomName(room.name);
        setRole(myRole);
      } catch (error: any) {
        if (!mounted) {
          return;
        }

        console.error(
          "Failed to load game:",
          error
        );

        Alert.alert(
          "خطأ",
          error?.message ||
            "تعذر تحميل اللعبة",
          [
            {
              text: "OK",
              onPress: () => {
                router.back();
              },
            },
          ]
        );
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    loadGame();

    return () => {
      mounted = false;
    };
  }, [code]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator
          size="large"
          color="#8f0018"
        />

        <Text style={styles.loadingText}>
          جاري تجهيز اللعبة...
        </Text>
      </View>
    );
  }

  if (!role) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>
          تعذر تحميل دورك
        </Text>
      </View>
    );
  }

  const info =
    ROLE_INFO[role.role] ??
    ROLE_INFO.citizen;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.smallTitle}>
          MAFIA NIGHT
        </Text>

        <Text style={styles.roomName}>
          {roomName}
        </Text>

        <Text style={styles.round}>
          NIGHT 1
        </Text>
      </View>

      <View style={styles.content}>
        <Text style={styles.secret}>
          YOUR SECRET ROLE
        </Text>

        {!showRole ? (
          <>
            <View style={styles.hiddenCard}>
              <Text style={styles.question}>
                ?
              </Text>

              <Text style={styles.hiddenText}>
                YOUR ROLE IS SECRET
              </Text>
            </View>

            <TouchableOpacity
              style={styles.revealButton}
              onPress={() =>
                setShowRole(true)
              }
            >
              <Text style={styles.revealText}>
                REVEAL MY ROLE
              </Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <View
              style={[
                styles.roleCard,
                role.role === "mafia"
                  ? styles.mafiaCard
                  : null,
              ]}
            >
              <Text style={styles.roleIcon}>
                {info.icon}
              </Text>

              <Text style={styles.roleTitle}>
                {info.title}
              </Text>

              <Text
                style={styles.roleDescription}
              >
                {info.description}
              </Text>
            </View>

            <View style={styles.statusCard}>
              <Text style={styles.statusLabel}>
                STATUS
              </Text>

              <Text
                style={[
                  styles.statusValue,
                  role.alive
                    ? styles.alive
                    : styles.dead,
                ]}
              >
                {role.alive
                  ? "ALIVE"
                  : "ELIMINATED"}
              </Text>
            </View>

            <View style={styles.phaseCard}>
              <Text style={styles.phaseTitle}>
                NIGHT PHASE
              </Text>

              <Text style={styles.phaseText}>
                سيتم تفعيل مهام دورك عند
                بدء المرحلة الليلية.
              </Text>
            </View>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#080808",
    paddingHorizontal: 22,
    paddingTop: 60,
  },

  center: {
    flex: 1,
    backgroundColor: "#080808",
    alignItems: "center",
    justifyContent: "center",
  },

  loadingText: {
    color: "#aaa",
    marginTop: 18,
    fontSize: 16,
  },

  errorText: {
    color: "#ff4444",
    fontSize: 18,
  },

  header: {
    alignItems: "center",
  },

  smallTitle: {
    color: "#8f0018",
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 5,
  },

  roomName: {
    color: "#555",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 10,
  },

  round: {
    color: "#777",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 3,
    marginTop: 8,
  },

  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 80,
  },

  secret: {
    color: "#666",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 3,
    marginBottom: 25,
  },

  hiddenCard: {
    width: "100%",
    maxWidth: 360,
    minHeight: 280,
    borderRadius: 24,
    backgroundColor: "#151515",
    borderWidth: 1,
    borderColor: "#292929",
    alignItems: "center",
    justifyContent: "center",
  },

  question: {
    color: "#8f0018",
    fontSize: 90,
    fontWeight: "900",
  },

  hiddenText: {
    color: "#777",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 2,
    marginTop: 15,
  },

  revealButton: {
    width: "100%",
    maxWidth: 360,
    marginTop: 25,
    backgroundColor: "#8f0018",
    borderRadius: 15,
    paddingVertical: 18,
    alignItems: "center",
  },

  revealText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 1,
  },

  roleCard: {
    width: "100%",
    maxWidth: 360,
    minHeight: 300,
    backgroundColor: "#151515",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#303030",
    alignItems: "center",
    justifyContent: "center",
    padding: 30,
  },

  mafiaCard: {
    borderColor: "#8f0018",
  },

  roleIcon: {
    color: "#a00020",
    fontSize: 65,
    marginBottom: 10,
  },

  roleTitle: {
    color: "#fff",
    fontSize: 36,
    fontWeight: "900",
    letterSpacing: 3,
  },

  roleDescription: {
    color: "#aaa",
    fontSize: 15,
    lineHeight: 24,
    textAlign: "center",
    marginTop: 20,
  },

  statusCard: {
    width: "100%",
    maxWidth: 360,
    marginTop: 15,
    padding: 16,
    borderRadius: 15,
    backgroundColor: "#111",
    alignItems: "center",
  },

  statusLabel: {
    color: "#555",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 2,
  },

  statusValue: {
    marginTop: 5,
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 2,
  },

  alive: {
    color: "#43d17a",
  },

  dead: {
    color: "#e33",
  },

  phaseCard: {
    width: "100%",
    maxWidth: 360,
    marginTop: 15,
    padding: 18,
    borderRadius: 15,
    backgroundColor: "#111",
    alignItems: "center",
  },

  phaseTitle: {
    color: "#8f0018",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 2,
  },

  phaseText: {
    color: "#777",
    fontSize: 13,
    lineHeight: 21,
    textAlign: "center",
    marginTop: 8,
  },
});
