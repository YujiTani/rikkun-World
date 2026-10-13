import type {
  BladeDeps,
  BladeEvent,
  BladeShapeInfo,
  BladeStance,
  BladeState,
  BladeStepContext,
  BladeSystem,
  BladeTech,
  ItemId,
  PlayerMotionMod,
  YokaiInfo,
} from '../../contracts';
import { raycastBlocks } from '../../dig/raycast';
import { KIND_AI } from '../../yokai/ai/config';

const DEG = Math.PI / 180;
const MAX_QUEUE = 256;

/** 刀（わざ・かまえが ある もの）。なぎなたは 入れない（今の パンチのまま） */
export const BLADE_ITEMS: ReadonlySet<ItemId> = new Set<ItemId>(['bokuto', 'katana', 'crystal_katana']);

export function isBladeItem(item: ItemId | null | undefined): boolean {
  return !!item && BLADE_ITEMS.has(item);
}

const TECH_OF_STANCE: Record<BladeStance, BladeTech> = { chudan: 'thrust', jodan: 'kesa', gedan: 'kiriage' };
const NEXT_STANCE: Record<BladeStance, BladeStance> = { chudan: 'jodan', jodan: 'gedan', gedan: 'chudan' };

/** 妖怪の 当たりの箱（円柱で 近づける。仕様 §4.1） */
function boxOf(y: YokaiInfo): { r: number; h: number } {
  const ai = KIND_AI[y.kind];
  return { r: ai.radius * y.scale, h: ai.height * y.scale };
}

