import type { YokaiKind } from '../../contracts';

/**
 * 全アイテムの説明の表（M6 §2.2）。文はここ 1 か所だけに書く。
 * 画面（せつめい パネル）・ツールチップ・`craft.info()` は、この表と設定から作った同じデータを読む。
 * 字はすべて ひらがな・カタカナ・数字（漢字は使わない）。
 * 「どこで」「つかいみち」「つよさ」の数は、ここには書かない（レシピ・ドロップ表・設定から `build.ts` が作る）。
 */

/** ボタンの絵の種類: `1-9` = ホットバーで えらぶ、`left` = ひだりクリック、`leftHold` = ひだりを おしつづける、`right` = みぎクリック、`E` = もちもの画面 */
export type ButtonKey = '1-9' | 'left' | 'leftHold' | 'right' | 'E';

/** ぼうぐ が ふせぐ ダメージの種類（`CraftConfig.armorValue` の種類。かぶと=玉、よろい・こて=ふつう、すねあて=落下） */
export const ARMOR_KIND: Readonly<Record<string, 'normal' | 'ball' | 'fall'>> = {
  kabuto: 'ball',
  yoroi: 'normal',
  kote: 'normal',
  suneate: 'fall',
};

/** なかま の 文（WEAPON-2 §4.6 (8)）。「なにに つかう」の 下に 出す */
export const CLASS_TEXT = {
  consumable: 'つかうと 1 こ へる',
  durable: 'つかうと へって、0 で こわれる',
  permanent: 'へらない',
} as const;

export type StatKind = 'pickaxe' | 'blade' | 'bow' | 'arrow' | 'armor' | 'tansu' | 'can';

export interface InfoRow {
  /** なにに つかう */
  use: string;
  /** どう つかう */
  how: string;
  buttons: ButtonKey[];
  /** 働きがあとのもの（時計の絵＋この文。`use` と同じ） */
  later?: string;
  /** ほって手に入るブロック（「〇〇 を ほる」） */
  dig?: boolean;
  /** つよさ の出し方 */
  stats?: StatKind;
}

const PLACE = 'てに もって みぎクリック で おく';
const PLACE_BTN: ButtonKey[] = ['1-9', 'right'];
const CRAFT_E = 'E の つくる で つかう';
const PICK_HOW = 'えらんで、ブロック に むけて ひだりクリック を おしつづける';
const BLADE_HOW = 'えらんで、ようかい に むけて ひだりクリック';
const KATANA_HOW = `${BLADE_HOW}。R で かまえ を かえると わざ が かわる`;
const WEAR_HOW = 'ダブルクリック か、てに もって みぎクリック で きる。E の そうび の マス に いれても よい';
const LATER_HOW = 'いまは もてる だけ';

const later = (row: string): InfoRow => ({ use: row, how: LATER_HOW, buttons: [], later: row });

const SEED_ROW: InfoRow = { use: 'はたけ に まくと やさい が そだつ', how: 'もって はたけ に みぎクリック', buttons: ['1-9', 'right'] };
const VEG_ROW = (hearts: number): InfoRow => ({
  use: `たべると ハート が ${hearts} こ もどる`,
  how: 'もって みぎクリック',
  buttons: ['1-9', 'right'],
});

