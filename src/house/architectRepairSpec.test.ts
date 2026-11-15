import { describe, expect, it } from 'vitest';
import { buildModel } from '../animals/models/voxelMesh';
import data from '../town/repairFinal.json';
import { architectSpec } from './architectSpec';
import { architectRepairSpec } from './architectRepairSpec';

describe('なおし用の 建築士さん（設計 JSON の architect）', () => {
  it('足す 部品は 32 こ・はずす のは はちまきの わと うしろの 結び目 3 こ', () => {
    expect(data.architect.add.length).toBe(32);
    const norm = architectSpec().find((p) => p.name === 'head')!;
    const rep = architectRepairSpec().find((p) => p.name === 'head')!;
    const removed = norm.prims.length - (rep.prims.length - data.architect.add.filter((a) => a.bone === 'head').length);
    expect(removed).toBe(4); // わ 1 ＋ うしろの 結び目 3
    expect(rep.prims.filter((p) => p.k === 'ring')).toHaveLength(1);
    const ring = rep.prims.find((p) => p.k === 'ring')!;
    expect(ring.k === 'ring' && ring.ro).toEqual([5, 1, 4.8]);
  });

  it('骨の 名前と 順は 休みの 形と 同じ（同じ 骨に 2 つの メッシュを かぶせる）', () => {
    expect(architectRepairSpec().map((p) => [p.name, p.parent, p.pivot])).toEqual(architectSpec().map((p) => [p.name, p.parent, p.pivot]));
    const a = buildModel(architectSpec());
    const b = buildModel(architectRepairSpec());
    expect(b.names).toEqual(a.names);
    expect(b.parents).toEqual(a.parents);
  });

  it('たすきは 胴の 面に ぬる（体から はみ出さない）・三角形は 休みの 形の 2 倍 以内', () => {
    const body = architectRepairSpec().find((p) => p.name === 'body')!;
    const painted = body.prims.filter((p) => p.k === 'box' && p.paint === true);
    expect(painted).toHaveLength(20);
    expect(buildModel(architectRepairSpec()).tris).toBeLessThan(buildModel(architectSpec()).tris * 2);
  });
});
