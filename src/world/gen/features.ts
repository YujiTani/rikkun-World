import { GEN_CONFIG as C } from './config';
import { hash01, subSeed } from './random';
import { startTrees } from './trees';
import { terrainFor, type RockInfo, type Terrain } from './terrain';

/** スタートの まわりの目印（P6・T4）: はじまりの岩山と、はじまりの木 */

const coalCache = new WeakMap<Terrain, Set<number>>();
const ckey = (x: number, y: number, z: number): number => ((x + 4096) * 8192 + (z + 4096)) * 512 + y;

/** はじまりの岩山の「見える せきたん」6 こ（空気に面した いし。3 こ以上は 南＝スタート側の面） */
function rockCoalSet(T: Terrain): Set<number> {
  const hit = coalCache.get(T);
  if (hit) return hit;
  const rock = T.rock();
  const s = subSeed(T.seed, 202);
  const south: { x: number; y: number; z: number; k: number }[] = [];
  const other: { x: number; y: number; z: number; k: number }[] = [];
  const R = Math.ceil(rock.r) + 1;
  for (let x = rock.cx - R; x <= rock.cx + R; x++) {
    for (let z = rock.cz - R; z <= rock.cz + R; z++) {
      if (Math.hypot(x - rock.cx, z - rock.cz) > rock.r) continue;
      const h = T.height(x, z);
      const hE = T.height(x + 1, z);
      const hW = T.height(x - 1, z);
      const hS = T.height(x, z + 1);
      const hN = T.height(x, z - 1);
      for (let y = Math.max(1, rock.peakY - C.rock.visibleDepth); y <= h; y++) {
        const isSouth = hS < y;
        if (!(y === h || hE < y || hW < y || hN < y || isSouth)) continue;
        const e = { x, y, z, k: hash01(s, x, z, y) };
        (isSouth ? south : other).push(e);
      }
    }
  }
  south.sort((a, b) => a.k - b.k);
  other.sort((a, b) => a.k - b.k);
  const picks = [...south.slice(0, C.rock.visibleCoalSouth), ...other, ...south.slice(C.rock.visibleCoalSouth)];
  const set = new Set<number>();
  for (const p of picks.slice(0, C.rock.visibleCoal)) set.add(ckey(p.x, p.y, p.z));
  coalCache.set(T, set);
  return set;
}

/** (x,y,z) は 岩山の「見える せきたん」か */
export function isRockCoal(T: Terrain, x: number, y: number, z: number): boolean {
  return rockCoalSet(T).has(ckey(x, y, z));
}

export interface StartFeatures {
  rock: RockInfo;
  /** y = みきの いちばん下 */
  trees: { x: number; y: number; z: number }[];
}

export function startFeaturesOf(seed: number): StartFeatures {
  const T = terrainFor(seed);
  return {
    rock: { ...T.rock() },
    trees: startTrees(T).map((t) => ({ x: t.x, y: t.y + 1, z: t.z })),
  };
}
