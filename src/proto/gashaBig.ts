/**
 * #293 試作（開発サーバーだけ）: 大きい がしゃどくろ（第一形態）の 見た目 と 登れる 当たり。
 * `?proto=gashaBig` のときだけ main.ts から 読まれる。見た目は design-v1 の C 案（黒の セーラー ＋ ピンクの スカーフ）を 箱で 作った もの。
 * ・上半身は 関節ごとの Group（Meshy の 人型の 骨の 名前と おなじ: Hips, Spine, Spine01, Spine02, neck, Head, Left/Right の Shoulder・Arm・ForeArm・Hand）。
 *   原点は 関節の 場所（回転の 中心）。休みの 姿勢では ぜんぶ 回転なし（向きは からだの 座標と おなじ）。`__gashaBig.joints()` で 名前 → Group。
 * ・描画回数を へらす ため、箱は 関節ごとに まとめて 1 つの メッシュに する。ゲームに 光源は ないので MeshBasicMaterial ＋ 頂点の 色で、面の 向きごとに 明るさを かえて 立体に 見せる。
 * ・当たりは 見えない 箱（OBB）で、関節の Group に ついて 動く。プレイヤーの 当たりは ブロック（isSolidForPlayer）でしか 当たらないので、箱を ブロックの マスに 直して
 *   「追加の 固いマス」として 足す（deps.addPlayerSolid）。うでを 動かしたら `refreshColliders()` で 作りなおす。
 * ・目は ふだん 白、`__gashaBig.angry(true)` で 赤。
 * 数は ぜんぶ gashaBigTuning.ts。
 */
import {
  BufferGeometry, Color, CylinderGeometry, DoubleSide, Euler, ExtrudeGeometry, Float32BufferAttribute, Group, IcosahedronGeometry, Matrix3, Matrix4,
  Mesh, MeshBasicMaterial, OctahedronGeometry, Path, Quaternion, Shape, Vector3, type Camera, type Scene,
} from 'three';
import { TUNE as T, applyTune, applyTuneFromUrl } from './gashaBigTuning';
import { BigActor, type ActorClips } from './gashaBigActor';
import { sharedGashaBgm } from './gashaBgm';
import climbL from './gashaBigClips/climbL.json';
import climbR from './gashaBigClips/climbR.json';
import lookBackClip from './gashaBigClips/lookBack.json';

export interface GashaBigDeps {
  scene: Scene;
  camera: Camera;
  /** プレイヤーの いま の 位置と 向き（度） */
  player(): { x: number; y: number; z: number; yawDeg: number };
  /** 地面の いちばん 上の ブロックの 高さ（立つ 面は +1） */
  groundY(x: number, z: number): number;
  /** プレイヤーの 当たりに「追加の 固いマス」を 足す（isSolidForPlayer に 重ねる） */
  addPlayerSolid(fn: (x: number, y: number, z: number) => boolean): void;
  /** 毎ステップ（1/60 秒）呼ばれる 処理を 登録する（はって 進む・目の 色・のっている 人）。なければ うごかない */
  onUpdate?(fn: (dt: number) => void): void;
  /** のっている プレイヤーを 動かす（位置の ずれ、向き（度）の ずれ）。なければ 運ばない */
  carryPlayer?(dx: number, dy: number, dz: number, dYawDeg: number): void;
  /** BGM の ミキサーの 口（少女と おなじ）。なければ BGM は 流さない */
  bgmOut?(): { ctx: AudioContext; bus: AudioNode } | null;
  /** ふだんの BGM を 止める（少女と おなじ。曲が 流れて いる 間） */
  suppressBgm?(on: boolean): void;
  /** 手の まわりの 地面を ならす 用（ワールドの ブロックを 箱で おきかえる。読みこんで いない 所は 変わらない）。なければ ならさない */
  fillBlocks?(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, id: 'grass' | 'air'): void;
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
  return Math.min(1, 0.56 + 0.44 * l * 1.15);
}

const vec = (x: number, y: number, z: number) => new Vector3(x, y, z);
const UP = vec(0, 1, 0);

// ---------------------------------------------------------------- 関節
export const JOINT_NAMES = [
  'Hips', 'Spine', 'Spine01', 'Spine02', 'neck', 'Head',
  'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand',
  'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand',
] as const;
export type JointName = (typeof JOINT_NAMES)[number];
const PARENT: Record<JointName, JointName | null> = {
  Hips: null, Spine: 'Hips', Spine01: 'Spine', Spine02: 'Spine01', neck: 'Spine02', Head: 'neck',
  LeftShoulder: 'Spine02', LeftArm: 'LeftShoulder', LeftForeArm: 'LeftArm', LeftHand: 'LeftForeArm',
  RightShoulder: 'Spine02', RightArm: 'RightShoulder', RightForeArm: 'RightArm', RightHand: 'RightForeArm',
};

// ---------------------------------------------------------------- 箱を ためて まとめる
/** 1 つの 関節の 中の 種類。main = ふつうの 箱（面ごとに 明るさ）、ほかは 影なし */
type Kind = 'main' | 'bright' | 'eyes' | 'eyeHalo' | 'brow' | 'glow' | 'glass';
const SHADED: Record<Kind, boolean> = { main: true, bright: false, eyes: false, eyeHalo: false, brow: true, glow: false, glass: false };
const RGBA = new Set<Kind>(['glow', 'glass']);

class Bucket {
  pos: number[] = [];
  col: number[] = [];
  constructor(readonly joint: JointName, readonly kind: Kind) {}
  get rgba(): boolean { return RGBA.has(this.kind); }
}

export interface Hit {
  name: string;
  /** どの 関節に ついて 動くか */
  joint: JointName;
  /** もとの 座標（からだ ぜんたいの 休みの 姿勢）での 中心・3 本の 軸（長さ 1）・はんぶんの 大きさ */
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
  readonly buckets = new Map<string, Bucket>();
  readonly hits: Hit[] = [];
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

class Node {
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
    const M = this.m.clone().multiply(new Matrix4().compose(vec(x, y, z), q, vec(1, 1, 1)));
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

// ---------------------------------------------------------------- すりガラスの 雲（はしごの 段 と もくもく雲）
const smooth = (a: number, c: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (c - a))); return t * t * (3 - 2 * t); };
const lerpA = (r: readonly [number, number], f: number): number => r[0] + (r[1] - r[0]) * f;

