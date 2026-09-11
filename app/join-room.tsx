import React, {
  useState,
} from 'react';

import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';

import {
  router,
} from 'expo-router';

import {
  joinRoom,
} from '../lib/rooms';

export default function JoinRoomScreen() {
  const [
    playerName,
    setPlayerName,
  ] = useState('');

  const [
    roomCode,
    setRoomCode,
  ] = useState('');

  const [
    loading,
    setLoading,
  ] = useState(false);

  async function handleJoinRoom() {
    const name =
      playerName.trim();

    const code =
      roomCode.trim().toUpperCase();

    if (!name) {
      Alert.alert(
        'تنبيه',
        'اكتب اسمك أولاً'
      );
      return;
    }

    if (code.length !== 6) {
      Alert.alert(
        'تنبيه',
        'أدخل كود الغرفة المكون من 6 أحرف'
      );
      return;
    }

    if (loading) {
      return;
    }

    try {
      setLoading(true);

      const room =
        await joinRoom(
          code,
          name
        );

      if (
        !room ||
        !room.code
      ) {
        throw new Error(
          'تم الانضمام لكن كود الغرفة غير موجود.'
        );
      }

      /*
       * مهم:
       * استخدم room.code (6 أحرف) وليس room.id (UUID)
       * المسار [code].tsx يتوقع room code
       * resolveRoom() سيقوم بتحويل code إلى UUID
       */
      router.replace(
        `/room/${encodeURIComponent(room.code)}`
      );
    } catch (error: any) {
      console.error(
        'joinRoom navigation error:',
        error
      );

      Alert.alert(
        'تعذر الانضمام',
        error?.message ||
          'حدث خطأ أثناء الانضمام إلى الغرفة'
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        JOIN ROOM
      </Text>

      <Text style={styles.label}>
        Your name
      </Text>

      <TextInput
        style={styles.input}
        placeholder="Omar"
        placeholderTextColor="#777"
        value={playerName}
        onChangeText={setPlayerName}
        maxLength={20}
        editable={!loading}
      />

      <Text style={styles.label}>
        Room code
      </Text>

      <TextInput
        style={styles.input}
        placeholder="ABC123"
        placeholderTextColor="#777"
        value={roomCode}
        onChangeText={(text) =>
          setRoomCode(
            text
              .toUpperCase()
              .replace(/[^A-Z0-9]/g, '')
              .slice(0, 6)
          )
        }
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={6}
        editable={!loading}
      />

      <TouchableOpacity
        style={[
          styles.button,
          loading &&
            styles.buttonDisabled,
        ]}
        onPress={handleJoinRoom}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator
            color="#fff"
          />
        ) : (
          <Text style={styles.buttonText}>
            JOIN GAME
          </Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.backButton}
        onPress={() => router.back()}
        disabled={loading}
      >
        <Text style={styles.backText}>
          BACK
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles =
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: '#101010',
      padding: 25,
      paddingTop: 70,
    },

    title: {
      color: '#fff',
      fontSize: 30,
      fontWeight: 'bold',
      textAlign: 'center',
      marginBottom: 40,
    },

    label: {
      color: '#fff',
      fontSize: 15,
      marginBottom: 8,
    },

    input: {
      backgroundColor: '#1d1d1d',
      color: '#fff',
      borderRadius: 12,
      padding: 15,
      marginBottom: 20,
      fontSize: 16,
    },

    button: {
      backgroundColor: '#8b0000',
      padding: 17,
      borderRadius: 12,
      alignItems: 'center',
      marginTop: 10,
    },

    buttonDisabled: {
      opacity: 0.6,
    },

    buttonText: {
      color: '#fff',
      fontSize: 17,
      fontWeight: 'bold',
    },

    backButton: {
      alignItems: 'center',
      padding: 18,
    },

    backText: {
      color: '#aaa',
      fontWeight: 'bold',
    },
  });
