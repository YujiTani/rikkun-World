import type { BlockId, Rarity } from '../../contracts';
import { DIG_DEFAULTS } from '../../dig/config';
import { BLOCK_TYPES } from '../../world/blocks/blockTypes';
import { PLACE_HOW } from './howText';
import type { ItemDef } from './types';

/**
 * 置けるブロックのアイテム（22 個）。アイテムとしての値（名前の 出どころ・重ね数・分類・説明・作り方）は ここ 1 か所（ルール #304）。
 * ブロックとしての 性質（固さ・見た目・id の 番号）は ここには 書かない:
 *   - 世界での 性質・名前（BLOCK_TYPES）… world/blocks/blockTypes.ts
 *   - ほる 固さ・ほれる 道具・ブロックの レア度（DIG_DEFAULTS）… dig/config.ts
 *   - id の 型・セーブの 番号（BlockId・BLOCK_IDS_V1）… contracts.ts
 * 名前は BLOCK_TYPES から（間欠泉の つち以外の 21 個。間欠泉の つちだけ ルビつきの 名前を ここに 直接）。レア度は DIG_DEFAULTS.rarity から。
 * 絵は ブロックの テクスチャ（world/blocks/textures.ts）。値は これまでの 表から そのまま 写した もの（2026-10-25）。
 */

const BLOCK_STACK = 64; // inventory/items.ts の BLOCK_MAX_STACK と 同じ

/** BLOCK_TYPES の 名前（名前を 2 か所に 書かない） */
const blockName = (id: BlockId): string => BLOCK_TYPES.find((b) => b.id === id)!.name;

/** ブロックの レア度（ほる 設定 DIG_DEFAULTS.rarity と 同じ 値。光の柱の 色） */
const blockRarity = (id: BlockId): Rarity => DIG_DEFAULTS.rarity[id];

/** 置く 説明の 行（どう つかう = 「てに もって みぎクリック で おく」） */
const placeInfo = (use: string, extra: { how?: string; buttons?: Array<'1-9' | 'right'>; dig?: true; stats?: 'tansu' } = {}) => ({
  use,
  how: extra.how ?? PLACE_HOW,
  buttons: extra.buttons ?? ['1-9', 'right'],
  ...(extra.dig ? { dig: true } : {}),
  ...(extra.stats ? { stats: extra.stats } : {}),
});

/** 置けるブロック 8 つ（M2 §4.2）。ほって 手に入る（説明に「〇〇 を ほる」） */
export const PLACEABLE = {
  grass: {
    name: blockName('grass'),
    maxStack: BLOCK_STACK,
    placeBlock: 'grass',
    rarity: blockRarity('grass'),
    category: 'plant',
    info: placeInfo('ブロック として おける。わらじ の ざいりょう', { dig: true }),
  },
  dirt: {
    name: blockName('dirt'),
    maxStack: BLOCK_STACK,
    placeBlock: 'dirt',
    rarity: blockRarity('dirt'),
    category: 'soil',
    info: placeInfo('ブロック として おける', { dig: true }),
  },
  stone: {
    name: blockName('stone'),
    maxStack: BLOCK_STACK,
    placeBlock: 'stone',
    rarity: blockRarity('stone'),
    category: 'stone',
    info: placeInfo('おける。つるはし・かまど・や の ざいりょう', { dig: true }),
  },
  sand: {
    name: blockName('sand'),
    maxStack: BLOCK_STACK,
    placeBlock: 'sand',
    rarity: blockRarity('sand'),
    category: 'soil',
    info: placeInfo('おける', { dig: true }),
  },
  log: {
    name: blockName('log'),
    maxStack: BLOCK_STACK,
    placeBlock: 'log',
    rarity: blockRarity('log'),
    category: 'plant',
    info: placeInfo('おける。いろんな もの の ざいりょう。かまど の ねんりょう にも なる', { how: `${PLACE_HOW}。ねんりょう は かまど が かってに つかう`, dig: true }),
  },
  leaves: {
    name: blockName('leaves'),
    maxStack: BLOCK_STACK,
    placeBlock: 'leaves',
    rarity: blockRarity('leaves'),
    category: 'plant',
    info: placeInfo('おける', { dig: true }),
  },
  coal_ore: {
    name: blockName('coal_ore'),
    maxStack: BLOCK_STACK,
    placeBlock: 'coal_ore',
    rarity: blockRarity('coal_ore'),
    category: 'ore',
    info: placeInfo('かまど の ねんりょう（いちばん さきに つかう）。おける', { how: 'かまど で やく と かってに つかう。おくのは てに もって みぎクリック', dig: true }),
  },
  iron_ore: {
    name: blockName('iron_ore'),
    maxStack: BLOCK_STACK,
    placeBlock: 'iron_ore',
    rarity: blockRarity('iron_ore'),
    category: 'ore',
    info: placeInfo('かまど で やくと てつの かたまり に なる。おける', { how: 'かまど に みぎクリック して やく', buttons: ['right'], dig: true }),
  },
} satisfies Partial<Record<BlockId, ItemDef>>;

