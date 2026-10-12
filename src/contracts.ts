/**
 * つなぎ目の約束（M1）。PO が決める。型だけで、処理は書かない。
 * 並列で作業する開発者どうしは、このファイルの形だけを頼りにつながる。
 * 変えたいときは PO に相談する（勝手に変えない）。
 * 担当の割り振り: docs/tickets/M1-dev-split.md
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

// ---------------------------------------------------------------- ブロック（T2）

/** M1-01 4-2 のブロック 11 種 */
export type BlockId =
  | 'air'
  | 'grass'
  | 'dirt'
  | 'stone'
  | 'sand'
  | 'log'
  | 'leaves'
  | 'coal_ore'
  | 'iron_ore'
  | 'water'
  | 'bedrock'
  // M4
  | 'furnace' // かまど
  | 'kawara' // かわら
  | 'brick' // レンガ
  // M4 光（オーナー決定: マイクラと同じ明るさの仕組み）
  | 'torch' // たいまつ（置ける。光る。固くない）
  | 'start_torch'; // スタート地点の こわれない たいまつ

export interface BlockType {
  id: BlockId;
  /** ひらがなの名前 */
  name: string;
  solid: boolean;
  breakable: boolean;
}

/** ブロックの入れ物。T2 が `src/world/VoxelWorld.ts` で実装する */
export interface VoxelWorld {
  readonly size: { x: number; y: number; z: number };
  /** 整数座標。範囲外は 'outside' */
  getBlock(x: number, y: number, z: number): BlockId | 'outside';
  /** 範囲外・知らない id は false で何もしない。変わったチャンクは描画側に伝わる */
  setBlock(x: number, y: number, z: number, id: BlockId): boolean;
  /** 固いブロックなら true。範囲外は false（世界の端は T3 が面で止める） */
  isSolid(x: number, y: number, z: number): boolean;
}

// ---------------------------------------------------------------- 島生成（T1）

export interface SpawnPoint {
  /** 足もとの中央 */
  x: number;
  y: number;
  z: number;
  yawDeg: number;
  pitchDeg: number;
}

export interface TestArea {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  y0: number;
  y1: number;
}

/** 島を作った結果。T1 が `src/world/gen/generateIsland.ts` で実装する */
export interface IslandInfo {
  readonly seed: number;
  readonly genTimeMs: number;
  /** 地面の高さ h（M1-01 4-1） */
  groundHeight(x: number, z: number): number;
  /** 呼んだ時点の world で計算した戻る場所（M1-01 4-7） */
  spawn(): SpawnPoint;
  testArea(): TestArea;
}

/** 空の world に島を書きこむ */
export type GenerateIsland = (seed: number, world: VoxelWorld) => IslandInfo;

// ---------------------------------------------------------------- 入力・スタート画面（T5）

/** マウスの動き（ピクセル。右・下が正）。T5 が作り、T3 が読む */
export interface LookSource {
  /** 前回から動いた量を返して 0 に戻す。ロックが外れている間は常に {dx:0, dy:0} */
  consume(): { dx: number; dy: number };
}

/** ポインターロックと案内画面の状態。T5 が作る */
export interface LockStatus {
  locked(): boolean;
  overlayVisible(): boolean;
  /** 実時間のゲームループを進めてよいか（M1-02 §2.4）。step() はこれに関係なく進む */
  realtimeAllowed(): boolean;
  /** 遊びの入力（移動・ジャンプ・向き）を受け付けてよいか */
  playInputEnabled(): boolean;
}

// ---------------------------------------------------------------- プレイヤー（T3）

export interface PlayerState {
  /** 足もとの中央 */
  position: Vec3;
  velocity: Vec3;
  /** 0 以上 360 未満。0 = 北（-Z）、上から見て時計回り（M1-02 §4.3） */
  yawDeg: number;
  /** 0 = 水平、上がプラス */
  pitchDeg: number;
  onGround: boolean;
  inWater: boolean;
  /** 水平に動いているか（人形の手足を振るため） */
  moving: boolean;
}

