import React, { useCallback, useEffect, useState } from 'react';

import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import {
  getMyProfile,
  Profile,
} from '../lib/profile';

const GOLD = '#D7A94B';
const GOLD_LIGHT = '#F0CC72';

export default function HomeScreen() {
  const [profile, setProfile] =
    useState<Profile | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const loadProfile = useCallback(
    async () => {
      try {
        const data = await getMyProfile();
        setProfile(data);
      } catch (error: any) {
        console.error(
          'Home profile error:',
          error
        );

        Alert.alert(
          'خطأ',
          error?.message ||
            'تعذر تحميل الملف الشخصي.'
        );
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const onRefresh = async () => {
    try {
      setRefreshing(true);
      await loadProfile();
    } finally {
      setRefreshing(false);
    }
  };

  const goToRooms = () => {
    router.push('/rooms');
  };

  const goToCreateRoom = () => {
    router.push('/create-room');
  };

  const goToJoinRoom = () => {
    router.push('/join-room');
  };

  const goToProfile = () => {
    router.push('/profile');
  };

  const goToInventory = () => {
    router.push('/inventory');
  };

  const goToFriends = () => {
    router.push('/friends');
  };

  const goToRanking = () => {
    router.push('/ranking');
  };

  const goToVip = () => {
    router.push('/vip');
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <View style={styles.loadingIcon}>
          <Ionicons
            name="skull-outline"
            size={36}
            color={GOLD}
          />
        </View>

        <ActivityIndicator
          size="large"
          color={GOLD}
          style={styles.loader}
        />

        <Text style={styles.loadingText}>
          جاري تجهيز اللعبة...
        </Text>
      </View>
    );
  }

  const username =
    profile?.username?.trim() || 'لاعب';

  const avatarLetter =
    username.charAt(0).toUpperCase();

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={GOLD}
          />
        }
        contentContainerStyle={
          styles.scrollContent
        }
      >
        {/* HEADER */}

        <View style={styles.header}>
          <View>
            <View style={styles.brandRow}>
              <View style={styles.logo}>
                <Ionicons
                  name="skull"
                  size={21}
                  color={GOLD}
                />
              </View>

              <Text style={styles.brand}>
                MAFIA NIGHT
              </Text>
            </View>

            <Text style={styles.headerSubtitle}>
              المدينة لا تنام الليلة...
            </Text>
          </View>

          <Pressable
            onPress={goToProfile}
            style={styles.avatarButton}
          >
            {profile?.avatar_url ? (
              <Image
                source={{
                  uri: profile.avatar_url,
                }}
                style={styles.avatar}
              />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarLetter}>
                  {avatarLetter}
                </Text>
              </View>
            )}

            <View style={styles.onlineDot} />
          </Pressable>
        </View>

        {/* WELCOME CARD */}

        <View style={styles.welcomeCard}>
          <View style={styles.welcomeGlow} />

          <View style={styles.welcomeContent}>
            <Text style={styles.smallLabel}>
              مرحبًا بك
            </Text>

            <Text
              style={styles.username}
              numberOfLines={1}
            >
              {username}
            </Text>

            <Text style={styles.welcomeDescription}>
              هل أنت مستعد لاكتشاف من يخفي الحقيقة؟
            </Text>

            <View style={styles.statsRow}>
              <View style={styles.stat}>
                <Ionicons
                  name="trophy-outline"
                  size={18}
                  color={GOLD}
                />

                <View>
                  <Text style={styles.statValue}>
                    {profile?.wins ?? 0}
                  </Text>

                  <Text style={styles.statLabel}>
                    انتصارات
                  </Text>
                </View>
              </View>

              <View style={styles.statDivider} />

              <View style={styles.stat}>
                <Ionicons
                  name="star-outline"
                  size={18}
                  color={GOLD}
                />

                <View>
                  <Text style={styles.statValue}>
                    {profile?.rating ?? 0}
                  </Text>

                  <Text style={styles.statLabel}>
                    التقييم
                  </Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* MAIN ACTION */}

        <Text style={styles.sectionTitle}>
          ابدأ اللعب
        </Text>

        <Pressable
          onPress={goToRooms}
          style={styles.playButton}
        >
          <View style={styles.playIcon}>
            <Ionicons
              name="play"
              size={25}
              color="#090A0D"
            />
          </View>

          <View style={styles.playTextContainer}>
            <Text style={styles.playTitle}>
              ادخل اللعبة
            </Text>

            <Text style={styles.playSubtitle}>
              اختر غرفة وابدأ المطاردة
            </Text>
          </View>

          <Ionicons
            name="chevron-back"
            size={25}
            color="#090A0D"
          />
        </Pressable>

        {/* QUICK ACTIONS */}

        <View style={styles.quickGrid}>
          <Pressable
            style={styles.quickCard}
            onPress={goToCreateRoom}
          >
            <View
              style={[
                styles.quickIcon,
                styles.goldIcon,
              ]}
            >
              <Ionicons
                name="add"
                size={25}
                color={GOLD}
              />
            </View>

            <Text style={styles.quickTitle}>
              إنشاء غرفة
            </Text>

            <Text style={styles.quickSubtitle}>
              كن المضيف
            </Text>
          </Pressable>

          <Pressable
            style={styles.quickCard}
            onPress={goToJoinRoom}
          >
            <View
              style={[
                styles.quickIcon,
                styles.redIcon,
              ]}
            >
              <Ionicons
                name="key-outline"
                size={23}
                color="#C96B68"
              />
            </View>

            <Text style={styles.quickTitle}>
              انضمام
            </Text>

            <Text style={styles.quickSubtitle}>
              أدخل كود الغرفة
            </Text>
          </Pressable>
        </View>

        {/* MENU */}

        <Text style={styles.sectionTitle}>
          عالم Mafia Night
        </Text>

        <View style={styles.menuCard}>
          <Pressable
            style={styles.menuItem}
            onPress={goToInventory}
          >
            <View
              style={[
                styles.menuIcon,
                styles.menuGold,
              ]}
            >
              <Ionicons
                name="briefcase-outline"
                size={22}
                color={GOLD}
              />
            </View>

            <View style={styles.menuText}>
              <Text style={styles.menuTitle}>
                المخزون
              </Text>

              <Text style={styles.menuSubtitle}>
                البطاقات والأدوار والقدرات
              </Text>
            </View>

            <Ionicons
              name="chevron-back"
              size={21}
              color="#555861"
            />
          </Pressable>

          <View style={styles.menuDivider} />

          <Pressable
            style={styles.menuItem}
            onPress={goToFriends}
          >
            <View
              style={[
                styles.menuIcon,
                styles.menuBlue,
              ]}
            >
              <Ionicons
                name="people-outline"
                size={22}
                color="#78A9D6"
              />
            </View>

            <View style={styles.menuText}>
              <Text style={styles.menuTitle}>
                الأصدقاء
              </Text>

              <Text style={styles.menuSubtitle}>
                أضف أصدقاء والعب معهم
              </Text>
            </View>

            <Ionicons
              name="chevron-back"
              size={21}
              color="#555861"
            />
          </Pressable>

          <View style={styles.menuDivider} />

          <Pressable
            style={styles.menuItem}
            onPress={goToRanking}
          >
            <View
              style={[
                styles.menuIcon,
                styles.menuPurple,
              ]}
            >
              <Ionicons
                name="podium-outline"
                size={22}
                color="#A98BD4"
              />
            </View>

            <View style={styles.menuText}>
              <Text style={styles.menuTitle}>
                المتصدرون
              </Text>

              <Text style={styles.menuSubtitle}>
                نافس أفضل اللاعبين
              </Text>
            </View>

            <Ionicons
              name="chevron-back"
              size={21}
              color="#555861"
            />
          </Pressable>

          <View style={styles.menuDivider} />

          <Pressable
            style={styles.menuItem}
            onPress={goToVip}
          >
            <View
              style={[
                styles.menuIcon,
                styles.menuVip,
              ]}
            >
              <Ionicons
                name="diamond-outline"
                size={22}
                color="#E1B6E8"
              />
            </View>

            <View style={styles.menuText}>
              <View style={styles.vipTitleRow}>
                <Text style={styles.menuTitle}>
                  Mafia VIP
                </Text>

                <View style={styles.vipBadge}>
                  <Text style={styles.vipBadgeText}>
                    VIP
                  </Text>
                </View>
              </View>

              <Text style={styles.menuSubtitle}>
                مزايا حصرية للاعبين
              </Text>
            </View>

            <Ionicons
              name="chevron-back"
              size={21}
              color="#555861"
            />
          </Pressable>
        </View>

        {/* GAME TIP */}

        <View style={styles.tipCard}>
          <View style={styles.tipIcon}>
            <Ionicons
              name="bulb-outline"
              size={21}
              color={GOLD}
            />
          </View>

          <View style={styles.tipTextContainer}>
            <Text style={styles.tipTitle}>
              نصيحة الليلة
            </Text>

            <Text style={styles.tipText}>
              لا تثق بمن يتحدث كثيرًا... ولا بمن
              يصمت كثيرًا.
            </Text>
          </View>
        </View>

        <Text style={styles.footer}>
          لا تثق بأحد • Mafia Night
        </Text>
      </ScrollView>

      {/* BOTTOM NAVIGATION */}

      <View style={styles.bottomNav}>
        <Pressable
          style={styles.navItem}
          onPress={() => {}}
        >
          <Ionicons
            name="home"
            size={23}
            color={GOLD}
          />

          <Text
            style={[
              styles.navText,
              styles.navActive,
            ]}
          >
            الرئيسية
          </Text>
        </Pressable>

        <Pressable
          style={styles.navItem}
          onPress={goToRooms}
        >
          <Ionicons
            name="game-controller-outline"
            size={23}
            color="#777A82"
          />

          <Text style={styles.navText}>
            اللعب
          </Text>
        </Pressable>

        <Pressable
          style={styles.navItem}
          onPress={goToInventory}
        >
          <Ionicons
            name="briefcase-outline"
            size={23}
            color="#777A82"
          />

          <Text style={styles.navText}>
            المخزون
          </Text>
        </Pressable>

        <Pressable
          style={styles.navItem}
          onPress={goToFriends}
        >
          <Ionicons
            name="people-outline"
            size={23}
            color="#777A82"
          />

          <Text style={styles.navText}>
            الأصدقاء
          </Text>
        </Pressable>

        <Pressable
          style={styles.navItem}
          onPress={goToProfile}
        >
          <Ionicons
            name="person-outline"
            size={23}
            color="#777A82"
          />

          <Text style={styles.navText}>
            حسابي
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#090A0D',
  },

  loadingContainer: {
    flex: 1,
    backgroundColor: '#090A0D',
    alignItems: 'center',
    justifyContent: 'center',
  },

  loadingIcon: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 1,
    borderColor: GOLD,
    backgroundColor: '#121318',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 22,
  },

  loader: {
    marginBottom: 15,
  },

  loadingText: {
    color: '#8F929A',
    fontSize: 14,
    fontWeight: '700',
  },

  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 48,
    paddingBottom: 120,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 22,
  },

  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  logo: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#121318',
    borderWidth: 1,
    borderColor: GOLD,
    alignItems: 'center',
    justifyContent: 'center',
  },

  brand: {
    color: '#F5F1E8',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 2,
    marginLeft: 10,
  },

  headerSubtitle: {
    color: '#62656D',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 7,
  },

  avatarButton: {
    position: 'relative',
  },

  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1,
    borderColor: '#383A40',
  },

  avatarPlaceholder: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#1A1B20',
    borderWidth: 1,
    borderColor: '#45474E',
    alignItems: 'center',
    justifyContent: 'center',
  },

  avatarLetter: {
    color: GOLD_LIGHT,
    fontSize: 18,
    fontWeight: '900',
  },

  onlineDot: {
    position: 'absolute',
    right: 1,
    bottom: 1,
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: '#6EBB72',
    borderWidth: 2,
    borderColor: '#090A0D',
  },

  welcomeCard: {
    minHeight: 185,
    borderRadius: 24,
    backgroundColor: '#111216',
    borderWidth: 1,
    borderColor: '#292B31',
    overflow: 'hidden',
    marginBottom: 25,
  },

  welcomeGlow: {
    position: 'absolute',
    width: 190,
    height: 190,
    borderRadius: 95,
    right: -70,
    top: -70,
    backgroundColor: 'rgba(215,169,75,0.07)',
  },

  welcomeContent: {
    padding: 22,
  },

  smallLabel: {
    color: GOLD,
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 5,
  },

  username: {
    color: '#F5F1E8',
    fontSize: 27,
    fontWeight: '900',
    marginBottom: 6,
  },

  welcomeDescription: {
    color: '#858891',
    fontSize: 13,
    lineHeight: 21,
  },

  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
  },

  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },

  statValue: {
    color: '#E8E4DA',
    fontSize: 14,
    fontWeight: '900',
  },

  statLabel: {
    color: '#666970',
    fontSize: 10,
    marginTop: 1,
  },

  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: '#303239',
    marginHorizontal: 22,
  },

  sectionTitle: {
    color: '#EAE6DC',
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 12,
  },

  playButton: {
    height: 76,
    borderRadius: 21,
    backgroundColor: GOLD,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    marginBottom: 13,
  },

  playIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: 'rgba(9,10,13,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  playTextContainer: {
    flex: 1,
    marginHorizontal: 14,
  },

  playTitle: {
    color: '#090A0D',
    fontSize: 17,
    fontWeight: '900',
  },

  playSubtitle: {
    color: 'rgba(9,10,13,0.62)',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 3,
  },

  quickGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 28,
  },

  quickCard: {
    flex: 1,
    minHeight: 130,
    backgroundColor: '#111216',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#292B31',
    padding: 16,
  },

  quickIcon: {
    width: 43,
    height: 43,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },

  goldIcon: {
    backgroundColor: 'rgba(215,169,75,0.09)',
  },

  redIcon: {
    backgroundColor: 'rgba(201,107,104,0.09)',
  },

  quickTitle: {
    color: '#E9E5DC',
    fontSize: 14,
    fontWeight: '900',
  },

  quickSubtitle: {
    color: '#666970',
    fontSize: 10,
    marginTop: 5,
    fontWeight: '600',
  },

  menuCard: {
    backgroundColor: '#111216',
    borderRadius: 21,
    borderWidth: 1,
    borderColor: '#292B31',
    overflow: 'hidden',
    marginBottom: 16,
  },

  menuItem: {
    minHeight: 75,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
  },

  menuIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },

  menuGold: {
    backgroundColor: 'rgba(215,169,75,0.09)',
  },

  menuBlue: {
    backgroundColor: 'rgba(120,169,214,0.09)',
  },

  menuPurple: {
    backgroundColor: 'rgba(169,139,212,0.09)',
  },

  menuVip: {
    backgroundColor: 'rgba(225,182,232,0.09)',
  },

  menuText: {
    flex: 1,
    marginHorizontal: 13,
  },

  menuTitle: {
    color: '#E9E5DC',
    fontSize: 14,
    fontWeight: '900',
  },

  menuSubtitle: {
    color: '#666970',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 4,
  },

  menuDivider: {
    height: 1,
    backgroundColor: '#24262B',
    marginLeft: 72,
  },

  vipTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },

  vipBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    backgroundColor: 'rgba(225,182,232,0.14)',
  },

  vipBadgeText: {
    color: '#D5AEDD',
    fontSize: 8,
    fontWeight: '900',
  },

  tipCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0E0F12',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#24262B',
    padding: 14,
    marginTop: 2,
  },

  tipIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: 'rgba(215,169,75,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  tipTextContainer: {
    flex: 1,
    marginLeft: 12,
  },

  tipTitle: {
    color: GOLD,
    fontSize: 12,
    fontWeight: '900',
    marginBottom: 4,
  },

  tipText: {
    color: '#777A82',
    fontSize: 11,
    lineHeight: 18,
    fontWeight: '600',
  },

  footer: {
    color: '#3F4147',
    textAlign: 'center',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 22,
  },

  bottomNav: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 78,
    backgroundColor: '#0D0E11',
    borderTopWidth: 1,
    borderTopColor: '#24262B',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingBottom: 5,
  },

  navItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },

  navText: {
    color: '#676A72',
    fontSize: 9,
    fontWeight: '700',
  },

  navActive: {
    color: GOLD,
  },
});
