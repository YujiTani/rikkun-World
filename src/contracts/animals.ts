/**
 * 生き物（にわとり）の型。`src/contracts.ts` から分けた（中身は移しただけ）。
 */

import type { ItemId } from './items';
import type { Vec3 } from './world';

// ================================================================ LIVE-1（にわとり）
// 仕様: docs/design/LIVE-1.md。担当の割り振り: docs/tickets/LIVE-1-dev-split.md

export type AnimalKind = 'chicken';

export type AnimalState = 'appear' | 'wander' | 'rest' | 'look' | 'eat' | 'pet' | 'lay' | 'cheer' | 'follow' | 'idle'
  // LIVE-1 版 3.2
  | 'full' | 'carried' | 'putDown'
  // LIVE-2（§6.1）: ねる・こたつ から かえる 動き・大人 に なる 動き
  | 'sleep' | 'hatch' | 'grow'
  // LIVE-2.1（§6.2）: なげられて とんで いる あいだ
  | 'thrown'
  // LIVE-3（§2.4）: いただきます の 演出 中（ねぐら へ 歩く〜いなく なる まで）
  | 'meat'
  // LIVE-4（§6.1）: いっしょ に たたかう マッチョ（はしる・パンチ・3 回目 の きりあげ・かちポーズ。おうえん は 'cheer'）
  | 'run' | 'punch' | 'upper' | 'flex';

/** LIVE-2: 育ち（§2.12）。ひよこ → 大人 */
export type AnimalStage = 'chick' | 'adult';

/** LIVE-2: しゅるい（§2.10）。`'gold'` は 無い（読む とき は `normal` に 直す） */
export type AnimalBreed = 'normal' | 'macho';

/** LIVE-2: こたつ に 入って いる たまご。`'gold'` = `kin_tamago`（かならず マッチョ） */
export type KitEgg = 'egg' | 'gold';

/**
 * 合図（§3.1・§6.1）。窓口 `animals.lastHint()` の 型 と 同じ（`AnimalWindowHint` を 統合）。
 */
export type AnimalHintKind = AnimalWindowHint;

export type AnimalRemoveReason = 'far' | 'void' | 'buried';

