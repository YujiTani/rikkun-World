import type { BufferAttribute } from 'three';
import { columnKey } from '../VoxelWorld';
import { colKey } from '../stream/ring';
import { CHUNK_DRAW_DISTANCE } from './config';
import type { ChunkStats, SectionInfo, SectionStats } from './rendererTypes';
import { trisOf } from './rendererGeometry';
import type { ColState, SecState } from './sectionState';

/** WorldRenderer の 数える・見る・まとめる（テスト・計測・F3 用。WorldRenderer.ts から分けた。4-7） */

type Cols = ReadonlyMap<number, ColState>;

/** sectionStats が 1 セクションずつ 聞く先 */
interface SectionInfoSource {
  sectionInfo(sx: number, sy: number, sz: number): SectionInfo;
}

/** sectionStats が 世界から 読むもの */
interface StatsWorld {
  readonly size: { readonly y: number };
  loadedColumns(): { cx: number; cz: number }[];
}

/** window.__rikkun.render.chunks() 用 */
export function chunkStats(cols: Cols): ChunkStats {
  const drawnIndices: number[] = [];
  let inRange = 0;
  let lodDrawn = 0;
  for (const col of cols.values()) {
    if (col.dist > CHUNK_DRAW_DISTANCE) continue;
    inRange++;
    const lodOn = !!(col.lodOpaque?.visible || col.lodWater?.visible);
    const any = lodOn || col.secs.some((st) => st.voxel || st.extras || st.water);
    if (!any) continue;
    drawnIndices.push(colKey(col.cx, col.cz));
    if (col.tier === 'lod' && lodOn) lodDrawn++;
  }
  drawnIndices.sort((a, b) => a - b);
  return {
    total: cols.size,
    drawn: drawnIndices.length,
    lodDrawn,
    inRange,
    maxDistance: CHUNK_DRAW_DISTANCE,
    drawnIndices,
  };
}

/** 見えているセクションのメッシュ（voxel・extras・water の全部の attribute と index のバイト、うまり）を、セクションの鍵の順に FNV-1a でまとめた値（hook render.meshDigest。PERF-2） */
export function meshDigest(cols: Cols): { sections: number; hash: string } {
  const all: SecState[] = [];
  for (const col of cols.values()) for (const st of col.secs) if (st.voxel || st.extras || st.water) all.push(st);
  all.sort((a, b) => a.cx - b.cx || a.cz - b.cz || a.sy - b.sy);
  let a = 0x811c9dc5;
  const num = (n: number): void => {
    a = Math.imul(a ^ (n & 255), 0x01000193);
    a = Math.imul(a ^ ((n >>> 8) & 255), 0x01000193);
    a = Math.imul(a ^ ((n >>> 16) & 255), 0x01000193);
    a = Math.imul(a ^ ((n >>> 24) & 255), 0x01000193);
  };
  const bytes = (arr: ArrayBufferView): void => {
    const u = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
    for (let i = 0; i < u.length; i++) a = Math.imul(a ^ u[i], 0x01000193);
    num(u.length);
  };
  for (const st of all) {
    num(st.cx);
    num(st.sy);
    num(st.cz);
    for (const m of [st.voxel, st.extras, st.water]) {
      if (!m) {
        num(-1);
        continue;
      }
      const g = m.geometry;
      for (const name of Object.keys(g.attributes).sort()) bytes((g.attributes[name] as BufferAttribute).array);
      if (g.index) bytes(g.index.array);
    }
    if (st.occ) bytes(st.occ);
    else num(-2);
  }
  return { sections: all.length, hash: (a >>> 0).toString(16).padStart(8, '0') };
}

export function sectionStats(cols: Cols, world: StatsWorld, microR: number, info: SectionInfoSource): SectionStats {
  const out: SectionStats = {
    microR,
    total: 0,
    micro: 0,
    box: 0,
    lod: 0,
    none: 0,
    noneBy: { empty: 0, hidden: 0, unlit: 0 },
    microMaxDist: 0,
    boxMinDist: 0,
    boxMaxDist: 0,
  };
  let boxMin = Infinity;
  // 読みこんだ列のうち まだ 描く輪の外（renderer が 列を持たない）の セクションは「なにも 作らない（empty）」。
  // 数え落とすと、木などが へって 上のほうの 空気が ふえたとき total・empty が 空気の数に 足りなくなる（FLORA-75）
  const nSec = Math.ceil(world.size.y / 16);
  for (const { cx, cz } of world.loadedColumns()) {
    if (cols.has(columnKey(cx, cz))) continue;
    out.total += nSec;
    out.none += nSec;
    out.noneBy.empty += nSec;
  }
  for (const col of cols.values()) {
    for (let sy = 0; sy < col.secs.length; sy++) {
      const i = info.sectionInfo(col.cx, sy, col.cz);
      out.total++;
      if (i.tier === 'none') {
        out.none++;
        out.noneBy[i.reason ?? 'empty']++;
      } else if (i.tier === 'lod') out.lod++;
      else if (i.tier === 'micro') {
        out.micro++;
        out.microMaxDist = Math.max(out.microMaxDist, i.dist);
      } else {
        out.box++;
        boxMin = Math.min(boxMin, i.dist);
        out.boxMaxDist = Math.max(out.boxMaxDist, i.dist);
      }
    }
  }
  out.boxMinDist = boxMin === Infinity ? 0 : boxMin;
  return out;
}

/** 今の三角形の数（テスト・計測用。見えているものだけ） */
export function triangleCount(cols: Cols): number {
  let n = 0;
  for (const col of cols.values()) {
    for (const st of col.secs) n += st.tris;
    if (col.lodOpaque?.visible) n += trisOf(col.lodOpaque);
    if (col.lodWater?.visible) n += trisOf(col.lodWater);
  }
  return n;
}

/** メッシュの数（描画回数の目安。見えているもの） */
export function meshCount(cols: Cols): number {
  let n = 0;
  for (const col of cols.values()) {
    for (const st of col.secs) n += (st.voxel ? 1 : 0) + (st.extras ? 1 : 0) + (st.water ? 1 : 0);
    if (col.lodOpaque?.visible) n++;
    if (col.lodWater?.visible) n++;
  }
  return n;
}
