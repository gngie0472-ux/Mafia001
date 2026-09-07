import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Friend,
  FriendRequest,
  FriendProfile,
  getFriends,
  getFriendRequests,
  searchPlayers,
  sendFriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
  removeFriend,
} from '@/lib/friends';

type SearchPlayer = FriendProfile;

export default function FriendsScreen() {
  const insets = useSafeAreaInsets();

  const [friends, setFriends] = useState<Friend[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [searchResults, setSearchResults] = useState<SearchPlayer[]>([]);

  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] =
    useState<'friends' | 'requests'>('friends');

  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);

      const [friendsData, requestsData] = await Promise.all([
        getFriends(),
        getFriendRequests(),
      ]);

      setFriends(friendsData);
      setRequests(requestsData);
    } catch (error: any) {
      console.error('Friends load error:', error);

      Alert.alert(
        'خطأ',
        error?.message || 'تعذر تحميل قائمة الأصدقاء.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSearch = async () => {
    const value = search.trim();

    if (!value) {
      setSearchResults([]);
      return;
    }

    try {
      setSearching(true);

      const results = await searchPlayers(value);

      setSearchResults(results);
    } catch (error: any) {
      console.error('Player search error:', error);

      Alert.alert(
        'خطأ',
        error?.message || 'تعذر البحث عن اللاعبين.'
      );
    } finally {
      setSearching(false);
    }
  };

  const handleAddFriend = async (player: SearchPlayer) => {
    try {
      setActionLoading(player.user_id);

      await sendFriendRequest(player.user_id);

      Alert.alert(
        'تم إرسال الطلب',
        `تم إرسال طلب صداقة إلى ${player.username}.`
      );

      setSearchResults((current) =>
        current.filter((item) => item.user_id !== player.user_id)
      );
    } catch (error: any) {
      console.error('Send friend request error:', error);

      Alert.alert(
        'تعذر إرسال الطلب',
        error?.message || 'حدث خطأ أثناء إرسال طلب الصداقة.'
      );
    } finally {
      setActionLoading(null);
    }
  };

  const handleAccept = async (request: FriendRequest) => {
    try {
      setActionLoading(request.id);

      await acceptFriendRequest(request.id);

      await loadData();

      Alert.alert(
        'تمت الإضافة',
        `أصبح ${request.username} من أصدقائك الآن.`
      );
    } catch (error: any) {
      console.error('Accept friend request error:', error);

      Alert.alert(
        'خطأ',
        error?.message || 'تعذر قبول طلب الصداقة.'
      );
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (request: FriendRequest) => {
    try {
      setActionLoading(request.id);

      await rejectFriendRequest(request.id);

      setRequests((current) =>
        current.filter((item) => item.id !== request.id)
      );
    } catch (error: any) {
      console.error('Reject friend request error:', error);

      Alert.alert(
        'خطأ',
        error?.message || 'تعذر رفض طلب الصداقة.'
      );
    } finally {
      setActionLoading(null);
    }
  };

  const handleRemoveFriend = (friend: Friend) => {
    Alert.alert(
      'إزالة صديق',
      `هل تريد إزالة ${friend.username} من قائمة أصدقائك؟`,
      [
        {
          text: 'إلغاء',
          style: 'cancel',
        },
        {
          text: 'إزالة',
          style: 'destructive',
          onPress: async () => {
            try {
              setActionLoading(friend.id);

              await removeFriend(friend.id);

              setFriends((current) =>
                current.filter((item) => item.id !== friend.id)
              );
            } catch (error: any) {
              console.error('Remove friend error:', error);

              Alert.alert(
                'خطأ',
                error?.message || 'تعذر إزالة الصديق.'
              );
            } finally {
              setActionLoading(null);
            }
          },
        },
      ]
    );
  };

  const filteredFriends = useMemo(() => {
    const value = search.trim().toLowerCase();

    if (!value) {
      return friends;
    }

    return friends.filter((friend) =>
      friend.username.toLowerCase().includes(value)
    );
  }, [friends, search]);

  const clearSearch = () => {
    setSearch('');
    setSearchResults([]);
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + 10,
            height: 72 + insets.top,
          },
        ]}
      >
        <Pressable
          style={styles.headerButton}
          onPress={() => router.back()}
        >
          <Ionicons
            name="arrow-forward"
            size={23}
            color="#FFFFFF"
          />
        </Pressable>

        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>الأصدقاء</Text>

          <Text style={styles.headerSubtitle}>
            العب وتواصل مع أصدقائك
          </Text>
        </View>

        <View style={styles.headerIcon}>
          <Ionicons
            name="people"
            size={22}
            color="#D7A94B"
          />
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.content,
          {
            paddingBottom: 110 + insets.bottom,
          },
        ]}
      >
        {/* Hero */}
        <View style={styles.heroCard}>
          <View style={styles.heroIcon}>
            <Ionicons
              name="people"
              size={30}
              color="#D7A94B"
            />
          </View>

          <View style={styles.heroText}>
            <Text style={styles.heroTitle}>
              أصدقاؤك في Mafia Night
            </Text>

            <Text style={styles.heroDescription}>
              أضف لاعبين حقيقيين، تواصل معهم، وادعهم للعب معك.
            </Text>
          </View>
        </View>

        {/* Search */}
        <View style={styles.searchCard}>
          <View style={styles.searchContainer}>
            <Ionicons
              name="search"
              size={20}
              color="#777782"
            />

            <TextInput
              value={search}
              onChangeText={(value) => {
                setSearch(value);
                if (!value.trim()) {
                  setSearchResults([]);
                }
              }}
              placeholder="ابحث باسم اللاعب"
              placeholderTextColor="#666670"
              style={styles.searchInput}
              textAlign="right"
              autoCapitalize="none"
              returnKeyType="search"
              onSubmitEditing={handleSearch}
            />

            {search.length > 0 && (
              <Pressable
                onPress={clearSearch}
                style={styles.clearButton}
              >
                <Ionicons
                  name="close-circle"
                  size={18}
                  color="#777782"
                />
              </Pressable>
            )}
          </View>

          <Pressable
            style={[
              styles.addButton,
              searching && styles.disabledButton,
            ]}
            onPress={handleSearch}
            disabled={searching}
          >
            {searching ? (
              <ActivityIndicator
                size="small"
                color="#17171D"
              />
            ) : (
              <Ionicons
                name="search"
                size={18}
                color="#17171D"
              />
            )}

            <Text style={styles.addButtonText}>
              {searching ? 'جاري البحث...' : 'بحث عن لاعب'}
            </Text>
          </Pressable>
        </View>

        {/* Search results */}
        {searchResults.length > 0 && (
          <View style={styles.searchResultsCard}>
            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.sectionTitle}>
                  نتائج البحث
                </Text>

                <Text style={styles.sectionSubtitle}>
                  {searchResults.length} لاعب
                </Text>
              </View>

              <Ionicons
                name="person-add"
                size={20}
                color="#D7A94B"
              />
            </View>

            {searchResults.map((player) => (
              <View
                key={player.user_id}
                style={styles.playerResult}
              >
                <View style={styles.avatar}>
                  {player.avatar_url ? (
                    <Image
                      source={{ uri: player.avatar_url }}
                      style={styles.avatarImage}
                    />
                  ) : (
                    <Ionicons
                      name="person"
                      size={25}
                      color="#D7A94B"
                    />
                  )}
                </View>

                <View style={styles.playerInfo}>
                  <Text style={styles.friendName}>
                    {player.username}
                  </Text>

                  <Text style={styles.friendStatsText}>
                    {player.wins ?? 0} فوز •{' '}
                    {player.rating ?? 0} تقييم
                  </Text>
                </View>

                <Pressable
                  style={[
                    styles.addPlayerButton,
                    actionLoading === player.user_id &&
                      styles.disabledButton,
                  ]}
                  onPress={() => handleAddFriend(player)}
                  disabled={actionLoading === player.user_id}
                >
                  {actionLoading === player.user_id ? (
                    <ActivityIndicator
                      size="small"
                      color="#17171D"
                    />
                  ) : (
                    <Ionicons
                      name="person-add"
                      size={18}
                      color="#17171D"
                    />
                  )}
                </Pressable>
              </View>
            ))}
          </View>
        )}

        {/* Tabs */}
        <View style={styles.tabs}>
          <Pressable
            style={[
              styles.tab,
              activeTab === 'friends' && styles.activeTab,
            ]}
            onPress={() => setActiveTab('friends')}
          >
            <Ionicons
              name="people"
              size={18}
              color={
                activeTab === 'friends'
                  ? '#17171D'
                  : '#777782'
              }
            />

            <Text
              style={[
                styles.tabText,
                activeTab === 'friends' &&
                  styles.activeTabText,
              ]}
            >
              أصدقائي
            </Text>

            <View
              style={[
                styles.countBadge,
                activeTab === 'friends' &&
                  styles.activeCountBadge,
              ]}
            >
              <Text
                style={[
                  styles.countText,
                  activeTab === 'friends' &&
                    styles.activeCountText,
                ]}
              >
                {friends.length}
              </Text>
            </View>
          </Pressable>

          <Pressable
            style={[
              styles.tab,
              activeTab === 'requests' && styles.activeTab,
            ]}
            onPress={() => setActiveTab('requests')}
          >
            <Ionicons
              name="person-add"
              size={18}
              color={
                activeTab === 'requests'
                  ? '#17171D'
                  : '#777782'
              }
            />

            <Text
              style={[
                styles.tabText,
                activeTab === 'requests' &&
                  styles.activeTabText,
              ]}
            >
              الطلبات
            </Text>

            {requests.length > 0 && (
              <View
                style={[
                  styles.countBadge,
                  activeTab === 'requests' &&
                    styles.activeCountBadge,
                ]}
              >
                <Text
                  style={[
                    styles.countText,
                    activeTab === 'requests' &&
                      styles.activeCountText,
                  ]}
                >
                  {requests.length}
                </Text>
              </View>
            )}
          </Pressable>
        </View>

        {/* Loading */}
        {loading ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator
              size="large"
              color="#D7A94B"
            />

            <Text style={styles.loadingText}>
              جاري تحميل بيانات الأصدقاء...
            </Text>
          </View>
        ) : activeTab === 'friends' ? (
          <View>
            {/* Friends section */}
            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.sectionTitle}>
                  قائمة الأصدقاء
                </Text>

                <Text style={styles.sectionSubtitle}>
                  {friends.length} أصدقاء
                </Text>
              </View>

              <Ionicons
                name="heart"
                size={20}
                color="#D7A94B"
              />
            </View>

            {filteredFriends.length === 0 ? (
              <View style={styles.emptyCard}>
                <View style={styles.emptyIcon}>
                  <Ionicons
                    name="people-outline"
                    size={30}
                    color="#777782"
                  />
                </View>

                <Text style={styles.emptyTitle}>
                  لا يوجد أصدقاء بعد
                </Text>

                <Text style={styles.emptyText}>
                  ابحث عن لاعب حقيقي باستخدام مربع البحث
                  وأرسل له طلب صداقة.
                </Text>
              </View>
            ) : (
              filteredFriends.map((friend) => (
                <View
                  key={friend.id}
                  style={styles.friendCard}
                >
                  <View style={styles.friendAvatar}>
                    {friend.avatar_url ? (
                      <Image
                        source={{
                          uri: friend.avatar_url,
                        }}
                        style={styles.friendAvatarImage}
                      />
                    ) : (
                      <Ionicons
                        name="person"
                        size={25}
                        color="#D7A94B"
                      />
                    )}

                    <View
                      style={[
                        styles.onlineDot,
                        {
                          backgroundColor: friend.online
                            ? '#3BC47A'
                            : '#55555F',
                        },
                      ]}
                    />
                  </View>

                  <View style={styles.friendInfo}>
                    <Text style={styles.friendName}>
                      {friend.username}
                    </Text>

                    <View style={styles.friendStats}>
                      <View style={styles.statusContainer}>
                        <View
                          style={[
                            styles.statusDot,
                            {
                              backgroundColor: friend.online
                                ? '#3BC47A'
                                : '#55555F',
                            },
                          ]}
                        />

                        <Text style={styles.statusText}>
                          {friend.online
                            ? 'متصل الآن'
                            : 'غير متصل'}
                        </Text>
                      </View>

                      <View style={styles.winsContainer}>
                        <Ionicons
                          name="trophy"
                          size={12}
                          color="#D7A94B"
                        />

                        <Text style={styles.winsText}>
                          {friend.wins ?? 0} فوز
                        </Text>
                      </View>
                    </View>
                  </View>

                  <View style={styles.friendActions}>
                    <Pressable
                      style={styles.playButton}
                      onPress={() =>
                        Alert.alert(
                          'دعوة للعب',
                          `يمكنك دعوة ${friend.username} عند إنشاء غرفة.`
                        )
                      }
                    >
                      <Ionicons
                        name="game-controller"
                        size={18}
                        color="#17171D"
                      />
                    </Pressable>

                    <Pressable
                      style={[
                        styles.moreButton,
                        actionLoading === friend.id &&
                          styles.disabledButton,
                      ]}
                      onPress={() =>
                        handleRemoveFriend(friend)
                      }
                      disabled={actionLoading === friend.id}
                    >
                      {actionLoading === friend.id ? (
                        <ActivityIndicator
                          size="small"
                          color="#777782"
                        />
                      ) : (
                        <Ionicons
                          name="trash-outline"
                          size={17}
                          color="#777782"
                        />
                      )}
                    </Pressable>
                  </View>
                </View>
              ))
            )}
          </View>
        ) : (
          <View>
            {/* Requests */}
            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.sectionTitle}>
                  طلبات الصداقة
                </Text>

                <Text style={styles.sectionSubtitle}>
                  {requests.length} طلبات معلقة
                </Text>
              </View>

              <Ionicons
                name="person-add"
                size={20}
                color="#D7A94B"
              />
            </View>

            {requests.length === 0 ? (
              <View style={styles.emptyCard}>
                <View style={styles.emptyIcon}>
                  <Ionicons
                    name="checkmark-circle-outline"
                    size={31}
                    color="#3BC47A"
                  />
                </View>

                <Text style={styles.emptyTitle}>
                  لا توجد طلبات جديدة
                </Text>

                <Text style={styles.emptyText}>
                  ستظهر هنا طلبات الصداقة الحقيقية التي تصلك.
                </Text>
              </View>
            ) : (
              requests.map((request) => (
                <View
                  key={request.id}
                  style={styles.requestCard}
                >
                  <View style={styles.requestAvatar}>
                    {request.avatar_url ? (
                      <Image
                        source={{
                          uri: request.avatar_url,
                        }}
                        style={styles.requestAvatarImage}
                      />
                    ) : (
                      <Ionicons
                        name="person"
                        size={25}
                        color="#D7A94B"
                      />
                    )}
                  </View>

                  <View style={styles.requestInfo}>
                    <Text style={styles.friendName}>
                      {request.username}
                    </Text>

                    <Text style={styles.requestStats}>
                      {request.wins ?? 0} فوز •{' '}
                      {request.rating ?? 0} تقييم
                    </Text>

                    <Text style={styles.requestText}>
                      يريد إضافتك كصديق
                    </Text>
                  </View>

                  <View style={styles.requestActions}>
                    <Pressable
                      style={[
                        styles.acceptButton,
                        actionLoading === request.id &&
                          styles.disabledButton,
                      ]}
                      onPress={() =>
                        handleAccept(request)
                      }
                      disabled={actionLoading === request.id}
                    >
                      {actionLoading === request.id ? (
                        <ActivityIndicator
                          size="small"
                          color="#17171D"
                        />
                      ) : (
                        <Ionicons
                          name="checkmark"
                          size={19}
                          color="#17171D"
                        />
                      )}
                    </Pressable>

                    <Pressable
                      style={styles.rejectButton}
                      onPress={() =>
                        handleReject(request)
                      }
                      disabled={actionLoading === request.id}
                    >
                      <Ionicons
                        name="close"
                        size={19}
                        color="#A8A8B2"
                      />
                    </Pressable>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {/* Tip */}
        <View style={styles.tipCard}>
          <View style={styles.tipIcon}>
            <Ionicons
              name="bulb"
              size={20}
              color="#D7A94B"
            />
          </View>

          <View style={styles.tipTextContainer}>
            <Text style={styles.tipTitle}>
              نصيحة
            </Text>

            <Text style={styles.tipText}>
              أضف أصدقاءك قبل المباراة حتى تتمكن من اللعب
              معهم بسهولة.
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Bottom navigation */}
      <View
        style={[
          styles.bottomNav,
          {
            height: 75 + insets.bottom,
            paddingBottom: insets.bottom + 6,
          },
        ]}
      >
        <Pressable
          style={styles.navItem}
          onPress={() => router.replace('/home')}
        >
          <Ionicons
            name="home-outline"
            size={23}
            color="#777782"
          />
          <Text style={styles.navText}>الرئيسية</Text>
        </Pressable>

        <Pressable
          style={styles.navItem}
          onPress={() => router.replace('/rooms')}
        >
          <Ionicons
            name="game-controller-outline"
            size={23}
            color="#777782"
          />
          <Text style={styles.navText}>اللعب</Text>
        </Pressable>

        <Pressable
          style={styles.navItem}
          onPress={() => router.replace('/inventory')}
        >
          <Ionicons
            name="albums-outline"
            size={23}
            color="#777782"
          />
          <Text style={styles.navText}>المخزون</Text>
        </Pressable>

        <Pressable style={styles.navItem}>
          <View style={styles.activeNavIcon}>
            <Ionicons
              name="people"
              size={22}
              color="#17171D"
            />
          </View>

          <Text style={styles.navTextActive}>
            الأصدقاء
          </Text>
        </Pressable>

        <Pressable
          style={styles.navItem}
          onPress={() => router.replace('/profile')}
        >
          <Ionicons
            name="person-outline"
            size={23}
            color="#777782"
          />
          <Text style={styles.navText}>حسابي</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#101014',
  },

  header: {
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#24242B',
    backgroundColor: '#111116',
  },

  headerButton: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: '#1B1B21',
    alignItems: 'center',
    justifyContent: 'center',
  },

  headerTitleContainer: {
    flex: 1,
    alignItems: 'center',
  },

  headerTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
  },

  headerSubtitle: {
    color: '#777782',
    fontSize: 11,
    marginTop: 2,
  },

  headerIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: '#1B1B21',
    alignItems: 'center',
    justifyContent: 'center',
  },

  content: {
    padding: 16,
  },

  heroCard: {
    backgroundColor: '#19191F',
    borderWidth: 1,
    borderColor: '#2A2A31',
    borderRadius: 20,
    padding: 17,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },

  heroIcon: {
    width: 56,
    height: 56,
    borderRadius: 17,
    backgroundColor: '#292417',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 13,
  },

  heroText: {
    flex: 1,
  },

  heroTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 5,
  },

  heroDescription: {
    color: '#92929D',
    fontSize: 11,
    lineHeight: 18,
  },

  searchCard: {
    backgroundColor: '#19191F',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#292930',
    padding: 11,
    marginBottom: 14,
  },

  searchContainer: {
    height: 48,
    backgroundColor: '#121217',
    borderRadius: 13,
    borderWidth: 1,
    borderColor: '#292930',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },

  searchInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 12,
    paddingHorizontal: 9,
    minHeight: 45,
  },

  clearButton: {
    padding: 3,
  },

  addButton: {
    height: 44,
    borderRadius: 12,
    backgroundColor: '#D7A94B',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 7,
    marginTop: 9,
  },

  addPlayerButton: {
    width: 40,
    height: 40,
    borderRadius: 11,
    backgroundColor: '#D7A94B',
    alignItems: 'center',
    justifyContent: 'center',
  },

  disabledButton: {
    opacity: 0.55,
  },

  addButtonText: {
    color: '#17171D',
    fontSize: 12,
    fontWeight: '900',
  },

  searchResultsCard: {
    backgroundColor: '#19191F',
    borderWidth: 1,
    borderColor: '#292930',
    borderRadius: 18,
    padding: 13,
    marginBottom: 14,
  },

  playerResult: {
    backgroundColor: '#121217',
    borderWidth: 1,
    borderColor: '#292930',
    borderRadius: 14,
    padding: 10,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },

  avatar: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: '#292417',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
    overflow: 'hidden',
  },

  avatarImage: {
    width: '100%',
    height: '100%',
  },

  playerInfo: {
    flex: 1,
  },

  friendStatsText: {
    color: '#777782',
    fontSize: 9,
    marginTop: 4,
  },

  tabs: {
    backgroundColor: '#19191F',
    borderRadius: 15,
    padding: 4,
    flexDirection: 'row',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#292930',
  },

  tab: {
    flex: 1,
    height: 45,
    borderRadius: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },

  activeTab: {
    backgroundColor: '#D7A94B',
  },

  tabText: {
    color: '#858590',
    fontSize: 11,
    fontWeight: '700',
  },

  activeTabText: {
    color: '#17171D',
    fontWeight: '900',
  },

  countBadge: {
    minWidth: 21,
    height: 21,
    borderRadius: 10,
    backgroundColor: '#292930',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },

  activeCountBadge: {
    backgroundColor: '#17171D22',
  },

  countText: {
    color: '#A0A0AA',
    fontSize: 9,
    fontWeight: '800',
  },

  activeCountText: {
    color: '#17171D',
  },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 11,
  },

  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
  },

  sectionSubtitle: {
    color: '#70707B',
    fontSize: 10,
    marginTop: 3,
  },

  friendCard: {
    backgroundColor: '#19191F',
    borderWidth: 1,
    borderColor: '#292930',
    borderRadius: 17,
    padding: 13,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },

  friendAvatar: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: '#292417',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 11,
    position: 'relative',
    overflow: 'hidden',
  },

  friendAvatarImage: {
    width: '100%',
    height: '100%',
  },

  onlineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    position: 'absolute',
    right: 1,
    bottom: 1,
    borderWidth: 2,
    borderColor: '#19191F',
  },

  friendInfo: {
    flex: 1,
  },

  friendName: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },

  friendStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 10,
  },

  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },

  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },

  statusText: {
    color: '#777782',
    fontSize: 9,
  },

  winsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },

  winsText: {
    color: '#777782',
    fontSize: 9,
  },

  friendActions: {
    alignItems: 'center',
    gap: 7,
  },

  playButton: {
    width: 37,
    height: 37,
    borderRadius: 11,
    backgroundColor: '#D7A94B',
    alignItems: 'center',
    justifyContent: 'center',
  },

  moreButton: {
    width: 37,
    height: 30,
    borderRadius: 10,
    backgroundColor: '#222228',
    alignItems: 'center',
    justifyContent: 'center',
  },

  requestCard: {
    backgroundColor: '#19191F',
    borderWidth: 1,
    borderColor: '#292930',
    borderRadius: 17,
    padding: 13,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },

  requestAvatar: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: '#292417',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 11,
    overflow: 'hidden',
  },

  requestAvatarImage: {
    width: '100%',
    height: '100%',
  },

  requestInfo: {
    flex: 1,
  },

  requestStats: {
    color: '#777782',
    fontSize: 9,
    marginTop: 3,
  },

  requestText: {
    color: '#777782',
    fontSize: 9,
    marginTop: 5,
  },

  requestActions: {
    flexDirection: 'row',
    gap: 7,
  },

  acceptButton: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: '#D7A94B',
    alignItems: 'center',
    justifyContent: 'center',
  },

  rejectButton: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: '#29292F',
    alignItems: 'center',
    justifyContent: 'center',
  },

  emptyCard: {
    backgroundColor: '#19191F',
    borderWidth: 1,
    borderColor: '#292930',
    borderRadius: 18,
    padding: 30,
    alignItems: 'center',
    marginBottom: 14,
  },

  emptyIcon: {
    width: 60,
    height: 60,
    borderRadius: 18,
    backgroundColor: '#222228',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 13,
  },

  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },

  emptyText: {
    color: '#777782',
    fontSize: 10,
    textAlign: 'center',
    lineHeight: 17,
    marginTop: 6,
  },

  loadingCard: {
    backgroundColor: '#19191F',
    borderWidth: 1,
    borderColor: '#292930',
    borderRadius: 18,
    padding: 35,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },

  loadingText: {
    color: '#777782',
    fontSize: 11,
    marginTop: 12,
  },

  tipCard: {
    backgroundColor: '#19191F',
    borderWidth: 1,
    borderColor: '#3A3528',
    borderRadius: 17,
    padding: 13,
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },

  tipIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: '#292417',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 11,
  },

  tipTextContainer: {
    flex: 1,
  },

  tipTitle: {
    color: '#D7A94B',
    fontSize: 11,
    fontWeight: '900',
    marginBottom: 3,
  },

  tipText: {
    color: '#858590',
    fontSize: 10,
    lineHeight: 17,
  },

  bottomNav: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#15151A',
    borderTopWidth: 1,
    borderTopColor: '#292930',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },

  navItem: {
    minWidth: 58,
    alignItems: 'center',
    justifyContent: 'center',
  },

  activeNavIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#D7A94B',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 3,
  },

  navText: {
    color: '#777782',
    fontSize: 9,
    marginTop: 3,
  },

  navTextActive: {
    color: '#D7A94B',
    fontSize: 9,
    fontWeight: '800',
    marginTop: 1,
  },
});
