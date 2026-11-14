import { describe, expect, it } from 'vitest';
import { DAIKU_POSTS, DAIKU_SIGN } from './townDaiku';
import { TownPlan, type TownRecord } from './townPlan';

/** るすの ふだは こやの 柱・かべの マスと かさならず、こやの 前（入り口の 方）を 向く（どの 向きの 街でも） */
describe('るすの ふだの 場所', () => {
  for (const facing of ['n', 'e', 's', 'w'] as const) {
    it(`向き ${facing}: 柱の マスと かさならない・前を 向く`, () => {
      const rec: TownRecord = { v: 1, x0: 0, z0: 0, facing, groundY: 60 };
      const plan = new TownPlan(rec);
      const sign = plan.carpenterSign();
      const key = (p: { x: number; z: number }): string => `${Math.floor(p.x)},${Math.floor(p.z)}`;
      const posts = new Set(DAIKU_POSTS.us.map((u) => key(plan.toWorld(u, DAIKU_POSTS.v))));
      for (let du = -DAIKU_SIGN.halfWidth; du <= DAIKU_SIGN.halfWidth; du++) {
        expect(posts.has(key(plan.toWorld(DAIKU_SIGN.u + du, DAIKU_SIGN.v)))).toBe(false);
      }
      expect(DAIKU_SIGN.v).toBeGreaterThan(DAIKU_POSTS.v); // 柱の 前（外がわ）
      const front = plan.toWorld(DAIKU_SIGN.u, DAIKU_SIGN.v + 1);
      expect(Math.atan2(front.x + 0.5 - sign.x, -(front.z + 0.5 - sign.z))).toBeCloseTo(sign.yaw, 5);
    });
  }
});
