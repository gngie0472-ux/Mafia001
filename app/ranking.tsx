import React, {
  useCallback,
  useEffect,
  useState,
} from 'react';

import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import { supabase } from '@/lib/supabase';

type Player = {
  user_id: string;
  username: string;
  avatar_url: string | null;
  wins: number;
  games: number;
  rating: number;
};

export default function Ranking() {
  const insets =
    useSafeAreaInsets();

  const [players, setPlayers] =
    useState<Player[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState('');

  const loadRanking =
    useCallback(async () => {
      try {
        setLoading(true);
        setError('');

        /*
         * لا نعتمد على profiles وحدها.
         *
         * get_real_user_ids ترجع فقط
         * المستخدمين المرتبطين فعليًا
         * بـ auth.users.
         */
        const {
          data: realUserIds,
          error: realUsersError,
        } = await supabase.rpc(
          'get_real_user_ids'
        );

        if (realUsersError) {
          throw realUsersError;
        }

        const validIds =
          (realUserIds ?? []) as string[];

        if (validIds.length === 0) {
          setPlayers([]);
          return;
        }

        /*
         * جلب Profiles للحسابات الحقيقية فقط.
         */
        const {
          data,
          error: queryError,
        } = await supabase
          .from('profiles')
          .select(
            'user_id, username, avatar_url, wins, games, rating'
          )
          .in(
            'user_id',
            validIds
          )
          .order(
            'rating',
            { ascending: false }
          )
          .order(
            'wins',
            { ascending: false }
          )
          .order(
            'games',
            { ascending: false }
          )
          .limit(100);

        if (queryError) {
          throw queryError;
        }

        /*
         * حماية إضافية من أي بيانات غير صالحة.
         */
        const cleanedPlayers =
          ((data ?? []) as Player[])
            .filter(
              (player) =>
                validIds.includes(
                  player.user_id
                )
            );

        setPlayers(
          cleanedPlayers
        );
      } catch (err: any) {
        console.error(
          'Ranking error:',
          err
        );

        setError(
          err?.message ||
            'تعذر تحميل الترتيب.'
        );
      } finally {
        setLoading(false);
      }
    }, []);

  useEffect(() => {
    loadRanking();
  }, [loadRanking]);

  const getRankIcon = (
    index: number
  ) => {
    if (index === 0) {
      return 'trophy';
    }

    if (index === 1) {
      return 'medal';
    }

    if (index === 2) {
      return 'ribbon';
    }

    return 'person';
  };

  const getRankColor = (
    index: number
  ) => {
    if (index === 0) {
      return '#D7A94B';
    }

    if (index === 1) {
      return '#B9BEC8';
    }

    if (index === 2) {
      return '#B77B55';
    }

    return '#777983';
  };

  return (
    <SafeAreaView
      style={styles.safe}
      edges={['top']}
    >
      <View style={styles.container}>

        {/* Header */}
        <View
          style={[
            styles.header,
            {
              paddingTop:
                Math.max(
                  insets.top,
                  10
                ),
            },
          ]}
        >
          <Pressable
            style={
              styles.backButton
            }
            onPress={() =>
              router.back()
            }
          >
            <Ionicons
              name="arrow-back"
              size={23}
              color="#EEE"
            />
          </Pressable>

          <View
            style={
              styles.headerIcon
            }
          >
            <Ionicons
              name="trophy"
              size={22}
              color="#D7A94B"
            />
          </View>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={
            false
          }
          contentContainerStyle={[
            styles.content,
            {
              paddingBottom:
                40 +
                insets.bottom,
            },
          ]}
        >
          <Text
            style={styles.kicker}
          >
            SEASON LEADERBOARD
          </Text>

          <Text
            style={styles.title}
          >
            Ranking
          </Text>

          <Text
            style={styles.subtitle}
          >
            أفضل لاعبي Mafia Night حسب التقييم
          </Text>

          {/* Loading */}
          {loading && (
            <View
              style={
                styles.stateCard
              }
            >
              <ActivityIndicator
                size="large"
                color="#D7A94B"
              />

              <Text
                style={
                  styles.stateText
                }
              >
                جاري تحميل الترتيب...
              </Text>
            </View>
          )}

          {/* Error */}
          {!loading &&
            error !== '' && (
              <View
                style={
                  styles.stateCard
                }
              >
                <View
                  style={
                    styles.stateIcon
                  }
                >
                  <Ionicons
                    name="alert-circle-outline"
                    size={32}
                    color="#D7A94B"
                  />
                </View>

                <Text
                  style={
                    styles.stateTitle
                  }
                >
                  تعذر تحميل الترتيب
                </Text>

                <Text
                  style={
                    styles.stateText
                  }
                >
                  {error}
                </Text>

                <Pressable
                  style={
                    styles.retryButton
                  }
                  onPress={
                    loadRanking
                  }
                >
                  <Ionicons
                    name="refresh"
                    size={18}
                    color="#17171D"
                  />

                  <Text
                    style={
                      styles.retryText
                    }
                  >
                    إعادة المحاولة
                  </Text>
                </Pressable>
              </View>
            )}

          {/* Empty */}
          {!loading &&
            error === '' &&
            players.length === 0 && (
              <View
                style={
                  styles.stateCard
                }
              >
                <View
                  style={
                    styles.stateIcon
                  }
                >
                  <Ionicons
                    name="people-outline"
                    size={32}
                    color="#777983"
                  />
                </View>

                <Text
                  style={
                    styles.stateTitle
                  }
                >
                  لا يوجد لاعبون بعد
                </Text>

                <Text
                  style={
                    styles.stateText
                  }
                >
                  سيظهر اللاعبون هنا بعد إنشاء حساباتهم وبدء اللعب.
                </Text>
              </View>
            )}

          {/* Ranking */}
          {!loading &&
            error === '' &&
            players.length > 0 && (
              <View>

                <View
                  style={
                    styles.sectionHeader
                  }
                >
                  <View>
                    <Text
                      style={
                        styles.sectionTitle
                      }
                    >
                      ترتيب اللاعبين
                    </Text>

                    <Text
                      style={
                        styles.sectionSubtitle
                      }
                    >
                      {players.length} لاعب
                    </Text>
                  </View>

                  <Ionicons
                    name="stats-chart"
                    size={20}
                    color="#D7A94B"
                  />
                </View>

                {players.map(
                  (
                    player,
                    index
                  ) => {
                    const rank =
                      index + 1;

                    return (
                      <View
                        key={
                          player.user_id
                        }
                        style={[
                          styles.row,
                          rank <= 3 &&
                            styles.topRow,
                        ]}
                      >

                        {/* Rank */}
                        <View
                          style={
                            styles.rankContainer
                          }
                        >
                          {rank <= 3 ? (
                            <Ionicons
                              name={
                                getRankIcon(
                                  index
                                ) as any
                              }
                              size={21}
                              color={
                                getRankColor(
                                  index
                                )
                              }
                            />
                          ) : (
                            <Text
                              style={
                                styles.rank
                              }
                            >
                              {String(
                                rank
                              ).padStart(
                                2,
                                '0'
                              )}
                            </Text>
                          )}
                        </View>

                        {/* Avatar */}
                        <View
                          style={
                            styles.avatar
                          }
                        >
                          {player.avatar_url ? (
                            <Image
                              source={{
                                uri: player.avatar_url,
                              }}
                              style={
                                styles.avatarImage
                              }
                            />
                          ) : (
                            <Ionicons
                              name="person"
                              size={24}
                              color="#D7A94B"
                            />
                          )}
                        </View>

                        {/* Player */}
                        <View
                          style={
                            styles.playerInfo
                          }
                        >
                          <Text
                            style={
                              styles.name
                            }
                            numberOfLines={
                              1
                            }
                          >
                            {player.username ||
                              'لاعب'}
                          </Text>

                          <View
                            style={
                              styles.statsLine
                            }
                          >
                            <Text
                              style={
                                styles.small
                              }
                            >
                              {player.wins ??
                                0}{' '}
                              فوز
                            </Text>

                            <Text
                              style={
                                styles.separator
                              }
                            >
                              •
                            </Text>

                            <Text
                              style={
                                styles.small
                              }
                            >
                              {player.games ??
                                0}{' '}
                              مباراة
                            </Text>
                          </View>
                        </View>

                        {/* Rating */}
                        <View
                          style={
                            styles.ratingContainer
                          }
                        >
                          <Text
                            style={
                              styles.points
                            }
                          >
                            {player.rating ??
                              0}
                          </Text>

                          <Text
                            style={
                              styles.ratingLabel
                            }
                          >
                            تقييم
                          </Text>
                        </View>
                      </View>
                    );
                  }
                )}
              </View>
            )}

          {/* Info */}
          {!loading &&
            error === '' &&
            players.length > 0 && (
              <View
                style={
                  styles.infoCard
                }
              >
                <View
                  style={
                    styles.infoIcon
                  }
                >
                  <Ionicons
                    name="information-circle"
                    size={22}
                    color="#D7A94B"
                  />
                </View>

                <View
                  style={
                    styles.infoTextContainer
                  }
                >
                  <Text
                    style={
                      styles.infoTitle
                    }
                  >
                    كيف يتم الترتيب؟
                  </Text>

                  <Text
                    style={
                      styles.infoText
                    }
                  >
                    يتم ترتيب اللاعبين حسب التقييم، ثم عدد الانتصارات، ثم عدد المباريات.
                  </Text>
                </View>
              </View>
            )}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles =
  StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor:
        '#090A0D',
    },

    container: {
      flex: 1,
      backgroundColor:
        '#090A0D',
    },

    header: {
      minHeight: 62,
      paddingHorizontal: 20,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent:
        'space-between',
      borderBottomWidth: 1,
      borderBottomColor:
        '#202229',
    },

    backButton: {
      width: 42,
      height: 42,
      borderRadius: 13,
      backgroundColor:
        '#14151A',
      borderWidth: 1,
      borderColor:
        '#25272E',
      alignItems: 'center',
      justifyContent:
        'center',
    },

    headerIcon: {
      width: 42,
      height: 42,
      borderRadius: 13,
      backgroundColor:
        '#292417',
      alignItems: 'center',
      justifyContent:
        'center',
    },

    content: {
      padding: 20,
    },

    kicker: {
      marginTop: 22,
      color: '#D7A94B',
      fontSize: 10,
      letterSpacing: 2,
      fontWeight: '900',
    },

    title: {
      color: '#F4F1EF',
      fontSize: 34,
      fontWeight: '900',
      marginTop: 4,
    },

    subtitle: {
      color: '#777983',
      fontSize: 11,
      marginTop: 6,
      marginBottom: 24,
    },

    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent:
        'space-between',
      marginBottom: 11,
    },

    sectionTitle: {
      color: '#FFFFFF',
      fontSize: 17,
      fontWeight: '800',
    },

    sectionSubtitle: {
      color: '#666872',
      fontSize: 10,
      marginTop: 3,
    },

    row: {
      minHeight: 76,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 13,
      paddingVertical: 11,
      borderRadius: 15,
      borderWidth: 1,
      borderColor: '#25272E',
      backgroundColor: '#14151A',
      marginBottom: 9,
    },

    topRow: {
      borderColor:
        '#393329',
    },

    rankContainer: {
      width: 35,
      alignItems: 'center',
      justifyContent:
        'center',
    },

    rank: {
      color: '#777983',
      fontWeight: '900',
      fontSize: 12,
    },

    avatar: {
      width: 49,
      height: 49,
      borderRadius: 15,
      backgroundColor:
        '#292417',
      alignItems: 'center',
      justifyContent:
        'center',
      marginHorizontal: 10,
      overflow: 'hidden',
    },

    avatarImage: {
      width: '100%',
      height: '100%',
    },

    playerInfo: {
      flex: 1,
      minWidth: 0,
    },

    name: {
      color: '#EEE',
      fontSize: 13,
      fontWeight: '800',
    },

    statsLine: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 5,
    },

    small: {
      color: '#666872',
      fontSize: 9,
    },

    separator: {
      color: '#555760',
      fontSize: 9,
      marginHorizontal: 5,
    },

    ratingContainer: {
      minWidth: 50,
      alignItems: 'flex-end',
    },

    points: {
      color: '#D7A94B',
      fontSize: 15,
      fontWeight: '900',
    },

    ratingLabel: {
      color: '#666872',
      fontSize: 8,
      marginTop: 2,
    },

    stateCard: {
      backgroundColor:
        '#14151A',
      borderWidth: 1,
      borderColor:
        '#25272E',
      borderRadius: 18,
      padding: 30,
      alignItems: 'center',
      justifyContent:
        'center',
      marginTop: 10,
    },

    stateIcon: {
      width: 62,
      height: 62,
      borderRadius: 19,
      backgroundColor:
        '#202127',
      alignItems: 'center',
      justifyContent:
        'center',
      marginBottom: 13,
    },

    stateTitle: {
      color: '#FFFFFF',
      fontSize: 15,
      fontWeight: '900',
      textAlign: 'center',
    },

    stateText: {
      color: '#777983',
      fontSize: 10,
      lineHeight: 17,
      textAlign: 'center',
      marginTop: 7,
    },

    retryButton: {
      height: 42,
      paddingHorizontal: 18,
      borderRadius: 12,
      backgroundColor:
        '#D7A94B',
      alignItems: 'center',
      justifyContent:
        'center',
      flexDirection: 'row',
      gap: 7,
      marginTop: 15,
    },

    retryText: {
      color: '#17171D',
      fontSize: 11,
      fontWeight: '900',
    },

    infoCard: {
      marginTop: 17,
      padding: 13,
      borderRadius: 17,
      backgroundColor:
        '#14151A',
      borderWidth: 1,
      borderColor:
        '#25272E',
      flexDirection: 'row',
      alignItems: 'flex-start',
    },

    infoIcon: {
      width: 36,
      height: 36,
      borderRadius: 11,
      backgroundColor:
        '#292417',
      alignItems: 'center',
      justifyContent:
        'center',
      marginRight: 10,
    },

    infoTextContainer: {
      flex: 1,
    },

    infoTitle: {
      color: '#FFFFFF',
      fontSize: 12,
      fontWeight: '900',
    },

    infoText: {
      color: '#777983',
      fontSize: 10,
      lineHeight: 17,
      marginTop: 4,
    },
  });
