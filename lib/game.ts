import { supabase } from './supabase';

/**
 * ============================================================
 * MAFIA NIGHT - GAME API
 * ============================================================
 *
 * الفرق:
 *   CITIZENS
 *   MAFIA
 *   CULT
 *
 * الأدوار:
 *   CITIZEN
 *   DOCTOR
 *   DETECTIVE
 *   GHOUL
 *   MAFIA
 *   GODFATHER
 *   CONSIGLIERE
 *   CULT_LEADER
 *   CULTIST
 *
 * ملاحظة:
 * هذا الملف مسؤول عن:
 * - Types
 * - قراءة حالة اللعبة
 * - إرسال الأفعال
 * - قراءة الدور
 * - مساعدات قواعد اللعبة
 *
 * التنفيذ الحقيقي للقواعد الحساسة يجب أن يكون
 * داخل Supabase RPC في المرحلة التالية.
 * ============================================================
 */


/* ============================================================
   PHASE
============================================================ */

export type GamePhase =
  | 'waiting'
  | 'night'
  | 'day'
  | 'finished';


/* ============================================================
   TEAM
============================================================ */

export type GameTeam =
  | 'CITIZENS'
  | 'MAFIA'
  | 'CULT';


/* ============================================================
   ROLE
============================================================ */

export type GameRole =
  | 'CITIZEN'
  | 'DOCTOR'
  | 'DETECTIVE'
  | 'GHOUL'
  | 'MAFIA'
  | 'GODFATHER'
  | 'CONSIGLIERE'
  | 'CULT_LEADER'
  | 'CULTIST';


/* ============================================================
   NIGHT ACTION
============================================================ */

export type NightAction =
  | 'kill'
  | 'protect'
  | 'investigate'
  | 'cult_convert';


/* ============================================================
   INVESTIGATION
============================================================ */

export type InvestigationResult =
  | {
      type: 'team';
      team: GameTeam;
    }
  | {
      type: 'role';
      role: GameRole;
    };


/* ============================================================
   PLAYER
============================================================ */

export type GamePlayer = {
  id: string;
  user_id: string;

  name: string;

  avatar_url?: string | null;

  alive: boolean;

  /**
   * الدور قد لا يكون مرسلًا للاعبين الآخرين.
   * لذلك يبقى اختياريًا.
   */
  role?: GameRole | string | null;

  ready?: boolean;

  created_at?: string | null;
};


/* ============================================================
   CURRENT PLAYER
============================================================ */

export type CurrentGamePlayer = {
  id?: string | null;
  user_id?: string | null;

  name?: string | null;

  alive: boolean;

  role?: GameRole | string | null;

  team?: GameTeam | string | null;

  avatar_url?: string | null;

  ghoul_ability_stolen?: boolean;

  stolen_role?: GameRole | null;

  stolen_ability?: NightAction | null;
};


/* ============================================================
   GAME EVENT
============================================================ */

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
  | 'winner'
  | string;


export type GameEvent = {
  type?: GameEventType | null;

  player_id?: string | null;

  target_id?: string | null;

  round?: number | null;

  winner?: GameTeam | string | null;

  phase?: GamePhase | string | null;

  phase_ends_at?: string | null;

  previous_phase?: GamePhase | string | null;

  ghoul_target?: string | null;

  cult_converted?: string | null;

  stolen_role?: GameRole | string | null;

  stolen_ability?: NightAction | null;

  message?: string | null;

  [key: string]: unknown;
};


/* ============================================================
   ROOM
============================================================ */

export type GameRoom = {
  id: string;

  code: string;

  name?: string | null;

  status: string;

  host_id?: string | null;

  max_players?: number | null;

  game_round: number;

  game_phase: GamePhase | string;

  winner?: GameTeam | string | null;

  phase_ends_at?: string | null;

  last_event?: GameEvent | string | null;

  [key: string]: unknown;
};


/* ============================================================
   GAME STATE
============================================================ */

/**
 * نحافظ على BOTH:
 *
 *   me
 *   my_player_id
 *
 * لأن الشاشات الحالية في المشروع تستخدم الصيغتين
 * في إصدارات مختلفة.
 */
export type GameState = {
  room: GameRoom;

  players: GamePlayer[];

  me?: CurrentGamePlayer | null;

  my_player_id?: string | null;

  [key: string]: unknown;
};


/* ============================================================
   MY ROLE
============================================================ */

export type MyRole = {
  role: GameRole;

  alive: boolean;

  team?: GameTeam;

  ghoul_ability_stolen?: boolean;

  stolen_role?: GameRole | null;

  stolen_ability?: NightAction | null;
};


