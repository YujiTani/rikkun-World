import type { ItemId, LegendaryCharge, PlayerMotionMod, Vec3, VoxelWorld, W2Settings, YokaiWorld } from '../contracts';
import { legendDefOf, legendPowerOf } from './defs';
import type { WaveEvent } from './WaveSystem';
import { aimThunder, thunderTargets, type ThunderAim } from './aim';
import { boltVariantOf } from './thunderModel';
import type { SpiralEvent } from './WaveSystem';
import { easeInOut, shiningCamDistanceAt, shiningHeightAt, shiningRadiusAt, sphereTouchesYokai } from './shining';

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
  | WaveEvent
  | SpiralEvent
  // WEAPON-9: 虹の シャイニング
  | { type: 'shiningStart'; tick: number }
  | { type: 'domeHit'; tick: number; yokaiId: number; damage: number }
  | { type: 'shiningEnd'; tick: number }
  | { type: 'shiningReady'; tick: number }
  | { type: 'domeErase'; tick: number; projectileId: number };

export type LegendSoundName = 'chargeReady' | 'lightning' | 'lightningFar' | 'spiralWind' | 'shiningStart' | 'shiningHit' | 'shiningEnd' | 'shiningReady' | 'domeErase';
/** 続く 音（ため・ため続け）。WEAPON-8 §3.6 */
export type LegendLoopName = 'chargeRise' | 'chargeHold' | 'domePull';
export interface LegendLoopHandle {
  stop(fadeSec: number): void;
}
/** `legend.chargeSound()` の 答え（§3.6）と `legend.spiralSound()` */
export type LegendSoundState = 'off' | 'on' | 'fading';

export interface LegendDeps {
  world: VoxelWorld;
  yokai: () => Pick<YokaiWorld, 'list' | 'raycast' | 'damage' | 'pull'>;
  settings: Pick<W2Settings, 'legendary' | 'legendaryChargeWalk' | 'shiningCamDistance'>;
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
  /** WEAPON-9: 手に 持つ 虹の 強さ（1 本ごと。なければ 設定の まん中） */
  power?: number | null;
  /** WEAPON-9: 足が 地面に ついている（シャイニングの あと 着地するまで 落下ダメージを 出さない） */
  onGround?: boolean;
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
  /** 休みの のこり（シャイニングの あと 600） */
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
  /** 持っている 武器の ためわざの しゅるい（ためわざが なければ null）。手もとの 光の 色を えらぶ */
  kind: 'lightning' | 'spiral' | 'shining' | null;
  /** WEAPON-9: シャイニング中の ドームの 半径（なければ 0）と もとの 足もとの 高さ */
  dome: number;
  groundY: number;
  /** ためF（ためて いなければ null。いっぱいでも 数えつづける） */
  chargeTicks: number | null;
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
  /** WEAPON-8 §3.6: ため音の 区間（窓口 `legend.chargeSound()`） */
  chargeSound(): { rise: LegendSoundState; hold: LegendSoundState };
  /** WEAPON-8 §3.7: らせんの 音の ようす（窓口 `legend.spiralSound()`） */
  spiralSound(): LegendSoundState;
  /** WEAPON-9: 受ける ダメージの 倍率（シャイニング F1〜240 は 1/3。それ以外 1） */
  takenMul(): number;
  /** WEAPON-9 §5.3.1: すいこみの 音の ようす（窓口 `legend.pullSound()`） */
  pullSound(): LegendSoundState;
  /** WEAPON-9: このステップに すわれて いる 妖怪の 位置（すいよせの つぶ用。毎回 同じ 配列） */
  pullers(): readonly Vec3[];
  /** WEAPON-9: ドームの 球（弾を 消す 当たり用）。なければ null。毎回 同じ 入れ物を 返す */
  dome(): { x: number; y: number; z: number; r: number } | null;
  /** WEAPON-9: 落下ダメージを 出さない（シャイニング中と、おわって 着地するまで） */
  noFall(): boolean;
  /** WEAPON-9: 持ちかえ・もちもの画面を 出せない（F1〜240） */
  locked(): boolean;
  /** WEAPON-9: 三人称の カメラの きょり（引いて いない ときは null） */
  camDistance(): number | null;
}

