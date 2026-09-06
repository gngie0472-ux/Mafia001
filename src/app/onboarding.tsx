import React, { useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');

const GOLD = '#D7A94B';
const RED = '#B5222E';
const BG = '#090A0D';
const CARD = '#14151A';
const MUTED = '#858792';

const ONBOARDING_KEY = '@mafia_night_onboarding_done';

type Slide = {
  icon: string;
  iconType: 'ion' | 'material';
  title: string;
  description: string;
  accent: string;
};

const slides: Slide[] = [
  {
    icon: 'skull-outline',
    iconType: 'ion',
    title: 'مرحبًا بك في Mafia Night',
    description:
      'في هذه المدينة لا يمكنك الوثوق بالجميع. كوّن فريقك، اخفِ هويتك، واكتشف من يعمل في الخفاء.',
    accent: GOLD,
  },
  {
    icon: 'account-group-outline',
    iconType: 'material',
    title: 'كل لاعب له دور',
    description:
      'قد تكون مافيا، طبيبًا، محققًا أو مواطنًا. دورك السري يحدد مهمتك وطريقة لعبك.',
    accent: RED,
  },
  {
    icon: 'moon-waning-crescent',
    iconType: 'material',
    title: 'الليل مليء بالأسرار',
    description:
      'تتحرك المافيا، يحمي الطبيب، ويحقق المحقق. لديك وقت محدود لاتخاذ القرار.',
    accent: GOLD,
  },
  {
    icon: 'chat-processing-outline',
    iconType: 'material',
    title: 'النهار وقت المواجهة',
    description:
      'تحدث مع اللاعبين، استمع إلى الشكوك، استخدم المايك وصوّت قبل انتهاء الوقت.',
    accent: RED,
  },
];

function SlideIcon({
  slide,
}: {
  slide: Slide;
}) {
  if (slide.iconType === 'ion') {
    return (
      <Ionicons
        name={slide.icon as any}
        size={72}
        color={slide.accent}
      />
    );
  }

  return (
    <MaterialCommunityIcons
      name={slide.icon as any}
      size={72}
      color={slide.accent}
    />
  );
}

export default function OnboardingScreen() {
  const listRef = useRef<FlatList<Slide>>(null);

  const [currentIndex, setCurrentIndex] = useState(0);

  const isLast = currentIndex === slides.length - 1;

  function handleScroll(
    event: NativeSyntheticEvent<NativeScrollEvent>
  ) {
    const offsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / width);

    if (
      index >= 0 &&
      index < slides.length
    ) {
      setCurrentIndex(index);
    }
  }

  function goNext() {
    if (isLast) {
      finishOnboarding();
      return;
    }

    listRef.current?.scrollToIndex({
      index: currentIndex + 1,
      animated: true,
    });
  }

  function skipOnboarding() {
    finishOnboarding();
  }

  async function finishOnboarding() {
    try {
      await AsyncStorage.setItem(
        ONBOARDING_KEY,
        'true'
      );
    } catch (error) {
      console.error(
        'save onboarding state:',
        error
      );
    }

    router.replace('/');
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.topBar}>
          <Text style={styles.brand}>
            MAFIA <Text style={styles.brandGold}>NIGHT</Text>
          </Text>

          {!isLast && (
            <Pressable
              onPress={skipOnboarding}
              style={styles.skipButton}
            >
              <Text style={styles.skipText}>
                تخطي
              </Text>
            </Pressable>
          )}
        </View>

        <FlatList
          ref={listRef}
          data={slides}
          keyExtractor={(_, index) =>
            String(index)
          }
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          renderItem={({ item }) => (
            <View style={styles.slide}>
              <View
                style={[
                  styles.glow,
                  {
                    backgroundColor:
                      item.accent,
                  },
                ]}
              />

              <View
                style={[
                  styles.iconCircle,
                  {
                    borderColor:
                      item.accent + '55',
                    backgroundColor:
                      item.accent + '10',
                  },
                ]}
              >
                <View
                  style={[
                    styles.iconInner,
                    {
                      borderColor:
                        item.accent + '25',
                    },
                  ]}
                >
                  <SlideIcon slide={item} />
                </View>
              </View>

              <View style={styles.textBox}>
                <Text
                  style={[
                    styles.smallTitle,
                    {
                      color: item.accent,
                    },
                  ]}
                >
                  MAFIA NIGHT
                </Text>

                <Text style={styles.title}>
                  {item.title}
                </Text>

                <Text style={styles.description}>
                  {item.description}
                </Text>
              </View>
            </View>
          )}
        />

        <View style={styles.bottom}>
          <View style={styles.dots}>
            {slides.map((slide, index) => (
              <View
                key={index}
                style={[
                  styles.dot,
                  index === currentIndex && {
                    width: 28,
                    backgroundColor:
                      slide.accent,
                  },
                ]}
              />
            ))}
          </View>

          <Pressable
            onPress={goNext}
            style={({ pressed }) => [
              styles.nextButton,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.nextText}>
              {isLast
                ? 'ابدأ اللعب'
                : 'التالي'}
            </Text>

            <Ionicons
              name={
                isLast
                  ? 'play'
                  : 'arrow-forward'
              }
              size={20}
              color="#090A0D"
            />
          </Pressable>

          <Text style={styles.footer}>
            اكشف المافيا قبل أن تكشفك.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: BG,
  },

  container: {
    flex: 1,
    backgroundColor: BG,
  },

  topBar: {
    height: 64,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  brand: {
    color: '#F2F2F4',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 2,
  },

  brandGold: {
    color: GOLD,
  },

  skipButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#292B32',
  },

  skipText: {
    color: MUTED,
    fontSize: 12,
    fontWeight: '700',
  },

  slide: {
    width,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 34,
    position: 'relative',
  },

  glow: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
    opacity: 0.055,
    top: 90,
  },

  iconCircle: {
    width: 190,
    height: 190,
    borderRadius: 95,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 48,
  },

  iconInner: {
    width: 145,
    height: 145,
    borderRadius: 73,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#101116',
  },

  textBox: {
    alignItems: 'center',
    maxWidth: 350,
  },

  smallTitle: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 3,
    marginBottom: 12,
  },

  title: {
    color: '#F7F5F2',
    fontSize: 29,
    fontWeight: '900',
    textAlign: 'center',
    lineHeight: 37,
  },

  description: {
    color: '#92949D',
    fontSize: 15,
    lineHeight: 24,
    textAlign: 'center',
    marginTop: 16,
  },

  bottom: {
    paddingHorizontal: 22,
    paddingBottom: 20,
    alignItems: 'center',
  },

  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 25,
    marginBottom: 16,
    gap: 7,
  },

  dot: {
    width: 7,
    height: 7,
    borderRadius: 5,
    backgroundColor: '#34363D',
  },

  nextButton: {
    width: '100%',
    height: 56,
    borderRadius: 16,
    backgroundColor: GOLD,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },

  nextText: {
    color: '#090A0D',
    fontSize: 16,
    fontWeight: '900',
  },

  pressed: {
    opacity: 0.75,
    transform: [{ scale: 0.985 }],
  },

  footer: {
    color: '#555760',
    fontSize: 11,
    marginTop: 15,
  },
});
