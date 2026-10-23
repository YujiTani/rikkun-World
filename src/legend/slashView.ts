import type { Vec3 } from '../contracts';

/**
 * WEAPON-9 §5.7.1: 斬撃の 板の 絵を カメラの 向きで かえる（よこ = `side`・ねかせ = `flat`）。
 * 角度 a = 水平で 見た、わざの 向き u と「カメラから その 斬撃への 向き」との 間の 角（0〜180°）。
 * 0° = 真うしろから、90° = 真横、180° = 真正面から。出た ステップに 1 回だけ きめる（ちらつかない）。
 */
export type SlashView = 'side' | 'flat';

/** わざの 向き（北 0° から 時計まわりの 度。yawDeg と 同じ）と、カメラ → 斬撃 の 水平の ずれから 角度 a を 出す */
export function slashAngleDeg(uDeg: number, camToSlash: Pick<Vec3, 'x' | 'z'>): number {
  const ux = Math.sin((uDeg * Math.PI) / 180);
  const uz = -Math.cos((uDeg * Math.PI) / 180);
  const l = Math.hypot(camToSlash.x, camToSlash.z);
  if (l < 1e-6) return 0; // 真上・真下から: うしろと 同じ あつかい（一人称）
  const dot = (ux * camToSlash.x + uz * camToSlash.z) / l;
  return (Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI;
}

/** a ≦ 35 か a ≧ 145 → flat、55〜125 → side、その 間 → 前の 斬撃と 同じ（前が なければ side） */
export function slashViewFor(angleDeg: number, prev: SlashView | null): SlashView {
  if (angleDeg <= 35 || angleDeg >= 145) return 'flat';
  if (angleDeg >= 55 && angleDeg <= 125) return 'side';
  return prev ?? 'side';
}

/**
 * 左右の 符号: カメラから 見て 右へ 振る = 1・左へ 振る = −1（左なら 板の 絵を 左右 反転する）。
 * `slashAngleDeg` は 0〜180° で 符号が ない ので、別に 出す。
 */
export function slashSwingSign(uDeg: number, camToSlash: Pick<Vec3, 'x' | 'z'>): 1 | -1 {
  const ux = Math.sin((uDeg * Math.PI) / 180);
  const uz = -Math.cos((uDeg * Math.PI) / 180);
  const l = Math.hypot(camToSlash.x, camToSlash.z);
  if (l < 1e-6) return 1;
  // カメラの 右 = (−fz, fx)
  return (ux * -camToSlash.z + uz * camToSlash.x) / l >= 0 ? 1 : -1;
}
