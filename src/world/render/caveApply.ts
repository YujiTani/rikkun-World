import { Matrix4, Vector4, type PerspectiveCamera } from 'three';
import { columnKey, type ArrayVoxelWorld } from '../VoxelWorld';
import { SEALS } from '../voxelColumn';
import {
  CaveSearch, CLOSED_GRAPH, OPEN_GRAPH, buildFaceGraph, type CaveStats, type Projected,
} from './caveCull';
import { CLS_AIR, CLS_HIDDEN, type Cls, type ColState, type SecState } from './sectionState';

/** セクションの 面の つながりを 作り直す（メッシュを 作るとき。中身が 同じなら 空気・ふさがった は 表を 見ない） */
export function refreshSectionVis(world: ArrayVoxelWorld, st: SecState, cls: Cls): void {
  if (cls === CLS_AIR) st.vis = OPEN_GRAPH;
  else if (cls === CLS_HIDDEN) st.vis = CLOSED_GRAPH;
  else {
    const sec = world.section(st.cx, st.sy, st.cz);
    if (sec?.kind === 'uniform') st.vis = SEALS[sec.block] === 1 ? CLOSED_GRAPH : OPEN_GRAPH;
    else {
      const x0 = st.cx * 16;
      const y0 = st.sy * 16;
      const z0 = st.cz * 16;
      st.vis = buildFaceGraph((lx, ly, lz) => {
        const b = world.getIndex(x0 + lx, y0 + ly, z0 + lz);
        return b >= 0 && SEALS[b] === 1;
      });
    }
  }
  st.visGen = st.gen;
}

/**
 * 描く直前に、この カメラから 見えない セクションの メッシュを かくす。
 * カメラも 中身も 変わっていなければ さがし直さない。
 */
export class CaveView {
  private readonly search = new CaveSearch();
  private readonly viewProj = new Matrix4();
  private readonly q = new Vector4();
  private readonly pose = new Float64Array(16);
  private poseOk = false;
  private poseEpoch = -1;
  private readonly project = (x: number, y: number, z: number, out: Projected): void => {
    this.q.set(x, y, z, 1).applyMatrix4(this.viewProj);
    // カメラは −Z を 向く。映る 側は clip の w が 正
    out.behind = this.q.w <= 1e-4;
    if (!out.behind) {
      const inv = 1 / this.q.w;
      out.x = this.q.x * inv;
      out.y = this.q.y * inv;
    }
  };

  stats(): CaveStats {
    return this.search.stats();
  }

  apply(cols: ReadonlyMap<number, ColState>, world: ArrayVoxelWorld, cam: PerspectiveCamera, epoch: number): CaveStats {
    cam.updateMatrixWorld();
    this.viewProj.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    const e = this.viewProj.elements;
    let same = this.poseOk && this.poseEpoch === epoch;
    if (same) for (let i = 0; i < 16; i++) if (e[i] !== this.pose[i]) same = false;
    if (same && this.search.stats().complete) return this.search.stats();
    const stats = this.search.run({
      eye: cam.position,
      project: this.project,
      blocked: (x, y, z) => {
        const b = world.getIndex(x, y, z);
        return b >= 0 && SEALS[b] === 1;
      },
      at: (cx, sy, cz) => {
        const st = cols.get(columnKey(cx, cz))?.secs[sy];
        if (!st) return null;
        return { graph: st.vis !== null && st.visGen === st.gen ? st.vis : null };
      },
    });
    let shown = 0;
    let hidden = 0;
    for (const col of cols.values()) {
      for (const st of col.secs) {
        if (!st.voxel && !st.extras && !st.water) continue;
        const show = !stats.complete || this.search.isDrawn(st.cx, st.sy, st.cz);
        this.setShow(st, show);
        if (show) shown++;
        else hidden++;
      }
    }
    stats.shown = shown;
    stats.hidden = hidden;
    if (stats.complete) {
      for (let i = 0; i < 16; i++) this.pose[i] = e[i]!;
      this.poseOk = true;
      this.poseEpoch = epoch;
    } else this.poseOk = false;
    return stats;
  }

  private setShow(st: SecState, show: boolean): void {
    const v = st.voxel;
    const x = st.extras;
    const w = st.water;
    if (v && v.visible !== show) v.visible = show;
    if (x && x.visible !== show) x.visible = show;
    if (w && w.visible !== show) w.visible = show;
  }
}
