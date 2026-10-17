import type {
  ArrowInfo,
  BowDeps,
  BowEvent,
  BowPose,
  BowStage,
  BowState,
  BowStepContext,
  BowSystem,
  PlayerMotionMod,
  StuckArrowInfo,
  Vec3,
} from '../../contracts';
import { raycastBlocks } from '../../dig/raycast';
import { cellInWall } from '../../world/wall';

/** WEAPON-2 §4.4（弓）。段・放物線・当たり・ささった や と 拾う。更新は固定ステップ（1/60 秒）。乱数は使わない */

const DT = 1 / 60;
const MAX_QUEUE = 256;
/** や の 出る 位置 は E + 0.3·d */
const MUZZLE = 0.3;
/** 段 0 の いちばん 引いた 時 の 値（§3.3 の 表: つる 0 → 25%・まがり 0 → 5°） */
const STAGE0_PULL = 0.25;
const STAGE0_BEND = 5;
/** 段 3 の ふるえ（±0.5°、5F で 1 往復） */
const TREMBLE_DEG = 0.5;
const TREMBLE_PERIOD = 5;

export interface BowDepsX extends BowDeps {
  /** 出来事が 起きた とき すぐ 呼ぶ（ToolSystemImpl が 人形の 動きと テストの 窓口に 使う） */
  onEvent?: (e: BowEvent) => void;
}

/** 飛んでいる や（`stage` は 当たったときの ダメージ用。窓口では 出さない） */
type Arrow = ArrowInfo & { stage: 1 | 2 | 3 };

export function stageOf(drawTicks: number, stageTicks: readonly number[]): BowStage {
  if (drawTicks >= stageTicks[2]!) return 3;
  if (drawTicks >= stageTicks[1]!) return 2;
  if (drawTicks >= stageTicks[0]!) return 1;
  return 0;
}

