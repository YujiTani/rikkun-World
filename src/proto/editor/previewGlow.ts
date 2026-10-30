// HOUSE-1B 試作: 見本の 窓の「ぴかっ」。窓の あなの ふち（あかるい ふち ＋ ふんわり ひろがる あかり ＋ あなの 中の うすい 色）を
// かべの そとがわの 面から ほんの すこし うかせた 平らな 板で 作り、足しがけ（AdditiveBlending）で 重ねる。かべの 手前に ある 物には かくれる。
// 2 つ: cue ＝ 窓を かえた とき の ぴかっ（時間で ふえて 消える）、hover ＝ まどの ボタンに 手を おいて いる 間 ぜんぶの 窓。
// 描く 数は 光って いる 間だけ 1〜2 回 ふえる（三角形は 1 まど 18）。
import { AdditiveBlending, BufferGeometry, DoubleSide, Float32BufferAttribute, Mesh, MeshBasicMaterial, type Scene } from 'three';
import type { WindowCell } from './model';
import { GLOW, WINDOW_Y, type Wall } from './tuning';

/** 光らせる 窓 1 つ。k ＝ つよさ（0〜1。なくなった 窓は うすく） */
export interface GlowCell {
  cell: WindowCell;
  k: number;
}

type V3 = readonly [number, number, number];
interface Frame {
  /** あなの 左下（そとから 見て）・よこへ（u）の 向き・そとへの 向き */
  o: V3;
  u: V3;
  n: V3;
}

/** かべ wall の i 番めの 窓の まわりの 枠（そとがわの 面）。座標は previewMesh.ts と 同じ（まえ ＝ +z、みぎ ＝ +x） */
function frameOf(wall: Wall, i: number, w: number, d: number): Frame {
  const y = WINDOW_Y;
  switch (wall) {
    case 'front': return { o: [i, y, d + 1], u: [1, 0, 0], n: [0, 0, 1] };
    case 'back': return { o: [i + 1, y, -1], u: [-1, 0, 0], n: [0, 0, -1] };
    case 'right': return { o: [w + 1, y, i + 1], u: [0, 0, -1], n: [1, 0, 0] };
    case 'left': return { o: [-1, y, i], u: [0, 0, 1], n: [-1, 0, 0] };
    default: return assertNever(wall);
  }
}

function assertNever(x: never): never {
  throw new Error(`知らない かべ: ${String(x)}`);
}

class Builder {
  readonly pos: number[] = [];
  readonly col: number[] = [];
  readonly idx: number[] = [];

  /** 枠 f の (a, b)（あなの 左下が 0・0、右上が 1・1）に 点を 1 つ。alpha ＝ 光の つよさ */
  vert(f: Frame, a: number, b: number, alpha: number): number {
    const L = GLOW.lift;
    this.pos.push(f.o[0] + f.u[0] * a + f.n[0] * L, f.o[1] + b, f.o[2] + f.u[2] * a + f.n[2] * L);
    this.col.push(GLOW.color[0], GLOW.color[1], GLOW.color[2], alpha);
    return this.pos.length / 3 - 1;
  }

  quad(a: number, b: number, c: number, d: number): void {
    this.idx.push(a, b, c, a, c, d);
  }

  /** 窓 1 つ ぶん: あなの 中（fill）・あかるい ふち・ふんわり ハロー */
  cell(f: Frame, k: number): void {
    const rect = (m: number, alpha: number): number[] =>
      ([[-m, -m], [1 + m, -m], [1 + m, 1 + m], [-m, 1 + m]] as const).map(([a, b]) => this.vert(f, a, b, alpha));
    const fill = rect(0, GLOW.fill * k);
    this.quad(fill[0]!, fill[1]!, fill[2]!, fill[3]!);
    const ring = (inner: number[], outer: number[]): void => {
      for (let s = 0; s < 4; s++) this.quad(inner[s]!, inner[(s + 1) % 4]!, outer[(s + 1) % 4]!, outer[s]!);
    };
    const e = GLOW.edgeWidth;
    const edgeIn = rect(0, GLOW.edge * k);
    const edgeOut = rect(e, GLOW.halo * k);
    ring(edgeIn, edgeOut);
    const haloOut = rect(e + GLOW.haloWidth, 0);
    ring(edgeOut, haloOut);
  }

