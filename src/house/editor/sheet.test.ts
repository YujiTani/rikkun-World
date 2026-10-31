import { describe, expect, it } from 'vitest';
import type { ItemId, Vec3 } from '../../contracts';
import { makeStock } from '../stockKit';
import { emptyState } from './model';
import type { SheetPort } from './controller';
import { createSheetPort } from './sheet';

/**
 * HOUSE-1B AC15・AC44b・AC45 ＋ HOUSE-1E: せっけいずを 作る（かみ 1・ふでの たいきゅう 1）と ④ かみ ⑤ ふで ⑥ 持ち物の しらべ。
 * 1E: くらは ない。かみは もちもの → 近くの たんす（近い 順）、ふでは もちもの・近くの たんす の どれでも（いちばん へって いる 方から）。
 * たんすは 本物（StorageSystem ＋ CraftSystemImpl〔範囲 40 マス〕）。deps の `craft`・`tansu` は stockKit.ts（e2e/helpers/house.ts「1E の 約束」）。
 */

const fresh = () => {
  const st = makeStock();
  const { bag } = st;
  const registered: number[] = [];
  const gave: ItemId[] = [];
  let next = 1;
  // 型の 上で まだ 無い deps（craft・tansu）を まぜる ため、いったん 変数に 入れてから わたす
  const deps = { bag, craft: st.craft, tansu: st.storage, register: () => registered[registered.push(next++) - 1]!, gave: (i: ItemId) => gave.push(i) };
  const port: SheetPort = createSheetPort(deps as unknown as Parameters<typeof createSheetPort>[0]);
  /** たんす at の 中の その 物の たいきゅうの へり（wear。新品は 0）の ならび（マスの 順） */
  const wears = (at: Vec3, item: ItemId): number[] =>
    (st.storage.get(at.x, at.y, at.z)?.slots ?? []).filter((x) => x?.item === item).map((x) => x!.wear ?? 0);
  /** たんすの 中に ふでを 1 本 置く（wear ＝ へった 量） */
  const putFude = (dx: number, dz: number, wear: number): Vec3 => {
    const at = st.putTansu(dx, dz, {});
    st.storage.set(at.x, at.y, at.z, 0, { item: 'fude', count: 1, ...(wear > 0 ? { wear } : {}) });
    return at;
  };
  return { st, bag, port, registered, gave, wears, putFude };
};
const FUDE_MAX = 5; // ふでの たいきゅう（content/items/tools.ts）

