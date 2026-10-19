import type { ItemId, LegendaryCharge, PlayerMotionMod, Vec3, VoxelWorld, W2Settings, YokaiWorld } from '../contracts';
import { legendDefOf, legendPowerOf } from './defs';
import type { WaveEvent } from './WaveSystem';
import { aimThunder, thunderTargets, type ThunderAim } from './aim';

/**
 * WEAPON-7 §2.2・§3: レジェンダリー武器の ため・はなす・ためわざ（落雷）の 状態の しくみ。
 * 刀（`BladeSystem`）の 外に 置き、`DigSystem` が 1 ステップに 1 回 `step` を 呼ぶ。
 * 武器ごとの 数は 設定 `legendary` の データから 読む（1 つ 足すだけで 武器が ふえる）。
 */

export type LegendEvent =
  | { type: 'chargeStart'; tick: number }
  | { type: 'chargeReady'; tick: number }
  | { type: 'chargeCancel'; tick: number }
  | { type: 'lightningStart'; tick: number; S: Vec3 | null; skyVisible: boolean; variant: number }
  | { type: 'lightningStrike'; tick: number; S: Vec3; hits: number[]; skyVisible: boolean; variant: number }
  | { type: 'lightningMiss'; tick: number }
  | WaveEvent;

export type LegendSoundName = 'chargeReady' | 'lightning' | 'lightningFar';

export interface LegendDeps {
  world: VoxelWorld;
  yokai: () => Pick<YokaiWorld, 'list' | 'raycast' | 'damage'>;
  settings: Pick<W2Settings, 'legendary' | 'legendaryChargeWalk'>;
  tick: () => number;
  /** 落雷が 1 体 以上に 当たった（1 回の 落雷で 1 回）。つなぎ込みが たいきゅうを 1 へらす */
  onWear?: () => void;
  sound?: (name: LegendSoundName) => void;
  /** 雷の 形（4 通り）を えらぶ 乱数の もと（シード付き） */
  seed?: number;
}

export interface LegendStepCtx {
  item: ItemId | null;
  /** false（やられた・案内画面・もちもの画面）の ときは ためも わざも 消える */
  active: boolean;
  /** ひだりクリックを このステップに 押した（`primary` の wasPressed。Shift の ふりわけは 見ない 生の 値） */
  pressed: boolean;
  /** ひだりクリックを 押している（同じステップの 短い タップも ふくむ） */
  held: boolean;
  /** ふりわけが わざ（ほるでは ない）。ためを 始められる か */
  startOk: boolean;
  /** 刀の ふつうの わざ・かまえ替えの 最中 */
  bladeBusy: boolean;
  /** 刀の 先行入力を 受ける 区間 */
  bladeAccepts: boolean;
  /** 刀の 3 段攻撃の つなぎの 窓が 開いている（押しは 先行入力でなく 次の 段に なる） */
  bladeChainOpen: boolean;
  eye: Vec3;
  dir: Vec3;
  position: Vec3;
  yawDeg: number;
  inWater: boolean;
}

export interface LegendStepResult {
  /** この 係が 入力を もっている（ほる・たたく・刀の わざを しない） */
  busy: boolean;
  /** 刀の ふつうの わざを この ステップに 始める（ためが いっぱいでなく はなした） */
  fireTech: boolean;
}

export interface LegendStateView {
  item: ItemId | null;
  power: number | null;
  charge: { ticks: number; ready: boolean } | null;
  move: 'lightning' | 'shining' | null;
  moveF: number;
  cooldownLeft: number;
  aim: { T: Vec3; S: Vec3 | null; skyVisible: boolean } | null;
  dome: { radius: number } | null;
}

/** 動いている 間の 絵・光の 見せ方 */
export interface LegendView {
  /** ため中（ためF が 1 以上） */
  charging: boolean;
  ready: boolean;
  /** いっぱいに なってから の ステップ数（0 = なった ステップ） */
  readyAge: number;
  /** ためF（0〜chargeTicks） */
  chargeRatio: number;
  /** 落雷中の F（なければ 0） */
  moveF: number;
}

const MAX_QUEUE = 256;

export interface LegendSystem {
  step(ctx: LegendStepCtx): LegendStepResult;
  state(): LegendStateView;
  view(): LegendView;
  motion(): PlayerMotionMod & { noRun: boolean };
  /** 落雷の F1 で 固定した 向き（度）。なければ null */
  faceDeg(): number | null;
  /** 今の ためわざの 向き・S（光・雷の 見た目用） */
  strike(): { S: Vec3 | null; skyVisible: boolean; variant: number; F: number; total: number } | null;
  drainEvents(): LegendEvent[];
  /** 真空波など ほかの 係の 出来事を 同じ 列に 入れる */
  emit(e: LegendEvent): void;
  peekEvents(): LegendEvent[];
  /** 入力を もっているか（次の ステップも）。パリィの 先行入力に 使う */
  busyNext(): { busy: boolean; accepts: boolean };
  dropBuffer(): void;
  /** その 武器は ためわざが ある（ふつうの 刀の 先行入力・くり返しを 使わず この 係に まかせる） */
  chargeable(item: ItemId | null): boolean;
}

