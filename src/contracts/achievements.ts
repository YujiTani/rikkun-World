/**
 * 実績・M6 の設定の型。`src/contracts.ts` から分けた（中身は移しただけ）。
 */

// ================================================================ M6（作る画面・実績・UI 作り直し）
// 担当の割り振り: docs/tickets/M6-dev-split.md。仕様: docs/design/M6-ui-achievements.md

// WEAPON-7 O8: 実績の おめでとう画面（時間を止める `ModalScreenState`）は なくなった。実績は 画面の 上の 帯に 出し、ゲームは 止めない

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
  | `country:${string}` // COUNTRY-1: `country:<kind>`（0 か 1）・`country:all`（見つけた国の数）
  | `drop:${string}`
  | `store:${string}`
  // LIVE-1 畜産（`<kind>` は 'chicken'、`*` は ぜんぶ）
  | `feed:${string}`
  | `friend:${string}`
  | `petAnimal:${string}`
  | `egg:${string}`
  // LIVE-1 版 3.2（§4.5）
  | `bug:${string}` // `bug:catch`・`bug:*` など
  | `carry:${string}` // `carry:chicken`・`carry:*` など
  // LIVE-2 版 3（§4.5）
  | `hatch:${string}` // `hatch:*`・`hatch:chicken`・`hatch:macho`
  | `home:${string}` // `home:*`（小屋 の 子 に なった）
  | `grow:${string}` // `grow:*`（大人 に なった）
  | `goldenEgg:${string}` // `goldenEgg:*`（金 の たまご を うんだ）
  // GOLD-1（§4.8）
  | `obtainRarity:${string}` // `obtainRarity:epic`（めずらしさ ちょうど ほし 5 の 物 が 持ち物 に 入った 回数）
  // LIVE-3（§4.4）
  | `meat:${string}` // `meat:*`（いただいた 数。実績 は 作らない）
  | `machoKO:${string}` // `machoKO:*`（マッチョ の パンチ で たおした 数。LIVE-4）
  // M7 農業（`visit:oldfarm` は上の `visit:` の形）
  | 'till'
  | `plant:${string}` // `plant:<kind>`・`plant:*`
  | `harvest:${string}` // `harvest:<kind>`・`harvest:*`
  | 'harvestWet'
  | `eat:${string}` // `eat:<item>`・`eat:*`
  | `wild:${string}` // `wild:<kind>`・`wild:*`
  | `seedFrom:${string}` // `seedFrom:grass`・`seedFrom:yokai`・`seedFrom:oldfarm`
  // M7-2
  | 'water:*' // みずやり（はんい に はたけ が 1 つ 以上）
  | 'pet:*' // ごきげん に した
  | 'bucketPlace' // BUCKET-1: バケツ で 水を おいた
  | 'harvestPet' // ごきげん の 作物 を しゅうかく
  | 'craftItems:ya'
  | 'pickup:*'
  | 'bagBack'
  | 'defeatLow'
  | 'chain'
  | 'guard'
  | 'bladeCombo3' // WEAPON-6: 3 段 ぜんぶ 当てた
  | `get:${string}` // WEAPON-7: レジェンダリーを はじめて 手に 入れた（`get:raijin_ken`）
  | 'ninjaKinds' // NINJA-1: 手に 入れた ことの ある 忍者装備の しゅるいの 数
  | 'samuraiKinds' // SAMURAI-1: 手に 入れた ことの ある 侍装備の しゅるいの 数
  | 'legendKinds' // WEAPON-7: 手に 入れた ことの ある レジェンダリーの しゅるいの 数
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
  | 'storeFull'
  // WEAPON-2（道具が こわれた 回数・へった たいきゅうの 合計・防具が こわれた 回数）
  | 'toolBroken'
  | 'wearTotal'
  | 'armorBroken';

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
  /** COUNTRY-1: 新しくは 取れない 古い 実績（取った物だけ のこす。記録が とどいても 取れない） */
  legacy?: boolean;
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
  /** 出す（上の 帯。ゲームは 止めない）。すでに出ている・テロップが 先なら false（C が 毎ステップ やりなおす） */
  open(show: AchievementShow): boolean;
  isOpen(): boolean;
  /** きえたとき（見せた id の列。240 ステップで 自動）。C が「見せた」にして 待ち時間を数えはじめる */
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
  /** WEAPON-7 §2.6 (1): 実績の おしらせ（上の 帯）が 自動で きえる ステップ（出る 30・きえる 30 を ふくむ）。前の `achieveCloseDelay`（とじる が 押せる まで）は なくなった */
  achieveToastTicks: number;
  /** WEAPON-7 §2.6 (2): レジェンダリーの テロップの ステップ（出る 36・きえる 30 を ふくむ） */
  legendTelopTicks: number;
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
