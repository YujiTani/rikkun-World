/**
 * 道具・刀・弓・W2 の設定・レジェンダリー（LegendaryDef など）の型。`src/contracts.ts` から分けた（中身は移しただけ）。
 */

import type { Inventory, ItemId } from './items';
import type { PlayerMotionMod } from './player';
import type { Vec3, VoxelWorld } from './world';
import type { YokaiWorld } from './yokai';

export type ToolKind = 'hand' | 'pickaxe' | 'blade' | 'bow' | 'other';

export interface ToolInfo {
  item: ItemId | null;
  kind: ToolKind;
  /** ほる強さ */
  power: number;
  /** ほれるレベル */
  level: number;
  /** たたく強さ */
  damage: number;
  /** とどく距離 */
  reach: number;
  /** 当たるまでのステップ */
  ticks: number;
}

export type SwingAnim =
  | 'slash'
  | 'thrust'
  | 'sweep'
  | 'draw'
  | 'release'
  | 'punch'
  | 'dig'
  | 'place'
  | 'whiff'
  | 'throw'
  // WEAPON-2（刀の わざ。かまえ を かえる は 'stance'）
  | 'kesa'
  | 'kiriage'
  | 'stance';

/** 手に持っているものの働き。担当 B が `src/tools/` で実装する */
export interface ToolSystem {
  current(): ToolInfo;
  /** うでの動きを始めたとき（人形の動き用。呼ぶと空） */
  drainSwings(): { anim: SwingAnim; tick: number }[];
  /** WEAPON-2: ゆみ（担当 B が `src/tools/bow/` で作り、ToolSystemImpl が 持つ） */
  bow?(): BowSystem;
}

// ---------------------------------------------------------------- 刀（A）

export type BladeStance = 'chudan' | 'jodan' | 'gedan';

export type BladeTech = 'thrust' | 'kesa' | 'kiriage';

export type BladePhase = 'idle' | 'switch' | 'startup' | 'active' | 'recovery';

export interface BladeState {
  /** 刀を 持っていれば その アイテム（持っていない・こわれたら null） */
  item: ItemId | null;
  stance: BladeStance;
  /** わざの 最中だけ */
  tech: BladeTech | null;
  phase: BladePhase;
  /** わざ（か かまえ変え）を 始めた ステップを 1 とした F。`idle` は 0 */
  frame: number;
  /** 先行入力で おぼえている もの（1 つだけ） */
  buffered: 'tech' | 'stance' | null;
  /** `phase` が `switch` の とき 前の かまえ（なめらかに うつす 用）。ほかは null */
  switchFrom: BladeStance | null;
  /** CHAR-2: わざの あいだだけ ふみこみ（それ以外は null）。dirDeg = わざの向き u、origin = 始めた足もと O、target = A(f)、moved = 実際に u へ進んだ きょり */
  move: { dirDeg: number; origin: Vec3; target: number; moved: number; tiltDeg: number } | null;
  /** WEAPON-6: 今の わざの 長さ（2・3 段目は 出だしが ちぢむ）。idle・かまえ変えは null */
  lengths?: BladeTechFrames | null;
  /**
   * WEAPON-6: 3 段攻撃の ようす（つながる刀で わざの あいだだけ。ほかは null）。
   * open = 今の F が つなぎの窓の 中、cancelAt = キャンセルできる F（C）、queued = つなぎを おぼえている
   */
  combo?: { step: 1 | 2 | 3; queued: boolean; open: boolean; cancelAt: number | null } | null;
}

export type BladeStep = 1 | 2 | 3;

/** 今の 当たりの 形（世界の 座標。§6.1） */
export type BladeShapeInfo =
  | { kind: 'capsule'; from: Vec3; to: Vec3; radius: number }
  | {
      kind: 'fan';
      center: Vec3;
      forward: Vec3;
      halfAngleDeg: number;
      rMin: number;
      rMax: number;
      yMin: number;
      yMax: number;
    };

export type BladeEvent =
  | { type: 'techStart'; tick: number; tech: BladeTech; step?: BladeStep }
  | { type: 'techHit'; tick: number; tech: BladeTech; yokaiId: number; damage: number; knock: number; up: number; position: Vec3; step?: BladeStep }
  | { type: 'techMiss'; tick: number; tech: BladeTech; step?: BladeStep }
  | { type: 'stance'; tick: number; from: BladeStance; to: BladeStance }
  | { type: 'cancel'; tick: number };

