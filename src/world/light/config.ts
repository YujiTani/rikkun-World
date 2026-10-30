/** 光の数値（M4 光。マイクラと同じ 0〜15 の明るさ） */
export const LIGHT_CONFIG = {
  maxLevel: 15,
  /** たいまつ・こわれない たいまつ の明るさ */
  torchLevel: 14,
  /** ほたるいし（MINE-1B）の明るさ。置いた マスが 7・となり 6・2 マス 先 5（空気の 中を 1 マスずつ。たいまつの 半分。yuzu「光りすぎじゃない？」で 10 → 7） */
  hotaruishiLevel: 7,
  /** たいまつの明るさは 3 だんかい（オーナー決定）: 光が空気を 1 マスずつ広がる数え方で、
   *  4 マスまで＝強い明かり、5〜8 マス＝少し明るい、それより遠い＝明かりなし */
  torchBrightRadius: 4,
  torchDimRadius: 8,
  /** 「強い」「少し」の見た目の明るさ（0〜1。強いは昼とほぼ同じ） */
  torchBrightBrightness: 0.95,
  torchDimBrightness: 0.5,
  /** 昼から夜へ、空の光が弱まる最大の段数（夜の空の下は 15 - 11 = 4） */
  nightDarken: 11,
  /** #76 夜の外の空の光の曲線に かける倍率（夜の外 0.125 → 0.02）。昼は 1。夕方・明け方は 夜の度合い nt でなめらかに */
  nightSkyMul: 0.16,
  /** #76 夜の倍率を かけきる空の光の下限段（空の光 ÷ これ を 0〜1 に切る = w。どうくつの入り口をなめらかに、空の光 0 は かけない） */
  nightSkyFullLevel: 4,
  /** 明るさ 0 のときの見え方（真っ黒にしない、ごくわずかな下限） */
  minBrightness: 0.045,
  /** ブロックの光が空の光より強いとき、少しだけ暖かい色にする */
  warmTint: [1.0, 0.86, 0.68] as readonly [number, number, number],
  warmTintStrength: 0.85,
  /** 妖怪・人形・落とし物の明るさの下限（見えなくなりすぎないように） */
  dollMin: 0.3,
  /** 妖怪の明るさの下限（#76 で 0.3 → 0: 足もとと同じ暗さ。YokaiManager の lightMin の既定） */
  yokaiMin: 0,
  /** 妖怪が出る「暗い所」の明るさ（マイクラと同じ 7 以下） */
  spawnMaxLevel: 7,
} as const;
