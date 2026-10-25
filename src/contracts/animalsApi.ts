/**
 * 生き物の窓口・セーブ・小屋・戦いの型。`src/contracts.ts` から分けた（中身は移しただけ）。
 */

import type { AnimalBreed, AnimalHintKind, AnimalInfo, AnimalStage, AnimalView, AnimalWindowHint, CoopInfo, KitEgg, KitIcon, KitInfo, LiveSettings, NatsukiView, SwingResult } from './animals';
import type { ItemId, ItemStack } from './items';
import type { DayPhase, Vec3 } from './world';

/** `animals.placeCoop` の 答え: 小屋 id か 理由 */
export type CoopPlaceResult = number | 'noRoom' | 'max';

/** 置く 前 の すけた 形 の 答え（§2.3 10a。入る 所 は 白、入らない 所 は ななめ の しま） */
export interface CoopPlacePreview {
  /** 実際 に 置く 5×5 の まん中 と いちばん 下 の 高さ（1 マス ずらし 後）。入らない なら ねらった 所 */
  x: number;
  y: number;
  z: number;
  dir: 0 | 1 | 2 | 3;
  ok: boolean;
}

/** 右クリック で こたつ を ねらった 答え（C の ふりわけ 1a） */
/** LIVE-2.1: 'full' = その こたつ は 3 こ いっぱい（合図 kitFull）。'max' = 世界 ぜんぶ で 6 こ（kitMax） */
export type KitUseResult = 'put' | 'wait' | 'needEgg' | 'max' | 'full';

/** 小屋 の ブロック を ねらって 左クリック した 答え（C の こわせない しらせ、§2.3） */
export type CoopBreakResult = 'ok' | 'locked';

/** 保存 v 3（§4.4）。窓口 `animals.serialize()` の 形 */
export interface AnimalBirdSave {
  x: number;
  y: number;
  z: number;
  yaw: number;
  follow: number;
  stage: AnimalStage;
  breed: AnimalBreed;
  /** LIVE-2.1: 0・false の ときは 書かない（保存 の 大きさ。読む とき は 無ければ 0・false） */
  raised?: boolean;
  bugs?: number;
  goldMiss?: number;
  grow?: number;
  /** GOLD-1: はじめ の 値（0・0・0・natsukiDecayTicks）の ときは 書かない（4,000 文字 以下 の ため。`natsukiDecayLeft` は natsuki が 0 の ときも 書かない） */
  natsuki?: number;
  natsukiBugWait?: number;
  natsukiPetWait?: number;
  natsukiDecayLeft?: number;
}

export interface AnimalSaveV3 {
  v: 3;
  friends: AnimalBirdSave[];
  coops: { id: number; x: number; y: number; z: number; dir: number; kids: AnimalBirdSave[]; nest: { egg: number; gold: number } }[];
  kits: { x: number; y: number; z: number; egg: KitEgg; left: number }[];
  machoMiss: number;
}

/** LIVE-2.1 保存 v 4（§4.3）。`kits` の 行 が `eggs`（入れた 順。1〜3 こ）に なる。ほか は v 3 と 同じ */
export interface AnimalSaveV4 {
  v: 4;
  friends: AnimalBirdSave[];
  coops: AnimalSaveV3['coops'];
  kits: { x: number; y: number; z: number; eggs: { egg: KitEgg; left: number }[] }[];
  machoMiss: number;
}

/** 版 2（LIVE-1 版 3.2。v 3 へ 直して 読む）。A が v 3 に 置きかえる まで は これ も 返る */
export interface AnimalSaveV2 {
  v: 2;
  friends: { x: number; y: number; z: number; yaw: number; follow: number }[];
}

// ---- LIVE-2.1: なげる（docs/design/LIVE-2.1.md §2.2）

/** なげる ときの ねらい（C が 毎ステップ 作る）。`place` = ねらった ブロック を 置く なら 入る マス（無ければ null）、`eye` = 目、`dirX`・`dirZ` = 前（水平。長さ 1） */
export interface ThrowAim {
  place: Vec3 | null;
  eye: Vec3;
  dirX: number;
  dirZ: number;
  /** ねらいの 線 の 向き（上下 も ふくむ）と、ねらった ブロック の 名前。とりごや の さく・もん なら 線 を 通して その 先 の 床 を ねらう（なくても よい） */
  dir3?: Vec3;
  hitId?: string;
}

