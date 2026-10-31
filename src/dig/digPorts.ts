import type { FurnUse } from '../world/blocks/furnUse';
import type {
  AnimalApi,
  ArmorSystem,
  BladeSystem,
  BucketPort,
  CraftSystem,
  DigFarmPort,
  DigVitalsPort,
  FarmEvent,
  ItemId,
  PetPort,
  SwingAnim,
  ToolInfo,
  Vec3,
  W2Settings,
  WateringPort,
  YokaiWorld,
} from '../contracts';
import type { Parry } from '../combat/parry';
import type { LegendSystem } from '../legend/LegendSystem';
import type { BodyBlocksPort } from './bodyBlocks';

/** DigSystem が使う道具・武器の窓口（M4。`ToolSystemImpl` が合う） */
export interface DigToolPort {
  current(): ToolInfo;
  /** 毎ステップ。ゆみの引きと、飛んでいる や を進める */
  /** active が false（怯み・やられ）の間は ゆみを ひくのを やめる（はなした扱いで 矢を出さない） */
  step(primary: boolean, eye: Vec3, dir: Vec3, active?: boolean): void;
  pushSwing(anim: SwingAnim): void;
  /** 何もない所を振った（武器なら武器の振り） */
  swingWhiff(): void;
  /** WEAPON-3: 今の 持ち物の パンチの 届く距離（なければ 3.5） */
  punchParams?(): { damage: number; reach: number; ticks: number };
}

/** HOUSE-1A: 建築士さん（`ArchitectManager` / `HouseSystem` が 合う）。ねらう・話しかける・たたく */
interface DigArchitectPort {
  /** 目から の 線が reach マス いないで 当たる いちばん 近い 建築士さん（distance は 目から） */
  rayHit(origin: Vec3, dir: Vec3, reach: number): { id: string; distance: number } | null;
  /** 右クリックで 話しかける。話しはじめたら true */
  talk(id: string): boolean;
  /** 左クリックを 押した（体力は ない。おっとっと と よろけるだけ） */
  hit?(id: string): void;
}

