import { describe, expect, it } from 'vitest';
import { HouseBook, type HouseRec } from './book';

/** HOUSE-1C PR-1（AC26・AC52）: 建てた 家の 記録（戸の マス〔x, y, z〕で おぼえる）と、「外 → 戸 → 中」に 入った 家を 知らせる 見はり */

const DOOR = { x: 20, y: 10, z: 30 };
const REC: Omit<HouseRec, 'id'> = { name: 'ひみつきち', front: 'ひみつ', back: 'きち', number: 1, outer: { w: 7, d: 7 }, door: DOOR, doorOpen: false };

function make(extra: Array<Omit<HouseRec, 'id'>> = []) {
  const book = new HouseBook();
  const rec = book.add(REC);
  for (const e of extra) book.add(e);
  return { book, rec };
}
/** 足もとを (x, z) に して 1 ステップ。「外 → 戸 → 中」に 入った 家を 返す */
const stepAt = (b: HouseBook, x: number, z: number, y = DOOR.y): HouseRec | null => b.step({ x: x + 0.5, y, z: z + 0.5 });

describe('記録', () => {
  it('できた 順に 番号が つく。窓口 view には 前・後ろの 文字を 入れない', () => {
    const { book, rec } = make([{ ...REC, door: { x: 40, y: 10, z: 30 } }]);
    expect(book.list().map((r) => r.id)).toEqual([1, 2]);
    expect(book.view(rec)).toEqual({ id: 1, name: 'ひみつきち', number: 1, outer: { w: 7, d: 7 }, door: DOOR, doorOpen: false });
    expect(book.get(2)?.door.x).toBe(40);
    expect(book.get(9)).toBeNull();
  });

  it('戸が あいた・しまった → doorOpen が あう。上の 半分や べつの マスの 知らせは 無視', () => {
    const { book, rec } = make();
    book.cellChanged(DOOR.x, DOOR.y, DOOR.z, 'house_door_open');
    expect(rec.doorOpen).toBe(true);
    book.cellChanged(DOOR.x, DOOR.y, DOOR.z, 'house_door');
    expect(rec.doorOpen).toBe(false);
    book.cellChanged(DOOR.x, DOOR.y + 1, DOOR.z, 'air'); // 上の マス
    book.cellChanged(DOOR.x + 1, DOOR.y, DOOR.z, 'air'); // となり
    expect(book.count()).toBe(1);
  });

  it('戸の 下の マスが 戸で なくなると 記録が 消える（ほった・fill で 消えた）。ほかの 家は のこる', () => {
    const { book } = make([{ ...REC, door: { x: 40, y: 10, z: 30 } }]);
    book.cellChanged(DOOR.x, DOOR.y, DOOR.z, 'air');
    expect(book.list().map((r) => r.door.x)).toEqual([40]);
    book.boxFilled(35, 0, 25, 45, 20, 35, 'stone');
    expect(book.count()).toBe(0);
  });

  it('なまえを かえる: 前・後ろ・name が かわる。知らない 家は false', () => {
    const { book, rec } = make();
    expect(book.rename(rec.id, 'あい', 'ハウス')).toBe(true);
    expect([rec.front, rec.back, rec.name]).toEqual(['あい', 'ハウス', 'あいハウス']);
    expect(book.rename(99, 'あ', 'い')).toBe(false);
  });
});

