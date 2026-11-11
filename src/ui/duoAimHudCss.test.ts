import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { viewRects } from '../duo/viewRects';
import { aimPartAt } from './duoAimHud';

/**
 * COOP-1 5f-1: duoAimHud.ts の 基準の 点の ずれ（AIM_OFFSETS）が、1 人の ときの css の 位置と 同じ 関係か 見はる
 * （css の 数を かえたら ここが 落ちる。数の 写しが ずれないように）。
 */
const css = (p: string): string => readFileSync(p, 'utf8');

describe('照準まわりの ずれは 1 人の ときの css と 同じ', () => {
  it('token の 式（tokens.css の --rk-sp-N）は 0.85 倍〜1.5 倍・1280 幅', () => {
    const t = css('src/ui/theme/tokens.css');
    expect(t).toMatch(/--rk-sp-5: clamp\(calc\(24 \* 0\.85px\), calc\(24 \/ 12\.8 \* 1vw\), calc\(24 \* 1\.5px\)\);/);
    expect(t).toMatch(/--rk-sp-3: clamp\(calc\(12 \* 0\.85px\), calc\(12 \/ 12\.8 \* 1vw\), calc\(12 \* 1\.5px\)\);/);
  });
  it('ヒント＝ ＋の 下 sp-5・おしらせ＝ 右下 sp-3・構え＝ 右 28px', () => {
    expect(css('src/ui/actionHint.css')).toMatch(/top: calc\(50% \+ var\(--rk-sp-5\)\)/);
    expect(css('src/ui/notice.css')).toMatch(/left: calc\(50% \+ var\(--rk-sp-3\)\);\s*top: calc\(50% \+ var\(--rk-sp-3\)\)/);
    expect(css('src/ui/aimMarks.css')).toMatch(/left: calc\(50% \+ 28px\)/);
    expect(css('src/ui/aimMarks.css')).toMatch(/top: calc\(50% \+ 24px\)/);
  });
  it('1280 幅: ヒントは ＋の 24px 下・おしらせは 12px 右下・構えは 28px 右', () => {
    const r = viewRects('split', 'split', 1, 1280, 800);
    const c = aimPartAt(r, 1, 'cross')!;
    expect(aimPartAt(r, 1, 'hint')).toEqual({ x: c.x, y: c.y + 24 });
    expect(aimPartAt(r, 1, 'notice')).toEqual({ x: c.x + 12, y: c.y + 12 });
    expect(aimPartAt(r, 1, 'stance')).toEqual({ x: c.x + 28, y: c.y });
  });
  it('1024 幅: token は 0.85 倍で 止まる／1440 幅: 1.125 倍', () => {
    const c1 = aimPartAt(viewRects('split', 'split', 1, 1024, 700), 2, 'cross')!;
    expect(aimPartAt(viewRects('split', 'split', 1, 1024, 700), 2, 'hint')!.y - c1.y).toBeCloseTo(24 * 0.85, 5);
    const c2 = aimPartAt(viewRects('split', 'split', 1, 1440, 900), 2, 'cross')!;
    expect(aimPartAt(viewRects('split', 'split', 1, 1440, 900), 2, 'hint')!.y - c2.y).toBeCloseTo((24 / 12.8) * 14.4, 5);
  });
});
