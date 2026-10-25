/**
 * 全アイテムの説明の表（M6 §2.2）。文はここ 1 か所だけに書く。
 * 画面（せつめい パネル）・ツールチップ・`craft.info()` は、この表と設定から作った同じデータを読む。
 * 字は ひらがな・カタカナ・数字。漢字は 名前の ［漢字｜よみ］ だけ（出す ときに `withRuby`。WEAPON-7 §2.7）。
 * 「どこで」「つかいみち」「つよさ」の数は、ここには書かない（レシピ・ドロップ表・設定から `build.ts` が作る）。
 */
import { CRAFT_E, vegRow } from '../../content/items/howText';
import { registryArmorKind, registryInfo, withRegistry } from '../../content/items/registry';

/** ボタンの絵の種類: `1-9` = ホットバーで えらぶ、`left` = ひだりクリック、`leftHold` = ひだりを おしつづける、`right` = みぎクリック、`E` = もちもの画面 */
export type ButtonKey = '1-9' | 'left' | 'leftHold' | 'right' | 'E';

/** ぼうぐ が ふせぐ ダメージの種類（`CraftConfig.armorValue` の種類。かぶと=玉、よろい・こて=ふつう、すねあて=落下） */
export const ARMOR_KIND: Readonly<Record<string, 'normal' | 'ball' | 'fall'>> = registryArmorKind(); // 防具は ぜんぶ 登録表（content/items/armor.ts・ninja.ts・samurai.ts・gold.ts）から

/** なかま の 文（WEAPON-2 §4.6 (8)）。「なにに つかう」の 下に 出す */
export const CLASS_TEXT = {
  consumable: 'つかうと 1 こ へる',
  durable: 'つかうと へって、0 で こわれる',
  permanent: 'へらない',
} as const;

/** 虹色の 見出し（レジェンダリーの 物の「とくべつな ちから」の 行。NINJA-1 §3.1） */
export const SPECIAL_HEAD = 'とくべつな ちから';

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
  /** 虹色の「とくべつな ちから」の 文（レジェンダリーの 物だけ。NINJA-1 §3.1。無い 物には 行を 出さない） */
  special?: string;
}

const PLACE = 'てに もって みぎクリック で おく';
const PLACE_BTN: ButtonKey[] = ['1-9', 'right'];
const LATER_HOW = 'いまは もてる だけ';

const later = (row: string): InfoRow => ({ use: row, how: LATER_HOW, buttons: [], later: row });

const OLD_ITEM_INFO: Record<string, InfoRow> = {
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

  // ---- どうぐ・ぶき・ぼうぐ（16）は 登録表（content/items/tools.ts・weapons.ts・armor.ts）に ある

  // ---- 働きが あとのもの（6）
  lantern: later('おいて あかるく できるように なるよ（もうすぐ）'),
  kite: later('そら に あげて あそべるように なるよ（もうすぐ）'),
  futon: later('よる に ねると あさ に なるように なるよ（もうすぐ）'),
  omamori: later('もっていると やられても もちもの を おとさなく なるよ（もうすぐ）'),
  waraji: later('はくと すこし はやく あるけるように なるよ（もうすぐ）'),
  haniwa: later('おいて かざれるように なるよ（もうすぐ）'),

  // ---- 農業（たね・やさい・くわ・じょうろ・スプリンクラー・バケツ 14 個）は 登録表（content/items/farm.ts）に ある

  // ---- LIVE-1 たまご
  egg: vegRow(1),
  // ---- LIVE-1 版 3.2（§3.1）
  mushi: { use: 'にわとり に あげる と なかよく なる', how: 'もって にわとり に みぎクリック', buttons: ['1-9', 'right'] },
  mushi_ami: { use: 'き から むし を とる', how: 'もって き に みぎクリック', buttons: ['1-9', 'right'] },

  // ---- LIVE-2（§3.1）。名前は こたつ・とりごや・きん の たまご（画面に ぬくぬく・育成 は 出さない）
  nukunuku: { use: 'たまご を あたためる', how: 'おいて、たまご を もって みぎクリック', buttons: ['1-9', 'right'] },
  toriya: { use: 'にわとり の いえ', how: 'おいて、ひよこ を つれて いく', buttons: ['1-9', 'right'] },
  kin_tamago: { use: 'だいじ な たから。こたつ で あたためる と マッチョ ひよこ', how: 'こたつ に いれる', buttons: ['1-9', 'right'] },

  // ---- LIVE-3（§3.1）: もも にく
  momo_nama: { use: 'かまど で やく と たべられる', how: 'かまど に みぎクリック して やく', buttons: ['right'] },
  momo_yaki: { use: 'たべると ハート が 5 こ もどる', how: 'もって みぎクリック', buttons: ['1-9', 'right'] },

  // ---- ようかいだま（§5。いまは 手に入らない。古い保存用）
  yokai_orb: { use: 'いまは つかえない よ', how: '', buttons: [] },
};

// 登録表（content/items/）に うつした シリーズ（忍者・侍・金 …）の 行は そちらに 書く（ここへは 自動で 入る）
export const ITEM_INFO: Readonly<Record<string, InfoRow>> = withRegistry('ITEM_INFO', OLD_ITEM_INFO, registryInfo());

/** 「どこで」の ようかいだま だけの文（§5） */
export const ORB_SOURCE = 'むかし の ようかい が おとした';

/** 「どこで」の たまご の文（LIVE-1 §3.1） */
export const EGG_SOURCE = 'なかま の にわとり が むし を たべて うむ';

/** 「どこで」の きん の たまご の文（LIVE-2 §3.1） */
export const KIN_TAMAGO_SOURCE = 'なかよし の にわとり が ときどき うむ';

/** 「どこで」の はらぱんみみず の文（GOLD-1 §4.7）。ちか が いちばん でやすい */
export const HARAPAN_SOURCE = 'ちか で ようかい を たおす・ブロック を こわす と ときどき でる';

/** LIVE-3: なま もも にく の 手に入れかた */
export const MOMO_NAMA_SOURCE = 'とりごや で そだった おとな から';

/** 「どこで」の むし の文（LIVE-1 版 3.2 §3.1） */
export const MUSHI_SOURCE = 'むしとりあみ で き から とる';

/** 妖怪の名前（ドロップ表の「〇〇 が おとす」）。出どころは yokai/stats.ts */
export { YOKAI_NAME } from '../../yokai/stats';

/** 四角のメーターの最大の数（§2.2） */
export const STAT_MAX = { dig: 6, damage: 6, guard: 5 } as const;
