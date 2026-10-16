import { describe, expect, it } from 'vitest';
import { HINT_AFTER_TICKS, HINT_TICKS, ToolHintModel, bestHotbarSlot } from './toolHint';

/** BAL-D §4.6 あう道具のヒント（モデルだけ。画面は E2E） */
describe('ToolHintModel', () => {
  const dig = (m: ToolHintModel, n: number, key = '1,2,3', slot = 4, sel = 0) => {
    for (let i = 0; i < n; i++) {
      m.tick(sel);
      m.digTick(key, slot, sel, false);
    }
  };
  it('31 ステップ目に 光りはじめ、120 ステップ（31〜150）光って 消える', () => {
    const m = new ToolHintModel();
    dig(m, HINT_AFTER_TICKS - 1);
    expect(m.current()).toBeNull();
    dig(m, 1);
    expect(m.current()).toEqual({ slot: 4, ticksLeft: HINT_TICKS });
    dig(m, 119); // 150 ステップ目
    expect(m.current()).toEqual({ slot: 4, ticksLeft: 1 });
    dig(m, 1);
    expect(m.current()).toBeNull();
  });
  it('同じブロックでは 1 回だけ。別のブロック（座標ちがい）では また光る', () => {
    const m = new ToolHintModel();
    dig(m, 31);
    dig(m, 130);
    expect(m.current()).toBeNull();
    m.idle();
    dig(m, 40);
    expect(m.current()).toBeNull();
    m.idle();
    dig(m, 31, '9,9,9');
    expect(m.current()).not.toBeNull();
  });
  it('おの が なければ（slot -1）出ない。MAX（ready）では出ない。途中で はなすと数えなおし', () => {
    const m = new ToolHintModel();
    for (let i = 0; i < 60; i++) {
      m.tick(0);
      m.digTick('a', -1, 0, false);
    }
    expect(m.current()).toBeNull();
    for (let i = 0; i < 60; i++) {
      m.tick(0);
      m.digTick('b', 3, 0, true);
    }
    expect(m.current()).toBeNull();
    dig(m, 20, 'c');
    m.idle();
    dig(m, 20, 'c');
    expect(m.current()).toBeNull();
  });
  it('持ちかえると すぐ消える', () => {
    const m = new ToolHintModel();
    dig(m, 31);
    expect(m.current()).not.toBeNull();
    m.tick(5);
    expect(m.current()).toBeNull();
  });
  it('bestHotbarSlot: いちばん強い物・同じなら左', () => {
    const rank = (i: string | undefined) => (i === 'a1' ? 1 : i === 'a3' ? 3 : i === 'b3' ? 3 : 0);
    const fits = (i: string | undefined) => i === 'a1' || i === 'a3' || i === 'b3';
    expect(bestHotbarSlot([undefined, 'a1', undefined, 'b3', 'a3'], fits, rank)).toBe(3);
    expect(bestHotbarSlot([undefined, 'x'], fits, rank)).toBe(-1);
  });
});
