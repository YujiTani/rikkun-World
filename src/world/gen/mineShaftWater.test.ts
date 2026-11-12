import { describe, expect, it } from 'vitest';
import { featureSitesTouching } from './countryFeatures';
import { shaftWorldFor } from './mineShafts';
import { SHAFT_CONFIG as S } from './mineShaftConfig';
import { shaftKeepOut } from './waterV2Shaft';

/**
 * 坑道の 入口の 前に 水の 景色 v2〔池・川・滝・受け皿・ささえ岩・雪のせ〕を 置かない。
 * 見つけ方: seed 103947 の 坑道 r0_2 の 入口 (54, 582) の 前 8 マスが 池に なって いた〔MINE-1 の R1 が 落ちた〕。
 * 水の ブロックは 入口の まわり ledgeRadius + 1 マスに ひとつも 入らない。
 */
const R = S.entrance.ledgeRadius + 1;
const WATERY = new Set(['taki', 'kawa', 'ike']);

describe('坑道の 入口の 前に 水の 景色 v2 が 入らない', () => {
  it.each([103947, 20261012, 8919])('seed %i: 入口の まわり 9 マスに 水の 景色の ブロックが ない', (seed) => {
    const x0 = -700;
    const z0 = -700;
    const x1 = 700;
    const z1 = 700;
    const shafts = shaftWorldFor(seed).shafts(x0, z0, x1, z1, false);
    expect(shafts.length).toBeGreaterThan(0);
    const water = featureSitesTouching(seed, x0 - 200, z0 - 200, x1 + 200, z1 + 200).filter((s) => WATERY.has(s.type));
    expect(water.length, '水の 景色が この はんいに ある').toBeGreaterThan(0);
    const bad: string[] = [];
    for (const sh of shafts) {
      const e = sh.entrance;
      for (const s of water) {
        for (const b of s.blocks) if (Math.abs(b.x - e.x) <= R && Math.abs(b.z - e.z) <= R) bad.push(`${seed} ${sh.id} 入口 (${e.x}, ${e.z}) に ${s.type} ${b.id} (${b.x}, ${b.z})`);
      }
    }
    expect(bad.slice(0, 5), `${bad.length} つ`).toEqual([]);
  });

  it('よける 四角は 入口の まわり 9 マスを ふくむ', () => {
    const seed = 103947;
    const sh = shaftWorldFor(seed).shafts(-700, -700, 700, 700, false)[0]!;
    const e = sh.entrance;
    const rects = shaftKeepOut(seed, e.x - 5, e.z - 5, e.x + 5, e.z + 5);
    expect(rects.some((r) => r[0] <= e.x - R && r[2] >= e.x + R && r[1] <= e.z - R && r[3] >= e.z + R)).toBe(true);
  });
});
