import { describe, expect, it } from 'vitest';
import { HouseState } from './state';

/** HOUSE-1A AC32・AC33: くら・建築士さんの 記録の 保存。古い セーブは くら 空・最初の 建築士さんは 決まった 場所に 出る・道具は まだ */

describe('AC32 保存: 書いて 読むと 同じ', () => {
  it('くらの 中身・最初の 1 人の 場所・道具を もらった か が 往復する（JSON を 通しても 同じ）', () => {
    const a = new HouseState();
    a.kura.restore({ log: 30, dirt: 12 });
    a.record.first = { x: 120, z: -45 };
    a.record.toolsGiven = true;
    const json = JSON.parse(JSON.stringify(a.serialize()));
    const b = new HouseState();
    b.deserialize(json);
    expect(b.kura.totals()).toEqual({ log: 30, dirt: 12 });
    expect(b.record).toEqual({ first: { x: 120, z: -45 }, toolsGiven: true });
    expect(JSON.stringify(b.serialize())).toBe(JSON.stringify(a.serialize()));
  });

  it('はじめの 形: くら 空・最初の 1 人は まだ 決まって いない・道具は まだ', () => {
    const s = new HouseState();
    expect(s.serialize()).toEqual({ v: 1, kura: {}, first: null, toolsGiven: false });
  });

  it('読みこむと 前の 中身は すてる（別の セーブを 開きなおす）', () => {
    const s = new HouseState();
    s.kura.restore({ stone: 5 });
    s.record.toolsGiven = true;
    s.record.first = { x: 1, z: 2 };
    s.deserialize({ v: 1, kura: { log: 2 }, first: null, toolsGiven: false });
    expect(s.kura.totals()).toEqual({ log: 2 });
    expect(s.record).toEqual({ first: null, toolsGiven: false });
  });
});

describe('AC33 古い セーブ・こわれた データ', () => {
  it('家の 記録の ない セーブ（undefined・null）= くら 空・最初の 1 人は 決まって いない（出る 場所は 置き方の 関数が 決める）・道具は まだ', () => {
    for (const old of [undefined, null]) {
      const s = new HouseState();
      s.kura.restore({ log: 3 });
      s.record.toolsGiven = true;
      s.record.first = { x: 9, z: 9 };
      s.deserialize(old);
      expect(s.kura.totals(), String(old)).toEqual({});
      expect(s.record, String(old)).toEqual({ first: null, toolsGiven: false });
    }
  });

  it('形が おかしい データは 読める ところだけ 読み、あとは 初期の まま（例外を 出さない）', () => {
    const cases: Array<[unknown, { kura: Record<string, number>; first: { x: number; z: number } | null; toolsGiven: boolean }]> = [
      [5, { kura: {}, first: null, toolsGiven: false }],
      ['x', { kura: {}, first: null, toolsGiven: false }],
      [[], { kura: {}, first: null, toolsGiven: false }],
      [{ v: 1, kura: 'x', first: 3, toolsGiven: 'yes' }, { kura: {}, first: null, toolsGiven: false }],
      [{ v: 1, kura: { log: 4 }, first: { x: 'a', z: 1 }, toolsGiven: true }, { kura: { log: 4 }, first: null, toolsGiven: true }],
      [{ v: 1, first: { x: 1.9, z: -2.2 } }, { kura: {}, first: { x: 1, z: -3 }, toolsGiven: false }],
      [{ v: 1, first: { x: Number.NaN, z: 0 } }, { kura: {}, first: null, toolsGiven: false }],
    ];
    for (const [data, want] of cases) {
      const s = new HouseState();
      s.deserialize(data);
      expect({ kura: s.kura.totals(), first: s.record.first, toolsGiven: s.record.toolsGiven }, JSON.stringify(data)).toEqual(want);
    }
  });

  it('新しい 形式（v が 大きい）でも 読める ところは 読む', () => {
    const s = new HouseState();
    s.deserialize({ v: 9, kura: { log: 4 }, first: { x: 3, z: 4 }, toolsGiven: true, houses: [] });
    expect(s.kura.totals()).toEqual({ log: 4 });
    expect(s.record).toEqual({ first: { x: 3, z: 4 }, toolsGiven: true });
  });
});
