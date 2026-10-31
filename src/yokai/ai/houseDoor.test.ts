import { describe, expect, it } from 'vitest';
import type { BlockId } from '../../contracts';
import { ArrayVoxelWorld } from '../../world/VoxelWorld';
import { boxFree } from './geometry';
import type { Ent } from './entity';
import { YokaiStone } from './stone';

/** HOUSE-1C PR-1（AC24）: しまった 戸は 妖怪の 通れない 所、あいた 戸は 通れる。妖怪は 戸を こわせない（上・下・あけた 物も） */

/** 戸の 4 つの id（下・上 × しめる・あける） */
const CLOSED: readonly BlockId[] = ['house_door', 'house_door_top'];
const OPEN: readonly BlockId[] = ['house_door_open', 'house_door_open_top'];
const DOORS: readonly BlockId[] = [...CLOSED, ...OPEN];

const world = (): ArrayVoxelWorld => new ArrayVoxelWorld({ x: 64, y: 32, z: 64 });

describe('妖怪の 動きと 戸（AC24）', () => {
  it('しまった 戸〔下・上〕は 固い（妖怪の 体の 箱が 入れない）。あいた 戸〔下・上〕は 固くない（通れる）', () => {
    const w = world();
    CLOSED.forEach((id, i) => w.setBlock(10 + i * 2, 10, 10, id));
    OPEN.forEach((id, i) => w.setBlock(10 + i * 2, 12, 10, id));
    for (let i = 0; i < CLOSED.length; i++) {
      const x = 10 + i * 2;
      expect(w.isSolid(x, 10, 10), `${CLOSED[i]} は 固い`).toBe(true);
      expect(boxFree(w, x + 0.1, 10, 10.1, x + 0.9, 11, 10.9), `${CLOSED[i]} に 入れない`).toBe(false);
      expect(w.isSolid(x, 12, 10), `${OPEN[i]} は 固くない`).toBe(false);
      expect(boxFree(w, x + 0.1, 12, 10.1, x + 0.9, 13, 10.9), `${OPEN[i]} は 通れる`).toBe(true);
    }
  });

  it('戸を あけると 通れて、しめると また 通れない（同じ マスの 入れかえ）', () => {
    const w = world();
    w.setBlock(20, 10, 20, 'house_door');
    w.setBlock(20, 11, 20, 'house_door_top');
    const through = (): boolean => boxFree(w, 20.1, 10, 20.1, 20.9, 12, 20.9);
    expect(through()).toBe(false);
    w.setBlock(20, 10, 20, 'house_door_open');
    expect(through(), '下だけ あいても 上が しまって いる').toBe(false);
    w.setBlock(20, 11, 20, 'house_door_open_top');
    expect(through()).toBe(true);
    w.setBlock(20, 10, 20, 'house_door');
    w.setBlock(20, 11, 20, 'house_door_top');
    expect(through()).toBe(false);
  });
});

describe('ぬりかべの たおれこみ（crush）は 戸を こわさない', () => {
  it('体の 下と 同じ 高さの 戸〔4 しゅるい〕は ぜんぶ のこり、ふつうの ブロックだけ 空気に なる', () => {
    const w = world();
    const y = 10;
    // 体の まわり 9×9 マス: 下の 段〔y - 1〕は 土と 戸が まじり、同じ 高さ〔y〕は ぜんぶ 戸
    const doors = new Map<string, BlockId>();
    for (let x = 28; x <= 36; x++) {
      for (let z = 28; z <= 36; z++) {
        const low: BlockId = (x + z) % 2 === 0 ? 'dirt' : DOORS[(x + z) % DOORS.length]!;
        const same = DOORS[(x * 3 + z) % DOORS.length]!;
        w.setBlock(x, y - 1, z, low);
        w.setBlock(x, y, z, same);
        if (low !== 'dirt') doors.set(`${x},${y - 1},${z}`, low);
        doors.set(`${x},${y},${z}`, same);
      }
    }
    const crushed: { from: string }[] = [];
    const stone = new YokaiStone({ world: w, reward: { defeat: () => {} }, opts: { onBlocks: (cells) => crushed.push(...cells) } });
    const e = { x: 32.5, y, z: 32.5, yaw: 0 } as unknown as Ent;
    stone.crush(e);
    expect(crushed.length, '土は こわれる〔たおれこみは 動いて いる〕').toBeGreaterThan(0);
    expect(crushed.every((c) => c.from === 'dirt'), '戸は こわれない').toBe(true);
    for (const [key, id] of doors) {
      const [x, yy, z] = key.split(',').map(Number) as [number, number, number];
      expect(w.getBlock(x, yy, z), `${key} は ${id} の まま`).toBe(id);
    }
  });
});
