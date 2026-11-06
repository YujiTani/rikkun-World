import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  DuoArrowTracker,
  arrowAngleDeg,
  arrowHeightPx,
  arrowPlace,
  type ArrowPane,
  type ArrowStepInput,
} from './arrow';
import { DUO_COLORS, DUO_TUNING as T } from './tuning';
import type { DuoArrow, DuoHook } from './types';

/**
 * COOP-1 作業 3e（#422。docs/design/COOP-1.md 1.8 §2.4「相手の 向きの 矢印」・§9.3）の 先行テスト（赤）。AC85・AC86（向きと 色）・AC87（置き場）・AC32（動きを 減らす 設定）。
 * 数（0.9・0.8・18・4・16・12%・22%・5%・32px・12）は DUO_TUNING の arrow* から 読む（値は tuning.test.ts で 仕様と 合わせる）。
 *
 * ---- 実装への 約束（新しい ファイル src/duo/arrow.ts。DOM・Three.js なし）----
 *   型（src/duo/types.ts）
 *     DuoArrow = { x: number; y: number; angle: number; color: string }
 *       x・y = 矢印の 先の 画面の 位置（CSS px。画面の 左上が 0,0）。angle = 度（画面の 上 0°・時計回り。0 以上 360 未満）。color = 相手の 色（#rrggbb。DUO_COLORS の p1／p2）。
 *     DuoHook.arrow(who: 1 | 2): DuoArrow | null    ← `window.__rikkun.duo.arrow(who)`。出ていなければ null。2P が いなければ いつも null。
 *   arrow.ts
 *     ArrowPane = { x; y; w; h }                   自分の 半分（CSS px）。1P = 左半分 { 0, 0, floor(W/2), H }、2P = 右半分 { floor(W/2), 0, W - floor(W/2), H }。
 *     ArrowStepInput = {
 *       rel: { right; up; forward }                相手の 体の 中心を 自分の カメラの 空間で（マス。forward > 0 が 前、right > 0 が 右、up > 0 が 上）
 *       distance: number                           2 人の 体の 中心どうしの 直線（マス）
 *       pane: ArrowPane                            落ちついた 分割の 四角（`viewRects('split','split',1,W,H)` の main／second）。切りかえの とちゅうの 四角（rc）は 使わない
 *       tanHalfFovY: number                        縦の 画角の 半分の tan（横は これ × pane.w / pane.h）
 *       panelOpen: boolean                         その 人の もちもの パネル（2P は duo-inv-p2、段階 2 の 2 人用 画面も）が 開いている
 *     }
 *     映し方: forward > 0 なら NDC x = right / (forward * tanHalfFovY * aspect)、NDC y = up / (forward * tanHalfFovY)、aspect = pane.w / pane.h。
 *             「内側 N% の 外」= max(|x|, |y|) > N。forward <= 0（うしろ）は いつも 外。
 *     向き（画面 px の 方向 dx（右 +）・dy（下 +）。長さは 問わない）:
 *             前 → dx = x * pane.w / 2、dy = -y * pane.h / 2。 うしろ → dx = right、dy = -forward（左右は そのまま・下向き。まうしろは dx = 0 で 真下）。
 *     arrowAngleDeg(dx, dy): number                画面の 上 0°・時計回り、[0, 360)。(0,-1)=0・(1,0)=90・(0,1)=180・(-1,0)=270。(0,0) は 180。
 *     arrowHeightPx(screenH: number): number       三角の 高さ = max(arrowMinHeightPx, screenH * arrowHeightRatio)
 *     arrowPlace(dx, dy, pane, out?: { x; y }): { x; y }
 *                                                  矢印の 先の 位置。pane の 中心から (dx, dy) の 向きに のばした 線が、枠に 当たる 所。
 *                                                  枠 = pane の ふち（左右は まん中の 線 も）から  arrowEdgePx ＋ 三角の 半分の はば（arrowHeightPx(pane.h) / 2）だけ 内側
 *                                                  （三角が 16px の 内側に おさまるように）。ただし 上は max(arrowEdgePx ＋ 半分の はば, h * arrowTopRatio)、下は h * arrowBottomRatio より 内側
 *                                                  （それより 外に かかる ときは ふちに そって ずらす。向き（angle）は かえない）。
 *                                                  out を 渡すと そこに 書く（毎コマ 新しい 物を 作らない）。
 *     new DuoArrowTracker({ who, reducedMotion? })  who = 矢印が 出る 画面の 持ち主（1 = 1P の 半分に 2P を さす 矢印）。固定ステップごとに step を 1 回。
 *       step(input: ArrowStepInput | null)         null = 相手が いない（2P が いない）。出ない・数えも 0 に もどす。
 *                                                  panelOpen = true の あいだは 出さない（arrow() は null）・数えも 0 に もどす。とじた あとは 18 ステップ 数えなおし。
 *       arrow(): DuoArrow | null                   `duo.arrow(who)` の 値。angle・x・y・color（color は who = 1 なら DUO_COLORS.p2、who = 2 なら DUO_COLORS.p1）。
 *       opacity(): number                          見た目の 濃さ 0〜1。出た ステップから arrowFadeSteps で 0 → 1、消えた ステップから 1 → 0（ふわっと）。
 *                                                  動きを 減らす 設定は 出た ステップに 1、消えた ステップに 0（すぐ）。arrow() が null に なっても、opacity() が 0 に なるまでは HUD が 最後の 位置で 薄く 消す。
 *     出る・消える（§9.3。AC85）:
 *       出る: 外（> arrowOutRatio）が arrowHoldSteps 回 つづいた その ステップ。内側に 入れば 数えなおし。arrowInRatio〜arrowOutRatio の あいだは どちらにも 数えない（ゆれ止め）。
 *       消える: 内側 arrowInRatio 以内が arrowHoldSteps 回 つづいた その ステップ。外や あいだに 出れば 数えなおし。
 *       近い: distance <= arrowNearTiles の ステップは 出さない・出ていれば その ステップで 消す（うしろでも）。近い あいだは 数えない。はなれたら 18 ステップ 数えなおし。
 *       パネルが 開いている: arrow() は null（duo.arrow(who) も null）。画面の 矢印も 見えない（UI 検査）。
 *     配線（developer）: 1P の 半分の カメラで 2P を 映し（rel）、HUD の `duo-arrow-p1`、2P の 半分の カメラで 1P を 映し `duo-arrow-p2` を 動かす。
 *       2P が 倒れて 戻るまで・パッドが ぬけた 2P も ふつうに さす（倒れた 人は 戻った 先を さす）。2P の 小さい パネル（duo-inv-p2）・段階 2 の 2 人用 もちもの画面が 開いている あいだは
 *       その 人の 矢印を 出さない（panelOpen。AC87）。
 *       動きを 減らす 設定: arrow() は 出る・消える その ステップで 値／null に なり、opacity() は すぐ 1／0。
 *       2P の やめる（onLeft。wire/duo.ts）では p2cam.reset() も 呼ぶ（P2Camera の 約束）。
 */

