/**
 * 光る つぶ〔ほたるいし。MINE-1B〕の いきの 値（全部の 材料で 共有）。07-mine.md 20.3:
 * 光る 明るさを ±12%・4 秒の サインで ゆっくり 変える。3×3×3 小ブロックの まとまりごとに 位置で ずらす。点滅 しない。
 * 「うごきを へらす」〔prefers-reduced-motion〕で 止める（光る 強さは そのまま）。時間は 毎コマ WorldRenderer.update が 入れる。
 */
export const GLOW_AMP = 0.12;
/** いきの 周期（秒）。シェーダーは 2π ÷ 周期 を 使う */
export const GLOW_PERIOD_SEC = 4;

export const glowUniforms = {
  /** 秒 */
  time: { value: 0 },
  /** ゆれの 大きさ（0.12 = ±12%）。うごきを へらす ときは 0 */
  amp: { value: GLOW_AMP },
};

const reducedQuery: MediaQueryList | null = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;

/** 毎コマ: 時間〔秒〕を 入れる。うごきを へらす 設定は ここで 読む */
export function updateGlow(sec: number): void {
  glowUniforms.time.value = sec;
  glowUniforms.amp.value = reducedQuery?.matches ? 0 : GLOW_AMP;
}