/** 着地点 の 答え（窓口 `animals.throwSpot()`・丸 の 場所）。`toss` false = d＜1 で そっと おろす。`why` = なげられない わけ の 合図 */
export interface ThrowSpot {
  x: number;
  y: number;
  z: number;
  ok: boolean;
  home: number | null;
  toss: boolean;
  why: AnimalWindowHint | null;
}

/** A の口（C の ふりわけ・B の 描画・窓口 が 使う。§7 約束 2・3） */
export interface AnimalApi {
  /** ねらう 箱（横 0.8×0.8・高さ 1.0）との 当たり。C が ブロック の 当たり と くらべる */
  rayHit(origin: Vec3, dir: Vec3, maxDist: number): { id: number; distance: number } | null;
  /** null = 動き の とちゅう で 何も しない */
  preview(id: number, held: ItemStack | null): 'feed' | 'animalFull' | 'animalPet' | null;
  /** 版 3.2（C が 足した）: なかま か。なかま は 右クリック を はなす か 40 おしつづける まで 何も しない（§2.3・§2.8）。なければ やせい あつかい */
  isFriend?(id: number): boolean;
  /** 版 3.2（C が 足した）: C から の 合図（treeEmpty・netHint・cantPutHere・carryWild・fullHint・friendFull・feedHint）を 出来事 `hint` と `lastHint()` に 入れる */
  emitHint?(h: AnimalHintKind): void;
  /** 'ate' の とき だけ C が むし を 1 へらす。'full' = おなかいっぱい、'pet' = なでる に なった、'friendFull' = なかま が 8 わ */
  feed(id: number, item: ItemId): 'ate' | 'full' | 'pet' | 'friendFull' | 'sleep' | 'wait' | 'harapan' | 'harapanNo' | null;
  /** GOLD-1: `'wait'` = なでる の まち中（なでられない。合図 natsukiWait は A が 出す） */
  pet(id: number): 'wild' | 'friend' | 'wait' | null;
  /** GOLD-1 §6: なかよし パネル の 状態（`shown` は 大人 の なかま だけ） */
  natsukiView?(id: number): NatsukiView | null;
  /** 版 3.2: おなかいっぱい か（テスト・確認用。照準 の 下 の `まってね` は `preview` が 'animalFull' を 返す） */
  isFull?(id: number): boolean;
  /** 版 3.2: あみ を ふる（block = ねらって いる ブロック）。くじ は A */
  swingNet(block: Vec3): SwingResult;
  /** 版 3.2: 押しつづけ（heldTicks）。'lifted' = だっこ した、'wait' = まだ、'wild' = やせい は だっこ できない、null = 何も しない */
  carryHold(id: number, heldTicks: number): 'lifted' | 'wait' | 'wild' | null;
  /** 版 3.2: おろす（spot = 足もと の 位置）。おろせたら true */
  putDown(spot: Vec3): boolean;
  /** LIVE-2（C が 足した）: `putDown` が false の 直後 に 呼ぶ。A が 理由 を 持って いれば その 合図（`coopFull`＝6 わ の 小屋・`friendFull`＝なかま 8 わ）。なければ C は 小屋 の 中 の 数 を 自分 で 見て、それ でも なければ `cantPutHere` */
  putDownWhy?(): AnimalWindowHint | null;
  /** だっこ している id か null */
  carrying(): number | null;
  forEachVisible(fn: (v: AnimalView) => void): void;

