import { describe, expect, it } from 'vitest';
import { houseRig } from '../houseRig';
import { ENTRY, ed, goStep, learnAll, openEd, openPopup, rh } from './recipeKit';

/**
 * HOUSE-2A（#364・仕様 3 版）AC7: 保存。おぼえた レシピ・しゅるいごとの「あたらしい！」・作りかけと せっけいずの 中身（やね・かべ・まど・と・かざり・あかり・家具・後ろの 文字。案 こみの id）が
 * 開きなおしても 同じ。popup は のこらない（null）。古い セーブは おぼえた レシピ なし・せっけいず・作りかけは たいら・き・しょうじ・いえの と・かざり なし・ちょうちん。
 * おぼえて いない・知らない しゅるいは 作りかけでは いつもの 物に（§5）。2 版の 形の id（案の ない kawara など）は 案 むら として 読む。
 * 保存は HouseSystem.serialize() → JSON → load()（ゲームの セーブと 同じ 道）。
 */

const roundTrip = (data: unknown): unknown => JSON.parse(JSON.stringify(data));

describe('AC7 保存', () => {
  it('おぼえた レシピ と しゅるいごとの「あたらしい！」（えらんだ ボタンの 印は 消えて いる）が 開きなおしても 同じ', () => {
    const a = houseRig();
    for (const id of ['roof_kawara', 'wall_ishi', 'deco_noren']) rh(a).learn(id);
    openEd(a);
    openPopup(a, 'roof');
    a.sys.press(ENTRY.roof_kawara!.btns[1]!); // おしろの かわらの やね だけ えらぶ
    const before = rh(a).recipes();
    const marks = [...ed(a).marks].sort();
    expect(before, 'かわらは 2 つ のこって いるので まだ fresh').toMatchObject({ learned: ['roof_kawara', 'wall_ishi', 'deco_noren'], fresh: ['roof_kawara', 'wall_ishi', 'deco_noren'] });
    expect(marks, 'えらんだ 1 つの 印だけ 消えた').not.toContain(ENTRY.roof_kawara!.btns[1]!);
    expect(marks).toContain(ENTRY.roof_kawara!.btns[0]!);
    expect(marks).toContain(ENTRY.roof_kawara!.btns[2]!);
    const saved = roundTrip(a.sys.serialize());
    const b = houseRig();
    b.sys.load(saved);
    expect(rh(b).recipes()).toEqual(before);
    openEd(b);
    expect(ed(b).popup, 'popup は のこらない').toBeNull();
    expect([...ed(b).marks].sort(), '印は 開きなおしても 同じ').toEqual(marks);
  });

  it('作りかけ（やね・かべ・まど・と・かざり・あかり・家具・後ろの 文字）が 開きなおしても 同じ。もどす・すすむ の 記録は ない', () => {
    const a = houseRig();
    learnAll(a);
    openEd(a);
    for (const [op, kind] of [['roof', 'wara_shiro'], ['wall', 'renga_kozan'], ['windowKind', 'suisho_mura'], ['door', 'tetsu_shiro'], ['deco', 'noren_kozan'], ['deco', 'shachi'], ['light', 'hotaru']] as const) {
      expect(a.hook.edit({ op, kind }), `${op} ${kind}`).toBe(true);
    }
    expect(a.hook.edit({ op: 'popup', part: 'wall' }), 'ポップアップを 開いた まま 保存').toBe(true);
    expect(a.hook.edit({ op: 'place', kind: 'maneki', x: 3, z: 3 })).toBe(true);
    goStep(a, 'namae');
    expect(a.hook.edit({ op: 'suffix', back: 'のとりで' })).toBe(true);
    const before = ed(a);
    const saved = roundTrip(a.sys.serialize());
    const b = houseRig();
    b.sys.load(saved);
    openEd(b);
    expect(ed(b)).toMatchObject({
      popup: null, roof: 'wara_shiro', wall: 'renga_kozan', windowKind: 'suisho_mura', door: 'tetsu_shiro', light: 'hotaru', name: { back: 'のとりで' }, canUndo: false, canRedo: false,
    });
    expect([...ed(b).deco].sort()).toEqual(['noren_kozan', 'shachi']);
    expect(ed(b).furniture.map((f) => f.kind)).toEqual(before.furniture.map((f) => f.kind));
    expect(ed(b).furniture.map((f) => f.kind)).toContain('maneki');
  });

  it('できた せっけいず（blueprints）にも wall・door・deco・roof・windowKind・light・後ろの 文字が のこり、開きなおしても 同じ', () => {
    const a = houseRig();
    learnAll(a);
    openEd(a);
    for (const [op, kind] of [['roof', 'kin_kozan'], ['wall', 'shikkui_shiro'], ['windowKind', 'maru_mura'], ['door', 'tetsu_kozan'], ['deco', 'noren_shiro'], ['light', 'suisho']] as const) a.hook.edit({ op, kind });
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
    expect(bp[0]).toMatchObject({ roof: 'kin_kozan', wall: 'shikkui_shiro', windowKind: 'maru_mura', door: 'tetsu_kozan', deco: ['noren_shiro'], light: 'suisho', name: { front: 'もも', back: 'ごてん' } });
    const b = houseRig();
    a.bag.slots().forEach((s, i) => b.bag.setSlot(i, s)); // せっけいずは バッグの マスに ある（セーブの 外）。空の バッグに 写して から 読む
    b.sys.load(roundTrip(a.sys.serialize()));
    expect(b.hook.blueprints()).toEqual(bp);
  });

  it('古い セーブ（おぼえた レシピ・新しい 項目が ない）: おぼえた レシピ なし・作りかけと せっけいずは たいら・き・しょうじ・いえの と・かざり なし・ちょうちん。ほかの 形（大きさ）は そのまま', () => {
    const r = houseRig();
    r.sys.load({
      v: 2, first: null, toolsGiven: true, fudeGiven: true, next: 2,
      draft: { step: 'soto', w: 7, d: 5, windows: 1, windowKind: 'shoji', roof: 'flat', furniture: [], name: { front: 'あ', back: 'のいえ' } },
      // 1 版の せっけいず（wall・door・deco が ない）
      blueprints: [{ number: 1, name: { front: 'い', back: 'ハウス' }, w: 5, d: 7, windows: 2, windowKind: 'shoji', roof: 'flat', furniture: [{ kind: 'futon', x: 0, z: 0, rot: 0 }], light: 'lantern' }],
    });
    expect(rh(r).recipes()).toMatchObject({ learned: [], fresh: [] });
    const bps = (r.sys.state.serialize() as unknown as { blueprints: Record<string, unknown>[] }).blueprints;
    expect(bps, '古い せっけいずも 読める').toHaveLength(1);
    expect(bps[0], '古い せっけいずは たいら・き・しょうじ・いえの と・かざり なし・ちょうちん（大きさ・名前は そのまま）').toMatchObject({
      number: 1, w: 5, d: 7, windows: 2, name: { front: 'い', back: 'ハウス' }, roof: 'flat', wall: 'ki', windowKind: 'shoji', door: 'ie', deco: [], light: 'lantern',
    });
    openEd(r);
    expect(ed(r)).toMatchObject({ size: { w: 7, d: 5 }, windows: 1, roof: 'flat', wall: 'ki', windowKind: 'shoji', door: 'ie', deco: [], light: 'lantern' });
    r.sys.load(null);
    expect(rh(r).recipes()).toMatchObject({ learned: [], fresh: [] });
  });

  /** 保存の 形に 手で 作りかけを 書く（recipes は 開発が 決めた 形のまま: 一度 serialize した 物に 重ねる） */
  function loadWith(learned: string[], draft: Record<string, unknown>) {
    const base = houseRig();
    for (const id of learned) rh(base).learn(id);
    const saved = roundTrip(base.sys.serialize()) as Record<string, unknown>;
    saved.draft = { ...(saved.draft as Record<string, unknown>), ...draft };
    const r = houseRig();
    r.sys.load(saved);
    openEd(r);
    return r;
  }

  it('おぼえて いない しゅるい・知らない id が 作りかけに ある セーブ: その ばしょは いつもの 物に（かざりは はずす）。おぼえて いる 物は そのまま', () => {
    const r = loadWith(['roof_kawara', 'deco_noren'], {
      roof: 'kawara_shiro', // おぼえた
      wall: 'ishi_kozan', // おぼえて いない
      windowKind: 'bogus_kind', // 知らない
      door: 'tetsu_mura', // おぼえて いない
      deco: ['noren_kozan', 'shachi', 'entotsu_mura', 'nothing'], // おぼえた・おぼえて いない・おぼえて いない・知らない
      light: 'suisho', // おぼえて いない
    });
    expect(ed(r)).toMatchObject({ roof: 'kawara_shiro', wall: 'ki', windowKind: 'shoji', door: 'ie', light: 'lantern' });
    expect(ed(r).deco, 'おぼえた かざりだけ のこる').toEqual(['noren_kozan']);
  });

  it('2 版の 形の id（案の ない kawara・shikkui・suisho・tetsu・noren など）が 作りかけに ある（2A の 前の 試作の セーブ）: 案 むら の 物として 読む', () => {
    const r = loadWith(['roof_kawara', 'wall_shikkui', 'window_suisho', 'door_tetsu', 'deco_noren'], {
      roof: 'kawara', wall: 'shikkui', windowKind: 'suisho', door: 'tetsu', deco: ['noren'],
    });
    expect(ed(r)).toMatchObject({ roof: 'kawara_mura', wall: 'shikkui_mura', windowKind: 'suisho_mura', door: 'tetsu_mura', deco: ['noren_mura'] });
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
