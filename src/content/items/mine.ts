import type { MineItemId } from './ids';
import type { ItemDef } from './types';

/**
 * 新しい 鉱物から 作る 物（MINE-1B #349。仕様 docs/design/MINE-1.md §4.4）。値は ここ 1 か所（ルール #304）。
 * チョーク（せっかいせき 1 → 4。かべ・ゆかに やじるしを かく）・いしばい（かまどで せっかいせき 1 → 2。作物に まくと すぐ みのる。しっくいの ざいりょう）。
 * 絵は ui/itemArtMine.ts。せっかいせき・しっくい・ほたるいし・きんの いしは 置ける ブロックなので blocks.ts の `MINE_BLOCKS`。
 */
export const MINE_ITEMS = {
  chalk: {
    name: 'チョーク',
    zukan: 'せっかいせきを けずって ［作｜つく］った ［白｜しろ］い チョーク。かべや ゆかに やじるしを かくと、［北｜きた］を さして くれる。［地｜ち］［下｜か］で まいごに なっても ［帰｜かえ］り［道｜みち］が わかる。',
    maxStack: 64,
    rarity: 'uncommon', // レア
    category: 'tool',
    info: { use: 'かべ や ゆか に やじるし を かく。きた ほう を さす ので かえりみち が わかる', how: 'てに もって、かべ や ゆか に みぎクリック', buttons: ['1-9', 'right'] },
    recipe: { count: 4, inputs: [['sekkaiseki', 1]] }, // 作業台。せっかいせき 1 → チョーク 4
  },
  ishibai: {
    name: 'いしばい',
    zukan: 'せっかいせきを やいた ［白｜しろ］い こな。はたけに ぱらぱら まくと、やさいが あっという ［間｜ま］に みのる。しっくいの もとにも なる。',
    maxStack: 64,
    rarity: 'uncommon', // レア
    category: 'material',
    info: { use: 'はたけ の やさい に まくと すぐ みのる。しっくい の ざいりょう', how: 'てに もって、はたけ の やさい に みぎクリック', buttons: ['1-9', 'right'] },
    recipe: { count: 2, inputs: [['sekkaiseki', 1]], station: 'furnace' }, // かまど（ねんりょう 1・60 ステップ）。せっかいせき 1 → いしばい 2
  },
} satisfies Record<MineItemId, ItemDef>;