/** M4 の つなぎ目（どれもなくてよい。なければ M2 のとおり） */
export interface DigM4Deps {
  /** #293 試作: 大きい がしゃどくろの 体の 上に ブロックを 置く・こわす（ワールドの ブロックと 同じ ねらい・置き方。なければ 何も しない） */
  bodyBlocks?: BodyBlocksPort;
  tools?: DigToolPort;
  craft?: Pick<CraftSystem, 'isFurnace' | 'openFurnace' | 'furnaceBroken' | 'fixedDrop'>;
  armor?: Pick<ArmorSystem, 'tryEquip'> & {
    /** 着られるアイテムか（右クリックのヒントと実行が同じ判定を使う） */
    canEquip(item: ItemId): boolean;
  };
  /** ほって持ち物に入った（拾ったログ用。A の窓口につなぐ） */
  onPickup?: (item: ItemId, count: number) => void;
  /** 支えをなくした たいまつ を地面に落とす（なければ 持ち物へ直接入れる） */
  scatterItem?: (pos: Vec3, item: ItemId, count: number) => void;
  /** GOLD-1 §4.7: こわした ブロック から はらぱんみみず が おちる くじ（`createHarapanRoll().block`）。当たれば true */
  harapan?: (id: string, y: number) => boolean;
  /** M6: たんす（`StorageSystem` が合う） */
  storage?: DigStoragePort;
  /** M7: 農業（`FarmSystem` が合う。なければ M6 のとおり） */
  farm?: DigFarmPort;
  /** M7: 体力を聞く・もどす（`PlayerCombat` が合う） */
  vitals?: DigVitalsPort;
  /** M7-2: じょうろ（`WateringPort`。A）。4a くむ・4b まく・4c からっぽ の 判定と 実行 */
  water?: WateringPort;
  /** BUCKET-1: バケツ（`BucketPort`。`farm/bucket.ts`）。4d〜4g の 判定と 実行 */
  bucket?: BucketPort;
  /** LIVE-1: にわとり（A の `AnimalApi`。ふりわけ 0 は 口 を 呼ぶ だけ。なければ M7-2 のとおり） */
  animals?: AnimalApi;
  /** HOUSE-1A: 建築士さん（ブロック・にわとり より 手前 なら 右クリックで 話しかける。なければ 何も しない） */
  architects?: DigArchitectPort;
  /** LIVE-1 版 3.2: あみ を ふる 長さ・だっこ まで の 押しつづけ（設定 を すぐ 読む）。なければ 初期値 */
  live?: () => { netSwingTicks: number; carryHoldTicks: number; /** LIVE-2: 小屋 の 数 の 上限（なければ 初期値 3） */ coopCountMax?: number; /** LIVE-2: 1 つ の 小屋 の 子 の 上限（なければ 初期値 6） */ coopMax?: number; /** LIVE-2.1: こたつ 1 台 の たまご の 上限（なければ 初期値 3） */ kitEggMax?: number; /** LIVE-2.1: 置き物 で けずる・うめる 高さ の 上限（なければ 2） */ placeStepMax?: number };
  /** LIVE-3: とりごや の メニュー を ひらく（小屋 id）。なければ 何も しない */
  coopMenu?: (coopId: number) => void;
  /** LIVE-3: やいた もも にく の 回復（設定 meatHeal を すぐ 読む）。なければ 初期値 */
  meatHeal?: () => number;
  /** LIVE-1: たまご の 回復（設定 animalEggHeal を すぐ 読む）。なければ 初期値 */
  eggHeal?: () => number;
  /** M7-2: なでる・ごきげん（`PetPort`。C の `farm/pet.ts`） */
  pet?: PetPort;
  /** M7-2: 農業 の 出来事 を 足す（A の `emit`。`pet` の 出来事 用）。なければ 出さない */
  emitFarm?: (e: FarmEvent) => void;
  /** M7-2: 出来事 の `tick`（なければ この 係 の 歩数） */
  nowTick?: () => number;
  /** WEAPON-2: 刀（ひだりクリックの ふりわけ §2.1-6 で わざを 渡す）。なければ 刀も ほるだけ */
  blade?: Pick<BladeSystem, 'update' | 'state' | 'dropBuffer' | 'busyNext' | 'nextStart' | 'yieldToParry'>;
  /** WEAPON-7: レジェンダリー武器の ため・ためわざ。なければ 今のまま（レジェンダリーは ふつうの 刀と 同じ） */
  legend?: Pick<LegendSystem, 'step' | 'busyNext' | 'dropBuffer' | 'chargeable'>;
  /** WEAPON-5: パリィ（刀の Shift＋クリック）。なければ 今のまま */
  parry?: Pick<Parry, 'state' | 'inWindow' | 'dropBuffer'>;
  /** WEAPON-2: たいきゅうの へる量（ほる・たがやす）。なければ へらさない */
  w2?: W2Settings;
  /** WEAPON-3: 妖怪の 世界（一覧を 向きの決まりに わたす）。`blade`・`w2` と そろっていれば 近接の 攻撃は 向いている方へ */
  yokai?: () => YokaiWorld;
  /** ITEM-FX-1: ふとんで ねる・たこを あげる／もどす（右クリックの 実行。なければ 何も しない） */
  gadgets?: { sleep(): void; kite(): void };
  /** HOUSE-1D: 家具の はたらき（すわる・はいる・ほんだなで ルールブック）。押した 最初の ステップに 1 回。x・y・z は ねらった ブロックの マス */
  furniture?: { use(kind: FurnUse, x: number, y: number, z: number): void };
}

/** WEAPON-3: さいごに 始めた 攻撃（`attack.last()`） */
export interface AttackLast {
  tick: number;
  kind: 'blade' | 'punch';
  rule: number;
  baseDeg: number;
  keyDeg: number | null;
  dirDeg: number;
  targetId: number | null;
  tiltDeg: number;
}

/** DigSystem が使う たんす の窓口（M6 §2.9） */
export interface DigStoragePort {
  isTansu(x: number, y: number, z: number): boolean;
  /** 開く。もちもの画面は、開いていなければ 開く（screenOpens: true なら 画面は別の所で開くので 触らない） */
  open(x: number, y: number, z: number, opts?: { screenOpens?: boolean }): boolean;
  /** 置いた（向きを記録する） */
  placed(x: number, y: number, z: number, yawDeg: number): void;
  /** こわした（中身をばらまく） */
  broken(x: number, y: number, z: number): number;
}
