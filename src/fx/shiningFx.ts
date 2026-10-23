import * as THREE from 'three';
import type { DomeView } from '../legend/LegendSystem';

/**
 * WEAPON-7 PR3 §5.3: 虹の シャイニングの ドームの 見た目。設計書 `art/WEAPON-7/shining/spec.md`。
 * 4 描画・124 三角形: ①まん中の 光 ＋ まく（カメラに 向く 板 2 まい）②地面の わ ③にじの 帯（球の ぼうし）④光の かけら 24 こ（InstancedMesh）。
 * - 絵は Nearest・ミップマップなし・足し算・depthWrite なし。パスは 相対（GitHub Pages）。
 * - 大きさ s と opacity は `shiningLook`: うかぶ 0→1、おりる 1→0、とどまる 間は 一定（点滅なし）。
 * - 一人称では ①を 出さない（画面が 白く ならない ように）。「動きを へらす」では 帯・かけらを 止める。
 * - 毎フレーム new しない。かけらの 乱数は シード付き。
 */
const BASE = './models/fx/';
export const SHINING_BASE_RADIUS = 7;
export const SHINING_BAND_STEPS = 360; // 帯の うずが 1 周 = 6 秒
export const SHINING_RAINBOW_STEPS = 480; // 色が 1 周 = 8 秒
export const SPARK_COUNT = 24;
const BODY_CENTER = 0.9;
const BAND_REPEAT = 2;
const CD_GAIN = 0.4;
const RING_GAIN = 0.75;
const BAND_GAIN = 0.85;

export interface ShiningLook {
  /** 大きさ 0〜1（半径 / 7） */
  s: number;
  /** 明るさ 0〜1 */
  opacity: number;
}

/** 区間ごとの 大きさと 明るさ。とどまる 間は どちらも 一定 */
export function shiningLook(d: DomeView | null, baseRadius = SHINING_BASE_RADIUS): ShiningLook {
  if (!d) return { s: 0, opacity: 0 };
  const s = Math.max(0, Math.min(1, d.radius / baseRadius));
  const opacity = d.phase === 'rise' ? d.t : d.phase === 'fall' ? 1 - d.t : 1;
  return { s, opacity: Math.max(0, Math.min(1, opacity)) };
}

/** 地面の わの 半径 = √(球の 半径² − 体の 中心の 高さ²) */
export function ringRadius(sphereR: number, centerAboveGround: number): number {
  return Math.sqrt(Math.max(0, sphereR * sphereR - centerAboveGround * centerAboveGround));
}

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function loadTexture(url: string, srgb: boolean, repeat = false): THREE.Texture {
  const tex = new THREE.TextureLoader().load(url);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
  }
  return tex;
}

const RAINBOW = ['#FF8C94', '#FFE585', '#86EBA8', '#82C6FF', '#C79CFF'];

export interface ShiningFxDeps {
  scene: THREE.Scene;
  camera: THREE.Camera;
  basePath?: string;
}

export interface ShiningStepIn {
  /** `legend.state().dome`（なければ null） */
  dome: DomeView | null;
  /** 体の 中心の x・z（`legend.dome()`） */
  x: number;
  z: number;
  firstPerson: boolean;
  reduced: boolean;
}

export class ShiningFx {
  readonly group = new THREE.Group();
  private readonly cd: THREE.Mesh;
  private readonly ring: THREE.Mesh;
  private readonly band: THREE.Mesh;
  private readonly sparks: THREE.InstancedMesh;
  private readonly mats: THREE.MeshBasicMaterial[] = [];
  private readonly bandMat: THREE.MeshBasicMaterial;
  private readonly cdMat: THREE.MeshBasicMaterial;
  private readonly ringMat: THREE.MeshBasicMaterial;
  private readonly rainbowTex: THREE.Texture;
  private readonly bandTex: THREE.Texture;
  private readonly texs: THREE.Texture[] = [];
  private readonly geos: THREE.BufferGeometry[] = [];
  // かけら
  private readonly sx = new Float32Array(SPARK_COUNT);
  private readonly sz = new Float32Array(SPARK_COUNT);
  private readonly sy = new Float32Array(SPARK_COUNT);
  private readonly svy = new Float32Array(SPARK_COUNT);
  private readonly ssize = new Float32Array(SPARK_COUNT);
  private readonly mtx = new THREE.Matrix4();
  private readonly qd = new THREE.Quaternion();
  private readonly pv = new THREE.Vector3();
  private readonly sv = new THREE.Vector3();
  private groundY: number | null = null;
  private lastLook: ShiningLook = { s: 0, opacity: 0 };
  private filmOn = true;
  private bandPhase = 0;
  private rainbowPhase = 0;