/** `animals.events()` の出来事（§6.1） */
export type AnimalEvent =
  | { type: 'spawn'; id: number; x: number; y: number; z: number }
  | { type: 'remove'; id: number; reason: AnimalRemoveReason }
  | { type: 'feed'; id: number; item: ItemId; hearts: number; friend: boolean }
  | { type: 'friend'; id: number; first: boolean; count: number }
  | { type: 'pet'; id: number; friend: boolean }
  /** LIVE-2: `gold`（金 の たまご か）・`coop`（小屋 の すばこ に 入る とき の 小屋 id。足もと なら null）。省略 = false／null */
  | { type: 'egg'; id: number; x: number; y: number; z: number; gold?: boolean; coop?: number | null }
  | { type: 'warp'; id: number; from: Vec3; to: Vec3 }
  | { type: 'hint'; hint: AnimalHintKind }
  // 版 3.2（§6.1）
  | { type: 'full'; id: number }
  | { type: 'followEnd'; id: number }
  | { type: 'carry'; id: number }
  | { type: 'putDown'; id: number; x: number; y: number; z: number }
  | { type: 'swing'; x: number; y: number; z: number; caught: boolean; reason: SwingReason }
  | { type: 'bugCatch'; toInventory: boolean }
  /** 版 3.2: はじめて の お祝い が おわった（記録 `carry:*` が 0 の あいだ）。つなぎ込み が 合図 `carryHint` に する */
  | { type: 'carryHint' }
  // ---- LIVE-2（§6.1）
  /** かえる 動き が はじまった（x・y・z は こたつ の マス） */
  | { type: 'hatchStart'; x: number; y: number; z: number }
  /** かえった（`gold` = 金 の たまご から） */
  /** `first` = はじめて かえった（B の 音・紙ふぶき の 大きさ。省略 なら B が この 遊び の 中 で 数える） */
  | { type: 'hatch'; id: number; breed: AnimalBreed; gold: boolean; first?: boolean }
  /** 小屋 の 子 に なった */
  | { type: 'home'; id: number; coop: number }
  /** 大人 に なる 動き が はじまった */
  | { type: 'growStart'; id: number }
  /** 大人 に なった（`first` = はじめて） */
  | { type: 'grow'; id: number; first: boolean; breed: AnimalBreed }
  /** 小屋 の すばこ から あつめた（たまご の 数） */
  | { type: 'coopCollect'; egg: number; gold: number }
  /** パタパタ おりて 着地 の コロン（ひよこ） */
  | { type: 'roll'; id: number }
  /** 中 に 子 が いて 小屋 を こわせなかった 押し（1 回 に 1 つ） */
  | { type: 'coopLocked'; coop: number }
  // ---- GOLD-1（§3.4）
  /** はらぱんみみず を あげて なかよし 100（2 回 ジャンプ・ハート 8 こ は B） */
  | { type: 'harapanFeed'; id: number }
  /** まち時計 が うまった（`bug` = むし・`pet` = なでる）。パネル が 出て いる とき だけ 小さな 音 */
  | { type: 'natsukiReady'; id: number; which: 'bug' | 'pet' }
  /** なかよし が 70 以下 → 71 以上 に なった（メーター が きんいろ に・キラッ 8） */
  | { type: 'natsukiGold'; id: number }
  /** まち中 に むし・なでる を しよう と した（こっち を 見て くび を かしげる） */
  | { type: 'natsukiWait'; id: number; which: 'bug' | 'pet' }
  // ---- LIVE-3（§6.1）
  /** いただきます の 演出 が はじまった（0 ステップ） */
  | { type: 'meatStart'; id: number; coop: number }
  /** とびら が しまりきった（closed true）／あがりきった（false）。音 `coopDoor` */
  | { type: 'meatDoor'; coop: number; closed: boolean }
  /** 80 ステップ 目: 一言 が 出る。音 `itadakimasu` */
  | { type: 'meatSay'; id: number; coop: number }
  /** 200 ステップ 目: 子 が いなく なり にく が 入った（`dropped` = 足もと に おちた 数） */
  | { type: 'meat'; id: number; coop: number; count: number; dropped: number }
  // ---- LIVE-2.1（§6.2）
  /** なげる: 手 から はなれた（`to` = 着地点 の 足もと） */
  | { type: 'toss'; id: number; to: Vec3 }
  /** とんで いる とちゅう で 固い マス に 当たった（x・y・z = 止まった 所） */
  | { type: 'bonk'; id: number; x: number; y: number; z: number }
  // ---- LIVE-4（§6.1）
  /** マッチョ が 妖怪 を ねらった（`cause` = りっくん が たたいた か、りっくん が たたかれた か）。音 `machoGo`・「！」 */
  | { type: 'machoTarget'; id: number; yokai: number; cause: MachoCause }
  /** パンチ が 当たった（`upper` = 3 回 に 1 回 の きりあげ。`damage` = 与えた 数）。x・y・z = 当たった 所 */
  | { type: 'machoPunch'; id: number; yokai: number; hit: boolean; upper: boolean; damage: number; x: number; y: number; z: number }
  /** ねらい を やめた */
  | { type: 'machoGiveUp'; id: number; reason: MachoGiveUpReason }
  /** マッチョ の パンチ で たおした（記録 `machoKO:*`） */
  | { type: 'machoKO'; id: number; yokai: number }
  /** かちポーズ が はじまった（音 `machoFlex`。りっくん が たおした とき も） */
  | { type: 'machoFlex'; id: number };

/** LIVE-4: ねらう きっかけ（§2.2） */
export type MachoCause = 'playerHit' | 'playerHurt';

/** LIVE-4: ねらい を やめる わけ（§2.2） */
export type MachoGiveUpReason = 'defeat' | 'gone' | 'far' | 'forget' | 'stop';

