import React, { useRef, useState } from 'react';

import {
  Animated,
  Dimensions,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';

import AsyncStorage from '@react-native-async-storage/async-storage';

import { router } from 'expo-router';

const { width } = Dimensions.get('window');

const ONBOARDING_KEY =
  '@mafia_night_onboarding_done';

const slides = [
  {
    icon: 'moon-outline' as const,
    title: 'ادخل عالم Mafia Night',
    description:
      'لعبة مافيا متعددة اللاعبين في الوقت الحقيقي. كوّن غرفة، ادخل مع أصدقائك، واكتشف من يخفي الحقيقة.',
  },
  {
    icon: 'skull-outline' as const,
    title: 'اختر دورك… وأخفِ هويتك',
    description:
      'قد تكون من المافيا، أو الطبيب، أو المحقق، أو مواطنًا. لكل دور مهمة مختلفة، ولا أحد يعرف دورك.',
  },
  {
    icon: 'mic-outline' as const,
    title: 'تحدث، صوّت، وانتصر',
    description:
      'تحدث مع اللاعبين أثناء النهار، استخدم المايك، صوّت على المشتبه به، ونفّذ مهمتك أثناء الليل قبل انتهاء الوقت.',
  },
];

export default function OnboardingScreen() {
  const [currentIndex, setCurrentIndex] = useState(0);

  const listRef = useRef<FlatList>(null);

  const finishingRef = useRef(false);

  const finishOnboarding = async () => {
    if (finishingRef.current) {
      return;
    }

    finishingRef.current = true;

    try {
      await AsyncStorage.setItem(
        ONBOARDING_KEY,
        'true'
      );
    } catch (error) {
      console.error(
        'Onboarding storage error:',
        error
      );
    }

    // مهم جدًا:
    // لا نعود إلى "/"
    // لأن "/" هو بوابة التطبيق.
    // بعد انتهاء الملاحظات نذهب مباشرة إلى الصفحة الرئيسية.
    router.replace('/rooms');
  };

  const nextSlide = () => {
    if (finishingRef.current) {
      return;
    }

    if (currentIndex >= slides.length - 1) {
      finishOnboarding();
      return;
    }

    const nextIndex = currentIndex + 1;

    listRef.current?.scrollToIndex({
      index: nextIndex,
      animated: true,
    });

    setCurrentIndex(nextIndex);
  };

  const handleScroll = (event: any) => {
    const offsetX =
      event.nativeEvent.contentOffset.x;

    const index = Math.round(offsetX / width);

    const safeIndex = Math.max(
      0,
      Math.min(index, slides.length - 1)
    );

    if (safeIndex !== currentIndex) {
      setCurrentIndex(safeIndex);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <View style={styles.logoCircle}>
          <Ionicons
            name="skull"
            size={22}
            color="#D7A94B"
          />
        </View>

        <Text style={styles.logoText}>
          MAFIA NIGHT
        </Text>

        <TouchableOpacity
          style={styles.skipButton}
          activeOpacity={0.7}
          onPress={finishOnboarding}
        >
          <Text style={styles.skipText}>
            تخطي
          </Text>
        </TouchableOpacity>
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
        onMomentumScrollEnd={handleScroll}
        scrollEventThrottle={16}
        renderItem={({ item }) => (
          <View style={styles.slide}>
            <View style={styles.iconOuter}>
              <View style={styles.iconInner}>
                <Ionicons
                  name={item.icon}
                  size={72}
                  color="#D7A94B"
                />
              </View>
            </View>

            <View style={styles.textArea}>
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

      <View style={styles.bottomArea}>
        <View style={styles.dots}>
          {slides.map((_, index) => (
            <View
              key={index}
              style={[
                styles.dot,
                index === currentIndex &&
                  styles.activeDot,
              ]}
            />
          ))}
        </View>

        <TouchableOpacity
          style={styles.mainButton}
          activeOpacity={0.85}
          onPress={nextSlide}
        >
          <Text style={styles.mainButtonText}>
            {currentIndex === slides.length - 1
              ? 'ابدأ اللعب'
              : 'التالي'}
          </Text>

          <Ionicons
            name="arrow-back"
            size={22}
            color="#090A0D"
          />
        </TouchableOpacity>

        <Text style={styles.footerText}>
          لا تثق بأحد… 👁️
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#090A0D',
  },

  topBar: {
    height: 90,
    paddingHorizontal: 22,
    paddingTop: 42,
    flexDirection: 'row',
    alignItems: 'center',
  },

  logoCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: '#D7A94B',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#121318',
  },

  logoText: {
    marginLeft: 10,
    color: '#F5F1E8',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 2,
  },

  skipButton: {
    marginLeft: 'auto',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },

  skipText: {
    color: '#8F929A',
    fontSize: 14,
    fontWeight: '700',
  },

  slide: {
    width,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingBottom: 20,
  },

  iconOuter: {
    width: 190,
    height: 190,
    borderRadius: 95,
    borderWidth: 1,
    borderColor:
      'rgba(215,169,75,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor:
      'rgba(215,169,75,0.04)',
  },

  iconInner: {
    width: 145,
    height: 145,
    borderRadius: 73,
    backgroundColor: '#121318',
    borderWidth: 1,
    borderColor: '#D7A94B',
    alignItems: 'center',
    justifyContent: 'center',
  },

  textArea: {
    marginTop: 42,
    alignItems: 'center',
  },

  title: {
    color: '#F5F1E8',
    fontSize: 29,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 18,
  },

  description: {
    color: '#9B9EA6',
    fontSize: 16,
    lineHeight: 27,
    textAlign: 'center',
    maxWidth: 350,
  },

  bottomArea: {
    paddingHorizontal: 25,
    paddingBottom: 28,
  },

  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },

  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#3A3C42',
    marginHorizontal: 5,
  },

  activeDot: {
    width: 27,
    backgroundColor: '#D7A94B',
  },

  mainButton: {
    height: 58,
    borderRadius: 17,
    backgroundColor: '#D7A94B',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },

  mainButtonText: {
    color: '#090A0D',
    fontSize: 17,
    fontWeight: '900',
  },

  footerText: {
    textAlign: 'center',
    color: '#555861',
    fontSize: 12,
    marginTop: 17,
    fontWeight: '700',
  },
});
