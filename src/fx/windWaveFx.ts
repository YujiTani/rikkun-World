import * as THREE from 'three';
import type { WaveEvent, WaveView } from '../legend/WaveSystem';

/**
 * WEAPON-7 §4.3: 風神剣の 真空波の 見た目。白い 三日月（絵: `public/models/fx/windwave_sheet.png`・4 コマ 32×32・4 ステップごとに 切りかえ）。
 * 草木と 同じ 十字（yuzu 2026-10-19）: 同じ 絵の 板を たて（上と 進む 向き）と よこ（横と 進む 向き）に 2 枚 重ねる。カメラには 向けない。
 * ブロックで 消えた とき 小さな 風の けむり（6 ステップ）。点滅しない。毎フレーム new しない（使い回し）。
 */
const BASE = './models/fx/';
export const WAVE_FRAMES = 4;
export const WAVE_FRAME_STEPS = 4;
export const WAVE_SIZE = 1.3;
export const PUFF_STEPS = 6;
const MAX_WAVES = 8;
/** 1 つの 波の 板の 数（たて・よこ の 十字） */
const PLANES = 2;
const MAX_PUFFS = 4;

/** 波が 生まれてから の ステップ数（1 ステップ 0.25 マス）から コマ */
export function waveFrameOf(traveled: number): number {
  return Math.floor(Math.round(traveled / 0.25) / WAVE_FRAME_STEPS) % WAVE_FRAMES;
}

export interface WindWaveFxDeps {
  scene: THREE.Scene;
  camera: THREE.Camera;
  basePath?: string;
}

export class WindWaveFx {
  private readonly geos: THREE.PlaneGeometry[] = [];
  private readonly mat: THREE.MeshBasicMaterial;
  private readonly meshes: THREE.Mesh[] = [];
  private readonly puffMat: THREE.MeshBasicMaterial;
  private readonly puffMeshes: THREE.Mesh[] = [];
  private readonly puffAge: number[] = [];
  private readonly group = new THREE.Group();
  private readonly n = new THREE.Vector3();
  private readonly r = new THREE.Vector3();
  private readonly u = new THREE.Vector3();
  private readonly m = new THREE.Matrix4();
  private readonly camPos = new THREE.Vector3();
  private readonly m2 = new THREE.Vector3();

  constructor(private readonly deps: WindWaveFxDeps) {
    const tex = new THREE.TextureLoader().load(`${deps.basePath ?? BASE}windwave_sheet.png`);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.colorSpace = THREE.SRGBColorSpace;
    this.mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false });
    for (let f = 0; f < WAVE_FRAMES; f++) {
      const g = new THREE.PlaneGeometry(1, 1);
      const uv = g.getAttribute('uv') as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setX(i, (f + uv.getX(i)) / WAVE_FRAMES);
      this.geos.push(g);
    }
    for (let i = 0; i < MAX_WAVES * PLANES; i++) {
      const mesh = new THREE.Mesh(this.geos[0]!, this.mat);
      mesh.visible = false;
      mesh.matrixAutoUpdate = false;
      mesh.frustumCulled = false;
      this.meshes.push(mesh);
      this.group.add(mesh);
    }
    this.puffMat = new THREE.MeshBasicMaterial({ color: 0xe6f8ff, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide, fog: false });
    const pg = new THREE.PlaneGeometry(1, 1);
    for (let i = 0; i < MAX_PUFFS; i++) {
      const mesh = new THREE.Mesh(pg, this.puffMat.clone());
      mesh.visible = false;
      mesh.frustumCulled = false;
      this.puffMeshes.push(mesh);
      this.puffAge.push(-1);
      this.group.add(mesh);
    }
    deps.scene.add(this.group);
  }

  onEvent(e: { type: string }): void {
    if (e.type !== 'waveEnd') return;
    const we = e as WaveEvent & { type: 'waveEnd' };
    if (we.reason !== 'block') return;
    const i = this.puffAge.findIndex((a) => a < 0);
    const k = i >= 0 ? i : 0;
    this.puffAge[k] = 0;
    this.puffMeshes[k]!.position.set(we.position.x, we.position.y, we.position.z);
  }

  /** 1 ステップに 1 回 */
  step(waves: readonly WaveView[], reduced = false): void {
    for (let i = 0; i < MAX_WAVES; i++) {
      const w = waves[i];
      const vert = this.meshes[i * PLANES]!;
      const flat = this.meshes[i * PLANES + 1]!;
      if (!w) {
        vert.visible = flat.visible = false;
        continue;
      }
      const geo = this.geos[reduced ? 0 : waveFrameOf(w.traveled)]!;
      // 絵の 右（三日月の とがった 向き）= 進む 向き（水平）。たて板は 絵の 上 = 空、よこ板は 絵の 上 = 横
      this.r.set(w.dir.x, 0, w.dir.z);
      if (this.r.lengthSq() < 1e-6) this.r.set(0, 0, -1);
      this.r.normalize();
      this.u.set(0, 1, 0);
      this.n.crossVectors(this.r, this.u); // 横
      for (const [mesh, up, nrm] of [
        [vert, this.u, this.n],
        [flat, this.n, this.u],
      ] as const) {
        mesh.visible = true;
        mesh.geometry = geo;
        this.m.makeBasis(this.camPos.copy(this.r).multiplyScalar(WAVE_SIZE), this.m2.copy(up).multiplyScalar(WAVE_SIZE), nrm);
        this.m.setPosition(w.position.x, w.position.y, w.position.z);
        mesh.matrix.copy(this.m);
        mesh.matrixWorldNeedsUpdate = true;
      }
    }
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
      mesh.quaternion.copy(this.deps.camera.quaternion);
      const s = 0.25 + a * 0.12;
      mesh.scale.set(s, s, s);
      (mesh.material as THREE.MeshBasicMaterial).opacity = 0.6 * (1 - a / PUFF_STEPS);
      this.puffAge[i] = a + 1;
    }
  }
}