/** `animals.list()` の 1 行 */
export interface AnimalInfo {
  id: number;
  kind: AnimalKind;
  x: number;
  y: number;
  z: number;
  yaw: number;
  friend: boolean;
  hearts: 0 | 1 | 2;
  state: AnimalState;
  lookingAtPlayer: boolean;
  inWater: boolean;
  // ---- 版 3.2（§6.1）
  /** ついてくる 残り ステップ（なかま） */
  follow: number;
  /** おなかいっぱい の 残り ステップ */
  fullLeft: number;
  carried: boolean;
  fluttering: boolean;
  /** 上下 の 速さ（下 が 負、マス/秒） */
  vy: number;
  // ---- LIVE-2（§2.12・§6.1）
  stage: AnimalStage;
  breed: AnimalBreed;
  /** 小屋 の 子 なら 小屋 id、でなければ null */
  home: number | null;
  /** ひよこ から 小屋 で そだって 大人 に なった か */
  raised: boolean;
  /** これまで に たべた むし の 数 */
  bugs: number;
  /** 金 で ない たまご を つづけて うんだ 数 */
  goldMiss: number;
  /** 小屋 で そだった 日（大人 は 0） */
  grow: number;
  /** 体 の 当たり の 大きさ（高さ・はば・長さ。§2.2・§2.10） */
  size: { h: number; w: number; l: number };
  // ---- LIVE-4（§6.1）
  /** ねらって いる 妖怪 の id（なければ null） */
  target?: number | null;
  /** その ねらい で 当てた パンチ の 数（3 の 倍数 番目 が きりあげ） */
  hits?: number;
  // ---- GOLD-1（§4.4）。なかま の 大人 だけ 動く（ほか は 0・0・0・natsukiDecayTicks の まま）
  /** なつき度 0〜100（画面 では「なかよし」・メーター だけ） */
  natsuki: number;
  /** むし の まち の のこり ステップ */
  natsukiBugWait: number;
  /** なでる の まち の のこり ステップ */
  natsukiPetWait: number;
  /** へる まで の のこり ステップ */
  natsukiDecayLeft: number;
}

/** GOLD-1 §6: パネル の 状態（窓口 `animals.natsukiView(id)`）。ねらって いる 子 の なかよし パネル が 出る か・ハート 0〜10・きんいろ か・まち時計 が あいて いる か */
export interface NatsukiView {
  shown: boolean;
  /** 0〜10（切り捨て: 75 → 7） */
  hearts: number;
  /** 71 以上 = きんいろ（たまご の しるし も 色つき） */
  gold: boolean;
  bugReady: boolean;
  petReady: boolean;
  /** まち時計 の うまり 0〜1（ふやせる = 1。まち中 は 0 → 1 で うまって いく） */
  bugFill: number;
  petFill: number;
}

export interface AnimalSpawnOpts {
  friend?: boolean;
  hearts?: 0 | 1 | 2;
  // ---- 版 3.2（§6.1）
  follow?: number;
  fullLeft?: number;
  // ---- LIVE-2（§6.1）
  stage?: AnimalStage;
  breed?: AnimalBreed;
  /** 小屋 id（その 小屋 の 子 として 置く） */
  home?: number;
  raised?: boolean;
  bugs?: number;
  goldMiss?: number;
  grow?: number;
  // ---- GOLD-1（§4.4）
  natsuki?: number;
  natsukiBugWait?: number;
  natsukiPetWait?: number;
  natsukiDecayLeft?: number;
}

/** 版 3.2 の 合図 8 つ（§3.1。`animals.lastHint()` の 型） */
export type AnimalLive1Hint =
  | 'feedHint' | 'fullHint' | 'friendFull' | 'treeEmpty' | 'netHint' | 'carryHint' | 'carryWild' | 'cantPutHere';

/** LIVE-2 の 合図 9 つ（§3.1。文・絵 は C が `ANIMAL_HINT_VIEW` に 足す） */
export type AnimalLive2Hint =
  | 'kitMax' | 'kitNeedEgg' | 'kitWait' | 'coopNoRoom' | 'coopMax' | 'coopFull' | 'coopNotEmpty' | 'coopNoEgg' | 'sleepHint';

/** LIVE-2.1 の 合図 1 つ（§3.1）: こたつ が いっぱい（3 こ） */
export type AnimalLive21Hint = 'kitFull';

/** GOLD-1 の 合図 3 つ（§3.1）: まち中・なかよし 100 の 子 に はらぱん・やせい／ひよこ に はらぱん */
export type AnimalGold1Hint = 'natsukiWait' | 'harapanFull' | 'harapanFriend';

