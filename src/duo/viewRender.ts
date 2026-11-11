import * as THREE from 'three';
import type { Rect, ViewRects } from './viewRects';

/**
 * COOP-1 作業 2（#399）・3e（#422。1.8）: 2P が いる あいだ、画面を 1 回の コマで 左右 2 つの 区画に 描く（§2.3・§7）。
 * renderer の viewport / scissor で 同じ キャンバスの 一部だけに 描く（左半分 = 1P、右半分 = 2P）。1 人の ときは 使わない: Game が ふつうに 描く。
 * 描画回数・三角形は 区画ぶん ためて 数える（renderer.info.autoReset を 一時的に 切る）。
 */
export interface DuoDrawState {
  /** 描く 区画（DuoViews が ステップごとに 決める。CSS px） */
  rc: ViewRects;
  /** かすみの far を この 距離までに する（輪が 2 つのとき 描く 範囲に 合わせる）。null = かえない */
  fogFar: number | null;
}

export class DuoViewRenderer {
  /** 2P の 区画を 描く カメラ（位置・向きは 呼ぶ 側が 決める） */
  readonly camera2 = new THREE.PerspectiveCamera(70, 1, 0.1, 500);
  /** かすみを 区画ごとに かえる とき 元の 値を 覚える */
  private fogNear0 = 0;
  private fogFar0 = 0;
  private readonly sz = new THREE.Vector2();

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene,
    private readonly mainCamera: THREE.PerspectiveCamera,
    /**
     * 区画を 描く 前に 呼ぶ（キャラの 板を その カメラへ 向ける。キャラの 板は 区画ごとに 向きが ちがう）。
     * COOP-1 5f-2: who（1P の 区画 = 1・2P の 区画 = 2）と 区画の 矩形も わたす。この とき カメラの aspect は もう 区画の はば / 高さ（妖怪の 名札などを 区画ごとに 投げる）
     */
    private readonly beforePane: (cam: THREE.Camera, who: 1 | 2, pane: Rect) => void,
    /**
     * 各区画の 世界の 描画の すぐ あとに 呼ぶ（同じ viewport・scissor の 中。COOP-1 4d-2: 雷の 板を その 区画に 重ねる）。
     * 2 人の ときは 全面の 光の 道を 通らない ので、世界の 中に 出る 雷は ここで 描く
     */
    private readonly afterPane: (cam: THREE.Camera, who: 1 | 2, pane: Rect) => void,
  ) {}

  /** 1 コマ ぶんを 描く（1 人の 全面で 切りかえも 終わった ときは 呼ばない） */
  render(st: DuoDrawState): void {
    const r = this.renderer;
    r.getSize(this.sz);
    const W = this.sz.x;
    const H = this.sz.y;
    const rc = st.rc;
    const main = this.mainCamera;
    const aspect0 = main.aspect;
    const fog = this.scene.fog instanceof THREE.Fog ? this.scene.fog : null;
    if (fog) {
      this.fogNear0 = fog.near;
      this.fogFar0 = fog.far;
    }
    const info = r.info;
    const autoReset = info.autoReset;
    info.autoReset = false;
    info.reset();
    r.setScissorTest(true);

    this.fogTo(fog, st.fogFar);
    this.pane(rc.main);
    main.aspect = rc.main.w / Math.max(1, rc.main.h);
    main.updateProjectionMatrix();
    this.beforePane(main, 1, rc.main);
    r.render(this.scene, main);
    this.afterPane(main, 1, rc.main);
    main.aspect = aspect0;
    main.updateProjectionMatrix();

    const b = rc.second;
    if (b !== null) {
      const cam2 = this.camera2;
      cam2.aspect = b.w / Math.max(1, b.h);
      cam2.updateProjectionMatrix();
      this.beforePane(cam2, 2, b);
      this.pane(b);
      r.render(this.scene, cam2);
      this.afterPane(cam2, 2, b);
    }
    if (fog) {
      fog.near = this.fogNear0;
      fog.far = this.fogFar0;
    }
    r.setScissorTest(false);
    r.setViewport(0, 0, W, H);
    info.autoReset = autoReset;
  }

  /** かすみの far を 描く 範囲に 合わせる（null = もとの まま）。近い 側も 比で 縮める */
  private fogTo(fog: THREE.Fog | null, far: number | null): void {
    if (!fog) return;
    if (far === null || far >= this.fogFar0) {
      fog.near = this.fogNear0;
      fog.far = this.fogFar0;
      return;
    }
    fog.far = far;
    fog.near = Math.min(this.fogNear0, far * (this.fogNear0 / Math.max(1, this.fogFar0)));
  }

  /** viewport と scissor を 区画に 合わせる（CSS px。y は 下から） */
  private pane(b: Rect): void {
    const r = this.renderer;
    r.getSize(this.sz);
    const y = this.sz.y - b.y - b.h;
    r.setViewport(b.x, y, b.w, b.h);
    r.setScissor(b.x, y, b.w, b.h);
  }
}
