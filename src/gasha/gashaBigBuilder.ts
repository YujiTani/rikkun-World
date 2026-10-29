/**
 * #308 gashaBig.ts を 分けた もの: 体の 見た目を 作る 道具（色・面の 明るさ・箱を ためる Builder と Node・向きの 道具・乱数）。
 * 見た目は 箱を 関節ごとに まとめて 1 つの メッシュに する。ここは 形を 作るだけで、体の 部品ごとの 組み立ては gashaBigBuild*.ts。
 */
import { Color, Euler, Matrix3, Matrix4, Path, Quaternion, Shape, Vector3, type BufferGeometry } from 'three';
import type { GlassCell, Hit, JointName } from './gashaBigTypes';

// ---------------------------------------------------------------- 色と 面の 明るさ
export const BONE = 0xfff6e4, BONE_D = 0xf0e2c6, BONE_DK = 0xd9c8a4, DARK = 0x3a2a26, MOSS = [0x6dbe45, 0x58a83a, 0x86cf5a];
export const INK = 0x2a1e1a;
export const HAIR = 0x23212b; // 少女と おなじ 黒
export const C = { top: 0x2a2a34, topDark: 0x1c1c25, stripe: 0xf27aa8, scarf: 0xf27aa8, scarf2: 0xd85a8c, band: 0x8e62d8, band2: 0xc3a4f2, pendant: 0xffd84a, beads: [0xf27aa8, 0xc3a4f2] as const };
export const nailColor = (i: number) => (i % 2 ? 0xffd84a : 0xf27aa8);

/** 光は 左・上・手前から。面の 向きで 0.55〜1.0 */
const LIGHT = new Vector3(-0.35, 0.8, 0.5).normalize();
function shade(nx: number, ny: number, nz: number): number {
  const l = Math.max(0, nx * LIGHT.x + ny * LIGHT.y + nz * LIGHT.z);
  return Math.min(1, 0.56 + 0.44 * l * 1.15);
}

export const vec = (x: number, y: number, z: number) => new Vector3(x, y, z);
export const UP = vec(0, 1, 0);

export const PARENT: Record<JointName, JointName | null> = {
  Hips: null, Spine: 'Hips', Spine01: 'Spine', Spine02: 'Spine01', neck: 'Spine02', Head: 'neck',
  LeftShoulder: 'Spine02', LeftArm: 'LeftShoulder', LeftArmMid: 'LeftArm', LeftForeArm: 'LeftArmMid', LeftHand: 'LeftForeArm',
  RightShoulder: 'Spine02', RightArm: 'RightShoulder', RightArmMid: 'RightArm', RightForeArm: 'RightArmMid', RightHand: 'RightForeArm',
};

// ---------------------------------------------------------------- 箱を ためて まとめる
/** 1 つの 関節の 中の 種類。main = ふつうの 箱（面ごとに 明るさ）、ほかは 影なし */
export type Kind = 'main' | 'bright' | 'eyes' | 'eyeHalo' | 'brow' | 'glow' | 'glass' | 'gblock';
const SHADED: Record<Kind, boolean> = { main: true, bright: false, eyes: false, eyeHalo: false, brow: true, glow: false, glass: false, gblock: false };
const RGBA = new Set<Kind>(['glow', 'glass', 'gblock']);

export class Bucket {
  pos: number[] = [];
  col: number[] = [];
  /** ガラスの ブロックの 絵（gblock だけ） */
  uv: number[] = [];
  constructor(readonly joint: JointName, readonly kind: Kind) {}
  get rgba(): boolean { return RGBA.has(this.kind); }
}


const tmpM = new Matrix4();
const tmpN = new Matrix3();
export const tmpP = new Vector3();
const tmpV = new Vector3();
const tmpC = new Color();

