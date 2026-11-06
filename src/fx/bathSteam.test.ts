import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BathSteam, STEAM_TUNING } from './bathSteam';

/** HOUSE-1D: おふろの 湯気。入って いる 間だけ 出る・数が 少ない・出ない ときは 描かない（描画 0 回）・出て いる 間は 1 つの メッシュ */
const DT = 1 / 60;
const SPOT = { x: 5.5, y: 3.5, z: 7.5 };

function run(steam: BathSteam, steps: number, spot: typeof SPOT | null): number {
  let peak = 0;
  for (let i = 0; i < steps; i++) {
    steam.update(DT, spot);
    peak = Math.max(peak, steam.shown);
  }
  return peak;
}

describe('おふろの 湯気（AC28）', () => {
  it('入って いない 間は 何も 出ず、メッシュも 描かない（描画 0 回）', () => {
    const scene = new THREE.Scene();
    const steam = new BathSteam(scene);
    run(steam, 120, null);
    expect(steam.shown).toBe(0);
    expect(scene.children.length).toBe(1);
    expect(scene.children[0]!.visible).toBe(false);
  });

  it('入って いる 間は 小さな つぶが 出る。数は 表の 上限まで（はげしく しない）。メッシュは 1 つ', () => {
    const scene = new THREE.Scene();
    const steam = new BathSteam(scene);
    const peak = run(steam, 600, SPOT);
    expect(peak).toBeGreaterThan(0);
    expect(peak).toBeLessThanOrEqual(STEAM_TUNING.max);
    expect(scene.children.length, '描く メッシュは 1 つだけ').toBe(1);
    expect(scene.children[0]!.visible).toBe(true);
  });

  it('お湯の 面の 近くから 出て 上へ のぼる', () => {
    const steam = new BathSteam(new THREE.Scene());
    run(steam, 30, SPOT);
    const ys = steam.pool.puffs.filter((p) => p.active).map((p) => p.y);
    expect(ys.length).toBeGreaterThan(0);
    for (const y of ys) {
      expect(y).toBeGreaterThanOrEqual(SPOT.y);
      expect(y).toBeLessThan(SPOT.y + 1);
    }
  });

  it('出ると もう 足されず、のこった つぶが きえたら 描かなく なる', () => {
    const scene = new THREE.Scene();
    const steam = new BathSteam(scene);
    run(steam, 120, SPOT);
    run(steam, Math.ceil((STEAM_TUNING.life * 1.3) / DT), null);
    expect(steam.shown).toBe(0);
    expect(scene.children[0]!.visible).toBe(false);
  });
});
