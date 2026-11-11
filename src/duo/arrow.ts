import { DUO_COLORS, DUO_TUNING as T } from './tuning';
import type { DuoArrow } from './types';

/**
 * COOP-1 作業 3e（#422。1.8）: 相手の 向きの 矢印（§2.4・§9.3。ルーペの かわり）の 計算。DOM・Three.js なし。テストは arrow.test.ts。
 * 各 半分の 画面に 1 つ: 1P の 半分は 2P を、2P の 半分は 1P を さす。出る・消える（ゆれ止めつき）・向き・置き場・ふわっと の 濃さ。
 *
 * ---- つなぎ目の 約束 ----
 *   new DuoArrowTracker({ who, reducedMotion })   who = 矢印が 出る 画面の 持ち主。固定ステップごとに step() を 1 回（2P が いなくても 毎ステップ。そのときは null）。
 *   step(input)   input = 相手の 体の 中心を 自分の カメラの 空間で（rel）＋ 2 人の 距離 ＋ 自分の 半分の 落ちついた 四角（pane）＋ 縦の 画角 ＋ パネルが 開いているか。
 *   arrow()       `duo.arrow(who)` の 値（出ていなければ null）。毎ステップ 同じ 物を 書きかえて 返す（新しい 物を 作らない）。
 *   last()        最後に 出ていた ときの 値（ふわっと 消える あいだ HUD が この 位置で 薄く 消す）。
 *   opacity()     見た目の 濃さ 0〜1。
 */

/** 自分の 半分（CSS px） */
export interface ArrowPane {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ArrowStepInput {
  /** 相手の 体の 中心を 自分の カメラの 空間で（マス。forward > 0 が 前、right > 0 が 右、up > 0 が 上） */
  rel: { right: number; up: number; forward: number };
  /** 2 人の 体の 中心どうしの 直線（マス） */
  distance: number;
  /** 落ちついた 分割の 四角（切りかえの とちゅうの 四角は 使わない） */
  pane: ArrowPane;
  /** 縦の 画角の 半分の tan（横は これ × pane.w / pane.h） */
  tanHalfFovY: number;
  /** その 人の もちもの パネルが 開いている */
  panelOpen: boolean;
  /** COOP-1 5f-2（1.17）: その 半分の 時計の 箱（`clockBoxAt`）。矢印の 箱が かかる ときは 時計の 下まで ずらす。省くか null なら よけない */
  avoid?: ArrowPane | null;
}

export interface ArrowOptions {
  /** 矢印が 出る 画面の 持ち主。1 = 1P の 半分（2P を さす） */
  who: 1 | 2;
  reducedMotion?: boolean;
}

const RAD = Math.PI / 180;

/** 画面 px の 向き dx（右 +）・dy（下 +）の 角度。画面の 上 0°・時計回り、[0, 360)。(0, 0) は 180（真下） */
export function arrowAngleDeg(dx: number, dy: number): number {
  if (dx === 0 && dy === 0) return 180;
  const deg = Math.atan2(dx, -dy) / RAD;
  return deg < 0 ? deg + 360 : deg >= 360 ? deg - 360 : deg;
}

/** 三角の 高さ（px） */
export function arrowHeightPx(screenH: number): number {
  return Math.max(T.arrowMinHeightPx, screenH * T.arrowHeightRatio);
}

/**
 * 矢印の 先の 位置。pane の 中心から (dx, dy) の 向きに のばした 線が 枠に 当たる 所。
 * 枠 = pane の ふちから arrowEdgePx ＋ 三角の 半分の はば だけ 内側。上は 高さの 12%、下は 78% より 内側（向きは かえず、ふちに そって ずれる）。
 * out を 渡すと そこに 書く。
 * avoid（その 半分の 時計の 箱）を 渡すと、矢印の 箱（先の 点 ± 三角の 高さの 半分）が かかる ときだけ y を 箱の 上が avoid の 下はしに なる ところまで 下げる（x と 向きは かえない。§9.3）。
 */
export function arrowPlace(dx: number, dy: number, pane: ArrowPane, out: { x: number; y: number } = { x: 0, y: 0 }, avoid: ArrowPane | null = null): { x: number; y: number } {
  if (dx === 0 && dy === 0) dy = 1;
  const inset = T.arrowEdgePx + arrowHeightPx(pane.h) / 2;
  const left = pane.x + inset;
  const right = pane.x + pane.w - inset;
  const top = pane.y + Math.max(inset, pane.h * T.arrowTopRatio);
  const bottom = pane.y + pane.h * T.arrowBottomRatio;
  const cx = pane.x + pane.w / 2;
  const cy = pane.y + pane.h / 2;
  const tx = dx > 0 ? (right - cx) / dx : dx < 0 ? (left - cx) / dx : Infinity;
  const ty = dy > 0 ? (bottom - cy) / dy : dy < 0 ? (top - cy) / dy : Infinity;
  const t = Math.min(tx, ty);
  out.x = cx + dx * t;
  out.y = cy + dy * t;
  if (avoid !== null) {
    const half = arrowHeightPx(pane.h) / 2;
    const hit = out.x + half > avoid.x && out.x - half < avoid.x + avoid.w && out.y + half > avoid.y && out.y - half < avoid.y + avoid.h;
    if (hit) out.y = avoid.y + avoid.h + half;
  }
  return out;
}

export class DuoArrowTracker {
  private readonly reduced: boolean;
  private readonly color: string;
  private outSteps = 0;
  private inSteps = 0;
  private shown = false;
  /** 濃さの 進み 0〜arrowFadeSteps */
  private fade = 0;
  private readonly val: DuoArrow;
  private readonly place = { x: 0, y: 0 };

