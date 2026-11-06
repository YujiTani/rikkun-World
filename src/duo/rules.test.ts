import { describe, expect, it } from 'vitest';
import { P2_OPEN_KINDS, duoTimeScale, p2MayOpen } from './rules';

/**
 * COOP-1 作業 1（#395）の 先行テスト（赤）。AC11・AC15。
 * つなぎ目の 約束: src/duo/rules.ts（宣言は rules.ts）。
 *   duoTimeScale(base, joined): base = 今の `screen.timeScale()`。2 人のとき（joined）は 1。1 人のときは base のまま。
 *     配線: Game.setTimeScale（src/game/Game.ts）に 渡す 関数の 中で 使う。
 *   p2MayOpen(kind): 段階 1 で 2P が 開ける 画面は 'inventory'（2P 自分の もちもの）だけ。
 *     配線: 2P の ActionState の 押下から 本・建築士さん・とりごや・たんすを 開く 道は 作らない（この 表で 見張る）。
 */

describe('AC11: 2 人のとき もちもの画面でも 時間の 倍率は 1', () => {
  it('2 人: base が 0.25 でも 1', () => {
    expect(duoTimeScale(0.25, true)).toBe(1);
    expect(duoTimeScale(0, true)).toBe(1);
  });
  it('1 人: base の まま（今までどおり）', () => {
    expect(duoTimeScale(0.25, false)).toBe(0.25);
    expect(duoTimeScale(1, false)).toBe(1);
    expect(duoTimeScale(0, false)).toBe(0);
  });
});

describe('AC15: 段階 1 の 2P は 本・建築士さん・とりごや・たんすを 開けない', () => {
  it.each(['book', 'builder', 'henhouse', 'storage', 'furnace'] as const)('%s は 開かない', (kind) => {
    expect(p2MayOpen(kind)).toBe(false);
  });
  it('2P 自分の もちものは 開ける', () => {
    expect(p2MayOpen('inventory')).toBe(true);
  });
  it('表は 6 つの 画面（かまどを 足した）を ぜんぶ 持つ（足し忘れを 落とす）', () => {
    expect([...P2_OPEN_KINDS].sort()).toEqual(['book', 'builder', 'furnace', 'henhouse', 'inventory', 'storage']);
  });
});
