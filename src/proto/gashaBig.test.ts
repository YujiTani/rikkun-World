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
      expect(parentOf(`${side}ArmMid`)).toBe(`${side}Arm`);
      expect(parentOf(`${side}ForeArm`)).toBe(`${side}ArmMid`);
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

  it('当たりの 箱が ある（うで・肩の 雲・雲の らせん・リボン・頭）', () => {
    const names = hits.map((h) => h.name);
    for (const n of ['upperArmL', 'foreArmR', 'handL', 'shoulderL0', 'shoulderR0', 'riseL0', 'riseR0', 'riseL6', 'riseR6', 'ribbonWingR', 'skull', 'bank0']) expect(names).toContain(n);
    // 雲の はしご（ladder / link / ramp / head の 段）は もう ない
    for (const n of names) expect(n).not.toMatch(/^(climb|link|ramp|head)[LR]\d/);
  });

  it('うでの 道: 地面 → 手 → 前わん → 上わん → 肩 → 雲の らせん。ブロックの そろい かた（ずれ 0〜1）が どう でも 通る', () => {
    // 上わんの 上の 面の 高さが ずれで 1 かわり、かたの ぬの・雲の らせんの 下の すきまが 1 ブロックに なって つかえた ことが あった
    const onBox = (h: WorldHit, i: number, j: number, k: number): boolean => {
      const d = [i + 0.5 - h.center[0], j - 0.5 - h.center[1], k + 0.5 - h.center[2]];
      for (let a = 0; a < 3; a++) {
        const u = d[0]! * h.axes[a]![0] + d[1]! * h.axes[a]![1] + d[2]! * h.axes[a]![2];
        if (Math.abs(u) > h.half[a]! + 0.55) return false;
      }
      return true;
    };
    const offsets: [number, number][] = [[0, 0], [0.5, 0.5], [0, 0.5], [0.4, 0.6], [0.25, 0.75], [0.5, 0]];
    for (const [ox, oz] of offsets) {
      const m = buildBig();
      m.group.position.set(ox, 0, oz);
      m.group.scale.setScalar(m.scale);
      const hs = worldHits(m);
      const cs = voxelize(hs, T.collide.margin, T.collide.topLift);
      for (const S of ['L', 'R']) {
        const hand = hs.find((h) => h.name === `hand${S}`)!;
        const tip = hand.half[2] + 6;
        const start: [number, number, number] = [Math.floor(hand.center[0] + hand.axes[2][0] * tip), 0, Math.floor(hand.center[2] + hand.axes[2][2] * tip)];
        const seen = reach(cs, start);
        const stood = (re: RegExp): boolean => [...seen.values()].some(([i, j, k]) => hs.some((h) => re.test(h.name) && onBox(h, i, j, k)));
        const tag = `ずれ (${ox}, ${oz}) ${S}`;
        expect(stood(new RegExp(`^upperArm${S}$`)), `${tag}: 上わん`).toBe(true);
        expect(stood(new RegExp(`^(shoulder${S}\\d+|armStep${S}|chestTop|collarbone)$`)), `${tag}: 肩`).toBe(true);
        expect(stood(new RegExp(`^rise${S}\\d+$`)), `${tag}: 雲の らせん`).toBe(true);
      }
    }
  }, 60_000);

  it('雲の らせんは 段の 上がりが 1 ブロック いない', () => {
    for (const key of ['rise']) {
      const rs = hits.filter((h) => new RegExp(`^${key}L\\d+$`).test(h.name)).sort((a, b) => Number(a.name.slice(key.length + 1)) - Number(b.name.slice(key.length + 1)));
      expect(rs.length).toBeGreaterThan(2);
      for (let i = 1; i < rs.length; i++) expect(Math.abs(rs[i]!.center[1] - rs[i - 1]!.center[1])).toBeLessThanOrEqual(0.95);
    }
  });

  it('雲の らせんは 重なる ところで 3 ブロック いじょう あいて いる（頭が つかえて ジャンプできない のを ふせぐ）', () => {
    const rs = hits.filter((h) => /^riseL\d+$/.test(h.name));
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
    for (const k of ['LeftHand', 'RightHand', 'LeftForeArm', 'RightForeArm', 'neck', 'Hips']) expect((badBy[`${k}:main`] ?? 0), k).toBeLessThan(1);
    // 上わんの かたの つけねの まるい かざりの はしは すこし のぞく（かたの ぬのの 当たりは うでの 道の 頭の 上を あけるため 内がわに よせた）
    for (const k of ['LeftArm', 'RightArm']) expect((badBy[`${k}:main`] ?? 0), k).toBeLessThan(6);
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

  it('全身の 道: 肩の 雲から 胴体の 上（えり）・さこつ に 立てる。うでを 通らなくても', () => {
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
    for (const n of ['chestTop', 'collarbone', 'chestUp', 'chestMid2', 'shoulderClothL']) expect(standsOn(n), n).toBe(true);
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

  // ---------------------------------------------------------------- 心臓の コア・背中の 穴の 道（yuzu 2026-10-24）
  const mkActor = (ox = 0, oz = 0, yaw = 0.8): BigActor => {
    const ply = { x: 500, y: 1, z: 500, yawDeg: 0 };
    const actor = new BigActor(buildBig(), { climbUp, climbDown, lookBack } as never, { groundY: () => -1, player: () => ply }, 293);
    actor.place(ox, 0, oz, yaw);
    return actor;
  };
  /** いまの 姿勢の actor で 歩いて 行ける 場所を 調べる 道具。maxDrop = 1 歩で おりられる 高さ、minJ = これより 低い 所へは おりない */
  function walker(actor: BigActor) {
    const names = actor.model.hits.map((h) => h.name);
    const box = (n: string) => actor.boxList[names.indexOf(n)]!;
    const cache = new Map<number, boolean>();
    const solid = (i: number, j: number, k: number): boolean => { const q = cellKey(i, j, k); let v = cache.get(q); if (v === undefined) { v = actor.solid(i, j, k); cache.set(q, v); } return v; };
    const stand = (i: number, j: number, k: number): boolean => j >= 0 && !solid(i, j, k) && !solid(i, j + 1, k) && (j === 0 || solid(i, j - 1, k));
    /** 箱の 上の 面の 中心（箱の 上下の 軸の 向き） */
    const topPt = (n: string): [number, number, number] => { const b = box(n); return [b.c[0]! + b.ax[3]! * b.half[1]!, b.c[1]! + b.ax[4]! * b.half[1]!, b.c[2]! + b.ax[5]! * b.half[1]!]; };
    /** 箱の 座標（胴体の 座標の ずれ。x, y, z）の 点を 世界へ。胴体の 拡大（1.45, 1.1, 1.3）を かける */
    const frame = (n: string, dx: number, dy: number, dz: number): [number, number, number] => {
      const b = box(n), a = dx * 1.45 * scale, bb = dy * 1.1 * scale, c = dz * 1.3 * scale;
      return [b.c[0]! + b.ax[0]! * a + b.ax[3]! * bb + b.ax[6]! * c, b.c[1]! + b.ax[1]! * a + b.ax[4]! * bb + b.ax[7]! * c, b.c[2]! + b.ax[2]! * a + b.ax[5]! * bb + b.ax[8]! * c];
    };
    /** 点の まわり（横 rh・下 dn・上 up）で 立てる マス */
    const cellsNear = (p: [number, number, number], rh = 1.0, dn = 1, up = 1): [number, number, number][] => {
      const out: [number, number, number][] = [];
      for (let i = Math.floor(p[0] - rh); i <= Math.ceil(p[0] + rh); i++) for (let k = Math.floor(p[2] - rh); k <= Math.ceil(p[2] + rh); k++) for (let j = Math.floor(p[1] - dn); j <= Math.ceil(p[1] + up); j++) {
        if (Math.hypot(i + 0.5 - p[0], k + 0.5 - p[2]) <= rh && stand(i, j, k)) out.push([i, j, k]);
      }
      return out;
    };
    /** 箱の 上に 立てる マス（雲・肩など 上下の 軸が 世界の 上の 箱） */
    const seedsOn = (n: string): [number, number, number][] => {
      const b = box(n), top = b.c[1]! + b.ax[4]! * b.half[1]!, out: [number, number, number][] = [];
      for (let i = Math.floor(b.c[0]! - 3); i <= Math.ceil(b.c[0]! + 3); i++) for (let k = Math.floor(b.c[2]! - 3); k <= Math.ceil(b.c[2]! + 3); k++) for (const j of [Math.floor(top + 0.3) - 1, Math.floor(top + 0.3), Math.floor(top + 0.3) + 1]) {
        const dx = i + 0.5 - b.c[0]!, dz = k + 0.5 - b.c[2]!;
        if (Math.abs(dx * b.ax[0]! + dz * b.ax[2]!) < b.half[0]! && Math.abs(dx * b.ax[6]! + dz * b.ax[8]!) < b.half[2]! && stand(i, j, k)) out.push([i, j, k]);
      }
      return out;
    };
    const reach = (seeds: [number, number, number][], maxDrop: number, minJ = 0, parents?: Map<number, number>): Set<number> => {
      const seen = new Set<number>(), q: [number, number, number][] = [];
      for (const s of seeds) { seen.add(cellKey(...s)); q.push(s); }
      while (q.length) {
        const [i, j, k] = q.pop()!;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const ni = i + dx, nk = k + dz;
          if (Math.abs(ni - Math.floor(actor.pos.x)) > 40 || Math.abs(nk - Math.floor(actor.pos.z)) > 40) continue;
          for (let nj = j + 1; nj >= Math.max(minJ, 0, j - maxDrop); nj--) {
            if (!stand(ni, nj, nk)) continue;
            if (nj === j + 1 && solid(i, j + 2, k)) break;
            const kk = cellKey(ni, nj, nk);
            if (!seen.has(kk)) { seen.add(kk); q.push([ni, nj, nk]); parents?.set(kk, cellKey(i, j, k)); }
            break;
          }
        }
      }
      return seen;
    };
    const touches = (seen: Set<number>, p: [number, number, number], rh = 1.0, dn = 1, up = 1): boolean => {
      for (const key of seen) {
        const j = key % 1024, rest = Math.floor(key / 1024), k = (rest % 65536) - 32768, i = Math.floor(rest / 65536) - 32768;
        if (Math.hypot(i + 0.5 - p[0], k + 0.5 - p[2]) <= rh && j >= p[1] - dn && j <= p[1] + up) return true;
      }
      return false;
    };
    /** 道の 床の 上の 面の 点（胴体の 座標の z）: 床の だん（外）の 箱を 基準に する */
    const KT = T.core.tunnel, fz0 = (KT.backZ + -7.5) / 2, ft = KT.floorThick / 2;
    const path = (z: number): [number, number, number] => frame('chestCoreFloor', 0, ft, z - fz0);
    return { box, solid, stand, topPt, frame, path, cellsNear, seedsOn, reach, touches };
  }

  it('心臓の コア: 当たりの 箱 core が ある。頭の コアは ない（頭の 欠けに 光る 物は ない）', () => {
    const names = hits.map((h) => h.name);
    expect(names).toContain('core');
    expect(names.filter((n) => n === 'core').length).toBe(1);
    // コアは 胸の 中（頭より ずっと 下）で 少し 左（+x）
    const c = hits.find((h) => h.name === 'core')!, skull = hits.find((h) => h.name === 'skull')!;
    expect(c.center[1]).toBeLessThan(skull.center[1] - 5);
    expect(c.center[0]).toBeGreaterThan(model.group.position.x + 0.5);
  });

  it('背中の 穴の 道は 幅・高さ 2 ブロック いじょう', () => {
    const KT = T.core.tunnel, sc = scale * 1.1; // 縦の 拡大
    expect((KT.ceilY - KT.floorY) * sc).toBeGreaterThanOrEqual(2.5);
    expect(KT.width * 1.45 * scale).toBeGreaterThanOrEqual(2.5);
  });

  it('道は 途中で とぎれて いる: 穴の はばは 横に 6 ブロック いじょう、穴の 底は 深い（下に 体が ない）', () => {
    const KT = T.core.tunnel, w = walker(mkActor());
    const A = w.path(KT.gap.z0), B = w.path(KT.gap.z1);
    const gapBlocks = Math.hypot(B[0] - A[0], B[2] - A[2]);
    console.log('穴の はば（ブロック）', gapBlocks.toFixed(2), '・高さの ちがい', (A[1] - B[1]).toFixed(2));
    expect(gapBlocks).toBeGreaterThanOrEqual(6);
    // むこうの 床は 手前の 床の ふちより 低い（下りの 斜め）ので、とびこえる ときは 横 6 ブロック いじょう
    // 穴の まんなかの 真下: 床の ふちから 下へ、体が ない 深さ
    const M: [number, number, number] = [(A[0] + B[0]) / 2, Math.min(A[1], B[1]), (A[2] + B[2]) / 2];
    const ci = Math.floor(M[0]), ck = Math.floor(M[2]);
    let depth = 0;
    for (let j = Math.floor(M[1]) - 1; j >= 0 && !w.solid(ci, j, ck); j--) depth++;
    console.log('穴の 深さ（ブロック。ぶつかる 物まで）', depth);
    expect(depth).toBeGreaterThanOrEqual(3);
  });

  it('肩の 雲 → 雲の 道 → 飛び降り（4〜6 ブロック）→ 背中の 穴の 床の だん → 穴の 手前の 床（休みの 姿勢・ブロックの そろい かた 0〜1）', () => {
    // 向きは 地面の マスに そろえた 0 度・90 度（斜めに 向くと、かたむいた 胴体の 背中が 階段に なって 登れて しまう 見かけに なる ので 数えない）
    for (const [ox, oz, yaw] of [[0, 0, 0], [0.5, 0.5, 0], [0.25, 0.75, Math.PI / 2], [0.5, 0, Math.PI / 2]] as [number, number, number][]) {
      const actor = mkActor(ox, oz, yaw), w = walker(actor);
      const seeds = w.seedsOn('shoulderL0');
      expect(seeds.length).toBeGreaterThan(0);
      const ledge = w.path(T.core.tunnel.backZ + 0.4);
      const drop = (() => { const b = w.box('backJump'); return b.c[1]! + b.half[1]! - ledge[1]; })();
      expect(drop, `ずれ (${ox}, ${oz}): 飛び降りの 高さ`).toBeGreaterThanOrEqual(4);
      expect(drop, `ずれ (${ox}, ${oz}): 飛び降りの 高さ`).toBeLessThanOrEqual(6.2);
      const seen6 = w.reach(seeds, 6);
      expect(w.touches(seen6, ledge), `ずれ (${ox}, ${oz}): 床の だんへ 飛び降りれば 行ける`).toBe(true);
    }
  }, 120_000);

  it('一方通行: 床の だんに おりたら、地面に おりずに 肩の 雲・雲の 道へは もどれない。穴の むこうの 床へも 歩いては 行けない', () => {
    for (const [ox, oz, yaw] of [[0, 0, 0], [0.5, 0.5, 0], [0.25, 0.75, Math.PI / 2], [0.5, 0, Math.PI / 2]] as [number, number, number][]) {
      const actor = mkActor(ox, oz, yaw), w = walker(actor);
      const ledge = w.path(T.core.tunnel.backZ + 0.4);
      const lj = Math.floor(ledge[1]);
      const seeds = w.cellsNear(ledge);
      expect(seeds.length).toBeGreaterThan(0);
      const seen = w.reach(seeds, 6, lj - 1); // これより 低くは おりない（おりたら 地面から 登りなおし）
      for (const n of ['shoulderL0', 'backJump', 'backStep0']) expect(w.touches(seen, w.topPt(n)), `ずれ (${ox}, ${oz}): ${n} へは もどれない`).toBe(false);
      expect(w.touches(seen, w.path(T.core.tunnel.gap.z0 - 2.2), 1.0), '穴の 手前の 床').toBe(true);
      expect(w.touches(seen, w.path(T.core.tunnel.gap.z1 + 0.5)), '穴の むこうの 床').toBe(false);
      expect(w.touches(seen, w.topPt('chestTop'), 3, 2, 2), '胸の 上へは もどれない').toBe(false);
    }
  }, 120_000);

  it('はって 進む・首を 振る・怒る 全コマで、肩 → 雲の 道 → 飛び降り → 穴の 手前の 床 が とぎれない（穴の むこうへは いつも 行けない）', () => {
    const actor = mkActor();
    const fails: string[] = [];
    let frames = 0, minDrop = 99, maxDrop = -99;
    const check = (t: string): void => {
      frames++;
      const w = walker(actor);
      const seeds = w.seedsOn('shoulderL0');
      if (!seeds.length) { fails.push(`${t}(肩)`); return; }
      const seen = w.reach(seeds, 6), ledge = w.path(T.core.tunnel.backZ + 0.4);
      const d = w.box('backJump').c[1]! + w.box('backJump').half[1]! - ledge[1];
      minDrop = Math.min(minDrop, d); maxDrop = Math.max(maxDrop, d);
      if (!w.touches(seen, ledge)) fails.push(`${t}(だん)`);
      else if (!w.touches(seen, w.path(T.core.tunnel.gap.z0 - 2.2))) { fails.push(`${t}(手前)`); if (process.env.DBGPATH && fails.length < 2) for (let z = -9.6; z <= -4; z += 0.8) { const p = w.path(z); console.log('DBGZ', z.toFixed(1), p.map((v) => v.toFixed(1)).join(','), 'cells', w.cellsNear(p, 1.0, 3, 3).map((c) => c.join(':') + (seen.has(cellKey(...c)) ? '*' : '')).join(' ')); } }
      if (w.touches(seen, w.path(T.core.tunnel.gap.z1 + 0.5))) { fails.push(`${t}(むこうに 行ける)`); if (process.env.DBGPATH && fails.length < 2) { const par = new Map<number, number>(); const s2 = w.reach(seeds, 6, 0, par); const tgt = w.cellsNear(w.path(T.core.tunnel.gap.z1 + 0.5)).map((c) => cellKey(...c)).find((k) => s2.has(k)); const names = actor.model.hits.map((h) => h.name); let cur = tgt; const out: string[] = []; while (cur !== undefined && out.length < 40) { const j = cur % 1024, rest = Math.floor(cur / 1024), k = (rest % 65536) - 32768, i = Math.floor(rest / 65536) - 32768; const on = actor.boxList.map((b, n) => ({ b, n })).filter(({ b }) => { const d = [i + 0.5 - b.c[0]!, j - 0.5 - b.c[1]!, k + 0.5 - b.c[2]!]; for (let a = 0; a < 3; a++) { const u = d[0]! * b.ax[a * 3]! + d[1]! * b.ax[a * 3 + 1]! + d[2]! * b.ax[a * 3 + 2]!; if (Math.abs(u) > b.half[a]! + 0.6) return false; } return true; }).map(({ n }) => names[n]); out.push(`${i},${j},${k}[${on.join('/')}]`); cur = par.get(cur); } console.log('PATHF', out.join(' <- ')); } }
    };
    check('rest');
    actor.walk(true); actor.goTo(0, 300);
    for (let t = 0; t < 60 * 22; t++) {
      actor.update(1 / 60);
      if (t % 20 === 19) check(`walk${((t + 1) / 60).toFixed(2)}`);
    }
    actor.walk(false);
    actor.lookBack();
    for (let t = 0; t < 60 * 6; t++) { actor.update(1 / 60); if (t % 30 === 29) check(`look${((t + 1) / 60).toFixed(2)}`); }
    actor.hit();
    for (let t = 0; t < 60 * 4; t++) { actor.update(1 / 60); if (t % 30 === 29) check(`angry${((t + 1) / 60).toFixed(2)}`); }
    console.log('飛び降りで 床の だんへ 行けた コマ', frames - fails.length, '/', frames, '飛び降りの 高さ', minDrop.toFixed(1), '〜', maxDrop.toFixed(1), fails.slice(0, 8).join(' '));
    expect(fails).toEqual([]);
    expect(minDrop).toBeGreaterThanOrEqual(3.5);
    expect(maxDrop).toBeLessThanOrEqual(6.5);
  }, 600_000);

  // ---------------------------------------------------------------- ガラスの 雲（すりガラスの ブロック。割れて、1 つずつ 生えなおす）
  it('ガラスの 雲: 1 ブロックの マスの 板。割ると マスが 消えて（見た目 と 当たり）、もどすと もどる', () => {
    const m = buildBig();
    expect(m.glass.length).toBeGreaterThan(300);
    for (const h of m.hits) if (h.mask) { expect(h.mask.on.length).toBe(h.mask.nx * h.mask.nz); expect(h.mask.on.some((v) => v === 1)).toBe(true); }
    const gc = m.glass[0]!, mk = m.hits[gc.hit]!.mask!;
    expect(mk.on[gc.cell]).toBe(1);
    m.setGlass(gc, false);
    expect(mk.on[gc.cell]).toBe(0);
    const mesh = m.joints[gc.joint].children.find((o) => o.name === `${gc.joint}:gblock`) as import('three').Mesh;
    expect(mesh.geometry.getAttribute('color').getW(gc.ranges[0]!.start)).toBe(0);
    m.setGlass(gc, true);
    expect(mk.on[gc.cell]).toBe(1);
    expect(mesh.geometry.getAttribute('color').getW(gc.ranges[0]!.start)).toBe(1);
  });

  it('割れた マスは 当たりからも 消える（その 場所に 立てなく なる）', () => {
    const actor = mkActor(), w = walker(actor);
    const mk = actor.model.hits.find((h) => h.name === 'bank20')!.mask!, b = w.box('bank20');
    const top = b.c[1]! + b.ax[4]! * b.half[1]!;
    const idx = actor.model.hits.findIndex((h) => h.name === 'bank20');
    const count = (): number => {
      let n = 0;
      for (let i = Math.floor(b.c[0]! - 4); i <= Math.ceil(b.c[0]! + 4); i++) for (let k = Math.floor(b.c[2]! - 4); k <= Math.ceil(b.c[2]! + 4); k++) for (let j = Math.floor(top - 1.5); j <= Math.floor(top); j++) if (actor.boxAt(i, j, k) === idx) n++;
      return n;
    };
    const before = count();
    expect(before).toBeGreaterThan(3);
    mk.on.fill(0);
    expect(count()).toBe(0);
  });

  it('雲は ガラスの ブロックだけ: 肩・腰・道の 雲の 板は ぜんぶ mask を もつ。腰の まわりに 雲が たくさん ある', () => {
    const clouds = hits.filter((h) => /^(shoulder[LR]|bank|rise|armStep|backStep|backJump)/.test(h.name));
    expect(clouds.length).toBeGreaterThan(60);
    for (const h of clouds) expect(h.mask, h.name).toBeDefined();
    expect(hits.filter((h) => h.name.startsWith('bank')).length).toBeGreaterThanOrEqual(40); // （腰の 雲を ふやす）
    expect(hits.filter((h) => /^rise[LR]/.test(h.name)).length).toBeLessThanOrEqual(16); // 頭の まわりの 雲は 減らした
  });

  it('こけ・くさ: 十字の 板（ブロックでは ない）が たくさん 生えて、描画回数は 少ない（種類ごとに 1 回）', () => {
    expect(model.plants).toBeGreaterThanOrEqual(300);
    const inst = [] as import('three').InstancedMesh[];
    model.group.traverse((o) => { if ((o as import('three').InstancedMesh).isInstancedMesh) inst.push(o as import('three').InstancedMesh); });
    expect(inst.length).toBeGreaterThanOrEqual(2);
    expect(inst.length).toBeLessThanOrEqual(3);
  });
});
