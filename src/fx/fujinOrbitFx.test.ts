import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { FujinOrbitFx } from './fujinOrbitFx';
import { BODY, TECHS, STEP_OF, installFakeDocument, makeCamera, maxAlpha, newMeshes, readVerts } from './legendFxTestKit';

/** LEGEND-FX AC3（風の 帯の 本数）・AC8・AC9（描画 1・三角形 400 以下）。 */
beforeAll(() => {
  installFakeDocument();
});

const make = () => {
  const scene = new THREE.Scene();
  const before = new Set<THREE.Object3D>(scene.children);
  const fx = new FujinOrbitFx(scene, makeCamera());
  return { scene, fx, mesh: () => newMeshes(scene, before)[0]! };
};
const queue = (fx: FujinOrbitFx, tech: (typeof TECHS)[number]) => fx.queue({ tech, step: STEP_OF[tech], uDeg: 0, pos: BODY });
const bands = (fx: FujinOrbitFx) => (fx as unknown as { bandOn: boolean[] }).bandOn.filter(Boolean).length;

interface Rec {
  bands: number;
  draws: number;
  tris: number;
  alpha: number;
  pos: number[];
}
function swing(tech: (typeof TECHS)[number], idle = 0): Rec[] {
  const { fx, mesh } = make();
  for (let i = 0; i < idle; i++) fx.step();
  queue(fx, tech);
  const out: Rec[] = [];
  for (let i = 0; i < 70; i++) {
    fx.step();
    const v = readVerts(mesh());
    out.push({ bands: bands(fx), draws: fx.info().draws, tris: fx.info().tris, alpha: maxAlpha(v), pos: Array.from(v.pos) });
  }
  return out;
}

describe('AC3: 風の 帯の 本数は つき 1・きりあげ 2・けさ 3', () => {
  it.each([['thrust', 1], ['kiriage', 2], ['kesa', 3]] as const)('%s は 同時に 最大 %i 本', (tech, n) => {
    const rec = swing(tech);
    expect(Math.max(...rec.map((r) => r.bands))).toBe(n);
  });
  it('出ている 間は ずっと 同じ 本数（とちゅうで ふえたり へったり しない）', () => {
    for (const [tech, n] of [['thrust', 1], ['kiriage', 2], ['kesa', 3]] as const) {
      const on = swing(tech).filter((r) => r.draws > 0);
      expect(on.length).toBeGreaterThan(10);
      expect(new Set(on.map((r) => r.bands)), tech).toEqual(new Set([n]));
    }
  });
  it('技を 出す 注文から 少し あとに はじまり（白い 斬撃の 決めと 同じ ころ）、おわると 消える', () => {
    const rec = swing('kesa');
    const first = rec.findIndex((r) => r.draws > 0);
    const last = rec.length - 1 - [...rec].reverse().findIndex((r) => r.draws > 0);
    expect(first).toBeGreaterThan(0);
    expect(rec.at(-1)!.draws).toBe(0);
    expect(last).toBeGreaterThan(first + 10);
  });
});

describe('AC9: 描画 1・三角形 400 以下・何も していない 時は 0', () => {
  it('何も 振って いない: 描画 0・三角形 0', () => {
    const { fx } = make();
    for (let i = 0; i < 5; i++) {
      fx.step();
      expect(fx.info()).toMatchObject({ draws: 0, tris: 0, active: 0 });
    }
  });
  it.each(TECHS)('%s: 1 振りの 最大で 描画 1・三角形 400 以下', (tech) => {
    const rec = swing(tech);
    expect(Math.max(...rec.map((r) => r.draws))).toBe(1);
    expect(Math.max(...rec.map((r) => r.tris))).toBeLessThanOrEqual(400);
  });
  it('3 振りを 重ねても（最大 3 つ）描画は 1・三角形は 400 以下', () => {
    const { fx } = make();
    let maxTris = 0;
    let maxDraws = 0;
    for (let i = 0; i < 60; i++) {
      if (i % 4 === 0) queue(fx, 'kesa');
      fx.step();
      maxTris = Math.max(maxTris, fx.info().tris);
      maxDraws = Math.max(maxDraws, fx.info().draws);
    }
    expect(maxDraws).toBe(1);
    expect(maxTris).toBeLessThanOrEqual(400);
  });
  it('注文を とりけす（cancel）と まだ はじまっていない 帯は 出ない', () => {
    const { fx } = make();
    queue(fx, 'kesa');
    fx.step();
    fx.cancel();
    for (let i = 0; i < 70; i++) {
      fx.step();
      expect(fx.info().draws).toBe(0);
    }
  });
});

describe('AC8: シード付き・点滅しない', () => {
  it('同じ 入力の コマ送りで 同じ 形（頂点の 位置が ぜんぶ 同じ）', () => {
    expect(swing('kiriage')).toEqual(swing('kiriage'));
  });
  it('明るさは 年れいだけで きまる: 出る 前に 何ステップ 待っても、2 回目の 振りでも 同じ 明るさの ならび', () => {
    const a = swing('kesa').map((r) => r.alpha);
    expect(swing('kesa', 7).map((r) => r.alpha), '7 ステップ 待ってから 振っても').toEqual(a);
    const { fx, mesh } = make();
    const seq: number[][] = [];
    for (let round = 0; round < 2; round++) {
      queue(fx, 'kesa');
      const s: number[] = [];
      for (let i = 0; i < 70; i++) {
        fx.step();
        s.push(maxAlpha(readVerts(mesh())));
      }
      seq.push(s);
    }
    expect(seq[1]).toEqual(seq[0]);
  });
  it('出ている 間の 明るさは 一度 ピークに なって 下がるだけ（ふえる→へる→ふえる の 点滅を しない）', () => {
    const a = swing('kesa').map((r) => r.alpha).filter((x) => x > 0);
    const peak = a.indexOf(Math.max(...a));
    for (let i = 1; i <= peak; i++) expect(a[i]!).toBeGreaterThanOrEqual(a[i - 1]! - 1e-9);
    for (let i = peak + 1; i < a.length; i++) expect(a[i]!).toBeLessThanOrEqual(a[i - 1]! + 1e-9);
  });
});
