// HOUSE-1B 試作: エディターの 見本（3D）。ゲームの レンダラー（game.renderer）で、画面の「穴」（HTML の 見本の 場所）に
// 切りぬいて 描く（2 つ目の WebGL を 作らない）。面は ゲームの 区の メッシュと 同じ 材料（MeshData → toGeometry）。
// 毎コマ: 画面ぜんぶを 地の 色で ぬる → 穴の 四角だけ viewport＋scissor で 空の 色に して 見本を 描く。
//   そと ＝ 屋根つき・低めの 角度、なか ＝ 屋根なし・50°・カメラに 近い かべが すっと さがる（ドールハウスの 切り口）。
import {
  Box3, BufferGeometry, Color, MeshBasicMaterial, Mesh, OrthographicCamera, PerspectiveCamera, Scene, Vector2, Vector3, Vector4, WebGLRenderTarget,
  type DataTexture, type WebGLRenderer,
} from 'three';
import { toGeometry } from '../../world/render/rendererGeometry';
import { createPreviewAtlas } from './atlas';
import { HOUSE_LOOK } from './houseLook';
import type { EditorState } from './model';
import { buildPreview, furnitureOnly, lanternOnly, type PreviewMode, type PreviewParts } from './previewMesh';
import { FURN_ART, K_LANTERN, PREVIEW, ROOF_Y, WALLS, type FurnKind, type Rot, type Wall } from './tuning';

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

/** 家具の 絵 1 まい ぶん（普通・置ける〔白っぽい〕・置けない〔赤〕） */
export interface FurnImage {
  normal: string;
  ok: string;
  ng: string;
  /** 絵の よこ・たて（px） */
  w: number;
  h: number;
}

const rad = (deg: number): number => (deg * Math.PI) / 180;
/** かべの 外向きの 向き（x, z） */
const OUTWARD: Readonly<Record<Wall, readonly [number, number]>> = { front: [0, 1], right: [1, 0], back: [0, -1], left: [-1, 0] };
/** 戸の 壁を まっすぐ 見る カメラの 向き（度） */
const WALL_YAW_DEG: Readonly<Record<Wall, number>> = { front: 0, right: 90, back: 180, left: 270 };
const TOP_PX_PER_CELL = FURN_ART.topPxPerCell;
const ICON_PX = FURN_ART.isoPx;

/** 8 ビットの 線形 → sRGB（アイコンを 画面と 同じ 色に する） */
const SRGB_LUT = Uint8ClampedArray.from({ length: 256 }, (_, i) => {
  const v = i / 255;
  return Math.round((v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055) * 255);
});

export class Preview3D {
  private readonly atlas: DataTexture = createPreviewAtlas();
  private readonly material = new MeshBasicMaterial({ map: this.atlas, vertexColors: true, alphaTest: 0.5 });
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(PREVIEW.fovDeg, 1, 0.5, 400);
  private readonly baseMesh = new Mesh(undefined, this.material);
  private readonly roofMesh = new Mesh(undefined, this.material);
  private readonly wallMesh: Record<Wall, Mesh> = {
    front: new Mesh(undefined, this.material),
    right: new Mesh(undefined, this.material),
    back: new Mesh(undefined, this.material),
    left: new Mesh(undefined, this.material),
  };
  private parts: PreviewParts | null = null;
  private key = '';
  private mode: PreviewMode = 'outside';
  private door: Wall = 'front';
  /** 回る 向きの もと（1 ステップ ＝ 1/60 秒で ＋1） */
  private frames = 0;
  /** テスト・GIF 用: 向きを 決めうち（度）。null ＝ ふつう */
  private yawOverride: number | null = null;
  private fitKey = '';
  private fitDist = 20;
  private readonly center = new Vector3();
  private readonly iconCache = new Map<string, FurnImage>();
  builds = 0;
  stats: PreviewStats = { drawCalls: 0, triangles: 0, builds: 0, faces: 0 };

  constructor(private readonly renderer: WebGLRenderer, private readonly reduced: () => boolean) {
    this.scene.add(this.baseMesh, this.roofMesh, ...WALLS.map((w) => this.wallMesh[w]));
    for (const m of [this.baseMesh, this.roofMesh, ...WALLS.map((w) => this.wallMesh[w])]) m.frustumCulled = false;
  }

  // ------------------------------------------------------------ 形

