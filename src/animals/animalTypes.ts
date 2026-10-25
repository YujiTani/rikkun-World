import type { AnimalBreed, AnimalDeps, AnimalStage, AnimalState, KitEgg, ThrowSpot, Vec3, VoxelWorld } from '../contracts';
import type { CoopDir } from './coop';
import type { AnimalWorld } from './terrain';

export type LockKind = 'appear' | 'eat' | 'pet' | 'cheer' | 'full' | 'putDown' | 'hatch' | 'grow';

/** なげる の とびかた（山なり。乱数 なし） */
interface Flight {
  sx: number;
  sy: number;
  sz: number;
  /** 着地点 の 足もと */
  tx: number;
  ty: number;
  tz: number;
  /** 山なり の ふくらみ（y(u) = sy + (py - sy)·u + c·u·(1-u)） */
  c: number;
  /** P の 高さ（着地点 の 足 ＋ 2.0） */
  py: number;
  /** かかる ステップ */
  T: number;
  k: number;
  phase: 'arc' | 'fall';
}

/** こたつ に 入って いる たまご 1 こ（LIVE-2.1: 時計 は たまご ごと） */
export interface KitEggRow {
  egg: KitEgg;
  left: number;
  /** 入れた ときの あたためる 時間（ゆれ の 段階 の 分母） */
  total: number;
}

/** こたつ 1 つ（たまご が 入った もの だけ。1〜3 こ） */
export interface Kit {
  x: number;
  y: number;
  z: number;
  /** 入れた 順 */
  eggs: KitEggRow[];
  /** 1 辺 の マス の 数（こわれた あと の たまご の おちる 場所 の ため、本体 が ある 間 に 覚える） */
  size?: 1 | 2;
  /** かえる 動き 中 の ひよこ の id（0 = まだ） */
  chick: number;
  /** かえる 動き 中 の たまご（`eggs` の 1 つ） */
  hatch: KitEggRow | null;
  /** 次 の たまご が かえる まで の 間（前 の 子 の 動き が おわって から 20 ステップ） */
  gap: number;
  /** `friendFull` を 次 に 出す まで */
  fullWait: number;
  /** かえる 場所 を さがし直す まで */
  retry: number;
}

/** とりごや 1 つ（子 は ents の `home` で 数える） */
export interface Coop {
  id: number;
  x: number;
  y: number;
  z: number;
  dir: CoopDir;
  egg: number;
  gold: number;
  /** LIVE-3: いただきます の 演出（1 つ の 小屋 で 同時 に 1 わ）。保存 しない */
  meat: MeatJob | null;
}

/** いただきます の 演出 1 つ（`t` = 押してから の ステップ） */
interface MeatJob {
  id: number;
  t: number;
  /** はじめ の 位置（ねぐら へ 歩く 出だし） */
  sx: number;
  sz: number;
}

export interface Ent {
  id: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  headYaw: number;
  friend: boolean;
  hearts: 0 | 1 | 2;
  state: AnimalState;
  stateTicks: number;
  look: boolean;
  inWater: boolean;
  /** 上下 の 速さ（マス/秒。下 が 負） */
  vy: number;
  /** ついてくる 残り ステップ（なかま） */
  follow: number;
  /** おなかいっぱい の 残り ステップ */
  fullLeft: number;
  carried: boolean;
  fluttering: boolean;
  /** たまご の くじ の「つづけて うまなかった 数」（保存 しない） */
  eggMiss: number;
  /** ついてくる 時間 が 0 の とき の まん中（うろうろ の はんい） */
  homeX: number;
  homeZ: number;
  /** うごき の ロック（のこり ステップ）と 種類 */
  lock: number;
  lockKind: LockKind;
  /** ロック の おわりに たまご を おとす（ロック の 後半 30 は 'lay'） */
  egg: boolean;
  /** ロック の おわりに なかま に なる（3 つ目 の やさい） */
  becomeFriend: boolean;
  walking: boolean;
  walkLeft: number;
  restLeft: number;
  walkYaw: number;
  blocked: number;
  following: boolean;
  bestDist: number;
  stuck: number;
  warpWait: number;
  /** 止まる 距離 に 足す 分（なかま の 順番 で 決まる） */
  stopOff: number;
  // ---- LIVE-2
  stage: AnimalStage;
  breed: AnimalBreed;
  /** 小屋 の 子 なら 小屋 id */
  home: number | null;
  raised: boolean;
  bugs: number;
  goldMiss: number;
  grow: number;
  /** 小屋 の 中 に いた ステップ（coopEnterTicks で 小屋 の 子） */
  enterT: number;
  /** ロック の 全ステップ（かえる・大人 に なる の 進み 0〜1 の 分母） */
  lockTotal: number;
  /** かえる 動き が 金 の たまご から か */
  fromGold: boolean;
  /** 着地 の コロン の のこり */
  rollLeft: number;
  /** 空中 に 出た 高さ（-1 = 空中 で ない） */
  airFrom: number;
  // ---- LIVE-2.1
  /** なげる もちあげ の のこり（手 の 中。0 = なし） */
  liftLeft: number;
  /** そっと おろす の のこり（手 の 中。0 = なし） */
  putLeft: number;
  /** なげる／おろす の 着地点（もちあげ・おろす の あいだ） */
  plan: ThrowSpot | null;
  /** とんで いる あいだ */
  flight: Flight | null;
  /** さく の 上 から 中（か 外）へ よせて いる 行き先 */
  glide: { x: number; z: number } | null;
  /** 小屋 の 子 に なって から の ステップ（-1 = なし）。大きな しるし の 段 */
  popAge: number;
  // ---- GOLD-1（なかま の 大人 だけ 動く）
  natsuki: number;
  natsukiBugWait: number;
  natsukiPetWait: number;
  natsukiDecayLeft: number;
  // ---- LIVE-3
  /** いただきます の 演出 中（ねらえない・なでる／むし／だっこ できない） */
  meat: boolean;
  // ---- LIVE-4（いっしょ に たたかう マッチョ）
  /** なかま に なった 順（小さい ほど 早い）。たたかう 子 を えらぶ もと */
  joinNo: number;
  /** ねらって いる 妖怪 の id */
  target: number | null;
  /** その ねらい で 当てた パンチ の 数 */
  hits: number;
  /** たたかい の 段: はしる・パンチ（きりあげ ふくむ）・おうえん・かちポーズ */
  fs: FightPhase;
  /** その 段 の 経過 ステップ（パンチ は 0 が とどいた ステップ） */
  ft: number;
  /** いまの パンチ が きりあげ か */
  upper: boolean;
  /** いまの パンチ の 当たる コマ と ながさ（パンチ を はじめる とき に 刀 の 突き から 読む） */
  punchAt: number;
  punchLen: number;
  /** ねらい を わすれる まで の のこり ステップ（きっかけ で もどる） */
  forgetLeft: number;
  /** 「！」 の のこり ステップ */
  bangLeft: number;
  /** かちポーズ の のこり ステップ */
  flexLeft: number;
  /** おうえん を はじめた とき の 妖怪 の 位置（そこ から 大きく うごいたら また はしる） */
  cheerX: number;
  cheerZ: number;
}

type FightPhase = 'none' | 'run' | 'punch' | 'cheer' | 'flex';

export interface AnimalManagerOptions {
  world: VoxelWorld | AnimalWorld;
  deps: AnimalDeps;
  /** 足もと の 中央 */
  getPlayer: () => { position: Vec3 };
}
