import { ROPE_TUNING } from './rope';

/**
 * ROPE-1 版 4: ロープの さく の みち。つないだ くい（はじめの くい）から ねらった 列まで。
 * - x と z が どちらも ちがう（ななめ）なら 1 回だけ 直角に まがる（さきに x、つぎに z の L 字）。
 * - 1 マス ずつ 地面の 高さに あわせる（となりの 地面から 上 1・下 3 まで。さくの 上には つむ）。こえられない かべ・深い がけ・置けない マスで とまる（そこまでは つくる）。
 * - くいから 横の きょり（マスの まん中どうし）が つなぎの 半径を こえる マスで とまる。
 * - 本数: ⌈マス数 ÷ 10⌉（さいてい 1）。足りなければ 持って いる 本数 × 10 マス まで つくる。
 */
export interface FenceCell {
  x: number;
  y: number;
  z: number;
}

export interface FenceWorld {
  /** さく を 置ける マス（あき・くさ など。置けない 場所で ない） */
  open(x: number, y: number, z: number): boolean;
  /** 上に のれる（固い。さく も 固い） */
  solid(x: number, y: number, z: number): boolean;
  /** さく の マス */
  fence(x: number, y: number, z: number): boolean;
}

/** くい (sx,sy,sz) から (tx,tz) までの 列の じゅん（くいの 列は ふくまない。L 字） */
export function fencePath(sx: number, sz: number, tx: number, tz: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const dx = Math.sign(tx - sx);
  const dz = Math.sign(tz - sz);
  let x = sx;
  let z = sz;
  while (x !== tx) {
    x += dx;
    out.push([x, z]);
  }
  while (z !== tz) {
    z += dz;
    out.push([x, z]);
  }
  return out;
}

export interface FencePlan {
  cells: FenceCell[];
  used: number;
  /** とちゅうで とまった わけ（null = さいごまで） */
  stop: null | 'wall' | 'radius' | 'ropes';
}

export function fencesFor(n: number): number {
  return Math.max(1, Math.ceil(n / ROPE_TUNING.perRope));
}

export function planFence(stake: FenceCell, tx: number, tz: number, have: number, w: FenceWorld, radius = ROPE_TUNING.tetherRadius): FencePlan | null {
  const cells: FenceCell[] = [];
  let ground = stake.y; // さく の 下の 地面の 高さ（さくを のぞく）
  let stop: FencePlan['stop'] = null;
  for (const [x, z] of fencePath(stake.x, stake.z, tx, tz)) {
    if (Math.hypot(x - stake.x, z - stake.z) > radius) {
      stop = 'radius';
      break;
    }
    if (cells.length >= have * ROPE_TUNING.perRope) {
      stop = 'ropes';
      break;
    }
    let found = -1;
    for (let y = ground + 1; y >= ground - 3; y--) {
      if (w.open(x, y, z) && w.solid(x, y - 1, z) && !w.fence(x, y, z)) {
        // さく が つんで あれば その 上（つむ）
        let top = y;
        while (w.fence(x, top, z)) top++;
        found = top;
        break;
      }
      if (w.fence(x, y, z)) {
        let top = y;
        while (w.fence(x, top, z)) top++;
        if (w.open(x, top, z)) found = top;
        break;
      }
    }
    if (found < 0) {
      stop = 'wall';
      break;
    }
    cells.push({ x, y: found, z });
    let g = found;
    while (w.fence(x, g - 1, z)) g--;
    ground = g;
  }
  if (cells.length === 0) return null;
  return { cells, used: fencesFor(cells.length), stop };
}
