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
  | 'start_torch' // スタート地点の こわれない たいまつ
  // M6
  | 'tansu' // たんす（和だんす。54 マスの入れもの）
  // M7（農業。うしろに足す。作物の段階は id に入れない: 作物は 4 しゅるい、段階は FarmSystem が持つ）
  | 'farmland' // はたけ（かわいた）
  | 'farmland_wet' // はたけ（しめった）
  | 'crop_onion'
  | 'crop_tomato'
  | 'crop_pumpkin'
  | 'crop_eggplant'
  | 'wild_onion' // やせいの やさい
  | 'wild_tomato'
  | 'wild_pumpkin'
  | 'wild_eggplant'
  | 'kakashi' // かかし（下）
  | 'kakashi_head' // かかし（上）
  | 'saku'; // こわれた さく

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
  /**
   * M7: ブロックの id は同じまま、見た目だけ作り直させる（作物の段階が変わったとき）。光の計算し直しは起こさない。
   * 範囲外は何もしない。持たない VoxelWorld（テスト用の仮のもの）では呼ばない（`world.touch?.()`）
   */
  touch?(x: number, y: number, z: number): void;
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
  /** M5: 地形の場所 */
  regions(): WorldRegions;
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
  | 'haniwa'
  // M7（うしろに足す）
  | 'seed_onion'
  | 'seed_tomato'
  | 'seed_pumpkin'
  | 'seed_eggplant'
  | 'onion'
  | 'tomato'
  | 'pumpkin'
  | 'eggplant'
  | 'kuwa';

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
  | { type: 'fallHurt'; tick: number; amount: number }
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
  damage(amount: number, by: YokaiKind, from: Vec3, kind?: DamageKind): boolean;
  /** M7: 体力を もどす（ハート半分 = 1）。最大をこえない。やられている間は 0。実際に もどった量を返す */
  heal(amount: number): number;
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
  /** いま えらんでいる ねんりょう（0 こなら 自動の順の次。なければ null） */
  fuel?(): ItemId | null;
  /** ねんりょう を えらぶ（せきたん・あぶら・き のどれか。持っていなくてもよい） */
  setFuel?(id: ItemId): boolean;
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

/** ダメージの種類: normal（かみつき・ふみつけ・たいあたり・たおれこみ・首）・ball（玉）・fall（落下） */
export type DamageKind = 'normal' | 'ball' | 'fall';

/** そうびの部位: あたま（かぶと）・からだ（よろい）・うで（こて）・あし（すねあて） */
export type ArmorSlot = 'head' | 'body' | 'arms' | 'legs';