/** M4・M6 の 置ける ブロック 5 つ（かまど・かわら・レンガ・たいまつ・たんす）。かわら・レンガは かまどで やく（ねんど 1 → 2 こ） */
export const M4_BLOCKS = {
  furnace: {
    name: blockName('furnace'),
    maxStack: BLOCK_STACK,
    placeBlock: 'furnace',
    rarity: blockRarity('furnace'),
    category: 'home',
    info: placeInfo('おいて、てつ や ねんど を やく', { how: 'おいて、かまど に むけて みぎクリック（E でも）' }),
    recipe: { count: 1, inputs: [['stone', 5]] },
  },
  kawara: {
    name: blockName('kawara'),
    maxStack: BLOCK_STACK,
    placeBlock: 'kawara',
    rarity: blockRarity('kawara'),
    category: 'build',
    info: placeInfo('ブロック として おける（やね に ぴったり）'),
    recipe: { count: 2, inputs: [['clay', 1]], station: 'furnace' }, // ねんりょう 1・60 ステップ
  },
  brick: {
    name: blockName('brick'),
    maxStack: BLOCK_STACK,
    placeBlock: 'brick',
    rarity: blockRarity('brick'),
    category: 'build',
    info: placeInfo('ブロック として おける（かべ に ぴったり）'),
    recipe: { count: 2, inputs: [['clay', 1]], station: 'furnace' },
  },
  torch: {
    name: blockName('torch'),
    maxStack: BLOCK_STACK,
    placeBlock: 'torch',
    rarity: blockRarity('torch'),
    category: 'light',
    info: placeInfo('おくと まわり が あかるく なる。あかるい ところ には ようかい が でない'),
    // き 1・あぶら 1 → 4 こ。足した 作り方 2 つ（TORCH_COAL・TORCH_LOG）は craft/recipes.ts（カードは 1 枚のまま）
    recipe: { count: 4, inputs: [['log', 1], ['oil', 1]] },
  },
  tansu: {
    name: blockName('tansu'),
    maxStack: BLOCK_STACK,
    placeBlock: 'tansu',
    rarity: blockRarity('tansu'),
    category: 'home',
    wear: 'permanent', // たんすは へらない（itemClassOf が 'permanent' を 返す）
    info: placeInfo('おいて、もちもの を たくさん（54 こ の マス）しまえる', {
      how: 'おいて、たんす に むけて みぎクリック で ひらく（E でも）。シフト を おしながら クリック で いっきに うつす',
      stats: 'tansu',
    }),
    recipe: { count: 1, inputs: [['log', 8], ['iron_ingot', 2]] },
  },
} satisfies Partial<Record<BlockId, ItemDef>>;

/** #293 試作: 間欠泉の つち（置ける。置けば どこでも 間欠泉）。説明は なし（地形の ブロック）。名前は ［漢字｜よみ］ — withRuby で 画面に 出す */
export const GEYSER = {
  geyser_dirt: {
    name: '［間欠泉｜かんけつせん］の つち',
    maxStack: BLOCK_STACK,
    placeBlock: 'geyser_dirt',
    rarity: blockRarity('geyser_dirt'),
    category: 'soil',
  },
} satisfies Partial<Record<BlockId, ItemDef>>;