  constructor(opts: ArrowOptions) {
    this.reduced = opts.reducedMotion === true;
    this.color = opts.who === 1 ? DUO_COLORS.p2 : DUO_COLORS.p1;
    this.val = { x: 0, y: 0, angle: 180, color: this.color };
  }

  step(input: ArrowStepInput | null): void {
    if (input === null || input.panelOpen) {
      // 相手が いない・パネルが 開いている: 出さない。数えも 濃さも すぐ 0
      this.outSteps = 0;
      this.inSteps = 0;
      this.shown = false;
      this.fade = 0;
      return;
    }
    if (input.distance <= T.arrowNearTiles) {
      // 近い: 出さない・出ていれば その ステップで 消す（数えない）
      this.outSteps = 0;
      this.inSteps = 0;
      this.shown = false;
    } else {
      const { rel, pane } = input;
      const front = rel.forward > 0;
      let dx: number;
      let dy: number;
      let out: boolean;
      let inner: boolean;
      if (front) {
        const nx = rel.right / (rel.forward * input.tanHalfFovY * (pane.w / pane.h));
        const ny = rel.up / (rel.forward * input.tanHalfFovY);
        const m = Math.max(Math.abs(nx), Math.abs(ny));
        out = m > T.arrowOutRatio;
        inner = m <= T.arrowInRatio;
        dx = (nx * pane.w) / 2;
        dy = (-ny * pane.h) / 2;
      } else {
        // うしろ: 左右は そのまま・下向き
        out = true;
        inner = false;
        dx = rel.right;
        dy = -rel.forward;
      }
      this.outSteps = out ? this.outSteps + 1 : 0;
      this.inSteps = inner ? this.inSteps + 1 : 0;
      if (!this.shown && this.outSteps >= T.arrowHoldSteps) this.shown = true;
      else if (this.shown && this.inSteps >= T.arrowHoldSteps) this.shown = false;
      if (this.shown) {
        const p = arrowPlace(dx, dy, pane, this.place, input.avoid ?? null);
        this.val.angle = arrowAngleDeg(dx, dy);
        this.val.x = p.x;
        this.val.y = p.y;
      }
    }
    const max = T.arrowFadeSteps;
    if (this.reduced) this.fade = this.shown ? max : 0;
    else this.fade = this.shown ? Math.min(max, this.fade + 1) : Math.max(0, this.fade - 1);
  }

  /** `duo.arrow(who)` の 値。出ていなければ null */
  arrow(): DuoArrow | null {
    return this.shown ? this.val : null;
  }

  /** 最後に 出ていた ときの 値（ふわっと 消える あいだの 位置） */
  last(): DuoArrow {
    return this.val;
  }

  opacity(): number {
    return this.fade / T.arrowFadeSteps;
  }
}
