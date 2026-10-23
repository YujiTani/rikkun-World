import * as THREE from 'three';
import type { SpiralEvent, WaveEvent, WaveView } from '../legend/WaveSystem';
import { DOT, FxBatch, FxView, hash, makePts } from './fxPaint';
import { PALS, TH, WHITE_Y, makeFujinAtlas, vOf } from './fujinOrbitFx';

/**
 * 風神剣の ふつうの 真空波 v2: 体の まわりを 回る 風の 帯（fujinOrbitFx）と 同じ 作りの「飛んでいく 風」
 * （2026-10-23 オーナー決定 docs/decisions/2026-10-23-legend-fx-element.md）。見た目だけ。当たり・速さ・数は WaveSystem のまま。
 * - 風の すじ 3 本（動きを へらす ときは 2 本）が 進む 向きに のびて、うねりながら 前へ 飛ぶ。先が 明るく、うしろは ほどけて 消える。
 * - 絵・色・ふち・芯は 帯と 同じ（ミント・ラベンダー・水色の かすれの 帯）。ぜんぶ 1 つの 形 = 描画 1。
 *   1 つの 波の 三角形は 通常（3 本 + ちり）で 246・うごきを へらす 設定（2 本・ちりなし）では 156（上限 400 より 下）。何も 飛んでいない ときは 描画 0。
 * - 位置は `drawPos`（剣の 手の 側へ 0.4 ずらした 見た目）。当たりの `position` は 使わない。
 * - 点滅しない（明るさは 年れいだけで きまる）・乱数は シード付き（hash）・毎ステップ new しない。
 * - ブロックで 消えたら 小さな 風の けむり（6 ステップ）。
 * 旧: カメラ向きの 白い みかづきの 板（fujin_blade.png）。絵と 向きの 表は 絵の 検査（fujinAssets.test）が 見るので のこす。
 */
export const PUFF_STEPS = 6;
const MAX_WAVES = 8;
const MAX_PUFFS = 4;
/** すじの 点の 数 */
const N = 14;
/** 1 つの 波の 三角形の 上限の 目安 */
export const WAVE_MAX_TRIS = 400;
/** すじの ながさ（ブロック）。出てから 6 ステップで この ながさに */
const LEN = 3;
const GROW_STEPS = 6;
/** 約 5 マス = 20 ステップ。さいごの 6 ステップで うすく なる */
const FADE_FROM = 15;
const FADE_STEPS = 6;
const STEP_LEN = 0.25;
const AMP = 0.27;

/** 旧 絵の 場所 [x, y, w, h]（`fujin_blade.json` の sprites）。キーは `${向きの 絵}_${コマ}` */
export const BLADE_SPRITES: Record<string, readonly [number, number, number, number]> = {
  '0_0': [0, 0, 22, 22],
  '0_1': [0, 22, 22, 22],
  '45_0': [22, 0, 22, 22],
  '45_1': [22, 22, 22, 22],
  '90_0': [44, 0, 22, 22],
  '90_1': [44, 22, 22, 22],
};
/** face 0〜7（右から 反時計回りに 45 度）→ 使う 絵と 反転（`fujin_blade.json` の directions.table） */
export const BLADE_FACES: readonly { sprite: '0' | '45' | '90'; flipX: boolean; flipY: boolean }[] = [
  { sprite: '0', flipX: false, flipY: false },
  { sprite: '45', flipX: false, flipY: false },
  { sprite: '90', flipX: false, flipY: false },
  { sprite: '45', flipX: true, flipY: false },
  { sprite: '0', flipX: true, flipY: false },
  { sprite: '45', flipX: true, flipY: true },
  { sprite: '90', flipX: false, flipY: true },
  { sprite: '45', flipX: false, flipY: true },
];

export interface WindWaveFxDeps {
  scene: THREE.Scene;
  camera: THREE.Camera;
  basePath?: string;
}

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

