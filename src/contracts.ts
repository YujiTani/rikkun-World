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
