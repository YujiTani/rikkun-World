import * as THREE from 'three';
import { ActionState } from '../input/actions';
import { stableOpaqueSort, stableTransparentSort } from '../world/render/drawOrder';
import { FrameStats } from '../debug/frameStats';
import { createStepClock, MAX_STEPS_PER_FRAME } from './stepClock';

/** ゲームの更新は 1/60 秒きざみ（固定）。テストで同じ結果を再現しやすくするため。 */
export const FIXED_DT = 1 / 60;

export interface RenderStats {
  fps: number;
  frameMsAvg: number;
  frameMsWorst: number;
  drawCalls: number;
  triangles: number;
  /** 点の 描画の 数（three の info.render.points。土と 草の つぶ・手もとの 光） */
  points: number;
  geometries: number;
  textures: number;
  /** 世界の renderer が 描いた 累計の 回数（three の info.render.frame。本が 出ている 間は ふえない） */
  frames: number;
}

/**
 * 世界の 上に のる 画面（BOOK-1 の 本）。active の 間は 世界の 更新も 描画も しない
 * （景色は 最後の 1 まいが 残る。時間も 進まない）。tick は 1/60 秒で 呼ばれ、render は 本の 絵だけを 描く。
 */
export interface GameModal {
  active(): boolean;
  tick(): void;
  render(): void;
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
  /** true のあいだは 絵を描かない（テスト用: 画面の文字だけ見るテストを 機械の速さに よらなくする） */
  renderSuspended = false;
  private renderDirty = false;

  private readonly clock = createStepClock();
  private lastTime = 0;
  private rafId = 0;
  private readonly updaters: Array<(dt: number) => void> = [];
  private readonly idleUpdaters: Array<(dt: number) => void> = [];
  /** 描く直前に呼ぶ処理（#144 影の試作: 影の地図を先に描く） */
  private readonly preRenders: Array<() => void> = [];
  private realtimeGate: () => boolean = () => true;
  /** 止まっている間の絵がもう描いてあるか（変化がないコマは描き直さない） */
  private idleDrawn = false;
  private timeScale: () => number = () => 1;
  private modal: GameModal | null = null;
  private modalAcc = 0;
  /** 本が 出ている 間に 画面の 大きさが かわって、世界の 絵が きえた */
  private worldStale = false;
  private worldPass: { active(): boolean; render(r: THREE.WebGLRenderer, s: THREE.Scene, c: THREE.PerspectiveCamera): void } | null = null;

  constructor(private readonly container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    // 描く順番を セクションの場所で決める（機械の速さで つなぎ目の 1 ピクセルが かわらないように）
    this.renderer.setOpaqueSort(stableOpaqueSort);
    this.renderer.setTransparentSort(stableTransparentSort);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(70, container.clientWidth / container.clientHeight, 0.1, 500);

    window.addEventListener('resize', this.onResize);
  }

  /** 毎ステップ呼ばれる処理を登録する */
  onUpdate(fn: (dt: number) => void): void {
    this.updaters.push(fn);
  }

  /**
   * 実時間のゲームループを進めてよいか（M1-02 §2.4）。false の間は更新しない（描画は続ける）。
   * step() にはかかわらない。
   */
  setRealtimeGate(fn: () => boolean): void {
    this.realtimeGate = fn;
  }

  /** 実時間の進む速さの倍率（もちもの画面で 0.25 など）。step() には関係しない */
  setTimeScale(fn: () => number): void {
    this.timeScale = fn;
  }

  /** 世界の 上に のる 画面（本）を 1 つ 決める */
  setModal(m: GameModal): void {
    this.modal = m;
  }

  /** ART-PIPE-1（試作）: 落雷の 間だけ 世界を 絵に 描く 道（深さを 読む 雷・まわりを 明るく） */
  setWorldPass(p: { active(): boolean; render(r: THREE.WebGLRenderer, s: THREE.Scene, c: THREE.PerspectiveCamera): void }): void {
    this.worldPass = p;
  }

  private drawWorld(): void {
    const wp = this.worldPass;
    if (wp && wp.active()) wp.render(this.renderer, this.scene, this.camera);
    else this.renderer.render(this.scene, this.camera);
  }

  /** 描く直前（renderer.render の前）に毎回呼ばれる処理（#144 影の試作） */
  onBeforeRender(fn: () => void): void {
    this.preRenders.push(fn);
  }

