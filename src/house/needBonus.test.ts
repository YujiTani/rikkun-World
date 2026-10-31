import { describe, expect, it } from 'vitest';
import { InventoryImpl } from '../inventory/Inventory';
import { NOD_STEPS } from './architect';
import { makeFakeWorld } from './fakeWorld';
import { createHouseHook } from './hook';
import { HouseSystem } from './system';

/**
 * HOUSE-1C PR-2 AC51（#340。docs/design/HOUSE-1.md §4.3・§2.8、docs/tickets/HOUSE-1C.md）: はじめての 家の ふとんの おまけ。
 * まだ 1 けんも 建て はじめて いない 世界（`firstBonus()` が true）では、ふとん 1 つぶん（ぬの 3・いと 1）が `need()` の `bonus` に 出て、`need` から ひかれる。
 * 実装の 前は 赤（窓口 `firstBonus` が まだ 無く、`need()` の `bonus` は いつも 0）。
 * 「建て はじめた あとは 2 けん目から ぬの 3・いと 1 が いる」は 建築を 始める 関数が 決まってから（票の「テストの 準備（PR-2）」の ユニット 期待。E2E は `e2e/house1cBuild.spec.ts`）。
 */

const SPAWN = { x: 64.5, z: 64.5, yawDeg: 0 };

/** エディターで せっけいずを 1 まい 作って、持ち物の マスの 番号を 返す（system.test.ts の 1B と 同じ 手順） */
function rig() {
  const bag = new InventoryImpl();
  const player = { x: SPAWN.x, y: 11, z: SPAWN.z };
  const sys = new HouseSystem({
    seed: 77,
    world: makeFakeWorld(),
    spawn: () => SPAWN,
    player: () => player,
    bag,
    voice: () => undefined,
    gave: () => undefined,
    onOpen: () => undefined,
    onClose: () => undefined,
    isLand: () => true,
  });
  sys.state.record.toolsGiven = true;
  sys.state.record.fudeGiven = true;
  sys.update();
  sys.talkTo(sys.architects()[0]!.id);
  for (let i = 0; i < NOD_STEPS; i++) sys.update();
  const hook = createHouseHook(sys);
  const make = (ops: unknown[]): number => {
    bag.add('paper', 2);
    bag.add('fude', 1);
    sys.press('editor');
    for (const op of ops) expect(hook.edit(op)).toBe(true);
    sys.press('next');
    sys.press('next');
    for (const ch of 'もも') expect(hook.edit({ op: 'char', ch })).toBe(true);
    sys.press('done');
    return hook.blueprints().at(-1)!.slot;
  };
  const firstBonus = (): unknown => (hook as unknown as { firstBonus?: () => boolean }).firstBonus?.();
  return { sys, hook, make, firstBonus };
}

/** ふとんだけの 家は「ふとんだけで いい？」の 確かめが 出る ので、いすも 1 つ 置く（いすの 材料は き だけ。ぬの・いとに 関わらない） */
const CHAIR = { op: 'place', kind: 'chair', x: 4, z: 0 };

const row = (rows: ReturnType<ReturnType<typeof createHouseHook>['need']>, item: string) => rows.find((r) => r.item === item);

describe('AC51 はじめての 家の ふとんの おまけ', () => {
  it('まだ 1 けんも 建て はじめて いない 世界では firstBonus() が true', () => {
    const { firstBonus } = rig();
    expect(firstBonus(), 'house.firstBonus()').toBe(true);
  });

  it('ふとん 1 つの せっけいず: ぬの {need 0, bonus 3}・いと {need 0, bonus 1}。くらに ぬの・いとが 0 でも 不足は 0', () => {
    const { hook, make } = rig();
    const slot = make([{ op: 'place', kind: 'futon', x: 0, z: 0 }, CHAIR]);
    const rows = hook.need(slot);
    expect(row(rows, 'cloth'), 'ぬの').toMatchObject({ need: 0, have: 0, short: 0, bonus: 3 });
    expect(row(rows, 'string'), 'いと').toMatchObject({ need: 0, have: 0, short: 0, bonus: 1 });
    expect(row(rows, 'log'), 'き は おまけなし').toMatchObject({ bonus: 0 });
    expect(row(rows, 'stone'), 'いし は おまけなし').toMatchObject({ bonus: 0 });
  });

  it('ふとん 2 つの せっけいずでも おまけは 1 つぶん（ぬの need 3・いと need 1。bonus は 3 と 1）', () => {
    const { hook, make } = rig();
    const slot = make([{ op: 'place', kind: 'futon', x: 0, z: 0 }, { op: 'place', kind: 'futon', x: 2, z: 0 }, CHAIR]);
    const rows = hook.need(slot);
    expect(row(rows, 'cloth'), 'ぬの').toMatchObject({ need: 3, bonus: 3 });
    expect(row(rows, 'string'), 'いと').toMatchObject({ need: 1, bonus: 1 });
  });
});