/** 刀に 毎ステップ わたすもの。ふりわけ（わざ か ほる か しゅうかく）は つなぎ込みの DigSystem が 決めて、わざ なら techPressed / techHeld を 立てる */
export interface BladeStepContext {
  /** 手に 持っている 刀（ぼくとう・かたな・きらめく カタナ）。刀でなければ null（わざ・かまえは おわる） */
  item: ItemId | null;
  /** このステップに ひだりクリック を 押した **そして ふりわけが わざ** */
  techPressed: boolean;
  /** ひだりクリック を おしつづけている **そして ふりわけが わざ**（おしつづけの くりかえし用） */
  techHeld: boolean;
  /** `stanceNext`（R）を このステップに 押した */
  stancePressed: boolean;
  /** 目の 位置 E */
  eye: Vec3;
  /** 照準の 方向 d（長さ 1。上下を ふくむ） */
  dir: Vec3;
  /** 足もと P */
  position: Vec3;
  yawDeg: number;
  /** false（やられた・案内画面 など）の ときは わざを 始めない・今の わざは やめる */
  active: boolean;
  /** WEAPON-3: 体の点 B（P の 真上。肩の高さ） */
  body: Vec3;
  /** WEAPON-3: わざの向き u（度。始めたステップで 固定） */
  attackDirDeg: number;
  /** WEAPON-3: 向きの補助で えらんだ 妖怪 T の 中心の 点（なければ null） */
  attackTarget: Vec3 | null;
}

export interface BladeDeps {
  world: VoxelWorld;
  yokai: () => YokaiWorld;
  settings: W2Settings;
  /** 刀の 強さ（`weaponDamage`。ぼくとう 2・かたな 4・きらめく カタナ 4） */
  weaponDamage: (item: ItemId) => number;
  /** わざが 1 体 以上 に 当たった（1 回の わざで 1 回）。つなぎ込みが `inventory.wearHeld(settings.toolWear.blade.hit)` につなぐ */
  onHit: (info: { tech: BladeTech; count: number }) => void;
  /** わざの ふみこみ。水平に dx, dz だけ 動かして、かべで 止まった あとの 実際に 動いた量を 返す（つなぎ込みが プレイヤー側で 動かす） */
  lunge?: (dx: number, dz: number) => { x: number; z: number };
  tick: () => number;
}

/** 刀のしくみ。担当 A が `src/tools/blade/` で作る（`createBladeSystem(deps)`） */
export interface BladeSystem {
  state(): BladeState;
  /** かまえを すぐ かえる（準備用。8F なし） */
  setStance(s: BladeStance): void;
  /** 1 ステップ（止まっている あいだは 呼ばない） */
  update(ctx: BladeStepContext): void;
  /** 今の 当たりの 形（持続 の あいだ だけ。なければ null） */
  shape(): BladeShapeInfo | null;
  motion(): PlayerMotionMod;
  /** 画面と音用（呼ぶと空） */
  drainEvents(): BladeEvent[];
  /** テストの窓口用（読んでも 空にならない） */
  peekEvents(): BladeEvent[];
  /** WEAPON-5: 先行入力を すてる（パリィが 勝った とき） */
  dropBuffer?(): void;
  /** WEAPON-5: 次の ステップを すすめたあとも わざ・かまえ替えが つづくか（パリィを すぐ 出せるか）・先行入力の 区間か */
  busyNext?(parryPress?: boolean): { busy: boolean; accepts: boolean };
  /** WEAPON-6: 次に わざが 始まるなら どの わざ・何段目か（向きの補助の 届く距離を 段ごとに 見る用） */
  nextStart?(): { tech: BladeTech; step: BladeStep };
  /** WEAPON-6: パリィが 始まった ステップに、つなぎの窓の わざを やめる（イベントは 出さない） */
  yieldToParry?(): void;
}

// ---------------------------------------------------------------- 弓（B）

export type BowStage = 0 | 1 | 2 | 3;

export interface BowState {
  drawing: boolean;
  /** 押してから 何ステップか（押した ステップ = 1） */
  drawTicks: number;
  stage: BowStage;
  /** 次に ひけるまで のこり ステップ（0 = ひける） */
  nockLeft: number;
}