export class WindWaveFx {
  private readonly view = new FxView();
  private readonly batch: FxBatch;
  private readonly atlas: THREE.CanvasTexture;
  private readonly puffMeshes: THREE.Mesh[] = [];
  private readonly puffAge: number[] = [];
  private readonly puffSize: number[] = [];
  private readonly group = new THREE.Group();
  // すじ 1 本ぶんの 点・はば・明るさ・芯（作りなおさない）
  private readonly pts = makePts(N);
  private readonly wid = new Float32Array(N);
  private readonly alp = new Float32Array(N);
  private readonly core = new Float32Array(N);
  private readonly coreA = new Float32Array(N);
  private readonly edgeA = new Float32Array(N);
  private readonly dir = new THREE.Vector3();
  private readonly s1 = new THREE.Vector3();
  private readonly s2 = new THREE.Vector3();
  private readonly UP = new THREE.Vector3(0, 1, 0);
  /** 動きを へらす 設定 */
  private reducedNow = false;
  /** 今の 波の 数（窓口用） */
  private count = 0;

  constructor(private readonly deps: WindWaveFxDeps) {
    this.atlas = makeFujinAtlas();
    this.batch = new FxBatch(deps.scene, { additive: false, map: this.atlas, depthTest: true, renderOrder: 9, singlePass: true, maxVerts: MAX_WAVES * 3 * (3 * (N - 1) * 6 + 3 * 12) + 600 });
    const puffMat = new THREE.MeshBasicMaterial({ color: 0xe6f8ff, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide, fog: false });
    const pg = new THREE.PlaneGeometry(1, 1);
    for (let i = 0; i < MAX_PUFFS; i++) {
      const mesh = new THREE.Mesh(pg, puffMat.clone());
      mesh.visible = false;
      mesh.frustumCulled = false;
      this.puffMeshes.push(mesh);
      this.puffAge.push(-1);
      this.puffSize.push(1);
      this.group.add(mesh);
    }
    deps.scene.add(this.group);
  }

  onEvent(e: { type: string }): void {
    if (e.type !== 'waveEnd' && e.type !== 'spiralEnd') return;
    const we = e as (WaveEvent & { type: 'waveEnd' }) | (SpiralEvent & { type: 'spiralEnd' });
    if (we.reason !== 'block') return;
    const i = this.puffAge.findIndex((a) => a < 0);
    const k = i >= 0 ? i : 0;
    this.puffAge[k] = 0;
    this.puffSize[k] = e.type === 'spiralEnd' ? 2.2 : 1;
    this.puffMeshes[k]!.position.set(we.position.x, we.position.y, we.position.z);
  }

  /** 1 ステップに 1 回（カメラが 動いた あと）。らせん（kind 'spiral'）は ここでは 描かない */
  step(waves: readonly WaveView[], reduced = false): void {
    this.reducedNow = reduced;
    this.view.update(this.deps.camera);
    this.batch.begin();
    let n = 0;
    for (let i = 0; i < waves.length && n < MAX_WAVES; i++) {
      const w = waves[i]!;
      if (w.kind === 'spiral') continue;
      this.draw(w);
      n += 1;
    }
    this.count = n;
    this.batch.end();
    this.stepPuffs();
  }

