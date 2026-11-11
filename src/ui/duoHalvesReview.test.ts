import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** COOP-1 5f-2 コードレビューの 軽微（配線の 見はり）。 */
const read = (p: string): string => readFileSync(p, 'utf8');

describe('5f-2 レビュー: 軽微 1・4', () => {
  it('たおした 妖怪の 実績は たおした 人の 持ち主で 数える（ui.ts の onDefeatAch が withWho で 包む）', () => {
    expect(read('src/game/wire/ui.ts')).toMatch(/achievements\.withWho\(\s*who\s*,\s*\(\)\s*=>\s*achievements\.feedDefeat\(/);
  });
  it('projectPane は 2 人でない ときは 何も 投げない', () => {
    const s = read('src/ui/duoHalves.ts');
    const m = /projectPane\([^)]*\): void \{\s*\n\s*if \(!this\.on\) return;/.exec(s);
    expect(m).not.toBeNull();
  });
});
