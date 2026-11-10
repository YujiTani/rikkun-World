/** たけの 小ブロック（試しの voxel）。mesh や 絵には 依存しない */

const N = 9;

function dot(out: Uint8Array, x: number, y: number, z: number): void {
  if (x < 0 || y < 0 || z < 0 || x >= N || y >= N || z >= N) return;
  out[(y * N + z) * N + x] = 1;
}

/** wide = 稈の 幅（2 か 3）。節は 下と まんなか。上の 面が 見えていれば てっぺんに 小さな 葉 */
export function fillBambooVoxel(exposed: number, out: Uint8Array, wide: 2 | 3): void {
  out.fill(0);
  const x0 = wide === 3 ? 3 : 4;
  const x1 = x0 + wide - 1;
  for (let y = 0; y < N; y++) {
    for (let z = x0; z <= x1; z++) for (let x = x0; x <= x1; x++) dot(out, x, y, z);
  }
  for (const y of [0, 4]) {
    for (let z = x0 - 1; z <= x1 + 1; z++) for (let x = x0 - 1; x <= x1 + 1; x++) dot(out, x, y, z);
  }
  if ((exposed & 1) === 0) return;
  const c = (x0 + x1) >> 1;
  for (const [dx, dz] of [[-2, 0], [2, 0], [0, -2], [0, 2], [-1, -1], [1, 1]] as const) {
    dot(out, c + dx, 8, c + dz);
    dot(out, c + dx, 7, c + dz);
  }
}
