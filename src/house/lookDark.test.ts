import { describe, expect, it } from 'vitest';
import type { BlockId } from '../contracts';
import { ArrayVoxelWorld } from '../world/VoxelWorld';
import { SkyDarkness } from '../world/light/skyDarkness';
import { WorldLight } from '../world/light/WorldLight';
import { HEIGHT } from './editor/tuning';
import { houseShape } from './shape';
import { ALL_KINDS, LIGHT_KINDS } from './recipes/kinds';
import { houseBox, kindBlocks, lookBp } from './recipes/lookKit';

/**
 * HOUSE-2B AC11（仕様 3.3 版 §2.4）: ほたるいし・すいしょう ランプの 家の 中に 妖怪が 湧かない。なしの 家（やね なし・かべ なし）でも 家の 中の マスで 夜 darkForSpawn が false。
 * houseLight.test.ts（HOUSE-1C AC24）と 同じ 手順。あかりの ブロックの 光る 強さは 登録表（BLOCK_TYPES）から 読まれる。
 */

const AT = { x: 10, y: 1, z: 10 };

function built(over: Parameters<typeof lookBp>[0]) {
  const w = new ArrayVoxelWorld({ x: 48, y: 16, z: 48 });
  w.fill(0, 0, 0, 47, 0, 47, 'stone');
  const d = new SkyDarkness();
  const l = new WorldLight(w, d);
  const bp = lookBp({ w: 7, d: 7, windows: 4, ...over });
  for (const c of houseShape(bp).cells) w.setBlock(AT.x + c.x, AT.y + c.y, AT.z + c.z, c.id as BlockId);
  d.value = 11; // 夜
  l.update();
  l.flush();
  const inside: Array<{ x: number; y: number; z: number }> = [];
  for (let gx = 0; gx < bp.w; gx++) for (let gz = 0; gz < bp.d; gz++) for (let y = AT.y + HEIGHT.floor; y < AT.y + HEIGHT.floor + HEIGHT.inner; y++) {
    const p = { x: AT.x + 1 + gx, y, z: AT.z + 1 + gz };
    if (w.getBlock(p.x, p.y, p.z) === 'air') inside.push(p);
  }
  return { w, l, bp, inside };
}

describe('AC11: あかり 3 つ とも 家の 中は 夜でも 湧かない', () => {
  for (const light of LIGHT_KINDS) {
    it(`あかり ${light}: 中の どの 空気の マスも darkForSpawn が false。あかりを ほると 湧く マスが でる（あかりの 力）`, () => {
      const { w, l, bp, inside } = built({ light });
      expect(inside.length, '調べる マスが ある').toBeGreaterThan(100);
      const dark = inside.filter((p) => l.isDarkForSpawn(p.x, p.y, p.z));
      expect(dark, `湧く マスが のこって いる: ${dark.map((p) => `${p.x},${p.y},${p.z}`).join(' ')}`).toEqual([]);
      expect(l.isDarkForSpawn(AT.x + 25, AT.y + 1, AT.z + 25), '家の 外の 夜の 地面は 湧く（家の 場所で 止めて いない）').toBe(true);
      // あかりの ブロックを ほる → 家の 中でも 湧く マスが でる
      const blocks = new Set<string>(kindBlocks('light', light));
      let removed = 0;
      for (const c of houseShape(bp).cells) {
        if (blocks.has(c.id)) {
          w.setBlock(AT.x + c.x, AT.y + c.y, AT.z + c.z, 'air');
          removed++;
        }
      }
      expect(removed, 'あかりの ブロックが 建って いた').toBeGreaterThan(0);
      l.update();
      l.flush();
      expect(inside.some((p) => l.isDarkForSpawn(p.x, p.y, p.z)), 'あかりを ほると 湧く マスが ある').toBe(true);
    });
  }
});

describe('AC11: なしの 家でも 家の 中は 夜でも 湧かない', () => {
  const variants: Array<[string, Parameters<typeof lookBp>[0]]> = [
    ['やね なし', { roof: 'none' }],
    ['かべ なし', { wall: 'none' }],
    ['まど なし', { windowKind: 'none' }],
    ['やね・かべ・まど なし', { roof: 'none', wall: 'none', windowKind: 'none' }],
    ...ALL_KINDS.roof.filter((k) => k !== 'none' && k !== 'flat').map((k): [string, Parameters<typeof lookBp>[0]] => [`やね ${k}`, { roof: k as never }]),
  ];
  for (const [label, over] of variants) {
    for (const light of LIGHT_KINDS) {
      it(`${label}・あかり ${light}: 中の どの 空気の マスも darkForSpawn が false・箱の 高さは houseBox`, () => {
        const { l, bp, inside } = built({ ...over, light });
        expect(houseShape(bp).cells.length).toBe(houseBox(bp).w * houseBox(bp).d * houseBox(bp).h);
        expect(inside.length, '調べる マスが ある').toBeGreaterThan(100);
        const dark = inside.filter((p) => l.isDarkForSpawn(p.x, p.y, p.z));
        expect(dark, `湧く マスが のこって いる: ${dark.map((p) => `${p.x},${p.y},${p.z}`).join(' ')}`).toEqual([]);
      });
    }
  }
});
