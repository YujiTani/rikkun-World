import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('レシピの マスは コントローラーの 十字で 動ける', () => {
  it('makeTile が data-menu-item と tabIndex 0 を つける（もちものの マスと おなじ）', () => {
    const src = readFileSync(new URL('./craftPanel.ts', import.meta.url), 'utf8');
    const body = src.slice(src.indexOf('private makeTile'), src.indexOf('// ---- 状態'));
    expect(body).toContain("root.classList.add('cp-tile')");
    expect(body).toContain("root.dataset.menuItem = ''");
    expect(body).toContain('root.tabIndex = 0');
  });

  it('マスに フォーカスが 来たら hover(id) で せつめいを 切りかえる（のこった マウスの hovered_ に まけない）。blur では 消さない', () => {
    const src = readFileSync(new URL('./craftPanel.ts', import.meta.url), 'utf8');
    const body = src.slice(src.indexOf('private makeTile'), src.indexOf('// ---- 状態'));
    expect(body).toContain("root.addEventListener('focus', () => this.hover(r.id))");
    // マウス・十字・B の いちばん 最後が かつ: mouseenter / focus は どちらも hovered_ を 上書きし、mouseleave は 自分の マスの ときだけ 消す
    expect(body).toContain("root.addEventListener('mouseenter', () => this.hover(r.id))");
    expect(body).toContain('if (this.hovered_ === r.id) this.hover(null)');
    expect(src.slice(src.indexOf('tileClick(id: string): TileClickResult'), src.indexOf('detailPress(): CraftClickResult'))).toContain('this.hovered_ = id');
    expect(body).not.toContain("'blur'");
    expect(body).not.toContain("'focusout'");
  });

  it('せつめい パネルの 中の ボタン・えらべる 燃料チップは 十字で 動ける（menuItems に 入る）', () => {
    const src = readFileSync(new URL('./craftPanel.detail.ts', import.meta.url), 'utf8');
    expect(src).toContain("createButton({ text: 'つくる'");
    expect(src).toContain("createButton({ text: '' })"); // ページ送りの ▲
    const fuel = src.slice(src.indexOf("chip.classList.add('cp-fuelchip')"));
    expect(fuel.slice(0, 600)).toContain("chip.dataset.menuItem = ''");
    expect(fuel.slice(0, 600)).toContain('chip.tabIndex = 0');
  });
});