/** 防具。担当 A が `src/craft/`（または `src/armor/`）で実装する */
export interface ArmorSystem {
  equipped(slot: ArmorSlot): ItemId | null;
  /** 着られるアイテムなら着る（手に持っているものを着る・入れかえ）。着たら true */
  tryEquip(item: ItemId): boolean;
  /** 妖怪の攻撃を受けた。カットする量（体力の単位。ハート半分 = 1）を返す。受けるダメージ = max(1, 元 − カット) */
  cut(kind?: DamageKind): number;
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

export type SwingAnim = 'slash' | 'thrust' | 'sweep' | 'draw' | 'release' | 'punch' | 'dig' | 'place' | 'whiff' | 'throw';

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
export type AchievementCategory =
  | 'break'
  | 'place'
  | 'craft'
  | 'collect'
  | 'fight'
  | 'level'
  | 'adventure'
  | 'places'
  // M7: 9 こ目「そだてる」
  | 'farm';

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
  // M7 農業（`visit:oldfarm` は上の `visit:` の形）
  | 'till'
  | `plant:${string}` // `plant:<kind>`・`plant:*`
  | `harvest:${string}` // `harvest:<kind>`・`harvest:*`
  | 'harvestWet'
  | `eat:${string}` // `eat:<item>`・`eat:*`
  | `wild:${string}` // `wild:<kind>`・`wild:*`
  | `seedFrom:${string}` // `seedFrom:grass`・`seedFrom:yokai`・`seedFrom:oldfarm`
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

// ================================================================ M7（農業 フェーズ 1）
// 担当の割り振り: docs/tickets/M7-dev-split.md。仕様: docs/design/M7-farm.md

/** 作物の しゅるい。ブロックの id は しゅるいごと（`crop_<kind>`・`wild_<kind>`）。段階は id に入れない */
export type CropKind = 'onion' | 'tomato' | 'pumpkin' | 'eggplant';
export const CROP_KINDS: readonly CropKind[] = ['onion', 'tomato', 'pumpkin', 'eggplant'];
/** 0 = め・1 = は・2 = みが すこし・3 = みのった */
export type CropStage = 0 | 1 | 2 | 3;

export const CROP_BLOCK: Readonly<Record<CropKind, BlockId>> = {
  onion: 'crop_onion',
  tomato: 'crop_tomato',
  pumpkin: 'crop_pumpkin',
  eggplant: 'crop_eggplant',
};
export const WILD_BLOCK: Readonly<Record<CropKind, BlockId>> = {
  onion: 'wild_onion',
  tomato: 'wild_tomato',
  pumpkin: 'wild_pumpkin',
  eggplant: 'wild_eggplant',
};
export const SEED_ITEM: Readonly<Record<CropKind, ItemId>> = {
  onion: 'seed_onion',
  tomato: 'seed_tomato',
  pumpkin: 'seed_pumpkin',
  eggplant: 'seed_eggplant',
};
/** やさいの アイテム id は しゅるいの名前そのまま（`onion` ほか） */
export const VEG_ITEM: Readonly<Record<CropKind, ItemId>> = {
  onion: 'onion',
  tomato: 'tomato',
  pumpkin: 'pumpkin',
  eggplant: 'eggplant',
};

/** ブロック id から 作物の しゅるいを引く（作物・やせいの やさい 以外は null） */
export function cropKindOfBlock(id: BlockId | 'outside'): { kind: CropKind; wild: boolean } | null {
  switch (id) {
    case 'crop_onion': return { kind: 'onion', wild: false };
    case 'crop_tomato': return { kind: 'tomato', wild: false };
    case 'crop_pumpkin': return { kind: 'pumpkin', wild: false };
    case 'crop_eggplant': return { kind: 'eggplant', wild: false };
    case 'wild_onion': return { kind: 'onion', wild: true };
    case 'wild_tomato': return { kind: 'tomato', wild: true };
    case 'wild_pumpkin': return { kind: 'pumpkin', wild: true };
    case 'wild_eggplant': return { kind: 'eggplant', wild: true };
    default: return null;
  }
}
/** アイテム id から たね／やさい の しゅるいを引く */
export function seedKindOfItem(id: ItemId): CropKind | null {
  switch (id) {
    case 'seed_onion': return 'onion';
    case 'seed_tomato': return 'tomato';
    case 'seed_pumpkin': return 'pumpkin';
    case 'seed_eggplant': return 'eggplant';
    default: return null;
  }
}
export function vegKindOfItem(id: ItemId): CropKind | null {
  return id === 'onion' || id === 'tomato' || id === 'pumpkin' || id === 'eggplant' ? id : null;
}

/** 作物 1 つ（`farm.crop` の答え。座標は 作物のマス = はたけ の 1 つ上） */
export interface FarmCropInfo {
  kind: CropKind;
  stage: CropStage;
  /** 同じだんに いる 明るい ステップ */
  stageTicks: number;
  /** 下の はたけ が しめっているか */
  wet: boolean;
  /** 今 明るさ 9 以上（`farmMinLight`）か */
  lit: boolean;
  ripe: boolean;
}

export type FarmHintKind = 'till' | 'full';
export type SeedSource = 'grass' | 'yokai' | 'oldfarm';

/** 農業の出来事。`tick` と 場所つき。画面（D）・音・実績・テストの窓口が読む */
export type FarmEvent =
  | { type: 'till'; tick: number; x: number; y: number; z: number }
  /** すで の 1・2 回目（count = 何回目） */
  | { type: 'tillPress'; tick: number; x: number; y: number; z: number; count: number }
  | { type: 'plant'; tick: number; x: number; y: number; z: number; kind: CropKind }
  | { type: 'stage'; tick: number; x: number; y: number; z: number; kind: CropKind; from: CropStage; to: CropStage }
  | { type: 'harvest'; tick: number; x: number; y: number; z: number; kind: CropKind; veg: number; seeds: number; wet: boolean }
  | { type: 'wild'; tick: number; x: number; y: number; z: number; kind: CropKind; seeds: number }
  | { type: 'notRipe'; tick: number; x: number; y: number; z: number; kind: CropKind }
  | { type: 'wet'; tick: number; x: number; y: number; z: number; wet: boolean }
  | { type: 'eat'; tick: number; x: number; y: number; z: number; item: ItemId; heal: number }
  | { type: 'seedFound'; tick: number; x: number; y: number; z: number; from: SeedSource; item: ItemId }
  /** 合図（D が チップを出す）。C が `noteHint` で伝える */
  | { type: 'hint'; tick: number; x: number; y: number; z: number; hint: FarmHintKind }
  /** かかし から 横 4 以内に 入った（`visit:oldfarm`。はじめて だけでなく 入るたび。数えるのは D の実績） */
  | { type: 'visitOldFarm'; tick: number; x: number; y: number; z: number };

/** しゅうかく の 結果 */
export type FarmHarvestResult =
  | { ok: false; reason: 'notRipe' | 'none' }
  | {
      ok: true;
      kind: CropKind;
      wild: boolean;
      wet: boolean;
      /** 入れるもの（やさい と たね。順は やさい・たね）。持ち物に入らない分は C が `scatterItem` で出す */
      items: ItemStack[];
    };

/** ねらった作物・はたけ の しるし（HUD。`farm.hud()` と同じ形） */
export interface FarmAim {
  /** 0〜4（段階 s なら s+1。はたけ だけなら 0） */
  dots: number;
  ripe: boolean;
  wet: boolean;
  /** 暗くて そだたない（明るさ 8 以下 で まだ みのっていない作物） */
  dark: boolean;
}

/** 農業の毎ステップに渡すもの */
export interface FarmStepContext {
  /** かかし への 近づきの 判定用 */
  playerPos: Vec3;
}

/**
 * 農業のしくみ。担当 A が `src/farm/` で実装する（`createFarmSystem(deps)`）。
 * ブロックの置きかえ（たがやす・まく・しゅうかく・しめり）は A が `world.setBlock` で行う。
 * 持ち物・体力に触るのは C（A は 持ち物を持たない）。座標は 特にことわりがなければ「作物のマス」。
 */
export interface FarmSystem {
  /** 作物のマスなら 情報、ちがえば null（やせいの やさい は stage 3・ripe で返す） */
  crop(x: number, y: number, z: number): FarmCropInfo | null;
  crops(): Array<{ x: number; y: number; z: number } & FarmCropInfo>;
  /** はたけ のマスなら `{wet}`（座標は はたけ のマス） */
  soil(x: number, y: number, z: number): { wet: boolean } | null;
  /** 設定（live）。C が 「すで 3 回」の数を読むのに使う */
  settings(): Readonly<M7Settings>;