/* ============================================================
   ERROR HELPER
============================================================ */

function errorMessage(
  error: any,
  fallback: string,
): string {
  if (!error) {
    return fallback;
  }

  if (
    typeof error === 'string' &&
    error.trim()
  ) {
    return error;
  }

  const parts = [
    error.message,
    error.details,
    error.hint,
    error.code
      ? `code=${error.code}`
      : null,
  ]
    .filter(Boolean)
    .map(String);

  return parts.join(' | ') || fallback;
}


/* ============================================================
   ROLE NORMALIZATION
============================================================ */

export function normalizeGameRole(
  value: unknown,
): GameRole | null {
  if (
    typeof value !== 'string'
  ) {
    return null;
  }

  const normalized =
    value.trim().toUpperCase();

  switch (normalized) {
    case 'CITIZEN':
      return 'CITIZEN';

    case 'DOCTOR':
      return 'DOCTOR';

    case 'DETECTIVE':
      return 'DETECTIVE';

    case 'GHOUL':
      return 'GHOUL';

    case 'MAFIA':
      return 'MAFIA';

    case 'GODFATHER':
      return 'GODFATHER';

    case 'CONSIGLIERE':
      return 'CONSIGLIERE';

    case 'CULT_LEADER':
      return 'CULT_LEADER';

    case 'CULTIST':
      return 'CULTIST';

    default:
      return null;
  }
}


/* ============================================================
   TEAM
============================================================ */

export function getRoleTeam(
  role: GameRole | string | null | undefined,
): GameTeam | null {
  const normalized =
    normalizeGameRole(role);

  if (!normalized) {
    return null;
  }

  switch (normalized) {
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
      return null;
  }
}


/* ============================================================
   ROLE NIGHT ACTION
============================================================ */

/**
 * الغول ليس لديه زر ghoul.
 *
 * قدرته تحدث تلقائيًا عند أول وفاة.
 */
export function getRoleNightAction(
  role: GameRole | string | null | undefined,
): NightAction | null {
  const normalized =
    normalizeGameRole(role);

  if (!normalized) {
    return null;
  }

  switch (normalized) {
    case 'MAFIA':
      return 'kill';

    case 'DOCTOR':
      return 'protect';

    case 'DETECTIVE':
      return 'investigate';

    case 'CONSIGLIERE':
      return 'investigate';

    case 'CULT_LEADER':
      return 'cult_convert';

    case 'CITIZEN':
    case 'GHOUL':
    case 'GODFATHER':
    case 'CULTIST':
    default:
      return null;
  }
}


/* ============================================================
   ROLE DESCRIPTION
============================================================ */

export function getRoleDescription(
  role: GameRole | string | null | undefined,
): string {
  const normalized =
    normalizeGameRole(role);

  switch (normalized) {
    case 'CITIZEN':
      return (
        'مواطن عادي. لا يملك قدرة ليلية. ' +
        'هدفه اكتشاف الأعداء عن طريق النقاش والتصويت.'
      );

    case 'DOCTOR':
      return (
        'الطبيب. يستطيع حماية لاعب واحد كل ليلة ' +
        'من محاولة القتل.'
      );

    case 'DETECTIVE':
      return (
        'المحقق. يستطيع فحص لاعب واحد كل ليلة ' +
        'لمعرفة الفريق الذي ينتمي إليه.'
      );

    case 'GHOUL':
      return (
        'الغول. ينتمي إلى المواطنين. ' +
        'عند موت أول لاعب في اللعبة، يستطيع تلقائيًا ' +
        'الحصول على قدرته مرة واحدة فقط إذا كانت قابلة للسرقة.'
      );

    case 'MAFIA':
      return (
        'عضو المافيا. يشارك في اختيار هدف القتل الليلي.'
      );

    case 'GODFATHER':
      return (
        'عرّاب المافيا. قائد المافيا وله خصائص خاصة ' +
        'تحددها قواعد اللعبة في الخادم.'
      );

    case 'CONSIGLIERE':
      return (
        'المستشار. يستطيع فحص لاعب لمعرفة دوره الدقيق.'
      );

    case 'CULT_LEADER':
      return (
        'زعيم الطائفة. يستطيع تحويل لاعب مناسب إلى الطائفة.'
      );

    case 'CULTIST':
      return (
        'عضو في الطائفة. لا يملك قدرة ليلية مستقلة.'
      );

    default:
      return 'دور غير معروف.';
  }
}


/* ============================================================
   ROLE LABEL
============================================================ */

