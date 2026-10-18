import * as THREE from 'three';
import type { Vec3 } from '../contracts';
import bladePath from './bladePath.json';
import { makeRng } from './sfxVary';

/**
 * WEAPON-5 刀のパリィの 見た目（火花・青白い光・よろけアイコン）。
 * 絵は `public/models/fx/`（parry_spark.png・parry_icon.png）、数は `parry_fx.json`。赤・点滅は 使わない。
 * 毎フレーム new しない（InstancedMesh と 使い回しの Vector3）。
 */

// ---------------------------------------------------------------- 数（parry_fx.json と そろえる）

/** 青白い光の 強さ（成功の 次の ステップが 1）。`parryGlowLevel` と 同じ 形で 20 まで */
export const GLOW_COLORS = { aura: 0x8fd8ff, particle: 0xffffff } as const;
export const AURA_MAX_ALPHA = 0.59;
export const SPARK_COLORS = [0xfff3a0, 0xffffff, 0x5fd3ff] as const;
export const SPARK_PARTICLES = 12;
export const SPARK_STEPS = 12;
/** 火花の コマ（S・S+3・S+8） */
export function sparkFrameOf(age: number): number {
  return age < 3 ? 0 : age < 8 ? 1 : 2;
}
export const ICON_CELL = 16;
export const ICON_SPIN_FRAMES = 8;
/** 回る 1 コマ = 0.25 秒 = 15 ステップ */
export const ICON_SPIN_STEPS = 15;
export const ICON_BURST_STEPS = 6;
export const ICON_BLOCKS = 0.5;
export const ICON_GAP_BLOCKS = 0.05;

export function iconSpinFrame(tick: number): number {
  return Math.floor(tick / ICON_SPIN_STEPS) % ICON_SPIN_FRAMES;
}
/** はじける 4 コマ（1.5 ステップずつ） */
export function iconBurstFrame(age: number): number {
  return Math.min(3, Math.floor(age / 1.5));
}

type PathPoint = { base: number[]; tip: number[] };
const PARRY_PATH = (bladePath as unknown as { parry: { perTick: PathPoint[] } }).parry.perTick;

/** 受けの 刀の まん中（足もと P・向き facingDeg から。右・上・前 の 軸） */
export function bladeMidInto(out: Vec3, p: Vec3, facingDeg: number, tick = 10): Vec3 {
  const pt = PARRY_PATH[Math.min(PARRY_PATH.length - 1, Math.max(0, tick))]!;
  const r = (pt.base[0]! + pt.tip[0]!) / 2;
  const u = (pt.base[1]! + pt.tip[1]!) / 2;
  const f = (pt.base[2]! + pt.tip[2]!) / 2;
  const a = (facingDeg * Math.PI) / 180;
  // 前 = (sin a, -cos a)、右 = (cos a, sin a)（0 度 = 北 = -z）
  out.x = p.x + Math.sin(a) * f + Math.cos(a) * r;
  out.z = p.z - Math.cos(a) * f + Math.sin(a) * r;
  out.y = p.y + u;
  return out;
}

export interface ParryFxDeps {
  scene: THREE.Scene;
  camera: THREE.Camera;
  /** 例: '/models/fx/' */
  basePath: string;
  seed?: number;
}

export interface GlowInput {
  visible: boolean;
  level: number;
  /** 足もと */
  position: Vec3;
  /** 『動きを へらす』: 粒を 止める */
  reduced: boolean;
}

const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

