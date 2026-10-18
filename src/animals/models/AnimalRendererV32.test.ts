import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { AnimalEvent, AnimalView } from '../../contracts';
import { AnimalFx } from '../../fx/animalFx';
import { AnimalRenderer } from './AnimalRenderer';

/** LIVE-1 版 3.2: しるし 11 組・とぶ むし・だっこ の 形・パタパタ と 着地（AC28・AC30 の 描画） */

const view = (id: number, o: Partial<AnimalView> = {}): AnimalView => ({
  id,
  x: id,
  y: 9,
  z: 0,
  yaw: 0,
  headYaw: 0,
  state: 'idle',
  stateTicks: 0,
  friend: false,
  hearts: 0,
  targeted: false,
  ...o,
});

function setup(opts: { now?: () => number; player?: () => { x: number; y: number; z: number } | null } = {}) {
  const fx = new AnimalFx({ sound: { playTones: () => {} } });
  const r = new AnimalRenderer({ fx, ...opts });
  const cam = new THREE.PerspectiveCamera(75, 1.6, 0.1, 200);
  cam.position.set(0, 10.6, 6);
  cam.lookAt(0, 10.6, 0);
  cam.updateMatrixWorld(true);
  return { fx, r, cam };
}

function drawn(root: THREE.Object3D): { n: number; tris: number } {
  let n = 0;
  let tris = 0;
  root.traverse((o) => {
    for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) return;
    if (o instanceof THREE.Points) {
      n++;
      tris += o.geometry.drawRange.count;
    } else if (o instanceof THREE.InstancedMesh) {
      if (o.count > 0) {
        n++;
        tris += o.count * ((o.geometry.index?.count ?? 6) / 3);
      }
    } else if (o instanceof THREE.Mesh) {
      n++;
      tris += (o.geometry.index?.count ?? 0) / 3;
    }
  });
  return { n, tris };
}

describe('AC30 描画: しるし 11 組（なかま 8・やせい 3 ぜんぶ おなかいっぱい・あしあと つき）', () => {
  it('0 わ より 18 回 以下 の ふえ・三角形 の ふえ 8,000 以下（ふちどり 込み）', () => {
    const { fx, r, cam } = setup();
    const views: AnimalView[] = [];
    for (let i = 0; i < 8; i++) views.push(view(i + 1, { friend: true, follow: 18000, fullLeft: 400, x: i * 0.7 - 2, z: -1 }));
    for (let i = 0; i < 3; i++) views.push(view(20 + i, { hearts: 2, fullLeft: 400, x: i - 1, z: -3, targeted: i === 0 }));
    fx.step(views, { x: 0, y: 9, z: 0 });
    r.update(views, cam);
    expect(fx.fx().marks).toHaveLength(11);
    const d = drawn(r.group);
    const base = drawn(setup().r.group);
    expect(d.n - base.n).toBeLessThanOrEqual(18);
    expect(d.tris - base.tris).toBeLessThanOrEqual(8000);
    expect(r.stats().draws).toBeLessThanOrEqual(18);
    expect(r.stats().triangles).toBeLessThanOrEqual(8000);
  });
});

