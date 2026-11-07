import { BLOCK_INDEX } from '../blocks/blockTypes';
import { Frame, ShaftBuilder, airHeightOf, keyOf } from './mineShaftBuild';
import { SHAFT_CONFIG as S } from './mineShaftConfig';
import type { Geo, Site } from './mineShaftSite';
import type { Shaft } from './mineShaftTypes';

/** 入口の まわりの 地上の 物（MINE-1C。mineShaftPlan.ts から 分けた。意味は かわらない）: 小さな いしの 山・入口の 屋根の 石の だい・木と 草花を おかない 四角 */

const STONE = BLOCK_INDEX.stone;
const GRASS = BLOCK_INDEX.grass;
const DIRT = BLOCK_INDEX.dirt;

/** 山の 形: 中心から の きょり r に ある 地面の 上の 高さ。Tc − floor(r)（r が Tc 以上は 0） */
const moundBump = (tc: number, r: number): number => (r < tc ? tc - Math.floor(r) : 0);

export function surfaceOf(G: Geo, site: Site, b: ShaftBuilder, F: Frame): { mound: Shaft['mound']; noTrees: [number, number, number, number][]; noPlants: [number, number, number, number][] } {
  // 山
  let mound: Shaft['mound'] = null;
  const noTrees: [number, number, number, number][] = [];
  const noPlants: [number, number, number, number][] = [];
  if (site.mound) {
    const { x: mx, z: mz, tc } = site.mound;
    mound = { x: mx, z: mz, top: G.h(mx, mz) + tc, width: 2 * tc - 1 };
    for (let z = mz - tc; z <= mz + tc; z++) {
      for (let x = mx - tc; x <= mx + tc; x++) {
        const bump = moundBump(tc, Math.hypot(x - mx, z - mz));
        const h = G.h(x, z);
        for (let k = 1; k <= bump; k++) {
          const key = keyOf(x, h + k, z);
          if (!b.air.has(key) && !b.put.has(key)) b.put.set(key, k === bump ? GRASS : k === bump - 1 ? DIRT : STONE); // 上は くさ・その 下は つち・のこりは 石（§4.5.1）
        }
      }
    }
    noPlants.push([mx - tc - S.mound.clear, mz - tc - S.mound.clear, mx + tc + S.mound.clear, mz + tc + S.mound.clear]);
    noTrees.push([mx - tc - 8, mz - tc - 8, mx + tc + 8, mz + tc + 8]);
  } else {
    noPlants.push([site.x - 3, site.z - 3, site.x + 3, site.z + 3]);
    const tc = S.entrance.ledgeRadius + S.entrance.leafSpill; // 木の はっぱを 足場に して 4 以上 落ちない ように、入口の まわり 8 マスに はっぱが かからない 広さ
    noTrees.push([site.x - tc, site.z - tc, site.x + tc, site.z + tc]);
  }

  // 入口の 屋根が 地面から とびだして いる 所は、まわりの 地面より 2 以上 高い 石の だいに する〔屋根の 上を 歩いて 4 以上 落ちる ふちを 作らない。§4.5.3 の 4〕
  const surfAt = (x: number, z: number): number => G.h(x, z) + (site.mound ? moundBump(site.mound.tc, Math.hypot(x - site.mound.x, z - site.mound.z)) : 0);
  const deck = new Map<number, number>(); // 台に する 列〔x, z の キー〕→ 屋根の 高さ
  const dk = (x: number, z: number): number => (x + 1_048_576) * 2_097_152 + (z + 1_048_576);
  for (const c of b.path) {
    if ((c.part !== 'entrance' && c.part !== 'ramp') || Math.hypot(c.x - site.x, c.z - site.z) > S.entrance.deckWithin) continue;
    const top = c.y + airHeightOf(c.part);
    if (top <= surfAt(c.x, c.z)) continue;
    for (let dv = -1; dv <= 1; dv++) {
      const k = dk(c.x + F.lx * dv, c.z + F.lz * dv);
      deck.set(k, Math.max(deck.get(k) ?? -Infinity, top));
    }
  }
  if (deck.size > 0) {
    let topY = Math.max(...deck.values());
    const cols: [number, number][] = [];
    for (const k of deck.keys()) cols.push([Math.floor(k / 2_097_152) - 1_048_576, (k % 2_097_152) - 1_048_576]);
    for (const [x, z] of cols) {
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        if (!deck.has(dk(x + dx, z + dz))) topY = Math.max(topY, surfAt(x + dx, z + dz) + S.entrance.deckAbove);
      }
    }
    for (const [x, z] of cols) {
      for (let y = surfAt(x, z) + 1; y <= topY; y++) {
        const key = keyOf(x, y, z);
        if (!b.air.has(key) && !b.put.has(key)) b.put.set(key, STONE);
      }
    }
  }

  return { mound, noTrees, noPlants };
}