/** LIVE-3 の 合図 1 つ（§3.1）: なま は たべられない */
export type AnimalLive3Hint = 'rawMeat';

export type AnimalWindowHint = AnimalLive1Hint | AnimalLive2Hint | AnimalLive21Hint | AnimalGold1Hint | AnimalLive3Hint;

/** あみ の 結果 の わけ（§6.1 `swing`） */
export type SwingReason = 'chance' | 'pity' | 'empty' | 'miss';

export interface SwingResult {
  caught: boolean;
  reason: SwingReason;
}

/** `animals.fx()` の 1 わ ぶん の しるし（§6.1。版 2 の `progress` を おきかえる） */
export interface AnimalMark {
  id: number;
  hearts?: number;
  steps?: number;
  full: boolean;
  /** LIVE-2: いえ の しるし の うまり 0〜1（小屋 に 入る とちゅう だけ） */
  home?: number;
  /** LIVE-3: メニュー ページ 2 で えらんで いる 子（世界 の 頭 の 上 に ▼） */
  pick?: boolean;
  /** LIVE-4: 「！」（マッチョ の 頭 の 上。ねらい を きめて から 20 ステップ） */
  bang?: boolean;
  /** LIVE-4: ねらい の しるし の 行（`id` = ねらわれて いる 妖怪 の id。同時 に 1 行 まで。絵 は HTML の 顔） */
  machoTarget?: boolean;
  yokai?: number;
}

export interface AnimalFxRecord {
  hearts: number;
  burst: number;
  confetti: number;
  puff: number;
  sparkle: number;
  leaf: number;
  /** LIVE-2: から の かけら（かえる）・Z（ねて いる 子 の 数） */
  shell: number;
  zzz: number;
  marks: AnimalMark[];
  /** LIVE-2.1（§6.2）: こたつ ごと の 天板 の 上 の 3 わく（窓口 `fx()` で 足す。8 マス 以内 の もの だけ） */
  kitIcons?: KitIcon[];
  /** LIVE-2.1: こたつ の 中 の たまご の 3D の 物 の 数（いつも 0） */
  kitEggMeshes?: number;
  /** LIVE-2.1: 小屋 の 子 に なった しゅんかん の 大きな しるし の 段（1 → 40 ステップ で 0） */
  homePop?: number;
  /** LIVE-2.1: 置いた とき の 土けむり の つぶ の 数 */
  dust?: number;
}

/** LIVE-2.1: こたつ の 天板 の 上 の たまご の わく 1 つ。`egg` null = から の わく */
export interface KitIconSlot {
  egg: KitEgg | null;
  /** あたため の すすみ 0〜1（から は 0） */
  fill: number;
  wobble: 0 | 1 | 2;
}

export interface KitIcon {
  x: number;
  y: number;
  z: number;
  /** いつも 3 つ */
  slots: KitIconSlot[];
}

