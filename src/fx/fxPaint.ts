import * as THREE from 'three';

/**
 * 武器ごとの エフェクト（白い 斬撃の 上の 層）の 描き係。試作 art/LEGEND-FX/proto/lib.js の Painter を 部品に した もの。
 * 三角形を 1 つの 形（BufferGeometry）に 書きためて 1 描画。毎ステップ new しない（書く 場所は 先に 作る）。
 */
export const DOT = 1 / 32;

/** 16 進（#RRGGBB）→ 線形の [r, g, b]（頂点の 色。画面では 元の 16 進に なる） */
export function rgbOf(hex: string): [number, number, number] {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
}

/** 同じ 入力に 同じ 値を 返す 乱数（0 以上 1 未満。シード付き）。試作の H と 同じ 式 */
export function hash(a: number, b?: number, c?: number, d?: number, e?: number, f?: number): number {
  // 引数は 先頭から 順に 混ぜる（rest 引数の 配列を 毎回 作らない）
  let h = mix(2166136261, a);
  if (b !== undefined) h = mix(h, b);
  if (c !== undefined) h = mix(h, c);
  if (d !== undefined) h = mix(h, d);
  if (e !== undefined) h = mix(h, e);
  if (f !== undefined) h = mix(h, f);
  return ((h >>> 0) % 100003) / 100003;
}
function mix(h: number, x: number): number {
  h ^= Math.imul(Math.round(x * 997) + 12345, 2654435761);
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  h ^= h >>> 13;
  h = Math.imul(h, 3266489917);
  h ^= h >>> 16;
  return h;
}

/** カメラの 向き（毎ステップ 1 回 更新） */
export class FxView {
  readonly eye = new THREE.Vector3();
  readonly right = new THREE.Vector3(1, 0, 0);
  readonly up = new THREE.Vector3(0, 1, 0);
  update(camera: THREE.Camera): void {
    camera.updateMatrixWorld();
    const e = camera.matrixWorld.elements;
    this.right.set(e[0]!, e[1]!, e[2]!);
    this.up.set(e[4]!, e[5]!, e[6]!);
    this.eye.set(e[12]!, e[13]!, e[14]!);
  }
}

export interface BatchOptions {
  additive: boolean;
  /** 絵（なければ 頂点の 色だけ） */
  map?: THREE.Texture | null;
  /** 深さを 見る（体の むこうの 物を かくす）。書きこみは しない */
  depthTest: boolean;
  renderOrder: number;
  maxVerts: number;
  /** 絵の 無地（白）の よこの 位置（0〜1）。絵が ある ときだけ */
  plainU?: number;
}

/** 点列（x, y, z を ならべた 配列）から カメラへ 向く 帯を 作る 時の 入れ物 */
export class FxBatch {
  readonly mesh: THREE.Mesh;
  private readonly geo = new THREE.BufferGeometry();
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly uv: Float32Array;
  private n = 0;
  private tris = 0;
  private readonly max: number;
  /** 無地の 点の 絵の よこ位置 */
  private readonly pu: number;
  // 帯の 横向き（点ごと）。作りなおさない
  private readonly sx = new Float32Array(128);
  private readonly sy = new Float32Array(128);
  private readonly sz = new Float32Array(128);

