import type { BlockId, Rarity } from '../../contracts';
import { DIG_DEFAULTS } from '../../dig/config';
import { BLOCK_TYPES } from '../../world/blocks/blockTypes';
import type { HouseBlockId } from '../../world/blocks/houseBlocks';
import { BLOCK_STACK } from './blocks';
import { PLACE_HOW } from './howText';
import { FURN_SOURCE } from './houseEditor';
import type { ItemDef } from './types';

/**
 * 家の ブロック 5 つ（HOUSE-1C PR-1 #340。docs/design/HOUSE-1.md §4.8）。けんちくし さんが たてた 家を ほると 手に 入る（作れない ので レシピは なし）。
 * 名前は BLOCK_TYPES から・レア度は DIG_DEFAULTS から（blocks.ts と 同じ 考え。2 か所に 書かない）。ブロックの 番号・性質は world/blocks/houseBlocks.ts。
 * 戸は 2 マス（上下）で 1 こ。持ち物に 入るのは 戸 1 こ（`house_door`）。置くと 上下の 2 マスが 立つ。
 */
const blockName = (id: BlockId): string => BLOCK_TYPES.find((b) => b.id === id)!.name;
const blockRarity = (id: BlockId): Rarity => DIG_DEFAULTS.rarity[id];
const info = (use: string, how = PLACE_HOW) => ({ use, how, buttons: ['1-9', 'right'] as Array<'1-9' | 'right'> });

export const HOUSE_BLOCKS = {
  house_floor: {
    name: blockName('house_floor'),
    zukan: 'けんちくしさんが しきつめた ［石｜いし］だたみの ゆか。ひんやり して いて、はだしで ［歩｜ある］くと きもちいい。',
    maxStack: BLOCK_STACK,
    placeBlock: 'house_floor',
    rarity: blockRarity('house_floor'),
    category: 'build',
    info: info('いえの ゆか。いしだたみ'),
    source: FURN_SOURCE,
  },
  house_wall: {
    name: blockName('house_wall'),
    zukan: 'けんちくしさんが ていねいに くみあげた、［太｜ふと］い いたの かべ。ようかいの あらしにも まけない、たのもしい かべ。',
    maxStack: BLOCK_STACK,
    placeBlock: 'house_wall',
    rarity: blockRarity('house_wall'),
    category: 'build',
    info: info('いえの かべ。ふとい いたの かべ'),
    source: FURN_SOURCE,
  },
  house_roof: {
    name: blockName('house_roof'),
    zukan: '［石｜いし］を のせて ［風｜かぜ］に とばされない ように した いたの やね。［雨｜あめ］の ［夜｜よる］も、この やねの ［下｜した］なら あんしん。',
    maxStack: BLOCK_STACK,
    placeBlock: 'house_roof',
    rarity: blockRarity('house_roof'),
    category: 'build',
    info: info('いえの やね。いしの おもしが のって いる'),
    source: FURN_SOURCE,
  },
  shoji: {
    name: blockName('shoji'),
    zukan: '［紙｜かみ］を はった ［明｜あか］るい まど。［光｜ひかり］は ［通｜とお］すけれど、ようかいは ［通｜とお］れない。［夜｜よる］に なると ［家｜いえ］の あかりが ほんのり もれて、［遠｜とお］くからでも おうちが みつかる。',
    maxStack: BLOCK_STACK,
    placeBlock: 'shoji',
    rarity: blockRarity('shoji'),
    category: 'build',
    info: info('あかるい かみの まど。ひかりは とおすが、とおれない'),
    source: FURN_SOURCE,
  },
  house_door: {
    name: blockName('house_door'),
    zukan: 'おうちの ［入｜い］り［口｜ぐち］。みぎクリックで あけたり しめたり できる。しめて おけば ようかいは ［入｜はい］れない。「ただいま」と ［言｜い］って あけよう。',
    maxStack: BLOCK_STACK,
    placeBlock: 'house_door',
    rarity: blockRarity('house_door'),
    category: 'build',
    info: info('いえの と。2 マス。みぎクリックで あけたり しめたり できる', 'てに もって ゆかに みぎクリック（うえ・した 2 マス）'),
    source: FURN_SOURCE,
  },
} satisfies Record<HouseBlockId, ItemDef>;