// ---------------------------------------------------------------- テスト用窓口の入れ物

/** `window.__rikkun` に入る名前空間。各担当が中身（関数の入れ物）を作り、つなぎ込み担当が組み立てる */
export type HookNamespace = Record<string, (...args: never[]) => unknown>;

// ================================================================ M2（掘る・置く・持ち物）
// 担当の割り振り: docs/tickets/M2-dev-split.md。仕様: docs/design/M2-dig-inventory.md

/**
 * アイテムだけのもの（置けない）。M3 で妖怪のドロップを足した（オーナー決定）。M4 で道具を足す。
 * yokai_orb は M3 第 1 版の名残り（使わなくなったが、型を壊さないため残す）
 */
export type ItemOnlyId =
  | 'yokai_orb'
  | 'paper' // かみ
  | 'oil' // あぶら
  | 'string' // いと
  | 'cloth' // ぬの
  | 'clay' // ねんど
  | 'crystal' // すいしょう（レア度の低い宝石）
  // M4（docs/design/M4-craft.md §4.4）
  | 'wood_pickaxe'
  | 'stone_pickaxe'
  | 'iron_pickaxe'
  | 'iron_ingot'
  | 'bokuto'
  | 'katana'
  | 'naginata'
  | 'crystal_katana'
  | 'yumi'
  | 'ya'
  | 'kabuto'
  | 'yoroi'
  | 'kote' // こて（籠手）
  | 'suneate' // すねあて（脛当て）
  | 'torch'
  | 'lantern'
  | 'kite'
  | 'futon'
  | 'omamori'
  | 'waraji'
  | 'haniwa';

/** アイテムの種類。ブロックとアイテムだけのもの */
export type ItemId = BlockId | ItemOnlyId;

export interface ItemStack {
  item: ItemId;
  count: number;
}

export interface ItemType {
  id: ItemId;
  /** ひらがな */
  name: string;
  maxStack: number;
  /** 置くと何のブロックになるか。置けないものは null */
  placeBlock: BlockId | null;
}

/** 持ち物（36 マス。0〜8 がホットバー）。担当 AB が `src/inventory/` で実装する */
export interface Inventory {
  readonly size: number;
  slots(): ReadonlyArray<ItemStack | null>;
  selected(): number;
  select(index: number): void;
  /** ホットバーのとなりへ（ぐるっと回る） */
  selectNext(dir: 1 | -1): void;
  setSlot(index: number, stack: ItemStack | null): void;
  clear(): void;
  /** 入らなかった数を返す */
  add(item: ItemId, count: number): number;
  count(item: ItemId): number;
  /** 取り出せた数を返す */
  remove(item: ItemId, count: number): number;
  /** 1 こでも入るか */
  canAdd(item: ItemId): boolean;
  /** 今えらんでいるマス（手に持っているもの） */
  held(): ItemStack | null;
  /** 手に持っているマスから 1 こ減らす。減らせたら true */
  consumeHeld(): boolean;
  /** もちもの画面でのクリック（M2 §2.5） */
  click(index: number): void;
  cursor(): ItemStack | null;
  /** 閉じるとき、カーソルのものを「持ち上げたマス」へ戻す */
  returnCursor(): void;
  itemTypes(): ItemType[];
  serialize(): unknown;
  deserialize(data: unknown): void;
  /** 中身が変わったら呼ばれる。戻り値で解除 */
  onChange(fn: () => void): () => void;
}

export interface TargetInfo {
  block: Vec3;
  id: BlockId;
  /** 面の外向きの向き（各成分 −1・0・1） */
  face: Vec3;
  /** 置く場所（世界の外でもそのまま） */
  place: Vec3;
  /** 目から面まで */
  distance: number;
}

export type DigBlockedReason = 'needTool' | 'unbreakable';

export interface DigState {
  active: boolean;
  block: Vec3 | null;
  /** 0〜1 */
  progress: number;
  /** 0〜3（3 = MAX。あとひと押しでこわれる） */
  crackStage: number;
  /** ひびが MAX で、ひと押しを待っている */
  ready: boolean;
  blockedReason: DigBlockedReason | null;
}

