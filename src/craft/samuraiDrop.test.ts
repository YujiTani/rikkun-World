import { describe, expect, it } from 'vitest';
import type { DayPhase, Inventory, ItemId, ItemStack, PlayerCombat, TimeOfDay, Vec3, YokaiKind } from '../contracts';
import { createW2Settings } from '../contracts';
import { pickNushiDrop } from '../legend/defs';
import { ArrayVoxelWorld } from '../world/VoxelWorld';
import { createRng, type Rng } from '../world/gen/random';
import { YokaiManager } from '../yokai/ai/YokaiManager';
import { SAMURAI_GEAR } from './config';
import { NINJA_GEAR } from './config';
import { NINJA_TUNING } from './ninjaTuning';
import { ninjaChestHit, rollNinjaChest } from './ninjaDrop';
import { SAMURAI_IDS, SamuraiBook, isSamuraiGear } from './SamuraiBook';
import { pickSamuraiGear, rollSamuraiChest, samuraiChestHit, samuraiSelectable } from './samuraiDrop';

/**
 * SAMURAI-1（#300）AC15〜AC17: 手に 入れ方（ヌシ・宝箱）と 侍帳。実装の 前の テスト（赤）。
 * 窓口 の 形（NINJA-1 の ninjaDrop.ts・NinjaBook.ts と 同じ 書き方）:
 *   SamuraiBook.ts   `SAMURAI_IDS`（4 つ）・`isSamuraiGear(item)`・`SamuraiBook`（add(item) → { first, kinds } | null / got() / serialize() / deserialize(data, held?)）
 *   samuraiDrop.ts   `pickSamuraiGear(rng, book, have)` → ItemId | null（まだの 物から 1 つ。4 つ そろった あとは 今 持って いない 物から。乱数は 1 つ）
 *                    `samuraiSelectable(book, have)` → (item) => boolean（侍装備でない 物は true、侍装備は 選べる 物だけ true）
 *                    `samuraiChestHit(rng, chance?)`（乱数 ちょうど 1 つ）/ `rollSamuraiChest(rng, book, have, chance?)`
 *   defs.ts          `pickNushiDrop(rows, rng, selectable?)` … 選べない 行は weight 0 と 同じ。乱数は 1 つ
 *   YokaiManager     opts `samurai?: () => { book, have }`（なければ 帳は 空・何も 持って いない）。侍装備には rollPower（強さの くじ）を 使わない
 *   調整表 NINJA_TUNING.samuraiChestChance 0.003
 */
const ALL = Object.values(SAMURAI_GEAR) as ItemId[];
const isSamurai = (i: ItemId) => ALL.includes(i);
const W3: ItemId[] = ['raijin_ken', 'fujin_ken', 'niji'] as ItemId[];