function loadTexture(url: string): THREE.Texture {
  const tex = new THREE.TextureLoader().load(url);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class ParryFx {
  private readonly deps: ParryFxDeps;
  private readonly rng: () => number;

  // 火花
  private readonly sparkTex: THREE.Texture;
  private readonly sparkMesh: THREE.Mesh;
  private readonly bits: THREE.InstancedMesh;
  private readonly bitVel: Float32Array;
  private readonly bitPos: Float32Array;
  private sparkAge = -1;
  private readonly sparkAt = new THREE.Vector3();

  // 青白い光
  private readonly aura: THREE.Mesh;
  private readonly rise: THREE.InstancedMesh;
  private readonly risePhase = [0.0, 0.17, 0.33, 0.5, 0.67, 0.83];
  private auraLevel = 0;
  private readonly riseY = new Float32Array(6);
  private readonly riseX = [-0.35, 0.3, -0.15, 0.4, -0.4, 0.1];
  private readonly feet = new THREE.Vector3();

  constructor(deps: ParryFxDeps) {
    this.deps = deps;
    this.rng = makeRng(deps.seed ?? 5150);
    const base = deps.basePath.endsWith('/') ? deps.basePath : `${deps.basePath}/`;

    this.sparkTex = loadTexture(`${base}parry_spark.png`);
    this.sparkTex.repeat.set(1 / 4, 1);
    const sparkMat = new THREE.MeshBasicMaterial({ map: this.sparkTex, transparent: true, depthTest: false, depthWrite: false, fog: false });
    this.sparkMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), sparkMat);
    this.sparkMesh.visible = false;
    this.sparkMesh.renderOrder = 20;
    this.sparkMesh.frustumCulled = false;
    deps.scene.add(this.sparkMesh);

    const bitMat = new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false, fog: false });
    this.bits = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.05, 0.05), bitMat, SPARK_PARTICLES);
    this.bits.count = 0;
    this.bits.renderOrder = 21;
    this.bits.frustumCulled = false;
    for (let i = 0; i < SPARK_PARTICLES; i++) this.bits.setColorAt(i, _c.setHex(SPARK_COLORS[i % 3]!));
    deps.scene.add(this.bits);
    this.bitVel = new Float32Array(SPARK_PARTICLES * 3);
    this.bitPos = new Float32Array(SPARK_PARTICLES * 3);

    const auraMat = new THREE.MeshBasicMaterial({ color: GLOW_COLORS.aura, transparent: true, opacity: 0, depthWrite: false, fog: false });
    this.aura = new THREE.Mesh(new THREE.CircleGeometry(0.5, 28), auraMat);
    this.aura.scale.set(1.3, 2.3, 1);
    this.aura.visible = false;
    this.aura.renderOrder = -1;
    this.aura.frustumCulled = false;
    deps.scene.add(this.aura);

    const dia = new THREE.Shape();
    dia.moveTo(0, 0.5);
    dia.lineTo(0.3, 0);
    dia.lineTo(0, -0.5);
    dia.lineTo(-0.3, 0);
    dia.closePath();
    const riseMat = new THREE.MeshBasicMaterial({ color: GLOW_COLORS.particle, transparent: true, opacity: 0.9, depthWrite: false, fog: false });
    this.rise = new THREE.InstancedMesh(new THREE.ShapeGeometry(dia), riseMat, 6);
    this.rise.count = 0;
    this.rise.frustumCulled = false;
    deps.scene.add(this.rise);
  }

  /** 成功: 受けの 刀の まん中で 火花（12 こ） */
  spark(at: Vec3, reduced = false): void {
    this.sparkAge = 0;
    this.sparkAt.set(at.x, at.y, at.z);
    const n = reduced ? SPARK_PARTICLES / 2 : SPARK_PARTICLES;
    this.bits.count = n;
    for (let i = 0; i < n; i++) {
      const a = this.rng() * Math.PI * 2;
      const e = (this.rng() - 0.3) * Math.PI;
      const sp = 1.6 + this.rng() * 1.2; // 0.4 秒で 約 0.6〜1 ブロック
      this.bitVel[i * 3] = Math.cos(a) * Math.cos(e) * sp;
      this.bitVel[i * 3 + 1] = Math.sin(e) * sp;
      this.bitVel[i * 3 + 2] = Math.sin(a) * Math.cos(e) * sp;
      this.bitPos[i * 3] = this.sparkAt.x;
      this.bitPos[i * 3 + 1] = this.sparkAt.y;
      this.bitPos[i * 3 + 2] = this.sparkAt.z;
    }
    this.sparkMesh.visible = true;
  }

  /** 1 ステップに 1 回 */
  step(g: GlowInput): void {
    if (this.sparkAge >= 0) {
      this.sparkAge++;
      if (this.sparkAge >= SPARK_STEPS) {
        this.sparkAge = -1;
        this.sparkMesh.visible = false;
        this.bits.count = 0;
      } else {
        this.sparkTex.offset.x = sparkFrameOf(this.sparkAge) / 4;
        const dt = 1 / 60;
        for (let i = 0; i < this.bits.count; i++) {
          this.bitPos[i * 3] += this.bitVel[i * 3]! * dt;
          this.bitPos[i * 3 + 1] += this.bitVel[i * 3 + 1]! * dt;
          this.bitPos[i * 3 + 2] += this.bitVel[i * 3 + 2]! * dt;
        }
      }
    }
    this.auraLevel = g.visible ? g.level : 0;
    this.aura.visible = this.auraLevel > 0;
    if (this.aura.visible) {
      (this.aura.material as THREE.MeshBasicMaterial).opacity = AURA_MAX_ALPHA * this.auraLevel;
    }
    const risen = this.aura.visible && !g.reduced;
    this.rise.count = risen ? 6 : 0;
    this.feet.set(g.position.x, g.position.y, g.position.z);
    if (risen) {
      const k = (1 - this.auraLevel) * 0.31; // level が さがるほど 上へ 40 ドット
      for (let i = 0; i < 6; i++) this.riseY[i] = 0.25 + this.risePhase[i]! * 1.3 + k;
    }
  }

  /** 描画の 前（カメラの 方を向かせる） */
  update(): void {
    const cam = this.deps.camera;
    cam.getWorldQuaternion(_q);
    if (this.sparkMesh.visible) {
      this.sparkMesh.position.copy(this.sparkAt);
      this.sparkMesh.quaternion.copy(_q);
      const s = this.sparkAge < 8 ? 1 : 0.9; // 少し 小さくして 消える
      this.sparkMesh.scale.set(s, s, 1);
      for (let i = 0; i < this.bits.count; i++) {
        _v.set(this.bitPos[i * 3]!, this.bitPos[i * 3 + 1]!, this.bitPos[i * 3 + 2]!);
        _m.compose(_v, _q, _s.set(1, 1, 1));
        this.bits.setMatrixAt(i, _m);
      }
      this.bits.instanceMatrix.needsUpdate = true;
      if (this.bits.instanceColor) this.bits.instanceColor.needsUpdate = true;
    }
    if (this.aura.visible) {
      // カメラの 少し 向こう側（キャラの 板の うしろ）に 置く
      _v.set(this.feet.x, this.feet.y + 0.9, this.feet.z);
      cam.getWorldPosition(_s);
      _s.sub(_v).normalize().multiplyScalar(-0.15);
      this.aura.position.copy(_v).add(_s);
      this.aura.quaternion.copy(_q);
    }
    if (this.rise.count > 0) {
      cam.getWorldPosition(_s);
      // 画面の 横（カメラの 右）へ ずらす
      const ang = Math.atan2(_s.x - this.feet.x, _s.z - this.feet.z);
      const rx = Math.cos(ang);
      const rz = -Math.sin(ang);
      for (let i = 0; i < 6; i++) {
        const sd = this.riseX[i]!;
        _v.set(this.feet.x + rx * sd, this.feet.y + this.riseY[i]!, this.feet.z + rz * sd);
        _m.compose(_v, _q, _s.set(0.06, 0.12, 1));
        this.rise.setMatrixAt(i, _m);
      }
      this.rise.instanceMatrix.needsUpdate = true;
    }
  }

  dispose(): void {
    for (const o of [this.sparkMesh, this.bits, this.aura, this.rise]) {
      this.deps.scene.remove(o);
      o.geometry.dispose();
      (o.material as THREE.Material).dispose();
    }
    this.sparkTex.dispose();
  }
}

