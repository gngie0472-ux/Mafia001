// lib/game.ts

import { supabase } from './supabase';

export type GamePhase =
  | 'waiting'
  | 'night'
  | 'day'
  | 'finished';

export type GameTeam =
  | 'CITIZENS'
  | 'MAFIA'
  | 'CULT';

export type GameRole =
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

export type NightAction =
  | 'kill'
  | 'protect'
  | 'investigate'
  | 'spy'
  | 'guard'
  | 'sheriff_check'
  | 'witch_save'
  | 'witch_kill'
  | 'ghoul'
  | 'cult_convert';

export type GameEventType =
  | 'game_started'
  | 'night_started'
  | 'day_started'
  | 'night_action'
  | 'night_kill'
  | 'night_saved'
  | 'day_vote'
  | 'day_tie'
  | 'player_died'
  | 'ghoul_ability_stolen'
  | 'cult_convert'
  | 'game_finished'
  | 'winner';

export interface GamePlayer {
  id: string;
  user_id: string;
  name: string;
  avatar_url: string | null;
  alive: boolean;
  role: GameRole;
  ready: boolean;
  created_at?: string;
}

export interface CurrentGamePlayer {
  id: string;
  user_id: string;
  name: string;
  alive: boolean;
  role: GameRole;
  team: GameTeam;
  avatar_url: string | null;
  ghoul_ability_stolen: boolean;
  stolen_role: GameRole | null;
  stolen_ability: NightAction | null;
}

export interface GameRoom {
  id: string;
  code: string;
  name: string | null;
  status: string;
  host_id: string | null;
  max_players: number;
  game_round: number;
  game_phase: GamePhase;
  winner: string | null;
  phase_ends_at: string | null;
  last_event: unknown;
}

export interface GameState {
  room: GameRoom;
  players: CurrentGamePlayer[];
  me: CurrentGamePlayer | null;
  my_player_id: string | null;
}

export interface MyRole {
  role: GameRole;
  alive: boolean;
  team: GameTeam;
  ghoul_ability_stolen: boolean;
  stolen_role: GameRole | null;
  stolen_ability: NightAction | null;
}