describe('AC15 ヌシの 表（侍装備 4 行）', () => {
  const rows = () => createW2Settings().nushiDrops;
  it('既定の 表は 武器 3 行 ＋ 侍装備 4 行、ぜんぶ weight 1（順は 雷神剣・風神剣・虹・陣笠・羽織・手甲・下駄）', () => {
    expect(rows()).toEqual([...W3, ...ALL].map((item) => ({ item, weight: 1 })));
  });
  it('SAMURAI_IDS は 4 つ（陣笠・羽織・手甲・下駄の 順）・isSamuraiGear', () => {
    expect([...SAMURAI_IDS]).toEqual(['samurai_jingasa', 'samurai_haori', 'samurai_tekko', 'samurai_geta']);
    for (const i of ALL) expect(isSamuraiGear(i), i).toBe(true);
    expect(isSamuraiGear('ninja_tekko' as ItemId)).toBe(false);
    expect(isSamuraiGear('katana' as ItemId)).toBe(false);
  });
  it('侍帳が 空で 乱数 0.1 → 雷神剣、0.5 → 陣笠、0.99 → 下駄', () => {
    const sel = samuraiSelectable([], []);
    expect(pickNushiDrop(rows(), () => 0.1, sel)).toBe('raijin_ken');
    expect(pickNushiDrop(rows(), () => 0.5, sel)).toBe('samurai_jingasa');
    expect(pickNushiDrop(rows(), () => 0.99, sel)).toBe('samurai_geta');
  });
  it('帳に 陣笠が ある（持って いる）と 6 行で 0.5 → 羽織', () => {
    const sel = samuraiSelectable(['samurai_jingasa' as ItemId], ['samurai_jingasa' as ItemId]);
    expect(pickNushiDrop(rows(), () => 0.5, sel)).toBe('samurai_haori');
    expect(pickNushiDrop(rows(), () => 0.1, sel)).toBe('raijin_ken');
    expect(pickNushiDrop(rows(), () => 0.99, sel)).toBe('samurai_geta');
  });
  it('帳に 4 つ ＋ ぜんぶ もちものに ある → 侍装備は 出ず、武器 3 行から（今と 同じ）', () => {
    const sel = samuraiSelectable(ALL, ALL);
    const seen = new Set<ItemId>();
    for (let i = 0; i < 60; i++) seen.add(pickNushiDrop(rows(), createRng(i), sel)!);
    expect([...seen].sort()).toEqual([...W3].sort());
    expect(pickNushiDrop(rows(), () => 0.5, sel)).toBe('fujin_ken'); // 0.5 × 3 = 1.5
  });
  it('選べない 行を 入れて も 武器の 行は 帳を 見ない（持って いる 雷神剣も 出る）。selectable を 省くと 全部 選べる', () => {
    expect(pickNushiDrop(rows(), () => 0.1, samuraiSelectable(ALL, ALL))).toBe('raijin_ken');
    expect(pickNushiDrop(rows(), () => 0.5)).toBe('samurai_jingasa');
  });
  it('乱数は 表で ちょうど 1 つ（侍装備でも 強さの くじを 使わない）。選べない 行だけで 空なら null', () => {
    let n = 0;
    const rng: Rng = () => (n++, 0.5);
    pickNushiDrop(rows(), rng, samuraiSelectable([], []));
    expect(n).toBe(1);
    n = 0;
    expect(pickNushiDrop(ALL.map((item) => ({ item, weight: 1 })), rng, samuraiSelectable(ALL, ALL))).toBeNull();
  });
  it('同じ シード → 同じ 結果。シードが かわると ばらける', () => {
    const run = (seed: number) => Array.from({ length: 30 }, (_, i) => pickNushiDrop(rows(), createRng(seed * 100 + i), samuraiSelectable([], [])));
    expect(run(1)).toEqual(run(1));
    expect(new Set(run(1)).size).toBeGreaterThan(3);
  });
  it('はじめての ヌシで 侍装備が 出る 割合は 4/7（3,000 回で 1,560〜1,860）', () => {
    const rng = createRng(77);
    let n = 0;
    for (let i = 0; i < 3000; i++) if (isSamurai(pickNushiDrop(rows(), rng, samuraiSelectable([], []))!)) n++;
    expect(n).toBeGreaterThanOrEqual(1560);
    expect(n).toBeLessThanOrEqual(1860);
  });
});

