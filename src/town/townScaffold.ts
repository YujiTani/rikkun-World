import data from './repairFinal.json';

/**
 * TOWN-1 1.4 §4.11・設計 `town/art/repair/final/repair-final.md` の 足場: まとまりの 四角から 竹の 箱の 表を 作る（計算だけ。three なし）。
 * 数は ぜんぶ repairFinal.json の scaffold_rule から 読む（手で 書きなおさない）。単位は 1/16 ブロック。
 * 原点 ＝ 足場の わくの 左おくの かど（まとまりの 最小マスの 1 マス 外）、y ＝ 足場の 足もと。
 */
const R = data.scaffold_rule;

type Vec3 = [number, number, number];
type Box6 = [number, number, number, number, number, number];

export interface ScaffoldBox {
  kind: 'post' | 'rail' | 'knot' | 'brace' | 'nobori_pole' | 'nobori_bar' | 'nobori_cloth';
  /** 箱（brace 以外）。x0 y0 z0 x1 y1 z1 */
  box?: Box6;
  /** ななめの 箱（brace）: from → to を 軸に した 太さ thick の 箱 */
  from?: Vec3;
  to?: Vec3;
  thick?: number;
  /** 絵: `T:名前`（たて）・`R:名前`（90° 回して はる）・`N:名前`（のぼりの 布） */
  tex: string;
}

export interface ScaffoldInfo {
  w: number;
  d: number;
  h: number;
  P: number;
  tiers: number[];
  nx: number;
  nz: number;
  posts: number;
  boxes: number;
}

/** 1 まとまりの 箱の 上限（設計: 240 こ。こえる ときは むすび目を かどの 柱 だけに する） */
const SCAFFOLD_BOX_LIMIT = 240;
/** 足場 ぜんぶの 箱の 上限（設計: 6,000 こ） */
export const SCAFFOLD_BOX_TOTAL = 6000;

/** のぼりを 立てる かど（0 ＝ 左おく/ x 小・z 小の がわ、1 ＝ 反対がわ） */
export interface Corner {
  x: 0 | 1;
  z: 0 | 1;
}

/** w×d ＝ まとまりの 四角（マス）、h ＝ 高さ（ブロック。2〜3 に まるめる） */
export function scaffoldBoxes(w: number, d: number, h0: number, corner: Corner = { x: 0, z: 1 }): { boxes: ScaffoldBox[]; info: ScaffoldInfo } {
  const h = Math.max(R.h_min, Math.min(R.h_max, h0));
  const X1 = (w + 2) * 16;
  const Z1 = (d + 2) * 16;
  const P = 16 * h + R.pole_extra;
  const tiers: number[] = [];
  for (let k = 1; k < 10; k++) if (R.rail_step * k + R.rail <= P - 2) tiers.push(R.rail_step * k);
  const nx = Math.ceil(X1 / R.span_max);
  const nz = Math.ceil(Z1 / R.span_max);
  const xs: number[] = [];
  const zs: number[] = [];
  for (let i = 0; i <= nx; i++) xs.push(pyRound((i * X1) / nx));
  for (let i = 0; i <= nz; i++) zs.push(pyRound((i * Z1) / nz));
  const posts = postList(xs, zs, X1, Z1);
  const body = (withKnots: boolean): ScaffoldBox[] => {
    const B: ScaffoldBox[] = [];
    for (const [x, z] of posts) B.push({ kind: 'post', box: [x - 1, 0, z - 1, x + 1, P, z + 1], tex: 'T:town_take' });
    for (const y of tiers) {
      B.push({ kind: 'rail', box: [-2, y, -1, X1 + 2, y + 2, 1], tex: 'R:town_take' });
      B.push({ kind: 'rail', box: [-2, y, Z1 - 1, X1 + 2, y + 2, Z1 + 1], tex: 'R:town_take' });
      B.push({ kind: 'rail', box: [-1, y, -2, 1, y + 2, Z1 + 2], tex: 'R:town_take' });
      B.push({ kind: 'rail', box: [X1 - 1, y, -2, X1 + 1, y + 2, Z1 + 2], tex: 'R:town_take' });
      for (const [x, z] of posts) {
        if (!withKnots && !((x === 0 || x === X1) && (z === 0 || z === Z1))) continue;
        B.push({ kind: 'knot', box: [x - 2, y - 1, z - 2, x + 2, y + 3, z + 2], tex: 'T:town_wara' });
      }
    }
    return B;
  };
  let B = body(true);
  // すじかい（間が 2 つ 以上 ある 辺に 1 本ずつ）・のぼり は 数に 入る ので 先に 数えて 上限を こえる とき 作りなおす
  const extra = braces(xs, zs, nx, nz, X1, Z1, tiers[tiers.length - 1]! + 1).length + 3;
  if (B.length + extra > SCAFFOLD_BOX_LIMIT) B = body(false);
  B.push(...braces(xs, zs, nx, nz, X1, Z1, tiers[tiers.length - 1]! + 1));
  B.push(...nobori(corner, X1, Z1, P));
  return { boxes: B, info: { w, d, h, P, tiers, nx, nz, posts: posts.length, boxes: B.length } };
}