/** 頂点を すりガラスの 色で ためる（上 = alphaTop、横 = alphaSide でふちが 少し 明るい、下 = alphaBottom）。fade は 形の 中の 場所（x, y）ごとの 濃さの 倍率 */
function pushGlass(b: Builder, joint: JointName, geo: BufferGeometry, M: Matrix4, fade?: (lx: number, ly: number) => number, mul = 1): void {
  const g = T.glass;
  const gg = geo.index ? geo.toNonIndexed() : geo;
  const nm = new Matrix3().getNormalMatrix(M);
  const pa = gg.getAttribute('position'), na = gg.getAttribute('normal');
  const bk = b.bucket(joint, 'glass');
  const white = new Color(0xffffff);
  for (let i = 0; i < pa.count; i++) {
    const lx = pa.getX(i), ly = pa.getY(i);
    tmpP.fromBufferAttribute(pa, i).applyMatrix4(M);
    const t = vec(na.getX(i), na.getY(i), na.getZ(i)).applyMatrix3(nm).normalize().y;
    const alpha = (t >= 0 ? g.alphaSide + (g.alphaTop - g.alphaSide) * t : g.alphaSide + (g.alphaBottom - g.alphaSide) * -t) * (fade ? fade(lx, ly) : 1) * mul;
    tmpC.setHex(g.color).lerp(white, (1 - Math.abs(t)) * 0.7);
    bk.pos.push(tmpP.x, tmpP.y, tmpP.z);
    bk.col.push(tmpC.r, tmpC.g, tmpC.b, alpha);
  }
  if (gg !== geo) gg.dispose();
}

/** 雲の 平面の 形（長さ L × はば W の 角の 丸い 形） */
function blobOutline(L: number, W: number, bump: number): Shape {
  const N = 24, sh = new Shape();
  for (let k = 0; k < N; k++) {
    const th = (k / N) * Math.PI * 2;
    const c = Math.cos(th), s = Math.sin(th);
    const bu = 1 + bump * Math.sin(th * 5 + 1.3);
    const x = (L / 2) * Math.sign(c) * Math.pow(Math.abs(c), 0.5) * bu;
    const z = (W / 2) * Math.sign(s) * Math.pow(Math.abs(s), 0.5) * bu;
    if (k) sh.lineTo(x, z); else sh.moveTo(x, z);
  }
  return sh;
}

/** 平らな 段（すじ雲）の 形。まんなかの flat の 割合は 幅が そろって 平ら、はしは 細く とがる */
function rungOutline(L: number, D: number, flat: number): Shape {
  const N = 12, sh = new Shape();
  const prof = (s: number): number => { const a = Math.abs(s); if (a <= flat) return 1; const e = (a - flat) / (1 - flat); return Math.max(0.05, Math.pow(Math.max(0, 1 - e * e), 0.6)); };
  for (let i = 0; i <= N; i++) { const s = -1 + (2 * i) / N; if (i) sh.lineTo((s * L) / 2, (D / 2) * prof(s)); else sh.moveTo((s * L) / 2, (D / 2) * prof(s)); }
  for (let i = N; i >= 0; i--) { const s = -1 + (2 * i) / N; sh.lineTo((s * L) / 2, (-D / 2) * prof(s)); }
  return sh;
}

const ICO = new IcosahedronGeometry(1, 1);

/** 形（平面）を おしだした 板を 置く。形の x → u、y → 横、おしだし → 上。板の 上の 面が 高さ top に なる */
function putSlab(b: Builder, joint: JointName, shape: Shape, thick: number, c: Vector3, u: Vector3, fade?: (lx: number, ly: number) => number, mul = 1): void {
  const bt = Math.min(0.25, thick * 0.3), bs = 0.25;
  const geo = new ExtrudeGeometry(shape, { depth: Math.max(0.2, thick - 2 * bt), bevelEnabled: true, bevelThickness: bt, bevelSize: bs, bevelSegments: 1, curveSegments: 1 });
  const side = new Vector3().crossVectors(vec(0, 1, 0), u);
  const M = new Matrix4().makeTranslation(c.x, c.y, c.z).multiply(new Matrix4().makeBasis(u, side, vec(0, 1, 0))).multiply(new Matrix4().makeTranslation(0, 0, -(thick - bt)));
  pushGlass(b, joint, geo, M, fade, mul);
  geo.dispose();
}

/** ぶらさがる もくもく（だ円体） */
function putLobe(b: Builder, joint: JointName, c: Vector3, rx: number, ry: number, rz: number, mul = 1): void {
  pushGlass(b, joint, ICO, new Matrix4().compose(c, new Quaternion(), vec(rx, ry, rz)), undefined, mul);
}

interface RungOpts { joint: JointName; c: Vector3; tx: number; tz: number; f: number; len?: readonly [number, number]; name: string; rnd: () => number }

