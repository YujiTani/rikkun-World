import * as THREE from 'three';
import { V, type Part, type Prim, type V3 } from './chickenSpec';

/**
 * 形の データ（`Part[]`）→ 小キューブ（1/16 ブロック）→ 同じ色・同じ平面の 面を 四角に つなぐ（greedy）→
 * 骨つきの 1 メッシュ。部品ごとに 骨 1 本、頂点は その 1 本 だけ に 付く（重み 1）。曲がる 皮は 作らない。
 * DOM なしで node でも 動く（ユニットで 三角形の 数を はかる）。乱数なし。
 */

export interface BuiltModel {
  /** 体（色つき・骨つき） */
  geo: THREE.BufferGeometry;
  /** ねらい中の ふちどり 用（0.6 点 ふくらませた 形。目は のぞく） */
  hull: THREE.BufferGeometry;
  /** 骨の 名前（部品の 順） */
  names: string[];
  /** 骨ごとの 位置（親から の 差。ブロック） */
  rest: V3[];
  /** 骨ごとの 親の 番号（なければ −1） */
  parents: number[];
  tris: number;
  hullTris: number;
  perPart: Record<string, number>;
}

function inPrim(p: Prim, x: number, y: number, z: number): boolean {
  if (p.k === 'fn') return x >= p.a[0] && x <= p.b[0] && y >= p.a[1] && y <= p.b[1] && z >= p.a[2] && z <= p.b[2] && p.f(x, y, z) >= 0;
  if (p.k === 'ell') {
    const dx = Math.abs(x - p.c[0]) / p.r[0];
    const dy = Math.abs(y - p.c[1]) / p.r[1];
    const dz = Math.abs(z - p.c[2]) / p.r[2];
    const e = p.p ?? 2;
    return dx ** e + dy ** e + dz ** e <= 1;
  }
  if (p.k === 'box') return x >= p.a[0] && x <= p.b[0] && y >= p.a[1] && y <= p.b[1] && z >= p.a[2] && z <= p.b[2];
  const dx = (x - p.c[0]) / p.ro[0];
  const dy = (y - p.c[1]) / p.ro[1];
  const dz = (z - p.c[2]) / p.ro[2];
  return dx * dx + dy * dy + dz * dz <= 1 && Math.hypot(x - p.c[0], z - p.c[2]) >= p.ri;
}

const isPaint = (p: Prim): boolean => p.k === 'box' && !!p.paint;

interface Out {
  pos: number[];
  nor: number[];
  col: number[];
  skin: number[];
  idx: number[];
}
const newOut = (): Out => ({ pos: [], nor: [], col: [], skin: [], idx: [] });

function inflate(prims: Prim[], d: number): Prim[] {
  const out: Prim[] = [];
  for (const q of prims) {
    if (q.k === 'ell') out.push({ ...q, r: [q.r[0] + d, q.r[1] + d, q.r[2] + d] });
    else if (q.k === 'box' && !q.paint) out.push({ ...q, a: [q.a[0] - d, q.a[1] - d, q.a[2] - d], b: [q.b[0] + d, q.b[1] + d, q.b[2] + d] });
  }
  return out;
}

