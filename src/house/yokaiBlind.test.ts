import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * HOUSE-1A AC4（建築士さんは 妖怪に ねらわれない。docs/design/HOUSE-1.md §2.2-3）の 作りの 見張り。
 * 妖怪の 側（src/yokai・src/content/yokai）が 建築士さん・家（src/house）を 1 つも 読みこまない 限り、
 * 妖怪の 目標・当たり・一覧に 建築士さんが 入りようが ない。ここが 読みこみ はじめたら この 試験が 赤に なる
 * （ほんとうに 要るなら、妖怪が ねらう 一覧の 作りを 見なおしてから 直す）。
 */
const ROOTS = ['src/yokai', 'src/content/yokai'];

/** テスト以外の .ts（テストは 組みあわせの 確かめで 読みこんで よい） */
const sources = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return sources(p);
    return /\.ts$/.test(p) && !/\.(test|spec)\.ts$/.test(p) ? [p] : [];
  });

/** `from '…house…'`・`import('…house…')`・`import '…house…'` の 道すじに house が ある 行 */
const HOUSE_IMPORT = /(?:\bfrom\s*|\bimport\s*\(?\s*)['"][^'"\n]*\bhouse\b[^'"\n]*['"]/;

describe('妖怪は 建築士さんを 知らない（AC4 の 作りの 見張り）', () => {
  it('src/yokai・src/content/yokai の どの ファイルも house を 読みこまない', () => {
    const files = ROOTS.flatMap(sources);
    expect(files.length, '見る ファイルが 1 つも ない（道すじの まちがい）').toBeGreaterThan(5);
    const bad: string[] = [];
    for (const f of files) {
      readFileSync(f, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (HOUSE_IMPORT.test(line)) bad.push(`${f}:${i + 1}: ${line.trim()}`);
        });
    }
    expect(bad, '妖怪の 側から 建築士さん・家を 読みこまない（妖怪は 建築士さんを ねらわない）').toEqual([]);
  });

  it('見張りの 形が 読みこみを みつける', () => {
    expect(HOUSE_IMPORT.test("import { HouseSystem } from '../house/system';")).toBe(true);
    expect(HOUSE_IMPORT.test('import type { Architect } from "../../house/architect";')).toBe(true);
    expect(HOUSE_IMPORT.test("const m = await import('../house/manager');")).toBe(true);
    expect(HOUSE_IMPORT.test("import '../house/hook';")).toBe(true);
    expect(HOUSE_IMPORT.test("import { createHouseHook } from '../game/wire/house';")).toBe(true);
    // 関係ない 文字（house という 語が 道すじに ない）は 見ない
    expect(HOUSE_IMPORT.test("import { createRng } from '../world/gen/random';")).toBe(false);
    expect(HOUSE_IMPORT.test("// house の はなし（コメント）")).toBe(false);
  });
});