  /** 風の すじを 1 つの 波ぶん 書く（先 = 今の 位置 drawPos・うしろへ のびる） */
  private draw(w: WaveView): void {
    const age = Math.round(w.traveled / STEP_LEN);
    const grow = clamp01((age + 1) / GROW_STEPS);
    const fade = 1 - clamp01((age - FADE_FROM) / FADE_STEPS);
    if (fade <= 0) return;
    const len = LEN * (0.25 + 0.75 * grow);
    const d = this.dir.set(w.dir.x, w.dir.y, w.dir.z);
    if (d.lengthSq() < 1e-6) d.set(0, 0, -1);
    d.normalize();
    // 進む 向きに 直角な 2 本（よこと たて）
    this.s1.crossVectors(d, this.UP);
    if (this.s1.lengthSq() < 1e-4) this.s1.set(1, 0, 0);
    this.s1.normalize();
    this.s2.crossVectors(this.s1, d).normalize();
    const hp = w.drawPos;
    const strands = this.reducedNow ? 2 : 3;
    const seed = w.id;
    const b = this.batch;
    const white = WHITE_Y + 1;
    const spin = this.reducedNow ? 0 : age * 0.32;
    const P = this.pts, Wd = this.wid, Al = this.alp;
    for (let j = 0; j < strands; j++) {
      const pal = PALS[j]!;
      const y0 = pal.row * 2 * TH;
      const ph = (j * 6.283185) / strands + seed * 1.7;
      const wmax = 0.5 * (1 - j * 0.08);
      for (let k = 0; k < N; k++) {
        const u = k / (N - 1); // 0 = うしろ・1 = 先
        const back = (1 - u) * len;
        // うしろほど ふわっと ひろがって ほどける。うねりは 年れいで 前へ 進む
        const amp = AMP * (0.3 + 1.1 * (1 - u) * (1 - u) + 0.35 * (1 - u));
        const th = ph + (1 - u) * 4.2 + spin;
        const wob = 1 + 0.18 * Math.sin(k * 1.7 + j * 2.1 + seed);
        const ox = (this.s1.x * Math.cos(th) + this.s2.x * Math.sin(th)) * amp * wob;
        const oy = (this.s1.y * Math.cos(th) + this.s2.y * Math.sin(th)) * amp * wob;
        const oz = (this.s1.z * Math.cos(th) + this.s2.z * Math.sin(th)) * amp * wob;
        P[k * 3] = hp.x - d.x * back + ox;
        P[k * 3 + 1] = hp.y - d.y * back + oy;
        P[k * 3 + 2] = hp.z - d.z * back + oz;
        // はば: 先は 細い 尖り・まん中が ふくらみ・うしろは ほそく ほどける
        const taper = u < 0.82 ? Math.pow(u / 0.82, 0.85) : 1 - ((u - 0.82) / 0.18) * 0.85;
        Wd[k] = wmax * Math.max(0.03, taper) * (1 + 0.1 * Math.sin(k * 1.9 + j));
        Al[k] = Math.pow(u, 0.6) * fade;
      }
      const rep = Math.max(1, (len * 1.2) / 4);
      const u0 = (seed + j) * 0.13;
      for (let k = 0; k < N; k++) {
        this.edgeA[k] = Al[k]! * 0.95;
        this.core[k] = Wd[k]! * 0.22;
        // 芯は 先ほど 明るい
        this.coreA[k] = Al[k]! * (0.35 + 0.65 * (k / (N - 1)));
      }
      b.strip(this.view, P, N, Wd, this.edgeA, [1, 1, 1], vOf(y0 + TH + TH - 1), vOf(y0 + TH), rep, u0);
      b.strip(this.view, P, N, Wd, Al, [1, 1, 1], vOf(y0 + TH - 1), vOf(y0), rep, u0);
      b.strip(this.view, P, N, this.core, this.coreA, pal.core, vOf(white), vOf(white), 1, 0);
      if (!this.reducedNow) {
        // ちり（うしろの 方に ひとつ）
        const k = 2 + Math.floor(hash(j, seed, 3) * (N - 6));
        const a = Al[k]!;
        b.quad(this.view, P[k * 3]!, P[k * 3 + 1]! + 0.06, P[k * 3 + 2]!, DOT * 3.2, pal.edge, 0.85 * a, 0.5, vOf(white));
        b.quad(this.view, P[k * 3]!, P[k * 3 + 1]! + 0.06, P[k * 3 + 2]!, DOT * 2, pal.dust, a, 0.5, vOf(white));
      }
    }
  }

  private stepPuffs(): void {
    const cam = this.deps.camera;
    for (let i = 0; i < this.puffMeshes.length; i++) {
      const a = this.puffAge[i]!;
      const mesh = this.puffMeshes[i]!;
      if (a < 0) {
        mesh.visible = false;
        continue;
      }
      if (a >= PUFF_STEPS) {
        this.puffAge[i] = -1;
        mesh.visible = false;
        continue;
      }
      mesh.visible = true;
      mesh.quaternion.copy(cam.quaternion);
      const s = (0.25 + a * 0.12) * this.puffSize[i]!;
      mesh.scale.set(s, s, s);
      (mesh.material as THREE.MeshBasicMaterial).opacity = 0.6 * (1 - a / PUFF_STEPS);
      this.puffAge[i] = a + 1;
    }
  }

  /** 読みこみ中に 材質と 絵を 先に 作る */
  warmUp(renderer: THREE.WebGLRenderer, camera: THREE.Camera, scene: THREE.Scene): void {
    this.batch.warmUp(renderer, camera, scene);
    renderer.initTexture(this.atlas);
  }

  info(): { draws: number; tris: number; waves: number } {
    return { draws: this.batch.visible() ? 1 : 0, tris: this.batch.triangles(), waves: this.count };
  }

  dispose(): void {
    this.batch.dispose(this.deps.scene);
    this.deps.scene.remove(this.group);
  }
}
