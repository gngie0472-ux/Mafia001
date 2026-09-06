import React, {
useCallback,
useEffect,
useState,
} from 'react';

import {
ActivityIndicator,
Alert,
FlatList,
Image,
Pressable,
RefreshControl,
StyleSheet,
Text,
TextInput,
View,
} from 'react-native';

import { useRouter } from 'expo-router';

import {
createRoom,
getPublicRooms,
joinPublicRoom,
PublicRoom,
} from '../lib/rooms';

import {
getMyProfile,
Profile,
} from '../lib/profile';

export default function RoomsScreen() {
const router = useRouter();

const [rooms, setRooms] =
useState<PublicRoom[]>([]);

const [profile, setProfile] =
useState<Profile | null>(null);

const [loading, setLoading] =
useState(true);

const [refreshing, setRefreshing] =
useState(false);

const [creating, setCreating] =
useState(false);

const [joiningRoomId, setJoiningRoomId] =
useState<string | null>(null);

const [showCreate, setShowCreate] =
useState(false);

const [roomName, setRoomName] =
useState('Mafia Night');

const [maxPlayers, setMaxPlayers] =
useState('8');

const loadRooms = useCallback(
async (showLoader = false) => {
try {
if (showLoader) {
setLoading(true);
}

    const [roomData, myProfile] =
      await Promise.all([
        getPublicRooms(),
        getMyProfile(),
      ]);

    setRooms(roomData);
    setProfile(myProfile);
  } catch (error: any) {
    console.error(
      'loadRooms:',
      error
    );

    Alert.alert(
      'خطأ',
      error?.message ||
        'تعذر تحميل الغرف.'
    );
  } finally {
    setLoading(false);
  }
},
[]

);

useEffect(() => {
loadRooms(true);
}, [loadRooms]);

/*

* تحديث قائمة الغرف تلقائيًا كل 5 ثوانٍ.
  */
  useEffect(() => {
  const interval =
  setInterval(() => {
  loadRooms(false);
  }, 5000);

return () => {
  clearInterval(interval);
};

}, [loadRooms]);

/*

* إنشاء غرفة عامة.
  */
  const handleCreateRoom =
  async () => {
  const cleanName =
  roomName.trim();
  
  const parsedMax =
  Number(maxPlayers);
  
  if (cleanName.length < 2) {
  Alert.alert(
  'اسم الغرفة',
  'اكتب اسمًا من حرفين على الأقل.'
  );
  return;
  }
  
  if (
  !Number.isInteger(parsedMax) ||
  parsedMax < 4 ||
  parsedMax > 20
  ) {
  Alert.alert(
  'عدد اللاعبين',
  'عدد اللاعبين يجب أن يكون بين 4 و20.'
  );
  return;
  }
  
  if (!profile?.username?.trim()) {
  Alert.alert(
  'الملف الشخصي',
  'يجب تحديد اسم اللاعب من الملف الشخصي أولًا.'
  );
  return;
  }
  
  try {
  setCreating(true);
  
  const room =
  await createRoom(
  cleanName,
  profile.username.trim(),
  parsedMax
  );
  
  setShowCreate(false);
  
  /*
  * مهم جدًا:
  * room.id هو UUID الخاص بالغرفة.
  *
  * لا نستخدم room.code هنا لأن code
  * عبارة عن كود قصير مثل T2GZ6M،
  * بينما شاشة Lobby وقاعدة البيانات
  * تحتاج UUID.
  */
  if (!room?.id) {
  throw new Error(
  'تم إنشاء الغرفة لكن لم يتم العثور على معرف الغرفة.'
  );
  }
  
  router.push(
  "/room/${room.id}"
  );
  } catch (error: any) {
  console.error(
  'createRoom:',
  error
  );
  
  Alert.alert(
  'تعذر إنشاء الغرفة',
  error?.message ||
  'حدث خطأ أثناء إنشاء الغرفة.'
  );
  } finally {
  setCreating(false);
  }
  };

/*

* الانضمام إلى غرفة عامة.
  */
  const handleJoinRoom =
  async (
  room: PublicRoom
  ) => {
  if (
  room.player_count >=
  room.max_players
  ) {
  Alert.alert(
  'الغرفة ممتلئة',
  'لا توجد أماكن متاحة في هذه الغرفة.'
  );
  return;
  }
  
  if (
  room.status &&
  room.status !== 'waiting'
  ) {
  Alert.alert(
  'اللعبة بدأت',
  'لا يمكن الانضمام إلى هذه الغرفة الآن.'
  );
  return;
  }
  
  /*
  
  * نتأكد أولًا من وجود UUID.
    */
    if (!room.id) {
    Alert.alert(
    'خطأ',
    'معرف الغرفة غير موجود.'
    );
    return;
    }
  
  try {
  setJoiningRoomId(
  room.id
  );
  
  await joinPublicRoom(
  room.id
  );
  
  /*
  * مهم جدًا:
  * نستخدم room.id وليس room.code.
  *
  * room.id = UUID
  * room.code = كود قصير مثل T2GZ6M
  *
  * قاعدة البيانات في get_mafia_game_state
  * وغيرها تنتظر UUID.
  */
  router.push(
  "/room/${room.id}"
  );
  } catch (error: any) {
  console.error(
  'joinPublicRoom:',
  error
  );
  
  Alert.alert(
  'تعذر الانضمام',
  error?.message ||
  'حدث خطأ أثناء الانضمام إلى الغرفة.'
  );
  } finally {
  setJoiningRoomId(
  null
  );
  }
  };

const onRefresh =
async () => {
try {
setRefreshing(true);

    await loadRooms(false);
  } finally {
    setRefreshing(false);
  }
};

const renderRoom = ({
item,
}: {
item: PublicRoom;
}) => {
const full =
item.player_count >=
item.max_players;

const unavailable =
  item.status !== 'waiting';

const joining =
  joiningRoomId === item.id;

return (
  <View
    style={
      styles.roomCard
    }
  >
    <View
      style={
        styles.roomTop
      }
    >
      <View
        style={
          styles.roomIcon
        }
      >
        <Text
          style={
            styles.roomIconText
          }
        >
          🎭
        </Text>
      </View>

      <View
        style={
          styles.roomInfo
        }
      >
        <Text
          style={
            styles.roomName
          }
          numberOfLines={1}
        >
          {item.name ||
            'Mafia Night'}
        </Text>

        <Text
          style={
            styles.hostName
          }
          numberOfLines={1}
        >
          المضيف:{' '}
          {item.host_name ||
            'Player'}
        </Text>
      </View>

      <View
        style={[
          styles.statusBadge,
          unavailable &&
            styles.statusPlaying,
        ]}
      >
        <Text
          style={
            styles.statusText
          }
        >
          {unavailable
            ? 'بدأت'
            : 'انتظار'}
        </Text>
      </View>
    </View>

    <View
      style={
        styles.roomBottom
      }
    >
      <View>
        <Text
          style={
            styles.playerCount
          }
        >
          👥 {item.player_count}/
          {item.max_players}
        </Text>
      </View>

      <Pressable
        disabled={
          full ||
          unavailable ||
          joining
        }
        onPress={() =>
          handleJoinRoom(
            item
          )
        }
        style={[
          styles.joinButton,
          (full ||
            unavailable ||
            joining) &&
            styles.disabledButton,
        ]}
      >
        {joining ? (
          <ActivityIndicator
            size="small"
          />
        ) : (
          <Text
            style={
              styles.joinButtonText
            }
          >
            {full
              ? 'ممتلئة'
              : unavailable
              ? 'مغلقة'
              : 'انضمام'}
          </Text>
        )}
      </Pressable>
    </View>
  </View>
);

};

if (loading) {
return (
<View
style={
styles.center
}
>
<ActivityIndicator
size="large"
/>

    <Text
      style={
        styles.loadingText
      }
    >
      جاري تحميل الغرف...
    </Text>
  </View>
);

}

return (
<View
style={
styles.container
}
>
{/* HEADER */}

  <View
    style={
      styles.header
    }
  >
    <View
      style={
        styles.headerTitleBox
      }
    >
      <Text
        style={
          styles.title
        }
      >
        MAFIA NIGHT
      </Text>

      <Text
        style={
          styles.subtitle
        }
      >
        اختر غرفة وابدأ اللعبة
      </Text>
    </View>

    {profile && (
      <Pressable
        style={
          styles.profileButton
        }
        onPress={() =>
          router.push(
            '/profile'
          )
        }
      >
        {profile.avatar_url ? (
          <Image
            source={{
              uri: profile.avatar_url,
            }}
            style={
              styles.profileAvatar
            }
          />
        ) : (
          <View
            style={
              styles.profilePlaceholder
            }
          >
            <Text
              style={
                styles.profileLetter
              }
            >
              {(
                profile.username ||
                'P'
              )
                .charAt(0)
                .toUpperCase()}
            </Text>
          </View>
        )}
      </Pressable>
    )}
  </View>

  {/* PLAYER PROFILE */}

  {profile && (
    <View
      style={
        styles.welcomeCard
      }
    >
      <View>
        <Text
          style={
            styles.welcomeSmall
          }
        >
          مرحبًا
        </Text>

        <Text
          style={
            styles.welcomeName
          }
          numberOfLines={1}
        >
          {profile.username}
        </Text>
      </View>

      <View
        style={
          styles.statsContainer
        }
      >
        <Text
          style={
            styles.statText
          }
        >
          🏆 {profile.wins}
        </Text>

        <Text
          style={
            styles.statText
          }
        >
          ⭐ {profile.rating}
        </Text>
      </View>
    </View>
  )}

  {/* CREATE ROOM */}

  {!showCreate ? (
    <Pressable
      style={
        styles.createButton
      }
      onPress={() =>
        setShowCreate(true)
      }
    >
      <Text
        style={
          styles.createButtonText
        }
      >
        ＋ إنشاء غرفة عامة
      </Text>
    </Pressable>
  ) : (
    <View
      style={
        styles.createCard
      }
    >
      <Text
        style={
          styles.createTitle
        }
      >
        إنشاء غرفة جديدة
      </Text>

      <TextInput
        value={roomName}
        onChangeText={
          setRoomName
        }
        placeholder="اسم الغرفة"
        placeholderTextColor="#777"
        maxLength={40}
        style={
          styles.input
        }
      />

      <TextInput
        value={maxPlayers}
        onChangeText={
          setMaxPlayers
        }
        placeholder="عدد اللاعبين"
        placeholderTextColor="#777"
        keyboardType="number-pad"
        maxLength={2}
        style={
          styles.input
        }
      />

      <View
        style={
          styles.createActions
        }
      >
        <Pressable
          style={
            styles.cancelButton
          }
          onPress={() =>
            setShowCreate(false)
          }
          disabled={creating}
        >
          <Text
            style={
              styles.cancelButtonText
            }
          >
            إلغاء
          </Text>
        </Pressable>

        <Pressable
          style={
            styles.confirmButton
          }
          onPress={
            handleCreateRoom
          }
          disabled={creating}
        >
          {creating ? (
            <ActivityIndicator
              size="small"
            />
          ) : (
            <Text
              style={
                styles.confirmButtonText
              }
            >
              إنشاء
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  )}

  {/* ROOMS */}

  <View
    style={
      styles.listHeader
    }
  >
    <Text
      style={
        styles.listTitle
      }
    >
      الغرف العامة
    </Text>

    <Text
      style={
        styles.roomTotal
      }
    >
      {rooms.length} غرفة
    </Text>
  </View>

  <FlatList
    data={rooms}
    keyExtractor={(item) =>
      item.id
    }
    renderItem={
      renderRoom
    }
    showsVerticalScrollIndicator={
      false
    }
    refreshControl={
      <RefreshControl
        refreshing={
          refreshing
        }
        onRefresh={
          onRefresh
        }
      />
    }
    contentContainerStyle={
      rooms.length === 0
        ? styles.emptyContainer
        : styles.listContent
    }
    ListEmptyComponent={
      <View
        style={
          styles.emptyBox
        }
      >
        <Text
          style={
            styles.emptyIcon
          }
        >
          🎭
        </Text>

        <Text
          style={
            styles.emptyTitle
          }
        >
          لا توجد غرف حاليًا
        </Text>

        <Text
          style={
            styles.emptySubtitle
          }
        >
          أنشئ أول غرفة وابدأ اللعب.
        </Text>

        <Pressable
          style={
            styles.emptyCreateButton
          }
          onPress={() =>
            setShowCreate(true)
          }
        >
          <Text
            style={
              styles.createButtonText
            }
          >
            إنشاء غرفة
          </Text>
        </Pressable>
      </View>
    }
  />
</View>

);
}

const styles =
StyleSheet.create({
container: {
flex: 1,
backgroundColor:
'#08090d',
paddingHorizontal: 16,
},

center: {
  flex: 1,
  backgroundColor:
    '#08090d',
  alignItems: 'center',
  justifyContent:
    'center',
},

loadingText: {
  color: '#999',
  marginTop: 14,
  fontSize: 15,
},

header: {
  paddingTop: 18,
  paddingBottom: 14,
  flexDirection:
    'row',
  alignItems: 'center',
  justifyContent:
    'space-between',
},

headerTitleBox: {
  flex: 1,
},

title: {
  color: '#fff',
  fontSize: 25,
  fontWeight: '900',
  letterSpacing: 2,
},

subtitle: {
  color: '#777',
  fontSize: 13,
  marginTop: 3,
},

profileButton: {
  marginLeft: 12,
},

profileAvatar: {
  width: 46,
  height: 46,
  borderRadius: 23,
},

profilePlaceholder: {
  width: 46,
  height: 46,
  borderRadius: 23,
  backgroundColor:
    '#292c35',
  alignItems: 'center',
  justifyContent:
    'center',
},

profileLetter: {
  color: '#fff',
  fontSize: 18,
  fontWeight: '900',
},

welcomeCard: {
  backgroundColor:
    '#111217',
  borderWidth: 1,
  borderColor:
    '#22242c',
  borderRadius: 15,
  padding: 14,
  flexDirection:
    'row',
  alignItems: 'center',
  justifyContent:
    'space-between',
  marginBottom: 12,
},

welcomeSmall: {
  color: '#777',
  fontSize: 11,
},

welcomeName: {
  color: '#fff',
  fontSize: 17,
  fontWeight: '800',
  marginTop: 2,
  maxWidth: 190,
},

statsContainer: {
  alignItems:
    'flex-end',
},

statText: {
  color: '#aaa',
  fontSize: 12,
  marginVertical: 2,
},

createButton: {
  backgroundColor:
    '#252833',
  borderRadius: 14,
  paddingVertical: 15,
  alignItems: 'center',
  marginBottom: 16,
},

createButtonText: {
  color: '#fff',
  fontSize: 15,
  fontWeight: '900',
},

createCard: {
  backgroundColor:
    '#111217',
  borderRadius: 15,
  padding: 15,
  marginBottom: 16,
  borderWidth: 1,
  borderColor:
    '#292b34',
},

createTitle: {
  color: '#fff',
  fontSize: 18,
  fontWeight: '900',
  marginBottom: 12,
},

input: {
  backgroundColor:
    '#191a20',
  borderRadius: 11,
  borderWidth: 1,
  borderColor:
    '#292b34',
  color: '#fff',
  paddingHorizontal: 12,
  paddingVertical: 12,
  marginBottom: 9,
  fontSize: 15,
},

createActions: {
  flexDirection:
    'row',
  gap: 9,
  marginTop: 3,
},

cancelButton: {
  flex: 1,
  backgroundColor:
    '#1c1d23',
  borderRadius: 11,
  paddingVertical: 13,
  alignItems: 'center',
},

cancelButtonText: {
  color: '#aaa',
  fontWeight: '800',
},

confirmButton: {
  flex: 1,
  backgroundColor:
    '#30333e',
  borderRadius: 11,
  paddingVertical: 13,
  alignItems: 'center',
},

confirmButtonText: {
  color: '#fff',
  fontWeight: '900',
},

listHeader: {
  flexDirection:
    'row',
  alignItems: 'center',
  justifyContent:
    'space-between',
  marginBottom: 9,
},

listTitle: {
  color: '#fff',
  fontSize: 19,
  fontWeight: '900',
},

roomTotal: {
  color: '#666',
  fontSize: 12,
},

listContent: {
  paddingBottom: 30,
},

emptyContainer: {
  flexGrow: 1,
  paddingBottom: 30,
},

roomCard: {
  backgroundColor:
    '#111217',
  borderRadius: 15,
  padding: 14,
  marginBottom: 9,
  borderWidth: 1,
  borderColor:
    '#22242c',
},

roomTop: {
  flexDirection:
    'row',
  alignItems: 'center',
},

roomIcon: {
  width: 46,
  height: 46,
  borderRadius: 12,
  backgroundColor:
    '#1b1c24',
  alignItems: 'center',
  justifyContent:
    'center',
  marginRight: 11,
},

roomIconText: {
  fontSize: 23,
},

roomInfo: {
  flex: 1,
},

roomName: {
  color: '#fff',
  fontSize: 16,
  fontWeight: '900',
},

hostName: {
  color: '#777',
  fontSize: 12,
  marginTop: 4,
},

statusBadge: {
  backgroundColor:
    '#17351f',
  paddingHorizontal: 9,
  paddingVertical: 5,
  borderRadius: 8,
},

statusPlaying: {
  backgroundColor:
    '#3a1b1b',
},

statusText: {
  color: '#fff',
  fontSize: 10,
  fontWeight: '900',
},

roomBottom: {
  flexDirection:
    'row',
  alignItems: 'center',
  justifyContent:
    'space-between',
  marginTop: 13,
},

playerCount: {
  color: '#999',
  fontSize: 12,
},

joinButton: {
  backgroundColor:
    '#252833',
  paddingHorizontal: 20,
  paddingVertical: 9,
  borderRadius: 10,
  minWidth: 80,
  alignItems: 'center',
  justifyContent: 'center',
},

disabledButton: {
  opacity: 0.45,
},

joinButtonText: {
  color: '#fff',
  fontSize: 12,
  fontWeight: '900',
},

emptyBox: {
  flex: 1,
  alignItems: 'center',
  justifyContent: 'center',
  paddingVertical: 70,
},

emptyIcon: {
  fontSize: 45,
  marginBottom: 12,
},

emptyTitle: {
  color: '#fff',
  fontSize: 18,
  fontWeight: '900',
},

emptySubtitle: {
  color: '#777',
  fontSize: 13,
  marginTop: 6,
  marginBottom: 18,
},

emptyCreateButton: {
  backgroundColor:
    '#252833',
  paddingHorizontal: 25,
  paddingVertical: 12,
  borderRadius: 11,
},

});
