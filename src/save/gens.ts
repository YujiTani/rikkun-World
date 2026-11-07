/**
 * 保存の 版の 数（MINE-1 §4.8）。1 か所に 書く（#304）。SaveManager が 再び 書き出す（`SAVE_GEN` など）。
 * 生成の 窓口（mine.saveGens）も ここを 読む ため 葉に した（保存 ← 生成 の 輪を つくらない）。
 */
/** 今の 保存の 版。1C で 4 → 5〔坑道の 版〕、1D で 5 → 6〔部屋の 版〕、1E で 6 → 7〔坑道の 冒険の 版〕 */
export const SAVE_GEN = 7;
/** 読める いちばん 古い 版（これ 以上 SAVE_GEN 以下の 保存は 読む。版 3・4 の 列が まざった 世界も） */
export const OLDEST_READABLE_GEN = 3;
/** 坑道（MINE-1C）が 入った 版。これより 古い 保存の 列には 坑道を かかない（古い 列の 一覧） */
export const KODO_GEN = 5;
/** ほらあなの 種類の 部屋（MINE-1D）が 入った 版。これより 古い 保存の 列には 部屋を かかない（古い 列の 一覧 heya） */
export const HEYA_GEN = 6;
/** 坑道の 冒険（MINE-1E）が 入った 版。これより 古い 保存の 列には 1E の 坑道を かかない（古い 列の 一覧 boken） */
export const BOKEN_GEN = 7;
