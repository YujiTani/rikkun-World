import { describe, expect, it } from 'vitest';
import { houseRig } from '../houseRig';
import { ed, learnAll, needMap, notFirst, openEd, openPopup, rh, type Rig } from './recipeKit';

/**
 * HOUSE-2A（#364・仕様 3.2 版 §2.3「なし」・§4.1・§6.2 AC9c）: やね・かべ・まどに「なし」（id 'none'。press id は roof-none・wall-none・window-none。と には ない）。
 * 「なし」は レシピ なしで はじめから えらべる。ふきだしの 字は 空白を くらべない。見た目（柱・あな）は 2B。
 */

const squash = (s: string): string => s.replace(/\s+/g, '');
const FIELD = { roof: 'roof', wall: 'wall', window: 'windowKind' } as const;
type NonePart = keyof typeof FIELD;
const PARTS = Object.keys(FIELD) as NonePart[];
const DEFAULT = { roof: 'flat', wall: 'ki', window: 'shoji' } as const;

/** もう 1 けん 建て はじめた 世界で エディターを 開く */
function opened(): Rig {
  const r = houseRig();
  notFirst(r);
  openEd(r);
  return r;
}

describe('AC9c なしを えらぶ（やね・かべ・まど）', () => {
  for (const part of PARTS) {
    it(`${part}: レシピ なしで edit できる。1 回の 操作・同じ 物は false・もどす で もどる・すすむ で また`, () => {
      const r = opened();
      const f = FIELD[part];
      expect(ed(r)[f]).toBe(DEFAULT[part]);
      expect(r.hook.edit({ op: f, kind: 'none' })).toBe(true);
      expect(ed(r)[f]).toBe('none');
      expect(ed(r).canUndo).toBe(true);
      expect(r.hook.edit({ op: f, kind: 'none' }), '今と 同じ').toBe(false);
      expect(r.hook.edit({ op: 'undo' })).toBe(true);
      expect(ed(r)).toMatchObject({ [f]: DEFAULT[part], canUndo: false });
      expect(r.hook.edit({ op: 'redo' })).toBe(true);
      expect(ed(r)[f]).toBe('none');
      expect(r.hook.edit({ op: f, kind: DEFAULT[part] }), 'いつもの 物へ もどす').toBe(true);
      expect(ed(r)[f]).toBe(DEFAULT[part]);
    });

    it(`${part}: ポップアップの ボタン ${part}-none でも 同じ（開いた まま）`, () => {
      const r = opened();
      openPopup(r, part);
      r.sys.press(`${part}-none`);
      expect(ed(r)).toMatchObject({ [FIELD[part]]: 'none', popup: part });
      r.sys.press(`${part}-${DEFAULT[part]}`);
      expect(ed(r)[FIELD[part]]).toBe(DEFAULT[part]);
    });
  }

  it('と には なしが ない（edit door none は false・door-none の ボタンも ない）', () => {
    const r = opened();
    expect(r.hook.edit({ op: 'door', kind: 'none' })).toBe(false);
    openPopup(r, 'door');
    expect(r.hook.menu().buttons.map((b) => b.id)).not.toContain('door-none');
    expect(ed(r).door).toBe('ie');
  });

  it('なしは 「あたらしい！」の 印が 出ない（レシピでは ない）。fresh も ふえない', () => {
    const r = opened();
    expect(ed(r).marks).toEqual([]);
    expect(rh(r).recipes().fresh).toEqual([]);
  });

  it('あたらしい せっけいず（まっさら）で たいら・き・しょうじ に もどる', () => {
    const r = opened();
    for (const part of PARTS) r.hook.edit({ op: FIELD[part], kind: 'none' });
    r.sys.press('new');
    r.sys.press('yes');
    expect(ed(r)).toMatchObject({ roof: 'flat', wall: 'ki', windowKind: 'shoji' });
  });
});

describe('AC9c 材料（§4.1「なし」の 材料）', () => {
  it('例: 5×5・かべ なし・やね なし・窓 4・ふとん 1 → き 12・いし 25・ぬの 3・いと 1（かみ 0）', () => {
    const r = opened();
    r.hook.edit({ op: 'place', kind: 'futon', x: 0, z: 0 });
    for (let i = 0; i < 4; i++) expect(r.hook.edit({ op: 'windows', delta: 1 })).toBe(true);
    expect(r.hook.edit({ op: 'wall', kind: 'none' })).toBe(true);
    expect(r.hook.edit({ op: 'roof', kind: 'none' })).toBe(true);
    expect(needMap(r)).toEqual({ log: 12, stone: 25, cloth: 3, string: 1 });
  });

  it('かべ なしでは 窓・はなだん・まるい しょうじ などの 材料も 0（窓は 建たない）', () => {
    const r = houseRig();
    notFirst(r);
    learnAll(r);
    openEd(r);
    r.hook.edit({ op: 'place', kind: 'futon', x: 0, z: 0 });
    for (let i = 0; i < 4; i++) r.hook.edit({ op: 'windows', delta: 1 });
    for (const [op, kind] of [['windowKind', 'suisho_shiro'], ['deco', 'hanadan_kozan'], ['wall', 'none'], ['roof', 'none']] as const) expect(r.hook.edit({ op, kind }), `${op} ${kind}`).toBe(true);
    expect(needMap(r), 'かみ・はな・すいしょう・やねの かざり も 0').toEqual({ log: 12, stone: 25, cloth: 3, string: 1 });
  });

  it('やね なしだけ: たいらの やねは もともと 0 ＝ 材料は かわらない。やね なしで 上の かざり（えんとつ・しゃちほこ）の 材料も 0', () => {
    const r = houseRig();
    notFirst(r);
    learnAll(r);
    openEd(r);
    r.hook.edit({ op: 'place', kind: 'futon', x: 0, z: 0 });
    const base = needMap(r);
    r.hook.edit({ op: 'roof', kind: 'none' });
    expect(needMap(r), 'たいら → なし').toEqual(base);
    r.hook.edit({ op: 'deco', kind: 'entotsu_mura' });
    r.hook.edit({ op: 'deco', kind: 'shachi' });
    expect(needMap(r), 'やね なしでは えんとつ・しゃちほこは つかない').toEqual(base);
  });

  it('まど なしだけ: 窓 1 つ かみ 0（あな）。しょうじ（窓 n で かみ n）に くらべて かみが n へる', () => {
    const r = opened();
    r.hook.edit({ op: 'place', kind: 'futon', x: 0, z: 0 });
    for (let i = 0; i < 2; i++) r.hook.edit({ op: 'windows', delta: 1 });
    const before = needMap(r);
    r.hook.edit({ op: 'windowKind', kind: 'none' });
    const after = needMap(r);
    expect((before.paper ?? 0) - (after.paper ?? 0), 'かみが 窓の 数だけ へる').toBe(2);
    expect({ ...after, paper: before.paper }, 'ほかは かわらない').toEqual(before);
  });
});

