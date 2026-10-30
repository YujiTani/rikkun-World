/**
 * #308 gashaBig.ts を 分けた もの: 攻撃 2「両手で 払う」の 当たり。払っている 腕の 箱に 当たったら はじき飛ばす（1 回の 払いで 1 回）。
 * 手の まえに 土ぼこり、通り道の ブロックは くだく。
 */
import type { BigActor } from './gashaBigActor';
import type { GashaBigDeps } from './gashaBigDeps';
import type { BigShock } from './gashaBigShock';
import type { ShockFx } from './gashaBigShockFx';
import { crushAt } from './gashaBigCrush';
import { armHit } from './gashaBigSweepHit';
import { TUNE as T } from './gashaBigTuning';

export interface SweepEnv {
  actor(): BigActor | null;
  shock: Pick<BigShock, 'sweepStrike'>;
  shockFx: Pick<ShockFx, 'dustAt'>;
  deps: Pick<GashaBigDeps, 'player' | 'groundY' | 'blockAt' | 'setBlockAir' | 'onCrushBlocks'>;
}

/** 毎コマ 呼ぶ 関数を 作る */
export function createSweepStep(env: SweepEnv): (dt: number) => void {
  const { deps, shock, shockFx } = env;
  const { blockAt } = deps;
  let sweepStroke = -1, sweepHitDone = false, sweepDustClock = 0;
  return (dt: number): void => {
    const actor = env.actor();
    const n = actor?.sweepNow;
    if (!actor || !n) { sweepStroke = -1; return; }
    const K = T.sweep;
    if (n.stroke !== sweepStroke) { sweepStroke = n.stroke; sweepHitDone = false; sweepDustClock = 0; }
    sweepDustClock -= dt;
    if (sweepDustClock <= 0) { sweepDustClock = K.dustEverySec; shockFx.dustAt(n.x, n.y, n.z, n.vx, n.vz, K.dustCount); }
    if (K.crushPath && blockAt && deps.setBlockAir) crushAt(n.x, n.y, n.z, { getBlock: blockAt, setAir: deps.setBlockAir, onBlocks: deps.onCrushBlocks }, { crushRadius: K.crushRadius, crushDepth: 0, crushUp: 3 });
    if (sweepHitDone) return;
    const p = deps.player();
    if (!armHit(actor.boxList, n.side, p, deps.groundY, K)) return;
    // はじく 向き: 手の 動く 向き と 体から 外へ
    const sp = Math.hypot(n.vx, n.vz) || 1, ox = p.x - actor.pos.x, oz = p.z - actor.pos.z, ol = Math.hypot(ox, oz) || 1;
    let dx = 0.75 * n.vx / sp + 0.5 * ox / ol, dz = 0.75 * n.vz / sp + 0.5 * oz / ol;
    const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
    if (shock.sweepStrike({ x: p.x, y: p.y, z: p.z }, dx, dz)) sweepHitDone = true;
  };
}