  constructor(private readonly deps: ShiningFxDeps, seed = 7) {
    const base = deps.basePath ?? BASE;
    const mk = (map: THREE.Texture, extra: Partial<THREE.MeshBasicMaterialParameters> = {}): THREE.MeshBasicMaterial => {
      const m = new THREE.MeshBasicMaterial({ map, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0, side: THREE.DoubleSide, ...extra });
      this.mats.push(m);
      return m;
    };
    const atlas = loadTexture(`${base}shining_cd_atlas.png`, true);
    const ringT = loadTexture(`${base}shining_ring.png`, true);
    const sparkT = loadTexture(`${base}shining_spark.png`, true);
    this.rainbowTex = loadTexture(`${base}shining_rainbow.png`, true, true);
    this.bandTex = loadTexture(`${base}shining_band.png`, false, true);
    this.bandTex.repeat.x = BAND_REPEAT;
    this.texs.push(atlas, ringT, sparkT, this.rainbowTex, this.bandTex);

    // ① まん中の 光 ＋ まく（板 2 まい = 1 メッシュ）。dome = 14 角・core = 3 角（手前へ 0.05）
    const g1 = new THREE.BufferGeometry();
    const quad = (h: number, z: number, u0: number, v0: number, u1: number, v1: number) => ({
      p: [-h, -h, z, h, -h, z, h, h, z, -h, h, z],
      uv: [u0, v0, u1, v0, u1, v1, u0, v1],
    });
    const dq = quad(SHINING_BASE_RADIUS, 0, 0, 0, 64 / 96, 1);
    const cq = quad(1.5, 0.05, 64 / 96, 0.5, 1, 1);
    g1.setAttribute('position', new THREE.Float32BufferAttribute([...dq.p, ...cq.p], 3));
    g1.setAttribute('uv', new THREE.Float32BufferAttribute([...dq.uv, ...cq.uv], 2));
    g1.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
    this.cdMat = mk(atlas);
    this.cd = new THREE.Mesh(g1, this.cdMat);
    // ② 地面の わ（ねかせた 板。1 辺 1 を 2 × 半径に 拡大）
    const g2 = new THREE.PlaneGeometry(1, 1);
    g2.rotateX(-Math.PI / 2);
    this.ringMat = mk(ringT);
    this.ring = new THREE.Mesh(g2, this.ringMat);
    // ③ にじの 帯（球の 上から 115 度）
    const g3 = new THREE.SphereGeometry(1, 10, 4, 0, Math.PI * 2, 0, 2.0);
    // 帯は 足し算だと 明るい 空の 上で 白く つぶれて にじの 色が 見えない ので、ふつうの 半透明で ぬる
    this.bandMat = mk(this.rainbowTex, { alphaMap: this.bandTex, blending: THREE.NormalBlending });
    this.band = new THREE.Mesh(g3, this.bandMat);
    // ④ 光の かけら（板 24 こ）
    const g4 = new THREE.PlaneGeometry(1, 1);
    this.sparks = new THREE.InstancedMesh(g4, mk(sparkT, { side: THREE.FrontSide }), SPARK_COUNT);
    this.sparks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.geos.push(g1, g2, g3, g4);
    const c = new THREE.Color();
    const r = rng(seed);
    for (let i = 0; i < SPARK_COUNT; i++) {
      c.set(RAINBOW[i % 5]!);
      this.sparks.setColorAt(i, c);
      const a = r() * Math.PI * 2;
      const rho = Math.sqrt(r()) * 0.9; // 球の 中（半径 6.3 まで）
      this.sx[i] = Math.cos(a) * rho;
      this.sz[i] = Math.sin(a) * rho;
      this.sy[i] = r(); // 0〜1 の 高さの 割合（高さは 後で 決める）
      this.svy[i] = 0.01 + 0.01 * r();
      this.ssize[i] = r() < 0.17 ? 0.15 : 0.3;
    }
    for (const m of [this.cd, this.ring, this.band, this.sparks]) {
      m.frustumCulled = false;
      m.renderOrder = 40;
      this.group.add(m);
    }
    this.group.visible = false;
    deps.scene.add(this.group);
  }

  /** 描画の 数と 三角形の 数（確かめ用） */
  stats(): { draws: number; triangles: number } {
    let tri = 0;
    const count = (g: THREE.BufferGeometry, n = 1) => (tri += ((g.index ? g.index.count : g.getAttribute('position').count) / 3) * n);
    count(this.cd.geometry);
    count(this.ring.geometry);
    count(this.band.geometry);
    count(this.sparks.geometry, SPARK_COUNT);
    return { draws: 4, triangles: tri };
  }