  /** せっけいずの 形・見せ方が かわって いたら 作りなおす（かわって いなければ 何も しない） */
  setShape(s: EditorState, mode: PreviewMode): void {
    const key = JSON.stringify([mode, s.w, s.d, s.windows, s.door, mode === 'inside' ? s.furniture : 0]);
    this.door = s.door;
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
    this.roofMesh.visible = mode === 'outside' && this.parts.hasHouse;
    for (const w of WALLS) {
      this.wallMesh[w].visible = this.parts.hasHouse;
      this.wallMesh[w].scale.y = 1;
      this.wallMesh[w].position.y = 0;
    }
    this.center.set(this.parts.w / 2, mode === 'outside' ? 2 : 1.5, this.parts.d / 2);
    this.fitKey = '';
  }

  /** 1 ステップ（1/60 秒）: 回る 向きを すすめる */
  tick(): void {
    this.frames++;
  }

  /** テスト・GIF 用: 回る コマ数を 決める（null で 向きの 決めうちを やめる）。向きは 度 */
  setFrame(frames: number): void {
    this.frames = frames;
  }
  setYaw(deg: number | null): void {
    this.yawOverride = deg;
  }

  /** いまの カメラの 向き（度。0 ＝ まえから、90 ＝ みぎから） */
  yawDeg(): number {
    if (this.yawOverride !== null) return this.yawOverride;
    if (this.reduced()) return WALL_YAW_DEG[this.door] + PREVIEW.stillYawDeg;
    return PREVIEW.stillYawDeg + (360 * this.frames) / PREVIEW.lapFrames;
  }

  // ------------------------------------------------------------ カメラ

  private elevRad(): number {
    return rad(this.mode === 'outside' ? PREVIEW.outsideElevDeg : PREVIEW.insideElevDeg);
  }

  private place(yawDeg: number, dist: number, cam: PerspectiveCamera): void {
    const e = this.elevRad();
    const y = rad(yawDeg);
    cam.position.set(this.center.x + dist * Math.sin(y) * Math.cos(e), this.center.y + dist * Math.sin(e), this.center.z + dist * Math.cos(y) * Math.cos(e));
    cam.lookAt(this.center);
    cam.updateMatrixWorld(true);
  }