/** 弓の しなり（一人称・三人称で 同じ値。C が 絵に する） */
export interface BowPose {
  stage: BowStage;
  /** つるを 引く 量 0〜1 */
  pull: number;
  /** 弓の まがり（度）。段 3 は ふるえ を ふくむ */
  bendDeg: number;
}

export interface ArrowInfo {
  id: number;
  position: Vec3;
  velocity: Vec3;
  /** 飛んでから の ステップ */
  age: number;
}

export interface StuckArrowInfo {
  id: number;
  position: Vec3;
  /** ささった ときの 飛んでいた 向き（長さ 1） */
  dir: Vec3;
  age: number;
}

export type BowEvent =
  | { type: 'drawStart'; tick: number }
  | { type: 'stage'; tick: number; stage: 1 | 2 | 3 }
  | { type: 'arrowShot'; tick: number; stage: 1 | 2 | 3; speed: number; position: Vec3; velocity: Vec3 }
  | { type: 'arrowHit'; tick: number; yokaiId: number; damage: number; position: Vec3 }
  | { type: 'arrowStick'; tick: number; position: Vec3 }
  | { type: 'arrowEnd'; tick: number; position: Vec3 }
  | { type: 'dryRelease'; tick: number }
  | { type: 'noArrow'; tick: number }
  | { type: 'pickup'; tick: number };

export interface BowStepContext {
  /** 手に 持っているのが ゆみ なら その アイテム、ちがえば null（ひくのを やめる。や は へらない） */
  item: ItemId | null;
  /** ひだりクリック を このステップに 押した */
  pressed: boolean;
  /** おしている */
  held: boolean;
  eye: Vec3;
  /** 照準の 方向 d（長さ 1。上下を ふくむ） */
  dir: Vec3;
  /** 足もと P（や を 拾う 判定用） */
  position: Vec3;
  /** false（やられた・案内画面 など）の ときは ひかない */
  active: boolean;
}

export interface BowDeps {
  world: VoxelWorld;
  yokai: () => YokaiWorld;
  settings: W2Settings;
  inventory: Pick<Inventory, 'count' | 'remove' | 'add' | 'canAdd'>;
  /** や を 1 本 うった。つなぎ込み（か ToolSystemImpl）が `inventory.wearHeld(settings.toolWear.bow.shot)` につなぐ */
  onShot: () => void;
  /** や が 妖怪に 当たった / ささった（実績 `arrowHit` 用） */
  tick: () => number;
}

/** 弓と や。担当 B が `src/tools/bow/` で作る（`createBowSystem(deps)`。`ToolSystem.bow()` が 返す） */
export interface BowSystem {
  state(): BowState;
  pose(): BowPose;
  update(ctx: BowStepContext): void;
  arrows(): ArrowInfo[];
  stuck(): StuckArrowInfo[];
  motion(): PlayerMotionMod;
  drainEvents(): BowEvent[];
  peekEvents(): BowEvent[];
}

// ---------------------------------------------------------------- 見た目（A・B → C）

/** 人形・一人称の 絵が 読む 武器の 今の 形（C の `CameraRig.setWeaponSource` に わたす） */
export interface WeaponVisualSource {
  /** 刀を 持っていない ときは `item` が null の 状態 */
  blade(): BladeState;
  /** 弓を ひいていない ときは `{stage:0, pull:0, bendDeg:0}` */
  bowPose(): BowPose;
}

// ---------------------------------------------------------------- 設定（§4.2〜§4.6）

/** CHAR-2: 刀の わざの 絵の データ（atlas.json の ticks・advance・step と 同じ） */
export interface BladeAdvanceCurve {
  ticks: number[];
  advance: number[];
  step: number;
}

export interface BladeTechFrames {
  startup: number;
  active: number;
  recovery: number;
}

/** WEAPON-6 §4.7 */
export interface BladeComboSettings {
  items: ItemId[];
  order: Record<BladeStance, BladeTech[]>;
  /** 2・3 段目の 出だし */
  stepStartup: Record<BladeTech, number>;
  /** ふりぬき（見せる ステップ） */
  follow: Record<BladeTech, number>;
  /** 2 段目の ふみこみの 線（あれば bladeAdvance の かわりに） */
  step2Advance: Partial<Record<BladeTech, BladeAdvanceCurve>>;
}