  // ---- LIVE-2（§6.1・§7）。A が 実装。C（ふりわけ・画面）・B（描画）・つなぎ込み が 使う
  /** 小屋 を 置く（ゲーム の 置く と 同じ 判定。1 マス ずらし 8 か所 を 含む）。y は 5×5×4 の いちばん 下 の 空気 の 高さ */
  placeCoop(x: number, y: number, z: number, dir?: 0 | 1 | 2 | 3): CoopPlaceResult;
  /** 置く 前 の すけた 形（入る か・ずらし 後 の 場所） */
  previewCoop(x: number, y: number, z: number, dir?: 0 | 1 | 2 | 3): CoopPlacePreview;
  kits(): KitInfo[];
  coops(): CoopInfo[];
  /** その マス が こたつ に たまご が 入って いる か（照準 の 下 `まってね`） */
  kitAt(x: number, y: number, z: number): KitInfo | null;
  /** その ブロック を 持つ 小屋（さく・もん・ねぐら・すばこ。なければ null） */
  coopAt(x: number, y: number, z: number): CoopInfo | null;
  /** 右クリック: `held` を 持って こたつ を ねらった。入れた なら 'put'（A が 持ち物 を へらす 口 は 無い。C が `held` を 1 へらす） */
  useKit(x: number, y: number, z: number, held: ItemId | null): KitUseResult;
  /** 右クリック: 小屋 の すばこ の たまご を ぜんぶ あつめる（入らない 分 は のこる）。あつめた 数 */
  collectCoop(coopId: number): { egg: number; gold: number };
  /** 左クリック の 押した ステップ: 小屋 の ブロック を こわして よい か。'locked' なら 出来事 `coopLocked`・合図 `coopNotEmpty`・音 `animalHint` は A が 出す */
  breakCoop(coopId: number, firstPress: boolean): CoopBreakResult;
  /** 小屋 を 消す（子 0 の とき だけ。ブロック を 消すのは つなぎ込み〈`AnimalDeps.removeCoopBlocks`〉）。すばこ の たまご を おとす */
  removeCoop(coopId: number): boolean;
  /** ひよこ から 数えて 種類 の くじ の 数（保存 される。引数 で 設定） */
  machoMiss(n?: number): number;
  serialize(): AnimalSaveV4 | AnimalSaveV3 | AnimalSaveV2;
  deserialize(data: unknown): void;
  /** B が 描く: こたつ（たまご が 入って いる もの だけ） */
  forEachKit(fn: (k: KitInfo & { hatchT: number }) => void): void;
  /** B が 描く: 小屋（すばこ の 数 と 子 の 数） */
  forEachCoop(fn: (c: CoopInfo) => void): void;
  /** 直前 の `putDown` が 失敗 した わけ（`coopFull`・`friendFull`。A が 合図 を 出して いる）。ほか は null */
  putDownWhy?(): AnimalHintKind | null;
  // ---- LIVE-2.1（§6.2）
  /** だっこ 中 の 着地点 の 答え（だっこ して いなければ null）。照準 の 下 の 語・着地点 の 丸 の もと */
  throwSpot?(aim: ThrowAim): ThrowSpot | null;
  /** だっこ 中 に 右クリック: なげる（d＜1 は そっと おろす）。なげられない 所 は 合図 を 出して false */
  startThrow?(aim: ThrowAim): boolean;
  /** テスト 用: だっこ 中 の 子 を その 足もと の 点 へ なげる（ゲーム と 同じ とびかた・きまり） */
  throwTo?(x: number, y: number, z: number): boolean;
  /** 小屋 の 子 に なった しゅんかん の 大きな しるし の 段 0〜1（いちばん あたらしい 子。なければ 0） */
  homePop?(): number;
  // ---- LIVE-3（§6.1）
  /** その 小屋 の えらべる 子 の id（§2.1） */
  meatList?(coopId: number): number[];
  /** いただきます を はじめる。`notEligible` = えらべない 子（演出 中 の 小屋 より 先 に 見る）・`busy` = その 小屋 で 演出 中 */
  meat?(coopId: number, id: number): { ok: boolean; reason: null | 'notEligible' | 'busy' };
  /** 演出 の 一言 の ふわっと 度 0〜1（出て いない とき は null） */
  meatSay?(): number | null;
  /** 保存 の 前: 演出 中 の 子 を その場 で おわらせる（にく は 持ち物 へ） */
  finishMeat?(): void;
  /** 天板 の 上 の たまご の 3 わく（プレイヤー 8 マス 以内、または たまご を 持って ねらって いる こたつ） */
  kitIcons?(aimedKit: { x: number; y: number; z: number } | null, holdingEgg: boolean): KitIcon[];
  // ---- LIVE-4（§6.1）
  /** たたかえる マッチョ の id（なかま に なった 順。`machoFighters` こ まで） */
  fighters?(): number[];
  /** 「きっかけ」を 渡す（りっくん が たたいた／たたかれた 妖怪）。その ステップ の うち に ねらい が きまる */
  fightCue?(c: FightCues): void;
}

// ---- LIVE-2: ふつう の 計算 の 型（A が `src/animals/` で 書く。ユニット の 仮の 名前: docs/test-reports/LIVE-2.md）

/** 金 の 確率 の もと（AC15 `goldChance(bird, settings)`） */
export interface GoldBird {
  raised: boolean;
  bugs: number;
  goldMiss: number;
  /** GOLD-1: なつき度。`natsukiGoldMin` 以下 なら 0（金 に ならない） */
  natsuki: number;
  /** GOLD-1: マッチョ は 上限 の あと に `goldMachoMul` 倍 */
  breed: AnimalBreed;
}

