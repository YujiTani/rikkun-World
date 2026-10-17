// CHAR-4: WeaponFx に つないだ 軌跡（AC6 の 粒・AC8 の 古い 帯・線の 撤去）
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createW2Settings, type BladeEvent, type BladeState, type ItemId } from '../contracts';
import { WeaponFx } from './weaponFx';
import { bodyOf, idleState, moveState } from './bladeTrailTestKit';

const O = { x: 20.5, y: 5, z: 20.5 };

function make(opts: { withTrail?: boolean } = {}) {
  const scene = new THREE.Scene();
  const settings = createW2Settings();
  let state: BladeState = idleState('crystal_katana');
  let events: BladeEvent[] = [];
  let body = { ...O };
  const camera = new THREE.PerspectiveCamera(70, 1.6, 0.1, 200);
  camera.position.set(20.5, 6.8, 26.5);
  camera.lookAt(20.5, 6.4, 19);
  camera.updateMatrixWorld(true);
  const fx = new WeaponFx({
    scene,
    sound: { play: () => {}, playTones: () => {} } as never,
    blade: {
      drainEvents: () => {
        const e = events;
        events = [];
        return e;
      },
      state: () => state,
      shape: () => null,
    } as never,
    bow: { drainEvents: () => [] } as never,
    inventory: { drainWearEvents: () => [] },
    armor: { drainWearEvents: () => [] },
    bladeHud: { update: () => {}, techStarted: () => {}, stanceChanged: () => {} },
    notice: { low: () => {}, broken: () => {} },
    nameOf: () => '',
    handPos: () => O,
    settings: () => settings,
    ...(opts.withTrail === false ? {} : { body: () => body, camera }),
  });
  return {
    fx,
    scene,
    settings,
    go(item: ItemId | null, tech: 'thrust' | 'kesa' | 'kiriage', f: number, ev: BladeEvent[] = []) {
      state = item ? moveState(settings, item, tech, f, 0, O) : idleState(null);
      body = bodyOf(settings, tech, f, 0, O);
      events = ev;
      fx.step();
      fx.update(1 / 60);
    },
    idle(item: ItemId | null) {
      state = idleState(item);
      fx.step();
      fx.update(1 / 60);
    },
  };
}

const HIT = (tech: 'kesa' | 'thrust' | 'kiriage'): BladeEvent => ({ type: 'techHit', tick: 1, tech, yokaiId: 1, damage: 1, knock: 0, up: 0, position: { x: 20.5, y: 6, z: 19 } });
const visibleMeshes = (scene: THREE.Scene): string[] => {
  const out: string[] = [];
  scene.traverse((o) => {
    const im = o as THREE.InstancedMesh;
    if ((o as THREE.Mesh).isMesh && o.visible && !(im.isInstancedMesh && im.count === 0)) out.push(o.name || o.type);
  });
  return out;
};

describe('CHAR-4 AC6 当たりの 星の 粒', () => {
  it('当たらない わざで 当たりの 星の 粒は 0（古い 星 3 こ は 出ない）。きらきらの かたな', () => {
    const t = make();
    for (const tech of ['thrust', 'kesa', 'kiriage'] as const) {
      for (let f = 1; f <= 60; f++) {
        t.go('crystal_katana', tech, f);
        expect(t.fx.counts().stars, `${tech} F${f}`).toBe(0);
      }
      t.idle('crystal_katana');
    }
  });
  it('当たると 6 こ（今のまま）', () => {
    const t = make();
    for (let f = 1; f <= 30; f++) t.go('crystal_katana', 'kesa', f);
    t.go('crystal_katana', 'kesa', 31, [HIT('kesa')]);
    expect(t.fx.counts().stars).toBe(6);
  });
  it('ぼくとう・かたなで 当たっても 6 こ。外れは 0', () => {
    for (const item of ['bokuto', 'katana'] as ItemId[]) {
      const t = make();
      for (let f = 1; f <= 40; f++) t.go(item, 'kesa', f);
      expect(t.fx.counts().stars).toBe(0);
      t.go(item, 'kesa', 41, [HIT('kesa')]);
      expect(t.fx.counts().stars).toBe(6);
    }
  });
});

describe('CHAR-4 AC8 古い 帯・線は ない', () => {
  it('刀の わざの あいだ、見える 物は 新しい 軌跡の 物だけ（帯 1 つ。きらきらは 星 1 つ ふえる）', () => {
    for (const [item, max] of [['katana', 1], ['crystal_katana', 2]] as const) {
      const t = make();
      expect(visibleMeshes(t.scene)).toEqual([]);
      let sawTrail = false;
      for (let f = 1; f <= 60; f++) {
        t.go(item, 'kesa', f);
        const vis = visibleMeshes(t.scene);
        for (const name of vis) expect(['bladeTrail', 'bladeTrailStars'], `${item} F${f}`).toContain(name);
        expect(vis.length).toBeLessThanOrEqual(max);
        if (vis.length) sawTrail = true;
      }
      expect(sawTrail).toBe(true);
    }
  });
  it('突きでも 同じ（線の 物は ない）', () => {
    const t = make();
    for (let f = 1; f <= 45; f++) {
      t.go('katana', 'thrust', f);
      for (const name of visibleMeshes(t.scene)) expect(name).toBe('bladeTrail');
    }
  });
  it('刀でない 物（item が null）の わざ では 何も 出ない', () => {
    const t = make();
    for (let f = 1; f <= 60; f++) {
      t.go(null, 'kesa', f);
      expect(visibleMeshes(t.scene)).toEqual([]);
    }
  });
});

describe('CHAR-4 つなぎ込み', () => {
  it('体の 位置・カメラを もらわない ときは 軌跡を 出さない（にせの deps でも 動く）', () => {
    const t = make({ withTrail: false });
    for (let f = 1; f <= 40; f++) t.go('katana', 'kesa', f);
    expect(t.fx.trailInfo()).toBeNull();
    expect(visibleMeshes(t.scene)).toEqual([]);
  });
  it('trailInfo() は 軌跡の ようす（visible・points）を かえす', () => {
    const t = make();
    for (let f = 1; f <= 31; f++) t.go('katana', 'kesa', f);
    const info = t.fx.trailInfo()!;
    expect(info.visible).toBe(true);
    expect(info.points).toHaveLength(4);
  });
  it('dispose で 軌跡の 物も シーンから 消える', () => {
    const t = make();
    t.fx.dispose();
    let n = 0;
    t.scene.traverse((o) => {
      if (o.name === 'bladeTrail' || o.name === 'bladeTrailStars') n++;
    });
    expect(n).toBe(0);
  });
});
