import type { ItemId, LegendaryCharge, PlayerMotionMod, Vec3, VoxelWorld, W2Settings, YokaiInfo, YokaiWorld } from '../contracts';
import { legendDefOf, legendPowerOf } from './defs';
import { boxOf } from '../combat/attackFacing';
import type { WaveEvent } from './WaveSystem';
import { aimThunder, thunderTargets, type ThunderAim } from './aim';
import { boltVariantOf } from './thunderModel';
import type { SpiralEvent } from './WaveSystem';

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
  // WEAPON-7 PR3: 虹（シャイニング）。domeHit = ドームが 妖怪に 当たった
  | { type: 'shiningStart'; tick: number; power: number }
  | { type: 'domeHit'; tick: number; yokaiId: number; damage: number }
  | { type: 'shiningEnd'; tick: number }
  | { type: 'shiningReady'; tick: number }
  | WaveEvent
  | SpiralEvent;

export type LegendSoundName = 'chargeReady' | 'lightning' | 'lightningFar' | 'spiralWind' | 'shiningStart' | 'shiningHit' | 'shiningEnd' | 'shiningReady';
/** 続く 音（ため・ため続け）。WEAPON-8 §3.6 */
export type LegendLoopName = 'chargeRise' | 'chargeHold';
export interface LegendLoopHandle {
  stop(fadeSec: number): void;
}
/** `legend.chargeSound()` の 答え（§3.6）と `legend.spiralSound()` */
export type LegendSoundState = 'off' | 'on' | 'fading';

export interface LegendDeps {
  world: VoxelWorld;
  yokai: () => Pick<YokaiWorld, 'list' | 'raycast' | 'damage'>;
  settings: Pick<W2Settings, 'legendary' | 'legendaryChargeWalk'>;
  tick: () => number;
  /** 落雷が 1 体 以上に 当たった（1 回の 落雷で 1 回）。つなぎ込みが たいきゅうを 1 へらす */
  onWear?: () => void;
  sound?: (name: LegendSoundName) => void;
  /** WEAPON-8: 続く 音を 始める（止める 手は 返す）。ため `chargeRise`（ためF 1）・ため続け `chargeHold`（ためF 60） */
  loop?: (name: LegendLoopName) => LegendLoopHandle | void;
  /** WEAPON-8: らせんの かぜを 出す（F6）。つなぎ込みが 体の 点 B から `WaveSystem.launchSpiral` を 呼ぶ */
  launchSpiral?: (a: { item: ItemId; dirDeg: number }) => void;
  /** 雷の 形（4 通り）を えらぶ 乱数の もと（シード付き） */
  seed?: number;
  /** WEAPON-7 PR3: 持っている 1 本の 強さ（虹）。なければ 設定の 強さ */
  power?: (item: ItemId) => number | null;
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
  move: 'lightning' | 'spiral' | 'shining' | null;
  moveF: number;
  cooldownLeft: number;
  aim: { T: Vec3; S: Vec3 | null; skyVisible: boolean } | null;
  dome: DomeView | null;
}

/** WEAPON-7 PR3: ドームの 見た目用の 状態（3D は 絵の 係が つなぐ）。phase 内の 進み t は 0〜1 */
export interface DomeView {
  radius: number;
  /** 体の 中心の 高さ（足もと + 0.9） */
  centerY: number;
  phase: 'rise' | 'hold' | 'fall';
  t: number;
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
  /** 持っている 武器の ためわざの しゅるい（ためわざが なければ null）。手もとの 光の 色を えらぶ */
  kind: 'lightning' | 'spiral' | 'shining' | null;
  /** ためF（ためて いなければ null。いっぱいでも 数えつづける） */
  chargeTicks: number | null;
}

const MAX_QUEUE = 256;

