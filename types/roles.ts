// Role types and interface definitions for Mafia Night
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
  nameEn: string;
  nameAr: string;
  team: TeamType;
  description: string;
  descriptionAr: string;
  icon: string;
  borderColor: string;
  abilities: string[];
  image: string;
}

export const ROLES: Record<RoleType, Role> = {
  CITIZEN: {
    id: 'CITIZEN',
    nameEn: 'Citizen',
    nameAr: 'المواطن',
    team: 'CITIZEN',
    description: 'An ordinary citizen with no special abilities. Your role is to find and eliminate the Mafia.',
    descriptionAr: 'مواطن عادي لا يملك أي قدرة خاصة. دورك اكتشاف القاتل والمافيا ووجاه الخطر معهم.',
    icon: '👥',
    borderColor: '#0066FF',
    abilities: ['Vote during day phase', 'Discuss with others'],
    image: require('../assets/roles/citizen.png'),
  },
  DOCTOR: {
    id: 'DOCTOR',
    nameEn: 'Doctor',
    nameAr: 'الطبيب',
    team: 'CITIZEN',
    description: 'Protects one person each night. Can save them from being killed by the Mafia.',
    descriptionAr: 'يحمي شخص واحد كل ليلة من الموت على يد المافيا. يمكنه إنقاذ حياته.',
    icon: '⚕️',
    borderColor: '#0066FF',
    abilities: ['Protect one player per night', 'Save from Mafia kills'],
    image: require('../assets/roles/doctor.png'),
  },
  DETECTIVE: {
    id: 'DETECTIVE',
    nameEn: 'Detective',
    nameAr: 'المحقق',
    team: 'CITIZEN',
    description: 'Each night, you can investigate one player to learn their role.',
    descriptionAr: 'كل ليلة، يمكنك التحقيق من لاعب واحد لاكتشاف دوره الحقيقي.',
    icon: '🔍',
    borderColor: '#0066FF',
    abilities: ['Investigate one player per night', 'Discover role'],
    image: require('../assets/roles/detective.png'),
  },
  GHOUL: {
    id: 'GHOUL',
    nameEn: 'Ghoul',
    nameAr: 'الغول',
    team: 'CITIZEN',
    description: 'You have the ability to see who dies each night. Help your team by providing information.',
    descriptionAr: 'تملك قدرة فريدة لترى من يموت كل ليلة. ساعد فريقك بالمعلومات.',
    icon: '👁️',
    borderColor: '#0066FF',
    abilities: ['See deaths each night', 'Provide information to team'],
    image: require('../assets/roles/ghoul.png'),
  },
  SPY: {
    id: 'SPY',
    nameEn: 'Spy',
    nameAr: 'الجاسوس',
    team: 'CITIZEN',
    description: 'You work with the Citizens but gather intelligence. You can eavesdrop on Mafia meetings.',
    descriptionAr: 'تعمل مع المواطنين لكن تجمع معلومات. يمكنك التنصت على اجتماعات المافيا.',
    icon: '👁️',
    borderColor: '#0066FF',
    abilities: ['Eavesdrop on Mafia', 'Gather intelligence'],
    image: require('../assets/roles/spy.png'),
  },
  BODYGUARD: {
    id: 'BODYGUARD',
    nameEn: 'Bodyguard',
    nameAr: 'الحارس الشخصي',
    team: 'CITIZEN',
    description: 'You protect one player each night from assassination. If attacked, you die instead.',
    descriptionAr: 'تحمي لاعب واحد كل ليلة من الاغتيال. إذا تعرضت للهجوم، تموت بدلاً منه.',
    icon: '🛡️',
    borderColor: '#0066FF',
    abilities: ['Protect one player per night', 'Sacrifice yourself'],
    image: require('../assets/roles/bodyguard.png'),
  },
  SHERIFF: {
    id: 'SHERIFF',
    nameEn: 'Sheriff',
    nameAr: 'الشريف',
    team: 'CITIZEN',
    description: 'A law enforcer who investigates suspects and can arrest them. Helps identify the Mafia.',
    descriptionAr: 'رجل قانون يحقق مع المشبوهين ويمكنه اعتقالهم. يساعد في تحديد أفراد المافيا.',
    icon: '⭐',
    borderColor: '#0066FF',
    abilities: ['Investigate suspects', 'Arrest players', 'Identify Mafia'],
    image: require('../assets/roles/sheriff.png'),
  },
  WITCH: {
    id: 'WITCH',
    nameEn: 'Witch',
    nameAr: 'الساحرة',
    team: 'CULT',
    description: 'A mystical being with dark powers. You control members with magic and curses.',
    descriptionAr: 'كائن غامض بقوى سحرية مظلمة. تتحكم بالأعضاء بالسحر واللعنات.',
    icon: '🧪',
    borderColor: '#8B3A8B',
    abilities: ['Cast spells', 'Control minds', 'Use curses'],
    image: require('../assets/roles/witch.png'),
  },
  MAFIA: {
    id: 'MAFIA',
    nameEn: 'Mafia',
    nameAr: 'المافيا',
    team: 'MAFIA',
    description: 'A member of the criminal organization. Work with your team to eliminate Citizens.',
    descriptionAr: 'عضو في التنظيم الإجرامي. تعاون مع فريقك للقضاء على المواطنين.',
    icon: '👹',
    borderColor: '#FF0000',
    abilities: ['Night kills', 'Team communication', 'Deceive'],
    image: require('../assets/roles/mafia.png'),
  },
  GODFATHER: {
    id: 'GODFATHER',
    nameEn: 'Godfather',
    nameAr: 'الأب الروحي',
    team: 'MAFIA',
    description: 'The leader of the Mafia. Controls decisions and organizes the night kills.',
    descriptionAr: 'زعيم المافيا. يتحكم بالقرارات ويدير عمليات الليل.',
    icon: '👑',
    borderColor: '#FF0000',
    abilities: ['Command Mafia', 'Organize kills', 'Final decision'],
    image: require('../assets/roles/godfather.png'),
  },
  CONSIGLIERE: {
    id: 'CONSIGLIERE',
    nameEn: 'Consigliere',
    nameAr: 'المستشار',
    team: 'MAFIA',
    description: 'The advisor to the Godfather. Investigates players and reports findings to the Mafia.',
    descriptionAr: 'مستشار الأب الروحي. يحقق مع اللاعبين ويقدم تقارير للمافيا.',
    icon: '🧠',
    borderColor: '#FF0000',
    abilities: ['Investigate players', 'Report to Mafia', 'Strategic advice'],
    image: require('../assets/roles/consigliere.png'),
  },
  CULT_LEADER: {
    id: 'CULT_LEADER',
    nameEn: 'Cult Leader',
    nameAr: 'زعيم الطائفة',
    team: 'CULT',
    description: 'Leader of a secret cult. Controls members and executes the cult\'s agenda.',
    descriptionAr: 'زعيم طائفة سرية. يتحكم بالأعضاء وينفذ أجندة الطائفة.',
    icon: '🔮',
    borderColor: '#8B3A8B',
    abilities: ['Control cult members', 'Execute agenda', 'Mind control'],
    image: require('../assets/roles/cult_leader.png'),
  },
  CULTIST: {
    id: 'CULTIST',
    nameEn: 'Cultist',
    nameAr: 'عضو الطائفة',
    team: 'CULT',
    description: 'A devoted member of the cult. Follows orders and works to expand cult influence.',
    descriptionAr: 'عضو مخلص في الطائفة. ينفذ الأوامر ويعمل على توسيع نفوذ الطائفة.',
    icon: '🔮',
    borderColor: '#8B3A8B',
    abilities: ['Cult communication', 'Execute orders', 'Expand influence'],
    image: require('../assets/roles/cultist.png'),
  },
};

export const getRoleByTeam = (team: TeamType): Role[] => {
  return Object.values(ROLES).filter(role => role.team === team);
};

export const getRoleById = (id: RoleType): Role => {
  return ROLES[id];
};
