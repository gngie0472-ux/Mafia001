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
    team: 'فريق مستقل',
    icon: 'skull-outline',
    color: '#6C8B5B',
    description:
      'دور مستقل يمتلك قدرة خاصة مرتبطة بأحداث الليل.',
    ability:
      'يستخدم قدرة الغول وفق أحداث الليل وقواعد الدور.',
    objective:
      'تحقيق شرط الفوز الخاص بالغول.',
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
    () =>
      ROLES.find((role) => role.id === selectedRole) ?? null,
    [selectedRole]
  );

  const handleRolePress = (role: RoleCard) => {
    setSelectedRole((current) =>
      current === role.id ? null : role.id
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
          <Text style={styles.headerTitle}>
            المخزون
          </Text>

          <Text style={styles.headerSubtitle}>
            بطاقات وأدوار Mafia Night
          </Text>
        </View>

        <View style={styles.headerIcon}>
          <Ionicons
            name="albums"
            size={22}
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
        <View style={styles.introCard}>
          <View style={styles.introIcon}>
            <Ionicons
              name="sparkles"
              size={27}
              color="#D7A94B"
            />
          </View>

          <View style={styles.introText}>
            <Text style={styles.introTitle}>
              بطاقات اللعبة
            </Text>

            <Text style={styles.introDescription}>
              تعرّف على جميع الأدوار وقدراتها قبل بدء اللعبة.
              كل دور له هدف مختلف وطريقة لعب خاصة.
            </Text>
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>
              جميع البطاقات
            </Text>

            <Text style={styles.sectionSubtitle}>
              {ROLES.length} أدوار متاحة
            </Text>
          </View>

          <Ionicons
            name="grid"
            size={22}
            color="#D7A94B"
          />
        </View>

        <View style={styles.cardsGrid}>
          {ROLES.map((role) => {
            const isSelected =
              selectedRole === role.id;

            return (
              <Pressable
                key={role.id}
                style={[
                  styles.roleCard,
                  isSelected &&
                    styles.roleCardSelected,
                ]}
                onPress={() =>
                  handleRolePress(role)
                }
              >
                <View
                  style={[
                    styles.roleIcon,
                    {
                      backgroundColor:
                        `${role.color}22`,
                    },
                  ]}
                >
                  <Ionicons
                    name={role.icon}
                    size={29}
                    color={role.color}
                  />
                </View>

                <Text style={styles.roleName}>
                  {role.name}
                </Text>

                <View
                  style={[
                    styles.teamBadge,
                    {
                      backgroundColor:
                        `${role.color}18`,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.teamText,
                      {
                        color: role.color,
                      },
                    ]}
                  >
                    {role.team}
                  </Text>
                </View>

                <Text
                  style={styles.tapText}
                  numberOfLines={1}
                >
                  {isSelected
                    ? 'إخفاء التفاصيل'
                    : 'اضغط لمعرفة التفاصيل'}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {selected && (
          <View style={styles.detailsCard}>
            <View style={styles.detailsHeader}>
              <View
                style={[
                  styles.detailsIcon,
                  {
                    backgroundColor:
                      `${selected.color}20`,
                  },
                ]}
              >
                <Ionicons
                  name={selected.icon}
                  size={30}
                  color={selected.color}
                />
              </View>

              <View
                style={styles.detailsTitleContainer}
              >
                <Text style={styles.detailsTitle}>
                  {selected.name}
                </Text>

                <Text
                  style={[
                    styles.detailsTeam,
                    {
                      color: selected.color,
                    },
                  ]}
                >
                  {selected.team}
                </Text>
              </View>

              <Pressable
                onPress={() =>
                  setSelectedRole(null)
                }
                style={styles.closeButton}
              >
                <Ionicons
                  name="close"
                  size={21}
                  color="#A9A9B4"
                />
              </Pressable>
            </View>

            <View
              style={styles.detailSeparator}
            />

            <Text
              style={styles.detailDescription}
            >
              {selected.description}
            </Text>

            <View style={styles.infoBox}>
              <View style={styles.infoIcon}>
                <Ionicons
                  name="flash"
                  size={19}
                  color="#D7A94B"
                />
              </View>

              <View
                style={styles.infoTextContainer}
              >
                <Text style={styles.infoTitle}>
                  القدرة
                </Text>

                <Text style={styles.infoText}>
                  {selected.ability}
                </Text>
              </View>
            </View>

            <View style={styles.infoBox}>
              <View style={styles.infoIcon}>
                <Ionicons
                  name="flag"
                  size={19}
                  color="#D7A94B"
                />
              </View>

              <View
                style={styles.infoTextContainer}
              >
                <Text style={styles.infoTitle}>
                  الهدف
                </Text>

                <Text style={styles.infoText}>
                  {selected.objective}
                </Text>
              </View>
            </View>
          </View>
        )}

        <Pressable
          style={styles.rulesHeader}
          onPress={() =>
            setShowRules((value) => !value)
          }
        >
          <View style={styles.rulesHeaderRight}>
            <View style={styles.rulesIcon}>
              <Ionicons
                name="book"
                size={22}
                color="#D7A94B"
              />
            </View>

            <View>
              <Text style={styles.rulesTitle}>
                كيف تلعب Mafia Night؟
              </Text>

              <Text
                style={styles.rulesSubtitle}
              >
                شرح سريع للعبة
              </Text>
            </View>
          </View>

          <Ionicons
            name={
              showRules
                ? 'chevron-up'
                : 'chevron-down'
            }
            size={22}
            color="#8C8C98"
          />
        </Pressable>

        {showRules && (
          <View style={styles.rulesContainer}>
            {RULES.map((rule, index) => (
              <View
                key={rule.title}
                style={[
                  styles.ruleRow,
                  index !==
                    RULES.length - 1 &&
                    styles.ruleRowBorder,
                ]}
              >
                <View style={styles.ruleNumber}>
                  <Text
                    style={
                      styles.ruleNumberText
                    }
                  >
                    {index + 1}
                  </Text>
                </View>

                <View
                  style={
                    styles.ruleIconContainer
                  }
                >
                  <Ionicons
                    name={
                      rule.icon as keyof typeof Ionicons.glyphMap
                    }
                    size={21}
                    color="#D7A94B"
                  />
                </View>

                <View
                  style={styles.ruleTextContainer}
                >
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

        <View style={styles.friendsCard}>
          <View style={styles.friendsIcon}>
            <Ionicons
              name="person-add"
              size={25}
              color="#D7A94B"
            />
          </View>

          <View
            style={styles.friendsTextContainer}
          >
            <Text style={styles.friendsTitle}>
              العب مع أصدقائك
            </Text>

            <Text style={styles.friendsText}>
              أضف أصدقاءك وتواصل معهم قبل بدء
              المباراة.
            </Text>
          </View>

          <Pressable
            style={styles.friendsButton}
            onPress={() =>
              router.push('/friends')
            }
          >
            <Text
              style={styles.friendsButtonText}
            >
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
          onPress={() =>
            router.replace('/home')
          }
        >
          <Ionicons
            name="home-outline"
            size={23}
            color="#777782"
          />

          <Text style={styles.navText}>
            الرئيسية
          </Text>
        </Pressable>

        <Pressable
          style={styles.navItem}
          onPress={() =>
            router.replace('/rooms')
          }
        >
          <Ionicons
            name="game-controller-outline"
            size={23}
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
              size={22}
              color="#17171D"
            />
          </View>

          <Text
            style={styles.navTextActive}
          >
            المخزون
          </Text>
        </Pressable>

        <Pressable
          style={styles.navItem}
          onPress={() =>
            router.replace('/friends')
          }
        >
          <Ionicons
            name="people-outline"
            size={23}
            color="#777782"
          />

          <Text style={styles.navText}>
            الأصدقاء
          </Text>
        </Pressable>

        <Pressable
          style={styles.navItem}
          onPress={() =>
            router.replace('/profile')
          }
        >
          <Ionicons
            name="person-outline"
            size={23}
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
  },

  introCard: {
    backgroundColor: '#19191F',
    borderWidth: 1,
    borderColor: '#2A2A31',
    borderRadius: 20,
    padding: 17,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 23,
  },

  introIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: '#2A2417',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 13,
  },

  introText: {
    flex: 1,
  },

  introTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 5,
  },

  introDescription: {
    color: '#9999A4',
    fontSize: 12,
    lineHeight: 19,
  },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 13,
  },

  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },

  sectionSubtitle: {
    color: '#73737E',
    fontSize: 11,
    marginTop: 3,
  },

  cardsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },

  roleCard: {
    width: '48.2%',
    minHeight: 185,
    backgroundColor: '#19191F',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#292930',
    padding: 14,
    marginBottom: 12,
    alignItems: 'center',
  },

  roleCardSelected: {
    borderColor: '#D7A94B',
    backgroundColor: '#1D1C19',
  },

  roleIcon: {
    width: 58,
    height: 58,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },

  roleName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
  },

  teamBadge: {
    borderRadius: 20,
    paddingHorizontal: 9,
    paddingVertical: 5,
    marginTop: 7,
  },

  teamText: {
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'center',
  },

  tapText: {
    color: '#676772',
    fontSize: 9,
    marginTop: 11,
  },

  detailsCard: {
    backgroundColor: '#19191F',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#3A3528',
    padding: 17,
    marginTop: 4,
    marginBottom: 22,
  },

  detailsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  detailsIcon: {
    width: 57,
    height: 57,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 13,
  },

  detailsTitleContainer: {
    flex: 1,
  },

  detailsTitle: {
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '800',
  },

  detailsTeam: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 4,
  },

  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#24242B',
    alignItems: 'center',
    justifyContent: 'center',
  },

  detailSeparator: {
    height: 1,
    backgroundColor: '#2A2A31',
    marginVertical: 15,
  },

  detailDescription: {
    color: '#B3B3BC',
    fontSize: 13,
    lineHeight: 21,
    textAlign: 'right',
    marginBottom: 14,
  },

  infoBox: {
    backgroundColor: '#15151A',
    borderRadius: 14,
    padding: 12,
    flexDirection: 'row',
    marginTop: 8,
  },

  infoIcon: {
    width: 35,
    height: 35,
    borderRadius: 10,
    backgroundColor: '#292417',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },

  infoTextContainer: {
    flex: 1,
  },

  infoTitle: {
    color: '#D7A94B',
    fontSize: 11,
    fontWeight: '800',
    marginBottom: 3,
  },

  infoText: {
    color: '#9E9EA8',
    fontSize: 11,
    lineHeight: 18,
    textAlign: 'right',
  },

  rulesHeader: {
    backgroundColor: '#19191F',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#292930',
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
  },

  rulesIcon: {
    width: 45,
    height: 45,
    borderRadius: 14,
    backgroundColor: '#292417',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 11,
  },

  rulesTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },

  rulesSubtitle: {
    color: '#777782',
    fontSize: 10,
    marginTop: 3,
  },

  rulesContainer: {
    backgroundColor: '#19191F',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#292930',
    paddingHorizontal: 14,
    marginBottom: 16,
  },

  ruleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 15,
  },

  ruleRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#28282F',
  },

  ruleNumber: {
    width: 25,
    height: 25,
    borderRadius: 8,
    backgroundColor: '#2A2417',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },

  ruleNumberText: {
    color: '#D7A94B',
    fontSize: 11,
    fontWeight: '800',
  },

  ruleIconContainer: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: '#222228',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },

  ruleTextContainer: {
    flex: 1,
  },

  ruleTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 4,
  },

  ruleText: {
    color: '#8F8F9A',
    fontSize: 11,
    lineHeight: 18,
    textAlign: 'right',
  },

  friendsCard: {
    backgroundColor: '#19191F',
    borderWidth: 1,
    borderColor: '#3A3528',
    borderRadius: 19,
    padding: 14,
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },

  friendsIcon: {
    width: 47,
    height: 47,
    borderRadius: 14,
    backgroundColor: '#292417',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 11,
  },

  friendsTextContainer: {
    flex: 1,
  },

  friendsTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },

  friendsText: {
    color: '#81818C',
    fontSize: 10,
    lineHeight: 16,
    marginTop: 3,
  },

  friendsButton: {
    minHeight: 38,
    borderRadius: 11,
    backgroundColor: '#D7A94B',
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },

  friendsButtonText: {
    color: '#17171D',
    fontSize: 10,
    fontWeight: '900',
  },

  bottomSpace: {
    height: 20,
  },

  bottomNav: {
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
