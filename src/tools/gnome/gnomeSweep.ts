import type { BladeEvent, PlayerMotionMod, Vec3, VoxelWorld, YokaiWorld } from '../../contracts';
import { boxOf, inFanColumn, normDeg, wallBetween } from '../../combat/attackFacing';
import { LEGEND4_TUNING } from '../../content/items/legend4Tuning';

/**
 * LEGEND-4 ノームの斧の よこなぎ（docs/design/LEGEND-4.md §7）。刀の わざとは べつの ちいさな 状態機械。
 * 出だし F1〜12・当たり F13〜16（当たりの 判定は F13 に 1 回）・後すき F17〜46。数は LEGEND4_TUNING.gnome。
 * 向きは はじめの F1 の カメラの 向き（水平）で 固定。ふみこみ なし。
 */
const T = LEGEND4_TUNING.gnome;
const DEG = Math.PI / 180;
const TOTAL = T.startup + T.active + T.recovery;

type SweepPhase = 'idle' | 'startup' | 'active' | 'recovery';

interface SweepState {
  phase: SweepPhase;
  /** はじめた ステップを 1 とした F。idle は 0 */
  frame: number;
  /** わざの 向き（度）。ふっている 間だけ */
  dirDeg: number | null;
}

interface GnomeSweepDeps {
  world: VoxelWorld;
  yokai: () => YokaiWorld;
  tick: () => number;
  emit: (e: BladeEvent) => void;
  /** 1 体 以上 当たった（1 回の よこなぎで 1 回。つなぎ込みが たいきゅう `wearPerHit` に つなぐ） */
  onHit: (count: number) => void;
}

interface GnomeSweepCtx {
  /** false（やられた・案内画面 など）の ときは はじめない・今の よこなぎは やめる */
  active: boolean;
  /** このステップに 押した（ふりわけが よこなぎ） */
  pressed: boolean;
  /** 押しつづけ（ふりわけが よこなぎ） */
  held: boolean;
  /** 足もと */
  position: Vec3;
  /** カメラの 向き（度。0 = 北） */
  yawDeg: number;
}

interface GnomeSweep {
  update(ctx: GnomeSweepCtx): void;
  /** もちかえ など で やめる（出来事は 出さない） */
  reset(): void;
  state(): SweepState;
  motion(): PlayerMotionMod;
}

export function createGnomeSweep(d: GnomeSweepDeps): GnomeSweep {
  let frame = 0;
  let dirDeg = 0;
  const origin = { x: 0, y: 0, z: 0 };
  const body = { x: 0, y: 0, z: 0 };
  const motionOut: PlayerMotionMod = { speedMul: 1, jumpLocked: false };

  const phaseOf = (f: number): SweepPhase => (f <= 0 ? 'idle' : f <= T.startup ? 'startup' : f <= T.startup + T.active ? 'active' : 'recovery');

  function hit(): void {
    const fx = Math.sin(dirDeg * DEG);
    const fz = -Math.cos(dirDeg * DEG);
    let count = 0;
    for (const y of d.yokai().list()) {
      if (y.state === 'dying' || y.state === 'leaving') continue;
      if (!inFanColumn(origin, fx, fz, T.arcHalfDeg, T.reach, T.arcY[0], T.arcY[1], y)) continue;
      const dx = y.position.x - origin.x;
      const dz = y.position.z - origin.z;
      if (Math.hypot(dx, dz) + boxOf(y).r < T.arcMin) continue;
      if (wallBetween(d.world, body, y.position.x, y.position.y + boxOf(y).h / 2, y.position.z)) continue;
      const dealt = d.yokai().damage(y.id, T.damage, { ...origin }, { dist: T.knock[0], up: T.knock[1] });
      const shown = typeof dealt === 'number' && dealt > 0 ? dealt : T.damage;
      // 手ごたえ・音は 刀の「切り上げ」と 同じ 段（中）。見た目は 横なぎ
      d.emit({ type: 'techHit', tick: d.tick(), tech: 'kiriage', yokaiId: y.id, damage: shown, knock: T.knock[0], up: T.knock[1], position: { ...y.position }, step: 1 });
      count++;
    }
    if (count > 0) d.onHit(count);
  }

  function begin(ctx: GnomeSweepCtx): void {
    frame = 1;
    dirDeg = normDeg(ctx.yawDeg);
    origin.x = ctx.position.x;
    origin.y = ctx.position.y;
    origin.z = ctx.position.z;
    body.x = ctx.position.x;
    body.y = ctx.position.y + 1.4;
    body.z = ctx.position.z;
    d.emit({ type: 'sweepStart', tick: d.tick() });
  }

  return {
    update(ctx) {
      if (!ctx.active) {
        frame = 0;
        return;
      }
      if (frame > 0) {
        frame++;
        if (frame > TOTAL) frame = 0;
      }
      if (frame === 0 && (ctx.pressed || ctx.held)) begin(ctx);
      if (frame === T.startup + 1) hit();
    },
    reset() {
      frame = 0;
    },
    state() {
      return { phase: phaseOf(frame), frame, dirDeg: frame > 0 ? dirDeg : null };
    },
    motion() {
      motionOut.speedMul = 1;
      motionOut.jumpLocked = false;
      if (frame > 0) {
        motionOut.speedMul = T.moveMul;
        motionOut.jumpLocked = true;
      }
      return motionOut;
    },
  };
}
