import { describe, expect, it } from 'vitest';
import { houseRig } from '../houseRig';
import { ENTRY, allRecipes, learnAll, needMap, notFirst, openEd, rh, type Rig } from './recipeKit';

/**
 * HOUSE-2A（#364）AC5: 材料（need）が 仕様 §4.1 どおり。もう 1 けん 建て はじめた 世界（ぬの・いとの おまけは ない）。
 * 材料は 「できあがりの 物」で 数える（かわら・レンガ・しっくい）。はなは 3 いろ あわせて 1 行（item は 'flower' で はじまる）。
 * P ＝ 外まわり 1 周 ＝ 2×(よこ＋たて)＋4、n ＝ まどの かず。表の 数は 仕様から 写した（レシピの 数は 書かない）。
 */

const P = (w: number, d: number): number => 2 * (w + d) + 4;

/** 1 まい ごとの ふえ方（いつもの 物 〔たいら・き・しょうじ・いえの と・ちょうちん〕との さ） */
const DELTA: Readonly<Record<string, (p: number, n: number) => Record<string, number>>> = {
  roof_kawara: (p) => ({ kawara: p }),
  roof_sankaku: (p) => ({ log: p / 2 }),
  roof_wara: (p) => ({ grass: p }),
  roof_kin: (p) => ({ kin: p / 4 }),
  wall_shikkui: (p) => ({ log: -p, shikkui: p }),
  wall_renga: (p) => ({ log: -p, brick: p }),
  wall_ishi: (p) => ({ log: -p, stone: p }),
  window_suisho: (_p, n) => ({ paper: -n, crystal: n }),
  window_maru: (_p, n) => ({ log: n }),
  door_tetsu: () => ({ iron_ingot: 2 }),
  chimney_renga: () => ({ brick: 8 }),
  deco_noren: () => ({ cloth: 2 }),
  deco_hanadan: (_p, n) => ({ log: n, flower: n }),
  deco_shachi: () => ({ kin: 2 }),
  light_hotaru: () => ({ hotaruishi: 1 }),
  light_suisho: () => ({ crystal: 2, hotaruishi: 1 }),
  furniture_maneki: () => ({ clay: 2, kin: 1 }),
  suffix_shiro: () => ({}),
  suffix_goten: () => ({}),
  suffix_toride: () => ({}),
};

/** 窓 n この 家で、レシピ id を えらぶ（家具は 左上に 置く） */
function choose(r: Rig, id: string): void {
  const e = ENTRY[id]!;
  if (e.field) expect(r.hook.edit({ op: e.field, kind: e.kind }), `${id} を えらぶ`).toBe(true);
  else if (id === 'furniture_maneki') expect(r.hook.edit({ op: 'place', kind: 'maneki', x: 0, z: 0 }), 'まねきねこを 置く').toBe(true);
}

function setup(size: number, windows: number): Rig {
  const r = houseRig();
  notFirst(r);
  learnAll(r);
  openEd(r);
  if (size !== 5) expect(r.hook.edit({ op: 'size', w: size, d: size })).toBe(true);
  for (let i = 0; i < windows; i++) expect(r.hook.edit({ op: 'windows', delta: 1 })).toBe(true);
  return r;
}

describe('AC5 材料: レシピごとの ふえ方（5×5 と 9×9。窓 2）', () => {
  it('表の ぜんぶの レシピに ふえ方の 約束が ある', () => {
    const all = allRecipes();
    expect(all.length).toBeGreaterThan(0);
    for (const id of all) expect(DELTA[id], `${id} の ふえ方`).toBeDefined();
  });

  for (const id of allRecipes()) {
    for (const size of [5, 9]) {
      it(`${id}: ${size}×${size}`, () => {
        const n = 2;
        const r = setup(size, n);
        const base = needMap(r);
        choose(r, id);
        const after = needMap(r);
        const want = { ...base };
        for (const [item, d] of Object.entries(DELTA[id]!(P(size, size), n))) want[item] = (want[item] ?? 0) + d;
        for (const k of Object.keys(want)) if (want[k] === 0) delete want[k];
        expect(after).toEqual(want);
      });
    }
  }
});

