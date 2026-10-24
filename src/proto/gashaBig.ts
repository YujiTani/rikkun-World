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
  BufferAttribute, BufferGeometry, Color, DataTexture, NearestFilter, RGBAFormat, SRGBColorSpace, CylinderGeometry, DoubleSide, Euler, ExtrudeGeometry, Float32BufferAttribute, Group, Matrix3, Matrix4,
  Mesh, MeshBasicMaterial, OctahedronGeometry, Path, Plane, Quaternion, Shape, Vector3, type Camera, type Material, type Object3D, type Scene,
} from 'three';
import type { BodyBlocksPort } from '../dig/bodyBlocks';
import { BodyPlaced } from './gashaBigPlaced';
import { armPoints } from './gashaBigArm';
import { buildOutsideMoss, buildPlants, plantMaterial, type OutsideMoss, type PlantSurface } from './gashaBigPlants';
import { TUNE as T, applyTune, applyTuneFromUrl } from './gashaBigTuning';
import { BigActor, type ActorClips } from './gashaBigActor';
import { buildSwirlEyes, type SwirlEyes } from './gashaBigSwirl';
import { sharedGashaBgm } from './gashaBgm';
import { BigHit, boxTouchesCapsule, boxTouchesFan, distToBox, rayBox, type BoxLike, type HitSources } from './gashaBigHit';
import { GashaGeyser, type GeyserInfo } from './gashaGeyser';
import { BigShock, type ShockHit } from './gashaBigShock';
import { ShockFx } from './gashaBigShockFx';
import { createBigSfx, createBigWebAudioPlayer, type BigSfxEnv } from './gashaBigSfx';
import { AshRain, Embers, burnPlants, type Ash, type Ember, type LandInfo } from './gashaBigEruption';
import { EruptFx } from './gashaBigEruptFx';
import { BodyShock, StrikeField, touchBody } from './gashaBigThunder';
import { ThunderFx, type BoltView, type RingView, type WarnView } from './gashaBigThunderFx';
import { boltVariantOf } from '../legend/thunderModel';
import type { PlacedBlock } from './gashaBigPlaced';
import { BeamAim, type AimEnv } from './gashaBigBeam';
import { BeamFx } from './gashaBigBeamFx';
import { crushAt } from './gashaBigCrush';
import { BodyQuake } from './gashaBigQuake';
import { armHit } from './gashaBigSweepHit';
import climbUp from './gashaBigClips/climbUp.json';
import climbDown from './gashaBigClips/climbDown.json';
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
  /** 昼夜の 明るさの 係（sky/lighting.ts）。あれば 体の 材料を 登録して 夜は 暗くする（目の 光は 暗くしない） */
  lighting?: { registerTree(root: Object3D, group: 'doll'): number; unregister?(material: Material): void };
  /** 効果音を 鳴らす 口の 差しかえ（テスト用。なければ 本物の WebAudio） */
  sfxEnv?: BigSfxEnv;
  /** BGM の ミキサーの 口（少女と おなじ）。なければ BGM は 流さない */
  bgmOut?(): { ctx: AudioContext; bus: AudioNode } | null;
  /** ふだんの BGM を 止める（少女と おなじ。曲が 流れて いる 間） */
  suppressBgm?(on: boolean, fade?: { outSec?: number; inSec?: number; delaySec?: number }): void;
  /** 手の まわりの 地面を ならす 用（ワールドの ブロックを 箱で おきかえる。読みこんで いない 所は 変わらない）。なければ ならさない */
  fillBlocks?(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, id: 'grass' | 'air'): void;
  /** プレイヤーの 攻撃を 受ける 口（刀・弓・波・雷など。つなぎは gashaBigHitWire.ts）。なければ 本物の 攻撃は 当たらない（`__gashaBig.damage` だけ 効く） */
  hit?: HitSources;
  /** 間欠泉（gashaGeyser.ts）の 口: プレイヤーの 体（足もと・速さ・地面）。4 つ そろった ときだけ 間欠泉が わく */
  playerBody?(): { position: { x: number; y: number; z: number }; velocity: { x: number; y: number; z: number }; onGround?: boolean };
  setPlayerVelocity?(v: { x: number; y: number; z: number }): void;
  nudgePlayer?(dx: number, dz: number): void;
  /** 落下ダメージを 受けない（combat の noFall に 重ねる） */
  setNoFall?(on: boolean): void;
  /** 間欠泉の つち（ブロック `geyser_dirt`）の 口: ブロックの 名前・置きかえ・読みこんだ 列の 間欠泉の つちを ぜんぶ 渡す。そろって いれば 間欠泉が わく */
  blockAt?(x: number, y: number, z: number): string;
  setGeyserBlock?(x: number, y: number, z: number): boolean;
  scanGeyserBlocks?(found: (x: number, y: number, z: number) => void): void;
  /** 忍者の足袋（レア装備。落下ダメージ 0）を 持ち物に 入れて 着る。開始時に 1 回 呼ぶ。なければ 渡さない */
  giveNinjaTabi?(): void;
  /** true なら 起動時に 足袋を 自動で 着せない（ふだんの ゲームでは ごほうび。試作は 着せる）。`giveTabi()` で 後からも 着せられる */
  noTabi?: boolean;
  /** 体力が 0 に なった（置いてから 1 回だけ。次の place() で また 数える）。たおした あとの 宝箱・実績は 呼んだ 側が 出す */
  onDefeated?(): void;
  /** 手が 地面を たたいた ときの 打撃・衝撃波・小さい 衝撃の ダメージ（プレイヤーの combat.damage。当たったら true）。なければ ダメージなし（ひるみだけ） */
  hurt?(amount: number, from: { x: number; y: number; z: number }): boolean;
  /** ひるみ（試作だけ）: fn() が true の 間は プレイヤーの 入力を 止める（lock.playInputEnabled に 重ねる） */
  blockPlayerInput?(fn: () => boolean): void;
  /** 描く 前の 処理（画面の ゆれ）。なければ ゆらさない */
  onBeforeRender?(fn: () => void): void;
  /** 「うごきを へらす」の 人は ゆらさない */
  reducedMotion?(): boolean;
  /** たたきつけた 手の 下と まわりを こわす 口: ブロックを 空気に する（blockAt と そろって いる ときだけ こわす）と、こわした マス（くだける つぶ・音。ぬりかべの onBlocks と おなじ） */
  setBlockAir?(x: number, y: number, z: number): boolean;
  onCrushBlocks?(cells: { x: number; y: number; z: number; from: string; to: 'air' }[]): void;
  /** ガラスの 雲が 割れた（ブロックの 中心の 世界の 座標）。小さな かけらと 音を 出す 口 */
  onGlassBreak?(cells: { x: number; y: number; z: number }[]): void;
  /** コアに 当たった 予兆（大きな 音）/ 遠くへ とばされる 瞬間（風の 音） */
  onCoreWarn?(): void;
  onCoreThrow?(): void;
  /** 体の 上に 置く ブロックの 口（DigSystem の bodyBlocks に つなぐ）。開始時に 1 回 呼ばれる */
  onBodyBlocks?(port: BodyBlocksPort): void;
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
  'LeftShoulder', 'LeftArm', 'LeftArmMid', 'LeftForeArm', 'LeftHand',
  'RightShoulder', 'RightArm', 'RightArmMid', 'RightForeArm', 'RightHand',
] as const;
export type JointName = (typeof JOINT_NAMES)[number];
const PARENT: Record<JointName, JointName | null> = {
  Hips: null, Spine: 'Hips', Spine01: 'Spine', Spine02: 'Spine01', neck: 'Spine02', Head: 'neck',
  LeftShoulder: 'Spine02', LeftArm: 'LeftShoulder', LeftArmMid: 'LeftArm', LeftForeArm: 'LeftArmMid', LeftHand: 'LeftForeArm',
  RightShoulder: 'Spine02', RightArm: 'RightShoulder', RightArmMid: 'RightArm', RightForeArm: 'RightArmMid', RightHand: 'RightForeArm',
};

// ---------------------------------------------------------------- 箱を ためて まとめる
/** 1 つの 関節の 中の 種類。main = ふつうの 箱（面ごとに 明るさ）、ほかは 影なし */
type Kind = 'main' | 'bright' | 'eyes' | 'eyeHalo' | 'brow' | 'glow' | 'glass' | 'gblock';
const SHADED: Record<Kind, boolean> = { main: true, bright: false, eyes: false, eyeHalo: false, brow: true, glow: false, glass: false, gblock: false };
const RGBA = new Set<Kind>(['glow', 'glass', 'gblock']);

class Bucket {
  pos: number[] = [];
  col: number[] = [];
  /** ガラスの ブロックの 絵（gblock だけ） */
  uv: number[] = [];
  constructor(readonly joint: JointName, readonly kind: Kind) {}
  get rgba(): boolean { return RGBA.has(this.kind); }
}

/** ガラスの 雲の 1 マス: hit = 当たりの 箱の 番号、cell = マスの 番号（mask の 中）、ranges = この マスの 頂点（バケツの 中の はじめ・数） */
export interface GlassCell { hit: number; cell: number; joint: JointName; ranges: { start: number; count: number }[]; local: Vector3 }

export interface Hit {
  name: string;
  /** どの 関節に ついて 動くか */
  joint: JointName;
  /** もとの 座標（からだ ぜんたいの 休みの 姿勢）での 中心・3 本の 軸（長さ 1）・はんぶんの 大きさ */
  c: Vector3;
  axes: [Vector3, Vector3, Vector3];
  half: [number, number, number];
  /** ガラスの 雲: 1 ブロックの マスごとの 有る・ない（nx × nz。u が 軸 0、w が 軸 2）。割れた マスは 0 */
  mask?: GlassMask;
}

/** 雲の 板の マス（1 ブロック 単位）。割れる と on が 0 に なる */
export interface GlassMask { nx: number; nz: number; on: Uint8Array }
/** 箱の 中の 点（箱の 座標 u, w）が マスの 有る 所か */
export const maskHas = (m: GlassMask | undefined, u: number, w: number, hx: number, hz: number): boolean => {
  if (!m) return true;
  const ix = Math.min(m.nx - 1, Math.max(0, Math.floor(((u + hx) / (2 * hx)) * m.nx)));
  const iz = Math.min(m.nz - 1, Math.max(0, Math.floor(((w + hz) / (2 * hz)) * m.nz)));
  return m.on[iz * m.nx + ix] === 1;
};

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
/** 1 ブロック あたりの もとの 座標の 長さ（= 1 / 拡大）。雲の はしごの 段の 高さ・間かく・あつさは ブロックの 絶対の 値で 決める ので、buildBig の はじめに 入れる */
let KW = 1;
const lerpA = (r: readonly [number, number], f: number): number => r[0] + (r[1] - r[0]) * f;

/** ガラスの ブロックの 絵（16 × 16。ふちは 明るい 青白、中は 白っぽい 半透明、左上に ななめの つや） */
let glassTex: DataTexture | null = null;
function glassTexture(): DataTexture {
  if (glassTex) return glassTex;
  const N = 16, d = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const edge = x === 0 || y === 0 || x === N - 1 || y === N - 1;
    const edge2 = x === 1 || y === 1 || x === N - 2 || y === N - 2;
    const shine = (x + y === 5 || x + y === 6 || x + y === 9) && x > 2 && y > 2 && x < 10 && y < 10;
    let r = 232, g = 244, bl = 252, a = 70;
    if (edge) { r = 250; g = 253; bl = 255; a = 235; }
    else if (edge2) { r = 214; g = 236; bl = 250; a = 120; }
    else if (shine) { r = 255; g = 255; bl = 255; a = 170; }
    const i = (y * N + x) * 4;
    d[i] = r; d[i + 1] = g; d[i + 2] = bl; d[i + 3] = a;
  }
  const t = new DataTexture(d, N, N, RGBAFormat);
  t.magFilter = NearestFilter; t.minFilter = NearestFilter; t.colorSpace = SRGBColorSpace; t.generateMipmaps = false; t.needsUpdate = true;
  return (glassTex = t);
}

/** ガラスの ブロック 1 つ（1 ブロック 角。マイクラの ガラスの ように 明るい ふち ＋ 中は 白っぽい 半透明）。M = 中心・向き・大きさ。ためた 頂点の はじめと 数を 返す */
function pushCube(b: Builder, joint: JointName, M: Matrix4, tint: number): { start: number; count: number } {
  const bk = b.bucket(joint, 'gblock');
  const start = bk.pos.length / 3;
  const UV: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]];
  const c = new Color(0xffffff).multiplyScalar(tint);
  for (const f of FACES) {
    for (const i of [0, 1, 2, 0, 2, 3]) {
      tmpP.set(f.v[i]![0], f.v[i]![1], f.v[i]![2]).applyMatrix4(M);
      bk.pos.push(tmpP.x, tmpP.y, tmpP.z);
      bk.col.push(c.r, c.g, c.b, 1);
      bk.uv.push(UV[i]![0], UV[i]![1]);
    }
  }
  return { start, count: 36 };
}