export interface W2Settings {
  // 刀（§4.2・§4.3）
  bladeTech: Record<BladeTech, BladeTechFrames>;
  stanceSwitchTicks: number;
  /** 先行入力: 硬直の さいご 何F から 受けるか（突きは 持続から） */
  bladeBufferTicks: number;
  /** わざの あいだの 歩く 速さの 倍率（CHAR-2: 4 つとも 0 = 歩けない。体は ふみこみ だけで 動く） */
  bladeMoveMul: { thrust: number; kesaStartupActive: number; kesaRecovery: number; kiriage: number };
  /** CHAR-2: わざの 絵の ふみこみ（初期値は art の atlas.json を 写す） */
  bladeAdvance: Record<BladeTech, BladeAdvanceCurve>;
  /** WEAPON-6: 3 段攻撃（きらめく カタナだけ） */
  bladeCombo: BladeComboSettings;
  /** 照準の 線で 妖怪を わざに ふりわける 距離 */
  bladeAimReach: number;
  /** WEAPON-4: 刀ごとの 射程 R（3 つのわざで 同じ）。表にない 刀は かたなの 値 */
  bladeReach: Partial<Record<ItemId, number>>;
  /** 注意（WEAPON-4）: thrust.length・kesa/kiriage.rMax は もう 使わない（射程は bladeReach）。半径・角・高さ・rMin だけ 効く */
  bladeShape: {
    thrust: { length: number; radius: number };
    kesa: { halfAngleDeg: number; rMin: number; rMax: number; yMin: number; yMax: number };
    kiriage: { halfAngleDeg: number; rMin: number; rMax: number; yMin: number; yMax: number };
  };
  bladeDamageMul: Record<BladeTech, number>;
  /** [水平の 距離, 上への 初速] */
  bladeKnock: Record<BladeTech, [number, number]>;
  // 弓（§4.4）。段 1・2・3 の 順
  bowStageTicks: [number, number, number];
  bowSpeed: [number, number, number];
  bowDamage: [number, number, number];
  /** GOLD-1 §4.3: ゆみ ごと の や の つよさ（段 1・2・3）。なければ `bowDamage`。きんの ゆみ = 2・3・5 */
  bowDamageByItem: Partial<Record<ItemId, [number, number, number]>>;
  bowKnock: [number, number, number];
  arrowGravity: number;
  arrowLifeTicks: number;
  bowNockTicks: number;
  arrowStuckTicks: number;
  arrowStuckMax: number;
  /** ささった や を 拾う はんい [水平, 高さ] */
  arrowPickupRange: [number, number];
  bowMoveMul: number;
  bowBend: { pull: [number, number, number]; bendDeg: [number, number, number]; blendTicks: number };
  // たいきゅう（§4.6）
  toolDurability: Partial<Record<ItemId, number>>;
  toolWear: {
    pickaxe: { block: number; hit: number };
    blade: { block: number; hit: number };
    bow: { shot: number };
    kuwa: { till: number; block: number; hit: number };
    armorDiv: number;
  };
  /** のこり わずか（のこり ÷ 新品 が これ 以下。切り上げで 数える） */
  wearLowRatio: number;
  /** WEAPON-7 §2.1: レジェンダリー武器の データ（1 つ 足すと 武器が ふえる）。ためわざ・ふつうの わざに 足す 効果・持っている 間の 効果 */
  legendary: LegendaryDef[];
  /** WEAPON-7 §2.3: ヌシの ドロップ表（weight で ランダムに 1 本。初期値 = legendary の ぜんぶ・weight 1） */
  nushiDrops: NushiDropRow[];
  /** WEAPON-7 §2.2: ため中の 歩く 倍率 */
  legendaryChargeWalk: number;
  /** WEAPON-9 §5.6: 三人称で シャイニング中に カメラを 引く きょり（4 = 引かない） */
  shiningCamDistance: number;
  /** 刀を ふった ときの きせき（武器ごとの 個性。オーナー決定）。style: plain=ふつう・star=星が まじる・long=長い 弧 */
  bladeTrail: Partial<Record<ItemId, BladeTrailStyle>>;
  // WEAPON-3（§4.7）
  /** 向きの補助の 片がわの 角（度）。0 以下で 補助なし。刀・パンチ どちらにも 使う */
  bladeFaceAssistDeg: number;
  /** 突きを 上下へ かたむける 上限（度） */
  thrustTiltMaxDeg: number;
  /** パンチの 扇の柱（届く距離は punchReach・weaponReach） */
  punchShape: { halfAngleDeg: number; yMin: number; yMax: number };
  bladeTrailShape: BladeTrailShape;
  /** 軌跡を 書く 絵の時 τ（CHAR-4 §4.2） */
  bladeTrailWindow: Record<BladeTech, [number, number]>;
  // WEAPON-5（刀の パリィ。§4.7）
  /** かまえ・受け・すき（ステップ） */
  parryTicks: { ready: number; guard: number; recover: number };
  /** すきの はじめの 何ステップが 半分か */
  parryEarlyTicks: number;
  /** 成功のあとの きめ（ステップ） */
  parryKimeTicks: number;
  /** おしい（F1〜2・早すぎ）の ダメージの 倍率（切り上げ） */
  parryEarlyMul: number;
  /** 受けられる 向き（前から 左右 何度まで） */
  parryArcDeg: number;
  /** スロー（ステップ数・ゲームの時間の倍率） */
  parrySlow: { ticks: number; scale: number };
  /** 青白い光（ステップ） */
  parryGlowTicks: number;
  /** よろけ（ステップ） */
  staggerTicks: number;
  /** よろけ中の 次の一撃の 倍率 */
  staggerDamageMul: number;
  /** はね返した 火の玉（速さ ブロック/秒・とどく きょり・ダメージ = 火の玉の強さ × damageMul） */
  reflectFireball: { speed: number; range: number; damageMul: number };
}

