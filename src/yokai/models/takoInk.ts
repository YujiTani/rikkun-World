import * as THREE from 'three';
import { boxGeo } from '../common';

/** すみの けむりの 色（まっ黒は 使わない。こい あいいろ 3 色） */
const INK_COLORS = [0x2c2840, 0x3b3554, 0x4d4668] as const;
/** けむりの つぶの 数（小さな 箱。描画回数は はく 間だけ この 数だけ ふえる） */
export const INK_PUFFS = 10;
/** 1 つぶ めの 出る おくれ（秒） */
const PUFF_DELAY = 0.02;
/** つぶの 不透明度（さいしょ。うすくなる ときは 0 へ） */
const PUFF_ALPHA = 0.85;

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const easeOut = (v: number): number => 1 - (1 - Math.min(1, Math.max(0, v))) ** 3;

interface Puff {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  dir: THREE.Vector3;
  reach: number;
  delay: number;
  spin: number;
  size: number;
}

/**
 * すみの けむり（試作 octo.ts の InkCloud を 世界の 座標に 置く 形にした もの）。
 * 小さな 箱 10 こ が ふわっと 広がって、さいごに うすく・小さく なって 消える（点滅なし）。
 * 世界に 置く（タコと いっしょに 動かない）。age はいてからの 秒。
 */
export class InkCloud {
  readonly group = new THREE.Group();
  private readonly puffs: Puff[] = [];
  private readonly origin = new THREE.Vector3();
  /** はいてからの 秒（< 0 = 使っていない） */
  age = -1;

  constructor(
    private readonly radius: number,
    private readonly life: number,
    private readonly fade: number,
  ) {
    for (let i = 0; i < INK_PUFFS; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: INK_COLORS[i % 3]!, transparent: true, opacity: PUFF_ALPHA, depthWrite: false });
      const mesh = new THREE.Mesh(boxGeo(1, 1, 1), mat);
      mesh.visible = false;
      this.group.add(mesh);
      this.puffs.push({ mesh, mat, dir: new THREE.Vector3(), reach: 1, delay: i * PUFF_DELAY, spin: 0, size: 1 });
    }
    this.group.visible = false;
  }

  /** はく: (x, y, z) から、向き (dx, dz) を 少し 多めに ふわっと 広がる */
  start(x: number, y: number, z: number, dx: number, dz: number, seed: number): void {
    const r = rng(seed);
    this.origin.set(x, y, z);
    for (const p of this.puffs) {
      p.dir.set(dx * 0.7 + (r() * 2 - 1) * 0.8, (r() * 2 - 1) * 0.6, dz * 0.7 + (r() * 2 - 1) * 0.8).normalize();
      p.reach = this.radius * (0.45 + r() * 0.5); // ブロック
      p.spin = (r() * 2 - 1) * 1.5;
      p.size = 0.75 + r() * 0.5;
    }
    this.age = 0;
    this.group.visible = true;
    this.update(0);
  }

  get active(): boolean {
    return this.age >= 0;
  }

  /** dt 秒 すすめる。life を すぎたら 消える */
  step(dt: number): void {
    if (this.age < 0) return;
    this.age += dt;
    if (this.age >= this.life) {
      this.age = -1;
      this.group.visible = false;
      for (const p of this.puffs) p.mesh.visible = false;
      return;
    }
    this.update(this.age);
  }

  private update(age: number): void {
    const fadeStart = this.life - this.fade;
    for (const p of this.puffs) {
      const a = age - p.delay;
      if (a < 0) {
        p.mesh.visible = false;
        continue;
      }
      p.mesh.visible = true;
      p.mesh.position.copy(this.origin).addScaledVector(p.dir, p.reach * (1 - Math.exp(-2.5 * a)));
      p.mesh.position.y += 0.18 * a; // ふわっと 上へ
      const grow = 0.15 + 0.35 * easeOut(a / 0.8);
      const k = a > fadeStart ? Math.min(1, (a - fadeStart) / this.fade) : 0;
      p.mesh.scale.setScalar(grow * (1 - 0.6 * k) * p.size);
      p.mesh.rotation.set(p.spin * a, p.spin * a * 0.7, 0);
      p.mat.opacity = PUFF_ALPHA * (1 - k);
    }
  }

  /** けむりの 中心（世界）。画面を 暗くする 判定に 使う */
  center(): THREE.Vector3 {
    return this.origin;
  }

  dispose(): void {
    this.group.removeFromParent();
    for (const p of this.puffs) p.mat.dispose();
  }
}
