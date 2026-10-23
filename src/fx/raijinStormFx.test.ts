import * as THREE from 'three';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { RaijinStormFx } from './raijinStormFx';
import { rgbOf } from './fxPaint';
import { BODY, LENGTHS, TECHS, STEP_OF, installFakeDocument, makeCamera, maxAlpha, newMeshes, readVerts } from './legendFxTestKit';

/** LEGEND-FX AC4（雷の 段ごとの ふえ方・稲妻 6 本・黄色）・AC8・AC9（描画 2 以下・三角形 2200 以下）。 */
beforeAll(() => {
  installFakeDocument();
});

type Tech = (typeof TECHS)[number];
const make = () => {
  const scene = new THREE.Scene();
  const before = new Set<THREE.Object3D>(scene.children);
  const fx = new RaijinStormFx(scene, makeCamera(), LENGTHS);
  return { fx, meshes: () => newMeshes(scene, before) };
};
const queue = (fx: RaijinStormFx, tech: Tech) => fx.queue({ tech, step: STEP_OF[tech], uDeg: 0, pos: BODY });
type Priv = { bolt2: Float32Array; bolt1: Float32Array; fine: (...a: unknown[]) => number; drawRing: (...a: unknown[]) => void; catmull: (...a: unknown[]) => number; bolt: (...a: unknown[]) => void };

/** 1 振りを 最後まで。1 ステップごとに 枝・輪・軌跡が 何回 描かれたかも 数える */
function swing(tech: Tech, idle = 0) {
  const { fx, meshes } = make();
  const p = fx as unknown as Priv;
  let branch = 0;
  let ring = 0;
  let trail = 0;
  const fineOrig = p.fine.bind(fx);
  vi.spyOn(p, 'fine').mockImplementation((...a: unknown[]) => {
    if (a[0] === p.bolt2) branch++;
    return fineOrig(...a);
  });
  const ringOrig = p.drawRing.bind(fx);
  vi.spyOn(p, 'drawRing').mockImplementation((...a: unknown[]) => {
    ring++;
    return ringOrig(...a);
  });
  const catOrig = p.catmull.bind(fx);
  vi.spyOn(p, 'catmull').mockImplementation((...a: unknown[]) => {
    trail++;
    return catOrig(...a);
  });
  for (let i = 0; i < idle; i++) fx.step();
  queue(fx, tech);
  const rec: { branch: number; ring: number; trail: number; draws: number; tris: number; alpha: number; pos: number[] }[] = [];
  for (let i = 0; i < 90; i++) {
    branch = ring = trail = 0;
    fx.step();
    const vs = meshes().map(readVerts);
    rec.push({ branch, ring, trail, draws: fx.info().draws, tris: fx.info().tris, alpha: Math.max(0, ...vs.map(maxAlpha)), pos: vs.flatMap((v) => Array.from(v.pos)) });
  }
  return { rec, meshes };
}

describe('AC4: 雷神剣は 段ごとに 強くなる', () => {
  it.each([['thrust', 0], ['kiriage', 3], ['kesa', 5]] as const)('%s: 軌跡から 出る 枝は 最大 %i 本', (tech, n) => {
    const { rec } = swing(tech);
    expect(Math.max(...rec.map((r) => r.branch))).toBe(n);
  });
  it('どの 段でも 刀身の 電気と 軌跡は 出る（つきも 軌跡あり）', () => {
    for (const tech of TECHS) {
      const { rec } = swing(tech);
      expect(rec.some((r) => r.trail > 0), tech).toBe(true);
      expect(rec.some((r) => r.draws > 0), tech).toBe(true);
    }
  });
  it('体の まわりの 稲妻の 輪は けさだけ', () => {
    expect(swing('kesa').rec.some((r) => r.ring > 0)).toBe(true);
    expect(swing('kiriage').rec.some((r) => r.ring > 0)).toBe(false);
    expect(swing('thrust').rec.some((r) => r.ring > 0)).toBe(false);
  });
  it('色は 黄色（こい ふち以外の 頂点は ぜんぶ 赤 ≧ 緑 ≧ 青 の 黄色い 系統）', () => {
    const under = rgbOf('#2E2160');
    const { fx, meshes } = make();
    queue(fx, 'kesa');
    let yellow = 0;
    let edge = 0;
    for (let i = 0; i < 90; i++) {
      fx.step();
      for (const v of meshes().map(readVerts)) {
        for (let k = 0; k < v.n; k++) {
          const [r, g, b] = [v.col[k * 4]!, v.col[k * 4 + 1]!, v.col[k * 4 + 2]!];
          if (Math.abs(r - under[0]) < 1e-3 && Math.abs(g - under[1]) < 1e-3 && Math.abs(b - under[2]) < 1e-3) edge++;
          else {
            expect(r, 'r ≧ g').toBeGreaterThanOrEqual(g - 1e-6);
            expect(g, 'g ≧ b').toBeGreaterThanOrEqual(b - 1e-6);
            expect(r - b, '黄色らしい（青より 赤が 強い）').toBeGreaterThan(0.2);
            yellow++;
          }
        }
      }
    }
    expect(yellow).toBeGreaterThan(edge);
  });
});