describe('とぶ むし（1 ぴき 1 回・三角形 200 以下）', () => {
  const flyOne = () => {
    const { fx, r, cam } = setup();
    fx.step([], { x: 0, y: 10.6, z: 6 });
    fx.onEvents([{ type: 'swing', x: 3, y: 10, z: 0, caught: true, reason: 'chance' } satisfies AnimalEvent]);
    for (let t = 0; t < 14; t++) fx.step([], { x: 0, y: 10.6, z: 6 });
    return { fx, r, cam };
  };
  it('とんで いる 間 だけ 1 回 ふえる。いない ときは 0', () => {
    const { fx, r, cam } = flyOne();
    expect(fx.flights).toHaveLength(1);
    r.update([], cam);
    const during = drawn(r.group);
    expect(during.n).toBeGreaterThanOrEqual(1);
    expect(r.stats().draws).toBeGreaterThanOrEqual(1);
    for (let t = 0; t < 30; t++) fx.step([], { x: 0, y: 10.6, z: 6 });
    r.update([], cam);
    expect(fx.flights).toHaveLength(0);
    expect(drawn(r.group).n).toBeLessThan(during.n + 1);
    expect(r.stats().draws).toBeLessThanOrEqual(1); // つぶ（はっぱ）だけ
  });
  it('むし の メッシュ は 位置 を とんで いる 場所 に 置く。使いまわし（何回 とんでも 増えない）', () => {
    const { fx, r, cam } = flyOne();
    r.update([], cam);
    const meshes = () => {
      const a: THREE.SkinnedMesh[] = [];
      r.group.traverse((o) => {
        if (o instanceof THREE.SkinnedMesh && o.name === 'bug') a.push(o);
      });
      return a;
    };
    const first = meshes().filter((m) => m.visible);
    expect(first).toHaveLength(1);
    const f = fx.flights[0];
    const p = new THREE.Vector3();
    first[0].getWorldPosition(p);
    expect(p.x).toBeCloseTo(f.x, 3);
    expect(p.y).toBeCloseTo(f.y, 3);
    expect(p.z).toBeCloseTo(f.z, 3);
    const count0 = meshes().length;
    for (let k = 0; k < 6; k++) {
      fx.onEvents([{ type: 'swing', x: 3, y: 10, z: 0, caught: true, reason: 'chance' }]);
      for (let t = 0; t < 40; t++) fx.step([], { x: 0, y: 10.6, z: 6 });
      r.update([], cam);
    }
    expect(meshes().length).toBeLessThanOrEqual(4);
    expect(meshes().length).toBeGreaterThanOrEqual(count0);
  });
});