function lightningOf(c: LegendaryCharge | null): Extract<LegendaryCharge, { kind: 'lightning' }> | null {
  return c && c.kind === 'lightning' ? c : null;
}

const round2 = (v: number): number => Math.round(v * 100 + 1e-7) / 100;

export function createLegendSystem(deps: LegendDeps): LegendSystem {
  const events: LegendEvent[] = [];
  let drainQ: LegendEvent[] = [];
  const emit = (e: LegendEvent): void => {
    drainQ.push(e);
    events.push(e);
    if (drainQ.length > MAX_QUEUE) drainQ.shift();
    if (events.length > MAX_QUEUE) events.shift();
  };

  let heldItem: ItemId | null = null;
  let charge: { ticks: number; ready: boolean; readyAge: number } | null = null;
  let aim: ThunderAim | null = null;
  /** 落雷（F1 から） */
  let move: { F: number; S: Vec3 | null; skyVisible: boolean; variant: number; yaw: number; total: number; strikeF: number } | null = null;
  let buffered = false;
  /** やめた あと 押しつづけでは 始めない */
  let needRelease = false;
  let strikes = 0;
  let inWaterNow = false;
  const seed = deps.seed ?? 0;
  const motionOut: PlayerMotionMod & { noRun: boolean } = { speedMul: 1, jumpLocked: false, faceDeg: null, stopNow: false, noRun: false };

  function variantOf(n: number): number {
    // シード付きの ならび（0〜3）。同じ 順で 同じ 形
    let x = (Math.imul(n + 1, 0x9e3779b1) ^ Math.imul(seed | 0, 0x85ebca6b)) >>> 0;
    x = Math.imul(x ^ (x >>> 15), 0x2c1b3c6d) >>> 0;
    return (x >>> 7) % 4;
  }

  function cancelCharge(held: boolean): void {
    if (charge) emit({ type: 'chargeCancel', tick: deps.tick() });
    charge = null;
    aim = null;
    buffered = false;
    needRelease = held;
  }

  function strikeNow(L: Extract<LegendaryCharge, { kind: 'lightning' }>, item: ItemId): void {
    const m = move!;
    const tick = deps.tick();
    if (!m.S) {
      emit({ type: 'lightningMiss', tick });
      deps.sound?.('lightningFar');
      return;
    }
    const S = m.S;
    const yw = deps.yokai();
    const ids = thunderTargets(deps.world, yw.list(), S, L.radius);
    const P = legendPowerOf(deps.settings, item) ?? 1;
    const dmg = round2(P * L.damageMul);
    const hits: number[] = [];
    for (const id of ids) {
      yw.damage(id, dmg, { x: S.x, y: S.y, z: S.z }, { dist: L.knock[0], up: L.knock[1] });
      hits.push(id);
    }
    emit({ type: 'lightningStrike', tick, S: { ...S }, hits, skyVisible: m.skyVisible, variant: m.variant });
    deps.sound?.(m.skyVisible ? 'lightning' : 'lightningFar');
    if (hits.length > 0) deps.onWear?.();
  }

  return {
    step(ctx: LegendStepCtx): LegendStepResult {
      const def = legendDefOf(deps.settings, ctx.item);
      const L = lightningOf(def?.charge ?? null);
      heldItem = L ? ctx.item : null;
      inWaterNow = ctx.inWater;
      if (!L || !ctx.item) {
        // 持ちかえ・刀でなくなった: ためも 落雷も 消える（音なし。何も へらない）
        if (charge) cancelCharge(ctx.held);
        move = null;
        aim = null;
        buffered = false;
        if (!ctx.held) needRelease = false;
        return { busy: false, fireTech: false };
      }
      if (!ctx.active) {
        cancelCharge(ctx.held);
        move = null;
        return { busy: false, fireTech: false };
      }
      if (needRelease) {
        if (!ctx.held) needRelease = false;
        else return { busy: true, fireTech: false };
      }

      // 落雷中
      if (move) {
        move.F += 1;
        if (move.F > move.total) {
          move = null;
        } else {
          if (move.F === move.strikeF) strikeNow(L, ctx.item);
          // 先行入力: さいご 8F
          if (ctx.pressed && ctx.startOk && move.F > move.total - 8) buffered = true;
          return { busy: true, fireTech: false };
        }
      }

      // ため中
      if (charge) {
        if (ctx.held) {
          charge.ticks += 1;
          if (!charge.ready && charge.ticks >= L.chargeTicks) {
            charge.ready = true;
            charge.readyAge = 0;
            emit({ type: 'chargeReady', tick: deps.tick() });
            deps.sound?.('chargeReady');
          } else if (charge.ready) charge.readyAge += 1;
          aim = charge.ready ? aimThunder(deps.world, deps.yokai(), ctx.eye, ctx.dir, L.range) : null;
          return { busy: true, fireTech: false };
        }
        // はなした
        const ready = charge.ready;
        charge = null;
        aim = null;
        buffered = false;
        if (!ready) return { busy: false, fireTech: true };
        const a = aimThunder(deps.world, deps.yokai(), ctx.eye, ctx.dir, L.range);
        const variant = variantOf(strikes++);
        move = { F: 1, S: a.S ? { ...a.S } : null, skyVisible: a.skyVisible, variant, yaw: ctx.yawDeg, total: 5 + L.recovery, strikeF: L.strikeF };
        emit({ type: 'lightningStart', tick: deps.tick(), S: move.S ? { ...move.S } : null, skyVisible: a.skyVisible, variant });
        return { busy: true, fireTech: false };
      }

      // ためて いない: 刀が わざ中なら 先行入力だけ おぼえる
      if (ctx.bladeBusy) {
        // WEAPON-7: つなぎの 窓が 開いている 間の 押しは 刀の 次の 段（ためは 始めない）
        if (ctx.pressed && ctx.startOk && ctx.bladeChainOpen) return { busy: false, fireTech: true };
        if (ctx.pressed && ctx.startOk && ctx.bladeAccepts) buffered = true;
        return { busy: false, fireTech: false };
      }
      const start = (ctx.startOk && (ctx.pressed || ctx.held)) || buffered;
      if (!start) {
        if (!ctx.held && !ctx.pressed) buffered = false;
        return { busy: false, fireTech: false };
      }
      buffered = false;
      charge = { ticks: 1, ready: false, readyAge: 0 };
      emit({ type: 'chargeStart', tick: deps.tick() });
      if (charge.ticks >= L.chargeTicks) {
        charge.ready = true;
        emit({ type: 'chargeReady', tick: deps.tick() });
        deps.sound?.('chargeReady');
      }
      return { busy: true, fireTech: false };
    },

    state(): LegendStateView {
      const def = legendDefOf(deps.settings, heldItem);
      return {
        item: heldItem && def ? heldItem : null,
        power: heldItem ? legendPowerOf(deps.settings, heldItem) : null,
        charge: charge ? { ticks: charge.ticks, ready: charge.ready } : null,
        move: move ? 'lightning' : null,
        moveF: move ? move.F : 0,
        cooldownLeft: 0,
        aim: aim ? { T: { ...aim.T }, S: aim.S ? { ...aim.S } : null, skyVisible: aim.skyVisible } : null,
        dome: null,
      };
    },

    view(): LegendView {
      const L = lightningOf(legendDefOf(deps.settings, heldItem)?.charge ?? null);
      return {
        charging: charge !== null,
        ready: !!charge?.ready,
        readyAge: charge?.readyAge ?? 0,
        chargeRatio: charge && L ? Math.min(1, charge.ticks / L.chargeTicks) : 0,
        moveF: move ? move.F : 0,
      };
    },

    motion(): PlayerMotionMod & { noRun: boolean } {
      motionOut.speedMul = 1;
      motionOut.jumpLocked = false;
      motionOut.noRun = false;
      motionOut.faceDeg = null;
      motionOut.stopNow = false;
      if (move) {
        motionOut.speedMul = 0;
        motionOut.jumpLocked = true;
        motionOut.faceDeg = move.yaw;
        motionOut.stopNow = move.F === 1;
      } else if (charge) {
        motionOut.speedMul = deps.settings.legendaryChargeWalk;
        motionOut.jumpLocked = !inWaterNow;
        motionOut.noRun = true;
      }
      return motionOut;
    },

    faceDeg(): number | null {
      return move ? move.yaw : null;
    },

    strike() {
      return move ? { S: move.S ? { ...move.S } : null, skyVisible: move.skyVisible, variant: move.variant, F: move.F, total: move.total } : null;
    },

    emit,

    drainEvents(): LegendEvent[] {
      const out = drainQ;
      drainQ = [];
      return out;
    },

    peekEvents(): LegendEvent[] {
      return events.slice();
    },

    busyNext(): { busy: boolean; accepts: boolean } {
      if (charge) return { busy: true, accepts: false };
      if (!move) return { busy: false, accepts: false };
      const f = move.F + 1;
      if (f > move.total) return { busy: false, accepts: false };
      return { busy: true, accepts: f > move.total - 8 };
    },

    dropBuffer(): void {
      buffered = false;
    },

    chargeable(item: ItemId | null): boolean {
      return !!item && lightningOf(legendDefOf(deps.settings, item)?.charge ?? null) !== null;
    },
  };
}