/** もくもく雲を 1 つ（木くらいの 大きさ）。1 ブロックの すりガラスの ブロックを 平らに 並べた 板（上の 面が 乗れる 当たり。マスごとに 割れる）＋ 下に ぶらさがる ブロック。 */
function puff(b: Builder, o: { joint: JointName; cx: number; top: number; cz: number; w: number; yaw: number; lobes: number; name: string; rnd: () => number }): void {
  const rnd = o.rnd, cell = KW, thick = T.bank.thick * KW;
  const nx = Math.max(2, Math.round(o.w)), nz = Math.max(2, Math.round(o.w * (0.82 + 0.2 * rnd())));
  const u = vec(Math.cos(o.yaw), 0, Math.sin(o.yaw));
  const side = new Vector3().crossVectors(vec(0, 1, 0), u);
  const on = new Uint8Array(nx * nz);
  let count = 0;
  for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
    const e = (ix + 0.5 - nx / 2) / (nx / 2), f = (iz + 0.5 - nz / 2) / (nz / 2);
    if (Math.pow(Math.abs(e), 2.6) + Math.pow(Math.abs(f), 2.6) <= 1.15) { on[iz * nx + ix] = 1; count++; }
  }
  if (!count) { on[Math.floor(nz / 2) * nx + Math.floor(nx / 2)] = 1; }
  const hitIdx = b.hits.length;
  const q = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(u, vec(0, 1, 0), side));
  const cellCentre = (ix: number, iz: number, below: number): Vector3 =>
    vec(o.cx, o.top - thick / 2 - below * thick, o.cz).addScaledVector(u, (ix + 0.5 - nx / 2) * cell).addScaledVector(side, (iz + 0.5 - nz / 2) * cell);
  const cells: Map<number, GlassCell> = new Map();
  const addCube = (ix: number, iz: number, below: number): void => {
    const k = iz * nx + ix;
    let gc = cells.get(k);
    if (!gc) { gc = { hit: hitIdx, cell: k, joint: o.joint, ranges: [], local: cellCentre(ix, iz, 0) }; cells.set(k, gc); }
    const M = new Matrix4().compose(cellCentre(ix, iz, below), q, vec(cell, thick, cell));
    gc.ranges.push(pushCube(b, o.joint, M, 0.9 + 0.1 * rnd()));
  };
  for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) if (on[iz * nx + ix]) addCube(ix, iz, 0);
  // 下に ぶらさがる ブロック（もくもく）: 板の ふちに 近い マスの 下に 1〜2 こ
  const lobeCells = [...cells.keys()];
  for (let k = 0; k < o.lobes && lobeCells.length; k++) {
    const pick = lobeCells[Math.floor(rnd() * lobeCells.length)]!;
    addCube(pick % nx, Math.floor(pick / nx), 1);
    if (rnd() < 0.35) addCube(pick % nx, Math.floor(pick / nx), 2);
  }
  for (const gc of cells.values()) b.glass.push(gc);
  b.hits.push({ name: o.name, joint: o.joint, c: vec(o.cx, o.top - thick / 2, o.cz), axes: [u.clone(), vec(0, 1, 0), side.clone()], half: [(nx * cell) / 2, thick / 2, (nz * cell) / 2], mask: { nx, nz, on } });
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
  /** ガラスの 雲の マスの 一覧（割れる 単位）と、出す / 消す */
  glass: GlassCell[];
  setGlass(gc: GlassCell, on: boolean): void;
  /** 道に 生えた こけ・くさの 数（十字の 板の まとまり） */
  plants: number;
  /** 体の 外がわの こけ・くさ（かたまりの 数・板の 数）。毎コマ updateMoss で 関節の 動きに あわせる */
  mossOutside: { clumps: number; count: number };
  updateMoss(): void;
  /** 体の 外の こけ・くさを 焼く / もどす（gashaBigPlants.ts の OutsideMoss） */
  burnMoss(c: { x: number; y: number; z: number }, radius: number, max?: number): number[];
  restoreMoss(ids: readonly number[]): void;
  mossHidden(): number;
  /** コアの 見た目を ずらす（胴体の 座標の ずれ x, y, z・大きさの 倍・透明度の 倍）。もどす ときは (0,0,0,1,1) */
  setCoreFx(jx: number, jy: number, jz: number, scale: number, alphaK: number): void;
  eyes: MeshBasicMaterial;
  eyeHalo: MeshBasicMaterial;
  /** つかれた ときの くるくる目（渦巻き。ふだんは 見えない。gashaBigSwirl.ts） */
  swirl: SwirlEyes;
  brow: Mesh;
  /** もとの 座標 → ブロック の 拡大 */
  scale: number;
  /** 手の 先（もとの 座標。地面の 高さを 決める 点） */
  groundPts: Vector3[];
  /** 頭の 位置（もとの 座標） */
  head: Vector3;
  meshes: number;
}

