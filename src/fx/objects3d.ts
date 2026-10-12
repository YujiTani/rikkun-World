import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { BlockId, Vec3 } from '../contracts';
import { getBlockMaterials } from './blockMaterials';
import { blockColor } from './color';
import { OUTLINE_COLOR, OUTLINE_READY, OUTLINE_OPACITY, OUTLINE_RED, type FxSettings } from './config';
import { createCrackTextures } from './crack';

/** ねらいの枠: ブロックより少し大きい箱の 12 本の辺を、細い棒でつないだ 1 つの形 */
export class TargetOutline {
  readonly mesh: THREE.Mesh;
  private readonly mat: THREE.MeshBasicMaterial;
  private red = false;

  constructor() {
    const e = 0.004; // ブロックより少し大きく
    const t = 0.022; // 線の太さ
    const L = 1 + 2 * e + t;
    const bars: THREE.BufferGeometry[] = [];
    const h = 0.5 + e;
    for (const a of [-h, h]) {
      for (const b of [-h, h]) {
        const gx = new THREE.BoxGeometry(L, t, t);
        gx.translate(0, a, b);
        const gy = new THREE.BoxGeometry(t, L, t);
        gy.translate(a, 0, b);
        const gz = new THREE.BoxGeometry(t, t, L);
        gz.translate(a, b, 0);
        bars.push(gx, gy, gz);
      }
    }
    const geo = mergeGeometries(bars)!;
    for (const g of bars) g.dispose();
    this.mat = new THREE.MeshBasicMaterial({
      color: OUTLINE_COLOR,
      transparent: true,
      opacity: OUTLINE_OPACITY,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.visible = false;
    this.mesh.renderOrder = 2;
  }

  /** ブロックの場所（null で消す） */
  show(block: Vec3 | null): void {
    this.mesh.visible = block !== null;
    if (block) this.mesh.position.set(block.x + 0.5, block.y + 0.5, block.z + 0.5);
  }

  setRed(red: boolean): void {
    if (red === this.red) return;
    this.red = red;
    this.mat.color.setHex(red ? OUTLINE_RED : OUTLINE_COLOR);
    this.mat.opacity = red ? 0.9 : OUTLINE_OPACITY;
  }
  /** 「いま押して！」のやさしい光（明るさ 0〜1。null でふつうの枠にもどす）。赤のあいだは赤が先 */
  setGlow(level: number | null): void {
    if (this.red) return;
    if (level === null) {
      this.mat.color.setHex(OUTLINE_COLOR);
      this.mat.opacity = OUTLINE_OPACITY;
      return;
    }
    this.mat.color.setHex(OUTLINE_READY);
    this.mat.opacity = 0.55 + 0.45 * level;
  }
  get isRed(): boolean {
    return this.red;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}

/** ひび: ブロックに重ねる箱（6 面に同じ絵）。だんかいは 1〜3 */
export class CrackOverlay {
  readonly mesh: THREE.Mesh;
  private readonly textures = createCrackTextures();
  private readonly mat: THREE.MeshBasicMaterial;
  private stage = 0;
  private base = new THREE.Vector3();

  constructor() {
    this.mat = new THREE.MeshBasicMaterial({
      map: this.textures[0],
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    this.mesh = new THREE.Mesh(new THREE.BoxGeometry(1.004, 1.004, 1.004), this.mat);
    this.mesh.visible = false;
    this.mesh.renderOrder = 1;
  }

  get currentStage(): number {
    return this.stage;
  }

  /** stage 0 または block が null なら消す */
  show(block: Vec3 | null, stage: number): void {
    const s = block ? Math.max(0, Math.min(3, Math.floor(stage))) : 0;
    this.stage = s;
    this.mesh.visible = s > 0;
    if (s > 0 && block) {
      this.mat.map = this.textures[s - 1];
      this.base.set(block.x + 0.5, block.y + 0.5, block.z + 0.5);
      this.mesh.position.copy(this.base);
    }
  }

  /** 小さなゆれ（ブロックの位置から offset ずらす） */
  wobble(dx: number, dy: number, dz: number): void {
    this.mesh.position.set(this.base.x + dx, this.base.y + dy, this.base.z + dz);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mat.dispose();
    for (const t of this.textures) t.dispose();
  }
}

const CAPACITY = 160;

/** はじける四角。InstancedMesh 1 つにまとめる（毎フレーム new しない） */
export class BreakParticles {
  readonly mesh: THREE.InstancedMesh;
  private readonly px = new Float32Array(CAPACITY);
  private readonly py = new Float32Array(CAPACITY);
  private readonly pz = new Float32Array(CAPACITY);
  private readonly vx = new Float32Array(CAPACITY);
  private readonly vy = new Float32Array(CAPACITY);
  private readonly vz = new Float32Array(CAPACITY);
  private readonly age = new Float32Array(CAPACITY);
  private readonly life = new Float32Array(CAPACITY);
  private readonly size = new Float32Array(CAPACITY);
  private next = 0;
  private rng = 12345;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly axis = new THREE.Vector3(0, 1, 0);
  private readonly color = new THREE.Color();
  /** 今生きている数 */
  alive = 0;

  constructor() {
    this.mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial(),
      CAPACITY,
    );
    this.mesh.frustumCulled = false;
    this.mesh.count = CAPACITY;
    this.life.fill(0);
    this.age.fill(1);
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < CAPACITY; i++) {
      this.mesh.setMatrixAt(i, zero);
      this.mesh.setColorAt(i, this.color.setHex(0xffffff));
    }
  }

  private rand(): number {
    this.rng = (Math.imul(this.rng, 1664525) + 1013904223) >>> 0;
    return this.rng / 4294967296;
  }

  /** ブロック 1 こぶんをはじけさせる */
  burst(block: Vec3, id: BlockId, cfg: FxSettings): void {
    this.color.setHex(blockColor(id));
    for (let k = 0; k < cfg.particleCount; k++) {
      const i = this.next;
      this.next = (this.next + 1) % CAPACITY;
      this.px[i] = block.x + 0.2 + this.rand() * 0.6;
      this.py[i] = block.y + 0.2 + this.rand() * 0.6;
      this.pz[i] = block.z + 0.2 + this.rand() * 0.6;
      const ax = this.px[i] - (block.x + 0.5);
      const az = this.pz[i] - (block.z + 0.5);
      const sp = cfg.particleSpeed * (0.5 + this.rand() * 0.7);
      this.vx[i] = ax * 2 * sp + (this.rand() - 0.5) * sp * 0.4;
      this.vz[i] = az * 2 * sp + (this.rand() - 0.5) * sp * 0.4;
      this.vy[i] = sp * (0.6 + this.rand() * 0.8);
      this.age[i] = 0;
      this.life[i] = cfg.particleLife * (0.8 + this.rand() * 0.2);
      this.size[i] = cfg.particleSize * (0.7 + this.rand() * 0.5);
      // ブロックの色に少しだけ明暗をつける
      const shade = 0.85 + this.rand() * 0.3;
      this.mesh.setColorAt(i, this.tmpColor(shade));
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  private readonly c2 = new THREE.Color();
  private tmpColor(shade: number): THREE.Color {
    return this.c2.setRGB(
      Math.min(1, this.color.r * shade),
      Math.min(1, this.color.g * shade),
      Math.min(1, this.color.b * shade),
    );
  }

  update(dt: number): void {
    if (this.alive === 0 && !this.anyLive()) return;
    let alive = 0;
    for (let i = 0; i < CAPACITY; i++) {
      if (this.life[i] <= 0) continue;
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) {
        this.life[i] = 0;
        this.mesh.setMatrixAt(i, this.m.makeScale(0, 0, 0));
        continue;
      }
      alive++;
      this.vy[i] -= 14 * dt;
      this.px[i] += this.vx[i] * dt;
      this.py[i] += this.vy[i] * dt;
      this.pz[i] += this.vz[i] * dt;
      // 最後の 30% でちぢんで消える
      const r = this.age[i] / this.life[i];
      const k = r > 0.7 ? (1 - r) / 0.3 : 1;
      const sz = this.size[i] * k;
      this.s.set(sz, sz, sz);
      this.q.setFromAxisAngle(this.axis, this.age[i] * 8 + i);
      this.p.set(this.px[i], this.py[i], this.pz[i]);
      this.mesh.setMatrixAt(i, this.m.compose(this.p, this.q, this.s));
    }
    this.alive = alive;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  private anyLive(): boolean {
    for (let i = 0; i < CAPACITY; i++) if (this.life[i] > 0) return true;
    return false;
  }

  /** うまれた数を数えたいテスト用 */
  liveCount(): number {
    let n = 0;
    for (let i = 0; i < CAPACITY; i++) if (this.life[i] > 0) n++;
    return n;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
  }
}

const PUFF_POOL = 4;

interface Puff {
  mesh: THREE.Mesh;
  t: number;
  dur: number;
  from: number;
  to: number;
  /** 終わったときに呼ぶ（はじけさせる） */
  done: (() => void) | null;
  active: boolean;
}

/** ブロックの「ぷくっ」「ぽよん」。ブロックの形の飾りを短い時間だけ出す */
export class BlockPuffs {
  readonly group = new THREE.Group();
  private readonly puffs: Puff[] = [];
  private nextIdx = 0;

  constructor() {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    for (let i = 0; i < PUFF_POOL; i++) {
      const mesh = new THREE.Mesh(geo, getBlockMaterials('stone'));
      mesh.visible = false;
      this.group.add(mesh);
      this.puffs.push({ mesh, t: 0, dur: 1, from: 1, to: 1, done: null, active: false });
    }
  }

  /** scale が from から to へ dur 秒で変わる。終わったら done を呼んで消える */
  start(block: Vec3, id: BlockId, from: number, to: number, dur: number, done: (() => void) | null): void {
    const p = this.puffs[this.nextIdx];
    this.nextIdx = (this.nextIdx + 1) % PUFF_POOL;
    if (p.active && p.done) p.done(); // 押しのけたら、はじける方は先に出す
    p.mesh.material = getBlockMaterials(id);
    p.mesh.position.set(block.x + 0.5, block.y + 0.5, block.z + 0.5);
    p.t = 0;
    p.dur = Math.max(1e-3, dur);
    p.from = from;
    p.to = to;
    p.done = done;
    p.active = true;
    p.mesh.visible = true;
    p.mesh.scale.setScalar(from);
  }

  update(dt: number): void {
    for (const p of this.puffs) {
      if (!p.active) continue;
      p.t += dt;
      const r = Math.min(1, p.t / p.dur);
      p.mesh.scale.setScalar(p.from + (p.to - p.from) * r);
      if (r >= 1) {
        p.active = false;
        p.mesh.visible = false;
        const d = p.done;
        p.done = null;
        if (d) d();
      }
    }
  }

  activeCount(): number {
    return this.puffs.filter((p) => p.active).length;
  }

  dispose(): void {
    if (this.puffs[0]) this.puffs[0].mesh.geometry.dispose();
  }
}