describe('AC5 仕様の 2 つの 例', () => {
  it('① 5×5・窓 0・ふとん 1・しっくいの かべ・かわらの やね → き 0・しっくい 24・かわら 24・いし 25・ぬの 3・いと 1', () => {
    const r = houseRig();
    notFirst(r);
    for (const id of ['wall_shikkui', 'roof_kawara']) rh(r).learn(id);
    openEd(r);
    expect(r.hook.edit({ op: 'place', kind: 'futon', x: 0, z: 0 })).toBe(true);
    expect(r.hook.edit({ op: 'wall', kind: 'shikkui' })).toBe(true);
    expect(r.hook.edit({ op: 'roof', kind: 'kawara' })).toBe(true);
    expect(needMap(r)).toEqual({ shikkui: 24, kawara: 24, stone: 25, cloth: 3, string: 1 });
  });

  it('② よこ 7・たて 5・まるい しょうじ 4・はなだん・いしの かべ・きんの やね・てつの と・のれん・しゃちほこ・えんとつ・すいしょう ランプ・ふとん 1・まねきねこ 1 → いし 63・き 8・かみ 4・はな 4・きん 10・てつ 2・ぬの 5・いと 1・レンガ 8・すいしょう 2・ほたるいし 1・ねんど 2', () => {
    const r = houseRig();
    notFirst(r);
    learnAll(r);
    openEd(r);
    expect(r.hook.edit({ op: 'size', w: 7 })).toBe(true);
    for (let i = 0; i < 4; i++) expect(r.hook.edit({ op: 'windows', delta: 1 })).toBe(true);
    for (const [op, kind] of [['windowKind', 'maru'], ['wall', 'ishi'], ['roof', 'kin'], ['door', 'tetsu'], ['light', 'suisho'], ['deco', 'hanadan'], ['deco', 'noren'], ['deco', 'shachi'], ['deco', 'entotsu']] as const) {
      expect(r.hook.edit({ op, kind }), `${op} ${kind}`).toBe(true);
    }
    expect(r.hook.edit({ op: 'place', kind: 'futon', x: 0, z: 0 })).toBe(true);
    expect(r.hook.edit({ op: 'place', kind: 'maneki', x: 5, z: 0 })).toBe(true);
    expect(needMap(r)).toEqual({ stone: 63, log: 8, paper: 4, flower: 4, kin: 10, iron_ingot: 2, cloth: 5, string: 1, brick: 8, crystal: 2, hotaruishi: 1, clay: 2 });
  });

  it('はなは 3 いろ あわせて 1 行: 「ある」は flower_y・flower_o・flower_p の 合計。ほかの 材料は 別の 行', () => {
    const r = houseRig();
    notFirst(r);
    learnAll(r);
    openEd(r);
    r.hook.edit({ op: 'windows', delta: 1 });
    r.hook.edit({ op: 'windows', delta: 1 });
    r.hook.edit({ op: 'deco', kind: 'hanadan' });
    r.bag.add('flower_y', 1);
    r.bag.add('flower_o', 1);
    r.bag.add('flower_p', 3);
    const rows = r.hook.need().filter((x) => x.item.startsWith('flower'));
    expect(rows, 'はなの 行は 1 つ').toHaveLength(1);
    expect(rows[0]).toMatchObject({ need: 2, have: 5, short: 0 });
  });

  it('③ いつもの 物（たいら・き・しょうじ・いえの と・ちょうちん）は 1 版と 同じ（HOUSE-1 AC10: 5×5・窓 0・ふとん 1 → き 24・いし 25・ぬの 3・いと 1）', () => {
    const r = houseRig();
    notFirst(r);
    openEd(r);
    r.hook.edit({ op: 'place', kind: 'futon', x: 0, z: 0 });
    expect(needMap(r)).toEqual({ log: 24, stone: 25, cloth: 3, string: 1 });
  });

  it('ひつような ものは いちばん 多くて 17 しゅるい（AC10）: かわら・しっくい・レンガ・すいしょう・ほたるいし・きん・はなが 入っても はなは 1 行', () => {
    const r = houseRig();
    notFirst(r);
    learnAll(r);
    openEd(r);
    r.hook.edit({ op: 'size', w: 9, d: 9 });
    for (let i = 0; i < 3; i++) r.hook.edit({ op: 'windows', delta: 1 });
    for (const [op, kind] of [['roof', 'kawara'], ['wall', 'shikkui'], ['windowKind', 'maru'], ['light', 'suisho'], ['deco', 'hanadan'], ['deco', 'shachi'], ['deco', 'entotsu']] as const) {
      expect(r.hook.edit({ op, kind }), `${op} ${kind}`).toBe(true);
    }
    const spots: [string, number, number][] = [['futon', 0, 0], ['tansu', 2, 0], ['nukunuku', 5, 0], ['andon', 8, 0], ['haniwa', 0, 4], ['furnace', 2, 4], ['maneki', 6, 6]];
    for (const [kind, x, z] of spots) expect(r.hook.edit({ op: 'place', kind, x, z }), `${kind} を 置く`).toBe(true);
    const items = r.hook.need().map((x) => x.item);
    expect(new Set(items).size, '材料の 行は ぜんぶ ちがう').toBe(items.length);
    expect(items.filter((i) => i.startsWith('flower'))).toHaveLength(1);
    expect(items).toHaveLength(17);
  });
});
