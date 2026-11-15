import { describe, expect, it } from 'vitest';
import { townBuildingCells } from './townBuildings';
import { TownPlan } from './townPlan';
import { BUILDING_SITES, NPC_SITES } from './townSites';
import type { Facing } from './townTuning';
import { SHOPKEEPER_TRI_LIMIT, shopkeeperModel } from './shopkeeperSpec';

/**
 * TOWN-1 1C: よろずやさん（`town.info().npcs` の shop。TOWN-1.md §6.1）。よろずやの 中に 立ち、戸口の ほう 2 マスの 立ち場所から 何にも じゃま されずに 話しかけられる。
 */
const cells = townBuildingCells();
const solid = (u: number, v: number, dy: number): boolean => cells.some((c) => c.u === u && c.v === v && c.dy === dy);

describe('よろずやさん', () => {
  const site = NPC_SITES.find((n) => n.kind === 'shop')!;
  const yoro = BUILDING_SITES.find((b) => b.kind === 'yorozuya')!;
  it('表に 1 人。よろずやの 四角の 中・戸口と 同じ 列', () => {
    expect(NPC_SITES.filter((n) => n.kind === 'shop').length).toBe(1);
    expect(site.u).toBeGreaterThanOrEqual(yoro.u0);
    expect(site.u).toBeLessThanOrEqual(yoro.u1);
    expect(site.v).toBeGreaterThanOrEqual(yoro.v0);
    expect(site.v).toBeLessThanOrEqual(yoro.v1);
    expect(site.u).toBe(yoro.door.u);
  });
  it('足もとは ゆか、からだの 2 マスと 戸口の ほう 2 マス（話しかける 立ち場所）までは あいて いる', () => {
    expect(solid(site.u, site.v, 0)).toBe(true);
    for (let v = site.v; v <= site.v + 2; v++) for (const dy of [1, 2]) expect(solid(site.u, v, dy), `v ${v} dy ${dy}`).toBe(false);
    expect(solid(site.u, site.v + 2, 0), '立ち場所の ゆか').toBe(true);
  });
  it('town.info().npcs に shop が いて、4 つの 向きで よろずやの 中・足もとは ゆかの 上', () => {
    for (const facing of ['n', 'e', 's', 'w'] as Facing[]) {
      const plan = new TownPlan({ v: 1, x0: 1000, z0: -2000, facing, groundY: 40 }, null);
      const info = plan.info();
      const shop = info.npcs.filter((n) => n.kind === 'shop');
      expect(shop.length, facing).toBe(1);
      const b = info.buildings.find((x) => x.kind === 'yorozuya')!;
      const p = shop[0]!.pos;
      expect(p.x, facing).toBeGreaterThan(b.min.x);
      expect(p.x, facing).toBeLessThan(b.max.x + 1);
      expect(p.z, facing).toBeGreaterThan(b.min.z);
      expect(p.z, facing).toBeLessThan(b.max.z + 1);
      expect(p.y, facing).toBe(b.min.y + 1);
      // 戸口を 向く（向きの 単位ベクトルが 戸口の ほう）
      const dx = b.door.x - p.x;
      const dz = b.door.z - p.z;
      const yaw = shop[0]!.yaw;
      expect(Math.sin(yaw) * dx + -Math.cos(yaw) * dz, facing).toBeGreaterThan(0);
    }
  });
});

describe('よろずやさんの 形', () => {
  it('三角形は 上限 いか（1 人 ＝ 描画 1 回）', () => {
    const m = shopkeeperModel();
    expect(m.tris).toBeGreaterThan(0);
    expect(m.tris).toBeLessThanOrEqual(SHOPKEEPER_TRI_LIMIT);
  });
});
