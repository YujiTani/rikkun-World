/**
 * #308 gashaBig.ts を 分けた もの: ためた 箱を 関節ごとの Group と メッシュに する・コアの 見た目・体の 中の 道の こけ・くさ。
 */
import { BufferGeometry, Color, DoubleSide, Float32BufferAttribute, Group, Matrix4, Mesh, MeshBasicMaterial, OctahedronGeometry, Quaternion, Vector3 } from 'three';
import { Builder, Kind, vec, PARENT } from './gashaBigBuilder';
import { JointName, JOINT_NAMES } from './gashaBigTypes';
import { TUNE as T } from './gashaBigTuning';
import { glassTexture } from './gashaBigClouds';
import { hazePatch } from './gashaBigHaze';
import { buildPlants, plantMaterial, PlantSurface } from './gashaBigPlants';
import type { BuildCtx } from './gashaBigBuildCtx';

export interface MeshParts {
  group: Group;
  joints: Record<JointName, Group>;
  meshes: Mesh[];
  matOf: (kind: Kind) => MeshBasicMaterial;
  brow: Mesh | null;
  glassMeshes: Partial<Record<JointName, Mesh>>;
}
export interface CoreVis {
  setCoreFx: (jx: number, jy: number, jz: number, scale: number, alphaK: number) => void;
  setCoreRed: (k: number, pulse?: number) => void;
}

/** 関節の Group と メッシュ（ためた 箱を 関節ごとに 1 つの メッシュに する） */
export function buildMeshes(b: Builder, rest: Record<JointName, Vector3>): MeshParts {
  const group = new Group();
  group.name = 'gashaBig';
  const joints = {} as Record<JointName, Group>;
  for (const j of JOINT_NAMES) {
    const g = new Group();
    g.name = j;
    const p = PARENT[j];
    g.position.copy(rest[j]).sub(p ? rest[p] : vec(0, 0, 0));
    joints[j] = g;
    (p ? joints[p] : group).add(g);
  }
  const meshes: Mesh[] = [];
  const mats: Partial<Record<Kind, MeshBasicMaterial>> = {};
  const matOf = (kind: Kind): MeshBasicMaterial => {
    let m = mats[kind];
    if (!m) {
      const tr = kind === 'glow' || kind === 'glass' || kind === 'eyeHalo' || kind === 'gblock';
      const lit = kind === 'eyes' || kind === 'eyeHalo' || kind === 'glow'; // 目の 光（怒り）と 光の 玉だけは 暗くしない・霞ませない
      m = new MeshBasicMaterial({ vertexColors: true, fog: !lit, side: kind === 'glass' || kind === 'gblock' ? 0 : DoubleSide, transparent: tr, opacity: kind === 'eyeHalo' ? 0.3 : 1, depthWrite: !tr, map: kind === 'gblock' ? glassTexture() : null });
      if (lit) m.userData.noDim = true;
      else hazePatch(m);
      mats[kind] = m;
    }
    return m;
  };
  const ORDER: Record<Kind, number> = { main: 0, bright: 0, eyes: 0, brow: 0, eyeHalo: 1, glass: 2, gblock: 2, glow: 3 };
  let brow: Mesh | null = null;
  const glassMeshes: Partial<Record<JointName, Mesh>> = {};
  for (const bk of b.buckets.values()) {
    if (!bk.pos.length) continue;
    // 関節の 原点が 回転の 中心に なる ように、頂点を 関節の 場所から の ずれに する
    const o = rest[bk.joint];
    const pos = bk.pos.slice();
    for (let i = 0; i < pos.length; i += 3) { pos[i]! -= o.x; pos[i + 1]! -= o.y; pos[i + 2]! -= o.z; }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new Float32BufferAttribute(bk.col, bk.rgba ? 4 : 3));
    if (bk.uv.length) geo.setAttribute('uv', new Float32BufferAttribute(bk.uv, 2));
    const m = new Mesh(geo, matOf(bk.kind));
    m.name = `${bk.joint}:${bk.kind}`;
    m.renderOrder = ORDER[bk.kind];
    m.frustumCulled = false;
    if (bk.kind === 'brow') { m.visible = false; brow = m; }
    if (bk.kind === 'gblock') glassMeshes[bk.joint] = m;
    joints[bk.joint].add(m); meshes.push(m);
  }
  return { group, joints, meshes, matOf, brow, glassMeshes };
}

