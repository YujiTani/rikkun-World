import type { ItemId } from '../../contracts';

/**
 * 妖怪 1 種の「全部の値」を 1 か所に書くための型（#307・ルール #304）。
 * 型だけを import する（実行時の import は 作らない = import の輪を 作らない。Three.js や AI の コードも 読まない）。
 * 書くのは 1 種 1 ファイル（karakasa.ts など）。古い表（YOKAI_NAME・YOKAI_STATS・KIND_AI・SENSE・YOKAI_DROPS …）は
 * registry.ts の「見せ方」から 作る。
 */

/** ドロップ表の 1 行。1 回たおすと 各行を chance で 判定し、数は 1〜max。高 0.7・中 0.4・低 0.15・とても低 0.05（オーナー決定） */
export interface DropRow {
  item: ItemId;
  chance: number;
  max: number;
}

/** 妖怪ごとの元の数。体力・攻撃力・経験値は、ここと stats.ts の式から 計算する（手で書かない） */
export interface YokaiBasis {
  /** 目標の強さ（オーナーのことば。からかさ = 1） */
  target: number;
  /** 1 回の攻撃力（体力。1 = ハート半分） */
  attack: number;
  /** 経験値（M = 1・二つ名なし） */
  xp: number;
  /** 飛び道具か（書かない = false） */
  projectile?: boolean;
  /** 前にしか攻撃しないか（書かない = false） */
  frontOnly?: boolean;
}

/** 動きの数（体力 hp は 強さの式で 計算して YokaiStats に 入れる） */
export interface YokaiMotion {
  /** 攻撃を始めてから当たるまで（秒） */
  hitSeconds: number;
  /** 攻撃の合計の長さ（秒。起き上がり・首のもどりまで） */
  attackSeconds: number;
  /** とどく距離（ブロック） */
  reach: number;
  /** 移動の速さ（ブロック/秒） */
  speed: number;
  /** 次の攻撃まで（秒） */
  cooldownSeconds: number;
  /** みず が苦手（入らない・落ちる先が みず なら降りない）。false は みず の中まで追いかける */
  avoidsWater: boolean;
}

/** 妖怪ごとの AI の数（仕様 §4.3、§2.5）。見つける距離・あきらめる距離は sense */
export interface YokaiAi {
  /** のぼれる段 */
  stepUp: number;
  /** 動くときの体の半分のはば（ぶつかり用） */
  radius: number;
  /** 体の高さ（くうきがあるか調べる用。ちょうちんは地面からの高さ） */
  height: number;
  /** 目の高さ（見つける線の始まり） */
  eyeHeight: number;
  /** 向きを変える速さ（度/秒） */
  turnDegPerSec: number;
  /** 頭の上の「まる」の高さ */
  marksHeight: number;
  /** 浮いて水の上も行けるか */
  flies: boolean;
}

/** 妖怪の 感知（気づく・あきらめる）の 数（NINJA-1 §4.4）。単位: ブロック */
export interface YokaiSense {
  /** これ 以内（よこ の 距離）に 来たら 気づく（うろうろ・さがす とき） */
  sight: number;
  /** 追って いる とき、これ より はなれたら あきらめる（よこ の 距離） */
  giveUp: number;
  /** 忍び装束が 「気づく 距離」を 半分に できる 妖怪か（がしゃどくろ など 大妖怪は この AI を 使わない ので 効かない。あとで 足す ときは false） */
  shinobi: boolean;
}

/** 色ちがい 3 段階の 色（段階 2・3。{ もとの色: 新しい色 }。段階 1 = 今の色なので 書かない。DESIGN 13.1、BALANCE §2.4） */
export type VariantColors = Record<2 | 3, Record<number, number>>;

/** 二つ名の 頭の印の 位置の めやす（頭の グループの中での 箱の大きさ・高さ） */
export interface HeadSpec {
  /** はちまき: 帯の中心の高さ・横と奥行き */
  bandY: number;
  bandW: number;
  bandD: number;
  /** かんむり: 台の下の高さ・横と奥行き */
  crownY: number;
  crownW: number;
  crownD: number;
  /** 印の中心の ずれ（頭の グループの 原点が 体の中心でないとき）。なければ 0 */
  z?: number;
  /** 印ぜんたいの 大きさの 倍率（大きな体に 合わせる）。なければ 1。ここの 数は 倍率で 割った 値で 書く */
  k?: number;
}

/** 妖怪 1 種の 全部の値 */
export interface YokaiDef {
  /** 画面・ログ・ドロップ表の文に出す名前（ひらがな） */
  name: string;
  basis: YokaiBasis;
  motion: YokaiMotion;
  ai: YokaiAi;
  sense: YokaiSense;
  /** ドロップ表（上から 順に 判定） */
  drops: readonly DropRow[];
  colors: VariantColors;
  head: HeadSpec;
  /** 国の 重みの 土台（はらっぱの 行。国ごとの「多め +15・ほか −5」は countryTable.ts の emphasis） */
  country: { base: number };
  /** 「たおした」実績の 名前（名前の 部分。文は achievements/defs.ts） */
  achievement: { name: string };
}
