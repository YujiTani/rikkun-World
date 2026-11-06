import { BLOCK_INDEX } from '../blocks/blockTypes';
import { FOUR, type Combined, type Grid } from './mineCaveGrid';
import type { LocalShape } from './mineCaveShape';
import { inDisc } from './mineHiroiRanges';
import { HIROI_SHAPE, hiroiTable } from './mineHiroiTable';
import { hash01, subSeed } from './random';

/**
 * ひろい ほらあな B を ブロックの 地図に する ときの 仕事（鉱石の 場所・出口の 前の 列）。mineCaveRoom.ts から よばれる。
 * 鉱石は 柱の 根もと（すその すぐ 上の みき）と 天井がわに かたまり、立てる マスの 足の 下には 置かない（空気が 上に ある 石は とばす）。
 */

const COAL = BLOCK_INDEX.coal_ore;
const IRON = BLOCK_INDEX.iron_ore;

type Coord = (i: number) => [number, number, number];

/** 列の しるし（x, z の 組） */
export const colId = (x: number, z: number): number => x * 4194304 + z;

/** 鉱石を おく。shell ＝ 部屋の となりの 石の マス（i）。ox・oy・oz ＝ 部屋の 北西の すみの 床 */
export function placeHiroiOres(g: Grid, shell: number[], coord: Coord, ox: number, oy: number, oz: number, shape: LocalShape, seed: number): void {
  const deco = shape.hiroi;
  if (!deco || deco.plain) return;
  const T = hiroiTable();
  const S = HIROI_SHAPE;
  const ceilFrom = Math.ceil(deco.maxTop * T.oreZone.ceilFrom);
  const baseLen = (w0: number): number => (w0 === T.pillar.skirtSmall[0] ? T.pillar.skirtSmall.length : T.pillar.skirt.length);
  const at = (x: number, y: number, z: number): boolean => g.inside(x, y, z) && g.a[g.idx(x, y, z)] === 1;
  const s0 = subSeed(seed, 951);
  const cellHash = (tag: number, size: number, x: number, k: number, z: number): number => hash01(s0 + tag, Math.floor(x / size), Math.floor(k / size), Math.floor(z / size));
  for (const i of shell) {
    if (g.b[i] !== BLOCK_INDEX.stone) continue;
    const [x, y, z] = coord(i);
    if (at(x, y + 1, z)) continue; // 立てる マスの 足の 下には 置かない
    if (!(at(x - 1, y, z) || at(x + 1, y, z) || at(x, y, z - 1) || at(x, y, z + 1) || at(x, y - 1, z))) continue;
    const lx = x - ox;
    const k = y - oy;
    const lz = z - oz;
    const base = deco.pillars.some((p) => {
      const L = baseLen(p.widths[0]!);
      return k >= L && k < L + T.oreZone.baseRows && inDisc(lx, lz, p.x, p.z, T.pillar.mid);
    });
    const zone = base ? 'base' : k >= ceilFrom ? 'ceiling' : null;
    if (zone) {
      const cs = zone === 'base' ? S.oreBaseCell : S.oreCell;
      if (cellHash(83, cs, lx, k, lz) >= (zone === 'base' ? S.oreBaseShare : S.oreCellShare)) continue;
      g.b[i] = cellHash(84, cs, lx, k, lz) < S.oreCoalShare ? COAL : IRON;
    } else if (hash01(s0 + 85, lx, k, lz) < S.oreScatter) g.b[i] = COAL;
  }
}

/** 出口の 前 4 マスの 列。部屋の 空気に 東西南北で となりあう 外の 体の 通る マスが 口の むきに 4 マス いじょう つづく 口だけ（テスト D15 と 同じ きまり） */
export function openingFronts(g: Grid, W: Combined, cells: number[], coord: Coord): Set<number> {
  const out = new Set<number>();
  for (const i of cells) {
    if (g.a[i] !== 1) continue;
    const [x, y, z] = coord(i);
    for (const [dx, dz] of FOUR) {
      if (W.isRoomAir(x + dx, y, z + dz) || !W.body(x + dx, y, z + dz)) continue;
      let run = 0;
      while (run < 4 && W.body(x + dx * (run + 1), y, z + dz * (run + 1)) && !W.isRoomAir(x + dx * (run + 1), y, z + dz * (run + 1))) run++;
      if (run < 4) continue;
      for (let n = 0; n < 4; n++) out.add(colId(x - dx * n, z - dz * n));
    }
  }
  return out;
}

