import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { THUNDER_ASSETS } from './thunderModel';

/**
 * ART-PIPE-1 AC14（docs/design/ART-PIPE-1.md 1.1 §4.7）: 絵の 読み方（3 まいとも Nearest・ミップマップなし・sRGB・足し算・深さを 書かない・読む）。
 * 要る 名前（developer が `src/legend/thunderModel.ts` に 作る）:
 *   THUNDER_ASSETS = { sheet / ground / spark: { file, width, height, filter: 'nearest', mipmaps: false, colorSpace: 'srgb' }, blending: 'additive', depthWrite: false, depthTest: true }
 * 実際の テクスチャが この 設定で 作られて いる ことは E2E（e2e/artPipe1.spec.ts の AC14）が `__rikkun.thunder.textures()` で 確かめる。
 */

const png = (file: string) => {
  const b = readFileSync(`public/models/fx/${file}`);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
};

describe('AC14: 絵の 読み方', () => {
  it('3 まいとも Nearest・ミップマップなし・sRGB', () => {
    for (const k of ['sheet', 'ground', 'spark'] as const) {
      const a = THUNDER_ASSETS[k];
      expect(a.filter, k).toBe('nearest');
      expect(a.mipmaps, k).toBe(false);
      expect(a.colorSpace, k).toBe('srgb');
    }
  });
  it('足し算・深さを 書かない・深さを 読む', () => {
    expect(THUNDER_ASSETS.blending).toBe('additive');
    expect(THUNDER_ASSETS.depthWrite).toBe(false);
    expect(THUNDER_ASSETS.depthTest).toBe(true);
  });
  it('ファイルの 大きさ: 1024×1024・256×128・16×4。どれも 4096 以下（2 の 累乗）', () => {
    expect(THUNDER_ASSETS.sheet.file).toBe('thunder_b_sheet.png');
    expect(THUNDER_ASSETS.ground.file).toBe('thunder_b_ground.png');
    expect(THUNDER_ASSETS.spark.file).toBe('thunder_b_spark.png');
    expect([THUNDER_ASSETS.sheet.width, THUNDER_ASSETS.sheet.height]).toEqual([1024, 1024]);
    expect([THUNDER_ASSETS.ground.width, THUNDER_ASSETS.ground.height]).toEqual([256, 128]);
    expect([THUNDER_ASSETS.spark.width, THUNDER_ASSETS.spark.height]).toEqual([16, 4]);
    for (const k of ['sheet', 'ground', 'spark'] as const) {
      const a = THUNDER_ASSETS[k];
      const f = png(a.file);
      expect([f.w, f.h], a.file).toEqual([a.width, a.height]);
      expect(f.w).toBeLessThanOrEqual(4096);
      expect(f.h).toBeLessThanOrEqual(4096);
      expect(Math.log2(f.w) % 1).toBe(0);
      expect(Math.log2(f.h) % 1).toBe(0);
    }
  });
  it('thunder_sheet.png は 読みこまない（コードに 名前が ない）。thunder_ground.png は ため中の 手の 光・ためいっぱいの わが 使う ので のこす', () => {
    const src = readFileSync('src/fx/thunderFx.ts', 'utf8');
    expect(src).not.toContain('thunder_sheet.png');
    expect(src).toContain('thunder_ground.png');
    expect(() => readFileSync('public/models/fx/thunder_ground.png')).not.toThrow();
  });
});