/** 遠い 部位ほど 空の 色（scene.fog の 色）に 溶ける（空気遠近法）。強さは 調整表 look.haze*。uniform は 毎コマ updateHaze() で 入れる */
const hazeU = { value: new Vector3(35, 160, 0.6) };
export function updateHaze(): void { hazeU.value.set(T.look.hazeNear, T.look.hazeFar, T.look.hazeMax); }
export function hazePatch(m: MeshBasicMaterial): void {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uHaze = hazeU;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <fog_pars_fragment>', '#include <fog_pars_fragment>\nuniform vec3 uHaze;')
      .replace('#include <fog_fragment>', '#ifdef USE_FOG\n gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, smoothstep(uHaze.x, uHaze.y, vFogDepth) * uHaze.z);\n#endif');
  };
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
  // 腕の 関節 4 つ: S = J1（かたの 外）、M = J2（上わんの なかほど）、E = J3（前わんの なかほど）、Wr = J4（手首）。gashaBigArm.ts
  const armPts: Record<string, { S: Vector3; M: Vector3; E: Vector3; Wr: Vector3 }> = {};
  for (const s of [-1, 1]) {
    const nm = s > 0 ? 'Left' : 'Right';
    const S = Tt(s * 12.5, 33.2, -0.5);
    const { p: [, M, E, Wr] } = armPoints(S, s, A);
    rest[`${nm}Shoulder` as JointName] = Tt(s * 4, 34.5, 1.4);
    rest[`${nm}Arm` as JointName] = S; rest[`${nm}ArmMid` as JointName] = M; rest[`${nm}ForeArm` as JointName] = E; rest[`${nm}Hand` as JointName] = Wr;
    armPts[nm] = { S, M, E, Wr };
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
  const K = T.core, KT = K.tunnel;
  const SH = K.sideHole;
  /** 左の かべの 穴（なければ null）。y は 道の 左の かべの 高さ（19.6 〜 天井）に おさめる */
  const SHOLE = SH.enabled ? { y0: Math.max(19.6, SH.y - SH.h / 2), y1: Math.min(T.core.tunnel.ceilY, SH.y + SH.h / 2), z0: SH.z - SH.w / 2, z1: SH.z + SH.w / 2 } : null;
  const TX0 = KT.x - KT.width / 2, TX1 = KT.x + KT.width / 2, CEIL = KT.ceilY, G0 = KT.gap.z0, G1 = KT.gap.z1; // 道（トンネル）の 左右の はしと 天井、途中の 穴の はじ
  {
    // 背中の ぬの（x ±4.5、y 12〜36）。背中の 穴の ぶんだけ あける（穴の 左右の はば TX0〜TX1、高さ 床〜天井）
    const px = (x0: number, x1: number, y0: number, y1: number): void => { if (x1 - x0 > 0.2 && y1 - y0 > 0.2) tj('Spine01').box(x1 - x0, y1 - y0, 1.0, (x0 + x1) / 2, (y0 + y1) / 2, -5.0, 0x5a463c); };
    px(-4.5, Math.min(4.5, TX0 - 0.2), 12, 36);
    px(TX0 - 0.2, 4.5, 12, KT.floorY - 0.5); px(TX0 - 0.2, 4.5, CEIL + 0.5, 36);
  }
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
      let prev: Vector3 | null = null, prevIn = false;
      for (let k = 0; k <= 7; k++) {
        const phi = 0.12 + (k / 7) * Math.PI * 0.82;
        const p = vec(s * a * Math.sin(phi), y - (k > 5 ? 0.4 : 0) - 0.12 * k, bb * Math.cos(phi) * (phi > 1.6 ? 0.92 : 1) + 0.3);
        // 背中の 穴の 道に かかる ろっ骨は とぎれさせる（穴の 左右 ＋ 1、床〜天井）
        const inHole = (p.x > TX0 - 1.2 && p.x < TX1 + 1.2 && p.y > KT.floorY - 1.2 && p.y < CEIL + 1.2 && p.z < KT.endZ)
          || (!!SHOLE && s > 0 && p.x > TX1 - 0.5 && p.y > SHOLE.y0 - 1.0 && p.y < SHOLE.y1 + 1.0 && p.z > SHOLE.z0 - 1.2 && p.z < SHOLE.z1 + 1.2); // 左の 小さな 穴の まわりの ろっ骨も とぎれさせる
        if (prev && !inHole && !prevIn) t.seg(prev, p, 1.8, 1.75, k % 2 ? BONE : BONE_D);
        prev = p; prevIn = inHole;
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

  // --- 当たり（胴体・胸・セーラー服・スカーフ・首・肩）: 見える 体の 面を ぜんぶ 固くする。中も 固い（歩いて 入れない）。
  //     箱は 胴体の 座標（ひねりなし。拡大と かたむきは 親の Group が 持つ）で、ついて 動く 関節ごとに 分ける。1 ブロックより うすい 箱は 作らない。
  //     リブの すきま・ぼろぼろの すそ・おまもり などの 小さな かざりは 外側の 箱に ふくまれる（見た目との ずれは 0.5 ブロック いない）。
  {
    const th = (j: JointName) => torso.at(j);
    th('Hips').hit('spineLow', 3.9, 6.8, 4.0, 0, 5.5, -7.6); // 背骨の 下（こしの 骨）
    // おなか・すその ぼろぼろ（ほねは すかすかでも 中は 固い）。道の 穴（G0〜G1）の ところは 下まで ぬける: 穴の 前 / 後ろ は 全幅、穴の 左右の かべ
    const WZ0 = -9.6, WZ1 = 8.4, WY0 = 8.2, WY1 = 16.0;
    const wslab = (name: string, x0: number, x1: number, z0: number, z1: number): void => { if (x1 - x0 > 0.2 && z1 - z0 > 0.2) th('Spine').hit(name, x1 - x0, WY1 - WY0, z1 - z0, (x0 + x1) / 2, (WY0 + WY1) / 2, (z0 + z1) / 2); };
    wslab('torsoWaist', -8.4, 8.4, WZ0, G0); // 穴の 手前（道の 床の つづき）
    wslab('waistGapL', TX1, 8.4, G0, G1); wslab('waistGapR', -8.4, TX0, G0, G1); // 穴の 左右の かべ
    wslab('waistFrontL', TX1, 8.4, G1, WZ1); wslab('waistFrontR', -8.4, TX0, G1, WZ1);
    th('Spine01').hit('spineMid', 3.9, 13.5, 4.0, 0, 24.25, -7.6); // 背骨（ろっ骨の うしろに とび出す ぶん）
    // ろっ骨 1〜2 だんめ・3〜6 だんめ（いちばん ひろい 所）は 道（トンネル）の ぶんだけ あける: 道の 左 / 右。道は 床〜天井。天井の 上は chestMid2
    const slab = (name: string, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, j: JointName = 'Spine02'): void => th(j).hit(name, x1 - x0, y1 - y0, z1 - z0, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    slab('chestLow', TX1, 11.4, 14.6, 19.6, -8.975, 9.075, 'Spine01'); slab('chestLowR', -11.4, TX0, 14.6, 19.6, -8.975, 9.075, 'Spine01');
    slab('chestMid1R', -12.5, TX0, 19.6, CEIL, -8.05, 9.85);
    if (!SHOLE) slab('chestMid1', TX1, 12.5, 19.6, CEIL, -8.05, 9.85);
    else {
      // 左がわの 小さな 穴（K.sideHole）: かべを 穴の まわり 4 つに 分ける。うすい 箱は 作らない
      const part = (name: string, y0: number, y1: number, z0: number, z1: number): void => { if (y1 - y0 > 0.2 && z1 - z0 > 0.2) slab(name, TX1, 12.5, y0, y1, z0, z1); };
      part('chestMid1', 19.6, CEIL, -8.05, SHOLE.z0); // うしろ（背中がわ）
      part('chestMid1Front', 19.6, CEIL, SHOLE.z1, 9.85); // まえ
      part('chestMid1Low', 19.6, SHOLE.y0, SHOLE.z0, SHOLE.z1); // 穴の 下（穴の 下の はしが 19.6 なら なし）
      part('chestMid1Up', SHOLE.y1, CEIL, SHOLE.z0, SHOLE.z1); // 穴の 上（天井まで あけて あれば なし）
      // 穴に 入れない ための 見えない 壁（名前が chest で はじまらない = 矢・刀には 当たらない 'cloud' あつかい。人の 足・体だけ ぶつかる）
      if (SH.guard) th('Spine02').hit('holeGuard', 1.6, SHOLE.y1 - SHOLE.y0, SHOLE.z1 - SHOLE.z0, TX1 + 0.8, (SHOLE.y0 + SHOLE.y1) / 2, (SHOLE.z0 + SHOLE.z1) / 2);
    }
    slab('chestMid2', -12.4, 12.4, CEIL, 30.5, -8.05, 10.45); // 道の 天井から 胸の 上まで（ぜんぶ ふさぐ）
    slab('chestCoreEnd', TX0, TX1, KT.floorY, CEIL, KT.endZ, 10.45); // コアの 向こうの かべ（道の つきあたり）
    slab('chestCoreFloor', TX0, TX1, KT.floorY - KT.floorThick, KT.floorY, KT.backZ, -7.5); // 背中の 外へ のびる 床（穴の 入り口の だん）
    slab('chestFarFloor', TX0, TX1, KT.floorY - KT.floorThick, KT.floorY, G1, KT.endZ); // 穴の むこうがわの 小さな 床（コアの 下）
    th('Spine02').hit('core', K.size, K.size, K.size, K.pos[0], K.pos[1], K.pos[2]); // コア（たたくと ふり落とされる）
    th('Spine02').hit('chestUp', 21.8, 2.9, 16.3, 0, 31.95, 0.85); // 7 だんめ ＋ セーラーの えり（前の V）
    th('Spine02').hit('chestTop', 15.4, 4.8, 14.2, 0, 35.7, -2.6); // 肩の あいだ・えりの 上の 面（ここが 胴体の 上）
    th('Spine02').hit('collarbone', 24.6, 2.6, 4.6, 0, 34.7, 2.0); // さこつ（肩の 先まで）
    th('neck').hit('neck', 3.8, 5.3, 5.5, 0, 40.35, -6.85); // 首（背骨の つづき）
    for (const s of [-1, 1]) th(s > 0 ? 'LeftShoulder' : 'RightShoulder').hit(`shoulderCloth${s < 0 ? 'R' : 'L'}`, 5.2, 2.4, 8.7, s * 7.2, 36.05, -3); // かたの ぬの・けんこうこつ
  }

  // --- 背中の 穴・体の 中の 道（トンネル）・心臓の コア（見た目。当たりは 上の 胴体の 当たり）
  {
    const t = tj('Spine02');
    const W = KT.width, H = CEIL - KT.floorY, zA = -8.1, zB = KT.endZ, L = zB - zA;
    const DARK_IN = 0x1b1116, FLOOR = 0x4d3d38, PIT = 0x120a0e;
    const zc = (z0: number, z1: number) => (z0 + z1) / 2;
    // 中の かべ・床・天井（暗い 内がわ）。床は 穴（G0〜G1）の ところだけ ない
    t.box(W, 0.4, G0 - zA, KT.x, KT.floorY - 0.2, zc(zA, G0), FLOOR);
    t.box(W, 0.4, zB - G1, KT.x, KT.floorY - 0.2, zc(G1, zB), FLOOR);
    t.box(0.4, H, L, TX0 + 0.2, KT.floorY + H / 2, zc(zA, zB), DARK_IN);
    if (!SHOLE) t.box(0.4, H, L, TX1 - 0.2, KT.floorY + H / 2, zc(zA, zB), DARK_IN);
    else {
      // 左の かべは 小さな 穴の ぶんだけ あける（外から コアが 見える）
      const lw = (y0: number, y1: number, z0: number, z1: number): void => { if (y1 - y0 > 0.1 && z1 - z0 > 0.1) t.box(0.4, y1 - y0, z1 - z0, TX1 - 0.2, (y0 + y1) / 2, (z0 + z1) / 2, DARK_IN); };
      lw(KT.floorY, CEIL, zA, SHOLE.z0); lw(KT.floorY, CEIL, SHOLE.z1, zB); lw(KT.floorY, SHOLE.y0, SHOLE.z0, SHOLE.z1); lw(SHOLE.y1, CEIL, SHOLE.z0, SHOLE.z1);
    }
    t.box(W, 0.4, L, KT.x, CEIL - 0.2, zc(zA, zB), DARK_IN);
    t.box(W, H, 0.4, KT.x, KT.floorY + H / 2, zB - 0.2, 0x2b1a20);
    // 穴の かべ（下へ 深く 暗く ぬける。腰の 下の 骨まで）
    for (const sx of [TX0 + 0.2, TX1 - 0.2]) t.box(0.4, 8.0, G1 - G0, sx, KT.floorY - 4.0, zc(G0, G1), PIT);
    t.box(W, 8.0, 0.4, KT.x, KT.floorY - 4.0, G0 + 0.2, PIT); // 手前の 穴の かべ
    t.box(W, 8.0, 0.4, KT.x, KT.floorY - 4.0, G1 - 0.2, PIT); // むこうの 穴の かべ
    // 穴の ふちの ほね（かけた 骨の 歯）
    for (const [z, sgn] of [[G0, -1], [G1, 1]] as const) {
      t.box(W - 0.4, 0.6, 0.9, KT.x, KT.floorY + 0.3, z + sgn * -0.2, BONE);
      for (const dx of [-1.5, -0.3, 1.1]) t.box(0.8, 0.7 + (dx > 0 ? 0.5 : 0), 0.8, KT.x + dx, KT.floorY - 0.5, z + sgn * 0.3, BONE_D);
    }
    // 道の ろっ骨（アーチ）: 床の 骨の いたと、かべ・天井に 沿う 骨を 一定の 間かくで（床の 骨は 穴の ところは なし）
    for (let z = zA + 1.5; z < zB - 0.5; z += 3.0) {
      if (z < G0 - 0.6 || z > G1 + 0.6) t.box(W - 0.6, 0.5, 1.0, KT.x, KT.floorY + 0.1, z, BONE_D);
      t.box(0.8, H - 0.4, 1.0, TX0 + 0.55, KT.floorY + H / 2, z, BONE);
      if (!SHOLE || z < SHOLE.z0 - 0.6 || z > SHOLE.z1 + 0.6) t.box(0.8, H - 0.4, 1.0, TX1 - 0.55, KT.floorY + H / 2, z, BONE);
      t.box(W - 0.6, 0.8, 1.0, KT.x, CEIL - 0.5, z, BONE);
    }
    // 穴の ふち（背中の がわ）と 外へ のびる 床の だん
    t.box(W + 2.4, 1.4, 2.0, KT.x, CEIL + 0.7, zA - 0.7, BONE); // 上
    t.box(1.4, H + 1.4, 2.0, TX1 + 0.7, KT.floorY + H / 2 + 0.7, zA - 0.7, BONE_D); // 左
    t.box(1.4, H + 1.4, 2.0, TX0 - 0.7, KT.floorY + H / 2 + 0.7, zA - 0.7, BONE_D); // 右
    t.box(W + 2.4, KT.floorThick, KT.backZ - zA + 1.0, KT.x, KT.floorY - KT.floorThick / 2, (KT.backZ + zA - 1.0) / 2 + 0.2, BONE); // 外へ のびる 床
    // 左の 小さな 穴の ふち（骨の わく。見た目だけ）。外へ 少し 出して 穴が 目立つ ように
    if (SHOLE && SH.rim) {
      const cy = (SHOLE.y0 + SHOLE.y1) / 2, cz = (SHOLE.z0 + SHOLE.z1) / 2, hh = SHOLE.y1 - SHOLE.y0, ww = SHOLE.z1 - SHOLE.z0, rx = TX1 + 1.4, th = 0.9;
      t.box(2.6, th, ww + 2 * th, rx, SHOLE.y1 + th / 2, cz, BONE); t.box(2.6, th, ww + 2 * th, rx, SHOLE.y0 - th / 2, cz, BONE_D);
      t.box(2.6, hh, th, rx, cy, SHOLE.z0 - th / 2, BONE); t.box(2.6, hh, th, rx, cy, SHOLE.z1 + th / 2, BONE_D);
      t.glowBox(0.3, hh, ww, TX1 - 0.1, cy, (SHOLE.z0 + SHOLE.z1) / 2, 0x8aeaff, 0.16); // 中の コアの 光が もれる（穴が 目立つ）
    }
    // コア: とぎれた 道の むこうで 光る（しん と まわりの 光）
    const cp = K.pos;
    void cp; // コアの 見た目は 別の メッシュ（ふり落としの 予兆で ゆらして 半透明に するため。下の coreVis）
    t.glowBox(W - 0.6, H - 0.6, 0.3, KT.x, KT.floorY + H / 2, zB - 0.6, 0x8aeaff, 0.22);
    // 肩から 穴の 外の だんへ おりる 雲の 段は 肩の 雲を つくる ところ（KW が きまって から）
  }

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
    // （コアは 心臓へ うつした。欠けの 見た目だけ のこす）
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
      // たれる リボン 2 本（うすい ので 2.4 の あつみで）
      rb.hit(`ribbonTail${sd < 0 ? 'R' : 'L'}0`, 3.0, 8.0, 2.4, sd * 3.0, -5.0, -3.0, [0, 0, sd * 0.25]);
      rb.hit(`ribbonTail${sd < 0 ? 'R' : 'L'}1`, 3.0, 6.0, 2.4, sd * 6.0, -4.2, -3.4, [0, 0, sd * 0.45]);
    }
    rb.hit('ribbonKnot', 4.8, 4.2, 3.8, 0, 0.5, 0);
  }
  // 頭がいの 当たり
  //   頭がい 本体 ＋ てっぺんの 穴の まわりの わく ＋ よこ（こめかみ）＋ あご・ほお。てっぺんの 穴（コアが 見える ところ）と
  //   後ろの 欠け（コアを ねらう ところ）は 箱を おかない: 穴の 底（光る 板）まで のぞける・矢が 通る。
  head.hit('skull', 20.0, 12.5, 20.8, 0, 11.25, 0.4);
  head.hit('skullTop0', 8.2, 2.9, 19.6, -5.9, 18.95, -0.1); // てっぺんの わく（穴の 左）
  head.hit('skullTop1', 8.2, 2.9, 19.6, 5.9, 18.95, -0.1); // （穴の 右）
  head.hit('skullTop2', 3.6, 2.9, 8.1, 0, 18.95, 5.65); // （穴の 前）
  head.hit('skullTop3', 3.6, 2.9, 7.9, 0, 18.95, -5.95); // （穴の 後ろ）
  for (const s of [-1, 1]) head.hit(`skullTemple${s < 0 ? 'R' : 'L'}`, 2.4, 6.0, 8.0, s * 10.6, 7.0, 0); // こめかみ
  head.hit('skullJaw', 16.8, 5.9, 16.9, 0, 2.35, 2.05); // あご・ほお・歯
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
      for (let i = 0; i < 3; i++) {
        head.seg(pts[i]!, pts[i + 1]!, 3.2 - i * 0.5, 3.4 - i * 0.5, HAIR);
        head.segHit(`hairTail${s < 0 ? 'R' : 'L'}${i}`, pts[i]!, pts[i + 1]!, 3.2 - i * 0.5, 3.4 - i * 0.5); // 当たり（ツインテールの たれ髪）
      }
      head.hit(`hairTailEnd${s < 0 ? 'R' : 'L'}`, 2.0, 2.4, 2.0, s * 14.4, -15.4, 2.2);
      head.hit(`hairPom${s < 0 ? 'R' : 'L'}0`, 3.2, 3.2, 3.2, s * 11.8, 13.6, -3);
      head.hit(`hairPom${s < 0 ? 'R' : 'L'}1`, 3.4, 3.4, 3.4, s * 15.0, -1.5, -2.8);
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
  const armEnds: { s: number; S: Vector3; E: Vector3; joint: JointName }[] = []; // 上わんの かたがわの はし（あとで うでの 足場の 雲を つける）
  let nailI = 0;
  const th = A.handThick;
  for (const s of [-1, 1]) {
    const nmS = s > 0 ? 'Left' : 'Right', sd = s < 0 ? 'R' : 'L';
    const { S, M, E, Wr } = armPts[nmS]!;
    const jA = `${nmS}Arm` as JointName, jM = `${nmS}ArmMid` as JointName, jF = `${nmS}ForeArm` as JointName, jH = `${nmS}Hand` as JointName;
    const upper = b.root(jA), mid = b.root(jM), fore = b.root(jF), hand = b.root(jH);
    const uF = Wr.clone().sub(E).normalize(), uM = E.clone().sub(M).normalize();
    // 節 1（J1〜J2）: 関節 Arm（そで ぼろぼろ）。かたの 外の ふくらみ から 上わんの なかほど まで
    upper.box(4.6, 4.6, 4.6, S.x, S.y, S.z, BONE_D); // かたの 関節
    upper.seg(S, M, 3.6, 3.6, BONE); upper.seg(S, M, 1.2, 1.2, BONE_D, 0.1, 0.9);
    mossAlong(upper, S, M, [0.2, 0.55, 0.8], 2.0);
    upper.seg(S, M, 6.0, A.upperThick, cl, -0.08, 0.86);
    upper.seg(S, M, 6.4, A.upperThick + 0.4, C.stripe, 0.8, 0.88); upper.seg(S, M, 6.0, A.upperThick, cd, 0.86, 0.94);
    for (let i = 0; i < 3; i++) { const c = S.clone().lerp(M, 0.9 + i * 0.01); upper.box(1.6, 2.4, 1.6, c.x + (i - 1) * 2.1 * s, c.y - 0.6 - (i % 2) * 0.9, c.z + 1.0, cd); }
    // 節 2（J2〜J3）: 関節 ArmMid。上わんの なかほど から 前わんの なかほど まで（ひじは この まんなか）
    mid.box(4.4, 4.4, 4.4, M.x, M.y, M.z, BONE_D);
    mid.seg(M, E, A.foreWidth, A.foreThick, BONE); mid.seg(M.clone().add(vec(1.1 * s, 0.3, 0)), E.clone().add(vec(1.1 * s, 0.3, 0)), 1.2, 1.2, BONE_D);
    mossAlong(mid, M, E, [0.3, 0.6], 1.9);
    const el = M.clone().lerp(E, 0.5); // ひじ
    mid.box(4.0, 4.0, 4.0, el.x, el.y + 0.3, el.z, BONE);
    // 節 3（J3〜J4）: 関節 ForeArm。前わんの なかほど から 手首 まで
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
    // 指（ひらいた 4 本）の 当たり: 外がわ 2 本・内がわ 2 本を それぞれ 1 つの 箱に（根元の はばより 先が ひろがる）
    for (const k of [0, 1]) {
      const ang = k === 0 ? -0.19 : 0.19, bx = palmX + (k === 0 ? -1.5 : 1.5); // 2 本の まんなかの かたむきと 根元の 場所
      hand.hit(`handFingers${k === 0 ? 'A' : 'B'}${sd}`, 4.4, th, 9.0, bx + Math.sin(ang) * 4.5, th / 2, palmZ + 3.5 + Math.cos(ang) * 4.5, [0, ang, 0]);
    }
    // 親指（てのひらの 内がわへ 開く）の 当たり。ほかの 指は てのひらの 箱に ふくまれる
    hand.hit(`handThumb${sd}`, 2.6, th, 5.2, palmX - s * 4.87, th / 2, palmZ + 0.84, [0, -s * 0.95, 0]);
    // ---- 当たり（のぼる 道）。目に 見える 面と そろえる
    const lineHit = (name: string, joint: JointName, a: Vector3, bb: Vector3, width: number, thick: number): void => {
      const u = bb.clone().sub(a), len = u.length(); u.normalize();
      const { side, n } = frameOf(u);
      b.hits.push({ name, joint, c: a.clone().add(bb).multiplyScalar(0.5), axes: [side, n, u], half: [width / 2, thick / 2, len / 2] });
    };
    // 上わんの 当たりは ひじの 先まで 少し のばして、前わんの 当たりと かさねる（つなぎ目の 段を なくす）
    armEnds.push({ s, S: S.clone(), E: M.clone(), joint: jA });
    lineHit(`upperArm${sd}`, jA, S, M.clone().addScaledVector(M.clone().sub(S).normalize(), A.elbowExtend), A.upperWidth, A.upperThick - 0.4);
    lineHit(`upperArmMid${sd}`, jM, M, E.clone().addScaledVector(uM, A.elbowExtend), A.foreWidth - 0.2, A.foreThick - 0.2);
    // 前わんは 手首の 先まで 少し のばして 手に つなぐ（手首が 浮いて 見えても 段が 1 つに なる）
    lineHit(`foreArm${sd}`, jF, E, Wr.clone().addScaledVector(uF, A.foreExtend), A.foreWidth - 0.2, A.foreThick - 0.2);
    b.hits.push({ name: `hand${sd}`, joint: jH, c: vec(palmX, th / 2, (palmZ - 3.5 + tipZ) / 2), axes: [vec(1, 0, 0), vec(0, 1, 0), vec(0, 0, 1)], half: [3.4, th / 2, (tipZ - palmZ + 3.5) / 2] });
  }

  // 身長: 頭の いちばん 上（頭の 当たりの 上の 面）が T.size.height に なる ように
  const hm = new Matrix4().compose(headPos, new Quaternion().setFromEuler(new Euler(0.17, headYaw, 0, 'YXZ')), vec(1, 1, 1));
  const topY = vec(0, 20.4, -0.2).applyMatrix4(hm).y;
  const scale = T.size.height / topY;
  KW = 1 / scale;
  // --- 肩の 雲（小さな もくもく雲の あつまり。平らな 足場）・髪の 段（ツインテール と もみあげ）・こしの もくもく雲。上の 面が そのまま 当たり
  {
    const S = T.shoulder, rs = makeRnd(S.seed);
    for (const s of [-1, 1]) {
      const sd = s < 0 ? 'R' : 'L';
      let n = 0;
      for (const x of S.xs) for (const z of S.zs) {
        puff(b, { joint: 'Spine02', cx: s * x, top: S.y + (rs() - 0.5) * S.jitter, cz: z, w: lerpA(S.size, rs()), yaw: rs() * Math.PI, lobes: 4, name: `shoulder${sd}${n++}`, rnd: rs });
      }
    }
    // うでの 足場の 雲: 上わんの かたがわの はしに 小さな 雲を 1 つ。うでを のぼりきった ところ（かたの ぬの・肩の 雲の すぐ 下）で、
    // うでの 上の 面と 肩の 雲の 高さの 差（ブロックの そろい かたで 1〜2 ブロック かわる）を うめる。うでの 関節に つく（うでと いっしょに うごく）
    {
      const Q = T.armStep, rq = makeRnd(Q.seed);
      for (const e of armEnds) {
        const dir = e.E.clone().sub(e.S).normalize(), p = e.S.clone().addScaledVector(dir, Q.back * KW);
        const w = lerpA(Q.size, rq());
        // 雲の 上の 面 = 腕の 上の 面（雲の ひじ がわの ふち）より Q.rise だけ 高い。腕は 斜めで、雲は 腕の 上に のる ので、ふちで くらべる（下がり 角が ふえても 段が 1 つ より 高く ならない）
        const q = e.S.clone().addScaledVector(dir, (Q.back + 0.6 * w) * KW);
        const armTop = q.y + (A.upperThick - 0.4) / 2 / Math.max(0.3, Math.hypot(dir.x, dir.z));
        puff(b, { joint: e.joint, cx: p.x + e.s * Q.out * KW, top: armTop + Q.rise * KW, cz: p.z, w, yaw: rq() * Math.PI, lobes: 4, name: `armStep${e.s < 0 ? 'R' : 'L'}`, rnd: rq });
      }
    }
    // 背中の 穴の 上へ つづく 雲の 道: 左の 肩の いちばん 後ろの 雲（肩の 高さ）から 肩の 高さの まま 穴の 外の 床の だんの うしろまで。
    // さいごの 雲の ふちから 床の だん（約 5 ブロック 下）へ 飛び降りる。床の だんからは 上へ 戻れない（一方通行）
    {
      const Z = T.core, rs2 = makeRnd(Z.steps.seed), n = Math.max(1, Math.round(Z.steps.count));
      const L = Tt(KT.x, KT.floorY, KT.backZ);
      const x0 = S.xs[0]!, z0 = S.zs[0]!, y0 = S.y;
      const wJ = lerpA(Z.steps.size, rs2());
      const xJ = L.x, zJ = L.z - (wJ / 2 + Z.steps.behind) * KW;
      for (let k = 1; k <= n; k++) {
        const u = k / (n + 1);
        puff(b, { joint: 'Spine02', cx: x0 + (xJ - x0) * u, top: y0, cz: z0 + (zJ - z0) * u, w: lerpA(Z.steps.size, rs2()), yaw: rs2() * Math.PI, lobes: 4, name: `backStep${k - 1}`, rnd: rs2 });
      }
      puff(b, { joint: 'Spine02', cx: xJ, top: y0, cz: zJ, w: wJ, yaw: 0, lobes: 2, name: 'backJump', rnd: rs2 });
    }
    // 髪の 毛束: 黒い 箱。上の 面が 当たり。ときどき 髪どめ（ピンク）
    const H = T.hair;
    const lock = (name: string, x: number, top: number, z: number, k: number): void => {
      const w = H.size * KW, th = H.thick * KW, joint = jointForY(top), r = b.root(joint);
      r.box(w, th, w, x, top - th / 2, z, HAIR);
      r.box(w * 0.78, th * 1.4, w * 0.78, x, top - th - th * 0.7, z, HAIR);
      if (k % 3 === 2) r.box(w * 1.06, th * 0.3, w * 1.06, x, top - th * 0.55, z, C.stripe);
      b.hits.push({ name, joint, c: vec(x, top - th / 2, z), axes: [vec(1, 0, 0), vec(0, 1, 0), vec(0, 0, 1)], half: [w / 2, th / 2, w / 2] });
    };
    for (const s of [-1, 1]) {
      const sd = s < 0 ? 'R' : 'L', Tl = H.tail;
      for (let k = 0; k < Tl.steps; k++) {
        const a = ((Tl.angle0Deg + k * Tl.stepDeg) * Math.PI) / 180;
        lock(`tail${sd}${k}`, s * (Tl.x + Tl.radius * Math.cos(a)), Tl.y0 + k * Tl.rise, Tl.z + Tl.radius * Math.sin(a), k);
      }
      H.side.forEach((q, k) => lock(`side${sd}${k}`, s * q[0]!, q[2]!, q[1]!, k));
    }
    // 肩から 頭の 上への 雲の らせん（からだが 動いても 通れる。上がりは 1 つ 0.62 ブロック。さいごの 数個は 頭の てっぺんの わくへ 近づく）
    {
      const U = T.rise, rr = makeRnd(U.seed);
      const sm = (t: number): number => { const c = Math.min(1, Math.max(0, t)); return c * c * (3 - 2 * c); };
      for (const s of [-1, 1]) {
        const sd = s < 0 ? 'R' : 'L';
        for (let k = 0; k < U.count; k++) {
          const a = ((U.angle0Deg + k * U.stepDeg) * Math.PI) / 180, y = U.y0 + k * U.step;
          const rad = U.radius + (U.endRadius - U.radius) * sm((k - U.taperFrom) / Math.max(1, U.count - 1 - U.taperFrom));
          puff(b, {
            joint: y < U.splitY ? 'Spine02' : 'Head', cx: s * (U.cx + rad * Math.cos(a)) * KW, top: y * KW, cz: (U.cz + rad * Math.sin(a)) * KW,
            w: lerpA(U.size, rr()), yaw: rr() * Math.PI, lobes: 4, name: `rise${sd}${k}`, rnd: rr,
          });
        }
      }
    }
    // 腰の まわり: ガラスの 雲の 輪（中心から 外へ 数本の 輪。外の 輪ほど ひくく、地面ちかくまで ぐるっと かこむ）
    const K = T.bank, rb = makeRnd(K.seed);
    let bi = 0;
    for (const [rr0, n] of K.rings) {
      const a0 = rb() * Math.PI * 2;
      for (let q = 0; q < n; q++) {
        const ang = a0 + ((q + (rb() - 0.5) * 0.5) / n) * Math.PI * 2, rad = Math.min(1, Math.max(0.05, rr0 + (rb() - 0.5) * 0.08));
        let top = Math.max(1.6 * KW, K.height * (1 - Math.pow(rad, 1.6)) + (rb() - 0.5) * K.jitter);
        if (rad < K.innerRad) top = Math.min(top, K.innerTop);
        puff(b, { joint: 'Hips', cx: Math.cos(ang) * rad * K.radiusX, top, cz: K.z + Math.sin(ang) * rad * K.radiusZ, w: lerpA(K.size, rb()), yaw: rb() * Math.PI, lobes: K.lobes, name: `bank${bi++}`, rnd: rb });
      }
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
      const tr = kind === 'glow' || kind === 'glass' || kind === 'eyeHalo' || kind === 'gblock';
      const lit = kind === 'eyes' || kind === 'eyeHalo' || kind === 'glow'; // 目の 光（怒り）と 光の 玉だけは 暗くしない・霞ませない
      m = new MeshBasicMaterial({ vertexColors: true, fog: !lit, side: kind === 'glass' || kind === 'gblock' ? 0 : DoubleSide, transparent: tr, opacity: kind === 'eyeHalo' ? 0.3 : 1, depthWrite: !tr, map: kind === 'gblock' ? glassTexture() : null });
      if (lit) m.userData.noDim = true;
      else hazePatch(m);
      mats[kind] = m;
    }
    return m;
  };
  const ORDER: Record<Kind, number> = { main: 0, bright: 0, eyes: 0, brow: 0, eyeHalo: 1, glass: 2, gblock: 2, glow: 3 };
  let brow: Mesh | null = null;
  const glassMeshes: Partial<Record<JointName, Mesh>> = {};
  for (const bk of b.buckets.values()) {
    if (!bk.pos.length) continue;
    // 関節の 原点が 回転の 中心に なる ように、頂点を 関節の 場所から の ずれに する
    const o = rest[bk.joint];
    const pos = bk.pos.slice();
    for (let i = 0; i < pos.length; i += 3) { pos[i]! -= o.x; pos[i + 1]! -= o.y; pos[i + 2]! -= o.z; }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new Float32BufferAttribute(bk.col, bk.rgba ? 4 : 3));
    if (bk.uv.length) geo.setAttribute('uv', new Float32BufferAttribute(bk.uv, 2));
    const m = new Mesh(geo, matOf(bk.kind));
    m.name = `${bk.joint}:${bk.kind}`;
    m.renderOrder = ORDER[bk.kind];
    m.frustumCulled = false;
    if (bk.kind === 'brow') { m.visible = false; brow = m; }
    if (bk.kind === 'gblock') glassMeshes[bk.joint] = m;
    joints[bk.joint].add(m); meshes.push(m);
  }
  // コアの 見た目（しん と まわりの 光）。予兆の 間 ゆれて 半透明に なる ので、まとめずに 別の メッシュに する
  const coreVis = new Group();
  coreVis.name = 'coreVis';
  const coreBase = new Matrix4().makeTranslation(-rest.Spine02.x, -rest.Spine02.y, -rest.Spine02.z).multiply(torso.m).multiply(new Matrix4().makeTranslation(K.pos[0], K.pos[1], K.pos[2]));
  const coreMats: { m: MeshBasicMaterial; a: number }[] = [];
  for (const [r, color, a] of [[0.42, 0xcffaff, 1], [0.62, 0x8aeaff, 0.3]] as const) {
    const m = new MeshBasicMaterial({ color, fog: false, transparent: true, opacity: a, depthWrite: a >= 1 });
    m.userData.noDim = true;
    const cm = new Mesh(new OctahedronGeometry(K.size * r), m);
    cm.frustumCulled = false; cm.renderOrder = a >= 1 ? 0 : 3;
    coreVis.add(cm);
    coreMats.push({ m, a });
  }
  coreVis.matrixAutoUpdate = false;
  coreVis.matrix.copy(coreBase);
  joints.Spine02.add(coreVis);
  const setCoreFx = (jx: number, jy: number, jz: number, scale: number, alphaK: number): void => {
    coreVis.matrix.copy(coreBase).multiply(new Matrix4().compose(vec(jx, jy, jz), new Quaternion(), vec(scale, scale, scale)));
    coreVis.matrixWorldNeedsUpdate = true;
    for (const c of coreMats) c.m.opacity = c.a * alphaK;
  };
  meshes.push(...(coreVis.children as Mesh[]));
  // 体の 中の 道に 生い茂る こけ・くさ（十字の ドット絵の 板。InstancedMesh）
  let plantCount = 0;
  {
    const M = T.core.moss, zA = -8.1, zB = KT.endZ, x0 = TX0 + 0.3, x1 = TX1 - 0.3, fy = KT.floorY, cy = CEIL - 0.45;
    const surf: PlantSurface[] = [];
    const rect = (o: [number, number, number], a: [number, number, number], bb: [number, number, number], up: [number, number, number], density: number): void => {
      surf.push({ o: vec(...o), a: vec(...a), b: vec(...bb), up: vec(...up), density });
    };
    const ZL = KT.backZ + 0.4;
    // 床（穴の 手前 / むこう / 外の だん）
    rect([x0, fy, ZL], [x1 - x0, 0, 0], [0, 0, G0 - ZL], [0, 1, 0], M.floor);
    rect([x0, fy, G1], [x1 - x0, 0, 0], [0, 0, zB - 0.4 - G1], [0, 1, 0], M.floor);
    // 左右の かべ（穴の ところは 下へ 深く）
    for (const [wx, dir] of [[TX0 + 0.35, 1], [TX1 - 0.35, -1]] as const) {
      rect([wx, fy + 0.2, zA], [0, CEIL - 0.5 - fy - 0.2, 0], [0, 0, zB - zA], [dir, 0, 0], M.wall);
      rect([wx, fy - 6, G0], [0, 6, 0], [0, 0, G1 - G0], [dir, 0, 0], M.wall * 0.7);
    }
    // 天井（下むきに たれる）
    rect([x0, cy, zA], [x1 - x0, 0, 0], [0, 0, zB - zA], [0, -1, 0], M.ceil);
    // つきあたりの かべ
    rect([x0, fy + 0.2, zB - 0.4], [x1 - x0, 0, 0], [0, CEIL - 0.5 - fy - 0.2, 0], [0, 0, -1], M.wall);
    // 穴の むこう / 手前の かべ
    rect([x0, fy - 6, G0 + 0.4], [x1 - x0, 0, 0], [0, 6, 0], [0, 0, 1], M.wall * 0.7);
    rect([x0, fy - 6, G1 - 0.4], [x1 - x0, 0, 0], [0, 6, 0], [0, 0, -1], M.wall * 0.7);
    // アーチの ほね まわり（ほねの すきまに ぎっしり）
    for (let z = zA + 1.5; z < zB - 0.5; z += 3.0) {
      if (z > G0 - 0.6 && z < G1 + 0.6) continue;
      rect([x0, fy, z - 0.8], [x1 - x0, 0, 0], [0, 0, 1.6], [0, 1, 0], M.ribs);
      for (const [wx, dir] of [[TX0 + 0.35, 1], [TX1 - 0.35, -1]] as const) rect([wx, fy + 0.2, z - 0.8], [0, CEIL - 0.5 - fy - 0.2, 0], [0, 0, 1.6], [dir, 0, 0], M.ribs);
    }
    const pm = plantMaterial();
    hazePatch(pm);
    const parent = new Matrix4().makeTranslation(-rest.Spine02.x, -rest.Spine02.y, -rest.Spine02.z).multiply(torso.m);
    const { meshes: pl, count } = buildPlants(surf.filter((q) => q.density > 0), { parent, size: M.size, carpet: M.carpet, max: M.max, seed: M.seed }, pm);
    for (const mesh of pl) { mesh.renderOrder = 0; joints.Spine02.add(mesh); meshes.push(mesh); }
    plantCount = count;
  }
  // 体の 外がわの こけ・くさ（まばらな かたまり）。3 つの InstancedMesh を からだの 親に つけ、毎コマ 関節の 行列から 位置を 作りなおす
  const outsidePm = plantMaterial();
  hazePatch(outsidePm);
  const outside: OutsideMoss = buildOutsideMoss(b.hits, rest, joints, group, T.core.moss.outside, outsidePm);
  for (const mesh of outside.meshes) { mesh.renderOrder = 0; group.add(mesh); meshes.push(mesh); }
  /** ガラスの マスを 出す / 消す（見た目は 頂点の 透明度、当たりは mask） */
  const setGlass = (gc: GlassCell, on: boolean): void => {
    const m = glassMeshes[gc.joint];
    if (!m) return;
    const a = m.geometry.getAttribute('color') as BufferAttribute;
    for (const r of gc.ranges) for (let i = r.start; i < r.start + r.count; i++) a.setW(i, on ? 1 : 0);
    a.needsUpdate = true;
    const mk = b.hits[gc.hit]?.mask;
    if (mk) mk.on[gc.cell] = on ? 1 : 0;
  };

  const swirl = buildSwirlEyes(new Quaternion().setFromEuler(new Euler(0.17, headYaw, 0, 'YXZ')));
  joints.Head.add(swirl.root);
  return {
    group, joints, rest, hits: b.hits, glass: b.glass, setGlass, plants: plantCount, mossOutside: { clumps: outside.clumps, count: outside.count }, updateMoss: outside.update, burnMoss: outside.burn, restoreMoss: outside.restore, mossHidden: outside.hiddenCount, setCoreFx, eyes: matOf('eyes'), eyeHalo: matOf('eyeHalo'), swirl, brow: brow ?? new Mesh(), scale, groundPts, head: headPos, meshes: meshes.length,
  };
}

