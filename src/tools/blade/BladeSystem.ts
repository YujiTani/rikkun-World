import type {
  BladeAdvanceCurve,
  BladeDeps,
  BladeEvent,
  BladeShapeInfo,
  BladeStance,
  BladeStep,
  BladeTechFrames,
  BladeState,
  BladeStepContext,
  BladeSystem,
  BladeTech,
  ItemId,
  PlayerMotionMod,
  Vec3,
  YokaiInfo,
} from '../../contracts';
import { TECH_PHASES } from '../../char/techCurves';
import { boxOf, capsuleDist, normDeg, thrustTilt, wallBetween } from '../../combat/attackFacing';
import { bladeReachOf, techAdvance } from './advance';

const DEG = Math.PI / 180;
const MAX_QUEUE = 256;

/** 刀（わざ・かまえが ある もの）。なぎなたは 入れない（今の パンチのまま） */
export const BLADE_ITEMS: ReadonlySet<ItemId> = new Set<ItemId>(['bokuto', 'katana', 'crystal_katana', 'raijin_ken', 'fujin_ken', 'niji_tachi']);

/** わざのダメージ = 刀の強さ × 倍率。0.01 の位に まるめるだけ（四捨五入も 最低 1 も しない。WEAPON-4 §4.3） */
export function techDamage(base: number, mul: number): number {
  return Math.round(base * mul * 100 + 1e-7) / 100;
}

export function isBladeItem(item: ItemId | null | undefined): boolean {
  return !!item && BLADE_ITEMS.has(item);
}

/** 絵の わざの 長さ（`atlas.json` の phases。初期値の bladeTech と 同じ）。設定の 長さが ちがうとき 比で のばす もとになる */
const PICTURE_PHASES = TECH_PHASES;

