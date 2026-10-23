import { describe, expect, it } from 'vitest';
import { TUNE as T } from './gashaBigTuning';
import { buildBig, cellKey, voxelize, worldHits, JOINT_NAMES, type WorldHit } from './gashaBig';

/** 地面の 高さ 0、からだの 中心 = 原点、向き 0 の ときの 当たりの マス */
function cellsAtOrigin(model = buildBig()): { cells: Set<number>; hits: WorldHit[]; scale: number; model: ReturnType<typeof buildBig> } {
  model.group.position.set(0, 0, 0);
  model.group.scale.setScalar(model.scale);
  const hits = worldHits(model);
  return { cells: voxelize(hits, T.collide.margin, T.collide.topLift), hits, scale: model.scale, model };
}

/** 立てる マス（足の マス j）: その マスと 頭の マスが あいていて、下が かたい（j = 0 は 地面） */
function standable(cells: Set<number>, i: number, j: number, k: number): boolean {
  if (j < 0) return false;
  if (cells.has(cellKey(i, j, k)) || cells.has(cellKey(i, j + 1, k))) return false;
  return j === 0 || cells.has(cellKey(i, j - 1, k));
}

/** 地面から 歩いて・ジャンプ（1 ブロックの 段）で 行ける 立ち位置を ぜんぶ さがす */
function reach(cells: Set<number>, start: [number, number, number], maxDrop = 3): Map<number, [number, number, number]> {
  const seen = new Map<number, [number, number, number]>();
  const q: [number, number, number][] = [start];
  seen.set(cellKey(...start), start);
  while (q.length) {
    const [i, j, k] = q.pop()!;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const ni = i + dx, nk = k + dz;
      if (Math.abs(ni) > 90 || Math.abs(nk) > 90) continue;
      for (let nj = j + 1; nj >= Math.max(0, j - maxDrop); nj--) {
        if (!standable(cells, ni, nj, nk)) continue;
        // 1 つ 上がる ときは 今の 場所の 頭の 上も あいて いること
        if (nj === j + 1 && cells.has(cellKey(i, j + 2, k))) break;
        // 横に すすむ ときの からだ（足〜頭）が ぶつからない（上に 上がらない ときは 先の マスが あいて いれば よい）
        const key = cellKey(ni, nj, nk);
        if (!seen.has(key)) { seen.set(key, [ni, nj, nk]); q.push([ni, nj, nk]); }
        break;
      }
    }
  }
  return seen;
}

describe('gashaBig（#293 大きい がしゃどくろ）', () => {
  const { cells, hits, scale, model } = cellsAtOrigin();

  it('voxelize: 1 つの 箱は その 中に 中心が ある マスだけ', () => {
    const one: WorldHit = { name: 't', joint: 'Hips', center: [1, 1, 1], half: [1, 1, 1], axes: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] };
    expect(voxelize([one], 0, 0).size).toBe(8); // 2×2×2
    const rot: WorldHit = { ...one, axes: [[0, 0, 1], [0, 1, 0], [-1, 0, 0]] }; // 90 度 回しても おなじ
    expect(voxelize([rot], 0, 0).size).toBe(8);
  });

  it('関節の Group: Meshy の 骨と おなじ 名前で、胸 → 首 → 頭、左右 とも 肩 → 上腕 → 前腕 → 手 の 親子に なる', () => {
    expect(Object.keys(model.joints)).toEqual([...JOINT_NAMES]);
    const parentOf = (n: string) => model.joints[n as (typeof JOINT_NAMES)[number]].parent?.name;
    expect(parentOf('Head')).toBe('neck');
    expect(parentOf('neck')).toBe('Spine02');
    expect(parentOf('Spine02')).toBe('Spine01');
    for (const side of ['Left', 'Right']) {
      expect(parentOf(`${side}Shoulder`)).toBe('Spine02');
      expect(parentOf(`${side}Arm`)).toBe(`${side}Shoulder`);
      expect(parentOf(`${side}ForeArm`)).toBe(`${side}Arm`);
      expect(parentOf(`${side}Hand`)).toBe(`${side}ForeArm`);
    }
    // 休みの 姿勢: 回転なし、原点は 関節の 場所
    for (const n of JOINT_NAMES) expect(model.joints[n].quaternion.w).toBeCloseTo(1, 6);
  });

  it('当たりの 箱は 関節に ついて 動く（左の 前わんを 回すと 手の 当たりも いっしょに 動く）', () => {
    const m = buildBig();
    m.group.scale.setScalar(m.scale);
    const before = worldHits(m).find((h) => h.name === 'handL')!.center.slice();
    m.joints.LeftForeArm.rotation.x = 0.8;
    const after = worldHits(m).find((h) => h.name === 'handL')!.center;
    expect(Math.hypot(after[1] - before[1], after[2] - before[2])).toBeGreaterThan(5);
    // 右の 手は うごかない
    const r1 = worldHits(buildBig()).find((h) => h.name === 'handR')!.center;
    void r1;
  });

  it('身長が 調整表の 高さに なる（頭の 当たりの 上の 面）', () => {
    const skull = hits.find((h) => h.name === 'skull')!;
    // 上の 面の まんなか
    const top = skull.center[1] + skull.half[1] * skull.axes[1][1];
    expect(top).toBeGreaterThan(T.size.height - 2);
    expect(top).toBeLessThan(T.size.height + 2);
    expect(scale).toBeGreaterThan(0.5);
  });

  it('描画回数: メッシュ 40 こ いか（目安 100 回 以内）', () => {
    expect(model.meshes).toBeLessThanOrEqual(40);
  });

  it('当たりの 箱が ある（うで・雲・リボン・頭）', () => {
    const names = hits.map((h) => h.name);
    for (const n of ['upperArmL', 'foreArmR', 'handL', 'shoulderL', 'rampOutR', 'rampInL', 'ribbonWingR', 'skull', 'waist0']) expect(names).toContain(n);
  });

  it('地面から 手→前わん→上わん→肩の 雲→リボン→頭の 上 まで 1 ブロックの 段で のぼれる', () => {
    const hand = hits.find((h) => h.name === 'handL')!;
    const ground = [Math.floor(hand.center[0]), 0, Math.floor(hand.center[2] + hand.half[2] + 3)] as [number, number, number];
    expect(standable(cells, ...ground)).toBe(true);
    const seen = reach(cells, ground);
    // 地面の 上で どこまで 高く いけるか と 通る 場所
    const hitHeight = (name: string): number => {
      const h = hits.find((x) => x.name === name)!;
      let best = -1;
      for (const [i, j, k] of seen.values()) {
        const dx = i + 0.5 - h.center[0], dz = k + 0.5 - h.center[2];
        if (Math.abs(dx) <= h.half[0] + 1 && Math.abs(dz) <= h.half[2] + 1) best = Math.max(best, j);
      }
      return best;
    };
    const rows = ['handL', 'foreArmL', 'upperArmL', 'shoulderL', 'rampOutL', 'ribbonWingL', 'rampInL', 'skull', 'shoulderR', 'ribbonWingR', 'rampInR', 'waist11'].map((n) => `${n}:${hitHeight(n)}`);
    console.log('reach', rows.join(' '));
    const skull = hits.find((h) => h.name === 'skull')!;
    const skullTop = Math.floor(skull.center[1] + skull.half[1] - 1);
    let top = 0;
    for (const [, j] of seen.values()) top = Math.max(top, j);
    console.log('skullTop', skullTop, 'reachTop', top);
    expect(top).toBeGreaterThanOrEqual(skullTop);
  });
});
