// マス 1 つの ようす（足場は item が null = アイテムに ならない）（HOUSE-1C PR-1 #340。窓口 `house.blockAt` の 答え）。item ＝ そこを ほると 手に 入る アイテム、dir ＝ 向きを 持つ 家具の rot。DOM・three なし。
import type { BlockId, ItemId } from '../contracts';
import { dugItemAt, type LookAt } from '../dig/dugItems';
import { isScaffoldId } from '../world/blocks/buildBlocks';
import { futonInfo } from '../world/blocks/futon';
import { furnInfo } from '../world/blocks/houseBlocks';
import type { Rot } from './editor/tuning';

export interface CellInfo {
  id: BlockId | 'outside';
  item: ItemId | null;
  dir: Rot | null;
}

/** 場所 (x, y, z) の 家の 記録〔book〕が あれば 案に 合う アイテム（ほる のと 同じ 答え。dugItemAt） */
export function cellInfo(id: BlockId | 'outside', book: LookAt | null = null, x = 0, y = 0, z = 0): CellInfo {
  if (id === 'outside') return { id, item: null, dir: null };
  const f = furnInfo(id);
  const fu = futonInfo(id);
  // ふとんの 向きは 頭から 足への FutonDir〔0 e・1 s・2 w・3 n〕。家具の rot〔0 ＝ まくらが うしろ〕は FutonDir ＋ 3
  const dir = (f ? f.rot : fu ? (fu.dir + 3) % 4 : null) as Rot | null;
  return { id, item: id === 'air' || isScaffoldId(id) ? null : dugItemAt(book, id, x, y, z), dir };
}