/** かえす くじ の 状態（AC17 `rollBreed(item, settings, state, rng)`） */
export interface BreedLotteryState {
  machoMiss: number;
}

/** 体 の 当たり の 大きさ（AC18 `bodySize(stage, breed)`） */
export type BodySize = { h: number; w: number; l: number };

/** LIVE-3 用: お肉 に えらべる 子（AC22 `meatEligible(bird)`） */
export type MeatBird = Pick<AnimalInfo, 'stage' | 'home' | 'raised'>;

/** A が 外から 受け取る 物（にせ の 世界・時刻・dropEgg で ユニット できる。§7 約束 4・5） */
export interface AnimalDeps {
  seed: number;
  settings?: LiveSettings;
  dropEgg(at: Vec3): void;
  /** 版 3.2: 持ち物 に 入れる。入らなければ 落として false（むし） */
  addItem(item: ItemId): boolean;
  /** 版 3.2: もう だっこ した ことが ある か（記録 `carry:*` ＞ 0）。`carryHint` を 出すか の 判定 */
  carriedBefore?(): boolean;
  /** LIVE-2: 入る なら 持ち物 へ。入らなければ 何も せず false（足もと に 落とさない）。すばこ の たまご を あつめる とき に 使う。なければ `addItem` */
  tryAddItem?(item: ItemId): boolean;
  day(): number;
  phase(): DayPhase;
  countryAt(seed: number, x: number, z: number): { kind: string };
  // ---- LIVE-2（つなぎ込み が 渡す。ない とき は 小屋 を 置けない・おとしもの を 出さない）
  /** 小屋 の ブロック を 一度 に 置く／消す（`src/world/`。x・z は 5×5 の まん中、y は いちばん 下 の 空気 の 高さ）。置けたら true */
  placeCoopBlocks?(x: number, y: number, z: number, dir: 0 | 1 | 2 | 3): boolean;
  removeCoopBlocks?(x: number, y: number, z: number, dir: 0 | 1 | 2 | 3): void;
  /** すばこ 12 こ いっぱい など で 足もと に おとす（`kin_tamago` も） */
  dropItem?(at: Vec3, item: ItemId): void;
  /** 大人 に なった ことが ある か（実績 `grow:*` が 1 以上。ない とき は A が 今 の 起動 の あいだ だけ 覚える） */
  grewBefore?(): boolean;
  /** かえった ことが ある か（実績 `hatch:*` が 1 以上）。`hatch` 出来事 の `first` の もと */
  hatchedBefore?(): boolean;
  /** LIVE-4: いっしょ に たたかう ための 窓口（つなぎ込み が 渡す。ない とき は だれ も たたかわない） */
  fight?: AnimalFightPort;
}

/** LIVE-4: 妖怪 の 体（たたく 相手）。`state` が 'dying' ならたおれた、'leaving' なら 帰る */
export interface FightYokai {
  x: number;
  y: number;
  z: number;
  /** 当たり の 箱 の 半径（水平）と 高さ */
  radius: number;
  height: number;
  state: 'alive' | 'dying' | 'leaving';
  /** 押されて いる 最中（とまる まで パンチ を まつ） */
  sliding?: boolean;
}

/** LIVE-4: A（にわとり）が 妖怪 に さわる 口（`src/main.ts` が 妖怪 の 管理 へ つなぐ） */
export interface AnimalFightPort {
  /** その 妖怪（もう いなければ null） */
  yokai(id: number): FightYokai | null;
  /** 体力 を へらす・押す・うかす（刀 の 切り上げ と 同じ 口。`by` は 'macho'）。実際 に 与えた 数 */
  hit(id: number, amount: number, from: Vec3, knock: { dist: number; up: number }): number;
  /** りっくん が たおれて いる か（たおれて いる あいだ は たたかわない） */
  playerDead?(): boolean;
  /** 刀 の 設定（突き の フレーム・切り上げ の 倍率〈ダメージ〉と 押す／うく） */
  blade(): { thrust: { startup: number; active: number; recovery: number }; kiriageMul: number; kiriageKnock: readonly [number, number] };
}

/** LIVE-4: 1 ステップ に 起きた「きっかけ」（妖怪 の id）。`hit` = りっくん が 体力 を へらした、`hurt` = りっくん の 体力 を へらした */
export interface FightCues {
  hit: readonly number[];
  hurt: readonly number[];
}