/** コアの 見た目（しん と まわりの 光）。予兆の 間 ゆれて 半透明に なる ので、まとめずに 別の メッシュに する */
export function buildCoreVis(c: Pick<BuildCtx, 'rest' | 'torso' | 'K'>, joints: Record<JointName, Group>, meshes: Mesh[]): CoreVis {
  const { rest, torso, K } = c;
  // コアの 見た目（しん と まわりの 光）。予兆の 間 ゆれて 半透明に なる ので、まとめずに 別の メッシュに する
  const coreVis = new Group();
  coreVis.name = 'coreVis';
  const coreBase = new Matrix4().makeTranslation(-rest.Spine02.x, -rest.Spine02.y, -rest.Spine02.z).multiply(torso.m).multiply(new Matrix4().makeTranslation(K.pos[0], K.pos[1], K.pos[2]));
  const coreMats: { m: MeshBasicMaterial; a: number }[] = [];
  for (const [r, color, a] of [[0.42, 0xcffaff, 1], [0.62, 0x8aeaff, 0.3]] as const) {
    const m = new MeshBasicMaterial({ color, fog: false, transparent: true, opacity: a, depthWrite: a >= 1 });
    m.userData.noDim = true;
    const cm = new Mesh(new OctahedronGeometry(K.size * r), m);
    cm.frustumCulled = false; cm.renderOrder = a >= 1 ? 0 : 3;
    coreVis.add(cm);
    coreMats.push({ m, a });
  }
  coreVis.matrixAutoUpdate = false;
  coreVis.matrix.copy(coreBase);
  joints.Spine02.add(coreVis);
  const setCoreFx = (jx: number, jy: number, jz: number, scale: number, alphaK: number): void => {
    coreVis.matrix.copy(coreBase).multiply(new Matrix4().compose(vec(jx, jy, jz), new Quaternion(), vec(scale, scale, scale)));
    coreVis.matrixWorldNeedsUpdate = true;
    for (const c of coreMats) c.m.opacity = c.a * alphaK;
  };
  const coreBaseColors = coreMats.map((c) => c.m.color.clone());
  const coreRedColors = T.finish.core.redColor.map((c) => new Color(c));
  const setCoreRed = (k: number, pulse = 0): void => {
    const kk = Math.min(1, Math.max(0, k));
    coreMats.forEach((c, i) => {
      const red = coreRedColors[i] ?? coreRedColors[0]!;
      c.m.color.copy(coreBaseColors[i]!).lerp(red, kk);
      if (kk > 0) c.m.color.multiplyScalar(1 + 0.5 * pulse); // 赤い コアが ゆらゆら 明るく なる
    });
  };
  meshes.push(...(coreVis.children as Mesh[]));
  return { setCoreFx, setCoreRed };
}

/** 体の 中の 道に 生い茂る こけ・くさ（十字の ドット絵の 板。InstancedMesh）。くさの 数を 返す */
export function buildBodyPlants(c: Pick<BuildCtx, 'rest' | 'torso' | 'KT' | 'TX0' | 'TX1' | 'CEIL' | 'G0' | 'G1'>, joints: Record<JointName, Group>, meshes: Mesh[]): number {
  const { rest, torso, KT, TX0, TX1, CEIL, G0, G1 } = c;
  // 体の 中の 道に 生い茂る こけ・くさ（十字の ドット絵の 板。InstancedMesh）
  let plantCount = 0;
  {
    const M = T.core.moss, zA = -8.1, zB = KT.endZ, x0 = TX0 + 0.3, x1 = TX1 - 0.3, fy = KT.floorY, cy = CEIL - 0.45;
    const surf: PlantSurface[] = [];
    const rect = (o: [number, number, number], a: [number, number, number], bb: [number, number, number], up: [number, number, number], density: number): void => {
      surf.push({ o: vec(...o), a: vec(...a), b: vec(...bb), up: vec(...up), density });
    };
    const ZL = KT.backZ + 0.4;
    // 床（穴の 手前 / むこう / 外の だん）
    rect([x0, fy, ZL], [x1 - x0, 0, 0], [0, 0, G0 - ZL], [0, 1, 0], M.floor);
    rect([x0, fy, G1], [x1 - x0, 0, 0], [0, 0, zB - 0.4 - G1], [0, 1, 0], M.floor);
    // 左右の かべ（穴の ところは 下へ 深く）
    for (const [wx, dir] of [[TX0 + 0.35, 1], [TX1 - 0.35, -1]] as const) {
      rect([wx, fy + 0.2, zA], [0, CEIL - 0.5 - fy - 0.2, 0], [0, 0, zB - zA], [dir, 0, 0], M.wall);
      rect([wx, fy - 6, G0], [0, 6, 0], [0, 0, G1 - G0], [dir, 0, 0], M.wall * 0.7);
    }
    // 天井（下むきに たれる）
    rect([x0, cy, zA], [x1 - x0, 0, 0], [0, 0, zB - zA], [0, -1, 0], M.ceil);
    // つきあたりの かべ
    rect([x0, fy + 0.2, zB - 0.4], [x1 - x0, 0, 0], [0, CEIL - 0.5 - fy - 0.2, 0], [0, 0, -1], M.wall);
    // 穴の むこう / 手前の かべ
    rect([x0, fy - 6, G0 + 0.4], [x1 - x0, 0, 0], [0, 6, 0], [0, 0, 1], M.wall * 0.7);
    rect([x0, fy - 6, G1 - 0.4], [x1 - x0, 0, 0], [0, 6, 0], [0, 0, -1], M.wall * 0.7);
    // アーチの ほね まわり（ほねの すきまに ぎっしり）
    for (let z = zA + 1.5; z < zB - 0.5; z += 3.0) {
      if (z > G0 - 0.6 && z < G1 + 0.6) continue;
      rect([x0, fy, z - 0.8], [x1 - x0, 0, 0], [0, 0, 1.6], [0, 1, 0], M.ribs);
      for (const [wx, dir] of [[TX0 + 0.35, 1], [TX1 - 0.35, -1]] as const) rect([wx, fy + 0.2, z - 0.8], [0, CEIL - 0.5 - fy - 0.2, 0], [0, 0, 1.6], [dir, 0, 0], M.ribs);
    }
    const pm = plantMaterial();
    hazePatch(pm);
    const parent = new Matrix4().makeTranslation(-rest.Spine02.x, -rest.Spine02.y, -rest.Spine02.z).multiply(torso.m);
    const { meshes: pl, count } = buildPlants(surf.filter((q) => q.density > 0), { parent, size: M.size, carpet: M.carpet, max: M.max, seed: M.seed }, pm);
    for (const mesh of pl) { mesh.renderOrder = 0; joints.Spine02.add(mesh); meshes.push(mesh); }
    plantCount = count;
  }
  return plantCount;
}
