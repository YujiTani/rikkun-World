/**
 * 「どう つかう」の 文（説明パネルの how）。シリーズをまたいで使う文はここ 1 か所に書く。
 * 葉のファイル（型だけ import する）。craft/info/table.ts と 各シリーズの定義が読む。
 */
import type { InfoRow } from '../../craft/info/table';

export const CRAFT_E = 'E の つくる で つかう';
export const PICK_HOW = 'えらんで、ブロック に むけて ひだりクリック を おしつづける';
export const BLADE_HOW = 'えらんで、ようかい に むけて ひだりクリック';
export const KATANA_HOW = `${BLADE_HOW}。R で かまえ を かえると わざ が かわる`;
export const BOW_HOW = 'えらんで ひだりクリック を おしつづけて ながく ひく。はなすと とぶ';
export const WEAR_HOW = 'ダブルクリック か、てに もって みぎクリック で きる。E の そうび の マス に いれても よい';

/** たべる やさい（たまご）の 説明の行。ハートが もどる 数だけ ちがう */
export function vegRow(hearts: number): InfoRow {
  return { use: `たべると ハート が ${hearts} こ もどる`, how: 'もって みぎクリック', buttons: ['1-9', 'right'] };
}

const LATER_HOW = 'いまは もてる だけ';

/** 働きが あとの もの（時計の絵＋この文）の 説明の行 */
export const laterRow = (row: string): InfoRow => ({ use: row, how: LATER_HOW, buttons: [], later: row });
