// 建築士さんの「のこりの 言い方」（HOUSE-1C PR-2 #340。決定 docs/decisions/2026-10-31-house-build-time-words.md。AC22）。DOM・three・世界なし。

/** 言い方 3 つ（進みが 1/3 未満・4/5 未満・それ いご） */
export const BUILD_WORDS = ['はじめた ばかり だよ', 'まだまだ かかるよ', 'もうすぐ おわりそう！'] as const;

/** たった ステップ elapsed・長さ length から 言い方（分け目は 整数で くらべる: 3 倍・5 倍。小数の 丸めに よらない） */
export function buildWord(elapsed: number, length: number): string {
  if (elapsed * 3 < length) return BUILD_WORDS[0];
  if (elapsed * 5 < length * 4) return BUILD_WORDS[1];
  return BUILD_WORDS[2];
}
