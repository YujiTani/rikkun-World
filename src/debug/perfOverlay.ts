import type { Game } from '../game/Game';

/** F3 で出し入れできる性能表示。Mac で本当の fps を確かめるのに使う。 */
export class PerfOverlay {
  private readonly el: HTMLDivElement;
  private elapsed = 0;

  constructor(
    parent: HTMLElement,
    private readonly game: Game,
    /** 描画の設定の行（F3 の表示に足す）と、F4 で小ブロックの半径を切りかえる先（VOX-E） */
    private readonly extra?: { lines(): string[]; cycle(): void },
  ) {
    this.el = document.createElement('div');
    this.el.id = 'perf-overlay';
    this.el.hidden = true;
    parent.appendChild(this.el);
  }

  get visible(): boolean {
    return !this.el.hidden;
  }

  toggle(): void {
    this.el.hidden = !this.el.hidden;
  }

  update(dt: number): void {
    if (this.game.input.wasPressed('toggleDebug')) this.toggle();
    if (!this.visible) return;
    if (this.game.input.wasPressed('cycleMicroR')) this.extra?.cycle();
    this.elapsed += dt;
    if (this.elapsed < 0.25) return; // 表示の書きかえは 1 秒に 4 回
    this.elapsed = 0;
    const s = this.game.getRenderStats();
    this.el.textContent = [
      `FPS ${s.fps.toFixed(0)}`,
      `frame ${s.frameMsAvg.toFixed(1)}ms (worst ${s.frameMsWorst.toFixed(1)})`,
      `draw ${s.drawCalls}  tri ${s.triangles}`,
      `geo ${s.geometries}  tex ${s.textures}`,
      ...(this.extra?.lines() ?? []),
    ].join('\n');
  }
}
