import { describe, expect, it } from 'vitest';
import { viewRects } from './viewRects';
import { clockBoxAt } from '../ui/duoHalves';
import { DuoArrowTracker, arrowHeightPx, arrowPlace, type ArrowPane, type ArrowStepInput } from './arrow';
import { DUO_TUNING as T } from './tuning';

/**
 * COOP-1 5f-2（docs/design/COOP-1.md 1.17 §9.3「置く所」・§3.7 (g) #17、AC177）のユニットテスト。実装の前に書いた赤のテスト。
 * 時計を 各半分の 外がわの 上すみに 置く（1P = 左上・2P = 右上）と、相手の 向きの 矢印の 枠（上は 高さの 12%）が 時計の 箱に かかる ことが ある。
 * 「その 半分の 時計の 箱にも かけない（時計の 下まで ずらす）」。1.8 の arrow.test.ts の 約束（時計が ない とき）は かえない。
 *
 * ---- 開発への つなぎ目の 約束 ----
 *   `src/duo/arrow.ts`:
 *     arrowPlace(dx, dy, pane, out?, avoid?: ArrowPane | null)   … 5 つ目の 引数（省略できる）。矢印の 箱（先の 点 ± arrowHeightPx(pane.h) / 2）が avoid に かかる ときだけ、
 *         y を 箱の 上が avoid の 下はしに なる ところまで 下げる（x と 向き〈angle〉は かえない）。かからなければ avoid なしと 同じ 答え。
 *     ArrowStepInput に `avoid?: ArrowPane | null`   … その 半分の 時計の 箱（`clockBoxAt(rects, who, size)`。duoHalves.ts）。DuoArrowTracker.step が arrowPlace に そのまま 渡す。
 *   時計の 箱の 大きさは DOM の 実測（ここでは 120×160 の 大きめの 箱で 見る）。
 */

const SIZES: [number, number][] = [
  [1024, 700],
  [1280, 800],
  [1440, 900],
];
const SIZE = { w: 120, h: 160 };
const EPS = 0.01;

/** 矢印の 箱が 時計の 箱に かかって いるか（ふちが ふれる だけは かからない） */
const overlaps = (p: { x: number; y: number }, pane: ArrowPane, clock: ArrowPane): boolean => {
  const half = arrowHeightPx(pane.h) / 2;
  return p.x + half > clock.x + EPS && p.x - half < clock.x + clock.w - EPS && p.y + half > clock.y + EPS && p.y - half < clock.y + clock.h - EPS;
};

describe('AC177: 矢印は 時計の 箱に かからない', () => {
  for (const [w, h] of SIZES) {
    const split = viewRects('split', 'split', 1, w, h);
    for (const who of [1, 2] as const) {
      const pane = who === 1 ? split.main : split.second!;
      const clock = clockBoxAt(split, who, SIZE)!;

      it(`${w}×${h} ${who}P: どの 向きでも 矢印の 箱は 時計の 箱に かからない。向き（x）は かえない`, () => {
        let moved = 0;
        for (let deg = 0; deg < 360; deg += 5) {
          const rad = (deg * Math.PI) / 180;
          const dx = Math.sin(rad);
          const dy = -Math.cos(rad);
          const plain = arrowPlace(dx, dy, pane);
          const p = arrowPlace(dx, dy, pane, undefined, clock);
          expect(overlaps(p, pane, clock), `${deg}°`).toBe(false);
          expect(p.x, `${deg}° x`).toBeCloseTo(plain.x, 5);
          if (overlaps(plain, pane, clock)) {
            moved++;
            expect(p.y, `${deg}° 下へ`).toBeGreaterThan(plain.y);
            expect(p.y - arrowHeightPx(pane.h) / 2, `${deg}° 時計の 下はし`).toBeGreaterThanOrEqual(clock.y + clock.h - EPS);
          } else {
            expect(p.y, `${deg}° かからない ときは そのまま`).toBeCloseTo(plain.y, 5);
          }
        }
        // 時計の ある すみに 向かう 向きでは 本当に ずらして いる（この 画面で 1 つも かからないなら テストが 空）
        expect(moved).toBeGreaterThan(0);
      });
    }
  }

  it('avoid を 渡さない・null なら 1.8 の 答えと 同じ（時計の ない 1 人の ときの 矢印などは かわらない）', () => {
    const pane: ArrowPane = { x: 0, y: 0, w: 640, h: 800 };
    for (const [dx, dy] of [[1, -1], [-1, -1], [0, -1], [1, 0.3], [0, 1]] as const) {
      const a = arrowPlace(dx, dy, pane);
      expect(arrowPlace(dx, dy, pane, undefined, null)).toEqual(a);
    }
  });

  it('out を 渡すと そこに 書いて 返す（avoid が あっても）', () => {
    const pane: ArrowPane = { x: 640, y: 0, w: 640, h: 800 };
    const clock = clockBoxAt(viewRects('split', 'split', 1, 1280, 800), 2, SIZE)!;
    const out = { x: 0, y: 0 };
    expect(arrowPlace(1, -1, pane, out, clock)).toBe(out);
  });

  it('DuoArrowTracker: step の avoid を うけて、2P の 右上に 出る 矢印も 時計の 下に ずれる', () => {
    const [w, h] = [1280, 800];
    const split = viewRects('split', 'split', 1, w, h);
    const pane = split.second!;
    const clock = clockBoxAt(split, 2, SIZE)!;
    const TAN = Math.tan((50 * Math.PI) / 360);
    const input = (avoid: ArrowPane | null): ArrowStepInput => ({
      // 右上の 遠くに 相手（はみ出して いる）
      rel: { right: 3 * 10 * TAN * (pane.w / pane.h), up: 3 * 10 * TAN, forward: 10 },
      distance: 30,
      pane,
      tanHalfFovY: TAN,
      panelOpen: false,
      avoid,
    });
    const run = (avoid: ArrowPane | null) => {
      const t = new DuoArrowTracker({ who: 2 });
      for (let i = 0; i < T.arrowHoldSteps; i++) t.step(input(avoid));
      return t.arrow()!;
    };
    const plain = run(null);
    const a = run(clock);
    expect(plain).not.toBeNull();
    expect(overlaps(plain, pane, clock)).toBe(true); // 時計に かかる 向き
    expect(overlaps(a, pane, clock)).toBe(false);
    expect(a.angle).toBeCloseTo(plain.angle, 5);
    expect(a.x).toBeCloseTo(plain.x, 5);
  });
});
