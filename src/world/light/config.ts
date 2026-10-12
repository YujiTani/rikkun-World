/** 光の数値（M4 光。マイクラと同じ 0〜15 の明るさ） */
export const LIGHT_CONFIG = {
  maxLevel: 15,
  /** たいまつ・こわれない たいまつ の明るさ */
  torchLevel: 14,
  /** たいまつの明るさは 3 だんかい（オーナー決定）: 光が空気を 1 マスずつ広がる数え方で、
   *  4 マスまで＝強い明かり、5〜8 マス＝少し明るい、それより遠い＝明かりなし */
  torchBrightRadius: 4,
  torchDimRadius: 8,
  /** 「強い」「少し」の見た目の明るさ（0〜1。強いは昼とほぼ同じ） */
  torchBrightBrightness: 0.95,
  torchDimBrightness: 0.5,
  /** 昼から夜へ、空の光が弱まる最大の段数（夜の空の下は 15 - 11 = 4） */
  nightDarken: 11,
  /** 明るさ 0 のときの見え方（真っ黒にしない、ごくわずかな下限） */
  minBrightness: 0.045,
  /** ブロックの光が空の光より強いとき、少しだけ暖かい色にする */
  warmTint: [1.0, 0.86, 0.68] as readonly [number, number, number],
  warmTintStrength: 0.85,
  /** 妖怪・人形・落とし物の明るさの下限（見えなくなりすぎないように） */
  dollMin: 0.3,
  /** 妖怪が出る「暗い所」の明るさ（マイクラと同じ 7 以下） */
  spawnMaxLevel: 7,
} as const;
