import React, { useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

type Friend = {
  id: string;
  name: string;
  username: string;
  online: boolean;
  wins: number;
};

type FriendRequest = {
  id: string;
  name: string;
  username: string;
};

const INITIAL_FRIENDS: Friend[] = [
  {
    id: '1',
    name: 'لاعب مافيا',
    username: '@mafia_player',
    online: true,
    wins: 12,
  },
  {
    id: '2',
    name: 'المحقق',
    username: '@detective',
    online: true,
    wins: 8,
  },
  {
    id: '3',
    name: 'الطبيب',
    username: '@doctor',
    online: false,
    wins: 17,
  },
];

const INITIAL_REQUESTS: FriendRequest[] = [
  {
    id: 'request-1',
    name: 'لاعب جديد',
    username: '@new_player',
  },
];

export default function FriendsScreen() {
  const [friends, setFriends] = useState<Friend[]>(INITIAL_FRIENDS);
  const [requests, setRequests] =
    useState<FriendRequest[]>(INITIAL_REQUESTS);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'friends' | 'requests'>(
    'friends'
  );

  const filteredFriends = useMemo(() => {
    const value = search.trim().toLowerCase();

    if (!value) {
      return friends;
    }

    return friends.filter(
      (friend) =>
        friend.name.toLowerCase().includes(value) ||
        friend.username.toLowerCase().includes(value)
    );
  }, [friends, search]);

  const handleAddFriend = () => {
    const value = search.trim();

    if (!value) {
      Alert.alert(
        'إضافة صديق',
        'اكتب اسم اللاعب أو اسم المستخدم أولًا.'
      );
      return;
    }

    Alert.alert(
      'تم إرسال الطلب',
      `تم إرسال طلب صداقة إلى ${value}.`
    );

    setSearch('');
  };

  const acceptRequest = (request: FriendRequest) => {
    const newFriend: Friend = {
      id: request.id,
      name: request.name,
      username: request.username,
      online: true,
      wins: 0,
    };

    setFriends((current) => [...current, newFriend]);

    setRequests((current) =>
      current.filter((item) => item.id !== request.id)
    );

    Alert.alert(
      'تمت الإضافة',
      `أصبح ${request.name} من أصدقائك الآن.`
    );
  };

  const rejectRequest = (requestId: string) => {
    setRequests((current) =>
      current.filter((item) => item.id !== requestId)
    );
  };

  const removeFriend = (friend: Friend) => {
    Alert.alert(
      'إزالة صديق',
      `هل تريد إزالة ${friend.name} من قائمة أصدقائك؟`,
      [
        {
          text: 'إلغاء',
          style: 'cancel',
        },
        {
          text: 'إزالة',
          style: 'destructive',
          onPress: () => {
            setFriends((current) =>
              current.filter((item) => item.id !== friend.id)
            );
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
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
        contentContainerStyle={styles.content}
      >
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
              أضف لاعبين جدد، تابع أصدقاءك، وادعهم للعب معك.
            </Text>
          </View>
        </View>

        <View style={styles.searchCard}>
          <View style={styles.searchContainer}>
            <Ionicons
              name="search"
              size={20}
              color="#777782"
            />

            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="ابحث باسم اللاعب أو اسم المستخدم"
              placeholderTextColor="#666670"
              style={styles.searchInput}
              textAlign="right"
              autoCapitalize="none"
            />

            {search.length > 0 && (
              <Pressable
                onPress={() => setSearch('')}
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
            style={styles.addButton}
            onPress={handleAddFriend}
          >
            <Ionicons
              name="person-add"
              size={18}
              color="#17171D"
            />

            <Text style={styles.addButtonText}>
              إضافة صديق
            </Text>
          </Pressable>
        </View>

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

        {activeTab === 'friends' ? (
          <View>
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
                    name="search-outline"
                    size={30}
                    color="#777782"
                  />
                </View>

                <Text style={styles.emptyTitle}>
                  لم يتم العثور على لاعب
                </Text>

                <Text style={styles.emptyText}>
                  جرّب البحث باسم مختلف أو أضف لاعبًا جديدًا.
                </Text>
              </View>
            ) : (
              filteredFriends.map((friend) => (
                <View
                  key={friend.id}
                  style={styles.friendCard}
                >
                  <View style={styles.friendAvatar}>
                    <Ionicons
                      name="person"
                      size={25}
                      color="#D7A94B"
                    />

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
                      {friend.name}
                    </Text>

                    <Text style={styles.friendUsername}>
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
                          {friend.wins} فوز
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
                          `يمكنك دعوة ${friend.name} عند إنشاء غرفة.`
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
                      style={styles.moreButton}
                      onPress={() => removeFriend(friend)}
                    >
                      <Ionicons
                        name="ellipsis-vertical"
                        size={18}
                        color="#777782"
                      />
                    </Pressable>
                  </View>
                </View>
              ))
            )}
          </View>
        ) : (
          <View>
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
                  ستظهر هنا طلبات الصداقة التي تصلك.
                </Text>
              </View>
            ) : (
              requests.map((request) => (
                <View
                  key={request.id}
                  style={styles.requestCard}
                >
                  <View style={styles.requestAvatar}>
                    <Ionicons
                      name="person"
                      size={25}
                      color="#D7A94B"
                    />
                  </View>

                  <View style={styles.requestInfo}>
                    <Text style={styles.friendName}>
                      {request.name}
                    </Text>

                    <Text style={styles.friendUsername}>
                      {request.username}
                    </Text>

                    <Text style={styles.requestText}>
                      يريد إضافتك كصديق
                    </Text>
                  </View>

                  <View style={styles.requestActions}>
                    <Pressable
                      style={styles.acceptButton}
                      onPress={() =>
                        acceptRequest(request)
                      }
                    >
                      <Ionicons
                        name="checkmark"
                        size={19}
                        color="#17171D"
                      />
                    </Pressable>

                    <Pressable
                      style={styles.rejectButton}
                      onPress={() =>
                        rejectRequest(request.id)
                      }
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

        <View style={styles.bottomSpace} />
      </ScrollView>

      <View style={styles.bottomNav}>
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
    height: 82,
    paddingHorizontal: 18,
    paddingTop: 25,
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
    paddingBottom: 30,
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

  addButtonText: {
    color: '#17171D',
    fontSize: 12,
    fontWeight: '900',
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

  friendUsername: {
    color: '#71717C',
    fontSize: 10,
    marginTop: 2,
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
  },

  requestInfo: {
    flex: 1,
  },

  requestText: {
    color: '#777782',
    fontSize: 9,
    marginTop: 6,
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

  bottomSpace: {
    height: 20,
  },

  bottomNav: {
    height: 75,
    backgroundColor: '#15151A',
    borderTopWidth: 1,
    borderTopColor: '#292930',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingBottom: 6,
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
