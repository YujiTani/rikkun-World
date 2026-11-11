/**
 * SIGHT-1（#446）AC1・AC2 のテスト用の場面（テストだけが使う。本番からは import しない）。
 * 石の かたまりに 1 マスはば・2 マス高の 坑道（まがり角つき）と 5×3×5 の 部屋を ほる。
 */
export interface ClearanceScene {
  isSolid: (x: number, y: number, z: number) => boolean;
  /** プレイヤーが 立てる 足もと（マスの 中心 + すこし ずらした 3 通り） */
  feet: Array<{ x: number; y: number; z: number }>;
}

const FLOOR_Y = 9; // 足もとの 高さ（その 下の 8 が 床）

export function buildClearanceScene(): ClearanceScene {
  const air = new Set<string>();
  const cells: Array<{ x: number; z: number }> = [];
  const carve = (x0: number, z0: number, x1: number, z1: number, h: number) => {
    for (let x = x0; x <= x1; x++)
      for (let z = z0; z <= z1; z++) {
        for (let y = FLOOR_Y; y < FLOOR_Y + h; y++) air.add(`${x},${y},${z}`);
        cells.push({ x, z });
      }
  };
  carve(3, 6, 14, 6, 2); // 坑道（東へ）
  carve(14, 7, 14, 12, 2); // まがり角から 南へ
  carve(20, 20, 24, 24, 3); // 5×3×5 の 部屋
  const isSolid = (x: number, y: number, z: number): boolean => {
    if (x < 0 || y < 0 || z < 0 || x >= 64 || y >= 64 || z >= 64) return false;
    return y <= 30 && !air.has(`${x},${y},${z}`);
  };
  const feet: ClearanceScene['feet'] = [];
  for (const c of cells)
    for (const o of [0, 0.15, -0.15]) feet.push({ x: c.x + 0.5 + o, y: FLOOR_Y, z: c.z + 0.5 + o });
  return { isSolid, feet };
}

/** 点 (px,py,pz) から いちばん近い 固いマスの 箱までの 距離（まわり 1 マスの 外は 見ない = 1 以上は 1 を 返す） */
export function nearestSolidDistance(
  isSolid: (x: number, y: number, z: number) => boolean,
  px: number,
  py: number,
  pz: number,
): number {
  let best = 1;
  const x0 = Math.floor(px);
  const y0 = Math.floor(py);
  const z0 = Math.floor(pz);
  for (let x = x0 - 1; x <= x0 + 1; x++)
    for (let y = y0 - 1; y <= y0 + 1; y++)
      for (let z = z0 - 1; z <= z0 + 1; z++) {
        if (!isSolid(x, y, z)) continue;
        const dx = Math.max(x - px, 0, px - (x + 1));
        const dy = Math.max(y - py, 0, py - (y + 1));
        const dz = Math.max(z - pz, 0, pz - (z + 1));
        best = Math.min(best, Math.hypot(dx, dy, dz));
      }
  return best;
}

/** 向き 12 通り（30 度ごと）× 上下 5 通り */
export const CLEARANCE_YAWS = Array.from({ length: 12 }, (_, i) => i * 30);
export const CLEARANCE_PITCHES = [-60, -25, 0, 25, 60];
