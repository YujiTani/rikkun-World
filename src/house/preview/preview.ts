// HOUSE-1B エディターの 見本（3D）。ゲームの レンダラー（game.renderer）で、画面の「穴」（HTML の 見本の 場所）に
// 切りぬいて 描く（2 つ目の WebGL を 作らない）。面は ゲームの 区の メッシュと 同じ 材料（MeshData → toGeometry）。
// 毎コマ: 画面ぜんぶを 地の 色で ぬる → 穴の 四角だけ viewport＋scissor で 空の 色に して 見本を 描く。
//   そと ＝ 屋根つき・低めの 角度、なか ＝ 屋根なし・50°・カメラに 近い かべが すっと さがる（ドールハウスの 切り口）。
//   向き ＝ ゆっくり 自動で 回る（PR-2 で ドラッグ・窓の 光りを 足す）。形が かわった ときだけ 作りなおす。
import {
  BufferGeometry, Color, Mesh, MeshBasicMaterial, PerspectiveCamera, Scene, Vector2, Vector3, Vector4,
  type DataTexture, type WebGLRenderer,
} from 'three';
import { toGeometry } from '../../world/render/rendererGeometry';
import type { FurnKind } from '../editor/furniture';
import type { EditorState } from '../editor/model';
import { ROOF_Y, WALLS, type Rot, type Wall } from '../editor/tuning';
import { createPreviewAtlas } from './atlas';
import { FurnitureIcons, type FurnImage } from './furnitureIcons';
import { HOUSE_LOOK } from './look';
import { buildPreview, type PreviewMode, type PreviewParts } from './mesh';
import { PREVIEW } from './tuning';
import { OUTWARD, ViewCtl } from './view';

export type { FurnImage, PreviewMode };

/** 画面（キャンバス）の 左上からの 四角（CSS の px） */
export interface ViewRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 見本 1 回ぶんの 描画の 数（renderer.info。アイコン用の 描きは 数えない） */
export interface PreviewStats {
  drawCalls: number;
  triangles: number;
}


const rad = (deg: number): number => (deg * Math.PI) / 180;

export class Preview3D {
  private readonly atlas: DataTexture = createPreviewAtlas();
  private readonly material = new MeshBasicMaterial({ map: this.atlas, vertexColors: true, alphaTest: 0.5 });
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(PREVIEW.fovDeg, 1, 0.5, 400);
  private readonly probe = new PerspectiveCamera(PREVIEW.fovDeg, 1, 0.5, 400);
  private readonly baseMesh = new Mesh(undefined, this.material);
  private readonly roofMesh = new Mesh(undefined, this.material);
  private readonly wallMesh: Record<Wall, Mesh> = {
    front: new Mesh(undefined, this.material),
    right: new Mesh(undefined, this.material),
    back: new Mesh(undefined, this.material),
    left: new Mesh(undefined, this.material),
  };
  private readonly icons: FurnitureIcons;
  private parts: PreviewParts | null = null;
  private key = '';
  private mode: PreviewMode = 'outside';
  /** 見る 向き（そと・なか それぞれ。見えて いない 間は すすまない。見える ように なる たびに はじめの 向き） */
  private readonly views: Record<PreviewMode, ViewCtl> = {
    outside: new ViewCtl(PREVIEW.outsideElevDeg),
    inside: new ViewCtl(PREVIEW.insideElevDeg),
  };
  /** 最後に 見せた 見せ方（null ＝ 見せて いない。見せ方が かわったら その 向きを はじめに もどす） */
  private shown: PreviewMode | null = null;
  private fitKey = '';
  private readonly fits = new Map<number, number>();
  private fitPts: Vector3[] = [];
  private readonly center = new Vector3();
  /** draw() の たびに 新しく 作らない ための 置き場 */
  private readonly keep = { color: new Color(), viewport: new Vector4(), scissor: new Vector4(), size: new Vector2() };
  private readonly pt = new Vector3();
  builds = 0;
  stats: PreviewStats = { drawCalls: 0, triangles: 0 };

  constructor(private readonly renderer: WebGLRenderer, private readonly reduced: () => boolean) {
    this.icons = new FurnitureIcons(renderer, this.material);
    const meshes = [this.baseMesh, this.roofMesh, ...WALLS.map((w) => this.wallMesh[w])];
    this.scene.add(...meshes);
    for (const m of meshes) m.frustumCulled = false;
  }