/** はしごの 段を 1 つ。c = 道の 上の 点（y = 上の 面の 高さ）、(tx, tz) = 道の 向き。段は 道と 直角に 長い */
function rung(b: Builder, o: RungOpts): void {
  const Ld = T.ladder, rnd = o.rnd;
  const D = lerpA(Ld.depth, o.f), L = lerpA(o.len ?? Ld.length, o.f) * (0.92 + 0.16 * rnd());
  const a = ((rnd() - 0.5) * Ld.tiltDeg * Math.PI) / 180; // 道と 直角から の かたむき（全はば tiltDeg）
  const lx = -o.tz, lz = o.tx;
  const u = vec(lx * Math.cos(a) + lz * Math.sin(a), 0, -lx * Math.sin(a) + lz * Math.cos(a)).normalize();
  const c = o.c.clone().addScaledVector(vec(lx, 0, lz), (rnd() - 0.5) * 2 * Ld.stagger * L);
  const half = L / 2, flat = Ld.flat, ea = Ld.edgeAlpha;
  const fadeOf = (w: number) => (lx0: number): number => { const s = Math.min(1, Math.abs(lx0) / w); return s <= flat ? 1 : 1 + (ea - 1) * smooth(flat, 1, s); };
  putSlab(b, o.joint, rungOutline(L, D, flat), Ld.thick, c, u, fadeOf(half));
  // すじの 重なり（下に ずらして うすく）
  for (let k = 1; k <= Ld.layers; k++) {
    const Lk = L * (0.82 - 0.16 * k), Dk = D * (1.0 + 0.12 * k);
    const ck = c.clone().addScaledVector(u, (rnd() - 0.5) * L * 0.3); ck.y -= 0.55 * k;
    putSlab(b, o.joint, rungOutline(Lk, Dk, flat), 0.45, ck, u, fadeOf(Lk / 2), 0.7);
  }
  // 下から ぶらさがる もくもく（上の 段ほど おおい）
  const nl = Math.round(lerpA(Ld.lobes, o.f));
  const side = new Vector3().crossVectors(vec(0, 1, 0), u);
  for (let k = 0; k < nl; k++) {
    const r = D * (0.36 + 0.14 * rnd());
    const p = c.clone().addScaledVector(u, (rnd() - 0.5) * 2 * half * flat * 0.9).addScaledVector(side, (rnd() - 0.5) * D * 0.3);
    p.y = c.y - Ld.thick * 0.5 - r * 0.7;
    putLobe(b, o.joint, p, r * 1.3, r * 0.8, r, 0.8);
  }
  // 当たり: 平らな 部分（長さの flat 割合 × ふかさの 9 割）。上の 面が 見た目と そろう
  b.hits.push({ name: o.name, joint: o.joint, c: o.c.clone().setX(c.x).setZ(c.z).setY(c.y - Ld.thick / 2), axes: [u.clone(), vec(0, 1, 0), side.clone()], half: [(L * flat) / 2, Ld.thick / 2, D * 0.45] });
}

/** もくもく雲を 1 つ（木くらいの 大きさ）。平らな 上の 面 ＋ まわりと 下の ふくらみ。上の 面が そのまま 当たり */
function puff(b: Builder, o: { joint: JointName; cx: number; top: number; cz: number; w: number; yaw: number; lobes: number; name: string; rnd: () => number }): void {
  const rnd = o.rnd, thick = 1.6, w = o.w, d = w * (0.82 + 0.2 * rnd());
  const u = vec(Math.cos(o.yaw), 0, Math.sin(o.yaw));
  const side = new Vector3().crossVectors(vec(0, 1, 0), u);
  const c = vec(o.cx, o.top, o.cz);
  putSlab(b, o.joint, blobOutline(w, d, 0.035), thick, c, u);
  for (let k = 0; k < o.lobes; k++) {
    const ang = (k / o.lobes) * Math.PI * 2 + rnd() * 0.9;
    const r = w * (0.2 + 0.08 * rnd());
    const p = c.clone().addScaledVector(u, Math.cos(ang) * w * 0.34).addScaledVector(side, Math.sin(ang) * d * 0.34);
    p.y = o.top - r * 0.9 - 0.25;
    putLobe(b, o.joint, p, r, r * 0.85, r);
  }
  putLobe(b, o.joint, vec(o.cx, o.top - thick - w * 0.12, o.cz), w * 0.3, w * 0.2, w * 0.28, 0.9);
  const fill = T.collide.cloudFill;
  b.hits.push({ name: o.name, joint: o.joint, c: vec(o.cx, o.top - thick / 2, o.cz), axes: [u.clone(), vec(0, 1, 0), side.clone()], half: [(w * fill) / 2, thick / 2, (d * fill) / 2] });
}

/** 道（[x, z, y?] の 点）を 間かくごとの 点に する。y を 書いた 点の 間は 道の 長さで わりふる */
function pathPoints(pts: number[][], spacing: number, skipFirst: boolean): { x: number; y: number; z: number; tx: number; tz: number }[] {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1]! + Math.hypot(pts[i]![0]! - pts[i - 1]![0]!, pts[i]![1]! - pts[i - 1]![1]!));
  const total = cum[cum.length - 1]!;
  const ys: { d: number; y: number }[] = [];
  pts.forEach((p, i) => { if (p[2] !== undefined) ys.push({ d: cum[i]!, y: p[2] }); });
  if (ys.length < 2 || ys[0]!.d !== 0 || ys[ys.length - 1]!.d !== total) throw new Error('道の はしの 点には y が いる');
  const out: { x: number; y: number; z: number; tx: number; tz: number }[] = [];
  const n = Math.max(1, Math.round(total / spacing));
  for (let k = skipFirst ? 1 : 0; k <= n; k++) {
    const d = (total * k) / n;
    let i = 1;
    while (i < pts.length - 1 && cum[i]! < d) i++;
    const a = pts[i - 1]!, c = pts[i]!, seg = cum[i]! - cum[i - 1]!;
    const f = seg > 0 ? (d - cum[i - 1]!) / seg : 0;
    let j = 1;
    while (j < ys.length - 1 && ys[j]!.d < d) j++;
    const y0 = ys[j - 1]!, y1 = ys[j]!;
    const y = y0.y + (y1.y - y0.y) * ((d - y0.d) / (y1.d - y0.d || 1));
    const tl = Math.hypot(c[0]! - a[0]!, c[1]! - a[1]!) || 1;
    out.push({ x: a[0]! + (c[0]! - a[0]!) * f, y, z: a[1]! + (c[1]! - a[1]!) * f, tx: (c[0]! - a[0]!) / tl, tz: (c[1]! - a[1]!) / tl });
  }
  return out;
}

const jointForY = (y: number): JointName => (y < 20 ? 'Hips' : y < 50 ? 'Spine02' : 'Head');

// ---------------------------------------------------------------- 本体
export interface BigModel {
  /** ぜんたいの 親（位置・向き・拡大は これに つける） */
  group: Group;
  /** 関節ごとの Group（Hips が group の 子） */
  joints: Record<JointName, Group>;
  /** 休みの 姿勢での 関節の 位置（からだの 座標） */
  rest: Record<JointName, Vector3>;
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
  /** 雲の はしごの はじめの 段の 場所（もとの 座標）。この まわりの 地面も ならす */
  stairPts: Vector3[];
  meshes: number;
}

