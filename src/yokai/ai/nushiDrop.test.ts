import { describe, expect, it } from 'vitest';
import type { DayPhase, Inventory, ItemId, ItemStack, PlayerCombat, TimeOfDay, Vec3, YokaiKind } from '../../contracts';
import { createW2Settings } from '../../contracts';
import { ArrayVoxelWorld } from '../../world/VoxelWorld';
import { YokaiManager } from './YokaiManager';

/**
 * WEAPON-7 AC5・AC6（docs/design/WEAPON-7.md §2.3・§11）: ヌシの ドロップ表。
 * 窓口（仕様 §9）: 設定 `nushiDrops: { item, weight }[]`（`settings` を YokaiManager に わたす。WEAPON-5 の よろけと 同じ）。
 * 出来事は 今の `drop`（`takeHookEvents()`）。袋は `drops.scatter`（DropField）。実装の 前は ヌシから 何も 出ないので 赤になる。
 */

type Row = { item: ItemId; weight: number };
type Rig = ReturnType<typeof rig>;

function rig(o: { seed?: number; nushiDrops?: Row[]; has?: boolean } = {}) {
  const world = new ArrayVoxelWorld({ x: 64, y: 32, z: 64 });
  for (let x = 0; x <= 40; x++) for (let z = 0; z <= 40; z++) world.setBlock(x, 8, z, 'stone');
  const time = {
    dayTick: () => 0, day: () => 0, phase: (): DayPhase => 'day', skyColor: () => '#000000', brightness: () => 1,
    dollBrightness: () => 1, set: () => {}, update: () => {}, onPhaseChange: () => () => {},
  } as unknown as TimeOfDay;
  const combat: PlayerCombat = {
    hp: () => 20, maxHp: () => 20, dead: () => false, invincibleTicks: () => 0,
    damage: () => true, heal: () => 0, drainEvents: () => [],
  };
  // 「持っている」かを 見ない 確かめ: has = true なら どの 物も 1 こ 持っている ことに する
  const inventory = { add: () => 0, count: () => (o.has ? 1 : 0) } as unknown as Inventory;
  const scattered: ItemStack[] = [];
  const settings = createW2Settings() as unknown as Record<string, unknown>;
  if (o.nushiDrops) settings.nushiDrops = o.nushiDrops;
  const player = { position: { x: 2.5, y: 9, z: 6.5 } as Vec3 };
  const m = new YokaiManager({
    world, time, getPlayer: () => player, combat, inventory, seed: o.seed ?? 1, settings,
    drops: { scatter: (_p: Vec3, stacks: ItemStack[]) => (scattered.push(...stacks), 0) },
  } as never) as any;
  m.config.yokaiAutoSpawn = false;
  m.config.yokaiWander = false;
  const step = (n = 1) => {
    for (let i = 0; i < n; i++) m.update(1 / 60);
  };
  return { m, step, scattered };
}

/** 1 体 たおす。戻りは その 1 体で 出た drop の 出来事（item の 列） */
function kill(r: Rig, kind: YokaiKind, title: 'none' | 'oyabun' | 'taisho' | 'nushi'): ItemId[] {
  r.m.takeHookEvents();
  const id = r.m.spawn(kind, 10.5, 9, 10.5, { ai: false, title, m: 1 }) as number;
  r.m.damage(id, 9999, { x: 9, y: 9, z: 10.5 });
  const ev = r.m.takeHookEvents() as { type: string; item?: ItemId }[];
  r.step(130); // たおれる → 消える（次の ヌシを 出せる）
  r.m.takeHookEvents();
  return ev.filter((e) => e.type === 'drop').map((e) => e.item!);
}

/** PR2 で 表が 2 本（雷神剣・風神剣）に なった ので、「レジェンダリーが 1 本」は どちらかで 数える */
// WEAPON-9 で 虹も 表に 入った（3 本）
// SAMURAI-1（#300）: 表に 侍装備 4 つも 入った（帳が 空の この 準備では 7 行から 1 つ）。「レジェンダリーが 1 本」は 武器 3 ＋ 侍装備 4 の どれか 1 つで 数える
const LEGENDS = ['raijin_ken', 'fujin_ken', 'niji', 'samurai_jingasa', 'samurai_haori', 'samurai_tekko', 'samurai_geta'] as ItemId[];
const isLegend = (x: ItemId) => LEGENDS.includes(x);

