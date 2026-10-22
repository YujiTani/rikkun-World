import { describe, expect, it } from 'vitest';
import type { BlockId, Vec3 } from '../contracts';
import { ArrayVoxelWorld } from '../world/VoxelWorld';
import { createSpiralDebris, type DebrisSpiral } from './spiralDebris';

/** WEAPON-8 AC32: らせんの 土と 草（見た目だけ）。P(a) の 真下 2.5 マス 以内の 地面だけ。 */
const FLOOR = 8;
const B: Vec3 = { x: 20.5, y: FLOOR + 1 + 1.4, z: 40 };

function rig(floor: BlockId = 'grass', mod?: (w: ArrayVoxelWorld) => void) {
  const world = new ArrayVoxelWorld({ x: 48, y: 40, z: 48 });
  for (let x = 0; x < 48; x++) for (let z = 0; z < 48; z++) world.setBlock(x, FLOOR, z, floor);
  mod?.(world);
  const before = JSON.stringify(Array.from({ length: 48 * 48 }, (_, i) => world.getBlock(i % 48, FLOOR, Math.floor(i / 48))));
  const d = createSpiralDebris({ world, seed: 5 });
  const at = (a: number): DebrisSpiral => ({ id: 1, age: a, position: { x: B.x, y: B.y, z: B.z - 1 - 0.2 * a }, dir: { x: 0, y: 0, z: -1 } });
  /** a = 0〜59 を 1 ステップずつ。各 ステップの 後の 窓口の 値 */
  const fly = (reduced = false, upTo = 59) => {
    const out: ReturnType<typeof d.view>[] = [];
    for (let a = 0; a <= upTo; a++) {
      d.step(at(a), reduced);
      out.push({ ...d.view() });
    }
    return out;
  };
  const after = () => JSON.stringify(Array.from({ length: 48 * 48 }, (_, i) => world.getBlock(i % 48, FLOOR, Math.floor(i / 48))));
  return { d, fly, at, world, before, after };
}

describe('AC32: 土と 草の つぶ', () => {
  it('草の 平地: a 1〜59 の 間 alive 1 以上・48 以下・ground kusa。ブロックは 変わらない', () => {
    const r = rig('grass');
    const v = r.fly();
    for (let a = 1; a < v.length; a++) {
      expect(v[a]!.alive, `a ${a}`).toBeGreaterThanOrEqual(1);
      expect(v[a]!.alive + v[a]!.smoke).toBeLessThanOrEqual(48);
    }
    expect(v[10]!.ground).toBe('kusa');
    expect(r.after()).toBe(r.before);
  });
  it('地面の 種類: 砂 → suna・土 → tsuchi・石 → ishi・ほかの ブロック（き）→ ishi', () => {
    for (const [id, k] of [['sand', 'suna'], ['dirt', 'tsuchi'], ['stone', 'ishi'], ['log', 'ishi']] as const) {
      expect(rig(id).fly()[8]!.ground, id).toBe(k);
    }
  });
  it('土けむりは 4 ステップに 1 つ（寿命 14 で 3〜4 こ）', () => {
    const v = rig().fly();
    expect(Math.max(...v.map((x) => x.smoke))).toBeLessThanOrEqual(4);
    expect(v[3]!.smoke).toBe(1);
    expect(v[4]!.smoke).toBe(2);
    expect(v[8]!.smoke).toBe(3);
  });
  it('足もとから 2 マス 下がる 穴の 上（約 3.4）・水の 面の 上 では 新しい つぶ 0', () => {
    const hole = rig('grass', (w) => {
      for (let x = 0; x < 48; x++) for (let z = 0; z < 48; z++) {
        w.setBlock(x, FLOOR, z, 'air');
        w.setBlock(x, FLOOR - 2, z, 'grass');
      }
    });
    const v = hole.fly();
    expect(Math.max(...v.map((x) => x.alive))).toBe(0);
    const water = rig('grass', (w) => {
      for (let x = 0; x < 48; x++) for (let z = 0; z < 48; z++) w.setBlock(x, FLOOR, z, 'water');
      for (let x = 0; x < 48; x++) for (let z = 0; z < 48; z++) w.setBlock(x, FLOOR - 1, z, 'stone');
    });
    expect(Math.max(...water.fly().map((x) => x.alive))).toBe(0);
  });
  it('足もとから 1 マス 下がる 所（約 2.4）→ 出る', () => {
    const low = rig('grass', (w) => {
      for (let x = 0; x < 48; x++) for (let z = 0; z < 48; z++) {
        w.setBlock(x, FLOOR, z, 'air');
        w.setBlock(x, FLOOR - 1, z, 'grass');
      }
    });
    expect(Math.max(...low.fly().map((x) => x.alive))).toBeGreaterThan(0);
  });
  it('おわってから 30 ステップ 後に alive 0・smoke 0', () => {
    const r = rig();
    r.fly();
    for (let i = 0; i < 30; i++) r.d.step(null, false);
    expect(r.d.view().alive).toBe(0);
    expect(r.d.view().smoke).toBe(0);
  });
  it('「動きを減らす」: alive 0・smoke は 出る', () => {
    const v = rig().fly(true);
    expect(Math.max(...v.map((x) => x.alive))).toBe(0);
    expect(Math.max(...v.map((x) => x.smoke))).toBeGreaterThan(0);
  });
  it('つぶは 地面より 下に 行かず、点の 数は 描く 点と 同じ', () => {
    const r = rig();
    for (let a = 0; a <= 40; a++) {
      r.d.step(r.at(a), false);
      expect(r.d.count).toBe(r.d.view().alive + r.d.view().smoke);
      for (let i = 0; i < r.d.count; i++) expect(r.d.py[i]!).toBeGreaterThanOrEqual(FLOOR + 1 - 1e-6);
    }
  });
});
