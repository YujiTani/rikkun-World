import { COUNTRY_KINDS, countryAt, countryCell, takePath, type CountryKind } from './biome';
import { GEN_CONFIG as C } from './config';
import { spawnOf } from './terrain';

/**
 * window.__rikkun.biome（VOX-I §8.1）。国の場所を ゲームに聞く。読みこんでいない所でも 答える（生成の計算だけ）。
 *   at(x, z)               → { kind, cx, cz, e, mountain }
 *   here()                 → キャラの足もとの at
 *   find(kind, from?)      → from（なければ スタート）から いちばん近い その国の点 { x, z }
 *   take.path(cx, cz)      → たけやぶ の升目の 道のマス { x, z }[]
 */
export interface BiomeHook {
  at(x: number, z: number): ReturnType<typeof countryAt>;
  here(): ReturnType<typeof countryAt>;
  find(kind: CountryKind, from?: { x: number; z: number }): { x: number; z: number };
  take: { path(cx: number, cz: number): { x: number; z: number }[] };
}

/** 升目を渦まきに ひろげて いちばん近い点をさがす（山は 1 つの点を 4 升目が 分けあう） */
export function findCountry(seed: number, kind: CountryKind, from: { x: number; z: number }): { x: number; z: number } {
  if (!COUNTRY_KINDS.includes(kind)) throw new Error(`unknown country kind: ${kind}`);
  const cell = C.biome.cell;
  const i0 = Math.floor((from.x - C.anchor.x) / cell);
  const j0 = Math.floor((from.z - C.anchor.z) / cell);
  let best: { x: number; z: number } | null = null;
  let bestD = Infinity;
  // 升目 r ふくろ先の点は 少なくとも (r − 1) × cell はなれている
  for (let r = 0; r <= 400; r++) {
    if (best !== null && (r - 2) * cell > bestD) break;
    for (let j = j0 - r; j <= j0 + r; j++) {
      for (let i = i0 - r; i <= i0 + r; i++) {
        if (Math.max(Math.abs(i - i0), Math.abs(j - j0)) !== r) continue;
        const c = countryCell(seed, i, j);
        if (c.kind !== kind) continue;
        const d = Math.hypot(c.px - from.x, c.pz - from.z);
        if (d < bestD) {
          bestD = d;
          best = { x: c.px, z: c.pz };
        }
      }
    }
  }
  if (best === null) throw new Error(`country not found: ${kind}`);
  return best;
}

export function createBiomeHook(opts: { seed: number; player: () => { x: number; z: number } }): BiomeHook {
  const { seed } = opts;
  return {
    at: (x, z) => countryAt(seed, x, z),
    here: () => {
      const p = opts.player();
      return countryAt(seed, Math.floor(p.x), Math.floor(p.z));
    },
    find: (kind, from) => {
      const sp = spawnOf(seed);
      return findCountry(seed, kind, from ?? { x: sp.x, z: sp.z });
    },
    take: { path: (cx, cz) => takePath(seed, cx, cz) },
  };
}
