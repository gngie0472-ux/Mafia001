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

export type TeamType = 'CITIZEN' | 'MAFIA' | 'CULT';

export interface Role {
  id: RoleType;
  name: string;
  description: string;
  team: TeamType;
  image?: ImageSourcePropType;
}

export const ROLES: Record<RoleType, Role> = {
  CITIZEN: {
    id: 'CITIZEN',
    name: 'المواطن',
    description:
      'عضو من أهل المدينة. مهمتك اكتشاف المافيا والتصويت ضد المشتبه بهم.',
    team: 'CITIZEN',
    image: require('../assets/roles/citizen.png'),
  },

  DOCTOR: {
    id: 'DOCTOR',
    name: 'الطبيب',
    description:
      'يمكنك حماية لاعب واحد كل ليلة من القتل. اختر هدفك بحذر.',
    team: 'CITIZEN',
    image: require('../assets/roles/doctor.png'),
  },

  DETECTIVE: {
    id: 'DETECTIVE',
    name: 'المحقق',
    description:
      'تحقق من لاعب كل ليلة لمعرفة ما إذا كان ينتمي إلى المافيا.',
    team: 'CITIZEN',
    image: require('../assets/roles/detective.png'),
  },

  GHOUL: {
    id: 'GHOUL',
    name: 'الغول',
    description:
      'شخصية غامضة تعمل وفق قوانينها الخاصة ويمكنها التأثير في مجريات اللعبة.',
    team: 'CITIZEN',
    image: require('../assets/roles/ghoul.png'),
  },

  SPY: {
    id: 'SPY',
    name: 'الجاسوس',
    description:
      'تجسس على اللاعبين واجمع المعلومات لمساعدة فريق المدينة.',
    team: 'CITIZEN',
  },

  BODYGUARD: {
    id: 'BODYGUARD',
    name: 'الحارس الشخصي',
    description:
      'احمِ لاعبًا آخر أثناء الليل وقد تمنع قتله.',
    team: 'CITIZEN',
    image: require('../assets/roles/bodyguard.png'),
  },

  SHERIFF: {
    id: 'SHERIFF',
    name: 'الشريف',
    description:
      'تحقق من هوية اللاعبين وابحث عن أعضاء المافيا.',
    team: 'CITIZEN',
    image: require('../assets/roles/sheriff.png'),
  },

  WITCH: {
    id: 'WITCH',
    name: 'الساحرة',
    description:
      'تمتلك قوى خاصة يمكن استخدامها لإنقاذ لاعب أو القضاء على لاعب آخر.',
    team: 'CITIZEN',
    image: require('../assets/roles/witch.png'),
  },

  MAFIA: {
    id: 'MAFIA',
    name: 'المافيا',
    description:
      'اعمل مع أعضاء المافيا سرًا للقضاء على أعضاء المدينة.',
    team: 'MAFIA',
    image: require('../assets/roles/mafia.png'),
  },

  GODFATHER: {
    id: 'GODFATHER',
    name: 'عرّاب المافيا',
    description:
      'قائد المافيا. اتخذ القرارات وساعد فريقك على السيطرة على المدينة.',
    team: 'MAFIA',
    image: require('../assets/roles/godfather.png'),
  },

  CONSIGLIERE: {
    id: 'CONSIGLIERE',
    name: 'المستشار',
    description:
      'ساعد المافيا في كشف أدوار اللاعبين واختيار الأهداف المناسبة.',
    team: 'MAFIA',
    image: require('../assets/roles/consigliere.png'),
  },

  CULT_LEADER: {
    id: 'CULT_LEADER',
    name: 'قائد الطائفة',
    description:
      'قائد الطائفة السرية. حاول تجنيد اللاعبين والسيطرة على المدينة.',
    team: 'CULT',
    image: require('../assets/roles/cult_leader.png'),
  },

  CULTIST: {
    id: 'CULTIST',
    name: 'عضو الطائفة',
    description:
      'عضو في الطائفة السرية. ساعد قائد الطائفة على تحقيق الفوز.',
    team: 'CULT',
    image: require('../assets/roles/cultist.png'),
  },
};

export function getRoleById(id: RoleType | string): Role | undefined {
  return ROLES[id as RoleType];
}

export function getRoleByTeam(team: TeamType): Role[] {
  return Object.values(ROLES).filter((role) => role.team === team);
}
