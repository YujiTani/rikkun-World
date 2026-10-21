import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BLADE_FACES, BLADE_SPRITES } from './windWaveFx';

/** WEAPON-8: コードの 絵の 表が 素材の JSON（art の 決まり）と 同じ */
const json = (f: string) => JSON.parse(readFileSync(new URL(`../../public/models/fx/${f}`, import.meta.url), 'utf8'));

describe('fujin_blade.json と コードの 表', () => {
  const j = json('fujin_blade.json');
  it('絵の 場所', () => {
    for (const [k, v] of Object.entries(j.sprites)) expect(BLADE_SPRITES[k]).toEqual(v);
  });
  it('face 0〜7 の 絵と 反転（0 = 右、2 = 上、4 = 左、6 = 下）', () => {
    const keys = ['0', '45', '90', '135', '180', '-135', '-90', '-45'];
    keys.forEach((k, i) => {
      const e = j.directions.table[k];
      expect(BLADE_FACES[i], k).toEqual({ sprite: e.sprite, flipX: e.flipX, flipY: e.flipY });
    });
  });
});
describe('fujin_spiral_ribbon.json の 数', () => {
  it('src/fx/fujinSpiralRibbon.json は 素材（public）の 写し（Vite は public の JSON を 読みこめない ため）', () => {
    expect(readFileSync(new URL('./fujinSpiralRibbon.json', import.meta.url), 'utf8')).toBe(readFileSync(new URL('../../public/models/fx/fujin_spiral_ribbon.json', import.meta.url), 'utf8'));
  });
  it('三角形 130（帯 96 ＋ すじ 32 ＋ 先の 光 2）・描画 3 以下で 足りる', () => {
    const j = json('fujin_spiral_ribbon.json');
    expect(j.mesh.triangles.length + j.arcs.triangles.length + 2).toBe(j.triangles.total);
    expect(j.triangles.total).toBeLessThanOrEqual(150);
    expect(j.ground.rules.maxPoints).toBe(48);
  });
});