  constructor(scene: THREE.Scene, o: BatchOptions) {
    this.max = o.maxVerts;
    this.pu = o.plainU ?? 0.5;
    this.pos = new Float32Array(o.maxVerts * 3);
    this.col = new Float32Array(o.maxVerts * 4);
    this.uv = new Float32Array(o.maxVerts * 2);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('uv', new THREE.BufferAttribute(this.uv, 2).setUsage(THREE.DynamicDrawUsage));
    this.geo.setDrawRange(0, 0);
    this.mesh = new THREE.Mesh(
      this.geo,
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        map: o.map ?? null,
        transparent: true,
        depthWrite: false,
        depthTest: o.depthTest,
        side: THREE.DoubleSide,
        blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
        fog: false,
        toneMapped: false,
      }),
    );
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.renderOrder = o.renderOrder;
    scene.add(this.mesh);
  }

  begin(): void {
    this.n = 0;
  }

  end(): void {
    this.geo.setDrawRange(0, this.n);
    this.geo.getAttribute('position').needsUpdate = true;
    this.geo.getAttribute('color').needsUpdate = true;
    this.geo.getAttribute('uv').needsUpdate = true;
    this.tris = this.n / 3;
    this.mesh.visible = this.n > 0;
  }

  /** 今の 三角形の 数（窓口用） */
  triangles(): number {
    return this.tris;
  }

  visible(): boolean {
    return this.mesh.visible;
  }

  private v(x: number, y: number, z: number, c: readonly number[], a: number, u: number, w: number): void {
    if (this.n >= this.max) return;
    const i = this.n++;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.col[i * 4] = c[0]!;
    this.col[i * 4 + 1] = c[1]!;
    this.col[i * 4 + 2] = c[2]!;
    this.col[i * 4 + 3] = a;
    this.uv[i * 2] = u;
    this.uv[i * 2 + 1] = w;
  }

  /** カメラへ 向く 正方形（1 辺 size）。uv は 白い 1 点（絵が ある ときの 無地） */
  quad(view: FxView, x: number, y: number, z: number, size: number, c: readonly number[], a: number, u = 0.5, w = 0.5): void {
    const h = size / 2;
    const rx = view.right.x * h, ry = view.right.y * h, rz = view.right.z * h;
    const ux = view.up.x * h, uy = view.up.y * h, uz = view.up.z * h;
    this.v(x - rx - ux, y - ry - uy, z - rz - uz, c, a, u, w);
    this.v(x + rx - ux, y + ry - uy, z + rz - uz, c, a, u, w);
    this.v(x + rx + ux, y + ry + uy, z + rz + uz, c, a, u, w);
    this.v(x - rx - ux, y - ry - uy, z - rz - uz, c, a, u, w);
    this.v(x + rx + ux, y + ry + uy, z + rz + uz, c, a, u, w);
    this.v(x - rx + ux, y - ry + uy, z - rz + uz, c, a, u, w);
  }

  private sides(view: FxView, p: Float32Array, n: number): void {
    for (let k = 0; k < n; k++) {
      const a = k === 0 ? 0 : k - 1, b = k === n - 1 ? n - 1 : k + 1;
      const tx = p[b * 3]! - p[a * 3]!, ty = p[b * 3 + 1]! - p[a * 3 + 1]!, tz = p[b * 3 + 2]! - p[a * 3 + 2]!;
      let dx = p[k * 3]! - view.eye.x, dy = p[k * 3 + 1]! - view.eye.y, dz = p[k * 3 + 2]! - view.eye.z;
      const dl = Math.hypot(dx, dy, dz) || 1;
      dx /= dl; dy /= dl; dz /= dl;
      let sx = ty * dz - tz * dy, sy = tz * dx - tx * dz, sz = tx * dy - ty * dx;
      let sl = Math.hypot(sx, sy, sz);
      if (sl < 1e-6) { sx = view.right.x; sy = view.right.y; sz = view.right.z; sl = 1; }
      this.sx[k] = sx / sl; this.sy[k] = sy / sl; this.sz[k] = sz / sl;
    }
  }

  /**
   * 色つきの 帯（無地）。w = 幅、a = 明るさ。soft なら ふちの 明るさを 0 に（にじみ）。skip[k] が 1 の 区間は 書かない。
   * `p` は 点列（x, y, z）・n 点（128 まで）
   */
  ribbon(view: FxView, p: Float32Array, n: number, w: number | Float32Array, c: readonly number[], a: number, soft = false, skip: Uint8Array | null = null): void {
    if (n < 2) return;
    this.sides(view, p, n);
    for (let k = 0; k < n - 1; k++) {
      if (skip && skip[k]) continue;
      const k1 = k + 1;
      const h = (typeof w === 'number' ? w : w[k]!) / 2, h1 = (typeof w === 'number' ? w : w[k1]!) / 2;
      const l0x = p[k * 3]! - this.sx[k]! * h, l0y = p[k * 3 + 1]! - this.sy[k]! * h, l0z = p[k * 3 + 2]! - this.sz[k]! * h;
      const r0x = p[k * 3]! + this.sx[k]! * h, r0y = p[k * 3 + 1]! + this.sy[k]! * h, r0z = p[k * 3 + 2]! + this.sz[k]! * h;
      const l1x = p[k1 * 3]! - this.sx[k1]! * h1, l1y = p[k1 * 3 + 1]! - this.sy[k1]! * h1, l1z = p[k1 * 3 + 2]! - this.sz[k1]! * h1;
      const r1x = p[k1 * 3]! + this.sx[k1]! * h1, r1y = p[k1 * 3 + 1]! + this.sy[k1]! * h1, r1z = p[k1 * 3 + 2]! + this.sz[k1]! * h1;
      if (soft) {
        const c0x = p[k * 3]!, c0y = p[k * 3 + 1]!, c0z = p[k * 3 + 2]!, c1x = p[k1 * 3]!, c1y = p[k1 * 3 + 1]!, c1z = p[k1 * 3 + 2]!;
        this.v(l0x, l0y, l0z, c, 0, this.pu, 0.5); this.v(c0x, c0y, c0z, c, a, this.pu, 0.5); this.v(l1x, l1y, l1z, c, 0, this.pu, 0.5);
        this.v(c0x, c0y, c0z, c, a, this.pu, 0.5); this.v(c1x, c1y, c1z, c, a, this.pu, 0.5); this.v(l1x, l1y, l1z, c, 0, this.pu, 0.5);
        this.v(c0x, c0y, c0z, c, a, this.pu, 0.5); this.v(r0x, r0y, r0z, c, 0, this.pu, 0.5); this.v(c1x, c1y, c1z, c, a, this.pu, 0.5);
        this.v(r0x, r0y, r0z, c, 0, this.pu, 0.5); this.v(r1x, r1y, r1z, c, 0, this.pu, 0.5); this.v(c1x, c1y, c1z, c, a, this.pu, 0.5);
      } else {
        this.v(l0x, l0y, l0z, c, a, this.pu, 0.5); this.v(r0x, r0y, r0z, c, a, this.pu, 0.5); this.v(l1x, l1y, l1z, c, a, this.pu, 0.5);
        this.v(r0x, r0y, r0z, c, a, this.pu, 0.5); this.v(r1x, r1y, r1z, c, a, this.pu, 0.5); this.v(l1x, l1y, l1z, c, a, this.pu, 0.5);
      }
    }
  }

  /**
   * 絵つきの 帯。width[k]・alpha[k] は 点ごと。絵の よこ = ながれ（u0 から u0 + rep）・たて = vLo〜vHi（絵の 上下の 範囲）
   */
  strip(view: FxView, p: Float32Array, n: number, width: Float32Array, alpha: Float32Array, c: readonly number[], vLo: number, vHi: number, rep: number, u0: number): void {
    if (n < 2) return;
    this.sides(view, p, n);
    for (let k = 0; k < n - 1; k++) {
      const k1 = k + 1;
      const h0 = width[k]! / 2, h1 = width[k1]! / 2;
      const ua = u0 + (k / (n - 1)) * rep, ub = u0 + (k1 / (n - 1)) * rep;
      const a0 = alpha[k]!, a1 = alpha[k1]!;
      const l0x = p[k * 3]! - this.sx[k]! * h0, l0y = p[k * 3 + 1]! - this.sy[k]! * h0, l0z = p[k * 3 + 2]! - this.sz[k]! * h0;
      const r0x = p[k * 3]! + this.sx[k]! * h0, r0y = p[k * 3 + 1]! + this.sy[k]! * h0, r0z = p[k * 3 + 2]! + this.sz[k]! * h0;
      const l1x = p[k1 * 3]! - this.sx[k1]! * h1, l1y = p[k1 * 3 + 1]! - this.sy[k1]! * h1, l1z = p[k1 * 3 + 2]! - this.sz[k1]! * h1;
      const r1x = p[k1 * 3]! + this.sx[k1]! * h1, r1y = p[k1 * 3 + 1]! + this.sy[k1]! * h1, r1z = p[k1 * 3 + 2]! + this.sz[k1]! * h1;
      this.v(l0x, l0y, l0z, c, a0, ua, vLo); this.v(r0x, r0y, r0z, c, a0, ua, vHi); this.v(l1x, l1y, l1z, c, a1, ub, vLo);
      this.v(r0x, r0y, r0z, c, a0, ua, vHi); this.v(r1x, r1y, r1z, c, a1, ub, vHi); this.v(l1x, l1y, l1z, c, a1, ub, vLo);
    }
  }

  /**
   * 一般の 帯。w・off（横ずれ）・a は 数 か 点ごとの 配列。cols は 1 色 か 点ごとの 色の ならび。
   * soft なら ふちの 明るさを 0 に
   */
  band(view: FxView, p: Float32Array, n: number, w: number | Float32Array, off: number | Float32Array, cols: readonly number[] | readonly (readonly number[])[], a: number | Float32Array, soft = false): void {
    if (n < 2) return;
    this.sides(view, p, n);
    const multi = Array.isArray(cols[0]);
    const colAt = (k: number): readonly number[] => (multi ? ((cols as readonly (readonly number[])[])[Math.min(k, (cols as readonly (readonly number[])[]).length - 1)]!) : (cols as readonly number[]));
    const g = (v: number | Float32Array, k: number): number => (typeof v === 'number' ? v : v[k]!);
    for (let k = 0; k < n - 1; k++) {
      const k1 = k + 1;
      const o0 = g(off, k), o1 = g(off, k1), h0 = g(w, k) / 2, h1 = g(w, k1) / 2;
      const c0 = colAt(k), c1 = colAt(k1), a0 = g(a, k), a1 = g(a, k1);
      const m0x = p[k * 3]! + this.sx[k]! * o0, m0y = p[k * 3 + 1]! + this.sy[k]! * o0, m0z = p[k * 3 + 2]! + this.sz[k]! * o0;
      const m1x = p[k1 * 3]! + this.sx[k1]! * o1, m1y = p[k1 * 3 + 1]! + this.sy[k1]! * o1, m1z = p[k1 * 3 + 2]! + this.sz[k1]! * o1;
      const l0x = m0x - this.sx[k]! * h0, l0y = m0y - this.sy[k]! * h0, l0z = m0z - this.sz[k]! * h0;
      const r0x = m0x + this.sx[k]! * h0, r0y = m0y + this.sy[k]! * h0, r0z = m0z + this.sz[k]! * h0;
      const l1x = m1x - this.sx[k1]! * h1, l1y = m1y - this.sy[k1]! * h1, l1z = m1z - this.sz[k1]! * h1;
      const r1x = m1x + this.sx[k1]! * h1, r1y = m1y + this.sy[k1]! * h1, r1z = m1z + this.sz[k1]! * h1;
      const e0 = soft ? 0 : a0, e1 = soft ? 0 : a1;
      if (soft) {
        this.v(l0x, l0y, l0z, c0, e0, this.pu, 0.5); this.v(m0x, m0y, m0z, c0, a0, this.pu, 0.5); this.v(l1x, l1y, l1z, c1, e1, this.pu, 0.5);
        this.v(m0x, m0y, m0z, c0, a0, this.pu, 0.5); this.v(m1x, m1y, m1z, c1, a1, this.pu, 0.5); this.v(l1x, l1y, l1z, c1, e1, this.pu, 0.5);
        this.v(m0x, m0y, m0z, c0, a0, this.pu, 0.5); this.v(r0x, r0y, r0z, c0, e0, this.pu, 0.5); this.v(m1x, m1y, m1z, c1, a1, this.pu, 0.5);
        this.v(r0x, r0y, r0z, c0, e0, this.pu, 0.5); this.v(r1x, r1y, r1z, c1, e1, this.pu, 0.5); this.v(m1x, m1y, m1z, c1, a1, this.pu, 0.5);
      } else {
        this.v(l0x, l0y, l0z, c0, a0, this.pu, 0.5); this.v(r0x, r0y, r0z, c0, a0, this.pu, 0.5); this.v(l1x, l1y, l1z, c1, a1, this.pu, 0.5);
        this.v(r0x, r0y, r0z, c0, a0, this.pu, 0.5); this.v(r1x, r1y, r1z, c1, a1, this.pu, 0.5); this.v(l1x, l1y, l1z, c1, a1, this.pu, 0.5);
      }
    }
  }

  /** カメラへ 向く 円（扇形 n 枚）。soft なら ふちの 明るさ 0 */
  disc(view: FxView, x: number, y: number, z: number, r: number, c: readonly number[], a: number, soft = false, n = 10): void {
    for (let k = 0; k < n; k++) {
      const t0 = (k / n) * 6.2832, t1 = ((k + 1) / n) * 6.2832;
      const c0 = Math.cos(t0) * r, s0 = Math.sin(t0) * r, c1 = Math.cos(t1) * r, s1 = Math.sin(t1) * r;
      this.v(x, y, z, c, a, this.pu, 0.5);
      this.v(x + view.right.x * c0 + view.up.x * s0, y + view.right.y * c0 + view.up.y * s0, z + view.right.z * c0 + view.up.z * s0, c, soft ? 0 : a, this.pu, 0.5);
      this.v(x + view.right.x * c1 + view.up.x * s1, y + view.right.y * c1 + view.up.y * s1, z + view.right.z * c1 + view.up.z * s1, c, soft ? 0 : a, this.pu, 0.5);
    }
  }

  /**
   * 読みこみ中に 材質（描画の プログラム）を 先に 作る。最初の 描画で かくつかない。
   * 一瞬 見える 形に して compile して もどす（slashFx.warmUp と 同じ やり方）
   */
  warmUp(renderer: THREE.WebGLRenderer, camera: THREE.Camera, scene: THREE.Scene): void {
    const was = this.mesh.visible;
    this.mesh.visible = true;
    renderer.compile(scene, camera);
    const m = this.mesh.material as THREE.MeshBasicMaterial;
    if (m.map) renderer.initTexture(m.map);
    this.mesh.visible = was;
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.mesh);
    this.geo.dispose();
    const m = this.mesh.material as THREE.MeshBasicMaterial;
    m.map?.dispose();
    m.dispose();
  }
}

