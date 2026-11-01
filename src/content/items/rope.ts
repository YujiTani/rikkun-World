import { DIG_DEFAULTS } from '../../dig/config';
import { PLACE_HOW } from './howText';
import type { BlockId } from '../../contracts';
import type { ItemDef } from './types';

/**
 * ROPE-1: ロープ（置ける ブロック）。値は ここ 1 か所（ルール #304）。
 * いと 3 で 作業台で 4 本。たてに つないで たらし、つかまると のぼり おり できる（のぼる 速さは player/config.ts の CLIMB）。
 * ブロックの 性質は BLOCK_TYPES（固くない・十字の 板）、ほる 固さ・レア度は DIG_DEFAULTS。
 */
export const ROPE_BLOCKS = {
  rope: {
    name: 'ロープ',
    zukan: 'いとを よって ［作｜つく］った じょうぶな なわ。かべや がけに たらして つかまれば、するする のぼったり おりたり できる。',
    maxStack: 64,
    placeBlock: 'rope',
    rarity: DIG_DEFAULTS.rarity.rope,
    category: 'build',
    info: {
      use: 'つかまると のぼったり おりたり できる',
      how: `${PLACE_HOW}。ロープ に はいって まえ か ジャンプ で のぼる、うしろ で おりる`,
      buttons: ['1-9', 'right'],
    },
    recipe: { count: 4, inputs: [['string', 3]] }, // 作業台。いと 3 → ロープ 4 本
  },
} satisfies Partial<Record<BlockId, ItemDef>>;