  /** 実時間のループが止まっている間も毎コマ呼ばれる処理（F3 の性能表示など） */
  onIdle(fn: (dt: number) => void): void {
    this.idleUpdaters.push(fn);
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
    this.idleDrawn = false;
    for (let i = 0; i < count; i++) this.update();
    // 描画はまとめる: step を何千回も呼ぶテストで毎回描かない。
    // 次のコマ（一時停止中でも）か getRenderStats() で、たまっていれば 1 回だけ描く
    this.renderDirty = true;
  }

  /** step() で描かずにためた分があれば、いま 1 回描く */
  flushRender(): void {
    if (!this.renderDirty) return;
    this.renderDirty = false;
    this.render();
  }

  /** いま 1 回 描く（テスト用: 画素を読む前に最新の絵にする） */
  renderNow(): void {
    this.render();
  }

  getRenderStats(): RenderStats {
    this.flushRender();
    const info = this.renderer.info;
    return {
      fps: this.frameStats.fps,
      frameMsAvg: this.frameStats.averageMs,
      frameMsWorst: this.frameStats.worstMs,
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      points: info.render.points,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      frames: info.render.frame,
    };
  }

  private readonly frame = (now: number) => {
    this.rafId = requestAnimationFrame(this.frame);
    const elapsed = now - this.lastTime;
    this.lastTime = now;
    if (this.paused) {
      this.flushRender();
      return;
    }

    if (this.modal?.active()) {
      // 本: 世界は 止まる。本の 動きだけ 1/60 秒で 数える
      this.modalAcc = Math.min(this.modalAcc + Math.min(elapsed, 100) / 1000, FIXED_DT * MAX_STEPS_PER_FRAME);
      while (this.modalAcc >= FIXED_DT && this.modal.active()) {
        this.modal.tick();
        this.modalAcc -= FIXED_DT;
      }
      for (const fn of this.idleUpdaters) fn(Math.min(elapsed / 1000, 0.1));
      this.input.endFrame();
      this.render();
      // 本が とじた: そのコマで 世界を 描いたので、止まっている 間の 絵は もう描いてある
      if (!this.modal.active()) this.idleDrawn = true;
      return;
    }
    this.modalAcc = 0;

    if (!this.realtimeGate()) {
      // ロックなし: 時間は止める。描画と F3 だけ続ける
      this.clock.reset();
      for (const fn of this.idleUpdaters) fn(Math.min(elapsed / 1000, 0.1));
      this.input.endFrame();
      if (!this.idleDrawn) {
        this.render();
        this.idleDrawn = true;
      }
      return;
    }
    this.idleDrawn = false;

    const start = performance.now();
    // 何ステップ進めるかは 時計が決める（スローの倍率も かけ算で入る。WEAPON-5 AC8）
    const n = this.clock.advance(elapsed / 1000, this.timeScale());
    for (let i = 0; i < n; i++) this.update();
    this.render();
    this.frameStats.add(Math.max(elapsed, performance.now() - start));
  };

  private update(): void {
    if (this.modal?.active()) {
      // 本が 出ている 間: 世界の 更新は しない（時間も 進めない）。本の 動きだけ 1 コマ
      this.modal.tick();
      this.input.endFrame();
      if (!this.modal.active()) {
        // 本が とじた: 世界の 絵を 描きなおす
        this.idleDrawn = false;
        this.renderDirty = true;
      }
      return;
    }
    for (const fn of this.updaters) fn(FIXED_DT);
    this.input.endFrame();
    this.tick++;
  }

  private render(): void {
    this.renderDirty = false;
    if (this.renderSuspended) return;
    if (this.modal?.active()) {
      // 本: 世界は 描きなおさない（画面の 大きさが かわって きえたときだけ 1 まい）。本は 動きの 間だけ 描く
      if (this.worldStale) {
        this.worldStale = false;
        for (const fn of this.preRenders) fn();
        this.drawWorld();
      }
      this.modal.render();
      return;
    }
    for (const fn of this.preRenders) fn();
    this.drawWorld();
  }

  private readonly onResize = () => {
    const { clientWidth: w, clientHeight: h } = this.container;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.idleDrawn = false;
    this.worldStale = true;
  };
}
