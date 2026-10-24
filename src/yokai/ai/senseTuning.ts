import type { YokaiKind } from '../../contracts';

/**
 * 妖怪の 感知（気づく・あきらめる）の 調整表（NINJA-1 §4.4）。ここ 1 か所だけ。値を かえる だけで バランスを 直せる。
 * 数は 今までの ゲームと 同じ（忍び装束を 着て いなければ ふるまいは 1 つも かわらない）。
 * 単位: ブロック = 1 ブロック（1 = 1 m）、割合 = 倍率（1 = そのまま）。
 * 開発中は コンソールで `Object.assign(__rikkun.ninja.sense, { shinobiSightMul: 1 })` のように その場で 上書きできる。
 */
export interface KindSense {
  sight: number; // ブロック: これ 以内（よこ の 距離）に 来たら 気づく（うろうろ・さがす とき）
  giveUp: number; // ブロック: 追って いる とき、これ より はなれたら あきらめる（よこ の 距離）
  shinobi: boolean; // 忍び装束が 「気づく 距離」を 半分に できる 妖怪か（がしゃどくろ など 大妖怪は この AI を 使わない ので 効かない。あとで 足す ときは false）
}

export const SENSE: {
  kinds: Record<YokaiKind, KindSense>;
  sightDy: number;
  giveUpDyMul: number;
  shinobiSightMul: number;
} = {
  kinds: {
    karakasa: { sight: 18, giveUp: 24, shinobi: true }, // からかさ
    chochin: { sight: 21, giveUp: 27, shinobi: true }, // ちょうちん
    nurikabe: { sight: 12, giveUp: 18, shinobi: true }, // ぬりかべ
    rokurokubi: { sight: 18, giveUp: 24, shinobi: true }, // ろくろくび
  },
  sightDy: 6, // ブロック: 気づく 高さの 差（これ 以内の 高さの 妖怪だけ 気づく）
  giveUpDyMul: 2, // 倍: あきらめる 高さの 差 = sightDy × これ（追って いる とき）
  shinobiSightMul: 0.5, // 倍: 忍び装束を 着て いる とき、気づく 距離に かける（0.5 = 半分。あきらめる 距離・高さの 差は かえない）
};
