import React from "react";
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  ImageSourcePropType,
} from "react-native";

/**
 * Mafia001 RoleCard
 * Uses local assets for the 13 role cards.
 */

// Map each normalized role to its local asset require path
const ROLE_CARD_IMAGES: Record<string, ImageSourcePropType> = {
  CITIZEN: require("../assets/roles/citizen.png"),
  DOCTOR: require("../assets/roles/doctor.png"),
  DETECTIVE: require("../assets/roles/detective.png"),
  GHOUL: require("../assets/roles/ghoul.png"),
  SPY: require("../assets/roles/spy.png"),
  BODYGUARD: require("../assets/roles/bodyguard.png"),
  SHERIFF: require("../assets/roles/sheriff.png"),
  WITCH: require("../assets/roles/witch.png"),
  MAFIA: require("../assets/roles/mafia.png"),
  GODFATHER: require("../assets/roles/godfather.png"),
  CONSIGLIERE: require("../assets/roles/consigliere.png"),
  CULT_LEADER: require("../assets/roles/cult_leader.png"),
  CULTIST: require("../assets/roles/cultist.png"),
};

function normalizeRole(role?: string | null): string {
  if (!role) {
    return "CITIZEN";
  }
  return String(role)
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
}

export function RoleCard({
  role,
  onHide,
}: {
  role?: string | null;
  onHide?: () => void;
}) {
  const normalizedRole = normalizeRole(role);
  const imageSource = ROLE_CARD_IMAGES[normalizedRole] ?? ROLE_CARD_IMAGES.CITIZEN;

  return (
    <View style={styles.container}>
      <Image source={imageSource} style={styles.image} resizeMode="contain" />
      {onHide && (
        <Pressable
          style={styles.hideButton}
          onPress={onHide}
          accessibilityRole="button"
          accessibilityLabel="إخفاء البطاقة"
        >
          <Text style={styles.hideText}>إخفاء البطاقة</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    alignItems: "center",
    backgroundColor: "#05070A",
    borderRadius: 24,
    padding: 8,
    marginBottom: 14,
    overflow: "hidden",
  },
  image: {
    width: "100%",
    aspectRatio: 240 / 382,
    borderRadius: 18,
  },
  hideButton: {
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: "#17191D",
  },
  hideText: {
    color: "#999",
    fontSize: 13,
    fontWeight: "700",
  },
});