export const ITEM_INFO: Readonly<Record<string, InfoRow>> = {
  // ---- ブロック（13）
  grass: { use: 'ブロック として おける。わらじ の ざいりょう', how: PLACE, buttons: PLACE_BTN, dig: true },
  dirt: { use: 'ブロック として おける', how: PLACE, buttons: PLACE_BTN, dig: true },
  stone: { use: 'おける。つるはし・かまど・や の ざいりょう', how: PLACE, buttons: PLACE_BTN, dig: true },
  sand: { use: 'おける', how: PLACE, buttons: PLACE_BTN, dig: true },
  log: {
    use: 'おける。いろんな もの の ざいりょう。かまど の ねんりょう にも なる',
    how: `${PLACE}。ねんりょう は かまど が かってに つかう`,
    buttons: PLACE_BTN,
    dig: true,
  },
  leaves: { use: 'おける', how: PLACE, buttons: PLACE_BTN, dig: true },
  coal_ore: {
    use: 'かまど の ねんりょう（いちばん さきに つかう）。おける',
    how: 'かまど で やく と かってに つかう。おくのは てに もって みぎクリック',
    buttons: PLACE_BTN,
    dig: true,
  },
  iron_ore: {
    use: 'かまど で やくと てつの かたまり に なる。おける',
    how: 'かまど に みぎクリック して やく',
    buttons: ['right'],
    dig: true,
  },
  furnace: {
    use: 'おいて、てつ や ねんど を やく',
    how: 'おいて、かまど に むけて みぎクリック（E でも）',
    buttons: PLACE_BTN,
  },
  kawara: { use: 'ブロック として おける（やね に ぴったり）', how: PLACE, buttons: PLACE_BTN },
  brick: { use: 'ブロック として おける（かべ に ぴったり）', how: PLACE, buttons: PLACE_BTN },
  torch: {
    use: 'おくと まわり が あかるく なる。あかるい ところ には ようかい が でない',
    how: PLACE,
    buttons: PLACE_BTN,
  },
  tansu: {
    use: 'おいて、もちもの を たくさん（54 こ の マス）しまえる',
    how: 'おいて、たんす に むけて みぎクリック で ひらく（E でも）。シフト を おしながら クリック で いっきに うつす',
    buttons: PLACE_BTN,
    stats: 'tansu',
  },

  // ---- ざいりょう（7）
  paper: { use: 'や・ちょうちん・たこ の ざいりょう', how: CRAFT_E, buttons: ['E'] },
  oil: { use: 'たいまつ・ちょうちん の ざいりょう。かまど の ねんりょう にも なる', how: `${CRAFT_E}。ねんりょう は かってに つかう`, buttons: ['E'] },
  string: { use: 'ゆみ・よろい・すねあて・たこ・ふとん・おまもり・わらじ の ざいりょう', how: CRAFT_E, buttons: ['E'] },
  cloth: { use: 'かぶと・よろい・こて・ふとん・おまもり の ざいりょう', how: CRAFT_E, buttons: ['E'] },
  clay: { use: 'かまど で やくと かわら・レンガ・はにわ に なる', how: 'かまど に みぎクリック して やく', buttons: ['right'] },
  crystal: { use: 'きらめく カタナ・おまもり の ざいりょう。ハイパーレア', how: CRAFT_E, buttons: ['E'] },
  iron_ingot: { use: 'てつの つるはし・ぶき・ぼうぐ・たんす の ざいりょう', how: CRAFT_E, buttons: ['E'] },

  // ---- どうぐ・ぶき・ぼうぐ（13）
  wood_pickaxe: { use: 'ブロック を はやく ほれる', how: PICK_HOW, buttons: ['1-9', 'leftHold'], stats: 'pickaxe' },
  stone_pickaxe: { use: 'もっと はやく ほれる。てつ も ほれる', how: PICK_HOW, buttons: ['1-9', 'leftHold'], stats: 'pickaxe' },
  iron_pickaxe: { use: 'いちばん はやく ほれる。てつ も ほれる', how: PICK_HOW, buttons: ['1-9', 'leftHold'], stats: 'pickaxe' },
  wood_axe: { use: 'き を はやく きれる', how: PICK_HOW, buttons: ['1-9', 'leftHold'], stats: 'pickaxe' },
  stone_axe: { use: 'もっと はやく き を きれる', how: PICK_HOW, buttons: ['1-9', 'leftHold'], stats: 'pickaxe' },
  iron_axe: { use: 'いちばん はやく き を きれる', how: PICK_HOW, buttons: ['1-9', 'leftHold'], stats: 'pickaxe' },
  bokuto: { use: 'ようかい を たたく', how: KATANA_HOW, buttons: ['1-9', 'left'], stats: 'blade' },
  katana: { use: 'ようかい を つよく たたく', how: KATANA_HOW, buttons: ['1-9', 'left'], stats: 'blade' },
  naginata: {
    use: 'とおく まで とどく。つく と はらう を かわりばんこ',
    how: `${BLADE_HOW}（おしつづけると つづけて ふる）`,
    buttons: ['1-9', 'left'],
    stats: 'blade',
  },
  crystal_katana: { use: 'いちばん つよい かたな', how: KATANA_HOW, buttons: ['1-9', 'left'], stats: 'blade' },
  yumi: {
    use: 'や を とばして とおく の ようかい を たおす。や が いる',
    how: 'えらんで ひだりクリック を おしつづけて ながく ひく。はなすと とぶ',
    buttons: ['1-9', 'left'],
    stats: 'bow',
  },
  ya: { use: 'ゆみ で とばす', how: 'もちもの に いれて おく だけ。ゆみ が つかう', buttons: [], stats: 'arrow' },
  kabuto: { use: 'ようかい の ひのたま を へらす（あたま）', how: WEAR_HOW, buttons: ['1-9', 'right'], stats: 'armor' },
  yoroi: { use: 'ようかい の こうげき を へらす（からだ）', how: WEAR_HOW, buttons: ['1-9', 'right'], stats: 'armor' },
  kote: { use: 'ようかい の こうげき を へらす（うで）', how: WEAR_HOW, buttons: ['1-9', 'right'], stats: 'armor' },
  suneate: { use: 'たかい ところ から おちた いたみ を へらす（あし）', how: WEAR_HOW, buttons: ['1-9', 'right'], stats: 'armor' },

  // ---- 働きが あとのもの（6）
  lantern: later('おいて あかるく できるように なるよ（もうすぐ）'),
  kite: later('そら に あげて あそべるように なるよ（もうすぐ）'),
  futon: later('よる に ねると あさ に なるように なるよ（もうすぐ）'),
  omamori: later('もっていると やられても もちもの を おとさなく なるよ（もうすぐ）'),
  waraji: later('はくと すこし はやく あるけるように なるよ（もうすぐ）'),
  haniwa: later('おいて かざれるように なるよ（もうすぐ）'),

  // ---- M7 農業（9）
  seed_onion: SEED_ROW,
  seed_tomato: SEED_ROW,
  seed_pumpkin: SEED_ROW,
  seed_eggplant: SEED_ROW,
  onion: VEG_ROW(1),
  tomato: VEG_ROW(1),
  eggplant: VEG_ROW(1),
  pumpkin: VEG_ROW(2),
  kuwa: { use: 'くさ や つち を はたけ に する', how: 'もって くさ・つち に みぎクリック', buttons: ['1-9', 'right'] },

  // ---- M7-2 農業 フェーズ 2（3。仕様 §4.8）
  watering_can: {
    use: 'はたけ 1 マス に みず を まく',
    how: 'みず に みぎクリック で くむ、はたけ に みぎクリック',
    buttons: ['1-9', 'right'],
    stats: 'can',
  },
  long_watering_can: {
    use: 'はたけ 2 マス（ねらった はたけ と その むこう）に みず を まく',
    how: 'みず に みぎクリック で くむ、はたけ に みぎクリック',
    buttons: ['1-9', 'right'],
    stats: 'can',
  },
  sprinkler: { use: 'まわり の はたけ を ずっと しめらせる', how: 'もって みぎクリック で おく', buttons: PLACE_BTN },

  // ---- BUCKET-1
  bucket: { use: 'みず を くんで はこぶ', how: 'みず に みぎクリック で くむ', buttons: ['1-9', 'right'] },
  water_bucket: { use: 'はたけ の そば に みず を おく', how: 'もって みぎクリック で おく', buttons: ['1-9', 'right'] },

  // ---- LIVE-1 たまご
  egg: VEG_ROW(1),

  // ---- ようかいだま（§5。いまは 手に入らない。古い保存用）
  yokai_orb: { use: 'いまは つかえない よ', how: '', buttons: [] },
};

/** 「どこで」の ようかいだま だけの文（§5） */
export const ORB_SOURCE = 'むかし の ようかい が おとした';

/** 「どこで」の たまご の文（LIVE-1 §3.1） */
export const EGG_SOURCE = 'なかま の にわとり が くれる';

/** 妖怪の名前（ドロップ表の「〇〇 が おとす」） */
export const YOKAI_NAME: Readonly<Record<YokaiKind, string>> = {
  karakasa: 'からかさ',
  chochin: 'ちょうちん',
  nurikabe: 'ぬりかべ',
  rokurokubi: 'ろくろくび',
};

/** 四角のメーターの最大の数（§2.2） */
export const STAT_MAX = { dig: 6, damage: 6, guard: 5 } as const;
