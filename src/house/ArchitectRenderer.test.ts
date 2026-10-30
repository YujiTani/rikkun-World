import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Architect } from './architect';
import { ArchitectRenderer } from './ArchitectRenderer';
import { ARCHITECT_TRI_LIMIT, architectModel } from './architectSpec';

/** HOUSE-1A: 建築士さんの 描く 係。描画回数・三角形・描かない 条件（DOM・WebGL なしで しらべる） */

const camera = (): THREE.PerspectiveCamera => {
  const c = new THREE.PerspectiveCamera(70, 1.6, 0.1, 500);
  c.position.set(0, 1.6, 0);
  c.lookAt(0, 1.6, -10); // 北（−z）を 向く
  c.updateMatrixWorld();
  return c;
};
const arch = (id: string, x: number, z: number, first = false): Architect => new Architect({ id, first, x, y: 0, z, seed: 1 });

describe('描く かず', () => {
  it('見えている 1 人 = 描画 1 回・三角形は 形の とおり。ふちどりは ねらった 1 人だけ +1 回', () => {
    const r = new ArchitectRenderer();
    const a = arch('first', 0, -8, true);
    r.update([a], camera(), null);
    expect(r.stats()).toEqual({ shown: 1, draws: 1, triangles: architectModel().tris });
    expect(r.stats().triangles).toBeLessThanOrEqual(ARCHITECT_TRI_LIMIT);
    r.update([a], camera(), 'first');
    expect(r.stats()).toEqual({ shown: 1, draws: 2, triangles: architectModel().tris + architectModel().hullTris });
    r.update([a], camera(), 'someoneElse');
    expect(r.stats().draws).toBe(1);
  });

  it('影は 自分で 描かない。足もとの 影の 位置だけ わたす（にわとりの 影に まざる）', () => {
    const r = new ArchitectRenderer();
    const a = arch('first', 1.5, -8.5, true);
    a.y = 3;
    a.yaw = 0.7;
    r.update([a], camera(), null);
    expect(r.shadowSpots()).toEqual([{ x: 1.5, y: 3, z: -8.5, yaw: 0.7, sx: 0.9, sz: 0.9 }]);
    expect(r.group.children.every((c) => !(c instanceof THREE.InstancedMesh))).toBe(true);
  });
});

describe('描かない 条件', () => {
  it('うしろ・画面の 外・遠い 建築士さんは 描かない（影も 出さない）', () => {
    const r = new ArchitectRenderer();
    r.update([arch('behind', 0, 8), arch('side', 60, -8), arch('far', 0, -200)], camera(), null);
    expect(r.stats()).toEqual({ shown: 0, draws: 0, triangles: 0 });
    expect(r.shadowSpots()).toEqual([]);
  });

  it('地面の メッシュが まだ できて いない 所には 出さない', () => {
    let ready = false;
    const r = new ArchitectRenderer(() => ready);
    const a = arch('first', 0, -8, true);
    r.update([a], camera(), null);
    expect(r.stats().shown).toBe(0);
    ready = true;
    r.update([a], camera(), null);
    expect(r.stats().shown).toBe(1);
  });

  it('一覧から はずれた 建築士さんは 場面から 取りのぞく。また 出ると 同じ 入れ物を 使う', () => {
    const r = new ArchitectRenderer();
    const a = arch('first', 0, -8, true);
    r.update([a], camera(), null);
    expect(r.group.children).toHaveLength(1);
    const root = r.group.children[0];
    r.update([], camera(), null);
    expect(r.group.children).toHaveLength(0);
    r.update([a], camera(), null);
    expect(r.group.children).toHaveLength(1);
    expect(r.group.children[0]).toBe(root);
  });
});

describe('骨の 動き', () => {
  const bone = (r: ArchitectRenderer, name: string): THREE.Bone => {
    const root = r.group.children[0]!;
    let found: THREE.Bone | undefined;
    root.traverse((o) => {
      if (o instanceof THREE.Bone && o.name === name) found = o;
    });
    return found!;
  };

  it('位置と 向き: 足もとに 置き、向きは −yaw', () => {
    const r = new ArchitectRenderer();
    const a = arch('first', 2, -8, true);
    a.yaw = 1;
    r.update([a], camera(), null);
    const root = r.group.children[0]!;
    expect(root.position.toArray()).toEqual([2, 0, -8]);
    expect(root.rotation.y).toBeCloseTo(-1, 9);
  });

  it('うなずき: 頭が 下を 向く（x が −）。木づちは いつも かたの 向き', () => {
    const r = new ArchitectRenderer();
    const a = arch('first', 0, -8, true);
    a.nod = 10;
    r.update([a], camera(), null);
    expect(bone(r, 'head').rotation.x).toBeLessThan(-0.4);
    expect(bone(r, 'tool').rotation.x).toBeCloseTo((28 * Math.PI) / 180, 9);
    a.nod = -1;
    r.update([a], camera(), null);
    expect(bone(r, 'head').rotation.x).toBe(0);
  });

  it('あるく: 足が 左右 反対に ふれる。体が 少し 上下する', () => {
    const r = new ArchitectRenderer();
    const a = arch('first', 0, -8, true);
    a.gait = Math.PI / 2;
    a.gaitAmp = 1;
    r.update([a], camera(), null);
    expect(bone(r, 'legL').rotation.x).toBeGreaterThan(0.3);
    expect(bone(r, 'legR').rotation.x).toBeCloseTo(-bone(r, 'legL').rotation.x, 9);
    expect(bone(r, 'armL').rotation.x).toBeLessThan(0);
    const rest = architectModel().rest[0]!;
    expect(bone(r, 'body').position.y).toBeGreaterThan(rest[1]);
  });

  it('おっとっと: 体ごと かたむく。終わると まっすぐ', () => {
    const r = new ArchitectRenderer();
    const a = arch('first', 0, -8, true);
    a.wobble = 3;
    a.wobbleDir = 0;
    r.update([a], camera(), null);
    const rig = r.group.children[0]!.children[0]!;
    expect(rig.quaternion.w).toBeLessThan(0.999);
    a.wobble = -1;
    r.update([a], camera(), null);
    expect(rig.quaternion.w).toBe(1);
  });
});
