import React from 'react';
import {
  Image,
  ImageSourcePropType,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { getRoleById, getAllRoles } from '../types/roles';
import {
  normalizeGameRole,
  getRoleCardData,
} from '../lib/game';

type RoleCardProps = {
  role: string | null;
  onHide?: () => void;
  onClick?: () => void;
  size?: 'small' | 'medium' | 'large';
};

const CARD_WIDTHS = {
  small: 150,
  medium: 220,
  large: 290,
} as const;

/**
 * بطاقة الدور.
 * 
 * ✅ البيانات تأتي من:
 * lib/game.ts → getRoleCardData()
 * 
 * الصور من:
 * types/roles.ts → ROLE_IMAGES
 */
export function RoleCard({
  role,
  onHide,
  onClick,
  size = 'large',
}: RoleCardProps) {
  const normalizedRole = normalizeGameRole(role);
  const cardData = getRoleCardData(normalizedRole);
  const roleData = getRoleById(normalizedRole);

  if (!cardData || !roleData) {
    return null;
  }

  const imageSource: ImageSourcePropType | undefined =
    roleData.image;

  return (
    <View style={styles.overlay}>
      <Pressable
        style={[
          styles.card,
          {
            width: CARD_WIDTHS[size],
          },
        ]}
        onPress={onClick}
      >
        {imageSource ? (
          <Image
            source={imageSource}
            style={styles.roleImage}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.imageFallback}>
            <Text style={styles.fallbackText}>
              ?
            </Text>
          </View>
        )}

        <View style={styles.content}>
          <Text style={styles.roleName}>
            {cardData.label}
          </Text>

          <View style={styles.teamBadge}>
            <Text style={styles.teamText}>
              {cardData.teamLabel}
            </Text>
          </View>

          <Text style={styles.description}>
            {cardData.description}
          </Text>

          {onHide && (
            <Pressable
              style={styles.hideButton}
              onPress={onHide}
            >
              <Text style={styles.hideButtonText}>
                إخفاء البطاقة
              </Text>
            </Pressable>
          )}
        </View>
      </Pressable>
    </View>
  );
}

type RoleCardsListProps = {
  roles?: string[];
  onSelect?: (roleId: string) => void;
};

export function RoleCardsList({
  roles,
  onSelect,
}: RoleCardsListProps) {
  const roleList =
    roles && roles.length > 0
      ? roles
      : getAllRoles().map(r => r.id);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.listContent}
    >
      {roleList.map((roleId, index) => {
        const role = getRoleById(roleId);

        if (!role) {
          return null;
        }

        return (
          <Pressable
            key={`${role.id}-${index}`}
            onPress={() =>
              onSelect?.(String(role.id))
            }
            style={styles.listCard}
          >
            {role.image ? (
              <Image
                source={role.image}
                style={styles.listImage}
                resizeMode="cover"
              />
            ) : (
              <View style={styles.listFallback}>
                <Text style={styles.fallbackText}>
                  ?
                </Text>
              </View>
            )}

            <Text
              style={styles.listName}
              numberOfLines={1}
            >
              {role.name}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

type RoleCardByIdProps = {
  roleId: string | null;
  onHide?: () => void;
  onClick?: () => void;
  size?: 'small' | 'medium' | 'large';
};

export function RoleCardById({
  roleId,
  onHide,
  onClick,
  size = 'large',
}: RoleCardByIdProps) {
  return (
    <RoleCard
      role={roleId}
      onHide={onHide}
      onClick={onClick}
      size={size}
    />
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor:
      'rgba(0,0,0,0.78)',
    padding: 20,
  },

  card: {
    overflow: 'hidden',
    borderRadius: 20,
    backgroundColor: '#111827',
    borderWidth: 2,
    borderColor: '#374151',
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.45,
    shadowRadius: 16,
  },

  roleImage: {
    width: '100%',
    aspectRatio: 0.72,
    backgroundColor: '#1f2937',
  },

  imageFallback: {
    width: '100%',
    aspectRatio: 0.72,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1f2937',
  },

  fallbackText: {
    fontSize: 64,
    fontWeight: '900',
    color: '#6b7280',
  },

  content: {
    padding: 16,
    alignItems: 'center',
  },

  roleName: {
    fontSize: 24,
    fontWeight: '900',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 8,
  },

  teamBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: '#374151',
    marginBottom: 10,
  },

  teamText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },

  description: {
    color: '#d1d5db',
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },

  hideButton: {
    marginTop: 16,
    paddingHorizontal: 22,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: '#374151',
  },

  hideButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },

  listContent: {
    paddingHorizontal: 12,
    gap: 12,
  },

  listCard: {
    width: 120,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#111827',
  },

  listImage: {
    width: 120,
    height: 165,
  },

  listFallback: {
    width: 120,
    height: 165,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1f2937',
  },

  listName: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
    paddingHorizontal: 6,
    paddingVertical: 9,
  },
});
