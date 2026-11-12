import { CHUNK_SIZE, type BlockArray } from '../../contracts';
import { BLOCK_INDEX } from '../blocks/blockTypes';
import { LAYER } from './columnLayout';
import { hash01 } from './random';
import type { TreeForm, TreeSize } from './treeV2';

/**
 * 木の形（?trees=v2。試作）。みき（根・曲がり・えだ）と はっぱ（枝先の もこもこ ／ 円すい）。
 * どれも (x, z, 形, 大きさ) だけで決まる → 何回よんでも・どの列から見ても 同じ。
 */

export interface ShapedTree {
  x: number;
  z: number;
  /** 地面の高さ（みきの いちばん下は y + 1） */
  y: number;
  trunk: number;
  big?: boolean;
  size: TreeSize;
  form: TreeForm;
  leaves: 'leaves' | 'momiji_leaves' | 'matsu_leaves';
}

const SEED = 0x7a31;
const LEAF_SEED = 0x7a32;
/** 8 方向（よこ・ななめ） */
const DIRS: readonly (readonly [number, number])[] = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
/** 根の 候補（みき 1×1）: [dx, dz, 外向き dx, 外向き dz] */
const RING1: readonly (readonly [number, number, number, number])[] = [[-1, 0, -1, 0], [1, 0, 1, 0], [0, -1, 0, -1], [0, 1, 0, 1]];
/** 根の 候補（みき 2×2） */
const RING2: readonly (readonly [number, number, number, number])[] = [
  [-1, 0, -1, 0], [-1, 1, -1, 0], [2, 0, 1, 0], [2, 1, 1, 0], [0, -1, 0, -1], [1, -1, 0, -1], [0, 2, 0, 1], [1, 2, 0, 1],
];

type LogFn = (dx: number, y: number, dz: number, root: boolean) => void;
/** snow = ゆき ブロック（はっぱの 上に のせる） */
type LeafFn = (dx: number, y: number, dz: number, snow?: boolean) => void;

