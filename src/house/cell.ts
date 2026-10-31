// マス 1 つの ようす（HOUSE-1C PR-1 #340。窓口 `house.blockAt` の 答え）。item ＝ そこを ほると 手に 入る アイテム、dir ＝ 向きを 持つ 家具の rot。DOM・three なし。
import type { BlockId, ItemId } from '../contracts';
import { dugItemOf } from '../dig/dugItems';
import { futonInfo } from '../world/blocks/futon';
import { furnInfo } from '../world/blocks/houseBlocks';
import type { Rot } from './editor/tuning';

export interface CellInfo {
  id: BlockId | 'outside';
  item: ItemId | null;
  dir: Rot | null;
}

export function cellInfo(id: BlockId | 'outside'): CellInfo {
  if (id === 'outside') return { id, item: null, dir: null };
  const f = furnInfo(id);
  const fu = futonInfo(id);
  // ふとんの 向きは 頭から 足への FutonDir〔0 e・1 s・2 w・3 n〕。家具の rot〔0 ＝ まくらが うしろ〕は FutonDir ＋ 3
  const dir = (f ? f.rot : fu ? (fu.dir + 3) % 4 : null) as Rot | null;
  return { id, item: id === 'air' ? null : dugItemOf(id), dir };
}