describe('AC4: けさが 当たった 妖怪 1 体ごとに 稲妻 6 本が 中心へ 集まる', () => {
  const center = { x: 1, y: 1.2, z: -3 };
  /** hit を 呼んで 集まる 稲妻だけ（振りは なし）を 4 ステップ（のびきる まで）見て、fine の 呼び出しを 集める */
  function converge(n: number) {
    const { fx } = make();
    const p = fx as unknown as Priv;
    const calls: unknown[][] = [];
    const orig = p.fine.bind(fx);
    vi.spyOn(p, 'fine').mockImplementation((...a: unknown[]) => {
      calls.push(a);
      return orig(...a);
    });
    for (let i = 0; i < n; i++) fx.hit(center);
    const perStep: unknown[][][] = [];
    for (let s = 0; s < 10; s++) {
      calls.length = 0;
      fx.step();
      perStep.push(calls.slice());
    }
    return { perStep, fx };
  }
  it('1 体: 1 ステップに 稲妻 6 本・まわりの 6 か所は 60° ごと・半径 1.5〜2・さきは 中心に とどく', () => {
    const { perStep } = converge(1);
    expect(perStep[0]!.length).toBe(6);
    const full = perStep[3]!; // のびきった ステップ
    expect(full.length).toBe(6);
    const angs = full.map((a) => {
      const [, sx, sy, sz, ex, ey, ez] = a as number[];
      expect(Math.hypot(sx! - center.x, sz! - center.z), '半径').toBeGreaterThanOrEqual(1.5 - 1e-6);
      expect(Math.hypot(sx! - center.x, sz! - center.z), '半径').toBeLessThanOrEqual(2 + 1e-6);
      expect(Math.hypot(ex! - center.x, ey! - center.y, ez! - center.z), '中心').toBeLessThan(1e-6);
      void sy;
      return ((Math.atan2(sz! - center.z, sx! - center.x) * 180) / Math.PI + 360) % 360;
    });
    const sorted = [...angs].sort((a, b) => a - b);
    // 60° ごと（ゆらぎ ±12° → となり同士の すきまは 60 ± 24 の はんい）
    for (let i = 0; i < 6; i++) {
      const gap = (sorted[(i + 1) % 6]! - sorted[i]! + 360) % 360;
      expect(gap, `${i} 本目の となり`).toBeGreaterThan(36);
      expect(gap).toBeLessThan(84);
    }
  });
  it('のびる 途中の さきは 中心の 手前（外がわから のびる）', () => {
    const { perStep } = converge(1);
    const first = perStep[0]![0]! as number[];
    expect(Math.hypot(first[4]! - center.x, first[6]! - center.z)).toBeGreaterThan(0.3);
  });
  it('2 体に 当てたら 12 本（1 体ごとに 6 本）', () => {
    const { perStep } = converge(2);
    expect(perStep[0]!.length).toBe(12);
  });
  it('集まったら 消える（そのあと 何も 描かない）', () => {
    const { fx } = converge(1);
    for (let i = 0; i < 5; i++) fx.step();
    expect(fx.info()).toMatchObject({ draws: 0, tris: 0 });
  });
});

describe('AC9: 描画 2 以下・三角形 2200 以下・何も していない 時は 0', () => {
  it('何も していない: 描画 0・三角形 0', () => {
    const { fx } = make();
    for (let i = 0; i < 5; i++) {
      fx.step();
      expect(fx.info()).toMatchObject({ draws: 0, tris: 0, active: 0 });
    }
  });
  it.each(TECHS)('%s: 1 振りの 最大で 描画 2 以下・三角形 2200 以下', (tech) => {
    const { rec } = swing(tech);
    expect(Math.max(...rec.map((r) => r.draws))).toBeLessThanOrEqual(2);
    expect(Math.max(...rec.map((r) => r.tris))).toBeLessThanOrEqual(2200);
  });
  it('けさ ＋ 当たった 妖怪 2 体の 稲妻（6 本ずつ）でも 2200 以下・描画 2 以下', () => {
    // 3 体以上が 同時に 当たると 2200 を こえる（3 体 2370・8 体 4770）。AC9 の「1 振り」に 多体ヒットを ふくむか は PO に 確認（報告）
    const { fx } = make();
    let t = 0;
    let d = 0;
    queue(fx, 'kesa');
    for (let i = 0; i < 90; i++) {
      if (i === 33) for (let q = 0; q < 2; q++) fx.hit({ x: q - 4, y: 1, z: -3 });
      fx.step();
      t = Math.max(t, fx.info().tris);
      d = Math.max(d, fx.info().draws);
    }
    expect(d).toBeLessThanOrEqual(2);
    expect(t).toBeLessThanOrEqual(2200);
  });
  it('cancel: まだ はじまって いない 雷は 出ない', () => {
    const { fx } = make();
    queue(fx, 'kesa');
    fx.step();
    fx.cancel();
    for (let i = 0; i < 90; i++) {
      fx.step();
      expect(fx.info().draws).toBe(0);
    }
  });
});

describe('AC8: シード付き・点滅しない', () => {
  it('同じ 入力の コマ送りで 同じ 形', () => {
    expect(swing('kesa').rec).toEqual(swing('kesa').rec);
  });
  it('明るさは 年れいだけで きまる（待ってから 振っても、2 回目でも 同じ ならび）', () => {
    const a = swing('kesa').rec.map((r) => r.alpha);
    expect(swing('kesa', 9).rec.map((r) => r.alpha)).toEqual(a);
    const { fx, meshes } = make();
    const seqs: number[][] = [];
    for (let round = 0; round < 2; round++) {
      queue(fx, 'kesa');
      const s: number[] = [];
      for (let i = 0; i < 90; i++) {
        fx.step();
        s.push(Math.max(0, ...meshes().map((m) => maxAlpha(readVerts(m)))));
      }
      seqs.push(s);
    }
    expect(seqs[1], '2 回目（シードが ちがう）').toEqual(seqs[0]);
  });
});
