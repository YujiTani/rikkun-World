import { DIG_DEFAULTS } from '../../dig/config';
import { BLOCK_TYPES } from '../../world/blocks/blockTypes';
import { YAKATA_BLOCKS } from '../../world/blocks/mineYakata';
import type { BlockId } from '../../contracts';
import { PLACE_HOW } from './howText';
import type { ItemDef } from './types';

/**
 * MINE-1F（docs/design/MINE-1F.md §4.6）: ようかいの やかたの ブロック 8 こ〔2 組 × かべ・ゆか・だん・たいまつ〕。値は ここ 1 か所（ルール #304）。
 * ほる 固さ・道具・レア度は `dig/config.ts`、番号・固いかは `blockTypes.ts`、id は `world/blocks/mineYakata.ts`。
 * やかたを かちぬいた しるし。宝箱の くじの 箱から のぞく〔`world/gen/mineChest.ts` の EXCLUDED〕。ほると じぶん いつも 1 こ。
 */
const SOURCE = 'ようかいの やかた を かちぬいて ほる';
const blockName = (id: BlockId): string => BLOCK_TYPES.find((b) => b.id === id)!.name;
const wall = (id: BlockId, zukan: string, use: string) => ({
  name: blockName(id),
  zukan,
  maxStack: 64,
  placeBlock: id,
  rarity: DIG_DEFAULTS.rarity[id],
  category: 'build' as const,
  info: { use, how: PLACE_HOW, buttons: ['1-9', 'right'] as Array<'1-9' | 'right'> },
  source: SOURCE,
});
const torch = (id: BlockId, zukan: string, use: string) => ({ ...wall(id, zukan, use), category: 'light' as const });

const M = YAKATA_BLOCKS.maou;
const O = YAKATA_BLOCKS.otera;

export const YAKATA_ITEMS = {
  [M.kabe]: wall(M.kabe, 'まおうの しろ の かべに つかわれて いる、しかくい きりいし。おくと ふしぎな いろの しろが できる。', 'まおうの しろ の かべ。おける'),
  [M.yuka]: wall(M.yuka, 'まおうの しろ の ゆかに しかれて いる、いちまつもようの いし。まんなかに うすい むらさきの かざりが ある。', 'まおうの しろ の ゆか。おける'),
  [M.dan]: wall(M.dan, 'まおうの しろ の さいだんに つかわれて いる、ふちどりの ある いし。おくと だんに なる。', 'まおうの しろ の さいだん の いし。おける'),
  [M.taimatsu]: torch(M.taimatsu, 'むらさきの ひが ゆらゆら もえる ふしぎな たいまつ。ふつうの たいまつより すこし くらいけど、ふしぎな あかりが とどく。', 'むらさき に もえる ふしぎな たいまつ。おくと あかり に なる'),
  [O.kabe]: wall(O.kabe, 'よるの おてらの いしがきに つかわれて いる、でこぼこの いし。つみあげると ふるい おてらの かべに なる。', 'よるの おてら の いしがき。おける'),
  [O.yuka]: wall(O.yuka, 'よるの おてらの ゆかに しかれて いる、ずらして ならべた いしだたみ。あるくと ひんやり しそう。', 'よるの おてら の いしだたみ。おける'),
  [O.dan]: wall(O.dan, 'よるの おてらの さいだんに つかわれて いる、みがいた こい いし。しめなわと しろい かみが かざって ある。', 'よるの おてら の さいだん の いし。おける'),
  [O.taimatsu]: torch(O.taimatsu, 'あおじろい おにびが ふわっと うかぶ たいまつ。あつくない ふしぎな ひで、あたりを やさしく てらす。', 'あおじろい おにび の たいまつ。おくと あかり に なる'),
} satisfies Partial<Record<BlockId, ItemDef>>;
