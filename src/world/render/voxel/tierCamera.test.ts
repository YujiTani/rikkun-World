import { describe, expect, it } from 'vitest';
import { DEFAULT_CAMERA_CONFIG } from '../../../camera/config';
import { MICRO_BACK, microTierRadius, nextTier } from './tier';

/**
 * 段の中心は プレイヤー（カメラの 4 マス前）。小ブロックの段の半径だけ カメラのうしろの距離ぶん小さくして、
 * 前に見える小ブロックの範囲を カメラ中心だったときと同じにする。箱の外がわ 48・ずらし ±2 は そのまま。
 */
describe('microTierRadius: 小ブロックの段の半径（カメラのうしろの距離ぶん小さく）', () => {
  it('うしろの距離は カメラの設定の thirdPersonDistance', () => {
    expect(MICRO_BACK).toBe(DEFAULT_CAMERA_CONFIG.thirdPersonDistance);
  });

  it('32 → 28、24 → 20、16 → 12。0 は 0 のまま', () => {
    expect(microTierRadius(32)).toBe(28);
    expect(microTierRadius(24)).toBe(20);
    expect(microTierRadius(16)).toBe(12);
    expect(microTierRadius(0)).toBe(0);
  });

  it('r=32 は プレイヤーから 26 で 入り、30 まで 出ない（境目 28 ±2）', () => {
    const r = microTierRadius(32);
    expect(nextTier(26, null, r)).toBe('micro');
    expect(nextTier(27, 'box', r)).toBe('box');
    expect(nextTier(26, 'box', r)).toBe('micro');
    expect(nextTier(30, 'micro', r)).toBe('micro');
    expect(nextTier(30.5, 'micro', r)).toBe('box');
  });

  it('箱の外がわは 48 のまま', () => {
    const r = microTierRadius(32);
    expect(nextTier(49, null, r)).toBe('lod');
    expect(nextTier(45, null, r)).toBe('box');
    expect(nextTier(50, 'box', r)).toBe('box');
  });
});
