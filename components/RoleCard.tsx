import React, { useMemo } from 'react';

import {
  Image,
  ImageSourcePropType,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  Role,
  RoleType,
  ROLES,
} from '../types/roles';

interface RoleCardProps {
  role: Role | RoleType | string;
  onClick?: () => void;
  onHide?: () => void;
  size?: 'small' | 'medium' | 'large';
}

function normalizeRoleId(
  value: Role | RoleType | string,
): RoleType | null {
  if (
    typeof value === 'object' &&
    value !== null &&
    'id' in value
  ) {
    return value.id as RoleType;
  }

  const normalized = String(value)
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');

  if (
    Object.prototype.hasOwnProperty.call(
      ROLES,
      normalized,
    )
  ) {
    return normalized as RoleType;
  }

  return null;
}

function getRole(
  value: Role | RoleType | string,
): Role | null {
  if (
    typeof value === 'object' &&
    value !== null &&
    'id' in value
  ) {
    return value as Role;
  }

  const id = normalizeRoleId(value);

  if (!id) {
    return null;
  }

  return ROLES[id] ?? null;
}

const RoleCard: React.FC<RoleCardProps> = ({
  role,
  onClick,
  onHide,
  size = 'medium',
}) => {
  const roleData = useMemo(
    () => getRole(role),
    [role],
  );

  if (!roleData) {
    return (
      <View style={styles.notFound}>
        <Text style={styles.notFoundText}>
          تعذر العثور على بطاقة الدور
        </Text>
      </View>
    );
  }

  const imageSource:
    | ImageSourcePropType
    | undefined = roleData.image;

  const content = (
    <View
      style={[
        styles.card,
        styles[`card_${size}`],
        {
          borderColor:
            roleData.borderColor,
        },
      ]}
    >
      <View style={styles.imageContainer}>
        {imageSource ? (
          <Image
            source={imageSource}
            style={styles.image}
            resizeMode="contain"
            accessibilityLabel={`بطاقة دور ${roleData.nameAr}`}
          />
        ) : (
          <View style={styles.imageFallback}>
            <Text style={styles.fallbackIcon}>
              {roleData.icon}
            </Text>

            <Text style={styles.fallbackTitle}>
              {roleData.nameAr}
            </Text>

            <Text style={styles.fallbackText}>
              أضف صورة هذا الدور إلى assets/roles
            </Text>
          </View>
        )}
      </View>

      <View style={styles.info}>
        <View
          style={[
            styles.teamBadge,
            {
              borderColor:
                roleData.borderColor,
            },
          ]}
        >
          <Text
            style={[
              styles.teamText,
              {
                color:
                  roleData.borderColor,
              },
            ]}
          >
            {roleData.team === 'MAFIA'
              ? 'المافيا'
              : roleData.team === 'CULT'
                ? 'الطائفة'
                : 'المواطنون'}
          </Text>
        </View>

        <Text style={styles.nameAr}>
          {roleData.nameAr}
        </Text>

        <Text style={styles.nameEn}>
          {roleData.nameEn.toUpperCase()}
        </Text>

        <Text style={styles.description}>
          {roleData.descriptionAr}
        </Text>

        {size === 'large' &&
          roleData.abilities.length > 0 && (
            <View style={styles.abilities}>
              <Text style={styles.abilitiesTitle}>
                القدرات
              </Text>

              {roleData.abilities.map(
                (ability, index) => (
                  <View
                    key={`${roleData.id}-ability-${index}`}
                    style={styles.abilityRow}
                  >
                    <Text
                      style={[
                        styles.bullet,
                        {
                          color:
                            roleData.borderColor,
                        },
                      ]}
                    >
                      •
                    </Text>

                    <Text
                      style={styles.abilityText}
                    >
                      {ability}
                    </Text>
                  </View>
                ),
              )}
            </View>
          )}
      </View>

      {onHide && (
        <Pressable
          style={styles.hideButton}
          onPress={onHide}
          accessibilityRole="button"
          accessibilityLabel="إخفاء البطاقة"
        >
          <Text style={styles.hideButtonText}>
            إخفاء البطاقة
          </Text>
        </Pressable>
      )}
    </View>
  );

  if (onClick) {
    return (
      <Pressable
        onPress={onClick}
        style={styles.pressable}
      >
        {content}
      </Pressable>
    );
  }

  return content;
};

