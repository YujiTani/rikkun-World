// HOUSE-1B エディターの 見本（3D）。ゲームの レンダラー（game.renderer）で、画面の「穴」（HTML の 見本の 場所）に
// 切りぬいて 描く（2 つ目の WebGL を 作らない）。面は ゲームの 区の メッシュと 同じ 材料（MeshData → toGeometry）。
// 毎コマ: 画面ぜんぶを 地の 色で ぬる → 穴の 四角だけ viewport＋scissor で 空の 色に して 見本を 描く。
//   そと ＝ 屋根つき・低めの 角度、なか ＝ 屋根なし・50°・カメラがわ（手前）の かべは 引っこめず 白っぽい 半透明（ドールハウスの 切り口。ghostWall.ts）。
//   向き ＝ ゆっくり 自動で 回る・ドラッグ／wheel で 自分で まわす（view.ts）・窓を かえたら 135／225 へ 回って 光る、① に なったら 戸が 光る、
//   まどの ボタンに 手を おくと 窓が ぜんぶ 光る（glow.ts・glowMesh.ts）。形が かわった ときと 光りの はじまり・おわりだけ 作りなおす（builds）。
import {
  BufferGeometry, Color, Mesh, MeshBasicMaterial, PerspectiveCamera, Scene, Vector2, Vector3, Vector4,
  type DataTexture, type WebGLRenderer,
} from 'three';
import { HOUSE_LOOK } from '../../world/blocks/houseArt';
import { createAtlasTexture } from '../../world/blocks/textures';
import { toGeometry } from '../../world/render/rendererGeometry';
import type { FurnKind } from '../editor/furniture';
import { openingChange, plainFurniture, windowCells, type EditorState, type OpeningChange, type WindowCell } from '../editor/model';
import { ROOF_Y, WALLS, type Rot, type Wall } from '../editor/tuning';
import { FurnitureIcons, type FurnImage } from './furnitureIcons';
import { GhostWall, wallGhostLevels } from './ghostWall';
import { GlowCtl } from './glow';
import { GlowMeshes, doorSpot, windowSpot, type GlowSpot } from './glowMesh';
import { buildPreview, type PreviewMode, type PreviewParts } from './mesh';
import type { PreviewInfo, PreviewPort } from './port';
import { GLOW, PREVIEW } from './tuning';
import { ViewCtl, cueTarget } from './view';

export type { FurnImage, PreviewInfo, PreviewMode };

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

export class Preview3D implements PreviewPort {
  private readonly atlas: DataTexture = createAtlasTexture();
  private readonly material = new MeshBasicMaterial({ map: this.atlas, vertexColors: true, alphaTest: 0.5 });
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(PREVIEW.fovDeg, 1, 0.5, 400);
  private readonly probe = new PerspectiveCamera(PREVIEW.fovDeg, 1, 0.5, 400);
  private readonly baseMesh = new Mesh(undefined, this.material);
  private readonly roofMesh = new Mesh(undefined, this.material);
  /** かべ 4 まい（かべごとに 白っぽさ・透け方を かえられる 材料。形は 回しても 変えない） */
  private readonly ghosts: Record<Wall, GhostWall> = {
    front: new GhostWall(this.atlas),
    right: new GhostWall(this.atlas),
    back: new GhostWall(this.atlas),
    left: new GhostWall(this.atlas),
  };
  private readonly wallMesh: Record<Wall, Mesh> = {
    front: this.ghosts.front.mesh,
    right: this.ghosts.right.mesh,
    back: this.ghosts.back.mesh,
    left: this.ghosts.left.mesh,
  };
  /** 毎コマ 新しく 作らない ための 置き場（かべの 白っぽさ） */
  private readonly ghostLevels: Record<Wall, number> = { front: 0, right: 0, back: 0, left: 0 };
  private readonly icons: FurnitureIcons;
  private parts: PreviewParts | null = null;
  private key = '';
  private mode: PreviewMode = 'outside';
  /** 見る 向き（そと・なか それぞれ。見えて いない 間は すすまない。さわった 後の 向きは すすみを 行き来しても のこる。さわる 前は 見える たびに はじめの 向き） */
  private readonly views: Record<PreviewMode, ViewCtl> = {
    outside: new ViewCtl(PREVIEW.outsideElevDeg, PREVIEW.elevRangeDeg.outside, () => !this.reduced()),
    inside: new ViewCtl(PREVIEW.insideElevDeg, PREVIEW.elevRangeDeg.inside, () => !this.reduced()),
  };
  /** 最後に 見せた 見せ方（null ＝ 見せて いない。見せ方が かわったら 光りを 消し、さわって いない 向きは はじめに もどす） */
  private shown: PreviewMode | null = null;
  /** いま 押して いる 見本（はなす とき この 見本を はなす。押して いる 間に すすみが かわっても 手が のこらない）。null ＝ 押して いない */
  private pressed: PreviewMode | null = null;
  /** 窓・戸の 光りの 時間と 形（そとの 見本 だけ） */
  private readonly glow = new GlowCtl();
  private readonly glowMesh = new GlowMeshes();
  /** 今の 形の 窓（まどの ボタンに 手を おいた とき ぜんぶ 光らせる） */
  private cells: WindowCell[] = [];
  /** 前に 見た 窓（そと の 見本。かわった 窓を 見つける ため。null ＝ まだ 見て いない） */
  private open: Pick<EditorState, 'w' | 'd' | 'windows' | 'windowKind'> | null = null;
  private fitKey = '';
  /** その ときの 穴の よこ÷たて（数で くらべる。毎コマ 文字を 作らない） */
  private fitAspect = 0;
  private readonly fits = new Map<number, number>();
  private fitPts: Vector3[] = [];
  private readonly center = new Vector3();
  /** draw() の たびに 新しく 作らない ための 置き場 */
  private readonly keep = { color: new Color(), viewport: new Vector4(), scissor: new Vector4(), size: new Vector2() };
  private readonly pt = new Vector3();
  builds = 0;
  /** 見本に 出して いる 家具の 数（なかの 見本の 赤くない 家具。そとは 0。1E） */
  private shownFurniture = 0;
  stats: PreviewStats = { drawCalls: 0, triangles: 0 };