describe('WEAPON-7 AC5: ヌシの 表（かならず 1 本）', () => {
  it('ヌシを プレイヤーが たおすと legendary が ちょうど 1 本（1,000 回。からかさ・ちょうちん・ろくろくび）', () => {
    const r = rig({ seed: 5 });
    const kinds: YokaiKind[] = ['karakasa', 'chochin', 'rokurokubi'];
    for (let i = 0; i < 1000; i++) {
      const items = kill(r, kinds[i % 3]!, 'nushi');
      expect(items.filter(isLegend), `${i} 回目`).toHaveLength(1);
    }
  });
  it('おやぶん・たいしょう・二つ名なし → 0（300 回ずつ）。ぬりかべの ヌシは ちょうど 1 本（#270）', () => {
    const r = rig({ seed: 6 });
    for (let i = 0; i < 300; i++) {
      for (const t of ['none', 'oyabun', 'taisho'] as const) expect(kill(r, 'karakasa', t).filter(isLegend), `${t} ${i}`).toEqual([]);
      expect(kill(r, 'nurikabe', 'nushi').filter(isLegend), `ぬりかべ ${i}`).toHaveLength(1);
      for (const t of ['none', 'oyabun', 'taisho'] as const) expect(kill(r, 'nurikabe', t).filter(isLegend), `ぬりかべ ${t} ${i}`).toEqual([]);
    }
  });
  it('落下で たおれた ヌシは 出さない（ドロップも 経験値も なし）', () => {
    const r = rig({ seed: 7 });
    r.m.takeHookEvents();
    const id = r.m.spawn('rokurokubi', 5.5, 25, 5.5, { ai: false, title: 'nushi', m: 1 }) as number;
    r.m.setHp(id, 1);
    r.step(200);
    const ev = r.m.takeHookEvents() as { type: string }[];
    expect(ev.filter((e) => e.type === 'defeat')).toHaveLength(1);
    expect(ev.filter((e) => e.type === 'drop')).toHaveLength(0);
    expect(r.scattered).toHaveLength(0);
  });
  it('袋は 地面に（scatter）。1 本・1 こ', () => {
    const r = rig({ seed: 8 });
    kill(r, 'karakasa', 'nushi');
    const legends = r.scattered.filter((s) => isLegend(s.item));
    expect(legends).toHaveLength(1);
    expect(legends[0]!.count).toBe(1);
  });
  it('同じ シードで ほかの drop は 前と 同じ（ヌシの 表は べつの 乱数）', () => {
    const run = (nushiDrops: Row[] | undefined) => {
      const r = rig({ seed: 11, nushiDrops });
      const out: ItemId[][] = [];
      const kinds: YokaiKind[] = ['karakasa', 'chochin', 'rokurokubi'];
      for (let i = 0; i < 200; i++) out.push(kill(r, kinds[i % 3]!, i % 2 ? 'nushi' : 'taisho').filter((x) => !isLegend(x)));
      return out;
    };
    const withTable = run(undefined);
    const emptyTable = run([]); // 表を 空に する（何も 出さない。§8）
    expect(withTable).toEqual(emptyTable);
    expect(withTable.flat().length).toBeGreaterThan(0);
  });
  it('nushiDrops を 空に すると 何も 出さない', () => {
    const r = rig({ seed: 12, nushiDrops: [] });
    for (let i = 0; i < 50; i++) expect(kill(r, 'karakasa', 'nushi').filter(isLegend)).toEqual([]);
  });
});

