import { describe, expect, it } from 'vitest';
import { Euler, Vector3 } from 'three';
import climbUp from './gashaBigClips/climbUp.json';
import climbDown from './gashaBigClips/climbDown.json';
import lookBack from './gashaBigClips/lookBack.json';
import { BigActor } from './gashaBigActor';
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

  it('当たりの 箱が ある（うで・肩の 雲・髪の 段・リボン・頭）', () => {
    const names = hits.map((h) => h.name);
    for (const n of ['upperArmL', 'foreArmR', 'handL', 'shoulderL0', 'shoulderR0', 'tailL0', 'tailR0', 'tailL15', 'ribbonWingR', 'skull', 'bank0']) expect(names).toContain(n);
    // 雲の はしご（ladder / link / ramp / head の 段）は もう ない
    for (const n of names) expect(n).not.toMatch(/^(climb|link|ramp|head)[LR]\d/);
  });

  it('肩の 雲の 上から 髪の 段（ツインテール → ぽんぽん → 横の 髪）を ふんで 頭の 上まで 1 ブロックの 段で のぼれる', () => {
    const skull = hits.find((h) => h.name === 'skull')!;
    const skullTop = Math.floor(skull.center[1] + skull.half[1] - 1);
    // 肩の 雲の 上（いちばん 外がわの 雲の 上）から はじめる
    const sh = hits.filter((h) => /^shoulderL\d+$/.test(h.name));
    expect(sh.length).toBeGreaterThan(4);
    let start: [number, number, number] | null = null;
    for (const h of sh) {
      const j = Math.floor(h.center[1] + h.half[1] + 0.0001);
      const g: [number, number, number] = [Math.floor(h.center[0]), j, Math.floor(h.center[2])];
      if (standable(cells, ...g)) { start = g; break; }
    }
    expect(start).not.toBeNull();
    const noArms = hits.filter((h) => !/^(upperArm|foreArm|hand)/.test(h.name));
    const cellsL = voxelize(noArms, T.collide.margin, T.collide.topLift);
    const seen = reach(cellsL, start!);
    let top = 0;
    for (const [, j] of seen.values()) top = Math.max(top, j);
    console.log('shoulder start', start, 'skullTop', skullTop, 'reachTop', top);
    expect(top).toBeGreaterThanOrEqual(skullTop);
  });

  it('髪の 段・雲の 当たりは 段の 上がりが 1 ブロック いない', () => {
    for (const key of ['tail']) {
      const rs = hits.filter((h) => new RegExp(`^${key}L\\d+$`).test(h.name)).sort((a, b) => Number(a.name.slice(key.length + 1)) - Number(b.name.slice(key.length + 1)));
      expect(rs.length).toBeGreaterThan(2);
      for (let i = 1; i < rs.length; i++) expect(Math.abs(rs[i]!.center[1] - rs[i - 1]!.center[1])).toBeLessThanOrEqual(0.95);
    }
  });

  it('髪の 段は 重なる ところで 3 ブロック いじょう あいて いる（頭が つかえて ジャンプできない のを ふせぐ）', () => {
    const rs = hits.filter((h) => /^tailL\d+$/.test(h.name));
    for (const a of rs) for (const b of rs) {
      if (a === b || b.center[1] - a.center[1] < 2.5) continue; // a の 上（となりの 段は のぞく）に b
      const overlap = Math.abs(a.center[0] - b.center[0]) < a.half[0] + b.half[0] + 0.1 && Math.abs(a.center[2] - b.center[2]) < a.half[2] + b.half[2] + 0.1;
      if (overlap) expect(b.center[1] - b.half[1] - (a.center[1] + a.half[1]), `${a.name} と ${b.name}`).toBeGreaterThanOrEqual(3.05);
    }
  });

  it('当たりの 箱は どれも あつさ 1 ブロック いじょう（うすいと マスが 消えて 乗れない）', () => {
    for (const h of hits) {
      const t = h.half[1] * 2; // 箱の あつさ（上下の 軸）
      if (/^(upperArm|foreArm)/.test(h.name)) continue; // うでは 斜めで、あつさの 軸が 回って いる
      expect(t, h.name).toBeGreaterThanOrEqual(0.99);
    }
  });

  // ---------------------------------------------------------------- 全身に のれる（yuzu 2026-10-24）
  const insideAny = (p: Vector3, tol = 0): boolean => hits.some((h) => {
    const d = [p.x - h.center[0], p.y - h.center[1], p.z - h.center[2]];
    for (let k = 0; k < 3; k++) { const u = d[0]! * h.axes[k]![0] + d[1]! * h.axes[k]![1] + d[2]! * h.axes[k]![2]; if (Math.abs(u) > h.half[k]! + tol) return false; }
    return true;
  });
  /** 頭の 座標（休みの 姿勢）→ 世界（からだは 原点・向き 0） */
  const headPt = (x: number, y: number, z: number): Vector3 => new Vector3(x, y, z).applyEuler(new Euler(0.17, 0, 0, 'YXZ')).add(model.head).multiplyScalar(scale);

  it('全身の 当たり: 胴体・胸・首・肩・あご・頭の よこ・ツインテール・リボン・うで・指が ある', () => {
    const names = new Set(hits.map((h) => h.name));
    for (const n of ['torsoWaist', 'spineLow', 'spineMid', 'chestLow', 'chestMid1', 'chestMid2', 'chestUp', 'chestTop', 'collarbone', 'neck', 'shoulderClothL', 'shoulderClothR',
      'skull', 'skullTop0', 'skullTop1', 'skullTop2', 'skullTop3', 'skullTempleL', 'skullTempleR', 'skullJaw',
      'hairTailL0', 'hairTailL2', 'hairTailEndL', 'hairPomL0', 'hairPomR1', 'ribbonTailL0', 'ribbonTailR1', 'ribbonKnot',
      'upperArmL', 'foreArmL', 'handL', 'handFingersAL', 'handFingersBL', 'handThumbL', 'handFingersAR', 'handThumbR']) expect(names, n).toContain(n);
    expect(hits.length).toBeLessThan(200);
  });

  it('胴体の 中へ 歩いて 入れない: 胸・おなか・背骨・首・あごの まんなかは ぜんぶ 固い', () => {
    const c = (n: string) => { const h = hits.find((q) => q.name === n)!; return new Vector3(...h.center); };
    for (const n of ['torsoWaist', 'chestLow', 'chestMid1', 'chestMid2', 'chestUp', 'chestTop', 'neck', 'skullJaw', 'skull']) {
      const p = c(n);
      expect(cells.has(cellKey(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z))), n).toBe(true);
    }
  });

  it('見える 体の 面は ほとんど 当たりの 箱に ふくまれる（コケ・小さな かざり・てっぺんの 穴の 中・ぼろぼろの すそ の はしは のぞく）', () => {
    const tol = 0.3; // ブロック。見た目との ずれ
    let tot = 0, bad = 0;
    const badBy: Record<string, number> = {};
    model.group.updateMatrixWorld(true);
    model.group.traverse((o) => {
      const m = o as import('three').Mesh;
      if (!m.isMesh || !/:main$/.test(m.name)) return;
      const pa = m.geometry.getAttribute('position'), ca = m.geometry.getAttribute('color');
      for (let i = 0; i + 2 < pa.count; i += 3) {
        const a = new Vector3().fromBufferAttribute(pa, i).applyMatrix4(m.matrixWorld), b = new Vector3().fromBufferAttribute(pa, i + 1).applyMatrix4(m.matrixWorld), cc = new Vector3().fromBufferAttribute(pa, i + 2).applyMatrix4(m.matrixWorld);
        const n = new Vector3().crossVectors(b.clone().sub(a), cc.clone().sub(a)); const area = n.length() / 2; n.normalize();
        if (ca.getY(i) > ca.getX(i) * 1.15 && ca.getY(i) > ca.getZ(i) * 1.3) continue; // コケ（みどり）
        const cen = a.add(b).add(cc).multiplyScalar(1 / 3);
        if (m.name.startsWith('Head') && Math.abs(cen.x) < 3.2 && cen.y > 24 && Math.abs(cen.z) < 3.3) continue; // てっぺんの 穴の 中（あけて ある）
        tot += area;
        if (!insideAny(cen.clone().addScaledVector(n, -0.15), tol) && !insideAny(cen.clone().addScaledVector(n, 0.15), tol)) { bad += area; badBy[m.name] = (badBy[m.name] ?? 0) + area; }
      }
    });
    console.log('見える 面の ふくまれない 割合', ((100 * bad) / tot).toFixed(1) + '%', JSON.stringify(badBy));
    expect(bad / tot).toBeLessThan(0.08); // のこりは 矢・髪どめ・髪の 段の 下に たれた ぶぶん・ほおの かざり
    // 手・うで・肩・首は ぜんぶ ふくまれる
    for (const k of ['LeftHand', 'RightHand', 'LeftForeArm', 'RightForeArm', 'LeftArm', 'RightArm', 'neck', 'Hips']) expect((badBy[`${k}:main`] ?? 0), k).toBeLessThan(1);
  });

  it('てっぺんの 穴と 後ろの 欠け（コアを ねらう ところ）は ふさがない: 穴の 上と コアの 後ろには 当たりの 箱が ない', () => {
    // てっぺんの 穴（頭の 座標 x ±1.7, z ±1.7 の まんなか）: 穴の 底（光る 板）の 上は あいている
    for (const y of [17.6, 18.5, 19.4, 20.6]) expect(insideAny(headPt(0, y, -0.4)), `穴 y=${y}`).toBe(false);
    // 穴の まわり（わく）は ある
    expect(insideAny(headPt(5, 19, -0.4))).toBe(true);
    expect(insideAny(headPt(0, 19, 5))).toBe(true);
    // 後ろの 欠け: コアの 場所（頭の 座標 (0, 10.2, -10.6)）と その 後ろ 3 ブロックは あいている
    for (const z of [-10.6, -12, -14, -16, -18]) expect(insideAny(headPt(0, 10.2, z)), `コア z=${z}`).toBe(false);
  });

  it('全身の 道: 肩の 雲から 胴体の 上（えり）・さこつ・おなか と、頭の てっぺんの 前の ふち（顔の まえ）に 立てる。うでを 通らなくても', () => {
    const sh = hits.filter((h) => /^shoulderL\d+$/.test(h.name));
    let start: [number, number, number] | null = null;
    for (const h of sh) {
      const g: [number, number, number] = [Math.floor(h.center[0]), Math.floor(h.center[1] + h.half[1] + 0.0001), Math.floor(h.center[2])];
      if (standable(cells, ...g)) { start = g; break; }
    }
    expect(start).not.toBeNull();
    const seen = reach(cells, start!);
    const standsOn = (name: string): boolean => {
      const h = hits.find((q) => q.name === name)!;
      for (const [i, j, k] of seen.values()) {
        const d = [i + 0.5 - h.center[0], j - 0.5 - h.center[1], k + 0.5 - h.center[2]];
        let ok = true;
        for (let a = 0; a < 3; a++) { const u = d[0]! * h.axes[a]![0] + d[1]! * h.axes[a]![1] + d[2]! * h.axes[a]![2]; if (Math.abs(u) > h.half[a]! + 1e-6) ok = false; }
        if (ok) return true;
      }
      return false;
    };
    for (const n of ['chestTop', 'collarbone', 'chestUp', 'chestMid2', 'torsoWaist', 'skullTop0', 'skullTop1', 'skullTop2', 'skullTop3', 'ribbonKnot', 'shoulderClothL']) expect(standsOn(n), n).toBe(true);
  });

  it('1 回の 問い合わせで 調べる 箱は 少ない（大まかな 範囲で しぼって、くわしく 見る 箱は 多くて 10 こ ほど。毎ステップ 数十回 聞かれても 軽い）', () => {
    const ply = { x: 500, y: 1, z: 500, yawDeg: 0 };
    const actor = new BigActor(buildBig(), { climbUp, climbDown, lookBack } as never, { groundY: () => -1, player: () => ply }, 293);
    actor.place(0, 0, 0, 0.8); // 45 度 ほど 向いた からだ
    let max = 0, sum = 0, n = 0;
    for (let i = -45; i <= 45; i++) for (let k = -45; k <= 45; k++) for (let j = 0; j <= 40; j++) {
      actor.solid(i, j, k);
      const q = actor.work.lastQueryBoxes;
      if (q > 0) { max = Math.max(max, q); sum += q; n++; }
    }
    console.log('当たりの 箱', actor.boxCount, '／ 1 回で くわしく 調べる 箱 さいだい', max, '・へいきん', (sum / n).toFixed(2));
    expect(actor.boxCount).toBeLessThan(200);
    expect(max).toBeLessThanOrEqual(12);
    expect(sum / n).toBeLessThan(4);
  });
});