  constructor(private readonly renderer: WebGLRenderer, private readonly reduced: () => boolean) {
    this.icons = new FurnitureIcons(renderer, this.material);
    const meshes = [this.baseMesh, this.roofMesh, ...WALLS.map((w) => this.wallMesh[w])];
    this.scene.add(...meshes);
    this.glowMesh.addTo(this.scene);
    for (const m of meshes) m.frustumCulled = false;
  }

  // ------------------------------------------------------------ 形

  /**
   * 形・見せ方が かわって いたら 作りなおす（かわって いなければ 何も しない）。
   * 見せ方が かわった: 光りを 消し、さわって いない 向きは はじめに もどす。① に なったら 戸が 光る。① で 窓が かわって いたら 135／225 へ 回って 光る
   */
  setShape(s: EditorState, mode: PreviewMode): void {
    const entering = this.shown !== mode;
    this.shown = mode;
    if (entering) {
      this.views[mode].enter();
      this.glow.clear();
    }
    // 赤い 家具は 見本に 出さない ので、赤い 家具だけ ふえても 作りなおさない（1E）
    const plain = mode === 'inside' ? plainFurniture(s) : [];
    const key = JSON.stringify([mode, s.w, s.d, s.windows, s.windowKind, s.roof, plain]);
    if (key !== this.key) this.rebuild(s, mode, key, plain.length);
    if (mode === 'outside') this.trackOpenings(s, entering);
    else this.open = null;
  }

  private rebuild(s: EditorState, mode: PreviewMode, key: string, shown: number): void {
    this.key = key;
    this.mode = mode;
    this.shownFurniture = shown;
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
    for (const w of WALLS) this.ghosts[w].set(0);
    this.center.set(this.parts.w / 2, mode === 'outside' ? 2 : 1.5, this.parts.d / 2);
    this.fitKey = '';
    this.cells = mode === 'outside' ? windowCells(s) : [];
    if (this.glow.hovering) this.hoverShape(); // 手を おいた まま 窓が かわった: 光る 窓も あわせる（作りなおしの 数は ふやさない）
  }

  /** そとの 見本で 前に 見た 窓と くらべる。① に なった ばかりなら 戸が 光る。窓が かわって いたら 回って 光る。大きさが かわったら 出て いる 光りの 場所を あわせる */
  private trackOpenings(s: EditorState, entering: boolean): void {
    const was = this.open;
    this.open = { w: s.w, d: s.d, windows: s.windows, windowKind: s.windowKind };
    if (entering) {
      this.glowMesh.setCue([doorSpot(s)], s.w, s.d);
      this.glow.startDoor();
      this.builds++;
      return;
    }
    if (!was) return;
    const change = openingChange(was, this.open);
    if (change) this.startWindows(s, change);
    else if (was.w !== s.w || was.d !== s.d) {
      if (this.glow.door) this.glowMesh.setCue([doorSpot(s)], s.w, s.d);
      else if (this.glow.freezing) this.glow.dropCue(); // 窓の 光りは 大きさが かわったら 消す（家 ぜんたいが かわる）
    }
  }

