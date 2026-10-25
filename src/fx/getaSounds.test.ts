import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createRng } from '../world/gen/random';
import { GETA_FILES, pickGetaVariant, playGeta } from './getaSounds';
import { drainSounds } from './soundLog';

/**
 * SAMURAI-1（#300）§3.3: 下駄の 音 `getaStep`（AC14 の「鳴る」の 中身）。実装の 前の テスト（赤）。
 * 窓口 の 形（legendSounds.ts と 同じ 相対パス）:
 *   getaSounds.ts   `GETA_FILES`（`./sound/geta/geta_0.ogg` 〜 `geta_3.ogg` の 4 つ。0・1 = カラン、2・3 = コロン）
 *                   `pickGetaVariant(rng, last)` → 0〜3（last と 同じ 番号を 続けて 選ばない。last が null なら どれでも。乱数 1 つ）
 *                   `playGeta(sound, rng?)` … 4 つ から 1 つ 鳴らす（ファイルが 読めて いない ときは 合成音で 代わり）。`combat.sounds()` の 名前は `getaStep`（1 回 = 1 つ）
 * 音ファイルの 納品（サウンドの 係。docs/audio/SOUND.md）: public/sound/geta/geta_0〜3.ogg と README.md（出どころ 効果音ラボ・規約）。
 * 聞いた 感じ（カランコロンと 分かる・うるさく ない・うでの ふりと ずれない）は AC23 の オーナー確認。
 */
describe('§3.3 下駄の 音', () => {
  it('GETA_FILES は 4 つ（legend と 同じ 相対パス）', () => {
    expect(GETA_FILES).toEqual([0, 1, 2, 3].map((i) => `./sound/geta/geta_${i}.ogg`));
  });
  it('音ファイルと README が public/sound/geta/ に ある（サウンドの 係の 納品）', () => {
    for (let i = 0; i < 4; i++) {
      const p = resolve(__dirname, `../../public/sound/geta/geta_${i}.ogg`);
      expect(existsSync(p), `geta_${i}.ogg`).toBe(true);
      expect(readFileSync(p).subarray(0, 4).toString('latin1'), `geta_${i}.ogg は ogg`).toBe('OggS');
    }
    const readme = resolve(__dirname, '../../public/sound/geta/README.md');
    expect(existsSync(readme), 'README.md').toBe(true);
    expect(readFileSync(readme, 'utf8')).toContain('効果音ラボ');
  });
  it('pickGetaVariant: 0〜3。last と 同じ 番号を 続けて 選ばない（くり返し 3,000 回）', () => {
    const rng = createRng(5);
    let last: number | null = null;
    const seen = new Set<number>();
    for (let i = 0; i < 3000; i++) {
      const v = pickGetaVariant(rng, last);
      expect([0, 1, 2, 3]).toContain(v);
      if (last !== null) expect(v, `${i} 回目`).not.toBe(last);
      seen.add(v);
      last = v;
    }
    expect(seen.size).toBe(4);
  });
  it('pickGetaVariant: 乱数は 1 つ。同じ シード → 同じ 並び', () => {
    let n = 0;
    pickGetaVariant(() => (n++, 0.5), null);
    expect(n).toBe(1);
    n = 0;
    pickGetaVariant(() => (n++, 0.5), 2);
    expect(n).toBe(1);
    const run = (seed: number) => {
      const r = createRng(seed);
      const out: number[] = [];
      let last: number | null = null;
      for (let i = 0; i < 40; i++) out.push((last = pickGetaVariant(r, last)));
      return out;
    };
    expect(run(7)).toEqual(run(7));
    expect(run(7)).not.toEqual(run(8));
  });
  it('playGeta: 1 回 鳴らすと 音の 名前の 記録に getaStep が ちょうど 1 つ（ファイルが 読めて いなくても）', () => {
    drainSounds();
    const tones: unknown[] = [];
    playGeta({ playTones: (t: unknown) => void tones.push(t) } as never, createRng(1));
    expect(drainSounds().filter((x) => x === 'getaStep')).toHaveLength(1);
    playGeta({ playTones: () => {} } as never, createRng(2));
    playGeta({ playTones: () => {} } as never, createRng(3));
    expect(drainSounds().filter((x) => x === 'getaStep')).toHaveLength(2);
  });
});