export function createBowSystem(deps: BowDepsX): BowSystem {
  const s = deps.settings;

  let drawing = false;
  let drawTicks = 0;
  let stage: BowStage = 0;
  let nockLeft = 0;

  const flying: Arrow[] = [];
  const stuck: StuckArrowInfo[] = [];
  let nextId = 1;

  const lastPos: Vec3 = { x: 0, y: 0, z: 0 };
  const pose: BowPose = { stage: 0, pull: 0, bendDeg: 0 };
  const motionMod: PlayerMotionMod = { speedMul: 1, jumpLocked: false };

  let drainQueue: BowEvent[] = [];
  const peekQueue: BowEvent[] = [];

  // 毎ステップ 使う 入れ物（new しない）
  const origin: Vec3 = { x: 0, y: 0, z: 0 };
  const rayDir: Vec3 = { x: 0, y: 0, z: 0 };

  function emit(e: BowEvent): void {
    drainQueue.push(e);
    peekQueue.push(e);
    if (drainQueue.length > MAX_QUEUE) drainQueue.shift();
    if (peekQueue.length > MAX_QUEUE) peekQueue.shift();
    deps.onEvent?.(e);
  }

  // ---------------------------------------------------------- しなり

  function updatePose(): void {
    if (!drawing) {
      pose.stage = 0;
      pose.pull = 0;
      pose.bendDeg = 0;
      return;
    }
    const st = s.bowStageTicks;
    const bend = s.bowBend;
    pose.stage = stage;
    if (stage === 0) {
      const r = Math.min(1, drawTicks / st[0]);
      pose.pull = STAGE0_PULL * r;
      pose.bendDeg = STAGE0_BEND * r;
      return;
    }
    const i = stage - 1;
    const fromPull = stage === 1 ? STAGE0_PULL : bend.pull[i - 1]!;
    const fromBend = stage === 1 ? STAGE0_BEND : bend.bendDeg[i - 1]!;
    const blend = Math.max(1, bend.blendTicks);
    const t = Math.min(1, (drawTicks - st[i]!) / blend);
    pose.pull = fromPull + (bend.pull[i]! - fromPull) * t;
    pose.bendDeg = fromBend + (bend.bendDeg[i]! - fromBend) * t;
    if (stage === 3) {
      pose.bendDeg += TREMBLE_DEG * Math.sin(((drawTicks - st[2]!) / TREMBLE_PERIOD) * Math.PI * 2);
    }
  }

  function stopDrawing(): void {
    drawing = false;
    drawTicks = 0;
    stage = 0;
  }

  // ---------------------------------------------------------- うつ

  function shoot(ctx: BowStepContext, st: 1 | 2 | 3): void {
    if (deps.inventory.remove('ya', 1) < 1) {
      emit({ type: 'noArrow', tick: deps.tick() });
      return;
    }
    const speed = s.bowSpeed[st - 1]!;
    const len = Math.hypot(ctx.dir.x, ctx.dir.y, ctx.dir.z) || 1;
    const dx = ctx.dir.x / len;
    const dy = ctx.dir.y / len;
    const dz = ctx.dir.z / len;
    const info: Arrow = {
      id: nextId++,
      position: { x: ctx.eye.x + dx * MUZZLE, y: ctx.eye.y + dy * MUZZLE, z: ctx.eye.z + dz * MUZZLE },
      velocity: { x: dx * speed, y: dy * speed, z: dz * speed },
      age: 0,
      stage: st,
    };
    flying.push(info);
    nockLeft = s.bowNockTicks;
    emit({
      type: 'arrowShot',
      tick: deps.tick(),
      stage: st,
      speed,
      position: { ...info.position },
      velocity: { ...info.velocity },
    });
    deps.onShot();
  }

  // ---------------------------------------------------------- 飛んでいる や

  function stepArrows(): void {
    if (flying.length === 0) return;
    const yokai = deps.yokai();
    let w = 0;
    for (let i = 0; i < flying.length; i++) {
      const a = flying[i]!;
      const p = a.position;
      const v = a.velocity;
      a.age++;
      // 先に 速度、次に 位置
      v.y -= s.arrowGravity * DT;
      const mx = v.x * DT;
      const my = v.y * DT;
      const mz = v.z * DT;
      const L = Math.hypot(mx, my, mz);
      let alive = true;
      if (L > 0) {
        rayDir.x = mx / L;
        rayDir.y = my / L;
        rayDir.z = mz / L;
        const blk = raycastBlocks(deps.world, p.x, p.y, p.z, rayDir.x, rayDir.y, rayDir.z, L, true);
        origin.x = p.x;
        origin.y = p.y;
        origin.z = p.z;
        const yh = yokai.raycast(origin, rayDir, L);
        if (yh && (!blk || yh.distance < blk.distance)) {
          const hit = { x: p.x + rayDir.x * yh.distance, y: p.y + rayDir.y * yh.distance, z: p.z + rayDir.z * yh.distance };
          const st = a.stage;
          const dmg = s.bowDamage[st - 1]!;
          yokai.damage(yh.id, dmg, { ...lastPos }, { dist: s.bowKnock[st - 1]!, up: 0 });
          emit({ type: 'arrowHit', tick: deps.tick(), yokaiId: yh.id, damage: dmg, position: hit });
          alive = false;
        } else if (blk) {
          const hit = { x: p.x + rayDir.x * blk.distance, y: p.y + rayDir.y * blk.distance, z: p.z + rayDir.z * blk.distance };
          stuck.push({ id: a.id, position: hit, dir: { x: rayDir.x, y: rayDir.y, z: rayDir.z }, age: 0 });
          while (stuck.length > s.arrowStuckMax) stuck.shift();
          emit({ type: 'arrowStick', tick: deps.tick(), position: { ...hit } });
          alive = false;
        } else {
          p.x += mx;
          p.y += my;
          p.z += mz;
          // 世界の 外（上へ 出ても x・z が 中なら 落ちて くるまで 待つ）
          if (!deps.world.isLoaded(p.x, p.z) || !cellInWall(Math.floor(p.x), Math.floor(p.z)) || p.y < 0 || a.age >= s.arrowLifeTicks) {
            emit({ type: 'arrowEnd', tick: deps.tick(), position: { ...p } });
            alive = false;
          }
        }
      }
      if (alive) flying[w++] = a;
    }
    flying.length = w;
  }

  // ---------------------------------------------------------- ささった や

  function stepStuck(ctx: BowStepContext): void {
    if (stuck.length === 0) return;
    const [rh, rv] = s.arrowPickupRange;
    const px = ctx.position.x;
    const py = ctx.position.y;
    const pz = ctx.position.z;
    let w = 0;
    for (let i = 0; i < stuck.length; i++) {
      const a = stuck[i]!;
      a.age++;
      if (a.age >= s.arrowStuckTicks) continue;
      const q = a.position;
      const near = Math.hypot(q.x - px, q.z - pz) <= rh && q.y >= py - 0.5 && q.y <= py + rv;
      if (near && deps.inventory.canAdd?.('ya') !== false && deps.inventory.add('ya', 1) === 0) {
        emit({ type: 'pickup', tick: deps.tick() });
        continue;
      }
      stuck[w++] = a;
    }
    stuck.length = w;
  }

  // ---------------------------------------------------------- 毎ステップ

  function update(ctx: BowStepContext): void {
    lastPos.x = ctx.position.x;
    lastPos.y = ctx.position.y;
    lastPos.z = ctx.position.z;

    if (nockLeft > 0) nockLeft--;
    stepStuck(ctx);
    stepArrows();

    const usable = ctx.item !== null && ctx.active;
    if (!usable) {
      // 持ちかえた・やられた: ひくのを やめる（や は へらない）
      if (drawing) stopDrawing();
    } else if (drawing && !ctx.held) {
      // はなした
      const st = stage;
      stopDrawing();
      if (st === 0) emit({ type: 'dryRelease', tick: deps.tick() });
      else if (deps.inventory.count('ya') <= 0) emit({ type: 'noArrow', tick: deps.tick() });
      else shoot(ctx, st as 1 | 2 | 3);
    } else if (drawing) {
      drawTicks++;
      const ns = stageOf(drawTicks, s.bowStageTicks);
      if (ns > stage) {
        stage = ns;
        emit({ type: 'stage', tick: deps.tick(), stage: ns as 1 | 2 | 3 });
      }
    }

    if (usable && !drawing && ctx.pressed && ctx.held && nockLeft === 0) {
      if (deps.inventory.count('ya') <= 0) {
        emit({ type: 'noArrow', tick: deps.tick() });
      } else {
        drawing = true;
        drawTicks = 1;
        stage = stageOf(1, s.bowStageTicks);
        emit({ type: 'drawStart', tick: deps.tick() });
      }
    }

    motionMod.speedMul = drawing ? s.bowMoveMul : 1;
    updatePose();
  }

  return {
    state(): BowState {
      return { drawing, drawTicks, stage, nockLeft };
    },
    /** 毎回 同じ 入れ物を 返す（読むだけ。次の update まで 有効） */
    pose(): BowPose {
      return pose;
    },
    update,
    /** 飛んでいる や（中身は 毎ステップ 書きかわる。読むだけ） */
    arrows(): ArrowInfo[] {
      return flying;
    },
    stuck(): StuckArrowInfo[] {
      return stuck;
    },
    motion(): PlayerMotionMod {
      return motionMod;
    },
    drainEvents(): BowEvent[] {
      const out = drainQueue;
      drainQueue = [];
      return out;
    },
    peekEvents(): BowEvent[] {
      return peekQueue;
    },
  };
}
