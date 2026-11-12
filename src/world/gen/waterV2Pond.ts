import { hash01 } from './random';
import { DIRS, rotOf } from './countryStructureKit';
import { placeStructure } from './structures/place';
import { STRUCTURES } from './structures/registry';
import { basinNorm, buildBasin, type Basin, type Edit, type Ground } from './waterV2Kit';
import { WATER_BLOCKS as B, WATER_TUNE as T } from './waterV2Table';

/**
 * 池: 平らな 段（waterV2Flat が えらぶ）に 石で かこんだ 池。
 * ふちは あらいし・こけの あらいし・いしれんが まぜ。そばに 石どうろう（小）。もみじやまは 岸に おちば。
 */

const P = T.pond;

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
