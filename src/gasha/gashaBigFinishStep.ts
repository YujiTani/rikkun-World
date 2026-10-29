/**
 * #308 gashaBig.ts を 分けた もの: とどめの あと(FIX-BRIEF-2 §5)の 世界との つなぎ。一撃 → 倒れる → 赤い コア → たたくと ばらまく → こわすと くずれて 消える。
 * 場面の 進み方は gashaBigFinish.ts、くずれる かけらは gashaBigCrumbleFx.ts。
 */
import type { Vector3 } from 'three';
import type { BigActor } from './gashaBigActor';
import type { BigModel, JointName } from './gashaBigTypes';
import type { GashaBigDeps } from './gashaBigDeps';
import type { BigHit } from './gashaBigHit';
import type { BigSfx } from './gashaBigSfx';
import type { CoreThrow } from './gashaBigCoreThrow';
import { FinishSeq, type FinishEvent, type FinishPhase } from './gashaBigFinish';
import { CRUMBLE_ORDER, CrumbleFx, crumbleSchedule } from './gashaBigCrumbleFx';
import { TUNE as T } from './gashaBigTuning';

export interface FinishEnv {
  actor(): BigActor | null;
  model(): BigModel | null;
  /** 体の 中心の 地面の 位置 */
  pos(): Vector3;
  hit: Pick<BigHit, 'setFinish' | 'setCoreReach' | 'burst' | 'setExtra' | 'last'>;
  sfx: Pick<BigSfx, 'crumble' | 'finishBlow'>;
  core: Pick<CoreThrow, 'knock'>;
  /** 怒りの 印を 立てる / 下ろす */
  setAngry(on: boolean): void;
  /** 攻撃の エフェクトを ぜんぶ 止める（体の 焼け あとは のこす） */
  clearFx(): void;
  /** 怒りの BGM を 止める 頼み */
  stopBgm(): void;
  deps: Pick<GashaBigDeps, 'scene' | 'player' | 'hitStop' | 'shake' | 'setPlayerVelocity' | 'onCoreHit' | 'onCoreBroken' | 'onVanished'>;
}

export interface FinishStep {
  /** いまの 場面('off' = とどめの 前) */
  phase(): FinishPhase;
  /** コアを たたいた(BigHit から)。数えて よければ true */
  coreStruck(at: { x: number; y: number; z: number } | null): boolean;
  /** コアの 場所（なければ 体の 少し 上） */
  coreCenter(): { x: number; y: number; z: number };
  /** とどめの 一撃(体力が 0 に なった しゅんかん): その場で 固めて、ヒットストップ・遠くへ はじく・画面の ゆれ・SE */
  start(): void;
  step(dt: number): void;
  /** 最初の 状態に もどす（体を 作りなおす・片づける とき） */
  reset(): void;
  /** テスト・デバッグ用の 様子 */
  info(): { phase: string; coreHp: number; coreMax: number; fallK: number; redK: number; crumbleK: number; chunks: number };
}