const styles = StyleSheet.create({
  pressable: {
    width: '100%',
  },

  card: {
    width: '100%',
    backgroundColor: '#070A12',
    borderWidth: 1,
    borderRadius: 22,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: {
      width: 0,
      height: 7,
    },
    elevation: 8,
  },

  card_small: {
    maxWidth: 230,
    alignSelf: 'center',
  },

  card_medium: {
    maxWidth: 380,
    alignSelf: 'center',
  },

  card_large: {
    maxWidth: 520,
    alignSelf: 'center',
  },

  imageContainer: {
    width: '100%',
    aspectRatio: 240 / 382,
    backgroundColor: '#05070C',
  },

  image: {
    width: '100%',
    height: '100%',
  },

  imageFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 25,
  },

  fallbackIcon: {
    fontSize: 64,
    marginBottom: 14,
  },

  fallbackTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 8,
  },

  fallbackText: {
    color: '#8B93A7',
    fontSize: 13,
    textAlign: 'center',
  },

  info: {
    padding: 16,
  },

  teamBadge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginBottom: 10,
  },

  teamText: {
    fontSize: 12,
    fontWeight: '800',
  },

  nameAr: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '900',
    textAlign: 'right',
  },

  nameEn: {
    color: '#7E8799',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    marginTop: 2,
    textAlign: 'right',
  },

  description: {
    color: '#D5D9E2',
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'right',
    marginTop: 14,
  },

  abilities: {
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#202532',
  },

  abilitiesTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'right',
    marginBottom: 9,
  },

  abilityRow: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    marginBottom: 7,
  },

  bullet: {
    fontSize: 18,
    fontWeight: '900',
    marginLeft: 7,
    lineHeight: 20,
  },

  abilityText: {
    flex: 1,
    color: '#B8BFCC',
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'right',
  },

  hideButton: {
    marginHorizontal: 16,
    marginBottom: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#151922',
    alignItems: 'center',
  },

  hideButtonText: {
    color: '#AEB5C2',
    fontSize: 13,
    fontWeight: '800',
  },

  notFound: {
    width: '100%',
    minHeight: 180,
    borderRadius: 20,
    backgroundColor: '#080B12',
    borderWidth: 1,
    borderColor: '#343A48',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },

  notFoundText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
  },
});

export default RoleCard;

export const RoleCardsList: React.FC<{
  onClick?: (role: Role) => void;
  size?: 'small' | 'medium' | 'large';
  filter?: 'all' | 'CITIZEN' | 'MAFIA' | 'CULT';
}> = ({
  onClick,
  size = 'medium',
  filter = 'all',
}) => {
  const filteredRoles = Object.values(
    ROLES,
  ).filter((role) => {
    if (filter === 'all') {
      return true;
    }

    return role.team === filter;
  });

  return (
    <View style={styles.list}>
      {filteredRoles.map((role) => (
        <View
          key={role.id}
          style={styles.listItem}
        >
          <RoleCard
            role={role}
            size={size}
            onClick={() =>
              onClick?.(role)
            }
          />
        </View>
      ))}
    </View>
  );
};

export const RoleCardById: React.FC<{
  roleId: string;
  size?: 'small' | 'medium' | 'large';
}> = ({
  roleId,
  size = 'medium',
}) => {
  const role =
    ROLES[
      roleId
        .trim()
        .toUpperCase()
        .replace(
          /[\s-]+/g,
          '_',
        ) as RoleType
    ];

  if (!role) {
    return (
      <View style={styles.notFound}>
        <Text style={styles.notFoundText}>
          Role not found
        </Text>
      </View>
    );
  }

  return (
    <RoleCard
      role={role}
      size={size}
    />
  );
};

const listStyles = StyleSheet.create({
  list: {
    width: '100%',
  },
});

Object.assign(styles, listStyles);
