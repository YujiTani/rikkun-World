import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BlockId, ItemStack, VoxelWorld } from '../../contracts';
import { W2_SETTING_DEFAULTS } from '../../contracts';
import { InventoryImpl } from '../../inventory/Inventory';
import { StorageSystem } from '../../storage/StorageSystem';
import { maxDurability } from '../../tools/durability';
import { DEPTHS, SEED_POOL, bigSample, hookE, needBokenHook, sum, tablesOf, type BokenShaft, type CampItem, type Depth, type ESample, type MineHookE } from './mineBokenKit';

/**
 * MINE-1E（docs/design/MINE-1E.md §4.8・§6.1・受け入れ基準 E11）: キャンプの たんす。
 *
 *   ・わりあい・数・たいきゅう・つるはしの しゅるいは 安い くじの 窓口 `campRoll(depth, seed)`〔坑道を 作らずに たんすの 中身の 予定を 引く〕を 層ごとに 2,000 回 引いて 見る
 *     〔物ごとの わりあいが `campTable()` から ±0.04〕。本物の キャンプは 数十こ だけ 引いて `campPreview(x, y, z)` ＝ `campRoll(層, campSeed(x, y, z))` を 見る
 *   ・はじめて あけると `campPreview` の 物が たんすに 入る〔その あと null〕。同じ〔シード, 場所〕は 同じ 中身〔あける 前に 保存して 開きなおしても〕
 *   ・あける 前に こわすと 中身が 足もとに 落ちる・置きなおして あけても 2 回は 出ない・自分で 置いた たんすは null
 *
 * 【つなぎの 約束】 本番の つなぎ込みと 同じに つなぐ: `createMineHook({ tansuHas: (x, y, z) => storage.has(x, y, z) })`・
 *   `new StorageSystem({ ..., firstFill: (x, y, z) => stacksOf(hook.campPreview(x, y, z)) })`。
 *   `StorageSystem.has(x, y, z)` ＝ その マスの 記録が あるか〔`placed` で できる／はじめて あけた とき できる／こわすと 消える〕。
 *   `firstFill` は「記録が まだ ない たんす」を はじめて あける とき・あける 前に こわす ときだけ 呼ぶ〔`placed` では 呼ばない〕。
 *   たいきゅうの へった 量〔`ItemStack.wear`〕＝ 新品の 値 ×〔1 − `CampItem.wear`〕を まるめた 数。時間〔ms〕では 合否を きめない。
 *   くじの 窓口〔テスト用の 約束。仕様 §6.1 に 1 行〕: `campRoll(depth, seed): CampItem[]`・`campSeed(x, y, z): number`〔世界の シードと 場所で きまる〕。
 *   鉱石は `campTable().ores[層]`〔その 層で ほると 出る 物と 数。ふかい ＝ きんの いし 1〕から 読む〔物の 名前を テストに 決め打ち しない〕。
 *   赤の 確かめ: 1E の 前は「窓口が まだ ない」「1E の 坑道が ない」で 落ちる。
 */

vi.setConfig({ testTimeout: 300_000 });

const ROLLS = 2000;
const REAL_CAMPS = 40;
const withCamp = (all: readonly ESample[]): number => all.filter((a) => a.shaft.camp).length;
const campsIn = (all: readonly ESample[], d: Depth): number => all.filter((a) => a.shaft.camp && a.shaft.style?.depth === d).length;

interface Tansu {
  seed: number;
  shaft: BokenShaft;
  hook: MineHookE;
  at: { x: number; y: number; z: number };
  items: CampItem[];
}
const tansus: Tansu[] = [];
const rolls: Record<Depth, CampItem[][]> = { asai: [], nakahodo: [], fukai: [] };

// 窓口が まだ ない ときは、ファイルごと 落とさず 1 つずつの テストを 同じ わけで 落とす〔赤の 数を 正しく 数える〕
let setupError: unknown = null;
beforeEach(() => {
  if (setupError) throw setupError;
});

beforeAll(() => {
  try {
    setup();
  } catch (e) {
    setupError = e;
  }
}, 300_000);

