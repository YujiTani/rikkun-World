/** たけの 小ブロック（既定の voxel。yuzu 2026-11-11「もっと 細く・ときどき はっぱ」）。mesh や 絵には 依存しない */

const N = 9;

/** 形の 数（マス = 9×9×9 の 1 マスの 単位） */
const SHAPE = {
  /** 稈（まんなかの 細い 柱）の はば（マス） */
  stalk: 2,
  /** ふし の 高さの 段（1 ブロックに 1 つ。ふしの 間を 長く する）と はば（マス） */
  nodeY: 4,
  nodeWide: 4,
  /** 横の 葉が 出る 確率 = 3 に 1（根もと = 下が ふさがれた 段には 出さない。上の 段ほど 多くは 高さが 分からないので 全部の 段で 同じ） */
  leafOneIn: 3,
} as const;

/** 稈の はじ（0 起点）。はば 2 → 4〜5、ふしは 3〜6 */
const S0 = (N - SHAPE.stalk) >> 1;
const S1 = S0 + SHAPE.stalk - 1;
const N0 = (N - SHAPE.nodeWide) >> 1;
const N1 = N0 + SHAPE.nodeWide - 1;

/** 面の ならび: 1 = 上が あいている、2 = 下が あいている（kata の exposed と 同じ） */
const TOP = 1;
const BELOW = 2;

function dot(out: Uint8Array, x: number, y: number, z: number): void {
  if (x < 0 || y < 0 || z < 0 || x >= N || y >= N || z >= N) return;
  out[(y * N + z) * N + x] = 1;
}

/** 場所の ハッシュ（0 以上 の 整数。Math.random なし） */
function hashAt(bx: number, by: number, bz: number): number {
  let h = Math.imul(bx | 0, 374761393) ^ Math.imul(by | 0, 668265263) ^ Math.imul(bz | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

/** 4 むき（+x, -x, +z, -z）に ふくらむ 細い 葉の すじ。ふしの 高さから 横へ、すこし 上へ（ささの 葉） */
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

function leafSprig(out: Uint8Array, dx: number, dz: number, y: number, skew: number): void {
  const c = 4;
  const start = N1 - c + 1; // ふしの そと
  const at = (k: number, yy: number): void => dot(out, c + dx * k + dz * skew, yy, c + dz * k + dx * skew);
  at(start, y);
  at(start + 1, y);
  at(start + 2, y + 1); // 先は すこし 上へ（ささの 葉）
}

/** exposed = 上・下 …の あき（1 = 上、2 = 下）。bx, by, bz = 場所（葉の 出方を 決める ハッシュ）。上が あいていれば てっぺんに 必ず 葉の ふさ */
export function fillBambooVoxel(exposed: number, bx: number, by: number, bz: number, out: Uint8Array): void {
  out.fill(0);
  for (let y = 0; y < N; y++) {
    for (let z = S0; z <= S1; z++) for (let x = S0; x <= S1; x++) dot(out, x, y, z);
  }
  for (let z = N0; z <= N1; z++) for (let x = N0; x <= N1; x++) dot(out, x, SHAPE.nodeY, z);
  const h = hashAt(bx, by, bz);
  if ((exposed & TOP) !== 0) {
    // てっぺんの ふさ: 稈の 上から 四方へ ひらく ささの 葉（4 まい）
    for (const [dx, dz] of DIRS) {
      dot(out, 4 + dx * 2, 7, 4 + dz * 2);
      dot(out, 4 + dx * 3, 7, 4 + dz * 3);
    }
    dot(out, 4, 8, 4);
    dot(out, 5, 8, 5);
    return;
  }
  if ((exposed & BELOW) !== 0 && h % SHAPE.leafOneIn === 0) {
    const n = 2 + ((h >>> 8) % 2); // 葉の 数（2〜3 まい）。3 まいめは ずらして 出す
    for (let i = 0; i < n; i++) {
      const [dx, dz] = DIRS[((h >>> 4) + i) % 4]!;
      leafSprig(out, dx, dz, SHAPE.nodeY, i === 2 ? 1 : 0);
    }
  }
}
