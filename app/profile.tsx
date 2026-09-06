import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';

import {
  getMyProfile,
  saveMyProfileWithAvatar,
  Profile,
} from '@/lib/profile';

export default function ProfileScreen() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [username, setUsername] = useState('');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    try {
      setLoading(true);

      const data = await getMyProfile();

      setProfile(data);
      setUsername(data.username || '');
      setAvatarUri(data.avatar_url || null);
    } catch (error: any) {
      Alert.alert(
        'خطأ',
        error?.message || 'تعذر تحميل الملف الشخصي'
      );
    } finally {
      setLoading(false);
    }
  }

  async function chooseAvatar() {
    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        Alert.alert(
          'صلاحية مطلوبة',
          'اسمح للتطبيق بالوصول إلى الصور لاختيار صورة الملف الشخصي.'
        );
        return;
      }

      const result =
        await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.8,
        });

      if (result.canceled) {
        return;
      }

      const selected =
        result.assets?.[0]?.uri;

      if (selected) {
        setAvatarUri(selected);
      }
    } catch (error: any) {
      Alert.alert(
        'خطأ',
        error?.message || 'تعذر اختيار الصورة'
      );
    }
  }

  async function saveProfile() {
    const cleanName = username.trim();

    if (cleanName.length < 2) {
      Alert.alert(
        'اسم غير صالح',
        'اسم اللاعب يجب أن يحتوي على حرفين على الأقل.'
      );
      return;
    }

    if (cleanName.length > 24) {
      Alert.alert(
        'اسم غير صالح',
        'اسم اللاعب يجب ألا يتجاوز 24 حرفًا.'
      );
      return;
    }

    try {
      setSaving(true);

      /*
       * إذا كانت avatarUri صورة محلية من الهاتف،
       * سيتم رفعها إلى Supabase.
       *
       * إذا كانت بالفعل صورة Supabase،
       * سيتم الاحتفاظ بها.
       */
      const isLocalImage =
        avatarUri &&
        (
          avatarUri.startsWith('file://') ||
          avatarUri.startsWith('content://')
        );

      const updated =
        await saveMyProfileWithAvatar(
          cleanName,
          isLocalImage ? avatarUri : null
        );

      setProfile(updated);
      setUsername(updated.username);
      setAvatarUri(updated.avatar_url);

      Alert.alert(
        'تم الحفظ',
        'تم تحديث ملفك الشخصي بنجاح.'
      );
    } catch (error: any) {
      Alert.alert(
        'تعذر الحفظ',
        error?.message ||
          'حدث خطأ أثناء حفظ الملف الشخصي.'
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>
          جاري تحميل الملف الشخصي...
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>
          الملف الشخصي
        </Text>

        <Text style={styles.subtitle}>
          هويتك داخل Mafia Night
        </Text>
      </View>

      <View style={styles.avatarSection}>
        <Pressable
          style={styles.avatarButton}
          onPress={chooseAvatar}
          disabled={saving}
        >
          {avatarUri ? (
            <Image
              source={{ uri: avatarUri }}
              style={styles.avatar}
            />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Ionicons
                name="person"
                size={54}
              />
            </View>
          )}

          <View style={styles.cameraButton}>
            <Ionicons
              name="camera"
              size={20}
              color="#fff"
            />
          </View>
        </Pressable>

        <Text style={styles.changePhoto}>
          اضغط لتغيير الصورة
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>
          اسم اللاعب
        </Text>

        <TextInput
          value={username}
          onChangeText={setUsername}
          placeholder="اكتب اسمك"
          placeholderTextColor="#777"
          maxLength={24}
          editable={!saving}
          style={styles.input}
        />
      </View>

      {profile && (
        <View style={styles.statsCard}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>
              {profile.games ?? 0}
            </Text>

            <Text style={styles.statLabel}>
              المباريات
            </Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.stat}>
            <Text style={styles.statValue}>
              {profile.wins ?? 0}
            </Text>

            <Text style={styles.statLabel}>
              الانتصارات
            </Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.stat}>
            <Text style={styles.statValue}>
              {profile.rating ?? 0}
            </Text>

            <Text style={styles.statLabel}>
              التقييم
            </Text>
          </View>
        </View>
      )}

      <Pressable
        style={[
          styles.saveButton,
          saving && styles.disabledButton,
        ]}
        onPress={saveProfile}
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator
            color="#fff"
          />
        ) : (
          <>
            <Ionicons
              name="save-outline"
              size={21}
              color="#fff"
            />

            <Text style={styles.saveText}>
              حفظ الملف الشخصي
            </Text>
          </>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#080808',
    paddingHorizontal: 20,
    paddingTop: 60,
  },

  loadingContainer: {
    flex: 1,
    backgroundColor: '#080808',
    justifyContent: 'center',
    alignItems: 'center',
  },

  loadingText: {
    marginTop: 12,
    color: '#aaa',
    fontSize: 15,
  },

  header: {
    marginBottom: 26,
  },

  title: {
    color: '#fff',
    fontSize: 30,
    fontWeight: '800',
  },

  subtitle: {
    color: '#888',
    marginTop: 6,
    fontSize: 14,
  },

  avatarSection: {
    alignItems: 'center',
    marginBottom: 28,
  },

  avatarButton: {
    width: 120,
    height: 120,
    borderRadius: 60,
    position: 'relative',
  },

  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
  },

  avatarPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#202020',
    justifyContent: 'center',
    alignItems: 'center',
  },

  cameraButton: {
    position: 'absolute',
    right: 0,
    bottom: 2,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#b00020',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#080808',
  },

  changePhoto: {
    color: '#888',
    fontSize: 13,
    marginTop: 10,
  },

  card: {
    backgroundColor: '#151515',
    borderRadius: 18,
    padding: 16,
    marginBottom: 16,
  },

  label: {
    color: '#999',
    fontSize: 13,
    marginBottom: 8,
  },

  input: {
    height: 50,
    borderRadius: 12,
    backgroundColor: '#222',
    color: '#fff',
    paddingHorizontal: 15,
    fontSize: 16,
  },

  statsCard: {
    backgroundColor: '#151515',
    borderRadius: 18,
    minHeight: 90,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    marginBottom: 20,
  },

  stat: {
    flex: 1,
    alignItems: 'center',
  },

  statValue: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '800',
  },

  statLabel: {
    color: '#777',
    fontSize: 12,
    marginTop: 4,
  },

  divider: {
    width: 1,
    height: 42,
    backgroundColor: '#333',
  },

  saveButton: {
    height: 54,
    borderRadius: 15,
    backgroundColor: '#b00020',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 9,
  },

  disabledButton: {
    opacity: 0.6,
  },

  saveText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
});
