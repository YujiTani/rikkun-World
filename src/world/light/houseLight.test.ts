import { describe, expect, it } from 'vitest';
import type { BlockId } from '../../contracts';
import { ROOF_Y } from '../../house/editor/tuning';
import { houseShape } from '../../house/shape';
import { ArrayVoxelWorld } from '../VoxelWorld';
import { SkyDarkness } from './skyDarkness';
import { WorldLight } from './WorldLight';

/** HOUSE-1C PR-1（AC24）: できた 家の 中は 夜でも 湧かない 場所〔天井の ちょうちん〕。ちょうちんを ほると もどる（家の 場所で 湧きを 止めて いない） */

const AT = { x: 10, y: 1, z: 10 };

function built(windows: number) {
  const w = new ArrayVoxelWorld({ x: 48, y: 16, z: 48 });
  w.fill(0, 0, 0, 47, 0, 47, 'stone');
  const d = new SkyDarkness();
  const l = new WorldLight(w, d);
  const bp = { w: 7 as const, d: 7 as const, windows, furniture: [{ kind: 'table' as const, x: 0, z: 0, rot: 0 as const }, { kind: 'chair' as const, x: 5, z: 5, rot: 2 as const }] };
  const shape = houseShape(bp);
  for (const c of shape.cells) w.setBlock(AT.x + c.x, AT.y + c.y, AT.z + c.z, c.id as BlockId);
  d.value = 11; // 夜（空の 光が 7 以下に なる くらい）
  l.update();
  l.flush();
  const lantern = { x: AT.x + 1 + 3, y: AT.y + ROOF_Y - 1, z: AT.z + 1 + 3 };
  /** 中の 空気の マス〔家具・ちょうちんの マスいがい〕 */
  const inside: Array<{ x: number; y: number; z: number }> = [];
  for (let gx = 0; gx < 7; gx++) for (let gz = 0; gz < 7; gz++) for (let y = AT.y + 1; y < AT.y + ROOF_Y; y++) {
    const p = { x: AT.x + 1 + gx, y, z: AT.z + 1 + gz };
    if (w.getBlock(p.x, p.y, p.z) === 'air') inside.push(p);
  }
  return { w, l, d, lantern, inside };
}

describe('家の 中は 夜でも 湧かない（AC24）', () => {
  for (const windows of [0, 4]) {
    it(`窓 ${windows}: 中の どの マスも darkForSpawn が false。ちょうちんを ほると まん中の 床の 上が true に もどる`, () => {
      const { w, l, lantern, inside } = built(windows);
      expect(w.getBlock(lantern.x, lantern.y, lantern.z), '天井の ちょうちん').toBe('lantern');
      expect(inside.length, '調べる マスが ある').toBeGreaterThan(100);
      const dark = inside.filter((p) => l.isDarkForSpawn(p.x, p.y, p.z));
      expect(dark, `湧く マスが のこって いる: ${dark.map((p) => `${p.x},${p.y},${p.z}`).join(' ')}`).toEqual([]);
      // 家の 外の 夜の 地面は 湧く（家の 場所で 止めて いるのでは ない）
      expect(l.isDarkForSpawn(AT.x + 25, AT.y + 1, AT.z + 25), 'ちょうちんの はんい〔16 マス〕の 外は 湧く').toBe(true);

      w.setBlock(lantern.x, lantern.y, lantern.z, 'air');
      l.update();
      l.flush();
      const mid = { x: AT.x + 1 + 3, y: AT.y + 1, z: AT.z + 1 + 3 };
      expect(l.isDarkForSpawn(mid.x, mid.y, mid.z), 'ちょうちんを ほると まん中の 床の 上は 湧く').toBe(true);
    });
  }
});
