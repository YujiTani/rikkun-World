import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CHALK_MARK_IDS } from './chalkMark';
import { CHALK_TILE_NAMES, MINE_FLAT_TILE_NAMES, MINE_TILE_NAMES, chalkTileName } from './mineTextures';
import { BLOCK_TILES, TILE_NAMES, getTilePixels, type Rgba } from './textures';

/**
 * MINE-1B（#349）の 16×16 の 絵。平らな 絵 9 まいは art/MINE-1/<名前>/<名前>_rows.txt（yuzu 見本）と 1 画素ずつ 同じ。
 * チョークの しるしは 07-mine.md 20.10: 3 まい × 4 向き。向きを きめた あとで 右下に かげ（真っ白 なし）。
 */

const hexOf = (c: readonly number[]): string => '#' + c.slice(0, 3).map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();

/** art/MINE-1 の _rows.txt を 読む（16 ぎょうの 文字 ＋ 「# パレット …: A=#rrggbb …」の ぎょう） */
function readArt(dir: string): { rows: string[]; pal: Record<string, string> } {
  const text = readFileSync(fileURLToPath(new URL(`../../../art/MINE-1/${dir}/${dir}_rows.txt`, import.meta.url)), 'utf8');
  const lines = text.split('\n');
  const rows = lines.filter((l) => /^[A-Z.]{16}$/.test(l));
  const palLine = lines.find((l) => l.startsWith('# パレット'))!;
  const pal: Record<string, string> = {};
  for (const m of palLine.matchAll(/([A-Z])=(#[0-9A-Fa-f]{6})/g)) pal[m[1]!] = m[2]!.toUpperCase();
  return { rows, pal };
}

describe('MINE-1B 平らな 絵 9 まい', () => {
  it.each(MINE_FLAT_TILE_NAMES)('%s は _rows.txt と 同じ（16×16・ぜんぶ 不透明）', (name) => {
    const dir = name === 'coal_ore_b' ? 'coal_ore' : name === 'iron_ore_b' ? 'iron_ore' : name;
    const art = readArt(dir);
    expect(art.rows).toHaveLength(16);
    const px = getTilePixels(name);
    expect(px).toHaveLength(256);
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const c = px[y * 16 + x]!;
        expect(hexOf(c), `${name} (${x}, ${y})`).toBe(art.pal[art.rows[y]![x]!]);
        expect(c[3]).toBe(255);
      }
    }
  });

  it('ブロックの 絵に 入る（上・下・横が 同じ）。せきたん・てつは 今の 絵 coal_ore・iron_ore を かえず B の 絵に つなぐ', () => {
    for (const id of ['nendo', 'sekkaiseki', 'shikkui', 'hotaruishi', 'kin_ore', 'suisho_ore', 'diamond_ore'] as const) {
      expect(BLOCK_TILES[id], id).toEqual([id, id, id]);
    }
    expect(BLOCK_TILES.coal_ore).toEqual(['coal_ore_b', 'coal_ore_b', 'coal_ore_b']);
    expect(BLOCK_TILES.iron_ore).toEqual(['iron_ore_b', 'iron_ore_b', 'iron_ore_b']);
    // 今の 絵は のこっている（calm.test が 画素を 見る）
    expect(TILE_NAMES).toContain('coal_ore');
    expect(TILE_NAMES).toContain('iron_ore');
  });

  it('今の 絵の 位置は かわらない（新しい 絵は アトラスの さいごに 足す）', () => {
    const at = TILE_NAMES.indexOf(MINE_TILE_NAMES[0]!);
    expect(TILE_NAMES.slice(at, at + MINE_TILE_NAMES.length)).toEqual([...MINE_TILE_NAMES]); // この あとに 足した 絵（HOUSE-1C の 家・家具）が ならんでも 位置は 同じ
    expect(TILE_NAMES.indexOf('geyser_dirt_side')).toBeLessThan(at);
  });
});

describe('MINE-1B チョークの しるし（B2「てがき（ほそ線）」）', () => {
  const SHADOW = '#9C968C';
  const px = (name: (typeof CHALK_TILE_NAMES)[number]): readonly Rgba[] => getTilePixels(name);
  const isLine = (c: Rgba): boolean => c[3] === 255 && hexOf(c) !== SHADOW;
  const isShadow = (c: Rgba): boolean => c[3] === 255 && hexOf(c) === SHADOW;

  it('3 まい × 4 向き = 12 まい。16×16', () => {
    expect(CHALK_TILE_NAMES).toHaveLength(12);
    for (const n of CHALK_TILE_NAMES) expect(px(n)).toHaveLength(256);
  });

  it('線の 色は チョークの 白（真っ白 なし）。ざらざらは 線の 中だけ', () => {
    for (const n of CHALK_TILE_NAMES) {
      const colors = new Set(px(n).filter(isLine).map(hexOf));
      expect(colors.has('#FFFFFF')).toBe(false);
      for (const c of colors) expect(['#F2F0EA', '#DCD7CB', '#FAF9F5'], `${n} ${c}`).toContain(c);
    }
  });

  it('矢の 先が 絵の はしに ある: 右 e・左 w・上 n・下 s（向きを きめる まわし方）', () => {
    for (const k of [0, 1, 2]) {
      const has = (dir: 'n' | 'e' | 's' | 'w', f: (x: number, y: number) => boolean): boolean => px(chalkTileName(k, dir)).some((c, i) => isLine(c) && f(i % 16, Math.floor(i / 16)));
      expect(has('e', (x) => x >= 14), `sheet ${k} e`).toBe(true);
      expect(has('w', (x) => x <= 1), `sheet ${k} w`).toBe(true);
      expect(has('n', (_x, y) => y <= 1), `sheet ${k} n`).toBe(true);
      expect(has('s', (_x, y) => y >= 14), `sheet ${k} s`).toBe(true);
    }
  });

  it('線の 点の 数は 向きを かえても 同じ（まわす・はんてん するだけ）', () => {
    for (const k of [0, 1, 2]) {
      const n = (d: 'n' | 'e' | 's' | 'w'): number => px(chalkTileName(k, d)).filter(isLine).length;
      expect(n('w')).toBe(n('e'));
      expect(n('n')).toBe(n('e'));
      expect(n('s')).toBe(n('e'));
      expect(n('e')).toBeGreaterThan(30);
    }
  });

  it('かげ: 線の 右・下・右下の 線でない 点だけ（向きを きめた あとの 絵で いつも 右下）', () => {
    for (const n of CHALK_TILE_NAMES) {
      const t = px(n);
      for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 16; x++) {
          const c = t[y * 16 + x]!;
          const lineAt = (xx: number, yy: number): boolean => xx >= 0 && yy >= 0 && isLine(t[yy * 16 + xx]!);
          const shaded = lineAt(x - 1, y) || lineAt(x, y - 1) || lineAt(x - 1, y - 1);
          if (isLine(c)) continue;
          expect(isShadow(c), `${n} (${x}, ${y})`).toBe(shaded);
          if (!shaded) expect(c[3], `${n} (${x}, ${y}) すきとおる`).toBe(0);
        }
      }
    }
  });

  it('右むき（e）の かげは 元の 絵（07-mine.md 20.10 の 文字の 絵）の s と 同じ 場所', () => {
    const doc = readFileSync(fileURLToPath(new URL('../../../docs/art/design/07-mine.md', import.meta.url)), 'utf8');
    const block = doc.slice(doc.indexOf('B2-1             B2-2             B2-3'));
    const lines = block.split('\n').slice(1, 17);
    expect(lines).toHaveLength(16);
    for (let k = 0; k < 3; k++) {
      const t = px(chalkTileName(k, 'e'));
      for (let y = 0; y < 16; y++) {
        const row = lines[y]!.slice(k * 17, k * 17 + 16);
        for (let x = 0; x < 16; x++) {
          const ch = row[x]!;
          const c = t[y * 16 + x]!;
          if (ch === 's') expect(isShadow(c), `sheet ${k} (${x}, ${y}) かげ`).toBe(true);
          else if (ch === '.') expect(c[3], `sheet ${k} (${x}, ${y}) すきとおる`).toBe(0);
          else expect(isLine(c), `sheet ${k} (${x}, ${y}) 線`).toBe(true);
        }
      }
    }
  });

  it('しるしの ブロック 12 こは どれも 絵を もつ（かけらの 色など）', () => {
    for (const id of CHALK_MARK_IDS) expect(BLOCK_TILES[id], id).toHaveLength(3);
  });
});
