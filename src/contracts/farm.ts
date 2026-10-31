/**
 * 農業・水・M7 の設定の型。`src/contracts.ts` から分けた（中身は移しただけ）。
 */

import type { ItemId, ItemStack } from './items';
import type { BlockId, IslandInfo, LightField, Vec3, VoxelWorld } from './world';
import type { PlayerCombat } from './yokai';

// ================================================================ M7（農業 フェーズ 1）
// 担当の割り振り: docs/tickets/M7-dev-split.md。仕様: docs/design/M7-farm.md

/** 作物の しゅるい。ブロックの id は しゅるいごと（`crop_<kind>`・`wild_<kind>`）。段階は id に入れない */
export type CropKind = 'onion' | 'tomato' | 'pumpkin' | 'eggplant';

/** 0 = め・1 = は・2 = みが すこし・3 = みのった */
export type CropStage = 0 | 1 | 2 | 3;

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

export type FarmHintKind = 'till' | 'full' | 'fill' | 'bucket';

export type SeedSource = 'grass' | 'yokai' | 'oldfarm';

/** 農業の出来事。`tick` と 場所つき。画面（D）・音・実績・テストの窓口が読む */
export type FarmEvent =
  | { type: 'till'; tick: number; x: number; y: number; z: number }
  /** すで の 1・2 回目（count = 何回目） */
  | { type: 'tillPress'; tick: number; x: number; y: number; z: number; count: number }
  | { type: 'plant'; tick: number; x: number; y: number; z: number; kind: CropKind }
  | { type: 'stage'; tick: number; x: number; y: number; z: number; kind: CropKind; from: CropStage; to: CropStage }
  | { type: 'harvest'; tick: number; x: number; y: number; z: number; kind: CropKind; veg: number; seeds: number; wet: boolean; happy?: boolean }
  | { type: 'wild'; tick: number; x: number; y: number; z: number; kind: CropKind; seeds: number }
  | { type: 'notRipe'; tick: number; x: number; y: number; z: number; kind: CropKind }
  | { type: 'wet'; tick: number; x: number; y: number; z: number; wet: boolean }
  | { type: 'eat'; tick: number; x: number; y: number; z: number; item: ItemId; heal: number }
  | { type: 'seedFound'; tick: number; x: number; y: number; z: number; from: SeedSource; item: ItemId }
  /** 合図（D が チップを出す）。C が `noteHint` で伝える */
  | { type: 'hint'; tick: number; x: number; y: number; z: number; hint: FarmHintKind }
  /** かかし から 横 4 以内に 入った（`visit:oldfarm`。はじめて だけでなく 入るたび。数えるのは D の実績） */
  | { type: 'visitOldFarm'; tick: number; x: number; y: number; z: number }
  // ---- M7-2
  /** じょうろ に みず を くんだ（x,y,z = 当たった みず の マス）。`water` = くんだ あと の 量 */
  | { type: 'fill'; tick: number; x: number; y: number; z: number; item: WateringCanId; water: number; wasFull?: boolean }
  /** みずやり（x,y,z = まん中 = ねらった はたけ。`tiles` = はんい の はたけ の 数。0 でも 出る） */
  | { type: 'pour'; tick: number; x: number; y: number; z: number; item: WateringCanId; tiles: number }
  /** なでた。happy = ごきげん に なった・again = ごきげん の あいだ・wild = やせいの やさい */
  | { type: 'pet'; tick: number; x: number; y: number; z: number; result: PetResult }
  | { type: 'sprinklerPlaced'; tick: number; x: number; y: number; z: number }
  | { type: 'sprinklerBroken'; tick: number; x: number; y: number; z: number }
  // ---- BUCKET-1
  /** バケツ で 水を くんだ（x,y,z = 水の マス。`item` = くむ ときに 持っていた バケツ。`changed` = から → みず に かわった） */
  | { type: 'bucketFill'; tick: number; x: number; y: number; z: number; item: BucketId; changed: boolean }
  /** バケツ で 水を おいた（x,y,z = 水の マス） */
  | { type: 'bucketPlace'; tick: number; x: number; y: number; z: number }
  /** みずの バケツ が 置けない（コン） */
  | { type: 'bucketNo'; tick: number; x: number; y: number; z: number }
  // ---- MINE-1B
  /** いしばい を まいて 作物が すぐ みのった（x,y,z = 作物の マス。自然に みのった ときの `stage` とは べつ。実績用） */
  | { type: 'ripened'; tick: number; x: number; y: number; z: number; kind: CropKind };

/** BUCKET-1: バケツ 2 しゅるい */
export type BucketId = 'bucket' | 'water_bucket';

/** M7-2: じょうろ 2 しゅるい */
export type WateringCanId = 'watering_can' | 'long_watering_can';

