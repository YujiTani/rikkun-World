// HOUSE-1B 試作: エディターの 見本（3D）。ゲームの レンダラー（game.renderer）で、画面の「穴」（HTML の 見本の 場所）に
// 切りぬいて 描く（2 つ目の WebGL を 作らない）。面は ゲームの 区の メッシュと 同じ 材料（MeshData → toGeometry）。
// 毎コマ: 画面ぜんぶを 地の 色で ぬる → 穴の 四角だけ viewport＋scissor で 空の 色に して 見本を 描く。
//   そと ＝ 屋根つき・低めの 角度、なか ＝ 屋根なし・50°・カメラに 近い かべが すっと さがる（ドールハウスの 切り口）。
//   向き ＝ ふれる 前は ゆっくり 回る・ドラッグで 自分で きめる・窓が かわったら その かべへ なめらかに 回って 窓が ぴかっ（previewView.ts・previewGlow.ts）。
import {
  BufferGeometry, Color, Mesh, MeshBasicMaterial, PerspectiveCamera, Scene, Vector2, Vector3, Vector4,
  type DataTexture, type WebGLRenderer,
} from 'three';
import { toGeometry } from '../../world/render/rendererGeometry';
import { createPreviewAtlas } from './atlas';
import { FurnitureIcons, type FurnImage } from './furnitureIcons';
import { HOUSE_LOOK } from './houseLook';
import { openingChange, windowCells, type EditorState } from './model';
import { cueLevel, GlowMeshes, hoverWave, type GlowCell } from './previewGlow';
import { buildPreview, type PreviewMode, type PreviewParts } from './previewMesh';
import { OUTWARD, pickView, ViewCtl, type ViewTarget } from './previewView';
import { GLOW, PREVIEW, ROOF_Y, WALLS, type FurnKind, type Rot, type Wall } from './tuning';

export type { FurnImage };

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
  /** 形を 作りなおした 回数（形が かわった ときだけ） */
  builds: number;
  /** 区の メッシュの 面の 数（四角） */
  faces: number;
}

