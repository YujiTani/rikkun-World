/**
 * LIVE-1 版 3.2 の 手に持つ 形（むしとりあみ N3・むし B2。DESIGN 16.16）。箱の 組みあわせ。
 * 向き・Part の 書き方は `heldTools.ts` と 同じ（原点 = にぎった 手、のびる 向き = -Z、X = 横、Y = 厚み・ふくろの たれる 向き = -Y）。
 * 長さは 0.62 倍（柄 22 点 ＋ わ・ふくろ で 約 1.2 ブロック）。
 */
export interface Part {
  size: readonly [number, number, number];
  pos: readonly [number, number, number];
  color: number;
  rotY?: number;
}

const GRIP = 0x3d5a9e; // 藍の にぎり
const POLE = 0xc9b26a; // 柄
const RING = 0x8c5e3a; // こい木の わ
const BAG = 0xefe7d4; // 生成りの ふくろ
const BAG_SHADE = 0xe2d6bc;

/** むしとりあみ: にぎり（藍）・柄・しずく形の わ（箱 4 つ）・長く たれる ふくろ（先へ 細い 3 段）＋ 藍の すじ */
export const NET_HELD_PARTS: Part[] = [
  { size: [0.05, 0.05, 0.3], pos: [0, 0, -0.12], color: GRIP },
  { size: [0.03, 0.03, 0.58], pos: [0, 0, -0.56], color: POLE },
  // わ（下が 少し 長い しずく）
  { size: [0.025, 0.025, 0.34], pos: [-0.17, 0, -1.0], color: RING },
  { size: [0.025, 0.025, 0.34], pos: [0.17, 0, -1.0], color: RING },
  { size: [0.36, 0.025, 0.025], pos: [0, 0, -1.18], color: RING },
  { size: [0.22, 0.025, 0.025], pos: [0, 0, -0.84], color: RING },
  // ふくろ（わ から 下へ たれて 先へ 細く）
  { size: [0.32, 0.1, 0.32], pos: [0, -0.07, -1.0], color: BAG },
  { size: [0.24, 0.1, 0.24], pos: [0, -0.16, -1.0], color: BAG_SHADE },
  { size: [0.14, 0.09, 0.14], pos: [0, -0.245, -1.0], color: BAG },
  { size: [0.03, 0.31, 0.03], pos: [0, -0.15, -1.0], color: GRIP },
];

/** むし: 生成りの まる 3 つ ＋ だいだいの 頭 ＋ 帯 */
export const BUG_HELD_PARTS: Part[] = [
  { size: [0.1, 0.1, 0.1], pos: [0, 0, -0.05], color: 0xf3e6c8 },
  { size: [0.1, 0.1, 0.1], pos: [0, 0.01, -0.15], color: 0xf3e6c8 },
  { size: [0.1, 0.1, 0.03], pos: [0, 0.01, -0.215], color: 0xe8962e },
  { size: [0.1, 0.1, 0.1], pos: [0, 0, -0.27], color: 0xe8962e },
  { size: [0.02, 0.02, 0.02], pos: [-0.03, 0.04, -0.33], color: 0x2e2438 },
  { size: [0.02, 0.02, 0.02], pos: [0.03, 0.04, -0.33], color: 0x2e2438 },
];