/**
 * VOX-I-1: 12 の国の ブロック 8 つ（地形・かざり。説明は なし）。
 * すすき・くさ は こわすと 消えるので 持ち物にならない（のばな は 持てる。FLORA-75）。
 */
export const VOX_I = {
  snow: { name: blockName('snow'), maxStack: BLOCK_STACK, placeBlock: 'snow', rarity: blockRarity('snow'), category: 'soil' },
  momiji_leaves: { name: blockName('momiji_leaves'), maxStack: BLOCK_STACK, placeBlock: 'momiji_leaves', rarity: blockRarity('momiji_leaves'), category: 'plant' },
  matsu_leaves: { name: blockName('matsu_leaves'), maxStack: BLOCK_STACK, placeBlock: 'matsu_leaves', rarity: blockRarity('matsu_leaves'), category: 'plant' },
  flower_y: { name: blockName('flower_y'), maxStack: BLOCK_STACK, placeBlock: 'flower_y', rarity: blockRarity('flower_y'), category: 'plant' },
  flower_o: { name: blockName('flower_o'), maxStack: BLOCK_STACK, placeBlock: 'flower_o', rarity: blockRarity('flower_o'), category: 'plant' },
  flower_p: { name: blockName('flower_p'), maxStack: BLOCK_STACK, placeBlock: 'flower_p', rarity: blockRarity('flower_p'), category: 'plant' },
  bamboo: { name: blockName('bamboo'), maxStack: BLOCK_STACK, placeBlock: 'bamboo', rarity: blockRarity('bamboo'), category: 'plant' },
  nobana: { name: blockName('nobana'), maxStack: BLOCK_STACK, placeBlock: 'nobana', rarity: blockRarity('nobana'), category: 'plant' },
} satisfies Partial<Record<BlockId, ItemDef>>;

/**
 * MINE-1B（#349。仕様 §4.4）: 新しい 鉱物の 置ける ブロック 4 つ（せっかいせき・しっくい・ほたるいし・きんの いし）。
 * ねんど・すいしょうの いし・ダイヤの いしは 持てない ブロック（ほると `clay`・`crystal`・`diamond`。BLOCK_ONLY_IDS）。
 * 「〇〇 を ほる（〇〇の つるはし から）」の 文は `dig: true`（craft/info/build.ts が 掘れる 段階から 作る）。
 */
export const MINE_BLOCKS = {
  sekkaiseki: {
    name: blockName('sekkaiseki'),
    maxStack: BLOCK_STACK,
    placeBlock: 'sekkaiseki',
    rarity: blockRarity('sekkaiseki'),
    category: 'ore',
    info: placeInfo('ちか の なかほど に ある しろい いし。さぎょうだい で チョーク、かまど で やくと いしばい に なる。おける', { dig: true }),
  },
  shikkui: {
    name: blockName('shikkui'),
    maxStack: BLOCK_STACK,
    placeBlock: 'shikkui',
    rarity: blockRarity('shikkui'),
    category: 'build',
    info: placeInfo('しろい かべ の ブロック。おける'),
    recipe: { count: 2, inputs: [['ishibai', 1], ['string', 1]] }, // 作業台。いしばい 1 ＋ いと 1 → しっくい 2
  },
  hotaruishi: {
    name: blockName('hotaruishi'),
    maxStack: BLOCK_STACK,
    placeBlock: 'hotaruishi',
    rarity: blockRarity('hotaruishi'),
    category: 'ore',
    info: placeInfo('ちか の なかほど に ある。くらい ところ で ぼんやり ひかる。おくと あかり に なる', { dig: true }),
  },
  kin_ore: {
    name: blockName('kin_ore'),
    maxStack: BLOCK_STACK,
    placeBlock: 'kin_ore',
    rarity: blockRarity('kin_ore'),
    category: 'ore',
    info: placeInfo('ちか の ふかい ところ に ある。かまど で やくと きん に なる。おける', { dig: true }),
  },
} satisfies Partial<Record<BlockId, ItemDef>>;