  // ------------------------------------------------------------ 形

  /** 形・見せ方が かわって いたら 作りなおす（かわって いなければ 何も しない） */
  setShape(s: EditorState, mode: PreviewMode): void {
    if (this.shown !== mode) {
      this.shown = mode;
      this.views[mode].reset();
    }
    const key = JSON.stringify([mode, s.w, s.d, s.windows, s.windowKind, s.roof, mode === 'inside' ? s.furniture : 0]);
    if (key === this.key) return;
    this.key = key;
    this.mode = mode;
    this.builds++;
    this.parts = buildPreview(s, mode);
    const set = (mesh: Mesh, data: PreviewParts['base']): void => {
      mesh.geometry.dispose();
      mesh.geometry = data.faceCount > 0 ? toGeometry(data) : new BufferGeometry();
    };
    set(this.baseMesh, this.parts.base);
    set(this.roofMesh, this.parts.roof);
    for (const w of WALLS) set(this.wallMesh[w], this.parts.walls[w]);
    this.roofMesh.visible = mode === 'outside';
    for (const w of WALLS) {
      this.wallMesh[w].visible = true;
      this.wallMesh[w].scale.y = 1;
      this.wallMesh[w].position.y = 0;
    }
    this.center.set(this.parts.w / 2, mode === 'outside' ? 2 : 1.5, this.parts.d / 2);
    this.fitKey = '';
  }

  /** 見本を 見せるのを やめた（③ なまえ・とじた）。次に 見せる とき はじめの 向きから */
  hide(): void {
    this.shown = null;
  }

  // ------------------------------------------------------------ 向き・時間

  /** 1 ステップ（1/60 秒。ゲームの 時間が 止まって いても すすむ）。見せて いない 間は すすめない */
  tick(): void {
    if (this.shown !== null) this.views[this.mode].step(!this.reduced());
  }

  /** その 見せ方の 見る 向き（度。yaw 0 ＝ まえから、90 ＝ みぎから）と、形を 作りなおした 回数（窓口 `editor().preview` の 元） */
  viewOf(mode: PreviewMode): { yaw: number; elev: number; touched: boolean; builds: number } {
    const v = this.views[mode];
    return { yaw: v.yaw, elev: v.elev, touched: v.touched, builds: this.builds };
  }

  // ------------------------------------------------------------ カメラ

  private place(yawDeg: number, elevDeg: number, dist: number, cam: PerspectiveCamera): void {
    const e = rad(elevDeg);
    const y = rad(yawDeg);
    cam.position.set(this.center.x + dist * Math.sin(y) * Math.cos(e), this.center.y + dist * Math.sin(e), this.center.z + dist * Math.cos(y) * Math.cos(e));
    cam.lookAt(this.center);
    cam.updateMatrixWorld(true);
  }

  /** 家と 地面の 板の かどの 点（どの 向きでも はみ出さない 近さを さがす 材料） */
  private fitPoints(p: PreviewParts): Vector3[] {
    const M = PREVIEW.groundMargin[this.mode];
    const top = this.mode === 'outside' ? ROOF_Y + 1 : ROOF_Y;
    const pts: Vector3[] = [];
    for (const x of [-1 - M, p.w + 1 + M]) for (const z of [-1 - M, p.d + 1 + M]) for (const y of [-1, 1]) pts.push(new Vector3(x, y, z));
    for (const x of [-1, p.w + 1]) for (const z of [-1, p.d + 1]) for (const y of [1, top]) pts.push(new Vector3(x, y, z));
    return pts;
  }

