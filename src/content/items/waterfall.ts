import { DIG_DEFAULTS } from '../../dig/config';
import { PLACE_HOW } from './howText';
import type { BlockId } from '../../contracts';
import type { ItemDef } from './types';

/**
 * WATERFALL-1: わきみず・マグマの わきみず・こくようせき（置ける ブロック）。値は ここ 1 か所（ルール #304）。
 * わきみずの 出す 間かく・たきつぼの 確率は world/blocks/liquids.ts の SPRING_TUNING。
 */
export const WATERFALL_BLOCKS = {
  wakimizu: {
    name: 'わきみず',
    zukan: 'こんこんと ［水｜みず］が わきでる ふしぎな ［石｜いし］。たかい ところに おくと たきに なる。［水｜みず］が おちた ゆかに たきつぼが できると、［水｜みず］は ぐるぐる まわって ずっと ながれつづける。',
    maxStack: 64,
    placeBlock: 'wakimizu',
    rarity: DIG_DEFAULTS.rarity.wakimizu,
    category: 'build',
    info: { use: 'みずが ずっと わきでる', how: `${PLACE_HOW}。したか よこに みずが でる`, buttons: ['1-9', 'right'] },
    recipe: { count: 1, inputs: [['stone', 4], ['crystal', 1]] }, // 作業台。いし 4 ＋ すいしょう 1
  },
  magma_wakimizu: {
    name: 'マグマの わきみず',
    zukan: 'ぐつぐつ あつい マグマが わきでる ［石｜いし］。マグマは ゆっくり ながれて、［水｜みず］に ふれると こくようせきに かたまる。さわると あついので ちゅうい。',
    maxStack: 64,
    placeBlock: 'magma_wakimizu',
    rarity: DIG_DEFAULTS.rarity.magma_wakimizu,
    category: 'build',
    info: { use: 'マグマが わきでる（さわると いたい）', how: `${PLACE_HOW}。したか よこに マグマが でる`, buttons: ['1-9', 'right'] },
    recipe: { count: 1, inputs: [['stone', 4], ['coal_ore', 4], ['crystal', 1]] }, // 作業台
  },
  kokuyouseki: {
    name: 'こくようせき',
    zukan: 'マグマが ［水｜みず］で ひえて かたまった、くろく ひかる ［石｜いし］。とても かたくて、てつの つるはしが ないと ほれない。',
    maxStack: 64,
    placeBlock: 'kokuyouseki',
    rarity: DIG_DEFAULTS.rarity.kokuyouseki,
    category: 'build',
    info: { use: 'とても かたい ブロック', how: PLACE_HOW, buttons: ['1-9', 'right'] },
  },
} satisfies Partial<Record<BlockId, ItemDef>>;
