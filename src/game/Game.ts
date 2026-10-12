import * as THREE from 'three';
import { ActionState } from '../input/actions';
import { FrameStats } from '../debug/frameStats';

/** ゲームの更新は 1/60 秒きざみ（固定）。テストで同じ結果を再現しやすくするため。 */
export const FIXED_DT = 1 / 60;
/** 処理落ちしても 1 フレームで追いつく更新回数の上限 */
const MAX_STEPS_PER_FRAME = 5;

export interface RenderStats {
  fps: number;
  frameMsAvg: number;
  frameMsWorst: number;
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
}

export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly input = new ActionState();
  readonly frameStats = new FrameStats();

  /** 更新した回数（固定ステップ単位） */
  tick = 0;
  /** true のとき自動では進まない（テスト用。step() で進める） */
  paused = false;

  private accumulator = 0;
  private lastTime = 0;
  private rafId = 0;
  private readonly updaters: Array<(dt: number) => void> = [];

  constructor(private readonly container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(70, container.clientWidth / container.clientHeight, 0.1, 500);
    this.scene.background = new THREE.Color(0x87ceeb);

    window.addEventListener('resize', this.onResize);
  }

  /** 毎ステップ呼ばれる処理を登録する */
  onUpdate(fn: (dt: number) => void): void {
    this.updaters.push(fn);
  }

  start(): void {
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this.frame);
  }

  stop(): void {
    cancelAnimationFrame(this.rafId);
    window.removeEventListener('resize', this.onResize);
  }

  /** 決まった回数だけ更新して描画する（テスト用） */
  step(count = 1): void {
    for (let i = 0; i < count; i++) this.update();
    this.render();
  }

  getRenderStats(): RenderStats {
    const info = this.renderer.info;
    return {
      fps: this.frameStats.fps,
      frameMsAvg: this.frameStats.averageMs,
      frameMsWorst: this.frameStats.worstMs,
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
    };
  }

  private readonly frame = (now: number) => {
    this.rafId = requestAnimationFrame(this.frame);
    const elapsed = now - this.lastTime;
    this.lastTime = now;
    if (this.paused) return;

    const start = performance.now();
    this.accumulator = Math.min(this.accumulator + elapsed / 1000, FIXED_DT * MAX_STEPS_PER_FRAME);
    while (this.accumulator >= FIXED_DT) {
      this.update();
      this.accumulator -= FIXED_DT;
    }
    this.render();
    this.frameStats.add(Math.max(elapsed, performance.now() - start));
  };

  private update(): void {
    for (const fn of this.updaters) fn(FIXED_DT);
    this.input.endFrame();
    this.tick++;
  }

  private render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  private readonly onResize = () => {
    const { clientWidth: w, clientHeight: h } = this.container;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };
}