/** 刀のしくみ（WEAPON-2 §2.1・§4.2・§4.3）。1 ステップ 1 回 `update` を呼ぶ */
export function createBladeSystem(deps: BladeDeps): BladeSystem {
  const S = deps.settings;
  let item: ItemId | null = null;
  let stance: BladeStance = 'chudan';
  let tech: BladeTech | null = null;
  let phase: BladeState['phase'] = 'idle';
  let frame = 0;
  let buffered: 'tech' | 'stance' | null = null;
  let switchFrom: BladeStance | null = null;
  let shapeInfo: BladeShapeInfo | null = null;
  let hitSet = new Set<number>();
  let hitReported = false;
  let drainQ: BladeEvent[] = [];
  const peekQ: BladeEvent[] = [];

  function emit(e: BladeEvent): void {
    drainQ.push(e);
    peekQ.push(e);
    if (drainQ.length > MAX_QUEUE) drainQ.shift();
    if (peekQ.length > MAX_QUEUE) peekQ.shift();
  }

  function totalOf(t: BladeTech): number {
    const f = S.bladeTech[t];
    return f.startup + f.active + f.recovery;
  }

  /** 先行入力を 受け始める F */
  function windowStart(): number {
    if (phase === 'switch') return 1;
    if (!tech) return 1;
    const f = S.bladeTech[tech];
    const total = totalOf(tech);
    if (f.recovery <= S.bladeBufferTicks) return f.startup + 1;
    return total - S.bladeBufferTicks + 1;
  }

  function resetIdle(): void {
    tech = null;
    phase = 'idle';
    frame = 0;
    switchFrom = null;
    shapeInfo = null;
    buffered = null;
    hitSet = new Set<number>();
  }

  function cancelAll(): void {
    if (phase !== 'idle') emit({ type: 'cancel', tick: deps.tick() });
    resetIdle();
  }

  function startStance(): void {
    const from = stance;
    stance = NEXT_STANCE[stance];
    phase = 'switch';
    tech = null;
    frame = 1;
    switchFrom = from;
    emit({ type: 'stance', tick: deps.tick(), from, to: stance });
  }

  function startTech(ctx: BladeStepContext): void {
    tech = TECH_OF_STANCE[stance];
    frame = 1;
    switchFrom = null;
    hitSet = new Set<number>();
    hitReported = false;
    emit({ type: 'techStart', tick: deps.tick(), tech });
    processFrame(ctx);
  }

  function phaseOfFrame(t: BladeTech, f: number): BladeState['phase'] {
    const c = S.bladeTech[t];
    if (f <= c.startup) return 'startup';
    if (f <= c.startup + c.active) return 'active';
    return 'recovery';
  }

  /** frame が 決まった あとの 仕事（phase・当たり・ふみこみ） */
  function processFrame(ctx: BladeStepContext): void {
    if (!tech) return;
    phase = phaseOfFrame(tech, frame);
    shapeInfo = null;
    if (phase !== 'active') return;
    const c = S.bladeTech[tech];
    const yawR = ctx.yawDeg * DEG;
    const fx = Math.sin(yawR);
    const fz = -Math.cos(yawR);
    shapeInfo = makeShape(tech, ctx, fx, fz);
    if (tech === 'thrust' && deps.lunge && c.active > 0) {
      const step = S.thrustLunge / c.active;
      deps.lunge(fx * step, fz * step);
    }
    const hits = evalHits(tech, ctx, fx, fz);
    if (hits > 0 && !hitReported) {
      hitReported = true;
      deps.onHit({ tech, count: hits });
    }
    if (hitSet.size === 0 && frame === c.startup + c.active) {
      emit({ type: 'techMiss', tick: deps.tick(), tech });
    }
  }

  function makeShape(t: BladeTech, ctx: BladeStepContext, fx: number, fz: number): BladeShapeInfo {
    if (t === 'thrust') {
      const sh = S.bladeShape.thrust;
      return {
        kind: 'capsule',
        from: { ...ctx.eye },
        to: { x: ctx.eye.x + ctx.dir.x * sh.length, y: ctx.eye.y + ctx.dir.y * sh.length, z: ctx.eye.z + ctx.dir.z * sh.length },
        radius: sh.radius,
      };
    }
    const sh = t === 'kesa' ? S.bladeShape.kesa : S.bladeShape.kiriage;
    return {
      kind: 'fan',
      center: { ...ctx.position },
      forward: { x: fx, y: 0, z: fz },
      halfAngleDeg: sh.halfAngleDeg,
      rMin: sh.rMin,
      rMax: sh.rMax,
      yMin: ctx.position.y + sh.yMin,
      yMax: ctx.position.y + sh.yMax,
    };
  }

  /** E から 箱の 中心への 線が 固いブロックに さえぎられるか */
  function blocked(ctx: BladeStepContext, cx: number, cy: number, cz: number): boolean {
    const dx = cx - ctx.eye.x;
    const dy = cy - ctx.eye.y;
    const dz = cz - ctx.eye.z;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-6) return false;
    return raycastBlocks(deps.world, ctx.eye.x, ctx.eye.y, ctx.eye.z, dx / len, dy / len, dz / len, len) !== null;
  }

  /** 扇形の 柱に 当たるか（箱は 円柱で 近づける） */
  function inFan(t: BladeTech, ctx: BladeStepContext, fx: number, fz: number, y: YokaiInfo): boolean {
    const sh = t === 'kesa' ? S.bladeShape.kesa : S.bladeShape.kiriage;
    const { r, h } = boxOf(y);
    const py = ctx.position.y;
    if (y.position.y + h < py + sh.yMin || y.position.y > py + sh.yMax) return false;
    const dx = y.position.x - ctx.position.x;
    const dz = y.position.z - ctx.position.z;
    const d = Math.hypot(dx, dz);
    // rMin 側は 自分の 体の ぶん。近い 妖怪は 当てる
    if (d > sh.rMax + r) return false;
    if (d <= r) return true;
    const cos = (dx * fx + dz * fz) / d;
    const ang = Math.acos(Math.max(-1, Math.min(1, cos)));
    const tol = Math.asin(Math.min(1, r / d));
    return ang <= sh.halfAngleDeg * DEG + tol;
  }

  /** 突きの カプセル。当たれば 線の 上の 近さ（E からの 距離）を 返す。当たらなければ -1 */
  function thrustDist(ctx: BladeStepContext, y: YokaiInfo): number {
    const sh = S.bladeShape.thrust;
    const { r, h } = boxOf(y);
    const len = sh.length;
    const ey = ctx.eye.y;
    const vy = ctx.dir.y * len;
    const lo = y.position.y - sh.radius;
    const hi = y.position.y + h + sh.radius;
    let t0 = 0;
    let t1 = 1;
    if (Math.abs(vy) < 1e-9) {
      if (ey < lo || ey > hi) return -1;
    } else {
      const a = (lo - ey) / vy;
      const b = (hi - ey) / vy;
      t0 = Math.max(t0, Math.min(a, b));
      t1 = Math.min(t1, Math.max(a, b));
      if (t0 > t1) return -1;
    }
    const vx = ctx.dir.x * len;
    const vz = ctx.dir.z * len;
    const wx = y.position.x - ctx.eye.x;
    const wz = y.position.z - ctx.eye.z;
    const vv = vx * vx + vz * vz;
    let t = vv < 1e-12 ? t0 : (wx * vx + wz * vz) / vv;
    t = Math.max(t0, Math.min(t1, t));
    const px = ctx.eye.x + vx * t - y.position.x;
    const pz = ctx.eye.z + vz * t - y.position.z;
    if (Math.hypot(px, pz) > r + sh.radius) return -1;
    return t * len;
  }

  function applyHit(t: BladeTech, ctx: BladeStepContext, y: YokaiInfo): void {
    const base = item ? deps.weaponDamage(item) : 1;
    const dmg = Math.max(1, Math.floor(base * S.bladeDamageMul[t] + 1e-9));
    const [dist, up] = S.bladeKnock[t];
    hitSet.add(y.id);
    deps.yokai().damage(y.id, dmg, { ...ctx.position }, { dist, up });
    emit({
      type: 'techHit',
      tick: deps.tick(),
      tech: t,
      yokaiId: y.id,
      damage: dmg,
      knock: dist,
      up,
      position: { ...y.position },
    });
  }

  function evalHits(t: BladeTech, ctx: BladeStepContext, fx: number, fz: number): number {
    const yw = deps.yokai();
    const list = yw.list();
    let count = 0;
    if (t === 'thrust') {
      if (hitSet.size > 0) return 0; // 1 体 だけ
      const ray = yw.raycast(ctx.eye, ctx.dir, S.bladeAimReach);
      let best: YokaiInfo | null = null;
      let bestD = Infinity;
      for (const y of list) {
        if (y.state === 'dying' || y.state === 'leaving') continue;
        let d = thrustDist(ctx, y);
        if (ray && ray.id === y.id && (d < 0 || ray.distance < d)) d = ray.distance;
        if (d < 0) continue;
        const { h } = boxOf(y);
        if (blocked(ctx, y.position.x, y.position.y + h / 2, y.position.z)) continue;
        if (d < bestD) {
          bestD = d;
          best = y;
        }
      }
      if (best) {
        applyHit(t, ctx, best);
        count = 1;
      }
      return count;
    }
    for (const y of list) {
      if (y.state === 'dying' || y.state === 'leaving') continue;
      if (hitSet.has(y.id)) continue;
      if (!inFan(t, ctx, fx, fz, y)) continue;
      const { h } = boxOf(y);
      if (blocked(ctx, y.position.x, y.position.y + h / 2, y.position.z)) continue;
      applyHit(t, ctx, y);
      count++;
    }
    return count;
  }

  function currentTotal(): number {
    if (phase === 'switch') return S.stanceSwitchTicks;
    return tech ? totalOf(tech) : 0;
  }

  const motionOut: PlayerMotionMod = { speedMul: 1, jumpLocked: false };

  return {
    state(): BladeState {
      return { item, stance, tech, phase, frame, buffered, switchFrom };
    },
    setStance(s: BladeStance): void {
      stance = s;
      if (phase === 'switch') {
        phase = 'idle';
        frame = 0;
        switchFrom = null;
      }
    },
    update(ctx: BladeStepContext): void {
      const isBlade = isBladeItem(ctx.item);
      if (!isBlade) {
        cancelAll();
        item = null;
        stance = 'chudan';
        return;
      }
      if (ctx.item !== item) {
        // 刀を えらんだ（べつの 刀に かえた）: 毎回 中段から
        cancelAll();
        item = ctx.item;
        stance = 'chudan';
      }
      if (!ctx.active) {
        cancelAll();
        return;
      }
      shapeInfo = null;

      // すすめる
      if (phase !== 'idle') {
        frame++;
        if (frame > currentTotal()) {
          tech = null;
          phase = 'idle';
          frame = 0;
          switchFrom = null;
        }
      }

      // 先行入力
      if (phase !== 'idle') {
        if (frame >= windowStart()) {
          if (ctx.stancePressed) buffered = 'stance';
          if (ctx.techPressed) buffered = 'tech';
        }
        if (phase === 'active' || phase === 'startup' || phase === 'recovery') processFrame(ctx);
        return;
      }

      // idle: 出す
      let next: 'tech' | 'stance' | null = buffered;
      if (ctx.stancePressed) next = 'stance';
      if (ctx.techPressed) next = 'tech';
      if (!next && ctx.techHeld) next = 'tech';
      buffered = null;
      if (next === 'stance') startStance();
      else if (next === 'tech') startTech(ctx);
    },
    shape(): BladeShapeInfo | null {
      return phase === 'active' ? shapeInfo : null;
    },
    motion(): PlayerMotionMod {
      motionOut.speedMul = 1;
      motionOut.jumpLocked = false;
      if (phase === 'idle' || phase === 'switch' || !tech) return motionOut;
      const m = S.bladeMoveMul;
      if (tech === 'thrust') motionOut.speedMul = m.thrust;
      else if (tech === 'kiriage') motionOut.speedMul = m.kiriage;
      else if (phase === 'recovery') {
        motionOut.speedMul = m.kesaRecovery;
        motionOut.jumpLocked = m.kesaRecovery === 0;
      } else motionOut.speedMul = m.kesaStartupActive;
      return motionOut;
    },
    drainEvents(): BladeEvent[] {
      const out = drainQ;
      drainQ = [];
      return out;
    },
    peekEvents(): BladeEvent[] {
      return peekQ.slice();
    },
  };
}
