import { hash01 } from './random';
import { DIRS, rotOf } from './countryStructureKit';
import { placeStructure } from './structures/place';
import { STRUCTURES } from './structures/registry';
import { basinFits, basinNorm, buildBasin, makeBasin, type Basin, type Edit, type Ground } from './waterV2Kit';
import { WATER_BLOCKS as B, WATER_TUNE as T } from './waterV2Table';

/**
 * 池: 段の 広場（山の すそより 高い たいらな 所）に 石で かこんだ 池（直径 5〜9・ふかさ 1〜2）。
 * ふちは あらいし・こけの あらいし・いしれんが まぜ。そばに 石どうろう（小）。もみじやまは 岸に おちば。
 */

const P = T.pond;

/** 池の 候補を 乱数の 順に ためして、count こまで（池どうし 14 マス 以上 はなす）。plaza = 山の すそからの 高さ */
export function planPonds(g: Ground, px: number, pz: number, seed: number, count: number, aboveBase: (x: number, z: number, h: number) => number, free: (x: number, z: number) => boolean): Basin[] {
  const cands: { x: number; z: number; key: number }[] = [];
  const S = T.fall.search;
  for (let z = pz - S; z <= pz + S; z += P.step) {
    for (let x = px - S; x <= px + S; x += P.step) cands.push({ x, z, key: hash01(seed, x, z, 80) });
  }
  cands.sort((a, b) => a.key - b.key);
  const out: Basin[] = [];
  for (const c of cands) {
    if (out.length >= count) break;
    const h = g(c.x, c.z);
    if (h < 0 || aboveBase(c.x, c.z, h) < P.above) continue;
    const steps = Math.round((P.radius[1] - P.radius[0]) * 2);
    const r = P.radius[0] + Math.floor(hash01(seed, c.x, c.z, 81) * (steps + 1)) / 2;
    const depth = P.depth[0] + Math.floor(hash01(seed, c.x, c.z, 82) * (P.depth[1] - P.depth[0] + 1));
    const b: Basin = makeBasin(seed, c.x + 0.5, c.z + 0.5, r, h - 1, depth) // 水面は まわりの 地面より 1 ブロック ひくい;
    if (out.some((o) => Math.hypot(o.cx - b.cx, o.cz - b.cz) < 14)) continue;
    if (!flatAround(g, b, P.flat)) continue;
    if (!basinFits(g, b, P.flat, P.flat + 1, free)) continue;
    out.push(b);
  }
  return out;
}

/** 池と まわり（半径 + 2）の 地面の 高さが 水面から P.flat 以内 */
function flatAround(g: Ground, b: Basin, flat: number): boolean {
  const R = Math.ceil(b.r * (1 + b.amp) + 2);
  for (let z = Math.floor(b.cz) - R; z <= Math.floor(b.cz) + R; z++) {
    for (let x = Math.floor(b.cx) - R; x <= Math.floor(b.cx) + R; x++) {
      if (Math.hypot(x + 0.5 - b.cx, z + 0.5 - b.cz) > b.r * (1 + b.amp) + 2) continue;
      const h = g(x, z);
      if (h < 0 || Math.abs(h - b.level) > flat) return false;
    }
  }
  return true;
}

/** 池を 書く。ochiba = もみじやま（岸に おちば）。石どうろう（小）を 池の そばの 平らな 所に 1 つ（置ける 向きの 先頭） */
export function buildPond(ed: Edit, g: Ground, seed: number, b: Basin, ochiba: boolean, free: (x: number, z: number) => boolean): void {
  buildBasin(ed, g, seed, b, B.pondRim, ochiba);
  const order = DIRS.map((d, n) => ({ d, r: hash01(seed, Math.floor(b.cx), Math.floor(b.cz), 90 + n) })).sort((p, q) => p.r - q.r);
  for (const { d } of order) {
    const x = Math.floor(b.cx + d[0] * (b.r * (1 + b.amp) + 1.3 + P.touro));
    const z = Math.floor(b.cz + d[1] * (b.r * (1 + b.amp) + 1.3 + P.touro));
    if (!free(x, z)) continue;
    const t = placeStructure(STRUCTURES['ishidourou-sho'], x, z, rotOf([-d[0], -d[1]]), Math.floor(b.cx) * 7 + Math.floor(b.cz), g);
    if (t === null || t.blocks.some((c) => basinNorm(b, c.x, c.z) < 1 + 3.2 / b.r)) continue; // ふちに かからない
    for (const c of t.blocks) ed.set(c.x, c.y, c.z, c.id);
    return;
  }
}