  // ---- DigSystem（C）から呼ぶ。座標は ねらった ブロック（`dig.target().block`）
  /** くさ・つち（上が くうき）を はたけ（`farmland`。みず が近ければ `farmland_wet`）にする。できたら true。出来事 till */
  till(x: number, y: number, z: number): boolean;
  /** すで の 1・2 回目。出来事 tillPress だけ出す */
  noteTillPress(x: number, y: number, z: number, count: number): void;
  /** はたけ（座標は はたけ のマス）の 上が くうき なら 上のマスに 作物 stage 0。できたら true。出来事 plant。たねを へらすのは C */
  plant(x: number, y: number, z: number, kind: CropKind): boolean;
  /**
   * 作物・やせいの やさい の しゅうかく（座標は 作物のマス）。みのっていなければ `notRipe`（出来事 notRipe）。
   * みのっていれば 作物を くうき にして（はたけ は のこす）、入るもの（乱数は 農業の シード付き）を返し、出来事 harvest / wild
   */
  harvest(x: number, y: number, z: number): FarmHarvestResult;
  /**
   * ブロックを こわした あと（`setBlock(…, 'air')` の あと）に C が呼ぶ。はたけ なら 上の作物を かたづけて、
   * 返す物（みのっていれば しゅうかく と同じ。みのっていなければ たね 1 こ）を 返す。
   * くさ の上の やせいの やさい も 同じ（とったのと同じもの）。つち 1 こ は C が M2 のとおり。ほかは []
   */
  onBlockBroken(x: number, y: number, z: number, id: BlockId): ItemStack[];
  /** くさ を こわした列 (x, z) で 1/8 の くじ。当たれば たね 1 こ（場所で 出やすい たね。出来事 seedFound grass）、はずれは null */
  grassSeed(x: number, z: number): ItemId | null;
  /** その列で くさ を こわしたとき 出やすい たね（`regions()` から。なければ null = 4 しゅるい同じ）。テスト用 */
  grassSeedKind(x: number, z: number): CropKind | null;
  /** やさい を たべたときに もどる体力（やさい でなければ 0）。`eatHeal` の設定 */
  eatHeal(item: ItemId): number;
  /** たべた（出来事 eat。実績用）。体力の変更・持ち物を へらすのは C */
  noteEat(item: ItemId, heal: number, at: Vec3): void;
  /** 合図を 出す（出来事 hint）。同じ合図の 出し直しは D が 受け持つ */
  noteHint(hint: FarmHintKind, at: Vec3): void;
  /** 妖怪の おとしもの・ふるい たんす で たねが 持ち物に入った（出来事 seedFound。つなぎ込みが呼ぶ） */
  noteSeedFound(from: SeedSource, item: ItemId, at: Vec3): void;