describe('AC16 選べる 侍装備', () => {
  it('帳に 3 つ → 侍装備が 出る ときは のこりの 1 つ', () => {
    for (const rest of ALL) {
      const book = ALL.filter((x) => x !== rest);
      for (let i = 0; i < 10; i++) expect(pickSamuraiGear(createRng(i), book, [])).toBe(rest);
    }
  });
  it('帳が 空 → 4 つの どれか（シードで ばらける）', () => {
    const seen = new Set<ItemId>();
    for (let i = 0; i < 200; i++) seen.add(pickSamuraiGear(createRng(i), [], [])!);
    expect([...seen].sort()).toEqual([...ALL].sort());
  });
  it('帳 4 つで 手甲だけ 持って いない → 手甲だけ。ぜんぶ 持って いれば null', () => {
    for (let i = 0; i < 10; i++) expect(pickSamuraiGear(createRng(i), ALL, ALL.filter((x) => x !== 'samurai_tekko'))).toBe('samurai_tekko');
    expect(pickSamuraiGear(createRng(1), ALL, ALL)).toBeNull();
    const sel = samuraiSelectable(ALL, ALL.filter((x) => x !== 'samurai_tekko'));
    expect(sel('samurai_tekko' as ItemId)).toBe(true);
    expect(sel('samurai_geta' as ItemId)).toBe(false);
    expect(sel('katana' as ItemId)).toBe(true);
  });
  it('持って いない 物が 2 つ以上 → その 中から 1 つ', () => {
    const have: ItemId[] = ['samurai_jingasa', 'samurai_haori'] as ItemId[];
    const seen = new Set<ItemId>();
    for (let i = 0; i < 50; i++) seen.add(pickSamuraiGear(createRng(i), ALL, have)!);
    expect([...seen].sort()).toEqual(['samurai_geta', 'samurai_tekko']);
  });

  // ---- 本物の YokaiManager（ヌシを たおす）
  function mgr(opts: { seed: number; table: { item: ItemId; weight: number }[]; book: () => ItemId[]; have?: () => ItemId[] }) {
    const world = new ArrayVoxelWorld({ x: 64, y: 32, z: 64 });
    for (let x = 0; x <= 40; x++) for (let z = 0; z <= 40; z++) world.setBlock(x, 8, z, 'stone');
    const time = { dayTick: () => 0, day: () => 0, phase: (): DayPhase => 'day', skyColor: () => '#000000', brightness: () => 1, dollBrightness: () => 1, set: () => {}, update: () => {}, onPhaseChange: () => () => {} } as unknown as TimeOfDay;
    const combat: PlayerCombat = { hp: () => 20, maxHp: () => 20, dead: () => false, invincibleTicks: () => 0, damage: () => true, heal: () => 0, drainEvents: () => [] };
    const inventory = { add: () => 0, count: () => 0 } as unknown as Inventory;
    const scattered: ItemStack[] = [];
    const settings = createW2Settings() as unknown as Record<string, unknown>;
    settings.nushiDrops = opts.table;
    const player = { position: { x: 2.5, y: 9, z: 6.5 } as Vec3 };
    const m = new YokaiManager({
      world, time, getPlayer: () => player, combat, inventory, seed: opts.seed, settings,
      drops: { scatter: (_p: Vec3, stacks: ItemStack[]) => (scattered.push(...stacks), 0) },
      samurai: () => ({ book: opts.book(), have: opts.have?.() ?? [] }),
    } as never) as any;
    m.config.yokaiAutoSpawn = false;
    m.config.yokaiWander = false;
    const kill = (kind: YokaiKind = 'karakasa'): ItemId[] => {
      m.takeHookEvents();
      const id = m.spawn(kind, 10.5, 9, 10.5, { ai: false, title: 'nushi', m: 1 }) as number;
      m.damage(id, 9999, { x: 9, y: 9, z: 10.5 });
      const ev = m.takeHookEvents() as { type: string; item?: ItemId }[];
      for (let i = 0; i < 130; i++) m.update(1 / 60);
      m.takeHookEvents();
      return ev.filter((e) => e.type === 'drop' && isSamurai(e.item!)).map((e) => e.item!);
    };
    return { m, kill, scattered };
  }
  const SAMURAI_ONLY = ALL.map((item) => ({ item, weight: 1 }));

  it('ヌシを たおす（表を 侍装備だけ）: 帳が 空 → 侍装備 1 こ（袋に 1 こ・強さの くじなし）', () => {
    const r = mgr({ seed: 3, table: SAMURAI_ONLY, book: () => [] });
    const got = r.kill();
    expect(got).toHaveLength(1);
    const stacks = r.scattered.filter((s) => isSamurai(s.item));
    expect(stacks).toHaveLength(1);
    expect(stacks[0]!.count).toBe(1);
    expect(stacks[0]!.power).toBeUndefined();
  });
  it('帳に 3 つ → のこりの 1 つ。4 回 たおすまで 帳に 足していく → 4 つが 1 こ ずつ', () => {
    for (let s = 0; s < 8; s++) {
      const book = new SamuraiBook();
      const r = mgr({ seed: 100 + s, table: SAMURAI_ONLY, book: () => book.got() });
      const got: ItemId[] = [];
      for (let k = 0; k < 4; k++) {
        const drop = r.kill();
        expect(drop, `${s}-${k}`).toHaveLength(1);
        expect(got, `${s}-${k}`).not.toContain(drop[0]);
        got.push(drop[0]!);
        book.add(drop[0]!); // ひろった
      }
      expect([...got].sort()).toEqual([...ALL].sort());
    }
  });
  it('帳 4 つ ＋ ぜんぶ 持って いる → 侍装備は 出ない（武器 3 行から。今と 同じ）', () => {
    const r = mgr({ seed: 5, table: [...W3, ...ALL].map((item) => ({ item, weight: 1 })), book: () => [...ALL], have: () => [...ALL] });
    for (let i = 0; i < 30; i++) expect(r.kill(), `${i}`).toEqual([]);
  });
  it('samurai の 口を 渡さない（帳 空・持って いない）→ 4 つとも 選べる', () => {
    const world = new ArrayVoxelWorld({ x: 64, y: 32, z: 64 });
    for (let x = 0; x <= 40; x++) for (let z = 0; z <= 40; z++) world.setBlock(x, 8, z, 'stone');
    const settings = createW2Settings() as unknown as Record<string, unknown>;
    settings.nushiDrops = SAMURAI_ONLY;
    const scattered: ItemStack[] = [];
    const m = new YokaiManager({
      world, time: { dayTick: () => 0, day: () => 0, phase: () => 'day', skyColor: () => '#000000', brightness: () => 1, dollBrightness: () => 1, set: () => {}, update: () => {}, onPhaseChange: () => () => {} },
      getPlayer: () => ({ position: { x: 2.5, y: 9, z: 6.5 } }), combat: { hp: () => 20, maxHp: () => 20, dead: () => false, invincibleTicks: () => 0, damage: () => true, heal: () => 0, drainEvents: () => [] },
      inventory: { add: () => 0, count: () => 0 }, seed: 1, settings, drops: { scatter: (_p: Vec3, st: ItemStack[]) => (scattered.push(...st), 0) },
    } as never) as any;
    m.config.yokaiAutoSpawn = false;
    m.config.yokaiWander = false;
    const id = m.spawn('karakasa', 10.5, 9, 10.5, { ai: false, title: 'nushi', m: 1 }) as number;
    m.damage(id, 9999, { x: 9, y: 9, z: 10.5 });
    expect(scattered.filter((s) => isSamurai(s.item))).toHaveLength(1);
  });

  // ---- 侍帳の 保存
  it('2 つ 入れて セーブ → 読むと 同じ。入れ方: 初めての 物か・しゅるいの 数', () => {
    const b = new SamuraiBook();
    expect(b.add('katana' as ItemId)).toBeNull();
    expect(b.add('ninja_tekko' as ItemId)).toBeNull();
    expect(b.add('samurai_tekko' as ItemId)).toEqual({ first: true, kinds: 1 });
    expect(b.add('samurai_tekko' as ItemId)).toEqual({ first: false, kinds: 1 });
    expect(b.add('samurai_jingasa' as ItemId)).toEqual({ first: true, kinds: 2 });
    const c = new SamuraiBook();
    c.deserialize(JSON.parse(JSON.stringify(b.serialize())));
    expect(c.got().sort()).toEqual(['samurai_jingasa', 'samurai_tekko']);
  });
  it('前の 保存（帳なし・こわれた）→ 空', () => {
    for (const bad of [undefined, null, 5, 'x', {}, { got: 3 }, { got: [1, null] }]) {
      const d = new SamuraiBook();
      d.add('samurai_geta' as ItemId);
      d.deserialize(bad);
      expect(d.got(), String(bad)).toEqual([]);
    }
  });
  it('こわれても 消えない（remove は ない）・got() は コピー', () => {
    const b = new SamuraiBook();
    b.add('samurai_geta' as ItemId);
    b.got().push('samurai_haori' as ItemId);
    expect(b.got()).toEqual(['samurai_geta']);
  });
  it('読みこんだ とき もちもの・防具の マスに ある 侍装備は 帳に 入る（忍者装備・ふつうの 物は 入らない）', () => {
    const b = new SamuraiBook();
    b.deserialize({ got: ['samurai_jingasa'] }, ['samurai_geta', 'ninja_tabi', 'katana'] as ItemId[]);
    expect(b.got().sort()).toEqual(['samurai_geta', 'samurai_jingasa']);
  });
});