export function buildBig(): BigModel {
  const b = new Builder();
  const rnd = makeRnd(7);
  const PITCH = 0.55;
  const HIP = vec(0, 4, -14);
  const Tt = (x: number, y: number, z: number) => vec(x * 1.45, y * 1.1, z * 1.3).applyAxisAngle(vec(1, 0, 0), PITCH).add(HIP);
  const A = T.arm;

  // 関節の 場所（休みの 姿勢）
  const hn = Tt(0, 38, -6);
  const headPos = vec(hn.x, hn.y + 0.6, hn.z + 5.6);
  const rest = {
    Hips: HIP.clone(), Spine: Tt(0, 6, -6), Spine01: Tt(0, 16, -6), Spine02: Tt(0, 26, -6), neck: Tt(0, 36, -6), Head: headPos.clone(),
  } as Record<JointName, Vector3>;
  const armPts: Record<string, { S: Vector3; E: Vector3; Wr: Vector3 }> = {};
  for (const s of [-1, 1]) {
    const nm = s > 0 ? 'Left' : 'Right';
    const S = Tt(s * 12.5, 33.2, -0.5);
    const E = S.clone().add(vec(s * A.upper[0], A.upper[1], A.upper[2]));
    const Wr = E.clone().add(vec(s * A.fore[0], A.fore[1], A.fore[2]));
    rest[`${nm}Shoulder` as JointName] = Tt(s * 4, 34.5, 1.4);
    rest[`${nm}Arm` as JointName] = S; rest[`${nm}ForeArm` as JointName] = E; rest[`${nm}Hand` as JointName] = Wr;
    armPts[nm] = { S, E, Wr };
  }

  const moss = (p: Node, x: number, y: number, z: number, n = 3, spread = 1.6): void => {
    for (let i = 0; i < n; i++) {
      const s = 0.7 + rnd() * 1.3;
      p.box(s, 0.5 + rnd() * 0.6, s, x + (rnd() - 0.5) * spread, y + rnd() * 0.3, z + (rnd() - 0.5) * spread, MOSS[Math.floor(rnd() * 3)]!);
    }
  };
  const mossAlong = (p: Node, a: Vector3, bb: Vector3, ts: number[], up = 1.4): void => {
    for (const t of ts) { const c = a.clone().lerp(bb, t); moss(p, c.x, c.y + up, c.z, 3, 1.8); }
  };

  // --- 胴体（背骨・ろっ骨・ぼろぼろセーラー服）。箱は ついて 動く 関節ごとに 分ける。ここには 当たりを 置かない（拡大が 左右で ちがう ため）
  const torso = b.root('Spine02').group(HIP.x, HIP.y, HIP.z, [PITCH, 0, 0], [1.45, 1.1, 1.3]);
  const tj = (j: JointName) => torso.at(j);
  const vJoint = (i: number): JointName => (i < 3 ? 'Hips' : i < 9 ? 'Spine' : i < 15 ? 'Spine01' : 'Spine02');
  tj('Spine01').box(9, 24, 1.0, 0, 24, -5.0, 0x5a463c);
  for (let i = 0; i < 20; i++) {
    const y = 3 + i * 2.05, w = 3.3 + (i % 2) * 0.6, t = tj(vJoint(i));
    t.box(w, 1.8, 3.2, 0, y, -7.2, i % 2 ? BONE : BONE_D);
    t.box(1.2, 1.3, 2.4, 0, y, -9.0, i % 2 ? BONE_D : BONE);
    if (i > 6 && i < 17) moss(t, 0.8 * (i % 3 - 1), y + 0.8, -8.6, 1, 1);
  }
  for (let i = 0; i < 3; i++) tj('neck').box(2.6, 1.5, 2.6, 0, 38.5 + i * 1.6, -6.2 + i * 0.4, i % 2 ? BONE : BONE_D);
  const RIB_LV = 7;
  for (let i = 0; i < RIB_LV; i++) {
    const y = 15.5 + i * 2.75, a = 8 + 3.6 * Math.sin(Math.PI * (i + 1.1) / (RIB_LV + 1.6)), bb = a * 0.72;
    const t = tj(i < 2 ? 'Spine01' : 'Spine02');
    for (const s of [-1, 1]) {
      let prev: Vector3 | null = null;
      for (let k = 0; k <= 7; k++) {
        const phi = 0.12 + (k / 7) * Math.PI * 0.82;
        const p = vec(s * a * Math.sin(phi), y - (k > 5 ? 0.4 : 0) - 0.12 * k, bb * Math.cos(phi) * (phi > 1.6 ? 0.92 : 1) + 0.3);
        if (prev) t.seg(prev, p, 1.8, 1.75, k % 2 ? BONE : BONE_D);
        prev = p;
      }
      t.box(1.9, 1.9, 1.9, s * 1.3, y, bb + 0.5, BONE_D);
    }
  }
  const chest = tj('Spine02');
  chest.box(2.4, 20, 1.5, 0, 24, 6.7, BONE);
  chest.box(1.6, 17, 1.2, 0, 24, 7.5, BONE_D);
  chest.box(24, 2.2, 2.4, 0, 34.5, 1.4, BONE);
  for (const s of [-1, 1]) {
    const sh = tj(s > 0 ? 'LeftShoulder' : 'RightShoulder');
    sh.box(6, 2, 8, s * 11.5, 34.7, -3, BONE_D); // けんこうこつ
    sh.box(6.5, 3.6, 8.5, s * 11, 35.4, -3, C.top); // かたの ぬの
    moss(sh, s * 12, 37, -1.5, 3, 3);
  }
  moss(chest, -3, 36, 1.4, 4, 3); moss(chest, 7, 36, 0.5, 3, 3);
  // ぼろぼろセーラー服
  const cl = C.top, cd = C.topDark;
  const rag = (p: Node, w: number, h: number, d: number, x: number, y: number, z: number, c: number, teeth = 3, rot?: [number, number, number]): void => {
    const g = p.group(x, y, z, rot);
    g.box(w, h, d, 0, 0, 0, c);
    for (let i = 0; i < teeth; i++) g.box(w / teeth * 0.7, 0.8 + rnd() * 2.2, d, -w / 2 + (i + 0.5) * (w / teeth), -h / 2 - 0.4 - (i % 2) * 0.8, 0, c);
  };
  rag(tj('Spine'), 6.2, 9, 0.7, -5.3, 14, -8.6, cl, 3); rag(tj('Spine'), 6.2, 7, 0.7, 5.3, 13, -8.6, cl, 3);
  rag(tj('Spine01'), 2.2, 5, 0.8, -14.5, 21, -1.5, cl, 2, [0, -1.2, 0.1]);
  rag(tj('Spine01'), 2.2, 6, 0.8, 14.8, 20, -1.5, cl, 2, [0, 1.2, -0.08]);
  rag(tj('Spine'), 4.0, 4, 0.8, -4.5, 11.5, 7.4, cl, 3, [0, 0, 0.15]);
  rag(tj('Spine'), 5.5, 3, 0.8, 5.0, 10.5, 7.6, cl, 3, [0, 0, -0.2]);
  for (const s of [-1, 1]) {
    chest.seg(vec(s * 11.8, 37.0, 0.5), vec(s * 0.8, 29.5, 8.3), 4.2, 0.9, cd);
    chest.seg(vec(s * 11.8, 37.3, 0.5), vec(s * 1.4, 30.2, 8.7), 0.9, 0.6, C.stripe, 0.0, 0.95);
    chest.seg(vec(s * 11.3, 36.4, 1.5), vec(s * 0.6, 28.8, 8.8), 0.9, 0.6, C.stripe, 0.1, 0.95);
  }
  chest.box(15, 0.9, 9.5, 0, 37.6, -4.2, cd);
  chest.box(15.4, 0.5, 0.7, 0, 37.9, -9.0, C.stripe);
  {
    const g = chest.group(0, 29.4, 9.4, [-0.1, 0, 0]);
    g.box(3.2, 3.2, 1.8, 0, 0, 0.3, C.scarf2);
    g.box(4.6, 2.8, 1.2, -3.6, 0.4, 0, C.scarf, [0, 0, 0.3]); g.box(4.6, 2.8, 1.2, 3.6, 0.4, 0, C.scarf, [0, 0, -0.3]);
    g.box(1.8, 6.5, 0.9, -1.1, -4.4, 0.1, C.scarf, [0, 0, 0.12]); g.box(1.8, 5.0, 0.9, 1.2, -3.8, 0.1, C.scarf2, [0, 0, -0.12]);
  }
  // 缶バッジ と 鈴
  chest.geom(new CylinderGeometry(1.7, 1.7, 0.5, 10), 0xffd84a, new Matrix4().compose(vec(-7.0, 33.2, 9.2), new Quaternion().setFromEuler(new Euler(Math.PI / 2, 0, 0)), vec(1, 1, 1)));
  chest.box(1.2, 0.3, 0.3, -7.0, 33.2, 9.5, INK); chest.box(0.3, 0.3, 0.3, -7.6, 33.8, 9.5, INK); chest.box(0.3, 0.3, 0.3, -6.4, 33.8, 9.5, INK);
  chest.box(1.2, 1.2, 0.4, -7.0, 31.2, 9.4, 0xf27aa8);
  chest.box(2.0, 2.0, 2.0, 6.6, 31.6, 9.0, 0xffd23a); chest.box(2.0, 0.35, 2.05, 6.6, 31.6, 9.0, 0xc9a020); chest.box(0.5, 0.5, 2.1, 6.6, 31.0, 9.0, 0x6a4a10);
  chest.box(1.2, 0.6, 0.6, 6.6, 33.0, 9.0, 0xf27aa8);

  // --- あたま（関節 Head）
  const headYaw = (T.place.headYawDeg * Math.PI) / 180;
  const head = b.root('Head').group(headPos.x, headPos.y, headPos.z, [0.17, headYaw, 0], undefined, 'YXZ');
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
  // 頭がいの 当たり
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
  moss(head, -5, 18.6, 3, 5, 4); moss(head, -2, 20.4, -5, 3, 3); moss(head, 6, 19.4, -4, 3, 3); moss(head, 7, 17.5, 5, 4, 3); moss(head, -9.5, 11, -2, 3, 3); moss(head, 4, 17.8, -6, 4, 3); moss(head, 10.6, 12, 2, 3, 2);
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
    const qa = new Quaternion().setFromUnitVectors(vec(0, 0, 1), d);
    const ga = new Node(b, 'Head', g.m.clone().multiply(new Matrix4().makeRotationFromQuaternion(qa)));
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
    const nmS = s > 0 ? 'Left' : 'Right', sd = s < 0 ? 'R' : 'L';
    const { S, E, Wr } = armPts[nmS]!;
    const jA = `${nmS}Arm` as JointName, jF = `${nmS}ForeArm` as JointName, jH = `${nmS}Hand` as JointName;
    const upper = b.root(jA), fore = b.root(jF), hand = b.root(jH);
    const uF = Wr.clone().sub(E).normalize();
    // 上わん（そで ぼろぼろ）: 関節 Arm
    upper.box(4.6, 4.6, 4.6, S.x, S.y, S.z, BONE_D); // かたの 関節
    upper.seg(S, E, 3.6, 3.6, BONE); upper.seg(S, E, 1.2, 1.2, BONE_D, 0.1, 0.9);
    mossAlong(upper, S, E, [0.2, 0.55, 0.8], 2.0);
    upper.seg(S, E, 6.0, A.upperThick, cl, -0.08, 0.5);
    upper.seg(S, E, 6.4, A.upperThick + 0.4, C.stripe, 0.46, 0.5); upper.seg(S, E, 6.0, A.upperThick, cd, 0.5, 0.56);
    for (let i = 0; i < 3; i++) { const c = S.clone().lerp(E, 0.58 + i * 0.01); upper.box(1.6, 2.4, 1.6, c.x + (i - 1) * 2.1, c.y - 0.6 - (i % 2) * 0.9, c.z + 1.0, cd); }
    // 前わん: 関節 ForeArm
    fore.box(4.4, 4.4, 4.4, E.x, E.y, E.z, BONE_D); fore.box(3.6, 3.6, 3.6, E.x, E.y + 0.3, E.z, BONE);
    fore.seg(E, Wr, A.foreWidth, A.foreThick, BONE); fore.seg(E.clone().add(vec(1.1 * s, 0.3, 0)), Wr.clone().add(vec(1.1 * s, 0.3, 0)), 1.2, 1.2, BONE_D);
    mossAlong(fore, E, Wr, [0.3, 0.6], 1.9);
    // 手: 関節 Hand（てのひら と 指。先に ネイル。地面に ぺたんと）
    hand.box(A.foreWidth - 0.4, 3.0, 3.6, Wr.x, Wr.y, Wr.z, BONE_D);
    const palmZ = Wr.z + 3.4, palmX = Wr.x;
    hand.box(6.4, th, 7.0, palmX, th / 2, palmZ, BONE_D); hand.box(5.6, th, 6.2, palmX, th / 2 + 0.05, palmZ + 0.4, BONE);
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
        hand.seg(p, n, 1.25, Math.min(1.15, th * 0.95), k % 2 ? BONE : BONE_D);
        hand.box(1.5, Math.min(1.4, th), 1.5, p.x, p.y, p.z, BONE_D);
        p = n;
      });
      tipZ = Math.max(tipZ, p.z);
      const eu = new Euler().setFromQuaternion(new Quaternion().setFromUnitVectors(vec(0, 0, 1), dir.clone().normalize()));
      const tip = p.clone().addScaledVector(dir, 0.2).add(vec(0, 0.45, 0));
      hand.box(1.15, 0.55, 1.5, tip.x, tip.y, tip.z, nailColor(nailI++), [eu.x, eu.y, eu.z]);
    }
    groundPts.push(vec(palmX, 0, palmZ), vec(palmX, 0, tipZ));
    // ---- 当たり（のぼる 道）。目に 見える 面と そろえる
    const lineHit = (name: string, joint: JointName, a: Vector3, bb: Vector3, width: number, thick: number): void => {
      const u = bb.clone().sub(a), len = u.length(); u.normalize();
      const { side, n } = frameOf(u);
      b.hits.push({ name, joint, c: a.clone().add(bb).multiplyScalar(0.5), axes: [side, n, u], half: [width / 2, thick / 2, len / 2] });
    };
    // 上わんの 当たりは ひじの 先まで 少し のばして、前わんの 当たりと かさねる（つなぎ目の 段を なくす）
    lineHit(`upperArm${sd}`, jA, S, E.clone().addScaledVector(E.clone().sub(S).normalize(), A.elbowExtend), A.upperWidth, A.upperThick - 0.4);
    // 前わんは 手首の 先まで 少し のばして 手に つなぐ（手首が 浮いて 見えても 段が 1 つに なる）
    lineHit(`foreArm${sd}`, jF, E, Wr.clone().addScaledVector(uF, A.foreExtend), A.foreWidth - 0.2, A.foreThick - 0.2);
    b.hits.push({ name: `hand${sd}`, joint: jH, c: vec(palmX, th / 2, (palmZ - 3.5 + tipZ) / 2), axes: [vec(1, 0, 0), vec(0, 1, 0), vec(0, 0, 1)], half: [3.4, th / 2, (tipZ - palmZ + 3.5) / 2] });
  }

  const stairPts: Vector3[] = [];
  // --- 雲の はしご（地面 → こし → 肩 → リボン → 頭の 上）と、こしの もくもく雲。上の 面が そのまま 当たり
  {
    const Ld = T.ladder, rr = makeRnd(Ld.seed);
    const routes: { key: string; pts: number[][]; skipFirst: boolean; len?: readonly [number, number] }[] = [
      { key: 'climb', pts: Ld.climb, skipFirst: false },
      { key: 'link', pts: Ld.link, skipFirst: true, len: Ld.linkLength },
      { key: 'ramp', pts: Ld.ramp, skipFirst: true, len: Ld.rampLength },
      { key: 'head', pts: Ld.head, skipFirst: true, len: Ld.headLength },
    ];
    for (const s of [-1, 1]) {
      const sd = s < 0 ? 'R' : 'L';
      for (const r of routes) {
        const pts = r.pts.map((p) => (p.length > 2 ? [s * p[0]!, p[1]!, p[2]!] : [s * p[0]!, p[1]!]));
        pathPoints(pts, Ld.spacing, r.skipFirst).forEach((q, i) => {
          if (r.key === 'climb' && i < T.place.stairPadRungs) stairPts.push(vec(q.x, 0, q.z));
          rung(b, { joint: jointForY(q.y), c: vec(q.x, q.y, q.z), tx: q.tx, tz: q.tz, f: Math.min(1, q.y / Ld.topY), len: r.len, name: `${r.key}${sd}${i}`, rnd: rr });
        });
      }
    }
    const K = T.bank, rb = makeRnd(K.seed);
    for (let i = 0; i < K.count; i++) {
      let x = 0, z = 0, rad = 2;
      while (rad > 1) { x = (rb() * 2 - 1); z = (rb() * 2 - 1); rad = Math.hypot(x, z); }
      const top = Math.max(1.6, K.height * (1 - Math.pow(rad, 1.6)) + (rb() - 0.5) * 3);
      puff(b, { joint: 'Hips', cx: x * K.radiusX, top, cz: K.z + z * K.radiusZ, w: lerpA(K.size, rb()), yaw: rb() * Math.PI, lobes: K.lobes, name: `bank${i}`, rnd: rb });
    }
  }

  // ---------------------------------------------------------------- 関節の Group と メッシュ
  const group = new Group();
  group.name = 'gashaBig';
  const joints = {} as Record<JointName, Group>;
  for (const j of JOINT_NAMES) {
    const g = new Group();
    g.name = j;
    const p = PARENT[j];
    g.position.copy(rest[j]).sub(p ? rest[p] : vec(0, 0, 0));
    joints[j] = g;
    (p ? joints[p] : group).add(g);
  }
  const meshes: Mesh[] = [];
  const mats: Partial<Record<Kind, MeshBasicMaterial>> = {};
  const matOf = (kind: Kind): MeshBasicMaterial => {
    let m = mats[kind];
    if (!m) {
      const tr = kind === 'glow' || kind === 'glass' || kind === 'eyeHalo';
      m = new MeshBasicMaterial({ vertexColors: true, fog: false, side: kind === 'glass' ? 0 : DoubleSide, transparent: tr, opacity: kind === 'eyeHalo' ? 0.3 : 1, depthWrite: !tr });
      mats[kind] = m;
    }
    return m;
  };
  const ORDER: Record<Kind, number> = { main: 0, bright: 0, eyes: 0, brow: 0, eyeHalo: 1, glass: 2, glow: 3 };
  let brow: Mesh | null = null;
  for (const bk of b.buckets.values()) {
    if (!bk.pos.length) continue;
    // 関節の 原点が 回転の 中心に なる ように、頂点を 関節の 場所から の ずれに する
    const o = rest[bk.joint];
    const pos = bk.pos.slice();
    for (let i = 0; i < pos.length; i += 3) { pos[i]! -= o.x; pos[i + 1]! -= o.y; pos[i + 2]! -= o.z; }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new Float32BufferAttribute(bk.col, bk.rgba ? 4 : 3));
    const m = new Mesh(geo, matOf(bk.kind));
    m.name = `${bk.joint}:${bk.kind}`;
    m.renderOrder = ORDER[bk.kind];
    m.frustumCulled = false;
    if (bk.kind === 'brow') { m.visible = false; brow = m; }
    joints[bk.joint].add(m); meshes.push(m);
  }

  // 身長: 頭の いちばん 上（頭の 当たりの 上の 面）が T.size.height に なる ように
  const hm = new Matrix4().compose(headPos, new Quaternion().setFromEuler(new Euler(0.17, headYaw, 0, 'YXZ')), vec(1, 1, 1));
  const topY = vec(0, 20.4, -0.2).applyMatrix4(hm).y;
  const scale = T.size.height / topY;
  return {
    group, joints, rest, hits: b.hits, eyes: matOf('eyes'), eyeHalo: matOf('eyeHalo'), brow: brow ?? new Mesh(), scale, groundPts, head: headPos, stairPts, meshes: meshes.length,
  };
}

