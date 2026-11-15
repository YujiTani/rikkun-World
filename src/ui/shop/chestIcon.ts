import type { ChestTier } from '../../world/blocks/chestBlock';
import { chestLidGrid } from '../../world/render/looks/chestLooks';

/**
 * よろずやの カードの たからばこの 絵（TOWN-1-shop 1.5。坑道の 宝箱の 形〔chestLooks の 18×9×9〕を ななめ 上から 見た 絵）。
 * 新しい 絵は 描かない: 坑道の 宝箱の 形と 色を そのまま 小さな 立方体で ならべる。1 段 1 回 だけ 作って とって おく。
 */

const GX = 18; // 形の よこ（小ブロック）
const N = 9; // 形の 高さ・おく行き（小ブロック）
const U = 2; // 小ブロック 1 つの よこの はば（px。ななめの 1 歩）
const H = 2; // 小ブロック 1 つの 高さ（px）
const SHADE = { top: 1, front: 0.82, side: 0.64 } as const; // 面の 明るさ（上・前・よこ）

const cache = new Map<ChestTier, string>();

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number): number => Math.round(v * k);
  return `rgb(${c((n >> 16) & 255)} ${c((n >> 8) & 255)} ${c(n & 255)})`;
}

/** 段の 宝箱の ななめの 絵（data URL） */
export function chestIconUrl(tier: ChestTier): string {
  const hit = cache.get(tier);
  if (hit) return hit;
  const g = chestLidGrid(tier);
  const at = (x: number, y: number, z: number): number => (x * N + y) * N + z;
  const key = (x: number, y: number, z: number): string => (x < 0 || y < 0 || z < 0 || x >= GX || y >= N || z >= N ? '' : g.lid[at(x, y, z)] || g.bodyOpen[at(x, y, z)] || '');
  const w = (GX + N) * U;
  const h = (GX + N) * (U / 2) + N * H + 2;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  // 見る 向き: 前（+z）と 右（+x）と 上。遠い（x+y+z が 小さい）順に 置く
  const list: [number, number, number][] = [];
  for (let x = 0; x < GX; x++) for (let y = 0; y < N; y++) for (let z = 0; z < N; z++) if (key(x, y, z) !== '') list.push([x, y, z]);
  list.sort((a, b) => a[0] + a[1] + a[2] - (b[0] + b[1] + b[2]));
  const ox = N * U;
  const oy = N * H;
  for (const [x, y, z] of list) {
    const k = key(x, y, z);
    const col = g.color(k);
    const sx = ox + (x - z) * U;
    const sy = oy + (x + z) * (U / 2) - y * H;
    const face = (pts: readonly [number, number][], f: number): void => {
      ctx.fillStyle = shade(col, f);
      ctx.beginPath();
      ctx.moveTo(pts[0]![0], pts[0]![1]);
      for (const p of pts.slice(1)) ctx.lineTo(p[0], p[1]);
      ctx.closePath();
      ctx.fill();
    };
    if (key(x, y + 1, z) === '') face([[sx, sy], [sx + U, sy + U / 2], [sx, sy + U], [sx - U, sy + U / 2]], SHADE.top);
    if (key(x, y, z + 1) === '') face([[sx - U, sy + U / 2], [sx, sy + U], [sx, sy + U + H], [sx - U, sy + U / 2 + H]], SHADE.front);
    if (key(x + 1, y, z) === '') face([[sx, sy + U], [sx + U, sy + U / 2], [sx + U, sy + U / 2 + H], [sx, sy + U + H]], SHADE.side);
  }
  const url = canvas.toDataURL();
  cache.set(tier, url);
  return url;
}