/** M7-2: なでた 結果（`null` = なでられない） */
export type PetResult = 'happy' | 'again' | 'wild';

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
  /** M7-2: ごきげん の 作物（A が 入れる。無い = false） */
  happy?: boolean;
  /** M7-2: しめり が じょうろ の 分 だけ で のこり が `farmWetSoonRatio` 以下（「もうすぐ かわく」） */
  wetSoon?: boolean;
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
   * MINE-1B: いしばい で すぐ みのらせる（座標は 作物のマス）。みのる 前の 作物（段 0〜2）だけ → 段 3 に して true（出来事 stage・ishibai。
   * 見た目は 自然に 育つ ときと 同じに 作り直す）。みのった 作物・やせいの やさい・作物でない マスは 何も せず false。いしばい を へらすのは C
   */
  ripen(x: number, y: number, z: number): boolean;
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

// ---- M7-2: つなぎ目の口（docs/design/M7-2-farm.md §7。名前は 担当が 変えて よい。変えたら 報告）

export type Facing = 'x+' | 'x-' | 'z+' | 'z-';

/**
 * B → A: スプリンクラー の はんい（`src/farm/sprinkler.ts`。B が実装）。
 * A は ③（§4.3）を この口 だけ で 聞く。
 */
export interface SprinklerPort {
  /** はたけ のマス (x,y,z) が どれか の スプリンクラー の はんい（5×5・sy−2 ≤ y ≤ sy）か */
  covers(x: number, y: number, z: number): boolean;
  /** 世界 に ある スプリンクラー（`farm.sprinklers()`） */
  list(): Vec3[];
  /** ブロックが 変わった（置いた・こわれた）ことを 知らせる。A が `setBlock` の まわりで 呼ぶ */
  onBlockChanged(x: number, y: number, z: number, before: BlockId, after: BlockId): void;
  /** 読みこみ の あと、世界 から さがし直す */
  rescan(world: VoxelWorld): void;
}

/**
 * C → A: ごきげん（`src/farm/pet.ts`。C が実装）。
 * 座標は 作物のマス。A の `update` が `tick()` を 呼び、そだつ 計算 で `growFactor` を p に かける。
 */
export interface PetPort {
  /** ごきげん なら 1 + `farmPetGrowBonus`、ちがえば 1 */
  growFactor(x: number, y: number, z: number): number;
  isHappy(x: number, y: number, z: number): boolean;
  /** ごきげん の のこり ステップ（無ければ 0） */
  left(x: number, y: number, z: number): number;
  /** なでる。作物 でなければ null。やせいの やさい は 'wild'。'happy' の ときだけ のこり を `farmPetDays` に する */
  pet(x: number, y: number, z: number, crop: FarmCropInfo & { wild: boolean }): PetResult | null;
  /** 農業 の 1 ステップ ごと に A が 呼ぶ（のこり を へらす） */
  tick(): void;
  /** 作物 が なくなった（しゅうかく・こわした）。ごきげん を 消す */
  onCropRemoved(x: number, y: number, z: number): void;
  /** 保存 `farm.happy` に そのまま 入れる（x,y,z,のこり の 4 こ ずつ） */
  serialize(): number[];
  /** 読む。`isCrop(x,y,z)` が false の 行 と のこり ≤ 0 は 飛ばす */
  deserialize(flat: unknown, isCrop: (x: number, y: number, z: number) => boolean): void;
}

/** ねらいの線 の 情報（A の `WateringPort` と C の ふりわけ が 使う） */
export interface WaterRay {
  /** 線 が 固いブロック・作物 に 当たる より 手前で `water` を 通った（目 の ある マス は 数えない） */
  throughWater: boolean;
  /** 通った いちばん 手前 の `water` の マス（throughWater の とき） */
  waterCell: Vec3 | null;
  /** 当たった ブロック・作物 の マス（無ければ null） */
  hit: Vec3 | null;
}

/** 右クリック の 4a〜4c を 見分けた 答え */
export type WaterPreview = 'fill' | 'pour' | 'fillHint';

/**
 * A → C: じょうろ（`src/farm/watering.ts`。A が実装）。C は ふりわけ の 4a〜4c で これ を 呼ぶ だけ。
 * `water` を へらす・ふやす のも A（`slot` の `ItemStack.water` を 書きかえる）。
 */
