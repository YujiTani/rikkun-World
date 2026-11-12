import * as THREE from 'three';
import { countryAt } from '../world/gen/biome';
import { createRng, type Rng } from '../world/gen/random';
import { DRIFT, driftCount, driftDensity } from './driftModel';

/**
 * ゆきやまの 雪・もみじやまの 紅葉の 舞い（試作。`?drift=1`）。プレイヤー（2 人なら それぞれ）の まわりだけに 出して いっしょに 動く。
 * つぶは 使いまわし（毎フレーム new しない）。描画は 雪 InstancedMesh 1 つ・葉 InstancedMesh 1 つ（見える つぶが ある 間だけ。ふつうは どちらか 1 回）。
 * つぶごとに「出す場所の 国・高さ」で 出すか 決める ので、境目では 数が なめらかに 変わる。屋根・どうくつの 下は 落ちる 長さが みじかく なって 出ない。
 */

export interface DriftFocus {
  x: number;
  y: number;
  z: number;
}

export interface DriftDeps {
  seed: number;
  isSolid: (x: number, y: number, z: number) => boolean;
  /** いま 画面を 持って いる 人の 足もと（1 人なら 1 つ、2 人なら 2 つ） */
  foci: () => readonly DriftFocus[];
  rng?: Rng;
}

const TAU = Math.PI * 2;
const COVER_FROM = 2; // 頭の 上を しらべ はじめる 足からの 高さ（マス）
const SCAN_DOWN = 24; // 地面を さがす 深さ（足の 下、マス）

/** つぶの 1 グループ（雪 or 葉）。1 つの InstancedMesh */
class Pool {
  readonly mesh: THREE.InstancedMesh;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly z: Float32Array;
  readonly land: Float32Array;
  readonly phase: Float32Array;
  readonly wait: Float32Array;
  /** 1 = 落ちて いる、0 = お休み（次に 調べる まで wait 秒） */
  readonly live: Uint8Array;
  shown = 0;

  constructor(readonly max: number, readonly leaf: boolean, rng: Rng) {
    const geo = leaf ? new THREE.BoxGeometry(DRIFT.leafLen, DRIFT.leafThick, DRIFT.leafWid) : new THREE.BoxGeometry(DRIFT.snowSize, DRIFT.snowSize, DRIFT.snowSize);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.visible = false;
    this.x = new Float32Array(max);
    this.y = new Float32Array(max);
    this.z = new Float32Array(max);
    this.land = new Float32Array(max);
    this.phase = new Float32Array(max);
    this.wait = new Float32Array(max);
    this.live = new Uint8Array(max);
    const c = new THREE.Color();
    for (let i = 0; i < max; i++) {
      this.phase[i] = rng() * TAU;
      this.wait[i] = rng() * DRIFT.idleMax; // はじめは ばらばらの 時間に 調べる
      c.setHex(leaf ? DRIFT.leafColors[i % DRIFT.leafColors.length]! : 0xf4f8ff);
      this.mesh.setColorAt(i, c);
    }
  }
}

export class DriftFx {
  private readonly rng: Rng;
  private readonly snow: Pool;
  private readonly leaf: Pool;
  private readonly dummy = new THREE.Object3D();
  private readonly zero = new THREE.Matrix4().makeScale(0, 0, 0);
  private time = 0;
  private coverTimer = 0;
  /** 人ごとの「頭の 上が ふさがって いる」（最大 2 人） */
  private readonly covered: boolean[] = [false, false];

  constructor(scene: THREE.Object3D, private readonly deps: DriftDeps) {
    this.rng = deps.rng ?? createRng(deps.seed ^ 0xd51f7);
    this.snow = new Pool(DRIFT.maxSnow, false, this.rng);
    this.leaf = new Pool(DRIFT.maxLeaf, true, this.rng);
    scene.add(this.snow.mesh, this.leaf.mesh);
  }

  /** 見えて いる つぶの 数（テスト・報告用） */
  get shown(): { snow: number; leaf: number } {
    return { snow: this.snow.shown, leaf: this.leaf.shown };
  }

  update(dt: number): void {
    const foci = this.deps.foci();
    if (foci.length === 0) {
      this.hideAll();
      return;
    }
    this.time += dt;
    this.coverTimer -= dt;
    if (this.coverTimer <= 0) {
      this.coverTimer = DRIFT.coverEvery;
      for (let f = 0; f < foci.length && f < 2; f++) this.covered[f] = this.isCovered(foci[f]!);
    }
    this.step(this.snow, foci, dt);
    this.step(this.leaf, foci, dt);
  }

