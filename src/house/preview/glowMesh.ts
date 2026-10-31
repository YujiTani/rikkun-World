// HOUSE-1B 見本の 窓・戸の「ぴかっ」の 形（AC56）。あなの ふち（あかるい ふち ＋ ふんわり ひろがる あかり ＋ あなの 中の うすい 色）を
// かべの 外がわの 面から ほんの すこし うかせた 平らな 板で 作り、足しがけ（AdditiveBlending）で 重ねる。かべの 手前に ある 物には かくれる。
// 2 つ: cue ＝ 窓を かえた・① に なった 戸の 光り（時間で ふえて 消える）、hover ＝ まどの ボタンに 手を おいて いる 間 ぜんぶの 窓。
// 描く 数は 光って いる 間だけ 1〜2 回 ふえる（三角形は 1 まど 18）。時間の 数え方は glow.ts、数は tuning.ts の GLOW。
import { AdditiveBlending, BufferGeometry, DoubleSide, Float32BufferAttribute, Mesh, MeshBasicMaterial, type Scene } from 'three';
import { doorIndex, type EditorState, type WindowCell } from '../editor/model';
import { DOOR_WALL, HEIGHT, WINDOW_Y, type Wall } from '../editor/tuning';
import { GLOW } from './tuning';

/** 光らせる あな 1 つ。y ＝ あなの 下の 段、h ＝ 段の かず（窓 1・戸 2）、k ＝ つよさ（0〜1。なくなった 窓は うすく） */
export interface GlowSpot {
  wall: Wall;
  i: number;
  y: number;
  h: number;
  k: number;
}

/** 窓 1 つ（k ＝ つよさ） */
export const windowSpot = (c: WindowCell, k: number): GlowSpot => ({ wall: c.wall, i: c.i, y: WINDOW_Y, h: 1, k });
/** 戸（まえの かべの まん中。下の 段から 上の 段まで） */
export const doorSpot = (s: Pick<EditorState, 'w' | 'd'>): GlowSpot => ({ wall: DOOR_WALL, i: doorIndex(s), y: HEIGHT.floor, h: HEIGHT.doorLevels, k: 1 });

type V3 = readonly [number, number, number];
interface Frame {
  /** あなの 左下（そとから 見て）・よこへ（u）の 向き・そとへの 向き */
  o: V3;
  u: V3;
  n: V3;
}

/** かべごとの 枠（そとがわの 面）。座標は mesh.ts と 同じ（まえ ＝ +z、みぎ ＝ +x）。i ＝ その かべの 中の 番号、y ＝ 下の 段 */
const FRAME = {
  front: (i, _w, d, y) => ({ o: [i, y, d + 1], u: [1, 0, 0], n: [0, 0, 1] }),
  back: (i, _w, _d, y) => ({ o: [i + 1, y, -1], u: [-1, 0, 0], n: [0, 0, -1] }),
  right: (i, w, _d, y) => ({ o: [w + 1, y, i + 1], u: [0, 0, -1], n: [1, 0, 0] }),
  left: (i, _w, _d, y) => ({ o: [-1, y, i], u: [0, 0, 1], n: [-1, 0, 0] }),
} as const satisfies Record<Wall, (i: number, w: number, d: number, y: number) => Frame>;

class Builder {
  readonly pos: number[] = [];
  readonly col: number[] = [];
  readonly idx: number[] = [];

  /** 枠 f の (a, b)（あなの 左下が 0・0）に 点を 1 つ。alpha ＝ 光の つよさ */
  vert(f: Frame, a: number, b: number, alpha: number): number {
    const L = GLOW.lift;
    this.pos.push(f.o[0] + f.u[0] * a + f.n[0] * L, f.o[1] + b, f.o[2] + f.u[2] * a + f.n[2] * L);
    this.col.push(GLOW.color[0], GLOW.color[1], GLOW.color[2], alpha);
    return this.pos.length / 3 - 1;
  }

  quad(a: number, b: number, c: number, d: number): void {
    this.idx.push(a, b, c, a, c, d);
  }

  /** あな 1 つ ぶん（よこ 1・たて h）: あなの 中（fill）・あかるい ふち・ふんわり ハロー */
  spot(f: Frame, h: number, k: number): void {
    const rect = (m: number, alpha: number): number[] =>
      ([[-m, -m], [1 + m, -m], [1 + m, h + m], [-m, h + m]] as const).map(([a, b]) => this.vert(f, a, b, alpha));
    const fill = rect(0, GLOW.fill * k);
    this.quad(fill[0]!, fill[1]!, fill[2]!, fill[3]!);
    const ring = (inner: number[], outer: number[]): void => {
      for (let s = 0; s < 4; s++) this.quad(inner[s]!, inner[(s + 1) % 4]!, outer[(s + 1) % 4]!, outer[s]!);
    };
    const edgeIn = rect(0, GLOW.edge * k);
    const edgeOut = rect(GLOW.edgeWidth, GLOW.halo * k);
    ring(edgeIn, edgeOut);
    ring(edgeOut, rect(GLOW.edgeWidth + GLOW.haloWidth, 0));
  }

  geometry(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new Float32BufferAttribute(this.col, 4));
    g.setIndex(this.idx);
    return g;
  }
}

type GlowMesh = Mesh<BufferGeometry, MeshBasicMaterial>;

function makeMesh(): GlowMesh {
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

export class GlowMeshes {
  private readonly cue = makeMesh();
  private readonly hover = makeMesh();
  private cueSpots = 0;
  private hoverSpots = 0;

  addTo(scene: Scene): void {
    scene.add(this.cue, this.hover);
  }

  private build(mesh: GlowMesh, spots: readonly GlowSpot[], w: number, d: number): number {
    const b = new Builder();
    for (const c of spots) b.spot(FRAME[c.wall](c.i, w, d, c.y), c.h, c.k);
    mesh.geometry.dispose();
    mesh.geometry = spots.length > 0 ? b.geometry() : new BufferGeometry();
    return spots.length;
  }

  /** 光り 1 回の 形を 作る（空なら 消す） */
  setCue(spots: readonly GlowSpot[], w: number, d: number): void {
    this.cueSpots = this.build(this.cue, spots, w, d);
  }

  /** hover の 形（窓 ぜんぶ）を 作る */
  setHover(spots: readonly GlowSpot[], w: number, d: number): void {
    this.hoverSpots = this.build(this.hover, spots, w, d);
  }

  /** 光の つよさ（0〜1）。0 なら 描かない。show ＝ そとの 見本 だけ 出す */
  setLevels(cue: number, hover: number, show: boolean): void {
    this.cue.material.opacity = cue;
    this.hover.material.opacity = hover;
    this.cue.visible = show && cue > 0.002 && this.cueSpots > 0;
    this.hover.visible = show && hover > 0.002 && this.hoverSpots > 0;
  }

  dispose(): void {
    for (const m of [this.cue, this.hover]) {
      m.geometry.dispose();
      m.material.dispose();
    }
  }
}
