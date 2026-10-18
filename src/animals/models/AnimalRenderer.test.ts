import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { AnimalState, AnimalView } from '../../contracts';
import { AnimalFx } from '../../fx/animalFx';
import { AnimalRenderer, ViewBuffer, wrapAngle } from './AnimalRenderer';

const view = (id: number, o: Partial<AnimalView> = {}): AnimalView => ({
  id,
  x: id,
  y: 9,
  z: 0,
  yaw: 0,
  headYaw: 0,
  state: 'idle' as AnimalState,
  stateTicks: 0,
  friend: false,
  hearts: 0,
  targeted: false,
  ...o,
});

function setup() {
  const fx = new AnimalFx({ sound: { playTones: () => {} } });
  const r = new AnimalRenderer({ fx });
  const cam = new THREE.PerspectiveCamera(70, 1.6, 0.1, 200);
  cam.position.set(0, 10, 6);
  cam.lookAt(0, 9, 0);
  return { fx, r, cam };
}

/** 描かれる もの（見えている メッシュ・Points）の 数 */
function drawn(root: THREE.Object3D): { n: number; tris: number } {
  let n = 0;
  let tris = 0;
  root.traverse((o) => {
    let vis = true;
    for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) vis = false;
    if (!vis) return;
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

describe('AnimalRenderer（描画回数・三角形。AC24）', () => {
  it('11 わ（やせい 3・なかま 8）+ ねらい中 1 + 頭の ハート で 描画 14 回・三角形 8,000 以下', () => {
    const { fx, r, cam } = setup();
    const views: AnimalView[] = [];
    for (let i = 0; i < 8; i++) views.push(view(i + 1, { friend: true, x: i * 0.7 - 2, z: -1 }));
    for (let i = 0; i < 3; i++) views.push(view(20 + i, { hearts: 2, x: i - 1, z: -3, targeted: i === 0 }));
    fx.step(views, { x: 0, y: 9, z: 0 });
    r.update(views, cam);
    const d = drawn(r.group);
    expect(d.n).toBe(14); // 11 + ふちどり 1 + 影 1 + つぶ(ハート) 1
    expect(d.tris).toBeLessThanOrEqual(8000);
    expect(r.stats()).toMatchObject({ animals: 11, draws: 14 });
    expect(r.stats().triangles).toBeLessThanOrEqual(8000);
  });
  it('ねらわれていない 時は ふちどり が 出ない。ハートも 影も 0 なら 1 わ = 1 回 + 影 1 回', () => {
    const { fx, r, cam } = setup();
    const views = [view(1)];
    fx.step(views, { x: 0, y: 9, z: 0 });
    r.update(views, cam);
    expect(drawn(r.group).n).toBe(2);
    views[0].targeted = true;
    r.update(views, cam);
    expect(drawn(r.group).n).toBe(3);
  });
  it('1 わ の 三角形 は 600 以下（なかまも）', () => {
    for (const friend of [false, true]) {
      const { r, cam } = setup();
      r.update([view(1, { friend })], cam);
      let body = 0;
      r.group.traverse((o) => {
        if (o instanceof THREE.SkinnedMesh && o.visible) body += (o.geometry.index?.count ?? 0) / 3;
      });
      expect(body).toBeLessThanOrEqual(600);
      expect(body).toBeGreaterThan(300);
    }
  });
  it('入れ物を 使いまわす: 消して また 出しても メッシュは 増えない', () => {
    const { r, cam } = setup();
    const count = () => {
      let n = 0;
      r.group.traverse((o) => {
        if (o instanceof THREE.SkinnedMesh) n++;
      });
      return n;
    };
    r.update([view(1), view(2)], cam);
    expect(count()).toBe(4);
    r.update([view(1)], cam);
    expect(count()).toBe(2);
    r.update([view(1), view(3)], cam);
    expect(count()).toBe(4);
  });
  it('やせい → なかま に なると リボン つきの 形に かわる', () => {
    const { r, cam } = setup();
    const tri = () => {
      let t = 0;
      r.group.traverse((o) => {
        if (o instanceof THREE.SkinnedMesh && o.visible) t = (o.geometry.index?.count ?? 0) / 3;
      });
      return t;
    };
    r.update([view(1)], cam);
    const before = tri();
    r.update([view(1, { friend: true })], cam);
    expect(tri()).toBeGreaterThan(before);
  });
  it('置く: 位置 と 向き（−yaw）、動いた 骨（つつくで 頭が 前に 出る）', () => {
    const { r, cam } = setup();
    r.update([view(1, { x: 3, y: 8, z: -2, yaw: Math.PI / 2, state: 'eat', stateTicks: 8 })], cam);
    let root: THREE.Object3D | undefined;
    r.group.traverse((o) => {
      if (o instanceof THREE.Group && o.children.length && o.children[0] instanceof THREE.Group && !root) root = o;
    });
    expect(root!.position.toArray()).toEqual([3, 8, -2]);
    expect(root!.rotation.y).toBeCloseTo(-Math.PI / 2, 5);
    let head: THREE.Object3D | undefined;
    r.group.traverse((o) => {
      if (o.name === 'head') head = o;
    });
    expect(head!.position.z).toBeLessThan(-0.0 - 0.01);
  });
  it('wrapAngle', () => {
    expect(wrapAngle(Math.PI * 2 + 0.5)).toBeCloseTo(0.5, 6);
    expect(wrapAngle(-Math.PI * 2 - 0.5)).toBeCloseTo(-0.5, 6);
    expect(wrapAngle(4)).toBeCloseTo(4 - Math.PI * 2, 6);
  });
});

describe('ViewBuffer', () => {
  it('forEachVisible の 入れ物が 使いまわされても コピーを 持つ', () => {
    const shared = view(1);
    const api = {
      forEachVisible(fn: (v: AnimalView) => void) {
        for (const id of [1, 2]) {
          shared.id = id;
          shared.x = id * 10;
          fn(shared);
        }
      },
    };
    const buf = new ViewBuffer();
    const out = buf.fill(api);
    expect(out.map((v) => [v.id, v.x])).toEqual([
      [1, 10],
      [2, 20],
    ]);
    const again = buf.fill({ forEachVisible: (fn) => fn(view(5)) });
    expect(again.map((v) => v.id)).toEqual([5]);
    expect(again).toBe(out); // 同じ 配列
  });
});
