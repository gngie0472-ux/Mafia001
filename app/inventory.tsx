import React, { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type RoleCard = {
  id: string;
  name: string;
  team: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  description: string;
  ability: string;
  objective: string;
};

const ROLES: RoleCard[] = [
  {
    id: 'citizen',
    name: 'المواطن',
    team: 'فريق المواطنين',
    icon: 'people',
    color: '#4A90E2',
    description:
      'عضو عادي من فريق المواطنين. لا يملك قدرة خاصة، لكنه يستطيع المشاركة في النقاش والتصويت.',
    ability:
      'لا توجد قدرة ليلية خاصة. قوتك الأساسية هي الملاحظة، النقاش والتصويت.',
    objective:
      'اكتشاف جميع أفراد المافيا وإخراجهم من اللعبة.',
  },
  {
    id: 'mafia',
    name: 'المافيا',
    team: 'فريق المافيا',
    icon: 'skull',
    color: '#B83B5E',
    description:
      'عضو سري في المافيا. يعمل مع بقية أفراد المافيا للقضاء على المواطنين دون كشف هويته.',
    ability:
      'خلال الليل تتعاون المافيا لاختيار لاعب لاستهدافه.',
    objective:
      'القضاء على المواطنين حتى تصبح المافيا صاحبة السيطرة.',
  },
  {
    id: 'godfather',
    name: 'زعيم المافيا',
    team: 'فريق المافيا',
    icon: 'diamond',
    color: '#8B1E3F',
    description:
      'زعيم المافيا هو قائد الفريق ويعمل على تنسيق قرارات المافيا أثناء الليل.',
    ability:
      'يقود المافيا ويساعد في تحديد الهدف أثناء الليل.',
    objective:
      'حماية المافيا والسيطرة على المدينة.',
  },
  {
    id: 'consigliere',
    name: 'المستشار',
    team: 'فريق المافيا',
    icon: 'briefcase',
    color: '#9B3150',
    description:
      'مساعد مهم لزعيم المافيا، يساعد فريقه في جمع المعلومات عن اللاعبين.',
    ability:
      'يساعد فريق المافيا في معرفة معلومات عن اللاعبين وفق قواعد الدور.',
    objective:
      'مساعدة المافيا على اكتشاف الأدوار والقضاء على الخصوم.',
  },
  {
    id: 'framer',
    name: 'المزوّر',
    team: 'فريق المافيا',
    icon: 'create',
    color: '#A33A59',
    description:
      'عضو من المافيا يستطيع تضليل التحقيقات وإرباك فريق المواطنين.',
    ability:
      'يساعد على جعل لاعب بريء يبدو مشبوهًا أمام بعض التحقيقات.',
    objective:
      'حماية المافيا وتضليل فريق المواطنين.',
  },
  {
    id: 'silencer',
    name: 'المُسكت',
    team: 'فريق المافيا',
    icon: 'volume-mute',
    color: '#7F2947',
    description:
      'عضو من المافيا متخصص في إسكات الخصوم وإضعاف قدرتهم على التأثير.',
    ability:
      'يستخدم قدرته لإسكات لاعب وفق قواعد الدور.',
    objective:
      'تقليل قدرة المواطنين على كشف المافيا.',
  },
  {
    id: 'doctor',
    name: 'الطبيب',
    team: 'فريق المواطنين',
    icon: 'medkit',
    color: '#35A77B',
    description:
      'الطبيب يحاول حماية لاعب واحد أثناء الليل من هجوم المافيا.',
    ability:
      'اختر لاعبًا واحدًا لحمايته أثناء الليل.',
    objective:
      'إنقاذ المواطنين ومساعدة فريقك على البقاء حتى القضاء على المافيا.',
  },
  {
    id: 'detective',
    name: 'المحقق',
    team: 'فريق المواطنين',
    icon: 'search',
    color: '#8E6CCF',
    description:
      'المحقق يمتلك القدرة على التحقيق في لاعب واحد أثناء الليل لمعرفة معلومات عنه.',
    ability:
      'اختر لاعبًا واحدًا للتحقيق فيه كل ليلة.',
    objective:
      'مساعدة المواطنين على كشف أفراد المافيا دون كشف هويتك.',
  },
  {
    id: 'sheriff',
    name: 'الشريف',
    team: 'فريق المواطنين',
    icon: 'shield-checkmark',
    color: '#5578D8',
    description:
      'دور تحقيقي ضمن فريق المواطنين يساعد على كشف اللاعبين المشبوهين.',
    ability:
      'يفحص لاعبًا واحدًا وفق قواعد الشريف.',
    objective:
      'كشف اللاعبين الخطرين وحماية المدينة.',
  },
  {
    id: 'bodyguard',
    name: 'الحارس الشخصي',
    team: 'فريق المواطنين',
    icon: 'shield',
    color: '#3B9B86',
    description:
      'حارس يحاول حماية لاعب آخر من الأخطار أثناء الليل.',
    ability:
      'اختر لاعبًا لحمايته وفق قواعد الحارس الشخصي.',
    objective:
      'حماية الأدوار المهمة في فريق المواطنين.',
  },
  {
    id: 'medium',
    name: 'الوسيط',
    team: 'فريق المواطنين',
    icon: 'chatbubbles',
    color: '#8067B8',
    description:
      'دور متخصص في التواصل والمعلومات المرتبطة باللاعبين الذين خرجوا من اللعبة.',
    ability:
      'يستفيد من قدراته الخاصة وفق مرحلة اللعبة وقواعد الدور.',
    objective:
      'مساعدة المواطنين باستخدام المعلومات المتاحة له.',
  },
  {
    id: 'vigilante',
    name: 'المنتقم',
    team: 'فريق المواطنين',
    icon: 'flash',
    color: '#D19A3A',
    description:
      'مواطن يمتلك قدرة هجومية يمكن استخدامها ضد لاعب يشتبه بأنه عدو.',
    ability:
      'يمكنه استهداف لاعب وفق قواعد المنتقم.',
    objective:
      'القضاء على المافيا وحماية المواطنين.',
  },
  {
    id: 'mayor',
    name: 'العمدة',
    team: 'فريق المواطنين',
    icon: 'ribbon',
    color: '#4D88C7',
    description:
      'شخصية مؤثرة في قرارات المدينة والتصويت.',
    ability:
      'يمتلك تأثيرًا خاصًا على التصويت وفق قواعد اللعبة.',
    objective:
      'قيادة المواطنين للوصول إلى النصر.',
  },
  {
    id: 'tracker',
    name: 'المتعقب',
    team: 'فريق المواطنين',
    icon: 'navigate',
    color: '#4B9AA5',
    description:
      'يتعقب تحركات لاعب أثناء الليل للحصول على معلومات مفيدة.',
    ability:
      'يختار لاعبًا لمعرفة تحركاته وفق قواعد الدور.',
    objective:
      'جمع معلومات تساعد على كشف المافيا.',
  },
  {
    id: 'lookout',
    name: 'المراقب',
    team: 'فريق المواطنين',
    icon: 'eye',
    color: '#5D8DC5',
    description:
      'يراقب لاعبًا لمعرفة اللاعبين الذين قاموا بزيارته.',
    ability:
      'مراقبة لاعب واحد أثناء الليل.',
    objective:
      'اكتشاف تحركات المافيا والأدوار الخطرة.',
  },
  {
    id: 'spy',
    name: 'الجاسوس',
    team: 'فريق المواطنين',
    icon: 'finger-print',
    color: '#7657A9',
    description:
      'دور استخباراتي يجمع معلومات سرية يمكن أن تساعد فريق المواطنين.',
    ability:
      'يستخدم معلوماته وقدراته الخاصة وفق قواعد اللعبة.',
    objective:
      'مساعدة فريق المواطنين على كشف المافيا.',
  },
  {
    id: 'witch',
    name: 'الساحرة',
    team: 'فريق المواطنين',
    icon: 'flask',
    color: '#9A5BC4',
    description:
      'شخصية تمتلك قدرات سحرية يمكن أن تؤثر في أحداث الليل.',
    ability:
      'يمكنها استخدام قدرات الإنقاذ أو الهجوم وفق قواعد اللعبة.',
    objective:
      'استخدام قدراتها لمساعدة فريقها على الفوز.',
  },
  {
    id: 'ghoul',
    name: 'الغول',
    team: 'فريق المواطنين',
    icon: 'skull-outline',
    color: '#6C8B5B',
    description:
      'دور من فريق المواطنين. لا يملك أي إجراء ليلي نشط (لا يوجد زر لإستخدامه في الليل).',
    ability:
      'يسرق قدرة أول لاعب يموت في اللعبة تلقائياً ولمرة واحدة فقط.',
    objective:
      'القضاء على المافيا والأدوار المعادية وتحقيق الفوز لصالح فريق المواطنين.',
  },
  {
    id: 'cult_leader',
    name: 'زعيم الطائفة',
    team: 'فريق الطائفة',
    icon: 'people-circle',
    color: '#8C4A9E',
    description:
      'قائد فريق الطائفة ويحاول توسيع فريقه خلال اللعبة.',
    ability:
      'يحاول تحويل لاعبين إلى أعضاء في الطائفة وفق قواعد اللعبة.',
    objective:
      'تكوين الطائفة وتحقيق شرط الفوز الخاص بها.',
  },
  {
    id: 'cultist',
    name: 'عضو الطائفة',
    team: 'فريق الطائفة',
    icon: 'people-circle-outline',
    color: '#704080',
    description:
      'عضو في فريق الطائفة يعمل مع زعيم الطائفة.',
    ability:
      'يعمل مع زعيم الطائفة وفق قواعد فريق الطائفة.',
    objective:
      'مساعدة الطائفة على تحقيق النصر.',
  },
  {
    id: 'jester',
    name: 'المهرج',
    team: 'فريق مستقل',
    icon: 'happy',
    color: '#C34B78',
    description:
      'شخصية مستقلة هدفها التأثير في نتيجة التصويت.',
    ability:
      'يعتمد فوزه على نتيجة التصويت وفق قواعد المهرج.',
    objective:
      'تحقيق شرط الفوز الخاص بالمهرج.',
  },
  {
    id: 'serial_killer',
    name: 'القاتل المتسلسل',
    team: 'فريق مستقل',
    icon: 'skull',
    color: '#A82D3F',
    description:
      'قاتل مستقل يعمل بمفرده ويشكل خطرًا على جميع الفرق.',
    ability:
      'يستطيع استهداف لاعب أثناء الليل.',
    objective:
      'البقاء والقضاء على خصومه وفق شرط الفوز الخاص بالدور.',
  },
  {
    id: 'survivor',
    name: 'الناجي',
    team: 'فريق مستقل',
    icon: 'heart',
    color: '#B48A3C',
    description:
      'لاعب مستقل يركز على البقاء على قيد الحياة حتى نهاية اللعبة.',
    ability:
      'يمتلك قدرات دفاعية مرتبطة بقواعد الناجي.',
    objective:
      'البقاء على قيد الحياة وتحقيق شرط الفوز.',
  },
];

const RULES = [
  {
    icon: 'moon',
    title: 'الليل',
    text: 'تستخدم الأدوار الخاصة قدراتها. المافيا تختار هدفًا، والطبيب يحاول الحماية، والمحقق يحقق في لاعب واحد.',
  },
  {
    icon: 'sunny',
    title: 'النهار',
    text: 'يستيقظ جميع اللاعبين، وتظهر نتيجة الليل. يبدأ النقاش ثم يصوت اللاعبون لإخراج شخص مشتبه به.',
  },
  {
    icon: 'chatbubbles',
    title: 'النقاش',
    text: 'استخدم المحادثة أثناء الوقت المسموح لمحاولة معرفة من يكذب ومن ينتمي إلى المافيا.',
  },
  {
    icon: 'trophy',
    title: 'الفوز',
    text: 'يفوز المواطنون عند القضاء على المافيا، بينما تفوز المافيا عندما تصبح قادرة على السيطرة على اللعبة.',
  },
];

export default function InventoryScreen() {
  const insets = useSafeAreaInsets();

  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [showRules, setShowRules] = useState(true);

  const selected = useMemo(
    () => ROLES.find((role) => role.id === selectedRole) ?? null,
    [selectedRole]
  );

  const handleRolePress = (role: RoleCard) => {
    setSelectedRole((current) =>
      current === role.id ? null : role.id
    );
  };

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + 10 },
        ]}
      >
        <Pressable
          style={styles.headerButton}
          onPress={() => router.back()}
        >
          <Ionicons
            name="arrow-forward"
            size={22}
            color="#F4E7C1"
          />
        </Pressable>

        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerKicker}>
            MAFIA NIGHT
          </Text>

          <Text style={styles.headerTitle}>
            المخزون
          </Text>

          <Text style={styles.headerSubtitle}>
            مجموعة أدوار اللعبة
          </Text>
        </View>

        <View style={styles.headerIcon}>
          <Ionicons
            name="albums"
            size={21}
            color="#D7A94B"
          />
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          {
            paddingBottom: 100 + insets.bottom,
          },
        ]}
      >
        {/* INTRO */}
        <View style={styles.introCard}>
          <View style={styles.introGlow} />

          <View style={styles.introTop}>
            <View style={styles.introIcon}>
              <Ionicons
                name="sparkles"
                size={25}
                color="#E5BE68"
              />
            </View>

            <View style={styles.introBadge}>
              <Text style={styles.introBadgeText}>
                {ROLES.length} بطاقة
              </Text>
            </View>
          </View>

          <Text style={styles.introTitle}>
            مجموعة الشخصيات
          </Text>

          <Text style={styles.introDescription}>
            اكتشف جميع أدوار Mafia Night وقدراتها وأهدافها.
            اختر أي بطاقة لمعرفة تفاصيل الشخصية.
          </Text>

          <View style={styles.introLine}>
            <View style={styles.introLineGold} />
          </View>
        </View>

        {/* SECTION TITLE */}
        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>
              بطاقات الأدوار
            </Text>

            <Text style={styles.sectionSubtitle}>
              اختر بطاقة لاستكشاف قدراتها
            </Text>
          </View>

          <View style={styles.countBadge}>
            <Text style={styles.countText}>
              {ROLES.length}
            </Text>
          </View>
        </View>

        {/* CARDS */}
        <View style={styles.cardsGrid}>
          {ROLES.map((role, index) => {
            const isSelected =
              selectedRole === role.id;

            return (
              <Pressable
                key={role.id}
                style={[
                  styles.roleCard,
                  {
                    borderColor: isSelected
                      ? role.color
                      : '#302D2B',
                  },
                  isSelected &&
                    styles.roleCardSelected,
                ]}
                onPress={() => handleRolePress(role)}
              >
                <View
                  style={[
                    styles.cardAccent,
                    { backgroundColor: role.color },
                  ]}
                />

                <View style={styles.cardTop}>
                  <Text style={styles.cardNumber}>
                    {String(index + 1).padStart(2, '0')}
                  </Text>

                  <Ionicons
                    name="ellipsis-horizontal"
                    size={16}
                    color="#6F6A66"
                  />
                </View>

                <View
                  style={[
                    styles.roleArtwork,
                    {
                      borderColor: `${role.color}55`,
                      backgroundColor: `${role.color}14`,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.roleArtworkInner,
                      {
                        borderColor: `${role.color}35`,
                      },
                    ]}
                  >
                    <Ionicons
                      name={role.icon}
                      size={43}
                      color={role.color}
                    />
                  </View>
                </View>

                <Text style={styles.roleName}>
                  {role.name}
                </Text>

                <View
                  style={[
                    styles.teamBadge,
                    {
                      borderColor: `${role.color}55`,
                      backgroundColor: `${role.color}12`,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.teamDot,
                      { backgroundColor: role.color },
                    ]}
                  />

                  <Text
                    style={[
                      styles.teamText,
                      { color: role.color },
                    ]}
                  >
                    {role.team}
                  </Text>
                </View>

                <View style={styles.cardBottom}>
                  <Text style={styles.tapText}>
                    {isSelected
                      ? 'مفتوحة'
                      : 'اضغط للتفاصيل'}
                  </Text>

                  <Ionicons
                    name={
                      isSelected
                        ? 'chevron-up'
                        : 'chevron-down'
                    }
                    size={14}
                    color="#77716C"
                  />
                </View>
              </Pressable>
            );
          })}
        </View>

        {/* DETAILS */}
        {selected && (
          <View
            style={[
              styles.detailsCard,
              {
                borderColor: `${selected.color}70`,
              },
            ]}
          >
            <View
              style={[
                styles.detailsAccent,
                { backgroundColor: selected.color },
              ]}
            />

            <View style={styles.detailsHeader}>
              <View
                style={[
                  styles.detailsArtwork,
                  {
                    backgroundColor: `${selected.color}14`,
                    borderColor: `${selected.color}55`,
                  },
                ]}
              >
                <Ionicons
                  name={selected.icon}
                  size={31}
                  color={selected.color}
                />
              </View>

              <View style={styles.detailsTitleContainer}>
                <Text style={styles.detailsOverline}>
                  بطاقة الدور
                </Text>

                <Text style={styles.detailsTitle}>
                  {selected.name}
                </Text>

                <Text
                  style={[
                    styles.detailsTeam,
                    { color: selected.color },
                  ]}
                >
                  {selected.team}
                </Text>
              </View>

              <Pressable
                onPress={() => setSelectedRole(null)}
                style={styles.closeButton}
              >
                <Ionicons
                  name="close"
                  size={20}
                  color="#B9B2AC"
                />
              </Pressable>
            </View>

            <View style={styles.detailSeparator} />

            <Text style={styles.detailDescription}>
              {selected.description}
            </Text>

            <View style={styles.infoBox}>
              <View
                style={[
                  styles.infoIcon,
                  {
                    backgroundColor: `${selected.color}15`,
                  },
                ]}
              >
                <Ionicons
                  name="flash"
                  size={18}
                  color={selected.color}
                />
              </View>

              <View style={styles.infoTextContainer}>
                <Text
                  style={[
                    styles.infoTitle,
                    { color: selected.color },
                  ]}
                >
                  القدرة
                </Text>

                <Text style={styles.infoText}>
                  {selected.ability}
                </Text>
              </View>
            </View>

            <View style={styles.infoBox}>
              <View
                style={[
                  styles.infoIcon,
                  {
                    backgroundColor: `${selected.color}15`,
                  },
                ]}
              >
                <Ionicons
                  name="flag"
                  size={18}
                  color={selected.color}
                />
              </View>

              <View style={styles.infoTextContainer}>
                <Text
                  style={[
                    styles.infoTitle,
                    { color: selected.color },
                  ]}
                >
                  الهدف
                </Text>

                <Text style={styles.infoText}>
                  {selected.objective}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* RULES */}
        <Pressable
          style={styles.rulesHeader}
          onPress={() => setShowRules((value) => !value)}
        >
          <View style={styles.rulesHeaderRight}>
            <View style={styles.rulesIcon}>
              <Ionicons
                name="book"
                size={21}
                color="#D7A94B"
              />
            </View>

            <View>
              <Text style={styles.rulesTitle}>
                كيف تلعب Mafia Night؟
              </Text>

              <Text style={styles.rulesSubtitle}>
                شرح سريع للعبة
              </Text>
            </View>
          </View>

          <View style={styles.rulesArrow}>
            <Ionicons
              name={
                showRules
                  ? 'chevron-up'
                  : 'chevron-down'
              }
              size={19}
              color="#B9B2AC"
            />
          </View>
        </Pressable>

        {showRules && (
          <View style={styles.rulesContainer}>
            {RULES.map((rule, index) => (
              <View
                key={rule.title}
                style={[
                  styles.ruleRow,
                  index !== RULES.length - 1 &&
                    styles.ruleRowBorder,
                ]}
              >
                <View style={styles.ruleNumber}>
                  <Text style={styles.ruleNumberText}>
                    {index + 1}
                  </Text>
                </View>

                <View style={styles.ruleIconContainer}>
                  <Ionicons
                    name={
                      rule.icon as keyof typeof Ionicons.glyphMap
                    }
                    size={20}
                    color="#D7A94B"
                  />
                </View>

                <View style={styles.ruleTextContainer}>
                  <Text style={styles.ruleTitle}>
                    {rule.title}
                  </Text>

                  <Text style={styles.ruleText}>
                    {rule.text}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* FRIENDS */}
        <View style={styles.friendsCard}>
          <View style={styles.friendsTop}>
            <View style={styles.friendsIcon}>
              <Ionicons
                name="person-add"
                size={22}
                color="#D7A94B"
              />
            </View>

            <View style={styles.friendsTextContainer}>
              <Text style={styles.friendsTitle}>
                العب مع أصدقائك
              </Text>

              <Text style={styles.friendsText}>
                أضف أصدقاءك وتواصل معهم قبل بدء المباراة.
              </Text>
            </View>
          </View>

          <Pressable
            style={styles.friendsButton}
            onPress={() => router.push('/friends')}
          >
            <Text style={styles.friendsButtonText}>
              الأصدقاء
            </Text>

            <Ionicons
              name="arrow-back"
              size={17}
              color="#17171D"
            />
          </Pressable>
        </View>

        <View style={styles.bottomSpace} />
      </ScrollView>

      {/* BOTTOM NAV */}
      <View
        style={[
          styles.bottomNav,
          {
            height: 75 + insets.bottom,
            paddingBottom: Math.max(
              insets.bottom,
              8
            ),
          },
        ]}
      >
        <Pressable
          style={styles.navItem}
          onPress={() => router.replace('/home')}
        >
          <Ionicons
            name="home-outline"
            size={22}
            color="#777782"
          />

          <Text style={styles.navText}>
            الرئيسية
          </Text>
        </Pressable>

        <Pressable
          style={styles.navItem}
          onPress={() => router.replace('/rooms')}
        >
          <Ionicons
            name="game-controller-outline"
            size={22}
            color="#777782"
          />

          <Text style={styles.navText}>
            اللعب
          </Text>
        </Pressable>

        <Pressable style={styles.navItem}>
          <View style={styles.activeNavIcon}>
            <Ionicons
              name="albums"
              size={21}
              color="#17171D"
            />
          </View>

          <Text style={styles.navTextActive}>
            المخزون
          </Text>
        </Pressable>

        <Pressable
          style={styles.navItem}
          onPress={() => router.replace('/friends')}
        >
          <Ionicons
            name="people-outline"
            size={22}
            color="#777782"
          />

          <Text style={styles.navText}>
            الأصدقاء
          </Text>
        </Pressable>

        <Pressable
          style={styles.navItem}
          onPress={() => router.replace('/profile')}
        >
          <Ionicons
            name="person-outline"
            size={22}
            color="#777782"
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
    backgroundColor: '#0C0B0B',
  },

  header: {
    minHeight: 96,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#272321',
    backgroundColor: '#100F0F',
  },

  headerButton: {
    width: 43,
    height: 43,
    borderRadius: 14,
    backgroundColor: '#1A1817',
    borderWidth: 1,
    borderColor: '#302B27',
    alignItems: 'center',
    justifyContent: 'center',
  },

  headerTitleContainer: {
    flex: 1,
    alignItems: 'center',
  },

  headerKicker: {
    color: '#8B837A',
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 2,
    marginBottom: 1,
  },

  headerTitle: {
    color: '#F6F1E8',
    fontSize: 21,
    fontWeight: '900',
  },

  headerSubtitle: {
    color: '#77716C',
    fontSize: 10,
    marginTop: 2,
  },

  headerIcon: {
    width: 43,
    height: 43,
    borderRadius: 14,
    backgroundColor: '#1A1817',
    borderWidth: 1,
    borderColor: '#302B27',
    alignItems: 'center',
    justifyContent: 'center',
  },

  content: {
    padding: 16,
  },

  introCard: {
    overflow: 'hidden',
    backgroundColor: '#171514',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#39312A',
    padding: 18,
    marginBottom: 25,
  },

  introGlow: {
    position: 'absolute',
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: '#D7A94B',
    opacity: 0.045,
    right: -55,
    top: -65,
  },

  introTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },

  introIcon: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: '#282117',
    borderWidth: 1,
    borderColor: '#4A3B21',
    alignItems: 'center',
    justifyContent: 'center',
  },

  introBadge: {
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: '#211C15',
    borderWidth: 1,
    borderColor: '#4A3B21',
  },

  introBadgeText: {
    color: '#D7A94B',
    fontSize: 10,
    fontWeight: '900',
  },

  introTitle: {
    color: '#F7F1E7',
    fontSize: 19,
    fontWeight: '900',
    textAlign: 'right',
    marginBottom: 6,
  },

  introDescription: {
    color: '#96908A',
    fontSize: 12,
    lineHeight: 20,
    textAlign: 'right',
  },

  introLine: {
    height: 1,
    backgroundColor: '#2D2926',
    marginTop: 17,
    overflow: 'hidden',
  },

  introLineGold: {
    height: 1,
    width: 70,
    backgroundColor: '#D7A94B',
    alignSelf: 'flex-end',
  },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },

  sectionTitle: {
    color: '#F4EFE7',
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'right',
  },

  sectionSubtitle: {
    color: '#716C67',
    fontSize: 10,
    marginTop: 3,
    textAlign: 'right',
  },

  countBadge: {
    minWidth: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: '#211C15',
    borderWidth: 1,
    borderColor: '#493A20',
    alignItems: 'center',
    justifyContent: 'center',
  },

  countText: {
    color: '#D7A94B',
    fontSize: 13,
    fontWeight: '900',
  },

  cardsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },

  roleCard: {
    width: '48.3%',
    minHeight: 235,
    marginBottom: 13,
    borderRadius: 19,
    backgroundColor: '#151312',
    borderWidth: 1,
    padding: 11,
    overflow: 'hidden',
  },

  roleCardSelected: {
    backgroundColor: '#191715',
    transform: [{ scale: 1.01 }],
  },

  cardAccent: {
    position: 'absolute',
    width: 48,
    height: 3,
    top: 0,
    right: 13,
    borderBottomLeftRadius: 5,
    borderBottomRightRadius: 5,
  },

  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },

  cardNumber: {
    color: '#5D5752',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1,
  },

  roleArtwork: {
    width: 91,
    height: 105,
    alignSelf: 'center',
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },

  roleArtworkInner: {
    width: 69,
    height: 83,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  roleName: {
    color: '#F2EDE5',
    fontSize: 15,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 7,
  },

  teamBadge: {
    minHeight: 25,
    borderRadius: 9,
    borderWidth: 1,
    paddingHorizontal: 7,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },

  teamDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    marginLeft: 5,
  },

  teamText: {
    fontSize: 8,
    fontWeight: '800',
    textAlign: 'center',
  },

  cardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    gap: 4,
  },

  tapText: {
    color: '#6F6964',
    fontSize: 8,
    fontWeight: '700',
  },

  detailsCard: {
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#171514',
    borderRadius: 21,
    borderWidth: 1,
    padding: 17,
    marginTop: 4,
    marginBottom: 23,
  },

  detailsAccent: {
    position: 'absolute',
    top: 0,
    right: 18,
    width: 65,
    height: 3,
    borderBottomLeftRadius: 5,
    borderBottomRightRadius: 5,
  },

  detailsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  detailsArtwork: {
    width: 60,
    height: 60,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },

  detailsTitleContainer: {
    flex: 1,
  },

  detailsOverline: {
    color: '#77716C',
    fontSize: 9,
    fontWeight: '700',
    marginBottom: 2,
    textAlign: 'right',
  },

  detailsTitle: {
    color: '#F6F0E8',
    fontSize: 19,
    fontWeight: '900',
    textAlign: 'right',
  },

  detailsTeam: {
    fontSize: 10,
    fontWeight: '800',
    marginTop: 3,
    textAlign: 'right',
  },

  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: '#24201E',
    borderWidth: 1,
    borderColor: '#38322E',
    alignItems: 'center',
    justifyContent: 'center',
  },

  detailSeparator: {
    height: 1,
    backgroundColor: '#2C2825',
    marginVertical: 15,
  },

  detailDescription: {
    color: '#B1ABA4',
    fontSize: 12,
    lineHeight: 20,
    textAlign: 'right',
    marginBottom: 9,
  },

  infoBox: {
    backgroundColor: '#11100F',
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#2A2724',
    padding: 11,
    flexDirection: 'row',
    marginTop: 8,
  },

  infoIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },

  infoTextContainer: {
    flex: 1,
  },

  infoTitle: {
    fontSize: 10,
    fontWeight: '900',
    marginBottom: 3,
    textAlign: 'right',
  },

  infoText: {
    color: '#94908B',
    fontSize: 11,
    lineHeight: 18,
    textAlign: 'right',
  },

  rulesHeader: {
    backgroundColor: '#171514',
    borderRadius: 19,
    borderWidth: 1,
    borderColor: '#302C29',
    minHeight: 72,
    padding: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 9,
  },

  rulesHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },

  rulesIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#292117',
    borderWidth: 1,
    borderColor: '#443720',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 11,
  },

  rulesTitle: {
    color: '#F2ECE4',
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'right',
  },

  rulesSubtitle: {
    color: '#77716C',
    fontSize: 9,
    marginTop: 3,
    textAlign: 'right',
  },

  rulesArrow: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#211F1D',
    alignItems: 'center',
    justifyContent: 'center',
  },

  rulesContainer: {
    backgroundColor: '#151413',
    borderRadius: 19,
    borderWidth: 1,
    borderColor: '#302C29',
    paddingHorizontal: 13,
    marginBottom: 16,
  },

  ruleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 15,
  },

  ruleRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#292623',
  },

  ruleNumber: {
    width: 25,
    height: 25,
    borderRadius: 8,
    backgroundColor: '#282117',
    borderWidth: 1,
    borderColor: '#443720',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },

  ruleNumberText: {
    color: '#D7A94B',
    fontSize: 10,
    fontWeight: '900',
  },

  ruleIconContainer: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: '#211F1D',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },

  ruleTextContainer: {
    flex: 1,
  },

  ruleTitle: {
    color: '#F1ECE5',
    fontSize: 12,
    fontWeight: '900',
    marginBottom: 4,
    textAlign: 'right',
  },

  ruleText: {
    color: '#85807B',
    fontSize: 10,
    lineHeight: 17,
    textAlign: 'right',
  },

  friendsCard: {
    backgroundColor: '#171514',
    borderWidth: 1,
    borderColor: '#443720',
    borderRadius: 20,
    padding: 14,
    marginTop: 8,
  },

  friendsTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  friendsIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#292117',
    borderWidth: 1,
    borderColor: '#443720',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 11,
  },

  friendsTextContainer: {
    flex: 1,
  },

  friendsTitle: {
    color: '#F3EDE5',
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'right',
  },

  friendsText: {
    color: '#817B75',
    fontSize: 10,
    lineHeight: 16,
    marginTop: 3,
    textAlign: 'right',
  },

  friendsButton: {
    minHeight: 42,
    borderRadius: 12,
    backgroundColor: '#D7A94B',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 13,
  },

  friendsButtonText: {
    color: '#17171D',
    fontSize: 11,
    fontWeight: '900',
  },

  bottomSpace: {
    height: 20,
  },

  bottomNav: {
    backgroundColor: '#121110',
    borderTopWidth: 1,
    borderTopColor: '#292623',
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
    color: '#77716C',
    fontSize: 9,
    marginTop: 3,
  },

  navTextActive: {
    color: '#D7A94B',
    fontSize: 9,
    fontWeight: '900',
    marginTop: 1,
  },
});