const SCREENS = [
  { w: 1024, h: 700 },
  { w: 1280, h: 800 },
  { w: 1440, h: 900 },
] as const;

const panes = (w: number, h: number): Record<1 | 2, ArrowPane> => {
  const half = Math.floor(w / 2);
  return { 1: { x: 0, y: 0, w: half, h }, 2: { x: half, y: 0, w: w - half, h } };
};

const P1 = panes(1280, 800)[1];
const P2 = panes(1280, 800)[2];
const TAN = Math.tan((50 * Math.PI) / 360); // 縦の 画角 50° の 半分

/** NDC (nx, ny) に 映る 位置の 相手（forward = 10 マス）を 自分の カメラの 空間で */
function relAtNdc(nx: number, ny: number, pane: ArrowPane = P1, forward = 10): ArrowStepInput['rel'] {
  const aspect = pane.w / pane.h;
  return { right: nx * forward * TAN * aspect, up: ny * forward * TAN, forward };
}
const input = (rel: ArrowStepInput['rel'], opts: { distance?: number; pane?: ArrowPane; panelOpen?: boolean } = {}): ArrowStepInput => ({
  rel,
  distance: opts.distance ?? 20,
  pane: opts.pane ?? P1,
  tanHalfFovY: TAN,
  panelOpen: opts.panelOpen ?? false,
});
const IN = relAtNdc(0, 0);
const OUT = relAtNdc(0.95, 0);
const BAND = relAtNdc(0.85, 0); // 80%〜90% の あいだ
const INNER = relAtNdc(0.7, 0.7); // 80% の 中（max ノルム 0.7）
const BEHIND: ArrowStepInput['rel'] = { right: 0, up: 0, forward: -10 };

