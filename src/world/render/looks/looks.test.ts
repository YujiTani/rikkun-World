import { describe, expect, it } from 'vitest';
import { BLOCK_TYPES } from '../../blocks/blockTypes';
import '../../../proto/voxel/meshVoxel';
import {
  ALL_FACES,
  ALL_LOOKS,
  FACE_BIT,
  LOOK_N,
  LOOK_VOLUME,
  fillBlockLook,
  findLook,
  hasLook,
  setCurrentLook,
} from './index';

const idOf = (k: number): string => BLOCK_TYPES[k].id;
const indexOf = (id: string): number => BLOCK_TYPES.findIndex((t) => t.id === id);

function boundaryEmpty(out: Uint8Array, face: number): number {
  let n = 0;
  for (let y = 0; y < LOOK_N; y++) {
    for (let z = 0; z < LOOK_N; z++) {
      for (let x = 0; x < LOOK_N; x++) {
        const on = [y === 8, y === 0, x === 8, x === 0, z === 8, z === 0][face];
        if (on && out[(y * 9 + z) * 9 + x] === 0) n++;
      }
    }
  }
  return n;
}

describe('見た目の登録', () => {
  it('placeholder がある。id は 重ならない', () => {
    expect(findLook('placeholder')).toBeDefined();
    const ids = ALL_LOOKS.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/);
  });
});

for (const look of ALL_LOOKS) {
  describe(`見た目: ${look.id}`, () => {
    const use = (): number[] => {
      setCurrentLook(look.id);
      return BLOCK_TYPES.map((_, i) => i).filter((i) => hasLook(i));
    };

    it('空と霧が決まっている。パレットは 255 色まで', () => {
      expect(look.palette.length).toBeLessThanOrEqual(256 * 3);
      expect(look.palette.length % 3).toBe(0);
      expect(look.fog.far).toBeGreaterThan(look.fog.near);
    });

    it('世界のブロックに形がある（水・十字の板・たいまつ・空気には無い）', () => {
      const kinds = use().map(idOf);
      for (const id of ['grass', 'dirt', 'stone', 'sand', 'coal_ore', 'iron_ore', 'log', 'leaves']) expect(kinds).toContain(id);
      for (const id of ['air', 'water', 'torch', 'crop_onion']) expect(kinds).not.toContain(id);
    });

    it('同じ入力からは いつも同じ形。位置がちがうと形がかわる', () => {
      const kinds = use();
      const a = new Uint8Array(LOOK_VOLUME);
      const b = new Uint8Array(LOOK_VOLUME);
      for (const k of kinds) {
        fillBlockLook(k, 3, 4, 5, ALL_FACES, a);
        fillBlockLook(k, 3, 4, 5, ALL_FACES, b);
        expect(Array.from(a)).toEqual(Array.from(b));
      }
      const c = new Uint8Array(LOOK_VOLUME);
      fillBlockLook(indexOf('stone'), 3, 4, 5, ALL_FACES, a);
      fillBlockLook(indexOf('stone'), 9, 4, 5, ALL_FACES, c);
      expect(Array.from(a)).not.toEqual(Array.from(c));
    });

    it('見えない面（となりにくっつく面）の外側は ぜんぶ つまっている（すきまのある種類以外）', () => {
      const kinds = use();
      const out = new Uint8Array(LOOK_VOLUME);
      for (const k of kinds) {
        if (look.kinds[idOf(k)].occludes === false) continue;
        for (let h = 0; h < 6; h++) {
          for (let face = 0; face < 6; face++) {
            fillBlockLook(k, h * 7, 3, h * 3, ALL_FACES & ~FACE_BIT[face], out);
            expect(boundaryEmpty(out, face), `${idOf(k)} face ${face}`).toBe(0);
          }
        }
        fillBlockLook(k, 1, 1, 1, 0, out);
        expect(out.every((v) => v !== 0)).toBe(true);
      }
    });

    // TEX-A（#146）: 色は 3D の模様ではなく 16×16 の絵の投影。パレット・3D テクスチャの色のテストは
    // 投影のユニット（developer が TDD で書く: 面・座標 → タイル・画素）に置きかえる。形のテスト（つまり方・決定的）は上にのこしてある
    it.todo('色は投影のユニットで見る（パレット・shapeTexture の色は描画に使わない）');

    // TEX-A: 道具 7 種は平らな箱（5.3）で、小ブロックの形を持たない
    // 本番の見た目（gotsugotsu）だけ。ほかの試作の見た目は対象外
    if (look.id === 'gotsugotsu') it('道具 7 種（かまど・たんす・スプリンクラー・レンガ・かわら・はたけ・ぬれたはたけ）は形を持たない（TEX-A）', () => {
      const kinds = use().map(idOf);
      for (const id of ['furnace', 'tansu', 'sprinkler', 'brick', 'kawara', 'farmland', 'farmland_wet']) expect(kinds).not.toContain(id);
      // 鉱石は地形なので でこぼこのまま
      for (const id of ['coal_ore', 'iron_ore']) expect(kinds).toContain(id);
    });
  });
}

describe('placeholder のでこぼこ', () => {
  it('くさは 上が見えるとき上の段がでこぼこ、石は表面が所々へこむ', () => {
    setCurrentLook('placeholder');
    const out = new Uint8Array(LOOK_VOLUME);
    fillBlockLook(indexOf('grass'), 2, 2, 2, ALL_FACES, out);
    let topFilled = 0;
    for (let z = 0; z < 9; z++) for (let x = 0; x < 9; x++) if (out[(8 * 9 + z) * 9 + x] !== 0) topFilled++;
    expect(topFilled).toBeGreaterThan(10);
    expect(topFilled).toBeLessThan(81);
    let dents = 0;
    for (let i = 0; i < 20; i++) {
      fillBlockLook(indexOf('stone'), i, 2, 2, ALL_FACES, out);
      dents += out.filter((v) => v === 0).length;
    }
    expect(dents).toBeGreaterThan(20);
  });
});
