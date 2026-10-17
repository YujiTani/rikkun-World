import { describe, expect, it } from 'vitest';
import { sectionSortKey, stableOpaqueSort, type SortItem } from './drawOrder';

const item = (o: Partial<SortItem> & { id: number }): SortItem => ({
  groupOrder: 0,
  renderOrder: 0,
  material: { id: 0 },
  materialVariant: 0,
  z: 0,
  object: { userData: {} },
  ...o,
});

describe('描く順番（機械の速さで 変わらない）', () => {
  it('材料の番号・作った順（id）が ちがっても、同じ鍵の組みなら 同じ並び', () => {
    const keyed = (key: number, mat: number, id: number) => item({ id, material: { id: mat }, object: { userData: { sortKey: key } } });
    const a = [keyed(5, 10, 1), keyed(2, 11, 2), keyed(9, 12, 3)];
    const b = [keyed(9, 3, 7), keyed(5, 2, 9), keyed(2, 1, 8)]; // 作った順がちがう
    const keys = (xs: SortItem[]) => [...xs].sort(stableOpaqueSort).map((x) => x.object.userData.sortKey);
    expect(keys(a)).toEqual([2, 5, 9]);
    expect(keys(b)).toEqual([2, 5, 9]);
  });

  it('グループ・renderOrder が 先。鍵のない物は 鍵のある物のあと（これまでの順）', () => {
    const k = item({ id: 3, object: { userData: { sortKey: 1 } } });
    const plain = item({ id: 1 });
    const later = item({ id: 2, renderOrder: 1, object: { userData: { sortKey: 0 } } });
    const grouped = item({ id: 4, groupOrder: -1 });
    expect([k, plain, later, grouped].sort(stableOpaqueSort).map((x) => x.id)).toEqual([4, 3, 1, 2]);
  });

  it('鍵のない物どうしは 材料→近さ→id（three の ふつうの順と同じ）', () => {
    const a = item({ id: 1, material: { id: 2 }, z: 1 });
    const b = item({ id: 2, material: { id: 1 }, z: 5 });
    const c = item({ id: 3, material: { id: 1 }, z: 2 });
    expect([a, b, c].sort(stableOpaqueSort).map((x) => x.id)).toEqual([3, 2, 1]);
  });

  it('セクションの鍵は 場所ごとに ちがい、種類（小ブロック・絵・水）でも ちがう', () => {
    const keys = new Set<number>();
    for (let cx = 0; cx < 8; cx++) for (let cz = 0; cz < 8; cz++) for (let sy = 0; sy < 12; sy++) for (const kind of [0, 1, 2] as const) keys.add(sectionSortKey(cx, sy, cz, kind));
    expect(keys.size).toBe(8 * 8 * 12 * 3);
  });
});
