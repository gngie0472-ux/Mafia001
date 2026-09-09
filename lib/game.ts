import { supabase } from './supabase';

/* ============================================================
   TYPES
============================================================ */

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
  | 'MAFIA'
  | 'GODFATHER'
  | 'CONSIGLIERE'
  | 'CULT_LEADER'
  | 'CULTIST';

export type NightAction =
  | 'kill'
  | 'protect'
  | 'investigate'
  | 'cult_convert';

export type GamePlayer = {
  id: string;
  user_id: string;
  name: string;
  avatar_url?: string | null;
  alive: boolean;
  role?: GameRole | string | null;
  ready?: boolean;
  created_at?: string | null;
};

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

export type GameState = {
  room: GameRoom;
  players: GamePlayer[];
  me?: CurrentGamePlayer | null;
  my_player_id?: string | null;
  [key: string]: unknown;
};

export type MyRole = {
  role: GameRole;
  alive: boolean;
  team?: GameTeam;
  ghoul_ability_stolen?: boolean;
  stolen_role?: GameRole | null;
  stolen_ability?: NightAction | null;
};

/* ============================================================
   ERROR HELPERS
============================================================ */

function errorMessage(
  error: any,
  fallback: string,
): string {
  if (!error) return fallback;

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

function isUuid(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value.trim(),
  );
}

function requireTargetId(
  targetId: string,
): string {
  const value =
    String(targetId ?? '').trim();

  if (!value) {
    throw new Error(
      'يجب اختيار لاعب أولاً.',
    );
  }

  return value;
}

/* ============================================================
   ROLE NORMALIZATION
============================================================ */

