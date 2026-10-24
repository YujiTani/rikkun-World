import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * 重なり順（メニュー・本・ポーズ画面 < 実績の おしらせ。ボスの 体力ゲージは メニューより 下）。
 * #hud は position:fixed で 自分だけの 重なりの 箱になる（z-index なし = 0 の 段）。
 * 体力ゲージは #hud の 中に 置いて 低い z-index（メニュー類の 8〜20 より 下）にする。
 * 実績の 帯は body 直下に 置いて（z-index 45）、#hud の 箱ぜんたいより 上に 出す（スタートメニュー 100 には 負ける）。
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
  const zOf = (css: string): number => Number(/z-index:\s*(\d+)/.exec(css)![1]);
  const menuZs = [
    zOf(blockOf(read('../inventoryScreen.css'), '#inventory-screen')),
    zOf(blockOf(read('../playOverlay.css'), '.play-overlay')),
  ];
  const band = blockOf(celCss, '.cel-layer--band');
  const bandZ = Number(/z-index:\s*(\d+)/.exec(band)![1]);
  const startZ = Number(/\.sm-root\{[^}]*z-index:(\d+)/.exec(startMenu)![1]);

  it('体力ゲージは #hud の 中の fixed（#hud が なければ body）', () => {
    expect(hpBar).toMatch(/\(document\.getElementById\('hud'\) \?\? document\.body\)\.appendChild\(this\.root\)/);
    expect(hpBar).not.toContain('document.body.appendChild(this.root)');
  });
  it('体力ゲージの z-index は メニュー（持ち物・ポーズ画面）より 下', () => {
    expect(menuZs.every((z) => z > 0)).toBe(true);
    expect(hpZ).toBeLessThan(Math.min(...menuZs));
    expect(hpZ).toBeGreaterThan(0);
  });
  it('帯の z-index は スタートメニューより 下。帯は body 直下なので #hud の 中の 体力ゲージ・メニューより 上', () => {
    expect(bandZ).toBeLessThan(startZ);
    expect(bandZ).toBeGreaterThan(0);
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
