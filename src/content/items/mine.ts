import type { MineItemId } from './ids';
import type { ItemDef } from './types';

/**
 * 新しい 鉱物から 作る 物（MINE-1B #349。仕様 docs/design/MINE-1.md §4.4）。値は ここ 1 か所（ルール #304）。
 * チョーク（せっかいせき 1 → 4。かべ・ゆかに やじるしを かく）・いしばい（かまどで せっかいせき 1 → 2。作物に まくと すぐ みのる。しっくいの ざいりょう）。
 * レシピの まきもの（HOUSE-2A #364）: 坑道の いちばん 下の へやで 1 まい。手に もって 右クリックで 家の レシピを 1 つ おぼえる（house/recipes/keeper.ts）。
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
  kabita_pan: {
    name: 'かびた パン',
    zukan: 'むかしの ぼうけんしゃが のこした パン。みどりの かびが はえて いる。たべると…？',
    maxStack: 64,
    rarity: 'common', // ノーマル（キャンプあとの たんす だけ。宝箱の くじには 入らない）
    category: 'food',
    info: { use: 'たべると すこし だけ げんき に なる。でも かびて いる', how: 'もって みぎクリック', buttons: ['1-9', 'right'] },
    source: 'むかし の ぼうけんしゃ の たんす に のこって いる',
    food: { heal: 2 }, // たべた ときに もどる 体力（2 = ハート 1 こ。仕様 §4.9）
  },
  recipe_scroll: {
    name: 'レシピの まきもの',
    zukan: 'ふるい こうどうの おくで みつかる まきもの。ひらいて よむと、いえの あたらしい つくりかたを ひとつ おぼえる。', // 漢字なし（tester の recipeScroll.test が ルビ記法を 見ない ため。ルビ版は 仕様 §2.1 の 下書き）
    maxStack: 64, // 小物の いつもの 数（misc.ts と 同じ。重ねられる）
    rarity: 'uncommon', // レア（坑道の いちばん 下の へやで 1 まい。宝箱の くじには 入れない〔mineChest.ts〕）
    category: 'material',
    info: { use: 'ひらいて よむと いえ の つくりかた を ひとつ おぼえる', how: 'もって みぎクリック', buttons: ['1-9', 'right'] },
    source: 'こうどう の いちばん した の へや',
    dugFrom: 'makimono', // 坑道の 床の まきものを ほっても この アイテム 1 こ（右クリックでも とれる）
  },
} satisfies Record<MineItemId, ItemDef>;