  private hideAll(): void {
    for (const p of [this.snow, this.leaf]) {
      p.shown = 0;
      p.mesh.count = 0;
      p.mesh.visible = false;
    }
  }

  private isCovered(f: DriftFocus): boolean {
    const x = Math.floor(f.x);
    const z = Math.floor(f.z);
    const y0 = Math.floor(f.y);
    for (let dy = COVER_FROM; dy <= DRIFT.coverRange; dy++) if (this.deps.isSolid(x, y0 + dy, z)) return true;
    return false;
  }

  private step(p: Pool, foci: readonly DriftFocus[], dt: number): void {
    const nF = foci.length;
    const fall = p.leaf ? DRIFT.leafFall : DRIFT.snowFall;
    const r2 = (DRIFT.radius + 2) * (DRIFT.radius + 2);
    const t = this.time;
    const d = this.dummy;
    let n = 0;
    for (let i = 0; i < p.max; i++) {
      const fi = i % nF;
      const f = foci[fi]!;
      if (p.live[i] === 0) {
        p.wait[i] = p.wait[i]! - dt;
        if (p.wait[i]! <= 0) this.spawn(p, i, f, fi, true);
        if (p.live[i] === 0) {
          p.mesh.setMatrixAt(i, this.zero);
          continue;
        }
      } else {
        p.y[i] = p.y[i]! - fall * dt;
        p.x[i] = p.x[i]! + DRIFT.wind * dt;
        const dx = p.x[i]! - f.x;
        const dz = p.z[i]! - f.z;
        if (p.y[i]! <= p.land[i]! + 0.05) {
          this.spawn(p, i, f, fi, false);
        } else if (dx * dx + dz * dz > r2) {
          this.spawn(p, i, f, fi, true);
        }
      }
      if (p.live[i] === 0) {
        p.mesh.setMatrixAt(i, this.zero);
        continue;
      }
      const ph = p.phase[i]!;
      const above = p.y[i]! - p.land[i]!;
      const k = above >= 1.2 ? 1 : above <= 0 ? 0 : above / 1.2; // 地面に つく とき ちぢんで きえる
      d.position.set(p.x[i]! + Math.sin(t * DRIFT.swayRate + ph) * DRIFT.swayAmp, p.y[i]!, p.z[i]! + Math.cos(t * DRIFT.swayRate * 0.8 + ph * 1.3) * DRIFT.swayAmp);
      if (p.leaf) d.rotation.set(Math.sin(t * 2 + ph) * 0.7, t * DRIFT.leafSpin + ph, Math.cos(t * 1.7 + ph) * 0.7);
      d.scale.setScalar(k);
      d.updateMatrix();
      p.mesh.setMatrixAt(i, d.matrix);
      n++;
    }
    p.shown = n;
    p.mesh.count = p.max;
    p.mesh.visible = n > 0;
    p.mesh.instanceMatrix.needsUpdate = true;
  }

  /** つぶ i を focus の まわりに 出しなおす。国と 高さで 出す 数に ならなければ お休み。scatter ＝ 高さを ばらす */
  private spawn(p: Pool, i: number, f: DriftFocus, fi: number, scatter: boolean): void {
    const rng = this.rng;
    const ang = rng() * TAU;
    const rad = Math.sqrt(rng()) * DRIFT.radius;
    const x = f.x + Math.cos(ang) * rad;
    const z = f.z + Math.sin(ang) * rad;
    const topY = f.y + DRIFT.topAbove;
    p.live[i] = 0;
    p.wait[i] = DRIFT.idleMin + rng() * (DRIFT.idleMax - DRIFT.idleMin);
    // 地面（屋根も）の 高さ: 上から 下へ はじめに 当たる ブロックの 上
    const bx = Math.floor(x);
    const bz = Math.floor(z);
    let land = f.y - SCAN_DOWN;
    for (let y = Math.floor(topY); y >= land; y--) {
      if (this.deps.isSolid(bx, y, bz)) {
        land = y + 1;
        break;
      }
    }
    if (topY - land < DRIFT.minFall) return;
    const c = countryAt(this.deps.seed, bx, bz);
    const dens = driftDensity(c.kind, c.e, land, this.covered[Math.min(fi, 1)] === true);
    const cnt = driftCount(p.leaf ? dens.leaf : dens.snow, p.max);
    if (i >= cnt) return;
    p.x[i] = x;
    p.z[i] = z;
    p.land[i] = land;
    p.y[i] = scatter ? land + rng() * (topY - land) : topY;
    p.live[i] = 1;
  }
}