export type DigEvent =
  /** count: 手に入った数（ドロップ数はランダム。入りきらなかった分はふくまない） */
  | { type: 'break'; tick: number; block: Vec3; id: BlockId; gotItem: boolean; count: number }
  | { type: 'place'; tick: number; block: Vec3; id: BlockId }
  /** ひびが MAX になった（あとひと押しでこわれる。オーナー決定 B） */
  | { type: 'ready'; tick: number; block: Vec3; id: BlockId }
  | { type: 'blocked'; tick: number; block: Vec3; id: BlockId; reason: DigBlockedReason };

/** ねらう・ほる・おく。担当 AB が `src/dig/` で実装する */
export interface DigSystem {
  target(): TargetInfo | null;
  state(): DigState;
  /** 前に呼んでから起きた出来事（呼ぶと空になる）。画面と音用 */
  drainEvents(): DigEvent[];
  /** テストの窓口用。読んでも空にならない、まだ読まれていない出来事 */
  peekEvents(): DigEvent[];
  /** 何もねらっていない場所で振った（空振り）回数の合計。見た目と音用 */
  whiffCount?(): number;
}

/** 画面の状態。担当 D が作る */
/** M6: 'celebrate' = おめでとう画面（ゲームの時間を止めて、案内画面は出さない。`ModalScreenState`） */
export type ScreenMode = 'play' | 'inventory' | 'guide' | 'celebrate';

export interface ScreenState {
  mode(): ScreenMode;
  inventoryOpen(): boolean;
  /** 実時間の速さの倍率（あそぶ 1、もちもの 0.25、案内 0） */
  timeScale(): number;
}

/** 担当 AB の設定（`settings.*` の名前と同じ）。値は AB が `src/dig/config.ts` で決める */
export interface DigSettings {
  reach: number;
  /** ブロックごとのかたさ（素手の秒数）。null はこわれない */
  hardness: Record<BlockId, number | null>;
  /** ほるのに要るレベル */
  harvestLevel: Record<BlockId, number>;
  handPower: number;
  handLevel: number;
  digResumeTicks: number;
  digCooldown: number;
  placeRepeatTicks: number;
}

/** ブロックのめずらしさ（ドロップ数の最大を決める。オーナー決定） */
export type Rarity = 'common' | 'uncommon' | 'rare' | 'superRare';

/** 担当 D の設定 */
export interface ScreenSettings {
  inventoryTimeScale: number;
  saveIntervalTicks: number;
}

// ================================================================ M3（戦い）
// 担当の割り振り: docs/tickets/M3-dev-split.md。仕様: docs/design/M3-combat.md, docs/design/M3-yokai-candidates.md

export type DayPhase = 'day' | 'dusk' | 'night' | 'dawn';

/** 1 日の時刻。担当 AD が `src/time/` で実装する */
export interface TimeOfDay {
  /** 1 日の中のステップ（0 から 1 日の長さ−1。長さは設定 dayTicks＋duskTicks＋nightTicks＋dawnTicks） */
  dayTick(): number;
  /** 何日目（0 から） */
  day(): number;
  phase(): DayPhase;
  /** '#rrggbb' */
  skyColor(): string;
  /** ブロックの明るさ */
  brightness(): number;
  /** 妖怪・人形の明るさ */
  dollBrightness(): number;
  set(dayTick: number): void;
  /** 1 ステップ進める（ゲームの更新から呼ぶ） */
  update(): void;
  /** 時間帯が変わったら呼ばれる。戻り値で解除 */
  onPhaseChange(fn: (phase: DayPhase) => void): () => void;
}

export type YokaiKind = 'karakasa' | 'chochin' | 'nurikabe' | 'rokurokubi';

export type YokaiState =
  | 'appear'
  | 'idle'
  | 'wander'
  | 'chase'
  | 'retreat'
  | 'attack'
  | 'search'
  | 'dying'
  | 'leaving';