/** 部品を 1/16 の 小キューブに して、見える 面だけ を 四角に つなぎ、`out` へ 足す */
function meshPart(prims: Prim[], solid: ((x: number, y: number, z: number) => boolean) | null, out: Out, bone: number): void {
  const lo: V3 = [1e9, 1e9, 1e9];
  const hi: V3 = [-1e9, -1e9, -1e9];
  for (const p of prims) {
    if (isPaint(p)) continue;
    let a: number[];
    let b: number[];
    if (p.k === 'fn') {
      a = p.a;
      b = p.b;
    } else if (p.k === 'ell') {
      a = p.c.map((c, i) => c - p.r[i]);
      b = p.c.map((c, i) => c + p.r[i]);
    } else if (p.k === 'ring') {
      a = p.c.map((c, i) => c - p.ro[i]);
      b = p.c.map((c, i) => c + p.ro[i]);
    } else {
      a = p.a;
      b = p.b;
    }
    for (let i = 0; i < 3; i++) {
      lo[i] = Math.min(lo[i], Math.floor(a[i]) - 1);
      hi[i] = Math.max(hi[i], Math.ceil(b[i]) + 1);
    }
  }
  if (lo[0] > hi[0]) return;
  const n: V3 = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
  const grid = new Int32Array(n[0] * n[1] * n[2]);
  const at = (x: number, y: number, z: number): number =>
    x < 0 || y < 0 || z < 0 || x >= n[0] || y >= n[1] || z >= n[2] ? 0 : grid[(x * n[1] + y) * n[2] + z];
  for (let x = 0; x < n[0]; x++) {
    for (let y = 0; y < n[1]; y++) {
      for (let z = 0; z < n[2]; z++) {
        const cx = lo[0] + x + 0.5;
        const cy = lo[1] + y + 0.5;
        const cz = lo[2] + z + 0.5;
        let col = -1;
        for (const p of prims) {
          if (isPaint(p) && col < 0) continue; // 「ぬる」箱は すでに ある 所 の 色 だけ かえる
          if (inPrim(p, cx, cy, cz)) col = p.k === 'fn' ? p.f(cx, cy, cz) : p.col;
        }
        if (col >= 0) grid[(x * n[1] + y) * n[2] + z] = col + 1;
      }
    }
  }
  const c3 = new THREE.Color();
  for (let d = 0; d < 3; d++) {
    const u = (d + 1) % 3;
    const v = (d + 2) % 3;
    for (const s of [1, -1]) {
      for (let i = 0; i < n[d]; i++) {
        const mask = new Int32Array(n[u] * n[v]);
        for (let a = 0; a < n[u]; a++) {
          for (let b = 0; b < n[v]; b++) {
            const p = [0, 0, 0];
            p[d] = i;
            p[u] = a;
            p[v] = b;
            const cur = at(p[0], p[1], p[2]);
            if (!cur) continue;
            p[d] = i + s;
            if (at(p[0], p[1], p[2])) continue;
            if (solid && solid(p[0] + lo[0] + 0.5, p[1] + lo[1] + 0.5, p[2] + lo[2] + 0.5)) continue;
            mask[a * n[v] + b] = cur;
          }
        }
        for (let a = 0; a < n[u]; a++) {
          for (let b = 0; b < n[v]; b++) {
            const m = mask[a * n[v] + b];
            if (!m) continue;
            let h = 1;
            while (b + h < n[v] && mask[a * n[v] + b + h] === m) h++;
            let w = 1;
            grow: while (a + w < n[u]) {
              for (let k = 0; k < h; k++) if (mask[(a + w) * n[v] + b + k] !== m) break grow;
              w++;
            }
            for (let x = 0; x < w; x++) for (let k = 0; k < h; k++) mask[(a + x) * n[v] + b + k] = 0;
            const plane = i + (s > 0 ? 1 : 0);
            const corner = (da: number, db: number): V3 => {
              const p = [0, 0, 0];
              p[d] = plane + lo[d];
              p[u] = a + da + lo[u];
              p[v] = b + db + lo[v];
              return [p[0] * V, p[1] * V, p[2] * V];
            };
            const q = [corner(0, 0), corner(w, 0), corner(w, h), corner(0, h)];
            const nrm: V3 = [0, 0, 0];
            nrm[d] = s;
            // u × v = d なので s > 0 なら この順で 表
            const order = s > 0 ? [0, 1, 2, 3] : [0, 3, 2, 1];
            const base = out.pos.length / 3;
            c3.setHex(m - 1);
            for (const o of order) {
              out.pos.push(q[o][0], q[o][1], q[o][2]);
              out.nor.push(nrm[0], nrm[1], nrm[2]);
              out.col.push(c3.r, c3.g, c3.b);
              out.skin.push(bone, 0, 0, 0);
            }
            out.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
          }
        }
      }
    }
  }
}

function toGeometry(a: Out): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(a.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(a.nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(a.col, 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(a.skin, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(a.skin.map((_, k) => (k % 4 === 0 ? 1 : 0)), 4));
  g.setIndex(a.idx);
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

export function buildModel(parts: readonly Part[]): BuiltModel {
  const names = parts.map((p) => p.name);
  const o = newOut();
  const h = newOut();
  const perPart: Record<string, number> = {};
  parts.forEach((p, i) => {
    const before = o.idx.length;
    const hid = (p.hideIn ?? []).map((n) => parts.find((q) => q.name === n)).filter((q): q is Part => !!q);
    const solid = hid.length ? (x: number, y: number, z: number): boolean => hid.some((q) => q.prims.some((pr) => !isPaint(pr) && inPrim(pr, x, y, z))) : null;
    meshPart(p.prims, solid, o, i);
    perPart[p.name] = (o.idx.length - before) / 3;
    if (p.name !== 'eyes') meshPart(inflate(p.prims, 0.6), null, h, i);
  });
  const piv = new Map(parts.map((p) => [p.name, p.pivot]));
  const rest: V3[] = parts.map((p) => {
    const par = p.parent ? (piv.get(p.parent) ?? [0, 0, 0]) : [0, 0, 0];
    return [(p.pivot[0] - par[0]) * V, (p.pivot[1] - par[1]) * V, (p.pivot[2] - par[2]) * V];
  });
  return {
    geo: toGeometry(o),
    hull: toGeometry(h),
    names,
    rest,
    parents: parts.map((p) => (p.parent ? names.indexOf(p.parent) : -1)),
    tris: o.idx.length / 3,
    hullTris: h.idx.length / 3,
    perPart,
  };
}

const cache = new Map<string, BuiltModel>();
/** 形の 名前（'chicken' / 'chicken:mark'）ごとに 1 回 だけ 作る */
export function cachedModel(key: string, make: () => Part[]): BuiltModel {
  let m = cache.get(key);
  if (!m) {
    m = buildModel(make());
    cache.set(key, m);
  }
  return m;
}
