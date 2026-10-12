/** ろくろくびの首の道すじ（空気のマスをたどって、曲がる回数と長さに上限をつける） */
export interface P3 {
  x: number;
  y: number;
  z: number;
}

export const NECK_MAX_LENGTH = 8;
export const NECK_MAX_TURNS = 2;

const DIRS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];
const R = NECK_MAX_LENGTH;
const D = 2 * R + 1;
const CELLS = D * D * D;
const TURN_STATES = NECK_MAX_TURNS + 1;
const visited = new Int32Array(CELLS * 6 * TURN_STATES);
const queue = new Int32Array(CELLS * 6 * TURN_STATES);
const stepsOf = new Uint8Array(CELLS * 6 * TURN_STATES);
let stamp = 0;

function lineClear(isSolid: (x: number, y: number, z: number) => boolean, a: P3, b: P3): boolean {
  const len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  const n = Math.max(1, Math.ceil(len / 0.2));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    if (isSolid(Math.floor(a.x + (b.x - a.x) * t), Math.floor(a.y + (b.y - a.y) * t), Math.floor(a.z + (b.z - a.z) * t))) return false;
  }
  return true;
}

/** 折れ線 from → corners → to の長さ */
export function routeLength(from: P3, corners: readonly P3[], to: P3): number {
  let len = 0;
  let p = from;
  for (const c of corners) {
    len += Math.hypot(c.x - p.x, c.y - p.y, c.z - p.z);
    p = c;
  }
  return len + Math.hypot(to.x - p.x, to.y - p.y, to.z - p.z);
}

/**
 * from（首のつけ根）から to（かみつく所）までの首の道すじ。曲がり角の点だけを返す。
 * まっすぐ通れるなら []、道が無ければ null。曲がりは maxTurns 回まで、長さの合計は maxLength まで。
 */
export function findNeckRoute(
  isSolid: (x: number, y: number, z: number) => boolean,
  from: P3,
  to: P3,
  maxLength = NECK_MAX_LENGTH,
  maxTurns = NECK_MAX_TURNS,
): P3[] | null {
  if (Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z) > maxLength) return null;
  if (lineClear(isSolid, from, to)) return [];
  const sx = Math.floor(from.x);
  const sy = Math.floor(from.y);
  const sz = Math.floor(from.z);
  const gx = Math.floor(to.x);
  const gy = Math.floor(to.y);
  const gz = Math.floor(to.z);
  if (isSolid(sx, sy, sz) || isSolid(gx, gy, gz)) return null;
  if (Math.abs(gx - sx) + Math.abs(gy - sy) + Math.abs(gz - sz) > maxLength) return null;
  stamp++;
  const cellIdx = (x: number, y: number, z: number): number => ((x - sx + R) * D + (y - sy + R)) * D + (z - sz + R);
  const stateIdx = (cell: number, dir: number, turns: number): number => (cell * 6 + dir) * TURN_STATES + turns;
  let head = 0;
  let tail = 0;
  // parent は visited に stamp とは別に持てないので、親の状態番号を queue 側の並びで追う
  const parent: number[] = [];
  const push = (x: number, y: number, z: number, dir: number, turns: number, steps: number, par: number): number => {
    if (Math.abs(x - sx) > R || Math.abs(y - sy) > R || Math.abs(z - sz) > R) return -1;
    if (isSolid(x, y, z)) return -1;
    const s = stateIdx(cellIdx(x, y, z), dir, turns);
    if (visited[s] === stamp) return -1;
    visited[s] = stamp;
    stepsOf[s] = steps;
    queue[tail] = s;
    parent[tail] = par;
    tail++;
    return tail - 1;
  };
  for (let d = 0; d < 6; d++) push(sx + DIRS[d]![0], sy + DIRS[d]![1], sz + DIRS[d]![2], d, 0, 1, -1);
  let found = -1;
  const decode = (s: number): { x: number; y: number; z: number; dir: number } => {
    const dir = Math.floor(s / TURN_STATES) % 6;
    const cell = Math.floor(s / TURN_STATES / 6);
    const z = (cell % D) - R + sz;
    const y = (Math.floor(cell / D) % D) - R + sy;
    const x = Math.floor(cell / D / D) - R + sx;
    return { x, y, z, dir };
  };
  const cells: { x: number; y: number; z: number; dir: number }[] = [];
  while (head < tail && found < 0) {
    const s = queue[head]!;
    const me = decode(s);
    const turns = s % TURN_STATES;
    if (me.x === gx && me.y === gy && me.z === gz) {
      found = head;
      break;
    }
    const steps = stepsOf[s]!;
    if (steps < maxLength) {
      for (let d = 0; d < 6; d++) {
        if (d === (me.dir ^ 1)) continue;
        const t = turns + (d === me.dir ? 0 : 1);
        if (t > maxTurns) continue;
        push(me.x + DIRS[d]![0], me.y + DIRS[d]![1], me.z + DIRS[d]![2], d, t, steps + 1, head);
      }
    }
    head++;
  }
  if (found < 0) return null;
  for (let i = found; i >= 0; i = parent[i]!) cells.push(decode(queue[i]!));
  cells.reverse();
  const corners: P3[] = [];
  for (let i = 0; i + 1 < cells.length; i++) {
    if (cells[i]!.dir !== cells[i + 1]!.dir) corners.push({ x: cells[i]!.x + 0.5, y: cells[i]!.y + 0.5, z: cells[i]!.z + 0.5 });
  }
  if (routeLength(from, corners, to) > maxLength + 1e-6) return null;
  return corners;
}