describe('④ かみ ⑤ ふで ⑥ 持ち物（problem）', () => {
  it('かみも ふでも 無い → かみが 先（④）。かみ だけ → ふで（⑤）。そろう → 通る', () => {
    const { bag, port } = fresh();
    expect(port.problem()).toBe('paper');
    bag.add('fude', 1);
    expect(port.problem(), 'かみ ０').toBe('paper');
    bag.remove('fude', 1);
    bag.add('paper', 1);
    expect(port.problem(), 'ふで ０').toBe('fude');
    bag.add('fude', 1);
    expect(port.problem()).toBeNull();
  });

  it('AC44b ④⑤: かみ・ふでは 近くの たんすに あっても よい（40 マスの 中）。50 マスの たんすの 物は 数えない。かみ・ふで 両方 ない ときは ④ だけ', () => {
    const { st, bag, port, putFude } = fresh();
    st.putTansu(30, 0, { paper: 3 });
    expect(port.problem(), 'かみは たんす・ふでは どこにも ない').toBe('fude');
    putFude(0, 50, 0);
    expect(port.problem(), '50 マスの たんすの ふでは 数えない').toBe('fude');
    putFude(0, 20, 0);
    expect(port.problem(), 'かみ・ふで とも 近くの たんす（持ち物は 空っぽ）').toBeNull();
    expect(bag.count('paper')).toBe(0);
    st.range.v = 10;
    expect(port.problem(), '範囲を せまくすると どちらも 外 → かみが 先（④）').toBe('paper');
  });

  it('AC44b ④: 50 マスの たんすに しか かみが ない → paper。もちものの かみが あれば それで よい', () => {
    const { st, bag, port } = fresh();
    bag.add('fude', 1);
    st.putTansu(0, 50, { paper: 9 });
    expect(port.problem()).toBe('paper');
    bag.add('paper', 1);
    expect(port.problem()).toBeNull();
  });

  it('⑥ 持ち物が いっぱい: 空きが 無い → full。さいごの かみ 1 まい・こわれる ふでが あれば その マスが あくので 通る', () => {
    const { bag, port } = fresh();
    for (let i = 0; i < bag.size; i++) bag.setSlot(i, { item: 'dirt', count: 64 });
    bag.setSlot(0, { item: 'paper', count: 2 });
    bag.setSlot(1, { item: 'fude', count: 1, wear: 2 });
    expect(port.problem(), 'かみ 2 まい・ふで たいきゅう 3').toBe('full');
    bag.setSlot(0, { item: 'paper', count: 1 });
    expect(port.problem(), 'さいごの かみ').toBeNull();
    bag.setSlot(0, { item: 'paper', count: 2 });
    bag.setSlot(1, { item: 'fude', count: 1, wear: FUDE_MAX - 1 });
    expect(port.problem(), 'こわれる ふで').toBeNull();
  });

  it('AC44b ⑥: 持ち物が いっぱいで、かみが たんすにしか ない ときは 持ち物の マスは あかない → full（ふでが もちものに あって こわれる 1 本でも そのマスが あく だけ）', () => {
    const { st, bag, port } = fresh();
    st.putTansu(5, 0, { paper: 5 });
    for (let i = 0; i < bag.size; i++) bag.setSlot(i, { item: 'dirt', count: 64 });
    bag.setSlot(0, { item: 'fude', count: 1, wear: 1 });
    expect(port.problem()).toBe('full');
    bag.setSlot(0, { item: 'fude', count: 1, wear: FUDE_MAX - 1 });
    expect(port.problem(), 'こわれる ふで〔持ち物〕の マスが あく').toBeNull();
  });

  it('AC44b ⑥: 持ち物が いっぱいで、もちものに かみ 1 まい・たんすに かみ 5 まい → もちものの かみを 使って その マスが あく → 通る。たんすの かみは 5 の まま', () => {
    const { st, bag, port } = fresh();
    const at = st.putTansu(5, 0, { paper: 5 });
    for (let i = 0; i < bag.size; i++) bag.setSlot(i, { item: 'dirt', count: 64 });
    bag.setSlot(0, { item: 'paper', count: 1 });
    bag.setSlot(1, { item: 'fude', count: 1, wear: 1 });
    expect(port.problem()).toBeNull();
    port.make(emptyState());
    expect(bag.count('sekkeizu'), 'せっけいずは あいた マスへ').toBe(1);
    expect(bag.count('paper')).toBe(0);
    expect(st.inTansu(at, 'paper'), 'たんすの かみは そのまま').toBe(5);
  });

  it('AC44b ⑥: ふでが たんすにしか なく、持ち物が いっぱいで かみ 2 まい → full（たんすの ふでが こわれても もちものの マスは あかない）', () => {
    const { bag, port, putFude } = fresh();
    putFude(5, 0, FUDE_MAX - 1); // たいきゅう 1（使うと 消える）
    for (let i = 0; i < bag.size; i++) bag.setSlot(i, { item: 'dirt', count: 64 });
    bag.setSlot(0, { item: 'paper', count: 2 });
    expect(port.problem()).toBe('full');
    bag.setSlot(0, { item: 'paper', count: 1 });
    expect(port.problem(), 'さいごの かみ 1 まいが あく').toBeNull();
  });
});

