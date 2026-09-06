import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";

import { supabase } from "@/lib/supabase";
import {
  getRoomPlayers,
  setReady,
  startGame,
  leaveRoom,
  RoomPlayer,
  Room,
} from "@/lib/rooms";
import { getMyProfile } from "@/lib/profile";

type Profile = {
  user_id: string;
  username: string;
  avatar_url: string | null;
};

export default function RoomScreen() {
  const params = useLocalSearchParams<{ code?: string | string[] }>();

  const roomParam = Array.isArray(params.code)
    ? params.code[0]
    : params.code;

  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<RoomPlayer[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const [ready, setReadyState] = useState(false);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);

  const load = useCallback(async () => {
    if (!roomParam) {
      return;
    }

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        throw new Error("لم يتم تسجيل الدخول.");
      }

      setCurrentUserId(user.id);

      let roomData: Room | null = null;

      /*
       * الرابط الجديد يرسل room.id.
       * نحتفظ أيضًا بدعم code حتى لا تتعطل
       * الروابط القديمة.
       */
      const byId = await supabase
        .from("rooms")
        .select("*")
        .eq("id", roomParam)
        .maybeSingle();

      if (byId.data) {
        roomData = byId.data as Room;
      } else {
        const byCode = await supabase
          .from("rooms")
          .select("*")
          .eq("code", roomParam.toUpperCase())
          .maybeSingle();

        if (byCode.error) {
          throw byCode.error;
        }

        roomData = (byCode.data as Room | null) ?? null;
      }

      if (!roomData) {
        throw new Error("الغرفة غير موجودة.");
      }

      setRoom(roomData);

      if (roomData.status === "playing") {
        router.replace(`/game/${roomData.id}`);
        return;
      }

      const roomPlayers = await getRoomPlayers(roomData.id);

      setPlayers(roomPlayers);

      const me = roomPlayers.find(
        (p) => p.user_id === user.id
      );

      setReadyState(Boolean(me?.ready));

      /*
       * تحميل الملفات الشخصية.
       */
      const ids = roomPlayers
        .map((p) => p.user_id)
        .filter(Boolean);

      if (ids.length > 0) {
        const { data: profileRows, error: profileError } =
          await supabase
            .from("profiles")
            .select("user_id, username, avatar_url")
            .in("user_id", ids);

        if (!profileError && profileRows) {
          const map: Record<string, Profile> = {};

          for (const profile of profileRows) {
            map[profile.user_id] = profile as Profile;
          }

          setProfiles(map);
        }
      }
    } catch (error: any) {
      console.error("room load:", error);

      Alert.alert(
        "خطأ",
        error?.message || "تعذر تحميل الغرفة."
      );

      router.replace("/rooms");
    } finally {
      setLoading(false);
    }
  }, [roomParam]);

  useEffect(() => {
    load();

    if (!roomParam) {
      return;
    }

    let roomId = roomParam;

    let cancelled = false;

    async function setupRealtime() {
      try {
        const { data } = await supabase
          .from("rooms")
          .select("id")
          .eq("id", roomParam)
          .maybeSingle();

        if (data?.id) {
          roomId = data.id;
        } else {
          const { data: oldRoom } = await supabase
            .from("rooms")
            .select("id")
            .eq("code", roomParam.toUpperCase())
            .maybeSingle();

          if (oldRoom?.id) {
            roomId = oldRoom.id;
          }
        }

        if (cancelled) {
          return;
        }

        const channel = supabase
          .channel(`lobby-${roomId}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "rooms",
              filter: `id=eq.${roomId}`,
            },
            () => {
              load();
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
              load();
            }
          )
          .subscribe();

        return () => {
          supabase.removeChannel(channel);
        };
      } catch {
        // polling through load() remains as fallback
      }
    }

    const cleanupPromise = setupRealtime();

    const poll = setInterval(load, 2500);

    return () => {
      cancelled = true;
      clearInterval(poll);

      cleanupPromise.then((cleanup) => {
        if (cleanup) {
          cleanup();
        }
      });
    };
  }, [roomParam, load]);

  async function handleReady() {
    if (!room || !currentUserId || starting) {
      return;
    }

    const next = !ready;

    setReadyState(next);

    try {
      await setReady(room.id, next);
      await load();
    } catch (error: any) {
      setReadyState(!next);

      Alert.alert(
        "خطأ",
        error?.message || "تعذر تغيير حالة الجاهزية."
      );
    }
  }

  async function handleStart() {
    if (!room || starting) {
      return;
    }

    if (currentUserId !== room.host_id) {
      Alert.alert(
        "غير مسموح",
        "فقط المضيف يستطيع بدء اللعبة."
      );
      return;
    }

    if (players.length < 4) {
      Alert.alert(
        "عدد اللاعبين غير كافٍ",
        "تحتاج اللعبة إلى 4 لاعبين على الأقل."
      );
      return;
    }

    if (players.length > room.max_players) {
      Alert.alert(
        "الغرفة ممتلئة",
        "لا يمكن بدء اللعبة بعد تجاوز العدد المسموح."
      );
      return;
    }

    const everyoneReady = players.every(
      (player) => player.ready
    );

    if (!everyoneReady) {
      Alert.alert(
        "اللاعبون غير جاهزين",
        "يجب أن يصبح جميع اللاعبين READY قبل بدء اللعبة."
      );
      return;
    }

    try {
      setStarting(true);

      await startGame(room.id);

      router.replace(`/game/${room.id}`);
    } catch (error: any) {
      console.error("start game:", error);

      Alert.alert(
        "تعذر بدء اللعبة",
        error?.message || "حدث خطأ أثناء بدء اللعبة."
      );
    } finally {
      setStarting(false);
    }
  }

  async function handleLeave() {
    if (!room) {
      return;
    }

    try {
      await leaveRoom(room.id);
      router.replace("/rooms");
    } catch (error: any) {
      Alert.alert(
        "خطأ",
        error?.message || "تعذر مغادرة الغرفة."
      );
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#D7A94B" />
          <Text style={styles.loading}>
            جاري تحميل الغرفة...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!room) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.error}>
            الغرفة غير موجودة
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const isHost = currentUserId === room.host_id;
  const allReady =
    players.length > 0 &&
    players.every((player) => player.ready);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          onPress={handleLeave}
          style={styles.back}
        >
          <Ionicons
            name="arrow-back"
            size={25}
            color="#F4F1EF"
          />
        </Pressable>

        <Text style={styles.eyebrow}>
          MAFIA NIGHT
        </Text>

        <Text style={styles.title}>
          {room.name || "غرفة المافيا"}
        </Text>

        <View style={styles.statusCard}>
          <View>
            <Text style={styles.smallLabel}>
              PUBLIC ROOM
            </Text>
            <Text style={styles.roomStatus}>
              في انتظار اللاعبين
            </Text>
          </View>

          <View style={styles.countBadge}>
            <Text style={styles.countText}>
              {players.length}/{room.max_players}
            </Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>
          PLAYERS
        </Text>

        <View style={styles.playersCard}>
          {players.map((player, index) => {
            const profile = profiles[player.user_id];

            const displayName =
              profile?.username ||
              player.name ||
              `Player ${index + 1}`;

            const isMe =
              player.user_id === currentUserId;

            const isPlayerHost =
              player.user_id === room.host_id;

            return (
              <View
                key={player.id}
                style={[
                  styles.playerRow,
                  index === players.length - 1 &&
                    styles.lastRow,
                ]}
              >
                {profile?.avatar_url ? (
                  <Image
                    source={{
                      uri: profile.avatar_url,
                    }}
                    style={styles.avatar}
                  />
                ) : (
                  <View style={styles.avatarFallback}>
                    <Ionicons
                      name="person"
                      size={20}
                      color="#D7A94B"
                    />
                  </View>
                )}

                <View style={styles.playerMiddle}>
                  <View style={styles.nameLine}>
                    <Text style={styles.playerName}>
                      {displayName}
                    </Text>

                    {isMe && (
                      <Text style={styles.you}>
                        YOU
                      </Text>
                    )}
                  </View>

                  {isPlayerHost && (
                    <Text style={styles.host}>
                      HOST
                    </Text>
                  )}
                </View>

                <View
                  style={[
                    styles.readyDot,
                    player.ready
                      ? styles.readyDotOn
                      : styles.readyDotOff,
                  ]}
                />

                <Text
                  style={[
                    styles.readyText,
                    player.ready
                      ? styles.readyOn
                      : styles.readyOff,
                  ]}
                >
                  {player.ready ? "READY" : "WAIT"}
                </Text>
              </View>
            );
          })}

          {players.length === 0 && (
            <Text style={styles.noPlayers}>
              لا يوجد لاعبون بعد.
            </Text>
          )}
        </View>

        <View style={styles.infoCard}>
          <Ionicons
            name="information-circle-outline"
            size={22}
            color="#D7A94B"
          />

          <Text style={styles.infoText}>
            يجب أن يكون هناك 4 لاعبين على الأقل، وجميع
            اللاعبين يجب أن يكونوا جاهزين قبل بدء المباراة.
          </Text>
        </View>

        <Pressable
          onPress={handleReady}
          disabled={starting}
          style={[
            styles.readyButton,
            ready && styles.readyButtonActive,
          ]}
        >
          <Text style={styles.readyButtonText}>
            {ready ? "I'M READY ✓" : "READY"}
          </Text>
        </Pressable>

        {isHost && (
          <Pressable
            onPress={handleStart}
            disabled={starting}
            style={[
              styles.startButton,
              (!allReady || players.length < 4) &&
                styles.startDisabled,
            ]}
          >
            {starting ? (
              <ActivityIndicator color="#090A0D" />
            ) : (
              <>
                <Ionicons
                  name="play"
                  size={20}
                  color="#090A0D"
                />
                <Text style={styles.startText}>
                  START GAME
                </Text>
              </>
            )}
          </Pressable>
        )}

        <Pressable
          onPress={handleLeave}
          disabled={starting}
          style={styles.leaveButton}
        >
          <Text style={styles.leaveText}>
            LEAVE ROOM
          </Text>
        </Pressable>
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
    padding: 20,
    paddingBottom: 45,
  },

  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#090A0D",
  },

  loading: {
    marginTop: 14,
    color: "#AAA",
  },

  error: {
    color: "#FFF",
    fontSize: 18,
    fontWeight: "800",
  },

  back: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#15171B",
    marginBottom: 28,
  },

  eyebrow: {
    color: "#B5222E",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 3,
  },

  title: {
    color: "#F4F1EF",
    fontSize: 31,
    fontWeight: "900",
    marginTop: 5,
    marginBottom: 22,
  },

  statusCard: {
    backgroundColor: "#15171B",
    borderRadius: 18,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#24262B",
  },

  smallLabel: {
    color: "#777983",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 2,
  },

  roomStatus: {
    color: "#E8E5E1",
    fontSize: 16,
    fontWeight: "800",
    marginTop: 5,
  },

  countBadge: {
    backgroundColor: "#24262B",
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 12,
  },

  countText: {
    color: "#D7A94B",
    fontWeight: "900",
  },

  sectionTitle: {
    color: "#777983",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 2,
    marginTop: 28,
    marginBottom: 10,
  },

  playersCard: {
    backgroundColor: "#15171B",
    borderRadius: 18,
    paddingHorizontal: 15,
  },

  playerRow: {
    minHeight: 70,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#24262B",
  },

  lastRow: {
    borderBottomWidth: 0,
  },

  avatar: {
    width: 43,
    height: 43,
    borderRadius: 22,
  },

  avatarFallback: {
    width: 43,
    height: 43,
    borderRadius: 22,
    backgroundColor: "#24262B",
    alignItems: "center",
    justifyContent: "center",
  },

  playerMiddle: {
    flex: 1,
    marginLeft: 12,
  },

  nameLine: {
    flexDirection: "row",
    alignItems: "center",
  },

  playerName: {
    color: "#F4F1EF",
    fontSize: 15,
    fontWeight: "800",
  },

  you: {
    color: "#D7A94B",
    fontSize: 8,
    fontWeight: "900",
    marginLeft: 7,
  },

  host: {
    color: "#B5222E",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1.5,
    marginTop: 3,
  },

  readyDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },

  readyDotOn: {
    backgroundColor: "#59C878",
  },

  readyDotOff: {
    backgroundColor: "#555860",
  },

  readyText: {
    width: 42,
    fontSize: 8,
    fontWeight: "900",
    textAlign: "right",
  },

  readyOn: {
    color: "#59C878",
  },

  readyOff: {
    color: "#666870",
  },

  noPlayers: {
    color: "#777983",
    textAlign: "center",
    padding: 25,
  },

  infoCard: {
    marginTop: 15,
    padding: 15,
    borderRadius: 15,
    backgroundColor: "#121419",
    flexDirection: "row",
    alignItems: "center",
  },

  infoText: {
    flex: 1,
    color: "#858791",
    fontSize: 12,
    lineHeight: 18,
    marginLeft: 10,
  },

  readyButton: {
    height: 55,
    marginTop: 20,
    borderRadius: 15,
    backgroundColor: "#24262B",
    alignItems: "center",
    justifyContent: "center",
  },

  readyButtonActive: {
    backgroundColor: "#31563A",
  },

  readyButtonText: {
    color: "#F4F1EF",
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 1,
  },

  startButton: {
    height: 55,
    marginTop: 12,
    borderRadius: 15,
    backgroundColor: "#D7A94B",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },

  startDisabled: {
    opacity: 0.4,
  },

  startText: {
    color: "#090A0D",
    fontSize: 14,
    fontWeight: "900",
    marginLeft: 8,
    letterSpacing: 1,
  },

  leaveButton: {
    alignItems: "center",
    paddingVertical: 18,
  },

  leaveText: {
    color: "#B5222E",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
});