describe('AC9c ふきだし（建築士さん）', () => {
  it('かべ なしを えらぶと「かべが ないと ようかいが はいって くるよ」。えらんだ とき だけ（そのあと ほかを 押しても くりかえさない）。えらぶのは とめない', () => {
    const r = opened();
    expect(r.hook.edit({ op: 'wall', kind: 'none' })).toBe(true);
    expect(squash(r.hook.menu().bubble)).toBe('かべがないとようかいがはいってくるよ');
    r.sys.press('next');
    r.sys.press('prev');
    expect(r.hook.menu().bubble, 'ほかの ボタンを 押したら 消え、くりかえさない').toBe('');
    expect(ed(r).wall).toBe('none');
  });

  it('やね なしで えんとつ・しゃちほこ を つけて いる: 「やねが ないと 〇〇は つかないよ」。つけた ことには なる（せっけいずに のこる）・材料は 0', () => {
    for (const [kind, name] of [['entotsu_shiro', 'えんとつ'], ['shachi', 'しゃちほこ']] as const) {
      const r = houseRig();
      notFirst(r);
      learnAll(r);
      openEd(r);
      expect(r.hook.edit({ op: 'roof', kind: 'none' })).toBe(true);
      r.sys.press('next');
      r.sys.press('prev');
      expect(r.hook.edit({ op: 'deco', kind }), `${kind} を つける`).toBe(true);
      expect(ed(r).deco, 'つけた ことには なる').toEqual([kind]);
      const said = squash(r.hook.menu().bubble);
      expect(said, kind).toMatch(/^やねがないと.+はつかないよ$/);
      expect(said, `名前に ${name}`).toContain(name);
    }
  });

  it('かべ なしで 窓を ふやす: 「かべが ないと まどは つかないよ」。窓の かずは のこる', () => {
    const r = opened();
    r.hook.edit({ op: 'wall', kind: 'none' });
    r.sys.press('next');
    r.sys.press('prev');
    expect(r.hook.edit({ op: 'windows', delta: 1 })).toBe(true);
    expect(squash(r.hook.menu().bubble)).toBe('かべがないとまどはつかないよ');
    expect(ed(r).windows).toBe(1);
  });
});

describe('AC9c 保存と できた！', () => {
  it('作りかけと できた せっけいずに none が のこり、開きなおしても 同じ。かべ・やね・まど なしでも できた！は とまらない', () => {
    const a = houseRig();
    openEd(a);
    a.hook.edit({ op: 'roof', kind: 'none' });
    a.hook.edit({ op: 'wall', kind: 'none' });
    a.hook.edit({ op: 'windowKind', kind: 'none' });
    const saved = JSON.parse(JSON.stringify(a.sys.serialize()));
    const b = houseRig();
    b.sys.load(saved);
    openEd(b);
    expect(ed(b)).toMatchObject({ roof: 'none', wall: 'none', windowKind: 'none', canUndo: false });
    const slot = b.make([{ op: 'place', kind: 'futon', x: 0, z: 0 }, { op: 'place', kind: 'chair', x: 4, z: 0 }]);
    expect(slot, 'できた！が 通る').toBeGreaterThan(0);
    const bp = b.hook.blueprints().at(-1)!;
    expect(bp).toMatchObject({ roof: 'none', wall: 'none', windowKind: 'none' });
    const c = houseRig();
    b.bag.slots().forEach((s, i) => c.bag.setSlot(i, s)); // せっけいずは バッグの マスに ある（セーブの 外）。空の バッグに 写して から 読む
    c.sys.load(JSON.parse(JSON.stringify(b.sys.serialize())));
    expect(c.hook.blueprints().at(-1)).toEqual(bp);
  });

  it('なしを 見本に えらんでも ポップアップの もどす/すすむは ほかの しゅるいと 同じ（開いて いれば その ばしょへ）', () => {
    const r = opened();
    r.hook.edit({ op: 'wall', kind: 'none' });
    r.hook.edit({ op: 'roof', kind: 'none' });
    openPopup(r, 'roof');
    r.hook.edit({ op: 'undo' });
    expect(ed(r)).toMatchObject({ roof: 'flat', popup: 'roof' });
    r.hook.edit({ op: 'undo' });
    expect(ed(r)).toMatchObject({ wall: 'ki', popup: 'wall' });
  });
});