// ---------------------------------------------------------------- 当たりの 箱 → ブロックの マス
export interface WorldHit { name: string; joint: JointName; center: [number, number, number]; half: [number, number, number]; axes: [[number, number, number], [number, number, number], [number, number, number]] }

/** 当たりの 箱を、関節の いまの 姿勢（Group の ワールド行列）で 世界の 座標に うつす。group の 位置・向き・拡大は 先に 決めて おく */
export function worldHits(model: BigModel): WorldHit[] {
  model.group.updateMatrixWorld(true);
  const pos = new Vector3(), q = new Quaternion(), sc = new Vector3();
  return model.hits.map((h) => {
    const jg = model.joints[h.joint];
    jg.matrixWorld.decompose(pos, q, sc);
    const o = model.rest[h.joint];
    const c = h.c.clone().sub(o).applyMatrix4(jg.matrixWorld);
    const ax = h.axes.map((a) => a.clone().applyQuaternion(q));
    return {
      name: h.name, joint: h.joint,
      center: [c.x, c.y, c.z],
      half: [h.half[0] * sc.x, h.half[1] * sc.y, h.half[2] * sc.z],
      axes: [[ax[0]!.x, ax[0]!.y, ax[0]!.z], [ax[1]!.x, ax[1]!.y, ax[1]!.z], [ax[2]!.x, ax[2]!.y, ax[2]!.z]],
    };
  });
}