const angleDiff = (a: number, b: number) => Math.abs((((a - b) % 360) + 540) % 360 - 180);

/** n ステップ 同じ 入力を 与えて、最後の arrow() を 返す */
function runWith(t: DuoArrowTracker, n: number, inp: ArrowStepInput | null): DuoArrow | null {
  for (let i = 0; i < n; i++) t.step(inp);
  return t.arrow();
}

describe('型（tsc で 見る）', () => {
  it('duo.arrow(who) は DuoArrow | null', () => {
    expectTypeOf<DuoHook['arrow']>().parameters.toEqualTypeOf<[1 | 2]>();
    expectTypeOf<DuoHook['arrow']>().returns.toEqualTypeOf<DuoArrow | null>();
    expectTypeOf<DuoArrow>().toEqualTypeOf<{ x: number; y: number; angle: number; color: string }>();
  });
});

describe('AC85: 矢印が 出る（内側 90% の 外に 18 ステップ）', () => {
  it('17 ステップでは 出ない、18 ステップ目に 出る', () => {
    const t = new DuoArrowTracker({ who: 1 });
    expect(runWith(t, T.arrowHoldSteps - 1, input(OUT))).toBeNull();
    expect(runWith(t, 1, input(OUT))).not.toBeNull();
  });
  it('2P が いなければ（null）いつも 出ない', () => {
    const t = new DuoArrowTracker({ who: 1 });
    expect(runWith(t, 100, null)).toBeNull();
  });
  it('とちゅうで 内側に 入れば 数えなおし', () => {
    const t = new DuoArrowTracker({ who: 1 });
    runWith(t, T.arrowHoldSteps - 1, input(OUT));
    runWith(t, 1, input(IN));
    expect(runWith(t, T.arrowHoldSteps - 1, input(OUT))).toBeNull();
    expect(runWith(t, 1, input(OUT))).not.toBeNull();
  });
  it('たてに 外へ 出ても（上・下）出る', () => {
    for (const ny of [0.95, -0.95]) {
      const t = new DuoArrowTracker({ who: 1 });
      expect(runWith(t, T.arrowHoldSteps, input(relAtNdc(0, ny)))).not.toBeNull();
    }
  });
  it('80%〜90% の あいだに いるだけでは 出ない（ゆれ止め）', () => {
    const t = new DuoArrowTracker({ who: 1 });
    expect(runWith(t, 300, input(BAND))).toBeNull();
  });
  it('あいだに 出ると 数えなおし（外 17 → あいだ 1 → 外 17 では まだ）', () => {
    const t = new DuoArrowTracker({ who: 1 });
    runWith(t, T.arrowHoldSteps - 1, input(OUT));
    runWith(t, 1, input(BAND));
    expect(runWith(t, T.arrowHoldSteps - 1, input(OUT))).toBeNull();
  });
  it('うしろに いる（カメラの 前に 映らない）ときも 18 ステップで 出る', () => {
    const t = new DuoArrowTracker({ who: 1 });
    expect(runWith(t, T.arrowHoldSteps - 1, input(BEHIND))).toBeNull();
    expect(runWith(t, 1, input(BEHIND))).not.toBeNull();
  });
  it('2P の 半分（who = 2）も 同じ 決まり', () => {
    const t = new DuoArrowTracker({ who: 2 });
    const o = input(relAtNdc(-0.95, 0, P2), { pane: P2 });
    expect(runWith(t, T.arrowHoldSteps - 1, o)).toBeNull();
    expect(runWith(t, 1, o)).not.toBeNull();
  });
});

