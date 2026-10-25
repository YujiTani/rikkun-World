/**
 * #293 とどめの あと: コアを こわした 大きな 姿が ボロボロに くずれる ときの 見た目(FIX-BRIEF-2 §5-5)。
 *  ・体の 部分が 手・うで → 頭 → 胴 → こし の じゅんに 1 つずつ はがれて 消え(見た目と 当たり)、そのたびに 小さな 箱の かけらが とび散って 落ちる。
 *  ・かけらは 1 つの InstancedMesh(描画 1 回)。数・大きさ・秒は gashaBigTuning.ts の finish.crumble。
 */
import { BoxGeometry, Color, DynamicDrawUsage, InstancedMesh, Matrix4, MeshBasicMaterial, Quaternion, Vector3, type Scene } from 'three';
import { TUNE as T } from './gashaBigTuning';
import type { JointName } from './gashaBig';

/** はがれる 順(子が 先: 親を かくすと 子も 見えなく なる ため) */
export const CRUMBLE_ORDER: readonly JointName[] = [
  'LeftHand', 'RightHand', 'LeftForeArm', 'RightForeArm', 'LeftArmMid', 'RightArmMid', 'LeftArm', 'RightArm', 'LeftShoulder', 'RightShoulder',
  'Head', 'neck', 'Spine02', 'Spine01', 'Spine', 'Hips',
];

/** 各 関節が はがれる 時刻(くずれの 進み 0〜1 の 何割か)。0 から 0.9 まで 等間かく */
export function crumbleSchedule(): { joint: JointName; at: number }[] {
  const n = CRUMBLE_ORDER.length;
  return CRUMBLE_ORDER.map((joint, i) => ({ joint, at: (0.9 * i) / (n - 1) }));
}

interface Chunk { on: boolean; x: number; y: number; z: number; vx: number; vy: number; vz: number; size: number; spin: number; ax: number; ay: number; az: number; age: number; life: number }

export class CrumbleFx {
  readonly mesh: InstancedMesh;
  private readonly chunks: Chunk[] = [];
  private next = 0;
  private rs = 293;
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly v = new Vector3();
  private readonly sc = new Vector3();
  private readonly axis = new Vector3();

  constructor(private readonly scene: Scene, private readonly cap = 400) {
    const mat = new MeshBasicMaterial({ color: 0xffffff, fog: true });
    this.mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), mat, cap);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.visible = false;
    for (let i = 0; i < cap; i++) {
      this.chunks.push({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, size: 1, spin: 0, ax: 1, ay: 0, az: 0, age: 0, life: 1 });
      this.mesh.setColorAt(i, new Color(i % 3 === 0 ? 0xd8c8b0 : i % 3 === 1 ? 0xefe6d8 : 0xc8a0b8)); // 骨の 色と セーラー服の ピンクっぽい 色
    }
    scene.add(this.mesh);
  }

  private rnd(): number {
    this.rs = (this.rs + 0x6d2b79f5) >>> 0;
    let t = this.rs;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** center の まわり radius に count 個の かけらを 出す(外へ とび出して 落ちる)。power = とび出す 速さの 倍 */
  burst(center: { x: number; y: number; z: number }, count: number, radius: number, power = 1): void {
    const C = T.finish.crumble;
    for (let i = 0; i < count; i++) {
      const c = this.chunks[this.next]!;
      this.next = (this.next + 1) % this.cap;
      const a = this.rnd() * Math.PI * 2, e = (this.rnd() - 0.2) * 1.2;
      c.on = true; c.age = 0; c.life = C.chunkLifeSec * (0.7 + 0.6 * this.rnd());
      c.x = center.x + (this.rnd() - 0.5) * 2 * radius; c.y = center.y + (this.rnd() - 0.5) * 2 * radius; c.z = center.z + (this.rnd() - 0.5) * 2 * radius;
      const sp = C.chunkSpeed * power * (0.4 + 0.8 * this.rnd());
      c.vx = Math.cos(a) * Math.cos(e) * sp; c.vz = Math.sin(a) * Math.cos(e) * sp; c.vy = Math.sin(e) * sp + 1;
      c.size = C.chunkSize[0] + (C.chunkSize[1] - C.chunkSize[0]) * this.rnd();
      c.spin = (this.rnd() - 0.5) * 8; c.ax = this.rnd() - 0.5; c.ay = this.rnd() - 0.5; c.az = this.rnd() - 0.5;
    }
    this.mesh.visible = true;
  }

  update(dt: number): void {
    let n = 0;
    for (let i = 0; i < this.cap; i++) {
      const c = this.chunks[i]!;
      if (!c.on) continue;
      c.age += dt;
      if (c.age >= c.life) { c.on = false; continue; }
      c.vy -= 20 * dt;
      c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt;
      const k = 1 - Math.max(0, (c.age - c.life * 0.6) / (c.life * 0.4)); // おわりの 4 割で ちぢんで 消える
      this.axis.set(c.ax, c.ay, c.az).normalize();
      this.q.setFromAxisAngle(this.axis, c.spin * c.age);
      this.m.compose(this.v.set(c.x, c.y, c.z), this.q, this.sc.setScalar(c.size * k));
      this.mesh.setMatrixAt(n++, this.m);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (n === 0) this.mesh.visible = false;
  }

  /** いま 生きている かけらの 数 */
  alive(): number {
    let n = 0;
    for (const c of this.chunks) if (c.on) n++;
    return n;
  }

  /** いちばん 高い かけらの 高さ(テスト用) */
  maxY(): number {
    let m = -Infinity;
    for (const c of this.chunks) if (c.on) m = Math.max(m, c.y);
    return m;
  }

  clear(): void {
    for (const c of this.chunks) c.on = false;
    this.mesh.count = 0;
    this.mesh.visible = false;
  }

  dispose(): void {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    (this.mesh.material as MeshBasicMaterial).dispose();
  }
}