describe('AC15 作る（make）', () => {
  it('かみ 1 まい（もちものから）・ふでの たいきゅう 1・せっけいず 1 こ（番号つき）。たんすの かみ・建てる 材料〔もちもの・たんす〕は へらない（たりなくても 作れる）', () => {
    const { st, bag, port, gave } = fresh();
    bag.add('paper', 3);
    bag.add('fude', 1);
    const at = st.putTansu(10, 0, { paper: 9, log: 9 });
    port.make(emptyState());
    expect(bag.count('paper')).toBe(2);
    expect(st.inTansu(at, 'paper'), 'たんすの かみは そのまま').toBe(9);
    expect(st.inTansu(at, 'log')).toBe(9);
    expect(bag.durability(bag.slots().findIndex((s) => s?.item === 'fude'))?.left).toBe(FUDE_MAX - 1);
    const sheet = bag.slots().find((s) => s?.item === 'sekkeizu');
    expect(sheet).toMatchObject({ item: 'sekkeizu', count: 1, plan: 1 });
    expect(gave).toEqual(['sekkeizu']);
  });

  it('もちものに 建てる 材料（き・いし）が 0 でも 作れる（材料は へらない・見ない）', () => {
    const { st, bag, port } = fresh();
    bag.add('paper', 1);
    bag.add('fude', 1);
    st.putTansu(10, 0, { log: 3 });
    expect(port.problem()).toBeNull();
    port.make(emptyState());
    expect(bag.count('log')).toBe(0);
    expect(bag.count('sekkeizu')).toBe(1);
  });

  it('もちものに かみが 無い とき 近くの たんすから 1 まい（近い 順: 10 マスの たんす → 20 マスの たんす）', () => {
    const { st, bag, port } = fresh();
    bag.add('fude', 1);
    const far = st.putTansu(20, 0, { paper: 5 });
    const near = st.putTansu(0, 10, { paper: 1 });
    port.make(emptyState());
    expect(st.inTansu(near, 'paper'), '近い たんすから').toBe(0);
    expect(st.inTansu(far, 'paper')).toBe(5);
    expect(bag.count('paper')).toBe(0);
    bag.add('fude', 1);
    port.make(emptyState());
    expect(st.inTansu(far, 'paper'), '近い たんすが 空に なったら つぎの たんす').toBe(4);
  });

  it('かみは もちものが 先: もちものに 1 まい ある 間は たんすの かみを へらさない。もちものの かみが なくなってから たんす', () => {
    const { st, bag, port } = fresh();
    bag.add('paper', 1);
    bag.add('fude', 2);
    const at = st.putTansu(3, 0, { paper: 4 });
    port.make(emptyState());
    expect([bag.count('paper'), st.inTansu(at, 'paper')]).toEqual([0, 4]);
    port.make(emptyState());
    expect([bag.count('paper'), st.inTansu(at, 'paper')]).toEqual([0, 3]);
  });

  it('50 マスの たんすの かみは 使わない（範囲の 外）', () => {
    const { st, bag, port } = fresh();
    bag.add('fude', 1);
    const at = st.putTansu(0, 50, { paper: 5 });
    expect(port.problem()).toBe('paper');
    port.make(emptyState());
    expect(st.inTansu(at, 'paper')).toBe(5);
    expect(bag.count('sekkeizu')).toBe(0);
  });

  it('番号は 1, 2, 3 … と ふえ、せっけいずは 1 マスに 1 こ（重ならない）', () => {
    const { bag, port, registered } = fresh();
    bag.add('paper', 9);
    bag.add('fude', 2);
    for (let i = 0; i < 3; i++) port.make(emptyState());
    expect(registered).toEqual([1, 2, 3]);
    const sheets = bag.slots().filter((s) => s?.item === 'sekkeizu');
    expect(sheets.map((s) => [s!.count, s!.plan])).toEqual([[1, 1], [1, 2], [1, 3]]);
  });
});