describe('AC85: 矢印が 消える（内側 80% の 中に 18 ステップ）', () => {
  const shown = (): DuoArrowTracker => {
    const t = new DuoArrowTracker({ who: 1 });
    runWith(t, T.arrowHoldSteps, input(OUT));
    expect(t.arrow()).not.toBeNull();
    return t;
  };
  it('80% の 中に 17 ステップでは まだ、18 ステップ目に 消える', () => {
    const t = shown();
    expect(runWith(t, T.arrowHoldSteps - 1, input(INNER))).not.toBeNull();
    expect(runWith(t, 1, input(INNER))).toBeNull();
  });
  it('80%〜90% の あいだに いるだけでは 消えない（ゆれ止め）', () => {
    const t = shown();
    expect(runWith(t, 300, input(BAND))).not.toBeNull();
  });
  it('とちゅうで あいだ・外に 出れば 数えなおし', () => {
    const t = shown();
    runWith(t, T.arrowHoldSteps - 1, input(INNER));
    runWith(t, 1, input(BAND));
    expect(runWith(t, T.arrowHoldSteps - 1, input(INNER))).not.toBeNull();
    runWith(t, 1, input(OUT));
    expect(runWith(t, T.arrowHoldSteps - 1, input(INNER))).not.toBeNull();
    expect(runWith(t, 1, input(INNER))).toBeNull();
  });
  it('2P が いなく なれば（null）その ステップで 消える', () => {
    const t = shown();
    expect(runWith(t, 1, null)).toBeNull();
  });
});

describe('AC85: 2 人の 距離が 4 マス 以下 なら 出さない・その ステップで 消す', () => {
  it('出ている ときに 4 マス以下に なると その ステップで 消える（見えていなくても・うしろでも）', () => {
    for (const rel of [OUT, BEHIND]) {
      const t = new DuoArrowTracker({ who: 1 });
      runWith(t, T.arrowHoldSteps, input(rel, { distance: 20 }));
      expect(t.arrow()).not.toBeNull();
      expect(runWith(t, 1, input(rel, { distance: T.arrowNearTiles }))).toBeNull();
      expect(runWith(t, 200, input(rel, { distance: T.arrowNearTiles - 1 }))).toBeNull();
    }
  });
  it('4 マスちょうどは 近い。4 マスより 少し 遠ければ 近くない', () => {
    const t = new DuoArrowTracker({ who: 1 });
    expect(runWith(t, 100, input(BEHIND, { distance: T.arrowNearTiles }))).toBeNull();
    const u = new DuoArrowTracker({ who: 1 });
    expect(runWith(u, T.arrowHoldSteps, input(BEHIND, { distance: T.arrowNearTiles + 0.5 }))).not.toBeNull();
  });
  it('近い あいだに 外に いつづけても 出ない。はなれたら 18 ステップ以内に 出る', () => {
    const t = new DuoArrowTracker({ who: 1 });
    expect(runWith(t, 100, input(OUT, { distance: 2 }))).toBeNull();
    expect(runWith(t, T.arrowHoldSteps, input(OUT, { distance: 10 }))).not.toBeNull();
  });
});

describe('AC87: パネルが 開いている あいだは 出さない', () => {
  it('出ている ときに パネルが 開くと その ステップで null。とじても すぐには 出ず、18 ステップ 数えなおし', () => {
    const t = new DuoArrowTracker({ who: 2 });
    const open = input(relAtNdc(-0.95, 0, P2), { pane: P2, panelOpen: true });
    const closed = input(relAtNdc(-0.95, 0, P2), { pane: P2 });
    runWith(t, T.arrowHoldSteps, closed);
    expect(t.arrow()).not.toBeNull();
    expect(runWith(t, 1, open)).toBeNull();
    expect(runWith(t, 300, open)).toBeNull();
    expect(runWith(t, T.arrowHoldSteps - 1, closed)).toBeNull();
    expect(runWith(t, 1, closed)).not.toBeNull();
  });
  it('パネルが 開いている あいだは 外に いつづけても 出ない（1P の 半分も 同じ）', () => {
    for (const who of [1, 2] as const) {
      const t = new DuoArrowTracker({ who });
      expect(runWith(t, 200, input(OUT, { panelOpen: true }))).toBeNull();
      expect(runWith(t, 200, input(BEHIND, { panelOpen: true }))).toBeNull();
    }
  });
  it('動きを 減らす 設定でも その ステップで null・opacity 0', () => {
    const t = new DuoArrowTracker({ who: 1, reducedMotion: true });
    runWith(t, T.arrowHoldSteps, input(OUT));
    expect(t.opacity()).toBe(1);
    expect(runWith(t, 1, input(OUT, { panelOpen: true }))).toBeNull();
    expect(t.opacity()).toBe(0);
  });
});

