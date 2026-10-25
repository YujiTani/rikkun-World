/**
 * 全アイテムの説明の表（M6 §2.2）。文はここ 1 か所だけに書く。
 * 画面（せつめい パネル）・ツールチップ・`craft.info()` は、この表と設定から作った同じデータを読む。
 * 字は ひらがな・カタカナ・数字。漢字は 名前の ［漢字｜よみ］ だけ（出す ときに `withRuby`。WEAPON-7 §2.7）。
 * 「どこで」「つかいみち」「つよさ」の数は、ここには書かない（レシピ・ドロップ表・設定から `build.ts` が作る）。
 */
import { registryArmorKind, registryInfo } from '../../content/items/registry';

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

/** 全アイテムの 説明の 行。ぜんぶ 登録表（content/items/）の `info` から 作る（説明の ない 9 個 = 地形・かざりは 行を 持たない） */
export const ITEM_INFO: Readonly<Record<string, InfoRow>> = registryInfo();

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