const rad = (deg: number): number => (deg * Math.PI) / 180;
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
type OpenKey = Pick<EditorState, 'w' | 'd' | 'windows' | 'windowKind'>;

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
  private readonly glow = new GlowMeshes();
  private readonly icons: FurnitureIcons;
  private parts: PreviewParts | null = null;
  private key = '';
  private mode: PreviewMode = 'outside';
  /** 見る 向き（そと・なか それぞれ。形が かわっても 向きは そのまま） */
  private readonly views: Record<PreviewMode, ViewCtl> = {
    outside: new ViewCtl(PREVIEW.outsideElevDeg),
    inside: new ViewCtl(PREVIEW.insideElevDeg),
  };
  /** 前に 見た 窓（かわった 窓を 見つける ため。null ＝ まだ 見て いない） */
  private lastOpen: OpenKey | null = null;
  /** 窓を かえた ぴかっ（t ＝ はじまってからの コマ数。null ＝ ない） */
  private cue: { t: number } | null = null;
  /** まどの ボタンに 手を おいて いる（hoverK ＝ 光の ふえ・へり 0〜1、hoverT ＝ ゆらぎの コマ数） */
  private hoverOn = false;
  private hoverK = 0;
  private hoverT = 0;
  /** テスト・GIF 用: true の 間は ゲームの 時間では すすめず、advance() で すすめる */
  private manual = false;
  private fitKey = '';
  private readonly fits = new Map<number, number>();
  private fitPts: Vector3[] = [];
  private readonly center = new Vector3();
  /** draw() の たびに 新しく 作らない ための 置き場 */
  private readonly keep = { color: new Color(), viewport: new Vector4(), scissor: new Vector4(), size: new Vector2() };
  builds = 0;
  stats: PreviewStats = { drawCalls: 0, triangles: 0, builds: 0, faces: 0 };

  constructor(private readonly renderer: WebGLRenderer, private readonly reduced: () => boolean) {
    this.icons = new FurnitureIcons(renderer, this.material);
    this.scene.add(this.baseMesh, this.roofMesh, ...WALLS.map((w) => this.wallMesh[w]));
    this.glow.addTo(this.scene);
    for (const m of [this.baseMesh, this.roofMesh, ...WALLS.map((w) => this.wallMesh[w])]) m.frustumCulled = false;
  }

  // ------------------------------------------------------------ 形

  /** せっけいずの 形・見せ方が かわって いたら 作りなおす（かわって いなければ 何も しない）。窓が かわって いたら ぴかっを はじめる */
  setShape(s: EditorState, mode: PreviewMode): void {
    if (mode === 'outside') this.trackWindows(s);
    else this.cue = null;
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
    this.glow.setHover(windowCells(s), s.w, s.d);
    this.center.set(this.parts.w / 2, mode === 'outside' ? 2 : 1.5, this.parts.d / 2);
    this.fitKey = '';
  }

  /** 前に 見た ときと くらべて 窓が かわって いたら、その かべが 見える 向きへ 回り、かわった 窓を ぴかっと させる */
  private trackWindows(s: EditorState): void {
    const now: OpenKey = { w: s.w, d: s.d, windows: s.windows, windowKind: s.windowKind };
    const change = this.lastOpen ? openingChange(this.lastOpen, now) : null;
    this.lastOpen = now;
    if (!change) return;
    const cells: GlowCell[] = [
      ...change.added.map((cell) => ({ cell, k: 1 })),
      ...change.removed.map((cell) => ({ cell, k: GLOW.removedLevel })),
    ];
    const targets: ViewTarget[] = [
      ...change.added.map((c) => ({ wall: c.wall, weight: 1 })),
      ...change.removed.map((c) => ({ wall: c.wall, weight: GLOW.removedWeight })),
    ];
    this.glow.setCue(cells, s.w, s.d);
    const v = this.views.outside;
    const to = pickView(v, targets);
    v.turnTo(to.yaw, to.elev, this.reduced() ? 1 : PREVIEW.turnFrames, GLOW.cueDelayFrames + GLOW.cueFrames);
    this.cue = { t: 0 };
  }

  // ------------------------------------------------------------ 向き・時間

  /** 1 ステップ（1/60 秒。ゲームの 時間）。manual の 間は すすめない */
  tick(): void {
    if (!this.manual) this.step();
  }

  private step(): void {
    this.views[this.mode].step(!this.reduced());
    if (this.cue && ++this.cue.t > GLOW.cueDelayFrames + GLOW.cueFrames) this.cue = null;
    this.hoverK = clamp01(this.hoverK + (this.hoverOn ? 1 / GLOW.riseFrames : -1 / GLOW.fadeFrames));
    this.hoverT = this.hoverK > 0 || this.hoverOn ? this.hoverT + 1 : 0;
  }

  /** ドラッグ（px。よこ ＝ 家の まわり、たて ＝ 見おろす 角度）。さわった 向きの まま 止まる */
  dragBy(dx: number, dy: number): void {
    this.views[this.mode].drag(dx, dy);
  }

  /** まどの ボタンに 手を おいて いる 間 ＝ 見本の 窓を ぜんぶ 光らせる（そと だけ） */
  setHover(on: boolean): void {
    this.hoverOn = on;
  }

  /** はじめの 向きに もどす（エディターを ひらいた とき・あたらしい せっけいず）。そとの 見本は まえ（戸の 見える 向き）から 回りはじめる */
  resetView(): void {
    for (const v of Object.values(this.views)) v.reset();
    this.lastOpen = null;
    this.cue = null;
    this.hoverOn = false;
    this.hoverK = 0;
  }

  /** テスト・GIF 用 */
  setManualClock(on: boolean): void {
    this.manual = on;
  }
  advance(frames: number): void {
    for (let i = 0; i < frames; i++) this.step();
  }
  setView(v: { yaw?: number; elev?: number; touched?: boolean }, mode: PreviewMode = this.mode): void {
    const c = this.views[mode];
    if (v.yaw !== undefined) c.yaw = ((v.yaw % 360) + 360) % 360;
    if (v.elev !== undefined) c.elev = v.elev;
    if (v.touched !== undefined) c.touched = v.touched;
  }
  /** いまの 見る 向き（度。yaw 0 ＝ まえから、90 ＝ みぎから）と ぴかっの 強さ */
  viewState(): { mode: PreviewMode; yaw: number; elev: number; touched: boolean; turning: boolean; cue: number; hover: number } {
    const v = this.views[this.mode];
    return { mode: this.mode, yaw: v.yaw, elev: v.elev, touched: v.touched, turning: v.turning, cue: this.cueNow(), hover: this.hoverNow() };
  }

  private cueNow(): number {
    return this.cue ? cueLevel(this.cue.t, this.reduced()) : 0;
  }
  private hoverNow(): number {
    return this.hoverK * hoverWave(this.hoverT, this.reduced());
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

  /** 見おろす 角度 deg（整数）で、どの 向きでも はみ出さない 近さ（毎コマ ちかづいたり とおのいたり しない ように 向きには よらない） */
  private fitAt(deg: number): number {
    const hit = this.fits.get(deg);
    if (hit !== undefined) return hit;
    const v = new Vector3();
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
  private wallHeights(yawDeg: number): Record<Wall, number> {
    const y = rad(yawDeg);
    const cam = [Math.sin(y), Math.cos(y)] as const;
    const out = {} as Record<Wall, number>;
    for (const w of WALLS) {
      if (this.mode === 'outside') {
        out[w] = 1;
        continue;
      }
      const dot = cam[0] * OUTWARD[w][0] + cam[1] * OUTWARD[w][1];
      out[w] = Math.min(1, Math.max(0, (PREVIEW.wallDropTo - dot) / (PREVIEW.wallDropTo - PREVIEW.wallDropFrom)));
    }
    return out;
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
    this.stats.builds = this.builds;
    if (rect && rect.w > 4 && rect.h > 4 && this.parts) {
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
      const heights = this.wallHeights(view.yaw);
      for (const w of WALLS) {
        const m = this.wallMesh[w];
        const h = heights[w];
        m.visible = h > 0.02;
        m.scale.y = Math.max(h, 0.001);
        m.position.y = 1 - h;
      }
      this.glow.setLevels(this.cueNow(), this.hoverNow(), this.mode === 'outside');
      const y0 = size.y - rect.y - rect.h;
      r.setViewport(rect.x, y0, rect.w, rect.h);
      r.setScissor(rect.x, y0, rect.w, rect.h);
      r.setScissorTest(true);
      r.setClearColor(HOUSE_LOOK.sky, 1);
      r.clear(true, true, true);
      r.render(this.scene, this.camera);
      this.stats.drawCalls = r.info.render.calls;
      this.stats.triangles = r.info.render.triangles;
      this.stats.faces = this.faceCount();
      r.setScissorTest(false);
    }
    r.setRenderTarget(keepTarget);
    r.setViewport(k.viewport);
    r.setScissor(k.scissor);
    r.setScissorTest(keepTest);
    r.setClearColor(k.color, keepAlpha);
  }

  private faceCount(): number {
    const p = this.parts;
    if (!p) return 0;
    return p.base.faceCount + p.roof.faceCount + WALLS.reduce((n, w) => n + p.walls[w].faceCount, 0);
  }

  /** 家具 1 つの 絵。view ＝ 'iso'（ボタン用: ななめ上から。まわりを 切りとって 正方形）、'top'（方眼用: 真上から。1 マス 64px） */
  furnitureImage(kind: FurnKind | 'lantern', rot: Rot, view: 'iso' | 'top'): FurnImage {
    return this.icons.image(kind, rot, view);
  }

  dispose(): void {
    for (const m of [this.baseMesh, this.roofMesh, ...WALLS.map((w) => this.wallMesh[w])]) m.geometry.dispose();
    this.glow.dispose();
    this.material.dispose();
    this.atlas.dispose();
  }
}