/** §4.1 の設定（`settings.get/set` の名前そのまま）。初期値は `LIVE_SETTING_DEFAULTS` */
export interface LiveSettings {
  animalAutoSpawn: boolean;
  animalSpawnInterval: number;
  animalWildMax: number;
  animalSpawnMinDist: number;
  animalSpawnMaxDist: number;
  animalRemoveDist: number;
  animalWanderSpeed: number;
  animalLookDist: number;
  animalFriendFeeds: number;
  animalFriendMax: number;
  animalReactTicks: number;
  animalEggDelay: number;
  animalEggHeal: number;
  animalFollowStart: number;
  animalFollowStop: number;
  animalFollowSpeed: number;
  animalWarpDist: number;
  animalStuckTicks: number;
  // ---- 版 3.2 の 11 こ（§4.1）
  animalFollowTicks: number;
  animalFullTicks: number;
  animalEggChance: number;
  animalEggPity: number;
  bugChance: number;
  bugPity: number;
  bugTreeCooldown: number;
  bugTreeRadius: number;
  netSwingTicks: number;
  carryHoldTicks: number;
  animalFlutterFallSpeed: number;
  // ---- LIVE-2 の 17 こ（§4.1）
  kitHatchTicks: number;
  kitHatchDist: number;
  chickGrowDays: number;
  chickFlutterFallSpeed: number;
  coopMax: number;
  coopCountMax: number;
  coopEnterTicks: number;
  kitActiveMax: number;
  coopNestMax: number;
  machoChance: number;
  machoPity: number;
  goldBaseWild: number;
  goldBaseRaised: number;
  goldPerBug: number;
  goldBugMax: number;
  goldCap: number;
  goldPity: number;
  // ---- LIVE-2.1 の 3 こ（§4.1）
  /** 置き物 で けずる・うめる 高さ の 上限（1 列） */
  placeStepMax: number;
  /** こたつ 1 台 に 入る たまご */
  kitEggMax: number;
  /** なげる 水平 の きょり の 上限（マス） */
  throwRange: number;
  // ---- GOLD-1 の 設定（§4.4・§4.5・§4.7）
  natsukiMax: number;
  natsukiBug: number;
  natsukiPet: number;
  natsukiBugWaitTicks: number;
  natsukiPetWaitTicks: number;
  natsukiDecay: number;
  natsukiDecayTicks: number;
  /** 金 の たまご を うめる のは これ を こえて いる とき だけ（71 以上） */
  natsukiGoldMin: number;
  /** マッチョ の 金 の 確率 に かける 倍（上限 goldCap の あと） */
  goldMachoMul: number;
  harapanYokai: number;
  harapanChest: number;
  harapanBlock: number;
  harapanLog: number;
  /** 地下 = 高さ y が これ より 下（初期値 `SEA_Y`） */
  harapanUnderY: number;
  // ---- LIVE-3 の 3 こ（§4.1）
  /** 1 わ で とれる `momo_nama` */
  meatPerBird: number;
  /** `momo_yaki` で もどる 体力（10 = ハート 5 こ） */
  meatHeal: number;
  /** いただきます の 演出 の ながさ（にく が 入る の は meatTicks − 20） */
  meatTicks: number;
  // ---- LIVE-4 の 6 こ（§4.1。パンチ の 時間 は 刀 の `bladeTech.thrust`、きりあげ は `bladeDamageMul`・`bladeKnock` を 読む）
  /** ふつう の パンチ で へる 妖怪 の 体力（ぼくとう の 強さ と 同じ） */
  machoAtk: number;
  /** とどく 水平 の 距離（妖怪 の 当たり の 箱 まで） */
  machoReach: number;
  /** ねらい へ はしる 速さ（マス/秒） */
  machoRunSpeed: number;
  /** ねらい を きめられる プレイヤー から の 距離 */
  machoLeash: number;
  /** きっかけ が なく なって から ねらい を やめる まで（ステップ） */
  machoForget: number;
  /** 同時 に たたかう 数（0 = だれ も たたかわない） */
  machoFighters: number;
}

/** A -> B: 描く 1 わ ぶん（§7 約束 3。B は A を import しない） */
export interface AnimalView {
  id: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  headYaw: number;
  state: AnimalState;
  stateTicks: number;
  friend: boolean;
  hearts: 0 | 1 | 2;
  /** 今 ねらわれて いる（しるし を 出す） */
  targeted: boolean;
  // ---- 版 3.2（B が 描くために 読む。A が forEachVisible で 埋める。ない ときは 0／false）
  /** ついてくる 残り ステップ（なかま） */
  follow?: number;
  /** おなかいっぱい の 残り ステップ */
  fullLeft?: number;
  /** だっこ されて いる（描く 位置 は B が プレイヤー の 前 に 置く） */
  carried?: boolean;
  /** パタパタ おりて いる（空中 で 下 へ） */
  fluttering?: boolean;
  // ---- LIVE-2（B が 描くために 読む。A が forEachVisible で 埋める）
  stage?: AnimalStage;
  breed?: AnimalBreed;
  /** 小屋 の 子 の 小屋 id（なければ null／省略） */
  home?: number | null;
  /** いえ の しるし の うまり 0〜1（小屋 に 入る とちゅう だけ） */
  homeFill?: number;
  /** 'hatch' 動き の 経過 0〜1（ピキッ → ぽんっ → ぷるぷる、マッチョ は ポーズ まで） */
  hatchT?: number;
  /** 'grow' 動き の 経過 0〜1（ぷるぷる → 光 → ばさっ） */
  growT?: number;
  /** 着地 の コロン の 経過 0〜1（なければ 省略） */
  rollT?: number;
  // ---- LIVE-2.1（B が 描くために 読む）
  /** 小屋 の 子 に なった しゅんかん の 大きな しるし の 段 0〜1（1 → 40 ステップ で 0。1.5 倍 で 出て 20 で ふつう → 40 で 消える の もと） */
  homePop?: number;
  /** なげる もちあげ の 経過 0〜1（手 の 中。もちあげ 10 ステップ。なければ 省略） */
  liftT?: number;
  /** なげられて とんで いる（state が thrown の とき 羽 を ひろげる） */
  thrown?: boolean;
  // ---- LIVE-4（B が 描くために 読む）
  /** いっしょ に たたかって いる あいだ（state の 'run'・'punch'・'upper'・'cheer'・'flex' を 戦い の ポーズ で 描く） */
  fight?: boolean;
  /** 「！」 を 出して いる（ねらい を きめて から 20 ステップ） */
  bang?: boolean;
  /** ねらって いる 妖怪 の id（なければ 省略） */
  target?: number;
}

