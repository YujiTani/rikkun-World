import { afterEach, describe, expect, it } from 'vitest';
import { CHUNK_SIZE, WORLD_HEIGHT, type BlockArray } from '../contracts';
import { BLOCK_INDEX } from '../world/blocks/blockTypes';
import { LAYER } from '../world/gen/columnLayout';
import { terrainFor } from '../world/gen/terrain';
import { FACING_VEC, TownPlan } from './townPlan';
import { chooseTown } from './townPlace';
import { deactivateTown } from './townState';
import { writeTown } from './townWrite';

/** 1B-2: 門の 外の 道（はば 5・門の 正面へ まっすぐ）の 上の 自然の 竹・丸太・草は 取りのぞく（見通しの みちと おなじ あつかい） */
afterEach(() => deactivateTown());

const SEEDS = [1, 2, 3, 20261012];

function planOf(seed: number): TownPlan {
  const sp = terrainFor(seed).spawn();
  return new TownPlan(chooseTown(seed)!, { x: sp.x, z: sp.z });
}

describe('門の 外の 道', () => {
  it('門の まん中から 正面へ はば 5・スタートの 奥ゆきまで 道に なる（スタートの そばは のぞく）', () => {
    for (const seed of SEEDS) {
      const plan = planOf(seed);
      const f = FACING_VEC[plan.rec.facing];
      const g = plan.info().gate.pos;
      const sp = terrainFor(seed).spawn();
      const reach = (sp.x + 0.5 - g.x) * f.x + (sp.z + 0.5 - g.z) * f.z;
      let n = 0;
      for (let k = 2; k < reach - 9; k++) {
        for (const s of [-2, 0, 2]) {
          const x = Math.floor(g.x + f.x * k - f.z * s);
          const z = Math.floor(g.z + f.z * k + f.x * s);
          if (plan.inTown(x, z)) continue;
          expect(plan.inCorridor(x, z), `seed ${seed} k=${k} s=${s}`).toBe(true);
          n++;
        }
      }
      expect(n, `seed ${seed}: 道の マスを しらべた`).toBeGreaterThan(0);
    }
  });

  it('道の 上の 竹・丸太・草・はっぱは 書いた あと 空気に なる。地面は かわらない', () => {
    for (const seed of SEEDS) {
      const plan = planOf(seed);
      const f = FACING_VEC[plan.rec.facing];
      const g = plan.info().gate.pos;
      const k = 6;
      const x = Math.floor(g.x + f.x * k);
      const z = Math.floor(g.z + f.z * k);
      const cx = Math.floor(x / CHUNK_SIZE);
      const cz = Math.floor(z / CHUNK_SIZE);
      const out: BlockArray = new Uint16Array(LAYER * WORLD_HEIGHT) as BlockArray;
      const natural = plan.rec.groundY;
      const lx = x - cx * CHUNK_SIZE;
      const lz = z - cz * CHUNK_SIZE;
      const col = lz * CHUNK_SIZE + lx;
      const junk = [BLOCK_INDEX.log, BLOCK_INDEX.kusa, BLOCK_INDEX.leaves] as const;
      junk.forEach((b, i) => (out[(natural + 1 + i) * LAYER + col] = b));
      writeTown(out, cx, cz, plan, () => natural);
      for (let i = 0; i < junk.length; i++) expect(out[(natural + 1 + i) * LAYER + col], `seed ${seed} 高さ +${1 + i}`).toBe(BLOCK_INDEX.air);
    }
  });
});
