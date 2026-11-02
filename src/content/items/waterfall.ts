import { DIG_DEFAULTS } from '../../dig/config';
import { PLACE_HOW } from './howText';
import type { BlockId } from '../../contracts';
import type { ItemDef } from './types';

/**
 * WATERFALL-1: わきどころ（中の id は wakimizu のまま。WAKIDOKORO §2）・マグマの わきどころ・こくようせき・たきつぼ 2 つ（置ける ブロック）。値は ここ 1 か所（ルール #304）。
 * わきどころの 出す 間かく・たきつぼの 確率は world/blocks/liquids.ts の SPRING_TUNING。わきどころは こわしても 落とさない（バケツ だけで 回収）
 */
export const WATERFALL_BLOCKS = {
  wakimizu: {
    name: 'わきどころ',
    zukan: 'あわの うずが まわる、［水｜みず］が わきでる ところ。まえ・うしろ・みぎ・ひだり・したの 5 つの ほうこうに ［水｜みず］が ながれでる。［水｜みず］が おちた ゆかに たきつぼが できると、［水｜みず］は ぐるぐる まわって ずっと ながれつづける。こわしても もどらない（バケツで くむ）。',
    maxStack: 64,
    placeBlock: 'wakimizu',
    rarity: DIG_DEFAULTS.rarity.wakimizu,
    category: 'build',
    info: { use: 'みずが ずっと わきでる', how: `${PLACE_HOW}。した と よこ 4 ほうに みずが でる`, buttons: ['1-9', 'right'] },
    recipe: { count: 1, inputs: [['stone', 4], ['crystal', 1]] }, // 作業台。いし 4 ＋ すいしょう 1
  },
  magma_wakimizu: {
    name: 'マグマの わきどころ',
    zukan: 'マグマの うずが まわる、あつい マグマが わきでる ところ。5 つの ほうこうに マグマが ゆっくり ながれて、［水｜みず］に ふれると こくようせきに かたまる。さわると あついので ちゅうい。こわしても もどらない（バケツで くむ）。',
    maxStack: 64,
    placeBlock: 'magma_wakimizu',
    rarity: DIG_DEFAULTS.rarity.magma_wakimizu,
    category: 'build',
    info: { use: 'マグマが わきでる（さわると いたい）', how: `${PLACE_HOW}。した と よこ 4 ほうに マグマが でる`, buttons: ['1-9', 'right'] },
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
  // WAKIDOKORO: たきつぼ 2 つ（こわすと その たきつぼ 1 こ。置き直せる）
  takitsubo: {
    name: 'たきつぼ',
    zukan: '［石｜いし］の まんなかが くぼんで、［水｜みず］が たまって いる。わきどころの したに おくと、おちた ［水｜みず］を すって また わきどころから だす。［水｜みず］が あふれない たきに なる。',
    maxStack: 64,
    placeBlock: 'takitsubo',
    rarity: DIG_DEFAULTS.rarity.takitsubo,
    category: 'build',
    info: { use: 'わきどころの みずを ぐるぐる まわす', how: `${PLACE_HOW}。わきどころの まっすぐ したに`, buttons: ['1-9', 'right'] },
  },
  magma_takitsubo: {
    name: 'マグマの たきつぼ',
    zukan: '［石｜いし］の まんなかが くぼんで、マグマが たまって いる。マグマの わきどころの したに おくと、おちた マグマを すって また わきどころから だす。',
    maxStack: 64,
    placeBlock: 'magma_takitsubo',
    rarity: DIG_DEFAULTS.rarity.magma_takitsubo,
    category: 'build',
    info: { use: 'マグマの わきどころの マグマを ぐるぐる まわす', how: `${PLACE_HOW}。マグマの わきどころの まっすぐ したに`, buttons: ['1-9', 'right'] },
  },
} satisfies Partial<Record<BlockId, ItemDef>>;
