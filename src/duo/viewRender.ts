import * as THREE from 'three';
import type { Rect, ViewRects } from './viewRects';

/**
 * COOP-1 作業 2（#399）: 画面を 1 回の コマで 2 つの 区画に 描く（§2.3・§7）。renderer の viewport / scissor で 同じ キャンバスの 一部だけに 描く。
 *   'one'    全面を 1 回（ここは 使わない: Game が ふつうに 描く）
 *   'loupe'  全面（1P）＋ 2P の 丸い 小窓（レンダーターゲットに 描いて 丸く 切りぬいた 絵を はる）
 *   'split'  左半分（1P）＋ 右半分（2P）
 * 描画回数・三角形は 区画ぶん ためて 数える（renderer.info.autoReset を 一時的に 切る）。
 */
export interface DuoDrawState {
  /** 描く 区画（DuoViews が ステップごとに 決める。CSS px） */
  rc: ViewRects;
  /** ルーペに 描く 範囲（カメラから この 距離より 遠くは 描かない） */
  loupeFar: number;
}

export class DuoViewRenderer {
  /** 2P の 区画を 描く カメラ（位置・向きは 呼ぶ 側が 決める） */
  readonly camera2 = new THREE.PerspectiveCamera(70, 1, 0.1, 500);
  private rt: THREE.WebGLRenderTarget | null = null;
  private rtSize = 0;
  private readonly quadScene = new THREE.Scene();
  private readonly quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private quad: THREE.Mesh | null = null;
  private readonly sz = new THREE.Vector2();

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene,
    private readonly mainCamera: THREE.PerspectiveCamera,
  ) {}

  /** ルーペの 切りぬきの 丸（アルファ）。ひとつだけ 作る */
  private ensureQuad(): THREE.Mesh {
    if (this.quad) return this.quad;
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    g.fillStyle = '#000';
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#fff';
    g.beginPath();
    g.arc(64, 64, 64, 0, Math.PI * 2);
    g.fill();
    const mask = new THREE.CanvasTexture(c);
    const mat = new THREE.MeshBasicMaterial({ alphaMap: mask, alphaTest: 0.5, toneMapped: false, depthTest: false, depthWrite: false });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
    return this.quad;
  }

  private ensureRt(px: number): THREE.WebGLRenderTarget {
    const n = Math.max(16, Math.round(px));
    if (this.rt === null || this.rtSize !== n) {
      this.rt?.dispose();
      this.rt = new THREE.WebGLRenderTarget(n, n, { type: THREE.HalfFloatType, depthBuffer: true });
      this.rtSize = n;
      ((this.ensureQuad() as THREE.Mesh).material as THREE.MeshBasicMaterial).map = this.rt.texture;
      ((this.quad as THREE.Mesh).material as THREE.MeshBasicMaterial).needsUpdate = true;
    }
    return this.rt;
  }

  /** 1 コマ ぶんを 描く（'one' で 切りかえも 終わった ときは 呼ばない） */
  render(st: DuoDrawState): void {
    const r = this.renderer;
    r.getSize(this.sz);
    const W = this.sz.x;
    const H = this.sz.y;
    const rc = st.rc;
    const main = this.mainCamera;
    const aspect0 = main.aspect;
    const far2 = this.camera2.far;
    const info = r.info;
    const autoReset = info.autoReset;
    info.autoReset = false;
    info.reset();
    r.setScissorTest(true);

    this.pane(rc.main);
    main.aspect = rc.main.w / Math.max(1, rc.main.h);
    main.updateProjectionMatrix();
    r.render(this.scene, main);
    main.aspect = aspect0;
    main.updateProjectionMatrix();

    const b = rc.second;
    if (b !== null) {
      const cam2 = this.camera2;
      cam2.aspect = b.w / Math.max(1, b.h);
      if (rc.circle) cam2.far = st.loupeFar;
      cam2.updateProjectionMatrix();
      if (rc.circle) {
        const pr = r.getPixelRatio();
        const rt = this.ensureRt(Math.min(b.w, b.h) * pr);
        cam2.aspect = 1;
        cam2.updateProjectionMatrix();
        r.setScissorTest(false);
        r.setRenderTarget(rt);
        const ca = r.getClearAlpha();
        r.setClearAlpha(1); // 絵の ない ところも 透けない ように（丸で 切りぬくのは アルファ マップだけ）
        r.render(this.scene, cam2);
        r.setClearAlpha(ca);
        r.setRenderTarget(null);
        r.setScissorTest(true);
        this.pane(b);
        const auto = r.autoClear;
        r.autoClear = false;
        r.render(this.quadScene, this.quadCam);
        r.autoClear = auto;
      } else {
        this.pane(b);
        r.render(this.scene, cam2);
      }
      cam2.far = far2;
      cam2.updateProjectionMatrix();
    }
    r.setScissorTest(false);
    r.setViewport(0, 0, W, H);
    info.autoReset = autoReset;
  }

  /** viewport と scissor を 区画に 合わせる（CSS px。y は 下から） */
  private pane(b: Rect): void {
    const r = this.renderer;
    r.getSize(this.sz);
    const y = this.sz.y - b.y - b.h;
    r.setViewport(b.x, y, b.w, b.h);
    r.setScissor(b.x, y, b.w, b.h);
  }

  dispose(): void {
    this.rt?.dispose();
    this.rt = null;
    if (this.quad) {
      this.quad.geometry.dispose();
      (this.quad.material as THREE.MeshBasicMaterial).dispose();
    }
  }
}
