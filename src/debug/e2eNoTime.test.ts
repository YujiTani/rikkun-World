import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * #255・#130: E2E は 時間（ms）で 合否を 決めない。CI は GPU なしで おそく、少しの 重さの ちがいで 落ちるので。
 * 重さは 仕事の数・描画回数・三角形の ふえ で見て、本当の 速さは `npm run perf`（e2e-perf/）で 見る。
 * ゲームの中の 時間（アニメの長さ など）を ms で 見る 行だけ、その行に `// 時間でない` を 書く。
 */
const ROOT = 'e2e';
const TIME = /\bexpect(?:\.soft)?\(.*(?:\b[A-Za-z_]\w*Ms\b|\bms\b|performance\.now)/;
const OK = '// 時間でない';

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
  });

describe('E2E は 時間で 合否を 決めない（#255）', () => {
  it('E2E の expect に ms・performance.now が ない', () => {
    const bad: string[] = [];
    for (const f of files(ROOT)) {
      readFileSync(f, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (TIME.test(line) && !line.includes(OK)) bad.push(`${f}:${i + 1}: ${line.trim()}`);
        });
    }
    expect(bad, '時間は 記録だけに して、仕事の数や 描画回数の ふえで 見る（docs/rules.md C）').toEqual([]);
  });

  it('見張りの 形が 時間の 上限を みつける', () => {
    expect(TIME.test("expect(r.addMs / r.baseMs, 'ふえ').toBeLessThanOrEqual(0.5);")).toBe(true);
    expect(TIME.test('expect(performance.now() - t0).toBeLessThan(25);')).toBe(true);
    expect(TIME.test('expect(r.on.dc - r.zero.dc).toBeLessThanOrEqual(18);')).toBe(false);
  });
});