describe('戸を 通って 中へ（AC26。名前の 帯の 合図）', () => {
  it('外（南）→ 戸の マス → 中（すぐ 北）で その 家を 返す。戸の マスに 入っただけでは まだ', () => {
    const { book, rec } = make();
    expect(stepAt(book, DOOR.x, DOOR.z + 2)).toBeNull();
    expect(stepAt(book, DOOR.x, DOOR.z + 1)).toBeNull();
    expect(stepAt(book, DOOR.x, DOOR.z), '戸の マス').toBeNull();
    expect(stepAt(book, DOOR.x, DOOR.z - 1), '中').toBe(rec);
    expect(stepAt(book, DOOR.x, DOOR.z - 2), '中で 歩いても 出なおさない').toBeNull();
  });

  it('外 → 戸 → 外 では 出ない（戸の マスで 引き返した）。もう 1 度 中まで 通れば 出る', () => {
    const { book, rec } = make();
    stepAt(book, DOOR.x, DOOR.z + 1);
    stepAt(book, DOOR.x, DOOR.z);
    expect(stepAt(book, DOOR.x, DOOR.z + 1), '引き返した').toBeNull();
    expect(stepAt(book, DOOR.x, DOOR.z + 2)).toBeNull();
    stepAt(book, DOOR.x, DOOR.z + 1);
    stepAt(book, DOOR.x, DOOR.z);
    expect(stepAt(book, DOOR.x, DOOR.z - 1)).toBe(rec);
  });

  it('中から 出る・中で 歩く・テレポート・横から（かべの あな）・べつの 高さ では 出ない', () => {
    const { book } = make();
    const got: Array<HouseRec | null> = [];
    got.push(stepAt(book, DOOR.x, DOOR.z - 2));
    got.push(stepAt(book, DOOR.x, DOOR.z - 1));
    got.push(stepAt(book, DOOR.x, DOOR.z)); // 北から 南へ 出る
    got.push(stepAt(book, DOOR.x, DOOR.z + 1));
    got.push(stepAt(book, DOOR.x + 5, DOOR.z + 5));
    got.push(stepAt(book, DOOR.x, DOOR.z)); // 2 マス 以上 とぶ
    got.push(stepAt(book, DOOR.x, DOOR.z - 1)); // テレポートで 戸の マスに 着いても つぎの 1 歩で 帯には ならない
    got.push(stepAt(book, DOOR.x - 1, DOOR.z - 1));
    got.push(stepAt(book, DOOR.x - 1, DOOR.z));
    got.push(stepAt(book, DOOR.x, DOOR.z)); // 横から
    got.push(stepAt(book, DOOR.x, DOOR.z - 1));
    got.push(stepAt(book, DOOR.x, DOOR.z + 1, DOOR.y + 5));
    got.push(stepAt(book, DOOR.x, DOOR.z, DOOR.y + 5)); // 高さが ちがう
    got.push(stepAt(book, DOOR.x, DOOR.z - 1, DOOR.y + 5));
    expect(got.every((r) => r === null)).toBe(true);
  });

  it('なまえを かえた あとに 通ると 新しい 名前', () => {
    const { book, rec } = make();
    book.rename(rec.id, 'あ', 'ハウス');
    stepAt(book, DOOR.x, DOOR.z + 1);
    stepAt(book, DOOR.x, DOOR.z);
    expect(stepAt(book, DOOR.x, DOOR.z - 1)?.name).toBe('あハウス');
  });

  it('毎ステップ しらべる 記録は 高々 1 件（足もとが かわった ステップだけ。立って いる 間は 0）', () => {
    const many: Array<Omit<HouseRec, 'id'>> = Array.from({ length: 30 }, (_, i) => ({ ...REC, door: { x: 100 + i * 9, y: 10, z: 30 } }));
    const { book } = make(many);
    stepAt(book, DOOR.x, DOOR.z + 3);
    const before = book.lookups;
    for (let i = 0; i < 100; i++) stepAt(book, DOOR.x, DOOR.z + 3); // 立って いる
    expect(book.lookups - before, '立って いる 間').toBe(0);
    for (const z of [DOOR.z + 2, DOOR.z + 1, DOOR.z]) {
      const n = book.lookups;
      stepAt(book, DOOR.x, z);
      expect(book.lookups - n, `足もとが かわった ステップ z=${z}`).toBeLessThanOrEqual(1);
    }
  });

  it('戸が こわれた あとは 出ない', () => {
    const { book } = make();
    book.cellChanged(DOOR.x, DOOR.y, DOOR.z, 'air');
    stepAt(book, DOOR.x, DOOR.z + 1);
    stepAt(book, DOOR.x, DOOR.z);
    expect(stepAt(book, DOOR.x, DOOR.z - 1)).toBeNull();
  });
});

describe('記録は 戸の (x, y, z) で ひく', () => {
  it('同じ (x, z) で 高さが ちがう 戸が 2 つ あっても それぞれ 別の 記録（上の 戸を こわしても 下は のこる）', () => {
    const { book } = make([{ ...REC, name: 'たかいいえ', front: 'たかい', back: 'いえ', door: { x: DOOR.x, y: DOOR.y + 20, z: DOOR.z } }]);
    expect(book.count()).toBe(2);
    book.cellChanged(DOOR.x, DOOR.y + 20, DOOR.z, 'house_door_open');
    expect(book.list().map((r) => r.doorOpen)).toEqual([false, true]);
    book.cellChanged(DOOR.x, DOOR.y + 20, DOOR.z, 'air');
    expect(book.list().map((r) => r.name)).toEqual(['ひみつきち']);
  });
});
