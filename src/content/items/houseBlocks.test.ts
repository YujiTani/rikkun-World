import { describe, expect, it } from 'vitest';
import { BLOCK_TYPES, blockIndexOf } from '../../world/blocks/blockTypes';
import { CHALK_MARK_IDS } from '../../world/blocks/chalkMark';
import { HOUSE_FURNITURE_IDS } from './ids';
import { ITEM_DEFS } from './registry';

/**
 * HOUSE-1C PR-1（#340。docs/design/HOUSE-1.md §2.13・§4.8、docs/tickets/HOUSE-1C.md の PO 決め 7）: 家の ブロック 5 つと
 * 家具の 置ける ブロック 8 つが、登録表と ブロックの 表に 入って いる こと。実装の 前は 赤（ブロックの 表に まだ 無い）。
 * 数（全部で 何こ）は 決め打ちしない: 名前で 選んだ 物だけ 見る（#311）。
 */

/** 家の ブロック 5 つ（id は 仕様 §4.8 の 案どおり。developer が 変えるなら ここと e2e/helpers/houseBuilt.ts の HB を そろえて 直す） */
const HOUSE_BLOCKS = {
  house_floor: 'いえの ゆか',
  house_wall: 'いえの かべ',
  house_roof: 'いえの やね',
  shoji: 'しょうじ',
  house_door: 'いえの と',
} as const;
type HouseBlockId = keyof typeof HOUSE_BLOCKS;
const HOUSE_BLOCK_IDS = Object.keys(HOUSE_BLOCKS) as HouseBlockId[];

/** 図鑑の「てにいれかた」（§4.8。家の ブロック・新しい 家具 とも 同じ 文。今の 家具 8 つの 文と 同じ） */
const SOURCE = 'けんちくし が たてた いえ を ほる';

const defs = ITEM_DEFS as unknown as Record<string, { name: string; source?: string } | undefined>;

describe('家の ブロック（HOUSE-1C PR-1）', () => {
  it('家の ブロック 5 つは 置ける ブロックで、登録表に 名前が ある', () => {
    for (const id of HOUSE_BLOCK_IDS) {
      expect(blockIndexOf(id), `${id} が ブロックの 表に ある`).toBeGreaterThanOrEqual(0);
      expect(defs[id]?.name, `${id} の 名前（ひらがな。漢字なし）`).toBe(HOUSE_BLOCKS[id]);
    }
  });

  it('ゆか・かべ・やね・しょうじ（まど）は 固い（通れない。窓も 通れない）', () => {
    for (const id of ['house_floor', 'house_wall', 'house_roof', 'shoji'] as const) {
      expect(BLOCK_TYPES.find((t) => (t.id as string) === id)?.solid, `${id} は 固い`).toBe(true);
    }
  });

  it('図鑑の「てにいれかた」は「けんちくし が たてた いえ を ほる」', () => {
    for (const id of HOUSE_BLOCK_IDS) expect(defs[id]?.source, id).toBe(SOURCE);
  });

  it('新しい 家具 8 つ（HOUSE_FURNITURE_IDS）は 置ける ブロック（アイテムの id と 同じ id の ブロックが ある）', () => {
    for (const id of HOUSE_FURNITURE_IDS) {
      expect(blockIndexOf(id), `${id} が ブロックの 表に ある`).toBeGreaterThanOrEqual(0);
      expect(defs[id]?.source, `${id} の てにいれかた`).toBe(SOURCE);
    }
  });

  it('ブロックの 番号は 今の いちばん 後ろ（MINE-1B の チョークの しるしの 後ろ）に 足す。古い セーブの 番号は かわらない', () => {
    const lastOld = Math.max(...CHALK_MARK_IDS.map((id) => blockIndexOf(id)));
    expect(lastOld, 'チョークの しるしは 表に ある').toBeGreaterThan(0);
    for (const id of [...HOUSE_BLOCK_IDS, ...HOUSE_FURNITURE_IDS]) {
      expect(blockIndexOf(id), `${id} は チョークの しるしより 後ろ`).toBeGreaterThan(lastOld);
    }
  });
});
