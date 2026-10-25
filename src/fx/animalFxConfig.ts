/**
 * LIVE-1（にわとり）の 音・つぶ・ハートの 数の きまり と、つぶの 絵の 番号。`animalFx.ts` から 再輸出 する。
 */
export const ANIMAL_FX = {
  /** 頭の 上の ハートが 出る 近さ（水平。設定 animalLookDist の 初期値） */
  lookDist: 6,
  /** 声（コッコッ）が 聞こえる 近さ */
  cluckRange: 16,
  /** 声の 間 = 300〜600 ステップ（にわとり ごとに 決まる） */
  cluckMin: 300,
  cluckSpan: 301,
  /** 頭の 上の ハート: 3 つ。同時に 出る のは やせいの 数（3）まで */
  headHearts: 3,
  headHeartGap: 0.23,
  /** 頭の 上 0.3 マス（にわとり の 高さ 0.80 の 上） */
  headHeartY: 0.8 + 0.3,
  headHeartSize: 0.26,
  /** はじけ: はじめて 8・2 わ目から 5 */
  burstFirst: 8,
  burstNext: 5,
  /** 紙ふぶき: はじめての なかま だけ。1 回 60 つぶ まで */
  confetti: 60,
  puffEach: 6,
  sparkle: 4,
  // ---- 版 3.2（§3.3・§3.7）
  /** あしあと・おなかいっぱい の しるし が 出る 近さ（水平） */
  markDist: 8,
  /** ついてくる おわり の けむり */
  puffFollowEnd: 4,
  /** あみ の はっぱ・とれた ときの キラッ */
  leaf: 4,
  sparkleBug: 3,
  /** あしあと の まるい 数の きざみ（のこり > 12,000 → 3、> 6,000 → 2、> 0 → 1） */
  stepsHigh: 12000,
  stepsMid: 6000,
  /** のこり この 以下 の あしあと は ゆっくり うすく・こく（1 しゅう 60 ステップ） */
  stepsFade: 1800,
  fadePeriod: 60,
  /** おなかいっぱい（初期値 600 ステップ。しるし が 小さく なって いく 目安） */
  fullTicks: 600,
  /** あみ: ふって から むし が とび出す まで・とんで くる 長さ（ステップ。§2.4） */
  bugPop: 10,
  bugFly: 20,
  /** パタパタ の 音の 間（ステップ） */
  flutterGap: 16,
  flutterRange: 16,
  // ---- LIVE-2（§3.6・§3.7）
  /** こたつ の ゆれ の 音・ねる 音・ひよこ の 声 が 聞こえる 近さ */
  kitRange: 8,
  sleepRange: 8,
  /** ねる 音 の 間（ステップ。いき の 1 しゅう 90 と そろえる） */
  snoreGap: 90,
  /** ひよこ（頭 の 上 の しるし の 高さ） */
  chickHeadY: 0.35 + 0.3,
  machoChickHeadY: 0.4 + 0.3,
  machoHeadY: 0.8 * 1.15 + 0.3,
  /** から の かけら: かえる 動き の 20 ステップ 目（ぽんっ）に 6 つ */
  shell: 6,
  shellAt: 20,
  /** 小屋 の 子 に なる ハート 3・大人 の キラッ 8・金 の たまご の キラッ 8 */
  homeHearts: 3,
  growSparkle: 8,
  goldSparkle: 8,
  // ---- GOLD-1（§3.4）: なかよし が きんいろ に なった ときの キラッ・はらぱんみみず を あげた ときの ハート（どちらも 8 こ）
  natsukiSparkle: 8,
  harapanHearts: 8,
  /** 金 の たまご が すばこ に ある 小屋 の キラッ（ステップ ごと） */
  goldCoopGap: 45,
  /** あつめた 数 が これ 以上 なら 長い ころころ */
  collectMany: 5,
} as const;

/** つぶの 絵の 番号（描く 側の 絵の 並びと そろえる。8 まい 並び） */
export const TILE = { heartFull: 0, heartEmpty: 1, star: 2, dot: 3, footFull: 4, footEmpty: 5, belly: 6, zzz: 7, houseEmpty: 8, house1: 9, house2: 10, house3: 11 } as const;
/** 描く 側 の 絵 の 数（`atlasTexture` の 横の 枚数） */
export const TILE_COUNT = 12;
