import { describe, expect, it } from 'vitest';
import { emptyState } from './editor/model';
import { HouseState } from './state';

/** HOUSE-1A AC32・AC33: くら・建築士さんの 記録の 保存。古い セーブは くら 空・最初の 建築士さんは 決まった 場所に 出る・道具は まだ */

describe('AC32 保存: 書いて 読むと 同じ', () => {
  it('くらの 中身・最初の 1 人の 場所・道具を もらった か が 往復する（JSON を 通しても 同じ）', () => {
    const a = new HouseState();
    a.kura.restore({ log: 30, dirt: 12 });
    a.record.first = { x: 120, z: -45 };
    a.record.toolsGiven = true;
    a.record.fudeGiven = true;
    const json = JSON.parse(JSON.stringify(a.serialize()));
    const b = new HouseState();
    b.deserialize(json);
    expect(b.kura.totals()).toEqual({ log: 30, dirt: 12 });
    expect(b.record).toEqual({ first: { x: 120, z: -45 }, toolsGiven: true, fudeGiven: true });
    expect(JSON.stringify(b.serialize())).toBe(JSON.stringify(a.serialize()));
  });

  it('はじめの 形: くら 空・最初の 1 人は まだ 決まって いない・道具は まだ', () => {
    const s = new HouseState();
    expect(s.serialize()).toEqual({
      v: 2,
      kura: {},
      first: null,
      toolsGiven: false,
      fudeGiven: false,
      draft: emptyState(),
      blueprints: [],
      next: 1,
    });
  });

  it('読みこむと 前の 中身は すてる（別の セーブを 開きなおす）', () => {
    const s = new HouseState();
    s.kura.restore({ stone: 5 });
    s.record.toolsGiven = true;
    s.record.first = { x: 1, z: 2 };
    s.deserialize({ v: 1, kura: { log: 2 }, first: null, toolsGiven: false });
    expect(s.kura.totals()).toEqual({ log: 2 });
    expect(s.record).toEqual({ first: null, toolsGiven: false, fudeGiven: false });
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
      expect(s.record, String(old)).toEqual({ first: null, toolsGiven: false, fudeGiven: false });
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
    expect(s.record).toEqual({ first: { x: 3, z: 4 }, toolsGiven: true, fudeGiven: false });
  });
});

describe('1B AC32b 保存: 作りかけ・せっけいず・次の 番号・ふでの 記録', () => {
  const fill = (s: HouseState): void => {
    s.record.fudeGiven = true;
    s.holder.draft = {
      ...emptyState(),
      step: 'naka',
      w: 7,
      d: 9,
      windows: 4,
      furniture: [{ kind: 'futon', x: 0, z: 0, rot: 1 }, { kind: 'table', x: 3, z: 3, rot: 0 }],
      name: { front: 'ひみつ', back: 'ハウス' },
    };
    s.register(s.holder.draft);
    s.register({ ...s.holder.draft, name: { front: 'ふたつめ', back: 'のいえ' } });
  };

  it('往復（JSON を 通しても 同じ）。番号は 2 まい 作って 次は 3', () => {
    const a = new HouseState();
    fill(a);
    const b = new HouseState();
    b.deserialize(JSON.parse(JSON.stringify(a.serialize())));
    expect(JSON.stringify(b.serialize())).toBe(JSON.stringify(a.serialize()));
    expect(b.record.fudeGiven).toBe(true);
    expect(b.holder.draft).toMatchObject({ step: 'naka', w: 7, d: 9, windows: 4, name: { front: 'ひみつ', back: 'ハウス' } });
    expect(b.blueprint(1)).toMatchObject({ number: 1, name: { front: 'ひみつ', back: 'ハウス' }, w: 7, d: 9, windows: 4, light: 'lantern' });
    expect(b.blueprint(2)?.name.front).toBe('ふたつめ');
    expect(b.planName(2)).toBe('ふたつめのいえの せっけいず');
    expect(b.register(b.holder.draft), '次の 番号').toBe(3);
  });

  it('作った せっけいずは あとで 作りかけを かえても かわらない（コピー）', () => {
    const s = new HouseState();
    s.holder.draft = { ...emptyState(), furniture: [{ kind: 'chair', x: 0, z: 0, rot: 0 }] };
    const n = s.register(s.holder.draft);
    s.holder.draft.furniture[0]!.x = 3;
    s.holder.draft.name.front = 'あ';
    expect(s.blueprint(n)?.furniture[0]?.x).toBe(0);
    expect(s.blueprint(n)?.name.front).toBe('');
  });

  it('#339 より 前の セーブ（v1・新しい 記録なし）: 作りかけ まっさら（よこ 5・たて 5）・せっけいず なし・番号 1・ふでは まだ', () => {
    for (const old of [{ v: 1, kura: { log: 3 }, first: { x: 1, z: 2 }, toolsGiven: true }, undefined, null]) {
      const s = new HouseState();
      s.deserialize(old);
      expect(s.holder.draft, JSON.stringify(old)).toEqual(emptyState());
      expect(s.record.fudeGiven).toBe(false);
      expect(s.blueprint(1)).toBeNull();
      expect(s.register(s.holder.draft), '番号 1').toBe(1);
    }
  });

  it('こわれた データ: 番号の おかしい せっけいずは とばし、次の 番号は 持っている 最大より 大きい。読みなおすと 前の 中身は すてる', () => {
    const s = new HouseState();
    fill(s);
    s.deserialize({ v: 2, draft: 5, blueprints: [{ number: 'x' }, null, { number: 0 }, { number: 4, name: { front: 'あ', back: 'のいえ' } }, 7], next: 2 });
    expect(s.holder.draft).toEqual(emptyState());
    expect(s.blueprint(1)).toBeNull();
    expect(s.blueprint(4)?.name.front).toBe('あ');
    expect(s.register(s.holder.draft), '次の 番号 ＝ 最大 ＋ 1').toBe(5);
  });
});