const TECH_OF_STANCE: Record<BladeStance, BladeTech> = { chudan: 'thrust', jodan: 'kesa', gedan: 'kiriage' };
const NEXT_STANCE: Record<BladeStance, BladeStance> = { chudan: 'jodan', jodan: 'gedan', gedan: 'chudan' };

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
  /** CHAR-2: わざの ふみこみ（わざの あいだだけ）。向き u・始めた足もと O・ねらいの向き（突きの線）は 始めたステップで 固定 */
  let move: BladeState['move'] = null;
  /** WEAPON-3: 突きの 線の 向き（u と かたむき）と 出どころ B。始めたステップで 固定 */
  let aimDir: Vec3 = { x: 0, y: 0, z: -1 };
  const bodyStart: Vec3 = { x: 0, y: 0, z: 0 };
  /** WEAPON-4: このわざの 射程 R（始めたステップの 刀で 固定） */
  let reach = 2.2;
  /** WEAPON-6: 何段目か・つなぎを おぼえているか・この段の 長さ・ふりぬき・ふみこみの 線（始めたステップの 値を その段の間 使う） */
  let stage: BladeStep = 1;
  let queued = false;
  let curLen: BladeTechFrames = { ...S.bladeTech.thrust };
  let curFollow = 0;
  let curCurve: BladeAdvanceCurve = S.bladeAdvance.thrust;
  let drainQ: BladeEvent[] = [];
  const peekQ: BladeEvent[] = [];

  function emit(e: BladeEvent): void {
    drainQ.push(e);
    peekQ.push(e);
    if (drainQ.length > MAX_QUEUE) drainQ.shift();
    if (peekQ.length > MAX_QUEUE) peekQ.shift();
  }

  function totalOf(_t: BladeTech): number {
    return curLen.startup + curLen.active + curLen.recovery;
  }

  /** この 刀は 3 段攻撃の 刀か */
  function isComboItem(): boolean {
    return !!item && S.bladeCombo.items.includes(item);
  }

  /** いまの 段から 次の 段へ つなげるか（1・2 段目で、かまえの 順に 次が ある） */
  function chainable(): boolean {
    return phase !== 'idle' && phase !== 'switch' && !!tech && isComboItem() && stage < 3 && S.bladeCombo.order[stance][stage] !== undefined;
  }

  /** キャンセルできる F（C） */
  function cancelAt(): number {
    return curLen.startup + curLen.active + curFollow + 1;
  }

  /** 先行入力を 受け始める F */
  function windowStart(): number {
    if (phase === 'switch') return 1;
    if (!tech) return 1;
    const f = curLen;
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
    move = null;
    queued = false;
    stage = 1;
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

  function startTech(ctx: BladeStepContext, st: BladeStep = 1): void {
    const combo = isComboItem();
    tech = (combo ? S.bladeCombo.order[stance][st - 1] : undefined) ?? TECH_OF_STANCE[stance];
    stage = st;
    queued = false;
    buffered = null;
    const base = S.bladeTech[tech];
    curLen = st > 1 ? { startup: S.bladeCombo.stepStartup[tech], active: base.active, recovery: base.recovery } : { ...base };
    curFollow = S.bladeCombo.follow[tech] ?? 0;
    curCurve = (st === 2 ? S.bladeCombo.step2Advance[tech] : undefined) ?? S.bladeAdvance[tech];
    frame = 1;
    switchFrom = null;
    hitSet = new Set<number>();
    hitReported = false;
    reach = bladeReachOf(S, item);
    const u = normDeg(ctx.attackDirDeg);
    const tiltDeg = tech === 'thrust' && ctx.attackTarget ? thrustTilt(ctx.body, ctx.attackTarget, S.thrustTiltMaxDeg) : 0;
    move = { dirDeg: u, origin: { ...ctx.position }, target: 0, moved: 0, tiltDeg };
    const ur = u * DEG;
    const tr = tiltDeg * DEG;
    aimDir = { x: Math.sin(ur) * Math.cos(tr), y: Math.sin(tr), z: -Math.cos(ur) * Math.cos(tr) };
    bodyStart.x = ctx.body.x;
    bodyStart.y = ctx.body.y;
    bodyStart.z = ctx.body.z;
    emit({ type: 'techStart', tick: deps.tick(), tech, step: stage });
    processFrame(ctx);
  }

  function phaseOfFrame(_t: BladeTech, f: number): BladeState['phase'] {
    const c = curLen;
    if (f <= c.startup) return 'startup';
    if (f <= c.startup + c.active) return 'active';
    return 'recovery';
  }

  /** frame が 決まった あとの 仕事（phase・当たり・ふみこみ） */
  function processFrame(ctx: BladeStepContext): void {
    if (!tech) return;
    phase = phaseOfFrame(tech, frame);
    shapeInfo = null;
    // わざの向き u（始めたステップで 固定）へ ふみこむ
    const yawR = (move ? move.dirDeg : ctx.attackDirDeg) * DEG;
    const fx = Math.sin(yawR);
    const fz = -Math.cos(yawR);
    if (move) {
      move.target = techAdvance(curCurve, PICTURE_PHASES[tech], curLen, frame);
      const want = move.target - move.moved; // かべで 止まった ぶんも 押しつづける（とおりぬけない）
      if (deps.lunge) {
        const got = deps.lunge(fx * want, fz * want);
        move.moved += got.x * fx + got.z * fz;
      } else move.moved = move.target;
    }
    if (phase !== 'active') return;
    const c = curLen;
    shapeInfo = makeShape(tech, ctx, fx, fz);
    const hits = evalHits(tech, ctx, fx, fz);
    if (hits > 0 && !hitReported) {
      hitReported = true;
      deps.onHit({ tech, count: hits });
    }
    if (hitSet.size === 0 && frame === c.startup + c.active) {
      emit({ type: 'techMiss', tick: deps.tick(), tech, step: stage });
    }
  }

  function makeShape(t: BladeTech, ctx: BladeStepContext, fx: number, fz: number): BladeShapeInfo {
    if (t === 'thrust') {
      const sh = S.bladeShape.thrust;
      return {
        kind: 'capsule',
        from: { ...bodyStart },
        to: { x: bodyStart.x + aimDir.x * reach, y: bodyStart.y + aimDir.y * reach, z: bodyStart.z + aimDir.z * reach },
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
      rMax: reach,
      yMin: ctx.position.y + sh.yMin,
      yMax: ctx.position.y + sh.yMax,
    };
  }

  /** B から 箱の 中心への 線が 固いブロックに さえぎられるか */
  function blocked(ctx: BladeStepContext, cx: number, cy: number, cz: number): boolean {
    return wallBetween(deps.world, ctx.body, cx, cy, cz);
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
    if (d > reach + r) return false;
    if (d <= r) return true;
    const cos = (dx * fx + dz * fz) / d;
    const ang = Math.acos(Math.max(-1, Math.min(1, cos)));
    const tol = Math.asin(Math.min(1, r / d));
    return ang <= sh.halfAngleDeg * DEG + tol;
  }

  function applyHit(t: BladeTech, ctx: BladeStepContext, y: YokaiInfo): void {
    const base = item ? deps.weaponDamage(item) : 1;
    const dmg = techDamage(base, S.bladeDamageMul[t]);
    const [dist, up] = S.bladeKnock[t];
    hitSet.add(y.id);
    const dealt = deps.yokai().damage(y.id, dmg, { ...ctx.position }, { dist, up });
    const shown = typeof dealt === 'number' && dealt > 0 ? dealt : dmg; // よろけの 2 倍の あとの 数
    emit({
      type: 'techHit',
      tick: deps.tick(),
      tech: t,
      yokaiId: y.id,
      damage: shown,
      knock: dist,
      up,
      position: { ...y.position },
      step: stage,
    });
  }

  function evalHits(t: BladeTech, ctx: BladeStepContext, fx: number, fz: number): number {
    const yw = deps.yokai();
    const list = yw.list();
    let count = 0;
    if (t === 'thrust') {
      if (hitSet.size > 0) return 0; // 1 体 だけ
      let best: YokaiInfo | null = null;
      let bestD = Infinity;
      for (const y of list) {
        if (y.state === 'dying' || y.state === 'leaving') continue;
        // WEAPON-4 §4.2: ＋マークの 線で 当てる近道は なくす（当たり判定の 箱が 絵の 半径より 広く R を こえて とどくため）。カプセルだけ
        const d = capsuleDist(bodyStart, aimDir, reach, S.bladeShape.thrust.radius, y);
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
      let combo: BladeState['combo'] = null;
      if (tech && phase !== 'idle' && phase !== 'switch' && isComboItem()) {
        combo = chainable()
          ? { step: stage, queued, open: frame > curLen.startup && frame <= totalOf(tech), cancelAt: cancelAt() }
          : { step: stage, queued: false, open: false, cancelAt: null };
      }
      const lengths = tech && phase !== 'idle' && phase !== 'switch' ? curLen : null;
      return { item, stance, tech, phase, frame, buffered, switchFrom, move: move ? { ...move, origin: { ...move.origin } } : null, lengths, combo };
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

      // WEAPON-6: おぼえた つなぎを 出す（キャンセルできる F から）
      if (queued && chainable() && frame + 1 >= cancelAt()) {
        startTech(ctx, (stage + 1) as BladeStep);
        return;
      }

      // すすめる
      if (phase !== 'idle') {
        frame++;
        if (frame > currentTotal()) {
          tech = null;
          phase = 'idle';
          frame = 0;
          switchFrom = null;
          move = null;
          queued = false;
          stage = 1;
        }
      }

      // 先行入力
      if (phase !== 'idle') {
        if (frame >= windowStart()) {
          if (ctx.stancePressed) buffered = 'stance';
          if (ctx.techPressed) buffered = 'tech';
        }
        // WEAPON-6: つなぎの窓（当たりの はじめ〜わざの おわり）。おぼえて、C か 押した F ＋ 1 の おそい方で 次の段
        if (ctx.techPressed && chainable() && frame > curLen.startup) queued = true;
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
      // CHAR-2: わざの あいだは ジャンプできない。歩く倍率は 設定（初期値は 4 つとも 0）
      const m = S.bladeMoveMul;
      motionOut.jumpLocked = true;
      if (tech === 'thrust') motionOut.speedMul = m.thrust;
      else if (tech === 'kiriage') motionOut.speedMul = m.kiriage;
      else motionOut.speedMul = phase === 'recovery' ? m.kesaRecovery : m.kesaStartupActive;
      return motionOut;
    },
    dropBuffer(): void {
      buffered = null;
      queued = false;
    },
    busyNext(parryPress = false): { busy: boolean; accepts: boolean } {
      if (phase === 'idle') return { busy: false, accepts: false };
      const f = frame + 1;
      if (f > currentTotal()) return { busy: false, accepts: false };
      // WEAPON-6: つなぎの窓では パリィも 押せる。始まるのは C か 押した F ＋ 1 の おそい方
      if (chainable() && f > curLen.startup) return { busy: parryPress || f < cancelAt(), accepts: true };
      return { busy: true, accepts: f >= windowStart() };
    },
    yieldToParry(): void {
      if (phase !== 'idle' && phase !== 'switch') resetIdle();
    },
    nextStart(): { tech: BladeTech; step: BladeStep } {
      const combo = isComboItem();
      let st: BladeStep = 1;
      if (chainable() && (queued || (frame < totalOf(tech!) && frame + 1 > curLen.startup))) st = (stage + 1) as BladeStep;
      const t = (combo ? S.bladeCombo.order[stance][st - 1] : undefined) ?? TECH_OF_STANCE[stance];
      return { tech: t, step: st };
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