export function getRoleLabel(
  role: GameRole | string | null | undefined,
): string {
  const normalized =
    normalizeGameRole(role);

  switch (normalized) {
    case 'CITIZEN':
      return 'المواطن';

    case 'DOCTOR':
      return 'الطبيب';

    case 'DETECTIVE':
      return 'المحقق';

    case 'GHOUL':
      return 'الغول';

    case 'MAFIA':
      return 'المافيا';

    case 'GODFATHER':
      return 'عرّاب المافيا';

    case 'CONSIGLIERE':
      return 'المستشار';

    case 'CULT_LEADER':
      return 'زعيم الطائفة';

    case 'CULTIST':
      return 'عضو الطائفة';

    default:
      return 'غير معروف';
  }
}


/* ============================================================
   TEAM HELPERS
============================================================ */

export function isCitizenTeam(
  role: GameRole | string | null | undefined,
): boolean {
  return (
    getRoleTeam(role) ===
    'CITIZENS'
  );
}


export function isMafiaTeam(
  role: GameRole | string | null | undefined,
): boolean {
  return (
    getRoleTeam(role) ===
    'MAFIA'
  );
}


export function isCultTeam(
  role: GameRole | string | null | undefined,
): boolean {
  return (
    getRoleTeam(role) ===
    'CULT'
  );
}


/* ============================================================
   VALIDATION
============================================================ */

function requireRoomId(
  roomId: string,
): string {
  const value =
    roomId?.trim();

  if (!value) {
    throw new Error(
      'Missing room ID',
    );
  }

  return value;
}


function requireTargetId(
  targetId: string,
): string {
  const value =
    targetId?.trim();

  if (!value) {
    throw new Error(
      'Missing target',
    );
  }

  return value;
}


/* ============================================================
   GET GAME STATE
============================================================ */

export async function getGameState(
  roomId: string,
): Promise<GameState> {
  const id =
    requireRoomId(roomId);

  const {
    data,
    error,
  } = await supabase.rpc(
    'get_mafia_game_state',
    {
      p_room_id: id,
    },
  );

  if (error) {
    console.error(
      'getGameState:',
      error,
    );

    throw new Error(
      errorMessage(
        error,
        'تعذر تحميل حالة اللعبة.',
      ),
    );
  }

  if (!data) {
    throw new Error(
      'لم يتم إرجاع حالة اللعبة.',
    );
  }

  const state =
    data as GameState;

  if (!state.room) {
    throw new Error(
      'بيانات الغرفة غير موجودة في حالة اللعبة.',
    );
  }

  if (!Array.isArray(state.players)) {
    state.players = [];
  }

  /**
   * توافق مع الإصدارات القديمة:
   *
   * إذا كان me موجودًا ولكن my_player_id غير موجود
   * نستخرجه من me.
   */
  if (
    !state.my_player_id &&
    state.me?.id
  ) {
    state.my_player_id =
      state.me.id;
  }

  if (
    !state.my_player_id &&
    state.me?.user_id
  ) {
    const player =
      state.players.find(
        item =>
          item.user_id ===
          state.me?.user_id,
      );

    if (player) {
      state.my_player_id =
        player.id;
    }
  }

  return state;
}


/* ============================================================
   GET MY ROLE
============================================================ */

export async function getMyRole(
  roomId: string,
): Promise<MyRole> {
  const id =
    requireRoomId(roomId);

  const {
    data,
    error,
  } = await supabase.rpc(
    'get_my_mafia_role',
    {
      p_room_id: id,
    },
  );

  if (error) {
    console.error(
      'getMyRole:',
      error,
    );

    throw new Error(
      errorMessage(
        error,
        'تعذر تحميل دور اللاعب.',
      ),
    );
  }

  if (!data) {
    throw new Error(
      'لم يتم إرجاع دور اللاعب.',
    );
  }

  const raw =
    data as any;

  const role =
    normalizeGameRole(
      raw.role,
    );

  if (!role) {
    throw new Error(
      'الدور الذي أرسلته قاعدة البيانات غير معروف.',
    );
  }

  const team =
    getRoleTeam(role);

  return {
    role,

    alive:
      raw.alive !== false,

    team:
      raw.team ||
      team ||
      undefined,

    ghoul_ability_stolen:
      role === 'GHOUL'
        ? Boolean(
            raw.ghoul_ability_stolen,
          )
        : undefined,

    stolen_role:
      role === 'GHOUL'
        ? normalizeGameRole(
            raw.stolen_role,
          )
        : undefined,

    stolen_ability:
      role === 'GHOUL'
        ? (
            raw.stolen_ability ===
            'kill' ||
            raw.stolen_ability ===
            'protect' ||
            raw.stolen_ability ===
            'investigate' ||
            raw.stolen_ability ===
            'cult_convert'
              ? raw.stolen_ability
              : null
          )
        : undefined,
  };
}