/** もどり（手を おろす）の ステップ数 */
const SHINING_RECOVER = 20;
/** ドームが 消える ステップ（F240） */
const BACK_STEPS = 40;
/** 虹の はじきの 長さ（0.4 秒。10 だと 9 マスが ワープに 見える）・はじかれたあと すわない ステップ */
const PUSH_STEPS = 24;
const PULL_REST = 30;

type Charged = LegendaryCharge;
type ShiningDef = Extract<LegendaryCharge, { kind: 'shining' }>;

/** ため音を 止める ときの 長さ（ステップ）。仕様 §3.6: ため 6 以内・ため続け 15 以内 */
const RISE_FADE_STEPS = 5;
const HOLD_FADE_STEPS = 12;
/** らせんの 音: かべで 消えた ときの 止まる 長さ（12 以内）・とどいた ときに 鳴りつづける 長さ（120 以内） */
const SPIRAL_BLOCK_FADE_STEPS = 10;
const SPIRAL_SOUND_STEPS = 119;

function chargedOf(c: LegendaryCharge | null): Charged | null {
  return c ?? null;
}

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
  /** 持っている 1 本の 強さ（なければ null = 設定の まん中） */
  let heldPower: number | null = null;
  let charge: { ticks: number; ready: boolean; readyAge: number } | null = null;
  let aim: ThunderAim | null = null;
  /** 落雷（F1 から） */
  let move: { kind: 'lightning' | 'spiral' | 'shining'; F: number; S: Vec3 | null; skyVisible: boolean; variant: number; yaw: number; total: number; strikeF: number } | null = null;
  // ---- WEAPON-9: シャイニング
  let sh: { baseY: number; power: number; lastHit: Map<number, number>; def: ShiningDef; worn: boolean } | null = null;
  let cooldownLeft = 0;
  let fallGrace = false;
  let camBack: { from: number; left: number } | null = null;
  const centerNow: Vec3 = { x: 0, y: 0, z: 0 };
  const domeOut = { x: 0, y: 0, z: 0, r: 0 };
  const domeRadiusNow = (): number => (sh && move ? (move.F >= sh.def.riseSteps + sh.def.holdSteps + sh.def.fallSteps ? 0 : shiningRadiusAt(move.F, sh.def.radius, sh.def.riseSteps, sh.def.holdSteps, sh.def.fallSteps)) : 0);
  const lastDist = { v: 4 };
  // すいこみ（§5.3.1）: すわれて いる 妖怪の 位置（つぶ用）・すいこみの 音
  const pulledNow: Vec3[] = [];
  const pulledPool: Vec3[] = [];
  let pulledCount = 0;
  let pullSnd: LegendSoundState = 'off';
  let pullIdle = 0;
  let pullH: LegendLoopHandle | null = null;
  let buffered = false;
  /** やめた あと 押しつづけでは 始めない */
  let needRelease = false;
  let strikes = 0;
  let inWaterNow = false;
  const seed = deps.seed ?? 0;
  const motionOut: PlayerMotionMod & { noRun: boolean } = { speedMul: 1, jumpLocked: false, faceDeg: null, stopNow: false, noRun: false };

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

  /** シャイニングを おわる（F260・やられた・持ちかえ）。休み 600 が 始まる */
  function endShining(early: boolean): void {
    if (!sh) return;
    emit({ type: 'shiningEnd', tick: deps.tick() });
    deps.sound?.('shiningEnd');
    cooldownLeft = sh.def.cooldown;
    fallGrace = true;
    pullStop();
    pulledCount = 0;
    pulledNow.length = 0;
    if (early && move) camBack = { from: lastDist.v, left: BACK_STEPS };
    sh = null;
    move = null;
  }

  /** シャイニングの F ごとの しごと（F1 = はなした ステップ） */
  function shiningTick(F: number): void {
    if (!sh || !move) return;
    const d = sh.def;
    if (F === 1) {
      emit({ type: 'shiningStart', tick: deps.tick() });
      deps.sound?.('shiningStart');
    }
    domeStep(F);
    lastDist.v = shiningCamDistanceAt(F, deps.settings.shiningCamDistance, d.riseSteps, d.holdSteps, d.fallSteps);
    if (F === move.total) endShining(false);
  }

  /**
   * ドームの 当たり ＋ すいこみ（1 ステップに 1 回）。はじく 強さ・当たる 間かく・すう 範囲と 速さは データ（settings.legendary）から。
   * ふれた → ダメージと はじき。ふれて いなくて 範囲 内（とどまる F41〜200）→ すいよせる
   */
  function domeStep(F: number): void {
    pulledCount = 0;
    pulledNow.length = 0;
    if (!sh || !move) return;
    const d = sh.def;
    const r = shiningRadiusAt(F, d.radius, d.riseSteps, d.holdSteps, d.fallSteps);
    const over = F >= d.riseSteps + d.holdSteps + d.fallSteps || !(r > 0);
    const pulling = F > d.riseSteps && F <= d.riseSteps + d.holdSteps;
    if (over) {
      pullSoundTick();
      return;
    }
    const c = centerNow;
    const dmg = round2(sh.power * d.damageMul);
    const ramp = Math.min(1, (F - d.riseSteps) / 10);
    let hitSound = false;
    const yw = deps.yokai();
    for (const y of yw.list()) {
      if (y.state === 'dying' || y.state === 'leaving') continue;
      const last = sh.lastHit.get(y.id);
      if (sphereTouchesYokai(c, r, y)) {
        if (last !== undefined && F - last < d.hitEvery) continue;
        sh.lastHit.set(y.id, F);
        yw.damage(y.id, dmg, { x: c.x, y: c.y, z: c.z }, { dist: d.push[0], up: d.push[1], ticks: PUSH_STEPS, heavy: true });
        emit({ type: 'domeHit', tick: deps.tick(), yokaiId: y.id, damage: dmg });
        hitSound = true;
      } else if (pulling && (last === undefined || F - last > PULL_REST) && yw.pull) {
        const dist = Math.hypot(y.position.x - c.x, y.position.z - c.z);
        if (dist > d.pullRange) continue;
        yw.pull(y.id, c.x, c.z, (d.pullSpeed / 60) * ramp);
        const q = (pulledPool[pulledCount] ??= { x: 0, y: 0, z: 0 });
        q.x = y.position.x;
        q.y = y.position.y;
        q.z = y.position.z;
        pulledNow.push(q);
        pulledCount++;
      }
    }
    if (hitSound) {
      deps.sound?.('shiningHit');
      // たいきゅうは 1 回の シャイニングで 1（1 体 以上に 当てた とき）
      if (!sh.worn) {
        sh.worn = true;
        deps.onWear?.();
      }
    }
    pullSoundTick();
  }

  /** すいこみの 音: 1 体 以上 すわれて いる 間 1 つ。だれも すわれなく なって 10 ステップで 止まる */
  function pullSoundTick(): void {
    if (pulledCount > 0) {
      pullIdle = 0;
      if (pullSnd !== 'on') {
        pullSnd = 'on';
        pullH = deps.loop?.('domePull') ?? null;
      }
    } else if (pullSnd === 'on' && ++pullIdle >= 10) pullStop();
    else if (pullSnd === 'fading') pullSnd = 'off';
  }
  function pullStop(): void {
    if (pullSnd !== 'on') return;
    pullH?.stop(0.15);
    pullH = null;
    pullSnd = 'fading';
  }

  return {
    step(ctx: LegendStepCtx): LegendStepResult {
      tickSounds();
      // WEAPON-9: 休み（プレイヤーに 1 つ。何を 持っていても 進む）と 落下ダメージの 見のがし
      if (cooldownLeft > 0 && --cooldownLeft === 0) {
        emit({ type: 'shiningReady', tick: deps.tick() });
        deps.sound?.('shiningReady');
      }
      if (fallGrace && !sh && ctx.onGround) fallGrace = false;
      if (camBack && --camBack.left <= 0) camBack = null;
      centerNow.x = ctx.position.x;
      centerNow.y = ctx.position.y + 0.9;
      centerNow.z = ctx.position.z;
      const def = legendDefOf(deps.settings, ctx.item);
      const L = chargedOf(def?.charge ?? null);
      heldItem = L ? ctx.item : null;
      heldPower = L ? (ctx.power ?? null) : null;
      inWaterNow = ctx.inWater;
      if (sh && (!L || !ctx.item || !ctx.active)) endShining(true);
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
          if (move.F === move.strikeF) {
            if (move.kind === 'lightning' && L.kind === 'lightning') strikeNow(L, ctx.item);
            else if (move.kind === 'spiral') deps.launchSpiral?.({ item: ctx.item, dirDeg: move.yaw });
          }
          if (move.kind === 'shining') shiningTick(move.F);
          // 先行入力: さいご 8F
          if (move && ctx.pressed && ctx.startOk && move.F > move.total - 8) buffered = true;
          return { busy: true, fireTech: false };
        }
      }

      // ため中
      if (charge) {
        if (ctx.held) {
          charge.ticks += 1;
          if (!charge.ready && charge.ticks >= L.chargeTicks && cooldownLeft === 0) {
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
        if (L.kind === 'shining') {
          // WEAPON-9: シャイニング。はなした ステップが F1（ドームは 小さく 出はじめる）
          sh = { baseY: ctx.position.y, power: legendPowerOf(deps.settings, ctx.item, ctx.power) ?? 1, lastHit: new Map(), def: L, worn: false };
          move = { kind: 'shining', F: 1, S: null, skyVisible: true, variant: 0, yaw: ctx.yawDeg, total: L.riseSteps + L.holdSteps + L.fallSteps + SHINING_RECOVER, strikeF: 0 };
          camBack = null;
          shiningTick(1);
          return { busy: true, fireTech: false };
        }
        if (L.kind === 'spiral') {
          // 向きは F1 に 決める。F6 に かぜが 出る
          move = { kind: 'spiral', F: 1, S: null, skyVisible: true, variant: 0, yaw: ctx.yawDeg, total: 5 + L.recovery, strikeF: L.launchF };
          return { busy: true, fireTech: false };
        }
        const a = aimThunder(deps.world, deps.yokai(), ctx.eye, ctx.dir, L.range);
        const variant = boltVariantOf(seed, strikes++);
        move = { kind: 'lightning', F: 1, S: a.S ? { ...a.S } : null, skyVisible: a.skyVisible, variant, yaw: ctx.yawDeg, total: 5 + L.recovery, strikeF: L.strikeF };
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
      if (charge.ticks >= L.chargeTicks && cooldownLeft === 0) {
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
        power: heldItem ? legendPowerOf(deps.settings, heldItem, heldPower) : null,
        charge: charge ? { ticks: charge.ticks, ready: charge.ready } : null,
        move: move ? move.kind : null,
        moveF: move ? move.F : 0,
        cooldownLeft,
        aim: aim ? { T: { ...aim.T }, S: aim.S ? { ...aim.S } : null, skyVisible: aim.skyVisible } : null,
        dome: domeRadiusNow() > 0 ? { radius: domeRadiusNow() } : null,
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
        dome: domeRadiusNow(),
        groundY: sh ? sh.baseY : 0,
      };
    },

    motion(): PlayerMotionMod & { noRun: boolean } {
      motionOut.hoverY = null;
      if (sh && move && move.F < sh.def.riseSteps + sh.def.holdSteps + sh.def.fallSteps) {
        motionOut.hoverY = sh.baseY + shiningHeightAt(move.F, sh.def.rise, sh.def.riseSteps, sh.def.holdSteps, sh.def.fallSteps);
      }
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

    pullSound(): LegendSoundState {
      return pullSnd;
    },

    pullers(): readonly Vec3[] {
      return pulledNow;
    },

    takenMul(): number {
      return sh && move && move.F <= sh.def.riseSteps + sh.def.holdSteps + sh.def.fallSteps ? sh.def.takenMul : 1;
    },

    dome() {
      const r = domeRadiusNow();
      if (!(r > 0)) return null;
      domeOut.x = centerNow.x;
      domeOut.y = centerNow.y;
      domeOut.z = centerNow.z;
      domeOut.r = r;
      return domeOut;
    },

    noFall(): boolean {
      return sh !== null || fallGrace;
    },

    locked(): boolean {
      return sh !== null && move !== null && move.F <= sh.def.riseSteps + sh.def.holdSteps + sh.def.fallSteps;
    },

    camDistance(): number | null {
      if (sh && move) return lastDist.v;
      if (camBack) return 4 + (camBack.from - 4) * (1 - easeInOut(1 - camBack.left / BACK_STEPS));
      return null;
    },
  };
}