  /** 今の 見え方（確かめ用） */
  look(): ShiningLook & { visible: boolean; cdVisible: boolean; filmOn: boolean; bandOffset: { x: number; y: number }; opacities: number[] } {
    return {
      ...this.lastLook,
      visible: this.group.visible,
      cdVisible: this.cd.visible,
      filmOn: this.filmOn,
      bandOffset: { x: this.bandTex.offset.x, y: this.rainbowTex.offset.y },
      opacities: this.mats.map((m) => m.opacity),
    };
  }

  /** 1 ステップに 1 回 */
  step(i: ShiningStepIn): void {
    const d = i.dome;
    const look = shiningLook(d);
    this.lastLook = look;
    if (!d || look.s <= 0 || look.opacity <= 0) {
      this.group.visible = false;
      this.groundY = null;
      return;
    }
    // 足もとの 地面は はじめの 1 ステップ目で おぼえる（うかぶ・おりるの 間の わの 大きさを 出す ため）
    if (this.groundY === null) this.groundY = d.centerY - BODY_CENTER;
    const cy = d.centerY;
    const above = Math.max(0, cy - this.groundY);
    const R = d.radius;
    this.group.visible = true;
    this.group.position.set(i.x, cy, i.z);

    for (const m of this.mats) m.opacity = look.opacity;
    this.ringMat.opacity = look.opacity * RING_GAIN;
    // 足し算は 明るい 空の 上で 白く つぶれやすい ので、まくと 帯は 少し うすく する（とどまる 間は 一定）
    this.cdMat.opacity = look.opacity * CD_GAIN;
    this.bandMat.opacity = look.opacity * BAND_GAIN;

    // ① まん中の 光 ＋ まく: カメラの 向き・一人称では 出さない
    // カメラが ドームの 中に いる とき（体の 中心との きょり < 半径）は まくを 出さない（まん中の 光だけ）。一人称は どちらも なし
    const cp = this.deps.camera.position;
    const inside = Math.hypot(cp.x - i.x, cp.y - cy, cp.z - i.z) < R;
    this.cd.visible = !i.firstPerson;
    this.cd.geometry.setDrawRange(inside ? 6 : 0, inside ? 6 : 12);
    this.filmOn = !inside;
    this.cd.quaternion.copy(this.deps.camera.quaternion);
    this.cd.scale.setScalar(look.s);
    // ② 地面の わ
    this.ring.position.set(0, this.groundY + 0.02 - cy, 0);
    this.ring.scale.setScalar(Math.max(0.001, 2 * ringRadius(R, above)));
    // ③ 帯
    this.band.scale.setScalar(R);
    if (!i.reduced) {
      this.bandPhase = (this.bandPhase + 1) % SHINING_BAND_STEPS;
      this.rainbowPhase = (this.rainbowPhase + 1) % SHINING_RAINBOW_STEPS;
    }
    this.bandTex.offset.x = this.bandPhase / SHINING_BAND_STEPS;
    this.rainbowTex.offset.y = this.rainbowPhase / SHINING_RAINBOW_STEPS;
    // ④ かけら
    this.stepSparks(R, above, look.s, i.reduced);
  }

  private stepSparks(R: number, above: number, s: number, reduced: boolean): void {
    const top = R * 0.85;
    const span = top + above; // 地面から 上までの 高さ
    for (let k = 0; k < SPARK_COUNT; k++) {
      let u = this.sy[k]!;
      if (!reduced) {
        u += this.svy[k]! / Math.max(1, span);
        if (u >= 1) u -= 1; // 上まで 行ったら 中の 下へ もどす（小さく なって から）
        this.sy[k] = u;
      }
      const y = -above + u * span;
      const edge = Math.min(1, Math.min(u, 1 - u) / 0.12); // 上と 下で 小さく なって 消える（点滅しない）
      const size = this.ssize[k]! * edge * s;
      this.pv.set(this.sx[k]! * R, y, this.sz[k]! * R);
      this.sv.set(size, size, 1);
      this.qd.copy(this.deps.camera.quaternion);
      this.mtx.compose(this.pv, this.qd, this.sv);
      this.sparks.setMatrixAt(k, this.mtx);
    }
    this.sparks.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.group.removeFromParent();
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
    for (const t of this.texs) t.dispose();
    this.sparks.dispose();
  }
}
