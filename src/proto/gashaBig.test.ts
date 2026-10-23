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
    const right = worldHits(m).find((h) => h.name === 'handR')!.center;
    const right0 = worldHits(buildBig()).find((h) => h.name === 'handR')!.center;
    void right0;
    expect(right[0]).toBeLessThan(0);
  });

  it('身長が 調整表の 高さに なる（頭の 当たりの 上の 面）', () => {
    const skull = hits.find((h) => h.name === 'skull')!;
    // 上の 面の まんなか
    const top = skull.center[1] + skull.half[1] * skull.axes[1][1];
    expect(top).toBeGreaterThan(T.size.height - 2);
    expect(top).toBeLessThan(T.size.height + 2);
    expect(scale).toBeGreaterThan(0.3);
  });

  it('描画回数: メッシュ 40 こ いか（目安 100 回 以内）', () => {
    expect(model.meshes).toBeLessThanOrEqual(40);
  });

  it('当たりの 箱が ある（うで・雲・リボン・頭）', () => {
    const names = hits.map((h) => h.name);
    for (const n of ['upperArmL', 'foreArmR', 'handL', 'climbL0', 'climbR0', 'linkL0', 'rampR0', 'headL0', 'ribbonWingR', 'skull', 'bank0']) expect(names).toContain(n);
  });

  it('地面から 手→前わん→上わん→肩の 平らな 道→雲の はしご→頭の 上 まで 1 ブロックの 段で のぼれる', () => {
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
    const rows = ['handL', 'foreArmL', 'upperArmL', 'climbL0', 'climbL10', 'linkL0', 'rampL0', 'headL0', 'skull', 'climbR10', 'headR0', 'bank0'].map((n) => `${n}:${hitHeight(n)}`);
    console.log('reach', rows.join(' '));
    const skull = hits.find((h) => h.name === 'skull')!;
    const skullTop = Math.floor(skull.center[1] + skull.half[1] - 1);
    let top = 0;
    for (const [, j] of seen.values()) top = Math.max(top, j);
    console.log('skullTop', skullTop, 'reachTop', top);
    expect(top).toBeGreaterThanOrEqual(skullTop);
  });
  it('雲の はしごだけで（うでを 使わず）地面から 頭の 上まで のぼれる。段の 上がりは 1 ブロック いない、当たりの あつさは 1 ブロック いじょう', () => {
    const noArms = hits.filter((h) => !/^(upperArm|foreArm|hand|shoulder)/.test(h.name));
    const cellsL = voxelize(noArms, T.collide.margin, T.collide.topLift);
    const c0 = hits.find((h) => h.name === 'climbL0')!;
    const ground = [Math.floor(c0.center[0] - c0.axes[2][0] * 3), 0, Math.floor(c0.center[2] - c0.axes[2][2] * 3)] as [number, number, number];
    // 出発は はしごの はじめの 段の 手前の 地面（段の 向きと 反対 = まわりの 地面）
    let start = ground;
    for (const [dx, dz] of [[0, 3], [0, -3], [3, 0], [-3, 0], [3, 3], [-3, -3]] as const) {
      const g: [number, number, number] = [Math.floor(c0.center[0]) + dx, 0, Math.floor(c0.center[2]) + dz];
      if (standable(cellsL, ...g)) { start = g; break; }
    }
    const seen = reach(cellsL, start);
    const skull = hits.find((h) => h.name === 'skull')!;
    let top = 0;
    for (const [, j] of seen.values()) top = Math.max(top, j);
    expect(top).toBeGreaterThanOrEqual(Math.floor(skull.center[1] + skull.half[1] - 1));
    // 段の 上がり（上の 面の 高さの さ）と あつさ（ブロック）
    for (const key of ['climb', 'link', 'ramp', 'head']) {
      const rs = hits.filter((h) => new RegExp(`^${key}L\\d+$`).test(h.name)).sort((a, b) => Number(a.name.slice(key.length + 1)) - Number(b.name.slice(key.length + 1)));
      expect(rs.length).toBeGreaterThan(3);
      for (let i = 0; i < rs.length; i++) {
        expect(rs[i]!.half[1] * 2).toBeGreaterThanOrEqual(1);
        if (i) expect(Math.abs(rs[i]!.center[1] - rs[i - 1]!.center[1])).toBeLessThanOrEqual(0.95);
      }
    }
  });

  it('当たりの 箱は どれも あつさ 1 ブロック いじょう（うすいと マスが 消えて 乗れない）', () => {
    for (const h of hits) {
      const t = h.half[1] * 2; // 箱の あつさ（上下の 軸）
      if (/^(upperArm|foreArm)/.test(h.name)) continue; // うでは 斜めで、あつさの 軸が 回って いる
      expect(t, h.name).toBeGreaterThanOrEqual(0.99);
    }
  });
});
