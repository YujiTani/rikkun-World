/**
 * #293 試作（開発サーバーだけ）: 大きい がしゃどくろ（第一形態）の 見た目 と 登れる 当たり。
 * `?proto=gashaBig` のときだけ main.ts から 読まれる。見た目は design-v1 の C 案（黒の セーラー ＋ ピンクの スカーフ）を 箱で 作った もの。
 * ・描画回数を へらす ため、箱は ぜんぶ まとめて（部分ごとに 1 つの メッシュ）。ゲームに 光源は ないので MeshBasicMaterial ＋ 頂点の 色で、面の 向きごとに 明るさを かえて 立体に 見せる。
 * ・当たりは 見えない 箱（OBB）。プレイヤーの 当たりは ブロック（isSolidForPlayer）でしか 当たらないので、箱を ブロックの マスに 直して 「追加の 固いマス」として 足す（deps.addPlayerSolid）。
 * ・動かない（段 3 で うでを 動かす）。目は ふだん 白、`__gashaBig.angry(true)` で 赤。
 * 数は ぜんぶ gashaBigTuning.ts。
 */
import {
  BufferGeometry, Color, CylinderGeometry, DoubleSide, Euler, ExtrudeGeometry, Float32BufferAttribute, Group, Matrix3, Matrix4,
  Mesh, MeshBasicMaterial, OctahedronGeometry, Path, Quaternion, Shape, Vector3, type Camera, type Scene,
} from 'three';
import { TUNE as T, applyTune, applyTuneFromUrl } from './gashaBigTuning';

export interface GashaBigDeps {
  scene: Scene;
  camera: Camera;
  /** プレイヤーの いま の 位置と 向き（度） */
  player(): { x: number; y: number; z: number; yawDeg: number };
  /** 地面の いちばん 上の ブロックの 高さ（立つ 面は +1） */
  groundY(x: number, z: number): number;
  /** プレイヤーの 当たりに「追加の 固いマス」を 足す（isSolidForPlayer に 重ねる） */
  addPlayerSolid(fn: (x: number, y: number, z: number) => boolean): void;
}

// ---------------------------------------------------------------- 色と 面の 明るさ
const BONE = 0xfff6e4, BONE_D = 0xf0e2c6, BONE_DK = 0xd9c8a4, DARK = 0x3a2a26, MOSS = [0x6dbe45, 0x58a83a, 0x86cf5a];
const INK = 0x2a1e1a;
const HAIR = 0x23212b; // 少女と おなじ 黒
const C = { top: 0x2a2a34, topDark: 0x1c1c25, stripe: 0xf27aa8, scarf: 0xf27aa8, scarf2: 0xd85a8c, band: 0x8e62d8, band2: 0xc3a4f2, pendant: 0xffd84a, beads: [0xf27aa8, 0xc3a4f2] as const };
const nailColor = (i: number) => (i % 2 ? 0xffd84a : 0xf27aa8);

/** 光は 左・上・手前から。面の 向きで 0.55〜1.0 */
const LIGHT = new Vector3(-0.35, 0.8, 0.5).normalize();
function shade(nx: number, ny: number, nz: number): number {
  const l = Math.max(0, nx * LIGHT.x + ny * LIGHT.y + nz * LIGHT.z);
  return 0.56 + 0.44 * l * 1.15;
}

const vec = (x: number, y: number, z: number) => new Vector3(x, y, z);
const UP = vec(0, 1, 0);

// ---------------------------------------------------------------- 箱を ためて まとめる
type BucketName = 'body' | 'head' | 'armL' | 'armR' | 'bright' | 'eyes' | 'eyeHalo' | 'brow' | 'glow' | 'glass';
const SHADED: Record<BucketName, boolean> = { body: true, head: true, armL: true, armR: true, bright: false, eyes: false, eyeHalo: false, brow: true, glow: false, glass: false };
const RGBA = new Set<BucketName>(['glow', 'glass']);

class Bucket {
  pos: number[] = [];
  col: number[] = [];
  constructor(readonly rgba: boolean) {}
}

export interface Hit {
  name: string;
  /** もとの 座標（からだ ぜんたいの 座標）での 中心・3 本の 軸（長さ 1）・はんぶんの 大きさ */
  c: Vector3;
  axes: [Vector3, Vector3, Vector3];
  half: [number, number, number];
}

const tmpM = new Matrix4();
const tmpN = new Matrix3();
const tmpP = new Vector3();
const tmpV = new Vector3();
const tmpC = new Color();

