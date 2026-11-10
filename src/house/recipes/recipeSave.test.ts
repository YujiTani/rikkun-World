import { describe, expect, it } from 'vitest';
import { houseRig } from '../houseRig';
import { ed, goStep, learnAll, openEd, rh } from './recipeKit';

/**
 * HOUSE-2A（#364）AC6: 保存。おぼえた レシピ・「あたらしい！」・作りかけと せっけいずの 中身（やね・かべ・まど・と・かざり・あかり・家具・後ろの 文字）が
 * 開きなおしても 同じ。古い セーブは おぼえた レシピ なし・せっけいず・作りかけは たいら・き・しょうじ・いえの と・かざり なし・ちょうちん。
 * 保存は HouseSystem.serialize() → JSON → load()（ゲームの セーブと 同じ 道）。
 */

const roundTrip = (data: unknown): unknown => JSON.parse(JSON.stringify(data));

describe('AC6 保存', () => {
  it('おぼえた レシピ と「あたらしい！」（えらんだ 物は 消えて いる）が 開きなおしても 同じ', () => {
    const a = houseRig();
    for (const id of ['roof_kawara', 'wall_ishi', 'deco_noren']) rh(a).learn(id);
    openEd(a);
    a.sys.press('roof-kawara'); // これだけ えらぶ
    const before = rh(a).recipes();
    expect(before).toMatchObject({ learned: ['roof_kawara', 'wall_ishi', 'deco_noren'], fresh: ['wall_ishi', 'deco_noren'] });
    const saved = roundTrip(a.sys.serialize());
    const b = houseRig();
    b.sys.load(saved);
    expect(rh(b).recipes()).toEqual(before);
    openEd(b);
    expect(ed(b).part, '印の ある いちばん 左の ばしょで 開く').toBe('wall');
    expect([...ed(b).marks].sort(), 'あたらしい！の 印（えらんだ やねは 消えたまま）').toEqual(['part-deco', 'part-wall', 'wall-ishi']);
  });

  it('作りかけ（やね・かべ・まど・と・かざり・あかり・家具・後ろの 文字）が 開きなおしても 同じ。もどす・すすむ の 記録は ない', () => {
    const a = houseRig();
    learnAll(a);
    openEd(a);
    for (const [op, kind] of [['roof', 'wara'], ['wall', 'renga'], ['windowKind', 'suisho'], ['door', 'tetsu'], ['deco', 'noren'], ['deco', 'shachi'], ['light', 'hotaru']] as const) {
      expect(a.hook.edit({ op, kind }), `${op} ${kind}`).toBe(true);
    }
    expect(a.hook.edit({ op: 'place', kind: 'maneki', x: 3, z: 3 })).toBe(true);
    goStep(a, 'namae');
    expect(a.hook.edit({ op: 'suffix', back: 'のとりで' })).toBe(true);
    const before = ed(a);
    const saved = roundTrip(a.sys.serialize());
    const b = houseRig();
    b.sys.load(saved);
    openEd(b);
    expect(ed(b)).toMatchObject({
      roof: 'wara', wall: 'renga', windowKind: 'suisho', door: 'tetsu', light: 'hotaru', name: { back: 'のとりで' }, canUndo: false, canRedo: false,
    });
    expect([...ed(b).deco].sort()).toEqual(['noren', 'shachi']);
    expect(ed(b).furniture.map((f) => f.kind)).toEqual(before.furniture.map((f) => f.kind));
    expect(ed(b).furniture.map((f) => f.kind)).toContain('maneki');
  });

  it('できた せっけいず（blueprints）にも wall・door・deco・roof・windowKind・light・後ろの 文字が のこり、開きなおしても 同じ', () => {
    const a = houseRig();
    learnAll(a);
    openEd(a);
    for (const [op, kind] of [['roof', 'kin'], ['wall', 'shikkui'], ['windowKind', 'maru'], ['door', 'tetsu'], ['deco', 'noren'], ['light', 'suisho']] as const) a.hook.edit({ op, kind });
    a.hook.edit({ op: 'windows', delta: 1 });
    a.bag.add('paper', 2);
    a.bag.add('fude', 1);
    a.hook.edit({ op: 'place', kind: 'futon', x: 0, z: 0 });
    a.sys.press('next');
    a.sys.press('next');
    for (const ch of 'もも') a.hook.edit({ op: 'char', ch });
    a.hook.edit({ op: 'suffix', back: 'ごてん' });
    a.sys.press('done');
    if (ed(a)?.confirm === 'futonOnly') a.sys.press('yes');
    const bp = a.hook.blueprints();
    expect(bp).toHaveLength(1);
    expect(bp[0]).toMatchObject({ roof: 'kin', wall: 'shikkui', windowKind: 'maru', door: 'tetsu', deco: ['noren'], light: 'suisho', name: { front: 'もも', back: 'ごてん' } });
    const b = houseRig();
    b.sys.load(roundTrip(a.sys.serialize()));
    expect(b.hook.blueprints()).toEqual(bp);
  });

  it('古い セーブ（おぼえた レシピ・新しい 項目が ない）: おぼえた レシピ なし・作りかけは たいら・き・しょうじ・いえの と・かざり なし・ちょうちん。ほかの 形（大きさ）は そのまま', () => {
    const r = houseRig();
    r.sys.load({
      v: 2, first: null, toolsGiven: true, fudeGiven: true, blueprints: [], next: 1,
      draft: { step: 'soto', w: 7, d: 5, windows: 1, windowKind: 'shoji', roof: 'flat', furniture: [], name: { front: 'あ', back: 'のいえ' } },
    });
    expect(rh(r).recipes()).toMatchObject({ learned: [], fresh: [] });
    openEd(r);
    expect(ed(r)).toMatchObject({ size: { w: 7, d: 5 }, windows: 1, roof: 'flat', wall: 'ki', windowKind: 'shoji', door: 'ie', deco: [], light: 'lantern' });
    r.sys.load(null);
    expect(rh(r).recipes()).toMatchObject({ learned: [], fresh: [] });
  });

  it('こわれた セーブ: 知らない レシピ id・同じ id の くりかえしは すてる（例外を 出さない）', () => {
    const a = houseRig();
    rh(a).learn('roof_kawara');
    const saved = roundTrip(a.sys.serialize()) as Record<string, unknown>;
    const b = houseRig();
    const text = JSON.stringify(saved);
    // 記録の 中の「roof_kawara」を 知らない id と くりかえしに 書きかえて 読ませる（記録の 場所は 開発が 決める）
    const broken = JSON.parse(text.replace(/"roof_kawara"/g, '"roof_kawara","bogus_id","roof_kawara"'));
    expect(() => b.sys.load(broken)).not.toThrow();
    expect(rh(b).recipes().learned).toEqual(['roof_kawara']);
  });
});
