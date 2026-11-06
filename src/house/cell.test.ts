import { describe, expect, it } from 'vitest';
import { FUTON_FOOT, FUTON_HEAD } from '../world/blocks/futon';
import { FURN_BLOCK_IDS, HOUSE_BLOCK_IDS, HOUSE_DOOR_PART_IDS, furnInfo } from '../world/blocks/houseBlocks';
import { cellInfo } from './cell';

/** HOUSE-1C PR-1: 窓口 house.blockAt の 答え（ほると 手に 入る アイテム・向き） */

describe('cellInfo', () => {
  it('空気・世界の 外は アイテム なし', () => {
    expect(cellInfo('air')).toEqual({ id: 'air', item: null, dir: null });
    expect(cellInfo('outside')).toEqual({ id: 'outside', item: null, dir: null });
  });

  it('家の ブロック: 同じ id。戸は 上下・あけしめ どれでも house_door', () => {
    for (const id of HOUSE_BLOCK_IDS) expect(cellInfo(id)).toEqual({ id, item: id, dir: null });
    for (const id of HOUSE_DOOR_PART_IDS) expect(cellInfo(id)).toEqual({ id, item: 'house_door', dir: null });
  });

  it('向きの ある 家具: item は しゅるい、dir は rot（0〜3）', () => {
    for (const id of FURN_BLOCK_IDS) {
      const f = furnInfo(id)!;
      expect(cellInfo(id), id).toEqual({ id, item: f.kind, dir: f.rot });
    }
    expect(cellInfo('tansu')).toEqual({ id: 'tansu', item: 'tansu', dir: 0 });
    expect(cellInfo('long_table_2_e')).toEqual({ id: 'long_table_2_e', item: 'long_table', dir: 3 });
  });

  it('ふとん: 頭も 足も futon。dir は 家具の rot（まくらが うしろ ＝ 0）', () => {
    // FutonDir 1（頭から 足が 南）→ rot 0、2（西）→ 1、3（北）→ 2、0（東）→ 3
    for (const [dir, rot] of [[1, 0], [2, 1], [3, 2], [0, 3]] as const) {
      expect(cellInfo(FUTON_HEAD[dir]!)).toMatchObject({ item: 'futon', dir: rot });
      expect(cellInfo(FUTON_FOOT[dir]!)).toMatchObject({ item: 'futon', dir: rot });
    }
  });

  it('こたつ・はにわ・ふつうの ブロックは dir なし', () => {
    expect(cellInfo('nukunuku_se')).toMatchObject({ item: 'nukunuku', dir: null });
    expect(cellInfo('haniwa')).toMatchObject({ item: 'haniwa', dir: null });
    expect(cellInfo('stone')).toMatchObject({ item: 'stone', dir: null });
  });
});
