import { describe, expect, it } from 'vitest';
import { ITEM_TYPES } from '../inventory/items';
import { YOKAI_STATS } from '../yokai/stats';
import { buildContentSnapshot } from './snapshot';

// #310: 全アイテム・全妖怪の値の写し。差分が出たら値が変わったということ（意図した変更だけ更新する）
describe('content snapshot', () => {
  const snap = buildContentSnapshot() as { items: Record<string, unknown>; yokai: Record<string, unknown> };

  it('全アイテム・全妖怪の値が写しと同じ', async () => {
    await expect(JSON.stringify(snap, null, 2) + '\n').toMatchFileSnapshot('./__snapshots__/content.json');
  });

  it('ITEM_TYPES の全 id と全妖怪をもれなく含む', () => {
    expect(Object.keys(snap.items).sort()).toEqual(ITEM_TYPES.map((t) => t.id).sort());
    expect(Object.keys(snap.yokai).sort()).toEqual(Object.keys(YOKAI_STATS).sort());
  });
});
