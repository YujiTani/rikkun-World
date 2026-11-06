import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SkyScene } from './skyScene';
import { SKY } from './tuning';

/** 上空の 視点の 絵（HOUSE-1C PR-2）: 真上の カメラ（北が 画面の 上）・もとへ もどる・画面と 地面の 行き来 */
const W = 1000;
const H = 600;
let saved: unknown;

beforeEach(() => {
  saved = (globalThis as { window?: unknown }).window;
  (globalThis as { window?: unknown }).window = { innerWidth: W, innerHeight: H };
});
afterEach(() => {
  (globalThis as { window?: unknown }).window = saved;
});

function rig() {
  const camera = new THREE.PerspectiveCamera(70, W / H, 0.1, 500);
  camera.position.set(3, 12, 4);
  camera.lookAt(10, 11, 20);
  camera.updateMatrixWorld(true);
  return { camera, sky: new SkyScene(camera) };
}

describe('SkyScene', () => {
  it('enter → leave で カメラの 位置・向き・上が もとどおり', () => {
    const { camera, sky } = rig();
    const pos = camera.position.clone();
    const quat = camera.quaternion.clone();
    const up = camera.up.clone();
    sky.enter(50, 20, 60);
    expect(camera.position.toArray()).toEqual([50, 20 + SKY.height, 60]);
    sky.leave();
    expect(camera.position.toArray()).toEqual(pos.toArray());
    expect(camera.quaternion.toArray()).toEqual(quat.toArray());
    expect(camera.up.toArray()).toEqual(up.toArray());
  });

  it('真下の 点は 画面の まん中・北（−z）は 画面の 上・東（+x）は 画面の 右', () => {
    const { sky } = rig();
    sky.enter(50, 20, 60);
    const out = { x: 0, y: 0 };
    sky.project(50, 20, 60, out);
    expect(out.x).toBeCloseTo(W / 2, 3);
    expect(out.y).toBeCloseTo(H / 2, 3);
    sky.project(50, 20, 55, out);
    expect(out.y).toBeLessThan(H / 2);
    sky.project(55, 20, 60, out);
    expect(out.x).toBeGreaterThan(W / 2);
    sky.leave();
  });

  it('project と ground は 逆の 関係（画面 → 地面 → 画面）', () => {
    const { sky } = rig();
    sky.enter(50, 20, 60);
    const g = { x: 0, z: 0 };
    sky.ground(730, 210, 21, g);
    const out = { x: 0, y: 0 };
    sky.project(g.x, 21, g.z, out);
    expect(out.x).toBeCloseTo(730, 3);
    expect(out.y).toBeCloseTo(210, 3);
    sky.leave();
  });

  it('置ける 場所の 緑は 作りなおさない（同じ 配列なら）・hide で かくれる', () => {
    const { sky } = rig();
    const sites = [{ x: 10, y: 5, z: 10 }];
    sky.show(sites, 7, 7, { x: 10, z: 10, ok: true });
    expect(sky.group.visible).toBe(true);
    const tiles = sky.group.children[0] as THREE.InstancedMesh;
    expect(tiles.count).toBe(49);
    sky.show(sites, 7, 7, { x: 12, z: 10, ok: false });
    expect(tiles.count).toBe(49);
    sky.hide();
    expect(tiles.count).toBe(0);
    expect(sky.group.visible).toBe(false);
  });

  it('みずもりの 色: 高い・低いだけ 出す（ok は 出さない）', () => {
    const { sky } = rig();
    sky.showLevel(
      [
        { x: 1, z: 1, state: 'ok' },
        { x: 2, z: 1, state: 'high' },
        { x: 3, z: 1, state: 'low' },
      ],
      5,
    );
    const lv = sky.group.children[sky.group.children.length - 1] as THREE.InstancedMesh;
    expect(lv.count).toBe(2);
    expect(sky.group.visible).toBe(true);
    sky.showLevel([], 5);
    expect(lv.count).toBe(0);
    expect(sky.group.visible).toBe(false);
  });
});