  geometry(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new Float32BufferAttribute(this.col, 4));
    g.setIndex(this.idx);
    return g;
  }
}

function makeMesh(): Mesh<BufferGeometry, MeshBasicMaterial> {
  const m = new Mesh(
    new BufferGeometry(),
    // 両面（forceSinglePass: 半透明の 両面を 2 回に 分けて 描かない ＝ 描く 数を 1 つに する）
    new MeshBasicMaterial({ vertexColors: true, transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, forceSinglePass: true }),
  );
  m.frustumCulled = false;
  m.renderOrder = 5;
  m.visible = false;
  return m;
}

const smooth = (t: number): number => {
  const k = Math.min(1, Math.max(0, t));
  return k * k * (3 - 2 * k);
};

/** 変えた 窓の ぴかっ（t ＝ 回りはじめてからの コマ数）: まって → ふわっと 光る → ゆらぎながら のこる → すうっと 消える。0〜1 */
export function cueLevel(t: number, reduced: boolean): number {
  const u = t - GLOW.cueDelayFrames;
  if (u < 0 || u > GLOW.cueFrames) return 0;
  const env = Math.min(smooth(u / GLOW.riseFrames), smooth((GLOW.cueFrames - u) / GLOW.fadeFrames));
  const wave = reduced ? 1 : 1 - GLOW.pulseDepth * (0.5 - 0.5 * Math.cos((2 * Math.PI * u) / GLOW.pulseFrames));
  return env * wave;
}

/** 手を おいて いる 間の 光の ゆらぎ（t ＝ おいてからの コマ数。0〜hoverLevel）。動きを へらす 設定では 一定 */
export function hoverWave(t: number, reduced: boolean): number {
  return GLOW.hoverLevel * (reduced ? 1 : 1 - GLOW.hoverPulseDepth * (0.5 - 0.5 * Math.cos((2 * Math.PI * t) / GLOW.hoverPulseFrames)));
}

export class GlowMeshes {
  readonly cue = makeMesh();
  readonly hover = makeMesh();
  private cueCells = 0;
  private hoverCells = 0;

  addTo(scene: Scene): void {
    scene.add(this.cue, this.hover);
  }

  private build(mesh: Mesh<BufferGeometry, MeshBasicMaterial>, cells: readonly GlowCell[], w: number, d: number): void {
    const b = new Builder();
    for (const c of cells) b.cell(frameOf(c.cell.wall, c.cell.i, w, d), c.k);
    mesh.geometry.dispose();
    mesh.geometry = cells.length > 0 ? b.geometry() : new BufferGeometry();
  }

  setCue(cells: readonly GlowCell[], w: number, d: number): void {
    this.build(this.cue, cells, w, d);
    this.cueCells = cells.length;
  }

  setHover(cells: readonly WindowCell[], w: number, d: number): void {
    this.build(this.hover, cells.map((cell) => ({ cell, k: 1 })), w, d);
    this.hoverCells = cells.length;
  }

  /** 光の つよさ（0〜1）。0 なら 描かない */
  setLevels(cue: number, hover: number, show: boolean): void {
    this.cue.material.opacity = cue;
    this.hover.material.opacity = hover;
    this.cue.visible = show && cue > 0.002 && this.cueCells > 0;
    this.hover.visible = show && hover > 0.002 && this.hoverCells > 0;
  }

  dispose(): void {
    for (const m of [this.cue, this.hover]) {
      m.geometry.dispose();
      m.material.dispose();
    }
  }
}