// ---------------------------------------------------------------- 当たりの 箱 → ブロックの マス
export interface WorldHit { name: string; joint: JointName; center: [number, number, number]; half: [number, number, number]; axes: [[number, number, number], [number, number, number], [number, number, number]]; mask?: GlassMask }

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
      mask: h.mask,
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
      if (Math.abs(u) <= hx + margin && Math.abs(v) <= hy + margin + topLift / 2 && Math.abs(w) <= hz + margin && maskHas(h.mask, u, w, hx, hz)) cells.add(cellKey(i, j, k));
    }
  }
  return cells;
}

// ---------------------------------------------------------------- ゲームに 入れる
export interface GashaBigHandle {
  tune(o: unknown): void;
  /** 作りなおして 置く（体力も もどる）。引数なしは プレイヤーの 前 T.place.distance。`{ x, z, yawDeg }` を 渡すと その 場所（体の 中心の 地面の 位置）・向き（度。`info().yawDeg` と おなじ。省くと プレイヤーの 方を 向く）に 置く。ふだんの ゲームは こちら（release.ts） */
  place(at?: { x: number; z: number; yawDeg?: number }): void;
  /** 片づける（体・当たり・間欠泉・体力ゲージ・射線の 割りこみ・攻撃の エフェクト・燃えかす・音を 消し、毎コマの 更新も 止める）。もういちど 出すには place(at) */
  despawn(): void;
  /** 少女に かわる 間だけ 体を かくす（見えない・当たらない・固くない・うごかない。体力・怒り・位置・攻撃の 回数は のこる）。体の 上の 人は 地面へ おろす。false で もどす（その あと tired(sec) で 休ませる） */
  hide(on: boolean): void;
  /** 体力の 最大 */
  maxHp(): number;
  /** 怒る（赤い 目。止まって プレイヤーの 方を 向く）/ 白目に もどす。怒りは 攻撃されない まま T.angry.calmSec で 自然に 消える */
  angry(on: boolean): void;
  /** プレイヤーの 攻撃が 当たった ことに する（怒る。20 秒 カウントを はじめから）。段 4 で 本物の 攻撃に つなぐ */
  hit(): void;
  /** いまの 体力 */
  hp(): number;
  /** 部位（hand・foreArm・upperArm・head・core など）に ダメージ（武器の 強さ amount × 部位の 倍率）。与えた 数を 返す。テスト用 */
  damage(part: string, amount: number): number;
  /** 撮影用: コアの 左右の まんなかで 体を 半分に 切って 断面を 見せる（左がわを 消す）/ もどす */
  section(on: boolean): void;
  /** さまよう（はって あるく）のを はじめる / 止める */
  walk(on: boolean): void;
  /** その 場所（ブロックの 座標）へ はって 行く（さまよう とき の 目的地を 上書き） */
  goTo(x: number, z: number): void;
  /** 止まって ふり返る（Crawl and Look Back） */
  lookBack(): void;
  /** 後ろへ さがる（climbing down wall を 倒した 動き）を はじめる / 止める */
  back(on: boolean): void;
  /** 攻撃を すぐ 出す（デバッグ。怒って いなければ 怒らせる）。'slam2'（両手たたきつけ）・'sweep'（両手で 払う）・'beam'（目から 光線）・'eruption'（口から 火山噴火）・'thunder'（自分に 落雷） */
  attack(name: string): void;
  /** つかれて 休みに はいる（デバッグ。sec を 省くと 調整表の 20〜30 秒） */
  tired(sec?: number): void;
  /** 噴火で 落ちた 燃えかすの 場所（テスト・デバッグ用） */
  /** 自分に 落雷で まわりに 落ちた 雷の 場所（この 攻撃の ぶん。テスト用） */
  thunderSpots(): { x: number; z: number }[];
  eruptionEmbers(): { x: number; y: number; z: number; body: boolean; age: number }[];
  /** 攻撃サイクル・予告・体の ゆれの いま（テスト用） */
  attackInfo(): { mode: string; phase: string; attack: string | null; done: number; count: number; left: number; slam2Count: number; sweepCount: number; sweepActive: string | null; quakeLeft: number; warn: boolean; fx: { warn: boolean; rocks: number; cracks: number }; beamCount: number; beamPhase: string; beamMode: string | null; beamAim: { x: number; y: number; z: number } | null; beamFx: { marks: number; flames: number; smoke: number; beams: number; sparkle: number }; thunder: { count: number; phase: string; cloud: number; elec: number; strikes: number; hits: number; bodyHurts: number; strikeHurts: number; fx: { bolts: number; rings: number; warns: number; arcs: number; cloud: number; flash: number; glow: boolean } }; eruption: { count: number; phase: string; flying: number; landed: number; embers: number; onBody: number; mossHidden: number; glassBroken: number; burntBlocks: number; doused: number; fx: { ashes: number; shadows: number; embers: number; burning: number; smoke: number; jet: number; wind: number; column: boolean } } };
  /** 長い 休みに はいる（その場で 体を 動かさない。首を ふる くらい）。sec を 書かなければ 調整表の wander.restSec */
  rest(sec?: number): void;
  /** うごきの 中身（モード・速さ・手の ついた 数・1 コマの 仕事の 数 など） */
  motion(): Record<string, unknown>;
  /** ガラスの 雲を 割る: center（世界の 座標）から radius（ブロック）いないの ブロックが 消える。割れた 数を 返す。しばらくして 1 つずつ もどる（火の 攻撃用の 口。テストでも 使う） */
  breakGlass(center: { x: number; y: number; z: number }, radius: number, max?: number): number;
  /** ガラスの 数（ぜんぶ・いま 割れている・もどるのを 待っている） */
  glassInfo(): { total: number; broken: number };
  /** 当たりの 箱の 一覧（世界の 座標。関節の いまの 姿勢） */
  colliders(): WorldHit[];
  /** 関節を うごかした あとに 呼ぶ。当たりの マスを 関節の いまの 姿勢で 作りなおす */
  refreshColliders(): void;
  /** 関節の 名前 → Group（Meshy の 骨と おなじ 名前）。休みの 姿勢では 回転なし */
  joints(): Record<string, Group>;
  /** 見えない 固いマスを 1 つ 聞く */
  solidAt(x: number, y: number, z: number): boolean;
  /** 間欠泉の 一覧（場所・状態。かわる 途中の ものも 入る: state = 'cracking'、stage = ひびの 段） */
  geysers(): GeyserInfo[];
  /** x, z の マスから 間欠泉の つちに かえはじめる（テスト用。sec = ひびの 秒、省くと 調整表。0 で すぐ）。始められたら true */
  spawnGeyser(x: number, z: number, sec?: number): boolean;
  /** 忍者の足袋を 着る（開始時に も 自動で 1 回）。口が なければ 何もしない */
  giveTabi(): void;
  /** 手が 地面を たたいた ときの 当たり（ひるみの のこり・当たった 記録・いまの 輪）。テスト用 */
  shock(): { staggerLeft: number; inputBlocked: boolean; hits: ShockHit[]; impacts: number; shake: number; lastPush: { x: number; y: number; z: number } | null; slams: number; taps: number; phase: string; fx: { rings: number; dust: number }; lastSlam: { x: number; y: number; z: number } | null; lastTap: { x: number; y: number; z: number } | null };
  info(): Record<string, unknown>;
  /** 体の 上に 置いた ブロック（置く・こわす・数。DigSystem の 口と おなじ） */
  bodyBlocks: BodyBlocksPort & { count: number; list(): { id: string; joint: string }[] };
  group: Group;
}

