/**
 * توحيد نظام الأدوار.
 * 
 * ⚠️ مهم جداً:
 * هذا الملف الآن يعتمد على lib/game.ts كمصدر واحد للحقيقة.
 * لا تضف أو تعدل أدوار هنا - غيّر في lib/game.ts فقط.
 * 
 * النقطة الوحيدة هنا: تعريف الصور (ImageSourcePropType)
 * والمستودع لا يحتفظ بصور بصيغ أخرى.
 */

import type { ImageSourcePropType } from 'react-native';
import {
  GameRole,
  getRoleDefinition,
  getAvailableRoles,
  getRoleLabel,
  getRoleDescription,
  getRoleTeam,
  getTeamLabel,
} from '../lib/game';

/**
 * تحويل GameRole من lib/game.ts إلى كائن Role
 * يحتوي على صورة وبيانات إضافية.
 */
export interface Role {
  id: GameRole;
  name: string;
  englishName: string;
  description: string;
  team: string;
  teamLabel: string;
  image?: ImageSourcePropType;
}

/**
 * خريطة الصور.
 * 
 * ✅ اسم الملف يجب أن يطابق:
 * - الدور بالحروف الصغيرة (lowercase)
 * - مع شرطة سفلية بدلاً من الفوضى
 * 
 * ❌ لا تستخدم:
 * - أرقام في البداية (01_citizen.png)
 * - مسافات أو أحرف خاصة
 * - امتدادات مكررة (.png.png)
 */
const ROLE_IMAGES: Record<GameRole, ImageSourcePropType> = {
  CITIZEN: require('../assets/roles/citizen.png'),
  DOCTOR: require('../assets/roles/doctor.png'),
  DETECTIVE: require('../assets/roles/detective.png'),
  GHOUL: require('../assets/roles/ghoul.png'),
  SPY: require('../assets/roles/spy.png'),
  BODYGUARD: require('../assets/roles/bodyguard.png'),
  SHERIFF: require('../assets/roles/sheriff_star.png'),
  WITCH: require('../assets/roles/witch.png'),
  MAFIA: require('../assets/roles/mafia.png'),
  GODFATHER: require('../assets/roles/godfather.png'),
  CONSIGLIERE: require('../assets/roles/consigliere.png'),
  CULT_LEADER: require('../assets/roles/cult_leader.png'),
  CULTIST: require('../assets/roles/cultist.png'),
};

/**
 * الحصول على كائن Role كامل.
 * يجمع بيانات من lib/game.ts والصور من هنا.
 */
export function getRoleById(roleId: GameRole | string): Role | undefined {
  const normalized = String(roleId)
    .trim()
    .toUpperCase() as GameRole;

  const definition = getRoleDefinition(normalized);
  if (!definition) {
    return undefined;
  }

  return {
    id: normalized,
    name: definition.label,
    englishName: definition.englishLabel,
    description: definition.description,
    team: definition.team,
    teamLabel: getTeamLabel(definition.team),
    image: ROLE_IMAGES[normalized],
  };
}

/**
 * الحصول على جميع الأدوار المتاحة.
 */
export function getAllRoles(): Role[] {
  return getAvailableRoles()
    .map(roleId => getRoleById(roleId))
    .filter((role): role is Role => role !== undefined);
}

/**
 * الحصول على أدوار فريق معين.
 */
export function getRolesByTeam(team: string): Role[] {
  return getAllRoles().filter(role => role.team === team);
}

/**
 * التحقق من وجود دور معين.
 */
export function isValidRole(roleId: any): roleId is GameRole {
  return getRoleById(roleId) !== undefined;
}

/**
 * نوع Alias للتوافقية مع الأكواد القديمة.
 */
export type RoleType = GameRole;

/**
 * فئة Alias للتوافقية.
 */
export const ROLES = Object.fromEntries(
  getAvailableRoles().map(roleId => {
    const role = getRoleById(roleId);
    return [roleId, role];
  }),
) as Record<GameRole, Role>;

export default {
  getRoleById,
  getAllRoles,
  getRolesByTeam,
  isValidRole,
  ROLES,
};
