import { supabase } from './supabase';

/**
 * ============================================================
 * Mafia Game - Unified Game API
 * ============================================================
 *
 * الفرق الموجودة في اللعبة ثلاثة فقط:
 *
 * 1. CITIZENS
 * 2. MAFIA
 * 3. CULT
 *
 * لا توجد فرق مستقلة أخرى.
 * ============================================================
 */

export type GamePhase = 'night' | 'day';

/**
 * جميع أدوار اللعبة النهائية.
 *
 * CITIZEN
 * DOCTOR
 * DETECTIVE
 * GHOUL
 * ----------------
 * MAFIA
 * GODFATHER
 * CONSIGLIERE
 * ----------------
 * CULT_LEADER
 * CULTIST
 */
export type GameRole =
  // Citizens
  | 'CITIZEN'
  | 'DOCTOR'
  | 'DETECTIVE'
  | 'GHOUL'

  // Mafia
  | 'MAFIA'
  | 'GODFATHER'
  | 'CONSIGLIERE'

  // Cult
  | 'CULT_LEADER'
  | 'CULTIST';

/**
 * الفرق الثلاثة فقط.
 */
export type GameTeam =
  | 'CITIZENS'
  | 'MAFIA'
  | 'CULT';

/**
 * ============================================================
 * Player
 * ============================================================
 */
export type GamePlayer = {
  id: string;
  user_id: string;
  name: string;
  avatar_url: string | null;
  alive: boolean;

  /**
   * الدور لا يجب الاعتماد عليه في شاشة اللاعبين
   * إذا كانت قاعدة البيانات لا ترسله لجميع اللاعبين.
   *
   * لذلك يبقى اختياريًا.
   */
  role?: GameRole | null;
};

/**
 * ============================================================
 * Room events
 * ============================================================
 */
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

/**
 * آخر حدث في اللعبة.
 */
export type GameEvent = {
  type?: GameEventType | string;

  player_id?: string;

  target_id?: string;

  round?: number;

  winner?: GameTeam | string;

  phase?: GamePhase;

  phase_ends_at?: string;

  previous_phase?: GamePhase;

  /**
   * اللاعب الذي مات أولًا، والذي سرق الغول قدرته.
   */
  ghoul_target?: string;

  /**
   * اللاعب الذي تم تحويله إلى الطائفة.
   */
  cult_converted?: string;

  /**
   * الدور الذي تم الحصول عليه بواسطة الغول.
   */
  stolen_role?: GameRole | null;
};

/**
 * ============================================================
 * Room
 * ============================================================
 */
export type GameRoom = {
  id: string;

  code: string;

  status: string;

  game_round: number;

  game_phase: GamePhase;

  winner: GameTeam | string | null;

  phase_ends_at: string | null;

  last_event: GameEvent | null;
};

/**
 * ============================================================
 * Game State
 * ============================================================
 */
export type GameState = {
  room: GameRoom;

  players: GamePlayer[];

  /**
   * ID اللاعب الحالي داخل الغرفة.
   *
   * بعض النسخ القديمة من get_mafia_game_state
   * كانت لا ترسل هذه القيمة، لذلك نجعلها nullable.
   */
  my_player_id: string | null;
};

/**
 * ============================================================
 * My Role
 * ============================================================
 */
export type MyRole = {
  role: GameRole;

  alive: boolean;

  /**
   * الفريق الذي ينتمي إليه اللاعب.
   */
  team?: GameTeam;

  /**
   * هل الغول سرق قدرة بالفعل؟
   */
  ghoul_ability_stolen?: boolean;

  /**
   * الدور الذي سرق الغول قدرته.
   */
  stolen_role?: GameRole | null;

  /**
   * اسم/نوع القدرة المسروقة.
   */
  stolen_ability?: NightAction | null;
};