  /** 見おろす 角度 deg（整数）で、どの 向きでも はみ出さない 近さ（向きには よらない ので 毎コマ ちかづいたり とおのいたり しない） */
  private fitAt(deg: number): number {
    const hit = this.fits.get(deg);
    if (hit !== undefined) return hit;
    const v = this.pt;
    const limit = 1 / PREVIEW.fitMargin;
    const fits = (dist: number): boolean => {
      for (let yaw = 0; yaw < 360; yaw += 15) {
        this.place(yaw, deg, dist, this.probe);
        for (const q of this.fitPts) {
          v.copy(q).project(this.probe);
          if (Math.abs(v.x) > limit || Math.abs(v.y) > limit) return false;
        }
      }
      return true;
    };
    let lo = 4;
    let hi = 400;
    for (let i = 0; i < 22; i++) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) hi = mid;
      else lo = mid;
    }
    this.fits.set(deg, hi);
    return hi;
  }

  /** 見おろす 角度が 小数でも なめらかに つながる ように、まわりの 整数の 角度の 近さを つないで 使う */
  private distFor(elevDeg: number): number {
    const lo = Math.floor(elevDeg);
    const f = elevDeg - lo;
    const a = this.fitAt(lo);
    return f < 1e-3 ? a : a + (this.fitAt(lo + 1) - a) * f;
  }

  // ------------------------------------------------------------ 描く

  /** かべ 4 まいの 高さ（なかの 見本: カメラに 近い かべは さがる）。0〜1 */
  private setWallHeights(yawDeg: number): void {
    const y = rad(yawDeg);
    const sx = Math.sin(y);
    const sz = Math.cos(y);
    for (const w of WALLS) {
      let h = 1;
      if (this.mode === 'inside') {
        const dot = sx * OUTWARD[w][0] + sz * OUTWARD[w][1];
        h = Math.min(1, Math.max(0, (PREVIEW.wallDropTo - dot) / (PREVIEW.wallDropTo - PREVIEW.wallDropFrom)));
      }
      const m = this.wallMesh[w];
      m.visible = h > 0.02;
      m.scale.y = Math.max(h, 0.001);
      m.position.y = 1 - h;
    }
  }

  /**
   * 1 コマ: 画面ぜんぶを 地の 色で ぬり、rect（見本の 穴）だけに 見本を 描く。rect が null なら 地の 色だけ（③ なまえ など）。
   * renderer の 状態（viewport・scissor・clear color）は もとに もどす。
   */
  draw(rect: ViewRect | null): void {
    const r = this.renderer;
    const k = this.keep;
    r.getClearColor(k.color);
    const keepAlpha = r.getClearAlpha();
    r.getViewport(k.viewport);
    r.getScissor(k.scissor);
    const keepTest = r.getScissorTest();
    const keepTarget = r.getRenderTarget();
    const size = r.getSize(k.size);
    r.setRenderTarget(null);
    r.setScissorTest(false);
    r.setViewport(0, 0, size.x, size.y);
    r.setClearColor(HOUSE_LOOK.screen, 1);
    r.clear(true, true, true);
    this.stats.drawCalls = 0;
    this.stats.triangles = 0;
    if (rect && rect.w > 4 && rect.h > 4 && this.parts && this.shown !== null) {
      const aspect = rect.w / rect.h;
      const fk = `${this.key}|${aspect.toFixed(3)}`;
      if (fk !== this.fitKey) {
        this.camera.aspect = aspect;
        this.camera.updateProjectionMatrix();
        this.probe.aspect = aspect;
        this.probe.updateProjectionMatrix();
        this.fits.clear();
        this.fitPts = this.fitPoints(this.parts);
        this.fitKey = fk;
      }
      const view = this.views[this.mode];
      this.place(view.yaw, view.elev, this.distFor(view.elev), this.camera);
      this.setWallHeights(view.yaw);
      const y0 = size.y - rect.y - rect.h;
      r.setViewport(rect.x, y0, rect.w, rect.h);
      r.setScissor(rect.x, y0, rect.w, rect.h);
      r.setScissorTest(true);
      r.setClearColor(HOUSE_LOOK.sky, 1);
      r.clear(true, true, true);
      r.render(this.scene, this.camera);
      this.stats.drawCalls = r.info.render.calls;
      this.stats.triangles = r.info.render.triangles;
      r.setScissorTest(false);
    }
    r.setRenderTarget(keepTarget);
    r.setViewport(k.viewport);
    r.setScissor(k.scissor);
    r.setScissorTest(keepTest);
    r.setClearColor(k.color, keepAlpha);
  }

  /** 家具 1 つの 絵。view ＝ 'iso'（ボタン用: ななめ上から。まわりを 切りとって 正方形）、'top'（方眼用: 真上から。1 マス 64px） */
  furnitureImage(kind: FurnKind | 'lantern', rot: Rot, view: 'iso' | 'top'): FurnImage {
    return this.icons.image(kind, rot, view);
  }

  dispose(): void {
    for (const m of [this.baseMesh, this.roofMesh, ...WALLS.map((w) => this.wallMesh[w])]) m.geometry.dispose();
    this.material.dispose();
    this.atlas.dispose();
  }
}