export interface LegendSystem {
  step(ctx: LegendStepCtx): LegendStepResult;
  state(): LegendStateView;
  view(): LegendView;
  motion(): PlayerMotionMod & { noRun: boolean; hoverDy: number | null };
  /** WEAPON-7 PR3: シャイニング中(うかぶ〜おりる)は 妖怪の 攻撃・火の玉が プレイヤーに 当たらない */
  shield(): boolean;
  /** シャイニング中(もどりまで)は 落下ダメージなし */
  fallSafe(): boolean;
  /** 今の ドーム（中心と 半径）。なければ null。火の玉を 消すのに 使う */
  dome(): { x: number; y: number; z: number; r: number } | null;
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
  /** WEAPON-8 §3.6: ため音の 区間（窓口 `legend.chargeSound()`） */
  chargeSound(): { rise: LegendSoundState; hold: LegendSoundState };
  /** WEAPON-8 §3.7: らせんの 音の ようす（窓口 `legend.spiralSound()`） */
  spiralSound(): LegendSoundState;
}

type Charged = LegendaryCharge;
type Shining = Extract<LegendaryCharge, { kind: 'shining' }>;

/** ため音を 止める ときの 長さ（ステップ）。仕様 §3.6: ため 6 以内・ため続け 15 以内 */
const RISE_FADE_STEPS = 5;
const HOLD_FADE_STEPS = 12;
/** らせんの 音: かべで 消えた ときの 止まる 長さ（12 以内）・とどいた ときに 鳴りつづける 長さ（120 以内） */
const SPIRAL_BLOCK_FADE_STEPS = 10;
const SPIRAL_SOUND_STEPS = 119;

function chargedOf(c: LegendaryCharge | null): Charged | null {
  return c ?? null;
}

/** はじめ・おわり ゆっくり（なめらか） */
const ease = (t: number): number => {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
};
/** もどりの ステップ数（シャイニングの 255 → 260） */
const SHINING_RECOVERY = 20;
/** 体の 中心は 足もとから この 高さ */
const BODY_CENTER = 0.9;

const round2 = (v: number): number => Math.round(v * 100 + 1e-7) / 100;

