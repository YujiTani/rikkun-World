import { describe, expect, it } from 'vitest';
import type { YokaiKind } from '../contracts';
import { ITEM_INFO } from '../craft/info/table';
import { ITEM_TYPES } from '../inventory/items';
import { NO_INFO_OK } from './items/noInfoOk';
import { BLADE_ITEMS, BLADE_LIKE_ITEMS } from '../tools/bladeSets';
import { YOKAI_NAME, YOKAI_STATS } from '../yokai/stats';
import { YOKAI_VARIANT_COLORS, type YokaiKindId } from '../yokai/variants';

// #305: 足し忘れが無言でバグになる所をふさぐ

describe('足し忘れ防止', () => {
  it('ITEM_TYPES の全 id が ITEM_INFO に行を持つ（許可リスト以外）', () => {
    const missing = ITEM_TYPES.map((t) => t.id).filter((id) => !(id in ITEM_INFO) && !(id in NO_INFO_OK));
    expect(missing).toEqual([]);
  });

  it('許可リストの id は ほんとうに ITEM_TYPES にあって ITEM_INFO に無い（古い許可を残さない）', () => {
    for (const id of Object.keys(NO_INFO_OK)) {
      expect(ITEM_TYPES.some((t) => t.id === id), `${id} が ITEM_TYPES に無い`).toBe(true);
      expect(id in ITEM_INFO, `${id} は ITEM_INFO にある。許可リストから外す`).toBe(false);
    }
  });

  it('ITEM_INFO に ITEM_TYPES に無い id が混ざっていない', () => {
    const ids = new Set(ITEM_TYPES.map((t) => t.id as string));
    expect(Object.keys(ITEM_INFO).filter((k) => !ids.has(k))).toEqual([]);
  });

  it('YokaiKindId（variants.ts）と YokaiKind（contracts.ts）は同じ集まり', () => {
    // 型の上で互いに代入できなければ、ここで型エラーになる
    const toKind = (k: YokaiKindId): YokaiKind => k;
    const toId = (k: YokaiKind): YokaiKindId => k;
    expect(toKind('karakasa')).toBe('karakasa');
    expect(toId('rokurokubi')).toBe('rokurokubi');
    // 実行時: 妖怪の表のキーと色ちがいの表のキー・名前の表のキーが同じ
    const kinds = Object.keys(YOKAI_STATS).sort();
    expect(Object.keys(YOKAI_VARIANT_COLORS).sort()).toEqual(kinds);
    expect(Object.keys(YOKAI_NAME).sort()).toEqual(kinds);
  });

  it('刀の集まり: BLADE_LIKE_ITEMS = BLADE_ITEMS + なぎなた', () => {
    expect(BLADE_ITEMS.size).toBe(8);
    expect(BLADE_ITEMS.has('naginata')).toBe(false);
    expect([...BLADE_LIKE_ITEMS].sort()).toEqual([...BLADE_ITEMS, 'naginata'].sort());
  });
});