describe('WEAPON-7 AC6: 選び方（ランダム・持っている かは 見ない）', () => {
  const T3: Row[] = [
    { item: 'bokuto', weight: 1 },
    { item: 'katana', weight: 1 },
    { item: 'crystal_katana', weight: 1 },
  ];
  const names = T3.map((t) => t.item);
  const pick = (r: Rig): ItemId | undefined => kill(r, 'karakasa', 'nushi').find((x) => names.includes(x));
  const draw = (r: Rig, n: number): (ItemId | undefined)[] => Array.from({ length: n }, () => pick(r));

  it('3,000 回 引くと 3 本 それぞれ 900〜1,100 回。つづけて 同じ 物が 出る ことが ある', () => {
    const seq = draw(rig({ seed: 3, nushiDrops: T3 }), 3000);
    for (const n of names) {
      const c = seq.filter((x) => x === n).length;
      expect(c, n).toBeGreaterThanOrEqual(900);
      expect(c, n).toBeLessThanOrEqual(1100);
    }
    let same = 0;
    for (let i = 1; i < seq.length; i++) if (seq[i] === seq[i - 1]) same++;
    expect(same).toBeGreaterThanOrEqual(1);
  });
  it('持っている か（legendGot が 空でも ぜんぶでも）で 割合が かわらない', () => {
    const a = draw(rig({ seed: 4, nushiDrops: T3, has: false }), 1500);
    const b = draw(rig({ seed: 4, nushiDrops: T3, has: true }), 1500);
    expect(b).toEqual(a); // 見ないので 同じ シードなら まったく 同じ 並び
  });
  it('weight [2, 1, 1] → 1 本目 1,350〜1,650 回（3,000 回）', () => {
    const seq = draw(rig({ seed: 9, nushiDrops: [{ item: 'bokuto', weight: 2 }, { item: 'katana', weight: 1 }, { item: 'crystal_katana', weight: 1 }] }), 3000);
    const c = seq.filter((x) => x === 'bokuto').length;
    expect(c).toBeGreaterThanOrEqual(1350);
    expect(c).toBeLessThanOrEqual(1650);
  });
  it('表が 1 本 → いつも それ', () => {
    const seq = draw(rig({ seed: 2, nushiDrops: [{ item: 'katana', weight: 1 }] }), 200);
    expect(seq.every((x) => x === 'katana')).toBe(true);
  });
  it('同じ シードで 同じ 結果', () => {
    const a = draw(rig({ seed: 21, nushiDrops: T3 }), 300);
    const b = draw(rig({ seed: 21, nushiDrops: T3 }), 300);
    expect(b).toEqual(a);
    expect(draw(rig({ seed: 22, nushiDrops: T3 }), 300)).not.toEqual(a);
  });
});

describe('WEAPON-7 PR2・PR3 AC21: ヌシの 既定の 表（雷神剣・風神剣・虹 ＋ SAMURAI-1 の 侍装備 4 つ・weight 1 ずつ）', () => {
  it('既定の 表で 3,000 回 → 7 つ それぞれ 330〜530 回（3,000 ÷ 7 ≒ 429。SAMURAI-1 で 期待が 変わった）・かならず どれか 1 つ', () => {
    const r = rig({ seed: 31 });
    const n: Record<string, number> = {};
    for (let i = 0; i < 3000; i++) {
      const got = kill(r, 'karakasa', 'nushi').filter(isLegend);
      expect(got, `${i} 回目`).toHaveLength(1);
      n[got[0]!] = (n[got[0]!] ?? 0) + 1;
    }
    for (const k of LEGENDS) {
      expect(n[k], k).toBeGreaterThanOrEqual(330);
      expect(n[k], k).toBeLessThanOrEqual(530);
    }
  });
});

describe('WEAPON-7 PR3 AC28: 虹の 強さは 1 本ごとに 4〜10 の 整数（同じ 重さ）', () => {
  it('袋の stack に power（4〜10 の 整数・7 通り すべて）。ほかの 武器は power なし。同じ シードで 同じ', () => {
    const roll = (seed: number, n: number) => {
      const r = rig({ seed, nushiDrops: [{ item: 'niji', weight: 1 }] });
      const out: number[] = [];
      for (let i = 0; i < n; i++) {
        r.scattered.length = 0;
        kill(r, 'karakasa', 'nushi');
        const st = r.scattered.find((x) => x.item === 'niji');
        out.push(st?.power ?? -1);
      }
      return out;
    };
    const a = roll(41, 400);
    expect([...new Set(a)].sort((x, y) => x - y)).toEqual([4, 5, 6, 7, 8, 9, 10]);
    expect(roll(41, 100)).toEqual(a.slice(0, 100));
    const r = rig({ seed: 3, nushiDrops: [{ item: 'raijin_ken', weight: 1 }] });
    kill(r, 'karakasa', 'nushi');
    expect(r.scattered.find((x) => x.item === 'raijin_ken')?.power).toBeUndefined();
  }, 60_000);
});
