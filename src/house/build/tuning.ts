// HOUSE-1C PR-2（#340）地盤と 建築の 数を 1 か所に（ルール #304）。DOM・three・世界なし。仕様 docs/design/HOUSE-1.md §2.8〜2.10・§4.4〜4.7。
// 建築の 長さの 式だけは エディターの 表（house/editor/model.ts の houseBuildTicks）。ここは 長さ いがいの 数。

/** みずもり（§4.4）: 13×13 の 列を 見て、高さを 比べる */
export const LEVEL = {
  /** base から 左右（東西・南北）に 見る 列の 数（片がわ。6 → 13×13） */
  half: 6,
  /** base の 高さから 下・上に 見る 段の 数（−4〜+5） */
  below: 4,
  above: 5,
  /** base から この 横の きょり（マス）を こえて はなれたら 色を 出さない */
  showRange: 16,
} as const;

/** どうづき（§4.4）: たたく 間かく（ステップ）と、たたく はんい（3×3） */
export const DOZUKI = { cooldownTicks: 20, half: 1 } as const;

/** 建築の 段（§4.5。進み 0〜1 の 割合）: 〜scaffoldEnd = 足場だけ、〜wallEnd = かべが 少しずつ、そのあと 屋根・家具・ちょうちん */
export const STAGE = { scaffoldEnd: 0.15, wallEnd: 0.85 } as const;

/** 建てる 場所（§4.7）: 探す はんい（プレイヤーから 横・上下に マス）と、戸の 前の 外に あける 段の 数（床の 段の 上） */
export const SITE = { searchHoriz: 24, searchVert: 8, doorFrontClear: 2 } as const;

/** 建築中の 場所を 守る はんい: 外の 箱の 床の 段の 上の 段の 数（かべ 3 ＋ やね 1 ＝ 4） */
export const KEEP_OUT = { levels: 4 } as const;

/** 建築中は 妖怪が 湧かない はんい（まん中から 横に マス。§4.6） */
export const NO_SPAWN_RADIUS = 16;

/** 建築士さん（§4.5・AC40。うろうろする 半径は architect.ts の WANDER_RADIUS）: とんかちを ふる 間かく（ステップ）・うちおろす コマ・完成後に 元の 場所へ もどる プレイヤーとの きょり（マス） */
export const ARCHITECT_WORK = {
  hammerEvery: 60,
  hammerHitFrame: 10,
  hammerFrames: 24,
  returnDistance: 32,
  /** 完成の ばんざい（コマ） */
  cheerFrames: 90,
} as const;

/** とんかちの 音が 聞こえる 戸からの きょり（マス。PO 決め） */
export const HAMMER_HEAR_RANGE = 16;

/** 完成の 盛り上げ（ステップ）: 上の 帯の 長さ（settleWorld を またぐ ほど 長く） */
export const CELEBRATE = { bannerTicks: 420 } as const;

/** 建築を はじめる とき 場所の 中に いた 人・動物・妖怪の うつし先: 戸の 前の 列から 近い 順に 実際に 立てる 列を 集める（最大 こ数・さがす 半径 マス） */
export const EVICT = { spots: 9, radius: 5 } as const;

/** 上空の 視点（§3.4）: カメラの 高さ（プレイヤーの 上に マス。探す はんい 24 マスが 画面に 入る）・矢印を 押しっぱなしの くり返し（はじまるまで delayTicks、そのあと repeatTicks ごと。ステップ） */
export const SKY = { height: 40, repeatTicks: 6, delayTicks: 12 } as const;

/** 家づくりの 道具の はたらき（みずもり ＝ 高さを はかる、どうづき ＝ 地面を かためる）。持った 形・右クリックの 先が これで わかれる */
const TOOL_KIND = { mizumori: 'level', dotsuki: 'tamp' } as const;
export type ToolKind = (typeof TOOL_KIND)[keyof typeof TOOL_KIND];
/** 持って いる アイテムが 家づくりの 道具なら その はたらき（そうでなければ null） */
export function toolKindOf(item: string | null | undefined): ToolKind | null {
  return item != null && Object.prototype.hasOwnProperty.call(TOOL_KIND, item) ? TOOL_KIND[item as keyof typeof TOOL_KIND] : null;
}

/** 建築を はじめた あと、建築士さんの ひとことを 頭の 上に 出して おく 長さ（ステップ） */
export const FAREWELL_TICKS = 150;

/** 材料が 足りない・場所が ない ときの ふきだし */
export const MSG = {
  noSite: 'かためた つちの ばしょが ないよ。みずもり と どうづき で つくってね',
  short: 'ざいりょうが たりないよ',
  noPlan: 'せっけいずが ないよ。「せっけいずを つくる」で かいてね',
  pick: 'どの せっけいずで たてる？',
  sky: 'ここに たてる？ わくを うごかしてね',
  bonus: 'はじめての いえ だから ふとんは おまけ だよ',
} as const;

/** 建築中に 建築士さんに 話した とき の ふきだし（どの 建築士さんも 同じ） */
export const buildingSay = (name: string, word: string): string => `${name}を たてて いるよ。${word}`;