/** 点列の 入れ物（x, y, z）。1 つの 帯は 128 点まで */
export const makePts = (n = 64): Float32Array => new Float32Array(n * 3);

/** 体の 向き u（度。北 0° から 時計まわり）での わざの 局所 → 世界。局所の x = 体の 左（試作と 同じ: 右を −x に）・y = 上・z = 前 */
export interface LocalFrame {
  bx: number;
  by: number;
  bz: number;
  fx: number;
  fz: number;
  rx: number;
  rz: number;
}
export function frameOf(uDeg: number, out: LocalFrame): LocalFrame {
  const u = (uDeg * Math.PI) / 180;
  out.fx = Math.sin(u);
  out.fz = -Math.cos(u);
  out.rx = Math.cos(u);
  out.rz = Math.sin(u);
  return out;
}
export const newFrame = (): LocalFrame => ({ bx: 0, by: 0, bz: 0, fx: 0, fz: -1, rx: 1, rz: 0 });
export function toWorld(f: LocalFrame, lx: number, ly: number, lz: number, out: Float32Array, i: number): void {
  out[i * 3] = f.bx - lx * f.rx + lz * f.fx;
  out[i * 3 + 1] = f.by + ly;
  out[i * 3 + 2] = f.bz - lx * f.rz + lz * f.fz;
}