describe('AC17 宝箱の くじ', () => {
  it('samuraiChestChance は 0.003 で 調整表に ある', () => {
    expect(NINJA_TUNING.samuraiChestChance).toBe(0.003);
  });
  it('くじは 乱数を ちょうど 1 つ 使う（はずれ）。境目は chance（0.0029 → 当たり、0.003 → はずれ）', () => {
    let n = 0;
    const rng: Rng = () => (n++, 0.5);
    expect(samuraiChestHit(rng)).toBe(false);
    expect(n).toBe(1);
    n = 0;
    expect(rollSamuraiChest(rng, [], [], 0)).toBeNull();
    expect(n).toBe(1);
    expect(samuraiChestHit(() => 0.0029)).toBe(true);
    expect(samuraiChestHit(() => 0.003)).toBe(false);
  });
  it('chance 1 → まだの 物から 1 つ、0 → 出ない', () => {
    for (let i = 0; i < 20; i++) {
      const got = rollSamuraiChest(createRng(i), ['samurai_jingasa', 'samurai_geta'] as ItemId[], [], 1);
      expect(['samurai_haori', 'samurai_tekko']).toContain(got);
      expect(rollSamuraiChest(createRng(i), [], [], 0)).toBeNull();
    }
  });
  it('4 つ 手に 入れた あとは 持って いない 物から（ぜんぶ 持って いれば 出ない）', () => {
    expect(rollSamuraiChest(createRng(1), ALL, ALL, 1)).toBeNull();
    expect(rollSamuraiChest(createRng(1), ALL, ALL.filter((x) => x !== 'samurai_geta'), 1)).toBe('samurai_geta');
  });
  it('忍者の くじと 侍の くじは 別々: 両方 当たれば 両方 出る。侍の くじが 忍者の 乱数を 使わない', () => {
    const hit: Rng = () => 0.001;
    const ninja = rollNinjaChest(hit, [], []);
    const samurai = rollSamuraiChest(hit, [], []);
    expect(Object.values(NINJA_GEAR)).toContain(ninja);
    expect(ALL).toContain(samurai);
    // 別々に 引く: 忍者が はずれでも 侍は 自分の 乱数で 決まる
    expect(ninjaChestHit(() => 0.5)).toBe(false);
    expect(samuraiChestHit(() => 0.001)).toBe(true);
  });
});