/* ============================================================
   SUBMIT NIGHT ACTION
============================================================ */

export async function submitNightAction(
  roomId: string,
  action: NightAction,
  targetId: string,
): Promise<any> {
  const id =
    requireRoomId(roomId);

  const target =
    requireTargetId(targetId);

  if (
    action !== 'kill' &&
    action !== 'protect' &&
    action !== 'investigate' &&
    action !== 'cult_convert'
  ) {
    throw new Error(
      `Unsupported night action: ${action}`,
    );
  }

  const {
    data,
    error,
  } = await supabase.rpc(
    'mafia_submit_action',
    {
      p_room_id: id,
      p_action: action,
      p_target_id: target,
    },
  );

  if (error) {
    console.error(
      'submitNightAction:',
      error,
    );

    throw new Error(
      errorMessage(
        error,
        'تعذر تنفيذ القدرة الليلية.',
      ),
    );
  }

  return data;
}


/* ============================================================
   SUBMIT DAY VOTE
============================================================ */

export async function submitDayVote(
  roomId: string,
  targetId: string,
): Promise<any> {
  const id =
    requireRoomId(roomId);

  const target =
    requireTargetId(targetId);

  const {
    data,
    error,
  } = await supabase.rpc(
    'mafia_submit_vote',
    {
      p_room_id: id,
      p_target_id: target,
    },
  );

  if (error) {
    console.error(
      'submitDayVote:',
      error,
    );

    throw new Error(
      errorMessage(
        error,
        'تعذر تسجيل التصويت.',
      ),
    );
  }

  return data;
}


/* ============================================================
   START GAME
============================================================ */

export async function startMafiaGame(
  roomId: string,
): Promise<any> {
  const id =
    requireRoomId(roomId);

  const {
    data,
    error,
  } = await supabase.rpc(
    'start_mafia_game',
    {
      p_room_id: id,
    },
  );

  if (error) {
    console.error(
      'startMafiaGame:',
      error,
    );

    throw new Error(
      errorMessage(
        error,
        'تعذر بدء اللعبة.',
      ),
    );
  }

  return data;
}


/* ============================================================
   ADVANCE PHASE
============================================================ */

export async function advanceMafiaPhase(
  roomId: string,
): Promise<any> {
  const id =
    requireRoomId(roomId);

  const {
    data,
    error,
  } = await supabase.rpc(
    'advance_mafia_phase',
    {
      p_room_id: id,
    },
  );

  if (error) {
    console.error(
      'advanceMafiaPhase:',
      error,
    );

    throw new Error(
      errorMessage(
        error,
        'تعذر الانتقال إلى المرحلة التالية.',
      ),
    );
  }

  return data;
}


/* ============================================================
   GHOUL
============================================================ */

/**
 * الغول لا ينفذ Action مستقل.
 *
 * السرقة تحدث مرة واحدة فقط.
 */
export function canGhoulStealAbility(
  role: GameRole | string | null | undefined,
  alreadyStolen: boolean,
): boolean {
  return (
    normalizeGameRole(role) ===
      'GHOUL' &&
    !alreadyStolen
  );
}


/**
 * القدرات التي يمكن للغول سرقتها.
 *
 * Citizen / Godfather / Cultist / Ghoul
 * لا تمنح قدرة قابلة للسرقة.
 */
export function getStealableAbility(
  role: GameRole | string | null | undefined,
): NightAction | null {
  const normalized =
    normalizeGameRole(role);

  switch (normalized) {
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

    case 'CITIZEN':
    case 'GHOUL':
    case 'GODFATHER':
    case 'CULTIST':
    default:
      return null;
  }
}


/**
 * حساب نتيجة سرقة الغول.
 *
 * ملاحظة مهمة:
 * هذه الدالة لا تقوم بتغيير قاعدة البيانات.
 * هي فقط تحسب النتيجة.
 *
 * Supabase هو الذي يجب أن ينفذ السرقة فعليًا.
 */