export interface YokaiInfo {
  id: number;
  kind: YokaiKind;
  /** 足もとの中央 */
  position: Vec3;
  yawDeg: number;
  hp: number;
  maxHp: number;
  state: YokaiState;
  /** 攻撃の何ステップ目か（攻撃していなければ 0） */
  attackTick: number;
  scale: number;
}

export type YokaiEvent =
  | { type: 'spawn'; tick: number; id: number; kind: YokaiKind; position: Vec3 }
  | { type: 'attackStart'; tick: number; id: number; kind: YokaiKind }
  | { type: 'attackHit'; tick: number; id: number; kind: YokaiKind; hitPlayer: boolean; position: Vec3 }
  | { type: 'fireball'; tick: number; id: number; position: Vec3 }
  | { type: 'fireballEnd'; tick: number; position: Vec3; hitPlayer: boolean }
  | { type: 'hurt'; tick: number; id: number; kind: YokaiKind; position: Vec3 }
  | { type: 'defeat'; tick: number; id: number; kind: YokaiKind; position: Vec3; reward: number }
  | { type: 'leave'; tick: number; id: number; kind: YokaiKind; position: Vec3 };

export interface YokaiRayHit {
  id: number;
  kind: YokaiKind;
  /** 線の始まりから当たりの箱の面まで */
  distance: number;
}

/** 妖怪たち。担当 B が `src/yokai/`（モデルは既存）と `src/yokai/ai/` で実装する */
export interface YokaiWorld {
  list(): YokaiInfo[];
  /** 線に当たるいちばん近い妖怪（パンチ用）。maxDistance より遠ければ null */
  raycast(origin: Vec3, dir: Vec3, maxDistance: number): YokaiRayHit | null;
  /** パンチが当たった。from はたたいた人の足もと（押される向き） */
  damage(id: number, amount: number, from: Vec3): void;
  /** そのマスに妖怪の当たりの箱が重なっているか（ブロックを置けない） */
  occupies(x: number, y: number, z: number): boolean;
  /** 画面と音用（呼ぶと空になる）。テストの窓口用の列は別に持つ */
  drainEvents(): YokaiEvent[];
}

export type CombatEvent =
  | { type: 'punchStart'; tick: number }
  | { type: 'punchHit'; tick: number; yokaiId: number }
  | { type: 'punchMiss'; tick: number }
  | { type: 'playerHit'; tick: number; by: YokaiKind; amount: number; /** 防具でカットした（カキン） */ blocked?: boolean }
  | { type: 'regen'; tick: number; hp: number }
  | { type: 'death'; tick: number; dropped: number[] }
  | { type: 'respawn'; tick: number }
  | { type: 'pickup'; tick: number; bagId: number };

/** プレイヤーの体力と戦い。担当 C が `src/combat/` で実装する */
export interface PlayerCombat {
  hp(): number;
  maxHp(): number;
  dead(): boolean;
  /** むてきのこりステップ */
  invincibleTicks(): number;
  /** 妖怪の攻撃が当たった。むてきなどで受けなかったら false */
  damage(amount: number, by: YokaiKind, from: Vec3): boolean;
  /** 画面と音用（呼ぶと空になる）。テストの窓口用の列は別に持つ */
  drainEvents(): CombatEvent[];
}

// ================================================================ M4（作る・やく・道具・武器・防具）
// 担当の割り振り: docs/tickets/M4-dev-split.md。仕様: docs/design/M4-craft.md

export interface Recipe {
  id: string;
  output: ItemStack;
  inputs: ItemStack[];
  /** M4 で働きまで作るか（false は作れるだけ） */
  works: boolean;
  /** つくる（どこでも）か、やく（かまど）か */
  station: 'craft' | 'furnace';
}

export type CraftEvent =
  | { type: 'craft'; tick: number; recipe: string; item: ItemId; count: number }
  | { type: 'craftFail'; tick: number; recipe: string; reason: 'missing' | 'full' | 'unknown' }
  | { type: 'bakeStart'; tick: number; recipe: string; fuel: ItemId; position: Vec3 }
  | { type: 'bakeDone'; tick: number; recipe: string; item: ItemId; count: number; position: Vec3 }
  /** 拾った・焼けて入った（ログ用。つくったもの・テスト用の add は出さない） */
  | { type: 'pickup'; tick: number; item: ItemId; count: number };

