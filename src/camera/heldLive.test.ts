import { describe, expect, it } from 'vitest';
import { HELD_MODELS, hasHeldModel } from './heldTools';
import { BUG_HELD_PARTS, NET_HELD_PARTS } from './heldLive';

describe('LIVE-1 版 3.2 手に持つ むし・あみ', () => {
  it('どちらも 模型が ある（にぎった 手から -Z へ のびる）', () => {
    expect(hasHeldModel('mushi_ami')).toBe(true);
    expect(hasHeldModel('mushi')).toBe(true);
    expect(HELD_MODELS.mushi_ami).toBe(NET_HELD_PARTS);
    expect(HELD_MODELS.mushi).toBe(BUG_HELD_PARTS);
  });
  it('あみ: 長さ 約 1.2 ブロック・藍の にぎり・生成りの ふくろ。箱は 12 こ 以下', () => {
    const far = Math.max(...NET_HELD_PARTS.map((p) => -(p.pos[2] - p.size[2] / 2)));
    expect(far).toBeGreaterThan(1.1);
    expect(far).toBeLessThan(1.3);
    expect(NET_HELD_PARTS[0].color).toBe(0x3d5a9e);
    expect(NET_HELD_PARTS.some((p) => p.color === 0xefe7d4)).toBe(true);
    expect(NET_HELD_PARTS.length).toBeLessThanOrEqual(12);
    // ふくろは わ から 下（-Y）へ たれる
    const bagLow = Math.min(...NET_HELD_PARTS.filter((p) => p.color === 0xefe7d4).map((p) => p.pos[1] - p.size[1] / 2));
    expect(bagLow).toBeLessThan(-0.2);
  });
  it('むし: 長さ 約 0.3（手の 中）・だいだいの 頭', () => {
    const len = Math.max(...BUG_HELD_PARTS.map((p) => -(p.pos[2] - p.size[2] / 2)));
    expect(len).toBeGreaterThan(0.25);
    expect(len).toBeLessThan(0.4);
    expect(BUG_HELD_PARTS.some((p) => p.color === 0xe8962e)).toBe(true);
  });
});
