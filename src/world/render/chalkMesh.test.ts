import { describe, expect, it } from 'vitest';
import { CHALK_MARK_IDS, CHALK_NORMAL, COMPASS_STEP, chalkInfo } from '../blocks/chalkMark';
import { CHALK_SHEETS, chalkTileName } from '../blocks/mineTextures';
import { tileUv } from '../blocks/textures';
import { CHALK_FLAG, CHALK_LIFT, chalkImageDir, chalkSheetAt, pushChalk } from './chalkMesh';
import { emptyMesh } from './meshChunk';
import { ArrayVoxelWorld } from '../VoxelWorld';
import { SectionMesher } from './voxel/sectionMesher';

/** MINE-1B: チョークの しるしの 板（仕様 §4.4・アート 20.10）。板 1 まい・かべ側から 0.02 うかす・絵の やじるしが 記録どおりの 向きを さす */

type V3 = [number, number, number];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const near = (a: readonly number[], b: readonly number[]): boolean => a.every((v, i) => Math.abs(v - b[i]!) < 1e-9);

function plate(id: string, x = 3, y = 5, z = 7) {
  const m = emptyMesh();
  pushChalk(m, id, x, y, z, 0.4, 0.2);
  const p = (i: number): V3 => [m.positions[i * 3]!, m.positions[i * 3 + 1]!, m.positions[i * 3 + 2]!];
  return { m, lb: p(0), rb: p(1), rt: p(2), lt: p(3) };
}