// ---------------------------------------------------------------- よろけアイコン（HTML。世界の 点から 画面へ うつす）

export interface StaggerIconItem {
  id: number;
  x: number;
  y: number;
  z: number;
  /** 二つ名つき（名前の 板が 出ているので その 上に 置く） */
  titled: boolean;
}

interface IconEl {
  el: HTMLDivElement;
}

/** 名前の 板の 高さ（px）。`.yokai-nameplate` は 20px 以上の 字 × 行の 高さ */
const NAMEPLATE_PX = 32;

/**
 * 妖怪の 頭の 上に 置く アイコン。0.5 ブロック角（遠くなると 小さくなる）、Nearest。
 * 順は 上から「アイコン → 名前 → バー」。回る 8 コマ（0.25 秒ずつ）。2 倍が 当たったら はじける 4 コマ（6 ステップ）。
 */
export class StaggerIcons {
  private readonly pool: IconEl[] = [];
  private readonly burst = new Map<number, { age: number; x: number; y: number; z: number; titled: boolean }>();
  private readonly last = new Map<number, StaggerIconItem>();
  private readonly v = new THREE.Vector3();
  private readonly url: string;
  private tick = 0;

  constructor(
    private readonly parent: HTMLElement,
    basePath: string,
  ) {
    const base = basePath.endsWith('/') ? basePath : `${basePath}/`;
    this.url = `${base}parry_icon.png`;
  }