export interface RoleDefinition {
  role: GameRole;
  label: string;
  englishLabel: string;
  team: GameTeam;
  description: string;
  ability: string;
  objective: string;
  phase: 'night' | 'day' | 'passive' | 'both';
  action: NightAction | null;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

/**
 * يحوّل أي قيمة قادمة من Supabase إلى GameRole صالح.
 * الأدوار غير المدعومة حاليًا تتحول إلى CITIZEN بدل كسر اللعبة.
 */
export function normalizeGameRole(value: unknown): GameRole {
  const role = String(value ?? '').trim().toUpperCase();

  switch (role) {
    case 'CITIZEN':
    case 'DOCTOR':
    case 'DETECTIVE':
    case 'GHOUL':
    case 'SPY':
    case 'BODYGUARD':
    case 'SHERIFF':
    case 'WITCH':
    case 'MAFIA':
    case 'GODFATHER':
    case 'CONSIGLIERE':
    case 'CULT_LEADER':
    case 'CULTIST':
      return role;

    default:
      return 'CITIZEN';
  }
}

export function getRoleTeam(roleValue: unknown): GameTeam {
  const role = normalizeGameRole(roleValue);

  switch (role) {
    case 'MAFIA':
    case 'GODFATHER':
    case 'CONSIGLIERE':
      return 'MAFIA';

    case 'CULT_LEADER':
    case 'CULTIST':
      return 'CULT';

    case 'CITIZEN':
    case 'DOCTOR':
    case 'DETECTIVE':
    case 'GHOUL':
    case 'SPY':
    case 'BODYGUARD':
    case 'SHERIFF':
    case 'WITCH':
    default:
      return 'CITIZENS';
  }
}

export function getRoleNightAction(
  roleValue: unknown,
): NightAction | null {
  const role = normalizeGameRole(roleValue);

  switch (role) {
    case 'MAFIA':
    case 'GODFATHER':
      return 'kill';

    case 'DOCTOR':
      return 'protect';

    case 'DETECTIVE':
    case 'CONSIGLIERE':
      return 'investigate';

    case 'SPY':
      return 'spy';

    case 'BODYGUARD':
      return 'guard';

    case 'SHERIFF':
      return 'sheriff_check';

    case 'WITCH':
      return 'witch_save';

    case 'CULT_LEADER':
      return 'cult_convert';

    case 'GHOUL':
      return 'ghoul';

    case 'CITIZEN':
    case 'CULTIST':
    default:
      return null;
  }
}

const ROLE_DEFINITIONS: Record<GameRole, RoleDefinition> = {
  CITIZEN: {
    role: 'CITIZEN',
    label: 'مواطن',
    englishLabel: 'Citizen',
    team: 'CITIZENS',
    description:
      'عضو أساسي في فريق المواطنين. لا يمتلك قدرة ليلية خاصة.',
    ability: 'لا توجد قدرة ليلية.',
    objective: 'اكتشف المافيا والطائفة وصوّت لإقصائهم.',
    phase: 'day',
    action: null,
  },

  DOCTOR: {
    role: 'DOCTOR',
    label: 'الطبيب',
    englishLabel: 'Doctor',
    team: 'CITIZENS',
    description:
      'يستطيع حماية لاعب واحد أثناء الليل.',
    ability:
      'اختر لاعبًا واحدًا لحمايته من قتل المافيا خلال هذه الليلة.',
    objective:
      'حماية المواطنين المهمين والمساعدة في بقاء فريق المواطنين.',
    phase: 'night',
    action: 'protect',
  },

  DETECTIVE: {
    role: 'DETECTIVE',
    label: 'المحقق',
    englishLabel: 'Detective',
    team: 'CITIZENS',
    description:
      'يحقق في لاعب واحد كل ليلة لمعرفة ما إذا كان من المافيا.',
    ability:
      'اختر لاعبًا واحدًا للتحقيق فيه مرة واحدة في الليلة.',
    objective:
      'كشف المافيا ومساعدة المواطنين في التصويت الصحيح.',
    phase: 'night',
    action: 'investigate',
  },

  GHOUL: {
    role: 'GHOUL',
    label: 'الغول',
    englishLabel: 'Ghoul',
    team: 'CITIZENS',
    description:
      'غول من فريق المواطنين. يسرق قدرة أول لاعب يموت في اللعبة مرة واحدة.',
    ability:
      'عند أول وفاة مناسبة، ينسخ الغول قدرة اللاعب الميت ويستطيع استخدامها مرة واحدة.',
    objective:
      'ساعد المواطنين ثم استغل القدرة المسروقة في اللحظة المناسبة.',
    phase: 'both',
    action: 'ghoul',
  },

  SPY: {
    role: 'SPY',
    label: 'الجاسوس',
    englishLabel: 'Spy',
    team: 'CITIZENS',
    description:
      'يجمع معلومات سرية عن أحد اللاعبين أثناء الليل.',
    ability:
      'استخدم قدرة التجسس للحصول على معلومات عن هدفك.',
    objective:
      'كشف أعضاء المافيا والطائفة ومساعدة المواطنين.',
    phase: 'night',
    action: 'spy',
  },

  BODYGUARD: {
    role: 'BODYGUARD',
    label: 'الحارس الشخصي',
    englishLabel: 'Bodyguard',
    team: 'CITIZENS',
    description:
      'يحمي لاعبًا من هجوم ليلي.',
    ability:
      'اختر لاعبًا لحمايته أثناء الليل.',
    objective:
      'حماية اللاعبين الأساسيين ومنع عمليات القتل.',
    phase: 'night',
    action: 'guard',
  },

  SHERIFF: {
    role: 'SHERIFF',
    label: 'الشريف',
    englishLabel: 'Sheriff',
    team: 'CITIZENS',
    description:
      'يبحث عن أعضاء المافيا أثناء الليل.',
    ability:
      'تحقق من لاعب واحد كل ليلة لمعرفة ما إذا كان من المافيا.',
    objective:
      'كشف المافيا ومساعدة المواطنين على التخلص منها.',
    phase: 'night',
    action: 'sheriff_check',
  },

  WITCH: {
    role: 'WITCH',
    label: 'الساحرة',
    englishLabel: 'Witch',
    team: 'CITIZENS',
    description:
      'تمتلك قدرات خاصة للتأثير في أحداث الليل.',
    ability:
      'يمكنها استخدام قدرة إنقاذ أو قتل وفق قواعد اللعبة.',
    objective:
      'استخدم قدراتك في اللحظة المناسبة لمصلحة المواطنين.',
    phase: 'night',
    action: 'witch_save',
  },

  MAFIA: {
    role: 'MAFIA',
    label: 'مافيا',
    englishLabel: 'Mafia',
    team: 'MAFIA',
    description:
      'عضو في المافيا ويشارك في اختيار ضحية الليل.',
    ability:
      'شارك فريق المافيا في اختيار لاعب لقتله أثناء الليل.',
    objective:
      'القضاء على المواطنين والطائفة والوصول إلى السيطرة.',
    phase: 'night',
    action: 'kill',
  },

  GODFATHER: {
    role: 'GODFATHER',
    label: 'العرّاب',
    englishLabel: 'Godfather',
    team: 'MAFIA',
    description:
      'قائد المافيا وأحد أهم أدوار الفريق.',
    ability:
      'يقود المافيا في عملية اختيار ضحية الليل.',
    objective:
      'قيادة المافيا للقضاء على خصومها.',
    phase: 'night',
    action: 'kill',
  },

  CONSIGLIERE: {
    role: 'CONSIGLIERE',
    label: 'المستشار',
    englishLabel: 'Consigliere',
    team: 'MAFIA',
    description:
      'محقق المافيا. يجمع المعلومات لمساعدة فريقه.',
    ability:
      'يستطيع التحقيق في لاعب أثناء الليل لمساعدة المافيا.',
    objective:
      'كشف الأدوار الخطيرة ومساعدة العرّاب والمافيا.',
    phase: 'night',
    action: 'investigate',
  },

  CULT_LEADER: {
    role: 'CULT_LEADER',
    label: 'قائد الطائفة',
    englishLabel: 'Cult Leader',
    team: 'CULT',
    description:
      'قائد الطائفة الذي يستطيع تحويل بعض اللاعبين إلى الطائفة.',
    ability:
      'اختر لاعبًا مؤهلًا لمحاولة تحويله إلى فريق الطائفة.',
    objective:
      'زيادة أعضاء الطائفة والسيطرة على المباراة.',
    phase: 'night',
    action: 'cult_convert',
  },

  CULTIST: {
    role: 'CULTIST',
    label: 'عضو الطائفة',
    englishLabel: 'Cultist',
    team: 'CULT',
    description:
      'عضو في فريق الطائفة.',
    ability:
      'لا يمتلك قدرة ليلية مستقلة حاليًا.',
    objective:
      'ساعد الطائفة على البقاء والسيطرة على المباراة.',
    phase: 'both',
    action: null,
  },
};

export function getRoleDefinition(
  roleValue: unknown,
): RoleDefinition {
  return ROLE_DEFINITIONS[normalizeGameRole(roleValue)];
}

export function getRoleLabel(roleValue: unknown): string {
  return getRoleDefinition(roleValue).label;
}

export function getRoleEnglishLabel(roleValue: unknown): string {
  return getRoleDefinition(roleValue).englishLabel;
}

export function getRoleDescription(roleValue: unknown): string {
  return getRoleDefinition(roleValue).description;
}

export function getRoleAbility(roleValue: unknown): string {
  return getRoleDefinition(roleValue).ability;
}

export function getRoleObjective(roleValue: unknown): string {
  return getRoleDefinition(roleValue).objective;
}

export function getRolePhase(
  roleValue: unknown,
): RoleDefinition['phase'] {
  return getRoleDefinition(roleValue).phase;
}

export function getTeamLabel(teamValue: unknown): string {
  switch (String(teamValue ?? '').toUpperCase()) {
    case 'MAFIA':
      return 'المافيا';

    case 'CULT':
      return 'الطائفة';

    case 'CITIZENS':
    default:
      return 'المواطنون';
  }
}

export function getActionLabel(
  actionValue: unknown,
): string {
  switch (String(actionValue ?? '').toLowerCase()) {
    case 'kill':
      return 'قتل';

    case 'protect':
      return 'حماية';

    case 'investigate':
      return 'تحقيق';

    case 'spy':
      return 'تجسس';

    case 'guard':
      return 'حراسة';

    case 'sheriff_check':
      return 'فحص';

    case 'witch_save':
      return 'إنقاذ';

    case 'witch_kill':
      return 'قتل بالسحر';

    case 'ghoul':
      return 'قدرة الغول';

    case 'cult_convert':
      return 'تحويل للطائفة';

    default:
      return 'لا توجد قدرة';
  }
}

/**
 * يحوّل player القادم من Supabase إلى النموذج الموحد للتطبيق.
 */
export function normalizeGamePlayer(
  player: any,
): CurrentGamePlayer {
  const role = normalizeGameRole(player?.role);

  return {
    id: String(player?.id ?? ''),
    user_id: String(player?.user_id ?? ''),
    name: String(player?.name ?? 'Player'),
    alive: Boolean(player?.alive),
    role,
    team: getRoleTeam(role),
    avatar_url:
      typeof player?.avatar_url === 'string'
        ? player.avatar_url
        : null,
    ghoul_ability_stolen: Boolean(
      player?.ghoul_ability_stolen ??
        player?.ghoul_has_copied ??
        player?.ghoul_ability_stolen === true,
    ),
    stolen_role: player?.stolen_role
      ? normalizeGameRole(player.stolen_role)
      : player?.ghoul_copied_role
        ? normalizeGameRole(player.ghoul_copied_role)
        : null,
    stolen_ability: normalizeNightAction(
      player?.stolen_ability,
    ),
  };
}

export function normalizeNightAction(
  value: unknown,
): NightAction | null {
  const action = String(value ?? '').toLowerCase();

  switch (action) {
    case 'kill':
    case 'protect':
    case 'investigate':
    case 'spy':
    case 'guard':
    case 'sheriff_check':
    case 'witch_save':
    case 'witch_kill':
    case 'ghoul':
    case 'cult_convert':
      return action;

    default:
      return null;
  }
}

function normalizeRoom(
  room: any,
): GameRoom {
  const phase = String(
    room?.game_phase ?? 'waiting',
  ).toLowerCase();

  const validPhase: GamePhase =
    phase === 'night' ||
    phase === 'day' ||
    phase === 'finished' ||
    phase === 'waiting'
      ? phase
      : 'waiting';

  return {
    id: String(room?.id ?? ''),
    code: String(room?.code ?? ''),
    name:
      typeof room?.name === 'string'
        ? room.name
        : null,
    status: String(room?.status ?? 'waiting'),
    host_id:
      typeof room?.host_id === 'string'
        ? room.host_id
        : null,
    max_players: Number(room?.max_players ?? 8),
    game_round: Number(room?.game_round ?? 0),
    game_phase: validPhase,
    winner:
      typeof room?.winner === 'string'
        ? room.winner
        : null,
    phase_ends_at:
      typeof room?.phase_ends_at === 'string'
        ? room.phase_ends_at
        : null,
    last_event: room?.last_event ?? null,
  };
}

/**
 * يحل room code أو room UUID إلى UUID الحقيقي.
 *
 * هذا مهم جدًا لمنع خطأ:
 * invalid input syntax for type uuid: "T2GZ6M"
 */
export async function resolveRoomId(
  roomValue: string,
): Promise<string> {
  const value = String(roomValue ?? '').trim();

  if (!value) {
    throw new Error('معرّف الغرفة فارغ.');
  }

  if (isUuid(value)) {
    return value;
  }

  const { data, error } = await supabase
    .from('rooms')
    .select('id')
    .eq('code', value.toUpperCase())
    .maybeSingle();

  if (error) {
    throw new Error(
      error.message || 'تعذر البحث عن الغرفة.',
    );
  }

  if (!data?.id) {
    throw new Error(
      'الغرفة غير موجودة أو لم تعد متاحة.',
    );
  }

  return String(data.id);
}

/**
 * يقبل room_players.id أو user_id ويعيد room_players.id.
 */
export async function resolveTarget(
  roomId: string,
  targetValue: string,
): Promise<string> {
  const value = String(targetValue ?? '').trim();

  if (!value) {
    throw new Error('الهدف غير صالح.');
  }

  const { data, error } = await supabase
    .from('room_players')
    .select('id,user_id')
    .eq('room_id', roomId)
    .or(`id.eq.${value},user_id.eq.${value}`)
    .maybeSingle();

  if (error) {
    throw new Error(
      error.message || 'تعذر تحديد اللاعب المستهدف.',
    );
  }

  if (!data?.id) {
    throw new Error(
      'اللاعب المستهدف غير موجود في هذه الغرفة.',
    );
  }

  return String(data.id);
}

export function getPlayerTargetId(
  player: Pick<GamePlayer, 'id' | 'user_id'>,
): string {
  return player.id || player.user_id;
}

export function hasValidPlayerId(
  value: unknown,
): boolean {
  return (
    typeof value === 'string' &&
    value.trim().length > 0
  );
}

async function callTargetRpc(
  rpcName: string,
  params: Record<string, unknown>,
  roomId: string,
  targetValue?: string | null,
) {
  if (!targetValue) {
    const { data, error } = await supabase.rpc(
      rpcName,
      params,
    );

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }

  const targetId = await resolveTarget(
    roomId,
    targetValue,
  );

  const firstParams = {
    ...params,
    p_target_id: targetId,
  };

  let result = await supabase.rpc(
    rpcName,
    firstParams,
  );

  if (
    result.error &&
    /p_target_id|target_id/i.test(
      result.error.message,
    )
  ) {
    result = await supabase.rpc(rpcName, {
      ...params,
      p_target_user_id: targetValue,
    });
  }

  if (result.error) {
    throw new Error(result.error.message);
  }

  return result.data;
}

/**
 * جلب حالة اللعبة.
 */
export async function getGameState(
  roomValue: string,
): Promise<GameState> {
  const roomId = await resolveRoomId(roomValue);

  const { data, error } = await supabase.rpc(
    'get_mafia_game_state',
    {
      p_room_id: roomId,
    },
  );

  if (error) {
    throw new Error(
      error.message || 'تعذر تحميل حالة اللعبة.',
    );
  }

  if (!data) {
    throw new Error(
      'تعذر تحميل حالة اللعبة.',
    );
  }

  const rawPlayers = Array.isArray(data?.players)
    ? data.players
    : [];

  const players = rawPlayers.map(
    normalizeGamePlayer,
  );

  const me = data?.me
    ? normalizeGamePlayer(data.me)
    : null;

  return {
    room: normalizeRoom(data?.room ?? data),
    players,
    me,
    my_player_id:
      data?.my_player_id
        ? String(data.my_player_id)
        : me?.id ?? null,
  };
}

/**
 * جلب الدور الحقيقي للاعب الحالي.
 */
export async function getMyRole(
  roomValue: string,
): Promise<MyRole> {
  const roomId = await resolveRoomId(roomValue);

  const { data, error } = await supabase.rpc(
    'get_my_mafia_role',
    {
      p_room_id: roomId,
    },
  );

  if (error) {
    throw new Error(
      error.message || 'تعذر تحميل دورك.',
    );
  }

  const role = normalizeGameRole(data?.role);

  return {
    role,
    alive: Boolean(data?.alive),
    team: getRoleTeam(data?.team ?? role),
    ghoul_ability_stolen: Boolean(
      data?.ghoul_ability_stolen ??
        data?.ghoul_has_copied,
    ),
    stolen_role: data?.stolen_role
      ? normalizeGameRole(data.stolen_role)
      : data?.ghoul_copied_role
        ? normalizeGameRole(data.ghoul_copied_role)
        : null,
    stolen_ability: normalizeNightAction(
      data?.stolen_ability,
    ),
  };
}

/**
 * بدء اللعبة.
 */
export async function startGame(
  roomValue: string,
) {
  const roomId = await resolveRoomId(roomValue);

  const { data, error } = await supabase.rpc(
    'start_mafia_game',
    {
      p_room_id: roomId,
    },
  );

  if (error) {
    throw new Error(
      error.message || 'تعذر بدء اللعبة.',
    );
  }

  return data;
}

/**
 * إرسال قدرة ليلية.
 *
 * targetValue يمكن أن يكون:
 * - room_players.id
 * - user_id
 */
export async function submitNightAction(
  roomValue: string,
  action: NightAction,
  targetValue?: string | null,
) {
  const roomId = await resolveRoomId(roomValue);

  if (!action) {
    throw new Error('القدرة غير صالحة.');
  }

  return callTargetRpc(
    'mafia_submit_action',
    {
      p_room_id: roomId,
      p_action: action,
    },
    roomId,
    targetValue,
  );
}

/**
 * إرسال تصويت نهاري.
 */
export async function submitDayVote(
  roomValue: string,
  targetValue: string,
) {
  const roomId = await resolveRoomId(roomValue);

  if (!targetValue) {
    throw new Error(
      'يجب اختيار لاعب للتصويت.',
    );
  }

  const targetId = await resolveTarget(
    roomId,
    targetValue,
  );

  const { data, error } = await supabase.rpc(
    'mafia_submit_vote',
    {
      p_room_id: roomId,
      p_target_id: targetId,
    },
  );

  if (error) {
    throw new Error(
      error.message || 'تعذر إرسال التصويت.',
    );
  }

  return data;
}

/**
 * محاولة نقل المرحلة عند انتهاء المؤقت.
 */
export async function advanceMafiaPhase(
  roomValue: string,
) {
  const roomId = await resolveRoomId(roomValue);

  const { data, error } = await supabase.rpc(
    'advance_mafia_phase',
    {
      p_room_id: roomId,
    },
  );

  if (error) {
    throw new Error(
      error.message || 'تعذر الانتقال للمرحلة التالية.',
    );
  }

  return data;
}

/**
 * أسماء الأدوار المتاحة فعليًا حاليًا في النظام.
 */
export function getAvailableRoles(): GameRole[] {
  return [
    'CITIZEN',
    'DOCTOR',
    'DETECTIVE',
    'GHOUL',
    'SPY',
    'BODYGUARD',
    'SHERIFF',
    'WITCH',
    'MAFIA',
    'GODFATHER',
    'CONSIGLIERE',
    'CULT_LEADER',
    'CULTIST',
  ];
}

/**
 * إرجاع كل معلومات البطاقة دفعة واحدة.
 * ستستخدمها واجهة Anime Role Card.
 */
export function getRoleCardData(
  roleValue: unknown,
) {
  const definition = getRoleDefinition(roleValue);

  return {
    role: definition.role,
    label: definition.label,
    englishLabel: definition.englishLabel,
    team: definition.team,
    teamLabel: getTeamLabel(definition.team),
    description: definition.description,
    ability: definition.ability,
    objective: definition.objective,
    phase: definition.phase,
    action: definition.action,
    actionLabel: getActionLabel(
      definition.action,
    ),
  };
}

/**
 * إذا مات لاعب وأصبحت قدرته قابلة للسرقة،
 * يحول الاسم القادم من Supabase إلى NightAction.
 */
export function getStealableAbility(
  roleValue: unknown,
): NightAction | null {
  const role = normalizeGameRole(roleValue);

  switch (role) {
    case 'DOCTOR':
      return 'protect';

    case 'DETECTIVE':
      return 'investigate';

    case 'MAFIA':
    case 'GODFATHER':
      return 'kill';

    case 'CONSIGLIERE':
      return 'investigate';

    case 'SPY':
      return 'spy';

    case 'BODYGUARD':
      return 'guard';

    case 'SHERIFF':
      return 'sheriff_check';

    case 'WITCH':
      return 'witch_save';

    case 'CULT_LEADER':
      return 'cult_convert';

    default:
      return null;
  }
}

/**
 * اسم القدرة التي يملكها الغول حاليًا.
 */
export function getGhoulAbilityLabel(
  stolenRole: unknown,
  stolenAbility?: unknown,
): string {
  const action =
    normalizeNightAction(stolenAbility) ??
    getStealableAbility(stolenRole);

  if (!action) {
    return 'لم يسرق الغول قدرة بعد';
  }

  return getActionLabel(action);
}

/**
 * هل يستطيع اللاعب استخدام قدرة ليلية؟
 */
export function canUseNightAction(
  roleValue: unknown,
  alive: boolean,
): boolean {
  if (!alive) {
    return false;
  }

  return getRoleNightAction(roleValue) !== null;
}

/**
 * تحويل المرحلة إلى عنوان عربي.
 */
export function getPhaseLabel(
  phaseValue: unknown,
): string {
  switch (
    String(phaseValue ?? '').toLowerCase()
  ) {
    case 'night':
      return 'الليل';

    case 'day':
      return 'النهار';

    case 'finished':
      return 'انتهت اللعبة';

    case 'waiting':
    default:
      return 'انتظار اللاعبين';
  }
}