/** 木 t の ブロックを 出す（log か leaf の どちらかだけ 渡してよい） */
export function shapeTree(t: ShapedTree, log: LogFn | null, leaf: LeafFn | null): void {
  const R = (k: number): number => hash01(SEED, t.x, t.z, k);
  const w = t.big === true ? 2 : 1;
  const { size, form, trunk } = t;
  const top = t.y + trunk;

  // ---- みきの 曲がり（高さ k ごとの よこずれ）
  const nBend = form === 'pine' ? (size === 's' ? 1 : 3) : form === 'maple' ? (size === 's' ? 1 : 3) : size === 's' ? 0 : size === 'm' ? 1 + Math.floor(R(1) * 2) : 2;
  const ox = new Array<number>(trunk + 1).fill(0);
  const oz = new Array<number>(trunk + 1).fill(0);
  if (form !== 'conifer') {
    const bendAt: number[] = [];
    for (let i = 0; i < nBend; i++) bendAt.push(Math.max(2, Math.round(trunk * (0.25 + (0.5 * (i + R(2 + i))) / nBend))));
    let cx = 0;
    let cz = 0;
    let dir = Math.floor(R(5) * 4);
    for (let k = 1; k <= trunk; k++) {
      if (bendAt.includes(k)) {
        if (R(6 + k) < (form === 'maple' ? 0.1 : 0.35)) dir = (dir + 1 + Math.floor(R(30 + k) * 2) * 2) % 4; // ときどき 向きを かえる
        const d = DIRS[dir * 2]!;
        cx += d[0];
        cz += d[1];
      }
      ox[k] = cx;
      oz[k] = cz;
    }
  }

  // ---- みき
  if (log) {
    for (let k = 1; k <= trunk; k++) {
      for (let a = 0; a < w; a++) for (let b = 0; b < w; b++) log(ox[k]! + a, t.y + k, oz[k]! + b, false);
      if (k > 1 && (ox[k] !== ox[k - 1] || oz[k] !== oz[k - 1])) {
        for (let a = 0; a < w; a++) for (let b = 0; b < w; b++) log(ox[k - 1]! + a, t.y + k, oz[k - 1]! + b, false); // 曲がりめを つなぐ
      }
    }
    // 根もとが 広がる
    if (size !== 's') {
      const ring = w === 2 ? RING2 : RING1;
      const order = ring.map((_, i) => i).sort((p, q) => R(20 + p) - R(20 + q));
      const n = size === 'l' ? 5 : 2 + Math.floor(R(19) * 2);
      for (let i = 0; i < n; i++) {
        const c = ring[order[i]!]!;
        log(c[0], t.y + 1, c[1], true);
        if (size === 'l' && i < 2) log(c[0] + c[2], t.y + 1, c[1] + c[3], true); // 2 マス外まで
        if (size === 'l' && i < 3) log(c[0], t.y + 2, c[1], true);
      }
    }
  }

  // ---- はっぱ（みき だけ ほしいときは leaf = null。えだ の みきは ここで 出す）
  const put: LeafFn = leaf ?? (() => undefined);
  const ctrX = (k: number): number => ox[k]! + (w - 1) / 2;
  const ctrZ = (k: number): number => oz[k]! + (w - 1) / 2;
  const hf = (x: number, y: number, z: number): number => hash01(LEAF_SEED, t.x + x, t.z + z, y);

  /** もこもこ: 下が平ら（1 段）で 上が まるい。ふちを ちょっと けずる */
  const blob = (cx: number, cy: number, cz: number, r: number, squash: number): void => {
    const R2 = r + 1;
    for (let y = cy - 1; y <= cy + Math.ceil(r / squash); y++) {
      const dy = y - cy;
      for (let z = Math.floor(cz - R2); z <= Math.ceil(cz + R2); z++) {
        for (let x = Math.floor(cx - R2); x <= Math.ceil(cx + R2); x++) {
          const d2 = (x - cx) * (x - cx) + (z - cz) * (z - cz);
          const lim = dy < 0 ? (r - 0.7) * (r - 0.7) : r * r + 0.3 - dy * dy * squash * squash;
          if (d2 > lim) continue;
          if (d2 > (r - 1) * (r - 1) && hf(x, y, z) < 0.22) continue;
          put(x, y, z);
        }
      }
    }
  };
  /** まつの 平たい 段 */
  const pad = (cx: number, cy: number, cz: number, r: number): void => {
    for (let dy = 0; dy <= 2; dy++) {
      const rr = dy === 0 ? r : dy === 1 ? r - 0.6 : r - 1.8;
      if (rr < 0.5) continue;
      for (let z = Math.floor(cz - rr - 1); z <= Math.ceil(cz + rr + 1); z++) {
        for (let x = Math.floor(cx - rr - 1); x <= Math.ceil(cx + rr + 1); x++) {
          const d2 = (x - cx) * (x - cx) + (z - cz) * (z - cz);
          if (d2 > rr * rr + 0.3) continue;
          if (dy === 0 && d2 > (rr - 1) * (rr - 1) && hf(x, cy + dy, z) < 0.18) continue;
          put(x, cy + dy, z);
        }
      }
    }
  };

  if (form === 'conifer') {
    // 細くて高い: うすい 1 段の はっぱ ＋ そのうえに ゆき。段と段の あいだは あいて、みきが 見える
    if (!leaf) return;
    const y0 = t.y + 2;
    const span = top + 1 - y0 + 1;
    const want = size === 's' ? 4 : size === 'm' ? 5 : 6 + Math.floor(R(7) * 2);
    const n = Math.min(want, Math.floor(span / 3));
    const rMax = size === 's' ? 2 : size === 'm' ? 2.6 : 3.4;
    const cx = (w - 1) / 2;
    const cz = cx;
    const disk = (y: number, rr: number, snow: boolean): void => {
      for (let z = Math.floor(cz - rr - 1); z <= Math.ceil(cz + rr + 1); z++) {
        for (let x = Math.floor(cx - rr - 1); x <= Math.ceil(cx + rr + 1); x++) {
          if ((x - cx) * (x - cx) + (z - cz) * (z - cz) <= rr * rr + 0.2) put(x, y, z, snow);
        }
      }
    };
    for (let i = 0; i < n; i++) {
      const r = rMax - (i * (rMax - 1)) / Math.max(1, n - 1);
      const a = y0 + Math.floor((i * span) / n);
      disk(a, r + 0.3, false);
      disk(a + 1, r - 0.9, true);
    }
    put(0, top + 1, 0, false);
    put(0, top + 2, 0, true); // てっぺんにも ゆき
    return;
  }

  /** もみじの 平たい かたまり（厚さ 2〜3・はば 5〜9）。下が平ら、上が ちょっと 丸い */
  const slab = (cx: number, cy: number, cz: number, r: number, thick: number): void => {
    for (let dy = 0; dy < thick; dy++) {
      const rr = dy === 0 ? r : dy === 1 ? r - 0.5 : r - 1.6;
      for (let z = Math.floor(cz - rr - 1); z <= Math.ceil(cz + rr + 1); z++) {
        for (let x = Math.floor(cx - rr - 1); x <= Math.ceil(cx + rr + 1); x++) {
          const d2 = (x - cx) * (x - cx) + (z - cz) * (z - cz);
          if (d2 > rr * rr + 0.3) continue;
          if (d2 > (rr - 1) * (rr - 1) && hf(x, cy + dy, z) < 0.2) continue;
          put(x, cy + dy, z);
        }
      }
    }
  };

  const topR = size === 's' ? 2.3 : size === 'm' ? 3 : 3.6;
  const wide = form === 'maple';
  const sq = wide ? 1.5 : 1;
  const draw = (cx: number, cy: number, cz: number, r: number, i = 0): void => {
    if (form === 'pine') pad(cx, cy, cz, r * 0.95);
    else if (wide) slab(cx, cy, cz, size === 'l' ? 3.4 + R(40 + i) * 1.1 : size === 'm' ? 2.6 + R(40 + i) * 0.8 : 2.2, size === 's' ? 2 : 2 + Math.floor(R(50 + i) * 2));
    else blob(cx, cy, cz, r, sq);
  };

  draw(ctrX(trunk), top + (form === 'pine' ? 0 : 1), ctrZ(trunk), topR);
  let made = 1;
  const target = size === 's' ? 2 : size === 'm' ? 3 + Math.floor(R(8) * 2) : 5 + Math.floor(R(8) * 2);
  // えだ（中・大）: ななめに のびて、先に もこもこ
  const nBr = size === 's' ? 0 : wide ? (size === 'm' ? 2 : 3 + Math.floor(R(9) * 2)) : size === 'm' ? 1 + Math.floor(R(9) * 2) : 2 + Math.floor(R(9) * 3);
  const baseDir = Math.floor(R(10) * 8);
  const used: number[] = [];
  for (let i = 0; i < nBr; i++) {
    const di = (baseDir + Math.round((i * 8) / nBr) + (R(11 + i) < 0.5 ? 0 : 1)) % 8;
    used.push(di);
    const [dx, dz] = DIRS[di]!;
    const k = Math.max(3, Math.round(trunk * (0.5 + 0.35 * ((i + 0.5) / nBr))));
    const len = wide ? (size === 'm' ? 3 + (R(16 + i) < 0.5 ? 0 : 1) : 4) : (size === 'm' ? 2 : 3) + (R(16 + i) < 0.5 ? 0 : 1);
    const ax = (dx > 0 ? w - 1 : 0) + ox[k]!;
    const az = (dz > 0 ? w - 1 : 0) + oz[k]!;
    let ex = ax;
    let ey = t.y + k;
    let ez = az;
    for (let j = 1; j <= len; j++) {
      ex = ax + dx * j;
      ez = az + dz * j;
      ey = t.y + k + Math.ceil(j / 2);
      if (log) log(ex, ey, ez, false);
    }
    draw(ex, ey + 1, ez, topR - 0.6 - (size === 'm' ? 0.2 : 0), i + 1);
    made++;
  }
  if (!leaf || wide) return; // もみじは えだの 先の かたまりだけ（盆栽のように）
  // 足りない分は 幹の 上のほうに よこから くっつく かたまり
  for (let i = 0; made < target; i++, made++) {
    let di = (baseDir + 4 + i * 3) % 8;
    if (used.includes(di)) di = (di + 1) % 8;
    const [dx, dz] = DIRS[di]!;
    const d = size === 'l' ? 2.6 : 1.8;
    const k = Math.max(3, trunk - 1 - (i % 3));
    draw(ctrX(k) + dx * d, t.y + k + 1, ctrZ(k) + dz * d, topR - 0.9);
  }
}