// ---------------------------------------------------------------- WEAPON-7（レジェンダリー武器）

/** ためわざ。`kind` で 中身を 差しかえる（§2.1）。新しい ためわざは `kind` を 1 つ 足す。`shining` は PR3 で 作る */
export type LegendaryCharge =
  | { kind: 'lightning'; chargeTicks: number; range: number; radius: number; damageMul: number; knock: [number, number]; strikeF: number; boltSteps: number; recovery: number }
  | { kind: 'spiral'; chargeTicks: number; launchF: number; recovery: number; speed: number; range: number; radius: number; damageMul: number; knock: [number, number] }
  | { kind: 'shining'; chargeTicks: number; rise: number; riseSteps: number; holdSteps: number; fallSteps: number; radius: number; damageMul: number; hitEvery: number; push: [number, number]; cooldown: number; takenMul: number; pullRange: number; pullSpeed: number };

/** ふつうの わざに 足す 効果（見た目・音・弾）。`wave` は PR2 で 作る */
export type LegendaryAttackFx =
  | { kind: 'trail'; style: 'thunder' | 'rainbow' }
  | { kind: 'wave'; speed: number; range: number; radius: number; damageMul: number; knock: [number, number] };

/** 手に 持っている 間の 効果。`moveMul` は PR2 で 作る */
export type LegendaryPassive = { kind: 'moveMul'; mul: number };

export interface LegendaryDef {
  item: ItemId;
  /** 強さ P。[最小, 最大] なら 落ちた ときに 整数で 決めて その 1 本に 保存（PR3） */
  power: number | [number, number];
  /** ためわざ（null = ためない。押しつづけは 今どおり くり返す） */
  charge: LegendaryCharge | null;
  onAttack: LegendaryAttackFx[];
  passive: LegendaryPassive[];
}

export interface NushiDropRow {
  item: ItemId;
  weight: number;
}

export interface BladeTrailStyle {
  /** 軌跡の色 */
  color: number;
  /** 軌跡の そとの光 */
  glow: number;
  /** キャラの絵の 刃の地（色見本の 20 番を これに） */
  blade: number;
  /** 刃の ふちの光（21 番を これに） */
  bladeShine: number;
  /** plain=ふつう・star=星が まじる・long=長い 弧・thunder=ふちに 小さな いなずま（雷神剣） */
  style: 'plain' | 'star' | 'long' | 'thunder' | 'rainbow' | 'gold';
  /** GOLD-1 試作: いちばん うちがわの 帯の 下地の 色（あかるい 空でも 見える）。なければ color */
  under?: number;
}

/** CHAR-4 §4.4: 軌跡の 形・だん・消え方 */
export interface BladeTrailShape {
  widthRatio: number;
  minWidth: number;
  lifeSteps: number;
  segPerStep: number;
  maxSegs: number;
  bandEdges: [number, number, number];
  bandAlpha: [number, number, number, number];
  fadeAges: [number, number, number];
  starAt: [number, number, number];
  starMaxAge: number;
}
