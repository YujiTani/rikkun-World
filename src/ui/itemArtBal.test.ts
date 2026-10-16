import { describe, expect, it } from 'vitest';
import { axeItemPixels, nickIconPixels, type AxeItem, type NickTier } from './itemArtBal';
import { AXE_HELD_PARTS } from '../camera/heldAxes';

const hexOf = (p: readonly number[]) => (p[0]! << 16) | (p[1]! << 8) | p[2]!;
describe('ART-BAL', () => {
  it('二つ名アイコンは 256 ドットで 3 種 ちがう', () => {
    const tiers: NickTier[] = ['oyabun', 'taisho', 'nushi'];
    const s = tiers.map((t) => nickIconPixels(t).map((q) => q.join()).join('|'));
    for (const t of tiers) expect(nickIconPixels(t)).toHaveLength(256);
    expect(new Set(s).size).toBe(3);
  });
  it('おのは 256 ドットで ふちどりは #2A1E14', () => {
    for (const a of ['wood_axe', 'stone_axe', 'iron_axe'] as AxeItem[]) {
      const px = axeItemPixels(a);
      expect(px).toHaveLength(256);
      const solid = px.filter((q) => q[3] > 0);
      expect(solid.some((q) => hexOf(q) === 0x2a1e14)).toBe(true);
      expect(AXE_HELD_PARTS[a]).toHaveLength(4);
    }
  });
});
