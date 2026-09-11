// Role types and interface definitions for Mafia Night

import type { ImageSourcePropType } from 'react-native';

export type RoleType =
  | 'CITIZEN'
  | 'DOCTOR'
  | 'DETECTIVE'
  | 'GHOUL'
  | 'SPY'
  | 'BODYGUARD'
  | 'SHERIFF'
  | 'WITCH'
  | 'MAFIA'
  | 'GODFATHER'
  | 'CONSIGLIERE'
  | 'CULT_LEADER'
  | 'CULTIST';

export type TeamType =
  | 'CITIZEN'
  | 'MAFIA'
  | 'CULT';

export interface Role {
  id: RoleType;
  nameEn: string;
  nameAr: string;
  team: TeamType;
  description: string;
  descriptionAr: string;
  icon: string;
  borderColor: string;
  abilities: string[];
  image?: ImageSourcePropType;
}

export const ROLES: Record<RoleType, Role> = {
  CITIZEN: {
    id: 'CITIZEN',
    nameEn: 'Citizen',
    nameAr: 'المواطن',
    team: 'CITIZEN',
    description:
      'An ordinary citizen with no special abilities. Your role is to find and eliminate the Mafia.',
    descriptionAr:
      'مواطن عادي بلا قدرة خاصة. مهمتك كشف أفراد المافيا والتعاون مع المواطنين للقضاء عليهم.',
    icon: '👥',
    borderColor: '#0066FF',
    abilities: [
      'التصويت أثناء النهار',
      'مناقشة اللاعبين',
      'كشف المافيا بالتحليل والتعاون',
    ],
    image: require('../assets/roles/01_citizen.png'),
  },

  DOCTOR: {
    id: 'DOCTOR',
    nameEn: 'Doctor',
    nameAr: 'الطبيب',
    team: 'CITIZEN',
    description:
      'Protects one person each night and can save them from a Mafia attack.',
    descriptionAr:
      'يحمي لاعبًا واحدًا كل ليلة، ويمكنه إنقاذه من هجوم المافيا.',
    icon: '⚕️',
    borderColor: '#0066FF',
    abilities: [
      'حماية لاعب واحد كل ليلة',
      'إنقاذ الهدف من قتل المافيا',
    ],
    image: require('../assets/roles/02_doctor.png'),
  },

  DETECTIVE: {
    id: 'DETECTIVE',
    nameEn: 'Detective',
    nameAr: 'المحقق',
    team: 'CITIZEN',
    description:
      'Investigates one player each night to uncover valuable information about their role.',
    descriptionAr:
      'يحقق مع لاعب واحد كل ليلة للحصول على معلومات مهمة عن دوره الحقيقي.',
    icon: '🔍',
    borderColor: '#0066FF',
    abilities: [
      'التحقيق مع لاعب كل ليلة',
      'جمع معلومات عن هوية اللاعبين',
      'مساعدة المواطنين في كشف المافيا',
    ],
    image: require('../assets/roles/03_detective.png'),
  },

  GHOUL: {
    id: 'GHOUL',
    nameEn: 'Ghoul',
    nameAr: 'الغول',
    team: 'CITIZEN',
    description:
      'A mysterious observer who gains information from the deaths that occur during the night.',
    descriptionAr:
      'مراقب غامض يمتلك قدرة فريدة على الاستفادة من معلومات الوفيات التي تحدث أثناء الليل.',
    icon: '👁️',
    borderColor: '#0066FF',
    abilities: [
      'معرفة ضحايا الليل',
      'جمع معلومات من أحداث اللعبة',
      'مساعدة الفريق بالمعلومات',
    ],
    image: require('../assets/roles/04_ghoul.png'),
  },

  SPY: {
    id: 'SPY',
    nameEn: 'Spy',
    nameAr: 'الجاسوس',
    team: 'CITIZEN',
    description:
      'A covert investigator who gathers intelligence and observes the Mafia.',
    descriptionAr:
      'جاسوس سري يجمع المعلومات ويراقب تحركات المافيا لمساعدة المواطنين.',
    icon: '👁️',
    borderColor: '#0066FF',
    abilities: [
      'جمع المعلومات',
      'مراقبة المافيا',
      'نقل المعلومات لفريق المواطنين',
    ],
    // لا توجد spy.png في المستودع حاليًا.
    // سيتم ربطها عند رفع الصورة.
  },

  BODYGUARD: {
    id: 'BODYGUARD',
    nameEn: 'Bodyguard',
    nameAr: 'الحارس الشخصي',
    team: 'CITIZEN',
    description:
      'Protects another player from assassination. If the attack succeeds, the Bodyguard may sacrifice themselves.',
    descriptionAr:
      'يحمي لاعبًا آخر من الاغتيال. إذا وقع الهجوم، يمكن للحارس التضحية بنفسه لحماية الهدف.',
    icon: '🛡️',
    borderColor: '#0066FF',
    abilities: [
      'حماية لاعب كل ليلة',
      'التضحية بالنفس لحماية الهدف',
    ],
    image: require('../assets/roles/06_bodyguard.png'),
  },

  SHERIFF: {
    id: 'SHERIFF',
    nameEn: 'Sheriff',
    nameAr: 'الشريف',
    team: 'CITIZEN',
    description:
      'A law enforcer who investigates suspicious players and helps expose the Mafia.',
    descriptionAr:
      'رجل قانون يحقق في اللاعبين المشبوهين ويساعد المواطنين على كشف أفراد المافيا.',
    icon: '⭐',
    borderColor: '#0066FF',
    abilities: [
      'التحقيق مع المشتبه بهم',
      'كشف أفراد المافيا',
      'مساعدة المواطنين في اتخاذ القرار',
    ],
    image: require('../assets/roles/05_sheriff.png'),
  },

  WITCH: {
    id: 'WITCH',
    nameEn: 'Witch',
    nameAr: 'الساحرة',
    team: 'CULT',
    description:
      'A mysterious character with powerful abilities that can influence the course of the game.',
    descriptionAr:
      'شخصية غامضة تمتلك قوى خاصة قادرة على التأثير في مجريات اللعبة.',
    icon: '🧪',
    borderColor: '#8B3A8B',
    abilities: [
      'استخدام قدرات سحرية',
      'التأثير في مجريات اللعبة',
      'استخدام اللعنات والقدرات الخاصة',
    ],
    image: require('../assets/roles/08_witch.png'),
  },

  MAFIA: {
    id: 'MAFIA',
    nameEn: 'Mafia',
    nameAr: 'المافيا',
    team: 'MAFIA',
    description:
      'A member of the criminal organization. Work with the Mafia to eliminate the opposing teams.',
    descriptionAr:
      'عضو في التنظيم الإجرامي. تعاون مع أفراد المافيا للقضاء على خصومكم والسيطرة على المدينة.',
    icon: '👹',
    borderColor: '#FF0000',
    abilities: [
      'تنفيذ عمليات القتل ليلًا',
      'التواصل مع أفراد المافيا',
      'خداع المواطنين',
    ],
    image: require('../assets/roles/09_mafia.png'),
  },

  GODFATHER: {
    id: 'GODFATHER',
    nameEn: 'Godfather',
    nameAr: 'العرّاب',
    team: 'MAFIA',
    description:
      'The supreme leader of the Mafia who directs the organization and makes critical decisions.',
    descriptionAr:
      'القائد الأعلى للمافيا. يدير التنظيم ويتخذ القرارات الحاسمة التي تحدد مصير الفريق.',
    icon: '👑',
    borderColor: '#FF0000',
    abilities: [
      'قيادة المافيا',
      'تنظيم عمليات الليل',
      'اتخاذ القرارات الحاسمة',
    ],
    image: require('../assets/roles/10_godfather.png'),
  },

  CONSIGLIERE: {
    id: 'CONSIGLIERE',
    nameEn: 'Consigliere',
    nameAr: 'المستشار',
    team: 'MAFIA',
    description:
      'The trusted advisor of the Godfather who specializes in gathering intelligence.',
    descriptionAr:
      'المستشار الموثوق للعرّاب. متخصص في جمع المعلومات وتحليل اللاعبين لصالح المافيا.',
    icon: '🧠',
    borderColor: '#FF0000',
    abilities: [
      'التحقيق في اللاعبين',
      'جمع المعلومات',
      'تقديم الاستشارات للعرّاب',
    ],
    image: require('../assets/roles/11_consigliere.png'),
  },

  CULT_LEADER: {
    id: 'CULT_LEADER',
    nameEn: 'Cult Leader',
    nameAr: 'زعيم الطائفة',
    team: 'CULT',
    description:
      'The leader of a secret cult who guides its members and expands its influence.',
    descriptionAr:
      'زعيم طائفة سرية يقود أتباعه ويسعى إلى توسيع نفوذ الطائفة والسيطرة على اللعبة.',
    icon: '🔮',
    borderColor: '#8B3A8B',
    abilities: [
      'قيادة أعضاء الطائفة',
      'توسيع نفوذ الطائفة',
      'توجيه أتباعه',
    ],
    image: require('../assets/roles/12_cult_leader.png'),
  },

  CULTIST: {
    id: 'CULTIST',
    nameEn: 'Cultist',
    nameAr: 'عضو الطائفة',
    team: 'CULT',
    description:
      'A devoted member of the cult who follows the leader and helps expand its influence.',
    descriptionAr:
      'عضو مخلص في الطائفة ينفذ أوامر الزعيم ويساعد على توسيع نفوذها.',
    icon: '🔮',
    borderColor: '#8B3A8B',
    abilities: [
      'التواصل مع أعضاء الطائفة',
      'تنفيذ أوامر الزعيم',
      'توسيع نفوذ الطائفة',
    ],
    image: require('../assets/roles/13_cultist.png'),
  },
};

export const getRoleByTeam = (team: TeamType): Role[] => {
  return Object.values(ROLES).filter(
    (role) => role.team === team,
  );
};

export const getRoleById = (id: RoleType): Role => {
  return ROLES[id];
};