describe('AC86: 矢印の 向きと 色', () => {
  const angleOf = (rel: ArrowStepInput['rel'], pane: ArrowPane = P1, who: 1 | 2 = 1): number => {
    const t = new DuoArrowTracker({ who });
    const a = runWith(t, T.arrowHoldSteps, input(rel, { pane }));
    expect(a).not.toBeNull();
    return a!.angle;
  };
  it('arrowAngleDeg: 上 0°・右 90°・下 180°・左 270°・時計回り', () => {
    expect(arrowAngleDeg(0, -1)).toBeCloseTo(0, 6);
    expect(arrowAngleDeg(5, 0)).toBeCloseTo(90, 6);
    expect(arrowAngleDeg(0, 3)).toBeCloseTo(180, 6);
    expect(arrowAngleDeg(-2, 0)).toBeCloseTo(270, 6);
    expect(arrowAngleDeg(1, -1)).toBeCloseTo(45, 6);
    expect(arrowAngleDeg(-1, -1)).toBeCloseTo(315, 6);
    expect(arrowAngleDeg(0, 0)).toBeCloseTo(180, 6);
    for (let a = 0; a < 360; a += 7) {
      const r = (a * Math.PI) / 180;
      const v = arrowAngleDeg(Math.sin(r), -Math.cos(r));
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(360);
      expect(angleDiff(v, a)).toBeLessThan(1e-6);
    }
  });
  it('カメラの 前: 自分の 半分の 中心から 相手を 画面に 映した 方向（ずれ 1° 以内。半分は たてに 細いので 画面 px で 数える）', () => {
    for (const pane of [P1, P2]) {
      for (const [nx, ny] of [[1.5, 0], [-1.5, 0], [0, 1.5], [0, -1.5], [1.2, 1.2], [-1.3, 0.4], [0.5, -2]] as const) {
        const dx = (nx * pane.w) / 2;
        const dy = (-ny * pane.h) / 2;
        const want = (Math.atan2(dx, -dy) * 180) / Math.PI;
        expect(angleDiff(angleOf(relAtNdc(nx, ny, pane), pane), want), `${pane.x} ${nx},${ny}`).toBeLessThan(1);
      }
    }
  });
  it('カメラの うしろ: まうしろ 180°、右うしろ 90〜180°（下向き・右よりに）、左うしろ 180〜270°', () => {
    expect(angleDiff(angleOf({ right: 0, up: 0, forward: -10 }), 180)).toBeLessThanOrEqual(10);
    const r = angleOf({ right: 8, up: 0, forward: -8 });
    expect(r).toBeGreaterThan(90);
    expect(r).toBeLessThan(180);
    const l = angleOf({ right: -8, up: 0, forward: -8 });
    expect(l).toBeGreaterThan(180);
    expect(l).toBeLessThan(270);
    // 約束の 式: 右うしろ（right = 8・forward = -8）は 135°、左うしろは 225°
    expect(angleDiff(r, 135)).toBeLessThan(1);
    expect(angleDiff(l, 225)).toBeLessThan(1);
  });
  it('うしろの とき 上下の ずれ（up）は 向きに 効かない', () => {
    const a = angleOf({ right: 4, up: 0, forward: -6 });
    expect(angleDiff(angleOf({ right: 4, up: 9, forward: -6 }), a)).toBeLessThan(1e-6);
    expect(angleDiff(angleOf({ right: 4, up: -9, forward: -6 }), a)).toBeLessThan(1e-6);
  });
  it('色は 相手の 色: 1P の 半分の 矢印は 2P の むらさき、2P の 半分の 矢印は 1P の ライム', () => {
    const a1 = runWith(new DuoArrowTracker({ who: 1 }), T.arrowHoldSteps, input(OUT));
    expect(a1!.color.toLowerCase()).toBe(DUO_COLORS.p2.toLowerCase());
    const a2 = runWith(new DuoArrowTracker({ who: 2 }), T.arrowHoldSteps, input(relAtNdc(-0.95, 0, P2), { pane: P2 }));
    expect(a2!.color.toLowerCase()).toBe(DUO_COLORS.p1.toLowerCase());
  });
  it('x・y は arrowPlace の 位置と 同じ。まうしろでも 向き（angle）は 180° のまま 位置だけ 下の 限りに ずれる', () => {
    const t = new DuoArrowTracker({ who: 1 });
    const a = runWith(t, T.arrowHoldSteps, input(BEHIND))!;
    const p = arrowPlace(0, 1, P1);
    expect(a.x).toBeCloseTo(p.x, 3);
    expect(a.y).toBeCloseTo(p.y, 3);
    expect(a.y).toBeLessThanOrEqual(P1.h * T.arrowBottomRatio + 0.01);
    expect(angleDiff(a.angle, 180)).toBeLessThanOrEqual(1);
  });
});

