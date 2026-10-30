import { describe, expect, it } from 'vitest';
import { createYokaiConfig } from '../../yokai/ai/config';
import { createMineHook } from './mineHook';
import { heightAt, spawnOf } from './terrain';

/**
 * MINE-1A（docs/design/MINE-1.md §4.3・受け入れ基準 A6）: 地下の 判定。
 *   窓口 `window.__rikkun.mine.underground()`（§6.1）→ { under, feetY, groundY, minY, maxY }（今の プレイヤー）
 *     under  ＝ 足の 高さが、その x・z の「生成の 地形の 高さ」（地面。掘ったり 置いたり しても かわらない）より 6 マス 以上 下
 *              例: 地面 150 の 所で 足 144 いか ＝ 地下、145 ＝ 地上
 *     minY・maxY ＝ 足 ±（設定 yokaiSpawnHeight）。地上でも 地下でも 同じ
 *   生成の 計算だけで 答える 物は ゲームを 起動しなくても 読める（`createMineHook`。プレイヤーの 足は `player` で わたす〔biome の createBiomeHook と 同じ〕）。
 *   「生成の 地形の 高さ」は `heightAt(seed, x, z)`（terrain.ts の height。広場・岩山を かけた 高さ）。ブロックは 見ない。
 *   掘っても かわらない こと〔実際に 世界を 掘る〕は E2E（e2e/mine1a.spec.ts）が 見る。
 */

const SEED = 20261012;
const HEIGHT = createYokaiConfig().yokaiSpawnHeight;
/** 地下に なる 深さ（地面から 6 マス 以上 下。§4.3） */
const DEEP = 6;

const sp = spawnOf(SEED);
/** スタートの まわりの 陸の 列（3 マスおき 7×7） */
const COLUMNS: { x: number; z: number }[] = [];
for (let dx = -9; dx <= 9; dx += 3) for (let dz = -9; dz <= 9; dz += 3) COLUMNS.push({ x: sp.x + dx, z: sp.z + dz });

function hookAt(x: number, z: number, feetY: number) {
  const pos = { x: x + 0.5, y: feetY, z: z + 0.5 };
  return { pos, mine: createMineHook({ seed: SEED, player: () => pos }) };
}

describe('A6: underground（地面から 6 マス 以上 下が 地下）', () => {
  it('地面 H の 所で 足 H−6 → 地下・H−5 → 地上（スタートの 列）', () => {
    const H = heightAt(SEED, sp.x, sp.z);
    expect(hookAt(sp.x, sp.z, H - DEEP).mine.underground().under, `足 ${H - DEEP}`).toBe(true);
    expect(hookAt(sp.x, sp.z, H - DEEP + 1).mine.underground().under, `足 ${H - DEEP + 1}`).toBe(false);
  });

  it('どの 陸の 列でも その 列の 地形の 高さで きまる（H−6 いか → 地下・H−5 いじょう → 地上）', () => {
    for (const c of COLUMNS) {
      const H = heightAt(SEED, c.x, c.z);
      expect(hookAt(c.x, c.z, H - DEEP).mine.underground().under, `(${c.x}, ${c.z}) 足 ${H - DEEP}`).toBe(true);
      expect(hookAt(c.x, c.z, H - DEEP - 1).mine.underground().under, `(${c.x}, ${c.z}) 足 ${H - DEEP - 1}`).toBe(true);
      expect(hookAt(c.x, c.z, H - DEEP + 1).mine.underground().under, `(${c.x}, ${c.z}) 足 ${H - DEEP + 1}`).toBe(false);
      expect(hookAt(c.x, c.z, H + 1).mine.underground().under, `(${c.x}, ${c.z}) 地面に 立つ`).toBe(false);
    }
  });

  it('はるか 上〔空〕は 地上・世界の 底ちかくは 地下', () => {
    const H = heightAt(SEED, sp.x, sp.z);
    expect(hookAt(sp.x, sp.z, H + 60).mine.underground().under).toBe(false);
    expect(hookAt(sp.x, sp.z, 5).mine.underground().under).toBe(true);
  });

  it('答えは groundY（その 列の 地形の 高さ）と feetY（足）を ふくむ', () => {
    const H = heightAt(SEED, sp.x, sp.z);
    const u = hookAt(sp.x, sp.z, H - 20).mine.underground();
    expect(u.groundY).toBe(H);
    expect(u.feetY).toBe(H - 20);
    expect(u.under).toBe(true);
  });

  it('minY・maxY は 足 ±（設定 yokaiSpawnHeight）。地下でも 地上でも 同じ', () => {
    const H = heightAt(SEED, sp.x, sp.z);
    for (const feetY of [H - 40, H - DEEP, H - DEEP + 1, H + 1, H + 30]) {
      const u = hookAt(sp.x, sp.z, feetY).mine.underground();
      expect(u.minY, `足 ${feetY}`).toBe(feetY - HEIGHT);
      expect(u.maxY, `足 ${feetY}`).toBe(feetY + HEIGHT);
    }
  });

  it('プレイヤーが 動けば 答えも かわる（いつも 今の 足を 読む）', () => {
    const H = heightAt(SEED, sp.x, sp.z);
    const { pos, mine } = hookAt(sp.x, sp.z, H + 1);
    expect(mine.underground().under).toBe(false);
    pos.y = H - 30;
    expect(mine.underground().under).toBe(true);
    expect(mine.underground().feetY).toBe(H - 30);
    pos.y = H + 1;
    expect(mine.underground().under).toBe(false);
  });

  it('列が かわれば 地形の 高さも かわる（x・z が 同じ 列に 入る かぎり 同じ 答え）', () => {
    const H = heightAt(SEED, sp.x, sp.z);
    const a = createMineHook({ seed: SEED, player: () => ({ x: sp.x + 0.1, y: H - 10, z: sp.z + 0.1 }) }).underground();
    const b = createMineHook({ seed: SEED, player: () => ({ x: sp.x + 0.9, y: H - 10, z: sp.z + 0.9 }) }).underground();
    expect(a).toEqual(b);
    expect(a.groundY).toBe(H);
  });
});