export interface WateringPort {
  /**
   * 4a〜4c の どれか。持っているのが じょうろ でなければ null。
   * 'fill' = くむ（4a）・'pour' = まく（4b）・'fillHint' = からっぽ の 合図（4c）。
   * repeat = 押しつづけ の くりかえし の ステップ。その とき は 'fill'・'fillHint' を 返さない（4a の ステップ は null で 何もしない）
   */
  canPreview(held: ItemStack | null, ray: WaterRay, repeat: boolean): WaterPreview | null;
  /** くむ。まんたん まで。出来事 fill（まんたん の ときも 出して よい: `water` が 変わらない）。戻り値 = くんだ あと の 量 */
  fill(slot: number, at: Vec3): number;
  /**
   * まく。`target` = 当たった マス（はたけ か 作物）、`facing` = 見ている 向き の 水平 ベクトル (dx, dz)（§2.1 の 近い軸）。
   * はたけ 1 つ 以上 なら `water` 1 へり、出来事 pour。戻り値 = `tiles`（はんい の はたけ の 数。0 なら 何も へらさない）
   */
  pour(slot: number, target: Vec3, facing: { dx: number; dz: number }): number;
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
  | 'ripen' // MINE-1B: いしばいで みのらせる
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
 * `pristine` を わたすと その 世界（読みこんだ直後の 世界と `IslandInfo`）を 使う。なければ 同じ シードで 読みこみ直して 使う。
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

/** BUCKET-1: 4d〜4g の 答え（'idle' = バケツ を 持っているが 何も しない。ほかの 段へ 進まない） */
export type BucketPreview = 'bucketFill' | 'bucketPlace' | 'bucketHint' | 'bucketNo' | 'idle';

/** BUCKET-1: バケツ（`src/farm/bucket.ts`）。持ち物の id を かえる のも 出来事を 出す のも ここだけ */
export interface BucketPort {
  /** 4d〜4g。バケツ でなければ null。repeat（押しつづけ）の ステップは 'idle' */
  preview(held: ItemStack | null, ray: WaterRay, hasTarget: boolean, spot: Vec3 | null, repeat: boolean): BucketPreview | null;
  /** くむ（から → みず。みず は かわらない）。かわったら true。出来事 bucketFill */
  fill(slot: number, at: Vec3): boolean;
  /** おいた あと: みず → から。出来事 bucketPlace。みず でなければ false */
  placed(slot: number, at: Vec3): boolean;
  /** 置けない（コン）。出来事 bucketNo */
  no(at: Vec3): void;
}

/** 右クリックで起きること（`src/dig/rightClick.ts` が 判定。M7-2 で 'fill'・'pour'・'fillHint'・'pet' を 足した） */
export type RightClickKind =
  | 'storage' | 'furnace' | 'armor' | 'till' | 'plant' | 'seedHint' | 'eat' | 'place'
  | 'fill' | 'pour' | 'fillHint' | 'pet'
  | 'bucketFill' | 'bucketPlace' | 'bucketHint' | 'bucketNo'
  // LIVE-1
  | 'feed' | 'animalPet'
  // LIVE-1 版 3.2（§2.3）
  | 'animalFull' | 'net' | 'netHint' | 'putDown'
  // LIVE-2（§2.11）: 1a こたつ（入れる／たまご が いる／まってね／6 つ まで）・1b 小屋 の あつめる（なし = coopNoEgg）・10a 小屋 を 置く
  | 'kitPut' | 'kitNeedEgg' | 'kitWait' | 'kitMax'
  | 'coopCollect' | 'coopNoEgg' | 'coopPlace' | 'coopNoRoom' | 'coopMax'
  // LIVE-2.1（§2.2・§2.4）: だっこ 中 の なげる（'throwNo' = なげられない 所。うすく）・こたつ いっぱい
  | 'throw' | 'throwNo' | 'kitFull'
  // LIVE-3（§2.6）: 1b えらべる 子 が いる 小屋 = メニュー を ひらく・9 なま もも にく = 合図 rawMeat（照準 の 下 は うすく）
  | 'coopMenu' | 'rawMeat'
  // ITEM-FX-1（#342）: ふとんで ねる・たこを あげる／もどす
  | 'sleep' | 'kite'
  // HOUSE-1A: 建築士さんを ねらって いる（右クリック = はなす。置く・耕す などの 案内は 出さない）
  | 'talk'
  // MINE-1B: チョークで かく・いしばいを まく
  | 'chalkDraw' | 'ripen'
  // HOUSE-1C PR-1: 家の 戸を あける・しめる（上下 どちらを ねらっても 2 マス いっしょ）
  | 'doorOpen' | 'doorClose'
  // HOUSE-1D: 家具の はたらき（いす・まるいすで すわる／おふろに はいる／ほんだなで ルールブックを よむ）
  | 'sit' | 'bath' | 'read';

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
  // ---- M7-2
  farmWaterDays: number;
  farmCanCapacity: Record<WateringCanId, number>;
  farmCanTiles: Record<WateringCanId, number>;
  farmCanYReach: number;
  farmPourRepeatTicks: number;
  farmWetSoonRatio: number;
  farmSprinklerRadius: number;
  farmSprinklerSprayTicks: number;
  farmPetDays: number;
  farmPetGrowBonus: number;
  farmHeartEvery: number;
  farmHeartRange: number;
  farmHeartMax: number;
  farmSparkleEvery: number;
  farmSparkleRange: number;
  farmSparkleMax: number;
}