/** マス（i, j, k）の キー。±32768 の 外は 想定しない */
export const cellKey = (i: number, j: number, k: number): number => ((i + 32768) * 65536 + (k + 32768)) * 1024 + j;

/** 箱の 中に マスの 中心が ある マスを 数える。margin は 箱の ぜんぶの 向きに ひろげる ぶん、topLift は 箱の 上の 向き（2 番目の 軸）だけ */
export function voxelize(hits: WorldHit[], margin: number, topLift: number): Set<number> {
  const cells = new Set<number>();
  for (const h of hits) {
    const [hx, hy, hz] = h.half;
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
  /** 作りなおして プレイヤーの 前に 置く */
  place(): void;
  /** 怒る（赤い 目。止まって プレイヤーの 方を 向く）/ 白目に もどす。怒りは 攻撃されない まま T.angry.calmSec で 自然に 消える */
  angry(on: boolean): void;
  /** プレイヤーの 攻撃が 当たった ことに する（怒る。20 秒 カウントを はじめから）。段 4 で 本物の 攻撃に つなぐ */
  hit(): void;
  /** さまよう（はって あるく）のを はじめる / 止める */
  walk(on: boolean): void;
  /** その 場所（ブロックの 座標）へ はって 行く（さまよう とき の 目的地を 上書き） */
  goTo(x: number, z: number): void;
  /** 止まって ふり返る（Crawl and Look Back） */
  lookBack(): void;
  /** うごきの 中身（モード・速さ・手の ついた 数・1 コマの 仕事の 数 など） */
  motion(): Record<string, unknown>;
  /** 当たりの 箱の 一覧（世界の 座標。関節の いまの 姿勢） */
  colliders(): WorldHit[];
  /** 関節を うごかした あとに 呼ぶ。当たりの マスを 関節の いまの 姿勢で 作りなおす */
  refreshColliders(): void;
  /** 関節の 名前 → Group（Meshy の 骨と おなじ 名前）。休みの 姿勢では 回転なし */
  joints(): Record<string, Group>;
  /** 見えない 固いマスを 1 つ 聞く */
  solidAt(x: number, y: number, z: number): boolean;
  info(): Record<string, unknown>;
  group: Group;
}

export function startGashaBig(deps: GashaBigDeps): GashaBigHandle {
  applyTuneFromUrl(location.search);
  let model: BigModel | null = null;
  let actor: BigActor | null = null;
  const CLIPS: ActorClips = { climbL, climbR, lookBack: lookBackClip };
  let isAngry = false;
  let pos = new Vector3(), yaw = 0;
  const fwdOf = (p: { yawDeg: number }) => { const y = (p.yawDeg * Math.PI) / 180; return { fx: Math.sin(y), fz: -Math.cos(y) }; };

  const clear = () => {
    if (!model) return;
    deps.scene.remove(model.group);
    const mats = new Set<MeshBasicMaterial>();
    model.group.traverse((o) => { const m = o as Mesh; if (m.isMesh) { m.geometry.dispose(); mats.add(m.material as MeshBasicMaterial); } });
    mats.forEach((m) => m.dispose());
    model = null;
  };

  /** 当たりの 箱の 場所を いまの 姿勢で 更新（マスの 集合は 作らない。判定は その 場で 箱に 聞く） */
  const refresh = (): void => {
    if (!model || !actor) return;
    model.group.updateMatrixWorld(true);
    actor.updateBoxes();
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
    const handHs = hs.slice(1);
    const base = T.place.groundPick === 'min' ? Math.min(...hs) : T.place.groundPick === 'center' ? hs[0]! : T.place.groundPick === 'hands' ? Math.round(handHs.reduce((a, b) => a + b, 0) / handHs.length) : Math.max(...hs);
    // 手の まわりを 平らに ならす（手の 高さに そろえる。地面が でこぼこでも 手から 1 だんで 乗れるように）
    if (T.place.levelGround && deps.fillBlocks) {
      const P = T.place;
      for (let i = 1; i + 1 < model.groundPts.length; i += 2) {
        const pm = model.groundPts[i]!, pt = model.groundPts[i + 1]!;
        const xs: number[] = [], zs: number[] = [];
        for (const [lx, lz] of [[pm.x - P.padHalfWidth, pm.z - P.padBack], [pm.x + P.padHalfWidth, pt.z + P.padFront]] as const) {
          const w = vec(lx, 0, lz).multiplyScalar(s).applyQuaternion(R);
          xs.push(mx + w.x); zs.push(mz + w.z);
        }
        const x0 = Math.floor(Math.min(...xs)), x1 = Math.ceil(Math.max(...xs)), z0 = Math.floor(Math.min(...zs)), z1 = Math.ceil(Math.max(...zs));
        deps.fillBlocks(x0, base - P.padDepth, z0, x1, base - 1, z1, 'grass');
        deps.fillBlocks(x0, base, z0, x1, base + P.padHeight, z1, 'air');
      }
      // 雲の はしごの はじめの 数段の まわりも ならす（1 段目が 地面から 1 だんで 乗れるように）
      for (const q of model.stairPts) {
        const xs: number[] = [], zs: number[] = [];
        for (const [lx, lz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
          const w = vec(q.x + lx * P.stairPadHalf, 0, q.z + lz * P.stairPadHalf).multiplyScalar(s).applyQuaternion(R);
          xs.push(mx + w.x); zs.push(mz + w.z);
        }
        const x0 = Math.floor(Math.min(...xs)), x1 = Math.ceil(Math.max(...xs)), z0 = Math.floor(Math.min(...zs)), z1 = Math.ceil(Math.max(...zs));
        deps.fillBlocks(x0, base - P.padDepth, z0, x1, base - 1, z1, 'grass');
        deps.fillBlocks(x0, base, z0, x1, base + P.padHeight, z1, 'air');
      }
    }
    pos = new Vector3(mx, base, mz);
    model.group.position.copy(pos);
    model.group.rotation.y = yaw;
    model.group.scale.setScalar(s);
    deps.scene.add(model.group);
    actor = new BigActor(model, CLIPS, { groundY: deps.groundY, player: deps.player, carryPlayer: deps.carryPlayer }, 293);
    actor.place(pos.x, pos.y, pos.z, yaw);
    actor.walk(T.wander.enabledAtStart);
    if (isAngry) actor.hit();
  };

  deps.addPlayerSolid((x, y, z) => actor !== null && actor.solid(x, y, z));
  // BGM「神々の 戯れ」: 怒って いる（赤い 目の）間だけ。少女が 出た あとは 共通の 係が「災厄」を 優先する（gashaBgm.ts）
  const bgm = deps.bgmOut && deps.suppressBgm ? sharedGashaBgm({ bgmOut: deps.bgmOut, suppressBgm: deps.suppressBgm }) : null;
  let bgmWant = false;
  deps.onUpdate?.((dt) => {
    if (!actor) return;
    actor.update(dt);
    pos = actor.pos; yaw = actor.yaw;
    if (bgm) {
      const w = actor.angryLeft > 0;
      if (w !== bgmWant) { bgmWant = w; bgm.request('big', w); }
      bgm.step();
    }
  });
  place();

  const handle: GashaBigHandle = {
    tune: (o) => applyTune(o),
    place,
    angry: (on) => { isAngry = on; actor?.angry(on); },
    hit: () => { isAngry = true; actor?.hit(); },
    walk: (on) => actor?.walk(on),
    goTo: (x, z) => actor?.goTo(x, z),
    lookBack: () => actor?.lookBack(),
    motion: () => (actor ? {
      mode: actor.mode, speedNow: actor.speedNow, crawlSpeed: actor.crawlSpeed, crawlRate: actor.crawlRate, target: actor.target, wander: actor.wanderOn,
      angryLeft: actor.angryLeft, eyeMix: actor.eyeMix, work: actor.work, plant: actor.plant,
    } : {}),
    colliders: () => (model ? worldHits(model) : []),
    refreshColliders: refresh,
    joints: () => (model ? { ...model.joints } : {}),
    solidAt: (x, y, z) => actor?.solid(x, y, z) ?? false,
    info: () => ({
      scale: model?.scale, pos: [pos.x, pos.y, pos.z], yawDeg: (yaw * 180) / Math.PI, drawCalls: model?.meshes, hitBoxes: model?.hits.length, angry: (actor?.angryLeft ?? 0) > 0,
      head: model ? model.head.clone().multiplyScalar(model.scale).applyQuaternion(new Quaternion().setFromAxisAngle(UP, yaw)).add(pos).toArray() : null,
      rest: model ? Object.fromEntries(JOINT_NAMES.map((j) => [j, model!.rest[j].toArray()])) : null,
    }),
    get group() { return model!.group; },
  };
  (window as unknown as { __gashaBig: GashaBigHandle }).__gashaBig = handle;
  return handle;
}
