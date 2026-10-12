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
  | 'bedrock';

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

/** アイテムの種類。M2 ではブロックと同じ。M4 で道具を足す */
export type ItemId = BlockId;

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
  | { type: 'break'; tick: number; block: Vec3; id: BlockId; gotItem: boolean }
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
}

/** 画面の状態。担当 D が作る */
export type ScreenMode = 'play' | 'inventory' | 'guide';

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

/** 担当 D の設定 */
export interface ScreenSettings {
  inventoryTimeScale: number;
  saveIntervalTicks: number;
}