/** `first`: 最初の 置き場所（なければ プレイヤーの 前 T.place.distance。ふだんの ゲームは release.ts が 場所を 渡す） */
export function startGashaBig(deps: GashaBigDeps, first?: { x: number; z: number; yawDeg?: number }): GashaBigHandle {
  applyTuneFromUrl(location.search);
  let model: BigModel | null = null;
  let actor: BigActor | null = null;
  /** 少女に かわる 間は true（hide）。体は のこして かくす */
  let hidden = false;
  /** 体力 0 の 通知を 出したか（place() で もどる） */
  let defeatedFired = false;
  const CLIPS: ActorClips = { climbUp, climbDown, lookBack: lookBackClip };
  let isAngry = false;
  // プレイヤーの 攻撃を 受ける（体力・部位の 倍率・怒る・火花・体力ゲージ。gashaBigHit.ts）
  let throwLeft = 0;
  const throwDir = { x: 0, z: 0 };
  // コアを たたかれた: まず 予兆（大きな 音・画面の ゆれ・コアが ゆれて 半透明で 無敵。プレイヤーは 動ける）→ 風の 音と ともに 遠くへ とばされる（カメラが 1 回転）
  let warnLeft = 0, warnClock = 0, spinLeft = 0, spinDone = 0;
  const reduced = (): boolean => deps.reducedMotion?.() ?? false;
  const throwOff = (): void => {
    if (warnLeft > 0 || throwLeft > 0) return;
    warnLeft = T.core.throwOff.warnSec; warnClock = 0;
    deps.onCoreWarn?.();
  };
  const launch = (): void => {
    const K = T.core.throwOff;
    if (!actor || !deps.setPlayerVelocity) return;
    const i = actor.model.hits.findIndex((h) => h.name === 'core');
    const b = i >= 0 ? actor.boxList[i] : undefined;
    if (!b) return;
    const p = deps.player();
    if (Math.hypot(p.x - b.c[0], p.y - b.c[1], p.z - b.c[2]) > K.range) return;
    if (p.y < b.c[1] - K.minBelow) return; // 地面から 弓で 撃って いる 人（小さな 穴から ねらう）は 体の 上に いないので とばさない
    // 道は せまくて かい段だらけ なので、とばす まえに 穴の 外（入り口の 床の だんの 少し 上・うしろ）へ ワープさせてから、うしろへ とばす
    const fi = actor.model.hits.findIndex((h) => h.name === 'chestCoreFloor');
    const fb = fi >= 0 ? actor.boxList[fi] : undefined;
    const ax = { x: -b.ax[6]!, y: -b.ax[7]!, z: -b.ax[8]! }; // 道の 軸（うしろ・上）
    if (fb && deps.carryPlayer) {
      const out = fb.half[2] + K.exitOut;
      // 外へは 道の 向きに のばし、高さは 床の うしろの はしの まま（道は 下り坂 なので 軸の まま のばすと 高く なりすぎて 着地ダメージが 大きすぎる）
      const ex = fb.c[0]! - fb.ax[6]! * out, ey = fb.c[1]! - fb.ax[7]! * fb.half[2] + K.exitUp, ez = fb.c[2]! - fb.ax[8]! * out;
      deps.carryPlayer(ex - p.x, ey - p.y, ez - p.z, 0);
    }
    deps.setPlayerVelocity({ x: 0, y: K.up, z: 0 }); // 横の 速さは ゲームが 入力から 毎コマ きめる ので、横は 下で 毎コマ ずらす
    throwDir.x = ax.x; throwDir.z = ax.z;
    throwLeft = K.blockSec;
    if (!reduced() && K.spinTurns > 0) { spinLeft = K.spinSec; spinDone = 0; }
    deps.onCoreThrow?.();
    // ふり落とし自体の ダメージは なし。着地ダメージは ふつうに 入る（足袋・間欠泉の 守りは そのまま）
  };
  const stepCoreWarn = (dt: number): void => {
    const K = T.core.throwOff;
    if (warnLeft > 0) {
      warnLeft -= dt; warnClock += dt;
      if (model) {
        const j = K.warnJitter, t = warnClock * 38;
        model.setCoreFx(j * Math.sin(t * 1.7), j * Math.sin(t * 2.3 + 1), j * Math.sin(t * 1.3 + 2), 1 + 0.12 * Math.sin(t), K.warnAlpha * (0.8 + 0.2 * Math.sin(t * 0.9)));
      }
      if (warnLeft <= 0) { model?.setCoreFx(0, 0, 0, 1, 1); launch(); }
    }
    if (spinLeft > 0) {
      const step = Math.min(dt, spinLeft), d = (360 * K.spinTurns * step) / K.spinSec;
      spinLeft -= step; spinDone += d;
      deps.carryPlayer?.(0, 0, 0, d);
    }
  };
  // ガラスの 雲: 割れた マスの 順番待ち（古い 順に 1 つずつ もどる）
  const brokenQ: { gc: GlassCell; t: number }[] = [];
  let glassClock = 0, lastRegen = -1e9;
  const glassWorld = (gc: GlassCell, out: Vector3): Vector3 => {
    const m = model!;
    return out.copy(gc.local).sub(m.rest[gc.joint]).applyMatrix4(m.joints[gc.joint].matrixWorld);
  };
  /** ガラスの 雲を 割る。center から radius いないの マスを 近い 順に 最大 max 個（プレイヤーが ほる ときは 1 個） */
  const breakGlass = (c: { x: number; y: number; z: number }, radius: number, max = Infinity): number => {
    if (!model) return 0;
    model.group.updateMatrixWorld(true);
    const v = new Vector3(), found: { gc: GlassCell; d: number; at: { x: number; y: number; z: number } }[] = [];
    for (const gc of model.glass) {
      const mk = model.hits[gc.hit]?.mask;
      if (!mk || mk.on[gc.cell] !== 1) continue;
      glassWorld(gc, v);
      const d = Math.hypot(v.x - c.x, v.y - c.y, v.z - c.z);
      if (d <= radius) found.push({ gc, d, at: { x: v.x, y: v.y, z: v.z } });
    }
    found.sort((p, q) => p.d - q.d);
    const done: { x: number; y: number; z: number }[] = [];
    for (const f of found.slice(0, max)) {
      model.setGlass(f.gc, false);
      brokenQ.push({ gc: f.gc, t: glassClock });
      done.push(f.at);
    }
    if (done.length) deps.onGlassBreak?.(done);
    return done.length;
  };
  const stepGlass = (dt: number): void => {
    glassClock += dt;
    const G = T.glass, q = brokenQ[0];
    if (!model || !q || glassClock - q.t < G.regenDelaySec || glassClock - lastRegen < G.regenGapSec) return;
    // プレイヤーが その マスの 中に いる あいだは もどさない（うまらない ように）
    const p = deps.player(), v = glassWorld(q.gc, new Vector3());
    if (Math.abs(p.x - v.x) < 1.3 && Math.abs(p.z - v.z) < 1.3 && p.y > v.y - 2.2 && p.y < v.y + 1.2) return;
    brokenQ.shift();
    model.setGlass(q.gc, true);
    lastRegen = glassClock;
  };
  // プレイヤーが 体の 上に 置く ブロック（gashaBigPlaced.ts）。がしゃどくろを 置きなおすと ぜんぶ 消える
  const placed = new BodyPlaced({ model: () => model, actor: () => (hidden ? null : actor), lighting: deps.lighting, patch: hazePatch, breakGlassAt: (c, r, max) => breakGlass(c, r, max) });
  const bh = new BigHit({ scene: deps.scene, angry: () => { isAngry = true; actor?.hit(); }, onCore: throwOff, coreGuard: () => warnLeft > 0, onCloud: (at) => { breakGlass(at, T.glass.swordRadius); }, sources: deps.hit });
  let pos = new Vector3(), yaw = 0;
  const { blockAt, setGeyserBlock, scanGeyserBlocks } = deps;
  const geysers = deps.onUpdate && deps.playerBody && deps.setPlayerVelocity && deps.nudgePlayer && deps.setNoFall && blockAt && setGeyserBlock && scanGeyserBlocks
    ? new GashaGeyser({
      scene: deps.scene, onUpdate: deps.onUpdate, groundY: deps.groundY, body: deps.playerBody, setVelocity: deps.setPlayerVelocity, nudge: deps.nudgePlayer, setNoFall: deps.setNoFall,
      blockAt, setBlock: (x, y, z) => setGeyserBlock(x, y, z), scanBlocks: scanGeyserBlocks,
      bodySolid: (x, y, z) => (hidden ? false : actor?.solid(x, y, z) ?? false),
      centre: () => (actor && !hidden ? { x: pos.x, z: pos.z } : null),
    })
    : null;
  // 手が 地面を たたいた ときの 打撃・衝撃波・小さい 衝撃・ひるみ（gashaBigShock.ts）と 見た目（gashaBigShockFx.ts）
  const shock = new BigShock({
    player: deps.player, groundY: deps.groundY, hurt: deps.hurt, setPlayerVelocity: deps.setPlayerVelocity,
    onGround: deps.playerBody ? () => deps.playerBody!().onGround ?? true : undefined,
  });
  const shockFx = new ShockFx(deps.scene, deps.camera);
  // 攻撃 1 の アースクエイク: 体も ゆれて、のっている 人は 一定の 間かくで 横に ゆさぶられる（自動では ふり落とさない。歩いて 踏んばれば のこれる。ジャンプ中は 押されない）
  const riding = (): boolean => { if (!actor || !deps.carryPlayer) return false; const p = deps.player(); return actor.boxUnder(p.x, p.y, p.z) >= 0; };
  // 効果音（gashaBigSfx.ts。オーナー OK 済みの sfx-big-v1。数は 調整表の sfx）。ファイルは 最初に まとめて 読みこむ
  const sfxPlayer = deps.sfxEnv ? null : createBigWebAudioPlayer();
  const sfx = createBigSfx(deps.sfxEnv ?? sfxPlayer!);
  sfxPlayer?.preload();
  const quake = new BodyQuake({
    isRider: riding, onGround: () => deps.playerBody?.().onGround ?? true,
    nudge: (dx, dz) => deps.nudgePlayer?.(dx, dz),
    onPush: () => { sfx.shake(); },
  });
  // 攻撃 2「両手で 払う」: 払っている 腕の 箱に 当たったら はじき飛ばす（1 回の 払いで 1 回）。手の まえに 土ぼこり
  let sweepStroke = -1, sweepHitDone = false, sweepDustClock = 0;
  const stepSweep = (dt: number): void => {
    const n = actor?.sweepNow;
    if (!actor || !n) { sweepStroke = -1; return; }
    const K = T.sweep;
    if (n.stroke !== sweepStroke) { sweepStroke = n.stroke; sweepHitDone = false; sweepDustClock = 0; }
    sweepDustClock -= dt;
    if (sweepDustClock <= 0) { sweepDustClock = K.dustEverySec; shockFx.dustAt(n.x, n.y, n.z, n.vx, n.vz, K.dustCount); }
    if (K.crushPath && blockAt && deps.setBlockAir) crushAt(n.x, n.y, n.z, { getBlock: blockAt, setAir: deps.setBlockAir, onBlocks: deps.onCrushBlocks }, { crushRadius: K.crushRadius, crushDepth: 0, crushUp: 3 });
    if (sweepHitDone) return;
    const p = deps.player();
    if (!armHit(actor.boxList, n.side, p, deps.groundY, K)) return;
    // はじく 向き: 手の 動く 向き と 体から 外へ
    const sp = Math.hypot(n.vx, n.vz) || 1, ox = p.x - actor.pos.x, oz = p.z - actor.pos.z, ol = Math.hypot(ox, oz) || 1;
    let dx = 0.75 * n.vx / sp + 0.5 * ox / ol, dz = 0.75 * n.vz / sp + 0.5 * oz / ol;
    const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
    if (shock.sweepStrike({ x: p.x, y: p.y, z: p.z }, dx, dz)) sweepHitDone = true;
  };
  // 攻撃 3「目から 光線」: 着弾点が 追う・ブロックで 止まる・当たったら ダメージ・こげ跡と 煙（gashaBigBeam.ts / gashaBigBeamFx.ts）
  const beamAim = new BeamAim(), beamFx = new BeamFx(deps.scene, deps.camera);
  const beamEyes: [Vector3, Vector3] = [new Vector3(), new Vector3()];
  let beamPrev = 'idle', beamMark = 0, beamSmoke = 0, beamLast: { x: number; y: number; z: number } | null = null, beamShown = false;
  const beamSolid = (x: number, y: number, z: number): boolean => (blockAt ? ((b: string) => b !== 'air' && b !== 'outside')(blockAt(x, y, z)) : y <= deps.groundY(x, z));
  const stepBeam = (dt: number): void => {
    if (!actor) return;
    const ph = actor.attackName === 'beam' && actor.mode === 'attack' ? actor.beam.phase : 'idle';
    const K = T.beam;
    if (ph === 'idle' || ph === 'done') {
      if (beamShown || beamPrev !== 'idle') { beamFx.setBeams([], [], false); beamFx.setSparkle([], 0); beamShown = false; actor.beamLook = null; }
      beamPrev = 'idle'; beamLast = null;
      sfx.beamLoopOff();
      beamFx.update(dt);
      return;
    }
    actor.eyePositions(beamEyes);
    const p = deps.player();
    const lp = beamLast;
    const env: AimEnv = {
      player: { x: p.x, y: p.y, z: p.z }, vel: { x: lp ? (p.x - lp.x) / dt : 0, z: lp ? (p.z - lp.z) / dt : 0 }, yawDeg: p.yawDeg,
      eyes: [beamEyes[0], beamEyes[1]], body: { x: actor.pos.x, z: actor.pos.z }, solid: beamSolid,
    };
    beamLast = { x: p.x, y: p.y, z: p.z };
    beamShown = true;
    if (ph === 'charge') {
      beamFx.setSparkle(beamEyes, actor.beam.glow);
      beamFx.setBeams([], [], false);
      // 予兆の 間は プレイヤーを 見る
      actor.beamLook = null;
    } else if (ph === 'fire') {
      if (beamPrev !== 'fire') { beamAim.begin(env); beamMark = 0; beamSmoke = 0; sfx.beamOn(); sfx.beamLoopOn(); }
      const r = beamAim.step(dt, env);
      const a = beamAim.a;
      beamFx.setSparkle(beamEyes, 1);
      beamFx.setBeams(beamEyes, [r.ends[0].end, r.ends[1].end], true);
      actor.beamLook = { x: a.x, y: a.y, z: a.z };
      if (r.reached) {
        beamMark -= dt; beamSmoke -= dt;
        if (beamMark <= 0) { beamMark = K.markEverySec; beamFx.burn(a.x, a.y, a.z); }
        if (beamSmoke <= 0) { beamSmoke = K.smokeEverySec; beamFx.smoke(a.x, a.y, a.z, 1, K.smokeSize); }
        if (K.breakBlocks && blockAt && deps.setBlockAir) {
          for (const e of r.ends) if (e.blocked) deps.setBlockAir(Math.floor(e.end.x), Math.floor(e.end.y), Math.floor(e.end.z));
        }
      }
      if (r.damage > 0) deps.hurt?.(r.damage, { x: actor.pos.x, y: actor.pos.y, z: actor.pos.z });
    } else {
      // 終わり: 光線を 止めて 大きな 煙（最後の 着弾点で）
      if (beamPrev === 'fire') {
        sfx.beamLoopOff(); sfx.smoke();
        const a = beamAim.a;
        beamFx.smoke(a.x, a.y, a.z, K.finaleSmoke, K.finaleSize);
      }
      beamFx.setBeams([], [], false);
      beamFx.setSparkle(beamEyes, actor.beam.glow);
      if (ph === 'recover') actor.beamLook = null;
    }
    beamPrev = ph;
    beamFx.update(dt);
  };
  // 攻撃 4「口から 火山噴火」: 灰（放射状・ランダム）・予告の 影・燃え残り・植物が 燃える・体の ガラス/こけ/おいた ブロックが 焼ける（gashaBigEruption.ts / gashaBigEruptFx.ts）
  const rain = new AshRain(), embers = new Embers(), eruptFx = new EruptFx(deps.scene, deps.camera);
  const mouthV = new Vector3(), ashV = { x: 0, y: 0, z: 0 };
  let eruptClock = 0, burntBlocks = 0;
  const bodyBurnt: { t: number; moss: number[]; placed: PlacedBlock[] }[] = [];
  const landAt = (x: number, z: number): LandInfo => {
    const ix = Math.floor(x), iz = Math.floor(z);
    const gy = deps.groundY(ix, iz) + 1;
    let top = gy;
    if (blockAt) for (let y = gy + 30; y >= gy; y--) { const b = blockAt(ix, y, iz); if (b !== 'air' && b !== 'outside') { top = y + 1; break; } }
    if (actor) for (let y = Math.floor(mouthV.y); y >= top; y--) if (actor.solid(ix, y, iz)) return { y: y + 1, body: true };
    return { y: top, body: false };
  };
  const onAshLand = (a: Ash): void => {
    const K = T.eruption;
    embers.add(a.lx, a.ly, a.lz, a.body);
    sfx.ash();
    eruptFx.puff(a.lx, a.ly, a.lz, 1, 0.8, 1.2, 0.55);
    const p = deps.player();
    if (Math.hypot(p.x - a.lx, p.z - a.lz) <= K.ash.hitRadius && Math.abs(p.y - a.ly) <= K.ash.hitYTol) deps.hurt?.(K.ash.damage, { x: a.lx, y: a.ly, z: a.lz });
    if (!a.body) {
      if (blockAt && deps.setBlockAir) for (const c of burnPlants(a.lx, a.ly, a.lz, blockAt, deps.setBlockAir)) { eruptFx.burnFlame(c.x + 0.5, c.y, c.z + 0.5); burntBlocks++; }
    } else if (model) {
      const c = { x: a.lx, y: a.ly, z: a.lz };
      breakGlass(c, K.body.glassRadius, K.body.glassMax);
      const moss = model.burnMoss(c, K.body.mossRadius);
      const pl = placed.burn(c, K.body.placedRadius, new Set(K.body.placedBurnable), K.body.placedMax);
      if (moss.length || pl.length) bodyBurnt.push({ t: eruptClock, moss, placed: pl });
    }
  };
  // 燃えかすは 殴ると 消える（刀・真空波・らせん・ドーム・パンチ・矢）。小さな 煙と「じゅっ」
  const EMBER_ID_BASE = 910_000_000;
  let doused = 0, lastDouse = -1e9, douseYm: object | null = null;
  const emberBox = { name: 'ember', c: [0, 0, 0], ax: [1, 0, 0, 0, 1, 0, 0, 0, 1], half: [0, 0, 0] } as { name: string; c: number[]; ax: number[]; half: number[] } satisfies BoxLike;
  const fillBox = (e: Ember): BoxLike => {
    const K = T.eruption.ember;
    emberBox.c[0] = e.x; emberBox.c[1] = e.y + K.douseHalfY; emberBox.c[2] = e.z;
    emberBox.half[0] = K.douseHalf; emberBox.half[1] = K.douseHalfY; emberBox.half[2] = K.douseHalf;
    return emberBox;
  };
  const douseWhere = (touch: (b: BoxLike, e: Ember) => boolean): void => {
    const gone = embers.douse((e) => touch(fillBox(e), e));
    if (!gone.length) return;
    const K = T.eruption.ember;
    doused += gone.length;
    for (const e of gone) eruptFx.puff(e.x, e.y + 0.3, e.z, K.douseSmoke, K.douseSmokeSize, 1.2, 0.5);
    if (eruptClock - lastDouse >= K.douseSoundEverySec) { lastDouse = eruptClock; sfx.smoke(); }
  };
  const stepDouse = (): void => {
    const s = deps.hit;
    if (!s) return;
    // 線の 当たり（パンチ・矢）: 燃えかすを 小さな 箱として 妖怪の 線の 当たりに 重ねる
    const ym = s.yokai?.() ?? null;
    if (ym && douseYm !== ym) {
      douseYm = ym;
      const rayPrev = ym.raycast.bind(ym), dmgPrev = ym.damage.bind(ym);
      ym.raycast = (origin, dir, max) => {
        const real = rayPrev(origin, dir, max);
        if (!embers.list.length) return real;
        const len = Math.hypot(dir.x, dir.y, dir.z) || 1;
        let best: Ember | null = null, bt = real ? real.distance : max;
        for (const e of embers.list) {
          const t = rayBox(fillBox(e), origin.x, origin.y, origin.z, dir.x / len, dir.y / len, dir.z / len, bt);
          if (t !== null && (best === null ? t <= bt : t < bt)) { best = e; bt = t; }
        }
        return best ? { id: EMBER_ID_BASE + best.id, kind: 'nurikabe', distance: bt } : real;
      };
      ym.damage = (id, amount, from, knock) => {
        if (id >= EMBER_ID_BASE && id < EMBER_ID_BASE + 1_000_000) { const want = id - EMBER_ID_BASE; douseWhere((_b, e) => e.id === want); return 0; }
        return dmgPrev(id, amount, from, knock);
      };
    }
    if (!embers.list.length) return;
    const M = T.hit;
    const b = s.blade?.() ?? null;
    if (b) {
      if (b.shape.kind === 'capsule') { const sh = b.shape; douseWhere((bx) => boxTouchesCapsule(bx, sh.from, sh.to, sh.radius + M.swordMargin)); }
      else { const sh = b.shape; douseWhere((bx) => boxTouchesFan(bx, sh, M.swordMargin)); }
    }
    for (const w of s.waves?.() ?? []) douseWhere((bx) => distToBox(bx, w.position.x, w.position.y, w.position.z) <= w.radius + M.waveMargin);
    const d = s.dome?.() ?? null;
    if (d) douseWhere((bx) => distToBox(bx, d.center.x, d.center.y, d.center.z) <= d.radius);
  };
  const stepEruption = (dt: number): void => {
    if (!actor) return;
    eruptClock += dt;
    const E = actor.eruption, ph = actor.attackName === 'eruption' && actor.mode === 'attack' ? E.phase : 'idle';
    actor.mouthPosition(mouthV);
    const mouth = { x: mouthV.x, y: mouthV.y, z: mouthV.z };
    eruptFx.setWind(mouth, ph === 'inhale' ? E.wind : 0);
    eruptFx.setColumn(mouth, ph === 'erupt' ? E.column : 0);
    eruptFx.setMouthGlow(mouth, ph === 'inhale' ? E.wind * 0.7 : ph === 'erupt' ? 0.5 + 0.5 * E.column : 0);
    if (rain.active) {
      const o = rain.update(dt, mouth, landAt);
      for (const a of o.landed) onAshLand(a);
      const views = rain.ashes.map((a) => { rain.position(a, ashV); return { x: ashV.x, y: ashV.y, z: ashV.z, spin: a.t * 6 + a.apex }; });
      eruptFx.setAshes(views);
      eruptFx.setShadows(rain.ashes.filter((a) => rain.warn(a) > 0).map((a) => ({ x: a.lx, y: a.ly, z: a.lz, warn: rain.warn(a) })));
    } else { eruptFx.setAshes([]); eruptFx.setShadows([]); }
    embers.update(dt);
    stepDouse();
    eruptFx.setEmbers(embers.list);
    const p = deps.player();
    const d = embers.step(dt, { x: p.x, y: p.y, z: p.z });
    if (d > 0) deps.hurt?.(d, { x: p.x, y: p.y, z: p.z - 1 });
    // 焼けた 体は 時間で もどる（ガラスは glass の 再生）
    while (bodyBurnt.length && eruptClock - bodyBurnt[0]!.t >= T.eruption.body.restoreSec) {
      const b = bodyBurnt.shift()!;
      model?.restoreMoss(b.moss);
      for (const pb of b.placed) placed.restore(pb);
    }
    sfx.embers(embers.list.length);
    eruptFx.update(dt);
  };
  // 攻撃 5「自分に 落雷」: 雷雲・指への 落雷・体の 電気（触れると ダメージ）・まわりの 落雷と 予告（gashaBigThunder.ts / gashaBigThunderFx.ts）
  const strikes = new StrikeField(), thunderFx = new ThunderFx(deps.scene, deps.camera), bodyShock = new BodyShock();
  const tipV = new Vector3();
  let fingerBolt: { age: number; variant: number } | null = null;
  let thunderBodyHurts = 0, thunderStrikeHurts = 0, thunderHitLog: { x: number; z: number }[] = [];
  const boltViews: BoltView[] = [], ringViews: RingView[] = [], warnViews: WarnView[] = [];
  const stepThunder = (dt: number): void => {
    if (!actor) return;
    const A = actor.thunder, K = T.thunder, strikeLead = 7 / 60;
    thunderFx.setSky(A.cloud, A.flash, reduced());
    actor.fingerTip(tipV);
    const fingerOn = A.phase === 'point' || A.phase === 'strike' || A.phase === 'shock';
    thunderFx.setFinger(fingerOn ? tipV : null, A.glow);
    boltViews.length = 0; ringViews.length = 0; warnViews.length = 0;
    if (fingerBolt) {
      fingerBolt.age += dt;
      if (fingerBolt.age > 0.7) fingerBolt = null;
      else boltViews.push({ x: tipV.x, y: tipV.y, z: tipV.z, age: fingerBolt.age, variant: fingerBolt.variant, scale: K.boltScaleFinger });
    }
    if (strikes.active) {
      const p = deps.player();
      const o = strikes.update(dt, { center: { x: actor.pos.x, y: actor.pos.y, z: actor.pos.z }, player: { x: p.x, y: p.y, z: p.z }, landAt });
      for (const s of o.hits) {
        sfx.bolt();
        thunderHitLog.push({ x: s.x, z: s.z });
        if (strikes.inStrike(s, p) && deps.hurt?.(K.around.damage, { x: s.x, y: s.y, z: s.z }) !== undefined) thunderStrikeHurts++;
      }
      for (const s of strikes.list) {
        if (s.t < 0) warnViews.push({ x: s.x, y: s.y, z: s.z, warn: strikes.warn(s), radius: K.around.radius });
        else ringViews.push({ x: s.x, y: s.y, z: s.z, age: s.t, radius: K.around.radius });
        if (s.t + strikeLead >= 0) boltViews.push({ x: s.x, y: s.y, z: s.z, age: s.t + strikeLead, variant: boltVariantOf(293 + actor.thunderCount, s.id), scale: K.boltScaleGround });
      }
    }
    thunderFx.setBolts(boltViews); thunderFx.setRings(ringViews); thunderFx.setWarns(warnViews);
    // 体の 電気: 走って いる 間 触れて いる 人に ダメージ
    thunderFx.setElectric(A.elec > 0.01 ? actor.boxList : [], A.elec);
    if (A.elec > 0.05) sfx.elecOn(); else sfx.elecOff();
    const live = A.live, pl = deps.player();
    const touching = live && touchBody((i, j, k) => actor!.solid(i, j, k), { x: pl.x, y: pl.y, z: pl.z }, K.body.touchMargin);
    const d = bodyShock.step(dt, live, touching);
    if (d > 0) { deps.hurt?.(d, { x: actor.pos.x, y: actor.pos.y, z: actor.pos.z }); thunderBodyHurts++; }
    thunderFx.update(dt);
  };
  deps.blockPlayerInput?.(() => shock.inputBlocked() || throwLeft > 0 || spinLeft > 0);
  deps.onBeforeRender?.(() => shockFx.applyShake(Math.max(reduced() ? 0 : shock.shakeNow, warnLeft > 0 ? T.core.throwOff.warnShakeDeg * (reduced() ? 0.25 : 1) : 0, quake.active && riding() ? T.slam2.quake.bodyShakeDeg * (reduced() ? 0.25 : 1) : 0), shock.time));
  const fwdOf = (p: { yawDeg: number }) => { const y = (p.yawDeg * Math.PI) / 180; return { fx: Math.sin(y), fz: -Math.cos(y) }; };

  const clear = () => {
    if (!model) return;
    deps.scene.remove(model.group);
    const mats = new Set<MeshBasicMaterial>();
    model.group.traverse((o) => { const m = o as Mesh; if (m.isMesh) { m.geometry.dispose(); mats.add(m.material as MeshBasicMaterial); } });
    mats.forEach((m) => { deps.lighting?.unregister?.(m); m.dispose(); });
    model = null;
    brokenQ.length = 0;
    placed.reset();
  };

  /** 当たりの 箱の 場所を いまの 姿勢で 更新（マスの 集合は 作らない。判定は その 場で 箱に 聞く） */
  const refresh = (): void => {
    if (!model || !actor) return;
    model.group.updateMatrixWorld(true);
    actor.updateBoxes();
  };

  const place = (at?: { x: number; z: number; yawDeg?: number }): void => {
    clear();
    model = buildBig();
    hidden = false;
    defeatedFired = false;
    deps.lighting?.registerTree(model.group, 'doll');
    const p = deps.player();
    const f = fwdOf(p);
    const mx = at ? at.x : p.x + f.fx * T.place.distance, mz = at ? at.z : p.z + f.fz * T.place.distance;
    yaw = at && at.yawDeg !== undefined ? (at.yawDeg * Math.PI) / 180 : Math.atan2(p.x - mx, p.z - mz) + (T.place.faceYawOffsetDeg * Math.PI) / 180;
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
    }
    pos = new Vector3(mx, base, mz);
    model.group.position.copy(pos);
    model.group.rotation.y = yaw;
    model.group.scale.setScalar(s);
    deps.scene.add(model.group);
    // 間欠泉は ここで 場所を きめる（がしゃどくろが その後 動いても そのまま）
    geysers?.place({ x: pos.x, y: pos.y, z: pos.z, yaw, scale: s });
    actor = new BigActor(model, CLIPS, {
      groundY: deps.groundY, player: deps.player, carryPlayer: deps.carryPlayer,
      onSlam: (x, y, z) => {
        shockFx.spawn(shock.add('slam', x, y, z));
        sfx.step();
        if (blockAt && deps.setBlockAir) crushAt(x, y, z, { getBlock: blockAt, setAir: deps.setBlockAir, onBlocks: deps.onCrushBlocks });
      },
      onTap: (x, y, z) => { shockFx.spawn(shock.add('tap', x, y, z)); sfx.step(); },
      onAttackStart: (name) => { if (name === 'slam2') sfx.lift(); else if (name === 'sweep') sfx.windup(); else if (name === 'beam') sfx.omen(); else if (name === 'eruption') sfx.inhale(); else if (name === 'thunder') sfx.cloud(); },
      onEruptStart: () => { rain.begin(actor?.eruptionCount ?? 0); sfx.erupt(); },
      onThunderStrike: () => { fingerBolt = { age: 0, variant: boltVariantOf(293, actor?.thunderCount ?? 0) }; sfx.strike(); },
      onThunderLand: () => { strikes.begin((actor?.thunderCount ?? 1) - 1); thunderHitLog = []; bodyShock.reset(); },
      onSweepStroke: (i) => { sfx.sweep(i); },
      onSlam2: (x, y, z, fx, fz) => {
        sfx.slam();
        shockFx.spawn(shock.add('slam2', x, y, z, { fx, fz }));
        if (blockAt && deps.setBlockAir) crushAt(x, y, z, { getBlock: blockAt, setAir: deps.setBlockAir, onBlocks: deps.onCrushBlocks }, T.slam2);
        quake.start();
      },
    }, 293);
    actor.place(pos.x, pos.y, pos.z, yaw);
    actor.walk(T.wander.enabledAtStart);
    if (isAngry) actor.hit();
    bh.bind(actor.boxList, model);
  };

  deps.addPlayerSolid((x, y, z) => actor !== null && !hidden && actor.solid(x, y, z));
  // BGM「神々の 戯れ」: 怒って いる（赤い 目の）間だけ。少女が 出た あとは 共通の 係が「災厄」を 優先する（gashaBgm.ts）
  const bgm = deps.bgmOut && deps.suppressBgm ? sharedGashaBgm({ bgmOut: deps.bgmOut, suppressBgm: deps.suppressBgm }) : null;
  let bgmWant = false;
  deps.onUpdate?.((dt) => {
    // 片づけた あと・少女の 間は 何も 動かさない（BGM の 後始末だけ 毎コマ）
    if (!actor || hidden) { bgm?.step(); return; }
    updateHaze();
    actor.update(dt);
    model?.updateMoss();
    bh.step(dt);
    if (!defeatedFired && bh.hp <= 0) { defeatedFired = true; deps.onDefeated?.(); if (!actor) return; }
    stepGlass(dt);
    stepCoreWarn(dt);
    quake.step(dt);
    stepSweep(dt);
    stepBeam(dt);
    stepEruption(dt);
    stepThunder(dt);
    // アースクエイクの ゴゴゴ: ゆれの のこりが 少なく なったら 小さく して 切る
    if (quake.left > T.sfx.quakeFadeOutSec) sfx.quakeOn(); else sfx.quakeOff();
    sfx.update();
    shockFx.setWarn(actor.warn);
    if (throwLeft > 0) { throwLeft -= dt; deps.nudgePlayer?.(throwDir.x * T.core.throwOff.speed * dt, throwDir.z * T.core.throwOff.speed * dt); }
    shock.step(dt);
    shockFx.update(dt);
    pos = actor.pos; yaw = actor.yaw;
    if (bgm) {
      const w = actor.angryLeft > 0;
      if (w !== bgmWant) { bgmWant = w; bgm.request('big', w); }
      bgm.step();
    }
  });
  place(first);
  deps.onBodyBlocks?.(placed);

  /** 攻撃の エフェクト・音・燃えかす・雷・たたいた 輪・ひるみ・画面の ゆれを ぜんぶ 止めて 消す（体は そのまま）。keepBurnt: 体の 焼け あとの もどす 予定は のこす */
  const clearFx = (full: boolean): void => {
    quake.stop(); beamFx.clear(); eruptFx.clear(); rain.active = false; rain.ashes = []; embers.clear();
    if (full) bodyBurnt.length = 0;
    thunderFx.clear(); strikes.clear(); bodyShock.reset(); fingerBolt = null; sfx.stopAll();
    shock.clear(); shockFx.clear();
    throwLeft = 0; warnLeft = 0; spinLeft = 0;
  };
  const detachedGroup = new Group();

  /** 片づける（#293 まとめ）。体・当たり・間欠泉・体力ゲージ・射線の 割りこみ・エフェクト・燃えかす・音を 消す。あとは place(at) で また 出せる */
  const despawn = (): void => {
    clearFx(true);
    geysers?.dismiss();
    bh.dismiss();
    clear();
    actor = null;
    isAngry = false; hidden = false; defeatedFired = false;
    if (bgm) { bgmWant = false; bgm.request('big', false); bgm.step(); }
  };

  /** 少女に かわる 間だけ かくす / もどす */
  const hide = (on: boolean): void => {
    if (!model || !actor || on === hidden) return;
    hidden = on;
    model.group.visible = !on;
    if (on) {
      // 体の 上に のっている 人は 地面へ おろす（高い 所から 落とさない）
      const p = deps.player();
      if (deps.carryPlayer && actor.boxUnder(p.x, p.y, p.z) >= 0) deps.carryPlayer(0, deps.groundY(Math.floor(p.x), Math.floor(p.z)) + 1 - p.y, 0, 0);
      clearFx(false);
      bh.bind([], null);
      if (bgm && !bgmWant && actor.angryLeft > 0) { bgmWant = true; bgm.request('big', true); }
    } else {
      bh.bind(actor.boxList, model);
    }
  };

  const handle: GashaBigHandle = {
    tune: (o) => applyTune(o),
    place: (at) => { clearFx(true); bodyBurnt.length = 0; place(at); bh.reset(); },
    despawn,
    hide,
    maxHp: () => bh.maxHp,
    hp: () => bh.hp,
    damage: (part, amount) => bh.damage(part, amount),
    section: (on) => {
      if (!model || !actor) return;
      const i = actor.model.hits.findIndex((h) => h.name === 'core');
      const b = i >= 0 ? actor.boxList[i] : undefined;
      if (!b) return;
      const plane = new Plane().setFromNormalAndCoplanarPoint(new Vector3(-b.ax[0]!, -b.ax[1]!, -b.ax[2]!), new Vector3(b.c[0]!, b.c[1]!, b.c[2]!)); // 左（+x）がわが 消える
      model.group.traverse((o) => {
        const m = o as Mesh;
        if (!m.isMesh) return;
        const mat = m.material as MeshBasicMaterial;
        mat.clippingPlanes = on ? [plane] : null;
        mat.needsUpdate = true;
        m.onBeforeRender = on ? (r) => { r.localClippingEnabled = true; } : () => undefined;
      });
    },
    angry: (on) => { isAngry = on; actor?.angry(on); },
    hit: () => { isAngry = true; actor?.hit(); },
    walk: (on) => actor?.walk(on),
    goTo: (x, z) => actor?.goTo(x, z),
    lookBack: () => actor?.lookBack(),
    back: (on) => actor?.back(on),
    attack: (name) => actor?.attack(name),
    tired: (sec) => actor?.tired(sec),
    attackInfo: () => ({
      mode: actor?.mode ?? '', phase: actor?.cycle.phase ?? 'off', attack: actor?.attackName ?? null, done: actor?.cycle.done ?? 0, count: actor?.cycle.count ?? 0, left: actor?.cycle.left ?? 0,
      slam2Count: actor?.slam2Count ?? 0, sweepCount: actor?.sweepCount ?? 0, sweepActive: actor?.sweepNow?.side ?? null, quakeLeft: quake.left, warn: !!actor?.warn, fx: shockFx.bigCounts(),
      beamCount: actor?.beamCount ?? 0, beamPhase: actor?.beam.phase ?? 'idle', beamMode: actor && actor.attackName === 'beam' ? beamAim.mode : null, beamAim: actor && actor.attackName === 'beam' && beamPrev === 'fire' ? { ...beamAim.a } : null, beamFx: beamFx.counts(),
      thunder: { count: actor?.thunderCount ?? 0, phase: actor?.thunder.phase ?? 'idle', cloud: actor?.thunder.cloud ?? 0, elec: actor?.thunder.elec ?? 0, strikes: strikes.list.length, hits: strikes.hitCount, bodyHurts: thunderBodyHurts, strikeHurts: thunderStrikeHurts, fx: thunderFx.counts() },
      eruption: { count: actor?.eruptionCount ?? 0, phase: actor?.eruption.phase ?? 'idle', flying: rain.ashes.length, landed: rain.landedCount, embers: embers.list.length, onBody: embers.list.filter((e) => e.body).length, mossHidden: model?.mossHidden() ?? 0, glassBroken: brokenQ.length, burntBlocks, doused, fx: eruptFx.counts() },
    }),
    rest: (sec) => actor?.rest(sec),
    thunderSpots: () => thunderHitLog.map((q) => ({ ...q })),
    eruptionEmbers: () => embers.list.map((e) => ({ ...e })),
    motion: () => (actor ? {
      mode: actor.mode, speedNow: actor.speedNow, crawlSpeed: actor.crawlSpeed, crawlRate: actor.crawlRate, strideScale: actor.strideScale, backOn: actor.backOn, target: actor.target, wander: actor.wanderOn,
      angryLeft: actor.angryLeft, eyeMix: actor.eyeMix, walkLeft: actor.walkLeft, restLeft: actor.restLeft, work: actor.work, plant: actor.plant,
    } : {}),
    breakGlass,
    glassInfo: () => ({ total: model?.glass.length ?? 0, broken: brokenQ.length }),
    colliders: () => (model && !hidden ? worldHits(model) : []),
    refreshColliders: refresh,
    joints: () => (model ? { ...model.joints } : {}),
    solidAt: (x, y, z) => (hidden ? false : actor?.solid(x, y, z) ?? false),
    geysers: () => geysers?.geysers() ?? [],
    spawnGeyser: (x, z, sec) => geysers?.spawn(x, z, sec) ?? false,
    giveTabi: () => deps.giveNinjaTabi?.(),
    shock: () => ({
      staggerLeft: shock.staggerLeft, inputBlocked: shock.inputBlocked(), hits: shock.hits.slice(), impacts: shock.impacts.length, shake: shock.shakeNow, lastPush: shock.lastPush,
      slams: actor?.step.slams ?? 0, taps: actor?.step.taps ?? 0, phase: actor?.step.phase ?? '', fx: shockFx.counts(), lastSlam: actor?.lastSlam ?? null, lastTap: actor?.lastTap ?? null,
    }),
    info: () => ({
      scale: model?.scale, pos: [pos.x, pos.y, pos.z], yawDeg: (yaw * 180) / Math.PI, drawCalls: model?.meshes, hitBoxes: model?.hits.length, angry: (actor?.angryLeft ?? 0) > 0, hp: bh.hp, maxHp: bh.maxHp, lastHit: bh.last, deflects: bh.deflects,
      coreWarn: { warnLeft, throwLeft, spinLeft },
      head: model ? model.head.clone().multiplyScalar(model.scale).applyQuaternion(new Quaternion().setFromAxisAngle(UP, yaw)).add(pos).toArray() : null,
      rest: model ? Object.fromEntries(JOINT_NAMES.map((j) => [j, model!.rest[j].toArray()])) : null,
    }),
    bodyBlocks: placed,
    get group() { return model ? model.group : detachedGroup; },
  };
  (window as unknown as { __gashaBig: GashaBigHandle }).__gashaBig = handle;
  if (!deps.noTabi) deps.giveNinjaTabi?.(); // #293: 試作・テストでは はじめから 忍者の足袋を 着ている。ふだんの ゲーム（noTabi）では ごほうび
  return handle;
}