export function getGhoulStealResult(
  ghoulRole: GameRole | string | null | undefined,
  alreadyStolen: boolean,
  firstDeadRole: GameRole | string | null | undefined,
): {
  stolen: boolean;
  role: GameRole | null;
  ability: NightAction | null;
} {
  if (
    !canGhoulStealAbility(
      ghoulRole,
      alreadyStolen,
    )
  ) {
    return {
      stolen: false,
      role: null,
      ability: null,
    };
  }

  const normalizedRole =
    normalizeGameRole(
      firstDeadRole,
    );

  if (!normalizedRole) {
    return {
      stolen: false,
      role: null,
      ability: null,
    };
  }

  const ability =
    getStealableAbility(
      normalizedRole,
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
    role: normalizedRole,
    ability,
  };
}


/* ============================================================
   PLAYER HELPERS
============================================================ */

export function findPlayer(
  state: GameState | null,
  userId: string | null | undefined,
): GamePlayer | null {
  if (
    !state ||
    !userId
  ) {
    return null;
  }

  return (
    state.players.find(
      player =>
        player.user_id ===
        userId,
    ) || null
  );
}


export function getAlivePlayers(
  state: GameState | null,
): GamePlayer[] {
  if (!state) {
    return [];
  }

  return state.players.filter(
    player =>
      player.alive === true,
  );
}


/* ============================================================
   TARGET VALIDATION
============================================================ */

export function canTargetPlayer(
  state: GameState | null,
  targetId: string | null | undefined,
  allowSelf = false,
): boolean {
  if (
    !state ||
    !targetId
  ) {
    return false;
  }

  const target =
    state.players.find(
      player =>
        player.user_id ===
        targetId,
    );

  if (!target) {
    return false;
  }

  if (!target.alive) {
    return false;
  }

  const myUserId =
    state.me?.user_id;

  if (
    !allowSelf &&
    myUserId &&
    target.user_id ===
      myUserId
  ) {
    return false;
  }

  return true;
}


/* ============================================================
   ROLE ABILITY VALIDATION
============================================================ */

export function canUseNightAction(
  role: GameRole | string | null | undefined,
  action: NightAction,
): boolean {
  const expected =
    getRoleNightAction(role);

  return expected === action;
}


/* ============================================================
   PHASE HELPERS
============================================================ */

export function isNightPhase(
  phase: string | null | undefined,
): boolean {
  return (
    phase === 'night'
  );
}


export function isDayPhase(
  phase: string | null | undefined,
): boolean {
  return (
    phase === 'day'
  );
}


export function isFinishedPhase(
  phase: string | null | undefined,
): boolean {
  return (
    phase === 'finished'
  );
}


/* ============================================================
   GAME WINNER
============================================================ */

export function getWinnerLabel(
  winner:
    | GameTeam
    | string
    | null
    | undefined,
): string {
  switch (winner) {
    case 'CITIZENS':
      return 'المواطنون';

    case 'MAFIA':
      return 'المافيا';

    case 'CULT':
      return 'الطائفة';

    default:
      return winner || 'غير معروف';
  }
}


/* ============================================================
   NORMALIZE GAME STATE
============================================================ */

export function normalizeGameState(
  input: any,
): GameState {
  const state =
    (input || {}) as any;

  const room =
    (state.room || {}) as any;

  const players =
    Array.isArray(
      state.players,
    )
      ? state.players
      : [];

  const normalizedPlayers =
    players.map(
      (player: any) => ({
        ...player,

        id:
          String(
            player.id ||
              player.user_id ||
              '',
          ),

        user_id:
          String(
            player.user_id ||
              player.id ||
              '',
          ),

        name:
          String(
            player.name ||
              'Player',
          ),

        alive:
          player.alive !== false,

        avatar_url:
          player.avatar_url ||
          null,

        role:
          player.role ||
          null,
      }),
    );

  let me =
    state.me ||
    null;

  let myPlayerId =
    state.my_player_id ||
    null;

  if (
    !myPlayerId &&
    me?.id
  ) {
    myPlayerId =
      me.id;
  }

  if (
    !me &&
    myPlayerId
  ) {
    const player =
      normalizedPlayers.find(
        (item: GamePlayer) =>
          item.id ===
          myPlayerId,
      );

    if (player) {
      me = {
        ...player,
      };
    }
  }

  return {
    ...state,

    room: {
      ...room,

      id:
        String(
          room.id || '',
        ),

      code:
        String(
          room.code || '',
        ),

      status:
        String(
          room.status ||
            'waiting',
        ),

      game_round:
        Number(
          room.game_round ||
            0,
        ),

      game_phase:
        room.game_phase ||
        'waiting',

      winner:
        room.winner ||
        null,

      phase_ends_at:
        room.phase_ends_at ||
        null,

      last_event:
        room.last_event ||
        null,
    },

    players:
      normalizedPlayers,

    me,

    my_player_id:
      myPlayerId,
  };
}