describe('AC28 だっこ の 形（1 人称）', () => {
  const carriedView = (o: Partial<AnimalView> = {}) => view(1, { friend: true, carried: true, state: 'carried', x: 0, y: 9, z: 6, ...o });
  it('にわとり の 顔 が 見える（カメラの ほうを 向く）・画面 の 下 25% 以内・照準（まん中）から 遠い', () => {
    const { r, cam } = setup({ player: () => ({ x: 0, y: 9, z: 6 }) });
    r.update([carriedView()], cam);
    const c = r.carryInfo();
    expect(c).not.toBeNull();
    expect(c!.firstPerson).toBe(true);
    // 3.2: ステータス板（上の はし ndc −0.4975）より 上に 出す（顔 が 見える）。照準（0）には かぶらない
    expect(c!.topNdcY).toBeLessThanOrEqual(-0.08);
    expect(c!.topNdcY).toBeGreaterThan(-0.4);
    expect(c!.bottomNdcY).toBeGreaterThanOrEqual(-0.5);
    expect(Math.abs(c!.centerNdcX)).toBeLessThan(0.1);
    // 照準から 40px（1280×800 で ndc 0.0625・0.1）より 遠い: 上の はしが 下 25% より 下
    expect(c!.faceToCamera).toBeGreaterThan(0.7); // にわとりの 前（−z）と カメラへ の 向きの 内積
    // かげ・ふちどりは 出ない
    expect(drawn(r.group).n).toBe(1); // 体 1 回だけ（かげ・ふちどり なし）
  });
  it('カメラを 回しても 画面の 同じ 所 に ある（上下 にも）', () => {
    const { r, cam } = setup({ player: () => ({ x: 0, y: 9, z: 6 }) });
    const tops: number[] = [];
    for (const [yaw, pitch] of [[0, 0], [1.2, 0], [0, -0.7], [-2, 0.5]]) {
      cam.rotation.set(pitch, yaw, 0, 'YXZ');
      cam.updateMatrixWorld(true);
      r.update([carriedView()], cam);
      tops.push(r.carryInfo()!.topNdcY);
    }
    for (const t of tops) expect(t).toBeCloseTo(tops[0], 4);
  });
  it('3 人称（カメラが プレイヤーから はなれて いる）: プレイヤーの 胸 の 前', () => {
    const { r, cam } = setup({ player: () => ({ x: 0, y: 9, z: 0 }) });
    r.update([carriedView({ z: 0 })], cam);
    const c = r.carryInfo()!;
    expect(c.firstPerson).toBe(false);
    expect(c.y).toBeGreaterThan(9.3);
    expect(c.y).toBeLessThan(10.2);
    expect(Math.hypot(c.x, c.z)).toBeLessThan(1);
  });
  it('3 人称: プレイヤー の かげ に ならない（カメラ から 見て 横 ・ 上 に 出る）', () => {
    const { r, cam } = setup({ player: () => ({ x: 0, y: 9, z: 0 }) });
    r.update([carriedView({ z: 0 })], cam);
    const c = r.carryInfo()!;
    // カメラ（0, ?, 6 あたり）から プレイヤー を 見た とき、にわとり が プレイヤー（ndc x 0）から はなれて 見える
    expect(Math.abs(c.centerNdcX)).toBeGreaterThan(0.08);
    expect(c.y).toBeGreaterThan(9.8);
  });
  it('おろす と ふつう の 大きさ・かげ が もどる', () => {
    const { fx, r, cam } = setup({ player: () => ({ x: 0, y: 9, z: 6 }) });
    r.update([carriedView()], cam);
    expect(r.carryInfo()).not.toBeNull();
    const v = [view(1, { friend: true, x: 2, y: 9, z: 0 })];
    fx.step(v, { x: 0, y: 9, z: 6 });
    r.update(v, cam);
    expect(r.carryInfo()).toBeNull();
    let root: THREE.Object3D | undefined;
    r.group.traverse((o) => {
      if (o instanceof THREE.Group && o.children.length && o.children[0] instanceof THREE.Group && !root) root = o;
    });
    expect(root!.position.toArray()).toEqual([2, 9, 0]);
    expect(root!.scale.x).toBe(1);
    expect(root!.quaternion.w).toBeCloseTo(1, 5);
  });
});

describe('パタパタ・着地 ぽよん（見た目）', () => {
  it('おちる 間 羽が 左右 に ひろがる。着地 すると 6 ステップ（0.1 秒）つぶれて もどる', () => {
    let clock = 0;
    const { r, cam } = setup({ now: () => clock });
    const wing = () => {
      let w = 0;
      r.group.traverse((o) => {
        if (o instanceof THREE.Bone && o.name === 'wingR') w = o.rotation.z;
      });
      return w;
    };
    const rigScaleY = () => {
      let s = 0;
      r.group.traverse((o) => {
        if (o instanceof THREE.Group && o.children.some((c) => c instanceof THREE.Bone)) s = o.scale.y;
      });
      return s;
    };
    const air = view(1, { friend: true, fluttering: true, y: 12, state: 'wander', stateTicks: 40 });
    r.update([air], cam);
    expect(wing()).toBeGreaterThan(0.5); // 30° 以上（ラジアン）
    clock += 50; // 3 ステップ 分
    r.update([air], cam);
    expect(wing()).toBeGreaterThan(0.5);
    const normal = rigScaleY();
    // 着地
    const ground = view(1, { friend: true, fluttering: false, y: 9, state: 'wander', stateTicks: 41 });
    clock += 16;
    r.update([ground], cam); // 着地 した フレーム
    clock += 50; // 3 ステップ 後 = いちばん つぶれる
    r.update([ground], cam);
    expect(rigScaleY()).toBeLessThan(normal * 0.9);
    clock += 100; // 6 ステップ 以上
    r.update([ground], cam);
    expect(rigScaleY()).toBeCloseTo(normal, 3);
  });
});