/** 面（4 つの かど）。法線 と 4 つの かど（-0.5〜0.5） */
const FACES: { n: [number, number, number]; v: [number, number, number][] }[] = [
  { n: [1, 0, 0], v: [[0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [0.5, 0.5, 0.5], [0.5, -0.5, 0.5]] },
  { n: [-1, 0, 0], v: [[-0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [-0.5, 0.5, -0.5], [-0.5, -0.5, -0.5]] },
  { n: [0, 1, 0], v: [[-0.5, 0.5, -0.5], [-0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [0.5, 0.5, -0.5]] },
  { n: [0, -1, 0], v: [[-0.5, -0.5, 0.5], [-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5]] },
  { n: [0, 0, 1], v: [[-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5]] },
  { n: [0, 0, -1], v: [[0.5, -0.5, -0.5], [-0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5]] },
];

class Builder {
  readonly buckets = new Map<BucketName, Bucket>();
  readonly hits: Hit[] = [];
  bucket(n: BucketName): Bucket {
    let b = this.buckets.get(n);
    if (!b) { b = new Bucket(RGBA.has(n)); this.buckets.set(n, b); }
    return b;
  }
  root(bucket: BucketName): Node { return new Node(this, bucket, new Matrix4()); }

  /** 頂点を 1 つ ためる（p は もとの 座標、n は 法線、alpha は 半透明の ときだけ） */
  push(bucket: BucketName, p: Vector3, n: Vector3, color: number, alpha = 1, flat?: number): void {
    const b = this.bucket(bucket);
    b.pos.push(p.x, p.y, p.z);
    tmpC.setHex(color);
    const f = flat ?? (SHADED[bucket] ? shade(n.x, n.y, n.z) : 1);
    if (b.rgba) b.col.push(tmpC.r * f, tmpC.g * f, tmpC.b * f, alpha);
    else b.col.push(tmpC.r * f, tmpC.g * f, tmpC.b * f);
  }
}

class Node {
  constructor(readonly b: Builder, readonly bucket: BucketName, readonly m: Matrix4) {}

  group(x: number, y: number, z: number, rot?: [number, number, number], scale?: [number, number, number], order: 'XYZ' | 'YXZ' = 'XYZ', bucket?: BucketName): Node {
    const q = new Quaternion().setFromEuler(new Euler(rot?.[0] ?? 0, rot?.[1] ?? 0, rot?.[2] ?? 0, order));
    const local = new Matrix4().compose(vec(x, y, z), q, scale ? vec(...scale) : vec(1, 1, 1));
    return new Node(this.b, bucket ?? this.bucket, this.m.clone().multiply(local));
  }

  /** 箱（中心 x,y,z、大きさ w,h,d、回転 rot） */
  box(w: number, h: number, d: number, x: number, y: number, z: number, color: number, rot?: [number, number, number], bucket?: BucketName): void {
    const q = rot ? new Quaternion().setFromEuler(new Euler(rot[0], rot[1], rot[2], 'XYZ')) : new Quaternion();
    const M = tmpM.copy(this.m).multiply(new Matrix4().compose(vec(x, y, z), q, vec(w, h, d)));
    this.quads(M, color, bucket ?? this.bucket);
  }

  quads(M: Matrix4, color: number, bucket: BucketName, alpha = 1, flat?: number): void {
    const nm = tmpN.getNormalMatrix(M);
    const n = tmpV;
    const p = [vec(0, 0, 0), vec(0, 0, 0), vec(0, 0, 0), vec(0, 0, 0)];
    for (const f of FACES) {
      n.set(f.n[0], f.n[1], f.n[2]).applyMatrix3(nm).normalize();
      for (let i = 0; i < 4; i++) p[i]!.set(f.v[i]![0], f.v[i]![1], f.v[i]![2]).applyMatrix4(M);
      const nn = n.clone();
      for (const i of [0, 1, 2, 0, 2, 3]) this.b.push(bucket, p[i]!, nn, color, alpha, flat);
    }
  }

  /** 半透明・光る 箱（影なし） */
  glowBox(w: number, h: number, d: number, x: number, y: number, z: number, color: number, alpha: number, rot?: [number, number, number]): void {
    const q = rot ? new Quaternion().setFromEuler(new Euler(rot[0], rot[1], rot[2], 'XYZ')) : new Quaternion();
    const M = tmpM.copy(this.m).multiply(new Matrix4().compose(vec(x, y, z), q, vec(w, h, d)));
    this.quads(M, color, 'glow', alpha, 1);
  }

  /** 3 つの 辺で できた 形（Extrude・Cylinder など）を 入れる。local は 形の 中の 変形 */
  geom(g: BufferGeometry, color: number, local?: Matrix4, bucket?: BucketName, alpha = 1, shadeFn?: (n: Vector3) => number): void {
    const gg = g.index ? g.toNonIndexed() : g;
    const M = tmpM.copy(this.m);
    if (local) M.multiply(local);
    const nm = new Matrix3().getNormalMatrix(M);
    const pa = gg.getAttribute('position'), na = gg.getAttribute('normal');
    const bk = bucket ?? this.bucket;
    for (let i = 0; i < pa.count; i++) {
      tmpP.fromBufferAttribute(pa, i).applyMatrix4(M);
      const n = vec(na.getX(i), na.getY(i), na.getZ(i)).applyMatrix3(nm).normalize();
      this.b.push(bk, tmpP, n, color, alpha, shadeFn ? shadeFn(n) : undefined);
    }
  }

  /** 線の ように のびた 箱（a → b。from〜to で 一部だけ）。幅 w は 左右、厚み h は 上下 */
  seg(a: Vector3, b: Vector3, w: number, h: number, color: number, from = 0, to = 1, bucket?: BucketName): void {
    const A = a.clone().lerp(b, from), B = a.clone().lerp(b, to);
    const d = B.clone().sub(A);
    const len = d.length();
    const { q } = frameOf(d.clone().normalize());
    const mid = A.clone().add(B).multiplyScalar(0.5);
    const M = tmpM.copy(this.m).multiply(new Matrix4().compose(mid, q, vec(w, h, len)));
    this.quads(M, color, bucket ?? this.bucket);
  }

  /** 当たりの 箱を 足す（この 場所の 箱と おなじ 大きさ・向き）。親に 左右で ちがう 拡大が ある 所では 使わない */
  hit(name: string, w: number, h: number, d: number, x: number, y: number, z: number, rot?: [number, number, number]): void {
    const q = rot ? new Quaternion().setFromEuler(new Euler(rot[0], rot[1], rot[2], 'XYZ')) : new Quaternion();
    const M = this.m.clone().multiply(new Matrix4().compose(vec(x, y, z), q, vec(1, 1, 1)));
    const pos = new Vector3(), qq = new Quaternion(), sc = new Vector3();
    M.decompose(pos, qq, sc);
    this.b.hits.push({
      name, c: pos,
      axes: [vec(1, 0, 0).applyQuaternion(qq), vec(0, 1, 0).applyQuaternion(qq), vec(0, 0, 1).applyQuaternion(qq)],
      half: [(w * sc.x) / 2, (h * sc.y) / 2, (d * sc.z) / 2],
    });
  }
}

/** 向き u の 線に 沿った 箱の 回転（幅 = 横、厚み = 上、長さ = u）。横は 世界の 上と u に 垂直 */
function frameOf(u: Vector3): { q: Quaternion; side: Vector3; n: Vector3 } {
  let side = new Vector3().crossVectors(UP, u);
  if (side.lengthSq() < 1e-6) side = vec(1, 0, 0);
  side.normalize();
  const n = new Vector3().crossVectors(u, side).normalize();
  const q = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(side, n, u));
  return { q, side, n };
}

// ---------------------------------------------------------------- 見本の 道具（design-v1 から）
function makeRnd(seed: number): () => number {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

const octShape = (r: number, hole?: number): Shape => {
  const sh = new Shape();
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + Math.PI / 8; const px = Math.sin(a) * r, py = Math.cos(a) * r; if (i) sh.lineTo(px, py); else sh.moveTo(px, py); }
  if (hole !== undefined) {
    const ho = new Path(); const hh = hole / 2;
    ho.moveTo(-hh, -hh); ho.lineTo(-hh, hh); ho.lineTo(hh, hh); ho.lineTo(hh, -hh); ho.lineTo(-hh, -hh);
    sh.holes.push(ho);
  }
  return sh;
};

// ---------------------------------------------------------------- すりガラスの 渦雲
/** 雲の 平面の 形（長さ L × はば W の 角の 丸い 形。しっぽ つき）。上の 面は これを そのまま 使う */
function cloudOutline(L: number, W: number, tail: number, bump: number): Shape {
  const N = 48, sh = new Shape();
  for (let k = 0; k < N; k++) {
    const th = (k / N) * Math.PI * 2;
    const c = Math.cos(th), s = Math.sin(th);
    const bu = 1 + bump * Math.sin(th * 5 + 1.3);
    let x = (L / 2) * Math.sign(c) * Math.pow(Math.abs(c), 0.5) * bu;
    const z = (W / 2) * Math.sign(s) * Math.pow(Math.abs(s), 0.5) * bu;
    if (tail > 0) { const d = Math.atan2(Math.sin(th - Math.PI), Math.cos(th - Math.PI)); x -= tail * Math.exp(-((d / 0.2) ** 2)) * (c < 0 ? 1 : 0); }
    if (k) sh.lineTo(x, z); else sh.moveTo(x, z);
  }
  return sh;
}

interface CloudOpts { a: Vector3; b: Vector3; width: number; thick: number; hitFill: number; hitThick: number; tail?: number; swirls?: number; name: string; rnd: () => number }

/** 雲を 1 つ。a→b は 上の 面の まんなかの 線（あしばの 長さ）。見た目は すりガラス、当たりは 箱 */
function cloud(b: Builder, o: CloudOpts): void {
  const u = o.b.clone().sub(o.a);
  const len = u.length();
  u.normalize();
  const { side, n } = frameOf(u);
  const g = T.glass;
  const bt = 0.7, bs = 0.8;
  const tail = o.tail ?? 0;
  const geo = new ExtrudeGeometry(cloudOutline(len, o.width, tail, 0.035), { depth: Math.max(0.2, o.thick - 2 * bt), bevelEnabled: true, bevelThickness: bt, bevelSize: bs, bevelSegments: 2, curveSegments: 1 });
  // 形の x → u、y → 横、z（おしだし）→ 上。上の 面が a→b の 線に のるように ずらす
  const mid = o.a.clone().add(o.b).multiplyScalar(0.5);
  const R = new Matrix4().makeBasis(u, side, n);
  const local = new Matrix4().makeTranslation(mid.x, mid.y, mid.z).multiply(R).multiply(new Matrix4().makeTranslation(0, 0, -(o.thick - bt)));
  const nUp = n.clone();
  // 頂点ごとに 色・濃さ: 上 = alphaTop、横 = alphaSide（ふちが 明るい）、下 = alphaBottom
  const gg = geo.index ? geo.toNonIndexed() : geo;
  const M = local;
  const nm = new Matrix3().getNormalMatrix(M);
  const pa = gg.getAttribute('position'), na = gg.getAttribute('normal');
  for (let i = 0; i < pa.count; i++) {
    tmpP.fromBufferAttribute(pa, i).applyMatrix4(M);
    const nn = vec(na.getX(i), na.getY(i), na.getZ(i)).applyMatrix3(nm).normalize();
    const t = nn.dot(nUp);
    const alpha = t >= 0 ? g.alphaSide + (g.alphaTop - g.alphaSide) * t : g.alphaSide + (g.alphaBottom - g.alphaSide) * -t;
    tmpC.setHex(g.color).lerp(new Color(0xffffff), (1 - Math.abs(t)) * 0.7);
    const bk = b.bucket('glass');
    bk.pos.push(tmpP.x, tmpP.y, tmpP.z);
    bk.col.push(tmpC.r, tmpC.g, tmpC.b, alpha);
  }
  geo.dispose();
  // うずまきの 線（上の 面に のる 細い 帯。らせん）
  const sw = o.swirls ?? 2;
  const swirlNode = new Node(b, 'glass', new Matrix4());
  const lineC = g.swirlColor;
  for (let k = 0; k < sw; k++) {
    const f = (k + 0.5) / sw;
    const cu = (f - 0.5) * len * 0.78, cs = (k % 2 ? -1 : 1) * o.width * 0.05;
    const R0 = Math.min(o.width * 0.34, len / (sw * 2.4));
    let prev: Vector3 | null = null;
    const turns = 2.3, steps = 22, dir = k % 2 ? -1 : 1;
    for (let i = 0; i <= steps; i++) {
      const th = (i / steps) * turns * Math.PI * 2;
      const r = R0 * (0.12 + 0.88 * (i / steps));
      const pu = cu + Math.cos(th * dir + k) * r, ps = cs + Math.sin(th * dir + k) * r;
      const pt = mid.clone().addScaledVector(u, pu).addScaledVector(side, ps).addScaledVector(n, 0.1);
      if (prev) {
        const d = pt.clone().sub(prev);
        const L2 = d.length();
        const { q } = frameOf(d.clone().normalize());
        const MM = new Matrix4().compose(prev.clone().add(pt).multiplyScalar(0.5), q, vec(0.55, 0.12, L2 + 0.25));
        swirlNode.quads(MM, lineC, 'glass', 0.92, 1);
      }
      prev = pt;
    }
  }
  // 当たり: 長さ方向は a→b いっぱい、はばは hitFill、あつさは hitThick（上の 面が 見た目と そろう）
  const hc = mid.clone().addScaledVector(n, -o.hitThick / 2);
  b.hits.push({ name: o.name, c: hc, axes: [u.clone(), n.clone(), side.clone()], half: [len / 2, o.hitThick / 2, (o.width * o.hitFill) / 2] });
}

// ---------------------------------------------------------------- 本体
export interface BigModel {
  group: Group;
  hits: Hit[];
  eyes: MeshBasicMaterial;
  eyeHalo: MeshBasicMaterial;
  brow: Mesh;
  /** もとの 座標 → ブロック の 拡大 */
  scale: number;
  /** 手の 先（もとの 座標。地面の 高さを 決める 点） */
  groundPts: Vector3[];
  /** 頭の 位置（もとの 座標） */
  head: Vector3;
  meshes: number;
}

export function buildBig(): BigModel {
  const b = new Builder();
  const rnd = makeRnd(7);
  const PITCH = 0.55;
  const HIP = vec(0, 4, -14);
  const Tt = (x: number, y: number, z: number) => vec(x * 1.45, y * 1.1, z * 1.3).applyAxisAngle(vec(1, 0, 0), PITCH).add(HIP);
  const A = T.arm;

  const moss = (p: Node, x: number, y: number, z: number, n = 3, spread = 1.6): void => {
    for (let i = 0; i < n; i++) {
      const s = 0.7 + rnd() * 1.3;
      p.box(s, 0.5 + rnd() * 0.6, s, x + (rnd() - 0.5) * spread, y + rnd() * 0.3, z + (rnd() - 0.5) * spread, MOSS[Math.floor(rnd() * 3)]!);
    }
  };
  const mossAlong = (p: Node, a: Vector3, bb: Vector3, ts: number[], up = 1.4): void => {
    for (const t of ts) { const c = a.clone().lerp(bb, t); moss(p, c.x, c.y + up, c.z, 3, 1.8); }
  };

  // --- 胴体（背骨・ろっ骨・ぼろぼろセーラー服）。ここは 当たりを 置かない（拡大が 左右で ちがう ため）
  const bodyRoot = b.root('body');
  const torso = bodyRoot.group(HIP.x, HIP.y, HIP.z, [PITCH, 0, 0], [1.45, 1.1, 1.3]);
  torso.box(9, 24, 1.0, 0, 24, -5.0, 0x5a463c);
  for (let i = 0; i < 20; i++) {
    const y = 3 + i * 2.05, w = 3.3 + (i % 2) * 0.6;
    torso.box(w, 1.8, 3.2, 0, y, -7.2, i % 2 ? BONE : BONE_D);
    torso.box(1.2, 1.3, 2.4, 0, y, -9.0, i % 2 ? BONE_D : BONE);
    if (i > 6 && i < 17) moss(torso, 0.8 * (i % 3 - 1), y + 0.8, -8.6, 1, 1);
  }
  for (let i = 0; i < 3; i++) torso.box(2.6, 1.5, 2.6, 0, 38.5 + i * 1.6, -6.2 + i * 0.4, i % 2 ? BONE : BONE_D);
  const RIB_LV = 7;
  for (let i = 0; i < RIB_LV; i++) {
    const y = 15.5 + i * 2.75, a = 8 + 3.6 * Math.sin(Math.PI * (i + 1.1) / (RIB_LV + 1.6)), bb = a * 0.72;
    for (const s of [-1, 1]) {
      let prev: Vector3 | null = null;
      for (let k = 0; k <= 7; k++) {
        const phi = 0.12 + (k / 7) * Math.PI * 0.82;
        const p = vec(s * a * Math.sin(phi), y - (k > 5 ? 0.4 : 0) - 0.12 * k, bb * Math.cos(phi) * (phi > 1.6 ? 0.92 : 1) + 0.3);
        if (prev) torso.seg(prev, p, 1.8, 1.75, k % 2 ? BONE : BONE_D);
        prev = p;
      }
      torso.box(1.9, 1.9, 1.9, s * 1.3, y, bb + 0.5, BONE_D);
    }
  }
  torso.box(2.4, 20, 1.5, 0, 24, 6.7, BONE);
  torso.box(1.6, 17, 1.2, 0, 24, 7.5, BONE_D);
  torso.box(24, 2.2, 2.4, 0, 34.5, 1.4, BONE);
  for (const s of [-1, 1]) {
    torso.box(6, 2, 8, s * 11.5, 34.7, -3, BONE_D);
    torso.box(4.6, 4.6, 4.6, s * 12.5, 33.5, -0.5, BONE);
  }
  moss(torso, -3, 36, 1.4, 4, 3); moss(torso, 7, 36, 0.5, 3, 3);
  // ぼろぼろセーラー服
  const cl = C.top, cd = C.topDark;
  const rag = (p: Node, w: number, h: number, d: number, x: number, y: number, z: number, c: number, teeth = 3, rot?: [number, number, number]): void => {
    const g = p.group(x, y, z, rot);
    g.box(w, h, d, 0, 0, 0, c);
    for (let i = 0; i < teeth; i++) g.box(w / teeth * 0.7, 0.8 + rnd() * 2.2, d, -w / 2 + (i + 0.5) * (w / teeth), -h / 2 - 0.4 - (i % 2) * 0.8, 0, c);
  };
  rag(torso, 6.2, 9, 0.7, -5.3, 14, -8.6, cl, 3); rag(torso, 6.2, 7, 0.7, 5.3, 13, -8.6, cl, 3);
  torso.box(6.5, 3.6, 8.5, -11, 35.4, -3, cl); torso.box(6.5, 3.6, 8.5, 11, 35.4, -3, cl);
  rag(torso, 2.2, 5, 0.8, -14.5, 21, -1.5, cl, 2, [0, -1.2, 0.1]);
  rag(torso, 2.2, 6, 0.8, 14.8, 20, -1.5, cl, 2, [0, 1.2, -0.08]);
  rag(torso, 4.0, 4, 0.8, -4.5, 11.5, 7.4, cl, 3, [0, 0, 0.15]);
  rag(torso, 5.5, 3, 0.8, 5.0, 10.5, 7.6, cl, 3, [0, 0, -0.2]);
  for (const s of [-1, 1]) {
    torso.seg(vec(s * 11.8, 37.0, 0.5), vec(s * 0.8, 29.5, 8.3), 4.2, 0.9, cd);
    torso.seg(vec(s * 11.8, 37.3, 0.5), vec(s * 1.4, 30.2, 8.7), 0.9, 0.6, C.stripe, 0.0, 0.95);
    torso.seg(vec(s * 11.3, 36.4, 1.5), vec(s * 0.6, 28.8, 8.8), 0.9, 0.6, C.stripe, 0.1, 0.95);
  }
  torso.box(15, 0.9, 9.5, 0, 37.6, -4.2, cd);
  torso.box(15.4, 0.5, 0.7, 0, 37.9, -9.0, C.stripe);
  {
    const g = torso.group(0, 29.4, 9.4, [-0.1, 0, 0]);
    g.box(3.2, 3.2, 1.8, 0, 0, 0.3, C.scarf2);
    g.box(4.6, 2.8, 1.2, -3.6, 0.4, 0, C.scarf, [0, 0, 0.3]); g.box(4.6, 2.8, 1.2, 3.6, 0.4, 0, C.scarf, [0, 0, -0.3]);
    g.box(1.8, 6.5, 0.9, -1.1, -4.4, 0.1, C.scarf, [0, 0, 0.12]); g.box(1.8, 5.0, 0.9, 1.2, -3.8, 0.1, C.scarf2, [0, 0, -0.12]);
  }
  // 缶バッジ と 鈴
  torso.geom(new CylinderGeometry(1.7, 1.7, 0.5, 10), 0xffd84a, new Matrix4().compose(vec(-7.0, 33.2, 9.2), new Quaternion().setFromEuler(new Euler(Math.PI / 2, 0, 0)), vec(1, 1, 1)));
  torso.box(1.2, 0.3, 0.3, -7.0, 33.2, 9.5, INK); torso.box(0.3, 0.3, 0.3, -7.6, 33.8, 9.5, INK); torso.box(0.3, 0.3, 0.3, -6.4, 33.8, 9.5, INK);
  torso.box(1.2, 1.2, 0.4, -7.0, 31.2, 9.4, 0xf27aa8);
  torso.box(2.0, 2.0, 2.0, 6.6, 31.6, 9.0, 0xffd23a); torso.box(2.0, 0.35, 2.05, 6.6, 31.6, 9.0, 0xc9a020); torso.box(0.5, 0.5, 2.1, 6.6, 31.0, 9.0, 0x6a4a10);
  torso.box(1.2, 0.6, 0.6, 6.6, 33.0, 9.0, 0xf27aa8);

  // --- あたま
  const hn = Tt(0, 38, -6);
  const headPos = vec(hn.x, hn.y + 0.6, hn.z + 5.6);
  const headYaw = (T.place.headYawDeg * Math.PI) / 180;
  const head = b.root('head').group(headPos.x, headPos.y, headPos.z, [0.17, headYaw, 0], undefined, 'YXZ');
  {
    const R = 9.5, bt = 3.0, bs = 1.4, dep = 9.4;
    const geo = new ExtrudeGeometry(octShape(R, 3.6), { depth: dep, bevelEnabled: true, bevelThickness: bt, bevelSize: bs, bevelOffset: 0, bevelSegments: 3, curveSegments: 4 });
    head.geom(geo, BONE, new Matrix4().compose(vec(0, 5 + bt, -0.2), new Quaternion().setFromEuler(new Euler(-Math.PI / 2, 0, 0)), vec(1, 1, 1)));
    geo.dispose();
  }
  // てっぺんの 小さな 穴（中から うっすら 光る）
  head.box(3.4, 1.0, 3.4, 0, 14.6, -0.4, 0x2a1d1a);
  head.box(3.3, 2.6, 3.3, 0, 16.2, -0.4, 0x3a2a2c);
  head.glowBox(3.2, 0.25, 3.2, 0, 17.5, -0.4, 0x8aeaff, 0.45);
  head.geom(new OctahedronGeometry(0.8), 0xcffaff, new Matrix4().makeTranslation(0, 17.0, -0.4), 'bright');
  for (const [w, d, x, z] of [[4.0, 0.3, 0, -2.2], [4.0, 0.3, 0, 1.4], [0.3, 4.0, -2.0, -0.4], [0.3, 4.0, 2.0, -0.4]] as const) head.glowBox(w, 0.15, d, x, 20.45, z, 0xbff4ff, 0.55);
  // 後頭部の 大きな 欠け（奥に コア）
  {
    const zb = -10.3, cy = 10.2;
    for (const [w, h, x, y] of [[5.0, 5.0, 0, cy], [6.4, 2.6, 0.2, cy + 0.4], [3.0, 6.6, -0.8, cy - 0.2], [2.0, 3.2, 3.2, cy - 1.6], [2.2, 2.0, -3.0, cy + 2.2]] as const) head.box(w, h, 0.4, x, y, zb - 0.1, 0x241612);
    const rimBox = (w: number, h: number, x: number, y: number, d: number, c = BONE_D) => head.box(w, h, d, x, y, zb - d / 2 - 0.1, c);
    rimBox(4.2, 1.8, -3.0, cy + 3.9, 2.6); rimBox(3.0, 1.2, 0.6, cy + 3.6, 1.6); rimBox(2.6, 2.2, 3.4, cy + 4.1, 2.4); rimBox(2.2, 1.0, 5.2, cy + 2.9, 1.4);
    rimBox(2.0, 3.0, -4.9, cy + 1.2, 2.2); rimBox(1.4, 1.6, -4.2, cy - 1.6, 1.2); rimBox(2.2, 2.4, -5.4, cy - 3.0, 2.6);
    rimBox(2.6, 1.4, -2.4, cy - 3.9, 1.8); rimBox(2.4, 1.0, 1.2, cy - 3.4, 1.0); rimBox(3.2, 1.8, 3.8, cy - 4.0, 2.6); rimBox(1.8, 2.6, 5.3, cy - 1.6, 1.6); rimBox(1.2, 1.4, 4.4, cy + 0.6, 1.0);
    for (const [x, y, w, h] of [[-7.2, cy + 5.6, 1.6, 0.6], [-8.4, cy + 6.4, 1.2, 0.6], [-9.2, cy + 7.4, 0.8, 1.2], [7.4, cy + 4.6, 1.6, 0.6], [8.8, cy + 5.4, 1.2, 0.6], [9.6, cy + 6.6, 0.8, 1.4],
      [-7.0, cy - 5.4, 1.4, 0.6], [-8.2, cy - 6.4, 1.0, 1.2], [6.8, cy - 5.6, 1.6, 0.6], [8.2, cy - 6.6, 1.0, 1.2], [-1.0, cy + 6.6, 0.6, 1.4], [0.2, cy + 7.8, 0.6, 1.2]] as const) head.box(w, h, 0.5, x, y, zb - 0.1, BONE_DK);
    head.box(1.5, 1.2, 1.2, -6.4, cy + 4.6, zb - 0.5, BONE, [0, 0.3, 0.5]); head.box(1.2, 1.0, 1.0, 6.8, cy - 4.2, zb - 0.4, BONE, [0, -0.3, 0.6]); head.box(1.0, 1.0, 1.0, 1.8, cy + 5.4, zb - 0.6, BONE, [0.3, 0.3, 0.2]);
    // コアは 欠けの 中（穴の 面に はまって いる）
    head.geom(new OctahedronGeometry(2.2), 0xcffaff, new Matrix4().makeTranslation(0, cy, zb - 0.3), 'bright');
    head.geom(new OctahedronGeometry(3.3), 0x8aeaff, new Matrix4().makeTranslation(0, cy, zb - 0.3), 'glow', 0.3);
    // 後ろの 大きな ヘアリボン。羽の 上は 平らな あしば
    const rb = head.group(0, 3.6, -11.6);
    const RP = 0xf6a6c8, RL = 0xc3a4f2, RD = 0xd8789f;
    rb.box(4.6, 4.2, 3.6, 0, 0, 0, RD); rb.box(4.8, 0.5, 3.8, 0, 1.0, 0, RL);
    for (const sd of [-1, 1]) {
      rb.box(7.0, 3.0, 8.5, sd * 5.3, 0.6, -2.2, RP); rb.box(7.0, 0.5, 8.5, sd * 5.3, 2.15, -2.2, RL);
      rb.box(7.5, 3.4, 12.0, sd * 11.6, 0.8, -3.6, RP); rb.box(7.5, 0.5, 12.0, sd * 11.6, 2.5, -3.6, RL);
      rb.box(1.0, 3.4, 12.0, sd * 15.7, 0.8, -3.6, RD); rb.box(6.4, 1.0, 10.0, sd * 11.0, -1.2, -3.6, RD);
      rb.box(3.0, 8.0, 1.6, sd * 3.0, -5.0, -3.0, RP, [0, 0, sd * 0.25]); rb.box(3.0, 6.0, 1.6, sd * 6.0, -4.2, -3.4, RL, [0, 0, sd * 0.45]);
      // 当たり（リボンの 羽の 上の 面）
      rb.hit(`ribbonWing${sd < 0 ? 'R' : 'L'}`, 7.5, 3.4 + 0.5, 12.0, sd * 11.6, 0.8 + 0.25, -3.6);
      rb.hit(`ribbonWing2${sd < 0 ? 'R' : 'L'}`, 7.0, 3.0 + 0.5, 8.5, sd * 5.3, 0.6 + 0.25, -2.2);
    }
    rb.hit('ribbonKnot', 4.8, 4.2, 3.8, 0, 0.5, 0);
  }
  // 頭がいの 当たり（上の 面は 少し 前に かたむく）
  head.hit('skull', 19.2, 15.4, 19.4, 0, 12.7, -0.2);
  // ほお骨・あご
  head.box(15.5, 5.4, 15.5, 0, 2.6, 1.4, BONE_D);
  head.box(13.5, 3.2, 14.2, 0, 1.0, 1.6, BONE_D);
  head.box(18, 1.2, 3, 0, 5.2, 8.4, BONE);
  for (const s of [-1, 1]) { head.box(3.4, 3.4, 3.4, s * 8.4, 5.5, 8.0, BONE); head.box(2.4, 6, 8, s * 10.6, 7, 0, BONE_D); }
  // 目（くらい 穴 と 光る 目。色は 外から かえる）
  for (const s of [-1, 1]) {
    const x = s * 4.9, y = 9.6;
    head.box(6.4, 7.0, 1.4, x, y, 10.0, 0x241612);
    head.box(5.0, 5.6, 0.4, x, y, 10.75, 0x120a08);
    const rotX = new Quaternion().setFromEuler(new Euler(Math.PI / 2, 0, 0));
    head.geom(new CylinderGeometry(1.5, 1.5, 0.7, 10), 0xffffff, new Matrix4().compose(vec(x, y - 0.2, 11.0), rotX, vec(1, 1, 1)), 'eyes');
    head.geom(new CylinderGeometry(2.4, 2.4, 0.3, 10), 0xffffff, new Matrix4().compose(vec(x, y - 0.2, 11.15), rotX, vec(1, 1, 1)), 'eyeHalo');
    for (let k = 0; k < 3; k++) head.box(0.55, 1.9, 0.5, x + s * (3.0 + k * 0.1), y + 3.2 - k * 1.0, 10.8, INK, [0, 0, -s * (0.9 + k * 0.35)]);
    head.box(5.4, 0.7, 0.5, x, y + 3.5, 10.8, INK);
    head.box(3.0, 1.3, 0.3, s * 7.8, 5.7, 10.2, 0xf4a3b2);
    head.box(7.6, 1.1, 0.6, x - s * 0.2, y + 4.6, 10.6, INK, [0, 0, s * 0.42], 'brow'); // 怒った とき だけ 見せる まゆ
  }
  head.box(0.9, 1.5, 0.5, -0.8, 5.9, 10.2, DARK, [0, 0, 0.2]); head.box(0.9, 1.5, 0.5, 0.8, 5.9, 10.2, DARK, [0, 0, -0.2]);
  head.box(9.0, 2.6, 0.8, 0, 2.6, 9.6, DARK);
  for (let i = 0; i < 6; i++) { const x = (i - 2.5) * 1.3; head.box(1.15, 1.15, 0.9, x, 3.2 + 0.07 * x * x, 10.0, 0xfffbee); }
  for (let i = 0; i < 4; i++) { const x = (i - 1.5) * 1.3; head.box(1.15, 1.0, 0.9, x, 1.7 + 0.05 * x * x, 10.0, 0xfffbee); }
  head.box(0.5, 0.5, 0.9, -5.0, 4.2, 9.9, DARK); head.box(0.5, 0.5, 0.9, 5.0, 4.2, 9.9, DARK);
  moss(head, -5, 18.6, 3, 5, 4); moss(head, -2, 20.4, -5, 3, 3); moss(head, 6, 19.4, -4, 3, 3); moss(torso, -12, 37, -2, 4, 4); moss(torso, 12, 37, -1, 4, 4); moss(head, 7, 17.5, 5, 4, 3); moss(head, -9.5, 11, -2, 3, 3); moss(head, 4, 17.8, -6, 4, 3); moss(head, 10.6, 12, 2, 3, 2);
  head.box(4.5, 1.2, 4.5, -7.8, 17.2, -4, MOSS[1]!); head.box(3, 1.0, 3, -8.5, 16.5, -2, MOSS[0]!);
  // ヘアバンド
  {
    const geo = new ExtrudeGeometry(octShape(11.35, 9.5), { depth: 1.9, bevelEnabled: false });
    head.geom(geo, C.band, new Matrix4().compose(vec(0, 14.4 - 0.95, -0.2), new Quaternion().setFromEuler(new Euler(-Math.PI / 2, 0, 0)), vec(1, 1, 1)));
    geo.dispose();
    for (let i = 0; i < 5; i++) head.box(1.2, 1.1, 0.3, -8 + i * 4, 14.4, 10.6, C.band2);
    for (let i = 0; i < 5; i++) head.box(0.3, 1.1, 1.2, 10.6, 14.4, -8 + i * 4, C.band2);
  }
  // ツインテール（黒）＋ ポンポン
  {
    const pc = 0xf27aa8;
    for (const s of [-1, 1]) {
      const pts = [vec(s * 11.8, 13, -3), vec(s * 14.5, 5, -3.5), vec(s * 15.5, -5, -2), vec(s * 15, -14, 1.5)];
      for (let i = 0; i < 3; i++) head.seg(pts[i]!, pts[i + 1]!, 3.2 - i * 0.5, 3.4 - i * 0.5, HAIR);
      head.box(2.0, 2.4, 2.0, s * 14.4, -15.4, 2.2, HAIR);
      head.box(3.2, 3.2, 3.2, s * 11.8, 13.6, -3, pc); head.box(2.2, 2.2, 3.6, s * 11.8, 13.6, -3, 0xffd0e0);
      head.box(3.4, 3.4, 3.4, s * 15.0, -1.5, -2.8, pc);
      moss(head, s * 13, 14.8, -3, 1, 1);
    }
    head.box(2.4, 2.0, 0.8, 8.4, 16.6, 8.4, 0xffd84a, [0, 0, 0.4]); head.box(2.4, 2.0, 0.8, 11, 16.6, 8, 0xffd84a, [0, 0, -0.4]);
  }
  // 左目（キャラの 左 = +x）に ささった 大きな 矢 ＋ ネックレス
  {
    const P0 = vec(4.9, 9.6, 8.5), d = vec(0.85, 0.38, 0.4).normalize();
    const g = head.group(P0.x, P0.y, P0.z);
    // 矢の 向き（z → d）
    const qa = new Quaternion().setFromUnitVectors(vec(0, 0, 1), d);
    const ga = new Node(b, 'head', g.m.clone().multiply(new Matrix4().makeRotationFromQuaternion(qa)));
    ga.box(1.5, 1.5, 28, 0, 0, 12, 0xc99358); ga.box(0.6, 0.6, 28, 0.5, 0.5, 12, 0xe0b27a);
    ga.box(2.2, 2.2, 0.8, 0, 0, 26.2, 0x8a5a2a);
    for (let k = 0; k < 3; k++) {
      const gp = ga.group(0, 0, 22.6, [0, 0, (k * Math.PI * 2) / 3 + 0.4]);
      gp.box(0.35, 2.8, 6.0, 0, 1.9, 0, k === 0 ? 0xffffff : C.stripe);
      gp.box(0.35, 1.0, 2.4, 0, 3.6, -1.8, k === 0 ? 0xf1e6cb : 0xffffff);
    }
    const dn = vec(0, -1, 0).applyQuaternion(qa.clone().invert()).normalize();
    const N = 18, a0 = vec(0, 0, 9), a1 = vec(0, 0, 18), sag = 9;
    for (let i = 0; i <= N; i++) {
      const t = i / N, c = a0.clone().lerp(a1, t).addScaledVector(dn, sag * 4 * t * (1 - t) + 1.0);
      ga.box(0.9, 0.9, 0.9, c.x, c.y, c.z, C.beads[i % 2]!, [0, 0, i]);
    }
    const mid = a0.clone().lerp(a1, 0.5).addScaledVector(dn, sag + 2.4);
    ga.box(3.0, 3.0, 1.0, mid.x, mid.y, mid.z, C.pendant, [0, 0, Math.PI / 4]);
    ga.box(1.4, 1.4, 1.2, mid.x, mid.y, mid.z, 0xffffff);
    ga.box(1.9, 1.9, 0.7, 0, 0, 9, C.beads[0]); ga.box(1.9, 1.9, 0.7, 0, 0, 18, C.beads[0]);
  }

  // --- うで（のぼれるように 長め・ゆるい 坂。手を 地面に ついて すすむ）
  const groundPts: Vector3[] = [vec(0, 0, 0)];
  let nailI = 0;
  const th = A.handThick;
  for (const s of [-1, 1]) {
    const S = Tt(s * 12.5, 33.2, -0.5);
    const E = S.clone().add(vec(s * A.upper[0], A.upper[1], A.upper[2]));
    const Wr = E.clone().add(vec(s * A.fore[0], A.fore[1], A.fore[2]));
    const arm = b.root(s > 0 ? 'armL' : 'armR');
    const uF = Wr.clone().sub(E).normalize();
    // 上わん（そで ぼろぼろ）と 前わん
    arm.seg(S, E, 3.6, 3.6, BONE); arm.seg(S, E, 1.2, 1.2, BONE_D, 0.1, 0.9);
    arm.box(4.4, 4.4, 4.4, E.x, E.y, E.z, BONE_D); arm.box(3.6, 3.6, 3.6, E.x, E.y + 0.3, E.z, BONE);
    arm.seg(E, Wr, A.foreWidth, A.foreThick, BONE); arm.seg(E.clone().add(vec(1.1 * s, 0.3, 0)), Wr.clone().add(vec(1.1 * s, 0.3, 0)), 1.2, 1.2, BONE_D);
    arm.box(A.foreWidth - 0.4, 3.0, 3.6, Wr.x, Wr.y, Wr.z, BONE_D);
    mossAlong(arm, S, E, [0.2, 0.55, 0.8], 2.0); mossAlong(arm, E, Wr, [0.3, 0.6], 1.9);
    arm.seg(S, E, 6.0, A.upperThick, cl, -0.08, 0.5);
    arm.seg(S, E, 6.4, A.upperThick + 0.4, C.stripe, 0.46, 0.5); arm.seg(S, E, 6.0, A.upperThick, cd, 0.5, 0.56);
    for (let i = 0; i < 3; i++) { const c = S.clone().lerp(E, 0.58 + i * 0.01); arm.box(1.6, 2.4, 1.6, c.x + (i - 1) * 2.1, c.y - 0.6 - (i % 2) * 0.9, c.z + 1.0, cd); }
    // 手: てのひら と 指（先に ネイル）。地面に ぺたんと
    const palmZ = Wr.z + 3.4, palmX = Wr.x;
    arm.box(6.4, th, 7.0, palmX, th / 2, palmZ, BONE_D); arm.box(5.6, th, 6.2, palmX, th / 2 + 0.05, palmZ + 0.4, BONE);
    let tipZ = palmZ;
    for (let f = 0; f < 5; f++) {
      const thumb = f === 4;
      const ang = thumb ? s * -0.95 : (f - 1.5) * 0.19;
      let p = vec(palmX + (thumb ? s * -3.0 : (f - 1.5) * 1.5), th * 0.5, palmZ + (thumb ? -0.5 : 3.5));
      const lens = thumb ? [2.4, 2.2] : [3.4, 3.0, 2.5];
      let dir = vec(Math.sin(ang), 0, Math.cos(ang));
      lens.forEach((L, k) => {
        const rise = k === lens.length - 1 ? 0.2 : k === 1 ? 0.06 : 0;
        dir = vec(dir.x, rise, dir.z).normalize();
        const n = p.clone().addScaledVector(dir, L);
        arm.seg(p, n, 1.25, Math.min(1.15, th * 0.95), k % 2 ? BONE : BONE_D);
        arm.box(1.5, Math.min(1.4, th), 1.5, p.x, p.y, p.z, BONE_D);
        p = n;
      });
      tipZ = Math.max(tipZ, p.z);
      const eu = new Euler().setFromQuaternion(new Quaternion().setFromUnitVectors(vec(0, 0, 1), dir.clone().normalize()));
      const tip = p.clone().addScaledVector(dir, 0.2).add(vec(0, 0.45, 0));
      arm.box(1.15, 0.55, 1.5, tip.x, tip.y, tip.z, nailColor(nailI++), [eu.x, eu.y, eu.z]);
    }
    groundPts.push(vec(palmX, 0, palmZ), vec(palmX, 0, tipZ));
    // ---- 当たり（のぼる 道）。目に 見える 面と そろえる
    const lineHit = (name: string, a: Vector3, bb: Vector3, width: number, thick: number): void => {
      const u = bb.clone().sub(a), len = u.length(); u.normalize();
      const { side, n } = frameOf(u);
      b.hits.push({ name, c: a.clone().add(bb).multiplyScalar(0.5), axes: [side, n, u], half: [width / 2, thick / 2, len / 2] });
    };
    const sd = s < 0 ? 'R' : 'L';
    lineHit(`upperArm${sd}`, S, E, A.upperWidth, A.upperThick - 0.6);
    // 前わんは 手首の 先まで 少し のばして 手に つなぐ（手首が 浮いて 見えても 段が 1 つに なる）
    lineHit(`foreArm${sd}`, E, Wr.clone().addScaledVector(uF, A.foreExtend), A.foreWidth - 0.2, A.foreThick - 0.2);
    b.hits.push({ name: `hand${sd}`, c: vec(palmX, th / 2, (palmZ - 3.5 + tipZ) / 2), axes: [vec(1, 0, 0), vec(0, 1, 0), vec(0, 0, 1)], half: [3.4, th / 2, (tipZ - palmZ + 3.5) / 2] });
  }

  // --- 雲（こしから 下を かくす。つみあがる すりガラスの 渦雲）。上が 平らで 乗れる
  const W = T.waist;
  const cOpt = { hitFill: T.collide.cloudFill, hitThick: T.collide.cloudThick, rnd };
  for (let t = 0; t < W.tiers; t++) {
    const top = (t + 1) * W.stepUp;
    const L = W.baseLen - t * W.shrink, D = W.baseDep - t * W.shrink * (W.baseDep / W.baseLen);
    const sgn = t % 2 ? 1 : -1;
    cloud(b, { ...cOpt, a: vec(-L / 2 + sgn * 1.2, top, W.z), b: vec(L / 2 + sgn * 1.2, top, W.z), width: D, thick: Math.max(3, W.stepUp + 2.4), tail: t % 3 === 0 ? 6 : 0, swirls: t === W.tiers - 1 || t % 4 === 1 ? 2 : 0, name: `waist${t}` });
  }
  const R_ = T.route;
  for (const s of [-1, 1]) {
    const side = s < 0 ? 'R' : 'L';
    const mir = (p: number[]) => vec(s * p[0]!, p[1]!, p[2]!);
    cloud(b, { ...cOpt, a: mir(R_.shoulder.a), b: mir(R_.shoulder.b), width: R_.shoulder.width, thick: R_.shoulder.thick, tail: 8, swirls: 3, name: `shoulder${side}` });
    cloud(b, { ...cOpt, a: mir(R_.rampOut.a), b: mir(R_.rampOut.b), width: R_.rampOut.width, thick: R_.rampOut.thick, tail: 0, swirls: 2, name: `rampOut${side}` });
    cloud(b, { ...cOpt, a: mir(R_.rampIn.a), b: mir(R_.rampIn.b), width: R_.rampIn.width, thick: R_.rampIn.thick, tail: 0, swirls: 2, name: `rampIn${side}` });
  }

  // ---------------------------------------------------------------- 3D に する
  const group = new Group();
  const meshes: Mesh[] = [];
  const mats: Record<string, MeshBasicMaterial> = {};
  const mk = (name: BucketName, o: { transparent?: boolean; opacity?: number; side?: 0 | 1 | 2; order?: number; depthWrite?: boolean; visible?: boolean } = {}): Mesh | null => {
    const bk = b.buckets.get(name);
    if (!bk || !bk.pos.length) return null;
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(bk.pos, 3));
    geo.setAttribute('color', new Float32BufferAttribute(bk.col, bk.rgba ? 4 : 3));
    const mat = new MeshBasicMaterial({ vertexColors: true, fog: false, side: o.side ?? DoubleSide, transparent: o.transparent ?? false, opacity: o.opacity ?? 1, depthWrite: o.depthWrite ?? true });
    mats[name] = mat;
    const m = new Mesh(geo, mat);
    m.name = `gashaBig:${name}`;
    m.renderOrder = o.order ?? 0;
    m.frustumCulled = false;
    m.visible = o.visible ?? true;
    group.add(m); meshes.push(m);
    return m;
  };
  for (const n of ['body', 'head', 'armL', 'armR', 'bright'] as const) mk(n);
  mk('eyes');
  mk('eyeHalo', { transparent: true, opacity: 0.3, depthWrite: false, order: 1 });
  const brow = mk('brow', { visible: false });
  mk('glow', { transparent: true, depthWrite: false, order: 3 });
  mk('glass', { transparent: true, depthWrite: false, order: 2, side: 0 });

  // 身長: 頭の いちばん 上（頭の 当たりの 上の 面）が T.size.height に なる ように
  const hm = new Matrix4().compose(headPos, new Quaternion().setFromEuler(new Euler(0.17, headYaw, 0, 'YXZ')), vec(1, 1, 1));
  const topY = vec(0, 20.4, -0.2).applyMatrix4(hm).y;
  const scale = T.size.height / topY;
  return {
    group, hits: b.hits, eyes: mats.eyes!, eyeHalo: mats.eyeHalo!, brow: brow ?? new Mesh(), scale, groundPts, head: headPos, meshes: meshes.length,
  };
}

// ---------------------------------------------------------------- 当たりの 箱 → ブロックの マス
export interface WorldHit { name: string; center: [number, number, number]; half: [number, number, number]; axes: [[number, number, number], [number, number, number], [number, number, number]] }

/** もとの 座標の 当たりを 世界の 座標（位置 pos、向き yaw、拡大 scale）に うつす */
export function toWorld(hits: Hit[], pos: Vector3, yaw: number, scale: number): WorldHit[] {
  const M = new Matrix4().compose(pos, new Quaternion().setFromAxisAngle(UP, yaw), vec(scale, scale, scale));
  const R = new Quaternion().setFromAxisAngle(UP, yaw);
  return hits.map((h) => {
    const c = h.c.clone().applyMatrix4(M);
    const ax = h.axes.map((a) => a.clone().applyQuaternion(R));
    return {
      name: h.name,
      center: [c.x, c.y, c.z],
      half: [h.half[0] * scale, h.half[1] * scale, h.half[2] * scale],
      axes: [[ax[0]!.x, ax[0]!.y, ax[0]!.z], [ax[1]!.x, ax[1]!.y, ax[1]!.z], [ax[2]!.x, ax[2]!.y, ax[2]!.z]],
    };
  });
}

/** マス（i, j, k）の キー。±32768 の 外は 想定しない */
export const cellKey = (i: number, j: number, k: number): number => ((i + 32768) * 65536 + (k + 32768)) * 1024 + j;

/** 箱の 中に マスの 中心が ある マスを 数える。margin は 箱の ぜんぶの 向きに ひろげる ぶん、topLift は 上の 向きだけ */
export function voxelize(hits: WorldHit[], margin: number, topLift: number): Set<number> {
  const cells = new Set<number>();
  for (const h of hits) {
    const [hx, hy, hz] = h.half;
    // 外がわの 四角（AABB）
    const ext = [0, 1, 2].map((d) => Math.abs(h.axes[0]![d]!) * (hx + margin) + Math.abs(h.axes[1]![d]!) * (hy + margin + topLift) + Math.abs(h.axes[2]![d]!) * (hz + margin));
    const [cx, cy, cz] = h.center;
    const i0 = Math.floor(cx - ext[0]!), i1 = Math.ceil(cx + ext[0]!);
    const j0 = Math.max(0, Math.floor(cy - ext[1]!)), j1 = Math.ceil(cy + ext[1]!);
    const k0 = Math.floor(cz - ext[2]!), k1 = Math.ceil(cz + ext[2]!);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) for (let k = k0; k <= k1; k++) {
      const dx = i + 0.5 - cx, dy = j + 0.5 - cy, dz = k + 0.5 - cz;
      const u = dx * h.axes[0]![0] + dy * h.axes[0]![1] + dz * h.axes[0]![2];
      const v = dx * h.axes[1]![0] + dy * h.axes[1]![1] + dz * h.axes[1]![2] - topLift / 2;
      const w = dx * h.axes[2]![0] + dy * h.axes[2]![1] + dz * h.axes[2]![2];
      if (Math.abs(u) <= hx + margin && Math.abs(v) <= hy + margin + topLift / 2 && Math.abs(w) <= hz + margin) cells.add(cellKey(i, j, k));
    }
  }
  return cells;
}

