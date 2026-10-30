/**
 * #308 gashaBig.ts を 分けた もの: 大きい がしゃどくろ（第一形態）の モデルを 組み立てる（buildBig）。
 * 部位ごとの 作り方は gashaBigBuild{Body,Head,Arms,Mesh}.ts と gashaBigClouds.ts。ここは 作る 順番を 決めるだけ（順番・乱数は もとの まま）。
 */
import { BufferAttribute, Euler, Matrix4, Mesh, Quaternion } from 'three';
import { vec } from './gashaBigBuilder';
import { GlassCell, BigModel } from './gashaBigTypes';
import { TUNE as T } from './gashaBigTuning';
import { buildClouds, setCloudScale } from './gashaBigClouds';
import { hazePatch } from './gashaBigHaze';
import { buildSwirlEyes } from './gashaBigSwirl';
import { buildOutsideMoss, plantMaterial, OutsideMoss } from './gashaBigPlants';
import { buildArms } from './gashaBigBuildArms';
import { buildBodyPlants, buildCoreVis, buildMeshes } from './gashaBigBuildMesh';
import { buildHead } from './gashaBigBuildHead';
import { buildTorso, buildTorsoHits, buildTunnel } from './gashaBigBuildBody';
import { makeBuildCtx } from './gashaBigBuildCtx';

export function buildBig(): BigModel {
  const c = makeBuildCtx();
  const { b, headPos, rest } = c;
  buildTorso(c);
  buildTorsoHits(c);
  buildTunnel(c);
  const headYaw = buildHead(c);
  const { groundPts, armEnds } = buildArms(c);

  // 身長: 頭の いちばん 上（頭の 当たりの 上の 面）が T.size.height に なる ように
  const hm = new Matrix4().compose(headPos, new Quaternion().setFromEuler(new Euler(0.17, headYaw, 0, 'YXZ')), vec(1, 1, 1));
  const topY = vec(0, 20.4, -0.2).applyMatrix4(hm).y;
  const scale = T.size.height / topY;
  setCloudScale(scale);
  buildClouds(c, armEnds);

  const { group, joints, meshes, matOf, brow, glassMeshes } = buildMeshes(b, rest);
  const { setCoreFx, setCoreRed } = buildCoreVis(c, joints, meshes);
  const plantCount = buildBodyPlants(c, joints, meshes);
  // 体の 外がわの こけ・くさ（まばらな かたまり）。3 つの InstancedMesh を からだの 親に つけ、毎コマ 関節の 行列から 位置を 作りなおす
  const outsidePm = plantMaterial();
  hazePatch(outsidePm);
  const outside: OutsideMoss = buildOutsideMoss(b.hits, rest, joints, group, T.core.moss.outside, outsidePm);
  for (const mesh of outside.meshes) { mesh.renderOrder = 0; group.add(mesh); meshes.push(mesh); }
  /** ガラスの マスを 出す / 消す（見た目は 頂点の 透明度、当たりは mask） */
  const setGlass = (gc: GlassCell, on: boolean): void => {
    const m = glassMeshes[gc.joint];
    if (!m) return;
    const a = m.geometry.getAttribute('color') as BufferAttribute;
    for (const r of gc.ranges) for (let i = r.start; i < r.start + r.count; i++) a.setW(i, on ? 1 : 0);
    a.needsUpdate = true;
    const mk = b.hits[gc.hit]?.mask;
    if (mk) mk.on[gc.cell] = on ? 1 : 0;
  };

  const swirl = buildSwirlEyes(new Quaternion().setFromEuler(new Euler(0.17, headYaw, 0, 'YXZ')));
  joints.Head.add(swirl.root);
  return {
    group, joints, rest, hits: b.hits, glass: b.glass, setGlass, plants: plantCount, mossOutside: { clumps: outside.clumps, count: outside.count }, updateMoss: outside.update, burnMoss: outside.burn, restoreMoss: outside.restore, mossHidden: outside.hiddenCount, setCoreFx, setCoreRed, eyes: matOf('eyes'), eyeHalo: matOf('eyeHalo'), swirl, brow: brow ?? new Mesh(), scale, groundPts, head: headPos, meshes: meshes.length,
  };
}
