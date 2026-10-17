// CHAR-4 ユニットテスト用の 道具（本番の コードからは 使わない）。
// 刀の 状態と 体の 位置を 「本物の BladeSystem と 同じ 決まり」で 作って 軌跡に わたす
import * as THREE from 'three';
import { W2_SETTING_DEFAULTS, createW2Settings, type BladeState, type BladeTech, type BladeTechFrames, type ItemId, type Vec3, type W2Settings } from '../contracts';
import { techAdvance } from '../tools/blade/advance';
import { BladeTrail, type TrailSnapshot } from './bladeTrail';

export const TECHS: BladeTech[] = ['thrust', 'kesa', 'kiriage'];
export const STANCE_OF: Record<BladeTech, BladeState['stance']> = { thrust: 'chudan', kesa: 'jodan', kiriage: 'gedan' };

export interface Rig {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  settings: W2Settings;
  trail: BladeTrail;
}

export function makeRig(opts: { camera?: { pos: [number, number, number]; look: [number, number, number] } } = {}): Rig {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, 1.6, 0.1, 200);
  const c = opts.camera ?? { pos: [0, 1.6, 6], look: [0, 1.2, 0] };
  camera.position.set(...c.pos);
  camera.lookAt(...c.look);
  camera.updateMatrixWorld(true);
  const settings = createW2Settings();
  const trail = new BladeTrail({ scene, camera, settings: () => settings });
  return { scene, camera, settings, trail };
}

export function setCamera(rig: Rig, pos: [number, number, number], look: [number, number, number]): void {
  rig.camera.position.set(...pos);
  rig.camera.lookAt(...look);
  rig.camera.updateMatrixWorld(true);
}

const front = (dirDeg: number): Vec3 => ({ x: Math.sin((dirDeg * Math.PI) / 180), y: 0, z: -Math.cos((dirDeg * Math.PI) / 180) });

/** わざの F 番目の ステップの 刀の 状態（本物と 同じ 形） */
export function moveState(settings: W2Settings, item: ItemId, tech: BladeTech, f: number, dirDeg: number, origin: Vec3): BladeState {
  const len = settings.bladeTech[tech];
  const phase = f <= len.startup ? 'startup' : f <= len.startup + len.active ? 'active' : 'recovery';
  const target = techAdvance(settings.bladeAdvance[tech], W2_SETTING_DEFAULTS.bladeTech[tech], len, f);
  return { item, stance: STANCE_OF[tech], tech, phase, frame: f, buffered: null, switchFrom: null, move: { dirDeg, origin, target, moved: target, tiltDeg: 0 } };
}

export function idleState(item: ItemId | null, stance: BladeState['stance'] = 'chudan'): BladeState {
  return { item, stance, tech: null, phase: 'idle', frame: 0, buffered: null, switchFrom: null, move: null };
}

/** 平らな 地面で 体は O + 前 × A(f) */
export function bodyOf(settings: W2Settings, tech: BladeTech, f: number, dirDeg: number, origin: Vec3): Vec3 {
  const a = techAdvance(settings.bladeAdvance[tech], W2_SETTING_DEFAULTS.bladeTech[tech], settings.bladeTech[tech], f);
  const fw = front(dirDeg);
  return { x: origin.x + fw.x * a, y: origin.y, z: origin.z + fw.z * a };
}

export interface Rec {
  f: number;
  body: Vec3;
  snap: TrailSnapshot;
}

/** わざを 始めて F1〜F(n) を 1 ステップずつ 進める。bodyFn で 体の 位置を かえてよい */
export function fire(
  rig: Rig,
  tech: BladeTech,
  n: number,
  o: { item?: ItemId; dirDeg?: number; stateDir?: (f: number) => number; origin?: Vec3; body?: (f: number, base: Vec3) => Vec3; from?: number } = {},
): Rec[] {
  const item = o.item ?? 'katana';
  const dirDeg = o.dirDeg ?? 0;
  const origin = o.origin ?? { x: 20.5, y: 5, z: 20.5 };
  const out: Rec[] = [];
  for (let f = o.from ?? 1; f <= n; f++) {
    const st = moveState(rig.settings, item, tech, f, o.stateDir ? o.stateDir(f) : dirDeg, origin);
    const base = bodyOf(rig.settings, tech, f, dirDeg, origin);
    const body = o.body ? o.body(f, base) : base;
    rig.trail.step(st, body);
    out.push({ f, body: { ...body }, snap: rig.trail.snapshot() });
  }
  return out;
}

export const at = (rec: Rec[], f: number): Rec => {
  const r = rec.find((x) => x.f === f);
  if (!r) throw new Error(`F${f} の きろくが ない`);
  return r;
};
export const range = (a: number, b: number): number[] => Array.from({ length: b - a + 1 }, (_, i) => a + i);
export const visibleSteps = (rec: Rec[]): number[] => rec.filter((r) => r.snap.visible).map((r) => r.f);
export const dist = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
export type { BladeTechFrames };

/** シーンの 中の 軌跡の 物（帯・星） */
export function trailMeshes(scene: THREE.Scene): { band: THREE.Mesh; stars: THREE.Mesh } {
  const band = scene.getObjectByName('bladeTrail') as THREE.Mesh;
  const stars = scene.getObjectByName('bladeTrailStars') as THREE.Mesh;
  return { band, stars };
}