  /** 家と 地面の 板が どの 向きでも はみ出さない 近さを さがす（毎コマ ちかづいたり とおのいたり しない） */
  private fit(): void {
    const p = this.parts;
    if (!p) return;
    const M = PREVIEW.groundMargin[this.mode];
    const top = this.mode === 'outside' ? ROOF_Y + 1 : ROOF_Y;
    const pts: Vector3[] = [];
    const xs = [-1 - M, p.w + 1 + M];
    const zs = [-1 - M, p.d + 1 + M];
    for (const x of xs) for (const z of zs) for (const y of [-1, 1]) pts.push(new Vector3(x, y, z));
    if (p.hasHouse) for (const x of [-1, p.w + 1]) for (const z of [-1, p.d + 1]) for (const y of [1, top]) pts.push(new Vector3(x, y, z));
    const probe = new PerspectiveCamera(PREVIEW.fovDeg, this.camera.aspect, 0.5, 400);
    probe.updateProjectionMatrix();
    const v = new Vector3();
    const limit = 1 / PREVIEW.fitMargin;
    const fits = (dist: number): boolean => {
      for (let yaw = 0; yaw < 360; yaw += 15) {
        this.place(yaw, dist, probe);
        for (const q of pts) {
          v.copy(q).project(probe);
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
    this.fitDist = hi;
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
    const keepColor = r.getClearColor(new Color());
    const keepAlpha = r.getClearAlpha();
    const keepViewport = r.getViewport(new Vector4());
    const keepScissor = r.getScissor(new Vector4());
    const keepTest = r.getScissorTest();
    const keepTarget = r.getRenderTarget();
    const size = r.getSize(new Vector2());
    r.setRenderTarget(null);
    r.setScissorTest(false);
    r.setViewport(0, 0, size.x, size.y);
    r.setClearColor(HOUSE_LOOK.screen, 1);
    r.clear(true, true, true);
    this.stats = { drawCalls: 0, triangles: 0, builds: this.builds, faces: this.stats.faces };
    if (rect && rect.w > 4 && rect.h > 4 && this.parts) {
      const aspect = rect.w / rect.h;
      const fk = `${this.key}|${aspect.toFixed(3)}`;
      if (fk !== this.fitKey) {
        this.camera.aspect = aspect;
        this.camera.updateProjectionMatrix();
        this.fit();
        this.fitKey = fk;
      }
      const yaw = this.yawDeg();
      this.place(yaw, this.fitDist, this.camera);
      const heights = this.wallHeights(yaw);
      for (const w of WALLS) {
        const m = this.wallMesh[w];
        const k = heights[w];
        m.visible = this.parts.hasHouse && k > 0.02;
        m.scale.y = Math.max(k, 0.001);
        m.position.y = 1 - k;
      }
      const y0 = size.y - rect.y - rect.h;
      r.setViewport(rect.x, y0, rect.w, rect.h);
      r.setScissor(rect.x, y0, rect.w, rect.h);
      r.setScissorTest(true);
      r.setClearColor(HOUSE_LOOK.sky, 1);
      r.clear(true, true, true);
      r.render(this.scene, this.camera);
      this.stats = { drawCalls: r.info.render.calls, triangles: r.info.render.triangles, builds: this.builds, faces: this.faceCount() };
      r.setScissorTest(false);
    }
    r.setRenderTarget(keepTarget);
    r.setViewport(keepViewport);
    r.setScissor(keepScissor);
    r.setScissorTest(keepTest);
    r.setClearColor(keepColor, keepAlpha);
  }

  private faceCount(): number {
    const p = this.parts;
    if (!p) return 0;
    return p.base.faceCount + p.roof.faceCount + WALLS.reduce((n, w) => n + p.walls[w].faceCount, 0);
  }

  // ------------------------------------------------------------ 家具の 絵（アイコン・方眼用）

  /** 家具 1 つの 絵。view ＝ 'iso'（ボタン用: ななめ上から。まわりを 切りとって 正方形）、'top'（方眼用: 真上から。1 マス 64px） */
  furnitureImage(kind: FurnKind | 'lantern', rot: Rot, view: 'iso' | 'top'): FurnImage {
    const key = `${kind}:${rot}:${view}`;
    const hit = this.iconCache.get(key);
    if (hit) return hit;
    const made = view === 'top' ? this.renderTop(kind, rot) : this.renderIso(kind);
    this.iconCache.set(key, made);
    return made;
  }

  private withTarget(w: number, h: number, draw: (r: WebGLRenderer) => void): Uint8ClampedArray {
    const r = this.renderer;
    const keepColor = r.getClearColor(new Color());
    const keepAlpha = r.getClearAlpha();
    const keepTarget = r.getRenderTarget();
    const keepTest = r.getScissorTest();
    const rt = new WebGLRenderTarget(w, h, { samples: 4 });
    r.setRenderTarget(rt);
    r.setScissorTest(false);
    r.setClearColor(0x000000, 0);
    r.clear(true, true, true);
    draw(r);
    const raw = new Uint8Array(w * h * 4);
    r.readRenderTargetPixels(rt, 0, 0, w, h, raw);
    r.setRenderTarget(keepTarget);
    r.setScissorTest(keepTest);
    r.setClearColor(keepColor, keepAlpha);
    rt.dispose();
    // 上下を ひっくりかえし、線形 → sRGB、半透明の ふち（乗算ずみ）を もとの 色に もどす
    const out = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const s = ((h - 1 - y) * w + x) * 4;
        const o = (y * w + x) * 4;
        const a = raw[s + 3]!;
        if (a === 0) continue;
        const k = 255 / a;
        out[o] = SRGB_LUT[Math.min(255, Math.round(raw[s]! * k))]!;
        out[o + 1] = SRGB_LUT[Math.min(255, Math.round(raw[s + 1]! * k))]!;
        out[o + 2] = SRGB_LUT[Math.min(255, Math.round(raw[s + 2]! * k))]!;
        out[o + 3] = a;
      }
    }
    return out;
  }

  private meshOf(kind: FurnKind | 'lantern', rot: Rot): { mesh: Mesh; w: number; d: number } {
    if (kind === K_LANTERN) return { mesh: new Mesh(toGeometry(lanternOnly()), this.material), w: 1, d: 1 };
    const f = furnitureOnly(kind, rot);
    return { mesh: new Mesh(toGeometry(f.mesh), this.material), w: f.w, d: f.d };
  }

  private renderTop(kind: FurnKind | 'lantern', rot: Rot): FurnImage {
    const { mesh, w, d } = this.meshOf(kind, rot);
    const W = w * TOP_PX_PER_CELL;
    const H = d * TOP_PX_PER_CELL;
    const scene = new Scene();
    scene.add(mesh);
    const cam = new OrthographicCamera(-w / 2, w / 2, d / 2, -d / 2, 0.1, 60);
    cam.up.set(0, 0, -1);
    cam.position.set(w / 2, 20, d / 2);
    cam.lookAt(w / 2, 0, d / 2);
    cam.updateMatrixWorld(true);
    const px = this.withTarget(W, H, (r) => r.render(scene, cam));
    mesh.geometry.dispose();
    return toImages(px, W, H, true);
  }

  private renderIso(kind: FurnKind | 'lantern'): FurnImage {
    const { mesh } = this.meshOf(kind, 0);
    const scene = new Scene();
    scene.add(mesh);
    mesh.geometry.computeBoundingBox();
    const box = mesh.geometry.boundingBox as Box3;
    const c = box.getCenter(new Vector3());
    const yaw = rad(32);
    const elev = rad(30);
    const dir = new Vector3(Math.sin(yaw) * Math.cos(elev), Math.sin(elev), Math.cos(yaw) * Math.cos(elev));
    const cam = new OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    cam.position.copy(c).addScaledVector(dir, 30);
    cam.lookAt(c);
    cam.updateMatrixWorld(true);
    // かどの 点を カメラの 右・上に 当てて、切りとる 大きさを きめる
    const right = new Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
    const up = new Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
    let half = 0.1;
    for (const x of [box.min.x, box.max.x]) {
      for (const y of [box.min.y, box.max.y]) {
        for (const z of [box.min.z, box.max.z]) {
          const rel = new Vector3(x, y, z).sub(c);
          half = Math.max(half, Math.abs(rel.dot(right)), Math.abs(rel.dot(up)));
        }
      }
    }
    half *= 1.06;
    cam.left = -half;
    cam.right = half;
    cam.top = half;
    cam.bottom = -half;
    cam.updateProjectionMatrix();
    const px = this.withTarget(ICON_PX, ICON_PX, (r) => r.render(scene, cam));
    mesh.geometry.dispose();
    return toImages(px, ICON_PX, ICON_PX);
  }

  dispose(): void {
    for (const m of [this.baseMesh, this.roofMesh, ...WALLS.map((w) => this.wallMesh[w])]) m.geometry.dispose();
    this.material.dispose();
    this.atlas.dispose();
  }
}

/** 絵の ふち（半透明でない 点の うち、まわり rim 点 いない に すきまが ある 点）。上から 見た 絵で 置ける・置けないの わくに 使う */
function rimOf(px: Uint8ClampedArray, w: number, h: number, rim: number): Uint8Array {
  const solid = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) solid[i] = px[i * 4 + 3]! > 8 ? 1 : 0;
  // 内がわへ rim 点 けずった 形（たて・よこの 2 回）
  const erode = (src: Uint8Array, horiz: boolean): Uint8Array => {
    const out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let keep = 1;
        for (let k = -rim; k <= rim && keep; k++) {
          const xx = horiz ? x + k : x;
          const yy = horiz ? y : y + k;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h || !src[yy * w + xx]) keep = 0;
        }
        out[y * w + x] = keep;
      }
    }
    return out;
  };
  const inner = erode(erode(solid, true), false);
  const ring = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) ring[i] = solid[i] && !inner[i] ? 1 : 0;
  return ring;
}