describe('AC87: 矢印の 置き場（3 つの 大きさ・左右の 半分）', () => {
  /** 枠: ふち 16px ＋ 三角の 半分の はば だけ 内側（上は 12%、下は 22% より 内側） */
  const allowed = (pane: ArrowPane) => {
    const inset = T.arrowEdgePx + arrowHeightPx(pane.h) / 2;
    return {
      left: pane.x + inset,
      right: pane.x + pane.w - inset,
      top: pane.y + Math.max(inset, pane.h * T.arrowTopRatio),
      bottom: pane.y + pane.h * T.arrowBottomRatio,
    };
  };
  const EPS = 0.01;

  for (const { w, h } of SCREENS) {
    for (const who of [1, 2] as const) {
      it(`${w}×${h} ${who}P の 半分: どの 向きでも ふちから 16px ＋ 三角の 半分 内側・下 22%・上 12%・まん中の 線に かからず、枠の 上に ある`, () => {
        const pane = panes(w, h)[who];
        const r = allowed(pane);
        const cx = pane.x + pane.w / 2;
        for (let deg = 0; deg < 360; deg += 5) {
          const rad = (deg * Math.PI) / 180;
          const dx = Math.sin(rad);
          const dy = -Math.cos(rad);
          const p = arrowPlace(dx, dy, pane);
          const tag = `${deg}°`;
          expect(p.x, `${tag} 左`).toBeGreaterThanOrEqual(r.left - EPS);
          expect(p.x, `${tag} 右`).toBeLessThanOrEqual(r.right + EPS);
          expect(p.y, `${tag} 上`).toBeGreaterThanOrEqual(r.top - EPS);
          expect(p.y, `${tag} 下`).toBeLessThanOrEqual(r.bottom + EPS);
          const onFrame = Math.abs(p.x - r.left) < EPS || Math.abs(p.x - r.right) < EPS || Math.abs(p.y - r.top) < EPS || Math.abs(p.y - r.bottom) < EPS;
          expect(onFrame, `${tag} 枠の 上`).toBe(true);
          // 向きを 守る（相手の 側に ある）
          if (dx > 0.01) expect(p.x, `${tag} 右向き`).toBeGreaterThanOrEqual(cx - EPS);
          if (dx < -0.01) expect(p.x, `${tag} 左向き`).toBeLessThanOrEqual(cx + EPS);
        }
      });
    }
  }
  it('まっすぐ 右・左は 中心の 高さで 左右の 枠。まっすぐ 上は 上の 12%、まっすぐ 下は 下の 22% の 線で とまる', () => {
    const r = allowed(P1);
    const cx = P1.x + P1.w / 2;
    const cy = P1.y + P1.h / 2;
    const right = arrowPlace(1, 0, P1);
    expect(right.x).toBeCloseTo(r.right, 3);
    expect(right.y).toBeCloseTo(cy, 3);
    const left = arrowPlace(-1, 0, P1);
    expect(left.x).toBeCloseTo(r.left, 3);
    expect(left.y).toBeCloseTo(cy, 3);
    const up = arrowPlace(0, -1, P1);
    expect(up.x).toBeCloseTo(cx, 3);
    expect(up.y).toBeCloseTo(r.top, 3);
    expect(up.y).toBeCloseTo(P1.h * T.arrowTopRatio, 3);
    const down = arrowPlace(0, 1, P1);
    expect(down.x).toBeCloseTo(cx, 3);
    expect(down.y).toBeCloseTo(P1.h * T.arrowBottomRatio, 3);
  });
  it('2P の 半分は 画面の 右半分の 中（x は 半分の 左はし + 16px + 三角の 半分から）', () => {
    const inset = T.arrowEdgePx + arrowHeightPx(P2.h) / 2;
    const left = arrowPlace(-1, 0, P2);
    expect(left.x).toBeCloseTo(P2.x + inset, 3);
    const right = arrowPlace(1, 0, P2);
    expect(right.x).toBeCloseTo(P2.x + P2.w - inset, 3);
  });
  it('三角（高さ arrowHeightPx）が 16px の 内側に おさまる: 先から 三角の 半分の はば だけ 内側に ある（左右）', () => {
    for (const { w, h } of SCREENS) {
      for (const who of [1, 2] as const) {
        const pane = panes(w, h)[who];
        const half = arrowHeightPx(h) / 2;
        const right = arrowPlace(1, 0, pane);
        const left = arrowPlace(-1, 0, pane);
        expect(pane.x + pane.w - right.x, `${w}×${h} ${who}P 右`).toBeGreaterThanOrEqual(T.arrowEdgePx + half - 0.01);
        expect(left.x - pane.x, `${w}×${h} ${who}P 左`).toBeGreaterThanOrEqual(T.arrowEdgePx + half - 0.01);
      }
    }
  });
  it('out を 渡すと そこに 書いて 同じ 物を 返す（新しい 物を 作らない）', () => {
    const out = { x: -1, y: -1 };
    expect(arrowPlace(1, 0.2, P1, out)).toBe(out);
    expect(out.x).toBeGreaterThan(0);
  });
  it('向きが すこし かわると 位置も すこし しか かわらない（とびはねない）', () => {
    let prev = arrowPlace(0, -1, P1);
    for (let deg = 1; deg <= 360; deg++) {
      const rad = (deg * Math.PI) / 180;
      const p = arrowPlace(Math.sin(rad), -Math.cos(rad), P1);
      expect(Math.hypot(p.x - prev.x, p.y - prev.y), `${deg}°`).toBeLessThan(40);
      prev = p;
    }
  });
  it('大きさ: 三角の 高さは 画面の 高さの 5%（800 で 40px）、いちばん 小さくて 32px', () => {
    expect(arrowHeightPx(800)).toBeCloseTo(40, 6);
    expect(arrowHeightPx(700)).toBeCloseTo(35, 6);
    expect(arrowHeightPx(900)).toBeCloseTo(45, 6);
    expect(arrowHeightPx(600)).toBe(T.arrowMinHeightPx);
    expect(arrowHeightPx(300)).toBe(32);
  });
});

