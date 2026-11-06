import { ARCH_TOOL_REST, nodPose } from './architectSpec';
import { ARCHITECT_WORK } from './build/tuning';

/**
 * 建築士さんの 骨の 角度（度）。ぶらぶら歩き・うなずき・おっとっとを 重ねて 1 つに する（docs/art/design/06-housing.md 19.5）。
 * 前 = −z。頭を 下げる・体を 前へ たおす・腕を 前へ 上げる は 骨の x 回転が −（うなずき）/＋（腕）。DOM・three なし。
 */
export interface ArchPose {
  headX: number;
  headZ: number;
  bodyX: number;
  /** 体の 上下（1/16 ブロック） */
  bodyUp: number;
  armLX: number;
  legLX: number;
  legRX: number;
  toolX: number;
  toolZ: number;
  /** 右うで（木づちを 持つ うで）の 角度（HOUSE-1C PR-2。とんかち・ばんざい）。ふだんは 0 */
  armRX: number;
  /** 体ごと かたむく 大きさ（度）と 向き（建築士さんから 見て。ラジアン。0 = 前）。おっとっと */
  lean: number;
  leanDir: number;
}

export interface ArchPoseInput {
  /** 歩幅の 位相（ラジアン）と 強さ 0〜1 */
  gait: number;
  gaitAmp: number;
  /** うなずきの コマ（0〜22。していなければ −1） */
  nod: number;
  /** おっとっとの コマ（0〜24。なければ −1）と かたむく 向き（世界。Architect.wobbleDir） */
  wobble: number;
  wobbleDir: number;
  /** 建築士さんの 向き（Architect.yaw） */
  yaw: number;
  /** 建築中の とんかちを ふる コマ（0〜ARCHITECT_WORK.hammerFrames。ふって いなければ −1・なければ ふらない） */
  hammer?: number;
  /** 完成の ばんざいの コマ（0〜ARCHITECT_WORK.cheerFrames。なければ −1） */
  cheer?: number;
}

/** 歩く: 足 ±22°（左右 反対）・左腕 ±14°（足と 反対）・体の 上下 0.5 点 */
const LEG_SWING = 22;
const ARM_SWING = 14;
const BOB = 0.5;
/** おっとっと: 体ごと かたむく 角度・よろける 片足・木づちの ゆれ */
const LEAN_MAX = 15;
const STEP_LEG = 20;
const TOOL_SWAY = 8;

const ease = (t: number): number => t * t * (3 - 2 * t);

/** おっとっと w コマ目（0〜24）の かたむき（度）: かたむく 3 → よろける 9（14 → −5）→ もどる 12（0 へ。少し 行きすぎる） */
export function wobbleLean(w: number): number {
  if (w < 0 || w >= 24) return 0;
  if (w < 3) return LEAN_MAX * ease(w / 3);
  if (w < 12) return LEAN_MAX + (-5 - LEAN_MAX) * ease((w - 3) / 9);
  const t = (w - 12) / 12;
  return -5 * (1 - ease(t)) + 2 * Math.sin(Math.PI * t) * (1 - t);
}

/** とんかち f コマ目: 右うでを 前へ 上げて（0〜8）→ 打ちおろす（8〜10 が 当たり）→ もどる。木づちは うでに ついて 上がる */
function hammerArm(f: number): number {
  const up = 130;
  if (f < 0 || f >= ARCHITECT_WORK.hammerFrames) return 0;
  if (f < 8) return up * ease(f / 8);
  if (f < ARCHITECT_WORK.hammerHitFrame) return up - (up + 10) * ease((f - 8) / (ARCHITECT_WORK.hammerHitFrame - 8));
  const t = (f - ARCHITECT_WORK.hammerHitFrame) / (ARCHITECT_WORK.hammerFrames - ARCHITECT_WORK.hammerHitFrame);
  return -10 * (1 - ease(t));
}

function hammerPose(p: ArchPose, f: number): void {
  p.armRX = hammerArm(f);
  p.toolX = ARCH_TOOL_REST.x * (1 - Math.min(1, Math.abs(p.armRX) / 60));
  p.toolZ = ARCH_TOOL_REST.z * (1 - Math.min(1, Math.abs(p.armRX) / 60));
  p.bodyX += hammerArm(f) / 130 * 6;
}

/** ばんざい f コマ目: 両うでを 上げて ぴょんぴょん */
function cheerPose(p: ArchPose, f: number): void {
  const k = ease(Math.min(1, f / 8)) * (1 - ease(Math.max(0, (f - (ARCHITECT_WORK.cheerFrames - 10)) / 10)));
  p.armRX = 165 * k;
  p.armLX = 165 * k;
  p.bodyUp += Math.abs(Math.sin(f * 0.3)) * 2.5 * k;
}

export function poseOf(s: ArchPoseInput): ArchPose {
  const swing = Math.sin(s.gait) * s.gaitAmp;
  const p: ArchPose = {
    headX: 0,
    headZ: 0,
    bodyX: 0,
    bodyUp: Math.abs(swing) * BOB,
    armLX: -swing * ARM_SWING,
    legLX: swing * LEG_SWING,
    legRX: -swing * LEG_SWING,
    toolX: ARCH_TOOL_REST.x,
    toolZ: ARCH_TOOL_REST.z,
    armRX: 0,
    lean: 0,
    leanDir: 0,
  };
  if (s.nod >= 0) {
    const n = nodPose(Math.min(s.nod, 22));
    p.headX = -n.head;
    p.headZ = n.roll;
    p.bodyX = -n.body;
    p.armLX += -n.body * 0.8;
  }
  if (s.wobble >= 0 && s.wobble < 24) {
    const w = s.wobble;
    p.lean = wobbleLean(w);
    p.leanDir = s.wobbleDir - s.yaw;
    if (w >= 3 && w <= 12) p.legLX += STEP_LEG * Math.sin((Math.PI * (w - 3)) / 9);
    if (w >= 2) p.toolZ += TOOL_SWAY * Math.sin((w - 2) * 0.9) * (1 - w / 24);
  }
  if (s.hammer !== undefined && s.hammer >= 0) hammerPose(p, s.hammer);
  if (s.cheer !== undefined && s.cheer >= 0) cheerPose(p, s.cheer);
  // −0 を 0 に そろえる（止まって いる ときの 角度を 見くらべても ずれない ように）
  for (const k of Object.keys(p) as Array<keyof ArchPose>) p[k] += 0;
  return p;
}