/** 同じ 絵を 3 つの 色で（普通・置ける〔白〕・置けない〔赤〕）。data URL。withRim ＝ 上から 見た 絵に 色の わくを つける */
function toImages(px: Uint8ClampedArray, w: number, h: number, withRim = false): FurnImage {
  const ring = withRim ? rimOf(px, w, h, FURN_ART.ghostRimPx) : null;
  const url = (mix: readonly [number, number, number] | null, amount: number): string => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d')!;
    const out = new Uint8ClampedArray(px);
    if (mix) {
      for (let i = 0; i < out.length; i += 4) {
        if (out[i + 3] === 0) continue;
        out[i] = out[i]! + (mix[0] - out[i]!) * amount;
        out[i + 1] = out[i + 1]! + (mix[1] - out[i + 1]!) * amount;
        out[i + 2] = out[i + 2]! + (mix[2] - out[i + 2]!) * amount;
      }
      if (ring) {
        for (let i = 0; i < w * h; i++) {
          if (!ring[i]) continue;
          out[i * 4] = mix[0];
          out[i * 4 + 1] = mix[1];
          out[i * 4 + 2] = mix[2];
          out[i * 4 + 3] = 255;
        }
      }
    }
    g.putImageData(new ImageData(out, w, h), 0, 0);
    return c.toDataURL('image/png');
  };
  return { normal: url(null, 0), ok: url(FURN_ART.ghostOk, FURN_ART.ghostOkMix), ng: url(FURN_ART.ghostNg, FURN_ART.ghostNgMix), w, h };
}