/** LIVE-4: 骨 1 本 の ポーズ（q = 回転 の 四元数 x,y,z,w。off = 1/16 ブロック） */
export interface FightBone {
  q?: [number, number, number, number];
  off?: [number, number, number];
}

/** LIVE-4: からだ 全体（root）と 骨 ごと の ポーズ（アート案 C の `poses.py` と 同じ 意味） */
export interface FightPose {
  /** off = 1/16 ブロック、rot = 度（x → y → z）、sc = 拡大 */
  root: { off: [number, number, number]; rot: [number, number, number]; sc: [number, number, number] };
  bones: Record<string, FightBone>;
}

// ---- LIVE-2: こたつ・小屋（§6.1。A が 持つ。C・B・つなぎ込み は これ を 読む）

/** `animals.kits()` の 1 行（たまご が 入って いる こたつ だけ。から は 世界 の ブロック と して だけ） */
export interface KitInfo {
  x: number;
  y: number;
  z: number;
  egg: KitEgg | null;
  /** 1 辺 の マス の 数（2 = 2×2 の こたつ、1 = 古い セーブ の 1 マス こたつ。なければ 1） */
  size?: 1 | 2;
  /** あたため の のこり ステップ */
  left: number;
  /** ゆれ: 0 じっと／1 ときどき／2 よく ゆれる＋ひび（§2.1・AC4） */
  wobble: 0 | 1 | 2;
  /** LIVE-2.1（§6.2）: 入って いる たまご（入れた 順。1〜3 こ）。上 の `egg`・`left`・`wobble` は いちばん 先 の たまご */
  eggs?: KitEggInfo[];
}

/** LIVE-2.1: こたつ に 入って いる たまご 1 こ */
export interface KitEggInfo {
  egg: KitEgg;
  left: number;
  wobble: 0 | 1 | 2;
}

/** `animals.coops()` の 1 行 */
export interface CoopInfo {
  id: number;
  /** 5×5 の まん中 の マス（x・z）と いちばん 下 の 空気 の 高さ y */
  x: number;
  y: number;
  z: number;
  /** もん の むき（0 北(-z)・1 東(+x)・2 南(+z)・3 西(-x)） */
  dir: 0 | 1 | 2 | 3;
  /** もん の マス */
  gate: { x: number; z: number };
  /** 小屋 の 子（animal id。だっこ 中 も 数える） */
  kids: number[];
  nest: { egg: number; gold: number };
  /** LIVE-3: ねぐら の とびら（'moving' = おりて／あがって いる とちゅう）。いつも 'open' が ふつう */
  door?: 'open' | 'closed' | 'moving';
  /** LIVE-3: とびら の しまり ぐあい 0（あいて いる）〜1（しまりきった） */
  doorT?: number;
  /** LIVE-3: 演出 中 の 子 の id（なければ null）。1 つ の 小屋 で 同時 に 1 わ */
  meatBusy?: number | null;
}