function setup(): void {
  const h0 = hookE(SEED_POOL[0]!);
  needBokenHook(h0, ['campRoll', 'campSeed', 'campPreview']);
  // くじ: 層ごとに 2,000 回〔坑道は 作らない〕
  for (const d of DEPTHS) for (let k = 0; k < ROLLS; k++) rolls[d].push(h0.campRoll(d, 1000 + k * 40503));
  // 本物の キャンプ: 数十こ〔どの 層も 6 こ 以上〕
  const { all } = bigSample((xs) => withCamp(xs) >= REAL_CAMPS && DEPTHS.every((d) => campsIn(xs, d) >= 6), SEED_POOL);
  const hooks = new Map<number, MineHookE>();
  for (const a of all) {
    if (!a.shaft.camp) continue;
    let h = hooks.get(a.seed);
    if (!h) {
      h = hookE(a.seed);
      needBokenHook(h, ['campPreview']);
      hooks.set(a.seed, h);
    }
    const t = a.shaft.camp.tansu;
    const items = h.campPreview(t.x, t.y, t.z);
    if (items) tansus.push({ seed: a.seed, shaft: a.shaft, hook: h, at: t, items });
  }
}

type Kind = 'pan' | 'pickaxe' | 'drop' | 'ore' | 'torch';
/** 物が 表の どの 行の 物か〔かびた パン・たいまつ・たいきゅうの ある 物＝つるはし・落とし物の 表・のこりは 鉱石〕 */
function kindOf(d: Depth, i: CampItem): Kind {
  const T = tablesOf().camp;
  if (i.item === 'kabita_pan') return 'pan';
  if (i.item === 'torch') return 'torch';
  if (i.wear !== undefined || i.item === T.pickaxe[d]) return 'pickaxe';
  if (T.rows.find((r) => r.kind === 'drop')?.items?.includes(i.item)) return 'drop';
  return 'ore';
}
const rowOf = (k: Kind) => tablesOf().camp.rows.find((r) => r.kind === k)!;
const oreCount = (d: Depth, item: string) => tablesOf().camp.ores[d].find((o) => o.item === item)?.count ?? null;

describe('E11: キャンプの たんすの 表', () => {
  it('表: 行 5 つ・かびた パンは いつも・落とし物の 種類・層ごとの 鉱石・のこりの たいきゅう', () => {
    const T = tablesOf().camp;
    expect(T.rows.map((r) => r.kind).sort()).toEqual(['drop', 'ore', 'pan', 'pickaxe', 'torch']);
    expect(rowOf('pan').chance, 'かびた パンは いつも').toBe(1);
    expect(rowOf('drop').items?.length ?? 0, '表に 落とし物の 種類〔ヌシ・レジェンダリー・ようかいだま いがい〕').toBeGreaterThan(0);
    for (const d of DEPTHS) {
      expect(T.ores[d].length, `${d} の 鉱石`).toBeGreaterThan(0);
      expect(typeof T.pickaxe[d], `${d} の つるはし`).toBe('string');
      for (const o of T.ores[d]) expect(rowOf('drop').items ?? [], `鉱石 ${o.item} は 落とし物の 表に ない`).not.toContain(o.item);
    }
    // ふかい の 鉱石には 数が 1 の 物〔きんの いし〕が ある
    expect(T.ores.fukai.some((o) => o.count[0] === 1 && o.count[1] === 1)).toBe(true);
    expect(T.wear[0]).toBeLessThan(T.wear[1]);
  });
});

