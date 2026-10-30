/**
 * #308 gashaBig.ts を 分けた もの: 当たりの 箱を 世界の 座標に うつす・ブロックの マスに 直す。
 */
import { Quaternion, Vector3 } from 'three';
import { maskHas, type BigModel, type GlassMask, type JointName } from './gashaBigTypes';

export interface WorldHit { name: string; joint: JointName; center: [number, number, number]; half: [number, number, number]; axes: [[number, number, number], [number, number, number], [number, number, number]]; mask?: GlassMask }

/** 当たりの 箱を、関節の いまの 姿勢（Group の ワールド行列）で 世界の 座標に うつす。group の 位置・向き・拡大は 先に 決めて おく */
export function worldHits(model: BigModel): WorldHit[] {
  model.group.updateMatrixWorld(true);
  const pos = new Vector3(), q = new Quaternion(), sc = new Vector3();
  return model.hits.map((h) => {
    const jg = model.joints[h.joint];
    jg.matrixWorld.decompose(pos, q, sc);
    const o = model.rest[h.joint];
    const c = h.c.clone().sub(o).applyMatrix4(jg.matrixWorld);
    const ax = h.axes.map((a) => a.clone().applyQuaternion(q));
    return {
      name: h.name, joint: h.joint,
      center: [c.x, c.y, c.z],
      half: [h.half[0] * sc.x, h.half[1] * sc.y, h.half[2] * sc.z],
      axes: [[ax[0]!.x, ax[0]!.y, ax[0]!.z], [ax[1]!.x, ax[1]!.y, ax[1]!.z], [ax[2]!.x, ax[2]!.y, ax[2]!.z]],
      mask: h.mask,
    };
  });
}

/** マス（i, j, k）の キー。±32768 の 外は 想定しない */
export const cellKey = (i: number, j: number, k: number): number => ((i + 32768) * 65536 + (k + 32768)) * 1024 + j;

/** 箱の 中に マスの 中心が ある マスを 数える。margin は 箱の ぜんぶの 向きに ひろげる ぶん、topLift は 箱の 上の 向き（2 番目の 軸）だけ */
export function voxelize(hits: WorldHit[], margin: number, topLift: number): Set<number> {
  const cells = new Set<number>();
  for (const h of hits) {
    const [hx, hy, hz] = h.half;
    const ext = [0, 1, 2].map((d) => Math.abs(h.axes[0]![d]!) * (hx + margin) + Math.abs(h.axes[1]![d]!) * (hy + margin + topLift) + Math.abs(h.axes[2]![d]!) * (hz + margin));
    const [cx, cy, cz] = h.center;
    const i0 = Math.floor(cx - ext[0]!), i1 = Math.ceil(cx + ext[0]!);
    const j0 = Math.max(0, Math.floor(cy - ext[1]!)), j1 = Math.ceil(cy + ext[1]!);
    const k0 = Math.floor(cz - ext[2]!), k1 = Math.ceil(cz + ext[2]!);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) for (let k = k0; k <= k1; k++) {
      const dx = i + 0.5 - cx, dy = j + 0.5 - cy, dz = k + 0.5 - cz;
      const u = dx * h.axes[0]![0] + dy * h.axes[0]![1] + dz * h.axes[0]![2];
      const v = dx * h.axes[1]![0] + dy * h.axes[1]![1] + dz * h.axes[1]![2] - topLift / 2;
      const w = dx * h.axes[2]![0] + dy * h.axes[2]![1] + dz * h.axes[2]![2];
      if (Math.abs(u) <= hx + margin && Math.abs(v) <= hy + margin + topLift / 2 && Math.abs(w) <= hz + margin && maskHas(h.mask, u, w, hx, hz)) cells.add(cellKey(i, j, k));
    }
  }
  return cells;
}