export function createLegendSystem(deps: LegendDeps): LegendSystem {
  const events: LegendEvent[] = [];
  let drainQ: LegendEvent[] = [];
  const emit = (e: LegendEvent): void => {
    // らせんの 音: 出た ステップに on。かべで すぐ 消えたら 小さく して 止める（§3.7）
    if (e.type === 'spiralStart') {
      snd.spiral = 'on';
      snd.spiralLeft = SPIRAL_SOUND_STEPS;
    } else if (e.type === 'spiralEnd' && e.reason === 'block' && snd.spiral === 'on') {
      snd.spiral = 'fading';
      snd.spiralLeft = SPIRAL_BLOCK_FADE_STEPS;
    }
    drainQ.push(e);
    events.push(e);
    if (drainQ.length > MAX_QUEUE) drainQ.shift();
    if (events.length > MAX_QUEUE) events.shift();
  };

  let heldItem: ItemId | null = null;
  let charge: { ticks: number; ready: boolean; readyAge: number } | null = null;
  let aim: ThunderAim | null = null;
  /** 落雷（F1 から） */
  let move: {
    kind: 'lightning' | 'spiral' | 'shining';
    F: number;
    S: Vec3 | null;
    skyVisible: boolean;
    variant: number;
    yaw: number;
    total: number;
    strikeF: number;
    /** シャイニング: 始めた 足もとの 高さ・おりる 前の 高さ・次の ステップの 上下の 動き・同じ 妖怪に 当てた ステップ・たいきゅうを へらしたか */
    baseY: number;
    holdY: number;
    hoverDy: number | null;
    hitAt: Map<number, number>;
    worn: boolean;
  } | null = null;
  let cooldown = 0;
  let nowStep = 0;
  let lastDome: DomeView | null = null;
  const powerOf = (item: ItemId): number => (deps.power ? deps.power(item) : null) ?? legendPowerOf(deps.settings, item) ?? 1;
  const newMove = (kind: 'lightning' | 'spiral' | 'shining', o: Partial<NonNullable<typeof move>> & { yaw: number; total: number; strikeF: number }): NonNullable<typeof move> => ({
    kind,
    F: 1,
    S: null,
    skyVisible: true,
    variant: 0,
    baseY: 0,
    holdY: 0,
    hoverDy: null,
    hitAt: new Map(),
    worn: false,
    ...o,
  });
  let buffered = false;
  /** やめた あと 押しつづけでは 始めない */
  let needRelease = false;
  let strikes = 0;
  let inWaterNow = false;
  const seed = deps.seed ?? 0;
  const motionOut: PlayerMotionMod & { noRun: boolean; hoverDy: number | null } = { speedMul: 1, jumpLocked: false, faceDeg: null, stopNow: false, noRun: false, hoverDy: null };

  // ---- ため音（§3.6）・らせんの 音（§3.7）の 区間
  const snd = {
    rise: 'off' as LegendSoundState,
    riseLeft: 0,
    riseH: null as LegendLoopHandle | null,
    hold: 'off' as LegendSoundState,
    holdLeft: 0,
    holdH: null as LegendLoopHandle | null,
    spiral: 'off' as LegendSoundState,
    spiralLeft: 0,
  };
  const chargeSoundOut = { rise: 'off' as LegendSoundState, hold: 'off' as LegendSoundState };

  /** 1 ステップに 1 回: 止まっていく 音を すすめる */
  function tickSounds(): void {
    if (snd.rise === 'fading' && --snd.riseLeft <= 0) snd.rise = 'off';
    if (snd.hold === 'fading' && --snd.holdLeft <= 0) snd.hold = 'off';
    if (snd.spiral !== 'off' && --snd.spiralLeft <= 0) snd.spiral = 'off';
  }
  function riseStart(): void {
    snd.rise = 'on';
    snd.riseH = deps.loop?.('chargeRise') ?? null;
  }
  function riseStop(fadeSteps: number, state: LegendSoundState): void {
    if (snd.rise !== 'on') return;
    snd.riseH?.stop(fadeSteps / 60);
    snd.riseH = null;
    snd.rise = state;
    snd.riseLeft = fadeSteps;
  }
  function holdStart(): void {
    snd.hold = 'on';
    snd.holdH = deps.loop?.('chargeHold') ?? null;
  }
  function holdStop(): void {
    if (snd.hold !== 'on') return;
    snd.holdH?.stop(HOLD_FADE_STEPS / 60);
    snd.holdH = null;
    snd.hold = 'fading';
    snd.holdLeft = HOLD_FADE_STEPS;
  }
  /** ためが おわった（はなした・やめた）: 鳴っている ため音を 止める */
  function chargeSoundsStop(): void {
    riseStop(RISE_FADE_STEPS, 'fading');
    holdStop();
  }

  function cancelCharge(held: boolean): void {
    if (charge) emit({ type: 'chargeCancel', tick: deps.tick() });
    if (charge) chargeSoundsStop();
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
    const P = powerOf(item);
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

  // ---- WEAPON-7 PR3: シャイニング
  const shiningEndF = (L: Shining): number => L.riseSteps + L.holdSteps + L.fallSteps;
  /** F ステップ目の ドームの 半径と 絵用の 区間（うかぶ・おりるは ゆっくり 広がる／ちぢむ） */
  function domeAt(L: Shining, F: number): DomeView | null {
    const holdEnd = L.riseSteps + L.holdSteps;
    if (F < 1 || F > shiningEndF(L)) return null;
    if (F <= L.riseSteps) return { radius: L.radius * ease(F / L.riseSteps), centerY: 0, phase: 'rise', t: F / L.riseSteps };
    if (F <= holdEnd) return { radius: L.radius, centerY: 0, phase: 'hold', t: (F - L.riseSteps) / L.holdSteps };
    const t = (F - holdEnd) / L.fallSteps;
    return { radius: L.radius * (1 - ease(t)), centerY: 0, phase: 'fall', t };
  }
  /** 次の ステップ F の 足もとの 高さ（うかぶ → とどまる → おりる。おりるは 今の 高さから 始めた 高さへ） */
  function targetY(L: Shining, m: NonNullable<typeof move>, F: number): number | null {
    if (F > shiningEndF(L)) return null;
    if (F <= L.riseSteps) return m.baseY + L.rise * ease((F - 1) / Math.max(1, L.riseSteps - 1));
    if (F <= L.riseSteps + L.holdSteps) return m.baseY + L.rise;
    return m.baseY + (m.holdY - m.baseY) * (1 - ease((F - L.riseSteps - L.holdSteps) / L.fallSteps));
  }
  /** 妖怪の 当たりの 箱（円柱）が 球に ふれるか */
  function touchesSphere(y: YokaiInfo, c: Vec3, r: number): boolean {
    const { r: br, h } = boxOf(y);
    const dh = Math.max(0, Math.hypot(y.position.x - c.x, y.position.z - c.z) - br);
    const dv = c.y < y.position.y ? y.position.y - c.y : c.y > y.position.y + h ? c.y - (y.position.y + h) : 0;
    return Math.hypot(dh, dv) <= r;
  }
  /** シャイニングの 1 ステップ（F は もう 数えてある）: ドームの 当たり・次の 上下の 動き */
  function shiningFrame(L: Shining, item: ItemId, ctx: LegendStepCtx): void {
    const m = move!;
    const F = m.F;
    const d = domeAt(L, F);
    if (d) {
      const c = { x: ctx.position.x, y: ctx.position.y + BODY_CENTER, z: ctx.position.z };
      if (d.radius > 0) {
        const P = powerOf(item);
        const dmg = round2(P * L.damageMul);
        const yw = deps.yokai();
        let any = false;
        for (const y of yw.list()) {
          if (y.state === 'dying' || y.state === 'leaving') continue;
          const last = m.hitAt.get(y.id);
          if (last !== undefined && nowStep - last < L.hitEvery) continue;
          if (!touchesSphere(y, c, d.radius)) continue;
          m.hitAt.set(y.id, nowStep);
          yw.damage(y.id, dmg, { x: c.x, y: c.y, z: c.z }, { dist: L.push[0], up: L.push[1] });
          emit({ type: 'domeHit', tick: deps.tick(), yokaiId: y.id, damage: dmg });
          any = true;
        }
        if (any) {
          deps.sound?.('shiningHit');
          if (!m.worn) {
            m.worn = true;
            deps.onWear?.();
          }
        }
      }
    }
    // おりる 前の 高さ（とどまるの さいご）を おぼえる
    if (F === L.riseSteps + L.holdSteps) m.holdY = ctx.position.y;
    m.hoverDy = null;
    const ty = targetY(L, m, F + 1);
    if (ty !== null) m.hoverDy = ty - ctx.position.y;
    lastDome = d ? { ...d, centerY: ctx.position.y + BODY_CENTER } : null;
    lastPos.x = ctx.position.x;
    lastPos.y = ctx.position.y;
    lastPos.z = ctx.position.z;
  }
  const lastPos: Vec3 = { x: 0, y: 0, z: 0 };
  /** 持ちかえ・やられた で とちゅうで おわる（休みは なし） */
  let shiningCooldown = 0;
  function shiningAbort(): void {
    if (move?.kind === 'shining') {
      emit({ type: 'shiningEnd', tick: deps.tick() });
      lastDome = null;
      cooldown = shiningCooldown; // 途中で おわっても 休みは はじまる（持ちかえで 休みを さけられない）
    }
  }
  function shiningFinish(): void {
    emit({ type: 'shiningEnd', tick: deps.tick() });
    deps.sound?.('shiningEnd');
    const L = chargedOf(legendDefOf(deps.settings, heldItem)?.charge ?? null);
    cooldown = L && L.kind === 'shining' ? L.cooldown : 0;
    lastDome = null;
  }

  return {
    step(ctx: LegendStepCtx): LegendStepResult {
      tickSounds();
      nowStep += 1;
      // 虹の 休み: 持ちかえても 数える。あけた ステップに shiningReady
      if (cooldown > 0 && --cooldown === 0) {
        emit({ type: 'shiningReady', tick: deps.tick() });
        deps.sound?.('shiningReady');
      }
      const def = legendDefOf(deps.settings, ctx.item);
      const L = chargedOf(def?.charge ?? null);
      heldItem = L ? ctx.item : null;
      inWaterNow = ctx.inWater;
      if (!L || !ctx.item) {
        // 持ちかえ・刀でなくなった: ためも 落雷も 消える（音なし。何も へらない）
        if (charge) cancelCharge(ctx.held);
        shiningAbort();
        move = null;
        aim = null;
        buffered = false;
        if (!ctx.held) needRelease = false;
        return { busy: false, fireTech: false };
      }
      if (!ctx.active) {
        cancelCharge(ctx.held);
        shiningAbort();
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
          if (move.kind === 'shining') shiningFinish();
          move = null;
        } else {
          if (move.kind === 'shining' && L.kind === 'shining') shiningFrame(L, ctx.item, ctx);
          if (move.F === move.strikeF) {
            if (move.kind === 'lightning' && L.kind === 'lightning') strikeNow(L, ctx.item);
            else if (move.kind === 'spiral') deps.launchSpiral?.({ item: ctx.item, dirDeg: move.yaw });
          }
          // 先行入力: さいご 8F
          if (ctx.pressed && ctx.startOk && move.F > move.total - 8) buffered = true;
          return { busy: true, fireTech: false };
        }
      }

      // ため中
      if (charge) {
        if (ctx.held) {
          charge.ticks += 1;
          // 虹は 休みの 間は いっぱいに ならない（はなすと ふつうの わざ）
          if (!charge.ready && charge.ticks >= L.chargeTicks && !(L.kind === 'shining' && cooldown > 0)) {
            charge.ready = true;
            charge.readyAge = 0;
            emit({ type: 'chargeReady', tick: deps.tick() });
            deps.sound?.('chargeReady');
            riseStop(2, 'off');
            holdStart();
          } else if (charge.ready) charge.readyAge += 1;
          // ねらいの 地面の わは 雷神剣だけ（風神剣は まっすぐ 前に とぶ ので 印は 出さない）
          aim = charge.ready && L.kind === 'lightning' ? aimThunder(deps.world, deps.yokai(), ctx.eye, ctx.dir, L.range) : null;
          return { busy: true, fireTech: false };
        }
        // はなした
        const ready = charge.ready;
        charge = null;
        aim = null;
        buffered = false;
        chargeSoundsStop();
        if (!ready) return { busy: false, fireTech: true };
        if (L.kind === 'spiral') {
          // 向きは F1 に 決める。F6 に かぜが 出る
          move = newMove('spiral', { yaw: ctx.yawDeg, total: 5 + L.recovery, strikeF: L.launchF });
          return { busy: true, fireTech: false };
        }
        if (L.kind === 'shining') {
          // WEAPON-7 PR3: うかぶ 40 → とどまる 160 → おりる 40 → もどり 20（ぜんぶ 260）。見る向きは 自由
          move = newMove('shining', { yaw: ctx.yawDeg, total: shiningEndF(L) + SHINING_RECOVERY, strikeF: shiningEndF(L), baseY: ctx.position.y, holdY: ctx.position.y });
          shiningCooldown = L.cooldown;
          emit({ type: 'shiningStart', tick: deps.tick(), power: powerOf(ctx.item) });
          deps.sound?.('shiningStart');
          shiningFrame(L, ctx.item, ctx);
          return { busy: true, fireTech: false };
        }
        const a = aimThunder(deps.world, deps.yokai(), ctx.eye, ctx.dir, L.range);
        const variant = boltVariantOf(seed, strikes++);
        move = newMove('lightning', { S: a.S ? { ...a.S } : null, skyVisible: a.skyVisible, variant, yaw: ctx.yawDeg, total: 5 + L.recovery, strikeF: L.strikeF });
        emit({ type: 'lightningStart', tick: deps.tick(), S: move.S ? { ...move.S } : null, skyVisible: a.skyVisible, variant });
        return { busy: true, fireTech: false };
      }

      // ためて いない: 刀が わざ中なら 先行入力だけ おぼえる
      if (ctx.bladeBusy) {
        // WEAPON-7: つなぎの 窓が 開いている 間の 押しは 刀の 次の 段（ためは 始めない）
        if (ctx.pressed && ctx.startOk && ctx.bladeChainOpen) {
          buffered = false; // 窓の 1F 手前の 押しが のこっていても、段を つないだら ための 先行入力には しない
          return { busy: false, fireTech: true };
        }
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
      riseStart();
      if (charge.ticks >= L.chargeTicks) {
        charge.ready = true;
        emit({ type: 'chargeReady', tick: deps.tick() });
        deps.sound?.('chargeReady');
        riseStop(2, 'off');
        holdStart();
      }
      return { busy: true, fireTech: false };
    },

    state(): LegendStateView {
      const def = legendDefOf(deps.settings, heldItem);
      return {
        item: heldItem && def ? heldItem : null,
        power: heldItem ? powerOf(heldItem) : null,
        charge: charge ? { ticks: charge.ticks, ready: charge.ready } : null,
        move: move ? move.kind : null,
        moveF: move ? move.F : 0,
        cooldownLeft: cooldown,
        aim: aim ? { T: { ...aim.T }, S: aim.S ? { ...aim.S } : null, skyVisible: aim.skyVisible } : null,
        dome: move?.kind === 'shining' && lastDome ? { ...lastDome } : null,
      };
    },

    view(): LegendView {
      const L = chargedOf(legendDefOf(deps.settings, heldItem)?.charge ?? null);
      return {
        kind: L ? L.kind : null,
        chargeTicks: charge ? charge.ticks : null,
        charging: charge !== null,
        ready: !!charge?.ready,
        readyAge: charge?.readyAge ?? 0,
        chargeRatio: charge && L ? Math.min(1, charge.ticks / L.chargeTicks) : 0,
        moveF: move ? move.F : 0,
      };
    },

    motion(): PlayerMotionMod & { noRun: boolean; hoverDy: number | null } {
      motionOut.hoverDy = null;
      motionOut.speedMul = 1;
      motionOut.jumpLocked = false;
      motionOut.noRun = false;
      motionOut.faceDeg = null;
      motionOut.stopNow = false;
      if (move) {
        motionOut.speedMul = 0;
        motionOut.jumpLocked = true;
        // シャイニングは 見る向きが 自由（体の 向きも カメラに ついていく）
        motionOut.faceDeg = move.kind === 'shining' ? null : move.yaw;
        motionOut.stopNow = move.F === 1;
        motionOut.hoverDy = move.kind === 'shining' ? move.hoverDy : null;
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

    shield(): boolean {
      return move?.kind === 'shining' && move.F <= move.strikeF;
    },

    fallSafe(): boolean {
      return move?.kind === 'shining';
    },

    dome() {
      if (move?.kind !== 'shining' || !lastDome) return null;
      return { x: lastPos.x, y: lastDome.centerY, z: lastPos.z, r: lastDome.radius };
    },

    strike() {
      return move && move.kind !== 'shining' ? { S: move.S ? { ...move.S } : null, skyVisible: move.skyVisible, variant: move.variant, F: move.F, total: move.total } : null;
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
      return !!item && chargedOf(legendDefOf(deps.settings, item)?.charge ?? null) !== null;
    },

    chargeSound() {
      chargeSoundOut.rise = snd.rise;
      chargeSoundOut.hold = snd.hold;
      return chargeSoundOut;
    },

    spiralSound(): LegendSoundState {
      return snd.spiral;
    },
  };
}
