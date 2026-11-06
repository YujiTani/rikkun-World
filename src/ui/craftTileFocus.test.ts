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
});