/** 柱の 場所: 4 つの 辺ごとに 間の 数 n で 分けた 点（かどは 1 本）。(x, z) の 小さい 順 */
function postList(xs: number[], zs: number[], X1: number, Z1: number): [number, number][] {
  const set = new Map<string, [number, number]>();
  const add = (x: number, z: number): void => void set.set(`${x},${z}`, [x, z]);
  for (const x of xs) {
    add(x, 0);
    add(x, Z1);
  }
  for (const z of zs) {
    add(0, z);
    add(X1, z);
  }
  return [...set.values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

function braces(xs: number[], zs: number[], nx: number, nz: number, X1: number, Z1: number, top: number): ScaffoldBox[] {
  const out: ScaffoldBox[] = [];
  const mk = (from: Vec3, to: Vec3): void => void out.push({ kind: 'brace', from, to, thick: 2, tex: 'R:town_take' });
  for (const side of ['z0', 'z1', 'x0', 'x1'] as const) {
    if ((side === 'z0' || side === 'z1') && nx >= 2) {
      const i = Math.floor(nx / 2);
      const z = side === 'z0' ? 0 : Z1;
      const [a, b] = side === 'z1' ? [xs[i]!, xs[i + 1]!] : [xs[i + 1]!, xs[i]!];
      mk([a, 0, z], [b, top, z]);
    }
    if ((side === 'x0' || side === 'x1') && nz >= 2) {
      const i = Math.floor(nz / 2);
      const x = side === 'x0' ? 0 : X1;
      const [a, b] = side === 'x1' ? [zs[i]!, zs[i + 1]!] : [zs[i + 1]!, zs[i]!];
      mk([x, 0, a], [x, top, b]);
    }
  }
  return out;
}

function nobori(corner: Corner, X1: number, Z1: number, P: number): ScaffoldBox[] {
  const cx = corner.x === 0 ? 0 : X1;
  const cz = corner.z === 0 ? 0 : Z1;
  const sx = cx === 0 ? 1 : -1;
  const T = P + R.nobori_extra;
  const [bx0, bx1] = [cx, cx + sx * 16].sort((a, b) => a - b) as [number, number];
  const [nx0, nx1] = [cx + sx * 2, cx + sx * (2 + R.banner_w)].sort((a, b) => a - b) as [number, number];
  return [
    { kind: 'nobori_pole', box: [cx - 1, 0, cz - 1, cx + 1, T, cz + 1], tex: 'T:town_take' },
    { kind: 'nobori_bar', box: [bx0, T - 4, cz - 1, bx1, T - 2, cz + 1], tex: 'R:town_take' },
    { kind: 'nobori_cloth', box: [nx0, T - 4 - R.banner_h, cz, nx1, T - 4, cz + 1], tex: 'N:town_nobori' },
  ];
}

/** Python の round（半分は 偶数へ）に 合わせる（設計の スクリプトと 同じ 数に する） */
function pyRound(v: number): number {
  const f = Math.floor(v);
  const r = v - f;
  if (r < 0.5) return f;
  if (r > 0.5) return f + 1;
  return f % 2 === 0 ? f : f + 1;
}
