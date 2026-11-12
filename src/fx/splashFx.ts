import * as THREE from 'three';
import { createRng, type Rng } from '../world/gen/random';
import { splashSpotsNear, type SplashSpot } from '../world/gen/waterV2Splash';
import { SPLASH, splashLife, splashRate, splashRise, splashSpread } from './splashModel';

/**
 * 滝の しぶき（試作。`?water=v2`）。滝が 水に 落ちる 所から 白い つぶが ふんわり 上がり、ひろがって、きえる。
 * プレイヤーから SPLASH.range マス いないの 滝だけ。描画は InstancedMesh 1 つ（見える つぶが ある 間だけ 1 回）。
 * つぶは 使いまわし（毎フレーム new しない）。数は 全部 あわせて SPLASH.maxParticles まで。
 */

export interface SplashFocus {
  x: number;
  z: number;
}

export interface SplashDeps {
  seed: number;
  focus: () => SplashFocus;
  /** いまの 明るさ（夜は 少し 暗い 白に） */
  brightness: () => number;
  rng?: Rng;
}

const TAU = Math.PI * 2;
const MIN_LIGHT = 0.45; // 夜の 白さ（0〜1）

export class SplashFx {
  private readonly rng: Rng;
  private readonly mesh: THREE.InstancedMesh;
  private readonly mat: THREE.MeshBasicMaterial;
  private readonly dummy = new THREE.Object3D();
  private readonly spots: SplashSpot[] = [];
  private readonly acc = new Map<SplashSpot, number>();
  private readonly ox = new Float32Array(SPLASH.maxParticles);
  private readonly oy = new Float32Array(SPLASH.maxParticles);
  private readonly oz = new Float32Array(SPLASH.maxParticles);
  private readonly ang = new Float32Array(SPLASH.maxParticles);
  private readonly rad = new Float32Array(SPLASH.maxParticles);
  private readonly rise = new Float32Array(SPLASH.maxParticles);
  private readonly age = new Float32Array(SPLASH.maxParticles);
  private readonly life = new Float32Array(SPLASH.maxParticles);
  private cursor = 0;
  private refresh = 0;
  /** いま 見えて いる つぶの 数（テスト・報告用） */
  shown = 0;

  constructor(scene: THREE.Object3D, private readonly deps: SplashDeps) {
    this.rng = deps.rng ?? createRng(deps.seed ^ 0x5b1a5);
    this.mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false });
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(SPLASH.size, SPLASH.size, SPLASH.size), this.mat, SPLASH.maxParticles);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.visible = false;
    this.age.fill(1);
    this.life.fill(1); // age >= life ＝ あき
    scene.add(this.mesh);
  }

  update(dt: number): void {
    const f = this.deps.focus();
    this.refresh -= dt;
    if (this.refresh <= 0) {
      this.refresh = SPLASH.refresh;
      splashSpotsNear(this.deps.seed, f.x, f.z, SPLASH.range, this.spots);
      for (const k of this.acc.keys()) if (!this.spots.includes(k)) this.acc.delete(k);
    }
    for (const s of this.spots) {
      const a = (this.acc.get(s) ?? this.rng()) + splashRate(s.drop) * dt;
      const n = Math.floor(a);
      this.acc.set(s, a - n);
      for (let i = 0; i < n; i++) if (!this.emit(s)) break;
    }
    this.mat.color.setScalar(MIN_LIGHT + (1 - MIN_LIGHT) * Math.min(1, Math.max(0, this.deps.brightness())));
    this.draw(dt);
  }

  /** あいて いる つぶを 1 つ 使って s から 出す。あきが なければ false */
  private emit(s: SplashSpot): boolean {
    const max = SPLASH.maxParticles;
    for (let k = 0; k < max; k++) {
      const i = (this.cursor + k) % max;
      if (this.age[i]! < this.life[i]!) continue;
      this.cursor = (i + 1) % max;
      const spread = splashSpread(s.drop);
      this.ox[i] = s.x + 0.5 + (this.rng() - 0.5) * 1.5;
      this.oy[i] = s.y;
      this.oz[i] = s.z + 0.5 + (this.rng() - 0.5) * 1.5;
      this.ang[i] = this.rng() * TAU;
      this.rad[i] = Math.sqrt(this.rng()) * spread;
      this.rise[i] = splashRise(s.drop) * (0.5 + this.rng() * 0.5);
      this.age[i] = 0;
      this.life[i] = splashLife(s.drop) * (0.7 + this.rng() * 0.6);
      return true;
    }
    return false;
  }

  private draw(dt: number): void {
    const d = this.dummy;
    let n = 0;
    for (let i = 0; i < SPLASH.maxParticles; i++) {
      if (this.age[i]! >= this.life[i]!) continue;
      this.age[i] = this.age[i]! + dt;
      const u = Math.min(1, this.age[i]! / this.life[i]!);
      if (u >= 1) continue;
      const e = 1 - (1 - u) * (1 - u); // ふんわり: はじめ はやく、おわりは ゆっくり
      d.position.set(this.ox[i]! + Math.cos(this.ang[i]!) * this.rad[i]! * e, this.oy[i]! + this.rise[i]! * e, this.oz[i]! + Math.sin(this.ang[i]!) * this.rad[i]! * e);
      d.scale.setScalar(u < 0.5 ? 0.6 + u * 0.8 : 1 - (u - 0.5) * 2); // 大きく なって、うしろ 半分で ちぢんで きえる
      d.updateMatrix();
      this.mesh.setMatrixAt(n++, d.matrix);
    }
    this.shown = n;
    this.mesh.count = n;
    this.mesh.visible = n > 0;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