/**
 * ============================================================
 * Night Actions
 * ============================================================
 *
 * لا نضع عشرات القدرات القديمة التي لم يعد لها معنى.
 *
 * كل قدرة هنا لها وظيفة مختلفة:
 *
 * kill
 *   Mafia
 *
 * protect
 *   Doctor
 *
 * investigate
 *   Detective / Consigliere
 *   ولكن نتيجة التحقيق تختلف حسب الدور:
 *     Detective   -> الفريق
 *     Consigliere -> الدور الدقيق
 *
 * cult_convert
 *   Cult Leader
 *
 * ghoul
 *   قدرة الغول الخاصة.
 *
 * ============================================================
 */
export type NightAction =
  | 'kill'
  | 'protect'
  | 'investigate'
  | 'cult_convert'
  | 'ghoul';

/**
 * ============================================================
 * Role information
 * ============================================================
 *
 * هذه الدالة تجعل قواعد الأدوار واضحة في مكان واحد.
 */
export function getRoleTeam(role: GameRole): GameTeam {
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
      return 'CITIZENS';

    default:
      return 'CITIZENS';
  }
}

/**
 * ============================================================
 * Role abilities
 * ============================================================
 *
 * نستخدم هذا لمنع تداخل القدرات.
 */
export function getRoleNightAction(
  role: GameRole
): NightAction | null {
  switch (role) {
    /**
     * Mafia:
     * قتل لاعب في الليل.
     */
    case 'MAFIA':
      return 'kill';

    /**
     * Godfather:
     * لا نرسل له قدرة مستقلة هنا.
     *
     * هو قائد المافيا، ولا نريد إنشاء
     * قدرة قتل ثانية مكررة.
     */
    case 'GODFATHER':
      return null;

    /**
     * Consigliere:
     * يبحث عن الدور الدقيق.
     */
    case 'CONSIGLIERE':
      return 'investigate';

    /**
     * Doctor:
     * حماية لاعب.
     */
    case 'DOCTOR':
      return 'protect';

    /**
     * Detective:
     * معرفة الفريق.
     */
    case 'DETECTIVE':
      return 'investigate';

    /**
     * Ghoul:
     * لا يختار قدرة في بداية اللعبة.
     *
     * يحصل عليها تلقائيًا من أول لاعب يموت.
     */
    case 'GHOUL':
      return 'ghoul';

    /**
     * Cult Leader:
     * تحويل لاعب إلى الطائفة.
     */
    case 'CULT_LEADER':
      return 'cult_convert';

    /**
     * Cultist:
     * لا يملك قدرة ليلية.
     */
    case 'CULTIST':
      return null;

    /**
     * Citizen:
     * لا يملك قدرة.
     */
    case 'CITIZEN':
      return null;

    default:
      return null;
  }
}

/**
 * ============================================================
 * Investigation result
 * ============================================================
 *
 * Detective و Consigliere لا يحصلان على نفس النتيجة:
 *
 * Detective:
 *   يعرف الفريق.
 *
 * Consigliere:
 *   يعرف الدور الدقيق.
 */
export type InvestigationResult =
  | {
      type: 'team';
      team: GameTeam;
    }
  | {
      type: 'role';
      role: GameRole;
    };

/**
 * ============================================================
 * Get game state
 * ============================================================
 */
export async function getGameState(
  roomId: string
): Promise<GameState> {
  if (!roomId) {
    throw new Error('Missing room ID');
  }

  const { data, error } = await supabase.rpc(
    'get_mafia_game_state',
    {
      p_room_id: roomId,
    }
  );

  if (error) {
    console.error(
      'getGameState error:',
      error
    );

    throw error;
  }

  if (!data) {
    throw new Error(
      'Game state was not returned'
    );
  }

  return data as GameState;
}

/**
 * ============================================================
 * Get current player's role
 * ============================================================
 */
