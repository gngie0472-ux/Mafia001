import React from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

type RoleCardProps = {
  role?: string | null;
  onHide?: () => void;
};

const ROLE_CARD_IMAGES: Record<string, any> = {
  CITIZEN: require('../assets/roles/citizen.jpg'),
  DOCTOR: require('../assets/roles/doctor.jpg'),
  DETECTIVE: require('../assets/roles/detective.jpg'),
  GHOUL: require('../assets/roles/ghoul.jpg'),
  SPY: require('../assets/roles/spy.jpg'),
  BODYGUARD: require('../assets/roles/bodyguard.jpg'),
  SHERIFF: require('../assets/roles/sheriff.jpg'),
  WITCH: require('../assets/roles/witch.jpg'),
  MAFIA: require('../assets/roles/mafia.jpg'),
  GODFATHER: require('../assets/roles/godfather.jpg'),
  CONSIGLIERE: require('../assets/roles/consigliere.jpg'),
  CULT_LEADER: require('../assets/roles/cult_leader.jpg'),
  CULTIST: require('../assets/roles/cultist.jpg'),
};

function normalizeRole(role?: string | null): string {
  if (!role) {
    return 'CITIZEN';
  }

  return role
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
}

export function RoleCard({
  role,
  onHide,
}: RoleCardProps) {
  const normalizedRole = normalizeRole(role);

  const image =
    ROLE_CARD_IMAGES[normalizedRole] ??
    ROLE_CARD_IMAGES.CITIZEN;

  return (
    <View style={styles.container}>
      <Image
        source={image}
        style={styles.image}
        resizeMode="contain"
      />

      {onHide && (
        <Pressable
          style={styles.hideButton}
          onPress={onHide}
        >
          <Text style={styles.hideText}>
            إخفاء البطاقة
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignItems: 'center',
    backgroundColor: '#05070A',
    borderRadius: 24,
    padding: 8,
    marginBottom: 14,
    overflow: 'hidden',
  },

  image: {
    width: '100%',
    aspectRatio: 240 / 382,
    borderRadius: 18,
  },

  hideButton: {
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#17191D',
  },

  hideText: {
    color: '#999',
    fontSize: 13,
    fontWeight: '700',
  },
});