/** つくる・やく。担当 A が `src/craft/` で実装する */
export interface CraftSystem {
  recipes(): Recipe[];
  /** 今の持ち物で作れるか・足りないもの */
  status(recipeId: string): { craftable: boolean; missing: ItemStack[] };
  make(recipeId: string): { ok: boolean; reason: null | 'missing' | 'full' | 'unknown' | 'noFuel' | 'queueFull' };
  /** かまど のブロックか */
  isFurnace(x: number, y: number, z: number): boolean;
  /** かまど を開く（画面は担当 C） */
  openFurnace(x: number, y: number, z: number): void;
  /** 開いている かまど（なければ null） */
  openedFurnace(): Vec3 | null;
  /** かまど をこわした（中身を返す） */
  furnaceBroken(x: number, y: number, z: number): void;
  /** こわしたときの数が決まっているブロック（なければ null で M2 のランダム） */
  fixedDrop(id: BlockId): number | null;
  /** 画面と音用（呼ぶと空）。テスト用の列は別に持つ */
  drainEvents(): CraftEvent[];
}

/** そうびの部位: あたま（かぶと）・からだ（よろい）・うで（こて）・あし（すねあて） */
export type ArmorSlot = 'head' | 'body' | 'arms' | 'legs';

/** 防具。担当 A が `src/craft/`（または `src/armor/`）で実装する */
export interface ArmorSystem {
  equipped(slot: ArmorSlot): ItemId | null;
  /** 着られるアイテムなら着る（手に持っているものを着る・入れかえ）。着たら true */
  tryEquip(item: ItemId): boolean;
  /** 妖怪の攻撃を受けた。カットする量（体力の単位。ハート半分 = 1）を返す。受けるダメージ = max(1, 元 − カット) */
  cut(): number;
}

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

export type SwingAnim = 'slash' | 'thrust' | 'sweep' | 'draw' | 'release' | 'punch' | 'dig' | 'place' | 'whiff';

/** 手に持っているものの働き。担当 B が `src/tools/` で実装する */
export interface ToolSystem {
  current(): ToolInfo;
  /** うでの動きを始めたとき（人形の動き用。呼ぶと空） */
  drainSwings(): { anim: SwingAnim; tick: number }[];
}

// ---------------------------------------------------------------- M4 光（担当 L）

/** 明るさ 0〜15（マイクラと同じ）。担当 L が `src/world/light/` で実装する */
export interface LightField {
  /** そのマスの空の光（0〜15。昼の空の下は 15） */
  skyLight(x: number, y: number, z: number): number;
  /** そのマスのブロックの光（たいまつなど。0〜15） */
  blockLight(x: number, y: number, z: number): number;
  /** 今の時刻をふくめた明るさ（0〜15）。妖怪の出現や人形の明るさに使う */
  level(x: number, y: number, z: number): number;
}

// ================================================================ M5（広い世界）
// 担当の割り振り: docs/tickets/M5-dev-split.md。仕様: docs/design/M5-world.md

/** 世界の大きさ（M5 で 64×32×64 から変更） */
export const WORLD_SIZE = { x: 128, y: 48, z: 128 } as const;
/** 世界の中心・スタート地点の列 */
export const WORLD_CENTER = { x: 64, z: 64 } as const;

export interface RegionCircle {
  cx: number;
  cz: number;
  r: number;
}

export interface RegionRect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

/** 地形の場所（担当 A が作る。`world.regions()` と、妖怪・農業・畜産が使う） */
export interface WorldRegions {
  center: { x: number; z: number };
  startH0: number;
  mountain: RegionCircle & { peak: { x: number; z: number; h: number } };
  rock: RegionCircle;
  forest: RegionCircle;
  flat: RegionRect;
  spring: RegionCircle;
  /** かわ の長方形の並び（いずみ側から順に） */
  river: RegionRect[];
  meadow: RegionCircle;
  pond: RegionCircle;
}