export async function getMyRole(
  roomId: string
): Promise<MyRole> {
  if (!roomId) {
    throw new Error('Missing room ID');
  }

  const { data, error } =
    await supabase.rpc(
      'get_my_mafia_role',
      {
        p_room_id: roomId,
      }
    );

  if (error) {
    console.error(
      'getMyRole error:',
      error
    );

    throw error;
  }

  if (!data) {
    throw new Error(
      'Player role was not returned'
    );
  }

  const result = data as MyRole;

  /**
   * إذا كانت قاعدة البيانات ترسل الدور
   * ولكن لا ترسل الفريق، نحسب الفريق هنا.
   */
  if (
    result.role &&
    !result.team
  ) {
    result.team = getRoleTeam(
      result.role
    );
  }

  /**
   * القيم الافتراضية للغول.
   */
  if (
    result.role === 'GHOUL' &&
    result.ghoul_ability_stolen === undefined
  ) {
    result.ghoul_ability_stolen = false;
  }

  if (
    result.role === 'GHOUL' &&
    result.stolen_role === undefined
  ) {
    result.stolen_role = null;
  }

  if (
    result.role === 'GHOUL' &&
    result.stolen_ability === undefined
  ) {
    result.stolen_ability = null;
  }

  return result;
}

/**
 * ============================================================
 * Submit night action
 * ============================================================
 */
export async function submitNightAction(
  roomId: string,
  action: NightAction,
  targetId: string
) {
  if (!roomId) {
    throw new Error('Missing room ID');
  }

  if (!action) {
    throw new Error('Missing night action');
  }

  if (!targetId) {
    throw new Error('Missing target');
  }

  const validActions: NightAction[] = [
    'kill',
    'protect',
    'investigate',
    'cult_convert',
    'ghoul',
  ];

  if (!validActions.includes(action)) {
    throw new Error(
      `Unsupported night action: ${action}`
    );
  }

  const { data, error } =
    await supabase.rpc(
      'mafia_submit_action',
      {
        p_room_id: roomId,
        p_action: action,
        p_target_id: targetId,
      }
    );

  if (error) {
    console.error(
      'submitNightAction error:',
      error
    );

    throw error;
  }

  return data;
}

/**
 * ============================================================
 * Submit day vote
 * ============================================================
 */
export async function submitDayVote(
  roomId: string,
  targetId: string
) {
  if (!roomId) {
    throw new Error('Missing room ID');
  }

  if (!targetId) {
    throw new Error(
      'Missing vote target'
    );
  }

  const { data, error } =
    await supabase.rpc(
      'mafia_submit_vote',
      {
        p_room_id: roomId,
        p_target_id: targetId,
      }
    );

  if (error) {
    console.error(
      'submitDayVote error:',
      error
    );

    throw error;
  }

  return data;
}

/**
 * ============================================================
 * Start game
 * ============================================================
 */
export async function startMafiaGame(
  roomId: string
) {
  if (!roomId) {
    throw new Error('Missing room ID');
  }

  const { data, error } =
    await supabase.rpc(
      'start_mafia_game',
      {
        p_room_id: roomId,
      }
    );

  if (error) {
    console.error(
      'startMafiaGame error:',
      error
    );

    throw error;
  }

  return data;
}

/**
 * ============================================================
 * Advance game phase
 * ============================================================
 */
export async function advanceMafiaPhase(
  roomId: string
) {
  if (!roomId) {
    throw new Error('Missing room ID');
  }

  const { data, error } =
    await supabase.rpc(
      'advance_mafia_phase',
      {
        p_room_id: roomId,
      }
    );

  if (error) {
    console.error(
      'advanceMafiaPhase error:',
      error
    );

    throw error;
  }

  return data;
}

/**
 * ============================================================
 * Ghoul ability helpers
 * ============================================================
 */

/**
 * الغول يستطيع سرقة قدرة واحدة فقط.
 */
export function canGhoulStealAbility(
  role: GameRole,
  alreadyStolen: boolean
): boolean {
  return (
    role === 'GHOUL' &&
    !alreadyStolen
  );
}

/**
 * تحديد القدرة التي يستطيع الغول الحصول عليها
 * من الدور الذي مات أولًا.
 *
 * المواطن العادي ليس لديه قدرة،
 * لذلك لا يحصل الغول على شيء إذا كان أول ميت Citizen.
 */
