import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * 重なり順（実績の おしらせは ボスの 体力ゲージより 上）。
 * #hud は position:fixed で 自分だけの 重なりの 箱になる（z-index なし = 0 の 段）。
 * その 中の 実績の 帯が いくら z-index を 上げても、body 直下の 体力ゲージ(40) には 勝てない。
 * だから 帯は body 直下に 置いて、body 直下どうし（体力ゲージ 40 < 帯 45 < スタートメニュー 100）で 比べる。
 */
const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const blockOf = (css: string, selector: string): string => {
  const i = css.indexOf(selector + ' {');
  expect(i, `${selector} が css に ない`).toBeGreaterThanOrEqual(0);
  return css.slice(i, css.indexOf('}', i));
};

describe('実績の おしらせの 重なり順', () => {
  const celCss = read('./celebrate.css');
  const hpBar = read('../../proto/gashaBigHpBar.ts');
  const startMenu = read('../../start/startMenu.css');
  const hpZ = Number(/position:fixed;[^`]*z-index:(\d+)/.exec(hpBar)![1]);
  const band = blockOf(celCss, '.cel-layer--band');
  const bandZ = Number(/z-index:\s*(\d+)/.exec(band)![1]);
  const startZ = Number(/\.sm-root\{[^}]*z-index:(\d+)/.exec(startMenu)![1]);

  it('体力ゲージは body 直下の fixed（z-index 40）', () => {
    expect(hpBar).toContain('document.body.appendChild(this.root)');
    expect(hpZ).toBe(40);
  });
  it('帯の z-index は 体力ゲージより 上、スタートメニューより 下', () => {
    expect(bandZ).toBeGreaterThan(hpZ);
    expect(bandZ).toBeLessThan(startZ);
  });
  it('#hud は z-index を 持たない（持つと 体力ゲージや スタートメニューとの 順番が 変わる）', () => {
    expect(blockOf(read('../style.css'), '#hud')).not.toMatch(/z-index/);
  });
  it('帯は body 直下に 置く（main.ts が topLayer に body を 渡す）', () => {
    const main = read('../../main.ts');
    expect(main).toMatch(/new CelebrateUi\(\{[^]*?topLayer: document\.body/);
  });
  it('帯は #hud の 外でも 字の 色と ふちが 同じ（#hud から 受けていた 分を 帯に 持たせる）', () => {
    expect(band).toMatch(/text-shadow:/);
    expect(band).toMatch(/color:/);
  });
});