describe('チョークの しるしの 板', () => {
  it('しるし 12 こ ぜんぶ 板 1 まい（三角形 2・頂点 4）。しるしで ない id は 何も 足さない', () => {
    for (const id of CHALK_MARK_IDS) {
      const { m } = plate(id);
      expect(m.faceCount, id).toBe(1);
      expect(m.positions.length / 3, id).toBe(4);
      expect(m.indices.length, id).toBe(6);
    }
    const m = emptyMesh();
    pushChalk(m, 'stone', 0, 0, 0, 1, 0);
    expect(m.faceCount).toBe(0);
  });

  it('板は 面の 外向きを 向き、マスの かべ側の さかいから 0.02 ブロック うく', () => {
    for (const id of CHALK_MARK_IDS) {
      const { lb, rb, lt } = plate(id, 3, 5, 7);
      const n = cross(sub(rb, lb), sub(lt, lb));
      const want = CHALK_NORMAL[chalkInfo(id)!.face];
      expect(near(n, want), `${id} 法線 ${n}`).toBe(true);
      // 外向きの 軸の 位置: 外向きが + ならマスの 手前〔0〕から 0.02、- なら 1 から 0.02 戻った 所
      const o: V3 = [3, 5, 7];
      const axis = want[0] !== 0 ? 0 : want[1] !== 0 ? 1 : 2;
      const lift = want[axis]! > 0 ? CHALK_LIFT : 1 - CHALK_LIFT;
      expect(lb[axis]! - o[axis]!, `${id} うかせ`).toBeCloseTo(lift, 9);
    }
  });

  it('絵の やじるしが 指す 向き = id に 記録した 向き（ゆかは 絵の 上が 北、かべは 絵の 上が 空）', () => {
    for (const id of CHALK_MARK_IDS) {
      const info = chalkInfo(id)!;
      const { lb, rb, lt } = plate(id);
      const right = sub(rb, lb);
      const up = sub(lt, lb);
      const img = chalkImageDir(info.face, info.dir);
      const pointed = img === 'e' ? right : img === 'w' ? right.map((v) => -v) : img === 'n' ? up : up.map((v) => -v);
      const step = COMPASS_STEP[info.dir];
      expect(near(pointed, [step[0], 0, step[1]]), `${id} ${img} → ${pointed}`).toBe(true);
    }
  });

  it('絵は 向きに あった 1 まい（3 まいの どれか）・絵の 4 すみ どおりに はる', () => {
    for (const id of CHALK_MARK_IDS) {
      const info = chalkInfo(id)!;
      const { m } = plate(id, 3, 5, 7);
      const uv = tileUv(chalkTileName(chalkSheetAt(3, 5, 7), chalkImageDir(info.face, info.dir)));
      expect(m.uvs.slice(0, 8), id).toEqual([uv[0], uv[1], uv[2], uv[1], uv[2], uv[3], uv[0], uv[3]]);
    }
  });

  it('光: 空の光・ブロックの光は そのまま、印 CHALK_FLAG が 足してある。AO なし・色は 白', () => {
    const { m } = plate('chalk_mark');
    for (let i = 0; i < 4; i++) {
      expect(m.lights[i * 2]).toBe(0.4);
      expect(m.lights[i * 2 + 1]).toBeCloseTo(0.2 + CHALK_FLAG, 9);
      expect(m.darks[i]).toBe(0);
    }
    expect(m.colors.every((c) => c === 1)).toBe(true);
    // 印は 作物の みのり印〔2〕と 見分けられる〔シェーダーは 3.5 で 分ける〕
    expect(CHALK_FLAG).toBeGreaterThan(3.5);
    expect(CHALK_FLAG + 1).toBeLessThan(6);
  });

  it('絵の えらび方: 同じ 場所なら いつも 同じ。場所が かわると 3 まい とも 出る', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 60; i++) {
      const s = chalkSheetAt(i * 3, 4, i * 7);
      expect(s).toBe(chalkSheetAt(i * 3, 4, i * 7));
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThan(CHALK_SHEETS);
      seen.add(s);
    }
    expect(seen.size).toBe(CHALK_SHEETS);
  });

  it('区画の メッシュに 入る: ゆか・かべの しるしが 板 1 まい ずつ。まわりの 面は 隠さない・箱でも 小ブロックでも 同じ', () => {
    const w = new ArrayVoxelWorld({ x: 48, y: 48, z: 48 });
    w.fill(0, 0, 0, 47, 0, 47, 'bedrock');
    w.fill(0, 1, 0, 47, 20, 47, 'stone');
    const base = new SectionMesher(w);
    const before = base.build(1, 1, 1, 'micro');
    w.setBlock(20, 21, 20, 'chalk_mark'); // ゆか
    w.setBlock(24, 21, 20, 'chalk_mark_up_e');
    w.fill(30, 21, 30, 30, 22, 30, 'stone'); // 柱
    w.setBlock(30, 21, 29, 'chalk_mark_n_e'); // 柱の 北の かべ
    for (const tier of ['box', 'micro'] as const) {
      const d = new SectionMesher(w).build(1, 1, 1, tier);
      expect(d.extras.faceCount, tier).toBe(3);
    }
    expect(new SectionMesher(w).build(1, 1, 1, 'micro').faces).toBeGreaterThan(before.faces); // 柱の ぶんは ふえる。しるしで 面は へらない
    w.setBlock(20, 21, 20, 'air');
    w.setBlock(24, 21, 20, 'air');
    w.setBlock(30, 21, 29, 'air');
    w.fill(30, 21, 30, 30, 22, 30, 'air');
    expect(new SectionMesher(w).build(1, 1, 1, 'micro').faces).toBe(before.faces);
  });

  it('しるしだけが ある 区画〔ゆかが 下の 区画の いちばん 上〕でも 板は 出る', () => {
    const w = new ArrayVoxelWorld({ x: 48, y: 48, z: 48 });
    w.fill(0, 0, 0, 47, 0, 47, 'bedrock');
    w.fill(0, 1, 0, 47, 15, 47, 'stone');
    w.setBlock(20, 16, 20, 'chalk_mark_up_s');
    for (const tier of ['box', 'micro'] as const) {
      const d = new SectionMesher(w).build(1, 1, 1, tier);
      expect(d.extras.faceCount, tier).toBe(1);
    }
  });
});