describe('§2.4・AC32: ふわっと 出る・消える（約 0.2 秒）。動きを 減らす 設定は すぐ', () => {
  const FADE = T.arrowFadeSteps;
  it('ふつう: 出た ステップは まだ 薄く、arrowFadeSteps 後に 1。ふえる 一方', () => {
    const t = new DuoArrowTracker({ who: 1 });
    runWith(t, T.arrowHoldSteps, input(OUT));
    expect(t.arrow()).not.toBeNull();
    expect(t.opacity()).toBeLessThan(1);
    expect(t.opacity()).toBeGreaterThanOrEqual(0);
    let prev = t.opacity();
    for (let i = 0; i < FADE; i++) {
      t.step(input(OUT));
      expect(t.opacity()).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = t.opacity();
    }
    expect(t.opacity()).toBeCloseTo(1, 6);
  });
  it('ふつう: 消えた ステップは まだ 少し のこり、arrowFadeSteps 後に 0', () => {
    const t = new DuoArrowTracker({ who: 1 });
    runWith(t, T.arrowHoldSteps + FADE + 2, input(OUT));
    expect(t.opacity()).toBeCloseTo(1, 6);
    runWith(t, T.arrowHoldSteps, input(INNER));
    expect(t.arrow()).toBeNull();
    expect(t.opacity()).toBeGreaterThan(0);
    expect(t.opacity()).toBeLessThan(1);
    runWith(t, FADE, input(INNER));
    expect(t.opacity()).toBeCloseTo(0, 6);
  });
  it('動きを 減らす 設定: 出た その ステップに 1、消えた その ステップに 0', () => {
    const t = new DuoArrowTracker({ who: 1, reducedMotion: true });
    runWith(t, T.arrowHoldSteps - 1, input(OUT));
    expect(t.opacity()).toBe(0);
    runWith(t, 1, input(OUT));
    expect(t.arrow()).not.toBeNull();
    expect(t.opacity()).toBe(1);
    runWith(t, T.arrowHoldSteps - 1, input(INNER));
    expect(t.opacity()).toBe(1);
    runWith(t, 1, input(INNER));
    expect(t.arrow()).toBeNull();
    expect(t.opacity()).toBe(0);
  });
  it('出ていない あいだは 0', () => {
    const t = new DuoArrowTracker({ who: 1 });
    runWith(t, 50, input(IN));
    expect(t.opacity()).toBe(0);
  });
});
