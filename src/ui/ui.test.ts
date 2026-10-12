import { describe, expect, it } from 'vitest';
import type { ItemStack } from '../contracts';
import { FX_SETTINGS } from '../fx/config';
import { gainedSlots, hotbarCells } from './hotbarModel';
import { itemIconPixels, signalIconPixels } from './itemIcon';
import { NoticeModel } from './noticeModel';
import { findUnrubiedKanji } from './text';

describe('ホットバーの見え方', () => {
  it('9 マス。2 こ以上だけ数字。えらんだマスだけ selected', () => {
    const slots: Array<ItemStack | null> = [
      { item: 'dirt', count: 12 },
      { item: 'stone', count: 1 },
      ...Array<null>(34).fill(null),
    ];
    const v = hotbarCells(slots, 1);
    expect(v).toHaveLength(9);
    expect(v[0].countText).toBe('12');
    expect(v[1].countText).toBe('');
    expect(v.filter((c) => c.selected).map((c) => c.index)).toEqual([1]);
  });
  it('増えたマスを見つける', () => {
    const a: Array<ItemStack | null> = [{ item: 'dirt', count: 1 }, null, null];
    const b: Array<ItemStack | null> = [
      { item: 'dirt', count: 2 },
      { item: 'stone', count: 1 },
      null,
    ];
    expect(gainedSlots(a, b, 3)).toEqual([0, 1]);
    expect(gainedSlots(b, b, 3)).toEqual([]);
  });
});

describe('合図', () => {
  it('1 秒出て消える。名前は 1.5 秒', () => {
    const m = new NoticeModel({ ...FX_SETTINGS });
    m.showSignal('needTool');
    m.showName('つち');
    m.update(0.9);
    expect(m.signal).not.toBeNull();
    m.update(0.2);
    expect(m.signal).toBeNull();
    expect(m.name?.text).toBe('つち');
    m.update(0.5);
    expect(m.name).toBeNull();
  });
  it('文字に漢字が無い', () => {
    expect(findUnrubiedKanji('もちもの とじる つるはし が いるよ もちもの が いっぱい')).toEqual([]);
  });
});

describe('絵', () => {
  it('アイテムの絵は 16x16、合図は赤い ✕ を含む', () => {
    expect(itemIconPixels('dirt')).toHaveLength(256);
    for (const k of ['needTool', 'full'] as const) {
      const p = signalIconPixels(k);
      expect(p).toHaveLength(256);
      expect(p.some((c) => c[0] === 0xe5 && c[1] === 0x39 && c[3] === 255)).toBe(true);
      expect(p.some((c) => c[3] === 255 && c[0] !== 0xe5)).toBe(true);
    }
  });
});

import { signalText, FULL_TEXT } from './noticeModel';
describe('いっぱいの合図は文字', () => {
  it('full は文字、needTool と noArrow は絵', () => {
    expect(signalText('full')).toBe(FULL_TEXT);
    expect(signalText('needTool')).toBeNull();
    expect(signalText('noArrow')).toBeNull();
  });
  it('ひらがなだけ（漢字なし）', () => {
    expect(/[一-鿿]/.test(FULL_TEXT)).toBe(false);
  });
});