describe('AC45 ふで', () => {
  it('たいきゅう N の ふで 1 本で せっけいずを N まい 作れて、N まい目で ふでは 消える。N＋1 まい目は ふでが ない', () => {
    const { bag, port } = fresh();
    bag.add('paper', 20);
    bag.add('fude', 1);
    for (let i = 1; i <= FUDE_MAX; i++) {
      expect(port.problem(), `${i} まい目`).toBeNull();
      port.make(emptyState());
    }
    expect(bag.count('fude'), 'N まい目で ふでは 消える').toBe(0);
    expect(bag.count('sekkeizu')).toBe(FUDE_MAX);
    expect(port.problem(), 'N＋1 まい目').toBe('fude');
  });

  it('2 本 ある ときは へって いる ほうから へる（同じ へり方なら 前の マス）', () => {
    const { bag, port } = fresh();
    bag.add('paper', 4);
    bag.setSlot(0, { item: 'fude', count: 1, wear: 1 });
    bag.setSlot(1, { item: 'fude', count: 1, wear: 3 }); // たいきゅう 5−3 ＝ 2 の ほうが へって いる
    port.make(emptyState());
    expect(bag.durability(0)?.left).toBe(FUDE_MAX - 1);
    expect(bag.durability(1)?.left).toBe(FUDE_MAX - 3 - 1);
  });

  it('1E: 近くの たんすの ふでも 使う（もちものに ふでが なくても よい）。たんすの ふでの たいきゅうが へり、せっけいずは もちものへ', () => {
    const { bag, port, putFude, wears, st } = fresh();
    bag.add('paper', 2);
    const at = putFude(15, 0, 1); // たいきゅう 4
    expect(port.problem()).toBeNull();
    port.make(emptyState());
    expect(wears(at, 'fude'), 'たんすの ふでが 1 へる').toEqual([2]);
    expect(bag.count('sekkeizu')).toBe(1);
    expect(bag.count('fude'), 'ふでは もちものへ 引っ越さない').toBe(0);
    expect(st.inTansu(at, 'fude')).toBe(1);
  });

  it('1E: もちものに たいきゅう 3・たんすに たいきゅう 1 → たんすの 方が へって 0 で たんすから 消え、つぎは もちものの 方', () => {
    const { bag, port, putFude, wears, st } = fresh();
    bag.add('paper', 4);
    bag.setSlot(0, { item: 'fude', count: 1, wear: FUDE_MAX - 3 }); // のこり 3
    const at = putFude(8, 0, FUDE_MAX - 1); // のこり 1
    port.make(emptyState());
    expect(st.inTansu(at, 'fude'), 'たんすの ふでは こわれて 消えた').toBe(0);
    expect(wears(at, 'fude')).toEqual([]);
    expect(bag.durability(0)?.left, 'もちものの ふでは そのまま').toBe(3);
    port.make(emptyState());
    expect(bag.durability(0)?.left, 'つぎは もちものの 方').toBe(2);
    expect(bag.count('sekkeizu')).toBe(2);
  });

  it('1E: いちばん へって いる 方から。もちものの ふでの ほうが へって いれば もちもの（たんすの ふでは そのまま）', () => {
    const { bag, port, putFude, wears } = fresh();
    bag.add('paper', 2);
    bag.setSlot(0, { item: 'fude', count: 1, wear: 3 }); // のこり 2
    const at = putFude(8, 0, 1); // のこり 4
    port.make(emptyState());
    expect(bag.durability(0)?.left).toBe(1);
    expect(wears(at, 'fude'), 'たんすの ふでは まだ').toEqual([1]);
  });

  it('1E: へり方が 同じなら たんす（近い 順）→ もちもの', () => {
    const { bag, port, putFude, wears } = fresh();
    bag.add('paper', 4);
    bag.setSlot(0, { item: 'fude', count: 1, wear: 2 });
    const far = putFude(20, 0, 2);
    const near = putFude(0, 5, 2);
    port.make(emptyState());
    expect(wears(near, 'fude'), '近い たんす').toEqual([3]);
    expect(wears(far, 'fude')).toEqual([2]);
    expect(bag.durability(0)?.left).toBe(FUDE_MAX - 2);
    // 近い たんすが 1 へった ので つぎは 遠い たんす・もちもの が 同じ へり方（2）で 先に ならぶ → 遠い たんす
    port.make(emptyState());
    expect(wears(far, 'fude')).toEqual([3]);
    expect(bag.durability(0)?.left, 'もちものは まだ').toBe(FUDE_MAX - 2);
  });

  it('1E: 50 マスの たんすの ふでは 使わない（範囲の 外。40 マスの 中なら 使う）', () => {
    const { bag, port, putFude, wears, st } = fresh();
    bag.add('paper', 2);
    const far = putFude(0, 50, 0);
    expect(port.problem()).toBe('fude');
    port.make(emptyState());
    expect(wears(far, 'fude')).toEqual([]);
    expect(bag.count('sekkeizu')).toBe(0);
    st.range.v = 60;
    expect(port.problem(), '範囲を ひろげると 使える').toBeNull();
  });

  it('1E: たんすの ふでだけで N まい 作れて、N まい目で たんすから 消える。N＋1 まい目は ふでが ない', () => {
    const { bag, port, putFude, st } = fresh();
    bag.add('paper', 20);
    const at = putFude(12, 0, 0);
    for (let i = 1; i <= FUDE_MAX; i++) {
      expect(port.problem(), `${i} まい目`).toBeNull();
      port.make(emptyState());
    }
    expect(st.inTansu(at, 'fude'), 'N まい目で たんすから 消える').toBe(0);
    expect(bag.count('sekkeizu')).toBe(FUDE_MAX);
    expect(port.problem(), 'N＋1 まい目').toBe('fude');
  });
});
