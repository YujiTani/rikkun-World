import { describe, expect, it } from 'vitest';
import {
  CLOSED_GRAPH, CaveSearch, OPEN_GRAPH, buildFaceGraph, type CaveNode, type FaceGraph, type ProjectFn,
} from './caveCull';

/** 16³ を 石で うめて、指定した マスだけ 空気にする */
function carve(air: Array<[number, number, number]>): (lx: number, ly: number, lz: number) => boolean {
  const on = new Set(air.map(([x, y, z]) => (y << 8) | (z << 4) | x));
  return (lx, ly, lz) => !on.has((ly << 8) | (lz << 4) | lx);
}

/** 真下を 見る。画面の まん中が (eyeX, eyeZ)。span マスで 端から 端 */
function lookDown(eyeX: number, eyeY: number, eyeZ: number, span: number): ProjectFn {
  return (x, y, _z, out) => {
    out.behind = y > eyeY;
    out.x = (x - eyeX) / span;
    out.y = (_z - eyeZ) / span;
  };
}

function run(
  nodes: Map<string, FaceGraph | null>,
  eye: { x: number; y: number; z: number },
  project: ProjectFn,
  budget?: number,
): CaveSearch {
  const s = new CaveSearch();
  const at = (cx: number, sy: number, cz: number): CaveNode | null => {
    const k = `${cx},${sy},${cz}`;
    if (!nodes.has(k)) return null;
    return { graph: nodes.get(k) ?? null };
  };
  s.run({
    eye,
    project,
    at,
    blocked: () => false,
    budget,
  });
  return s;
}

describe('面の つながり', () => {
  it('全部 石なら どの 面も あいていない', () => {
    const g = buildFaceGraph(() => true);
    expect(g.open).toBe(0);
    expect(g.reach[0]).toBe(0);
  });

  it('全部 空気なら 6 面が つながる', () => {
    const g = buildFaceGraph(() => false);
    expect(g.open).toBe(63);
    for (let f = 0; f < 6; f++) expect(g.reach[f]).toBe(63);
    expect(g.portal[0]).toBe(0);
    expect(g.portal[1]).toBe(15);
  });

  it('いちばん上の 段だけ 空気なら 下の 面へは 抜けない', () => {
    const air: Array<[number, number, number]> = [];
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) air.push([x, 15, z]);
    const g = buildFaceGraph(carve(air));
    expect(g.open & 1, '上の 面').toBe(1);
    expect(g.open & 2, '下の 面').toBe(0);
    expect(g.reach[0]! & 2).toBe(0);
  });

  it('1 マスの たて穴は 上下が つながり、穴の 幅は 1', () => {
    const air: Array<[number, number, number]> = [];
    for (let y = 0; y < 16; y++) air.push([8, y, 8]);
    const g = buildFaceGraph(carve(air));
    expect(g.reach[0]! & 2, '上から 下へ').toBe(2);
    expect(g.portal[0]).toBe(8);
    expect(g.portal[1]).toBe(8);
    expect(g.portal[2]).toBe(8);
    expect(g.portal[3]).toBe(8);
  });
});

describe('見える セクション', () => {
  const eye = { x: 8.5, y: 40, z: 8.5 };
  const project = lookDown(8.5, 40, 8.5, 24);

  it('ふさがった 地面の 下の ほらあなは 描かない。地面の セクションは 描く', () => {
    const nodes = new Map<string, FaceGraph | null>([
      ['0,2,0', OPEN_GRAPH],
      ['0,1,0', CLOSED_GRAPH],
      ['0,0,0', OPEN_GRAPH],
    ]);
    const s = run(nodes, eye, project);
    expect(s.stats().complete).toBe(true);
    expect(s.isDrawn(0, 2, 0)).toBe(true);
    expect(s.isDrawn(0, 1, 0), '地面').toBe(true);
    expect(s.isDrawn(0, 0, 0), 'ふさがった 下').toBe(false);
  });

  it('画面の 中の たて穴の 先は 描く', () => {
    const air: Array<[number, number, number]> = [];
    for (let y = 0; y < 16; y++) air.push([8, y, 8]);
    const hole = buildFaceGraph(carve(air));
    const nodes = new Map<string, FaceGraph | null>([
      ['0,2,0', OPEN_GRAPH],
      ['0,1,0', hole],
      ['0,0,0', OPEN_GRAPH],
    ]);
    const s = run(nodes, eye, project);
    expect(s.isDrawn(0, 0, 0), '穴の 先').toBe(true);
  });

  it('画面の 外の 穴の 先は たどらない', () => {
    const air: Array<[number, number, number]> = [];
    for (let y = 0; y < 16; y++) air.push([0, y, 0]);
    const hole = buildFaceGraph(carve(air));
    const nodes = new Map<string, FaceGraph | null>([
      ['0,2,0', OPEN_GRAPH],
      ['0,1,0', hole],
      ['0,0,0', OPEN_GRAPH],
      ['1,0,0', OPEN_GRAPH],
    ]);
    // 穴は x=0。視線は x=40 で、穴は 画面の 外
    const s = run(nodes, { x: 40.5, y: 40, z: 0.5 }, lookDown(40.5, 40, 0.5, 8));
    expect(s.isDrawn(0, 0, 0), '画面の 外の 穴の 下').toBe(false);
  });

  it('穴の 位置が ずれていたら その 先の となりまでは 行かない', () => {
    const a: Array<[number, number, number]> = [];
    const b: Array<[number, number, number]> = [];
    for (let y = 0; y < 16; y++) {
      a.push([0, y, 0]);
      b.push([15, y, 0]);
    }
    const nodes = new Map<string, FaceGraph | null>([
      ['0,2,0', OPEN_GRAPH],
      ['0,1,0', buildFaceGraph(carve(a))],
      ['0,0,0', buildFaceGraph(carve(b))],
      ['1,0,0', OPEN_GRAPH],
    ]);
    const s = run(nodes, { x: 0.5, y: 40, z: 0.5 }, lookDown(0.5, 40, 0.5, 24));
    expect(s.isDrawn(0, 0, 0), '真下の 天井は 見える').toBe(true);
    expect(s.isDrawn(1, 0, 0), 'ずれて つながらない 先').toBe(false);
  });

  it('まだ 調べていない セクションは あいていると みなして その 先を かくさない', () => {
    const nodes = new Map<string, FaceGraph | null>([
      ['0,2,0', OPEN_GRAPH],
      ['0,1,0', null],
      ['0,0,0', OPEN_GRAPH],
    ]);
    const s = run(nodes, eye, project);
    expect(s.isDrawn(0, 0, 0)).toBe(true);
  });

  it('回数の 上限に とどいたら たどりきれていない', () => {
    const nodes = new Map<string, FaceGraph | null>([
      ['0,2,0', OPEN_GRAPH],
      ['1,2,0', OPEN_GRAPH],
      ['0,1,0', OPEN_GRAPH],
    ]);
    const s = run(nodes, eye, project, 1);
    expect(s.stats().complete).toBe(false);
    expect(s.stats().steps).toBe(1);
  });

  it('読みこんでいない 場所から 見ると たどりきれていない', () => {
    const s = run(new Map(), eye, project);
    expect(s.stats().complete).toBe(false);
  });
});