export function normalizeGameRole(
  value: unknown,
): GameRole | null {
  if (typeof value !== 'string') {
    return null;
  }

  switch (
    value.trim().toUpperCase()
  ) {
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
  role:
    | GameRole
    | string
    | null
    | undefined,
): GameTeam | null {
  const normalized =
    normalizeGameRole(role);

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

export function isCitizenTeam(
  role:
    | GameRole
    | string
    | null
    | undefined,
): boolean {
  return (
    getRoleTeam(role) ===
    'CITIZENS'
  );
}

export function isMafiaTeam(
  role:
    | GameRole
    | string
    | null
    | undefined,
): boolean {
  return (
    getRoleTeam(role) ===
    'MAFIA'
  );
}

export function isCultTeam(
  role:
    | GameRole
    | string
    | null
    | undefined,
): boolean {
  return (
    getRoleTeam(role) ===
    'CULT'
  );
}

/* ============================================================
   ROLE ACTION
============================================================ */

export function getRoleNightAction(
  role:
    | GameRole
    | string
    | null
    | undefined,
): NightAction | null {
  const normalized =
    normalizeGameRole(role);

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

    case 'GODFATHER':
    case 'CITIZEN':
    case 'GHOUL':
    case 'CULTIST':
    default:
      return null;
  }
}

/* ============================================================
   ROLE DESCRIPTION
============================================================ */

export function getRoleDescription(
  role:
    | GameRole
    | string
    | null
    | undefined,
): string {
  switch (
    normalizeGameRole(role)
  ) {
    case 'CITIZEN':
      return 'مواطن عادي. لا تملك قدرة ليلية. مهمتك اكتشاف الأعداء عن طريق النقاش والتصويت.';

    case 'DOCTOR':
      return 'الطبيب. يمكنك حماية لاعب واحد كل ليلة من محاولة القتل.';

    case 'DETECTIVE':
      return 'المحقق. يمكنك فحص لاعب واحد كل ليلة لمعرفة الفريق الذي ينتمي إليه.';

    case 'GHOUL':
      return 'الغول. أنت من فريق المواطنين. عند موت أول لاعب في اللعبة، تحصل تلقائيًا على قدرته مرة واحدة فقط إذا كانت قابلة للسرقة.';

    case 'MAFIA':
      return 'عضو المافيا. تشارك في اختيار هدف القتل خلال الليل.';

    case 'GODFATHER':
      return 'عرّاب المافيا. قائد فريق المافيا وتحدد قدراته قواعد الخادم.';

    case 'CONSIGLIERE':
      return 'المستشار. يمكنك التحقيق مع لاعب لمعرفة دوره الدقيق.';

    case 'CULT_LEADER':
      return 'زعيم الطائفة. يمكنك تحويل لاعب مناسب إلى فريق الطائفة.';

    case 'CULTIST':
      return 'عضو في الطائفة. تنتمي إلى فريق الطائفة ولا تملك قدرة ليلية مستقلة.';

    default:
      return 'دور غير معروف.';
  }
}

/* ============================================================
   ROLE LABEL
============================================================ */

export function getRoleLabel(
  role:
    | GameRole
    | string
    | null
    | undefined,
): string {
  switch (
    normalizeGameRole(role)
  ) {
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
   ROOM RESOLUTION
============================================================ */

export async function resolveRoomId(
  roomValue: string,
): Promise<string> {
  const value =
    String(roomValue ?? '').trim();

  if (!value) {
    throw new Error(
      'رمز الغرفة غير موجود.',
    );
  }

  if (isUuid(value)) {
    return value;
  }

  const code =
    value.toUpperCase();

  const {
    data,
    error,
  } = await supabase
    .from('rooms')
    .select('id,code')
    .eq('code', code)
    .maybeSingle();

  if (error) {
    throw new Error(
      errorMessage(
        error,
        'تعذر العثور على الغرفة.',
      ),
    );
  }

  if (
    !data?.id ||
    !isUuid(data.id)
  ) {
    throw new Error(
      'الغرفة غير موجودة أو لم تعد متاحة.',
    );
  }

  return data.id;
}

/* ============================================================
   TARGET RESOLUTION
============================================================ */

/**
 * يقبل:
 *
 * room_players.id
 * أو
 * room_players.user_id
 *
 * ويعيد الاثنين بعد التحقق
 * من أن اللاعب موجود داخل الغرفة.
 */
async function resolveTarget(
  roomId: string,
  targetId: string,
): Promise<{
  id: string;
  user_id: string;
}> {
  const room =
    await resolveRoomId(roomId);

  const target =
    requireTargetId(targetId);

  if (!isUuid(target)) {
    throw new Error(
      'معرف اللاعب المستهدف غير صالح.',
    );
  }

  const byId =
    await supabase
      .from('room_players')
      .select('id,user_id')
      .eq('room_id', room)
      .eq('id', target)
      .maybeSingle();

  if (
    !byId.error &&
    byId.data &&
    isUuid(byId.data.id) &&
    isUuid(byId.data.user_id)
  ) {
    return {
      id: byId.data.id,
      user_id: byId.data.user_id,
    };
  }

  const byUser =
    await supabase
      .from('room_players')
      .select('id,user_id')
      .eq('room_id', room)
      .eq('user_id', target)
      .maybeSingle();

  if (
    !byUser.error &&
    byUser.data &&
    isUuid(byUser.data.id) &&
    isUuid(byUser.data.user_id)
  ) {
    return {
      id: byUser.data.id,
      user_id: byUser.data.user_id,
    };
  }

  throw new Error(
    'اللاعب المستهدف غير موجود في هذه الغرفة.',
  );
}

/* ============================================================
   TARGET RPC
============================================================ */

type TargetRpcName =
  | 'mafia_submit_vote'
  | 'mafia_submit_action';

/**
 * ينفذ RPC مع player id أولاً،
 * ثم user_id عند الحاجة.
 *
 * مهم:
 * لا يتم إرسال room code
 * أو target code إلى RPC.
 */
async function callTargetRpc(
  rpcName: TargetRpcName,
  roomId: string,
  targetId: string,
  extra: Record<string, unknown> = {},
) {
  const room =
    await resolveRoomId(roomId);

  const target =
    await resolveTarget(
      room,
      targetId,
    );

  const first =
    await supabase.rpc(
      rpcName,
      {
        p_room_id: room,
        p_target_id: target.id,
        ...extra,
      },
    );

  if (!first.error) {
    return first.data;
  }

  /*
   * إذا كان الـRPC يتوقع user_id
   * بدلاً من room_players.id.
   */
  if (
    target.user_id !== target.id
  ) {
    const second =
      await supabase.rpc(
        rpcName,
        {
          p_room_id: room,
          p_target_id:
            target.user_id,
          ...extra,
        },
      );

    if (!second.error) {
      return second.data;
    }

    throw new Error(
      errorMessage(
        second.error,
        errorMessage(
          first.error,
          'تعذر تنفيذ العملية.',
        ),
      ),
    );
  }

  throw new Error(
    errorMessage(
      first.error,
      'تعذر تنفيذ العملية.',
    ),
  );
}

/* ============================================================
   GET GAME STATE
============================================================ */

export async function getGameState(
  roomId: string,
): Promise<GameState> {
  const id =
    await resolveRoomId(roomId);

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

  const raw: any =
    data ?? {};

  const players =
    Array.isArray(raw.players)
      ? raw.players
      : [];

  let me =
    raw.me ??
    raw.current_player ??
    null;

  let myPlayerId =
    raw.my_player_id ??
    me?.id ??
    null;

  /*
   * إذا أعاد RPC user_id فقط،
   * نحاول العثور على room_players.id.
   */
  if (
    !myPlayerId &&
    me?.user_id
  ) {
    const found =
      players.find(
        (player: GamePlayer) =>
          player.user_id ===
          me.user_id,
      );

    if (found) {
      myPlayerId =
        found.id;
    }
  }

  /*
   * إذا كان لدينا id فقط
   * ولم يوجد me، نبحث عنه.
   */
  if (
    !me &&
    myPlayerId
  ) {
    const found =
      players.find(
        (player: GamePlayer) =>
          player.id ===
          myPlayerId ||
          player.user_id ===
          myPlayerId,
      );

    if (found) {
      me = found;
    }
  }

  return {
    ...raw,
    room: raw.room,
    players,
    me,
    my_player_id:
      myPlayerId,
  } as GameState;
}

/* ============================================================
   GET MY ROLE
============================================================ */

export async function getMyRole(
  roomId: string,
): Promise<MyRole> {
  const id =
    await resolveRoomId(roomId);

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
    throw new Error(
      errorMessage(
        error,
        'تعذر تحميل دورك.',
      ),
    );
  }

  const raw: any =
    data ?? {};

  const role =
    normalizeGameRole(
      raw.role ??
        raw.my_role ??
        raw.player_role,
    );

  if (!role) {
    throw new Error(
      'لم يتم توزيع دورك بعد.',
    );
  }

  return {
    role,
    alive:
      raw.alive !== false,
    team:
      getRoleTeam(role) ??
      raw.team ??
      undefined,
    ghoul_ability_stolen:
      Boolean(
        raw.ghoul_ability_stolen ??
          raw.ability_stolen ??
          false,
      ),
    stolen_role:
      normalizeGameRole(
        raw.stolen_role,
      ),
    stolen_ability:
      raw.stolen_ability ??
      null,
  };
}

/* ============================================================
   START GAME
============================================================ */

export async function startMafiaGame(
  roomId: string,
) {
  const id =
    await resolveRoomId(roomId);

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
) {
  const id =
    await resolveRoomId(roomId);

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
   NIGHT ACTION
============================================================ */

export async function submitNightAction(
  roomId: string,
  action: NightAction,
  targetId: string,
) {
  if (!action) {
    throw new Error(
      'القدرة غير محددة.',
    );
  }

  return callTargetRpc(
    'mafia_submit_action',
    roomId,
    targetId,
    {
      p_action: action,
    },
  );
}

/* ============================================================
   DAY VOTE
============================================================ */

export async function submitDayVote(
  roomId: string,
  targetId: string,
) {
  return callTargetRpc(
    'mafia_submit_vote',
    roomId,
    targetId,
  );
}

/* ============================================================
   GHOUL
============================================================ */

export function canGhoulStealAbility(
  role:
    | GameRole
    | string
    | null
    | undefined,
): boolean {
  const normalized =
    normalizeGameRole(role);

  return (
    normalized === 'DOCTOR' ||
    normalized === 'DETECTIVE' ||
    normalized === 'MAFIA' ||
    normalized === 'CONSIGLIERE' ||
    normalized === 'CULT_LEADER'
  );
}

export function getStealableAbility(
  role:
    | GameRole
    | string
    | null
    | undefined,
): NightAction | null {
  if (
    !canGhoulStealAbility(role)
  ) {
    return null;
  }

  return getRoleNightAction(role);
}

export function getGhoulStealResult(
  role:
    | GameRole
    | string
    | null
    | undefined,
): {
  role: GameRole | null;
  ability: NightAction | null;
} {
  const normalized =
    normalizeGameRole(role);

  return {
    role: normalized,
    ability:
      getStealableAbility(
        normalized,
      ),
  };
}

/* ============================================================
   DISPLAY HELPERS
============================================================ */

export function getTeamLabel(
  team:
    | GameTeam
    | string
    | null
    | undefined,
): string {
  switch (team) {
    case 'CITIZENS':
      return 'المواطنون';

    case 'MAFIA':
      return 'المافيا';

    case 'CULT':
      return 'الطائفة';

    default:
      return 'غير معروف';
  }
}

export function getActionLabel(
  action:
    | NightAction
    | null
    | undefined,
): string {
  switch (action) {
    case 'kill':
      return 'القتل';

    case 'protect':
      return 'الحماية';

    case 'investigate':
      return 'التحقيق';

    case 'cult_convert':
      return 'التحويل';

    default:
      return 'لا توجد قدرة';
  }
}

export function getRoleAbilityLabel(
  role:
    | GameRole
    | string
    | null
    | undefined,
): string {
  return getActionLabel(
    getRoleNightAction(role),
  );
}

/* ============================================================
   PLAYER ID HELPERS
============================================================ */

/**
 * معرف آمن لاستخدامه في واجهة اللعبة.
 *
 * الأولوية لـ user_id لأنه معرف
 * حساب اللاعب، مع fallback إلى id.
 */
export function getPlayerTargetId(
  player:
    | GamePlayer
    | CurrentGamePlayer
    | null
    | undefined,
): string | null {
  if (!player) {
    return null;
  }

  if (
    player.user_id &&
    isUuid(player.user_id)
  ) {
    return player.user_id;
  }

  if (
    player.id &&
    isUuid(player.id)
  ) {
    return player.id;
  }

  return null;
}

/**
 * التحقق من أن اللاعب يملك معرفًا
 * صالحًا للإرسال إلى RPC.
 */
export function hasValidPlayerId(
  player:
    | GamePlayer
    | CurrentGamePlayer
    | null
    | undefined,
): boolean {
  return Boolean(
    getPlayerTargetId(player),
  );
}

/* ============================================================
   TARGET RULES
============================================================ */

export function canTargetPlayer(
  actor:
    | GamePlayer
    | CurrentGamePlayer
    | null
    | undefined,
  target:
    | GamePlayer
    | null
    | undefined,
): boolean {
  if (!actor || !target) {
    return false;
  }

  if (!target.alive) {
    return false;
  }

  const action =
    getRoleNightAction(
      actor.role,
    );

  if (!action) {
    return false;
  }

  if (
    actor.id &&
    target.id &&
    actor.id === target.id
  ) {
    return false;
  }

  if (
    actor.user_id &&
    target.user_id &&
    actor.user_id ===
      target.user_id
  ) {
    return false;
  }

  return true;
}

/* ============================================================
   WIN CONDITION
============================================================ */

export function calculateWinner(
  players: GamePlayer[],
): GameTeam | null {
  const alive =
    players.filter(
      player => player.alive,
    );

  const mafia =
    alive.filter(
      player =>
        getRoleTeam(
          player.role,
        ) === 'MAFIA',
    ).length;

  const cult =
    alive.filter(
      player =>
        getRoleTeam(
          player.role,
        ) === 'CULT',
    ).length;

  const citizens =
    alive.filter(
      player =>
        getRoleTeam(
          player.role,
        ) === 'CITIZENS',
    ).length;

  if (alive.length === 0) {
    return null;
  }

  if (
    mafia === 0 &&
    cult === 0
  ) {
    return 'CITIZENS';
  }

  if (
    citizens === 0 &&
    cult === 0
  ) {
    return 'MAFIA';
  }

  if (
    cult > 0 &&
    mafia === 0 &&
    citizens === 0
  ) {
    return 'CULT';
  }

  if (
    cult > 0 &&
    mafia === 0 &&
    cult >= citizens
  ) {
    return 'CULT';
  }

  if (
    mafia > 0 &&
    cult === 0 &&
    mafia >= citizens
  ) {
    return 'MAFIA';
  }

  return null;
}