  // ---- 毎ステップ・保存・テスト
  /** 1 ステップ。そだつ・しめり・かかし への 近づき。止まっている間は 呼ばない（もちもの画面は 4 ステップに 1 回） */
  update(ctx: FarmStepContext): void;
  /** ねらった作物・はたけ の しるし（HUD 用）。何でもなければ null */
  aim(x: number, y: number, z: number): FarmAim | null;
  /** 今の設定で 0 → 3 に かかる 明るい ステップの 平均 T */
  growTicks(kind: CropKind, wet: boolean): number;
  /** 画面と音用（呼ぶと空になる） */
  drainEvents(): FarmEvent[];
  /** テストの窓口用（読んでも空に ならない） */
  peekEvents(): FarmEvent[];
  /** 「M7 の 置きもの を 置いた」印 */
  placedM7(): boolean;
  serialize(): unknown;
  deserialize(data: unknown): void;
}

/** A を作るときに わたすもの */
export interface FarmDeps {
  world: VoxelWorld;
  light: LightField;
  /** 世界のシード（農業の乱数と 置きもの の もと） */
  seed: number;
  /** 1 にち の ステップ数（`dayTicks + duskTicks + nightTicks + dawnTicks`。今 91,800） */
  dayLength(): number;
  /** 設定の 入れ物（`settings.set` で変えたら すぐ効くよう、同じ オブジェクトを 読む） */
  settings: M7Settings;
  /** 今のステップ（出来事の tick 用） */
  tick(): number;
  /** ふるい はたけ の たんす の中身を 入れる（`StorageSystem.set` を つなぐ） */
  fillTansu(pos: Vec3, items: ItemStack[]): void;
  /** 置きもの の 計算（E の `computeFarmPlacement`）。A が 前の保存に あとから置くとき使う */
  placement: FarmPlacementFn;
}

/** DigSystem（C）が 農業を 呼ぶ口（`FarmSystem` の 一部）。`DigM4Deps.farm` に入れる */
export type DigFarmPort = Pick<
  FarmSystem,
  | 'crop'
  | 'soil'
  | 'settings'
  | 'till'
  | 'noteTillPress'
  | 'plant'
  | 'harvest'
  | 'onBlockBroken'
  | 'grassSeed'
  | 'eatHeal'
  | 'noteEat'
  | 'noteHint'
>;

/** 体力を 聞く・もどす口（`PlayerCombat` の 一部）。`DigM4Deps.vitals` に入れる */
export type DigVitalsPort = Pick<PlayerCombat, 'hp' | 'maxHp' | 'heal'>;

// ---------------------------------------------------------------- 置きもの（E → A, 新しい世界）

export interface FarmPlacedBlock {
  x: number;
  y: number;
  z: number;
  id: BlockId;
}

/** 置きもの の 差分（§4.5 (0)。島を作った直後の 地形 と シード だけ で 決まる） */
export interface FarmPlacement {
  /** やせいの やさい（`id` は `wild_<kind>`。下の くさ の列は もとのまま） */
  wild: Array<{ x: number; y: number; z: number; kind: CropKind }>;
  /** ふるい はたけ の あと（置かないときは null） */
  oldFarm: {
    /** 置く マス ぜんぶ（地面を そろえる 分・はたけ 12・さく・かかし 2 段・たんす を ふくむ。順は 下から上） */
    blocks: FarmPlacedBlock[];
    tansu: Vec3;
    /** たんす の 中身（たまねぎ 2・トマト 3・なす 2・かぼちゃ 1） */
    tansuItems: ItemStack[];
    /** かかし（下）の マス */
    kakashi: Vec3;
    /** 8×8 の わく（x0〜x1, z0〜z1 を ふくむ）と、しらべる 高さ（h₀−1〜h₀+6）。前の保存で「変えていない」を しらべる範囲 */
    box: { x0: number; z0: number; x1: number; z1: number; y0: number; y1: number };
    /** §4.5 (3) の ゆるめた 段（0 = ゆるめていない） */
    tier: 0 | 1 | 2 | 3;
  } | null;
}

/**
 * 置きもの の 場所を 計算する（E が `src/world/gen/` で実装する。純粋: 世界は 変えない）。
 * `pristine` を わたすと その 島（作った直後の 世界と `IslandInfo`）を 使う。なければ 同じ シードで 島を 作り直して 使う。
 */
export type FarmPlacementFn = (seed: number, pristine?: { world: VoxelWorld; info: IslandInfo }) => FarmPlacement;

/** 新しい世界に 置く（E）。島を作った直後に 1 回。たんす の 中身は 置かない（A が `fillTansu` で入れる） */
export type ApplyFarmPlacement = (world: VoxelWorld, placement: FarmPlacement) => void;

// ---------------------------------------------------------------- 見た目（B → A, D）

/** 作物の 今の 段階を 聞く口（A の `FarmSystem` が 合う）。B の 描画が 読む */
export interface CropStageSource {
  /** 作物・やせいの やさい のマスなら 段階（やせいの やさい は 3）。ちがえば null */
  stageAt(x: number, y: number, z: number): CropStage | null;
}

/** 絵と 描く明るさ（B が `src/world/blocks/`・`render/` で作る。A の `farm.texture`・`farm.look` が そのまま 返す） */
export interface FarmVisual {
  /** 16×16（行ごとに 左から）。`'#rrggbb'`、すきとおる所は null。name は §6.1 の `farm.texture` */
  texture(name: string): Array<string | null>;
  /** 作物のマスの 描いている 絵の名前と 明るさ（作物でなければ null） */
  look(x: number, y: number, z: number): { tile: string; brightness: number } | null;
}

// ---------------------------------------------------------------- 設定（§4.3・§4.4・§4.5）

export interface M7Settings {
  /** にち（1 にち = dayLength ステップ）。0 → 3 に かかる 明るい ステップの 平均 */
  farmGrowDays: { dry: Record<CropKind, number>; wet: Record<CropKind, number> };
  farmMinLight: number;
  farmMaxWaitFactor: number;
  farmWetRange: number;
  farmWetRecheckTicks: number;
  farmHandTillPresses: number;
  farmHandTillResetTicks: number;
  farmYield: Record<CropKind, [number, number]>;
  farmSeedYield: [number, number];
  farmGrassSeedChance: number;
  farmGrassSeedWeight: number;
  eatHeal: Record<CropKind, number>;
  farmRipeMinBrightness: number;
}

export const M7_SETTING_DEFAULTS: Readonly<M7Settings> = {
  farmGrowDays: {
    dry: { onion: 1.25, tomato: 0.75, pumpkin: 2, eggplant: 1.25 },
    wet: { onion: 0.85, tomato: 0.5, pumpkin: 1.3, eggplant: 0.85 },
  },
  farmMinLight: 9,
  farmMaxWaitFactor: 3,
  farmWetRange: 4,
  farmWetRecheckTicks: 60,
  farmHandTillPresses: 3,
  farmHandTillResetTicks: 120,
  farmYield: { onion: [1, 2], tomato: [1, 2], pumpkin: [1, 1], eggplant: [1, 2] },
  farmSeedYield: [1, 2],
  farmGrassSeedChance: 0.125,
  farmGrassSeedWeight: 4,
  eatHeal: { onion: 2, tomato: 2, pumpkin: 4, eggplant: 2 },
  farmRipeMinBrightness: 0.7,
};

/** 設定の入れ物を作る（毎回 ふかい コピー。つなぎ込みが `createSettingsHook` の extras に渡す） */
export function createM7Settings(): M7Settings {
  const d = M7_SETTING_DEFAULTS;
  return {
    ...d,
    farmGrowDays: { dry: { ...d.farmGrowDays.dry }, wet: { ...d.farmGrowDays.wet } },
    farmYield: {
      onion: [...d.farmYield.onion],
      tomato: [...d.farmYield.tomato],
      pumpkin: [...d.farmYield.pumpkin],
      eggplant: [...d.farmYield.eggplant],
    },
    farmSeedYield: [...d.farmSeedYield],
    eatHeal: { ...d.eatHeal },
  };
}