  /** 2 倍が 当たった: はじけて 消す */
  burstAt(id: number): void {
    const p = this.last.get(id);
    if (p) this.burst.set(id, { age: 0, x: p.x, y: p.y, z: p.z, titled: p.titled });
  }

  /** 1 ステップに 1 回（描画の 前でも よい） */
  update(items: readonly StaggerIconItem[], camera: THREE.Camera, visible: boolean): void {
    this.tick++;
    camera.updateMatrixWorld();
    const w = window.innerWidth;
    const h = window.innerHeight;
    const fov = (camera as THREE.PerspectiveCamera).fov ?? 60;
    const pxPerBlock = (dist: number): number => h / (2 * Math.tan((fov * Math.PI) / 360) * Math.max(0.5, dist));
    let n = 0;
    const put = (it: StaggerIconItem, frameCol: number, row: number, scale: number, alpha: number): void => {
      this.v.set(it.x, it.y, it.z);
      const dist = this.v.distanceTo(camera.position);
      this.v.project(camera);
      if (this.v.z > 1 || this.v.z < -1) return;
      const size = Math.max(12, Math.min(72, ICON_BLOCKS * pxPerBlock(dist)));
      const px = (this.v.x * 0.5 + 0.5) * w;
      const py = (-this.v.y * 0.5 + 0.5) * h - ICON_GAP_BLOCKS * pxPerBlock(dist) - (it.titled ? NAMEPLATE_PX : 0);
      const e = this.el(n++);
      const s = size * scale;
      const st = e.style;
      st.display = 'block';
      st.width = `${s}px`;
      st.height = `${s}px`;
      st.backgroundSize = `${s * 8}px ${s * 2}px`;
      st.backgroundPosition = `${-frameCol * s}px ${-row * s}px`;
      st.opacity = String(alpha);
      st.transform = `translate(${(px - s / 2).toFixed(1)}px, ${(py - s).toFixed(1)}px)`;
    };
    if (visible) {
      this.last.clear();
      for (const it of items) {
        this.last.set(it.id, it);
        put(it, iconSpinFrame(this.tick), 0, 1, 1);
      }
    }
    for (const [id, b] of this.burst) {
      if (b.age >= ICON_BURST_STEPS) {
        this.burst.delete(id);
        continue;
      }
      const k = b.age / ICON_BURST_STEPS;
      put({ id, x: b.x, y: b.y, z: b.z, titled: b.titled }, iconBurstFrame(b.age), 1, 1 + 0.5 * k, 1 - 0.6 * k);
      b.age++;
    }
    for (let i = n; i < this.pool.length; i++) this.pool[i]!.el.style.display = 'none';
  }

  private el(i: number): HTMLDivElement {
    let e = this.pool[i];
    if (!e) {
      const el = document.createElement('div');
      el.className = 'stagger-icon';
      const st = el.style;
      st.position = 'fixed';
      st.left = '0';
      st.top = '0';
      st.pointerEvents = 'none';
      st.zIndex = '5';
      st.imageRendering = 'pixelated';
      st.backgroundImage = `url(${this.url})`;
      st.backgroundRepeat = 'no-repeat';
      st.willChange = 'transform';
      st.display = 'none';
      this.parent.append(el);
      e = { el };
      this.pool.push(e);
    }
    return e.el;
  }

  dispose(): void {
    for (const p of this.pool) p.el.remove();
    this.pool.length = 0;
  }
}