// ---------------------------------------------------------------- ゲームに 入れる
export interface GashaBigHandle {
  tune(o: unknown): void;
  place(): void;
  angry(on: boolean): void;
  colliders(): WorldHit[];
  /** 見えない 固いマスを 1 つ 聞く */
  solidAt(x: number, y: number, z: number): boolean;
  info(): Record<string, unknown>;
  group: Group;
}

export function startGashaBig(deps: GashaBigDeps): GashaBigHandle {
  applyTuneFromUrl(location.search);
  let model: BigModel | null = null;
  let cells = new Set<number>();
  let worldHits: WorldHit[] = [];
  let isAngry = false;
  let pos = new Vector3(), yaw = 0;
  const fwdOf = (p: { yawDeg: number }) => { const y = (p.yawDeg * Math.PI) / 180; return { fx: Math.sin(y), fz: -Math.cos(y) }; };

  const clear = () => {
    if (!model) return;
    deps.scene.remove(model.group);
    model.group.traverse((o) => { const m = o as Mesh; if (m.isMesh) { m.geometry.dispose(); (m.material as MeshBasicMaterial).dispose(); } });
    model = null;
  };

  const place = (): void => {
    clear();
    model = buildBig();
    const p = deps.player();
    const f = fwdOf(p);
    const mx = p.x + f.fx * T.place.distance, mz = p.z + f.fz * T.place.distance;
    yaw = Math.atan2(p.x - mx, p.z - mz) + (T.place.faceYawOffsetDeg * Math.PI) / 180;
    const s = model.scale;
    // 地面の 高さ: 手・からだの 下の 何点かで 決める
    const R = new Quaternion().setFromAxisAngle(UP, yaw);
    const hs = model.groundPts.map((q) => {
      const w = q.clone().multiplyScalar(s).applyQuaternion(R);
      return deps.groundY(Math.floor(mx + w.x), Math.floor(mz + w.z)) + 1;
    });
    const base = T.place.groundPick === 'min' ? Math.min(...hs) : T.place.groundPick === 'center' ? hs[0]! : Math.max(...hs);
    pos = new Vector3(mx, base, mz);
    model.group.position.copy(pos);
    model.group.rotation.y = yaw;
    model.group.scale.setScalar(s);
    model.eyes.color.set(isAngry ? 0xff3b2a : 0xffffff);
    model.eyeHalo.color.set(isAngry ? 0xff3b2a : 0xffffff);
    model.brow.visible = isAngry;
    deps.scene.add(model.group);
    worldHits = toWorld(model.hits, pos, yaw, s);
    cells = voxelize(worldHits, T.collide.margin, T.collide.topLift);
  };

  deps.addPlayerSolid((x, y, z) => cells.size > 0 && cells.has(cellKey(x, y, z)));
  place();

  const handle: GashaBigHandle = {
    tune: (o) => applyTune(o),
    place,
    angry: (on) => {
      isAngry = on;
      if (model) { model.eyes.color.set(on ? 0xff3b2a : 0xffffff); model.eyeHalo.color.set(on ? 0xff3b2a : 0xffffff); model.brow.visible = on; }
    },
    colliders: () => worldHits,
    solidAt: (x, y, z) => cells.has(cellKey(x, y, z)),
    info: () => ({
      scale: model?.scale, pos: [pos.x, pos.y, pos.z], yawDeg: (yaw * 180) / Math.PI, drawCalls: model?.meshes, hitBoxes: worldHits.length, cells: cells.size, angry: isAngry,
      head: model ? model.head.clone().multiplyScalar(model.scale).applyQuaternion(new Quaternion().setFromAxisAngle(UP, yaw)).add(pos).toArray() : null,
    }),
    get group() { return model!.group; },
  };
  (window as unknown as { __gashaBig: GashaBigHandle }).__gashaBig = handle;
  return handle;
}