export function createFinishStep(env: FinishEnv): FinishStep {
  const { deps, sfx, hit: bh } = env;
  const fin = new FinishSeq();
  let crumbleFx: CrumbleFx | null = null;
  let crumbleSched: { joint: JointName; at: number }[] = [];
  let crumbleNext = 0;
  let finClock = 0;
  const coreCenter = (): { x: number; y: number; z: number } => {
    const actor = env.actor(), pos = env.pos();
    const i = actor ? actor.boxList.findIndex((b) => b.name === 'core') : -1;
    const b = i >= 0 ? actor!.boxList[i] : undefined;
    return b ? { x: b.c[0]!, y: b.c[1]!, z: b.c[2]! } : { x: pos.x, y: pos.y + 10, z: pos.z };
  };
  const onFinishEvent = (e: FinishEvent): void => {
    if (!env.actor()) return;
    if (e.kind === 'lie') {
      bh.setFinish('core'); bh.setCoreReach(T.finish.core.reach);
    } else if (e.kind === 'coreHit') {
      const c = coreCenter();
      bh.burst(c, 3, 0xff6a40);
      deps.onCoreHit?.({ ...c, n: e.n, left: e.left });
    } else if (e.kind === 'crumble') {
      const c = coreCenter();
      bh.setFinish('lock'); bh.setCoreReach(0);
      sfx.crumble();
      bh.burst(c, 6, 0xff6a40);
      crumbleSched = crumbleSchedule(); crumbleNext = 0;
      deps.onCoreBroken?.(c);
    } else if (e.kind === 'gone') {
      const model = env.model();
      if (model) model.group.visible = false;
      crumbleFx?.clear();
      deps.onVanished?.();
    }
  };
  const coreStruck = (at: { x: number; y: number; z: number } | null): boolean => {
    const r = fin.hitCore();
    for (const e of r.events) onFinishEvent(e);
    void at;
    return r.accepted;
  };
  const start = (): void => {
    const actor = env.actor();
    if (!actor || fin.phase !== 'off') return;
    for (const e of fin.begin()) void e;
    actor.lock(); env.setAngry(false);
    bh.setFinish('lock'); bh.setExtra(null);
    env.clearFx();
    const F = T.finish.blow;
    const at = bh.last?.at ?? coreCenter();
    bh.burst(at, F.sparkMul);
    sfx.finishBlow();
    deps.hitStop?.(F.hitStopTicks);
    deps.shake?.(F.shake);
    const p = deps.player(), pos = env.pos();
    const dx = p.x - pos.x, dz = p.z - pos.z, d = Math.hypot(dx, dz);
    if (d <= F.knockRange && deps.setPlayerVelocity) {
      const n = d > 1e-3 ? 1 / d : 0;
      env.core.knock(d > 1e-3 ? dx * n : 0, d > 1e-3 ? dz * n : 1, F.knockSpeed, F.knockSec);
      deps.setPlayerVelocity({ x: 0, y: F.knockUp, z: 0 });
    }
    env.stopBgm();
  };
  /** 関節 1 つを はがす(見た目を 消し、当たりを はずし、かけらを とび散らす) */
  const crumbleJoint = (j: JointName): void => {
    const actor = env.actor(), model = env.model();
    if (!actor || !model) return;
    if (!crumbleFx) crumbleFx = new CrumbleFx(deps.scene);
    const mine = actor.boxList.filter((_, i) => actor.jointOfBox(i) === j);
    const each = Math.max(1, Math.round(T.finish.crumble.chunks / CRUMBLE_ORDER.length / Math.max(1, mine.length)));
    for (const b of mine) crumbleFx.burst({ x: b.c[0]!, y: b.c[1]!, z: b.c[2]! }, each, Math.min(3, Math.max(0.5, Math.min(b.half[0]!, b.half[1]!, b.half[2]!))), 1);
    model.joints[j].visible = false;
    actor.hideJoint(j);
  };
  const step = (dt: number): void => {
    if (fin.phase === 'off') return;
    finClock += dt;
    for (const e of fin.update(dt)) onFinishEvent(e);
    const actor = env.actor(), model = env.model(); // くずれて 消えた 合図で 呼んだ 側が despawn() した あとは どちらも null
    if (!actor || !model) return;
    const F = T.finish, ph = fin.phase;
    if (ph === 'fall' || ph === 'lie' || ph === 'crumble' || ph === 'gone') {
      const k = fin.fallK;
      const sink = F.fall.sinkBlocks * k + (ph === 'crumble' || ph === 'gone' ? F.crumble.sinkBlocks * fin.crumbleK : 0);
      actor.setTilt(F.fall.rollDeg * (Math.PI / 180) * k, F.fall.pitchDeg * (Math.PI / 180) * k, F.fall.pivotY, sink);
    }
    if (ph === 'lie' || ph === 'crumble') model.setCoreRed(fin.redK, 0.5 + 0.5 * Math.sin(finClock * F.core.pulseHz * Math.PI * 2));
    if (ph === 'crumble') {
      const k = fin.crumbleK;
      while (crumbleNext < crumbleSched.length && crumbleSched[crumbleNext]!.at <= k) {
        const j = crumbleSched[crumbleNext++]!.joint;
        crumbleJoint(j);
      }
    }
    crumbleFx?.update(dt);
  };
  const reset = (): void => {
    fin.cancel(); finClock = 0; crumbleNext = 0; crumbleSched = [];
    crumbleFx?.clear();
    bh.setFinish('off'); bh.setCoreReach(0);
  };
  return {
    phase: () => fin.phase, coreStruck, coreCenter, start, step, reset,
    info: () => ({ phase: fin.phase, coreHp: fin.coreHp, coreMax: fin.coreMax, fallK: fin.fallK, redK: fin.redK, crumbleK: fin.crumbleK, chunks: crumbleFx?.alive() ?? 0 }),
  };
}