/** 形のある 木を 列 out（左上 x0, z0）に 書く。みきを 先に、はっぱは 空気の所だけ */
export function writeShapedTrees(out: BlockArray, trees: readonly ShapedTree[], x0: number, z0: number, leafId: (t: ShapedTree) => number): void {
  const LOG = BLOCK_INDEX.log;
  const AIR = BLOCK_INDEX.air;
  for (const t of trees) {
    shapeTree(
      t,
      (dx, y, dz, root) => {
        const lx = t.x + dx - x0;
        const lz = t.z + dz - z0;
        if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE) return;
        const o = y * LAYER + lz * CHUNK_SIZE + lx;
        if (out[o] !== AIR) return;
        if (root && out[o - LAYER] === AIR) return; // 根は 地面の上だけ（浮かない）
        out[o] = LOG;
      },
      null,
    );
  }
  for (const t of trees) {
    const id = leafId(t);
    shapeTree(
      t,
      null,
      (dx, y, dz, snow) => {
        const lx = t.x + dx - x0;
        const lz = t.z + dz - z0;
        if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE) return;
        const o = y * LAYER + lz * CHUNK_SIZE + lx;
        if (out[o] === AIR) out[o] = snow === true ? BLOCK_INDEX.snow : id;
      },
    );
  }
}
