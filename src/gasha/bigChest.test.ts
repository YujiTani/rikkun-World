import { describe, expect, it } from 'vitest';
import { Box3, Group, Mesh } from 'three';
import { ChestLogic, chestNear, createChestMesh } from './bigChest';
import { RELEASE } from './releaseTuning';

const C = RELEASE.chest;
const run = (c: ChestLogic, sec: number, near: boolean): number => {
  let drops = 0;
  const steps = Math.round(sec * 60);
  for (let i = 0; i < steps; i++) if (c.step(1 / 60, near).dropNow) drops++;
  return drops;
};

describe('大きな 宝箱の ふるまい', () => {
  it('せり上がって 出てくる → とじた まま → 近づくと ふたが ひらいて 中身が 1 回だけ とびだす', () => {
    const c = new ChestLogic();
    expect(c.phase).toBe('rising');
    run(c, C.riseSec + 0.1, false);
    expect(c.phase).toBe('closed');
    expect(c.rise).toBe(1);
    expect(c.lidDeg).toBe(0);
    // 遠い まま なら いつまでも あかない
    expect(run(c, 30, false)).toBe(0);
    expect(c.phase).toBe('closed');
    // 近づく
    const drops = run(c, C.openSec + 1, true);
    expect(drops).toBe(1);
    expect(c.phase).toBe('open');
    expect(c.lidDeg).toBeCloseTo(C.openAngleDeg, 5);
    // あいた あとは なんど 近づいても もう 出ない
    expect(run(c, 5, true)).toBe(0);
  });

  it('せり上がり中に 近くても、出きってから ひらく', () => {
    const c = new ChestLogic();
    run(c, C.riseSec * 0.5, true);
    expect(c.phase).toBe('rising');
    expect(c.rise).toBeGreaterThan(0);
    expect(c.rise).toBeLessThan(1);
    run(c, C.riseSec, true);
    expect(['opening', 'open']).toContain(c.phase);
  });

  it('ふたの 角度は 0 から 調整表の 角度まで 単調に ふえる。中身は ふたが ひらきはじめて dropDelaySec あと', () => {
    const c = new ChestLogic();
    run(c, C.riseSec + 0.05, false);
    let last = 0, dropAt = -1, t = 0;
    for (let i = 0; i < 60 * 4; i++) {
      const r = c.step(1 / 60, true);
      t += 1 / 60;
      expect(c.lidDeg).toBeGreaterThanOrEqual(last - 1e-9);
      expect(c.lidDeg).toBeLessThanOrEqual(C.openAngleDeg + 1e-9);
      last = c.lidDeg;
      if (r.dropNow) dropAt = t;
    }
    expect(dropAt).toBeGreaterThan(C.dropDelaySec - 0.05);
    expect(dropAt).toBeLessThan(C.dropDelaySec + 0.1);
  });

  it('近い 判定: よこ openRadius いない、上下 openHeight いない', () => {
    const p = { x: 10, y: 5, z: 10 };
    const c = { x: 10 + C.openRadius - 0.1, y: 5, z: 10 };
    expect(chestNear(p, c)).toBe(true);
    expect(chestNear(p, { ...c, x: 10 + C.openRadius + 0.1 })).toBe(false);
    expect(chestNear(p, { x: 10, y: 5 + C.openHeight + 0.1, z: 10 })).toBe(false);
    expect(chestNear(p, { x: 10, y: 5 - C.openHeight + 0.1, z: 10 })).toBe(true);
  });
});

describe('大きな 宝箱の 形', () => {
  it('箱と ふたの 2 つだけ（描画 2 回）。大きさは 調整表の はば・おくゆき・高さ', () => {
    const chest = createChestMesh();
    const meshes: Mesh[] = [];
    chest.group.traverse((o) => { if ((o as Mesh).isMesh) meshes.push(o as Mesh); });
    expect(meshes.length).toBe(2);
    chest.setPose(1, 0);
    chest.group.updateMatrixWorld(true);
    const box = new Box3().setFromObject(chest.group);
    expect(box.max.x - box.min.x).toBeGreaterThanOrEqual(C.width - 0.01);
    expect(box.max.x - box.min.x).toBeLessThan(C.width + 1);
    expect(box.max.y - box.min.y).toBeCloseTo(C.bodyHeight + C.lidHeight, 1);
    expect(box.min.y).toBeCloseTo(0, 5);
  });

  it('せり上がり中は 地面の 下に かくれ、ふたが ひらくと ふたの いちばん 高い 点が 上がる（うしろの ちょうつがいで まわる）', () => {
    const chest = createChestMesh();
    chest.setPose(0, 0);
    chest.group.updateMatrixWorld(true);
    expect(new Box3().setFromObject(chest.group).max.y).toBeLessThanOrEqual(0.01);
    chest.setPose(1, 0);
    chest.group.updateMatrixWorld(true);
    const closedTop = new Box3().setFromObject(chest.group).max.y;
    chest.setPose(1, 100);
    chest.group.updateMatrixWorld(true);
    const openBox = new Box3().setFromObject(chest.group);
    expect(openBox.max.y).toBeGreaterThan(closedTop);
    // 開いた ふたは うしろ（-z）の 外へ 箱の おくゆき ぶんも は み出さない
    expect(openBox.min.z).toBeGreaterThan(-C.depth - 0.5);
    expect(chest.group).toBeInstanceOf(Group);
  });

  it('材料は 頂点色つきの MeshBasicMaterial（昼夜の 明るさに 合わせて 暗くできる）', () => {
    const chest = createChestMesh();
    chest.group.traverse((o) => {
      const m = o as Mesh;
      if (!m.isMesh) return;
      const mat = m.material as { type: string; vertexColors: boolean };
      expect(mat.type).toBe('MeshBasicMaterial');
      expect(mat.vertexColors).toBe(true);
    });
  });
});