// ================================================================ M6（作る画面・実績・UI 作り直し）
// 担当の割り振り: docs/tickets/M6-dev-split.md。仕様: docs/design/M6-ui-achievements.md

/** 時間を止める画面（おめでとう画面）の状態。`ScreenController` が持つ。B（開く・閉じる）とつなぎ込みが使う（M6 §2.6 (3)） */
export interface ModalScreenState {
  /** おめでとう画面が出ているか（mode() === 'celebrate'） */
  modalOpen(): boolean;
  /**
   * 出す: ゲームの時間を止める（timeScale 0）・ポインターロックを外す・案内画面は出さない・押していたキーとボタンをはなす。
   * もちもの画面が開いていたら おぼえておく。すでに出ていれば何もしない。
   */
  openModal(): void;
  /**
   * 閉じる: おぼえていた もちもの画面があれば そこにもどる（ロックはかけない）。なければ ロックをかけ直して時間を動かす
   * （本物のブラウザでロックがことわられたら 案内画面でなく `lockDenied` を true にする。小さな札 `クリック で つづける` 用）。
   */
  closeModal(): void;
  /** 閉じたあと ロックをかけ直せなかった（札を出す。クリックで `relock()`） */
  lockDenied(): boolean;
  /** 札のクリックで ロックをかけ直す */
  relock(): void;
}

/** 実績の id: `<シリーズ>.<段階の数>`（例 `break.dirt.10`。§4.2） */
export type AchievementId = string;

export type MedalTier = 'bronze' | 'silver' | 'gold' | 'rainbow';

/** 実績の分類（§2.7）: こわす・おく・つくる・あつめる・たたかう・レベル・ぼうけん・ばしょ */
export type AchievementCategory = 'break' | 'place' | 'craft' | 'collect' | 'fight' | 'level' | 'adventure' | 'places';

export type DefeatWith = 'hand' | 'pickaxe' | 'bokuto' | 'katana' | 'naginata' | 'crystal_katana' | 'yumi';

/** 記録のキー（§2.5。`achievements.stats()` のキーと同じ） */
export type StatKey =
  | `break:${string}`
  | `place:${string}`
  | `craft:${string}`
  | `bake:${string}`
  | `obtain:${string}`
  | `defeat:${string}`
  | `defeatWith:${DefeatWith}`
  | `wear:${string}`
  | `visit:${string}`
  | `drop:${string}`
  | `store:${string}`
  | 'craftItems:ya'
  | 'pickup:*'
  | 'bagBack'
  | 'defeatLow'
  | 'chain'
  | 'guard'
  | 'wearAll'
  | 'death'
  | 'level'
  | 'playTicks'
  | 'night'
  | 'morning'
  | 'walk'
  | 'jump'
  | 'arrowShot'
  | 'arrowHit'
  | 'full'
  | 'storeFull';

/** 実績 1 つ（表の 1 行。§4.2） */
export interface AchievementDef {
  id: AchievementId;
  series: string;
  category: AchievementCategory;
  /** 記録のキーと目標 */
  stat: StatKey;
  goal: number;
  /** 何番目の段階か（1 から） */
  tier: number;
  medal: MedalTier;
  /** ちいさい実績か（§2.6 (1)） */
  small: boolean;
  /** 名前（ひらがな・カタカナ。漢字は使わない） */
  name: string;
}

/** C → B: 今 出す おめでとう画面の 1 枚（§2.6 (3)） */
export interface AchievementShow {
  /** 見せる実績の id（取った順） */
  ids: AchievementId[];
  /** 主役（いちばん高いメダル。同じなら先に取った） */
  mainId: AchievementId;
  /** 5 行をこえた分の数（`ほか 3 こ`） */
  more: number;
}

/** B が持つ おめでとう画面の口（C が使う） */
export interface AchievementModalPort {
  /** 出す（`ModalScreenState.openModal()` も呼ぶ）。すでに出ていれば false */
  open(show: AchievementShow): boolean;
  isOpen(): boolean;
  /** とじる が押されて 閉じたとき（見せた id の列）。C が「見せた」にして 待ち時間を数えはじめる */
  onClosed(fn: (shown: AchievementId[]) => void): void;
}

