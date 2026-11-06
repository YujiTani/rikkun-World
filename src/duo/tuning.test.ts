import { describe, expect, it } from 'vitest';
import { DUO_COLORS, DUO_TUNING } from './tuning';

/**
 * COOP-1 作業 3e（#422。docs/design/COOP-1.md 1.8 §9.1・§9.2・§9.3）の 先行テスト（赤）。数の 表 `DUO_TUNING` の 形。
 *
 * ---- 実装への 約束（src/duo/tuning.ts）----
 *   なくす 数（1.8 で やめた 物。表に 残さない）:
 *     tierUpAt・tierDownAt（色の 段）、cameraDuo（1 画面の 6.0）、splitUpAt・splitDownAt・splitBackSteps・viewWaitSteps（分割の ゆれ止め）、
 *     loupeOutRatio・loupeInRatio・loupeHoldSteps・loupeDiameterRatio・loupeEdgePx・loupeTopRatio・loupeBottomRatio・loupeBorderPx・loupeDrawTiles・loupeArrowGapPx（ルーペ）
 *   なくす 色: DUO_COLORS.tier
 *   かえる 数: transitionSteps = { split: 24, reduced: 9 }（`loupe` を なくす）
 *   足す 数（矢印。仕様 §9.3）:
 *     arrowOutRatio     0.9   相手が 自分の 半分の 内側 この 割合の 外 → 出る 数えに 入る（NDC の 絶対値の 大きい 方）
 *     arrowInRatio      0.8   内側 この 割合の 中 → 消える 数えに 入る
 *     arrowHoldSteps    18    出る・消える までの つづき（ステップ。0.3 秒）
 *     arrowNearTiles    4     2 人の 距離が これ 以下 なら 出さない・消す（マス）
 *     arrowEdgePx       16    半分の ふち・まん中の 線から 内側へ（px）
 *     arrowTopRatio     0.12  上の 12%（メーター・お知らせ）には かけない（画面の 高さに 対する 割合）
 *     arrowBottomRatio  0.78  下の 22%（ホットバー）には かけない（ここより 下に 置かない）
 *     arrowHeightRatio  0.05  三角の 高さ（画面の 高さに 対する 割合）
 *     arrowMinHeightPx  32    三角の 高さの 下限（px）
 *     arrowFadeSteps    12    出る・消える ふわっと（ステップ。約 0.2 秒）
 */

const RETIRED = [
  'tierUpAt', 'tierDownAt', 'cameraDuo',
  'splitUpAt', 'splitDownAt', 'splitBackSteps', 'viewWaitSteps',
  'loupeOutRatio', 'loupeInRatio', 'loupeHoldSteps', 'loupeDiameterRatio', 'loupeEdgePx', 'loupeTopRatio',
  'loupeBottomRatio', 'loupeBorderPx', 'loupeDrawTiles', 'loupeArrowGapPx',
];

describe('1.8: やめた 数は 表から なくす', () => {
  it.each(RETIRED)('DUO_TUNING.%s は ない', (key) => {
    expect(Object.keys(DUO_TUNING)).not.toContain(key);
  });
  it('色の 段 DUO_COLORS.tier は ない（1P・2P の 色だけ）', () => {
    expect(Object.keys(DUO_COLORS).sort()).toEqual(['p1', 'p2']);
  });
});

describe('1.8: のこす 数・かえる 数', () => {
  it('2P が いる あいだの カメラの 距離は 5.0（1P・2P 同じ。§9.1）', () => {
    expect(DUO_TUNING.cameraSplit).toBe(5.0);
    expect(DUO_TUNING.cameraSolo).toBe(4.0);
  });
  it('見せ方の 長さ: 分割へ・から 24 ステップ（0.4 秒）、動きを 減らす 設定は 9 ステップ（0.15 秒）。ルーペの 12 は ない', () => {
    expect(DUO_TUNING.transitionSteps).toEqual({ split: 24, reduced: 9 });
  });
  it('メーターは のこる（48 マスで いちばん 長い・画面の 幅の 30%）', () => {
    expect(DUO_TUNING.meterFullTiles).toBe(48);
    expect(DUO_TUNING.meterWidthRatio).toBe(0.3);
  });
  it('輪（48／32）・軽くする 工夫（16 マス・120 ステップ）・列の 上限（595）は そのまま', () => {
    expect([DUO_TUNING.ringsUpAt, DUO_TUNING.ringsDownAt, DUO_TUNING.layoutMaxColumns]).toEqual([48, 32, 595]);
    expect([DUO_TUNING.lightMicroRadiusTiles, DUO_TUNING.lightRestoreSteps]).toEqual([16, 120]);
  });
});

describe('§9.3: 矢印の 数', () => {
  it('仕様の 値と 同じ', () => {
    expect(DUO_TUNING.arrowOutRatio).toBe(0.9);
    expect(DUO_TUNING.arrowInRatio).toBe(0.8);
    expect(DUO_TUNING.arrowHoldSteps).toBe(18);
    expect(DUO_TUNING.arrowNearTiles).toBe(4);
    expect(DUO_TUNING.arrowEdgePx).toBe(16);
    expect(DUO_TUNING.arrowTopRatio).toBe(0.12);
    expect(DUO_TUNING.arrowBottomRatio).toBe(0.78);
    expect(DUO_TUNING.arrowHeightRatio).toBe(0.05);
    expect(DUO_TUNING.arrowMinHeightPx).toBe(32);
    expect(DUO_TUNING.arrowFadeSteps).toBe(12);
  });
});
