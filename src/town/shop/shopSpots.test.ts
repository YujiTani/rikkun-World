import { describe, expect, it } from 'vitest';
import { CHEST_RIGHT } from '../../world/blocks/chestBlock';
import { FACING_VEC, TownPlan } from '../townPlan';
import { townBuildingCells } from '../townBuildings';
import { BUILDING_SITES, SHOP_BOX_SPOTS } from '../townSites';
import type { Facing } from '../townTuning';

/**
 * TOWN-1-shop §4.3b（1.5）・AC57 の 形: 置き場 4 か所は 戸口の 前の 行・えらぶ 順・1 マス あけ・道 はば 5・前は 手前（門の がわ）。4 つの 向きの 街で 同じ。
 */
const yoro = BUILDING_SITES.find((b) => b.kind === 'yorozuya')!;

describe('たからばこの 置き場（4 つの 向き）', () => {
  for (const facing of ['n', 'e', 's', 'w'] as Facing[]) {
    it(`${facing}: 4 か所・戸口の 前 2 マスの 行・本体と のこりは 坑道の 宝箱の ならび・前に 立つ マスは 本体の 手前`, () => {
      const plan = new TownPlan({ v: 1, x0: 1000, z0: -2000, facing, groundY: 40 }, null);
      const spots = plan.shopSpots();
      const door = plan.info().buildings.find((b) => b.kind === 'yorozuya')!.door;
      expect(spots.length).toBe(SHOP_BOX_SPOTS.du.length);
      const f = FACING_VEC[facing];
      spots.forEach((s, i) => {
        expect(s.front, `${i}`).toBe(facing); // 手前 ＝ 門の 正面と 同じ 向き
        const [rx, rz] = CHEST_RIGHT[s.front];
        expect([s.cells[1].x - s.main.x, s.cells[1].z - s.main.z]).toEqual([rx, rz]);
        expect(s.main.y).toBe(door.y);
        expect([s.stand.x - s.main.x, s.stand.z - s.main.z]).toEqual([f.x, f.z]);
        for (const c of s.cells) {
          const l = plan.toLocal(c.x, c.z)!;
          expect(l.v, '戸口から 手前へ 2 マス').toBe(yoro.door.v + SHOP_BOX_SPOTS.row);
          expect(Math.abs(l.u - yoro.door.u), '戸口の 前の 道（はば 5）を ふさがない').toBeGreaterThan(2);
        }
      });
      // えらぶ 順: ① 西 1 → ② 東 1 → ③ 西 2 → ④ 東 2（ローカルの u）
      const us = spots.map((s) => Math.min(...s.cells.map((c) => plan.toLocal(c.x, c.z)!.u)) - yoro.door.u);
      expect(us).toEqual([...SHOP_BOX_SPOTS.du]);
    });
  }
  it('置き場の 2 マス・前に 立つ マスと その 上は 設計で 空気（店先の 品・かざりを 置かない。§4.3b）', () => {
    const cells = townBuildingCells();
    const v = yoro.door.v + SHOP_BOX_SPOTS.row;
    for (const du of SHOP_BOX_SPOTS.du)
      for (const u of [yoro.door.u + du, yoro.door.u + du + 1])
        for (const vv of [v, yoro.door.v + SHOP_BOX_SPOTS.stand]) expect(cells.some((c) => c.u === u && c.v === vv && c.dy >= 0 && c.dy <= 1), `${u},${vv}`).toBe(false);
  });
});