/** B → C: しずか判定に使う「演出が出ているか」 */
export interface CelebrateBusyPort {
  bannerShowing(): boolean;
  levelUpShowing(): boolean;
}

/** C が持つ: 取ったばかり（まだ見せていない）の列から 今の 1 枚を作る */
export interface AchievementShowSource {
  /** 出すきまり（§2.6 (2)）を すべて満たしたら その 1 枚。まだなら null */
  nextShow(): AchievementShow | null;
  /** まだ見せていない数（メダルの印の数） */
  pendingCount(): number;
  /** その レシピを はじめて 作った・焼いた か（記録を 足す前に聞く。横断幕を出すか決める） */
  isFirstMade(kind: 'craft' | 'bake', recipe: string): boolean;
}

/** A → B: 作った・焼いた（演出と横断幕の出来事。`CraftEvent` の craft / bakeDone から A が作る） */
export interface CraftMadeEvent {
  kind: 'craft' | 'bake';
  tick: number;
  recipe: string;
  item: ItemId;
  count: number;
  /** はじめて（横断幕を出す）か */
  first: boolean;
  /** コンボ（1 から。§2.4 (1) の 5） */
  combo: number;
}
export type CraftMadeListener = (e: CraftMadeEvent) => void;

/** D → C: すてた・しまった の出来事（記録 `drop:*`・`store:*`・`storeFull`） */
export type StorageEvent =
  | { type: 'drop'; tick: number; item: ItemId; count: number }
  | { type: 'store'; tick: number; item: ItemId; count: number }
  | { type: 'storeFull'; tick: number };

/** §4.1 の設定（`settings.get/set` の名前そのまま。1 秒 = 60 ステップ）。初期値は `M6_SETTING_DEFAULTS` */
export interface M6Settings {
  craftComboTicks: number;
  craftComboMax: number;
  bannerTicks: number;
  bannerInTicks: number;
  bannerOutTicks: number;
  achieveSmallBatch: number;
  achieveSmallMaxWait: number;
  achieveCooldown: number;
  achieveCooldownEarly: number;
  achieveEarlyTicks: number;
  achieveCalmHurtTicks: number;
  achieveCalmYokaiDist: number;
  achieveCalmMaxWait: number;
  achieveCloseDelay: number;
  achieveModalRows: number;
  achieveLowHp: number;
  achieveChainTicks: number;
  achieveChainCount: number;
  dropPickupDelay: number;
  dropThrowSpeed: number;
  dropThrowUp: number;
  tansuSlots: number;
  tansuCloseDist: number;
}

/** `hardness.tansu`・`fixedDrop.tansu`（5・1 こ）は D が M2・M4 の設定に足す */
export const M6_SETTING_DEFAULTS: Readonly<M6Settings> = {
  craftComboTicks: 120,
  craftComboMax: 8,
  bannerTicks: 180,
  bannerInTicks: 36,
  bannerOutTicks: 30,
  achieveSmallBatch: 5,
  achieveSmallMaxWait: 18000,
  achieveCooldown: 1800,
  achieveCooldownEarly: 5400,
  achieveEarlyTicks: 18000,
  achieveCalmHurtTicks: 120,
  achieveCalmYokaiDist: 8,
  achieveCalmMaxWait: 1800,
  achieveCloseDelay: 60,
  achieveModalRows: 5,
  achieveLowHp: 3,
  achieveChainTicks: 600,
  achieveChainCount: 3,
  dropPickupDelay: 60,
  dropThrowSpeed: 4,
  dropThrowUp: 2,
  tansuSlots: 54,
  tansuCloseDist: 6,
};

/** 設定の入れ物を作る（つなぎ込みが `createSettingsHook` の extras に渡す。毎回 新しいコピー） */
export function createM6Settings(): M6Settings {
  return { ...M6_SETTING_DEFAULTS };
}
