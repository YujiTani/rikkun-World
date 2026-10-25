import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * #311: アイテム・実績・レシピなどの 登録表の「数」を テストに 決め打ちしない。
 * 1 つ 足すたびに 関係ない テストまで こわれるので。数えたいときは 表から 数える
 * （`new Set(ids).size` と `ids.length` を くらべる、`CRAFT_RECIPE_NAMES.length` を 使う など）。
 * 足し忘れは src/content/completeness.test.ts、値の ずれは src/content/snapshot.test.ts が 見る。
 * 見るのは 2 けた 以上の 数（1 けたは その 機能の 分だけ 選んで 数える 確かめ）。どうしても 数を 見る 行だけ、その行に `// 数の決め打ちOK` を 書く。
 */
const ROOTS = ['src', 'e2e'];
const TABLES = 'ACHIEVEMENT_DEFS|ITEM_TYPES|ITEM_INFO|ITEM_DEFS|CATEGORY_ITEMS|CRAFT_RECIPES|BASE_RECIPES|BAKE_RECIPES|ALL_RECIPES|CRAFT_RECIPE_NAMES|BLOCK_TYPES';
const FIXED = new RegExp(`\\b(?:${TABLES})\\b[^;]*?(?:\\.(?:length|size)\\)\\.toBe\\(\\d{2}|\\)\\.toHaveLength\\(\\d{2})`);
const OK = '// 数の決め打ちOK';

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.(test|spec)\.ts$/.test(p) ? [p] : [];
  });

describe('登録表の 数を テストに 決め打ちしない（#311）', () => {
  it('テストに 表の 数の 決め打ちが ない', () => {
    const bad: string[] = [];
    for (const f of ROOTS.flatMap(files)) {
      if (f.endsWith('noFixedCounts.test.ts')) continue;
      readFileSync(f, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (FIXED.test(line) && !line.includes(OK)) bad.push(`${f}:${i + 1}: ${line.trim()}`);
        });
    }
    expect(bad, '表から 数える 形に する（docs/rules.md C・#311）').toEqual([]);
  });

  it('見張りの 形が 決め打ちを みつける', () => {
    expect(FIXED.test('expect(ITEM_TYPES).toHaveLength(95);')).toBe(true);
    expect(FIXED.test('expect(ACHIEVEMENT_DEFS.length).toBe(284);')).toBe(true);
    expect(FIXED.test('expect(new Set(ACHIEVEMENT_DEFS.map((d) => d.id)).size).toBe(284);')).toBe(true);
    expect(FIXED.test('expect(ACHIEVEMENT_DEFS.filter((d) => d.small).length).toBe(89);')).toBe(true);
    expect(FIXED.test('expect(new Set(ACHIEVEMENT_DEFS.map((d) => d.id)).size).toBe(ACHIEVEMENT_DEFS.length);')).toBe(false);
    // 1 けた（その 機能の 数こ だけを 選んで 数える）は 見ない
    expect(FIXED.test("expect(ITEM_TYPES.filter((t) => t.id === 'raijin_ken')).toHaveLength(1);")).toBe(false);
  });
});