export function getStealableAbility(
  role: GameRole
): NightAction | null {
  switch (role) {
    case 'DOCTOR':
      return 'protect';

    case 'DETECTIVE':
      return 'investigate';

    case 'MAFIA':
      return 'kill';

    case 'CONSIGLIERE':
      return 'investigate';

    case 'CULT_LEADER':
      return 'cult_convert';

    /**
     * هذه الأدوار لا تمنح الغول قدرة
     * عند موتها.
     */
    case 'CITIZEN':
    case 'GODFATHER':
    case 'CULTIST':
    case 'GHOUL':
      return null;

    default:
      return null;
  }
}

/**
 * ============================================================
 * Ghoul first-death rule
 * ============================================================
 *
 * الغول لا يختار متى يسرق.
 *
 * أول وفاة في اللعبة:
 *
 *   اللاعب يموت
 *        ↓
 *   نعرف دوره
 *        ↓
 *   إذا كان لديه قدرة قابلة للسرقة
 *        ↓
 *   الغول يحصل عليها
 *        ↓
 *   ghoul_ability_stolen = true
 *
 * لا توجد سرقة ثانية.
 */
export function getGhoulStealResult(
  ghoulRole: GameRole,
  alreadyStolen: boolean,
  firstDeadRole: GameRole
): {
  stolen: boolean;
  role: GameRole | null;
  ability: NightAction | null;
} {
  if (
    !canGhoulStealAbility(
      ghoulRole,
      alreadyStolen
    )
  ) {
    return {
      stolen: false,
      role: null,
      ability: null,
    };
  }

  const ability =
    getStealableAbility(
      firstDeadRole
    );

  if (!ability) {
    return {
      stolen: false,
      role: null,
      ability: null,
    };
  }

  return {
    stolen: true,
    role: firstDeadRole,
    ability,
  };
}

/**
 * ============================================================
 * Team helpers
 * ============================================================
 */

export function isCitizenTeam(
  role: GameRole
): boolean {
  return (
    getRoleTeam(role) ===
    'CITIZENS'
  );
}

export function isMafiaTeam(
  role: GameRole
): boolean {
  return (
    getRoleTeam(role) ===
    'MAFIA'
  );
}

export function isCultTeam(
  role: GameRole
): boolean {
  return (
    getRoleTeam(role) ===
    'CULT'
  );
}

/**
 * ============================================================
 * Role ability description
 * ============================================================
 *
 * تستخدمها الواجهة لعرض وصف موحد للدور.
 */
export function getRoleDescription(
  role: GameRole
): string {
  switch (role) {
    case 'CITIZEN':
      return 'مواطن عادي. لا يملك قدرة ليلية، ويساعد المواطنين عن طريق التصويت.';

    case 'DOCTOR':
      return 'يحمي لاعبًا واحدًا كل ليلة من القتل.';

    case 'DETECTIVE':
      return 'يفحص لاعبًا واحدًا كل ليلة لمعرفة الفريق الذي ينتمي إليه.';

    case 'GHOUL':
      return 'ينتمي إلى المواطنين. يسرق قدرة أول لاعب يموت مرة واحدة فقط في اللعبة.';

    case 'MAFIA':
      return 'يشارك في اختيار لاعب لقتله أثناء الليل.';

    case 'GODFATHER':
      return 'قائد المافيا. لا يملك قدرة قتل إضافية حتى لا تتكرر قدرة المافيا.';

    case 'CONSIGLIERE':
      return 'يفحص لاعبًا لمعرفة دوره الدقيق، وليس فريقه فقط.';

    case 'CULT_LEADER':
      return 'زعيم الطائفة. يستطيع تحويل لاعب إلى الطائفة وفق قواعد اللعبة.';

    case 'CULTIST':
      return 'عضو في الطائفة ولا يملك قدرة ليلية مستقلة.';

    default:
      return '';
  }
}
