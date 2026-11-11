import type { Rarity } from '../../contracts';
import { LIGHT_NAME, kindName, type LightKind } from '../../house/recipes/kinds';
import { HOUSE_LOOK_ITEM_IDS, type HouseLookItemId } from './ids';
import { FURN_SOURCE } from './houseEditor';
import type { ItemDef } from './types';

/**
 * 家の しゅるいの アイテム 42 こ（HOUSE-2B #364。仕様 docs/design/HOUSE-2.md §4.2・§2.5）。建てた 家の ブロックを ほると その しゅるいの アイテム 1 こ（ほる 係は dig/dugItems.ts の dugItemAt）。
 * 2B では 作れない・置けない（「つくる」と 置く ほうは 2C）ので レシピ・placeBlock は なし。名前は しゅるいの 名前（house/recipes/kinds.ts の kindName）。絵は ui/itemArtHouseLooks.ts。
 * 文は ばしょごとに 1 つ（ぜんぶ ひらがな・カタカナ。漢字は ［漢字｜よみ］）。値は ここ 1 か所。
 */
const STACK = 64; // 1 マスに 重ねられる 数（こもの と 同じ）
const RARITY: Rarity = 'uncommon'; // レシピの まきもので おぼえる しゅるいなので レア

/** ばしょごとの 文（use ＝ 何に なる か・zukan ＝ ずかんの 読み物） */
const TEXT = {
  'roof': { use: 'いえ の やね に なる ブロック', zukan: 'いえの やねに なる ブロック。やねの かたちは むら・おしろ・こうざんで ぜんぶ ちがう。' },
  'wall': { use: 'いえ の かべ に なる ブロック', zukan: 'いえの かべに なる ブロック。むら・おしろ・こうざんで いろや もようが ちがう。' },
  'window': { use: 'いえ の まど に なる ブロック。ひかり が とおる', zukan: 'いえの まどに なる ブロック。ひかりが とおって、なかが ほんのり あかるい。' },
  'door': { use: 'いえ の と に なる ブロック。ひらいたり しめたり できる', zukan: 'てつの おびと びょうで かためた がんじょうな と。むら・おしろ・こうざんで ひさしの いろが ちがう。' },
  'deco': { use: 'いえ の かざり に なる ブロック', zukan: 'いえを にぎやかに する かざり。むら・おしろ・こうざんで すがたが ちがう。' },
  'light': { use: 'いえ の なか を あかるく する あかり', zukan: 'いえの なかを てらす あかり。ちかくには ようかいが わかない。' },
} as const;
type TextPart = keyof typeof TEXT;

/** ずかんの 文の さいごに ひとこと（しゅるいごとに 少し ちがう 文に する） */
const ONE_WORD: Readonly<Record<string, string>> = {
  deco_shachi: 'きんの しゃちほこは おしろの やねの ほこり。',
  light_hotaru: 'ほたるいしの みどりの ひかりが ぼんやり ともる。',
  light_suisho: 'すいしょうが ちいさな ひかりを ためて かがやく。',
};

const partOf = (id: HouseLookItemId): TextPart => id.slice(0, id.indexOf('_')) as TextPart;
const kindOfItem = (id: HouseLookItemId): string => id.slice(id.indexOf('_') + 1);
const nameOf = (id: HouseLookItemId): string => (partOf(id) === 'light' ? LIGHT_NAME[kindOfItem(id) as LightKind] : kindName(kindOfItem(id)));

function defOf(id: HouseLookItemId): ItemDef {
  const t = TEXT[partOf(id)];
  return {
    name: nameOf(id),
    zukan: `${t.zukan}${ONE_WORD[id] ? ` ${ONE_WORD[id]}` : ''}`,
    maxStack: STACK,
    rarity: RARITY,
    category: 'home',
    info: { use: t.use, how: 'たてた いえ を ほる と てに はいる', buttons: ['1-9'] },
    source: FURN_SOURCE,
  };
}

export const HOUSE_LOOKS = Object.fromEntries(HOUSE_LOOK_ITEM_IDS.map((id) => [id, defOf(id)])) as Record<HouseLookItemId, ItemDef>;
