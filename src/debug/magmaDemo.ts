import type { BlockId, SpawnPoint } from '../contracts';
import { magmaBoilsAt } from '../world/blocks/liquids';

/**
 * MAGMA-SPAWN（docs/design/MAGMA-SPAWN.md §3）: 確かめる ための 見本。URL に `?demo=magma` を つけた ときだけ、
 * はじめの 場所の 前（北 = −z、スタートの 向き）に 見本を 1 回 作る。ふつうの ゲーム・世界の 生成には さわらない。
 *
 *   ・マグマの いけ 6×5（深さ 2。ぐつぐつ マスは 座標で きまる 15%）
 *   ・いけの 東どなりに 水の みぞ → ふれた マグマが こくようせきに
 *   ・マグマの わきどころ（こくようせきの 2×2 の ます に 流れおちる。いっぱいに なると とまる）
 *   ・水の わきどころ ＋ たきつぼ（さいしょから つながった 滝。量は かわらない）
 *   ・こげた ブロックの 見本（床 5 マス ＋ はしら）。いけの まわりの いしも 時間で こげて いく
 * 保存の ある 世界でも 置ける（置いた ブロックは 保存される）。ためす だけなら `?nosave=1&demo=magma`。
 */
export interface DemoWorld {
  isLoaded(x: number, z: number): boolean;
  fill(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, id: BlockId): number;
  setBlock(x: number, y: number, z: number, id: BlockId): boolean;
}
export interface DemoLiquids {
  set(x: number, y: number, z: number, n: number): void;
  magma: { set(x: number, y: number, z: number, n: number): void };
}

export function wantsMagmaDemo(search: string): boolean {
  return new URLSearchParams(search).get('demo') === 'magma';
}

/** 見本の 箱（はじめの 場所 sx・sz から）。テストと E2E が 見る 場所 */
export function magmaDemoLayout(sp: Pick<SpawnPoint, 'x' | 'y' | 'z'>) {
  const sx = Math.floor(sp.x);
  const sz = Math.floor(sp.z);
  const g = Math.floor(sp.y) - 1; // 地面の いちばん上
  return {
    g,
    area: [sx - 8, sz - 20, sx + 8, sz - 6] as const,
    pool: [sx - 6, sz - 17, sx - 1, sz - 13] as const,
    ditchX: sx,
    magmaSpring: { x: sx - 4, y: g + 5, z: sz - 19 },
    magmaBasin: [sx - 5, sz - 20, sx - 4, sz - 19] as const,
    waterSpring: { x: sx + 4, y: g + 6, z: sz - 15 },
    waterPool: [sx + 3, sz - 16, sx + 5, sz - 14] as const,
    kogeta: [sx + 2, sz - 10, sx + 6, sz - 10] as const,
  };
}

/** 見本を 置く。列が まだ 読みこまれて いなければ false（つぎの ステップで また 呼ぶ） */
export function buildMagmaDemo(world: DemoWorld, liquids: DemoLiquids, sp: Pick<SpawnPoint, 'x' | 'y' | 'z'>): boolean {
  const L = magmaDemoLayout(sp);
  const [ax0, az0, ax1, az1] = L.area;
  for (let x = ax0; x <= ax1; x += 4) for (let z = az0; z <= az1; z += 4) if (!world.isLoaded(x, z)) return false;
  if (!world.isLoaded(ax1, az1)) return false;
  const g = L.g;
  // 土台: 平らな いしの 床（下 4 だん）、上は 空気
  world.fill(ax0, g - 4, az0, ax1, g, az1, 'stone');
  world.fill(ax0, g + 1, az0, ax1, g + 12, az1, 'air');
  // マグマの いけ（深さ 2）
  const [px0, pz0, px1, pz1] = L.pool;
  world.fill(px0, g - 1, pz0, px1, g, pz1, 'air');
  for (let x = px0; x <= px1; x++) for (let z = pz0; z <= pz1; z++) for (let y = g - 1; y <= g; y++) liquids.magma.set(x, y, z, 8);
  // 水の みぞ（いけの 東どなり）→ こくようせき
  world.fill(L.ditchX, g, pz0, L.ditchX, g, pz1, 'air');
  for (let z = pz0; z <= pz1; z++) liquids.set(L.ditchX, g, z, 8);
  // マグマの わきどころ: こくようせきの ます（中 2×2・高さ 5）の いちばん 上
  const [bx0, bz0, bx1, bz1] = L.magmaBasin;
  // かべは わきどころと 同じ 高さまで（よこに あふれない。中が いっぱいに なると わきどころが とまる）
  world.fill(bx0 - 1, g + 1, bz0 - 1, bx1 + 1, g + 5, bz1 + 1, 'kokuyouseki');
  world.fill(bx0, g + 1, bz0, bx1, g + 5, bz1, 'air');
  world.setBlock(L.magmaSpring.x, L.magmaSpring.y, L.magmaSpring.z, 'magma_wakimizu');
  // 水の 滝: いけ 3×3（深さ 2、まん中の 底が たきつぼ）＋ 上空の わきどころ
  const [wx0, wz0, wx1, wz1] = L.waterPool;
  world.fill(wx0, g - 1, wz0, wx1, g, wz1, 'air');
  world.setBlock(L.waterSpring.x, g - 2, L.waterSpring.z, 'takitsubo');
  for (let x = wx0; x <= wx1; x++) for (let z = wz0; z <= wz1; z++) for (let y = g - 1; y <= g; y++) liquids.set(x, y, z, 8);
  world.setBlock(L.waterSpring.x, L.waterSpring.y, L.waterSpring.z, 'wakimizu');
  // WAKIDOKORO §5: わきどころは 5 方向に 出る。東西南北を いしで ふさいで 下（たきつぼ）だけに 落とす
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) world.setBlock(L.waterSpring.x + dx, L.waterSpring.y, L.waterSpring.z + dz, 'stone');
  // こげた ブロックの 見本
  const [kx0, kz0, kx1, kz1] = L.kogeta;
  world.fill(kx0, g, kz0, kx1, g, kz1, 'kogeta');
  world.fill(kx1, g + 1, kz0, kx1, g + 2, kz1, 'kogeta');
  return true;
}

/** いけの 上の だんの ぐつぐつ マスの 数（見本の しらべ 用） */
export function demoBoilCount(sp: Pick<SpawnPoint, 'x' | 'y' | 'z'>): number {
  const L = magmaDemoLayout(sp);
  const [px0, pz0, px1, pz1] = L.pool;
  let n = 0;
  for (let x = px0; x <= px1; x++) for (let z = pz0; z <= pz1; z++) if (magmaBoilsAt(x, L.g, z)) n++;
  return n;
}