describe(`E11: たんすの 中身の くじ〔層ごとに campRoll ${ROLLS} 回〕`, () => {
  it('物ごとの 入る わりあいが `campTable()` の 表から ±0.04', () => {
    const bad: string[] = [];
    for (const d of DEPTHS) {
      expect(rolls[d].length, `${d} の くじ`).toBe(ROLLS);
      for (const row of tablesOf().camp.rows) {
        const rate = rolls[d].filter((c) => c.some((i) => kindOf(d, i) === row.kind)).length / ROLLS;
        if (Math.abs(rate - row.chance) > 0.04) bad.push(`${d} ${row.kind}: ${rate.toFixed(3)}〔表 ${row.chance}〕`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('かびた パンは いつも 1 山・数は 表の はんい・同じ 物を 2 つの 山に しない・どの 数も 1 以上', () => {
    const pan = rowOf('pan');
    const bad: string[] = [];
    for (const d of DEPTHS)
      rolls[d].forEach((c, k) => {
        const pans = c.filter((i) => i.item === 'kabita_pan');
        if (pans.length !== 1) bad.push(`${d} #${k}: パンの 山 ${pans.length}`);
        else if (pans[0]!.count < pan.count[0] || pans[0]!.count > pan.count[1]) bad.push(`${d} #${k}: パン ${pans[0]!.count} こ`);
        if (new Set(c.map((i) => i.item)).size !== c.length) bad.push(`${d} #${k}: 同じ 物が 2 山`);
        if (c.some((i) => !(i.count >= 1) || !Number.isInteger(i.count))) bad.push(`${d} #${k}: 数が 整数の 1 以上でない`);
      });
    expect(bad.slice(0, 8), `${bad.length} つ`).toEqual([]);
  });

  it('つるはしは 1 本・しゅるいは 層で きまる〔表の `pickaxe`〕・のこりの たいきゅうが 表の はんい', () => {
    const T = tablesOf().camp;
    const bad: string[] = [];
    for (const d of DEPTHS) {
      const wears: number[] = [];
      rolls[d].forEach((c, k) => {
        const picks = c.filter((i) => kindOf(d, i) === 'pickaxe');
        if (picks.length > 1) bad.push(`${d} #${k}: つるはしが ${picks.length} 山`);
        for (const p of picks) {
          if (p.item !== T.pickaxe[d]) bad.push(`${d} #${k}: ${p.item}〔${T.pickaxe[d]} の はず〕`);
          if (p.count !== 1) bad.push(`${d} #${k}: つるはし ${p.count} 本`);
          if (p.wear === undefined || p.wear < T.wear[0] - 1e-9 || p.wear > T.wear[1] + 1e-9) bad.push(`${d} #${k}: のこり ${p.wear}`);
          else wears.push(p.wear);
        }
      });
      expect(wears.length, `${d} の つるはしの ある くじ`).toBeGreaterThan(300);
      // たいきゅうは はんいの 中で ばらつく〔いつも 同じ 値では ない〕
      expect(Math.max(...wears) - Math.min(...wears), `${d} の のこりの ばらつき`).toBeGreaterThan((T.wear[1] - T.wear[0]) * 0.5);
    }
    expect(bad.slice(0, 8), `${bad.length} つ`).toEqual([]);
  });

  it('妖怪の 落とし物・鉱石・たいまつの 数が 表の はんい〔鉱石は 層の 表の 物だけ・きんの いしは 1〕・落とし物は 表の 物だけ 1 種類', () => {
    const T = tablesOf().camp;
    const bad: string[] = [];
    for (const d of DEPTHS)
      rolls[d].forEach((c, k) => {
        if (c.filter((i) => kindOf(d, i) === 'drop').length > 1) bad.push(`${d} #${k}: 落とし物が 2 種類`);
        if (c.filter((i) => kindOf(d, i) === 'ore').length > 1) bad.push(`${d} #${k}: 鉱石が 2 種類`);
        for (const i of c) {
          const kind = kindOf(d, i);
          if (kind === 'torch' && (i.count < rowOf('torch').count[0] || i.count > rowOf('torch').count[1])) bad.push(`${d} #${k}: たいまつ ${i.count}`);
          if (kind === 'drop' && (i.count < rowOf('drop').count[0] || i.count > rowOf('drop').count[1])) bad.push(`${d} #${k}: 落とし物 ${i.item} ${i.count}`);
          if (kind === 'ore') {
            const span = oreCount(d, i.item);
            if (!span) bad.push(`${d} #${k}: ${i.item} は ${d} の 鉱石の 表に ない`);
            else if (i.count < span[0] || i.count > span[1]) bad.push(`${d} #${k}: 鉱石 ${i.item} ${i.count}〔表 ${span.join('〜')}〕`);
          }
        }
      });
    expect(bad.slice(0, 8), `${bad.length} つ`).toEqual([]);
    // 表の 鉱石は どれも 実際に 出る〔層の 表を 見ずに 1 つだけ 出す 実装を 落とす〕
    for (const d of DEPTHS) for (const o of T.ores[d]) expect(rolls[d].some((c) => c.some((i) => i.item === o.item)), `${d} の ${o.item}`).toBe(true);
  });

  it('同じ〔層, シード〕は 同じ 中身・シードが ちがえば 中身も ばらける', () => {
    const h = hookE(SEED_POOL[0]!);
    for (const d of DEPTHS) {
      for (const k of [0, 17, 999]) expect(h.campRoll(d, 1000 + k * 40503)).toEqual(rolls[d][k]);
      expect(new Set(rolls[d].slice(0, 200).map((c) => JSON.stringify(c))).size, `${d} の 中身の ちがい`).toBeGreaterThan(20);
    }
  });
});

describe('E11: 本物の キャンプ〔数十こ〕は くじと 同じ', () => {
  it(`キャンプが ${REAL_CAMPS} こ 以上〔どの 層も 6 こ 以上〕`, () => {
    expect(tansus.length, '1E の キャンプが ない').toBeGreaterThanOrEqual(REAL_CAMPS);
    for (const d of DEPTHS) expect(tansus.filter((t) => t.shaft.style!.depth === d).length, `${d} の キャンプ`).toBeGreaterThanOrEqual(6);
  });

  it('`campPreview(たんす)` ＝ `campRoll(層, campSeed(たんす))`・場所が ちがえば シードも ちがう', () => {
    expect(tansus.length, '1E の キャンプが ない').toBeGreaterThan(0);
    const bad: string[] = [];
    const seeds = new Set<string>();
    for (const t of tansus) {
      const s = t.hook.campSeed(t.at.x, t.at.y, t.at.z);
      seeds.add(`${t.seed}:${s}`);
      const roll = t.hook.campRoll(t.shaft.style!.depth, s);
      if (JSON.stringify(roll) !== JSON.stringify(t.items)) bad.push(`seed ${t.seed} ${t.shaft.id}`);
      if (t.items.some((i) => kindOf(t.shaft.style!.depth, i) === 'pickaxe' && i.item !== tablesOf().camp.pickaxe[t.shaft.style!.depth])) bad.push(`seed ${t.seed}: つるはしの しゅるい`);
    }
    expect(bad).toEqual([]);
    expect(seeds.size, 'たんすごとに ちがう シード').toBeGreaterThan(tansus.length * 0.9);
  });

  it('同じ〔シード, 場所〕は 同じ 中身〔窓口を 作りなおしても〕', () => {
    expect(tansus.length, '1E の キャンプが ない').toBeGreaterThan(0);
    const bad: string[] = [];
    for (const t of tansus.filter((_, i) => i % 4 === 0)) {
      const again = hookE(t.seed).campPreview(t.at.x, t.at.y, t.at.z);
      if (JSON.stringify(again) !== JSON.stringify(t.items)) bad.push(`seed ${t.seed} ${t.shaft.id}`);
      if (JSON.stringify(t.hook.campPreview(t.at.x, t.at.y, t.at.z)) !== JSON.stringify(t.items)) bad.push(`seed ${t.seed}: 2 回 よぶと ちがう`);
    }
    expect(bad).toEqual([]);
  });
});

// ------------------------------------------------------------------ 本物の たんす〔StorageSystem〕

class W implements VoxelWorld {
  readonly size = { x: 1 << 20, y: 512, z: 1 << 20 };
  isLoaded(): boolean {
    return true;
  }
  loadedBounds() {
    return { x0: -(1 << 19), z0: -(1 << 19), x1: 1 << 19, z1: 1 << 19 };
  }
  b = new Map<string, BlockId>();
  getBlock(x: number, y: number, z: number): BlockId | 'outside' {
    return this.b.get(`${x},${y},${z}`) ?? 'air';
  }
  setBlock(x: number, y: number, z: number, id: BlockId): boolean {
    this.b.set(`${x},${y},${z}`, id);
    return true;
  }
  isSolid(x: number, y: number, z: number): boolean {
    return this.getBlock(x, y, z) !== 'air';
  }
}

/** 記録が あるか〔`StorageSystem.has`。1E の 前は 無い ＝「窓口が まだ ない」で 赤〕 */
function has(st: StorageSystem, x: number, y: number, z: number): boolean {
  const f = (st as unknown as { has?: (x: number, y: number, z: number) => boolean }).has;
  if (typeof f !== 'function') throw new Error('StorageSystem.has〔記録が あるか〕が まだ ない');
  return f.call(st, x, y, z);
}

/** `campPreview` → 持ち物の 山〔たいきゅうは 新品の 値から へった 量に 直す〕 */
function stacksOf(items: CampItem[] | null): ItemStack[] | null {
  if (!items) return null;
  return items.map((i) => {
    const max = maxDurability(i.item as never, W2_SETTING_DEFAULTS.toolDurability);
    const s: ItemStack = { item: i.item as never, count: i.count };
    if (i.wear !== undefined && max !== null) s.wear = Math.min(max - 1, Math.round(max * (1 - i.wear)));
    return s;
  });
}

/** 本番と 同じ つなぎで 窓口と たんすを 作る。`state` を わたすと 保存から もどした 世界 */
function rig(t: Tansu, state?: unknown) {
  const world = new W();
  world.setBlock(t.at.x, t.at.y, t.at.z, 'tansu');
  const scattered: ItemStack[][] = [];
  const fills: string[] = [];
  let st!: StorageSystem;
  const hook = hookE(t.seed, { tansuHas: (x, y, z) => has(st, x, y, z) });
  let open = false;
  st = new StorageSystem({
    world,
    inventory: new InventoryImpl(),
    player: () => ({ x: t.at.x + 0.5, y: t.at.y, z: t.at.z + 2.5 }),
    scatter: (_p: unknown, s: ItemStack[]) => void scattered.push(s),
    inventoryOpen: () => open,
    openScreen: () => (open = true),
    closeScreen: () => (open = false),
    firstFill: (x: number, y: number, z: number) => {
      fills.push(`${x},${y},${z}`);
      return stacksOf(hook.campPreview(x, y, z));
    },
  } as never);
  if (state !== undefined) st.deserialize(state);
  return { world, st, hook, scattered, fills };
}

const contents = (slots: readonly (ItemStack | null)[]): Map<string, number> => {
  const m = new Map<string, number>();
  for (const s of slots) if (s) m.set(s.item, (m.get(s.item) ?? 0) + s.count);
  return m;
};
const expected = (items: CampItem[]): Map<string, number> => {
  const m = new Map<string, number>();
  for (const i of items) m.set(i.item, (m.get(i.item) ?? 0) + i.count);
  return m;
};
const pickOnes = (): Tansu[] => {
  const want = ['asai', 'nakahodo', 'fukai'] as const;
  expect(tansus.length, '1E の キャンプが ない').toBeGreaterThan(0);
  return want.map((d) => tansus.find((t) => t.shaft.style!.depth === d && t.items.some((i) => i.wear !== undefined)) ?? tansus.find((t) => t.shaft.style!.depth === d)).filter((t): t is Tansu => !!t);
};

describe('E11: はじめて あける', () => {
  it('あけると `campPreview` の 物が たんすに 入り〔あけた 前の 予告と 同じ〕、その あと `campPreview` は null', () => {
    const ones = pickOnes();
    expect(ones.length, 'しらべる たんす').toBeGreaterThan(0);
    for (const t of ones) {
      const r = rig(t);
      expect(has(r.st, t.at.x, t.at.y, t.at.z), '記録は まだ ない').toBe(false);
      expect(r.hook.campPreview(t.at.x, t.at.y, t.at.z), 'あける 前の 予告').toEqual(t.items);
      expect(r.st.open(t.at.x, t.at.y, t.at.z)).toBe(true);
      expect(has(r.st, t.at.x, t.at.y, t.at.z), '記録が できた').toBe(true);
      expect(contents(r.st.get(t.at.x, t.at.y, t.at.z)!.slots)).toEqual(expected(t.items));
      expect(r.hook.campPreview(t.at.x, t.at.y, t.at.z), 'あけた あとは null').toBeNull();
      expect(r.fills, 'はじめて だけ').toHaveLength(1);
      r.st.close();
      r.st.open(t.at.x, t.at.y, t.at.z);
      expect(r.fills, '2 回目は 呼ばない').toHaveLength(1);
      expect(contents(r.st.get(t.at.x, t.at.y, t.at.z)!.slots), '2 回目も 同じ').toEqual(expected(t.items));
    }
  });

  it('つるはしの たいきゅうが 持ち物の 山に 入る〔のこり 20〜60%〕', () => {
    const t = tansus.find((x) => x.items.some((i) => i.wear !== undefined));
    expect(t, 'つるはしの ある たんす').toBeDefined();
    const r = rig(t!);
    r.st.open(t!.at.x, t!.at.y, t!.at.z);
    const pick = r.st.get(t!.at.x, t!.at.y, t!.at.z)!.slots.find((s) => s && s.wear !== undefined && s.wear > 0);
    expect(pick, 'へった つるはし').toBeTruthy();
    const max = maxDurability(pick!.item, W2_SETTING_DEFAULTS.toolDurability)!;
    const left = (max - (pick!.wear ?? 0)) / max;
    const T = tablesOf().camp;
    expect(left).toBeGreaterThanOrEqual(T.wear[0] - 1 / max);
    expect(left).toBeLessThanOrEqual(T.wear[1] + 1 / max);
  });

  it('あける 前に 保存して 開きなおしても 同じ 中身〔世界の シードと 場所で きまる〕', () => {
    for (const t of pickOnes()) {
      const a = rig(t);
      const saved = JSON.parse(JSON.stringify(a.st.serialize())) as unknown;
      const b = rig(t, saved);
      expect(has(b.st, t.at.x, t.at.y, t.at.z), '保存しても 記録は まだ ない').toBe(false);
      expect(b.hook.campPreview(t.at.x, t.at.y, t.at.z)).toEqual(t.items);
      b.st.open(t.at.x, t.at.y, t.at.z);
      expect(contents(b.st.get(t.at.x, t.at.y, t.at.z)!.slots)).toEqual(expected(t.items));
      // あけた あとで 保存 → 開きなおし: 同じ 中身で 二度目の 中身は 出ない
      const saved2 = JSON.parse(JSON.stringify(b.st.serialize())) as unknown;
      const c = rig(t, saved2);
      expect(c.hook.campPreview(t.at.x, t.at.y, t.at.z), '保存した あとも null').toBeNull();
      c.st.open(t.at.x, t.at.y, t.at.z);
      expect(c.fills).toHaveLength(0);
      expect(contents(c.st.get(t.at.x, t.at.y, t.at.z)!.slots)).toEqual(expected(t.items));
    }
  });
});

describe('E11: あける 前に こわす・置きなおす・自分で 置く', () => {
  it('あける 前に こわすと 中身が 足もとに 落ちる〔今の たんすを こわした ときと 同じ 落とし方〕', () => {
    for (const t of pickOnes()) {
      const r = rig(t);
      r.world.setBlock(t.at.x, t.at.y, t.at.z, 'air');
      const n = r.st.broken(t.at.x, t.at.y, t.at.z);
      expect(n, '落とした 数').toBe(sum(t.items.map((i) => i.count)));
      expect(r.scattered.length).toBe(1);
      expect(contents(r.scattered[0]!)).toEqual(expected(t.items));
      expect(has(r.st, t.at.x, t.at.y, t.at.z), 'こわすと 記録は 消える').toBe(false);
    }
  });

  it('こわした あと 同じ マスに たんすを 置きなおして あけても 中身は 出ない〔2 回 出ない〕', () => {
    for (const t of pickOnes()) {
      const r = rig(t);
      r.world.setBlock(t.at.x, t.at.y, t.at.z, 'air');
      r.st.broken(t.at.x, t.at.y, t.at.z);
      r.world.setBlock(t.at.x, t.at.y, t.at.z, 'tansu');
      r.st.placed(t.at.x, t.at.y, t.at.z, 0);
      expect(has(r.st, t.at.x, t.at.y, t.at.z), '置いた ときに 記録').toBe(true);
      expect(r.hook.campPreview(t.at.x, t.at.y, t.at.z), '置きなおした たんすは null').toBeNull();
      r.st.open(t.at.x, t.at.y, t.at.z);
      expect(sum([...contents(r.st.get(t.at.x, t.at.y, t.at.z)!.slots).values()]), '中身').toBe(0);
      expect(r.fills, '一度こわした ときに 1 回 だけ').toHaveLength(1);
    }
  });

  it('自分で 置いた たんすは `campPreview` が null・あけても 中身は 出ない〔どこでも〕', () => {
    expect(tansus.length, '1E の キャンプが ない').toBeGreaterThan(0);
    const t = tansus[0]!;
    const r = rig(t);
    for (const [dx, dz] of [[3, 0], [0, 7], [-9, 4]] as const) {
      const x = t.at.x + dx;
      const z = t.at.z + dz;
      r.world.setBlock(x, t.at.y, z, 'tansu');
      r.st.placed(x, t.at.y, z, 90);
      expect(r.hook.campPreview(x, t.at.y, z), `(${x}, ${t.at.y}, ${z})`).toBeNull();
      r.st.open(x, t.at.y, z);
      expect(sum([...contents(r.st.get(x, t.at.y, z)!.slots).values()])).toBe(0);
    }
    expect(r.fills, '自分で 置いた たんすでは 呼ばない').toHaveLength(0);
  });

  it('キャンプの 場所が ない マスは `campPreview` が null', () => {
    expect(tansus.length, '1E の キャンプが ない').toBeGreaterThan(0);
    const t = tansus[0]!;
    const h = hookE(t.seed);
    expect(h.campPreview(t.at.x + 1, t.at.y, t.at.z)).toBeNull();
    expect(h.campPreview(t.at.x, t.at.y + 5, t.at.z)).toBeNull();
  });
});