  /** 窓が かわった: かわった 窓を 光らせ、135／225 の 近い ほうへ 回る（動きを へらす 設定では すぐ。光りは 同じ 長さ） */
  private startWindows(s: EditorState, change: OpeningChange): void {
    const reduced = this.reduced();
    const changed = [...change.added, ...change.removed];
    const spots: GlowSpot[] = [...change.added.map((c) => windowSpot(c, 1)), ...change.removed.map((c) => windowSpot(c, GLOW.removedLevel))];
    this.glowMesh.setCue(spots, s.w, s.d);
    this.glow.startWindows(changed, reduced ? 0 : GLOW.windowDelayFrames);
    const v = this.views.outside;
    v.turnTo(cueTarget(v.yaw), reduced ? 1 : PREVIEW.turnFrames);
    this.builds++;
  }

  /** まどの ボタンに 手を おいた／はなした（そとの 見本 だけ。回らない）。おいた 直後に 1 回 作る */
  hover(on: boolean): void {
    if (this.shown !== 'outside' || !this.glow.setHover(on)) return;
    if (on) {
      this.hoverShape();
      this.builds++;
    }
  }

  private hoverShape(): void {
    const p = this.parts;
    if (p) this.glowMesh.setHover(this.cells.map((c) => windowSpot(c, 1)), p.w, p.d);
  }

  /** 見本を 見せるのを やめた（③ なまえ）。光りは 消すが、向き・さわった 印は のこす（もどると つづき） */
  hide(): void {
    this.shown = null;
    this.glow.clear();
  }

  /** 見本を はじめに もどす（エディターを 開いた・ぜんぶ けした）。どちらの 向きも さわる 前に もどり、光りも 消える */
  restart(): void {
    for (const v of Object.values(this.views)) v.reset();
    this.pressed = null;
    this.shown = null;
    this.open = null;
    this.glow.clear();
  }

  // ------------------------------------------------------------ 向き・時間

  /** 1 ステップ（1/60 秒。ゲームの 時間が 止まって いても すすむ）。見せて いない 間は すすめない。窓が 光って いる 間は 自動で 回らない（wait は へる） */
  tick(): void {
    if (this.shown === null) return;
    this.views[this.shown].step(this.glow.freezing);
    if (this.glow.step()) {
      this.glowMesh.setCue([], 0, 0);
      this.builds++;
    }
  }

  /** 見えて いる 見本を まわす（ドラッグ・wheel）。押して いる 間は 600 コマの 数えを とめる。見えて いなければ false */
  press(): boolean {
    if (this.shown === null) return false;
    if (this.pressed !== null && this.pressed !== this.shown) this.release(); // 別の 見本を 押したまま だった（前の 手は はなす）
    this.pressed = this.shown;
    this.views[this.shown].press();
    return true;
  }

  /** 押した 見本を はなす（いま 見えて いる 見本とは かぎらない）。押して いなければ 何も しない */
  release(): void {
    const m = this.pressed;
    this.pressed = null;
    if (m !== null) this.views[m].release();
  }

  drag(dx: number, dy: number): boolean {
    if (this.shown === null) return false;
    this.views[this.shown].drag(dx, dy);
    return true;
  }

  wheel(dx: number, dy: number): boolean {
    if (this.shown === null) return false;
    this.views[this.shown].wheel(dx, dy);
    return true;
  }

  /** その 見せ方を 手で まわしたか（手の 印を 出すか） */
  touched(mode: PreviewMode): boolean {
    return this.views[mode].touched;
  }

  /** その 見せ方の ようす（窓口 `editor().preview` の 元）。yaw 0 ＝ まえから、90 ＝ みぎから */
  info(mode: PreviewMode): PreviewInfo {
    const v = this.views[mode];
    return { yaw: v.yaw, elev: v.elev, touched: v.touched, wait: v.wait, builds: this.builds, furniture: this.shownFurniture, glow: this.shown === mode && mode === 'outside' ? this.glow.info(this.cells) : null };
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
      if (this.key !== this.fitKey || Math.abs(aspect - this.fitAspect) >= 5e-4) {
        this.camera.aspect = aspect;
        this.camera.updateProjectionMatrix();
        this.probe.aspect = aspect;
        this.probe.updateProjectionMatrix();
        this.fits.clear();
        this.fitPts = this.fitPoints(this.parts);
        this.fitKey = this.key;
        this.fitAspect = aspect;
      }
      const view = this.views[this.mode];
      this.place(view.yaw, view.elev, this.distFor(view.elev), this.camera);
      wallGhostLevels(view.yaw, this.mode, this.ghostLevels);
      for (const w of WALLS) this.ghosts[w].set(this.ghostLevels[w]);
      const reduced = this.reduced();
      this.glowMesh.setLevels(this.glow.cueNow(reduced), this.glow.hoverNow(reduced), this.mode === 'outside');
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
    for (const m of [this.baseMesh, this.roofMesh]) m.geometry.dispose();
    for (const w of WALLS) this.ghosts[w].dispose();
    this.glowMesh.dispose();
    this.material.dispose();
    this.atlas.dispose();
  }
}