/** 面（4 つの かど）。法線 と 4 つの かど（-0.5〜0.5） */
export const FACES: { n: [number, number, number]; v: [number, number, number][] }[] = [
  { n: [1, 0, 0], v: [[0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [0.5, 0.5, 0.5], [0.5, -0.5, 0.5]] },
  { n: [-1, 0, 0], v: [[-0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [-0.5, 0.5, -0.5], [-0.5, -0.5, -0.5]] },
  { n: [0, 1, 0], v: [[-0.5, 0.5, -0.5], [-0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [0.5, 0.5, -0.5]] },
  { n: [0, -1, 0], v: [[-0.5, -0.5, 0.5], [-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5]] },
  { n: [0, 0, 1], v: [[-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5]] },
  { n: [0, 0, -1], v: [[0.5, -0.5, -0.5], [-0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5]] },
];

export class Builder {
  readonly buckets = new Map<string, Bucket>();
  readonly hits: Hit[] = [];
  /** ガラスの 雲の マスごとの 見た目の 頂点の 範囲（割れた とき 消す） */
  readonly glass: GlassCell[] = [];
  bucket(joint: JointName, kind: Kind): Bucket {
    const k = `${joint}|${kind}`;
    let b = this.buckets.get(k);
    if (!b) { b = new Bucket(joint, kind); this.buckets.set(k, b); }
    return b;
  }
  /** 休みの 姿勢の 座標（からだの 座標）で 作りはじめる。joint は その 箱が ついて 動く 関節 */
  root(joint: JointName): Node { return new Node(this, joint, new Matrix4()); }

  /** 頂点を 1 つ ためる（p は からだの 座標、n は 法線） */
  push(joint: JointName, kind: Kind, p: Vector3, n: Vector3, color: number, alpha = 1, flat?: number): void {
    const b = this.bucket(joint, kind);
    b.pos.push(p.x, p.y, p.z);
    tmpC.setHex(color);
    const f = flat ?? (SHADED[kind] ? shade(n.x, n.y, n.z) : 1);
    if (b.rgba) b.col.push(tmpC.r * f, tmpC.g * f, tmpC.b * f, alpha);
    else b.col.push(tmpC.r * f, tmpC.g * f, tmpC.b * f);
  }
}

export class Node {
  constructor(readonly b: Builder, readonly joint: JointName, readonly m: Matrix4) {}

  /** おなじ 場所で ついて 動く 関節だけ かえる */
  at(joint: JointName): Node { return new Node(this.b, joint, this.m); }

  group(x: number, y: number, z: number, rot?: [number, number, number], scale?: [number, number, number], order: 'XYZ' | 'YXZ' = 'XYZ'): Node {
    const q = new Quaternion().setFromEuler(new Euler(rot?.[0] ?? 0, rot?.[1] ?? 0, rot?.[2] ?? 0, order));
    const local = new Matrix4().compose(vec(x, y, z), q, scale ? vec(...scale) : vec(1, 1, 1));
    return new Node(this.b, this.joint, this.m.clone().multiply(local));
  }

  /** 箱（中心 x,y,z、大きさ w,h,d、回転 rot） */
  box(w: number, h: number, d: number, x: number, y: number, z: number, color: number, rot?: [number, number, number], kind: Kind = 'main'): void {
    const q = rot ? new Quaternion().setFromEuler(new Euler(rot[0], rot[1], rot[2], 'XYZ')) : new Quaternion();
    const M = tmpM.copy(this.m).multiply(new Matrix4().compose(vec(x, y, z), q, vec(w, h, d)));
    this.quads(M, color, kind);
  }

  quads(M: Matrix4, color: number, kind: Kind, alpha = 1, flat?: number): void {
    const nm = tmpN.getNormalMatrix(M);
    const p = [vec(0, 0, 0), vec(0, 0, 0), vec(0, 0, 0), vec(0, 0, 0)];
    for (const f of FACES) {
      const nn = tmpV.set(f.n[0], f.n[1], f.n[2]).applyMatrix3(nm).normalize().clone();
      for (let i = 0; i < 4; i++) p[i]!.set(f.v[i]![0], f.v[i]![1], f.v[i]![2]).applyMatrix4(M);
      for (const i of [0, 1, 2, 0, 2, 3]) this.b.push(this.joint, kind, p[i]!, nn, color, alpha, flat);
    }
  }

  /** 半透明・光る 箱（影なし） */
  glowBox(w: number, h: number, d: number, x: number, y: number, z: number, color: number, alpha: number, rot?: [number, number, number]): void {
    const q = rot ? new Quaternion().setFromEuler(new Euler(rot[0], rot[1], rot[2], 'XYZ')) : new Quaternion();
    const M = tmpM.copy(this.m).multiply(new Matrix4().compose(vec(x, y, z), q, vec(w, h, d)));
    this.quads(M, color, 'glow', alpha, 1);
  }

  /** Extrude・Cylinder など 形の 頂点を 入れる。local は 形の 中の 変形 */
  geom(g: BufferGeometry, color: number, local?: Matrix4, kind: Kind = 'main', alpha = 1): void {
    const gg = g.index ? g.toNonIndexed() : g;
    const M = tmpM.copy(this.m);
    if (local) M.multiply(local);
    const nm = new Matrix3().getNormalMatrix(M);
    const pa = gg.getAttribute('position'), na = gg.getAttribute('normal');
    for (let i = 0; i < pa.count; i++) {
      tmpP.fromBufferAttribute(pa, i).applyMatrix4(M);
      const n = vec(na.getX(i), na.getY(i), na.getZ(i)).applyMatrix3(nm).normalize();
      this.b.push(this.joint, kind, tmpP, n, color, alpha);
    }
  }

  /** 線の ように のびた 箱（a → b。from〜to で 一部だけ）。幅 w は 左右、厚み h は 上下 */
  seg(a: Vector3, b: Vector3, w: number, h: number, color: number, from = 0, to = 1): void {
    const A = a.clone().lerp(b, from), B = a.clone().lerp(b, to);
    const d = B.clone().sub(A);
    const len = d.length();
    const { q } = frameOf(d.clone().normalize());
    const mid = A.clone().add(B).multiplyScalar(0.5);
    const M = tmpM.copy(this.m).multiply(new Matrix4().compose(mid, q, vec(w, h, len)));
    this.quads(M, color, 'main');
  }

  /** 当たりの 箱を 足す（この 場所の 箱と おなじ 大きさ・向き）。親に 左右で ちがう 拡大が ある 所では 使わない */
  hit(name: string, w: number, h: number, d: number, x: number, y: number, z: number, rot?: [number, number, number]): void {
    const q = rot ? new Quaternion().setFromEuler(new Euler(rot[0], rot[1], rot[2], 'XYZ')) : new Quaternion();
    this.hitM(name, this.m.clone().multiply(new Matrix4().compose(vec(x, y, z), q, vec(1, 1, 1))), w, h, d);
  }

  /** 線の ように のびた 箱（`seg` と おなじ 場所・向き）の 当たりを 足す。親に 左右で ちがう 拡大が ある 所では 使わない */
  segHit(name: string, a: Vector3, b: Vector3, w: number, h: number, from = 0, to = 1): void {
    const A = a.clone().lerp(b, from), B = a.clone().lerp(b, to);
    const dd = B.clone().sub(A);
    const { q } = frameOf(dd.clone().normalize());
    const mid = A.clone().add(B).multiplyScalar(0.5);
    this.hitM(name, this.m.clone().multiply(new Matrix4().compose(mid, q, vec(1, 1, 1))), w, h, dd.length());
  }

  private hitM(name: string, M: Matrix4, w: number, h: number, d: number): void {
    const pos = new Vector3(), qq = new Quaternion(), sc = new Vector3();
    M.decompose(pos, qq, sc);
    this.b.hits.push({
      name, joint: this.joint, c: pos,
      axes: [vec(1, 0, 0).applyQuaternion(qq), vec(0, 1, 0).applyQuaternion(qq), vec(0, 0, 1).applyQuaternion(qq)],
      half: [(w * sc.x) / 2, (h * sc.y) / 2, (d * sc.z) / 2],
    });
  }
}

/** 向き u の 線に 沿った 箱の 回転（幅 = 横、厚み = 上、長さ = u）。横は 世界の 上と u に 垂直 */
export function frameOf(u: Vector3): { q: Quaternion; side: Vector3; n: Vector3 } {
  let side = new Vector3().crossVectors(UP, u);
  if (side.lengthSq() < 1e-6) side = vec(1, 0, 0);
  side.normalize();
  const n = new Vector3().crossVectors(u, side).normalize();
  const q = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(side, n, u));
  return { q, side, n };
}


export function makeRnd(seed: number): () => number {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

export const octShape = (r: number, hole?: number): Shape => {
  const sh = new Shape();
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + Math.PI / 8; const px = Math.sin(a) * r, py = Math.cos(a) * r; if (i) sh.lineTo(px, py); else sh.moveTo(px, py); }
  if (hole !== undefined) {
    const ho = new Path(); const hh = hole / 2;
    ho.moveTo(-hh, -hh); ho.lineTo(-hh, hh); ho.lineTo(hh, hh); ho.lineTo(hh, -hh); ho.lineTo(-hh, -hh);
    sh.holes.push(ho);
  }
  return sh;
};
