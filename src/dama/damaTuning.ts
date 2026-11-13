import type { MedalTier, YokaiTitle } from '../contracts';

/**
 * ようかいダマの 数の 表（TOWN-1 §4.1。数は ここ 1 か所。テストも 画面も ここを 読む。#304・#311）。
 * 数の 1 つ 1 つは【PO 案】（オーナー確認①で 直して よい）。遠すぎたら ふやす（AC31）。
 * 何も import しない 葉（型だけ）。
 */
export const DAMA = {
  /** ふつうの 妖怪（二つ名 なし）が 落とす 数（こ）。min〜max を 同じ わりあいで（妖怪ごとの シード付き 乱数。へいきん 2） */
  normal: { min: 1, max: 3 },
  /** 二つ名つきの 妖怪が 落とす 数（こ）。おやぶん・たいしょう・ヌシ */
  title: { oyabun: 10, taisho: 20, nushi: 40 } satisfies Record<Exclude<YokaiTitle, 'none'>, number>,
  /** がしゃどくろを たおした 数（こ。決定「300個くらい」。おおばこ 3 回分） */
  gashadokuro: 300,
  /** 4 大妖怪を たおした 数（こ。#334 で 入る とき つかう。先に 表に 置く） */
  daiyokai4: 50,
  /** 実績の メダルごとに もらう 数（こ。1 だんだけの シリーズは きん） */
  medal: { bronze: 2, silver: 5, gold: 10, rainbow: 20 } satisfies Record<MedalTier, number>,
  /** しずかに とる 実績（ロード時・はじまりの はらっぱの「きた！」）の 数（こ） */
  quiet: 0,
  /** しずかに とる 実績の 記録の なまえ（stat）。ロード時に 見つける はじまりの はらっぱ。あずかりの 計算でも 数えない */
  quietStats: ['country:harappa'] as readonly string[],
  /** 妖怪ごとの 乱数の もとに まぜる 数（シードの 種。数の 意味は ない） */
  seedSalt: 4381,
};

/** おおばこの ねだん（ようかいダマ 何こ か。1C で よろずやの 表に うつす とき ここを 読む 形に する。TOWN-1 §4.3） */
export const OBAKO_PRICE_REF = 100;

/**
 * 「ふつうに 1 時間 あそぶと おおばこ 1 回」の 見つもりの 入力（TOWN-1 §4.1 の 表。AC31 の ユニットが 読む）。
 * がしゃどくろ・やたい は 入れない。食事・おふだの 数は 1C・1E が できたら そちらの 表を 読む 形に 直す。
 */
export const DAMA_HOUR = {
  /** 1 時間に たおす ふつうの 妖怪（ひき） */
  yokai: 25,
  /** 1 時間に たおす 二つ名つきの 妖怪（ひき。ほとんど おやぶん） */
  titled: 1,
  /** 1 時間に とる 実績（こ）と その へいきん（ようかいダマ） */
  achievement: { count: 5, average: 5 },
  /** 1 時間に できる めあて（こ）と ごほうびの へいきん（ようかいダマ。合計 200 ÷ 22 こ の 少なめの 見つもり） */
  meate: { count: 3, average: 8 },
  /** 1 時間に つかう 数（ようかいダマ）。食事 ＝ ごはん 1 回 3 ＋ だんご 2 回 1×2、おふだ 1 まい 3 */
  spend: { food: 5, ofuda: 3 },
};
